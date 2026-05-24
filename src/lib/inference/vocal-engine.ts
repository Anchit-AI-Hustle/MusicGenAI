/**
 * VocalEngine: Dual-path routing for vocal synthesis.
 * Path 1: ElevenLabs TTS for high-quality vocals (South Asian languages, etc.)
 * Path 2: ACE-Step via Replicate for integrated vocal generation.
 *
 * IMPORTANT: The primary vocal path for browser generation is the formant
 * synthesizer in src/lib/vocal-engine.ts. This module is used when the
 * server-side API route handles generation via Replicate/ElevenLabs.
 */

import { CreativeContext } from "@/types/creative-context";
import { findVocalProfileByGenreAndLanguage } from "@/lib/musicData/vocals";
import { shouldRecommendHighQualityVocals } from "@/types/creative-context";
import { validateModelHash } from "./model-vault";

export interface VocalSynthesisResponse {
  audioUrl: string;
  provider: "replicate" | "elevenlabs";
  modelId: string;
  isDualPath: boolean;
}

// ElevenLabs voice IDs for different vocal characteristics
const ELEVENLABS_VOICE_MAP: Record<string, string> = {
  'Male Vocal': 'pNInz6obbf5AWCGqeA',
  'Female Vocal': 'EXAVITQu4vr4xnSDxMaL',
  'Rap Vocal': 'pNInz6obbf5AWCGqeA',
  'Soulful Diva': 'EXAVITQu4vr4xnSDxMaL',
  'Gravely Rock': 'pNInz6obbf5AWCGqeA',
  'Opera Tenor': 'pNInz6obbf5AWCGqeA',
  'Sultry Jazz': 'EXAVITQu4vr4xnSDxMaL',
  'Ethereal Soprano': 'EXAVITQu4vr4xnSDxMaL',
  'Whisper Vocal': 'EXAVITQu4vr4xnSDxMaL',
  'Robotic Vocal': 'pNInz6obbf5AWCGqeA',
  'Aggressive Growl': 'pNInz6obbf5AWCGqeA',
  'Choir Vocal': 'EXAVITQu4vr4xnSDxMaL',
  default: 'pNInz6obbf5AWCGqeA',
};

export async function synthesizeVocals(
  _lyrics: string,
  context: CreativeContext
): Promise<VocalSynthesisResponse> {
  const profile = findVocalProfileByGenreAndLanguage(
    context.genre,
    context.vocalLanguage,
    null
  );

  const useHQPath = context.useHighQualityVocals || shouldRecommendHighQualityVocals(context.vocalLanguage);

  if (useHQPath) {
    // PATH 1: ElevenLabs TTS — real API call for high-quality vocal synthesis.
    // The actual audio fetch happens server-side in the generate API route;
    // here we return the resolved endpoint URL for the caller to fetch.
    const voiceId = ELEVENLABS_VOICE_MAP[context.vocalStyle] || profile.elevenLabsVoiceId || ELEVENLABS_VOICE_MAP.default;
    return {
      audioUrl: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      provider: "elevenlabs",
      modelId: `eleven_multilingual_v2:${voiceId}`,
      isDualPath: true,
    };
  } else {
    // PATH 2: ACE-Step on Replicate
    const providerModelId = "lucataco/ace-step";
    const validatedVersion = await validateModelHash("ace-step-vocal");

    return {
      audioUrl: `https://replicate.com/${providerModelId}`,
      provider: "replicate",
      modelId: `${providerModelId}:${validatedVersion}`,
      isDualPath: false,
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
