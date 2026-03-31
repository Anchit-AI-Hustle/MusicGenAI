import { GENERATION_PROMPT_BOUNDS } from './CONSTANTS';
import { resolveConflicts } from './conflictResolver';
import { mapToParameters } from './parameterMapper';
import { RawUserInputSchema, GenerationIntentSchema, NormalizedInputSchema } from './schema';
import { normalize } from './normalizer';
import type {
  AudioParameters,
  ConflictReport,
  GenerationIntent,
  NormalizedInput,
  RawUserInput,
  VisualParameters,
} from './types';

function ensureWordBounds(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length > GENERATION_PROMPT_BOUNDS.MAX_WORDS) {
    return words.slice(0, GENERATION_PROMPT_BOUNDS.MAX_WORDS).join(' ');
  }
  if (words.length < GENERATION_PROMPT_BOUNDS.MIN_WORDS) {
    const filler = 'Keep transitions smooth, preserve tonal cohesion, prioritize expressive dynamics, and align every musical event with the established emotional narrative while maintaining clarity in vocal intelligibility and rhythmic detail.';
    return `${text.trim()} ${filler}`;
  }
  return text.trim();
}

function synthesizeGenerationPrompt(resolved: NormalizedInput): string {
  const styleLine = resolved.style_reference
    .map((ref) => `${ref.artist} (${ref.production_style})`)
    .slice(0, 4)
    .join(', ');
  const structure = resolved.structure_segments.map((segment) => segment.name).join(' -> ');
  const instruments = resolved.genre_profile.instrumentation.slice(0, 8).join(', ');
  const vocalLine = resolved.vocal_arrangement === 'none'
    ? 'Instrumental arrangement with no lead vocals.'
    : `Vocal arrangement: ${resolved.vocal_arrangement}, style ${resolved.vocal_style}, intensity ${resolved.vocal_intensity}/10, effects: ${resolved.vocal_effects.join(', ') || 'none'}, languages: ${resolved.vocal_language.join(', ')}.`;

  const prompt = `Create a ${resolved.mood.label} ${resolved.genre_profile.primary} composition at ${resolved.tempo_bpm} BPM with duration ${resolved.duration_seconds} seconds. Use instrumentation including ${instruments}. Follow structure ${structure}. Keep genre constraints strict while integrating influences from ${styleLine || 'modern reference production'}. ${vocalLine} Lyrics theme is ${resolved.lyric_theme}${resolved.lyrics ? ` and use provided lyrics as semantic anchor: ${resolved.lyrics}` : '.'} Maintain mood vector valence ${resolved.mood.valence}, arousal ${resolved.mood.arousal}, tension ${resolved.mood.tension}. ${resolved.generate_video ? `Visual direction should follow ${resolved.video_style} style and remain synchronized with rhythmic dynamics.` : 'No video generation required.'} Respect this user brief as highest priority: ${resolved.music_prompt}.`;

  return ensureWordBounds(prompt);
}

function collectWarnings(resolved: NormalizedInput): string[] {
  const warnings: string[] = [];
  if (!resolved.lyrics && resolved.vocal_arrangement !== 'none') {
    warnings.push('No lyrics provided; system will rely on lyric_theme for vocal content guidance.');
  }
  if (resolved.generate_video && !resolved.video_style) {
    warnings.push('Video enabled without explicit style; fallback style was applied.');
  }
  if (resolved.genre_profile.instrumentation.length === 0) {
    warnings.push('Instrumentation list was empty; fallback instrumentation was inferred.');
  }
  return warnings;
}

function assembleIntent(
  resolved: NormalizedInput,
  parameters: AudioParameters & VisualParameters,
): GenerationIntent {
  const intent: GenerationIntent = {
    meta: {
      creation_mode: resolved.creation_mode,
      album_song_count: resolved.album_song_count,
      track_name: resolved.track_name,
      duration_seconds: resolved.duration_seconds,
    },
    mood: {
      label: resolved.mood.label,
      valence: resolved.mood.valence,
      arousal: resolved.mood.arousal,
      tension: resolved.mood.tension,
    },
    energy: parameters.energy,
    tempo_bpm: parameters.tempo_bpm,
    genre_profile: {
      primary: resolved.genre_profile.primary,
      secondary: resolved.genre_profile.secondary,
      instrumentation: parameters.instrumentation,
      rhythm_pattern: parameters.rhythm_pattern,
    },
    structure: {
      raw: resolved.song_structure,
      segments: resolved.structure_segments,
    },
    vocal: {
      arrangement: resolved.vocal_arrangement,
      style: resolved.vocal_style,
      style_vector: resolved.vocal_style_vector,
      intensity: resolved.vocal_intensity,
      effects: resolved.vocal_effects,
      languages: resolved.vocal_language,
    },
    lyrics: {
      theme: resolved.lyric_theme,
      content: resolved.lyrics,
      sentiment: resolved.lyrics_profile.sentiment,
    },
    style_reference: resolved.style_reference,
    audio_parameters: {
      mixing_style: parameters.mixing_style,
      sound_design_style: parameters.sound_design_style,
      instrumentation: parameters.instrumentation,
      rhythm_pattern: parameters.rhythm_pattern,
    },
    visual: {
      enabled: parameters.enabled,
      style: parameters.style,
      color_palette: parameters.color_palette,
      motion_style: parameters.motion_style,
      visual_direction: parameters.visual_direction,
    },
    generation_prompt: synthesizeGenerationPrompt(resolved),
  };

  return intent;
}

/**
 * Builds the final deterministic generation intent from raw user input.
 */
export function buildGenerationIntent(raw: RawUserInput): {
  intent: GenerationIntent;
  conflicts: ConflictReport;
  warnings: string[];
} {
  const validatedRaw = RawUserInputSchema.parse(raw);
  const normalized = normalize(validatedRaw);
  const checkedNormalized = NormalizedInputSchema.parse(normalized);
  const { resolved, report } = resolveConflicts(checkedNormalized);
  const parameters = mapToParameters(resolved);
  const intent = assembleIntent(resolved, parameters);
  const checkedIntent = GenerationIntentSchema.parse(intent);
  const warnings = collectWarnings(resolved);

  return {
    intent: checkedIntent,
    conflicts: report,
    warnings,
  };
}
