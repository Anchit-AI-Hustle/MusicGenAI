/**
 * Prompt Assembler
 *
 * Reads a CompositionPlan and assembles per-provider prompts.
 * Backed by /knowledge-base/data/PROMPT_TEMPLATES.json plus the
 * MUSIC_THEORY_ENGINE / ADVANCED_PROMPTING_GUIDE rules.
 *
 * This is the engine that finally replaces the flat 1-sentence prompts in
 * src/lib/promptBuilder.ts. The legacy promptBuilder is kept as a thin
 * wrapper for backwards compatibility (see promptBuilder.ts changes).
 */

import templates from "../../../knowledge-base/data/PROMPT_TEMPLATES.json";
import { CompositionPlan } from "./types";
import { getGenre, getVisualStyle } from "./genre-knowledge";

export type Provider = "stable-audio" | "ace-step" | "elevenlabs-music" | "minimax";

export function assembleAudioPrompt(plan: CompositionPlan, provider: Provider): string {
  switch (provider) {
    case "stable-audio":     return buildStableAudio(plan);
    case "ace-step":         return buildAceStep(plan);
    case "elevenlabs-music": return buildElevenLabs(plan);
    case "minimax":          return buildMinimax(plan);
  }
}

export function assembleVideoPrompt(plan: CompositionPlan): string {
  const aesthetic = getVisualStyle(plan.resolved.visual.aestheticId);
  if (!aesthetic) return `${plan.resolved.genreId} music video, cinematic, high detail`;

  const climax = plan.resolved.emotionalArc.find(e => e.intensity >= 0.9) ?? plan.resolved.emotionalArc[0];

  return [
    aesthetic.ai_image_keywords,
    `emotional arc: ${climax?.primaryEmotion ?? "neutral"}`,
    `dominant color ${aesthetic.palette_dominant}, support ${aesthetic.palette_support}, accent ${aesthetic.palette_accent}`,
    `${aesthetic.lighting} lighting, ${aesthetic.camera_archetype} camera, ${aesthetic.lens_feel} lens`,
    aesthetic.grain_intensity > 0.3 ? `${aesthetic.texture_overlay} texture, film grain` : "clean texture",
    `${plan.resolved.bpm} BPM, beat-synchronized cuts`,
    `delivery: ${plan.resolved.visual.deliveryTarget}, ${plan.resolved.visual.resolution.width}x${plan.resolved.visual.resolution.height} @ ${plan.resolved.visual.fps}fps`,
    "cinematic, high detail, professional",
  ].join(", ");
}

export function assembleLyricsPrompt(plan: CompositionPlan): string {
  if (!plan.resolved.vocal.hasVocals) return "";

  const tpl = (templates as any).templates["lyrics-prompt"];
  const banned = ((templates as any).banned_phrases_default.list as string[]).join(", ");
  const syllablesTable = (templates as any).syllable_count_per_bar_by_bpm as Record<string, number>;

  const closestBpm = Object.keys(syllablesTable)
    .map(k => ({ k, n: parseInt(k, 10) }))
    .reduce((best, cur) =>
      Math.abs(cur.n - plan.resolved.bpm) < Math.abs(best.n - plan.resolved.bpm) ? cur : best
    );
  const syllables = syllablesTable[closestBpm.k];

  const moodArc = plan.resolved.emotionalArc.map(e => `${e.sectionName}: ${e.primaryEmotion}`).join(" → ");

  return tpl.scaffold
    .replace("{{genre}}", getGenre(plan.resolved.genreId)?.label ?? plan.resolved.genreId)
    .replace("{{theme}}", plan.brief.occasion ?? plan.brief.mood ?? "personal narrative")
    .replace("{{language}}", plan.resolved.vocal.language ?? "English")
    .replace("{{mood_arc}}", moodArc)
    .replace("{{structure}}", plan.resolved.sections.map(s => s.name).join(" → "))
    .replace("{{bpm}}", String(plan.resolved.bpm))
    .replace("{{syllables_per_bar}}", String(syllables))
    .replace("{{rhyme_scheme}}", "ABAB for verse, AABB for chorus, free for bridge")
    .replace("{{reference_artists}}", (plan.resolved.references ?? []).slice(0, 3).join(", ") || "n/a")
    .replace("{{banned_phrases_csv}}", banned);
}

// ------------------------------------------------------------------
// Provider-specific builders

function buildStableAudio(plan: CompositionPlan): string {
  const g = getGenre(plan.resolved.genreId);
  if (!g) return `${plan.resolved.genreId}, ${plan.resolved.bpm} BPM, high quality`;

  const parts = [
    g.label,
    `${plan.resolved.bpm} BPM`,
    `${plan.resolved.key} ${humanMode(plan.resolved.mode)}`,
    g.groove_signature,
    (g.instrumentation_layers ?? []).slice(0, 5).join(", "),
    (g.production_traits ?? []).slice(0, 3).join(", "),
    plan.resolved.references.length > 0 ? `style of ${plan.resolved.references.slice(0, 2).join(" and ")}` : "",
    `stereo width ${plan.resolved.mixTargets.stereoWidthPct}%, mono lows below 120 Hz`,
    `${plan.resolved.mixTargets.lufsIntegrated} LUFS integrated`,
    "high quality, 24-bit lossless feel",
  ].filter(Boolean);

  let prompt = parts.join(", ");
  if (g.anti_keywords?.length) prompt += `. Do NOT: ${g.anti_keywords.join(", ")}.`;
  return prompt.slice(0, 510);
}

function buildAceStep(plan: CompositionPlan): string {
  const g = getGenre(plan.resolved.genreId);
  const lyrics = plan.prompts.lyrics ?? "";

  const description = [
    `${g?.label ?? plan.resolved.genreId} song.`,
    g?.production_traits?.slice(0, 3).join("; "),
    plan.resolved.references.length
      ? `Influenced by: ${plan.resolved.references.join("; ")}.`
      : "",
  ].filter(Boolean).join(" ");

  const specs = `${plan.resolved.bpm} BPM in ${plan.resolved.key} ${humanMode(plan.resolved.mode)}, ${plan.resolved.timeSignature}.`;

  const vocalDirection = plan.resolved.vocal.hasVocals
    ? `${vocalRegisterLabel(plan.resolved.vocal.register)} ${plan.resolved.vocal.language ?? "English"} ${plan.resolved.vocal.style ?? "melodic"} vocal. ${(plan.resolved.vocal.processing ?? []).join(", ")}.`
    : "Instrumental only — no vocals.";

  const lyricsBlock = plan.resolved.vocal.hasVocals && lyrics
    ? `\n${lyrics}`
    : "";

  const antis = g?.anti_keywords?.length
    ? `\nDo NOT: ${g.anti_keywords.join(", ")}.`
    : "";

  return [description, specs, vocalDirection + lyricsBlock + antis].join("\n");
}

function buildElevenLabs(plan: CompositionPlan): string {
  const g = getGenre(plan.resolved.genreId);
  const summary = `${g?.label ?? plan.resolved.genreId} song with ${plan.brief.mood ?? "emotional"} mood`;
  const refs = plan.resolved.references.length
    ? ` in the style of ${plan.resolved.references.slice(0, 2).join(" and ")}`
    : "";
  const vocal = plan.resolved.vocal.hasVocals
    ? `${plan.resolved.vocal.language ?? "English"} ${plan.resolved.vocal.style ?? "melodic"} vocals`
    : "instrumental — no vocals";
  const traits = (g?.production_traits ?? []).slice(0, 3).join(", ");
  return [
    `${summary}${refs}`,
    `${plan.resolved.bpm} BPM`,
    vocal,
    traits,
    `mix at ${plan.resolved.mixTargets.lufsIntegrated} LUFS, mono bass below 120 Hz`,
  ].filter(Boolean).join(", ");
}

function buildMinimax(plan: CompositionPlan): string {
  const g = getGenre(plan.resolved.genreId);
  const sections = plan.resolved.sections
    .map(s => `${s.name} (${s.bars}b, energy ${s.energy.toFixed(1)})`)
    .join(" → ");
  const arc = plan.resolved.emotionalArc.map(a => `${a.sectionName}: ${a.primaryEmotion}`).join(" / ");

  return [
    "[MASTER MUSIC GEN BLUEPRINT]",
    `IDENTITY: ${plan.brief.mood} ${g?.label ?? plan.resolved.genreId} track.`,
    `SPECS: BPM ${plan.resolved.bpm}; Key ${plan.resolved.key} ${humanMode(plan.resolved.mode)}; Time ${plan.resolved.timeSignature}; Duration ${plan.brief.durationSeconds}s.`,
    `STRUCTURE: ${sections}`,
    `INSTRUMENTATION: ${(g?.instrumentation_layers ?? []).join("; ")}.`,
    `GROOVE: ${g?.groove_signature ?? "natural pocket"}.`,
    plan.resolved.vocal.hasVocals
      ? `VOCALS: ${plan.resolved.vocal.style} in ${plan.resolved.vocal.language}; processing ${(plan.resolved.vocal.processing ?? []).join(", ")}; harmony stack ${plan.resolved.vocal.harmonyStackVoices ?? 0}.`
      : "VOCALS: instrumental, no vocals.",
    plan.resolved.vocal.hasVocals && plan.prompts.lyrics
      ? `LYRICS: provided below.`
      : `LYRICS: instrumental.`,
    `INSPIRATION: ${plan.resolved.references.join("; ") || "—"}`,
    `PRODUCTION: ${(g?.production_traits ?? []).join("; ")}.`,
    `MIX TARGET: ${plan.resolved.mixTargets.lufsIntegrated} LUFS, true peak ${plan.resolved.mixTargets.truePeakDb} dBTP, stereo width ${plan.resolved.mixTargets.stereoWidthPct}%, mono below 120 Hz.`,
    `CHORDS: ${plan.resolved.progressionRomanNumerals.join(" - ")} (${plan.resolved.progressionVoicingExample.join(" ")}).`,
    `EMOTIONAL ARC: ${arc}`,
    g?.anti_keywords?.length ? `CONSTRAINTS: do NOT ${g.anti_keywords.join(", ")}.` : "",
    plan.prompts.lyrics ? `\nLYRICS:\n${plan.prompts.lyrics}` : "",
  ].filter(Boolean).join("\n");
}

// ------------------------------------------------------------------
function humanMode(mode: string): string {
  const map: Record<string, string> = {
    "major": "major",
    "natural-minor": "natural minor",
    "harmonic-minor": "harmonic minor",
    "melodic-minor": "melodic minor",
    "dorian": "Dorian",
    "phrygian": "Phrygian",
    "phrygian-dominant": "Phrygian dominant",
    "lydian": "Lydian",
    "mixolydian": "Mixolydian",
    "locrian": "Locrian",
    "pentatonic-major": "major pentatonic",
    "pentatonic-minor": "minor pentatonic",
    "blues": "blues scale",
    "raga": "raga",
    "maqam": "maqam",
    "drone": "drone",
  };
  return map[mode] ?? mode;
}

function vocalRegisterLabel(r: string | undefined): string {
  switch (r) {
    case "low": return "low-register";
    case "mid-low": return "mid-low register";
    case "mid": return "mid-register";
    case "mid-high": return "mid-high register";
    case "high": return "high register";
    case "falsetto": return "falsetto";
    default: return "mid-register";
  }
}
