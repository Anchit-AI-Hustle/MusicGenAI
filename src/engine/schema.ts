import { z } from 'zod'

export const RawUserInputSchema = z.object({
  creation_mode: z.enum(['single', 'album']),
  album_song_count: z.number().int().min(2).max(20).optional(),
  track_name: z.string().min(1),
  music_prompt: z.string().min(10).max(12000),
  genres: z.array(z.string().min(1)).min(1),
  subgenres: z.array(z.string()).optional(),
  tempo_bpm: z.number().min(40).max(220),
  duration_seconds: z.number().min(30).max(600),
  mood: z.string().min(1),
  song_structure: z.string().min(1),
  vocal_arrangement: z.enum(['solo', 'duet', 'choir', 'none']),
  vocal_style: z.string().min(1),
  vocal_intensity: z.number().int().min(1).max(10),
  vocal_effects: z.array(z.string()).optional(),
  vocal_language: z.array(z.string()).optional(),
  lyric_theme: z.string().min(1),
  lyrics: z.string().nullable().optional(),
  artist_inspiration: z.array(z.string()).optional(),
  generate_video: z.boolean(),
  video_style: z.string().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.creation_mode === 'album' && !data.album_song_count) {
    // Will be defaulted in conflict resolver — just warn
  }
  if (data.creation_mode === 'single' && data.album_song_count !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['album_song_count'],
      message: 'album_song_count must not be set when creation_mode is single',
    })
  }
  if (data.generate_video === false && data.video_style) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['video_style'],
      message: 'video_style must not be set when generate_video is false',
    })
  }
})
