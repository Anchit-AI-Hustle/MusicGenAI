import {
  ALBUM_SONG_COUNT_RANGE,
  MOOD_VALENCE_CONFLICT_THRESHOLD,
  POSITIVE_WORDS,
  NEGATIVE_WORDS,
  TENSION_WORDS,
} from './constants'
import { parseSongStructure } from './normalizer'
import type { ConflictReport, NormalizedInput } from './types'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function allGenres(input: NormalizedInput): string[] {
  const genres = [input.genre_profile.primary, ...input.genre_profile.secondary].map((g) => g.toLowerCase())
  return [...new Set(genres)]
}

function scoreLyricsSentiment(content: string): { valence: number; tension: number; arousal: number } {
  const tokens = content.toLowerCase().match(/[a-z']+/g) ?? []
  const total = Math.max(1, tokens.length)

  const positiveCount = tokens.filter((token) => POSITIVE_WORDS.includes(token as (typeof POSITIVE_WORDS)[number])).length
  const negativeCount = tokens.filter((token) => NEGATIVE_WORDS.includes(token as (typeof NEGATIVE_WORDS)[number])).length
  const tensionCount = tokens.filter((token) => TENSION_WORDS.includes(token as (typeof TENSION_WORDS)[number])).length

  const positiveScore = (positiveCount / total) * 10
  const negativeScore = (negativeCount / total) * 10
  const tensionScore = (tensionCount / total) * 10

  const valence = clamp(Math.round(5 + positiveScore - negativeScore), 1, 10)
  const tension = clamp(Math.round(4 + tensionScore + negativeScore * 0.5), 1, 10)
  const arousal = clamp(Math.round(5 + tensionScore * 0.5), 1, 10)

  return { valence, tension, arousal }
}

function logConflict(
  report: ConflictReport,
  rule: string,
  field: string,
  originalValue: unknown,
  resolvedValue: unknown,
  reason: string,
): void {
  report.push({
    rule,
    field,
    original_value: originalValue,
    resolved_value: resolvedValue,
    reason,
  })
}

function applyTempoClamp(input: NormalizedInput, report: ConflictReport): void {
  const genres = allGenres(input)

  for (const genre of genres) {
    const before = input.tempo_bpm

    if (genre === 'hip-hop' && input.tempo_bpm > 140) {
      input.tempo_bpm = 140
      logConflict(report, 'C1', 'tempo_bpm', before, input.tempo_bpm, 'hip-hop requires tempo <= 140')
      continue
    }
    if (genre === 'classical' && input.tempo_bpm > 160) {
      input.tempo_bpm = 160
      logConflict(report, 'C1', 'tempo_bpm', before, input.tempo_bpm, 'classical requires tempo <= 160')
      continue
    }
    if (genre === 'metal' && input.tempo_bpm < 100) {
      input.tempo_bpm = 100
      logConflict(report, 'C1', 'tempo_bpm', before, input.tempo_bpm, 'metal requires tempo >= 100')
      continue
    }
    if (genre === 'edm' && input.tempo_bpm < 110) {
      input.tempo_bpm = 118
      logConflict(report, 'C1', 'tempo_bpm', before, input.tempo_bpm, 'edm requires tempo >= 110, defaulted to 118')
      continue
    }
    if (genre === 'house' && input.tempo_bpm < 118) {
      input.tempo_bpm = 118
      logConflict(report, 'C1', 'tempo_bpm', before, input.tempo_bpm, 'house requires tempo >= 118')
      continue
    }
    if (genre === 'jazz' && input.tempo_bpm > 200) {
      input.tempo_bpm = 200
      logConflict(report, 'C1', 'tempo_bpm', before, input.tempo_bpm, 'jazz requires tempo <= 200')
      continue
    }
    if (genre === 'ambient' && input.tempo_bpm > 100) {
      input.tempo_bpm = 90
      logConflict(report, 'C1', 'tempo_bpm', before, input.tempo_bpm, 'ambient tracks are clamped to 90 when above 100')
    }
  }
}

function resolveMoodLyrics(input: NormalizedInput, report: ConflictReport): void {
  if (!input.lyrics.content) return

  const sentiment = scoreLyricsSentiment(input.lyrics.content)
  input.lyrics.sentiment = {
    valence: sentiment.valence,
    arousal: sentiment.arousal,
    tension: sentiment.tension,
  }

  if (Math.abs(sentiment.valence - input.mood.valence) > MOOD_VALENCE_CONFLICT_THRESHOLD) {
    logConflict(
      report,
      'C2',
      'lyrics.content',
      sentiment.valence,
      input.mood.valence,
      'lyrics valence deviates from mood valence by more than 3; mood preserved',
    )
  }

  if (Math.abs(sentiment.tension - input.mood.tension) > 3) {
    logConflict(
      report,
      'C2',
      'lyrics.content',
      sentiment.tension,
      input.mood.tension,
      'lyrics tension deviates from mood tension by more than 3; mood preserved',
    )
  }
}

function resolveVocalGenre(input: NormalizedInput, report: ConflictReport): void {
  const genres = allGenres(input)

  const removeEffect = (effect: string, reason: string): void => {
    if (input.vocal.effects.includes(effect)) {
      const before = [...input.vocal.effects]
      input.vocal.effects = input.vocal.effects.filter((item) => item !== effect)
      logConflict(report, 'C3', 'vocal.effects', before, input.vocal.effects, reason)
    }
  }

  if (genres.includes('classical')) {
    removeEffect('autotune', 'autotune removed for classical compatibility')
    removeEffect('pitch-shift', 'pitch-shift removed for classical compatibility')
  }

  if (genres.includes('instrumental') && input.vocal.arrangement !== 'none') {
    const before = input.vocal.arrangement
    input.vocal.arrangement = 'none'
    logConflict(report, 'C3', 'vocal.arrangement', before, input.vocal.arrangement, 'instrumental genre requires no vocals')
  }

  if (genres.includes('edm') && input.vocal.arrangement === 'choir') {
    const before = input.vocal.arrangement
    input.vocal.arrangement = 'solo'
    logConflict(report, 'C3', 'vocal.arrangement', before, input.vocal.arrangement, 'choir downgraded to solo for edm')
  }

  if (genres.includes('metal') && input.vocal.arrangement === 'choir') {
    const before = input.vocal.arrangement
    input.vocal.arrangement = 'solo'
    logConflict(report, 'C3', 'vocal.arrangement', before, input.vocal.arrangement, 'choir downgraded to solo for metal')
  }

  if (genres.includes('ambient') && input.vocal.arrangement === 'choir') {
    const before = input.vocal.arrangement
    input.vocal.arrangement = 'none'
    logConflict(report, 'C3', 'vocal.arrangement', before, input.vocal.arrangement, 'choir downgraded to none for ambient')
  }
}

function deriveVideoStyle(moodLabel: string, primaryGenre: string): string {
  const key = `${moodLabel.toLowerCase()}:${primaryGenre.toLowerCase()}`
  const map: Record<string, string> = {
    'dark:hip-hop': 'cinematic noir',
    'euphoric:edm': 'neon abstract',
    'epic:classical': 'orchestral visual',
    'romantic:pop': 'soft cinematic',
    'chill:jazz': 'lo-fi aesthetic',
    'angry:metal': 'industrial brutal',
    'sad:rnb': 'moody film grain',
    'happy:pop': 'colorful vibrant',
    'melancholic:folk': 'natural film grain',
    'tense:techno': 'glitch noir',
  }
  return map[key] ?? 'abstract motion'
}

function normalizeSegments(names: string[]): { raw: string; segments: NormalizedInput['song_structure']['segments'] } {
  const structure = parseSongStructure(names.join('-'))
  return structure
}

function resolveDurationStructure(input: NormalizedInput, report: ConflictReport): void {
  const names = input.song_structure.segments.map((segment) => segment.name)

  if (input.duration_seconds < 60 && names.length > 3) {
    const before = input.song_structure.raw
    const next = normalizeSegments(['Verse', 'Chorus', 'Outro'])
    input.song_structure = next
    logConflict(report, 'C6', 'song_structure', before, next.raw, 'short durations are trimmed to 3 segments')
    return
  }

  if (input.duration_seconds > 300 && names.length < 4) {
    const before = input.song_structure.raw
    const lastChorus = names.map((name) => name.toLowerCase()).lastIndexOf('chorus')
    const insertionIndex = lastChorus > 0 ? lastChorus : Math.max(1, names.length - 1)
    names.splice(insertionIndex, 0, 'Bridge')
    const next = normalizeSegments(names)
    input.song_structure = next
    logConflict(report, 'C6', 'song_structure', before, next.raw, 'long duration inserted Bridge for development')
  }

  const currentNames = input.song_structure.segments.map((segment) => segment.name)
  if (input.duration_seconds > 480 && currentNames.length < 6) {
    const before = input.song_structure.raw
    const expanded = [...currentNames]

    const verseIndex = expanded.findIndex((name) => name.toLowerCase() === 'verse')
    if (verseIndex >= 0) {
      expanded.splice(verseIndex + 1, 0, expanded[verseIndex])
    }

    const chorusIndex = expanded.findIndex((name) => name.toLowerCase() === 'chorus')
    if (chorusIndex >= 0) {
      expanded.splice(chorusIndex + 1, 0, expanded[chorusIndex])
    }

    const next = normalizeSegments(expanded)
    input.song_structure = next
    logConflict(report, 'C6', 'song_structure', before, next.raw, 'very long duration duplicated Verse and Chorus')
  }
}

/** Resolves normalized input conflicts using priority and rule order C1..C6. */
export function resolveConflicts(input: NormalizedInput): { resolved: NormalizedInput; report: ConflictReport } {
  const resolved: NormalizedInput = {
    ...input,
    genre_profile: {
      ...input.genre_profile,
      secondary: [...input.genre_profile.secondary],
      instrumentation: [...input.genre_profile.instrumentation],
    },
    song_structure: {
      raw: input.song_structure.raw,
      segments: input.song_structure.segments.map((segment) => ({ ...segment })),
    },
    vocal: {
      ...input.vocal,
      effects: [...input.vocal.effects],
      languages: [...input.vocal.languages],
      style_vector: { ...input.vocal.style_vector },
    },
    lyrics: {
      ...input.lyrics,
      sentiment: input.lyrics.sentiment ? { ...input.lyrics.sentiment } : null,
    },
    style_reference: input.style_reference.map((style) => ({ ...style })),
  }

  const report: ConflictReport = []

  applyTempoClamp(resolved, report)
  resolveMoodLyrics(resolved, report)
  resolveVocalGenre(resolved, report)

  if (resolved.generate_video && !resolved.video_style) {
    const before = resolved.video_style
    resolved.video_style = deriveVideoStyle(resolved.mood.label, resolved.genre_profile.primary)
    logConflict(report, 'C4', 'video_style', before, resolved.video_style, 'video_style derived from mood and primary genre')
  }

  if (resolved.creation_mode === 'album' && resolved.album_song_count === null) {
    const before = resolved.album_song_count
    resolved.album_song_count = 8
    logConflict(report, 'C5', 'album_song_count', before, resolved.album_song_count, 'album_song_count defaulted to 8')
  }

  if (resolved.creation_mode === 'single' && resolved.album_song_count !== null) {
    const before = resolved.album_song_count
    resolved.album_song_count = null
    logConflict(report, 'C5', 'album_song_count', before, resolved.album_song_count, 'single mode nullifies album_song_count')
  }

  if (resolved.album_song_count !== null) {
    resolved.album_song_count = clamp(resolved.album_song_count, ALBUM_SONG_COUNT_RANGE.MIN, ALBUM_SONG_COUNT_RANGE.MAX)
  }

  resolveDurationStructure(resolved, report)

  return { resolved, report }
}
