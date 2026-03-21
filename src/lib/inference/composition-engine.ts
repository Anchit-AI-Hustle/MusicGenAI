/**
 * CompositionEngine: Handles the "bones" of the song.
 * BPM, Scale, Key, and Sectional Structure.
 */

import { generateSongStructure, SongStructure } from "@/lib/musicData/tempo";
import { findGenreByName } from "@/lib/musicData/genres";

export interface CompositionPlan {
  bpm: number;
  key: string;
  scale: string;
  timeSignature: string;
  structure: SongStructure;
  highQualityVocalRecommendation: boolean;
}

const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALES = ["Major", "Natural Minor", "Harmonic Minor", "Doric", "Phrygian"];

export function generateCompositionPlan(
  genreName: string,
  mood: string,
  duration: number,
  language: string
): CompositionPlan {
  const genre = findGenreByName(genreName) || (genreName.toLowerCase() === "electronic" ? findGenreByName("EDM") : null);
  
  // 1. Calculate BPM
  let bpm = genre?.bpmTypical || 120;
  if (mood.toLowerCase().includes("sad") || mood.toLowerCase().includes("calm")) {
    bpm = genre ? Math.max(genre.bpmMin, bpm * 0.85) : 80;
  }
  if (mood.toLowerCase().includes("energetic") || mood.toLowerCase().includes("intense")) {
    bpm = genre ? Math.min(genre.bpmMax, genre.bpmTypical + 4) : 132;
  }
  bpm = Math.round(bpm);

  // 2. Select Key & Scale
  // Heuristic: Happy/Uplifting = Major, Sad/Aggressive/Dark/Drill = Minor
  const isMinor = ["sad", "dark", "aggressive", "mysterious", "melancholic", "tense"].includes(mood.toLowerCase()) || 
                  genreName.toLowerCase().includes("drill");
  
  const scale = isMinor ? "Natural Minor" : "Major";
  const key = KEYS[Math.floor(Math.random() * KEYS.length)];

  // 3. Generate Structure
  const structure = generateSongStructure(duration, bpm, genreName);

  // 4. Check for High Quality Vocal Recommendation (Punjabi Note)
  const highQualityVocalRecommendation = language.toLowerCase() === "punjabi";

  return {
    bpm,
    key,
    scale,
    timeSignature: genre?.timeSignature || "4/4",
    structure,
    highQualityVocalRecommendation
  };
}
