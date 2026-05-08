/**
 * Browser-friendly audio analyzer.
 *
 * Extracts BPM, beats, and downbeats from a rendered AudioBuffer using
 * (a) STFT spectral-flux onset detection, (b) autocorrelation of the
 * onset envelope to find tempo, (c) dynamic-programming-light beat
 * tracking that snaps onset peaks to a regular grid at the detected
 * tempo.
 *
 * No external deps. Pure typed JS — runs in worker or main thread.
 *
 * The output `BeatGrid` is consumable by `audio-visual-sync.ts` to refine
 * the planned cut timestamps so they hit real downbeats in the rendered
 * audio (rather than the planned BPM grid).
 */

export interface BeatGrid {
  bpm: number;
  /** Beat timestamps in seconds. */
  beats: number[];
  /** Downbeat timestamps (every 4th beat for 4/4). */
  downbeats: number[];
  /** Detected onset times before snapping — useful for transition planning. */
  onsets: number[];
  /** Energy envelope sampled at `framesPerSecond` Hz. */
  energyEnvelope: Float32Array;
  /** Hz of energy envelope (typically ~86 Hz with hop=512 at 44.1k). */
  framesPerSecond: number;
}

const FFT_SIZE = 1024;
const HOP_SIZE = 512;
const MIN_BPM = 60;
const MAX_BPM = 200;

/** Run analysis on an AudioBuffer. */
export async function analyzeAudio(buffer: AudioBuffer): Promise<BeatGrid> {
  const monoChannels = mixdownToMono(buffer);
  const fps = buffer.sampleRate / HOP_SIZE;

  const flux = spectralFlux(monoChannels, buffer.sampleRate);
  const onsets = peakPickOnsets(flux, fps);
  const bpm = estimateBpm(flux, fps);
  const beats = trackBeats(flux, fps, bpm);
  const downbeats = pickDownbeats(beats, flux, fps);

  return {
    bpm,
    beats,
    downbeats,
    onsets,
    energyEnvelope: flux,
    framesPerSecond: fps,
  };
}

// ---------------------------------------------------------------------------
// 1. Mix to mono
// ---------------------------------------------------------------------------

function mixdownToMono(buffer: AudioBuffer): Float32Array {
  const len = buffer.length;
  const out = new Float32Array(len);
  if (buffer.numberOfChannels === 1) {
    out.set(buffer.getChannelData(0));
    return out;
  }
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += ch[i];
  }
  const inv = 1 / buffer.numberOfChannels;
  for (let i = 0; i < len; i++) out[i] *= inv;
  return out;
}

// ---------------------------------------------------------------------------
// 2. Spectral flux onset detector
// ---------------------------------------------------------------------------

function spectralFlux(mono: Float32Array, sampleRate: number): Float32Array {
  const numFrames = Math.max(0, Math.floor((mono.length - FFT_SIZE) / HOP_SIZE) + 1);
  const flux = new Float32Array(numFrames);
  if (numFrames === 0) return flux;

  const window = hannWindow(FFT_SIZE);
  let prevMag: Float32Array | null = null;
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);

  for (let i = 0; i < numFrames; i++) {
    const offset = i * HOP_SIZE;
    for (let n = 0; n < FFT_SIZE; n++) {
      re[n] = mono[offset + n] * window[n];
      im[n] = 0;
    }
    fftInPlace(re, im);

    const half = FFT_SIZE / 2;
    const mag = new Float32Array(half);
    for (let k = 0; k < half; k++) {
      mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }

    if (prevMag) {
      let sum = 0;
      for (let k = 0; k < half; k++) {
        const d = mag[k] - prevMag[k];
        if (d > 0) sum += d; // half-wave rectified
      }
      flux[i] = sum;
    }
    prevMag = mag;
  }

  // Normalize to 0..1 for stable downstream thresholds
  let max = 0;
  for (const v of flux) if (v > max) max = v;
  if (max > 0) for (let i = 0; i < flux.length; i++) flux[i] /= max;
  return flux;
}

function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}

/**
 * Iterative radix-2 FFT in place. Real input is supplied with `im` zero-init.
 */
function fftInPlace(re: Float32Array, im: Float32Array) {
  const n = re.length;
  // Bit reversal
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) { j -= m; m >>= 1; }
    j += m;
  }
  // Butterflies
  for (let s = 1; (1 << s) <= n; s++) {
    const m = 1 << s;
    const half = m >> 1;
    const angleStep = (-2 * Math.PI) / m;
    for (let k = 0; k < n; k += m) {
      for (let p = 0; p < half; p++) {
        const angle = angleStep * p;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const tr = wr * re[k + p + half] - wi * im[k + p + half];
        const ti = wr * im[k + p + half] + wi * re[k + p + half];
        re[k + p + half] = re[k + p] - tr;
        im[k + p + half] = im[k + p] - ti;
        re[k + p] = re[k + p] + tr;
        im[k + p] = im[k + p] + ti;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Onset peak picking
// ---------------------------------------------------------------------------

function peakPickOnsets(flux: Float32Array, fps: number): number[] {
  const out: number[] = [];
  if (flux.length === 0) return out;

  // Local-mean adaptive threshold, with refractory period of ~50 ms.
  const window = Math.max(3, Math.round(fps * 0.05));
  const refractory = Math.max(1, Math.round(fps * 0.05));
  const ema = new Float32Array(flux.length);
  const alpha = 0.2;
  ema[0] = flux[0];
  for (let i = 1; i < flux.length; i++) ema[i] = alpha * flux[i] + (1 - alpha) * ema[i - 1];

  let lastPeak = -Infinity;
  for (let i = 1; i < flux.length - 1; i++) {
    if (i - lastPeak < refractory) continue;
    const local = Math.max(0, ema[i]);
    const v = flux[i];
    const isPeak = v > flux[i - 1] && v >= flux[i + 1];
    if (!isPeak) continue;
    // Local max within window
    let isWindowMax = true;
    const lo = Math.max(0, i - window);
    const hi = Math.min(flux.length - 1, i + window);
    for (let k = lo; k <= hi; k++) {
      if (flux[k] > v) { isWindowMax = false; break; }
    }
    if (isWindowMax && v > local * 1.4 && v > 0.04) {
      out.push(i / fps);
      lastPeak = i;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Tempo via autocorrelation of the onset envelope
// ---------------------------------------------------------------------------

function estimateBpm(flux: Float32Array, fps: number): number {
  const minLag = Math.round(fps * (60 / MAX_BPM));
  const maxLag = Math.round(fps * (60 / MIN_BPM));
  if (flux.length < maxLag + 16) return 120;

  // Limit autocorrelation window for speed and to bias toward stable tempi.
  const windowFrames = Math.min(flux.length, Math.round(fps * 12)); // up to 12s
  const start = Math.max(0, Math.floor((flux.length - windowFrames) / 2));
  const end = start + windowFrames;

  let bestLag = minLag;
  let bestSum = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = start; i + lag < end; i++) {
      sum += flux[i] * flux[i + lag];
    }
    if (sum > bestSum) {
      bestSum = sum;
      bestLag = lag;
    }
  }
  let bpm = (60 * fps) / bestLag;
  // Resolve halving / doubling — prefer 80–160 BPM perceptual band.
  while (bpm > 180) bpm /= 2;
  while (bpm < 70) bpm *= 2;
  return Math.round(bpm * 10) / 10;
}

// ---------------------------------------------------------------------------
// 5. Beat tracking — score onsets against an evenly-spaced grid
// ---------------------------------------------------------------------------

function trackBeats(flux: Float32Array, fps: number, bpm: number): number[] {
  if (flux.length === 0 || bpm <= 0) return [];
  const periodFrames = (60 / bpm) * fps;
  const totalSeconds = flux.length / fps;

  // Try several grid phases and keep the best-scoring one.
  const phaseSteps = 16;
  let bestPhase = 0;
  let bestScore = -Infinity;
  for (let p = 0; p < phaseSteps; p++) {
    const phaseSec = (p / phaseSteps) * (60 / bpm);
    const score = scoreGrid(flux, fps, phaseSec, periodFrames);
    if (score > bestScore) { bestScore = score; bestPhase = phaseSec; }
  }

  const beats: number[] = [];
  for (let t = bestPhase; t < totalSeconds; t += periodFrames / fps) {
    beats.push(roundMs(t));
  }
  return beats;
}

function scoreGrid(flux: Float32Array, fps: number, phaseSec: number, periodFrames: number): number {
  const total = flux.length;
  let score = 0;
  for (let f = phaseSec * fps; f < total; f += periodFrames) {
    const lo = Math.max(0, Math.floor(f - 2));
    const hi = Math.min(total - 1, Math.floor(f + 2));
    let local = 0;
    for (let i = lo; i <= hi; i++) if (flux[i] > local) local = flux[i];
    score += local;
  }
  return score;
}

// ---------------------------------------------------------------------------
// 6. Downbeats — pick every 4th beat with the strongest local energy
// ---------------------------------------------------------------------------

function pickDownbeats(beats: number[], flux: Float32Array, fps: number): number[] {
  if (beats.length < 4) return beats.slice();
  const meter = 4;
  // Score each meter-phase (0..3) by sum of local energy at that phase.
  const phaseScores = [0, 0, 0, 0];
  for (let i = 0; i < beats.length; i++) {
    const idx = Math.floor(beats[i] * fps);
    const lo = Math.max(0, idx - 2);
    const hi = Math.min(flux.length - 1, idx + 2);
    let v = 0;
    for (let k = lo; k <= hi; k++) if (flux[k] > v) v = flux[k];
    phaseScores[i % meter] += v;
  }
  let bestPhase = 0;
  for (let p = 1; p < meter; p++) if (phaseScores[p] > phaseScores[bestPhase]) bestPhase = p;
  const out: number[] = [];
  for (let i = bestPhase; i < beats.length; i += meter) out.push(beats[i]);
  return out;
}

// ---------------------------------------------------------------------------
// 7. SyncPlan refinement
// ---------------------------------------------------------------------------

import type { SyncPlan, CutEvent } from "./audio-visual-sync";

/**
 * Refine a planned SyncPlan against the actual rendered audio's beat grid.
 * Cuts get snapped to the nearest detected beat (or downbeat for impact
 * cuts). The plan's BPM is replaced with the detected BPM.
 */
export function refineSyncPlanWithAudio(plan: SyncPlan, grid: BeatGrid): SyncPlan {
  if (grid.beats.length === 0) return plan;
  const refinedCuts: CutEvent[] = plan.cuts.map(c => ({
    ...c,
    t: snap(c.t, c.isImpact ? grid.downbeats : grid.beats),
  }));
  // Drop duplicates after snapping
  const seen = new Set<string>();
  const deduped = refinedCuts.filter(c => {
    const k = `${c.t.toFixed(3)}|${c.kind}|${c.sectionName}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    ...plan,
    bpm: grid.bpm,
    beatGrid: grid.beats,
    downbeatGrid: grid.downbeats,
    cuts: deduped.sort((a, b) => a.t - b.t),
  };
}

function snap(t: number, grid: number[]): number {
  if (grid.length === 0) return t;
  let best = grid[0];
  let bestDiff = Math.abs(t - best);
  // Binary search for the close neighborhood
  let lo = 0, hi = grid.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = grid[mid];
    const d = Math.abs(t - v);
    if (d < bestDiff) { best = v; bestDiff = d; }
    if (v < t) lo = mid + 1; else hi = mid - 1;
  }
  return best;
}

function roundMs(t: number): number { return Math.round(t * 1000) / 1000; }

// ---------------------------------------------------------------------------
// 8. Convenience: decode a URL into an AudioBuffer (browser only).
// ---------------------------------------------------------------------------

export async function decodeAudioUrl(url: string, audioContext: AudioContext): Promise<AudioBuffer> {
  const res = await fetch(url);
  const ab = await res.arrayBuffer();
  return audioContext.decodeAudioData(ab);
}
