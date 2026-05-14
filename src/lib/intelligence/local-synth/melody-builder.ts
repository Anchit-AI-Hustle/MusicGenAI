/**
 * Pre-computed melody builder.
 *
 * Produces two melodic phrases that the sequencer plays verbatim every
 * time their section type appears:
 *
 *   - `buildHookMelody(...)`  →  4-bar chorus/drop earworm
 *   - `buildVerseMelody(...)` →  4-bar lower-energy verse counter-melody
 *
 * Why verbatim? A "song" feels like a song because the chorus melody is
 * the *same* every time it lands. If the sequencer rerolls per bar (as the
 * previous build did) the listener never gets a hook to latch onto. This
 * is the single biggest "this sounds procedural, not composed" fix.
 *
 * Notes are stored as degrees from the active chord ROOT in semitones,
 * NOT absolute pitches. That way the same melodic shape rides whatever
 * chord cycle is playing underneath (axis, andalusian, doo-wop, whatever).
 *
 * Pure logic. Deterministic for a given seed.
 */

import type { StoredMelody, StoredMelodyNote } from "../types";
import { MODE_INTERVALS } from "./theory";

interface MelodyContext {
  /** Plan's mode name, e.g. "natural-minor", "major", "phrygian". */
  mode: string;
  /** Plan's BPM. Used to scale rhythmic density. */
  bpm: number;
  /** Beats per bar. */
  beatsPerBar: number;
  /** Deterministic RNG (0..1). */
  rng: () => number;
  /** Octave the melody sits in relative to chord root (0 = same octave, 1 = octave up). */
  octaveOffset?: number;
}

/**
 * Build a 4-bar chorus hook.
 *
 * Compositional rules baked in:
 *   - First note of bar 1 = chord 5th (the "ringing" tone). This is what
 *     makes pop hooks land — "Shake It Off", "Bad Romance", "Levels" all
 *     open chorus melody on the 5th.
 *   - Range cap: a major 6th (9 semitones) from start. Beyond that and
 *     the average listener can't sing along.
 *   - Stepwise motion 75% of the time, leap (3-4 semitones) 25%.
 *   - Bar 3 mirrors bar 1 with a small variation (call-and-response).
 *   - Bar 4 ends on the chord root (resolution).
 */
export function buildHookMelody(ctx: MelodyContext): StoredMelody {
  const scaleDegrees = scaleDegreesFromMode(ctx.mode);
  const octaveBoost = (ctx.octaveOffset ?? 1) * 12;
  const notes: StoredMelodyNote[] = [];

  // Bar 1 — 8 eighth-notes, opens on 5th
  const bar1Pattern = buildBar({
    startDegree: 5,
    bar: 0,
    beatsPerBar: ctx.beatsPerBar,
    scaleDegrees,
    octaveBoost,
    rng: ctx.rng,
    accentBeat1: true,
  });
  notes.push(...bar1Pattern);

  // Bar 2 — descends toward the third (~landing inside the chord)
  const bar2Pattern = buildBar({
    startDegree: bar1Pattern[bar1Pattern.length - 1]?.degreeFromChordRoot ?? 7,
    bar: 1,
    beatsPerBar: ctx.beatsPerBar,
    scaleDegrees,
    octaveBoost,
    rng: ctx.rng,
    targetDegree: 4,
  });
  notes.push(...bar2Pattern);

  // Bar 3 — variation of bar 1 (slight contour change)
  const bar3Pattern = bar1Pattern.map((n, i) => ({
    ...n,
    beat: n.beat + 2 * ctx.beatsPerBar,
    // Bar 3 raises the second note by one scale step for "call-response"
    degreeFromChordRoot: i === 1 ? n.degreeFromChordRoot + 2 : n.degreeFromChordRoot,
    velocity: Math.min(1, n.velocity * 1.05),
  }));
  notes.push(...bar3Pattern);

  // Bar 4 — descend to root, hold last note
  const bar4Pattern = buildBar({
    startDegree: bar3Pattern[bar3Pattern.length - 1]?.degreeFromChordRoot ?? 7,
    bar: 3,
    beatsPerBar: ctx.beatsPerBar,
    scaleDegrees,
    octaveBoost,
    rng: ctx.rng,
    targetDegree: 0,
    holdLast: true,
  });
  notes.push(...bar4Pattern);

  return { bars: 4, notes };
}

/**
 * Build a 4-bar verse counter-melody.
 *
 * Verse rules:
 *   - Sparser than the hook (mostly quarter notes, some rests).
 *   - Stays in the lower octave from the chord root.
 *   - Opens on the 3rd, returns to the root.
 *   - Lower velocity than hook so verses feel quieter.
 */
export function buildVerseMelody(ctx: MelodyContext): StoredMelody {
  const scaleDegrees = scaleDegreesFromMode(ctx.mode);
  const octaveBoost = (ctx.octaveOffset ?? 0) * 12;
  const notes: StoredMelodyNote[] = [];

  // 4 bars of mostly quarter notes with rests
  for (let bar = 0; bar < 4; bar++) {
    const barNotes = buildVerseBar({
      bar,
      beatsPerBar: ctx.beatsPerBar,
      scaleDegrees,
      octaveBoost,
      rng: ctx.rng,
    });
    notes.push(...barNotes);
  }

  return { bars: 4, notes };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface BuildBarArgs {
  startDegree: number;
  bar: number;
  beatsPerBar: number;
  scaleDegrees: number[];
  octaveBoost: number;
  rng: () => number;
  accentBeat1?: boolean;
  targetDegree?: number;
  holdLast?: boolean;
}

function buildBar(a: BuildBarArgs): StoredMelodyNote[] {
  // 8 eighth-notes per bar in 4/4 (2 per beat)
  const noteCount = a.beatsPerBar * 2;
  const baseBeat = a.bar * a.beatsPerBar;
  const out: StoredMelodyNote[] = [];

  // Map "degrees" (1, 3, 5 etc) to actual semitone offsets via the scale.
  // We always start at the requested degree; subsequent notes step ±1 scale
  // step with occasional leaps.
  let currentScaleIdx = nearestScaleIdx(a.scaleDegrees, a.startDegree);
  const startSemis = a.scaleDegrees[currentScaleIdx];
  const targetScaleIdx = a.targetDegree !== undefined
    ? nearestScaleIdx(a.scaleDegrees, a.targetDegree)
    : currentScaleIdx;

  for (let i = 0; i < noteCount; i++) {
    const isLast = i === noteCount - 1;
    const isStrong = i % 2 === 0; // on the beat
    const beat = baseBeat + i * 0.5;
    let restProb = isStrong ? 0.08 : 0.20;
    if (i === 0) restProb = 0; // never rest on bar 1

    if (a.rng() < restProb) {
      out.push({ beat, degreeFromChordRoot: 0, durationBeats: 0.5, velocity: 0, rest: true });
      continue;
    }

    // Bias the contour toward `targetDegree` over the bar
    if (a.targetDegree !== undefined && a.rng() < 0.5) {
      if (currentScaleIdx < targetScaleIdx) currentScaleIdx++;
      else if (currentScaleIdx > targetScaleIdx) currentScaleIdx--;
    } else {
      // Step or small leap
      const stepProb = 0.75;
      const move = a.rng() < stepProb
        ? (a.rng() < 0.5 ? -1 : 1)
        : (a.rng() < 0.5 ? -2 : 2);
      currentScaleIdx = clamp(currentScaleIdx + move, 0, a.scaleDegrees.length - 1);
    }
    // Range cap: a major 6th from the start
    const semis = a.scaleDegrees[currentScaleIdx];
    if (Math.abs(semis - startSemis) > 9) {
      currentScaleIdx = nearestScaleIdx(a.scaleDegrees, startSemis);
    }
    const degreeFromChordRoot = a.scaleDegrees[currentScaleIdx] + a.octaveBoost;
    const velocity =
      (isStrong ? 0.65 : 0.50) *
      (a.accentBeat1 && i === 0 ? 1.15 : 1) *
      (0.95 + a.rng() * 0.1); // small humanization

    out.push({
      beat,
      degreeFromChordRoot,
      durationBeats: isLast && a.holdLast ? 2 : 0.45,
      velocity: Math.min(1, velocity),
    });
  }
  return out;
}

interface BuildVerseBarArgs {
  bar: number;
  beatsPerBar: number;
  scaleDegrees: number[];
  octaveBoost: number;
  rng: () => number;
}

function buildVerseBar(a: BuildVerseBarArgs): StoredMelodyNote[] {
  const out: StoredMelodyNote[] = [];
  const baseBeat = a.bar * a.beatsPerBar;
  // 4 quarter-notes per bar in 4/4; alternate notes and rests
  for (let beat = 0; beat < a.beatsPerBar; beat++) {
    const isRest = (beat === 1 || beat === 3) && a.rng() < 0.55;
    const t = baseBeat + beat;
    if (isRest) {
      out.push({ beat: t, degreeFromChordRoot: 0, durationBeats: 1, velocity: 0, rest: true });
      continue;
    }
    // Cycle through chord tones (root, 3rd, 5th) for stability
    const idx = beat === 0 ? 2 : beat === 2 ? 4 : (a.rng() < 0.5 ? 0 : 2);
    const semis = a.scaleDegrees[idx] + a.octaveBoost;
    out.push({
      beat: t,
      degreeFromChordRoot: semis,
      durationBeats: 0.9,
      velocity: 0.40 + a.rng() * 0.08,
    });
  }
  return out;
}

function nearestScaleIdx(scale: number[], targetSemis: number): number {
  let best = 0;
  let bestDiff = Math.abs(scale[0] - targetSemis);
  for (let i = 1; i < scale.length; i++) {
    const d = Math.abs(scale[i] - targetSemis);
    if (d < bestDiff) { best = i; bestDiff = d; }
  }
  return best;
}

function scaleDegreesFromMode(mode: string): number[] {
  return MODE_INTERVALS[mode] ?? MODE_INTERVALS.major;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
