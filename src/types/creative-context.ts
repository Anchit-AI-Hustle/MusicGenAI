export interface CreativeContext {
  songDescription: string;
  genre: string;
  mood: string;
  tempo: number;
  duration: number;
  vocalStyle: string;
  vocalLanguage: string;
  lyrics: string;
  artistInspiration: string;
  videoStyle: string;
  instrumentalOnly: boolean;
  // useHighQualityVocals: when true, routes South Asian languages through
  // ElevenLabs TTS + instrumental mix instead of ACE-Step integrated vocals.
  // Default: false (use integrated path for speed). User can toggle this.
  useHighQualityVocals: boolean;
}

export type SuggestionField = keyof CreativeContext;

export const SUPPORTED_LANGUAGES = [
  "English", "Hindi", "Punjabi", "Urdu", "Bengali", "Tamil", "Telugu",
  "Kannada", "Malayalam", "Marathi", "Gujarati", "Odia", "Assamese",
  "Spanish", "French", "Portuguese", "German", "Italian", "Russian",
  "Arabic", "Turkish", "Persian", "Korean", "Japanese", "Mandarin",
  "Swahili", "Yoruba", "Hausa", "Amharic", "Tagalog", "Indonesian",
  "Dutch", "Polish", "Ukrainian", "Greek", "Hebrew", "Thai", "Vietnamese",
  "Nepali", "Sinhala", "Burmese", "Khmer", "Lao", "Mongolian",
  "Jamaican Patois", "Zulu", "Xhosa", "Sotho"
];

export const SUPPORTED_GENRES = [
  "Pop", "Rock", "Hip Hop", "R&B", "Soul", "Jazz", "Blues", "Classical",
  "Electronic", "EDM", "House", "Techno", "Ambient", "Lo-fi", "Indie Pop",
  "Folk", "Country", "Reggae", "Dancehall", "Afrobeats", "Amapiano",
  "Latin Pop", "Reggaeton", "Salsa", "Bossa Nova",
  "Bollywood", "Bhangra", "Punjabi Pop", "Punjabi Drill", "Desi Hip Hop",
  "K-Pop", "J-Pop", "Arabic Pop",
  "Trap", "Drill", "UK Drill", "Phonk", "Drum and Bass",
  "Metal", "Punk", "Funk", "Disco", "Synthwave", "Synth-pop"
];

export const SUPPORTED_MOODS = [
  "Happy", "Sad", "Energetic", "Calm", "Romantic", "Aggressive", "Melancholic",
  "Uplifting", "Dark", "Mysterious", "Nostalgic", "Rebellious", "Peaceful",
  "Intense", "Dreamy", "Triumphant", "Heartbroken", "Euphoric", "Tense",
  "Bittersweet", "Chill", "Raw", "Playful"
];

// Languages that benefit significantly from the high-quality dual-path
// (ElevenLabs TTS + instrumental) rather than integrated ACE-Step vocals.
// These are languages where ACE-Step's aceSupportTier is "supported" or "limited"
// rather than "primary", meaning vocal quality is inconsistent.
export const HIGH_QUALITY_VOCAL_LANGUAGES = [
  "Punjabi", "Urdu", "Bengali", "Tamil", "Telugu",
  "Kannada", "Malayalam", "Arabic", "Yoruba", "Swahili", "Amharic"
];

export function shouldRecommendHighQualityVocals(language: string): boolean {
  return HIGH_QUALITY_VOCAL_LANGUAGES.includes(language);
}
