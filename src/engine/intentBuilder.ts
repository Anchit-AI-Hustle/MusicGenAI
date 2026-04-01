import { resolveConflicts } from './conflictResolver'
import { normalize } from './normalizer'
import { mapToParameters } from './parameterMapper'
import { RawUserInputSchema } from './schema'
import type { ConflictReport, GenerationIntent, NormalizedInput, RawUserInput } from './types'

function assembleIntent(resolved: NormalizedInput, parameters: ReturnType<typeof mapToParameters>): GenerationIntent {
  return {
    meta: {
      creation_mode: resolved.creation_mode,
      album_song_count: resolved.album_song_count,
      track_name: resolved.track_name,
      duration_seconds: resolved.duration_seconds,
    },
    mood: { ...resolved.mood },
    energy: parameters.energy,
    tempo_bpm: resolved.tempo_bpm,
    genre_profile: {
      primary: resolved.genre_profile.primary,
      secondary: [...resolved.genre_profile.secondary],
      instrumentation: [...resolved.genre_profile.instrumentation],
      rhythm_pattern: resolved.genre_profile.rhythm_pattern,
    },
    structure: {
      raw: resolved.song_structure.raw,
      segments: resolved.song_structure.segments.map((segment) => ({ ...segment })),
    },
    vocal: {
      arrangement: resolved.vocal.arrangement,
      style: resolved.vocal.style,
      style_vector: { ...resolved.vocal.style_vector },
      intensity: resolved.vocal.intensity,
      effects: [...resolved.vocal.effects],
      languages: [...resolved.vocal.languages],
    },
    lyrics: {
      theme: resolved.lyrics.theme,
      content: resolved.lyrics.content,
      sentiment: resolved.lyrics.sentiment ? { ...resolved.lyrics.sentiment } : null,
    },
    style_reference: resolved.style_reference.map((entry) => ({ ...entry })),
    audio_parameters: {
      mixing_style: parameters.mixing_style,
      sound_design_style: parameters.sound_design_style,
      instrumentation: [...parameters.instrumentation],
      rhythm_pattern: parameters.rhythm_pattern,
    },
    visual: {
      enabled: parameters.visual.enabled,
      style: parameters.visual.style,
      color_palette: parameters.visual.color_palette,
      motion_style: parameters.visual.motion_style,
      visual_direction: parameters.visual.visual_direction,
    },
    generation_prompt: parameters.generation_prompt,
  }
}

function collectWarnings(resolved: NormalizedInput, report: ConflictReport): string[] {
  const warnings = report.map((entry) => `Rule ${entry.rule} adjusted ${entry.field}: ${entry.reason}`)

  const defaults: string[] = []
  if (resolved.style_reference.some((entry) => entry.artist === 'Unknown')) {
    defaults.push('Artist inspiration was missing; default contemporary style reference was applied.')
  }
  if (resolved.creation_mode === 'album' && resolved.album_song_count === 8) {
    defaults.push('Album song count defaulted to 8.')
  }
  if (resolved.vocal.languages.length === 0 && resolved.vocal.arrangement !== 'none') {
    defaults.push('No vocal language provided; vocal language defaults may be required downstream.')
  }

  const tempoWarnings = report
    .filter((entry) => entry.rule === 'C1')
    .map((entry) => `Tempo adjusted for genre compatibility (${String(entry.original_value)} -> ${String(entry.resolved_value)}).`)

  const lyricWarnings = report
    .filter((entry) => entry.rule === 'C2')
    .map(() => 'Mood-lyrics sentiment mismatch detected; mood preserved and lyrics flagged for review.')

  return [...warnings, ...defaults, ...tempoWarnings, ...lyricWarnings]
}

/** Builds deterministic generation intent in strict ordered pipeline. */
export function buildGenerationIntent(raw: RawUserInput): {
  intent: GenerationIntent
  conflicts: ConflictReport
  warnings: string[]
} {
  const parseResult = RawUserInputSchema.safeParse(raw)
  if (!parseResult.success) {
    throw new Error(parseResult.error.message)
  }

  const normalized = normalize(parseResult.data)
  const { resolved, report } = resolveConflicts(normalized)
  const parameters = mapToParameters(resolved)
  const intent = assembleIntent(resolved, parameters)
  const warnings = collectWarnings(resolved, report)

  return { intent, conflicts: report, warnings }
}
