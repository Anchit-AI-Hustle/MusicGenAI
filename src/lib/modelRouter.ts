import Replicate from "replicate";
import { CreativeContext } from "@/types/creative-context";
import { MODELS, getLatestModelVersion } from "./modelVersions";
import { buildMinimaxPrompt, buildStableAudioPrompt } from "./promptBuilder";
import { formatLyricsForMinimax } from "./lyricsFormatter";

// Internal interface for the raw Replicate API response
interface ReplicateJob {
   id: string;
   status: string;
   error: string | null;
   output: any;
}

export async function submitAceStepJob(context: CreativeContext, replicate: Replicate): Promise<string> {
    const version = await getLatestModelVersion(MODELS.ACE_STEP, replicate);
    const prompt = buildMinimaxPrompt(context);
    const lyrics = formatLyricsForMinimax(context.lyrics, context);
    
    const input = {
        prompt: prompt,
        text: lyrics || undefined,
        // model-specific configurations can be mapped here
    };

    console.log(`[Model Router] Submitting ACE-Step job. Version: ${version.substring(0,8)}...`);
    const prediction = await replicate.predictions.create({
        version: version,
        input: input
    });

    return prediction.id;
}

export async function submitPunjabiAceStepJob(context: CreativeContext, replicate: Replicate): Promise<string> {
    if (!process.env.PUNJABI_ACE_STEP_MODEL_ID) {
        console.warn("PUNJABI_ACE_STEP_MODEL_ID not found, falling back to standard ACE-Step");
        return submitAceStepJob(context, replicate);
    }
    
    // Assuming the fine-tuned model takes the same inputs
    const prompt = buildMinimaxPrompt(context);
    const lyrics = formatLyricsForMinimax(context.lyrics, context);
    
    const input = {
        prompt: prompt,
        text: lyrics || undefined,
    };

    // Fine-tunes use the models.predictions.create endpoint
    // Format is owner/model-name
    const modelId = process.env.PUNJABI_ACE_STEP_MODEL_ID;
    
    console.log(`[Model Router] Submitting Punjabi Fine-tuned job to ${modelId}`);
    const prediction = await replicate.predictions.create({
        model: modelId as any, // Type cast to satisfy strict API typings for the model string
        input: input
    });

    return prediction.id;
}


export async function submitStableAudioJob(context: CreativeContext, replicate: Replicate): Promise<string> {
    const version = await getLatestModelVersion(MODELS.STABLE_AUDIO, replicate);
    const prompt = buildStableAudioPrompt(context);
    
    const input = {
        prompt: prompt,
        seconds_total: context.duration || 180,
    };

    console.log(`[Model Router] Submitting Stable Audio job. Version: ${version.substring(0,8)}...`);
    const prediction = await replicate.predictions.create({
        version: version,
        input: input
    });

    return prediction.id;
}

export async function checkJobStatus(jobId: string, replicate: Replicate): Promise<{ status: string, output: string | null, error: string | null }> {
    const prediction = await replicate.predictions.get(jobId);
    
    let audioUrl = null;
    if (prediction.status === "succeeded") {
       // Replicate outputs vary. Stable Audio is usually output.audio or output, Minimax is output
       if (typeof prediction.output === "string") {
           audioUrl = prediction.output;
       } else if (prediction.output && typeof prediction.output.audio === "string") {
           audioUrl = prediction.output.audio;
       } else if (Array.isArray(prediction.output) && prediction.output.length > 0) {
           audioUrl = prediction.output[0];
       }
    }
    
    return {
        status: prediction.status,
        output: audioUrl,
        error: prediction.error as string | null
    };
}
