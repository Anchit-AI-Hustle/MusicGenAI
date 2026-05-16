import {
  CANONICAL_MOODS,
  SUGGEST_PROMPT_WORD_RANGE,
  TEMPO_RANGES,
} from './constants'
import { resolveConflicts } from './conflictResolver'
import { moodToVector } from './normalizer'
import type { NormalizedInput } from './types'

const GENRE_MOOD_ALIGNMENT: Record<string, Array<(typeof CANONICAL_MOODS)[number]>> = {
  metal: ['angry', 'tense', 'epic', 'dark'],
  'hip-hop': ['dark', 'tense', 'happy', 'romantic'],
  trap: ['dark', 'tense', 'angry'],
  edm: ['euphoric', 'happy', 'epic', 'tense'],
  house: ['happy', 'euphoric', 'chill'],
  classical: ['epic', 'romantic', 'melancholic', 'happy'],
  jazz: ['chill', 'melancholic', 'romantic'],
  rnb: ['romantic', 'melancholic', 'dark'],
  pop: ['happy', 'romantic', 'euphoric', 'melancholic'],
  ambient: ['chill', 'melancholic', 'dark'],
  folk: ['melancholic', 'romantic', 'happy'],
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function clampPromptWords(text: string, minWords: number, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length > maxWords) return words.slice(0, maxWords).join(' ')
  if (words.length >= minWords) return words.join(' ')

  const filler = 'Build a clear emotional arc, keep transitions smooth, and preserve tight stylistic cohesion throughout the arrangement.'
  const padded = `${words.join(' ')} ${filler}`.trim()
  return padded.split(/\s+/).slice(0, maxWords).join(' ')
}

function allGenres(input: Partial<NormalizedInput>): string[] {
  const primary = input.genre_profile?.primary ?? ''
  const secondary = input.genre_profile?.secondary ?? []
  const merged = [primary, ...secondary]
    .map((genre) => genre.trim().toLowerCase())
    .filter(Boolean)
  return merged.length > 0 ? [...new Set(merged)] : ['pop']
}

function primaryGenre(input: Partial<NormalizedInput>): string {
  return allGenres(input)[0]
}

function bestStyleReference(input: Partial<NormalizedInput>): string {
  const first = input.style_reference?.[0]
  if (!first) return 'contemporary production style'
  return `${first.artist} inspired ${first.production_style}`
}

/**
 * Suggests a dense, Suno/Udio-grade music prompt.
 *
 * Structure (always in this order): genre line → tempo + key → instruments
 * → vocal description → production adjectives → reference artists → scene.
 *
 * Used as the local fallback when the LLM edge function is unreachable, so
 * the user still gets a substantive prompt instead of a one-liner.
 */
export function suggestMusicPrompt(partial: Partial<NormalizedInput>): string {
  const genre = primaryGenre(partial)
  const secondary = partial.genre_profile?.secondary ?? []
  const tempo = partial.tempo_bpm ?? suggestTempo(partial)
  const mood = suggestMood(partial)
  const instruments = (partial.genre_profile?.instrumentation ?? ['layered drums', 'sub bass', 'electric piano', 'pad textures', 'lead synth']).slice(0, 6)
  const lyricTheme = partial.lyrics?.theme ?? 'an emotionally focused narrative arc'
  const ref = partial.style_reference?.[0]
  const refClause = ref
    ? `Reference: ${ref.artist}-style ${ref.production_style ?? 'production'}.`
    : 'Reference: contemporary chart-leaning production aesthetic.'
  const vocalLang = partial.vocal?.languages?.[0] ?? 'English'
  const vocalArrangement = partial.vocal?.arrangement ?? 'solo'
  const vocalIntensity = partial.vocal?.intensity ?? 6
  const vocalLine = vocalArrangement === 'none'
    ? 'Fully instrumental — no vocals.'
    : `${vocalArrangement} ${vocalLang} vocal at intensity ${vocalIntensity}/10, with breath-textured phrasing and tight pocket against the groove.`

  const prodPalette: Record<string, string> = {
    metal: 'gritty distortion, tight low end, wide stereo guitars, punchy drums',
    'hip-hop': 'sub-heavy 808s, sidechained pads, vinyl crackle, glossy hi-hats',
    trap: 'sub-heavy 808s, rolling hats, tight snares, dark wide pads',
    edm: 'sidechained pads, wide stereo, punchy kick, glossy lead',
    house: 'four-on-the-floor pocket, warm analog filter, wide stereo, lush pads',
    classical: 'natural hall reverb, wide stereo strings, dynamic restraint',
    jazz: 'warm tape, intimate room sound, gentle compression, brushed drums',
    rnb: 'warm tape, lush stacked harmonies, sidechained pads, glossy keys',
    pop: 'glossy production, wide stereo, punchy kick, lush stacked harmonies',
    ambient: 'lush reverb, slow attack pads, airy stereo width, soft saturation',
    folk: 'warm tape, intimate room sound, gentle compression, breathy vocal',
  }
  const productionAdjectives = prodPalette[genre] ?? 'warm tape, wide stereo, punchy low end, glossy top end'

  const sceneByMood: Record<string, string> = {
    happy: 'sunlit rooftop at golden hour with a crowd singing along',
    sad: 'a rain-streaked window at 3am, headlights blurring past',
    angry: 'a stadium pit just before the drop, sweat and adrenaline',
    romantic: 'a slow dance under string lights on a summer evening',
    epic: 'a cinematic horizon shot with everything building toward release',
    melancholic: 'an empty highway at dusk, taillights vanishing into fog',
    euphoric: 'a festival peak hour with hands in the air and confetti falling',
    dark: 'a neon-lit underpass at midnight, shadows in motion',
    chill: 'a quiet apartment with afternoon light through the blinds',
    tense: 'the moment before the first beat drops, pure anticipation',
  }
  const scene = sceneByMood[mood] ?? 'a vivid emotional scene the listener can step into'

  const secondaryClause = secondary.length > 0 ? ` blended with ${secondary.slice(0, 2).join(' / ')}` : ''

  const prompt = [
    `${mood} ${genre} track${secondaryClause}, ${tempo} BPM, in a tonal center that supports the mood.`,
    `Arrangement built around ${instruments.join(', ')}, with each element occupying a distinct frequency pocket and a defined role in the mix.`,
    `${vocalLine}`,
    `Production palette: ${productionAdjectives}.`,
    `${refClause}`,
    `Lyrical direction: ${lyricTheme}. Phrasing should mirror the genre's idiomatic cadence — internal rhyme density, line lengths, and breath placement aligned to the groove.`,
    `Scene to evoke: ${scene}.`,
    `Dynamic arc: intro establishes the world, verses tighten the focus, the pre-chorus signals lift, the chorus delivers the hook payoff with full arrangement, the bridge introduces a single decisive shift (key change, half-time drop, or arrangement strip), and the outro resolves on the strongest motif.`,
    `Mix targets: clear vocal-instrumental separation, controlled low-end, defined transient detail on drums, and stereo width on pads and FX. Reverbs and delays sized to the tempo so tails breathe between phrases rather than blurring them.`,
  ].join(' ')

  // Prose prompts have a soft floor (don't return a one-liner) but no upper
  // cap — Suno/Udio/ACE-Step prompts perform better with thorough detail.
  return clampPromptWords(prompt, SUGGEST_PROMPT_WORD_RANGE.MIN, SUGGEST_PROMPT_WORD_RANGE.MAX)
}

/** Suggests canonical mood based on genre, tempo, artist references, and lyric theme. */
export function suggestMood(partial: Partial<NormalizedInput>): string {
  const genres = allGenres(partial)
  const tempo = partial.tempo_bpm ?? 110
  const lyricTheme = (partial.lyrics?.theme ?? '').toLowerCase()
  const artistMoods = (partial.style_reference ?? []).map((ref) => ref.mood.toLowerCase())

  const scores: Record<string, number> = Object.fromEntries(CANONICAL_MOODS.map((mood) => [mood, 0]))

  const arousalMood = tempo >= 150 ? 'euphoric' : tempo <= 80 ? 'chill' : 'happy'
  scores[arousalMood] += 2

  for (const genre of genres) {
    const aligned = GENRE_MOOD_ALIGNMENT[genre] ?? ['happy', 'melancholic']
    aligned.forEach((mood, index) => {
      scores[mood] += Math.max(1, 3 - index)
    })
  }

  for (const mood of artistMoods) {
    if (scores[mood] !== undefined) scores[mood] += 2
  }

  if (lyricTheme.includes('heartbreak') || lyricTheme.includes('loss')) scores.melancholic += 2
  if (lyricTheme.includes('rage') || lyricTheme.includes('fight')) scores.angry += 2
  if (lyricTheme.includes('love') || lyricTheme.includes('romance')) scores.romantic += 2
  if (lyricTheme.includes('night') || lyricTheme.includes('shadow')) scores.dark += 1

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const candidate = sorted[0]?.[0] ?? 'happy'

  const allowedByGenre = GENRE_MOOD_ALIGNMENT[genres[0]]
  if (!allowedByGenre || allowedByGenre.includes(candidate as (typeof CANONICAL_MOODS)[number])) {
    return candidate
  }

  return allowedByGenre[0]
}

function applyC1TempoRules(tempo: number, genres: string[]): number {
  let next = tempo
  for (const genre of genres) {
    if (genre === 'hip-hop' && next > 140) next = 140
    if (genre === 'classical' && next > 160) next = 160
    if (genre === 'metal' && next < 100) next = 100
    if (genre === 'edm' && next < 110) next = 118
    if (genre === 'house' && next < 118) next = 118
    if (genre === 'jazz' && next > 200) next = 200
    if (genre === 'ambient' && next > 100) next = 90
  }
  return clamp(next, TEMPO_RANGES.MIN, TEMPO_RANGES.MAX)
}

/** Suggests deterministic tempo with mood adjustment and C1 clamps. */
export function suggestTempo(partial: Partial<NormalizedInput>): number {
  const genres = allGenres(partial)
  const centers = genres.map((genre) => TEMPO_RANGES.GENRE_CENTERS[genre as keyof typeof TEMPO_RANGES.GENRE_CENTERS] ?? 110)
  const base = centers.reduce((sum, center) => sum + center, 0) / Math.max(1, centers.length)

  const mood = partial.mood ?? moodToVector(suggestMood(partial))
  const adjusted = mood.arousal > 7 ? base + 10 : mood.arousal < 4 ? base - 10 : base

  return applyC1TempoRules(Math.round(adjusted), genres)
}

/** Suggests a genre-specific song structure string. */
export function suggestSongStructure(partial: Partial<NormalizedInput>): string {
  const genre = primaryGenre(partial)
  const map: Record<string, string> = {
    pop: 'Intro-Verse-Chorus-Verse-Chorus-Bridge-Chorus-Outro',
    'hip-hop': 'Intro-Verse-Hook-Verse-Hook-Bridge-Hook-Outro',
    trap: 'Intro-Verse-Hook-Verse-Hook-Outro',
    edm: 'Intro-Build-Drop-Break-Build-Drop-Outro',
    house: 'Intro-Build-Drop-Break-Drop-Outro',
    classical: 'Intro-Theme-Development-Recapitulation-Coda',
    jazz: 'Intro-Head-Solo-Head-Outro',
    rock: 'Intro-Verse-Chorus-Verse-Chorus-Bridge-Solo-Chorus-Outro',
    metal: 'Intro-Riff-Verse-Chorus-Verse-Chorus-Breakdown-Solo-Chorus-Outro',
    ambient: 'Intro-Theme-Development-Theme-Outro',
    folk: 'Intro-Verse-Chorus-Verse-Chorus-Bridge-Chorus-Outro',
  }
  return map[genre] ?? 'Intro-Verse-Chorus-Verse-Chorus-Bridge-Chorus-Outro'
}

/** Suggests vocal style based on genre and mood. */
export function suggestVocalStyle(partial: Partial<NormalizedInput>): string {
  const genre = primaryGenre(partial)
  const mood = suggestMood(partial)

  if (genre === 'rock' && mood === 'angry') return 'raw, chest voice'
  if (genre === 'pop' && mood === 'happy') return 'bright, mixed voice'
  if (genre === 'rnb' && mood === 'romantic') return 'silky, melismatic'
  if (genre === 'hip-hop') return 'rhythmic, punchy delivery'
  if (genre === 'classical') return 'operatic, breath control'
  if (genre === 'edm') return 'processed, ethereal'
  if (genre === 'metal' && mood === 'angry') return 'aggressive, guttural'
  if (genre === 'jazz' && mood === 'melancholic') return 'breathy, conversational'
  if (genre === 'folk') return 'natural, storytelling'
  if (genre === 'ambient') return 'whispered, layered'
  return 'clear, mixed voice'
}

function baseVideoStyle(mood: string, genre: string): string {
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
  return map[`${mood}:${genre}`] ?? 'abstract motion'
}

function eraTexture(era: string): string {
  if (era.includes('1970')) return 'vintage film texture'
  if (era.includes('1980')) return 'VHS grain overlay'
  if (era.includes('1990')) return 'lo-fi aesthetic'
  if (era.includes('2000')) return 'clean digital'
  if (era.includes('2010')) return 'modern cinematic'
  return 'ultra-HD, hyper-real'
}

/** Suggests video style from mood/genre and artist era. */
export function suggestVideoStyle(partial: Partial<NormalizedInput>): string {
  const mood = suggestMood(partial)
  const genre = primaryGenre(partial)
  const era = partial.style_reference?.[0]?.era ?? '2020s'
  return `${baseVideoStyle(mood, genre)} with ${eraTexture(era)}`
}

/**
 * Enhances field text while preserving semantics and constraints.
 *
 * For prose fields ("music_prompt", "mood", "vocal_style") this layers the
 * user's words into the dense Suno/Udio-grade scaffold from
 * `suggestMusicPrompt`, so even the local fallback path produces
 * Suno-grade detail instead of a thin "X with refined Y" stub.
 */
export function enhanceField(field: string, currentValue: string, context: Partial<NormalizedInput>): string {
  const genre = primaryGenre(context)
  const mood = suggestMood(context)
  const tempo = context.tempo_bpm ?? suggestTempo(context)
  const value = currentValue.trim()

  if (field === 'mood') {
    const base = value.toLowerCase() === 'sad' ? 'melancholic' : (value || mood)
    return `${base} — built around a nuanced emotional contour, with dynamic restraint in verses and a focused release in the chorus. Carry a clear expressive direction (yearning, tension, or catharsis) and let the production palette reinforce it through reverb tail length, harmonic spacing, and vocal proximity.`
  }

  if (field === 'music_prompt') {
    // Build the dense Suno-grade scaffold, then prepend the user's intent
    // so their wording leads and the structure supports it.
    const scaffold = suggestMusicPrompt(context)
    if (!value) return scaffold
    return `${value}. ${scaffold} Preserve the original intent above as the emotional anchor; the structural details below sharpen it into a generation-ready prompt.`
  }

  if (field === 'vocal_style') {
    const base = value || suggestVocalStyle(context)
    return `${base} — refined articulation with genre-aligned phrasing, breath-textured intimacy on verses, controlled chest-voice or mixed register on hooks, and a tight pocket against the ${tempo} BPM groove. Subtle pitch inflection on phrase ends, with the lead bus running gentle compression, a short slap delay, and a long stereo plate reverb sized to the ${genre} aesthetic.`
  }

  // Generic fallback — never return a one-liner.
  return `${value ? `${value}. ` : ''}${suggestMusicPrompt(context)}`
}

/** Creates a different valid alternative while keeping constraints. */
export function newAlternativeField(field: string, currentValue: string, context: Partial<NormalizedInput>): string {
  const genre = primaryGenre(context)

  if (field === 'mood') {
    const current = currentValue.trim().toLowerCase()
    const mood = (CANONICAL_MOODS as readonly string[]).includes(current) ? current : suggestMood(context)
    const adjacency: Record<string, string[]> = {
      happy: ['euphoric', 'romantic'],
      sad: ['melancholic', 'dark'],
      angry: ['tense', 'epic'],
      romantic: ['happy', 'melancholic'],
      epic: ['euphoric', 'tense'],
      melancholic: ['sad', 'dark'],
      euphoric: ['happy', 'epic'],
      dark: ['tense', 'melancholic'],
      chill: ['romantic', 'melancholic'],
      tense: ['angry', 'dark'],
    }
    const options = adjacency[mood] ?? ['melancholic', 'tense']
    return options.find((candidate) => candidate !== current) ?? options[0]
  }

  if (field === 'music_prompt') {
    // Re-roll the dense scaffold with a deliberate stylistic pivot so "Try
    // another" actually returns a different concept, not a paraphrase.
    const pivotedContext: Partial<NormalizedInput> = {
      ...context,
      mood: context.mood,
      // Nudge instrumentation/style by swapping the primary genre's
      // adjacent neighbour where one exists.
      genre_profile: context.genre_profile
        ? {
            ...context.genre_profile,
            instrumentation: (context.genre_profile.instrumentation ?? []).slice().reverse(),
          }
        : context.genre_profile,
    }
    const base = suggestMusicPrompt(pivotedContext)
    return `${base} Approach the arrangement from a different stylistic angle — shift groove contrast, melodic contour, and the emotional pivot point compared with prior ideas.`
  }

  if (field === 'song_structure') {
    const primary = suggestSongStructure(context)
    const alt = primary.replace('Bridge', 'Breakdown')
    return alt === primary ? 'Intro-Verse-Chorus-Breakdown-Chorus-Outro' : alt
  }

  if (field === 'vocal_style') {
    const current = currentValue.toLowerCase()
    const suggestion = suggestVocalStyle(context)
    if (current !== suggestion.toLowerCase()) return suggestion
    if (genre === 'hip-hop') return 'measured, rhythmic spoken-rap delivery'
    if (genre === 'pop') return 'smooth mixed-voice with airy hooks'
    return 'expressive mixed delivery with controlled dynamics'
  }

  if (field === 'video_style') {
    const current = currentValue.toLowerCase()
    const suggested = suggestVideoStyle(context)
    if (current !== suggested.toLowerCase()) return suggested
    return `${baseVideoStyle(suggestMood(context), genre)} with alternate camera pacing and layered visual texture`
  }

  const fallback = suggestMusicPrompt(context)
  return currentValue.trim() ? `${currentValue.trim()} with a different creative emphasis` : fallback
}

/** Convenience helper for applying C1 tempo rules in suggest path. */
export function suggestTempoWithConflicts(partial: Partial<NormalizedInput>): number {
  const tempo = suggestTempo(partial)
  const pseudo: NormalizedInput = {
    creation_mode: 'single',
    album_song_count: null,
    track_name: 'temp',
    music_prompt: partial.music_prompt ?? '',
    genre_profile: {
      primary: primaryGenre(partial),
      secondary: partial.genre_profile?.secondary ?? [],
      instrumentation: partial.genre_profile?.instrumentation ?? [],
      rhythm_pattern: partial.genre_profile?.rhythm_pattern ?? 'straight 8ths with backbeat',
    },
    subgenres: partial.subgenres ?? [],
    tempo_bpm: tempo,
    duration_seconds: partial.duration_seconds ?? 180,
    mood: partial.mood ?? moodToVector(suggestMood(partial)),
    song_structure: partial.song_structure ?? { raw: suggestSongStructure(partial), segments: [] },
    vocal: partial.vocal ?? {
      arrangement: 'solo',
      style: suggestVocalStyle(partial),
      style_vector: { register: 'mid', technique: 'mixed', texture: 'clear' },
      intensity: 5,
      effects: [],
      languages: ['English'],
    },
    lyrics: partial.lyrics ?? { theme: '', content: null, sentiment: null },
    style_reference: partial.style_reference ?? [],
    generate_video: partial.generate_video ?? false,
    video_style: partial.video_style ?? null,
    energy: 5,
  }

  const { resolved } = resolveConflicts(pseudo)
  return resolved.tempo_bpm
}

export const suggestPromptWordCount = {
  min: SUGGEST_PROMPT_WORD_RANGE.MIN,
  max: SUGGEST_PROMPT_WORD_RANGE.MAX,
  countWords,
}
