export interface MoodDefinition {
  name: string;
  energyLevel: "low" | "medium" | "high" | "very_high";
  valence: "negative" | "neutral" | "positive";
  associatedTempos: string[];
  promptKeywords: string[];
  elevenLabsEmotion: string;
}

export const MOOD_DATABASE: MoodDefinition[] = [
  { name: "Happy", energyLevel: "high", valence: "positive", associatedTempos: ["Fast", "Upbeat"], promptKeywords: ["happy", "joyful", "uplifting", "bright", "cheerful"], elevenLabsEmotion: "joyful and uplifting" },
  { name: "Sad", energyLevel: "low", valence: "negative", associatedTempos: ["Slow", "Very Slow"], promptKeywords: ["sad", "melancholy", "depressing", "somber", "heartbreaking"], elevenLabsEmotion: "melancholic and heartbroken" },
  { name: "Energetic", energyLevel: "very_high", valence: "positive", associatedTempos: ["Very Fast", "Fast"], promptKeywords: ["energetic", "hype", "intense", "driving", "powerful"], elevenLabsEmotion: "highly energetic and powerful" },
  { name: "Chill", energyLevel: "low", valence: "neutral", associatedTempos: ["Slow", "Medium"], promptKeywords: ["chill", "relaxed", "laid-back", "mellow", "smooth"], elevenLabsEmotion: "relaxed and smooth" },
  { name: "Angry", energyLevel: "very_high", valence: "negative", associatedTempos: ["Fast", "Very Fast"], promptKeywords: ["angry", "aggressive", "fierce", "rage", "intense"], elevenLabsEmotion: "aggressive and fierce" },
  { name: "Romantic", energyLevel: "medium", valence: "positive", associatedTempos: ["Slow", "Medium"], promptKeywords: ["romantic", "intimate", "passionate", "sensual", "loving"], elevenLabsEmotion: "intimate and passionate" },
  { name: "Dark", energyLevel: "medium", valence: "negative", associatedTempos: ["Slow", "Medium"], promptKeywords: ["dark", "creepy", "haunting", "mysterious", "ominous"], elevenLabsEmotion: "dark and haunting" },
  { name: "Epic", energyLevel: "high", valence: "positive", associatedTempos: ["Medium", "Fast"], promptKeywords: ["epic", "cinematic", "triumphant", "grand", "heroic"], elevenLabsEmotion: "triumphant and grand" },
  { name: "Nostalgic", energyLevel: "medium", valence: "neutral", associatedTempos: ["Slow", "Medium"], promptKeywords: ["nostalgic", "wistful", "reflective", "bittersweet", "dreamy"], elevenLabsEmotion: "wistful and reflective" }
];

export function MOOD_NAMES(): string[] { return MOOD_DATABASE.map(m => m.name); }
