import type { CANONICAL_MOODS, CREATION_MODES, VOCAL_ARRANGEMENTS } from './CONSTANTS';

export type CreationMode = typeof CREATION_MODES[keyof typeof CREATION_MODES];
export type VocalArrangement = typeof VOCAL_ARRANGEMENTS[keyof typeof VOCAL_ARRANGEMENTS];
export type CanonicalMood = typeof CANONICAL_MOODS[number];

export interface RawUserInput {
  creation_mode: CreationMode;
  album_song_count?: number;
  track_name: string;
  music_prompt: string;
  genres: string[];
  subgenres: string[];
  tempo_bpm: number;
  duration_seconds: number;
  mood: string;
  song_structure: string;
  vocal_arrangement: VocalArrangement;
  vocal_style: string;
  vocal_intensity: number;
  vocal_effects: string[];
  vocal_language: string[];
  lyric_theme: string;
  lyrics: string | null;
  artist_inspiration: string[];
  generate_video: boolean;
  video_style: string | null;
}

export interface MoodVector {
  label: string;
  valence: number;
  arousal: number;
  tension: number;
}

export interface StructureSegment {
  name: string;
  order: number;
  duration_ratio: number;
}

export interface VocalStyleVector {
  register: 'low' | 'mid' | 'high';
  technique: string;
  texture: string;
}

export interface ArtistStyleReference {
  artist: string;
  genre: string;
  mood: string;
  era: string;
  production_style: string;
}

export interface StyleVector {
  genre_bias: Record<string, number>;
  mood_bias: Record<string, number>;
  era_distribution: Record<string, number>;
  production_styles: string[];
}

export interface GenreProfile {
  primary: string;
  secondary: string[];
  instrumentation: string[];
  rhythm_pattern: string;
}

export interface VocalProfile {
  arrangement: VocalArrangement;
  style: string;
  style_vector: VocalStyleVector;
  intensity: number;
  effects: string[];
  languages: string[];
}

export interface LyricsProfile {
  theme: string;
  content: string | null;
  sentiment: {
    valence: number;
    tension: number;
  } | null;
  requires_adjustment: boolean;
}

export interface VisualProfile {
  enabled: boolean;
  style: string | null;
  color_palette: string | null;
  motion_style: string | null;
  visual_direction: string | null;
}

export interface AudioParameters {
  energy: number;
  tempo_bpm: number;
  rhythm_pattern: string;
  structure: StructureSegment[];
  instrumentation: string[];
  mixing_style: string;
  sound_design_style: string;
}

export interface VisualParameters {
  enabled: boolean;
  style: string | null;
  color_palette: string | null;
  motion_style: string | null;
  visual_direction: string | null;
}

export interface NormalizedInput {
  creation_mode: CreationMode;
  album_song_count: number | null;
  track_name: string;
  music_prompt: string;
  genres: string[];
  genre_profile: GenreProfile;
  subgenres: string[];
  tempo_bpm: number;
  duration_seconds: number;
  mood: MoodVector;
  song_structure: string;
  structure_segments: StructureSegment[];
  vocal_arrangement: VocalArrangement;
  vocal_style: string;
  vocal_style_vector: VocalStyleVector;
  vocal_intensity: number;
  vocal_effects: string[];
  vocal_language: string[];
  lyric_theme: string;
  lyrics: string | null;
  lyrics_profile: LyricsProfile;
  artist_inspiration: string[];
  style_reference: ArtistStyleReference[];
  style_vector: StyleVector;
  generate_video: boolean;
  video_style: string | null;
}

export interface ConflictItem {
  field: string;
  conflict: string;
  resolution: string;
}

export type ConflictReport = ConflictItem[];

export interface GenerationIntent {
  meta: {
    creation_mode: CreationMode;
    album_song_count: number | null;
    track_name: string;
    duration_seconds: number;
  };
  mood: {
    label: string;
    valence: number;
    arousal: number;
    tension: number;
  };
  energy: number;
  tempo_bpm: number;
  genre_profile: {
    primary: string;
    secondary: string[];
    instrumentation: string[];
    rhythm_pattern: string;
  };
  structure: {
    raw: string;
    segments: Array<{
      name: string;
      order: number;
      duration_ratio: number;
    }>;
  };
  vocal: {
    arrangement: VocalArrangement;
    style: string;
    style_vector: {
      register: 'low' | 'mid' | 'high';
      technique: string;
      texture: string;
    };
    intensity: number;
    effects: string[];
    languages: string[];
  };
  lyrics: {
    theme: string;
    content: string | null;
    sentiment: {
      valence: number;
      tension: number;
    } | null;
  };
  style_reference: Array<{
    artist: string;
    genre: string;
    mood: string;
    era: string;
    production_style: string;
  }>;
  audio_parameters: {
    mixing_style: string;
    sound_design_style: string;
    instrumentation: string[];
    rhythm_pattern: string;
  };
  visual: {
    enabled: boolean;
    style: string | null;
    color_palette: string | null;
    motion_style: string | null;
    visual_direction: string | null;
  };
  generation_prompt: string;
}

