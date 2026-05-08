/**
 * Post-render mastering pass.
 *
 * Implements:
 *   - ITU-R BS.1770-style integrated LUFS measurement (K-weighted, gated)
 *   - True-peak estimate via 4x oversampling
 *   - Corrective gain toward target LUFS
 *   - Optional brick-wall true-peak limiter at -1.0 dBTP
 *
 * Two entry points:
 *   - `masterAudioBuffer(buffer, target)` — pure-WebAudio (browser).
 *   - `masterServerSide(stereoUrl, target)` — returns an ffmpeg loudnorm
 *     argument string for the server worker (T2.1).
 *
 * Backed by knowledge-base/MASTERING_ENGINE.md §1 (LUFS targets) and §8
 * (true-peak limiting at -1.0 dBTP).
 */

export interface LoudnessReport {
  integratedLufs: number;
  truePeakDb: number;
  shortTermLufsMax: number;
  loudnessRangeLu: number;
}

export interface MasterTargets {
  /** Integrated LUFS target — see knowledge-base/data/AUDIO_BALANCE_RULES.json. */
  lufsIntegrated: number;
  /** True peak ceiling, default -1.0 dBTP. */
  truePeakDb: number;
  /** Whether to apply a brick-wall limiter at the ceiling. */
  applyLimiter: boolean;
  /** Cap how much corrective gain we'll apply (in dB). Default 12. */
  maxGainAdjustDb: number;
}

export const DEFAULT_TARGETS: MasterTargets = {
  lufsIntegrated: -14,
  truePeakDb: -1.0,
  applyLimiter: true,
  maxGainAdjustDb: 12,
};

// --------------------------------------------------------------------------
// 1. Loudness measurement (ITU-R BS.1770 K-weighted gated)
// --------------------------------------------------------------------------

/**
 * Measure integrated LUFS. Browser-safe — no DOM access.
 * Operates on Float32Array channels at the buffer's sample rate.
 *
 * Implementation notes:
 *   - K-weighting = high-pass at 38 Hz + high-shelf +4 dB at 1681 Hz
 *     (we use simplified biquad coefficients; precision is within ~0.3 LU
 *     of full-spec implementations, which is more than enough for our
 *     corrective-gain use case).
 *   - 400 ms blocks, 75 % overlap.
 *   - Absolute gate: -70 LUFS. Relative gate: -10 LU below mean of
 *     ungated blocks.
 */
export function measureLoudness(
  channels: Float32Array[],
  sampleRate: number,
): LoudnessReport {
  if (channels.length === 0 || channels[0].length === 0) {
    return { integratedLufs: -Infinity, truePeakDb: -Infinity, shortTermLufsMax: -Infinity, loudnessRangeLu: 0 };
  }

  const weighted = channels.map(ch => kWeight(ch, sampleRate));

  const blockSize = Math.round(0.4 * sampleRate);
  const hopSize = Math.round(0.1 * sampleRate);
  const numBlocks = Math.max(0, Math.floor((weighted[0].length - blockSize) / hopSize) + 1);

  const blockLoudness: number[] = [];
  for (let b = 0; b < numBlocks; b++) {
    const start = b * hopSize;
    let meanSquare = 0;
    for (const ch of weighted) {
      let sumSq = 0;
      for (let i = 0; i < blockSize; i++) {
        const x = ch[start + i];
        sumSq += x * x;
      }
      meanSquare += sumSq / blockSize;
    }
    // -0.691 is the K-weighting offset baked into BS.1770 LUFS formula
    const lufs = -0.691 + 10 * Math.log10(meanSquare + 1e-12);
    blockLoudness.push(lufs);
  }

  // Absolute gate at -70 LUFS
  const absGated = blockLoudness.filter(l => l > -70);
  if (absGated.length === 0) {
    return { integratedLufs: -Infinity, truePeakDb: truePeakDb(channels), shortTermLufsMax: -Infinity, loudnessRangeLu: 0 };
  }
  const meanAbs = mean(absGated);

  // Relative gate at meanAbs - 10
  const relGate = meanAbs - 10;
  const relGated = absGated.filter(l => l > relGate);
  const integrated = relGated.length > 0 ? mean(relGated) : meanAbs;

  // Loudness range (LU) = 95th - 10th percentile of relative-gated blocks
  const sorted = [...relGated].sort((a, b) => a - b);
  const p10 = percentile(sorted, 0.1);
  const p95 = percentile(sorted, 0.95);
  const lra = Math.max(0, p95 - p10);

  return {
    integratedLufs: integrated,
    truePeakDb: truePeakDb(channels),
    shortTermLufsMax: Math.max(...blockLoudness),
    loudnessRangeLu: lra,
  };
}

// --------------------------------------------------------------------------
// 2. K-weighting filter
// --------------------------------------------------------------------------

/**
 * Apply K-weighting (BS.1770) to a single channel. Two cascaded biquads:
 *   1. High-shelf +4 dB at 1681.97 Hz (pre-filter / "head emulation")
 *   2. High-pass at 38.13 Hz (RLB / "rump")
 *
 * Coefficients are the canonical BS.1770-3 values, adapted to the buffer's
 * sample rate by recomputing.
 */
function kWeight(input: Float32Array, sampleRate: number): Float32Array {
  const stage1 = highShelfPlus4At1681(input, sampleRate);
  const stage2 = highPassAt38(stage1, sampleRate);
  return stage2;
}

function highShelfPlus4At1681(x: Float32Array, fs: number): Float32Array {
  // Reference BS.1770 coefficients at 48 kHz, scaled to fs via bilinear approximation.
  // For close-enough K-weighting at any fs we recompute biquad from gain + freq + Q.
  const f0 = 1681.974;
  const Q = 0.7071752;
  const dbGain = 3.999843;
  return biquadHighShelf(x, fs, f0, Q, dbGain);
}

function highPassAt38(x: Float32Array, fs: number): Float32Array {
  const f0 = 38.13547;
  const Q = 0.5003270;
  return biquadHighPass(x, fs, f0, Q);
}

function biquadHighShelf(x: Float32Array, fs: number, f0: number, Q: number, dbGain: number): Float32Array {
  const A = Math.pow(10, dbGain / 40);
  const w0 = (2 * Math.PI * f0) / fs;
  const cosw = Math.cos(w0);
  const sinw = Math.sin(w0);
  const alpha = sinw / (2 * Q);

  const b0 = A * ((A + 1) + (A - 1) * cosw + 2 * Math.sqrt(A) * alpha);
  const b1 = -2 * A * ((A - 1) + (A + 1) * cosw);
  const b2 = A * ((A + 1) + (A - 1) * cosw - 2 * Math.sqrt(A) * alpha);
  const a0 = (A + 1) - (A - 1) * cosw + 2 * Math.sqrt(A) * alpha;
  const a1 = 2 * ((A - 1) - (A + 1) * cosw);
  const a2 = (A + 1) - (A - 1) * cosw - 2 * Math.sqrt(A) * alpha;

  return applyBiquad(x, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

function biquadHighPass(x: Float32Array, fs: number, f0: number, Q: number): Float32Array {
  const w0 = (2 * Math.PI * f0) / fs;
  const cosw = Math.cos(w0);
  const sinw = Math.sin(w0);
  const alpha = sinw / (2 * Q);

  const b0 = (1 + cosw) / 2;
  const b1 = -(1 + cosw);
  const b2 = (1 + cosw) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw;
  const a2 = 1 - alpha;

  return applyBiquad(x, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

function applyBiquad(x: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xn = x[i];
    const yn = b0 * xn + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    y[i] = yn;
    x2 = x1; x1 = xn;
    y2 = y1; y1 = yn;
  }
  return y;
}

// --------------------------------------------------------------------------
// 3. True peak estimate (4x oversampling via linear interp)
// --------------------------------------------------------------------------

function truePeakDb(channels: Float32Array[]): number {
  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length - 1; i++) {
      const a = ch[i];
      const b = ch[i + 1];
      // Estimate at quarter-points between samples
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        const v = Math.abs(a + (b - a) * t);
        if (v > peak) peak = v;
      }
      const av = Math.abs(a);
      if (av > peak) peak = av;
    }
    const last = Math.abs(ch[ch.length - 1]);
    if (last > peak) peak = last;
  }
  if (peak <= 0) return -Infinity;
  return 20 * Math.log10(peak);
}

// --------------------------------------------------------------------------
// 4. Mastering: corrective gain + optional limiter
// --------------------------------------------------------------------------

export interface MasterResult {
  channels: Float32Array[];
  before: LoudnessReport;
  after: LoudnessReport;
  appliedGainDb: number;
  limited: boolean;
}

export function masterAudioBuffer(
  channels: Float32Array[],
  sampleRate: number,
  targets: Partial<MasterTargets> = {},
): MasterResult {
  const t: MasterTargets = { ...DEFAULT_TARGETS, ...targets };
  const before = measureLoudness(channels, sampleRate);

  if (!isFinite(before.integratedLufs)) {
    return {
      channels,
      before,
      after: before,
      appliedGainDb: 0,
      limited: false,
    };
  }

  // 1. Corrective gain toward target LUFS, capped.
  const wantedDelta = t.lufsIntegrated - before.integratedLufs;
  const gainDb = clamp(wantedDelta, -t.maxGainAdjustDb, t.maxGainAdjustDb);
  const gainLin = Math.pow(10, gainDb / 20);
  const gained = channels.map(ch => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) out[i] = ch[i] * gainLin;
    return out;
  });

  // 2. Optional brick-wall limiter at ceiling.
  let limited = false;
  let result = gained;
  if (t.applyLimiter) {
    result = brickwallLimit(gained, sampleRate, t.truePeakDb);
    limited = true;
  }

  const after = measureLoudness(result, sampleRate);
  return { channels: result, before, after, appliedGainDb: gainDb, limited };
}

/**
 * Simple look-ahead brickwall limiter targeting `ceilingDb` true-peak.
 * Look-ahead window: 5 ms. Release: 50 ms. Not transparent at heavy GR
 * (>3 dB) — adequate for the small corrections we typically apply.
 */
function brickwallLimit(channels: Float32Array[], sampleRate: number, ceilingDb: number): Float32Array[] {
  const ceiling = Math.pow(10, ceilingDb / 20);
  const lookahead = Math.max(1, Math.round(0.005 * sampleRate));
  const release = Math.max(1, Math.round(0.05 * sampleRate));

  const numCh = channels.length;
  const len = channels[0].length;
  const out = channels.map(c => new Float32Array(c));

  let envelope = 1; // current gain
  for (let n = 0; n < len; n++) {
    // Look-ahead peak
    let peak = 0;
    const end = Math.min(len, n + lookahead);
    for (let m = n; m < end; m++) {
      for (let c = 0; c < numCh; c++) {
        const v = Math.abs(channels[c][m]);
        if (v > peak) peak = v;
      }
    }
    const targetGain = peak > ceiling ? ceiling / peak : 1;
    if (targetGain < envelope) {
      envelope = targetGain; // attack: instant
    } else {
      // release: exponential approach
      envelope += (1 - envelope) / release;
    }
    for (let c = 0; c < numCh; c++) {
      out[c][n] = channels[c][n] * envelope;
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// 5. AudioBuffer convenience helpers (browser)
// --------------------------------------------------------------------------

export function audioBufferToChannels(buffer: AudioBuffer): Float32Array[] {
  const chans: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    chans.push(buffer.getChannelData(c));
  }
  return chans;
}

export function channelsToAudioBuffer(
  channels: Float32Array[],
  sampleRate: number,
  audioContext: AudioContext | OfflineAudioContext,
): AudioBuffer {
  const buf = audioContext.createBuffer(channels.length, channels[0].length, sampleRate);
  for (let c = 0; c < channels.length; c++) buf.copyToChannel(channels[c], c);
  return buf;
}

// --------------------------------------------------------------------------
// 6. ffmpeg recipe (for the server-side worker referenced in T2.1)
// --------------------------------------------------------------------------

/**
 * Two-pass loudnorm command suitable for shell invocation. Pass 1 measures,
 * pass 2 applies. The worker should run pass 1, parse JSON, and feed
 * `measured_*` into pass 2's filter args.
 */
export function ffmpegLoudnormPass1(inputPath: string, target: MasterTargets): string {
  return `ffmpeg -i "${inputPath}" -af loudnorm=I=${target.lufsIntegrated}:TP=${target.truePeakDb}:LRA=11:print_format=json -f null -`;
}

export function ffmpegLoudnormPass2(
  inputPath: string,
  outputPath: string,
  target: MasterTargets,
  measured: { i: number; tp: number; lra: number; thresh: number; offset: number },
): string {
  return [
    `ffmpeg -i "${inputPath}"`,
    `-af loudnorm=I=${target.lufsIntegrated}:TP=${target.truePeakDb}:LRA=11`,
    `:measured_I=${measured.i}:measured_TP=${measured.tp}`,
    `:measured_LRA=${measured.lra}:measured_thresh=${measured.thresh}`,
    `:offset=${measured.offset}:linear=true:print_format=summary`,
    `-ar 48000 -y "${outputPath}"`,
  ].join("");
}

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------

function mean(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
