export interface CreativeContext {
  // Primary Inputs
  songDescription: string;
  songTitle: string;

  // Musical Attributes
  genre: string;
  subgenre?: string;
  mood: string;
  tempo: number;
  duration: number;

  // Vocal Attributes
  vocalsEnabled: boolean;
  vocalStyle: string;
  vocalGender?: string;
  vocalLanguage: string;
  vocalIntensity: number;
  vocalEffects: string[];

  // Lyrics Attributes
  lyricsMode: 'auto' | 'manual' | 'none';
  lyricsText?: string;
  lyricsTheme?: string;

  // Arrangement & Style
  artistInspiration: string;
  instruments: string[];
  energyLevel: number;
  structureType: string;

  // Visuals
  videoStyle: string;
  visualizerEnabled: boolean;

  // System & Meta
  creativityLevel: number;
  variationSeed: string;
  generationMode: 'fast' | 'quality' | 'standard';

  // Additional properties used by router
  instrumentalOnly?: boolean;
  useHighQualityVocals?: boolean;
  lyrics?: string;

  // Legacy/Internal (to be phased out or mapped)
  vocalLanguages?: string[];
  songStructure?: string;
}

export type SuggestionField = keyof CreativeContext;

export const HIGH_QUALITY_VOCAL_LANGUAGES = [
  "Punjabi", "Hindi", "Urdu", "Bengali", "Tamil", "Telugu",
  "Kannada", "Malayalam", "Arabic", "Yoruba", "Swahili", "Amharic",
  "Marathi", "Gujarati", "Odia", "Assamese"
];

export const ELEVENLABS_MUSIC_LANGUAGES = [
  "English", "Spanish", "French", "German", "Italian", "Portuguese",
  "Dutch", "Polish", "Swedish", "Norwegian", "Danish", "Finnish", "Turkish"
];

export const ACE_STEP_PRIMARY_LANGUAGES = [
  "Korean", "Japanese", "Mandarin"
];

export function shouldUseElevenLabsMusic(language: string): boolean {
  return ELEVENLABS_MUSIC_LANGUAGES.includes(language);
}

export function shouldUseTTSMixPath(language: string): boolean {
  return HIGH_QUALITY_VOCAL_LANGUAGES.includes(language);
}

export function shouldRecommendHighQualityVocals(language: string): boolean {
  return HIGH_QUALITY_VOCAL_LANGUAGES.includes(language);
}
