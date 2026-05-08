/**
 * Offline renderer.
 *
 * Builds a per-section bus graph in an OfflineAudioContext, fires every
 * synth event from the sequencer onto that graph, and renders to a
 * Float32Array channel pair. Roughly 100× faster than realtime — a
 * 3-min song renders in 1–4s on a modern laptop.
 *
 * Bus layout:
 *
 *   drumBus   ──┐
 *   bassBus   ──┤
 *   padBus    ──┼──> mixBus ──> compressor ──> destination
 *   leadBus   ──┤              (master glue)
 *   fxBus     ──┘
 *
 *   Sidechain: a sample-and-hold on every kick event ducks padBus and
 *   bassBus by the per-genre target (from AUDIO_BALANCE_RULES.json) using
 *   a fast attack / 200 ms release envelope on a GainNode.
 *
 *   Reverb sends from padBus and leadBus into a small convolver-style
 *   feedback delay network for depth (we don't ship an impulse response;
 *   a 2-tap allpass + delay sounds close enough for procedural music).
 */

import type { CompositionPlan } from "../types";
import { sequence, type SynthEvent } from "./sequencer";
import {
  kickAt, subAt, snareAt, clapAt, hatAt,
  bassAt, padAt, leadAt, vowelAt,
  riserAt, impactAt,
  type Vowel,
} from "./voices";
import type { LyricBundle } from "../lyric-engine";

export interface RenderOptions {
  /** Sample rate. Defaults to 44100. */
  sampleRate?: number;
  /** Stereo channels (always 2 here, but exposed for future expansion). */
  channels?: 2;
  /** Layer the vocoder/formant chant on chorus/drop sections. */
  vocoderVoice?: boolean;
  /** Lyrics for the vocoder to sing (one syllable per chant event). */
  lyrics?: LyricBundle;
  /** Optional onProgress callback called once per section for UI updates. */
  onProgress?: (progress: number, message: string) => void;
}

export interface RenderResult {
  /** Stereo Float32Array channels. */
  channels: Float32Array[];
  sampleRate: number;
  durationSeconds: number;
  /** Number of events scheduled — useful for diagnostics. */
  eventCount: number;
}

/**
 * Render the plan to a stereo Float32Array. Pure offline, no DOM access
 * other than `OfflineAudioContext`. Caller is responsible for routing the
 * result through master-pass.ts and (optionally) wav-encoder.ts.
 */
export async function renderCompositionPlan(
  plan: CompositionPlan,
  opts: RenderOptions = {},
): Promise<RenderResult> {
  const sampleRate = opts.sampleRate ?? 44100;
  const seed = plan.meta?.seed ?? "default";

  const seq = sequence(plan, seed, {
    vocoderVoice: opts.vocoderVoice,
    lyrics: opts.lyrics,
  });
  const length = Math.ceil((seq.totalSeconds + 1.5) * sampleRate); // pad 1.5s tail
  const ctx = new OfflineAudioContext(2, length, sampleRate);

  // Master compressor for glue
  const master = ctx.createDynamicsCompressor();
  master.threshold.value = -16;
  master.ratio.value = 2.0;
  master.attack.value = 0.03;
  master.release.value = 0.2;
  master.knee.value = 6;
  master.connect(ctx.destination);

  // Mix bus
  const mixBus = ctx.createGain();
  mixBus.gain.value = 0.85;
  mixBus.connect(master);

  // Per-bus stereo positioning
  const drumBus     = ctx.createGain(); drumBus.gain.value     = 0.95;
  const bassBus     = ctx.createGain(); bassBus.gain.value     = 0.85;
  const padBus      = ctx.createGain(); padBus.gain.value      = 0.50;
  const leadBus     = ctx.createGain(); leadBus.gain.value     = 0.70;
  const vocoderBus  = ctx.createGain(); vocoderBus.gain.value  = 0.65;
  const fxBus       = ctx.createGain(); fxBus.gain.value       = 0.60;

  // High-pass the pad bus at 200 Hz so chord stacks don't compete with
  // bass+kick for the sub region. Cleans up perceived "mud".
  const padHpf = ctx.createBiquadFilter();
  padHpf.type = "highpass";
  padHpf.frequency.value = 200;
  padHpf.Q.value = 0.7;
  padBus.connect(padHpf);
  padHpf.connect(mixBus);

  // High-pass the vocoder slightly to keep it in the vocal range
  const vocHpf = ctx.createBiquadFilter();
  vocHpf.type = "highpass";
  vocHpf.frequency.value = 130;
  vocHpf.Q.value = 0.7;
  vocoderBus.connect(vocHpf);
  vocHpf.connect(mixBus);

  drumBus.connect(mixBus);
  bassBus.connect(mixBus);
  // padBus and vocoderBus already routed through their HPFs above
  leadBus.connect(mixBus);
  fxBus.connect(mixBus);

  // Light reverb send from pad + lead. Vocoder gets a heavier send because
  // vocals always sit "deeper" in the room than synths.
  const reverbSend = createSimpleReverbSend(ctx);
  padBus.connect(reverbSend.input);
  leadBus.connect(reverbSend.input);
  const vocoderReverbSend = ctx.createGain();
  vocoderReverbSend.gain.value = 0.55;
  vocoderBus.connect(vocoderReverbSend).connect(reverbSend.input);
  reverbSend.output.connect(mixBus);

  // Sidechain envelopes — schedule per kick event. Vocoder ducks too so
  // it sits behind the kick on every downbeat.
  const sidechainAmount = sidechainGRForGenre(plan.resolved.genreId);
  if (sidechainAmount > 0) {
    scheduleSidechain(ctx, seq.events, [bassBus, padBus, vocoderBus], sidechainAmount);
  }

  opts.onProgress?.(0.05, "Routing buses");

  // Fire every event
  const totalEvents = seq.events.length;
  let processed = 0;
  for (const ev of seq.events) {
    fireEvent(ctx, ev, { drumBus, bassBus, padBus, leadBus, vocoderBus, fxBus });
    processed++;
    if (processed % 200 === 0 && opts.onProgress) {
      opts.onProgress(0.1 + (processed / totalEvents) * 0.4, "Scheduling events");
    }
  }

  opts.onProgress?.(0.5, "Rendering offline");
  const buffer = await ctx.startRendering();
  opts.onProgress?.(0.95, "Render complete");

  return {
    channels: [buffer.getChannelData(0), buffer.getChannelData(1)],
    sampleRate,
    durationSeconds: buffer.duration,
    eventCount: totalEvents,
  };
}

// ---------------------------------------------------------------------------
// Bus dispatch
// ---------------------------------------------------------------------------

interface Buses {
  drumBus: GainNode;
  bassBus: GainNode;
  padBus: GainNode;
  leadBus: GainNode;
  vocoderBus: GainNode;
  fxBus: GainNode;
}

function fireEvent(ctx: BaseAudioContext, ev: SynthEvent, b: Buses) {
  switch (ev.kind) {
    case "chant":
      if (ev.freq && ev.duration) {
        vowelAt(ctx, ev.t, b.vocoderBus, {
          freq: ev.freq,
          duration: ev.duration,
          vowel: (ev.vowel as Vowel) ?? "ah",
          velocity: ev.velocity,
          vibrato: 0.4,
          unison: true,
        });
      }
      break;
    case "kick":
      kickAt(ctx, ev.t, b.drumBus, { velocity: ev.velocity });
      // Layer sub on every kick for low-end weight
      subAt(ctx, ev.t, b.drumBus, { freq: 50, duration: 0.18, velocity: (ev.velocity ?? 1) * 0.5 });
      break;
    case "sub":
      if (ev.freq && ev.duration) subAt(ctx, ev.t, b.bassBus, { freq: ev.freq, duration: ev.duration, velocity: ev.velocity });
      break;
    case "snare":
      snareAt(ctx, ev.t, b.drumBus, { velocity: ev.velocity });
      break;
    case "clap":
      clapAt(ctx, ev.t, b.drumBus, { velocity: ev.velocity });
      break;
    case "hat-closed":
      hatAt(ctx, ev.t, b.drumBus, { velocity: ev.velocity, open: false });
      break;
    case "hat-open":
      hatAt(ctx, ev.t, b.drumBus, { velocity: ev.velocity, open: true });
      break;
    case "bass":
      if (ev.freq && ev.duration) bassAt(ctx, ev.t, b.bassBus, {
        freq: ev.freq, duration: ev.duration, velocity: ev.velocity,
        flavor: (ev.flavor as "sub" | "808" | "synth") ?? "synth",
      });
      break;
    case "pad":
      if (ev.freqs && ev.duration) padAt(ctx, ev.t, b.padBus, {
        freqs: ev.freqs, duration: ev.duration, velocity: ev.velocity,
      });
      break;
    case "lead":
      if (ev.freq && ev.duration) leadAt(ctx, ev.t, b.leadBus, {
        freq: ev.freq, duration: ev.duration, velocity: ev.velocity,
        flavor: (ev.flavor as "fm" | "saw" | "pluck") ?? "fm",
      });
      break;
    case "pluck":
      if (ev.freq && ev.duration) leadAt(ctx, ev.t, b.leadBus, {
        freq: ev.freq, duration: ev.duration, velocity: ev.velocity, flavor: "pluck",
      });
      break;
    case "riser":
      if (ev.duration) riserAt(ctx, ev.t, ev.duration, b.fxBus);
      break;
    case "impact":
      impactAt(ctx, ev.t, b.fxBus, { velocity: ev.velocity });
      break;
  }
}

// ---------------------------------------------------------------------------
// Sidechain via gain envelope automation on every kick
// ---------------------------------------------------------------------------

function scheduleSidechain(
  ctx: BaseAudioContext,
  events: SynthEvent[],
  buses: GainNode[],
  amountDb: number,
): void {
  const amountLin = Math.pow(10, -amountDb / 20);
  const attack = 0.005;
  const release = 0.18;

  // Reset gain to 1, apply duck-then-recover at every kick event.
  for (const bus of buses) {
    bus.gain.cancelScheduledValues(0);
    bus.gain.setValueAtTime(1, 0);
  }

  for (const ev of events) {
    if (ev.kind !== "kick") continue;
    for (const bus of buses) {
      bus.gain.setValueAtTime(1, ev.t);
      bus.gain.linearRampToValueAtTime(amountLin, ev.t + attack);
      bus.gain.linearRampToValueAtTime(1, ev.t + attack + release);
    }
  }
}

function sidechainGRForGenre(genreId: string): number {
  // Conservative defaults — heavier sidechain feels musical only in 4-on-floor.
  if (/edm|house|trance|dubstep/.test(genreId)) return 6;
  if (/techno/.test(genreId)) return 4;
  if (/pop|k-pop|reggaeton/.test(genreId)) return 3;
  if (/trap|drill|phonk|punjabi-drill/.test(genreId)) return 1.5;
  return 0;
}

// ---------------------------------------------------------------------------
// Tiny "reverb" — feedback delay network with diffusion. Costs ~5 nodes.
// Not a real convolver, but adds depth without shipping an IR.
// ---------------------------------------------------------------------------

function createSimpleReverbSend(ctx: BaseAudioContext): { input: AudioNode; output: AudioNode } {
  const input = ctx.createGain();
  const wetGain = ctx.createGain(); wetGain.gain.value = 0.25;

  // 4 parallel delays + cross-feedback for diffusion
  const delays = [0.029, 0.041, 0.053, 0.073].map(d => {
    const dl = ctx.createDelay(2.0);
    dl.delayTime.value = d;
    return dl;
  });
  const fb = ctx.createGain(); fb.gain.value = 0.55;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass"; tone.frequency.value = 4500;

  // Wire: input → each delay → tone → fb → into all delays again → wetGain
  const merger = ctx.createGain();
  delays.forEach(dl => {
    input.connect(dl);
    dl.connect(tone);
  });
  tone.connect(fb);
  delays.forEach(dl => fb.connect(dl));
  tone.connect(merger);
  merger.connect(wetGain);

  return { input, output: wetGain };
}
