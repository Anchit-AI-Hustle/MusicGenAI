/**
 * PromptBuilder: The central hub for prompt assembly.
 * Combines data from all previous engines into a high-density string
 * for music generation models.
 */

import { CreativeContext } from "@/types/creative-context";
import { CompositionPlan } from "./composition-engine";
import { findGenreByName } from "@/lib/musicData/genres";
import { findMood } from "@/lib/musicData/moods";
import { ARTIST_DATABASE } from "@/lib/musicData/artists";

export interface MasterPrompts {
  instrumentalPrompt: string;
  vocalPrompt: string;
  mixingInstruction: string;
}

export function buildMasterPrompts(
  context: CreativeContext,
  plan: CompositionPlan
): MasterPrompts {
  const genre = findGenreByName(context.genre);
  const mood = findMood(context.mood);
  
  // 1. Instrumental Prompt Assembly
  const instrumentalParts: string[] = [];
  
  // A. Core Style
  instrumentalParts.push(`${context.genre} music`);
  instrumentalParts.push(`${context.mood} mood`);
  
  // B. Compositional Elements
  instrumentalParts.push(`${plan.bpm} BPM`);
  instrumentalParts.push(`${plan.key} ${plan.scale}`);
  
  // C. Producer/Artist Inspiration
  const artist = ARTIST_DATABASE.find(a => a.name === context.artistInspiration);
  if (artist) {
    instrumentalParts.push(`inspired by the production style of ${artist.name} (${artist.productionNotes})`);
  }
  
  // D. Genre Keywords
  if (genre?.modelPromptKeywords) {
    instrumentalParts.push(...genre.modelPromptKeywords);
  }
  
  // E. Mood Keywords
  if (mood?.modelPromptKeywords) {
    instrumentalParts.push(mood.modelPromptKeywords);
  }

  const instrumentalPrompt = instrumentalParts.join(", ") + ".";

  // 2. Vocal Prompt/Style Assembly
  const vocalParts: string[] = [];
  vocalParts.push(`${context.vocalStyle} vocals`);
  vocalParts.push(`singing in ${context.vocalLanguage}`);
  
  if (genre?.vocalCharacteristics) {
    vocalParts.push(genre.vocalCharacteristics);
  }

  const vocalPrompt = vocalParts.join(", ") + ".";

  // 3. Mixing Instructions
  const mixingInstruction = `Mix the ${context.vocalStyle} vocals ${
    genre?.name.toLowerCase().includes("lo-fi") ? "muffled and warm" : 
    genre?.name.toLowerCase().includes("pop") ? "bright and crisp" : 
    "cleanly"
  } with the ${context.genre} instrumental. Ensure ${plan.bpm} BPM sync.`;

  return {
    instrumentalPrompt,
    vocalPrompt,
    mixingInstruction
  };
}
