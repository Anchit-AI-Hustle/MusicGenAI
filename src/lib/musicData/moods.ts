export interface MoodDefinition {
  name: string;
  aliases: string[];
  musicalQualities: string;
  lyricThemes: string[];
  productionElements: string[];
  modelPromptKeywords: string;
}

export const MOOD_DATABASE: MoodDefinition[] = [
  {
    name: "Happy",
    aliases: ["joyful", "cheerful", "bright"],
    musicalQualities: "major key, up-tempo, bright melodies, lively rhythm",
    lyricThemes: ["celebration", "love", "sunshine", "success", "friendship"],
    productionElements: ["crisp drums", "bright electric guitar", "uplifting synth pads"],
    modelPromptKeywords: "happy, joyful, optimistic, bright vibe, major key",
  },
  {
    name: "Sad",
    aliases: ["sorrowful", "tearful", "depressing"],
    musicalQualities: "minor key, slow tempo, melancholic melodies, sparse arrangement",
    lyricThemes: ["heartbreak", "loss", "loneliness", "regret", "goodbyes"],
    productionElements: ["soft piano", "weeping strings", "minimal percussion", "reverb-heavy"],
    modelPromptKeywords: "sad, melancholic, sorrowful, heartbreaking, minor key",
  },
  {
    name: "Energetic",
    aliases: ["high energy", "pumping", "intense"],
    musicalQualities: "fast tempo, driving rhythm, loud dynamics, punchy accents",
    lyricThemes: ["motivation", "party", "action", "power", "movement"],
    productionElements: ["heavy kick drum", "distorted bass", "aggressive leads", "fast percussion"],
    modelPromptKeywords: "energetic, high energy, intense, driving rhythm, pumping",
  },
  {
    name: "Calm",
    aliases: ["peaceful", "relaxed", "serene"],
    musicalQualities: "mid-to-slow tempo, gentle melodies, soft dynamics, smooth transitions",
    lyricThemes: ["peace", "relaxation", "nature", "stars", "inner quiet"],
    productionElements: ["acoustic guitar", "ambient pads", "soft brushes on drums", "warm cello"],
    modelPromptKeywords: "calm, peaceful, relaxed, serene, tranquil",
  },
  {
    name: "Romantic",
    aliases: ["loving", "intimate", "passionate"],
    musicalQualities: "mid-tempo, lush harmonies, expressive melodies, warm tones",
    lyricThemes: ["love", "passion", "devotion", "destiny", "soulmates"],
    productionElements: ["velvety vocals", "sweep sythns", "soft piano", "gentle strings"],
    modelPromptKeywords: "romantic, passionate, intimate, sensual, loving",
  },
  {
    name: "Aggressive",
    aliases: ["angry", "hostile", "violent"],
    musicalQualities: "fast tempo, dissonant intervals, loud dynamics, distorted timbres",
    lyricThemes: ["anger", "rebellion", "conflict", "power", "betrayal"],
    productionElements: ["distorted guitar", "pounding drums", "screamed vocals", "gritty bass"],
    modelPromptKeywords: "aggressive, angry, fierce, rebellious, heavy",
  },
  {
    name: "Melancholic",
    aliases: ["pensive", "wistful", "bittersweet"],
    musicalQualities: "minor key, slow-to-mid tempo, yearning melodies, airy textures",
    lyricThemes: ["nostalgia", "fading love", "rainy days", "passing time"],
    productionElements: ["breathy vocals", "lo-fi piano", "distant strings", "spatial reverb"],
    modelPromptKeywords: "melancholic, bittersweet, pensive, wistful",
  },
  {
    name: "Uplifting",
    aliases: ["inspiring", "hopeful", "triumphant"],
    musicalQualities: "major key, mid-to-fast tempo, soaring melodies, builds",
    lyricThemes: ["overcoming", "hope", "future", "victory", "dreams"],
    productionElements: ["anthemic synths", "clapping rhythms", "orchestral swells", "bright piano"],
    modelPromptKeywords: "uplifting, inspiring, hopeful, triumphant",
  },
  {
    name: "Dark",
    aliases: ["gloomy", "ominous", "sinister"],
    musicalQualities: "minor or chromatic scales, low-end focus, tense rhythms",
    lyricThemes: ["shadows", "night", "fear", "mystery", "obsession"],
    productionElements: ["deep sub-bass", "haunting effects", "minor strings", "industrial textures"],
    modelPromptKeywords: "dark, ominous, sinister, gloomy, underground",
  },
  {
    name: "Mysterious",
    aliases: ["enigmatic", "strange", "obscure"],
    musicalQualities: "unusual scales, irregular rhythms, ethereal textures",
    lyricThemes: ["secrets", "unseen", "magic", "unknown", "hidden"],
    productionElements: ["reverse effects", "delays", "ethnic instruments", "shimmering pads"],
    modelPromptKeywords: "mysterious, enigmatic, ethereal, mystical",
  },
  {
    name: "Nostalgic",
    aliases: ["retro", "vintage", "old school"],
    musicalQualities: "traditional harmonies, retro synth sounds, organic timing",
    lyricThemes: ["childhood", "past memories", "hometown", "old summer"],
    productionElements: ["tape saturation", "vinyl crackle", "analog synth warmth", "muted drums"],
    modelPromptKeywords: "nostalgic, vintage, retro, old school feeling",
  },
  {
    name: "Chill",
    aliases: ["laid back", "mellow", "easygoing"],
    musicalQualities: "steady relaxed rhythm, soft melodies, spacious arrangement",
    lyricThemes: ["sunsets", "friends", "weekend", "cozy days"],
    productionElements: ["electric piano (Rhodes)", "subtle bass", "soft percussion", "warm textures"],
    modelPromptKeywords: "chill, mellow, laid back, relaxed vibes",
  },
];

export function findMood(query: string): MoodDefinition | null {
  const q = query.toLowerCase();
  return MOOD_DATABASE.find(m =>
    m.name.toLowerCase() === q ||
    m.aliases.some(a => a.toLowerCase() === q)
  ) ?? null;
}

export function MOOD_NAMES(): string[] {
  return MOOD_DATABASE.map(m => m.name);
}
