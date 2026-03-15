import { CreativeContext } from "@/types/creative-context";
import { GENRE_DATABASE, findGenreByName } from "./musicData/genres";
import { LANGUAGE_DATABASE } from "./musicData/languages";
import { MOOD_DATABASE } from "./musicData/moods";
import { ARTIST_DATABASE } from "./musicData/artists";
import { calculateIdealBPM } from "./musicData/tempo";

export interface InferredContext {
  genre?: string;
  subgenre?: string;
  vocalLanguage?: string;
  mood?: string;
  tempo?: number;
  artistInspiration?: string;
  lyricTheme?: string;
}

export function inferContextFromDescription(description: string): InferredContext {
  const lowerDesc = description.toLowerCase();
  const inferred: InferredContext = {};

  // 1. Infer Genre
  // Sort by length descending to match "Reggaeton" before "Reggae"
  const sortedGenres = [...GENRE_DATABASE].sort((a, b) => b.name.length - a.name.length);
  
  const foundGenre = sortedGenres.find(g => 
    lowerDesc.includes(g.name.toLowerCase()) || 
    g.aliases.some(a => lowerDesc.includes(a.toLowerCase()))
  );
  if (foundGenre) {
    inferred.genre = foundGenre.name;
    // Look for subgenre within found genre
    const sub = foundGenre.subgenres.find(s => lowerDesc.includes(s.toLowerCase()));
    if (sub) inferred.subgenre = sub;
  }

  // 2. Infer Language
  const sortedLangs = [...LANGUAGE_DATABASE].sort((a, b) => b.name.length - a.name.length);
  const foundLang = sortedLangs.find(l => 
    lowerDesc.includes(l.name.toLowerCase())
  );
  if (foundLang) inferred.vocalLanguage = foundLang.name;

  // 3. Infer Mood
  const sortedMoods = [...MOOD_DATABASE].sort((a, b) => b.name.length - a.name.length);
  const foundMood = sortedMoods.find(m => 
    lowerDesc.includes(m.name.toLowerCase()) ||
    m.aliases.some(a => lowerDesc.includes(a.toLowerCase()))
  );
  if (foundMood) inferred.mood = foundMood.name;

  // 4. Infer Artist Inspiration
  const sortedArtists = [...ARTIST_DATABASE].sort((a, b) => b.name.length - a.name.length);
  const foundArtist = sortedArtists.find(a => 
    lowerDesc.includes(a.name.toLowerCase())
  );
  if (foundArtist) inferred.artistInspiration = foundArtist.name;

  // 5. Infer Tempo (if genre and mood known)
  if (inferred.genre || inferred.mood) {
    inferred.tempo = calculateIdealBPM(
      inferred.genre || "Pop", 
      inferred.mood || "Neutral"
    );
  }

  // 6. Simple Theme Inference
  const themes = ["love", "heartbreak", "party", "success", "street", "nature", "spiritual"];
  const foundTheme = themes.find(t => lowerDesc.includes(t));
  if (foundTheme) inferred.lyricTheme = foundTheme.charAt(0).toUpperCase() + foundTheme.slice(1);

  return inferred;
}

export function applyInferenceToContext(
  description: string, 
  existingContext: CreativeContext
): CreativeContext {
  const inferred = inferContextFromDescription(description);
  
  return {
    ...existingContext,
    genre: inferred.genre || existingContext.genre,
    subgenre: inferred.subgenre || existingContext.subgenre,
    vocalLanguage: inferred.vocalLanguage || existingContext.vocalLanguage,
    mood: inferred.mood || existingContext.mood,
    tempo: inferred.tempo || existingContext.tempo,
    artistInspiration: inferred.artistInspiration || existingContext.artistInspiration,
    lyricTheme: inferred.lyricTheme || existingContext.lyricTheme,
    songDescription: description
  };
}
