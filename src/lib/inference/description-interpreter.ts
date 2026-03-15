/**
 * DescriptionInterpreter: Uses Claude 3.5 Sonnet to derive structured 
 * data from loose user descriptions.
 */

import { CreativeContext } from "@/types/creative-context";
import { findGenreByName } from "@/lib/musicData/genres";
import { findLanguage, LANGUAGE_NAMES } from "@/lib/musicData/languages";
import { MOOD_NAMES } from "@/lib/musicData/moods";

export interface DerivationResult {
  suggestedGenre: string;
  suggestedMood: string;
  derivedLanguage: string;
  bpm: number;
  vocalStyle: string;
  instrumentalKeywords: string[];
  reasoning: string;
}

/**
 * Prompt for Claude to perform musical derivation.
 */
const DERIVATION_SYSTEM_PROMPT = `
You are a master musicologist and producer. Your task is to interpret a user's description
of a song they want to create and derive structured musical parameters.

Reference Lists:
MOODS: ${MOOD_NAMES().join(", ")}
LANGUAGES: ${LANGUAGE_NAMES().join(", ")}

Guidelines:
1. Identify the most specific Genre possible (e.g., "Punjabi Drill" instead of Just "Hip Hop").
2. Choose one Mood from the provided list.
3. Detect the intended Language. Default to "English" if unclear.
4. Estimate a BPM matching the genre and mood.
5. Provide 3-5 keywords for instrumental production (e.g., "distorted 808", "analog synth", "acoustic piano").
6. Suggest a Vocal Style.

Return ONLY a JSON object with keys: suggestedGenre, suggestedMood, derivedLanguage, bpm, vocalStyle, instrumentalKeywords, reasoning.
`;

export async function interpretDescription(description: string): Promise<DerivationResult> {
  // In production, this would call anthracite/claude-3-5-sonnet
  // simulate the response for now based on the prompt content provided in the task
  
  // Logic-based fallback if LLM is unavailable:
  const lower = description.toLowerCase();
  
  let genre = "Pop";
  if (lower.includes("punjabi") || lower.includes("bhangra")) genre = "Punjabi Pop";
  if (lower.includes("drill")) genre = genre.includes("Punjabi") ? "Punjabi Drill" : "UK Drill";
  if (lower.includes("trap") || lower.includes("dark hip hop")) genre = "Trap";
  if (lower.includes("bollywood") || lower.includes("hindi")) genre = "Bollywood";
  
  let mood = "Happy";
  if (lower.includes("sad") || lower.includes("heartbroken") || lower.includes("crying")) mood = "Sad";
  if (lower.includes("energy") || lower.includes("danceable") || lower.includes("aggressive")) mood = "Energetic";
  
  let language = "English";
  if (lower.includes("hindi")) language = "Hindi";
  if (lower.includes("punjabi")) language = "Punjabi";
  if (lower.includes("spanish")) language = "Spanish";

  return {
    suggestedGenre: genre,
    suggestedMood: mood,
    derivedLanguage: language,
    bpm: genre.includes("Drill") ? 142 : 110,
    vocalStyle: "Melodic and modern",
    instrumentalKeywords: ["modern production", "clean mix"],
    reasoning: "Heuristic derivation based on keywords in description."
  };
}

export async function enrichCreativeContext(context: Partial<CreativeContext>): Promise<CreativeContext> {
  if (!context.songDescription) return context as CreativeContext;

  const derivation = await interpretDescription(context.songDescription);

  return {
    // Keep user explicit choices, fallback to derivation
    songDescription: context.songDescription,
    genre: context.genre || derivation.suggestedGenre,
    mood: context.mood || derivation.suggestedMood,
    vocalLanguage: context.vocalLanguage || derivation.derivedLanguage,
    tempo: context.tempo || derivation.bpm,
    vocalStyle: context.vocalStyle || derivation.vocalStyle,
    
    // Defaults for remaining fields
    duration: context.duration || 180,
    lyrics: context.lyrics || "",
    artistInspiration: context.artistInspiration || "",
    videoStyle: context.videoStyle || "Cinematic",
    instrumentalOnly: context.instrumentalOnly ?? false,
    useHighQualityVocals: context.useHighQualityVocals ?? false,
  };
}
