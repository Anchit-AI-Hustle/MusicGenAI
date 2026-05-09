/**
 * DSP voices.
 *
 * Each `*At()` function schedules one note/hit on the given AudioContext at
 * time `t`, routed into the given output node. Pure WebAudio, no Tone.js.
 *
 * Voices: kick, sub, snare, clap, hihat (closed/open), bass, pad, lead,
 * pluck, vocoder lead, riser, impact.
 *
 * Design rule: every voice cleans up its own nodes by `stop()` so the
 * OfflineAudioContext doesn't accumulate live nodes during long renders.
 */

export type Bus = AudioNode;

// ---------------------------------------------------------------------------
// Drums
// ---------------------------------------------------------------------------

export function kickAt(ctx: BaseAudioContext, t: number, dst: Bus, opts: {
  velocity?: number;     // 0..1
  pitch?: number;        // start pitch in Hz, default 130
  decay?: number;        // body decay seconds, default 0.35
  punch?: number;        // 0..1 click amount
} = {}) {
  const v = opts.velocity ?? 1;
  const startHz = opts.pitch ?? 130;
  const decay = opts.decay ?? 0.35;
  const punch = opts.punch ?? 0.6;

  // Body: sine sweep from startHz down to ~50 Hz
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(startHz, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + decay);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  osc.connect(g).connect(dst);
  osc.start(t); osc.stop(t + decay + 0.05);

  // Click: short noise burst
  if (punch > 0) {
    const click = ctx.createBufferSource();
    click.buffer = whiteNoiseBuffer(ctx, 0.01);
    const cf = ctx.createBiquadFilter();
    cf.type = "highpass"; cf.frequency.value = 1500;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(v * punch * 0.6, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    click.connect(cf).connect(cg).connect(dst);
    click.start(t); click.stop(t + 0.03);
  }
}

export function subAt(ctx: BaseAudioContext, t: number, dst: Bus, opts: {
  freq: number; duration: number; velocity?: number;
}) {
  const v = opts.velocity ?? 0.85;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = opts.freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.005);
  g.gain.setValueAtTime(v, t + opts.duration - 0.05);
  g.gain.linearRampToValueAtTime(0, t + opts.duration);
  osc.connect(g).connect(dst);
  osc.start(t); osc.stop(t + opts.duration + 0.02);
}

export function snareAt(ctx: BaseAudioContext, t: number, dst: Bus, opts: {
  velocity?: number; tone?: number;
} = {}) {
  const v = opts.velocity ?? 1;
  const tone = opts.tone ?? 200;

  // Tone (snare body): triangle at ~200 Hz with fast decay
  const tOsc = ctx.createOscillator();
  tOsc.type = "triangle"; tOsc.frequency.value = tone;
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(v * 0.6, t);
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  tOsc.connect(tg).connect(dst);
  tOsc.start(t); tOsc.stop(t + 0.15);

  // Noise crack
  const noise = ctx.createBufferSource();
  noise.buffer = whiteNoiseBuffer(ctx, 0.18);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = 2500; bp.Q.value = 0.6;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(v, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  noise.connect(bp).connect(ng).connect(dst);
  noise.start(t); noise.stop(t + 0.2);
}

export function clapAt(ctx: BaseAudioContext, t: number, dst: Bus, opts: { velocity?: number } = {}) {
  const v = opts.velocity ?? 1;
  // Three short noise bursts spaced by ~10 ms = clap impression
  for (let i = 0; i < 3; i++) {
    const off = t + i * 0.01;
    const n = ctx.createBufferSource();
    n.buffer = whiteNoiseBuffer(ctx, 0.04);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 1.4;
    const g = ctx.createGain();
    const peak = v * (i === 2 ? 1 : 0.6);
    g.gain.setValueAtTime(peak, off);
    g.gain.exponentialRampToValueAtTime(0.0001, off + 0.08);
    n.connect(bp).connect(g).connect(dst);
    n.start(off); n.stop(off + 0.1);
  }
}

export function hatAt(ctx: BaseAudioContext, t: number, dst: Bus, opts: {
  velocity?: number; open?: boolean;
} = {}) {
  const v = opts.velocity ?? 0.5;
  const open = !!opts.open;
  const noise = ctx.createBufferSource();
  noise.buffer = whiteNoiseBuffer(ctx, open ? 0.18 : 0.04);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = 7000;
  const g = ctx.createGain();
  const decay = open ? 0.18 : 0.04;
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  noise.connect(hp).connect(g).connect(dst);
  noise.start(t); noise.stop(t + decay + 0.02);
}

// ---------------------------------------------------------------------------
// Pitched voices
// ---------------------------------------------------------------------------

export function bassAt(ctx: BaseAudioContext, t: number, dst: Bus, opts: {
  freq: number; duration: number; velocity?: number; flavor?: "sub" | "808" | "synth";
}) {
  const v = opts.velocity ?? 0.85;
  const flavor = opts.flavor ?? "synth";
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = flavor === "sub" ? "sine" : "sawtooth";
  osc2.type = "square";
  osc1.frequency.value = opts.freq;
  osc2.frequency.value = opts.freq * 0.5; // sub octave

  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.setValueAtTime(flavor === "808" ? 800 : 1200, t);
  lpf.frequency.exponentialRampToValueAtTime(200, t + opts.duration);
  lpf.Q.value = 4;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.01);
  if (flavor === "808") {
    g.gain.exponentialRampToValueAtTime(v * 0.6, t + opts.duration * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration);
  } else {
    g.gain.setValueAtTime(v * 0.85, t + opts.duration - 0.1);
    g.gain.linearRampToValueAtTime(0, t + opts.duration);
  }
  const mix = ctx.createGain();
  osc1.connect(mix);
  const subMix = ctx.createGain(); subMix.gain.value = 0.4;
  osc2.connect(subMix).connect(mix);
  mix.connect(lpf).connect(g).connect(dst);
  osc1.start(t); osc2.start(t);
  osc1.stop(t + opts.duration + 0.05);
  osc2.stop(t + opts.duration + 0.05);
}

export function padAt(ctx: BaseAudioContext, t: number, dst: Bus, opts: {
  freqs: number[]; duration: number; velocity?: number;
}) {
  const v = opts.velocity ?? 0.45;
  for (const f of opts.freqs) {
    // Each chord tone: detuned saw stack -> low-pass -> envelope
    const osc1 = ctx.createOscillator(); osc1.type = "sawtooth"; osc1.frequency.value = f * 0.998;
    const osc2 = ctx.createOscillator(); osc2.type = "sawtooth"; osc2.frequency.value = f;
    const osc3 = ctx.createOscillator(); osc3.type = "sawtooth"; osc3.frequency.value = f * 1.002;
    const lpf = ctx.createBiquadFilter(); lpf.type = "lowpass";
    lpf.frequency.value = 2400; lpf.Q.value = 0.7;
    const g = ctx.createGain();
    const attack = Math.min(0.4, opts.duration * 0.15);
    const release = Math.min(0.5, opts.duration * 0.2);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v / opts.freqs.length, t + attack);
    g.gain.setValueAtTime(v / opts.freqs.length, t + opts.duration - release);
    g.gain.linearRampToValueAtTime(0, t + opts.duration);
    osc1.connect(lpf); osc2.connect(lpf); osc3.connect(lpf);
    lpf.connect(g).connect(dst);
    osc1.start(t); osc2.start(t); osc3.start(t);
    osc1.stop(t + opts.duration + 0.05);
    osc2.stop(t + opts.duration + 0.05);
    osc3.stop(t + opts.duration + 0.05);
  }
}

export function leadAt(ctx: BaseAudioContext, t: number, dst: Bus, opts: {
  freq: number; duration: number; velocity?: number; flavor?: "fm" | "saw" | "pluck";
}) {
  const v = opts.velocity ?? 0.55;
  const flavor = opts.flavor ?? "fm";
  if (flavor === "fm") {
    // Simple 2-op FM: modulator at 2x carrier modulating carrier frequency
    const car = ctx.createOscillator(); car.type = "sine"; car.frequency.value = opts.freq;
    const mod = ctx.createOscillator(); mod.type = "sine"; mod.frequency.value = opts.freq * 2;
    const modGain = ctx.createGain(); modGain.gain.value = opts.freq * 1.4;
    mod.connect(modGain).connect(car.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration);
    car.connect(g).connect(dst);
    car.start(t); mod.start(t);
    car.stop(t + opts.duration + 0.05);
    mod.stop(t + opts.duration + 0.05);
  } else if (flavor === "pluck") {
    // Karplus-Strong-ish: short noise burst into a high-Q comb
    const noise = ctx.createBufferSource();
    noise.buffer = whiteNoiseBuffer(ctx, 0.005);
    const delay = ctx.createDelay();
    delay.delayTime.value = 1 / opts.freq;
    const fb = ctx.createGain(); fb.gain.value = 0.985;
    const lpf = ctx.createBiquadFilter(); lpf.type = "lowpass"; lpf.frequency.value = 4500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration);
    noise.connect(delay);
    delay.connect(lpf).connect(fb).connect(delay);
    delay.connect(g).connect(dst);
    noise.start(t); noise.stop(t + 0.01);
  } else {
    // saw
    const osc = ctx.createOscillator(); osc.type = "sawtooth"; osc.frequency.value = opts.freq;
    const lpf = ctx.createBiquadFilter(); lpf.type = "lowpass";
    lpf.frequency.setValueAtTime(opts.freq * 8, t);
    lpf.frequency.exponentialRampToValueAtTime(opts.freq * 2, t + opts.duration);
    lpf.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.01);
    g.gain.setValueAtTime(v * 0.7, t + opts.duration - 0.05);
    g.gain.linearRampToValueAtTime(0, t + opts.duration);
    osc.connect(lpf).connect(g).connect(dst);
    osc.start(t); osc.stop(t + opts.duration + 0.05);
  }
}

// ---------------------------------------------------------------------------
// Vocoder / formant voice
// ---------------------------------------------------------------------------
//
// Synthesizes a vowel-like signal at a given pitch by exciting a sawtooth
// carrier (vocal-cord-like buzz) and routing it through 3 parallel band-
// pass filters tuned to formants F1, F2, F3 for the target vowel. A 5 Hz
// vibrato LFO modulates the pitch after a 100 ms delay (vocalists rarely
// vibrato on attack). Effectively a Daft-Punk-style vocoder vocal pad —
// no recording, no model, no samples. Used for chant/drop layers.

const VOWEL_FORMANTS: Record<string, [number, number, number]> = {
  ah: [730, 1090, 2440],
  ee: [270, 2290, 3010],
  oo: [300,  870, 2240],
  oh: [570,  840, 2410],
  eh: [600, 1700, 2410],
  uh: [500, 1500, 2500],
};

const VOWEL_AMPLITUDES: Record<string, [number, number, number]> = {
  ah: [1.00, 0.50, 0.25],
  ee: [0.40, 1.00, 0.40],
  oo: [1.00, 0.30, 0.15],
  oh: [1.00, 0.40, 0.20],
  eh: [0.70, 1.00, 0.30],
  uh: [0.80, 0.60, 0.30],
};

export type Vowel = keyof typeof VOWEL_FORMANTS;

export function vowelAt(ctx: BaseAudioContext, t: number, dst: Bus, opts: {
  freq: number;
  duration: number;
  vowel?: Vowel;
  velocity?: number;
  /** Vibrato depth 0..1, default 0.4 (subtle). 0 = static pitch. */
  vibrato?: number;
  /** When true, layers a second carrier detuned by ~5¢ for unison thickness. */
  unison?: boolean;
}) {
  const v       = opts.velocity ?? 0.6;
  const vowel   = opts.vowel ?? "ah";
  const F       = VOWEL_FORMANTS[vowel];
  const A       = VOWEL_AMPLITUDES[vowel];
  const vibAmt  = opts.vibrato ?? 0.4;
  const unison  = opts.unison ?? true;

  // ── Envelope ─────────────────────────────────────────────────────────
  const env = ctx.createGain();
  const attack  = Math.min(0.06, opts.duration * 0.1);
  const release = Math.min(0.20, opts.duration * 0.25);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(v, t + attack);
  env.gain.setValueAtTime(v, t + opts.duration - release);
  env.gain.linearRampToValueAtTime(0, t + opts.duration);
  env.connect(dst);

  // ── Helper: build one carrier + 3 formant filters and route to env ──
  const buildCarrier = (freq: number, ampScale: number) => {
    const car = ctx.createOscillator();
    car.type = "sawtooth";
    car.frequency.value = freq;

    // Subtle vibrato — wait ~100 ms before vibrato kicks in (humans do this)
    if (vibAmt > 0) {
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 5; // 5 Hz vibrato is human-natural
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(0, t);
      lfoGain.gain.linearRampToValueAtTime(freq * 0.012 * vibAmt, t + Math.min(0.18, opts.duration * 0.3));
      lfo.connect(lfoGain).connect(car.frequency);
      lfo.start(t);
      lfo.stop(t + opts.duration + 0.05);
    }

    for (let i = 0; i < 3; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = F[i];
      bp.Q.value = i === 0 ? 8 : 11; // F1 a touch wider
      const g = ctx.createGain();
      g.gain.value = A[i] * ampScale;
      car.connect(bp).connect(g).connect(env);
    }

    car.start(t);
    car.stop(t + opts.duration + 0.1);
  };

  buildCarrier(opts.freq, 1.0);
  if (unison) buildCarrier(opts.freq * 1.005, 0.55);  // detuned thick layer

  // ── Add a touch of breath noise (HPF'd) for sibilance/realism ───────
  const breath = ctx.createBufferSource();
  breath.buffer = whiteNoiseBuffer(ctx, opts.duration);
  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = 4000;
  const breathGain = ctx.createGain();
  breathGain.gain.setValueAtTime(0, t);
  breathGain.gain.linearRampToValueAtTime(v * 0.04, t + attack * 1.5);
  breathGain.gain.setValueAtTime(v * 0.04, t + opts.duration - release);
  breathGain.gain.linearRampToValueAtTime(0, t + opts.duration);
  breath.connect(hpf).connect(breathGain).connect(dst);
  breath.start(t);
  breath.stop(t + opts.duration + 0.05);
}

// ---------------------------------------------------------------------------
// FX
// ---------------------------------------------------------------------------

/** White-noise riser sweep up to a target time (typically end of build section). */
export function riserAt(ctx: BaseAudioContext, t: number, duration: number, dst: Bus) {
  const noise = ctx.createBufferSource();
  noise.buffer = whiteNoiseBuffer(ctx, duration);
  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.setValueAtTime(200, t);
  hpf.frequency.exponentialRampToValueAtTime(8000, t + duration);
  hpf.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.18, t + duration * 0.85);
  g.gain.linearRampToValueAtTime(0, t + duration);
  noise.connect(hpf).connect(g).connect(dst);
  noise.start(t); noise.stop(t + duration + 0.02);
}

/** Big sub-drop impact on a downbeat — drop / chorus arrival. */
export function impactAt(ctx: BaseAudioContext, t: number, dst: Bus, opts: { velocity?: number } = {}) {
  const v = opts.velocity ?? 1;
  // Sub drop: saw 80→30 Hz over 0.5s
  const osc = ctx.createOscillator(); osc.type = "sawtooth";
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.exponentialRampToValueAtTime(30, t + 0.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  osc.connect(g).connect(dst);
  osc.start(t); osc.stop(t + 0.65);

  // Top: filtered noise burst
  const n = ctx.createBufferSource(); n.buffer = whiteNoiseBuffer(ctx, 0.25);
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1200; bp.Q.value = 0.5;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(v * 0.6, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  n.connect(bp).connect(ng).connect(dst);
  n.start(t); n.stop(t + 0.3);
}

// ---------------------------------------------------------------------------
// Buffers — cached so we don't allocate noise per hit
// ---------------------------------------------------------------------------

const noiseCache = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

function whiteNoiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  let m = noiseCache.get(ctx);
  if (!m) { m = new Map(); noiseCache.set(ctx, m); }
  const key = Math.round(seconds * 1000);
  let buf = m.get(key);
  if (buf) return buf;
  const len = Math.max(1, Math.round(ctx.sampleRate * seconds));
  buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  m.set(key, buf);
  return buf;
}
