import { supabase } from "@/integrations/supabase/client";
import { CreativeContext } from "@/types/creative-context";

export async function inferContextFromDescription(description: string) {
  try {
    console.log("[Context Inference] Calling analyze-music for description:", description);
    
    // Call the existing analyze-music function which is already deployed and secure
    const { data, error } = await supabase.functions.invoke('analyze-music', {
      body: { 
        input: { musicPrompt: description },
        generationDNA: { seed: `${Date.now()}` } // Provide a default seed
      }
    });

    if (error) {
      console.error("[Context Inference] analyze-music function error:", error);
      return null;
    }

    if (!data?.musicIntent) {
      console.error("[Context Inference] Invalid response format from analyze-music:", data);
      return null;
    }

    const { musicIntent } = data;
    
    // Map musicIntent to the format expected by the frontend contextual suggestions
    return {
      genre: [musicIntent.genre],
      subgenre: musicIntent.subgenre ? [musicIntent.subgenre] : [],
      mood: musicIntent.mood,
      energy: musicIntent.energy || musicIntent.mood,
      tempo: String(musicIntent.tempo),
      artist_inspiration: musicIntent.artistInspiration || "",
      artist: musicIntent.artistInspiration || "",
      language: "English", 
      lyrics: "", // Default to empty if not generated yet
      description: description,
      prompt: description,
      lyricTheme: musicIntent.mood,
      instrumental: musicIntent.genreFamily?.toLowerCase() === "ambient" || musicIntent.genreFamily?.toLowerCase() === "classical"
    };
  } catch (error) {
    console.error("[Context Inference] Failed to infer context:", error);
    return null;
  }
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
