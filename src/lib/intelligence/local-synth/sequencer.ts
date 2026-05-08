/**
 * Sequencer.
 *
 * Walks a CompositionPlan section-by-section, bar-by-bar, and emits a flat
 * list of timed events the renderer can fire onto the OfflineAudioContext
 * timeline. Events are absolute seconds from song start.
 *
 * The sequencer is *deterministic for a given seed* — same plan + seed
 * yields identical event stream — which keeps tracks reproducible.
 */

import type { CompositionPlan } from "../types";
import { chordToMidi, chordBassMidi, midiToFreq, scaleMidi, parseChord } from "./theory";

export type EventKind =
  | "kick" | "sub" | "snare" | "clap" | "hat-closed" | "hat-open"
  | "bass" | "pad" | "lead" | "pluck"
  | "chant"
  | "riser" | "impact";

export type Vowel = "ah" | "ee" | "oo" | "oh" | "eh" | "uh";

export interface SynthEvent {
  /** Absolute time in seconds from song start. */
  t: number;
  kind: EventKind;
  /** Frequency in Hz, when applicable. */
  freq?: number;
  /** Multiple frequencies for chord pads. */
  freqs?: number[];
  /** Note duration in seconds, when applicable. */
  duration?: number;
  /** 0..1 velocity. */
  velocity?: number;
  /** Voice flavor switch (passed through to voices.ts). */
  flavor?: string;
  /** Vowel for chant events. */
  vowel?: Vowel;
  /** Section the event belongs to — used by the renderer's sidechain. */
  sectionName: string;
}

interface SeqDeps {
  bpm: number;
  beatsPerBar: number;
  secondsPerBeat: number;
  secondsPerBar: number;
  /** 1 step = 1/16th note. 16 per bar in 4/4. */
  secondsPerStep: number;
  stepsPerBar: number;
  rng: () => number;
}

export interface SequenceResult {
  events: SynthEvent[];
  totalSeconds: number;
}

export interface SequenceOptions {
  /** Layer a vocoder/formant chant on chorus/drop sections. */
  vocoderVoice?: boolean;
}

export function sequence(plan: CompositionPlan, seed = "default", opts: SequenceOptions = {}): SequenceResult {
  const beatsPerBar = beatsFromTimeSig(plan.resolved.timeSignature);
  const secondsPerBeat = 60 / plan.resolved.bpm;
  const stepsPerBar = beatsPerBar * 4;
  const deps: SeqDeps = {
    bpm: plan.resolved.bpm,
    beatsPerBar,
    secondsPerBeat,
    secondsPerBar: beatsPerBar * secondsPerBeat,
    secondsPerStep: secondsPerBeat / 4,
    stepsPerBar,
    rng: seedRng(seed),
  };

  const events: SynthEvent[] = [];
  let cursor = 0;
  const voicings = plan.resolved.progressionVoicingExample.length > 0
    ? plan.resolved.progressionVoicingExample
    : ["C", "G", "Am", "F"];

  // Pre-compute scale notes for melody planning
  const scale = scaleMidi(plan.resolved.key, plan.resolved.mode, 5);

  for (const section of plan.resolved.sections) {
    const sectionEnd = cursor + section.durationSeconds;
    const sectionStart = cursor;
    const sectionName = section.name;

    // Riser at end of any section that builds into a higher-energy next section
    const isPreClimax = isBuildSection(section.name, plan, section.energy);
    if (isPreClimax) {
      const riserDur = Math.min(section.durationSeconds, deps.secondsPerBar * 2);
      events.push({
        t: sectionEnd - riserDur, duration: riserDur, kind: "riser", sectionName,
      });
    }

    // Impact on the section's first downbeat for any high-energy section
    if (/chorus|drop|climax|hook|final/i.test(section.name) && section.energy >= 0.85) {
      events.push({ t: sectionStart, kind: "impact", velocity: 0.9, sectionName });
    }

    // Plan one chord per N bars based on harmonicRhythm
    const barsInSection = Math.max(1, section.bars);
    const chordsPerBar = Math.max(0.25, Math.min(2, section.harmonicRhythm || 1));
    const chordHoldBars = 1 / chordsPerBar;

    for (let bar = 0; bar < barsInSection; bar++) {
      const barStart = sectionStart + bar * deps.secondsPerBar;
      // Choose chord by progression cycle position
      const chordIdx = Math.floor(bar / chordHoldBars) % voicings.length;
      const chord = voicings[chordIdx];
      const isChordOnset = bar % chordHoldBars === 0;

      // ── Pad (sustained chord) ───────────────────────────────────────────
      if (isChordOnset && section.density >= 0.35) {
        const padNotes = chordToMidi(chord, 4);
        events.push({
          t: barStart,
          duration: chordHoldBars * deps.secondsPerBar,
          freqs: padNotes.map(midiToFreq),
          velocity: 0.35 * section.density,
          kind: "pad",
          sectionName,
        });
      }

      // ── Chant / vocoder voice on chord onsets in chorus/drop sections ───
      // Held vowel-tone over the chord's third or fifth, cycling vowels
      // per chord change for a Daft-Punk-esque vocoder layer. Uses NO
      // model and NO recording — pure formant synthesis.
      if (
        opts.vocoderVoice &&
        isChordOnset &&
        vocoderFitsGenre(plan.resolved.genreId) &&
        /chorus|drop|hook|climax|final/i.test(section.name) &&
        section.energy >= 0.7
      ) {
        const chordNotes = chordToMidi(chord, 4);
        // Sing the chord's 3rd and 5th — root is held by bass, leaves
        // mids open for the vocoder to fill in
        const sungMidi = chordNotes.length >= 3
          ? [chordNotes[1], chordNotes[2]]
          : chordNotes.slice(0, 1);
        const vowel = VOWEL_CYCLE[chordIdx % VOWEL_CYCLE.length];
        const chantDuration = Math.max(0.3, chordHoldBars * deps.secondsPerBar - 0.05);
        for (const m of sungMidi) {
          events.push({
            t: barStart + 0.04, // tiny lag so it doesn't slam with the impact
            duration: chantDuration,
            freq: midiToFreq(m),
            velocity: 0.55 * Math.min(1, section.energy * 1.1),
            kind: "chant",
            vowel,
            sectionName,
          });
        }
      }

      // ── Bass ────────────────────────────────────────────────────────────
      if (section.density >= 0.4) {
        const bassMidi = chordBassMidi(chord, 2);
        const bassFreq = midiToFreq(bassMidi);
        // Pattern: root on beats 1 and 3
        for (let beat = 0; beat < beatsPerBar; beat++) {
          const isStrongBeat = beat % 2 === 0;
          if (!isStrongBeat) continue;
          const t = barStart + beat * deps.secondsPerBeat;
          events.push({
            t,
            duration: deps.secondsPerBeat * 0.9,
            freq: bassFreq,
            velocity: 0.85 * section.density,
            kind: "bass",
            flavor: bassFlavorFor(plan.resolved.genreId),
            sectionName,
          });
        }
      }

      // ── Drums per 16-step grid ──────────────────────────────────────────
      const drums = drumPatternFor(plan.resolved.genreId, section, deps);
      for (const hit of drums) {
        const stepTime = barStart + hit.step * deps.secondsPerStep + (hit.microShiftSec || 0);
        if (stepTime < sectionStart || stepTime >= sectionEnd) continue;
        events.push({
          t: stepTime,
          kind: hit.kind,
          velocity: hit.velocity * Math.max(0.3, section.energy),
          sectionName,
        });
      }

      // ── Lead motif on chorus / hook / drop sections ─────────────────────
      if (/chorus|drop|hook|climax|final/i.test(section.name) && section.density >= 0.6) {
        const leadEvents = generateLeadMotif(barStart, scale, deps, voicings, chordIdx, sectionName);
        events.push(...leadEvents);
      }
    }

    cursor = sectionEnd;
  }

  // Sort events for renderer; stable for identical timestamps.
  events.sort((a, b) => a.t - b.t);
  return { events, totalSeconds: cursor };
}

// ---------------------------------------------------------------------------
// Drum patterns — dispatched by genre
// ---------------------------------------------------------------------------

interface DrumHit {
  step: number;          // 0..15 within the bar
  velocity: number;      // 0..1
  kind: EventKind;
  microShiftSec?: number;
}

function drumPatternFor(genreId: string, section: { energy: number; vocalDensity: number; name: string }, deps: SeqDeps): DrumHit[] {
  const hits: DrumHit[] = [];
  const e = section.energy;
  const isQuiet = e < 0.35;
  if (isQuiet && !/intro|outro|breakdown/i.test(section.name)) {
    // Even quiet sections still need a kick on 1 to anchor
  }

  const isFour = /edm|house|techno|trance|dubstep|festival|disco/.test(genreId);
  const isHipHop = /trap|drill|phonk|hip-hop|punjabi-drill/.test(genreId);
  const isLofi = /lo-fi|lofi/.test(genreId);
  const isReggaeton = /reggaeton/.test(genreId);
  const isRock = /rock|metal|punk|post-rock/.test(genreId);
  const isAmbient = /ambient|meditation/.test(genreId);

  if (isAmbient) return hits; // ambient uses no drums

  if (isFour) {
    for (let i = 0; i < 16; i += 4) {
      hits.push({ step: i, velocity: 0.95, kind: "kick" });
    }
    if (e >= 0.4) {
      hits.push({ step: 4, velocity: 0.7, kind: "clap" });
      hits.push({ step: 12, velocity: 0.7, kind: "clap" });
    }
    for (let i = 0; i < 16; i += 2) {
      const open = (i % 8) === 4 && deps.rng() < e * 0.3;
      hits.push({ step: i, velocity: 0.4 + (i % 4 === 0 ? 0 : 0.1), kind: open ? "hat-open" : "hat-closed" });
    }
  } else if (isHipHop) {
    // Trap/drill pattern: kick on 1 and 7 (or 8), snare on beat 3 (step 8)
    hits.push({ step: 0, velocity: 1.0, kind: "kick" });
    hits.push({ step: e > 0.6 ? 7 : 10, velocity: 0.9, kind: "kick" });
    hits.push({ step: 8, velocity: 0.95, kind: "snare" });
    // Hi-hat 16ths with rolls at high energy
    for (let i = 0; i < 16; i++) {
      const baseV = i % 4 === 0 ? 0.5 : i % 2 === 0 ? 0.35 : 0.2;
      hits.push({ step: i, velocity: baseV + deps.rng() * 0.15, kind: "hat-closed" });
    }
    if (e > 0.7) {
      // Triplet roll at end of bar
      const rollBase = 13;
      for (let k = 0; k < 6; k++) {
        const microStep = rollBase + k * 0.5;
        hits.push({
          step: Math.floor(microStep),
          microShiftSec: (microStep - Math.floor(microStep)) * deps.secondsPerStep,
          velocity: 0.45,
          kind: "hat-closed",
        });
      }
    }
  } else if (isLofi) {
    // Boom-bap-ish: kick on 1, 7-ish; snare on 4 (step 8); shuffled hats
    hits.push({ step: 0, velocity: 0.9, kind: "kick" });
    hits.push({ step: 8, velocity: 0.85, kind: "snare" });
    if (e > 0.45) hits.push({ step: 11, velocity: 0.6, kind: "kick" });
    // Shuffled 8th hats with humanized timing
    for (let i = 0; i < 16; i += 2) {
      const swing = (i / 2) % 2 === 1 ? deps.secondsPerStep * 0.6 : 0;
      hits.push({
        step: i,
        microShiftSec: swing + (deps.rng() - 0.5) * 0.012,
        velocity: 0.3 + deps.rng() * 0.15,
        kind: "hat-closed",
      });
    }
  } else if (isReggaeton) {
    // Dembow: kick + snare on a fixed pattern
    const dembow = [0, 3, 6, 10]; // approximate dembow grid
    for (const s of dembow) hits.push({ step: s, velocity: 0.9, kind: "kick" });
    hits.push({ step: 4, velocity: 0.85, kind: "snare" });
    hits.push({ step: 12, velocity: 0.85, kind: "snare" });
    for (let i = 0; i < 16; i += 2) {
      hits.push({ step: i, velocity: 0.3, kind: "hat-closed" });
    }
  } else if (isRock) {
    // Live rock pattern: kick on 1 and 11, snare on 4 and 12
    hits.push({ step: 0, velocity: 1.0, kind: "kick" });
    hits.push({ step: 10, velocity: 0.9, kind: "kick" });
    hits.push({ step: 4, velocity: 0.95, kind: "snare" });
    hits.push({ step: 12, velocity: 0.95, kind: "snare" });
    for (let i = 0; i < 16; i += 2) {
      hits.push({ step: i, velocity: 0.45, kind: "hat-closed" });
    }
  } else {
    // Generic pop: kick on 1 and 9, clap on 5 and 13, hats on 8ths
    hits.push({ step: 0, velocity: 1.0, kind: "kick" });
    hits.push({ step: 8, velocity: 0.95, kind: "kick" });
    hits.push({ step: 4, velocity: 0.85, kind: "clap" });
    hits.push({ step: 12, velocity: 0.85, kind: "clap" });
    for (let i = 0; i < 16; i += 2) {
      hits.push({ step: i, velocity: 0.4, kind: "hat-closed" });
    }
  }
  return hits;
}

/**
 * Cycle of vowels per chord change. The OO/AH alternation is the canonical
 * vocoder-pad sound (Daft Punk, Justice, deadmau5 vocal-chop pads).
 */
const VOWEL_CYCLE: Vowel[] = ["ah", "oo", "ah", "ee"];

/**
 * Genres where a vocoder-style vowel layer is musically idiomatic. For
 * trap / drill / lo-fi / hip-hop / phonk it would clash; for ambient /
 * meditation / classical / jazz / folk / country it's wrong-fit.
 */
function vocoderFitsGenre(genreId: string): boolean {
  return /edm|house|trance|dubstep|techno|synthwave|k-pop|j-pop|pop-mainstream|post-rock|film-score|trailer/.test(genreId);
}

function bassFlavorFor(genreId: string): "sub" | "808" | "synth" {
  if (/trap|drill|phonk|punjabi-drill/.test(genreId)) return "808";
  if (/edm|house|techno|dubstep|trance/.test(genreId)) return "synth";
  if (/lo-fi|jazz|neo-soul|rnb|ambient/.test(genreId)) return "sub";
  return "synth";
}

// ---------------------------------------------------------------------------
// Lead motif — the chorus earworm
// ---------------------------------------------------------------------------

function generateLeadMotif(
  barStart: number,
  scale: number[],
  deps: SeqDeps,
  voicings: string[],
  chordIdx: number,
  sectionName: string,
): SynthEvent[] {
  const out: SynthEvent[] = [];
  // 8-note motif over 1 bar, biased toward chord tones of current chord.
  const chord = voicings[chordIdx];
  const c = parseChord(chord);
  // Scale degrees that are "in chord" (close to chord tones)
  const chordPc = new Set([c.rootPc, (c.rootPc + (c.quality === "min" || c.quality === "dim" ? 3 : 4)) % 12, (c.rootPc + 7) % 12]);
  const candidates = scale.filter(m => chordPc.has(m % 12));
  const pool = candidates.length >= 2 ? candidates : scale;

  // Motif rhythm: 8th notes — 8 hits per bar
  const motifLength = 8;
  let lastIdx = Math.floor(deps.rng() * pool.length);
  for (let i = 0; i < motifLength; i++) {
    const t = barStart + i * deps.secondsPerStep * 2;
    if (deps.rng() < 0.18) continue; // sometimes rest = breath
    // Move by step from the previous note, occasionally leap
    const move = deps.rng() < 0.7 ? (deps.rng() < 0.5 ? -1 : 1) : (deps.rng() < 0.5 ? -2 : 2);
    lastIdx = clamp(lastIdx + move, 0, pool.length - 1);
    const midi = pool[lastIdx];
    out.push({
      t,
      kind: "lead",
      freq: midiToFreq(midi),
      duration: deps.secondsPerStep * 1.8,
      velocity: 0.5 + deps.rng() * 0.15,
      flavor: "fm",
      sectionName,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBuildSection(name: string, plan: CompositionPlan, energy: number): boolean {
  if (!/build|pre-chorus|riser|breakdown/i.test(name)) return false;
  // Only a build if a higher-energy section follows
  const sections = plan.resolved.sections;
  const idx = sections.findIndex(s => s.name === name);
  if (idx < 0 || idx === sections.length - 1) return false;
  return sections[idx + 1].energy > energy + 0.1;
}

function beatsFromTimeSig(ts: string): number {
  if (ts === "3/4") return 3;
  if (ts === "6/8") return 6;
  if (ts === "12/8") return 12;
  if (ts === "5/4") return 5;
  if (ts === "7/8") return 7;
  return 4;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

function seedRng(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
