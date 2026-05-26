import { CreativeContext, shouldUseElevenLabsMusic, shouldUseTTSMixPath, shouldRecommendHighQualityVocals } from "@/types/creative-context";
import { ELEVENLABS_API_KEY } from "./env";

export type RoutingPath = "elevenlabs-music" | "tts-mix" | "ace-step" | "stable-audio";

export interface QualityRouteResult {
  path: RoutingPath;
  reason: string;
  isDegraded: boolean;
}

export function determineGenerationPath(context: CreativeContext): QualityRouteResult {
  const hasElevenLabsKey = !!ELEVENLABS_API_KEY;

  if (context.instrumentalOnly) {
    if (context.useHighQualityVocals) { // if the user requested HQ but it's instrumental only, Stable Audio is better
        return { path: "stable-audio", reason: "Instrumental requested. Stable Audio preferred.", isDegraded: false };
    }
    // Minimax is acceptable for instrumental but SA is sometimes cleaner. Defaulting to Minimax.
    return { path: "ace-step", reason: "Instrumental requested. Minimax default.", isDegraded: false };
  }

  if (hasElevenLabsKey && context.useHighQualityVocals) {
    if (shouldUseElevenLabsMusic(context.vocalLanguage)) {
      return { path: "elevenlabs-music", reason: `ElevenLabs Music natively supports ${context.vocalLanguage}.`, isDegraded: false };
    }
    
    if (shouldUseTTSMixPath(context.vocalLanguage)) {
      return { path: "tts-mix", reason: `${context.vocalLanguage} requires TTS + Instrumental mix for highest quality.`, isDegraded: false };
    }
  }

  // Fallback to ACE-Step (Minimax)
  const isDegraded = context.useHighQualityVocals && !hasElevenLabsKey;
  let reason = "Using default ACE-Step generation.";
  if (isDegraded) reason = "ElevenLabs API key missing. Falling back to standard ACE-Step.";
  if (context.useHighQualityVocals && hasElevenLabsKey && !shouldRecommendHighQualityVocals(context.vocalLanguage)) {
      reason = `${context.vocalLanguage} unsupported by HQ vocals. Using ACE-Step.`;
  }

  return { path: "ace-step", reason, isDegraded };
}
