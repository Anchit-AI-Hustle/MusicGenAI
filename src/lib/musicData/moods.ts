export interface MoodDefinition {
  name: string;
  aliases: string[];
  colorHex: string;         // UI color for the mood chip/badge
  keySignature: "major" | "minor" | "both";
  musicalQualities: string;
  lyricThemes: string[];
  productionElements: string[];
  modelPromptKeywords: string;
}

export const MOOD_DATABASE: MoodDefinition[] = [
  {
    name: "Happy",
    aliases: ["joyful", "cheerful", "upbeat", "bright"],
    colorHex: "#FFD700",
    keySignature: "major",
    musicalQualities: "Major key, bright timbre, upbeat rhythm, bright highs",
    lyricThemes: ["celebration", "joy", "sunshine", "dancing", "good times"],
    productionElements: ["bright synths", "punchy snare", "major chord progressions", "uplifting brass"],
    modelPromptKeywords: "happy uplifting major key bright cheerful",
  },
  {
    name: "Sad",
    aliases: ["sorrowful", "heartbroken", "melancholy", "tearful", "weeping"],
    colorHex: "#4A90D9",
    keySignature: "minor",
    musicalQualities: "Minor key, slow tempo, sparse arrangement, mournful melody",
    lyricThemes: ["loss", "heartbreak", "longing", "emptiness", "grief", "goodbye"],
    productionElements: ["piano ballad", "minor chord progressions", "slow strings", "reverb-heavy vocals"],
    modelPromptKeywords: "sad melancholic minor key slow piano emotional heartbroken",
  },
  {
    name: "Energetic",
    aliases: ["high energy", "pumped", "intense", "fire", "lit"],
    colorHex: "#FF4500",
    keySignature: "both",
    musicalQualities: "Fast tempo, heavy rhythm, powerful bass, driving energy",
    lyricThemes: ["power", "hustle", "movement", "winning", "unstoppable"],
    productionElements: ["heavy kick", "aggressive bass", "distorted elements", "fast hi-hats"],
    modelPromptKeywords: "high energy aggressive fast drums powerful driving intense",
  },
  {
    name: "Romantic",
    aliases: ["love song", "sensual", "intimate", "passionate", "tender"],
    colorHex: "#FF69B4",
    keySignature: "major",
    musicalQualities: "Warm tones, medium tempo, lush harmonies, intimate feel",
    lyricThemes: ["love", "desire", "devotion", "closeness", "forever", "eyes"],
    productionElements: ["warm bass", "lush pads", "gentle rhythm", "close-mic vocals", "strings"],
    modelPromptKeywords: "romantic love warm intimate lush harmonies tender passionate",
  },
  {
    name: "Aggressive",
    aliases: ["angry", "rage", "furious", "violent", "hard"],
    colorHex: "#DC143C",
    keySignature: "minor",
    musicalQualities: "Heavy distortion, fast or double-time rhythm, minor key, dark harmony",
    lyricThemes: ["anger", "confrontation", "power", "defiance", "revenge", "street"],
    productionElements: ["distortion", "heavy drums", "dark bass", "minor chords", "shouted vocals"],
    modelPromptKeywords: "aggressive angry dark distortion heavy drums confrontational",
  },
  {
    name: "Melancholic",
    aliases: ["wistful", "pensive", "reflective", "brooding"],
    colorHex: "#6A5ACD",
    keySignature: "minor",
    musicalQualities: "Slow to medium tempo, sparse, introspective, bittersweet chord choices",
    lyricThemes: ["memory", "time passing", "what could have been", "reflection", "old wounds"],
    productionElements: ["sparse piano", "ambient pads", "minor 7 chords", "delayed guitar", "soft drums"],
    modelPromptKeywords: "melancholic wistful reflective minor bittersweet introspective sparse",
  },
  {
    name: "Uplifting",
    aliases: ["inspiring", "motivational", "empowering", "soaring"],
    colorHex: "#00CED1",
    keySignature: "major",
    musicalQualities: "Building energy, major key, anthemic chorus, soaring melody",
    lyricThemes: ["hope", "overcoming", "rising", "strength", "new beginnings", "perseverance"],
    productionElements: ["building arrangement", "major key", "soaring strings", "big chorus drop"],
    modelPromptKeywords: "uplifting inspiring motivational soaring anthem major key hopeful",
  },
  {
    name: "Dark",
    aliases: ["sinister", "ominous", "foreboding", "eerie", "haunting"],
    colorHex: "#2F1B25",
    keySignature: "minor",
    musicalQualities: "Low register, dissonance, minor key, unsettling timbre",
    lyricThemes: ["darkness", "shadows", "night", "secrets", "danger", "underworld"],
    productionElements: ["low sub bass", "minor chords", "dissonant intervals", "dark pads", "ominous melody"],
    modelPromptKeywords: "dark ominous sinister minor key haunting low bass eerie unsettling",
  },
  {
    name: "Nostalgic",
    aliases: ["retro", "throwback", "vintage", "old school", "reminiscent"],
    colorHex: "#D2691E",
    keySignature: "both",
    musicalQualities: "Warm vintage sound, tape saturation, period-appropriate instrumentation",
    lyricThemes: ["memory", "past", "childhood", "old times", "places gone by", "who we were"],
    productionElements: ["vinyl warmth", "tape saturation", "vintage instruments", "period-correct drums"],
    modelPromptKeywords: "nostalgic retro vintage warm tape saturation reminiscent",
  },
  {
    name: "Chill",
    aliases: ["relaxed", "laid back", "mellow", "easy", "smooth"],
    colorHex: "#90EE90",
    keySignature: "major",
    musicalQualities: "Slow tempo, warm bass, minimal percussion, spacious mix",
    lyricThemes: ["relaxation", "Sunday morning", "coastline", "coffee", "no worries"],
    productionElements: ["lazy groove", "warm bass", "soft drums or no drums", "ambient pads", "jazz chords"],
    modelPromptKeywords: "chill relaxed laid back mellow warm smooth minimal",
  },
  {
    name: "Mysterious",
    aliases: ["cryptic", "unknown", "suspenseful", "ethereal"],
    colorHex: "#4B0082",
    keySignature: "minor",
    musicalQualities: "Slow build, unusual chord voicings, sparse arrangement with tension",
    lyricThemes: ["unknown", "questions", "hidden truths", "night", "wonder", "secrets"],
    productionElements: ["minor 2nd intervals", "low synth pads", "sparse percussion", "reverse reverb"],
    modelPromptKeywords: "mysterious cryptic suspenseful dark minor unusual chords ethereal",
  },
  {
    name: "Triumphant",
    aliases: ["victorious", "powerful", "epic", "winning", "champion"],
    colorHex: "#FFD700",
    keySignature: "major",
    musicalQualities: "Big orchestration, major key, fanfare-like brass, punchy rhythm",
    lyricThemes: ["victory", "overcoming", "champions", "glory", "power", "legacy"],
    productionElements: ["brass fanfare", "big drums", "major key", "orchestral swells", "cinematic"],
    modelPromptKeywords: "triumphant victorious epic major key brass fanfare powerful cinematic",
  },
  {
    name: "Dreamy",
    aliases: ["ethereal", "floaty", "hazy", "otherworldly", "surreal"],
    colorHex: "#E6E6FA",
    keySignature: "major",
    musicalQualities: "Reverb-drenched, slow tempo, floating harmony, blurred transients",
    lyricThemes: ["dreams", "clouds", "floating", "another world", "sleep", "fantasy"],
    productionElements: ["heavy reverb", "delay on everything", "lush pads", "soft drums", "filtered highs"],
    modelPromptKeywords: "dreamy ethereal floaty reverb-drenched hazey surreal soft",
  },
  {
    name: "Rebellious",
    aliases: ["defiant", "anti-establishment", "punk attitude", "outsider"],
    colorHex: "#FF0000",
    keySignature: "minor",
    musicalQualities: "Raw energy, distortion, simple but powerful, anti-polished",
    lyricThemes: ["rebellion", "rules to break", "system", "outsider", "youth", "freedom"],
    productionElements: ["raw recording", "power chords", "shouted vocals", "fast punk rhythm"],
    modelPromptKeywords: "rebellious defiant raw distortion punk attitude anti-establishment",
  },
  {
    name: "Euphoric",
    aliases: ["ecstatic", "peak", "rave energy", "bliss", "highest high"],
    colorHex: "#FF1493",
    keySignature: "major",
    musicalQualities: "Fast, massive drop, bright major key, crowd energy",
    lyricThemes: ["peak moment", "highest feeling", "losing yourself", "rave", "together"],
    productionElements: ["massive EDM drop", "bright synths", "four-on-the-floor", "supersaw lead"],
    modelPromptKeywords: "euphoric ecstatic rave energy massive drop bright major festival",
  },
  {
    name: "Bittersweet",
    aliases: ["mixed feelings", "happy-sad", "conflicted", "wistful joy"],
    colorHex: "#DDA0DD",
    keySignature: "both",
    musicalQualities: "Major melody over minor harmony or vice versa, emotional complexity",
    lyricThemes: ["joy mixed with sadness", "endings that are also beginnings", "love and loss together"],
    productionElements: ["major-minor modal mixture", "emotional string writing", "complex chord voicing"],
    modelPromptKeywords: "bittersweet conflicted emotional complex major-minor mixture wistful",
  },
];

export function findMood(name: string): MoodDefinition | null {
  const lower = name.toLowerCase();
  return MOOD_DATABASE.find(m =>
    m.name.toLowerCase() === lower ||
    m.aliases.some(a => a.toLowerCase().includes(lower))
  ) ?? null;
}

export function MOOD_NAMES(): string[] {
  return MOOD_DATABASE.map(m => m.name);
}
