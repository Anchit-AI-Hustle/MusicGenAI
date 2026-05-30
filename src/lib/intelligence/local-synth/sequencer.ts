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

import type { CompositionPlan, StoredMelody } from "../types";
import { chordToMidi, chordBassMidi, midiToFreq, scaleMidi, parseChord } from "./theory";
import { syllabifyLine, type Syllable } from "./syllabify";
import type { LyricBundle } from "../lyric-engine";

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
  /**
   * When provided alongside `vocoderVoice`, the vocoder sings the actual
   * lyric syllables (one chant event per syllable, vowel selected from
   * the syllable, pitch from the chord-tone closest to a stable melody).
   * Without lyrics we fall back to the held-vowel "AH-OO-AH-EE" cycle.
   */
  lyrics?: LyricBundle;
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

      // ── Chant / vocoder voice ───────────────────────────────────────────
      // Two modes:
      //   1. Lyric mode  — when opts.lyrics is provided, sing the actual
      //      syllables of the section's lyric line. Vowel of each chant
      //      event comes from the syllable; pitch tracks chord tones.
      //   2. Vowel mode  — when no lyrics, fall back to the AH-OO-AH-EE
      //      vocoder pad on chorus/drop sections.
      const voiceShouldFire =
        opts.vocoderVoice &&
        section.vocalDensity >= 0.4 &&
        (opts.lyrics ? sectionShouldSing(section.name) : (
          vocoderFitsGenre(plan.resolved.genreId) &&
          /chorus|drop|hook|climax|final/i.test(section.name) &&
          section.energy >= 0.7
        ));

      if (voiceShouldFire) {
        if (opts.lyrics) {
          const line = pickLineForSection(opts.lyrics, section.name, bar);
          if (line) {
            const sungEvents = syllableEventsForBar(
              line, barStart, deps.secondsPerBar, chord, deps.rng,
              section.energy, sectionName,
            );
            events.push(...sungEvents);
          }
        } else if (isChordOnset) {
          // Held-vowel fallback when no lyrics provided
          const chordNotes = chordToMidi(chord, 4);
          const sungMidi = chordNotes.length >= 3
            ? [chordNotes[1], chordNotes[2]]
            : chordNotes.slice(0, 1);
          const vowel = VOWEL_CYCLE[chordIdx % VOWEL_CYCLE.length];
          const chantDuration = Math.max(0.3, chordHoldBars * deps.secondsPerBar - 0.05);
          for (const m of sungMidi) {
            events.push({
              t: barStart + 0.04,
              duration: chantDuration,
              freq: midiToFreq(m),
              velocity: 0.55 * Math.min(1, section.energy * 1.1),
              kind: "chant",
              vowel,
              sectionName,
            });
          }
        }
      }

      // ── Bass ────────────────────────────────────────────────────────────
      // Walking pattern: root on 1, fifth on 3 (genre-typical for most
      // pop/edm/funk). On low-energy / lo-fi sections, sustain root only.
      if (section.density >= 0.4) {
        const rootMidi = chordBassMidi(chord, 2);
        const fifthMidi = rootMidi + 7;
        const sustainOnly = section.energy < 0.45;
        for (let beat = 0; beat < beatsPerBar; beat++) {
          const isBeat1 = beat === 0;
          const isBeat3 = beat === 2;
          if (sustainOnly && !isBeat1) continue;
          if (!sustainOnly && !isBeat1 && !isBeat3) continue;
          const t = barStart + beat * deps.secondsPerBeat;
          const midi = isBeat3 && !sustainOnly ? fifthMidi : rootMidi;
          events.push({
            t,
            duration: deps.secondsPerBeat * (sustainOnly ? 3.8 : 1.8),
            freq: midiToFreq(midi),
            velocity: (isBeat1 ? 0.92 : 0.75) * section.density,
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

      // ── Lead melody from the STORED motif (repeats verbatim) ────────────
      // This is the song-ness fix. We no longer regenerate random notes
      // per bar — the same hook plays every time a chorus appears, and
      // the verse motif plays every time a verse appears. The melodic
      // shape is mapped onto the current chord's root, so a hook written
      // around C transposes correctly when the chord moves to Am, F, G.
      const useHook = /chorus|drop|hook|climax|final/i.test(section.name)
        && section.density >= 0.55
        && !!plan.resolved.hookMelody;
      const useVerse = /verse|pre-chorus|pre_chorus/i.test(section.name)
        && section.density >= 0.4
        && section.density < 0.85
        && !!plan.resolved.verseMelody;

      if (useHook || useVerse) {
        const stored = useHook ? plan.resolved.hookMelody! : plan.resolved.verseMelody!;
        const chordRootMidi = chordBassMidi(chord, 4); // base octave for melody
        const motifBarIdx = bar % stored.bars;
        const motifEvents = playStoredMotifBar(
          stored,
          motifBarIdx,
          barStart,
          deps.secondsPerBeat,
          chordRootMidi,
          useHook ? 1.0 : 0.65, // verse is quieter
          sectionName,
        );
        events.push(...motifEvents);
      }
    }

    cursor = sectionEnd;
  }

  // Sort events for renderer; stable for identical timestamps.
  events.sort((a, b) => a.t - b.t);

  // Post-pass: mark kicks that fire when no bass note is concurrently
  // active as `flavor: 'solo'`. The renderer reads this and only layers
  // the sub-on-kick when solo — preventing 30-80 Hz mud where bass +
  // sub-on-kick would otherwise stack.
  const bassWindowSec = 0.12;
  const bassIntervals: Array<[number, number]> = events
    .filter(e => e.kind === "bass" && e.duration && e.freq)
    .map(e => [e.t, e.t + (e.duration ?? 0)]);
  for (const e of events) {
    if (e.kind !== "kick") continue;
    const bassActive = bassIntervals.some(([start, end]) =>
      e.t >= start - bassWindowSec && e.t <= end
    );
    if (!bassActive) e.flavor = "solo";
  }

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
    // Humanized velocities — kick on every beat with subtle dynamic curve
    for (let i = 0; i < 16; i += 4) {
      const isStrong = i === 0 || i === 8;
      hits.push({
        step: i,
        velocity: (isStrong ? 0.95 : 0.88) + (deps.rng() - 0.5) * 0.06,
        kind: "kick",
      });
    }
    if (e >= 0.4) {
      hits.push({ step: 4, velocity: 0.7 + (deps.rng() - 0.5) * 0.1, kind: "clap" });
      hits.push({ step: 12, velocity: 0.72 + (deps.rng() - 0.5) * 0.1, kind: "clap" });
    }
    // Hi-hats with humanized velocity AND microtiming
    for (let i = 0; i < 16; i += 2) {
      const open = (i % 8) === 4 && deps.rng() < e * 0.3;
      const baseV = i % 4 === 0 ? 0.42 : 0.32;
      const microShift = (deps.rng() - 0.5) * 0.012; // ±6 ms humanization
      hits.push({
        step: i,
        microShiftSec: microShift,
        velocity: baseV + (deps.rng() - 0.5) * 0.08,
        kind: open ? "hat-open" : "hat-closed",
      });
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
 * Choose a lyric line for a given section. We rotate through the bundle
 * arrays so verse-1 and verse-2 use different content; chorus phrases
 * cycle within each chorus instance.
 */
function pickLineForSection(bundle: LyricBundle, sectionName: string, barIndex: number): string | null {
  const n = sectionName.toLowerCase();
  let pool: string[] = [];
  if (/intro/.test(n)) return null;
  if (/verse-1|verse_1/.test(n) || (/verse/.test(n) && !/verse-2|verse_2/.test(n))) pool = bundle.verse1;
  else if (/verse-2|verse_2|verse 2/.test(n)) pool = bundle.verse2;
  else if (/pre-chorus|prechorus|build|riser/.test(n)) pool = bundle.verse1.slice(-2);
  else if (/chorus|drop|hook|final|climax/.test(n)) pool = bundle.chorus;
  else if (/bridge|break|breakdown/.test(n)) pool = bundle.bridge;
  else if (/outro|tag/.test(n)) pool = bundle.outro;
  if (pool.length === 0) return null;
  return pool[barIndex % pool.length];
}

/**
 * Sections where a sung line makes sense (anything that has lyrical
 * intent — not pure intros/outros/breakdowns).
 */
function sectionShouldSing(sectionName: string): boolean {
  return /verse|pre-chorus|chorus|drop|hook|bridge|final|climax|outro/i.test(sectionName);
}

/**
 * Distribute a lyric line across one bar by syllabifying it and assigning
 * each syllable to a chord-tone pitch with even rhythmic spacing. Stressed
 * syllables get a small velocity bump.
 */
function syllableEventsForBar(
  line: string,
  barStart: number,
  secondsPerBar: number,
  chord: string,
  rng: () => number,
  energy: number,
  sectionName: string,
): SynthEvent[] {
  const syllables: Syllable[] = syllabifyLine(line).syllables;
  if (syllables.length === 0) return [];

  // Cap: pop melodies rarely exceed ~12 syllables per bar at moderate tempo
  const sliceCount = Math.min(syllables.length, 12);
  const pickedSylls = syllables.slice(0, sliceCount);

  // Pitch: alternate between chord tones (3rd, 5th, 1-octave-up root)
  // for a singable contour. Slight melodic interest per stressed syllable.
  const chordNotes = chordToMidi(chord, 4);
  // Sing in upper-middle range — bass holds the root below.
  const sungPool = chordNotes.length >= 3
    ? [chordNotes[1], chordNotes[2], chordNotes[0] + 12, chordNotes[1] + 12]
    : [chordNotes[0] + 12];

  // Each syllable gets equal rhythmic share, with the last one held longer
  const rawStep = (secondsPerBar * 0.92) / pickedSylls.length;
  const events: SynthEvent[] = [];
  let lastIdx = 0;
  for (let i = 0; i < pickedSylls.length; i++) {
    const syll = pickedSylls[i];
    // Move by step on stressed syllables; small wander on unstressed
    if (syll.stressed) {
      lastIdx = (lastIdx + (rng() < 0.5 ? 1 : -1) + sungPool.length) % sungPool.length;
    } else if (rng() < 0.35) {
      lastIdx = (lastIdx + (rng() < 0.5 ? 1 : -1) + sungPool.length) % sungPool.length;
    }
    const midi = sungPool[Math.abs(lastIdx) % sungPool.length];
    const t = barStart + i * rawStep + 0.02;
    const isLast = i === pickedSylls.length - 1;
    const dur = isLast ? Math.max(rawStep * 1.4, 0.25) : rawStep * 0.92;
    const vel = (syll.stressed ? 0.62 : 0.48) * Math.min(1, energy * 1.05);
    events.push({
      t,
      duration: dur,
      freq: midiToFreq(midi),
      velocity: vel,
      kind: "chant",
      vowel: syll.vowel as Vowel,
      sectionName,
    });
  }
  return events;
}

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
// Stored-motif playback — plays one bar's worth of a pre-computed melody
// ---------------------------------------------------------------------------

function playStoredMotifBar(
  motif: StoredMelody,
  motifBarIdx: number,
  barStart: number,
  secondsPerBeat: number,
  chordRootMidi: number,
  velocityScale: number,
  sectionName: string,
): SynthEvent[] {
  const beatsPerBar = (motif.bars > 0)
    ? Math.max(1, Math.round(
        motif.notes.length > 0
          ? Math.max(...motif.notes.map(n => n.beat + n.durationBeats)) / motif.bars
          : 4
      ))
    : 4;
  const motifBarStartBeat = motifBarIdx * beatsPerBar;
  const motifBarEndBeat   = (motifBarIdx + 1) * beatsPerBar;

  const out: SynthEvent[] = [];
  for (const note of motif.notes) {
    if (note.rest) continue;
    if (note.beat < motifBarStartBeat || note.beat >= motifBarEndBeat) continue;
    const localBeat = note.beat - motifBarStartBeat;
    const tAbsolute = barStart + localBeat * secondsPerBeat;
    const midi = chordRootMidi + note.degreeFromChordRoot;
    out.push({
      t: tAbsolute,
      duration: Math.max(0.08, note.durationBeats * secondsPerBeat),
      freq: midiToFreq(midi),
      velocity: Math.min(1, note.velocity * velocityScale),
      kind: "lead",
      flavor: "fm",
      sectionName,
    });
  }
  return out;
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
  const chord = voicings[chordIdx];
  const c = parseChord(chord);

  // Build a "safe" pool: scale notes that are also in-chord. This is the
  // single biggest tuning fix — a melody in F harmonic minor over an Am
  // chord must use scale notes that align with the actual current chord,
  // not just any scale note.
  const thirdInterval = (c.quality === "min" || c.quality === "dim") ? 3 : 4;
  const fifthInterval = c.quality === "dim" ? 6 : c.quality === "aug" ? 8 : 7;
  const chordPcs = new Set([c.rootPc, (c.rootPc + thirdInterval) % 12, (c.rootPc + fifthInterval) % 12]);
  const inChord = scale.filter(m => chordPcs.has(m % 12));
  const pool = inChord.length >= 2 ? inChord : scale;

  // Anchor: bar 1 always lands on a chord tone (the third or root) — this
  // is what makes the melody "land" musically over the chord.
  const motifLength = 8;
  const anchorIdx = pool.findIndex(m => m % 12 === (c.rootPc + thirdInterval) % 12);
  let lastIdx = anchorIdx >= 0 ? anchorIdx : Math.floor(deps.rng() * pool.length);

  // Range cap: the melody must stay within ~9 semitones (a major 6th) for
  // singability and cohesion. Track the highest/lowest used so we clamp.
  const startMidi = pool[lastIdx];
  const RANGE_SEMITONES = 9;

  for (let i = 0; i < motifLength; i++) {
    const t = barStart + i * deps.secondsPerStep * 2;

    // Beat-1 anchor: on the very first 8th of the bar, force chord-tone
    if (i === 0) {
      const midi = pool[lastIdx];
      out.push({
        t, kind: "lead", freq: midiToFreq(midi),
        duration: deps.secondsPerStep * 1.8,
        velocity: 0.6 + deps.rng() * 0.1,
        flavor: "fm", sectionName,
      });
      continue;
    }

    // Rest probability — breath spacing
    if (deps.rng() < 0.22) continue;

    // Step or small leap (bias toward steps — voice-leading)
    const stepProb = 0.78;
    let move: number;
    if (deps.rng() < stepProb) {
      move = deps.rng() < 0.5 ? -1 : 1;
    } else {
      move = deps.rng() < 0.5 ? -2 : 2;
    }
    let nextIdx = clamp(lastIdx + move, 0, pool.length - 1);
    let nextMidi = pool[nextIdx];

    // Range guard: snap back if we've drifted past the major-6th window
    if (Math.abs(nextMidi - startMidi) > RANGE_SEMITONES) {
      nextIdx = anchorIdx >= 0 ? anchorIdx : Math.max(0, lastIdx - 1);
      nextMidi = pool[nextIdx];
    }
    lastIdx = nextIdx;

    out.push({
      t, kind: "lead",
      freq: midiToFreq(nextMidi),
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
