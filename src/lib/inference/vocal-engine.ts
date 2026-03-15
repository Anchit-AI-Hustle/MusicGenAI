/**
 * VocalEngine: Dual-path routing for vocal synthesis.
 * Addresses Engineering Note 2 & 4: ACE-Step quality and Punjabi dual-path.
 */

import { CreativeContext } from "@/types/creative-context";
import { findVocalProfileByGenreAndLanguage, VOCAL_PROFILES } from "@/lib/musicData/vocals";
import { shouldRecommendHighQualityVocals } from "@/types/creative-context";
import { validateModelHash } from "./model-vault";

export interface VocalSynthesisResponse {
  audioUrl: string;
  provider: "replicate" | "elevenlabs";
  modelId: string;
  isDualPath: boolean;
}

export async function synthesizeVocals(
  lyrics: string,
  context: CreativeContext
): Promise<VocalSynthesisResponse> {
  const profile = findVocalProfileByGenreAndLanguage(
    context.genre,
    context.vocalLanguage,
    null // random gender if not specified
  );

  const useHQPath = context.useHighQualityVocals || shouldRecommendHighQualityVocals(context.vocalLanguage);

  if (useHQPath) {
    // PATH 1: ElevenLabs TTS (High Quality for South Asian/Limited languages)
    // This produces a raw vocal file that will be mixed with the instrumental later.
    return {
      audioUrl: "https://api.elevenlabs.io/v1/text-to-speech/voice-id", // Placeholder
      provider: "elevenlabs",
      modelId: profile.elevenLabsVoiceId,
      isDualPath: true
    };
  } else {
    // PATH 2: ACE-Step (Integrated, faster but varies in quality)
    const providerModelId = "lucataco/ace-step";
    const validatedVersion = await validateModelHash("ace-step-vocal");

    return {
      audioUrl: `https://replicate.com/${providerModelId}`,
      provider: "replicate",
      modelId: `${providerModelId}:${validatedVersion}`,
      isDualPath: false
    };
  }
}

/**
 * Returns a production status update for the UI during dual-path processing.
 */
export function getVocalRoutingStatus(context: CreativeContext): string {
  if (shouldRecommendHighQualityVocals(context.vocalLanguage)) {
    return `Optimizing for ${context.vocalLanguage} phonemes using ElevenLabs dual-path synthesis...`;
  }
  return `Synthesizing integrated ${context.genre} vocals using ACE-Step...`;
}
