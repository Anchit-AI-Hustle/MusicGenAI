/**
 * Music theory helpers for the local-synth engine.
 *
 * Pure functions, no audio dependencies. Convert note names to MIDI numbers,
 * chord symbols to MIDI note arrays, scale degrees to absolute pitches.
 *
 * Used by the sequencer to turn CompositionPlan symbols (e.g. "Am",
 * "Cmaj7", "Dm9", roman numeral progressions over a key) into the
 * frequency stream the synth voices expect.
 */

const NOTE_TO_PC: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4,
  F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11,
};

/** A chord parsed into its root pitch class and quality flags. */
export interface ParsedChord {
  rootPc: number;
  quality: "maj" | "min" | "dim" | "aug" | "sus2" | "sus4";
  extensions: { seventh?: "maj7" | "min7" | "dom7"; ninth?: boolean; eleventh?: boolean; thirteenth?: boolean };
}

/** Concert-pitch frequency for a MIDI note number (A4 = 69 = 440 Hz). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Note name with octave, e.g. "A4" → 69. */
export function noteToMidi(name: string, octave = 4): number {
  const m = name.match(/^([A-G][b#]?)(-?\d+)?$/);
  if (!m) throw new Error(`Bad note: ${name}`);
  const pc = NOTE_TO_PC[m[1]];
  if (pc === undefined) throw new Error(`Bad note name: ${m[1]}`);
  const oct = m[2] !== undefined ? parseInt(m[2], 10) : octave;
  return pc + (oct + 1) * 12;
}

/**
 * Parse a chord symbol like "Am", "Cmaj7", "Dm9", "G7", "Fsus4", "Bdim".
 * Falls back to major triad on the first valid root letter when parsing fails,
 * so the sequencer never crashes on a weird chord string.
 */
export function parseChord(symbol: string): ParsedChord {
  const s = symbol.trim();
  // Root: 1-2 chars
  let i = 1;
  if (s.length > 1 && (s[1] === "#" || s[1] === "b")) i = 2;
  const rootName = s.slice(0, i);
  const rootPc = NOTE_TO_PC[rootName];
  const tail = s.slice(i);

  if (rootPc === undefined) {
    return { rootPc: 0, quality: "maj", extensions: {} };
  }

  let quality: ParsedChord["quality"] = "maj";
  if (/^m(?!aj)/.test(tail) || /^min/.test(tail)) quality = "min";
  else if (/^dim/.test(tail) || /^°/.test(tail)) quality = "dim";
  else if (/^aug/.test(tail) || /^\+/.test(tail)) quality = "aug";
  else if (/^sus2/.test(tail)) quality = "sus2";
  else if (/^sus4/.test(tail) || /^sus/.test(tail)) quality = "sus4";

  const ext: ParsedChord["extensions"] = {};
  if (/maj7|maj9|maj11|maj13|M7/.test(tail)) ext.seventh = "maj7";
  else if (/m7|min7/.test(tail)) ext.seventh = "min7";
  else if (/(?<!maj)7|(?<!m)7/.test(tail)) ext.seventh = "dom7";
  if (/9/.test(tail)) ext.ninth = true;
  if (/11/.test(tail)) ext.eleventh = true;
  if (/13/.test(tail)) ext.thirteenth = true;

  return { rootPc, quality, extensions: ext };
}

/**
 * Build a MIDI-note voicing for a chord, centered around the given root octave
 * and respecting close-voiced common-tone retention. Returns 3-6 MIDI numbers
 * sorted ascending.
 */
export function chordToMidi(symbol: string, rootOctave = 3): number[] {
  const c = parseChord(symbol);
  const root = c.rootPc + (rootOctave + 1) * 12;
  const notes: number[] = [root];

  // Third
  switch (c.quality) {
    case "maj": case "aug": notes.push(root + 4); break;
    case "min": case "dim": notes.push(root + 3); break;
    case "sus2": notes.push(root + 2); break;
    case "sus4": notes.push(root + 5); break;
  }

  // Fifth
  switch (c.quality) {
    case "dim": notes.push(root + 6); break;
    case "aug": notes.push(root + 8); break;
    default:    notes.push(root + 7); break;
  }

  // Sevenths
  if (c.extensions.seventh === "maj7") notes.push(root + 11);
  else if (c.extensions.seventh === "min7") notes.push(root + 10);
  else if (c.extensions.seventh === "dom7") notes.push(root + 10);

  // Ninth (root + 14, prefer dropping octave to keep tight voicing)
  if (c.extensions.ninth) notes.push(root + 14);

  return notes.sort((a, b) => a - b);
}

/**
 * The bass note for a chord — root, dropped one octave lower than chordToMidi.
 */
export function chordBassMidi(symbol: string, octave = 2): number {
  const c = parseChord(symbol);
  return c.rootPc + (octave + 1) * 12;
}

/**
 * Mode → semitone interval pattern from the tonic (ascending).
 */
export const MODE_INTERVALS: Record<string, number[]> = {
  major:           [0, 2, 4, 5, 7, 9, 11],
  "natural-minor": [0, 2, 3, 5, 7, 8, 10],
  "harmonic-minor":[0, 2, 3, 5, 7, 8, 11],
  "melodic-minor": [0, 2, 3, 5, 7, 9, 11],
  dorian:          [0, 2, 3, 5, 7, 9, 10],
  phrygian:        [0, 1, 3, 5, 7, 8, 10],
  "phrygian-dominant":[0, 1, 4, 5, 7, 8, 10],
  lydian:          [0, 2, 4, 6, 7, 9, 11],
  mixolydian:      [0, 2, 4, 5, 7, 9, 10],
  locrian:         [0, 1, 3, 5, 6, 8, 10],
  "pentatonic-major":[0, 2, 4, 7, 9],
  "pentatonic-minor":[0, 3, 5, 7, 10],
  blues:           [0, 3, 5, 6, 7, 10],
  raga:            [0, 2, 4, 5, 7, 9, 11],   // Yaman fallback
  maqam:           [0, 1, 4, 5, 7, 8, 10],   // Hijaz fallback
  drone:           [0, 7],
};

/**
 * Build an array of MIDI notes one octave wide for the given key+mode,
 * starting at `octave`. Used by the lead/melody synth.
 */
export function scaleMidi(keyName: string, mode: string, octave = 4): number[] {
  const root = noteToMidi(keyName.replace(/m$/i, ""), octave);
  const intervals = MODE_INTERVALS[mode] ?? MODE_INTERVALS.major;
  return intervals.map(iv => root + iv);
}

/**
 * Pseudo-random pick from a list, deterministic for a given seed string.
 */
export function pickFrom<T>(list: T[], seed: string, salt = 0): T {
  let h = salt;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  return list[Math.abs(h) % list.length];
}
