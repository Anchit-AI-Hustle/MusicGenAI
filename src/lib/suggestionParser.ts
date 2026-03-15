import { SuggestionField, CreativeContext } from "@/types/creative-context";
import { GENRE_NAMES } from "./musicData/genres";
import { MOOD_NAMES } from "./musicData/moods";
import { TEMPO_NAMES, getBpmFromName } from "./musicData/tempo";
import { VOCAL_STYLES } from "./musicData/vocals";
import { ARTIST_NAMES } from "./musicData/artists";
import { LANGUAGE_NAMES } from "./musicData/languages";

export interface ParsedSuggestion {
  field: SuggestionField;
  value: any;
  confidence: number;
}

export function parseSuggestionResponse(text: string): ParsedSuggestion[] {
  const suggestions: ParsedSuggestion[] = [];
  
  // Robust defense against bad AI formatting
  let jsonString = text;
  
  // Remove markdown formatting if present
  if (jsonString.includes("```json")) {
    jsonString = jsonString.split("```json")[1].split("```")[0].trim();
  } else if (jsonString.includes("```")) {
    jsonString = jsonString.split("```")[1].split("```")[0].trim();
  }

  try {
    const data = JSON.parse(jsonString);
    
    // Parse Genre
    if (data.genre) {
      const match = fuzzyMatch(data.genre, GENRE_NAMES());
      if (match) suggestions.push({ field: "genre", value: match, confidence: 0.9 });
    }
    
    // Parse Mood
    if (data.mood) {
      const match = fuzzyMatch(data.mood, MOOD_NAMES());
      if (match) suggestions.push({ field: "mood", value: match, confidence: 0.9 });
    }
    
    // Parse Tempo
    if (data.tempo) {
      if (typeof data.tempo === "number") {
        // Find closest named tempo
        let closest = "Medium";
        let minDiff = 999;
        for (const name of TEMPO_NAMES()) {
          const bpm = getBpmFromName(name);
          const diff = Math.abs(bpm - data.tempo);
          if (diff < minDiff) {
            minDiff = diff;
            closest = name;
          }
        }
        suggestions.push({ field: "tempo", value: closest, confidence: 0.8 });
      } else {
        const match = fuzzyMatch(data.tempo, TEMPO_NAMES().concat(["fast", "slow", "medium", "upbeat", "very fast", "very slow"]));
        if (match) {
           const standardized = match.toLowerCase() === "fast" ? "Fast" : 
                                match.toLowerCase() === "slow" ? "Slow" :
                                match.toLowerCase() === "upbeat" ? "Upbeat" : "Medium";
           suggestions.push({ field: "tempo", value: standardized, confidence: 0.8 });
        }
      }
    }
    
    // Parse Vocal Language
    if (data.language) {
      const match = fuzzyMatch(data.language, LANGUAGE_NAMES());
      if (match) suggestions.push({ field: "vocalLanguage", value: match, confidence: 0.95 });
    }
    
    // Parse Artist Inspiration
    if (data.artist) {
      const match = fuzzyMatch(data.artist, ARTIST_NAMES());
      if (match) {
        suggestions.push({ field: "artistInspiration", value: match, confidence: 0.8 });
      } else {
        // If not exact match, keep the raw value
        suggestions.push({ field: "artistInspiration", value: data.artist, confidence: 0.5 });
      }
    }

    // Instrumental toggle
    if (data.instrumental !== undefined) {
        suggestions.push({ field: "instrumentalOnly", value: !!data.instrumental, confidence: 0.9 });
    }
    
  } catch (err) {
    console.error("[Suggestion Parser] Failed to parse JSON", err, text);
  }
  
  return suggestions;
}

function fuzzyMatch(input: string, choices: string[]): string | null {
  if (!input) return null;
  const normalizedInput = String(input).toLowerCase().trim();
  
  // Exact match
  const exact = choices.find(c => c.toLowerCase() === normalizedInput);
  if (exact) return exact;
  
  // Substring match
  const substring = choices.find(c => normalizedInput.includes(c.toLowerCase()) || c.toLowerCase().includes(normalizedInput));
  if (substring) return substring;
  
  return null;
}
