import { NextResponse } from 'next/server';
import Replicate from "replicate";
import { CreativeContext } from "@/types/creative-context";
import { determineGenerationPath } from "@/lib/qualityRouter";
import { submitAceStepJob, submitStableAudioJob, submitPunjabiAceStepJob } from "@/lib/modelRouter";
import { generateElevenLabsMusic, generateElevenLabsTTS } from "@/lib/elevenlabsMusic";
import { checkRateLimit } from "@/lib/rateLimiter";
import {
  buildCompositionPlan,
  applyEngagementGate,
  newRun,
  withStage,
  record,
  summarizeRun,
} from "@/lib/intelligence";

// Ensure Edge runtime isn't used where node primitives (Buffer) are required by older SDKs
// export const runtime = 'edge';

export async function POST(req: Request) {
  const tlm = newRun();
  record(tlm, "request-received");
  try {
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";

    // Rate Limiting
    const rateLimit = await withStage(tlm, "rate-limit-check", () => checkRateLimit(ip));
    if (!rateLimit.allowed) {
      record(tlm, "respond", { errorCode: "RATE_LIMITED" });
      return NextResponse.json({
        error: `Rate limit exceeded. Please wait ${Math.ceil(rateLimit.resetOffset / 60000)} minutes.`,
        runId: tlm.runId,
      }, { status: 429 });
    }

    const context: CreativeContext = await req.json();

    // Generate unique seed for each request to ensure unique output
    const uniqueSeed = `seed-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    (context as any).variationSeed = uniqueSeed;
    (context as any).uniqueRequestId = uniqueSeed;

    const apiKey = process.env.REPLICATE_API_KEY;
    if (!apiKey) {
      record(tlm, "error", { errorCode: "NO_REPLICATE_KEY" });
      return NextResponse.json({ error: "Replicate API Key is not configured.", runId: tlm.runId }, { status: 500 });
    }

    const replicate = new Replicate({ auth: apiKey });

    // ─── Music Intelligence: plan + quality gate ──────────────────────────
    const plan = await withStage(tlm, "plan-build", async () => buildCompositionPlan({
      mood: context.mood ?? "neutral",
      genre: context.genre,
      audience: (context as any).audience,
      language: context.vocalLanguage,
      occasion: context.songDescription,
      references: context.artistInspiration ? [context.artistInspiration] : undefined,
      durationSeconds: context.duration ?? 180,
      instrumentalOnly: !!context.instrumentalOnly,
      seed: uniqueSeed,
    }), { genreId: undefined });

    const gate = await withStage(tlm, "plan-score", async () => applyEngagementGate(plan), {
      genreId: plan.resolved.genreId,
    });
    record(tlm, "plan-score", {
      qualityScore: gate.initialScore,
      genreId: plan.resolved.genreId,
      meta: { initialIssues: gate.initialIssues, rewrites: gate.rewrites },
    });
    if (gate.rewrites.length > 0) {
      record(tlm, "plan-rewrite", {
        qualityScore: gate.finalScore,
        genreId: plan.resolved.genreId,
        meta: { rewrites: gate.rewrites, remainingIssues: gate.finalIssues },
      });
    }
    // The gate-corrected plan can be exposed to the client for UI explanation.
    // Note: existing model routes still consume `context` directly — the plan
    // mainly improves prompts via the legacy promptBuilder wrapper. Future
    // work: pass the plan all the way through (T2.x).

    // Determine the best path
    const route = determineGenerationPath(context);
    console.log(`[Generate API] Determined route: ${route.path} (${route.reason}), seed: ${uniqueSeed}`);

    let jobId = null;
    let audioResult = null;
    let mixData = null;

    if (route.path === "stable-audio") {
      jobId = await withStage(tlm, "model-call", () => submitStableAudioJob(context, replicate), {
        provider: "replicate", modelId: "stable-audio", genreId: plan.resolved.genreId,
      });
    }
    else if (route.path === "elevenlabs-music") {
      // Synchronous API
      try {
        audioResult = await withStage(tlm, "model-call", () => generateElevenLabsMusic(context), {
          provider: "elevenlabs", modelId: "music", genreId: plan.resolved.genreId,
        });
        record(tlm, "respond", { provider: "elevenlabs", qualityScore: gate.finalScore });
        return NextResponse.json({
          jobId: "elevenlabs-" + uniqueSeed,
          status: "succeeded",
          route: route.path,
          audio: audioResult,
          seed: uniqueSeed,
          runId: tlm.runId,
          quality: { score: gate.finalScore, rewrites: gate.rewrites, issues: gate.finalIssues },
          telemetry: summarizeRun(tlm),
          plan: plan.resolved,
        });
      } catch (err: any) {
        console.error("[Generate API] ElevenLabs Music Failed, falling back to ACE-Step", err);
        route.path = "ace-step";
        route.reason += " (ElevenLabs API failed, fallback)";
      }
    }
    else if (route.path === "tts-mix") {
      // Start the instrumental generation
      context.instrumentalOnly = true;
      jobId = await withStage(tlm, "model-call", () => submitAceStepJob(context, replicate), {
        provider: "replicate", modelId: "ace-step", genreId: plan.resolved.genreId,
      });

      // Simultaneously get the TTS
      try {
        const ttsAudio = await withStage(tlm, "model-call", () => generateElevenLabsTTS(context), {
          provider: "elevenlabs", modelId: "tts",
        });
        mixData = { vocalAudioBase64: ttsAudio };
      } catch (err) {
        console.error("[Generate API] TTS Vocal fail, standard ace-step fallback", err);
        // Revert context flag so it has generic vocals at least
        context.instrumentalOnly = false;
      }
    }

    // Default ACE Step
    if (!jobId && route.path === "ace-step") {
      if (context.vocalLanguage === "Punjabi" && process.env.PUNJABI_ACE_STEP_MODEL_ID) {
        jobId = await withStage(tlm, "model-call", () => submitPunjabiAceStepJob(context, replicate), {
          provider: "replicate", modelId: "punjabi-ace-step", genreId: plan.resolved.genreId,
        });
      } else {
        jobId = await withStage(tlm, "model-call", () => submitAceStepJob(context, replicate), {
          provider: "replicate", modelId: "ace-step", genreId: plan.resolved.genreId,
        });
      }
    }

    record(tlm, "respond", { qualityScore: gate.finalScore });
    return NextResponse.json({
      jobId,
      route: route.path,
      mixData,
      status: "starting",
      seed: uniqueSeed,
      runId: tlm.runId,
      quality: { score: gate.finalScore, rewrites: gate.rewrites, issues: gate.finalIssues },
      telemetry: summarizeRun(tlm),
      plan: plan.resolved,
    });

  } catch (error: any) {
    console.error('Error starting generation:', error);
    record(tlm, "error", { errorCode: error?.code ?? "UNKNOWN", errorMessage: error?.message });
    return NextResponse.json({ error: error.message || 'Generation failed', runId: tlm.runId }, { status: 500 });
  }
}
