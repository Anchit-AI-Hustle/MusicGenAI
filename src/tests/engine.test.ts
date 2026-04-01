import { describe, expect, it } from 'vitest'
import { buildAlbumPlan } from '@/engine/albumPlanBuilder'
import { resolveConflicts } from '@/engine/conflictResolver'
import { buildGenerationIntent } from '@/engine/intentBuilder'
import {
  GENRE_INSTRUMENTATION_MAP,
  normalize,
  moodToVector,
  parseSongStructure,
  tempoToEnergy,
} from '@/engine/normalizer'
import {
  enhanceField,
  newAlternativeField,
  suggestMood,
  suggestMusicPrompt,
  suggestTempo,
} from '@/engine/suggestEngine'
import type { RawUserInput } from '@/engine/types'

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

const baseInput: RawUserInput = {
  creation_mode: 'single',
  track_name: 'Base',
  music_prompt: 'dark hip-hop with heavy 808s and melancholic piano',
  genres: ['hip-hop'],
  subgenres: ['trap'],
  tempo_bpm: 90,
  duration_seconds: 210,
  mood: 'dark',
  song_structure: 'Intro-Verse-Hook-Verse-Hook-Bridge-Hook-Outro',
  vocal_arrangement: 'solo',
  vocal_style: 'raspy',
  vocal_intensity: 7,
  vocal_effects: ['reverb', 'delay'],
  vocal_language: ['English'],
  lyric_theme: 'isolation and ambition',
  lyrics: null,
  artist_inspiration: ['The Weeknd', 'Kendrick Lamar'],
  generate_video: false,
  video_style: null,
}

describe('GROUP 1: normalize()', () => {
  it('maps all canonical moods exactly', () => {
    expect(moodToVector('happy')).toMatchObject({ valence: 9, arousal: 7, tension: 2 })
    expect(moodToVector('sad')).toMatchObject({ valence: 2, arousal: 3, tension: 5 })
    expect(moodToVector('angry')).toMatchObject({ valence: 3, arousal: 9, tension: 9 })
    expect(moodToVector('romantic')).toMatchObject({ valence: 8, arousal: 5, tension: 3 })
    expect(moodToVector('epic')).toMatchObject({ valence: 7, arousal: 9, tension: 8 })
    expect(moodToVector('melancholic')).toMatchObject({ valence: 3, arousal: 4, tension: 6 })
    expect(moodToVector('euphoric')).toMatchObject({ valence: 10, arousal: 10, tension: 1 })
    expect(moodToVector('dark')).toMatchObject({ valence: 2, arousal: 6, tension: 8 })
    expect(moodToVector('chill')).toMatchObject({ valence: 6, arousal: 2, tension: 1 })
    expect(moodToVector('tense')).toMatchObject({ valence: 4, arousal: 7, tension: 10 })
  })

  it('keyword heuristic scores brutal as high arousal and high tension', () => {
    const mood = moodToVector('brutal')
    expect(mood.arousal).toBeGreaterThanOrEqual(6)
    expect(mood.tension).toBeGreaterThanOrEqual(6)
  })

  it('covers all 20 genre instrumentation paths (19 mapped + unknown fallback)', () => {
    for (const [genre, expected] of Object.entries(GENRE_INSTRUMENTATION_MAP)) {
      const normalized = normalize({ ...baseInput, genres: [genre], music_prompt: `${genre} track` })
      expected.forEach((instrument) => expect(normalized.genre_profile.instrumentation).toContain(instrument))
    }

    const fallback = normalize({ ...baseInput, genres: ['unknown-core'], music_prompt: 'granular synth drum guitar atmosphere' })
    expect(fallback.genre_profile.instrumentation.length).toBeGreaterThan(0)
  })

  it('parses song structure and normalizes ratios to sum 1.0', () => {
    const parsed = parseSongStructure('Intro-Verse-Chorus-Outro')
    expect(parsed.segments).toHaveLength(4)
    const sum = parsed.segments.reduce((acc, segment) => acc + segment.duration_ratio, 0)
    expect(Number(sum.toFixed(6))).toBe(1)
  })

  it('derives energy from tempo map (85 => 4, 165 => 10)', () => {
    expect(tempoToEnergy(85)).toBe(4)
    expect(tempoToEnergy(165)).toBe(10)
  })
})

describe('GROUP 2: resolveConflicts()', () => {
  it('C1 hip-hop + 160 BPM clamps to 140', () => {
    const { resolved } = resolveConflicts(normalize({ ...baseInput, genres: ['hip-hop'], tempo_bpm: 160 }))
    expect(resolved.tempo_bpm).toBe(140)
  })

  it('C1 metal + 80 BPM clamps to 100', () => {
    const { resolved } = resolveConflicts(normalize({ ...baseInput, genres: ['metal'], tempo_bpm: 80 }))
    expect(resolved.tempo_bpm).toBe(100)
  })

  it('C1 edm + 100 BPM clamps to 118', () => {
    const { resolved } = resolveConflicts(normalize({ ...baseInput, genres: ['edm'], tempo_bpm: 100 }))
    expect(resolved.tempo_bpm).toBe(118)
  })

  it('C2 happy mood + sad lyrics keeps mood and logs conflict', () => {
    const { resolved, report } = resolveConflicts(normalize({
      ...baseInput,
      mood: 'happy',
      lyrics: 'pain cry broken dark empty despair',
    }))
    expect(resolved.mood.label).toBe('happy')
    expect(report.some((entry) => entry.rule === 'C2')).toBe(true)
  })

  it('C3 classical removes autotune', () => {
    const { resolved } = resolveConflicts(normalize({
      ...baseInput,
      genres: ['classical'],
      vocal_effects: ['autotune', 'reverb'],
    }))
    expect(resolved.vocal.effects).not.toContain('autotune')
  })

  it('C3 edm choir downgraded to solo', () => {
    const { resolved } = resolveConflicts(normalize({
      ...baseInput,
      genres: ['edm'],
      vocal_arrangement: 'choir',
    }))
    expect(resolved.vocal.arrangement).toBe('solo')
  })

  it('C4 dark hip-hop derive cinematic noir when video style missing', () => {
    const { resolved } = resolveConflicts(normalize({
      ...baseInput,
      generate_video: true,
      video_style: null,
      mood: 'dark',
      genres: ['hip-hop'],
    }))
    expect(resolved.video_style).toBe('cinematic noir')
  })

  it('C5 album with no count defaults to 8', () => {
    const normalized = normalize({ ...baseInput, creation_mode: 'album', album_song_count: 8 })
    normalized.album_song_count = null
    const { resolved } = resolveConflicts(normalized)
    expect(resolved.album_song_count).toBe(8)
  })

  it('C6 45s with 5 segments trims to 3', () => {
    const { resolved } = resolveConflicts(normalize({
      ...baseInput,
      duration_seconds: 45,
      song_structure: 'Intro-Verse-Chorus-Bridge-Outro',
    }))
    expect(resolved.song_structure.segments).toHaveLength(3)
  })
})

describe('GROUP 3: buildGenerationIntent()', () => {
  it('Fixture A', () => {
    const fixtureA: RawUserInput = {
      creation_mode: 'single',
      track_name: 'Shadows',
      music_prompt: 'dark hip-hop with heavy 808s and melancholic piano',
      genres: ['hip-hop'],
      tempo_bpm: 90,
      duration_seconds: 210,
      mood: 'dark',
      song_structure: 'Intro-Verse-Hook-Verse-Hook-Bridge-Hook-Outro',
      vocal_arrangement: 'solo',
      vocal_style: 'raspy',
      vocal_intensity: 7,
      vocal_effects: ['reverb', 'delay'],
      vocal_language: ['English'],
      lyric_theme: 'isolation and ambition',
      generate_video: false,
      lyrics: null,
      artist_inspiration: ['The Weeknd', 'Kendrick Lamar'],
      video_style: null,
    }

    const { intent } = buildGenerationIntent(fixtureA)
    expect(intent.genre_profile.primary).toBe('hip-hop')
    expect(intent.mood.label).toBe('dark')
    expect(intent.tempo_bpm).toBe(90)
    expect(intent.vocal.arrangement).toBe('solo')
    expect(words(intent.generation_prompt)).toBeGreaterThanOrEqual(80)
  })

  it('Fixture B', () => {
    const fixtureB: RawUserInput = {
      creation_mode: 'album',
      album_song_count: 6,
      track_name: 'Summer Vibes',
      music_prompt: 'upbeat pop with catchy hooks and bright synths',
      genres: ['pop'],
      tempo_bpm: 115,
      duration_seconds: 195,
      mood: 'happy',
      song_structure: 'Intro-Verse-Chorus-Verse-Chorus-Bridge-Chorus-Outro',
      vocal_arrangement: 'solo',
      vocal_style: 'bright mixed voice',
      vocal_intensity: 8,
      vocal_effects: ['reverb', 'compression'],
      vocal_language: ['English'],
      lyric_theme: 'summer love',
      generate_video: true,
      video_style: null,
      lyrics: null,
      artist_inspiration: ['Taylor Swift', 'Bruno Mars'],
      subgenres: ['dance-pop'],
    }

    const { intent } = buildGenerationIntent(fixtureB)
    expect(intent.visual.enabled).toBe(true)
    expect(intent.visual.style).not.toBeNull()
    expect(intent.meta.creation_mode).toBe('album')
  })

  it('Fixture C', () => {
    const fixtureC: RawUserInput = {
      creation_mode: 'single',
      track_name: 'Eternal',
      music_prompt: 'sweeping orchestral epic with full strings and choir',
      genres: ['classical'],
      tempo_bpm: 95,
      duration_seconds: 360,
      mood: 'epic',
      song_structure: 'Intro-Theme-Development-Recapitulation-Coda',
      vocal_arrangement: 'none',
      vocal_style: 'none',
      vocal_intensity: 1,
      vocal_effects: [],
      vocal_language: [],
      lyric_theme: 'triumph and loss',
      generate_video: false,
      lyrics: null,
      artist_inspiration: ['Hans Zimmer', 'John Williams'],
      video_style: null,
      subgenres: ['orchestral'],
    }

    const { intent } = buildGenerationIntent(fixtureC)
    expect(intent.vocal.arrangement).toBe('none')
    expect(intent.genre_profile.instrumentation).toContain('strings')
    expect(intent.tempo_bpm).toBeLessThanOrEqual(160)
  })
})

describe('GROUP 4: buildAlbumPlan()', () => {
  it('enforces album arc and variation', () => {
    const { intent: baseIntent } = buildGenerationIntent({
      ...baseInput,
      creation_mode: 'album',
      album_song_count: 6,
      track_name: 'Untitled',
      genres: ['pop'],
      mood: 'happy',
      generate_video: true,
      video_style: null,
      music_prompt: 'upbeat pop with polished hooks and bright synth layers',
    })

    const plan = buildAlbumPlan(baseIntent, 6)
    expect(plan).toHaveLength(6)
    expect(plan[0].energy).toBeGreaterThanOrEqual(8)
    expect(plan[5].energy).toBeLessThanOrEqual(4)

    for (let i = 1; i < plan.length; i += 1) {
      expect(plan[i].mood.label).not.toBe(plan[i - 1].mood.label)
    }

    const tempos = plan.map((song) => song.tempo_bpm)
    expect(Math.max(...tempos) - Math.min(...tempos)).toBeGreaterThanOrEqual(20)

    for (const song of plan) {
      expect(song.genre_profile.primary).toBe(baseIntent.genre_profile.primary)
    }
  })
})

describe('GROUP 5: suggestEngine', () => {
  it('suggestMusicPrompt with empty input returns 30-80 words', () => {
    const prompt = suggestMusicPrompt({})
    expect(words(prompt)).toBeGreaterThanOrEqual(30)
    expect(words(prompt)).toBeLessThanOrEqual(80)
  })

  it('suggestMood with metal + 160 returns high-arousal mood', () => {
    const mood = suggestMood({
      genre_profile: { primary: 'metal', secondary: [], instrumentation: [], rhythm_pattern: '' },
      tempo_bpm: 160,
    })
    expect(['angry', 'tense', 'epic', 'dark']).toContain(mood)
  })

  it('enhanceField mood sad keeps melancholic meaning and is longer', () => {
    const enhanced = enhanceField('mood', 'sad', {
      genre_profile: { primary: 'folk', secondary: [], instrumentation: [], rhythm_pattern: '' },
    })
    expect(enhanced.toLowerCase()).toContain('melancholic')
    expect(enhanced.length).toBeGreaterThan('sad'.length)
  })

  it('newAlternativeField dark is different and not opposite', () => {
    const alternative = newAlternativeField('mood', 'dark', {
      genre_profile: { primary: 'hip-hop', secondary: [], instrumentation: [], rhythm_pattern: '' },
      mood: { label: 'dark', valence: 2, arousal: 6, tension: 8 },
    })
    expect(alternative).not.toBe('dark')
    expect(alternative).not.toBe('happy')
    expect(['tense', 'melancholic']).toContain(alternative)
  })

  it('suggestTempo with metal context respects constraints', () => {
    const tempo = suggestTempo({
      genre_profile: { primary: 'metal', secondary: [], instrumentation: [], rhythm_pattern: '' },
      mood: { label: 'angry', valence: 3, arousal: 9, tension: 9 },
    })
    expect(tempo).toBeGreaterThanOrEqual(100)
  })
})
