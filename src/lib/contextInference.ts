import { CreativeContext } from "@/types/creative-context";
import { interpretDescription, DerivationResult } from "./inference/description-interpreter";

/**
 * Sync version for UI responsiveness. Uses heuristic fallback.
 */
export function inferContextFromDescription(description: string): Partial<CreativeContext> {
  const lower = description.toLowerCase();
  
  const result: Partial<CreativeContext> = {};

  if (lower.includes("punjabi") || lower.includes("bhangra")) result.genre = "Punjabi Pop";
  if (lower.includes("drill")) result.genre = result.genre === "Punjabi Pop" ? "Punjabi Drill" : "UK Drill";
  if (lower.includes("sad") || lower.includes("heartbroken")) result.mood = "Sad";
  if (lower.includes("hindi") || lower.includes("bollywood")) result.vocalLanguage = "Hindi";
  if (lower.includes("punjabi")) result.vocalLanguage = "Punjabi";

  return result;
}

/**
 * Async version for deep Claude-based inference.
 */
export async function applyInferenceToContextAsync(
  description: string,
  existingContext: CreativeContext
): Promise<CreativeContext> {
  const derivation = await interpretDescription(description);

  return {
    ...existingContext,
    genre: existingContext.genre || derivation.suggestedGenre,
    mood: existingContext.mood || derivation.suggestedMood,
    vocalLanguage: existingContext.vocalLanguage || derivation.derivedLanguage,
    tempo: existingContext.tempo || derivation.bpm,
    vocalStyle: existingContext.vocalStyle || derivation.vocalStyle,
    songDescription: description
  };
}

// Keep original export name for compatibility
export function applyInferenceToContext(
  description: string,
  existingContext: CreativeContext
): CreativeContext {
  const inferred = inferContextFromDescription(description);
  
  return {
    ...existingContext,
    ...inferred,
    songDescription: description
  };
}
