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
 * Structure (always in this order): genre + subgenre → tempo + key + scale +
 * time sig → instruments with mix roles → vocal description → production
 * adjectives → reference artists → scene/emotional arc → dynamic section
 * arc → chord progression hints → mix targets.
 *
 * Used as the local fallback when the LLM edge function is unreachable, so
 * the user still gets a substantive prompt instead of a one-liner.
 */
export function suggestMusicPrompt(partial: Partial<NormalizedInput>): string {
  const genre = primaryGenre(partial)
  const secondary = partial.genre_profile?.secondary ?? []
  const tempo = partial.tempo_bpm ?? suggestTempo(partial)
  const mood = suggestMood(partial)
  const instruments = (partial.genre_profile?.instrumentation ?? ['layered drums', 'sub bass', 'electric piano', 'pad textures', 'lead synth']).slice(0, 8)
  const lyricTheme = partial.lyrics?.theme ?? 'an emotionally focused narrative arc'
  const ref = partial.style_reference?.[0]
  const refClause = ref
    ? `Reference artists: ${ref.artist} (for ${ref.production_style ?? 'production feel and tonal palette'}).`
    : 'Reference: contemporary chart-leaning production aesthetic with polished master bus.'
  const vocalLang = partial.vocal?.languages?.[0] ?? 'English'
  const vocalArrangement = partial.vocal?.arrangement ?? 'solo'
  const vocalIntensity = partial.vocal?.intensity ?? 6
  const vocalEffects = partial.vocal?.effects ?? []

  // Concrete key/scale choice based on mood
  const keyByMood: Record<string, string> = {
    happy: 'C major', sad: 'A minor', angry: 'E Phrygian', romantic: 'Eb major',
    epic: 'D minor', melancholic: 'F minor', euphoric: 'Ab major', dark: 'C# minor',
    chill: 'G major', tense: 'B diminished / B Locrian',
  }
  const keyScale = keyByMood[mood] ?? 'C minor'

  // Time signature by genre
  const timeSigByGenre: Record<string, string> = {
    metal: '4/4 with double-kick subdivisions', 'hip-hop': '4/4 swung 16ths',
    trap: '4/4 with triplet hi-hat rolls', edm: '4/4 straight',
    house: '4/4 four-on-the-floor', classical: '4/4 or 3/4 waltz feel',
    jazz: '4/4 swung triplet feel', rnb: '4/4 laid-back groove',
    pop: '4/4 programmed', ambient: 'free / 4/4 very slow pulse',
    folk: '4/4 or 6/8 compound time',
  }
  const timeSig = timeSigByGenre[genre] ?? '4/4'

  // Chord progression by mood
  const chordsByMood: Record<string, string> = {
    happy: 'I – V – vi – IV (anthemic lift)', sad: 'vi – IV – I – V (melancholic cycle)',
    angry: 'i – bVII – bVI – V (power movement)', romantic: 'I – iii – IV – iv (bittersweet turn)',
    epic: 'i – bVI – bIII – bVII (cinematic ascent)', melancholic: 'i – iv – v – i (minor descent)',
    euphoric: 'I – V – vi – IV → vi – IV – I – V (chorus lift)', dark: 'i – bII – v – i (Phrygian tension)',
    chill: 'IΔ7 – vi7 – ii7 – V7 (jazzy float)', tense: 'i – bII – i – V (unresolved)',
  }
  const chords = chordsByMood[mood] ?? 'i – iv – bVI – V'

  // Vocal description — much richer
  const vocalRegisterByIntensity = vocalIntensity >= 8 ? 'chest voice with belt on hooks' : vocalIntensity >= 5 ? 'mixed voice, controlled dynamics' : 'head voice, soft intimate delivery'
  const vocalTechByGenre: Record<string, string> = {
    'hip-hop': 'rhythmic rap flow with punchy delivery, ad-libs layered left/right',
    trap: 'auto-tuned melodic rap, mumble inflection on verses, clear belted hooks',
    metal: 'aggressive growl/scream technique alternating with clean melodic passages',
    classical: 'operatic bel canto technique with vibrato control and breath support',
    jazz: 'scat-ready phrasing, conversational tone, microtonal bends on phrase endings',
    rnb: 'melismatic runs, silky falsetto transitions, stacked harmony doubles',
    pop: 'bright clear tone, precise pitch, breathy intimacy on verses building to belted choruses',
    folk: 'natural unprocessed tone, storytelling cadence, slight nasal resonance for authenticity',
    ambient: 'whispered ethereal layers, heavily reverbed, functioning as texture not lyric vehicle',
    edm: 'processed vocals through vocoder and pitch-shift, serving as melodic hook element',
    house: 'soulful diva-style phrases, chopped vocal samples, filtered risers',
  }
  const vocalTech = vocalTechByGenre[genre] ?? 'clear mixed voice with genre-appropriate phrasing'
  const vocalFxStr = vocalEffects.length > 0 ? `, processing chain: ${vocalEffects.join(', ')}` : ', processing: plate reverb (1.8s decay), 1/4-note stereo delay, light bus compression (2:1)'

  const vocalLine = vocalArrangement === 'none'
    ? 'Fully instrumental — no vocals. Lead melodic content carried by the primary instrument with counter-melodies providing harmonic interest.'
    : `${vocalArrangement} ${vocalLang} vocal at intensity ${vocalIntensity}/10: ${vocalRegisterByIntensity}. Technique: ${vocalTech}. Phrasing locked to the ${tempo} BPM groove with breath placement on beats 4 and 8${vocalFxStr}.`

  const prodPalette: Record<string, string> = {
    metal: 'gritty high-gain distortion, tight low end (HP at 80Hz on guitars), wide stereo double-tracked guitars panned L80/R80, punchy triggered drums with room mics blended 20%, master bus glue compression 2dB GR',
    'hip-hop': 'sub-heavy 808s (fundamental at 40-55Hz, mono below 120Hz), sidechained pads ducking 4dB to kick, vinyl crackle at -24dB, glossy hi-hats with 12kHz presence shelf +2dB, warm tape saturation on master',
    trap: 'sub-heavy 808s sliding between root notes, rolling hi-hat triplets with velocity variation, tight clap/snare layered with noise transient, dark wide reverbed pads, master limiter at -1dB true peak',
    edm: 'sidechained pads and bass ducking 6dB to kick (fast attack 5ms, release 150ms), wide supersaw stereo image, punchy transient-shaped kick at -6dB, glossy lead with distortion harmonics, limiter at -0.5dB TP',
    house: 'four-on-the-floor pocket with 909-style kick, warm analog Moog-style filter sweeps, wide stereo chord stabs, lush detuned pads (+7 cents L / -7 cents R), classic dub delay throws on vocals',
    classical: 'natural concert hall reverb (RT60 2.5s), wide stereo strings recorded in Decca tree configuration, dynamic restraint (peak-to-RMS < 12dB), no compression on orchestral bus, true acoustic imaging',
    jazz: 'warm 1/4-inch tape emulation (15ips), intimate close-mic room sound with ~1.2s plate reverb, gentle bus compression (1.5:1 ratio, 2dB GR), brushed drums with room spill, Rhodes through tremolo',
    rnb: 'warm tape saturation, lush stacked vocal harmonies (4-6 voices), sidechained synth pads, glossy Wurlitzer/Rhodes keys with chorus, sub bass at -8dB below kick, vinyl warmth on 2-bus',
    pop: 'glossy polished production, wide stereo field with mono center (kick/bass/vocal), punchy kick (3-5kHz click transient), lush stacked harmonies, top-end shimmer via exciter on overheads, -14 LUFS integrated',
    ambient: 'lush algorithmic reverb (6s+ decay), slow attack (200ms+) pads with granular shimmer, airy stereo width at 100%, soft tube saturation on master, no hard transients, everything gentle and immersive',
    folk: 'warm tape recording aesthetic, intimate room sound (small room IR), gentle 2-bus compression (1.5:1), breathy close-mic vocals, acoustic guitar with ribbon mic warmth, upright bass with room resonance',
  }
  const productionAdjectives = prodPalette[genre] ?? 'warm tape, wide stereo, punchy low end with mono bass below 120Hz, glossy top-end shimmer, 2-bus glue compression at 2dB GR'

  const sceneByMood: Record<string, string> = {
    happy: 'Evoke a sunlit rooftop at golden hour — a crowd singing along, warm light catching raised hands, the bass reverberating through the floor while the melody hangs in the summer air. The listener should feel the specific electricity of a perfect moment they want to freeze.',
    sad: 'Evoke a rain-streaked window at 3am — headlights blurring past on an empty street, a half-finished letter on the desk. The track should feel like the ache between wanting to forget and needing to remember, with each chord change deepening the emotional weight.',
    angry: 'Evoke a stadium pit milliseconds before the drop — sweat on concrete, the subwoofer pressure compressing the chest, a collective exhale of adrenaline. The aggression should feel earned, building from controlled tension to cathartic release.',
    romantic: 'Evoke a slow dance under string lights on a summer evening — two silhouettes, the world blurred into warm bokeh behind them. The harmonic warmth should feel like proximity, each melodic phrase a whispered confession.',
    epic: 'Evoke a cinematic horizon shot with everything building toward release — armies on a ridge at dawn, clouds parting over mountains. The orchestration should swell like a physical force, the listener carried upward by sheer arrangement density.',
    melancholic: 'Evoke an empty highway at dusk, taillights vanishing into fog, the radio playing the song that always meant something. The beauty should be in what\'s left unsaid — sparse arrangement with weight in the silences.',
    euphoric: 'Evoke a festival peak hour — hands in the air, confetti catching laser light, the bass drop synchronizing ten thousand heartbeats. The energy should feel limitless and gravitational, impossible not to move to.',
    dark: 'Evoke a neon-lit underpass at midnight — shadows in angular motion, distant sirens, the streetlight buzzing at 60Hz. The atmosphere should feel thick and immersive, each element adding to a sense of controlled menace.',
    chill: 'Evoke a quiet apartment with afternoon light through half-open blinds — a record spinning, coffee steam rising, the city humming ten stories below. The listener should feel their breathing slow, every element inviting them deeper into the calm.',
    tense: 'Evoke the three seconds before a decision that changes everything — held breath, dilated time, the awareness that the next beat will either resolve or shatter the tension. Build anticipation through rhythmic intensification and harmonic suspension.',
  }
  const scene = sceneByMood[mood] ?? 'A vivid emotional scene the listener can physically step into — use sensory detail (temperature, light, texture, smell) to make the music feel like a place, not just a sound.'

  // Rhythm pattern
  const rhythmByGenre: Record<string, string> = {
    'hip-hop': 'Boom-bap foundation with swung 16th-note hi-hats, kick on 1 and the "and" of 2, snare on 2 and 4, ghost notes on the snare between hits.',
    trap: 'Sparse kick pattern with rapid hi-hat triplet rolls accelerating into fills, snare/clap on 3, 808 glides between kick hits, open hi-hat accents on off-beats.',
    metal: 'Double-kick 16th-note subdivisions at 160+ BPM, tight palm-muted guitar chugs locked to kick, blast beats on extreme sections, half-time breakdowns.',
    edm: 'Four-on-the-floor kick anchoring the groove, offbeat hi-hats, clap on 2 and 4, syncopated bass rhythm following the sidechain pump, percussive risers building into drops.',
    house: 'Classic four-on-the-floor with offbeat open hi-hat, crisp clap on 2 and 4, shaker 16ths for movement, conga/bongo fills on turnarounds.',
    jazz: 'Ride cymbal swing pattern (ding-ding-da-ding), walking bass in quarter notes, comping piano/guitar on beats 2 and 4, brushed snare with cross-stick accents.',
    pop: 'Programmed drum pattern: kick on 1 and 3, snare on 2 and 4, closed hi-hat 8ths, tom fill every 8 bars, finger snaps or claps doubling the snare.',
    classical: 'Conductor-led rubato feel, dynamic crescendos and diminuendos across phrases, timpani rolls on cadence points, pizzicato strings on rhythmic passages.',
    rnb: 'Laid-back swung 16th feel, kick slightly behind the grid (humanized), finger snaps and rim clicks, ghost-note hi-hats, deep sub-bass pulsing on root notes.',
    folk: 'Acoustic guitar strumming pattern: down on 1-2-3-4 with upstroke on the "and" of 2 and 4, stomp-clap percussion on 1 and 3, tambourine shaking 8ths.',
    ambient: 'No defined pulse — textural rhythm from granular artifacts, gentle filtered noise swells, occasional reversed cymbal accents, evolving polyrhythmic echoes.',
  }
  const rhythm = rhythmByGenre[genre] ?? 'Straight 8th-note groove with kick on 1 and 3, snare on 2 and 4, hi-hat 8ths with accent on off-beats.'

  const secondaryClause = secondary.length > 0 ? ` fused with ${secondary.slice(0, 2).join(' and ')} elements` : ''

  // Instrument mix roles
  const instrumentRoles: Record<string, string[]> = {
    metal: ['distorted guitars (L60/R60, high-gain, 2-4kHz presence)', 'bass guitar (mono center, following root notes with occasional fills)', 'double kick drums (center, triggered for consistency, 60Hz fundamental)', 'lead guitar (center-right, delay throws on bends)', 'orchestral strings (wide stereo, cinematic swells on choruses)'],
    'hip-hop': ['808 sub bass (mono center, 40-55Hz fundamental)', 'sampled/programmed kick (center, punchy 3kHz transient)', 'hi-hats (panned slightly right, velocity-varied)', 'synth pad (wide stereo, sidechained to kick)', 'vocal chops/samples (L30/R30, rhythmic accents)'],
    trap: ['808 bass with pitch slides (mono center)', 'trap hi-hats (center-right, triplet rolls)', 'clap/snare stack (center, layered with noise transient)', 'dark ambient pad (ultra-wide stereo)', 'arp synth (left side, 1/16th rhythmic pattern)', 'vocal ad-lib chops (hard-panned L/R)'],
    edm: ['supersaw lead (wide stereo, detuned ±15 cents)', 'sub bass (mono, sidechained -6dB to kick)', 'four-on-the-floor kick (center, 909-style)', 'chord stab synth (L40/R40)', 'arp sequence (right side, filtered)', 'white noise risers (center, automated HP filter)'],
    pop: ['programmed drums (center, punchy and tight)', 'synth bass (mono center, following chord roots)', 'acoustic guitar (left side, strumming pattern)', 'synth pad (wide stereo, sustaining chords)', 'piano/keys (right side, rhythmic comping)', 'claps and percussion (center, doubling snare)'],
    jazz: ['upright bass (center, walking quarter notes)', 'piano (slight left, voicings in shells)', 'ride cymbal (slight right, swing pattern)', 'brush snare (center, cross-stick on 2 and 4)', 'saxophone (center for solo, left for ensemble)', 'trumpet (right, muted or open bell)'],
    classical: ['first violins (left, carrying melody)', 'second violins (center-left, harmony)', 'violas (center, inner voice)', 'cellos (center-right, bass line and counter-melody)', 'basses (right, doubling cellos octave below)', 'woodwinds (center, color and counter-lines)', 'brass (wide, climactic reinforcement)', 'timpani (center, cadential accents)'],
    rnb: ['Rhodes/Wurlitzer (slight right, tremolo, chordal)', 'sub bass (mono center, sine-wave smooth)', 'programmed drums (center, swung and humanized)', 'vocal harmonies (wide stereo stack)', 'synth pad (ultra-wide, filtered)', 'guitar (left, clean neck-pickup tone, sparse arpeggios)'],
    ambient: ['evolving pad (ultra-wide, granular engine)', 'sparse piano (center, felt-damped, slow attack)', 'field recordings (wide, panned naturally)', 'sub drone (mono, barely audible fundamental)', 'shimmer reverb returns (100% wet, infinite decay feel)', 'textural noise layers (wide, filtered slowly)'],
    folk: ['acoustic guitar (center-left, fingerpicked or strummed)', 'upright bass (center, simple root-fifth pattern)', 'fiddle (center-right, melodic fills)', 'harmonica (center, blues bends)', 'hand percussion (left, subtle tambourine or shaker)', 'banjo (right, rhythmic picking)'],
    house: ['909 kick (center, punchy with sub layer)', 'offbeat hi-hat (center-right, open/closed variation)', 'clap (center, plate reverb tail)', 'sub bass (mono, following chord root)', 'chord stabs (L40/R40, filtered disco strings)', 'arp synth (right, TB-303 style acid line)'],
  }
  const instrumentDetails = instrumentRoles[genre] ?? instruments.map((inst, i) => {
    const pan = i % 2 === 0 ? 'center' : (i % 4 === 1 ? 'left' : 'right')
    return `${inst} (${pan})`
  })

  const prompt = [
    `${mood} ${genre} track${secondaryClause}, ${tempo} BPM in ${keyScale}, ${timeSig} time signature.`,
    `Chord progression: ${chords} — voiced with genre-appropriate inversions and extensions, transitioned smoothly between sections.`,
    `Arrangement built around: ${instrumentDetails.join('; ')}. Each element occupies a distinct frequency pocket and stereo position in the mix.`,
    `Rhythm and groove: ${rhythm}`,
    `${vocalLine}`,
    `Production palette: ${productionAdjectives}.`,
    `${refClause}`,
    `Lyrical direction: ${lyricTheme}. Phrasing mirrors the genre's idiomatic cadence — internal rhyme density, line lengths, syllable counts per bar, and breath placement all aligned to the ${tempo} BPM groove. Rhyme scheme: ABAB on verses for tension, AABB on choruses for resolution, free on the bridge for contrast.`,
    `Emotional scene: ${scene}`,
    `Dynamic arc: Intro (8 bars) — sparse instrumentation establishing the tonal world and mood at 30% energy. Verse 1 (16 bars) — core groove enters, melody introduced at 55% energy, rhythmic foundation locked in. Pre-chorus (8 bars) — harmonic tension builds via rising bass line and filter sweeps, energy climbing to 75%. Chorus (16 bars) — full arrangement hits at 100% energy, hook delivered with all instruments firing, widest stereo image. Verse 2 (16 bars) — verse groove returns with subtle new elements (counter-melody, percussion variation). Chorus 2 (16 bars) — repeat with doubled vocals or new harmonic layer. Bridge (8 bars) — decisive shift: key change, half-time feel, or stripped arrangement to create contrast at 40% energy. Final Chorus (16 bars) — biggest arrangement moment, ad-libs and layers stacked, 110% energy. Outro (8 bars) — graceful resolution on the strongest melodic motif, elements dropping out one by one.`,
    `Mix targets: -14 LUFS integrated loudness, -1 dBTP true peak. Mono bass below 120Hz. Vocal sitting at -6dB to -3dB relative to instrumental bed. Kick and snare cutting through at -8dB to -6dB with 3-5kHz transient presence. Pads and reverb returns sitting at -18dB to -12dB for depth without masking. Stereo width at 70-85% on master, collapsing to mono cleanly. Reverb and delay tails timed to tempo (1/4 note = ${Math.round(60000 / tempo)}ms) so tails breathe between phrases. Master bus: gentle glue compression (2:1, 2-3dB GR), linear-phase EQ for tonal shaping, brickwall limiter at -1dB TP.`,
  ].join(' ')

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
  const instruments = context.genre_profile?.instrumentation ?? []
  const ref = bestStyleReference(context)

  if (field === 'mood') {
    const base = value.toLowerCase() === 'sad' ? 'melancholic' : (value || mood)
    return `${base} — built around a nuanced emotional contour with clear dynamic movement: verses carry restrained intensity (30-50% energy) with intimate production choices (close-mic feel, narrow stereo, dry signal), building through pre-choruses with rising harmonic tension and filter sweeps, releasing into choruses at full energy with widened stereo field, stacked harmonies, and saturated low end. The mood should dictate specific production choices: reverb tail lengths (shorter = more intimate, longer = more epic), harmonic spacing (close voicings = warm/intimate, wide voicings = expansive/cinematic), vocal proximity (dry and close for vulnerability, wet and distant for ethereal detachment), and rhythmic density (sparse = contemplative, dense = urgent). Key emotional pivot point on the bridge: shift from ${base} toward its emotional complement to create contrast, then resolve back to the core mood with renewed conviction on the final chorus. Reference: ${ref}.`
  }

  if (field === 'music_prompt') {
    const scaffold = suggestMusicPrompt(context)
    if (!value) return scaffold
    return `${value}. ${scaffold} The user's original intent above is the emotional anchor and creative north star — every structural detail below serves to sharpen that vision into a production-ready, generation-grade prompt with zero ambiguity for the audio model.`
  }

  if (field === 'vocal_style') {
    const base = value || suggestVocalStyle(context)
    const vocalIntensity = context.vocal?.intensity ?? 6
    const vocalLang = context.vocal?.languages?.[0] ?? 'English'
    return `${base} — ${vocalLang} vocal at intensity ${vocalIntensity}/10 with refined articulation and genre-aligned phrasing. Verse delivery: breath-textured intimacy, softer dynamics (chest voice or head voice depending on register), conversational phrasing with slight rhythmic push-pull against the ${tempo} BPM grid. Pre-chorus: gradual intensity build, longer sustained notes, rising pitch contour signaling the approaching hook. Chorus: controlled belt or full mixed voice on the hook melody, confident and rhythmically locked, doubled with harmony (3rd above or octave) panned L30/R30. Bridge: stripped-back delivery — single voice, exposed, emotionally raw. Processing chain: lead vocal through LA-2A-style optical compression (3-4dB GR, slow attack for transient preservation), 1/8-note stereo ping-pong delay at -12dB (wet), medium plate reverb (1.6s decay, pre-delay 40ms), gentle de-esser at 6-8kHz, presence boost +2dB at 3.5kHz. Harmony bus: wider reverb, heavier compression, sitting behind the lead at -6dB. ${genre}-specific nuance: pitch inflection on phrase endings, genre-idiomatic melisma or vibrato, breath placement on beats 4 and 8 for natural phrasing. Reference: ${ref}.`
  }

  if (field === 'lyric_theme') {
    const base = value || `${mood} ${genre} narrative`
    return `${base} — developed across a three-act emotional arc: Act 1 (Verses) establishes the world and central tension through specific sensory imagery (not abstract statements — show, don't tell), using ${genre}-idiomatic vocabulary and conversational syntax. Act 2 (Chorus/Hook) distills the emotional core into a single repeatable phrase that functions as both lyrical and melodic payoff — the hook should be immediately singable after one listen. Act 3 (Bridge) introduces the twist, revelation, or emotional pivot that reframes everything before it. Rhyme scheme: ABAB on verses (tension through alternating resolution), AABB on chorus (satisfaction through immediate payoff), free verse on bridge (liberation from pattern = emotional surprise). Syllable density: match ${tempo} BPM groove — approximately ${Math.round(tempo / 15)} syllables per bar for verses, fewer on chorus for impact. Internal rhyme on every other line. No clichés — replace every first-draft phrase with a specific, original image. Thematic references should be culturally aligned with ${genre} tradition.`
  }

  if (field === 'video_style') {
    const base = value || suggestVideoStyle(context)
    return `${base} — cinematic music video direction: opening shot establishes location and mood through color grading (${mood === 'dark' ? 'desaturated teal and orange' : mood === 'happy' ? 'warm golden tones, high saturation' : mood === 'melancholic' ? 'muted blues and grays, film grain' : 'rich contrast, cinematic LUT'}). Camera: mix of steady tracking shots (verses), handheld intimate close-ups (emotional peaks), and sweeping drone/crane shots (chorus). Edit rhythm: cuts synchronized to tempo at ${tempo} BPM — slow dissolves on verses (cut every 2-4 bars), sharp cuts on beat on chorus (cut every 1-2 bars), flash cuts and strobes on drops. Visual motifs: recurring symbolic element tied to the lyric theme, light/shadow interplay reinforcing the ${mood} mood. Particle effects and lens flares on the climax. Color shift on bridge section to signal emotional pivot. Aspect ratio: 16:9 cinematic with optional letterboxing. Post-production: subtle film grain, controlled lens distortion, color-matched to the genre's visual language.`
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
