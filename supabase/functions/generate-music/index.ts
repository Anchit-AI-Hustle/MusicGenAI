import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ===== TYPE DEFINITIONS =====

interface SegmentPlan {
  name: string;
  duration: number;
  description: string;
}

interface SongPlan {
  segments: SegmentPlan[];
}

interface ProductionBrief {
  genre: string;
  subgenre: string;
  tempo: string;
  mood: string;
  atmosphere: string;
  environment: string;
  instrumentation: string;
  energyCurve: string;
  rhythmicStyle: string;
  textureKeywords: string[];
}

// ===== HELPER: Call Lovable AI with tool calling =====
async function callAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  toolName: string,
  toolDescription: string,
  toolParams: Record<string, any>,
  requiredFields: string[]
): Promise<any> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      temperature: 0.7 + Math.random() * 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: toolName,
          description: toolDescription,
          parameters: {
            type: "object",
            properties: toolParams,
            required: requiredFields,
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: toolName } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`AI call failed (${toolName}):`, response.status, errText);
    return null;
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    return JSON.parse(toolCall.function.arguments);
  }
  return null;
}

// ===== HELPER: Broadcast progress via Realtime =====
async function broadcastProgress(
  supabase: any, jobId: string, stepNumber: number, stepName: string,
  progressPercent: number, segmentsCompleted: number, totalSegments: number,
  estimatedTimeRemaining: string
) {
  try {
    const channel = supabase.channel(`generation:${jobId}`);
    await channel.send({
      type: "broadcast",
      event: "progress",
      payload: {
        jobId, stepNumber, stepName, progressPercent,
        segmentsCompleted, totalSegments, estimatedTimeRemaining,
      },
    });
    supabase.removeChannel(channel);
  } catch (e) {
    console.warn(`Broadcast failed for ${jobId}:`, e);
  }
}

// ===== HELPER: Update progress (DB + broadcast) =====
async function updateProgress(
  supabase: any, trackId: string, creationId: string,
  stage: string, progress: number, estimatedTimeLeft?: number,
  jobId?: string, stepNumber?: number, segmentsCompleted?: number, totalSegments?: number,
  trackStatus?: string
) {
  const status = trackStatus || "processing";
  await supabase.from("tracks").update({
    progress, status, current_stage: stage,
    estimated_time_left: estimatedTimeLeft ?? 0,
  }).eq("id", trackId);
  await supabase.from("music_creations").update({ progress, status }).eq("id", creationId);
  console.log(`[${trackId}] Status: ${status} | Stage: ${stage} | Progress: ${Math.round(progress * 100)}% | ETA: ${estimatedTimeLeft ?? 0}s`);

  if (jobId && stepNumber !== undefined) {
    const eta = estimatedTimeLeft ?? 0;
    const etaStr = eta >= 60 ? `${Math.floor(eta / 60)} minute${Math.floor(eta / 60) > 1 ? 's' : ''}` : `${eta} seconds`;
    await broadcastProgress(supabase, jobId, stepNumber, stage, Math.round(progress * 100), segmentsCompleted ?? 0, totalSegments ?? 0, etaStr);
  }
}

// ===== REPLICATE: Model fallback list =====
const REPLICATE_MODELS = [
  "meta/musicgen",
  "riffusion/riffusion",
];

// ===== REPLICATE: Create prediction with model fallback + rate-limit awareness =====
async function replicateCreatePrediction(
  apiToken: string,
  prompt: string,
  duration: number,
  seed?: number,
): Promise<string> {
  const actualSeed = seed ?? Math.floor(Math.random() * 2147483647);
  const maxCreateAttempts = 10;

  let predictionId = "";
  let lastError = "";

  for (const model of REPLICATE_MODELS) {
    // meta/musicgen max duration is ~8s; other models may support more
    const modelDuration = model === "meta/musicgen" ? Math.min(duration, 8) : Math.min(duration, 30);
    console.log(`[Replicate] Trying model: ${model} (duration=${modelDuration}s)`);
    predictionId = "";

    for (let attempt = 1; attempt <= maxCreateAttempts; attempt++) {
      const createRes = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          Authorization: `Token ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: {
            prompt,
            duration: modelDuration,
            seed: actualSeed,
          },
        }),
      });

      if (createRes.ok) {
        const prediction = await createRes.json();
        predictionId = prediction.id;
        console.log(`[Replicate] Prediction ${predictionId} created with model=${model} (seed=${actualSeed}, attempt=${attempt})`);
        break;
      }

      const errBody = await createRes.text();

      if (createRes.status === 404 || createRes.status === 422) {
        console.warn(`[Replicate] Model ${model} returned ${createRes.status}: ${errBody}. Switching to next model.`);
        lastError = `${model} returned ${createRes.status}: ${errBody}`;
        break; // try next model
      }

      if (createRes.status === 429) {
        let waitSec = 10 * attempt;
        try {
          const parsed = JSON.parse(errBody);
          if (parsed.retry_after) waitSec = Math.max(parsed.retry_after + 1, 2);
        } catch { /* use default */ }
        console.warn(`[Replicate] Rate limited (attempt ${attempt}/${maxCreateAttempts}). Waiting ${waitSec}s...`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }

      throw new Error(`Replicate create failed [${createRes.status}]: ${errBody}`);
    }

    if (predictionId) break; // success
  }

  if (!predictionId) {
    throw new Error(`All Replicate models failed. Last error: ${lastError}`);
  }

  // Poll for completion every 2s (max 5 minutes)
  const maxPolls = 150;
  const pollInterval = 2000;

  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, pollInterval));

    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Token ${apiToken}` },
    });

    if (!pollRes.ok) {
      const errBody = await pollRes.text();
      console.error(`[Replicate] Poll error: ${pollRes.status} ${errBody}`);
      if (pollRes.status === 429) {
        await new Promise(r => setTimeout(r, 10000));
      }
      continue;
    }

    const result = await pollRes.json();
    console.log(`[Replicate] Poll ${i + 1}: status=${result.status}`);

    if (result.status === "succeeded") {
      // output can be a string URL or an array of URLs
      const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
      if (!outputUrl) {
        throw new Error(`Replicate prediction succeeded but output is empty: ${JSON.stringify(result.output)}`);
      }
      console.log(`[Replicate] ✅ Prediction ${predictionId} complete: ${outputUrl}`);
      return outputUrl;
    }

    if (result.status === "failed" || result.status === "canceled") {
      throw new Error(`Replicate prediction ${result.status}: ${result.error || "Unknown"}`);
    }
  }

  throw new Error(`Replicate prediction timed out after ${maxPolls * pollInterval / 1000}s`);
}

// ===== HELPER: Download audio from URL =====
async function downloadAudio(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed [${res.status}]: ${url}`);
  return await res.arrayBuffer();
}

// ===== HELPER: Generate segment with retry (unique seed each attempt) =====
async function generateSegmentWithRetry(
  apiToken: string,
  prompt: string,
  duration: number,
  maxRetries: number = 5,
): Promise<{ audioUrl: string; buffer: ArrayBuffer }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Pass duration as-is; replicateCreatePrediction caps per model
      const audioUrl = await replicateCreatePrediction(apiToken, prompt, duration);
      const buffer = await downloadAudio(audioUrl);
      return { audioUrl, buffer };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Segment gen attempt ${attempt}/${maxRetries}: ${msg}`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 3000 * attempt));
        continue;
      }
      throw new Error(`Segment failed after ${maxRetries} retries: ${msg}`);
    }
  }
  throw new Error("Unreachable");
}

// ===== HELPER: Parse WAV and extract PCM data =====
interface WavInfo {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  pcmData: Uint8Array;
}

function parseWav(buf: ArrayBuffer): WavInfo {
  const view = new DataView(buf);
  let sampleRate = 44100;
  let numChannels = 1;
  let bitsPerSample = 16;
  let pcmData = new Uint8Array(0);

  let offset = 12;
  while (offset < buf.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset), view.getUint8(offset + 1),
      view.getUint8(offset + 2), view.getUint8(offset + 3)
    );
    const chunkLen = view.getUint32(offset + 4, true);

    if (chunkId === "fmt ") {
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    }

    if (chunkId === "data") {
      pcmData = new Uint8Array(buf, offset + 8, chunkLen);
      break;
    }

    offset += 8 + chunkLen;
    if (chunkLen % 2 !== 0) offset++; // WAV chunks are word-aligned
  }

  return { sampleRate, numChannels, bitsPerSample, pcmData };
}

// ===== HELPER: Concatenate WAV buffers with crossfade and trim =====
function concatenateWavBuffers(buffers: ArrayBuffer[], targetDurationSec?: number, crossfadeSec: number = 0.5): ArrayBuffer {
  if (buffers.length === 0) throw new Error("No buffers to concatenate");
  if (buffers.length === 1) {
    if (!targetDurationSec) return buffers[0];
    // Trim single buffer if needed
    const info = parseWav(buffers[0]);
    return trimAndBuildWav(info, targetDurationSec);
  }

  const parsedSegments = buffers.map(buf => parseWav(buf));

  // Use first segment's format for output
  const { sampleRate, numChannels, bitsPerSample } = parsedSegments[0];
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const crossfadeSamples = Math.floor(crossfadeSec * sampleRate);
  const crossfadeBytes = crossfadeSamples * blockAlign;

  // Calculate total PCM size with crossfade overlap
  let totalPcmSize = 0;
  for (let i = 0; i < parsedSegments.length; i++) {
    totalPcmSize += parsedSegments[i].pcmData.byteLength;
    if (i > 0) {
      // Subtract crossfade overlap (only if both segments are long enough)
      const prevLen = parsedSegments[i - 1].pcmData.byteLength;
      const currLen = parsedSegments[i].pcmData.byteLength;
      const actualCrossfade = Math.min(crossfadeBytes, Math.floor(prevLen / 4), Math.floor(currLen / 4));
      totalPcmSize -= actualCrossfade;
    }
  }

  // Allocate output PCM buffer
  const outputPcm = new Uint8Array(totalPcmSize);
  let writePos = 0;

  for (let segIdx = 0; segIdx < parsedSegments.length; segIdx++) {
    const seg = parsedSegments[segIdx];
    const segData = seg.pcmData;

    if (segIdx === 0) {
      // First segment: write fully
      outputPcm.set(segData, writePos);
      writePos += segData.byteLength;
    } else {
      const prevLen = parsedSegments[segIdx - 1].pcmData.byteLength;
      const currLen = segData.byteLength;
      const actualCrossfadeBytes = Math.min(crossfadeBytes, Math.floor(prevLen / 4), Math.floor(currLen / 4));
      const actualCrossfadeSamples = Math.floor(actualCrossfadeBytes / blockAlign);

      if (actualCrossfadeSamples > 0 && bitsPerSample === 16) {
        // Back up write position for crossfade region
        writePos -= actualCrossfadeBytes;

        // Apply crossfade: blend prev tail with curr head
        const prevView = new DataView(outputPcm.buffer, writePos, actualCrossfadeBytes);
        const currView = new DataView(segData.buffer, segData.byteOffset, actualCrossfadeBytes);

        for (let s = 0; s < actualCrossfadeSamples; s++) {
          const fadeOut = 1.0 - (s / actualCrossfadeSamples); // prev fades out
          const fadeIn = s / actualCrossfadeSamples; // curr fades in
          for (let ch = 0; ch < numChannels; ch++) {
            const byteOff = (s * numChannels + ch) * bytesPerSample;
            const prevSample = prevView.getInt16(byteOff, true);
            const currSample = currView.getInt16(byteOff, true);
            const mixed = Math.round(prevSample * fadeOut + currSample * fadeIn);
            const clamped = Math.max(-32768, Math.min(32767, mixed));
            prevView.setInt16(byteOff, clamped, true);
          }
        }

        writePos += actualCrossfadeBytes;
        // Write rest of current segment (after crossfade region)
        const remaining = new Uint8Array(segData.buffer, segData.byteOffset + actualCrossfadeBytes, segData.byteLength - actualCrossfadeBytes);
        outputPcm.set(remaining, writePos);
        writePos += remaining.byteLength;
      } else {
        // No crossfade possible, just append
        outputPcm.set(segData, writePos);
        writePos += segData.byteLength;
      }
    }
  }

  // Trim to actual written size
  const finalPcm = outputPcm.slice(0, writePos);

  // Trim to target duration if specified
  let pcmToWrite = finalPcm;
  if (targetDurationSec) {
    const maxBytes = Math.floor(targetDurationSec * sampleRate * blockAlign);
    if (pcmToWrite.byteLength > maxBytes) {
      pcmToWrite = pcmToWrite.slice(0, maxBytes);
    }
  }

  return buildWavFile(pcmToWrite, sampleRate, numChannels, bitsPerSample);
}

function trimAndBuildWav(info: WavInfo, targetDurationSec: number): ArrayBuffer {
  const blockAlign = info.numChannels * (info.bitsPerSample / 8);
  const maxBytes = Math.floor(targetDurationSec * info.sampleRate * blockAlign);
  const trimmed = info.pcmData.byteLength > maxBytes
    ? info.pcmData.slice(0, maxBytes)
    : info.pcmData;
  return buildWavFile(trimmed, info.sampleRate, info.numChannels, info.bitsPerSample);
}

function buildWavFile(pcm: Uint8Array, sampleRate: number, numChannels: number, bitsPerSample: number): ArrayBuffer {
  const headerSize = 44;
  const wavBuffer = new ArrayBuffer(headerSize + pcm.byteLength);
  const wavView = new DataView(wavBuffer);
  const wavBytes = new Uint8Array(wavBuffer);

  // RIFF header
  wavBytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  wavView.setUint32(4, 36 + pcm.byteLength, true);
  wavBytes.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // fmt chunk
  wavBytes.set([0x66, 0x6D, 0x74, 0x20], 12); // "fmt "
  wavView.setUint32(16, 16, true);
  wavView.setUint16(20, 1, true); // PCM
  wavView.setUint16(22, numChannels, true);
  wavView.setUint32(24, sampleRate, true);
  wavView.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  wavView.setUint16(32, numChannels * (bitsPerSample / 8), true);
  wavView.setUint16(34, bitsPerSample, true);

  // data chunk
  wavBytes.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  wavView.setUint32(40, pcm.byteLength, true);

  wavBytes.set(pcm, headerSize);
  return wavBuffer;
}

// ===== RATE-LIMITED SEQUENTIAL QUEUE =====
// Free tier: 6 predictions/min, burst 1. Wait between requests.
const REQUEST_DELAY_MS = 10_000; // 10s between predictions
const MAX_PARALLEL = 1; // Sequential only on free tier

async function runSequentialWithDelay<T>(
  tasks: (() => Promise<T>)[],
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i++) {
    if (i > 0) {
      console.log(`[RateLimit] Waiting ${REQUEST_DELAY_MS / 1000}s before next segment...`);
      await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
    }
    results.push(await tasks[i]());
  }
  return results;
}

// ===== SECTION MODIFIERS for structural guidance =====
const SECTION_MODIFIERS: Record<string, string> = {
  intro: "atmospheric opening, building tension slowly, sparse arrangement",
  build: "rising energy, adding layers and percussion, increasing intensity",
  peak: "maximum intensity, full arrangement, all elements firing",
  drop: "heavy bass drop, distorted elements, powerful rhythm, maximum impact",
  breakdown: "stripped back, ethereal, breathing space, ambient textures",
  bridge: "transitional, melodic shift, emotional pivot, textural change",
  climax: "emotional peak, all elements converging, maximum density",
  outro: "gradual fade, resolving energy, final atmosphere, gentle release",
  verse: "narrative section, melodic foundation, rhythmic groove",
  chorus: "catchy hook, elevated energy, memorable melody, full arrangement",
  extension: "sustained mood, gentle continuation, evolving textures",
};

// ===== VARIATION POOLS for prompt uniqueness =====
const TEXTURE_VARIATIONS = [
  "metallic textures", "analog warmth", "granular synthesis", "tape saturation",
  "bit-crushed elements", "reverb-drenched pads", "filtered white noise",
  "detuned oscillators", "FM synthesis bells", "ring-modulated tones",
  "convolution reverb spaces", "spectral processing", "waveshaping distortion",
  "comb-filtered layers", "phase-shifted textures", "harmonic overtones",
];

const RHYTHM_VARIATIONS = [
  "syncopated hi-hats", "polyrhythmic percussion", "shuffled groove",
  "off-beat accents", "triplet patterns", "straight 4/4 drive",
  "breakbeat influenced", "half-time feel", "double-time energy",
  "ghost note patterns", "swung rhythms", "militaristic precision",
];

function pickRandom<T>(arr: T[], count: number = 1): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ===== BUILD RICH SEGMENT PROMPT from production brief =====
function buildSegmentPrompt(
  brief: ProductionBrief,
  seg: SegmentPlan,
  segIdx: number,
  totalSegments: number,
  userPrompt: string,
  artistInspiration: string,
): string {
  const sectionMod = SECTION_MODIFIERS[seg.name.replace(/_\d+$/, "")] || seg.description;
  const textureVar = pickRandom(TEXTURE_VARIATIONS, 1)[0];
  const rhythmVar = pickRandom(RHYTHM_VARIATIONS, 1)[0];
  // Pick 1-2 keywords from brief's texture pool
  const briefTextures = brief.textureKeywords?.length
    ? pickRandom(brief.textureKeywords, Math.min(2, brief.textureKeywords.length)).join(", ")
    : "";

  const parts = [
    `${brief.genre} ${brief.subgenre} ${seg.name} section`,
    `${brief.tempo}`,
    `${brief.mood} mood, ${brief.atmosphere}`,
    `${sectionMod}`,
    `Instrumentation: ${brief.instrumentation}`,
    `Rhythm: ${brief.rhythmicStyle}, ${rhythmVar}`,
    `Texture: ${textureVar}${briefTextures ? `, ${briefTextures}` : ""}`,
    `Environment: ${brief.environment}`,
    artistInspiration ? `Influenced by: ${artistInspiration}` : "",
    segIdx === 0 ? "Begin the track with a clear, intentional opening."
      : segIdx === totalSegments - 1 ? "Bring the track to a natural, resolved conclusion."
      : "Continue seamlessly from the previous section with natural musical flow.",
    userPrompt,  // Include original prompt for flavor
  ];

  return parts.filter(Boolean).join(". ") + ".";
}

// ===== MAIN PIPELINE =====

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!REPLICATE_API_TOKEN) {
    return new Response(JSON.stringify({ error: "REPLICATE_API_TOKEN not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { trackId, creationId, input, jobId: reqJobId } = await req.json();
    const jobId = reqJobId || trackId; // fallback to trackId if no jobId

    // ================================================================
    // INPUT FREEZE
    // ================================================================
    const frozenInput = {
      musicPrompt: input.musicPrompt || "",
      genres: input.genres || [],
      durationSeconds: input.durationSeconds || 180,
      vocalLanguages: input.vocalLanguages || [],
      lyrics: input.lyrics || "",
      artistInspiration: input.artistInspiration || "",
      tempoBpm: input.tempoBpm || 120,
      vocalStructure: input.vocalStructure || "Instrumental",
      vocalStyle: input.vocalStyle || "",
      vocalIntensity: input.vocalIntensity || 5,
      vocalEffects: input.vocalEffects || [],
    };

    await supabase.from("tracks").update({ status: "processing", progress: 0 }).eq("id", trackId);
    await supabase.from("music_creations").update({ status: "processing", progress: 0 }).eq("id", creationId);

    const durationSec = frozenInput.durationSeconds;
    const estSegmentTime = 12; // ~12s per segment on free tier (gen + 10s delay)
    const estTotalSec = 20 + Math.ceil(durationSec / 30) * estSegmentTime + 10;
    let etaRemaining = estTotalSec;

    // ================================================================
    // STEP 1 — ANALYZING PROMPT
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "Analyzing user inputs and prompt", 0.02, etaRemaining, jobId, 1, 0, 0, "analyzing");

    const sentiment = await callAI(
      LOVABLE_API_KEY,
      "You are a music psychology expert. Analyze text for emotional and stylistic signals relevant to music production.",
      `Analyze this music request:\nPrompt: "${frozenInput.musicPrompt}"\nGenres: ${frozenInput.genres.join(", ") || "Not specified"}\nLyrics: "${frozenInput.lyrics || "None"}"\nArtist Inspiration: "${frozenInput.artistInspiration || "None"}"\nTempo: ${frozenInput.tempoBpm} BPM\nVocal Style: ${frozenInput.vocalStyle || "Instrumental"}\nMood analysis: extract emotion, energy, darkness, aggression, melodic complexity, rhythmic density.`,
      "extract_sentiment",
      "Extract emotional and stylistic signals",
      {
        emotionPolarity: { type: "string", description: "Primary emotion e.g. dark, euphoric, melancholic" },
        energyIntensity: { type: "number", description: "Energy 1-10" },
        darknessBrightness: { type: "number", description: "Darkness(-10) to brightness(10)" },
        aggressionLevel: { type: "number", description: "Aggression 1-10" },
        melodicComplexity: { type: "number", description: "Melodic complexity 1-10" },
        rhythmicDensity: { type: "number", description: "Rhythmic density 1-10" },
      },
      ["emotionPolarity", "energyIntensity", "darknessBrightness", "aggressionLevel", "melodicComplexity", "rhythmicDensity"]
    ) || { emotionPolarity: "neutral", energyIntensity: 5, darknessBrightness: 0, aggressionLevel: 3, melodicComplexity: 5, rhythmicDensity: 5 };

    console.log(`[${trackId}] Sentiment:`, JSON.stringify(sentiment));
    etaRemaining -= 5;

    // ================================================================
    // STEP 1b — EXPANDING PROMPT INTO PRODUCTION BRIEF
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "Expanding into production brief", 0.04, etaRemaining, jobId, 2, 0, 0, "analyzing");

    const briefResult = await callAI(
      LOVABLE_API_KEY,
      `You are an expert music producer. Given a user's music request and sentiment analysis, generate a detailed production brief that will guide AI music generation. Be specific about instruments, textures, and sonic character. Tailor everything to the genre and mood.`,
      `User prompt: "${frozenInput.musicPrompt}"
Genres: ${frozenInput.genres.join(", ") || "electronic"}
Tempo: ${frozenInput.tempoBpm} BPM
Artist Inspiration: "${frozenInput.artistInspiration || "None"}"
Sentiment: mood=${sentiment.emotionPolarity}, energy=${sentiment.energyIntensity}/10, darkness=${sentiment.darknessBrightness}, aggression=${sentiment.aggressionLevel}/10
Vocal structure: "${frozenInput.vocalStructure}"

Generate a production brief with: genre, subgenre, tempo description, mood, atmosphere, environment, instrumentation (specific instruments/synths), energy curve, rhythmic style, and 5-8 texture keywords for variation.`,
      "create_production_brief",
      "Create a structured production brief for music generation",
      {
        genre: { type: "string", description: "Primary genre e.g. Industrial Techno" },
        subgenre: { type: "string", description: "Subgenre or style variation e.g. Dark Warehouse" },
        tempo: { type: "string", description: "Tempo description e.g. 140 BPM, driving four-on-the-floor" },
        mood: { type: "string", description: "Mood description e.g. dark, aggressive, relentless" },
        atmosphere: { type: "string", description: "Atmospheric quality e.g. smoky, claustrophobic, vast" },
        environment: { type: "string", description: "Sonic environment e.g. underground warehouse, open air festival" },
        instrumentation: { type: "string", description: "Specific instruments e.g. distorted 909 kick, metallic hi-hats, acid 303 bass" },
        energyCurve: { type: "string", description: "Energy arc e.g. slow build → explosive drop → breakdown → final peak" },
        rhythmicStyle: { type: "string", description: "Rhythmic character e.g. driving four-on-the-floor with syncopated hats" },
        textureKeywords: {
          type: "array",
          items: { type: "string" },
          description: "5-8 texture/sonic keywords for variation e.g. metallic, gritty, cavernous",
        },
      },
      ["genre", "subgenre", "tempo", "mood", "atmosphere", "environment", "instrumentation", "energyCurve", "rhythmicStyle", "textureKeywords"]
    );

    const productionBrief: ProductionBrief = briefResult ? {
      genre: briefResult.genre || frozenInput.genres[0] || "electronic",
      subgenre: briefResult.subgenre || "",
      tempo: briefResult.tempo || `${frozenInput.tempoBpm} BPM`,
      mood: briefResult.mood || sentiment.emotionPolarity,
      atmosphere: briefResult.atmosphere || "immersive",
      environment: briefResult.environment || "studio production",
      instrumentation: briefResult.instrumentation || "synthesizers, drums, bass",
      energyCurve: briefResult.energyCurve || "build → peak → resolve",
      rhythmicStyle: briefResult.rhythmicStyle || "steady groove",
      textureKeywords: briefResult.textureKeywords || [],
    } : {
      genre: frozenInput.genres[0] || "electronic",
      subgenre: "",
      tempo: `${frozenInput.tempoBpm} BPM`,
      mood: sentiment.emotionPolarity,
      atmosphere: "immersive",
      environment: "studio production",
      instrumentation: "synthesizers, drums, bass",
      energyCurve: "build → peak → resolve",
      rhythmicStyle: "steady groove",
      textureKeywords: [],
    };

    console.log(`[${trackId}] Production Brief:`, JSON.stringify(productionBrief));
    etaRemaining -= 5;

    // ================================================================
    // STEP 2 — PLANNING SONG STRUCTURE
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "Planning song structure and segments", 0.07, etaRemaining, jobId, 3, 0, 0, "analyzing");

    const planResult = await callAI(
      LOVABLE_API_KEY,
      `You are a professional song structure planner. Plan a song with segments that sum to EXACTLY ${durationSec} seconds total.
Each segment should be a distinct musical section. Use varied structures — never produce identical plans.
Consider: genre=${frozenInput.genres.join(", ") || "electronic"}, tempo=${frozenInput.tempoBpm}BPM, mood=${sentiment.emotionPolarity}, energy=${sentiment.energyIntensity}/10.
Vocal structure requested: "${frozenInput.vocalStructure}".
IMPORTANT: segment durations MUST sum to exactly ${durationSec} seconds. Each segment MUST be between 10 and 30 seconds (MusicGen limit).
Add slight randomness to durations to ensure uniqueness across generations.`,
      `Plan the structure for a ${durationSec}-second ${frozenInput.genres[0] || "electronic"} track at ${frozenInput.tempoBpm} BPM.
The user wants vocal structure: "${frozenInput.vocalStructure}".
Mood: ${sentiment.emotionPolarity}. Energy: ${sentiment.energyIntensity}/10. Aggression: ${sentiment.aggressionLevel}/10.
Artist inspiration: "${frozenInput.artistInspiration || "None"}".

Return an array of segments with name, duration (seconds, max 30 each), and a vivid description.
Durations MUST sum to exactly ${durationSec}.`,
      "plan_song_structure",
      "Generate structured song plan with named segments",
      {
        segments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Section name e.g. intro, build, drop, breakdown, outro" },
              duration: { type: "number", description: "Duration in seconds (max 30)" },
              description: { type: "string", description: "What happens musically in this section" },
            },
            required: ["name", "duration", "description"],
          },
        },
      },
      ["segments"]
    );

    let songPlan: SongPlan;
    if (planResult?.segments?.length > 0) {
      // Cap each segment at 30s, floor at 5s
      for (const seg of planResult.segments) {
        if (seg.duration > 30) seg.duration = 30;
        if (seg.duration < 5) seg.duration = 10;
      }
      const totalPlanned = planResult.segments.reduce((s: number, seg: any) => s + seg.duration, 0);
      if (totalPlanned !== durationSec) {
        const diff = durationSec - totalPlanned;
        if (diff > 0 && diff <= 30) {
          planResult.segments.push({ name: "extension", duration: diff, description: "Extended section to match duration" });
        } else if (diff > 30) {
          let remaining = diff;
          let extIdx = 1;
          while (remaining > 0) {
            const segDur = Math.min(30, remaining);
            planResult.segments.push({ name: `extension_${extIdx}`, duration: segDur, description: "Extended section" });
            remaining -= segDur;
            extIdx++;
          }
        } else if (diff < 0) {
          planResult.segments[planResult.segments.length - 1].duration += diff;
          if (planResult.segments[planResult.segments.length - 1].duration < 5) {
            planResult.segments.pop();
          }
        }
      }
      songPlan = { segments: planResult.segments };
    } else {
      // Fallback plan
      const numSegments = Math.ceil(durationSec / 30);
      const baseDuration = Math.floor(durationSec / numSegments);
      const remainder = durationSec - baseDuration * numSegments;
      const names = ["intro", "build", "peak", "breakdown", "drop", "bridge", "climax", "outro"];
      const segments: SegmentPlan[] = [];
      for (let i = 0; i < numSegments; i++) {
        segments.push({
          name: names[i % names.length] + (i >= names.length ? `_${Math.floor(i / names.length) + 1}` : ""),
          duration: baseDuration + (i === numSegments - 1 ? remainder : 0),
          description: i === 0 ? "Opening atmosphere" : i === numSegments - 1 ? "Closing fade" : "Development section",
        });
      }
      songPlan = { segments };
    }

    console.log(`[${trackId}] Plan: ${songPlan.segments.map(s => `${s.name}(${s.duration}s)`).join(" → ")}`);
    etaRemaining -= 8;

    // ================================================================
    // STEP 3 — GENERATING SEGMENTS via Replicate (parallel, max 3)
    // ================================================================
    const totalSegments = songPlan.segments.length;
    await supabase.from("tracks").update({ total_segments: totalSegments }).eq("id", trackId);

    // Create segment DB records
    for (let i = 0; i < totalSegments; i++) {
      await supabase.from("segments").insert({
        track_id: trackId,
        segment_index: i,
        duration_seconds: songPlan.segments[i].duration,
        status: "pending",
      });
    }

    // Sequential generation with rate-limit delay (free tier safe)
    const segProgressStart = 0.10;
    const segProgressEnd = 0.70;
    let completedSegments = 0;

    const segmentTasks = songPlan.segments.map((seg, idx) => {
      return async (): Promise<ArrayBuffer> => {
        const prompt = buildSegmentPrompt(
          productionBrief, seg, idx, totalSegments,
          frozenInput.musicPrompt, frozenInput.artistInspiration
        );
        console.log(`[${trackId}] Segment ${idx + 1} prompt: ${prompt.substring(0, 120)}...`);

        const segmentsRemaining = totalSegments - completedSegments;
        const segLabel = `Generating ${seg.name} segment (${idx + 1} of ${totalSegments})`;
        await updateProgress(
          supabase, trackId, creationId,
          segLabel,
          segProgressStart + (completedSegments / totalSegments) * (segProgressEnd - segProgressStart),
          Math.max(0, segmentsRemaining * estSegmentTime + 10),
          jobId, 4, completedSegments, totalSegments, "generating_segments"
        );

        const { buffer } = await generateSegmentWithRetry(REPLICATE_API_TOKEN!, prompt, seg.duration);

        const segPath = `tracks/${trackId}/segment_${idx}.wav`;
        await supabase.storage.from("music-files").upload(segPath, new Uint8Array(buffer), {
          contentType: "audio/wav", upsert: true,
        });

        await supabase.from("segments").update({
          storage_path: segPath, status: "completed",
        }).eq("track_id", trackId).eq("segment_index", idx);

        completedSegments++;
        await supabase.from("tracks").update({
          completed_segments: completedSegments,
          progress: segProgressStart + (completedSegments / totalSegments) * (segProgressEnd - segProgressStart),
        }).eq("id", trackId);

        console.log(`[${trackId}] ✅ Segment ${idx + 1}/${totalSegments} (${seg.name}) complete (${buffer.byteLength} bytes)`);
        return buffer;
      };
    });

    let segmentBuffers: ArrayBuffer[];
    try {
      segmentBuffers = await runSequentialWithDelay(segmentTasks);
    } catch (e) {
      const errorMsg = `Segment generation failed: ${e instanceof Error ? e.message : String(e)}`;
      console.error(`[${trackId}] ${errorMsg}`);
      await supabase.from("tracks").update({ status: "failed", error_message: errorMsg }).eq("id", trackId);
      await supabase.from("music_creations").update({ status: "failed" }).eq("id", creationId);
      await broadcastProgress(supabase, jobId, -1, "Failed", 100, 0, 0, "0 seconds");
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ================================================================
    // STEP 4 — DOWNLOADING GENERATED AUDIO (already done inline above)
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "Downloading generated audio segments", 0.75, 15, jobId, 5, totalSegments, totalSegments, "generating_segments");
    console.log(`[${trackId}] All ${totalSegments} segments downloaded`);

    // ================================================================
    // STEP 5 — STITCHING SEGMENTS (with crossfade + trim to exact duration)
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "Stitching segments into final track", 0.82, 10, jobId, 6, totalSegments, totalSegments, "stitching_audio");

    let stitchedBuffer: ArrayBuffer;
    try {
      stitchedBuffer = concatenateWavBuffers(segmentBuffers, durationSec, 0.5);
      console.log(`[${trackId}] ✅ Stitched with crossfade (${stitchedBuffer.byteLength} bytes), trimmed to ${durationSec}s`);
    } catch (e) {
      console.error(`[${trackId}] Stitch error, raw concat fallback:`, e);
      // Fallback: simple concatenation without crossfade
      try {
        stitchedBuffer = concatenateWavBuffers(segmentBuffers, durationSec, 0);
      } catch {
        let totalSize = 0;
        for (const buf of segmentBuffers) totalSize += buf.byteLength;
        const raw = new Uint8Array(totalSize);
        let off = 0;
        for (const buf of segmentBuffers) { raw.set(new Uint8Array(buf), off); off += buf.byteLength; }
        stitchedBuffer = raw.buffer;
      }
    }

    // Save stitched track
    const instrumentalPath = `tracks/${trackId}/instrumental.wav`;
    await supabase.storage.from("music-files").upload(instrumentalPath, new Uint8Array(stitchedBuffer), {
      contentType: "audio/wav", upsert: true,
    });

    // ================================================================
    // STEP 6 — FINALIZING TRACK
    // ================================================================
    await updateProgress(supabase, trackId, creationId, "Finalizing and saving audio output", 0.92, 5, jobId, 8, 0, 0, "uploading");

    const finalPath = `tracks/${trackId}/final.wav`;
    const { error: uploadError } = await supabase.storage
      .from("music-files")
      .upload(finalPath, new Uint8Array(stitchedBuffer), { contentType: "audio/wav", upsert: true });

    if (uploadError) {
      console.error("Final upload error:", uploadError);
      await supabase.from("tracks").update({ status: "failed", error_message: "Failed to upload final audio" }).eq("id", trackId);
      return new Response(JSON.stringify({ error: "Upload failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: urlData } = supabase.storage.from("music-files").getPublicUrl(finalPath);
    const audioUrl = urlData.publicUrl;

    const generationTime = Math.round((Date.now() - startTime) / 1000);

    // Update DB
    await supabase.from("tracks").update({
      status: "completed", audio_url: audioUrl, progress: 1, duration_seconds: durationSec,
      current_stage: "Complete",
    }).eq("id", trackId);

    await supabase.from("music_creations").update({
      status: "completed", progress: 1,
    }).eq("id", creationId);

    // Broadcast completion
    await broadcastProgress(supabase, jobId, 9, "Completed", 100, totalSegments, totalSegments, "0 seconds");
    console.log(`[${trackId}] ✅ Complete in ${generationTime}s. Audio: ${audioUrl}`);

    return new Response(JSON.stringify({
      success: true,
      trackId,
      final_audio_url: audioUrl,
      duration: durationSec,
      segments_generated: totalSegments,
      tempo: frozenInput.tempoBpm,
      generation_time: generationTime,
      segments_used: songPlan.segments.map(s => ({ name: s.name, duration: s.duration, description: s.description })),
      pipeline: {
        sentiment,
        plan: songPlan,
        engine: "replicate/musicgen (hosted GPU)",
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("generate-music error:", e);
    // Broadcast failure
    try {
      const supabaseForBroadcast = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { trackId: tid, jobId: jid } = await req.clone().json().catch(() => ({ trackId: "", jobId: "" }));
      if (jid || tid) {
        await broadcastProgress(supabaseForBroadcast, jid || tid, -1, "Failed", 100, 0, 0, "0 seconds");
      }
    } catch { /* ignore broadcast errors */ }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
