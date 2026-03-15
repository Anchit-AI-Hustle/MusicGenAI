export const VOCAL_STYLES = [
  "Clean Male",
  "Clean Female",
  "Raspy Male",
  "Airy Female",
  "Pop Belt Female",
  "R&B Run Male",
  "R&B Run Female",
  "Chopped & Screwed",
  "Auto-Tuned",
  "Screaming",
  "Spoken Word",
  "Choir"
];

export const VOCAL_STYLE_LABELS = VOCAL_STYLES;

export const VOCAL_PROFILES = [
  { genre: "Pop", language: "English", gender: "Female", elevenLabsVoiceId: "EXAVITQu4vr4xnSDxMaL" },
  { genre: "Pop", language: "English", gender: "Male", elevenLabsVoiceId: "pNInz6obbf5AWCGqeA" },
];

export function findVocalProfileByGenreAndLanguage(
    genre: string,
    language: string,
    gender: string | null
) {
    // Basic mock implementation for the UI
    const match = VOCAL_PROFILES.find(p => p.genre === genre && p.language === language && (!gender || p.gender === gender));
    if (match) return match;
    return VOCAL_PROFILES[0];
}
