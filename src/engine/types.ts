export interface MoodVector {
  valence: number
  arousal: number
  tension: number
}

export interface StructureSegment {
  name: string
  order: number
  duration_ratio: number
}

export interface VocalStyleVector {
  register: 'low' | 'mid' | 'high'
  technique: string
  texture: string
}

export interface ArtistStyleVector {
  artist: string
  genre: string
  mood: string
  era: string
  production_style: string
}

export interface GenreProfile {
  primary: string
  secondary: string[]
  instrumentation: string[]
  rhythm_pattern: string
}

export interface VocalProfile {
  arrangement: 'solo' | 'duet' | 'choir' | 'none'
  style: string
  style_vector: VocalStyleVector
  intensity: number
  effects: string[]
  languages: string[]
}

export interface LyricsProfile {
  theme: string
  content: string | null
  sentiment: MoodVector | null
}

export interface VisualProfile {
  enabled: boolean
  style: string | null
  color_palette: string | null
  motion_style: string | null
  visual_direction: string | null
}

export interface AudioParameters {
  energy: number
  tempo_bpm: number
  rhythm_pattern: string
  structure: {
    raw: string
    segments: StructureSegment[]
  }
  instrumentation: string[]
  mixing_style: string
  sound_design_style: string
}

export interface ConflictEntry {
  rule: string
  field: string
  original_value: unknown
  resolved_value: unknown
  reason: string
}

export type ConflictReport = ConflictEntry[]

export interface RawUserInput {
  creation_mode: 'single' | 'album'
  album_song_count?: number
  track_name: string
  music_prompt: string
  genres: string[]
  subgenres?: string[]
  tempo_bpm: number
  duration_seconds: number
  mood: string
  song_structure: string
  vocal_arrangement: 'solo' | 'duet' | 'choir' | 'none'
  vocal_style: string
  vocal_intensity: number
  vocal_effects?: string[]
  vocal_language?: string[]
  lyric_theme: string
  lyrics?: string | null
  artist_inspiration?: string[]
  generate_video: boolean
  video_style?: string | null
}

export interface NormalizedInput {
  creation_mode: 'single' | 'album'
  album_song_count: number | null
  track_name: string
  music_prompt: string
  genre_profile: GenreProfile
  subgenres: string[]
  tempo_bpm: number
  duration_seconds: number
  mood: MoodVector & { label: string }
  song_structure: {
    raw: string
    segments: StructureSegment[]
  }
  vocal: VocalProfile
  lyrics: LyricsProfile
  style_reference: ArtistStyleVector[]
  generate_video: boolean
  video_style: string | null
  energy: number
}

export interface GenerationIntent {
  meta: {
    creation_mode: 'single' | 'album'
    album_song_count: number | null
    track_name: string
    duration_seconds: number
  }
  mood: MoodVector & { label: string }
  energy: number
  tempo_bpm: number
  genre_profile: GenreProfile
  structure: {
    raw: string
    segments: StructureSegment[]
  }
  vocal: VocalProfile
  lyrics: LyricsProfile
  style_reference: ArtistStyleVector[]
  audio_parameters: {
    mixing_style: string
    sound_design_style: string
    instrumentation: string[]
    rhythm_pattern: string
  }
  visual: VisualProfile
  generation_prompt: string
}
