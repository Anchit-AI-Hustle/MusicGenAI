import { z } from 'zod';
import {
  FIELD_LIMITS,
  CREATION_MODES,
  VOCAL_ARRANGEMENTS,
} from './CONSTANTS';

const nonEmptyArray = z.array(z.string().trim().min(1)).min(1);

const moodVectorSchema = z.object({
  label: z.string().min(1),
  valence: z.number().int().min(1).max(10),
  arousal: z.number().int().min(1).max(10),
  tension: z.number().int().min(1).max(10),
});

const structureSegmentSchema = z.object({
  name: z.string().min(1),
  order: z.number().int().min(1),
  duration_ratio: z.number().positive().max(1),
});

const vocalStyleVectorSchema = z.object({
  register: z.union([z.literal('low'), z.literal('mid'), z.literal('high')]),
  technique: z.string().min(1),
  texture: z.string().min(1),
});

const artistStyleReferenceSchema = z.object({
  artist: z.string().min(1),
  genre: z.string().min(1),
  mood: z.string().min(1),
  era: z.string().min(1),
  production_style: z.string().min(1),
});

const genreProfileSchema = z.object({
  primary: z.string().min(1),
  secondary: z.array(z.string().min(1)),
  instrumentation: z.array(z.string().min(1)).max(10),
  rhythm_pattern: z.string().min(1),
});

const lyricsProfileSchema = z.object({
  theme: z.string().min(1),
  content: z.string().nullable(),
  sentiment: z.object({
    valence: z.number().int().min(1).max(10),
    tension: z.number().int().min(1).max(10),
  }).nullable(),
  requires_adjustment: z.boolean(),
});

const styleVectorSchema = z.object({
  genre_bias: z.record(z.string(), z.number()),
  mood_bias: z.record(z.string(), z.number()),
  era_distribution: z.record(z.string(), z.number()),
  production_styles: z.array(z.string().min(1)),
});

export const RawUserInputSchema = z.object({
  creation_mode: z.union([
    z.literal(CREATION_MODES.SINGLE),
    z.literal(CREATION_MODES.ALBUM),
  ]),
  album_song_count: z.number().int().min(FIELD_LIMITS.ALBUM_MIN).max(FIELD_LIMITS.ALBUM_MAX).optional(),
  track_name: z.string().trim().min(1),
  music_prompt: z.string().trim().min(1),
  genres: nonEmptyArray,
  subgenres: nonEmptyArray,
  tempo_bpm: z.number().min(FIELD_LIMITS.TEMPO_MIN).max(FIELD_LIMITS.TEMPO_MAX),
  duration_seconds: z.number().int().min(FIELD_LIMITS.DURATION_MIN).max(FIELD_LIMITS.DURATION_MAX),
  mood: z.string().trim().min(1),
  song_structure: z.string().trim().min(1),
  vocal_arrangement: z.union([
    z.literal(VOCAL_ARRANGEMENTS.SOLO),
    z.literal(VOCAL_ARRANGEMENTS.DUET),
    z.literal(VOCAL_ARRANGEMENTS.CHOIR),
    z.literal(VOCAL_ARRANGEMENTS.NONE),
  ]),
  vocal_style: z.string().trim().min(1),
  vocal_intensity: z.number().int().min(FIELD_LIMITS.VOCAL_INTENSITY_MIN).max(FIELD_LIMITS.VOCAL_INTENSITY_MAX),
  vocal_effects: nonEmptyArray,
  vocal_language: nonEmptyArray,
  lyric_theme: z.string().trim().min(1),
  lyrics: z.string().nullable(),
  artist_inspiration: nonEmptyArray,
  generate_video: z.boolean(),
  video_style: z.string().trim().min(1).nullable(),
}).superRefine((value, ctx) => {
  if (value.creation_mode === CREATION_MODES.ALBUM && value.album_song_count === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'album_song_count is required when creation_mode is album',
      path: ['album_song_count'],
    });
  }

  if (value.creation_mode === CREATION_MODES.SINGLE && value.album_song_count !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'album_song_count must be omitted when creation_mode is single',
      path: ['album_song_count'],
    });
  }

  if (value.generate_video && !value.video_style) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'video_style is required when generate_video is true',
      path: ['video_style'],
    });
  }
});

export const NormalizedInputSchema = z.object({
  creation_mode: z.union([z.literal(CREATION_MODES.SINGLE), z.literal(CREATION_MODES.ALBUM)]),
  album_song_count: z.number().int().min(FIELD_LIMITS.ALBUM_MIN).max(FIELD_LIMITS.ALBUM_MAX).nullable(),
  track_name: z.string().min(1),
  music_prompt: z.string().min(1),
  genres: nonEmptyArray,
  genre_profile: genreProfileSchema,
  subgenres: z.array(z.string().min(1)),
  tempo_bpm: z.number().min(FIELD_LIMITS.TEMPO_MIN).max(FIELD_LIMITS.TEMPO_MAX),
  duration_seconds: z.number().int().min(FIELD_LIMITS.DURATION_MIN).max(FIELD_LIMITS.DURATION_MAX),
  mood: moodVectorSchema,
  song_structure: z.string().min(1),
  structure_segments: z.array(structureSegmentSchema).min(1),
  vocal_arrangement: z.union([
    z.literal(VOCAL_ARRANGEMENTS.SOLO),
    z.literal(VOCAL_ARRANGEMENTS.DUET),
    z.literal(VOCAL_ARRANGEMENTS.CHOIR),
    z.literal(VOCAL_ARRANGEMENTS.NONE),
  ]),
  vocal_style: z.string().min(1),
  vocal_style_vector: vocalStyleVectorSchema,
  vocal_intensity: z.number().int().min(FIELD_LIMITS.VOCAL_INTENSITY_MIN).max(FIELD_LIMITS.VOCAL_INTENSITY_MAX),
  vocal_effects: z.array(z.string().min(1)),
  vocal_language: nonEmptyArray,
  lyric_theme: z.string().min(1),
  lyrics: z.string().nullable(),
  lyrics_profile: lyricsProfileSchema,
  artist_inspiration: nonEmptyArray,
  style_reference: z.array(artistStyleReferenceSchema),
  style_vector: styleVectorSchema,
  generate_video: z.boolean(),
  video_style: z.string().nullable(),
});

export const GenerationIntentSchema = z.object({
  meta: z.object({
    creation_mode: z.union([z.literal(CREATION_MODES.SINGLE), z.literal(CREATION_MODES.ALBUM)]),
    album_song_count: z.number().int().nullable(),
    track_name: z.string().min(1),
    duration_seconds: z.number().int().min(FIELD_LIMITS.DURATION_MIN).max(FIELD_LIMITS.DURATION_MAX),
  }),
  mood: moodVectorSchema,
  energy: z.number().min(1).max(10),
  tempo_bpm: z.number().min(FIELD_LIMITS.TEMPO_MIN).max(FIELD_LIMITS.TEMPO_MAX),
  genre_profile: z.object({
    primary: z.string().min(1),
    secondary: z.array(z.string()),
    instrumentation: z.array(z.string()).max(10),
    rhythm_pattern: z.string().min(1),
  }),
  structure: z.object({
    raw: z.string().min(1),
    segments: z.array(structureSegmentSchema).min(1),
  }),
  vocal: z.object({
    arrangement: z.union([
      z.literal(VOCAL_ARRANGEMENTS.SOLO),
      z.literal(VOCAL_ARRANGEMENTS.DUET),
      z.literal(VOCAL_ARRANGEMENTS.CHOIR),
      z.literal(VOCAL_ARRANGEMENTS.NONE),
    ]),
    style: z.string().min(1),
    style_vector: vocalStyleVectorSchema,
    intensity: z.number().int().min(FIELD_LIMITS.VOCAL_INTENSITY_MIN).max(FIELD_LIMITS.VOCAL_INTENSITY_MAX),
    effects: z.array(z.string()),
    languages: nonEmptyArray,
  }),
  lyrics: z.object({
    theme: z.string().min(1),
    content: z.string().nullable(),
    sentiment: z.object({
      valence: z.number().int().min(1).max(10),
      tension: z.number().int().min(1).max(10),
    }).nullable(),
  }),
  style_reference: z.array(artistStyleReferenceSchema),
  audio_parameters: z.object({
    mixing_style: z.string().min(1),
    sound_design_style: z.string().min(1),
    instrumentation: z.array(z.string()).max(10),
    rhythm_pattern: z.string().min(1),
  }),
  visual: z.object({
    enabled: z.boolean(),
    style: z.string().nullable(),
    color_palette: z.string().nullable(),
    motion_style: z.string().nullable(),
    visual_direction: z.string().nullable(),
  }),
  generation_prompt: z.string().min(1),
});
