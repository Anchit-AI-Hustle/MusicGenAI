import { describe, expect, it } from 'vitest';
import { buildAlbumPlan } from '@/engine/albumPlanBuilder';
import { resolveConflicts } from '@/engine/conflictResolver';
import { buildGenerationIntent } from '@/engine/intentBuilder';
import {
  GENRE_INSTRUMENTATION_MAP,
  moodToVector,
  normalize,
} from '@/engine/normalizer';
import {
  enhanceField,
  newAlternativeField,
  suggestMood,
  suggestMusicPrompt,
  suggestSongStructure,
  suggestTempo,
  suggestVideoStyle,
  suggestVocalStyle,
} from '@/engine/suggestEngine';
import type { RawUserInput } from '@/engine/types';

const baseRawInput: RawUserInput = {
  creation_mode: 'single',
  track_name: 'Test Track',
  music_prompt: 'Dark hip-hop with cinematic textures and controlled vocal dynamics',
  genres: ['hip-hop'],
  subgenres: ['trap'],
  tempo_bpm: 90,
  duration_seconds: 180,
  mood: 'dark',
  song_structure: 'Intro-Verse-Chorus-Verse-Chorus-Bridge-Chorus-Outro',
  vocal_arrangement: 'solo',
  vocal_style: 'raspy',
  vocal_intensity: 7,
  vocal_effects: ['reverb'],
  vocal_language: ['English'],
  lyric_theme: 'late-night ambition',
  lyrics: null,
  artist_inspiration: ['The Weeknd'],
  generate_video: false,
  video_style: null,
};

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

describe('normalize()', () => {
  it('maps all canonical moods correctly', () => {
    const expected: Record<string, { valence: number; arousal: number; tension: number }> = {
      happy: { valence: 9, arousal: 7, tension: 2 },
      sad: { valence: 2, arousal: 3, tension: 5 },
      angry: { valence: 3, arousal: 9, tension: 9 },
      romantic: { valence: 8, arousal: 5, tension: 3 },
      epic: { valence: 7, arousal: 9, tension: 8 },
      melancholic: { valence: 3, arousal: 4, tension: 6 },
      euphoric: { valence: 10, arousal: 10, tension: 1 },
      dark: { valence: 2, arousal: 6, tension: 8 },
      chill: { valence: 6, arousal: 2, tension: 1 },
      tense: { valence: 4, arousal: 7, tension: 10 },
    };

    for (const [label, vector] of Object.entries(expected)) {
      const result = moodToVector(label);
      expect(result.label).toBe(label);
      expect(result.valence).toBe(vector.valence);
      expect(result.arousal).toBe(vector.arousal);
      expect(result.tension).toBe(vector.tension);
    }
  });

  it('maps all known genre instrumentation profiles', () => {
    for (const [genre, instruments] of Object.entries(GENRE_INSTRUMENTATION_MAP)) {
      const normalized = normalize({
        ...baseRawInput,
        genres: [genre],
        music_prompt: `${genre} style production`,
      });

      for (const instrument of instruments) {
        expect(normalized.genre_profile.instrumentation).toContain(instrument);
      }
    }
  });
});

describe('resolveConflicts()', () => {
  it('applies C1 Genre-Tempo mismatch clamps', () => {
    const hipHop = resolveConflicts(normalize({ ...baseRawInput, genres: ['hip-hop'], tempo_bpm: 180 }));
    expect(hipHop.resolved.tempo_bpm).toBe(140);

    const classical = resolveConflicts(normalize({ ...baseRawInput, genres: ['classical'], tempo_bpm: 190 }));
    expect(classical.resolved.tempo_bpm).toBe(160);

    const metal = resolveConflicts(normalize({ ...baseRawInput, genres: ['metal'], tempo_bpm: 80 }));
    expect(metal.resolved.tempo_bpm).toBe(100);

    const edm = resolveConflicts(normalize({ ...baseRawInput, genres: ['edm'], tempo_bpm: 90 }));
    expect(edm.resolved.tempo_bpm).toBe(118);

    const jazz = resolveConflicts(normalize({ ...baseRawInput, genres: ['jazz'], tempo_bpm: 220 }));
    expect(jazz.resolved.tempo_bpm).toBe(200);
  });

  it('applies C2 Mood-Lyrics mismatch with adjustment flag', () => {
    const normalized = normalize({
      ...baseRawInput,
      mood: 'happy',
      lyrics: 'pain tears broken dark grief regret fear',
    });

    const { resolved, report } = resolveConflicts(normalized);
    expect(resolved.lyrics_profile.sentiment).not.toBeNull();
    expect(resolved.lyrics_profile.requires_adjustment).toBe(true);
    expect(report.some((item) => item.field === 'lyrics')).toBe(true);
  });

  it('applies C3 Vocal-Genre incompatibility rules', () => {
    const classical = resolveConflicts(normalize({
      ...baseRawInput,
      genres: ['classical'],
      vocal_effects: ['autotune', 'reverb'],
    }));
    expect(classical.resolved.vocal_effects).not.toContain('autotune');

    const instrumental = resolveConflicts(normalize({
      ...baseRawInput,
      genres: ['instrumental'],
      vocal_arrangement: 'duet',
    }));
    expect(instrumental.resolved.vocal_arrangement).toBe('none');

    const edmChoir = resolveConflicts(normalize({
      ...baseRawInput,
      genres: ['edm'],
      vocal_arrangement: 'choir',
    }));
    expect(edmChoir.resolved.vocal_arrangement).toBe('solo');
  });

  it('applies C4 Video-Audio alignment fallback', () => {
    const { resolved, report } = resolveConflicts(normalize({
      ...baseRawInput,
      generate_video: true,
      video_style: null,
      mood: 'dark',
      genres: ['hip-hop'],
    }));

    expect(resolved.video_style).toBe('cinematic noir');
    expect(report.some((item) => item.field === 'video_style')).toBe(true);
  });

  it('applies C5 Album song count validation', () => {
    const albumInput = normalize({
      ...baseRawInput,
      creation_mode: 'album',
      album_song_count: 8,
      generate_video: true,
      video_style: 'soft cinematic',
    });
    albumInput.album_song_count = null;
    const albumResolved = resolveConflicts(albumInput);
    expect(albumResolved.resolved.album_song_count).toBe(8);

    const singleInput = normalize({ ...baseRawInput, creation_mode: 'single' });
    singleInput.album_song_count = 10;
    const singleResolved = resolveConflicts(singleInput);
    expect(singleResolved.resolved.album_song_count).toBeNull();
  });

  it('applies C6 Duration-Structure mismatch adjustments', () => {
    const short = resolveConflicts(normalize({
      ...baseRawInput,
      duration_seconds: 45,
      song_structure: 'Intro-Verse-Chorus-Bridge-Outro',
    }));
    expect(short.resolved.song_structure).toBe('Verse-Chorus-Outro');

    const long = resolveConflicts(normalize({
      ...baseRawInput,
      duration_seconds: 360,
      song_structure: 'Verse-Chorus-Outro',
    }));
    expect(long.resolved.song_structure).toContain('Bridge');
  });
});

describe('buildGenerationIntent()', () => {
  it('builds single hip-hop dark track intent', () => {
    const { intent } = buildGenerationIntent({
      ...baseRawInput,
      creation_mode: 'single',
      genres: ['hip-hop'],
      mood: 'dark',
      tempo_bpm: 90,
      vocal_arrangement: 'solo',
    });

    expect(intent.meta.creation_mode).toBe('single');
    expect(intent.genre_profile.primary).toBe('hip-hop');
    expect(intent.mood.label).toBe('dark');
    expect(intent.tempo_bpm).toBe(90);
    expect(intent.vocal.arrangement).toBe('solo');
  });

  it('builds album pop intent with video enabled', () => {
    const { intent } = buildGenerationIntent({
      ...baseRawInput,
      creation_mode: 'album',
      album_song_count: 6,
      genres: ['pop'],
      mood: 'happy',
      generate_video: true,
      video_style: 'soft cinematic',
    });

    expect(intent.meta.creation_mode).toBe('album');
    expect(intent.meta.album_song_count).toBe(6);
    expect(intent.genre_profile.primary).toBe('pop');
    expect(intent.visual.enabled).toBe(true);
    expect(intent.visual.style).toBe('soft cinematic');
  });

  it('builds classical instrumental epic intent', () => {
    const { intent } = buildGenerationIntent({
      ...baseRawInput,
      genres: ['classical', 'instrumental'],
      mood: 'epic',
      vocal_arrangement: 'none',
      vocal_style: 'operatic',
      vocal_effects: ['reverb'],
      lyrics: null,
      generate_video: false,
      video_style: null,
    });

    expect(intent.genre_profile.primary).toBe('classical');
    expect(intent.vocal.arrangement).toBe('none');
    expect(intent.mood.label).toBe('epic');
    expect(intent.visual.enabled).toBe(false);
  });
});

describe('buildAlbumPlan()', () => {
  it('creates an album arc with required variation rules', () => {
    const { intent: baseIntent } = buildGenerationIntent({
      ...baseRawInput,
      creation_mode: 'album',
      album_song_count: 6,
      genres: ['pop'],
      mood: 'happy',
      generate_video: true,
      video_style: 'soft cinematic',
    });

    const plan = buildAlbumPlan(baseIntent, 6);
    expect(plan).toHaveLength(6);

    for (const song of plan) {
      expect(song.genre_profile.primary).toBe(baseIntent.genre_profile.primary);
      expect(song.style_reference).toEqual(baseIntent.style_reference);
      expect(song.vocal.languages).toEqual(baseIntent.vocal.languages);
    }

    expect(plan[0].energy).toBeGreaterThanOrEqual(7);
    expect(plan[2].energy).toBeGreaterThan(plan[1].energy);

    const middleSlice = plan.slice(2, 4);
    expect(middleSlice.some((song) => song.energy <= 4.5)).toBe(true);

    expect(plan[4].energy).toBeGreaterThanOrEqual(plan[3].energy);
    expect(plan[5].mood.tension).toBeLessThanOrEqual(4);

    for (let i = 1; i < plan.length; i += 1) {
      expect(plan[i].mood.label).not.toBe(plan[i - 1].mood.label);
    }

    const tempos = plan.map((song) => song.tempo_bpm);
    expect(Math.max(...tempos) - Math.min(...tempos)).toBeGreaterThanOrEqual(20);
  });
});

describe('suggestEngine()', () => {
  it('handles empty input deterministically', () => {
    const mood = suggestMood({});
    const tempo = suggestTempo({});
    const prompt = suggestMusicPrompt({});

    expect(['happy', 'sad', 'angry', 'romantic', 'epic', 'melancholic', 'euphoric', 'dark', 'chill', 'tense']).toContain(mood);
    expect(tempo).toBeGreaterThanOrEqual(40);
    expect(tempo).toBeLessThanOrEqual(220);
    expect(countWords(prompt)).toBeGreaterThanOrEqual(30);
    expect(countWords(prompt)).toBeLessThanOrEqual(80);
  });

  it('respects context constraints in suggestions', () => {
    const context = normalize({
      ...baseRawInput,
      genres: ['hip-hop'],
      mood: 'dark',
      generate_video: true,
      video_style: 'cinematic noir',
    });

    const prompt = suggestMusicPrompt(context);
    expect(prompt.toLowerCase()).toContain('hip-hop');

    const structure = suggestSongStructure(context);
    expect(structure).toContain('Hook');

    const vocalStyle = suggestVocalStyle(context);
    expect(vocalStyle).toContain('rhythmic');

    const videoStyle = suggestVideoStyle(context);
    expect(videoStyle.toLowerCase()).toContain('cinematic noir');

    const enhanced = enhanceField('music_prompt', 'dark trap song', context);
    expect(enhanced.toLowerCase()).toContain('dark');

    const alternativeMood = newAlternativeField('mood', 'dark', context);
    expect(alternativeMood).not.toBe('happy');
  });
});
