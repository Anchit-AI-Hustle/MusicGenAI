import {
  ALBUM_SONG_COUNT_RANGE,
  CANONICAL_MOODS,
  DEFAULT_RHYTHM_PATTERN,
  DEFAULT_STRUCTURE,
  DURATION_RANGE,
  ENERGY_FROM_TEMPO,
  GENRE_INSTRUMENTATION_MAP,
  GENRE_RHYTHM_PATTERN_MAP,
  HIGH_AROUSAL_WORDS,
  HIGH_TENSION_WORDS,
  LOW_AROUSAL_WORDS,
  LOW_TENSION_WORDS,
  MAX_INSTRUMENTATION_COUNT,
  MOOD_MAPPINGS,
  STRUCTURE_DURATION_RATIOS,
  TEMPO_RANGES,
  VOCAL_INTENSITY_RANGE,
} from './constants'
import type {
  ArtistStyleVector,
  GenreProfile,
  MoodVector,
  NormalizedInput,
  RawUserInput,
  StructureSegment,
  VocalStyleVector,
} from './types'

const DEFAULT_ARTIST_STYLE: Omit<ArtistStyleVector, 'artist'> = {
  genre: 'pop',
  mood: 'neutral',
  era: '2020s',
  production_style: 'contemporary',
}

const ARTIST_STYLE_MAP: Record<string, Omit<ArtistStyleVector, 'artist'>> = {
  'the weeknd': { genre: 'rnb', mood: 'dark', era: '2010s', production_style: 'cinematic synth' },
  'kendrick lamar': { genre: 'hip-hop', mood: 'intense', era: '2010s', production_style: 'jazz-rap' },
  'hans zimmer': { genre: 'classical', mood: 'epic', era: '2000s', production_style: 'orchestral hybrid' },
  'daft punk': { genre: 'edm', mood: 'euphoric', era: '2000s', production_style: 'french house' },
  'taylor swift': { genre: 'pop', mood: 'romantic', era: '2010s', production_style: 'polished pop' },
  'johnny cash': { genre: 'country', mood: 'melancholic', era: '1960s', production_style: 'stripped acoustic' },
  radiohead: { genre: 'alternative', mood: 'dark', era: '2000s', production_style: 'glitchy electronic' },
  'billie eilish': { genre: 'pop', mood: 'dark', era: '2020s', production_style: 'whisper pop' },
  beethoven: { genre: 'classical', mood: 'epic', era: '1800s', production_style: 'symphonic' },
  drake: { genre: 'hip-hop', mood: 'romantic', era: '2010s', production_style: 'trap soul' },
  eminem: { genre: 'hip-hop', mood: 'angry', era: '2000s', production_style: 'raw rap' },
  'beyoncé': { genre: 'rnb', mood: 'empowering', era: '2010s', production_style: 'stadium pop' },
  beyonce: { genre: 'rnb', mood: 'empowering', era: '2010s', production_style: 'stadium pop' },
  'kanye west': { genre: 'hip-hop', mood: 'epic', era: '2000s', production_style: 'maximalist' },
  'frank ocean': { genre: 'rnb', mood: 'melancholic', era: '2010s', production_style: 'indie soul' },
  'john williams': { genre: 'classical', mood: 'epic', era: '1980s', production_style: 'cinematic orchestral' },
  'ennio morricone': { genre: 'classical', mood: 'tense', era: '1970s', production_style: 'spaghetti western' },
  'pink floyd': { genre: 'rock', mood: 'dark', era: '1970s', production_style: 'psychedelic rock' },
  'led zeppelin': { genre: 'rock', mood: 'epic', era: '1970s', production_style: 'heavy blues rock' },
  metallica: { genre: 'metal', mood: 'angry', era: '1990s', production_style: 'thrash metal' },
  adele: { genre: 'pop', mood: 'melancholic', era: '2010s', production_style: 'orchestral pop' },
  'bruno mars': { genre: 'pop', mood: 'happy', era: '2010s', production_style: 'retro funk pop' },
  'j dilla': { genre: 'hip-hop', mood: 'chill', era: '2000s', production_style: 'lo-fi soul' },
  'brian eno': { genre: 'ambient', mood: 'chill', era: '1980s', production_style: 'ambient generative' },
  'aphex twin': { genre: 'edm', mood: 'tense', era: '1990s', production_style: 'experimental electronic' },
  'miles davis': { genre: 'jazz', mood: 'melancholic', era: '1960s', production_style: 'cool jazz' },
  'john coltrane': { genre: 'jazz', mood: 'intense', era: '1960s', production_style: 'modal jazz' },
  mozart: { genre: 'classical', mood: 'happy', era: '1780s', production_style: 'classical period' },
  'bob marley': { genre: 'reggae', mood: 'happy', era: '1970s', production_style: 'roots reggae' },
  'bon iver': { genre: 'folk', mood: 'melancholic', era: '2010s', production_style: 'indie folk' },
  portishead: { genre: 'chill', mood: 'dark', era: '1990s', production_style: 'trip-hop' },
  'childish gambino': { genre: 'hip-hop', mood: 'romantic', era: '2010s', production_style: 'alternative rap' },
}

const VOCAL_STYLE_VECTOR_MAP: Record<string, VocalStyleVector> = {
  raspy: { register: 'mid', technique: 'chest', texture: 'rough' },
  falsetto: { register: 'high', technique: 'head', texture: 'airy' },
  'spoken word': { register: 'mid', technique: 'speech', texture: 'dry' },
  operatic: { register: 'high', technique: 'classical', texture: 'resonant' },
  whisper: { register: 'mid', technique: 'breath', texture: 'airy' },
  belt: { register: 'high', technique: 'chest mix', texture: 'powerful' },
  growl: { register: 'low', technique: 'fry', texture: 'gritty' },
  melismatic: { register: 'high', technique: 'agile', texture: 'smooth' },
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}

function toTitleCase(value: string): string {
  if (!value) return value
  return value
    .split(' ')
    .map((chunk) => chunk ? `${chunk[0].toUpperCase()}${chunk.slice(1).toLowerCase()}` : chunk)
    .join(' ')
}

/** Maps any mood string to a deterministic MoodVector. */
export function moodToVector(mood: string): MoodVector & { label: string } {
  const normalized = mood.trim().toLowerCase()
  const mapped = MOOD_MAPPINGS[normalized as keyof typeof MOOD_MAPPINGS]
  if (mapped) {
    return { label: normalized, ...mapped }
  }

  const tokens = normalized.split(/[^a-z]+/).filter(Boolean)
  let arousal = 5
  let tension = 5
  let valence = 5

  for (const token of tokens) {
    if (HIGH_AROUSAL_WORDS.includes(token as (typeof HIGH_AROUSAL_WORDS)[number])) arousal += 1
    if (LOW_AROUSAL_WORDS.includes(token as (typeof LOW_AROUSAL_WORDS)[number])) arousal -= 1
    if (HIGH_TENSION_WORDS.includes(token as (typeof HIGH_TENSION_WORDS)[number])) tension += 1
    if (LOW_TENSION_WORDS.includes(token as (typeof LOW_TENSION_WORDS)[number])) tension -= 1
    // Brutality/aggression language implies both pressure and drive.
    if (token === 'brutal' || token === 'aggressive') arousal += 1
  }

  valence += Math.round((3 - tension) / 2)
  valence += Math.round((arousal - 5) / 4)

  return {
    label: normalized || 'neutral',
    valence: clamp(Math.round(valence), 1, 10),
    arousal: clamp(Math.round(arousal), 1, 10),
    tension: clamp(Math.round(tension), 1, 10),
  }
}

/** Maps tempo to deterministic energy bucket. */
export function tempoToEnergy(tempo: number): number {
  for (const entry of ENERGY_FROM_TEMPO) {
    if (tempo >= entry.range[0] && tempo <= entry.range[1]) {
      return entry.energy
    }
  }
  return 6
}

function inferInstrumentationFromPrompt(prompt: string, mood: MoodVector & { label: string }): string[] {
  const lower = prompt.toLowerCase()
  const inferred: string[] = []

  if (lower.includes('guitar')) inferred.push('guitar')
  if (lower.includes('piano')) inferred.push('piano')
  if (lower.includes('string')) inferred.push('strings')
  if (lower.includes('synth')) inferred.push('synthesizer')
  if (lower.includes('808')) inferred.push('808 bass')
  if (lower.includes('drum')) inferred.push('drums')
  if (lower.includes('choir')) inferred.push('choir')

  if (mood.arousal >= 8) inferred.push('punchy drums')
  if (mood.tension >= 8) inferred.push('dissonant textures')
  if (mood.arousal <= 3) inferred.push('soft pad')

  if (inferred.length === 0) {
    inferred.push('drums', 'bass', 'keys')
  }

  return [...new Set(inferred)].slice(0, MAX_INSTRUMENTATION_COUNT)
}

/** Parses song structure into weighted and normalized segments. */
export function parseSongStructure(raw: string): { raw: string; segments: StructureSegment[] } {
  const candidate = raw.trim() || DEFAULT_STRUCTURE
  const parts = candidate.split('-').map((entry) => entry.trim()).filter(Boolean)
  const normalizedParts = parts.length > 0 ? parts : DEFAULT_STRUCTURE.split('-')

  const weighted = normalizedParts.map((part, index) => {
    const canonical = Object.keys(STRUCTURE_DURATION_RATIOS).find(
      (name) => name.toLowerCase() === part.toLowerCase(),
    )
    const key = canonical ?? toTitleCase(part)
    const ratio = canonical ? STRUCTURE_DURATION_RATIOS[canonical] : 0.1
    return {
      name: key,
      order: index + 1,
      duration_ratio: ratio,
    }
  })

  const total = weighted.reduce((sum, segment) => sum + segment.duration_ratio, 0)
  const normalizedSegments = weighted.map((segment) => ({
    ...segment,
    duration_ratio: Number((segment.duration_ratio / (total || 1)).toFixed(6)),
  }))

  const normalizedTotal = normalizedSegments.reduce((sum, segment) => sum + segment.duration_ratio, 0)
  const delta = Number((1 - normalizedTotal).toFixed(6))
  if (normalizedSegments.length > 0 && delta !== 0) {
    const last = normalizedSegments[normalizedSegments.length - 1]
    last.duration_ratio = Number((last.duration_ratio + delta).toFixed(6))
  }

  return {
    raw: normalizedParts.join('-'),
    segments: normalizedSegments,
  }
}

/** Converts vocal style text into a vector. */
export function vocalStyleToVector(style: string): VocalStyleVector {
  const key = style.trim().toLowerCase()
  if (VOCAL_STYLE_VECTOR_MAP[key]) {
    return VOCAL_STYLE_VECTOR_MAP[key]
  }
  return { register: 'mid', technique: 'mixed', texture: 'clear' }
}

/** Maps artist names to style references. */
export function mapArtistsToStyle(artists: string[] | undefined): ArtistStyleVector[] {
  const safeArtists = (artists ?? []).filter((artist) => artist.trim().length > 0)
  if (safeArtists.length === 0) {
    return [{ artist: 'Unknown', ...DEFAULT_ARTIST_STYLE }]
  }

  return safeArtists.map((artist) => {
    const key = artist.trim().toLowerCase()
    const mapped = ARTIST_STYLE_MAP[key] ?? DEFAULT_ARTIST_STYLE
    return {
      artist: artist.trim(),
      genre: mapped.genre,
      mood: mapped.mood,
      era: mapped.era,
      production_style: mapped.production_style,
    }
  })
}

function buildGenreProfile(genres: string[], prompt: string, mood: MoodVector & { label: string }): GenreProfile {
  const normalizedGenres = genres.map(toSlug)
  const primary = normalizedGenres[0] ?? 'pop'
  const secondary = normalizedGenres.slice(1)

  const mappedInstruments = normalizedGenres.flatMap((genre) => GENRE_INSTRUMENTATION_MAP[genre] ?? [])
  const fallbackInstruments = inferInstrumentationFromPrompt(prompt, mood)

  const instrumentation = [...new Set([...mappedInstruments, ...fallbackInstruments])].slice(0, MAX_INSTRUMENTATION_COUNT)
  const rhythmPattern = GENRE_RHYTHM_PATTERN_MAP[primary] ?? DEFAULT_RHYTHM_PATTERN

  return {
    primary,
    secondary,
    instrumentation,
    rhythm_pattern: rhythmPattern,
  }
}

/** Converts validated raw user input into deterministic normalized input. */
export function normalize(input: RawUserInput): NormalizedInput {
  const mood = moodToVector(input.mood)
  const tempo = clamp(Math.round(input.tempo_bpm), TEMPO_RANGES.MIN, TEMPO_RANGES.MAX)
  const duration = clamp(Math.round(input.duration_seconds), DURATION_RANGE.MIN, DURATION_RANGE.MAX)
  const styleReference = mapArtistsToStyle(input.artist_inspiration)

  const genreProfile = buildGenreProfile(input.genres, input.music_prompt, mood)
  const structure = parseSongStructure(input.song_structure)

  const vocalEffects = [...new Set((input.vocal_effects ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean))]
  const vocalLanguages = [...new Set((input.vocal_language ?? []).map((item) => item.trim()).filter(Boolean))]

  const vocal = {
    arrangement: input.vocal_arrangement,
    style: input.vocal_style.trim(),
    style_vector: vocalStyleToVector(input.vocal_style),
    intensity: clamp(Math.round(input.vocal_intensity), VOCAL_INTENSITY_RANGE.MIN, VOCAL_INTENSITY_RANGE.MAX),
    effects: vocalEffects,
    languages: vocalLanguages,
  }

  const albumSongCount = input.creation_mode === 'album'
    ? clamp(input.album_song_count ?? 8, ALBUM_SONG_COUNT_RANGE.MIN, ALBUM_SONG_COUNT_RANGE.MAX)
    : null

  return {
    creation_mode: input.creation_mode,
    album_song_count: albumSongCount,
    track_name: input.track_name.trim(),
    music_prompt: input.music_prompt.trim(),
    genre_profile: genreProfile,
    subgenres: (input.subgenres ?? []).map(toSlug).filter(Boolean),
    tempo_bpm: tempo,
    duration_seconds: duration,
    mood,
    song_structure: structure,
    vocal,
    lyrics: {
      theme: input.lyric_theme.trim(),
      content: input.lyrics ?? null,
      sentiment: null,
    },
    style_reference: styleReference,
    generate_video: input.generate_video,
    video_style: input.generate_video ? (input.video_style ?? null) : null,
    energy: tempoToEnergy(tempo),
  }
}

export const canonicalMoods = [...CANONICAL_MOODS]
export { GENRE_INSTRUMENTATION_MAP }
