import Anthropic from "@anthropic-ai/sdk";
import { GENRE_NAMES, getAllSubgenres } from "./musicData/genres";
import { LANGUAGE_NAMES } from "./musicData/languages";
import { MOOD_NAMES } from "./musicData/moods";
import { TEMPO_NAMES } from "./musicData/tempo";
import { ARTIST_NAMES } from "./musicData/artists";
import { CreativeContext } from "@/types/creative-context";

const anthropic = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "",
  dangerouslyAllowBrowser: true,
});

export async function inferContextFromDescription(description: string) {
  if (!process.env.ANTHROPIC_API_KEY && !import.meta.env.VITE_ANTHROPIC_API_KEY) {
    console.warn("[Context Inference] ANTHROPIC_API_KEY missing, skipping inference");
    return null;
  }

  try {
    const prompt = `
Analyze the following song description and extract the musical parameters.
If a parameter isn't explicitly mentioned, infer the most likely choice based on the description's tone, topic, or typical genre conventions.
If you are completely unsure, return null for that field.

Song description: "${description}"

Valid Genres: ${GENRE_NAMES().join(", ")}
Valid Subgenres: ${getAllSubgenres().join(", ")}
Valid Languages: ${LANGUAGE_NAMES().join(", ")}
Valid Moods: ${MOOD_NAMES().join(", ")}
Valid Tempos: ${TEMPO_NAMES().join(", ")}
Valid Artists (for inspiration): ${ARTIST_NAMES().join(", ")} (you can suggest others if highly relevant)

Return ONLY a raw JSON object with the following keys, without markdown formatting:
{
  "genre": "string or null",
  "vocalLanguage": "string or null",
  "mood": "string or null",
  "tempo": "number or null",
  "artistInspiration": "string or null",
  "lyricTheme": "string or null",
  "subgenre": "string or null",
  "instrumentalOnly": boolean
}
`;

    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 300,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : "";
    
    // Clean JSON (remove markdown)
    let jsonString = text;
    if (text.includes("```json")) {
        jsonString = text.split("```json")[1].split("```")[0];
    } else if (text.includes("```")) {
         jsonString = text.split("```")[1].split("```")[0];
    }
    
    const parsed = JSON.parse(jsonString.trim());
    return parsed;

  } catch (error) {
    console.error("[Context Inference] Failed to infer context:", error);
    return null;
  }
}

/**
 * Synchronous layer to apply inferred updates to an existing context obj
 * This mimics the legacy applyInferenceToContext used in MusicContext.tsx
 */
export function applyInferenceToContext(description: string, currentContext: Partial<CreativeContext>): Partial<CreativeContext> {
    // Because MusicContext expects a synchronous return for React state updates based on pure description changes:
    // we can either return the exact same or trigger a background hook. 
    // Usually local inference isn't synchronous LLM, so we just pass back what we can.
    // For full AI inference, the user clicks "AI Suggest".
    // 
    // Here we just attach standard logic.
    return {
        ...currentContext,
        songDescription: description
    };
}
