import { CreativeContext } from "@/types/creative-context";
import { findGenreByName } from "@/lib/musicData/genres";

function inferContextLocally(description: string) {
  const text = description.toLowerCase();

  const genre = text.includes('punjabi') && text.includes('drill')
    ? 'Punjabi Drill'
    : text.includes('reggaeton')
      ? 'Reggaeton'
      : text.includes('hip hop') || text.includes('rap')
        ? 'Hip Hop'
        : text.includes('rock')
          ? 'Rock'
          : text.includes('edm') || text.includes('electronic') || text.includes('techno')
            ? 'Electronic'
            : text.includes('jazz')
              ? 'Jazz'
              : text.includes('classical') || text.includes('orchestral')
                ? 'Classical'
                : text.includes('lofi') || text.includes('lo-fi')
                  ? 'Lo-fi'
                  : text.includes('pop')
                    ? 'Pop'
                    : 'Pop';

  const vocalLanguage =
    text.includes('punjabi') ? 'Punjabi' :
    text.includes('spanish') || text.includes('reggaeton') || text.includes('latin') ? 'Spanish' :
    'English';

  const mood =
    text.includes('aggressive') || text.includes('intense') || text.includes('dark') ? 'Aggressive' :
    text.includes('sad') || text.includes('melanch') ? 'Melancholic' :
    text.includes('calm') || text.includes('chill') ? 'Calm' :
    text.includes('happy') || text.includes('uplift') ? 'Uplifting' :
    text.includes('energetic') ? 'Energetic' :
    'Energetic';

  const artistInspiration =
    text.includes('ap dhillon') ? 'AP Dhillon' :
    text.includes('bad bunny') ? 'Bad Bunny' :
    '';

  const genreDef = findGenreByName(genre);
  let tempo = genreDef?.bpmTypical ?? 110;
  if (text.includes('slow') || text.includes('ballad')) {
    tempo = Math.round((genreDef?.bpmMin ?? 80));
  }
  if (text.includes('energetic') || text.includes('dance') || text.includes('fast') || text.includes('intense')) {
    const boosted = Math.round((genreDef?.bpmTypical ?? tempo) * 1.15);
    tempo = Math.min(genreDef?.bpmMax ?? 200, boosted);
  }
  tempo = Math.max(genreDef?.bpmMin ?? 60, Math.min(genreDef?.bpmMax ?? 200, tempo));

  return {
    genre,
    subgenre: genre === 'Punjabi Drill' ? 'UK Punjabi drill' : '',
    mood,
    energy: mood,
    tempo,
    artistInspiration,
    artist_inspiration: artistInspiration,
    artist: artistInspiration,
    vocalLanguage,
    language: vocalLanguage,
    lyrics: "",
    description,
    prompt: description,
    lyricTheme: mood,
    instrumentalOnly: text.includes('instrumental'),
    instrumental: text.includes('instrumental'),
  };
}

export function inferContextFromDescription(description: string) {
  return inferContextLocally(description);
}

/**
 * Normalizes and resolves dependencies within the CreativeContext
 */
export function resolveCreativeContext(context: Partial<CreativeContext>): CreativeContext {
  const resolved = { ...context } as CreativeContext;

  // 1. Defaults for mandatory fields
  resolved.songDescription = resolved.songDescription || "";
  resolved.songTitle = resolved.songTitle || "Untitled Track";
  resolved.genre = resolved.genre || "Pop";
  resolved.mood = resolved.mood || "Energetic";
  resolved.duration = resolved.duration || 120;
  resolved.vocalsEnabled = resolved.vocalsEnabled !== undefined ? resolved.vocalsEnabled : true;
  resolved.vocalLanguage = resolved.vocalLanguage || "English";
  resolved.vocalIntensity = resolved.vocalIntensity || 5;
  resolved.energyLevel = resolved.energyLevel || 5;
  resolved.creativityLevel = resolved.creativityLevel || 5;
  resolved.variationSeed = resolved.variationSeed || `${Math.floor(Math.random() * 1000000)}`;
  resolved.generationMode = resolved.generationMode || 'standard';
  resolved.lyricsMode = resolved.lyricsMode || (resolved.vocalsEnabled ? 'auto' : 'none');

  // 2. Field Dependency Logic
  
  // TEMPO: derived from genre + mood if not provided
  if (!resolved.tempo) {
    if (resolved.genre.toLowerCase().includes("lofi") || resolved.genre.toLowerCase().includes("chill")) {
      resolved.tempo = 80;
    } else if (resolved.genre.toLowerCase().includes("techno") || resolved.genre.toLowerCase().includes("house")) {
      resolved.tempo = 126;
    } else if (resolved.genre.toLowerCase().includes("rap") || resolved.genre.toLowerCase().includes("hip hop")) {
      resolved.tempo = 90;
    } else {
      resolved.tempo = 110; // Default
    }
  }

  // VOCAL STYLE: derive from genre if not provided
  if (!resolved.vocalStyle) {
    if (resolved.genre.toLowerCase().includes("rap")) resolved.vocalStyle = "Rap";
    else if (resolved.genre.toLowerCase().includes("jazz")) resolved.vocalStyle = "Soulful";
    else resolved.vocalStyle = "Pop Singing";
  }

  // VOCAL INTENSITY: derived from mood + energyLevel
  if (resolved.mood.toLowerCase().includes("aggressive") || resolved.energyLevel > 8) {
    resolved.vocalIntensity = Math.max(resolved.vocalIntensity, 8);
  }

  // STRUCTURE: derived from genre + duration
  if (!resolved.structureType) {
    if (resolved.duration < 60) resolved.structureType = "Short Form";
    else resolved.structureType = "Verse-Chorus-Bridge";
  }

  return resolved;
}

/**
 * Synchronous layer to apply inferred updates to an existing context obj
 */
export function applyInferenceToContext(description: string, currentContext: Partial<CreativeContext>): CreativeContext {
    const context = {
        ...currentContext,
        songDescription: description
    };
    return resolveCreativeContext(context);
}
