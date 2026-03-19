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
 * Synchronous layer to apply inferred updates to an existing context obj
 */
export function applyInferenceToContext(description: string, currentContext: Partial<CreativeContext>): Partial<CreativeContext> {
    return {
        ...currentContext,
        songDescription: description
    };
}
