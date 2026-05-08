/**
 * Chord progression bank backed by CHORD_EMOTION_DATABASE.json.
 * Picks a progression based on mood + genre, returning Roman numerals
 * and a voicing TRANSPOSED into the plan's actual key. Without the
 * transposition step, the plan's lead-melody scale (in F harmonic minor,
 * say) collides with chord voicings hardcoded to A minor — and the
 * output reads as out of tune.
 */

import db from "../../../knowledge-base/data/CHORD_EMOTION_DATABASE.json";
import { getGenre } from "./genre-knowledge";
import { transposeChord } from "./local-synth/theory";

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
 * Choose progression by mood, with genre bias. When `seed` is provided,
 * we randomly pick from the candidate set rather than always taking the
 * first — so the same brief generated twice yields different (but still
 * mood-and-genre-appropriate) progressions.
 */
export function pickProgression(mood: string, genreId: string, seed?: string): ProgressionRecord {
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

  // Resolve to records that actually exist
  const candidates = candidateIds
    .map(id => getProgression(id))
    .filter((p): p is ProgressionRecord => !!p);
  if (candidates.length === 0) return getProgression("axis-major")!;

  if (seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
    return candidates[Math.abs(h) % candidates.length];
  }
  return candidates[0];
}

interface VoicingRef {
  field: string;
  /** Root note name of the reference key, e.g. "C", "A", "F". */
  refRoot: string;
  /** Whether the reference is a minor-mode voicing. */
  refIsMinor: boolean;
}

const VOICING_REFS: VoicingRef[] = [
  { field: "voicing_example_C",  refRoot: "C", refIsMinor: false },
  { field: "voicing_example_Am", refRoot: "A", refIsMinor: true  },
  { field: "voicing_example_G",  refRoot: "G", refIsMinor: false },
  { field: "voicing_example_Em", refRoot: "E", refIsMinor: true  },
  { field: "voicing_example_Fm", refRoot: "F", refIsMinor: true  },
  { field: "voicing_example_Dm", refRoot: "D", refIsMinor: true  },
];

const NOTE_TO_PC: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

/**
 * Pick the best reference voicing for a progression in the plan's key. Prefer
 * a reference whose mode (major/minor) matches the plan's mode, then fall
 * back to any reference that exists.
 */
function pickReference(p: ProgressionRecord, planIsMinor: boolean): { ref: VoicingRef; voicing: string[] } | null {
  const ranked = [...VOICING_REFS].sort((a, b) => {
    const aMatch = a.refIsMinor === planIsMinor ? 0 : 1;
    const bMatch = b.refIsMinor === planIsMinor ? 0 : 1;
    return aMatch - bMatch;
  });
  for (const ref of ranked) {
    const v = (p as any)[ref.field];
    if (Array.isArray(v) && v.length > 0) return { ref, voicing: v as string[] };
  }
  return null;
}

/**
 * Return chord voicings for a progression, transposed into the plan's
 * actual key. This is what the sequencer should call — keeps chord roots,
 * lead-scale roots, and bass roots in the same tonic so the output is
 * actually in tune.
 */
export function getVoicingInKey(p: ProgressionRecord, planKey: string, planIsMinor: boolean): string[] {
  const picked = pickReference(p, planIsMinor);
  if (!picked) return p.roman;
  const refPc = NOTE_TO_PC[picked.ref.refRoot] ?? 0;
  const planRoot = planKey.replace(/m$/i, "");
  const planPc = NOTE_TO_PC[planRoot] ?? 0;
  const offset = ((planPc - refPc) % 12 + 12) % 12;
  if (offset === 0) return picked.voicing.slice();
  // Sharps look better for sharp keys (F#, C#, G#); flats elsewhere.
  const preferSharps = ["G", "D", "A", "E", "B", "F#", "C#"].includes(planRoot);
  return picked.voicing.map(c => transposeChord(c, offset, preferSharps));
}

/**
 * Legacy entry point retained for callers that don't have a key context.
 * Prefer `getVoicingInKey` everywhere new code is written.
 */
export function getVoicing(p: ProgressionRecord, preferRoot?: string): string[] {
  // Mimic prior preference ordering (returns untransposed voicing).
  const orderedFields = preferRoot
    ? [
        preferRoot.toLowerCase().startsWith("c") ? "voicing_example_C" : null,
        preferRoot.toLowerCase().startsWith("a") ? "voicing_example_Am" : null,
        preferRoot.toLowerCase().startsWith("g") ? "voicing_example_G" : null,
        preferRoot.toLowerCase().startsWith("e") ? "voicing_example_Em" : null,
        preferRoot.toLowerCase().startsWith("f") ? "voicing_example_Fm" : null,
        preferRoot.toLowerCase().startsWith("d") ? "voicing_example_Dm" : null,
        ...VOICING_REFS.map(r => r.field),
      ].filter(Boolean) as string[]
    : VOICING_REFS.map(r => r.field);

  for (const field of orderedFields) {
    const v = (p as any)[field];
    if (Array.isArray(v) && v.length > 0) return v;
  }
  return p.roman;
}
