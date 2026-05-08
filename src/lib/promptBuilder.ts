import { CreativeContext } from "@/types/creative-context";
import { findGenreByName } from "./musicData/genres";
import {
  buildCompositionPlan,
  assembleAudioPrompt,
  assembleLyricsPrompt,
  Provider,
} from "./intelligence";

/**
 * Promptbuilder is now a thin wrapper over the Music Intelligence Engine.
 * Backwards-compatible: every legacy export still returns a prompt string,
 * but those prompts are now music-direction-grade specifications produced
 * from the unified knowledge base. See src/lib/intelligence/* and
 * /knowledge-base/ for the source of truth.
 */
function planFromContext(context: CreativeContext, provider?: Provider) {
  const tempoNum = parseTempo(context.tempo);
  const plan = buildCompositionPlan({
    mood: context.mood ?? "neutral",
    genre: context.genre,
    audience: (context as any).audience,
    language: context.vocalLanguage,
    occasion: context.songDescription,
    references: context.artistInspiration ? [context.artistInspiration] : undefined,
    durationSeconds: context.duration ?? 180,
    instrumentalOnly: !!context.instrumentalOnly,
    seed: (context as any).variationSeed,
  });
  if (tempoNum) plan.resolved.bpm = tempoNum;
  if (!plan.brief.instrumentalOnly) {
    plan.prompts.lyrics = assembleLyricsPrompt(plan);
  }
  if (provider) plan.prompts.audio = assembleAudioPrompt(plan, provider);
  return plan;
}

function parseTempo(t: unknown): number | null {
  if (typeof t === "number") return t;
  if (typeof t === "string") {
    const m = t.match(/\d+/);
    if (m) return parseInt(m[0], 10);
  }
  return null;
}

export function buildMinimaxPrompt(context: CreativeContext): string {
  return assembleAudioPrompt(planFromContext(context), "minimax");
}

export function buildStableAudioPrompt(context: CreativeContext): string {
  return assembleAudioPrompt(planFromContext(context), "stable-audio");
}

export function buildElevenLabsTTSPrompt(context: CreativeContext): string {
  // TTS only needs voice style — keep this lightweight.
  return [
    context.vocalLanguage ?? "English",
    context.vocalStyle ?? "natural",
    context.mood ?? "neutral",
  ].join(" ");
}

export function buildElevenLabsMusicPrompt(context: CreativeContext): string {
  // Fall back to legacy hint when the genre exists in the legacy database.
  const legacy = findGenreByName(context.genre);
  if (legacy?.elevenLabsStyleHint) {
    return assembleAudioPrompt(planFromContext(context), "elevenlabs-music");
  }
  return assembleAudioPrompt(planFromContext(context), "elevenlabs-music");
}

export function buildMasterPrompt(context: CreativeContext): string {
  return assembleAudioPrompt(planFromContext(context), "minimax");
}
