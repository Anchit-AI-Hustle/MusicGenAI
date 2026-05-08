/**
 * MIDI exporter.
 *
 * Same CompositionPlan → standard MIDI file. Lets users open the song in
 * Ableton / FL / Logic / Reaper and use their own samples and instruments.
 *
 * Backed by `@tonejs/midi` (already in package.json). Output is an
 * ArrayBuffer the caller can download as `.mid`.
 *
 * Tracks emitted:
 *   - Track 1: Drums (channel 9 = General MIDI drum channel)
 *   - Track 2: Bass
 *   - Track 3: Pad / chord stack
 *   - Track 4: Lead
 *
 * General MIDI program assignments are picked per genre so a track loaded
 * into a default GM synth still gives a recognizable timbre.
 */

import { Midi } from "@tonejs/midi";
import type { CompositionPlan } from "./types";
import { sequence, type SynthEvent } from "./local-synth/sequencer";

interface GMProgramSet {
  bass: number;
  pad: number;
  lead: number;
}

function programsForGenre(genreId: string): GMProgramSet {
  if (/edm|house|trance|techno|dubstep/.test(genreId)) return { bass: 38, pad: 89, lead: 81 };
  if (/synthwave/.test(genreId))                        return { bass: 39, pad: 90, lead: 82 };
  if (/trap|drill|phonk|hip-hop/.test(genreId))         return { bass: 38, pad: 88, lead: 81 };
  if (/lo-fi|lofi/.test(genreId))                       return { bass: 33, pad: 0,  lead: 4  };
  if (/rnb|neo-soul/.test(genreId))                     return { bass: 33, pad: 4,  lead: 5  };
  if (/jazz/.test(genreId))                             return { bass: 32, pad: 0,  lead: 56 };
  if (/rock|metal|punk/.test(genreId))                  return { bass: 33, pad: 49, lead: 30 };
  if (/country|folk|acoustic/.test(genreId))            return { bass: 32, pad: 24, lead: 25 };
  if (/classical|orchestral|film/.test(genreId))        return { bass: 43, pad: 49, lead: 40 };
  if (/ambient|meditation/.test(genreId))               return { bass: 88, pad: 88, lead: 89 };
  if (/bollywood|bhangra|punjabi|indian/.test(genreId)) return { bass: 33, pad: 49, lead: 73 };
  return { bass: 33, pad: 0, lead: 81 };
}

// GM drum kit notes (channel 9 / 10 in 1-indexed). All on note number basis.
const GM_DRUM = {
  kick: 36,
  snare: 38,
  clap: 39,
  hatClosed: 42,
  hatOpen: 46,
};

export function exportMidi(plan: CompositionPlan): ArrayBuffer {
  const midi = new Midi();
  midi.header.setTempo(plan.resolved.bpm);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: timeSigArray(plan.resolved.timeSignature),
  });
  midi.header.name = `${plan.resolved.genreId} ${plan.resolved.bpm}bpm ${plan.resolved.key}${plan.resolved.mode}`;

  const seq = sequence(plan, plan.meta?.seed ?? "default");
  const programs = programsForGenre(plan.resolved.genreId);

  // Track 1 — Drums (GM channel 10, which is index 9)
  const drumTrack = midi.addTrack();
  drumTrack.name = "Drums";
  drumTrack.channel = 9; // GM drum channel
  for (const ev of seq.events) {
    const drumNote = midiDrumNote(ev);
    if (drumNote === null) continue;
    drumTrack.addNote({
      midi: drumNote,
      time: ev.t,
      duration: 0.05,
      velocity: ev.velocity ?? 0.8,
    });
  }

  // Track 2 — Bass
  const bassTrack = midi.addTrack();
  bassTrack.name = "Bass";
  bassTrack.channel = 0;
  bassTrack.instrument.number = programs.bass;
  for (const ev of seq.events) {
    if (ev.kind !== "bass" || !ev.freq || !ev.duration) continue;
    bassTrack.addNote({
      midi: freqToMidi(ev.freq),
      time: ev.t,
      duration: ev.duration,
      velocity: ev.velocity ?? 0.85,
    });
  }

  // Track 3 — Pad / chords (one note per chord tone per chord-onset)
  const padTrack = midi.addTrack();
  padTrack.name = "Pad";
  padTrack.channel = 1;
  padTrack.instrument.number = programs.pad;
  for (const ev of seq.events) {
    if (ev.kind !== "pad" || !ev.freqs || !ev.duration) continue;
    for (const f of ev.freqs) {
      padTrack.addNote({
        midi: freqToMidi(f),
        time: ev.t,
        duration: ev.duration,
        velocity: ev.velocity ?? 0.45,
      });
    }
  }

  // Track 4 — Lead
  const leadTrack = midi.addTrack();
  leadTrack.name = "Lead";
  leadTrack.channel = 2;
  leadTrack.instrument.number = programs.lead;
  for (const ev of seq.events) {
    if ((ev.kind !== "lead" && ev.kind !== "pluck") || !ev.freq || !ev.duration) continue;
    leadTrack.addNote({
      midi: freqToMidi(ev.freq),
      time: ev.t,
      duration: ev.duration,
      velocity: ev.velocity ?? 0.55,
    });
  }

  return midi.toArray().buffer.slice(0) as ArrayBuffer;
}

function midiDrumNote(ev: SynthEvent): number | null {
  switch (ev.kind) {
    case "kick":       return GM_DRUM.kick;
    case "snare":      return GM_DRUM.snare;
    case "clap":       return GM_DRUM.clap;
    case "hat-closed": return GM_DRUM.hatClosed;
    case "hat-open":   return GM_DRUM.hatOpen;
    default: return null;
  }
}

function freqToMidi(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

function timeSigArray(ts: string): [number, number] {
  const parts = ts.split("/");
  if (parts.length === 2) {
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
  }
  return [4, 4];
}
