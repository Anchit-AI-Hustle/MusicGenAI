import {
  ENERGY_FROM_TEMPO,
  GENERATION_PROMPT_WORD_RANGE,
  MAX_INSTRUMENTATION_COUNT,
} from './constants'
import type { AudioParameters, NormalizedInput, VisualProfile } from './types'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function tempoEnergy(tempo: number): number {
  const mapped = ENERGY_FROM_TEMPO.find((entry) => tempo >= entry.range[0] && tempo <= entry.range[1])
  return mapped?.energy ?? 6
}

function deriveMixingStyle(input: NormalizedInput): string {
  const genre = input.genre_profile.primary
  const artistProduction = input.style_reference[0]?.production_style

  const base: Record<string, string> = {
    edm: 'loud master, heavy sidechain compression, wide stereo',
    classical: 'dynamic range preserved, concert hall reverb, minimal limiting',
    'hip-hop': '808 sub emphasis, punchy mid, vocal clarity, sidechained hi-hats',
    pop: 'bright top end, polished limiting, vocal-forward, punchy kick',
    rock: 'midrange crunch, room ambience, balanced compression',
    metal: 'saturated guitars, tight low-end, wall of sound',
    jazz: 'light compression, warm EQ, natural room sound',
    rnb: 'warm low-end, smooth mid, reverb-heavy vocals',
    ambient: 'wide reverb, gentle limiting, deep stereo field',
    folk: 'warm acoustic, natural reverb, minimal processing',
  }

  const selected = base[genre] ?? 'balanced, broadcast master'
  if (!artistProduction) return selected
  return `${selected}; infused with ${artistProduction}`
}

function deriveSoundDesignStyle(input: NormalizedInput): string {
  const moodLabel = input.mood.label.toLowerCase()
  const genre = input.genre_profile.primary

  if (input.mood.tension >= 7 && moodLabel === 'dark') return 'dissonant pads, harsh textures, minor key stabs'
  if (input.mood.tension <= 3 && moodLabel === 'chill') return 'warm textures, soft attack, rounded transients'
  if (input.mood.arousal >= 7 && genre === 'edm') return 'euphoric risers, sub drops, white noise sweeps'
  if (input.mood.arousal >= 7 && genre === 'metal') return 'distortion saturation, blast noise, brutal transients'
  if (input.mood.arousal <= 4 && genre === 'classical') return 'room resonance, clean dynamics, instrument separation'
  if (moodLabel === 'romantic') return 'lush reverb, smooth saturation, warm harmonics'
  return 'clean transients, moderate reverb, balanced harmonics'
}

function deriveColorPalette(input: NormalizedInput): string {
  const { valence, arousal, tension } = input.mood

  if (tension > 7) return 'high contrast overlay, deep shadows, minimal hue'
  if (valence > 7 && arousal > 7) return 'saturated warm, neon accents, high brightness'
  if (valence < 4 && arousal > 7) return 'desaturated red, deep contrast, sharp shadows'
  if (valence > 7 && arousal < 4) return 'pastel warm, soft gradients, golden tones'
  if (valence < 4 && arousal < 4) return 'cool grey, muted blue, low contrast, dim tones'
  return 'balanced neutral with accent color from genre'
}

function deriveMotionStyle(energy: number): string {
  if (energy <= 3) return 'slow ambient drift, long dissolves, parallax layers'
  if (energy <= 6) return 'rhythmic cuts synchronized to beat, moderate pan, steady camera'
  if (energy <= 9) return 'fast cuts, strobe on transients, handheld kinetic energy'
  return 'chaotic reactive motion, every beat triggers visual event, full strobe'
}

function eraTexture(era: string): string {
  if (era.includes('1970')) return 'vintage 1970s film grain'
  if (era.includes('1980')) return 'VHS grain overlay'
  if (era.includes('1990')) return 'lo-fi aesthetic'
  if (era.includes('2000')) return 'clean digital texture'
  if (era.includes('2010')) return 'modern cinematic finish'
  return 'ultra-HD hyper-real texture'
}

function deriveVisualDirection(style: string | null, era: string): string | null {
  if (!style) return null
  return `${style} with ${eraTexture(era)} and high contrast shadows`
}

function sanitizeList(items: string[], fallback: string): string[] {
  const cleaned = items.map((item) => item.trim()).filter(Boolean)
  return cleaned.length > 0 ? cleaned : [fallback]
}

function clampPromptLength(prompt: string): string {
  const words = prompt.trim().split(/\s+/).filter(Boolean)
  if (words.length > GENERATION_PROMPT_WORD_RANGE.MAX) {
    return words.slice(0, GENERATION_PROMPT_WORD_RANGE.MAX).join(' ')
  }
  if (words.length >= GENERATION_PROMPT_WORD_RANGE.MIN) {
    return words.join(' ')
  }

  const filler = 'Keep sonic continuity tight, preserve emotional intent in every section, and ensure the final render feels cohesive, polished, and production-ready from intro to outro.'
  return `${words.join(' ')} ${filler}`.trim().split(/\s+/).slice(0, GENERATION_PROMPT_WORD_RANGE.MAX).join(' ')
}

function buildGenerationPrompt(input: NormalizedInput, audio: AudioParameters, visual: VisualProfile): string {
  const instrumentation = sanitizeList(audio.instrumentation, 'balanced instrumentation').join(', ')
  const vocalLanguages = sanitizeList(input.vocal.languages, 'Instrumental').join(', ')
  const vocalEffects = sanitizeList(input.vocal.effects, 'none').join(', ')
  const artists = sanitizeList(input.style_reference.map((entry) => entry.artist), 'Unknown reference').join(', ')
  const theme = input.lyrics.theme || 'open narrative'
  const musicPrompt = input.music_prompt || `${input.mood.label} ${input.genre_profile.primary} composition`

  const prompt = `${input.track_name || 'Untitled'} — ${input.mood.label} ${input.genre_profile.primary} track. ${musicPrompt}. Instrumentation: ${instrumentation}. Structure: ${audio.structure.raw}. Tempo: ${audio.tempo_bpm} BPM. Vocal: ${input.vocal.arrangement} ${input.vocal.style || 'mixed voice'} in ${vocalLanguages}, intensity ${input.vocal.intensity}/10, effects: ${vocalEffects}. Mood: valence ${input.mood.valence}/10, arousal ${input.mood.arousal}/10, tension ${input.mood.tension}/10. Style references: ${artists}. Mixing: ${audio.mixing_style}. Theme: ${theme}. Visual: ${visual.style ?? 'none'} ${visual.visual_direction ?? ''}.`

  return clampPromptLength(prompt)
}

export type MappedParameters = AudioParameters & { visual: VisualProfile; generation_prompt: string }

/** Maps normalized input to deterministic downstream audio + visual parameters. */
export function mapToParameters(resolved: NormalizedInput): MappedParameters {
  const tEnergy = tempoEnergy(resolved.tempo_bpm)
  const moodEnergy = resolved.mood.arousal
  const vocalEnergy = resolved.vocal.intensity

  const energy = clamp(Math.round((tEnergy * 0.4) + (moodEnergy * 0.4) + (vocalEnergy * 0.2)), 1, 10)

  const instrumentation = [...new Set([
    ...resolved.genre_profile.instrumentation,
    ...resolved.style_reference.flatMap((entry) => entry.production_style.includes('orchestral') ? ['orchestral strings'] : []),
    ...resolved.style_reference.flatMap((entry) => entry.production_style.includes('synth') ? ['synth layers'] : []),
  ])].slice(0, MAX_INSTRUMENTATION_COUNT)

  const audio: AudioParameters = {
    energy,
    tempo_bpm: resolved.tempo_bpm,
    rhythm_pattern: resolved.genre_profile.rhythm_pattern,
    structure: {
      raw: resolved.song_structure.raw,
      segments: resolved.song_structure.segments.map((segment) => ({ ...segment })),
    },
    instrumentation,
    mixing_style: deriveMixingStyle(resolved),
    sound_design_style: deriveSoundDesignStyle(resolved),
  }

  const visual: VisualProfile = {
    enabled: resolved.generate_video,
    style: resolved.generate_video ? resolved.video_style : null,
    color_palette: resolved.generate_video ? deriveColorPalette(resolved) : null,
    motion_style: resolved.generate_video ? deriveMotionStyle(energy) : null,
    visual_direction: resolved.generate_video
      ? deriveVisualDirection(resolved.video_style, resolved.style_reference[0]?.era ?? '2020s')
      : null,
  }

  const generationPrompt = buildGenerationPrompt(resolved, audio, visual)

  return {
    ...audio,
    visual,
    generation_prompt: generationPrompt,
  }
}
