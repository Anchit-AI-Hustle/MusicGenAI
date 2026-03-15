export interface CreativeContext {
  songDescription: string;
  genre: string;
  subgenre?: string;
  mood: string;
  tempo: number;
  duration: number;
  vocalStyle: string;
  vocalLanguage: string;
  vocalLanguages?: string[];
  vocalIntensity?: number;
  vocalEffects?: string[];
  vocalGender?: string;
  lyrics: string;
  lyricTheme?: string;
  artistInspiration: string;
  videoStyle: string;
  songStructure?: string;
  instrumentalOnly: boolean;
  useHighQualityVocals?: boolean;
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
