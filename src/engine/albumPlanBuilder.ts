import { ALBUM_MIN_TEMPO_SPREAD, CANONICAL_MOODS, TEMPO_RANGES } from './constants'
import { moodToVector, parseSongStructure } from './normalizer'
import type { GenerationIntent } from './types'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function safeTrackName(baseName: string, index: number): string {
  const cleaned = baseName.trim()
  if (!cleaned || cleaned.toLowerCase() === 'untitled') {
    return `Track ${index + 1}`
  }
  return `${cleaned} (Part ${index + 1})`
}

function energyArc(count: number): number[] {
  const arc = new Array<number>(count).fill(6)

  if (count >= 1) arc[0] = 9
  if (count >= 2) arc[1] = 8
  if (count >= 3) arc[2] = 7

  for (let i = 3; i < count - 2; i += 1) {
    arc[i] = i % 2 === 0 ? 4 : 6
  }

  if (count >= 4) {
    const middle = Math.floor(count / 2)
    arc[middle] = Math.min(arc[middle], 3)
  }

  if (count >= 2) arc[count - 2] = 10
  if (count >= 1) arc[count - 1] = 3

  return arc.map((value) => clamp(value, 1, 10))
}

function moodArc(baseMood: string, count: number): string[] {
  const high = ['epic', 'euphoric', 'angry', 'happy']
  const mid = ['romantic', 'dark', 'melancholic', 'tense']
  const low = ['chill', 'melancholic']

  const moods: string[] = []

  for (let i = 0; i < count; i += 1) {
    let bucket = baseMood
    if (i === 0) {
      bucket = high[(baseMood.length + i) % high.length]
    } else if (i === count - 1) {
      bucket = low[(baseMood.length + i) % low.length]
    } else if (i === count - 2) {
      bucket = high[(baseMood.length + i + 1) % high.length]
    } else {
      bucket = mid[(baseMood.length + i) % mid.length]
    }

    if (moods[i - 1] === bucket) {
      const fallback = CANONICAL_MOODS.find((mood) => mood !== bucket)
      moods.push(fallback ?? bucket)
    } else {
      moods.push(bucket)
    }
  }

  return moods
}

function tempoArc(baseTempo: number, count: number): number[] {
  const offsets = [0, 8, -6, 12, -10, 15, -14, 20, -18, 22]
  const tempos = new Array<number>(count)

  for (let i = 0; i < count; i += 1) {
    const offset = offsets[i % offsets.length] + Math.floor(i / offsets.length) * 3
    tempos[i] = clamp(baseTempo + offset, TEMPO_RANGES.MIN, TEMPO_RANGES.MAX)
  }

  const spread = Math.max(...tempos) - Math.min(...tempos)
  if (spread < ALBUM_MIN_TEMPO_SPREAD && count > 1) {
    tempos[count - 2] = clamp(tempos[count - 2] + (ALBUM_MIN_TEMPO_SPREAD - spread), TEMPO_RANGES.MIN, TEMPO_RANGES.MAX)
  }

  return tempos
}

function structureForIndex(primaryGenre: string, index: number): string {
  const byGenre: Record<string, string[]> = {
    pop: [
      'Intro-Verse-Chorus-Verse-Chorus-Bridge-Chorus-Outro',
      'Intro-Verse-Pre-Chorus-Chorus-Verse-Chorus-Bridge-Chorus-Outro',
      'Intro-Verse-Chorus-Bridge-Chorus-Outro',
    ],
    'hip-hop': [
      'Intro-Verse-Hook-Verse-Hook-Bridge-Hook-Outro',
      'Intro-Verse-Hook-Verse-Hook-Outro',
      'Intro-Verse-Hook-Bridge-Hook-Outro',
    ],
    edm: [
      'Intro-Build-Drop-Break-Build-Drop-Outro',
      'Intro-Build-Drop-Break-Drop-Outro',
      'Intro-Build-Drop-Break-Build-Drop-Break-Outro',
    ],
    classical: [
      'Intro-Theme-Development-Recapitulation-Coda',
      'Intro-Theme-Development-Theme-Recapitulation-Coda',
      'Intro-Theme-Development-Bridge-Recapitulation-Coda',
    ],
  }

  const fallback = [
    'Intro-Verse-Chorus-Verse-Chorus-Bridge-Chorus-Outro',
    'Intro-Verse-Chorus-Bridge-Chorus-Outro',
    'Intro-Verse-Pre-Chorus-Chorus-Bridge-Chorus-Outro',
  ]

  const options = byGenre[primaryGenre] ?? fallback
  return options[index % options.length]
}

/** Builds album track intents with deterministic arc and variation constraints. */
export function buildAlbumPlan(baseIntent: GenerationIntent, count: number): GenerationIntent[] {
  const safeCount = Math.max(1, Math.floor(count))
  const energies = energyArc(safeCount)
  const moods = moodArc(baseIntent.mood.label, safeCount)
  const tempos = tempoArc(baseIntent.tempo_bpm, safeCount)

  return new Array<GenerationIntent>(safeCount).fill(null).map((_, index) => {
    const moodLabel = moods[index]
    const mood = moodToVector(moodLabel)
    const structureRaw = structureForIndex(baseIntent.genre_profile.primary, index)
    const structure = parseSongStructure(structureRaw)

    return {
      ...baseIntent,
      meta: {
        ...baseIntent.meta,
        creation_mode: 'album',
        album_song_count: safeCount,
        track_name: safeTrackName(baseIntent.meta.track_name, index),
      },
      mood,
      energy: energies[index],
      tempo_bpm: tempos[index],
      structure,
      genre_profile: {
        primary: baseIntent.genre_profile.primary,
        secondary: [...baseIntent.genre_profile.secondary],
        instrumentation: [...baseIntent.genre_profile.instrumentation],
        rhythm_pattern: baseIntent.genre_profile.rhythm_pattern,
      },
      vocal: {
        ...baseIntent.vocal,
        languages: [...baseIntent.vocal.languages],
        effects: [...baseIntent.vocal.effects],
      },
      style_reference: baseIntent.style_reference.map((entry) => ({ ...entry })),
      audio_parameters: {
        ...baseIntent.audio_parameters,
        instrumentation: [...baseIntent.audio_parameters.instrumentation],
      },
      visual: {
        ...baseIntent.visual,
      },
      generation_prompt: baseIntent.generation_prompt
        .replace(baseIntent.meta.track_name, safeTrackName(baseIntent.meta.track_name, index))
        .replace(`${baseIntent.tempo_bpm} BPM`, `${tempos[index]} BPM`),
    }
  })
}
