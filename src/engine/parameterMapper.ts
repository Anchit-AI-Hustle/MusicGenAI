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
  const instrumentation = sanitizeList(audio.instrumentation, 'balanced instrumentation')
  const vocalLanguages = sanitizeList(input.vocal.languages, 'Instrumental').join(', ')
  const vocalEffects = sanitizeList(input.vocal.effects, 'none').join(', ')
  const artists = input.style_reference.filter(e => e.artist !== 'Unknown')
  const artistStr = artists.length > 0
    ? artists.map(a => `${a.artist} (${a.production_style || 'production style'})`).join(', ')
    : 'contemporary production aesthetic'
  const theme = input.lyrics.theme || 'open narrative'
  const musicPrompt = input.music_prompt || `${input.mood.label} ${input.genre_profile.primary} composition`
  const secondary = input.genre_profile.secondary
  const secondaryStr = secondary.length > 0 ? ` fused with ${secondary.slice(0, 2).join(' and ')}` : ''
  const genre = input.genre_profile.primary

  const mixingPalette: Record<string, string> = {
    edm: 'sub bass mono below 120Hz, sidechain compression 6dB on pads to kick, wide supersaw stereo field, limiter at -0.5dB TP, -10 LUFS integrated',
    classical: 'natural concert hall reverb (RT60 2.5s), Decca tree stereo imaging, no bus compression, dynamic range preserved (peak-to-RMS < 12dB), -18 LUFS integrated',
    'hip-hop': '808 sub fundamental 40-55Hz mono center, vocal at -3dB relative to bed, sidechained pads, glossy hi-hat presence at 12kHz, warm tape saturation, -12 LUFS integrated',
    pop: 'vocal-forward mix at -3dB to -6dB above bed, punchy kick with 3-5kHz click, stereo width 75%, master bus glue compression 2dB GR, -14 LUFS integrated',
    rock: 'guitar crunch occupying 1-4kHz, room mic blended 20%, bass guitar locked to kick, 2-bus compression 2-3dB GR, -12 LUFS integrated',
    metal: 'high-gain guitars panned L80/R80, triggered kick at 60Hz, bass drop-tuned following root, wall of sound density, -10 LUFS integrated',
    jazz: 'warm tape 15ips, intimate room 1.2s plate reverb, gentle compression 1.5:1, brushed drums with room spill, -16 LUFS integrated',
    rnb: 'smooth sub bass -8dB below kick, stacked vocal harmonies wide stereo, Wurlitzer/Rhodes with chorus, warm tape saturation, -14 LUFS integrated',
    ambient: 'algorithmic reverb 6s+ decay, slow attack pads 200ms+, stereo width 100%, no hard transients, soft tube saturation, -20 LUFS integrated',
    folk: 'ribbon mic warmth on acoustic guitar, intimate room IR, gentle 2-bus compression 1.5:1, natural upright bass resonance, -16 LUFS integrated',
    trap: '808 sub with pitch slides, trap hi-hat triplet rolls velocity-varied, clap layered with noise transient, dark wide pads, -10 LUFS integrated',
    house: '909-style four-on-the-floor kick, offbeat open hi-hat, warm Moog filter sweeps, detuned pad ±7 cents L/R, classic dub delay, -12 LUFS integrated',
  }
  const detailedMix = mixingPalette[genre] ?? `balanced mix, mono bass below 120Hz, stereo width 70%, master bus compression 2dB GR, -14 LUFS integrated`

  const vocalDesc = input.vocal.arrangement === 'none'
    ? 'Fully instrumental — no vocals. Lead melody carried by primary instrument with counter-melodies for harmonic interest.'
    : `${input.vocal.arrangement} ${input.vocal.style || 'mixed voice'} vocal in ${vocalLanguages} at intensity ${input.vocal.intensity}/10. Processing: ${vocalEffects}. Phrasing locked to ${audio.tempo_bpm} BPM groove with breath placement on beats 4 and 8.`

  const instrumentDetails = instrumentation.map((inst, i) => {
    const pos = i === 0 ? 'center' : i % 2 === 1 ? 'left' : 'right'
    return `${inst} (${pos})`
  }).join('; ')

  const sections = audio.structure.raw.split(/[-–→]/).map(s => s.trim()).filter(Boolean)
  const sectionArc = sections.map((s, i) => {
    const energy = Math.round(30 + (i / Math.max(1, sections.length - 1)) * 70)
    const isChorus = /chorus|drop|hook|climax/i.test(s)
    const isBridge = /bridge|break/i.test(s)
    const isIntro = /intro/i.test(s)
    const isOutro = /outro/i.test(s)
    const e = isChorus ? '100%' : isBridge ? '40%' : isIntro ? '30%' : isOutro ? '25%' : `${energy}%`
    return `${s} (${e} energy)`
  }).join(' → ')

  const delayMs = Math.round(60000 / audio.tempo_bpm)

  const prompt = [
    `"${input.track_name || 'Untitled'}" — ${input.mood.label} ${genre} track${secondaryStr}.`,
    musicPrompt !== `${input.mood.label} ${genre} composition` ? `Creative direction: ${musicPrompt}.` : '',
    `${audio.tempo_bpm} BPM, ${audio.rhythm_pattern}. Energy level: ${audio.energy}/10.`,
    `Arrangement: ${instrumentDetails}. Each element in a distinct frequency pocket and stereo position.`,
    `${vocalDesc}`,
    `Lyrical direction: ${theme}. Rhyme scheme: ABAB on verses, AABB on chorus, free on bridge.`,
    `Production and mix: ${detailedMix}. Sound design: ${audio.sound_design_style}.`,
    `Reference artists: ${artistStr}.`,
    `Dynamic arc: ${sectionArc}.`,
    `Mix targets: mono bass below 120Hz, reverb/delay tails timed to tempo (1/4 note = ${delayMs}ms), vocal-instrumental separation, defined drum transients at 3-5kHz, stereo width on pads and FX, master brickwall limiter at -1dB true peak.`,
    `Mood profile: valence ${input.mood.valence}/10, arousal ${input.mood.arousal}/10, tension ${input.mood.tension}/10.`,
    visual.enabled ? `Visual direction: ${visual.style ?? 'cinematic'}, ${visual.color_palette ?? 'genre-matched palette'}, ${visual.motion_style ?? 'beat-synced'}.` : '',
  ].filter(Boolean).join(' ')

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
