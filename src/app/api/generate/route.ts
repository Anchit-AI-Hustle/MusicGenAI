import { NextResponse } from 'next/server';
import Replicate from "replicate";
import { CreativeContext } from "@/types/creative-context";
import { determineGenerationPath } from "@/lib/qualityRouter";
import { submitAceStepJob, submitStableAudioJob, submitPunjabiAceStepJob } from "@/lib/modelRouter";
import { generateElevenLabsMusic, generateElevenLabsTTS } from "@/lib/elevenlabsMusic";
import { checkRateLimit } from "@/lib/rateLimiter";

// Ensure Edge runtime isn't used where node primitives (Buffer) are required by older SDKs
// export const runtime = 'edge'; 

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    
    // Rate Limiting
    const rateLimit = await checkRateLimit(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json({ 
        error: `Rate limit exceeded. Please wait ${Math.ceil(rateLimit.resetOffset / 60000)} minutes.` 
      }, { status: 429 });
    }

    const context: CreativeContext = await req.json();

    const apiKey = process.env.REPLICATE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Replicate API Key is not configured." }, { status: 500 });
    }
    
    const replicate = new Replicate({ auth: apiKey });

    // Determine the best path
    const route = determineGenerationPath(context);
    console.log(`[Generate API] Determined route: ${route.path} (${route.reason})`);

    let jobId = null;
    let audioResult = null;
    let mixData = null;

    if (route.path === "stable-audio") {
       jobId = await submitStableAudioJob(context, replicate);
    } 
    else if (route.path === "elevenlabs-music") {
       // Synchronous API 
       try {
           audioResult = await generateElevenLabsMusic(context);
           // We return it as completed since we awaited the audio buffer directly
           return NextResponse.json({ 
                jobId: "elevenlabs-" + Date.now(), 
                status: "succeeded",
                route: route.path,
                audio: audioResult
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
       jobId = await submitAceStepJob(context, replicate);
       
       // Simultaneously get the TTS
       try {
           const ttsAudio = await generateElevenLabsTTS(context);
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
            jobId = await submitPunjabiAceStepJob(context, replicate);
        } else {
            jobId = await submitAceStepJob(context, replicate);
        }
    }

    return NextResponse.json({ 
        jobId, 
        route: route.path,
        mixData,
        status: "starting"
    });

  } catch (error: any) {
    console.error('Error starting generation:', error);
    return NextResponse.json({ error: error.message || 'Generation failed' }, { status: 500 });
  }
}
