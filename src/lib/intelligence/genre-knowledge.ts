/**
 * Lookup helpers over GENRE_KNOWLEDGE_BASE.json.
 * Single source of truth for genre DNA. Replaces ad-hoc reads scattered
 * across promptBuilder, qualityRouter, video-generator, etc.
 */

import knowledge from "../../../knowledge-base/data/GENRE_KNOWLEDGE_BASE.json";
import balanceRules from "../../../knowledge-base/data/AUDIO_BALANCE_RULES.json";
import visualStyles from "../../../knowledge-base/data/VISUAL_STYLE_KNOWLEDGE_BASE.json";

export type GenreId = keyof (typeof knowledge.genres);

export function getGenre(id: string) {
  const all = knowledge.genres as Record<string, any>;
  return all[id] ?? null;
}

export function listGenreIds(): string[] {
  return Object.keys(knowledge.genres);
}

/**
 * Loose match a free-form name to a genre id.
 * Handles "EDM" → "edm-festival", "trap" → "trap", "lo-fi" → "lo-fi-hip-hop", etc.
 */
export function matchGenreId(input: string): string | null {
  if (!input) return null;
  const s = input.toLowerCase().trim();

  const direct = (knowledge.genres as Record<string, any>)[s];
  if (direct) return s;

  for (const [id, g] of Object.entries(knowledge.genres) as [string, any][]) {
    if (id.toLowerCase() === s) return id;
    if (g.label?.toLowerCase().includes(s)) return id;
  }

  // Heuristic synonyms
  const synonyms: Record<string, string> = {
    "edm": "edm-festival",
    "electronic": "edm-festival",
    "dance": "edm-festival",
    "house": "house-deep",
    "deep house": "house-deep",
    "lofi": "lo-fi-hip-hop",
    "lo-fi": "lo-fi-hip-hop",
    "lo-fi hip hop": "lo-fi-hip-hop",
    "chillhop": "lo-fi-hip-hop",
    "chill": "lo-fi-hip-hop",
    "hip hop": "hip-hop-boom-bap",
    "hip-hop": "hip-hop-boom-bap",
    "rap": "hip-hop-boom-bap",
    "boom bap": "hip-hop-boom-bap",
    "trap music": "trap",
    "drill": "uk-drill",
    "memphis phonk": "phonk",
    "rock": "rock-classic",
    "metal": "metal",
    "rnb": "rnb-modern",
    "r&b": "rnb-modern",
    "neo soul": "neo-soul",
    "neo-soul": "neo-soul",
    "pop": "pop-mainstream",
    "kpop": "k-pop",
    "k pop": "k-pop",
    "jpop": "j-pop-anime",
    "j pop": "j-pop-anime",
    "anime": "j-pop-anime",
    "ambient": "ambient",
    "meditation": "meditation-healing",
    "healing": "meditation-healing",
    "classical": "classical-orchestral",
    "orchestral": "classical-orchestral",
    "trailer": "film-score-trailer",
    "film score": "film-score-trailer",
    "cinematic": "film-score-trailer",
    "country": "country",
    "folk": "folk-acoustic",
    "acoustic": "folk-acoustic",
    "reggae": "reggae-roots",
    "reggaeton": "reggaeton",
    "afrobeats": "afrobeats",
    "afrobeat": "afrobeats",
    "bollywood": "bollywood-romantic",
    "hindi film": "bollywood-romantic",
    "bhangra": "bhangra",
    "punjabi": "punjabi-pop",
    "punjabi pop": "punjabi-pop",
    "punjabi drill": "punjabi-drill",
    "desi drill": "punjabi-drill",
    "indian classical": "indian-classical",
    "hindustani": "indian-classical",
    "arabic": "arabic-pop",
    "khaleeji": "arabic-pop",
    "hyperpop": "hyperpop",
    "post rock": "post-rock",
    "post-rock": "post-rock",
    "synthwave": "synthwave",
    "retrowave": "synthwave",
    "techno": "techno",
    "trance": "trance",
    "dubstep": "dubstep",
    "jazz": "jazz",
  };
  if (synonyms[s]) return synonyms[s];

  // Last resort: any partial alias match
  for (const [id, g] of Object.entries(knowledge.genres) as [string, any][]) {
    const hay = `${id} ${g.label ?? ""}`.toLowerCase();
    if (hay.includes(s)) return id;
  }
  return null;
}

export function getBalanceRules(genreId: string) {
  const rules = (balanceRules as any).genre_band_budgets as Record<string, any>;
  return rules[genreId] ?? rules["pop-mainstream"];
}

export function getVisualStyle(aestheticId: string) {
  const styles = (visualStyles as any).styles as Record<string, any>;
  return styles[aestheticId] ?? null;
}

export function pickBpm(genreId: string, mood: string): number {
  const g = getGenre(genreId);
  if (!g) return 120;
  const { min, max, typical } = g.bpm;
  const m = (mood || "").toLowerCase();
  if (/sad|calm|meditat|chill|ambient|ballad/.test(m)) {
    return Math.max(min, Math.round(typical * 0.92));
  }
  if (/intense|energetic|aggressive|hype|rage|drop|festival/.test(m)) {
    return Math.min(max, Math.round(typical * 1.05));
  }
  return typical;
}

export function pickModeForMood(genreId: string, mood: string): {
  mode: import("./types").Mode;
  isMinor: boolean;
} {
  const g = getGenre(genreId);
  const m = (mood || "").toLowerCase();
  const minorMoods = ["sad", "dark", "melancholy", "melancholic", "moody", "tense", "menacing", "yearning"];
  const isMinor = minorMoods.some(k => m.includes(k));

  // Check genre key bias for special modes
  const bias = (g?.key_bias ?? "").toLowerCase();
  if (bias.includes("phrygian")) return { mode: "phrygian", isMinor: true };
  if (bias.includes("harmonic minor")) return { mode: "harmonic-minor", isMinor: true };
  if (bias.includes("dorian")) return { mode: "dorian", isMinor: true };
  if (bias.includes("mixolydian")) return { mode: "mixolydian", isMinor: false };
  if (bias.includes("lydian")) return { mode: "lydian", isMinor: false };
  if (bias.includes("raga")) return { mode: "raga", isMinor: false };
  if (bias.includes("maqam")) return { mode: "maqam", isMinor: true };
  if (bias.includes("drone")) return { mode: "drone", isMinor: false };

  return isMinor
    ? { mode: "natural-minor", isMinor: true }
    : { mode: "major", isMinor: false };
}
