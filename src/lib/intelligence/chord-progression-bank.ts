/**
 * Chord progression bank backed by CHORD_EMOTION_DATABASE.json.
 * Picks a progression based on mood + genre, returning Roman numerals
 * and an example voicing.
 */

import db from "../../../knowledge-base/data/CHORD_EMOTION_DATABASE.json";
import { getGenre } from "./genre-knowledge";

interface ProgressionRecord {
  id: string;
  name: string;
  roman: string[];
  voicing_example_C?: string[];
  voicing_example_Am?: string[];
  voicing_example_G?: string[];
  voicing_example_Em?: string[];
  voicing_example_Fm?: string[];
  voicing_example_Dm?: string[];
  valence: number;
  arousal: number;
  tension: number;
  complexity: number;
  moods: string[];
  genres: string[];
  use_for: string[];
  examples: string[];
  notes?: string;
}

const PROGRESSIONS = (db as any).progressions as ProgressionRecord[];
const EMOTION_INDEX = (db as any).emotion_to_progression_index as Record<string, string[]>;

export function getProgression(id: string): ProgressionRecord | null {
  return PROGRESSIONS.find(p => p.id === id) ?? null;
}

/**
 * Choose progression by mood, with genre bias.
 * Falls back to genre's recommended progressions, then to "axis-major".
 */
export function pickProgression(mood: string, genreId: string): ProgressionRecord {
  const m = (mood || "").toLowerCase();

  // 1. Genre's preferred progressions (set in GENRE_KNOWLEDGE_BASE)
  const genre = getGenre(genreId);
  const genreProgIds: string[] = genre?.progression_ids ?? [];

  // 2. Mood-indexed progressions
  const moodIds: string[] = (() => {
    for (const key of Object.keys(EMOTION_INDEX)) {
      if (m.includes(key)) return EMOTION_INDEX[key];
    }
    return [];
  })();

  // 3. Intersection (best fit) → genre-only → mood-only → default
  const intersect = genreProgIds.filter(id => moodIds.includes(id));
  const candidateIds =
    intersect.length > 0 ? intersect :
    genreProgIds.length > 0 ? genreProgIds :
    moodIds.length > 0 ? moodIds :
    ["axis-major"];

  for (const id of candidateIds) {
    const p = getProgression(id);
    if (p) return p;
  }
  // Last-resort fallback that always exists
  return getProgression("axis-major")!;
}

/**
 * Return an example voicing for a progression in any available reference key,
 * preferring the requested key root if matching example is available.
 */
export function getVoicing(p: ProgressionRecord, preferRoot?: string): string[] {
  const order = [
    preferRoot && preferRoot.toLowerCase().startsWith("c") ? "voicing_example_C" : null,
    preferRoot && preferRoot.toLowerCase().startsWith("a") ? "voicing_example_Am" : null,
    preferRoot && preferRoot.toLowerCase().startsWith("g") ? "voicing_example_G" : null,
    preferRoot && preferRoot.toLowerCase().startsWith("e") ? "voicing_example_Em" : null,
    preferRoot && preferRoot.toLowerCase().startsWith("f") ? "voicing_example_Fm" : null,
    preferRoot && preferRoot.toLowerCase().startsWith("d") ? "voicing_example_Dm" : null,
    "voicing_example_C",
    "voicing_example_Am",
    "voicing_example_G",
    "voicing_example_Em",
    "voicing_example_Fm",
    "voicing_example_Dm",
  ].filter(Boolean) as string[];

  for (const key of order) {
    const v = (p as any)[key];
    if (Array.isArray(v) && v.length > 0) return v;
  }
  return p.roman;
}
