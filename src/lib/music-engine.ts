/**
 * MuseVibeStudio Hub — Internal Music Production Engine
 * Browser-based generation using Web Audio API OfflineAudioContext.
 *
 * Implements the full production pipeline:
 * - GenerationSeed (timestamp + entropy) → unique songs per generation
 * - Style Inference Engine → AI-inferred StyleProfile from user prompt
 * - Tempo Engine → BPM variation from DNA within profile range
 * - Melody Engine → motif-based with hook repetition and evolution
 * - Harmony Engine → dynamic chord progressions (no fixed templates)
 * - Arrangement Engine → dynamic section order and duration
 * - Hook Engine → strong hooks in chorus/drop sections
 * - Instrument Orchestration → DNA-driven palette variation
 * - Variation System → RNG seeded by DNA for all creative decisions
 * - Mixing/Mastering → -14 LUFS target, stem buses, stereo enhancement
 */

import {
  midiToFreq, getScaleMidi, parseKey,
  masterAudio, INTERNAL_SAMPLE_RATE,
} from './audio-utils';
import { createProfileFromAI, blendGenreProfiles, type GenreProfile } from './genre-ontology';
import { getGrooveTemplate, applyGrooveTiming, getGrooveVelocity } from './groove-engine';
import { getDrumPattern, getDrumFill, type DrumHit } from './drum-patterns';
import { generateBassline, chooseBassStyleDynamic, type BassStyle } from './bassline-generator';
import { generateMelody, generateChords, chooseMelodyStyle, generateMotif, generateHook, type Motif } from './melody-generator';
import { generateArrangement, getTransitionType } from './arrangement-engine';
import { renderTransition } from './transition-engine';
import { renderSegmentStems as renderSegmentStemsSoundFont, type SfNoteEvent } from './soundfont/sf-renderer';

// ===== Types =====

/**
 * GenerationSeed — unique fingerprint per generation ensuring no two outputs are alike.
 * Seed = timestamp + random entropy. Drives all creative decisions.
 */
export interface GenerationSeed {
  /** Human-readable seed signature */
  seed: string;
  /** Numeric form of the seed for deterministic RNG */
  numericSeed: number;
  /** Unix timestamp (ms) at creation — explicit per spec */
  timestamp: number;
  /** Random entropy mixed into the final seed */
  entropy: string;
  /** 0-1, controls melodic contour bias */
  motifShape: number;
  /** 0-1, swing vs straight feel */
  grooveBias: number;
  /** 0-1, bright vs dark harmonic choices */
  harmonicMood: number;
  /** 0-1, sparse vs dense layering */
  textureDensity: number;
  /** 0-1, calm vs intense visuals */
  visualEnergy: number;
  /** Visual color signature used by the video engine */
  colorSignature: string[];
  /** Arrangement behavior hint used by planning/orchestration */
  arrangementStyle: 'cinematic' | 'driving' | 'progressive' | 'punchy' | 'minimal' | 'through-composed';
}

export type GenerationDNA = GenerationSeed;

function hashStringToSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getCryptoRandomUint32(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  }
  return hashStringToSeed(`${Date.now()}:${performance?.now?.() ?? 0}`);
}

function createEntropyToken(timestamp: number): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${timestamp}-${getCryptoRandomUint32().toString(16)}-${getCryptoRandomUint32().toString(16)}`;
}

export function getGenerationSeedNumber(seed?: Pick<GenerationSeed, 'numericSeed' | 'seed'>): number {
  if (!seed) return 0;
  return seed.numericSeed ?? hashStringToSeed(seed.seed);
}

/** Create a fresh GenerationSeed with timestamp + high-entropy randomness */
export function createGenerationSeed(): GenerationSeed {
  const timestamp = Date.now();
  const uuid = createEntropyToken(timestamp);
  const seed = `${timestamp}-${uuid}`;
  const numericSeed = hashStringToSeed(seed);
  const rng = createRng(numericSeed);
  const palettes = [
    ['#ff6a3d', '#ffd166', '#1f4fff'],
    ['#0bd3d3', '#ff4d8d', '#f7d154'],
    ['#7c3aed', '#2dd4bf', '#f97316'],
    ['#19a974', '#1c7ed6', '#f03e3e'],
    ['#f59f00', '#00bcd4', '#7b2cbf'],
  ];
  const arrangementStyles: GenerationSeed['arrangementStyle'][] = [
    'cinematic',
    'driving',
    'progressive',
    'punchy',
    'minimal',
    'through-composed',
  ];
  return {
    seed,
    numericSeed,
    timestamp,
    entropy: uuid,
    motifShape: rng(),
    grooveBias: rng(),
    harmonicMood: rng(),
    textureDensity: rng(),
    visualEnergy: rng(),
    colorSignature: palettes[Math.floor(rng() * palettes.length)],
    arrangementStyle: arrangementStyles[Math.floor(rng() * arrangementStyles.length)],
  };
}

export const createGenerationDNA = createGenerationSeed;

export interface StyleProfile {
  genreFamily: string;
  subStyle: string;
  tempoRange: [number, number];
  rhythmComplexity: 'minimal' | 'steady' | 'driving' | 'syncopated' | 'polyrhythmic' | string;
  instrumentPalette: string[];
  energyLevel: number; // 1-10
  vocalStyle: string;
  tempoTendency?: 'very slow' | 'slow' | 'midtempo' | 'fast' | 'very fast';
  groovePattern?: string;
  textureDensity?: number; // 0-1
  atmosphere?: string;
  instruments?: string[];
  rhythmStyle?: string;
  grooveTemplate?: string;
  structureTemplate?: string[];
  harmonicStyle?: string;
  energyCurve?: string;
  density?: number;
  swing?: number;
  characteristics?: string[];
}

export interface MusicIntent {
  genre: string;
  subgenre: string;
  tempo: number;
  key: string;
  scale: string;
  mood: string;
  energy: number; // 1-10
  structure: SectionPlan[];
  instruments: string[];
  atmosphere: string;
  durationSeconds: number;
  genres?: string[]; // multiple genres for blending
  generationDNA?: GenerationSeed;
  // AI-inferred style profile
  styleProfile?: StyleProfile;
  /**
   * Route bass / lead / pad notes through a sampled SoundFont renderer for
   * dramatically better timbre (real piano, bass, strings, etc.) instead
   * of raw oscillators. Falls back to oscillators silently if the soundfont
   * can't load. Drums + FX always stay synthesized.
   */
  useSoundFont?: boolean;
}

export interface SectionPlan {
  name: string;
  duration: number;
  energy: number; // 0-1
  description: string;
}

export interface CompositionGraph {
  tempo: number;
  scale: string;
  chordProgression: string[];
  motif: number[];
  songStructure: SectionPlan[];
  barGrid: {
    totalBars: number;
    barsPerSection: { [sectionKey: string]: number };
  };
}

export interface AudioStems {
  drums: AudioBuffer;
  bass: AudioBuffer;
  melody: AudioBuffer;
  pads: AudioBuffer;
  fx: AudioBuffer;
}

type ProgressCallback = (stage: string, progress: number) => void;

// ===== Seeded random =====
export function createRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

let renderRandomSource: (() => number) | null = null;

function renderRandom() {
  return renderRandomSource ? renderRandomSource() : getCryptoRandomUint32() / 0xffffffff;
}

function shuffleWithRng<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ===== Instrument Rendering Helpers =====

function renderKick(
  ctx: OfflineAudioContext, dest: AudioNode,
  time: number, velocity: number, style: string = 'default'
) {
  // Layer 1: Body (sine sweep)
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  const startFreq = style === 'hard' ? 200 : style === 'sub' ? 130 : 160;
  const endFreq = style === 'sub' ? 28 : 38;
  const decay = style === 'hard' ? 0.35 : style === 'sub' ? 0.65 : 0.45;
  osc.frequency.setValueAtTime(startFreq, time);
  osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.08);
  gain.gain.setValueAtTime(velocity * 0.95, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
  osc.connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + decay + 0.1);

  // Layer 2: Sub-harmonic reinforcement
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(endFreq * 2, time);
  sub.frequency.exponentialRampToValueAtTime(endFreq, time + 0.04);
  subGain.gain.setValueAtTime(velocity * 0.4, time);
  subGain.gain.exponentialRampToValueAtTime(0.001, time + decay * 0.7);
  sub.connect(subGain).connect(dest);
  sub.start(time);
  sub.stop(time + decay);

  // Layer 3: Transient click for punch
  const click = ctx.createOscillator();
  const clickGain = ctx.createGain();
  click.type = 'triangle';
  click.frequency.setValueAtTime(style === 'hard' ? 4000 : 2500, time);
  click.frequency.exponentialRampToValueAtTime(400, time + 0.015);
  clickGain.gain.setValueAtTime(velocity * (style === 'hard' ? 0.35 : 0.18), time);
  clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
  click.connect(clickGain).connect(dest);
  click.start(time);
  click.stop(time + 0.03);

  // Layer 4: Noise transient for attack presence
  if (velocity > 0.4) {
    const nBufSize = Math.ceil(ctx.sampleRate * 0.015);
    const nBuf = ctx.createBuffer(1, nBufSize, ctx.sampleRate);
    const nData = nBuf.getChannelData(0);
    for (let i = 0; i < nBufSize; i++) nData[i] = (renderRandom() * 2 - 1) * (1 - i / nBufSize);
    const nSrc = ctx.createBufferSource();
    nSrc.buffer = nBuf;
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = 'bandpass';
    nFilter.frequency.value = 3500;
    nFilter.Q.value = 2;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(velocity * 0.12, time);
    nGain.gain.exponentialRampToValueAtTime(0.001, time + 0.012);
    nSrc.connect(nFilter).connect(nGain).connect(dest);
    nSrc.start(time);
    nSrc.stop(time + 0.02);
  }
}

function renderSnare(
  ctx: OfflineAudioContext, dest: AudioNode,
  time: number, velocity: number, style: string = 'default'
) {
  const dur = style === 'brush' ? 0.1 : 0.2;

  // Layer 1: Noise body (wider bandwidth for fullness)
  const bufSize = Math.ceil(ctx.sampleRate * dur);
  const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = renderRandom() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = style === 'rimshot' ? 'highpass' : 'bandpass';
  filter.frequency.value = style === 'rimshot' ? 4500 : 2800;
  filter.Q.value = style === 'brush' ? 0.4 : 1.0;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(velocity * (style === 'brush' ? 0.3 : 0.55), time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
  src.connect(filter).connect(gain).connect(dest);
  src.start(time);
  src.stop(time + dur + 0.01);

  // Layer 2: High noise sizzle for brightness
  const hiBufSize = Math.ceil(ctx.sampleRate * dur * 0.6);
  const hiBuf = ctx.createBuffer(1, hiBufSize, ctx.sampleRate);
  const hiData = hiBuf.getChannelData(0);
  for (let i = 0; i < hiBufSize; i++) hiData[i] = renderRandom() * 2 - 1;
  const hiSrc = ctx.createBufferSource();
  hiSrc.buffer = hiBuf;
  const hiFilter = ctx.createBiquadFilter();
  hiFilter.type = 'highpass';
  hiFilter.frequency.value = 6000;
  const hiGain = ctx.createGain();
  hiGain.gain.setValueAtTime(velocity * 0.15, time);
  hiGain.gain.exponentialRampToValueAtTime(0.001, time + dur * 0.5);
  hiSrc.connect(hiFilter).connect(hiGain).connect(dest);
  hiSrc.start(time);
  hiSrc.stop(time + dur * 0.6 + 0.01);

  // Layer 3: Tonal body (two oscillators for thickness)
  if (style !== 'brush') {
    const osc1 = ctx.createOscillator();
    const osc1Gain = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(220, time);
    osc1.frequency.exponentialRampToValueAtTime(110, time + 0.06);
    osc1Gain.gain.setValueAtTime(velocity * 0.35, time);
    osc1Gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc1.connect(osc1Gain).connect(dest);
    osc1.start(time);
    osc1.stop(time + 0.12);

    const osc2 = ctx.createOscillator();
    const osc2Gain = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(180, time);
    osc2.frequency.exponentialRampToValueAtTime(90, time + 0.05);
    osc2Gain.gain.setValueAtTime(velocity * 0.2, time);
    osc2Gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    osc2.connect(osc2Gain).connect(dest);
    osc2.start(time);
    osc2.stop(time + 0.1);
  }
}

function renderClap(
  ctx: OfflineAudioContext, dest: AudioNode,
  time: number, velocity: number
) {
  // Multiple staggered noise bursts for a realistic layered clap
  for (let layer = 0; layer < 4; layer++) {
    const delay = layer * 0.006 + renderRandom() * 0.003;
    const bufSize = Math.ceil(ctx.sampleRate * 0.14);
    const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = renderRandom() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000 + layer * 600;
    filter.Q.value = 1.0;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(velocity * 0.22, time + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, time + delay + 0.12);
    src.connect(filter).connect(gain).connect(dest);
    src.start(time + delay);
    src.stop(time + delay + 0.18);
  }
  // Tail reverb-like noise for presence
  const tailSize = Math.ceil(ctx.sampleRate * 0.25);
  const tailBuf = ctx.createBuffer(1, tailSize, ctx.sampleRate);
  const tailData = tailBuf.getChannelData(0);
  for (let i = 0; i < tailSize; i++) tailData[i] = (renderRandom() * 2 - 1) * (1 - i / tailSize);
  const tailSrc = ctx.createBufferSource();
  tailSrc.buffer = tailBuf;
  const tailFilter = ctx.createBiquadFilter();
  tailFilter.type = 'bandpass';
  tailFilter.frequency.value = 1800;
  tailFilter.Q.value = 0.5;
  const tailGain = ctx.createGain();
  tailGain.gain.setValueAtTime(velocity * 0.08, time + 0.02);
  tailGain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
  tailSrc.connect(tailFilter).connect(tailGain).connect(dest);
  tailSrc.start(time + 0.02);
  tailSrc.stop(time + 0.3);
}

function renderHihat(
  ctx: OfflineAudioContext, dest: AudioNode,
  time: number, velocity: number, open: boolean = false
) {
  const duration = open ? 0.2 : 0.05;
  const bufSize = Math.ceil(ctx.sampleRate * duration);
  const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = renderRandom() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = open ? 6500 : 8500;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(velocity * 0.38, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  src.connect(filter).connect(gain).connect(dest);
  src.start(time);
  src.stop(time + duration + 0.01);

  // Metallic tone layer for realism
  const toneOsc = ctx.createOscillator();
  toneOsc.type = 'square';
  toneOsc.frequency.value = open ? 8000 : 10000;
  const toneGain = ctx.createGain();
  toneGain.gain.setValueAtTime(velocity * 0.04, time);
  toneGain.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.5);
  const toneFilter = ctx.createBiquadFilter();
  toneFilter.type = 'bandpass';
  toneFilter.frequency.value = open ? 9000 : 12000;
  toneFilter.Q.value = 3;
  toneOsc.connect(toneFilter).connect(toneGain).connect(dest);
  toneOsc.start(time);
  toneOsc.stop(time + duration);
}

function renderRide(
  ctx: OfflineAudioContext, dest: AudioNode,
  time: number, velocity: number
) {
  const duration = 0.3;
  const bufSize = Math.ceil(ctx.sampleRate * duration);
  const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = renderRandom() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 6000;
  filter.Q.value = 3;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(velocity * 0.25, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  src.connect(filter).connect(gain).connect(dest);
  src.start(time);
  src.stop(time + duration + 0.01);
}

function renderPerc(
  ctx: OfflineAudioContext, dest: AudioNode,
  time: number, velocity: number
) {
  const dur = 0.06;
  const bufSize = Math.ceil(ctx.sampleRate * dur);
  const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = renderRandom() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 5000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(velocity * 0.2, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
  src.connect(filter).connect(gain).connect(dest);
  src.start(time);
  src.stop(time + dur + 0.01);
}

function renderTom(
  ctx: OfflineAudioContext, dest: AudioNode,
  time: number, velocity: number
) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, time);
  osc.frequency.exponentialRampToValueAtTime(80, time + 0.15);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(velocity * 0.35, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
  osc.connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + 0.3);
}

function renderDrumHit(
  ctx: OfflineAudioContext, dest: AudioNode,
  hit: DrumHit, time: number, profile: GenreProfile
) {
  const kickStyle = profile.density > 0.8 ? 'hard' : profile.swing > 0.2 ? 'sub' : 'default';
  const snareStyle = profile.swing > 0.3 ? 'brush' : 'default';

  switch (hit.instrument) {
    case 'kick': renderKick(ctx, dest, time, hit.velocity, kickStyle); break;
    case 'snare': renderSnare(ctx, dest, time, hit.velocity, snareStyle); break;
    case 'clap': renderClap(ctx, dest, time, hit.velocity); break;
    case 'hihat_closed': renderHihat(ctx, dest, time, hit.velocity, false); break;
    case 'hihat_open': renderHihat(ctx, dest, time, hit.velocity, true); break;
    case 'ride': renderRide(ctx, dest, time, hit.velocity); break;
    case 'perc': renderPerc(ctx, dest, time, hit.velocity); break;
    case 'tom': renderTom(ctx, dest, time, hit.velocity); break;
  }
}

function renderBassNote(
  ctx: OfflineAudioContext, dest: AudioNode,
  time: number, freq: number, duration: number, velocity: number,
  waveform: OscillatorType = 'sawtooth'
) {
  // Layer 1: Main oscillator with filter envelope — boosted gain
  const osc = ctx.createOscillator();
  osc.type = waveform;
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, time);
  filter.frequency.exponentialRampToValueAtTime(350, time + duration * 0.7);
  filter.Q.value = 4;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(velocity * 0.62, time);
  gain.gain.setValueAtTime(velocity * 0.56, time + duration * 0.1);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  osc.connect(filter).connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + duration + 0.01);

  // Layer 2: Sub-bass (pure sine one octave down) for weight
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = freq / 2;
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(velocity * 0.40, time);
  subGain.gain.setValueAtTime(velocity * 0.36, time + duration * 0.15);
  subGain.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.9);
  sub.connect(subGain).connect(dest);
  sub.start(time);
  sub.stop(time + duration + 0.01);

  // Layer 3: Detuned oscillator for width/thickness
  const det = ctx.createOscillator();
  det.type = waveform === 'sine' ? 'triangle' : waveform;
  det.frequency.value = freq;
  det.detune.value = 8 + renderRandom() * 6;
  const detFilter = ctx.createBiquadFilter();
  detFilter.type = 'lowpass';
  detFilter.frequency.value = 700;
  const detGain = ctx.createGain();
  detGain.gain.setValueAtTime(velocity * 0.22, time);
  detGain.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.85);
  det.connect(detFilter).connect(detGain).connect(dest);
  det.start(time);
  det.stop(time + duration + 0.01);
}

function renderLeadNote(
  ctx: OfflineAudioContext, dest: AudioNode,
  time: number, freq: number, duration: number, velocity: number,
  waveform: OscillatorType = 'square'
) {
  const attack = Math.min(0.02, duration * 0.08);
  const sustain = duration * 0.6;
  const release = Math.min(0.15, duration * 0.3);

  // Layer 1: Main oscillator — boosted gain for presence
  const osc1 = ctx.createOscillator();
  osc1.type = waveform;
  osc1.frequency.value = freq;
  const filter1 = ctx.createBiquadFilter();
  filter1.type = 'lowpass';
  filter1.frequency.setValueAtTime(freq * 6, time);
  filter1.frequency.exponentialRampToValueAtTime(freq * 2.5, time + duration * 0.5);
  filter1.Q.value = 5;
  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(0.001, time);
  gain1.gain.linearRampToValueAtTime(velocity * 0.42, time + attack);
  gain1.gain.setValueAtTime(velocity * 0.38, time + attack + sustain);
  gain1.gain.exponentialRampToValueAtTime(0.001, time + duration);
  osc1.connect(filter1).connect(gain1).connect(dest);
  osc1.start(time);
  osc1.stop(time + duration + 0.02);

  // Layer 2: Detuned oscillator for chorus/width
  const osc2 = ctx.createOscillator();
  osc2.type = waveform === 'square' ? 'sawtooth' : waveform;
  osc2.frequency.value = freq;
  osc2.detune.value = 12 + renderRandom() * 8;
  const filter2 = ctx.createBiquadFilter();
  filter2.type = 'lowpass';
  filter2.frequency.value = freq * 4;
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.001, time);
  gain2.gain.linearRampToValueAtTime(velocity * 0.22, time + attack * 1.5);
  gain2.gain.exponentialRampToValueAtTime(0.001, time + duration);
  osc2.connect(filter2).connect(gain2).connect(dest);
  osc2.start(time);
  osc2.stop(time + duration + 0.02);

  // Layer 3: Negative-detuned for stereo thickness
  const osc3 = ctx.createOscillator();
  osc3.type = waveform === 'square' ? 'sawtooth' : waveform;
  osc3.frequency.value = freq;
  osc3.detune.value = -(10 + renderRandom() * 8);
  const gain3 = ctx.createGain();
  gain3.gain.setValueAtTime(0.001, time);
  gain3.gain.linearRampToValueAtTime(velocity * 0.18, time + attack * 1.5);
  gain3.gain.exponentialRampToValueAtTime(0.001, time + duration);
  osc3.connect(gain3).connect(dest);
  osc3.start(time);
  osc3.stop(time + duration + 0.02);

  // Layer 4: Octave-up harmonic for brightness
  if (velocity > 0.25 && freq < 2000) {
    const osc4 = ctx.createOscillator();
    osc4.type = 'sine';
    osc4.frequency.value = freq * 2;
    const gain4 = ctx.createGain();
    gain4.gain.setValueAtTime(0.001, time);
    gain4.gain.linearRampToValueAtTime(velocity * 0.10, time + attack);
    gain4.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.6);
    osc4.connect(gain4).connect(dest);
    osc4.start(time);
    osc4.stop(time + duration + 0.02);
  }

  // Layer 5: Sub-octave sine for fullness on lower notes
  if (freq < 800) {
    const osc5 = ctx.createOscillator();
    osc5.type = 'sine';
    osc5.frequency.value = freq / 2;
    const gain5 = ctx.createGain();
    gain5.gain.setValueAtTime(0.001, time);
    gain5.gain.linearRampToValueAtTime(velocity * 0.08, time + attack * 2);
    gain5.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.8);
    osc5.connect(gain5).connect(dest);
    osc5.start(time);
    osc5.stop(time + duration + 0.02);
  }
}

function renderPadChord(
  ctx: OfflineAudioContext, dest: AudioNode,
  time: number, freqs: number[], duration: number, velocity: number
) {
  const attack = Math.min(1.2, duration * 0.2);
  const release = Math.min(2.0, duration * 0.35);
  const sustainLevel = velocity * 0.20;

  for (const freq of freqs) {
    // Layer 1: Main pad voice (triangle) — boosted sustain
    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = freq;
    osc1.detune.value = (renderRandom() - 0.5) * 15;
    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0.001, time);
    gain1.gain.linearRampToValueAtTime(sustainLevel, time + attack);
    gain1.gain.setValueAtTime(sustainLevel * 0.9, time + duration - release);
    gain1.gain.linearRampToValueAtTime(0.001, time + duration);
    osc1.connect(gain1).connect(dest);
    osc1.start(time);
    osc1.stop(time + duration + 0.05);

    // Layer 2: Detuned sine for warmth
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq;
    osc2.detune.value = 7 + renderRandom() * 5;
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.001, time);
    gain2.gain.linearRampToValueAtTime(sustainLevel * 0.65, time + attack * 1.2);
    gain2.gain.linearRampToValueAtTime(0.001, time + duration);
    osc2.connect(gain2).connect(dest);
    osc2.start(time);
    osc2.stop(time + duration + 0.05);

    // Layer 3: Negative-detuned for width
    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.value = freq;
    osc3.detune.value = -(6 + renderRandom() * 5);
    const gain3 = ctx.createGain();
    gain3.gain.setValueAtTime(0.001, time);
    gain3.gain.linearRampToValueAtTime(sustainLevel * 0.55, time + attack * 1.3);
    gain3.gain.linearRampToValueAtTime(0.001, time + duration);
    osc3.connect(gain3).connect(dest);
    osc3.start(time);
    osc3.stop(time + duration + 0.05);

    // Layer 4: Filtered sawtooth for shimmer
    if (freq < 1500) {
      const osc4 = ctx.createOscillator();
      osc4.type = 'sawtooth';
      osc4.frequency.value = freq;
      osc4.detune.value = (renderRandom() - 0.5) * 20;
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = freq * 2.5;
      lpf.Q.value = 1;
      const gain4 = ctx.createGain();
      gain4.gain.setValueAtTime(0.001, time);
      gain4.gain.linearRampToValueAtTime(sustainLevel * 0.30, time + attack * 1.5);
      gain4.gain.linearRampToValueAtTime(0.001, time + duration);
      osc4.connect(lpf).connect(gain4).connect(dest);
      osc4.start(time);
      osc4.stop(time + duration + 0.05);
    }
  }
}

// ===== Segment-based Generation =====

const SEGMENT_DURATION = 20;

export interface SegmentProgress {
  segmentIndex: number;
  totalSegments: number;
}

async function renderSegment(
  intent: MusicIntent,
  segmentIndex: number,
  startTime: number,
  endTime: number,
  profile: GenreProfile,
  groove: ReturnType<typeof getGrooveTemplate>,
  sections: SectionPlan[],
  root: string,
  parsedScale: string,
  beatDuration: number,
  sixteenthDur: number,
  bassStyle: BassStyle,
  melodyStyle: 'lead' | 'arp' | 'riff' | 'ambient' | 'hook',
  leadWaveform: OscillatorType,
  bassWaveform: OscillatorType,
  rng: () => number,
  trackMotMotif,
  trackHook: Motif,
): Promise<AudioStems> {
  renderRandomSource = rng;
  const segDuration = endTime - startTime;
  const sampleRate = INTERNAL_SAMPLE_RATE;
  const numChannels = 2;

  // Create separate contexts for each stem to ensure clean isolation
  const createStemCtx = () => new OfflineAudioContext(numChannels, Math.ceil(sampleRate * segDuration), sampleRate);

  const drumCtx = createStemCtx();
  const bassCtx = createStemCtx();
  const synthCtx = createStemCtx();
  const padCtx = createStemCtx();
  const fxCtx = createStemCtx();

  // Each stem context gets its own bus
  const drumBus = drumCtx.createGain(); drumBus.connect(drumCtx.destination);
  const bassBus = bassCtx.createGain(); bassBus.connect(bassCtx.destination);
  const synthBus = synthCtx.createGain(); synthBus.connect(synthCtx.destination);
  const padBus = padCtx.createGain(); padBus.connect(padCtx.destination);
  const fxBus = fxCtx.createGain(); fxBus.connect(fxCtx.destination);

  // Parallel collectors for SoundFont rendering. We always populate these
  // (cheap), and if `intent.useSoundFont` is true we swap the bass/melody/
  // pad oscillator buffers for soundfont-rendered ones at the end. The
  // oscillator path keeps running so we have a guaranteed fallback if the
  // SF library or the .sf3 asset fails to load.
  const sfBassEvents: SfNoteEvent[] = [];
  const sfLeadEvents: SfNoteEvent[] = [];
  const sfPadEvents: SfNoteEvent[] = [];

  let sectionStart = 0;
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const section = sections[sIdx];
    const sectionEnd = sectionStart + section.duration;

    if (sectionEnd <= startTime || sectionStart >= endTime) {
      sectionStart = sectionEnd;
      continue;
    }

    const energy = section.energy;
    const name = section.name.toLowerCase();
    const isIntro = name.includes('intro');
    const isDrop = name.includes('drop') || name.includes('peak') || name.includes('climax');
    const isBreakdown = name.includes('break');
    const isBuild = name.includes('build');
    const isOutro = name.includes('outro');
    const isVerse = name.includes('verse');
    const isChorus = name.includes('chorus') || name.includes('hook');

    const overlapStart = Math.max(sectionStart, startTime);
    const overlapEnd = Math.min(sectionEnd, endTime);
    const localStart = overlapStart - startTime;
    const localEnd = overlapEnd - startTime;

    // Transitions
    if (sIdx > 0 && sectionStart >= startTime && sectionStart < endTime) {
      const prevEnergy = sections[sIdx - 1].energy;
      const transType = getTransitionType(prevEnergy, energy, rng);
      const localTransTime = sectionStart - startTime;
      renderTransition(fxCtx, fxBus, transType, localTransTime, Math.min(2, section.duration * 0.15), energy, rng);
    }

    // DRUMS
    if (energy > 0.1 && !isBreakdown) {
      const pattern = getDrumPattern(profile.rhythmStyle, energy, rng);
      let barStartGlobal = isIntro ? sectionStart + section.duration * 0.3 : sectionStart;
      const barLen = beatDuration * 4;
      if (barStartGlobal < overlapStart) {
        barStartGlobal = overlapStart - ((overlapStart - barStartGlobal) % barLen);
        if (barStartGlobal < overlapStart) barStartGlobal += barLen;
        barStartGlobal -= barLen;
      }

      while (barStartGlobal < overlapEnd) {
        for (const hit of pattern) {
          const hitTimeGlobal = barStartGlobal + hit.step * sixteenthDur;
          if (hitTimeGlobal < overlapStart || hitTimeGlobal >= overlapEnd) continue;
          const groovedGlobal = applyGrooveTiming(hitTimeGlobal, sixteenthDur, groove, rng);
          if (groovedGlobal < overlapStart || groovedGlobal >= overlapEnd) continue;
          const groovedVel = hit.velocity * getGrooveVelocity(hitTimeGlobal, sixteenthDur, groove, rng);
          const localTime = groovedGlobal - startTime;
          if (localTime >= 0 && localTime < segDuration) {
            renderDrumHit(drumCtx, drumBus, { ...hit, velocity: groovedVel }, localTime, profile);
          }
        }
        barStartGlobal += barLen;
      }

      // Drum fill at section end
      if (sIdx < sections.length - 1 && sections[sIdx + 1].energy > energy) {
        const fillStart = sectionEnd - beatDuration * 2;
        if (fillStart < overlapEnd && sectionEnd > overlapStart) {
          const fillPattern = getDrumFill(energy, rng);
          for (const hit of fillPattern) {
            const hitGlobal = fillStart + hit.step * sixteenthDur;
            if (hitGlobal >= overlapStart && hitGlobal < overlapEnd) {
              const localTime = hitGlobal - startTime;
              if (localTime >= 0 && localTime < segDuration) {
                renderDrumHit(drumCtx, drumBus, hit, localTime, profile);
              }
            }
          }
        }
      }
    }

    // BASS
    if (energy > 0.1 && !isBreakdown) {
      const bassStartGlobal = isIntro ? sectionStart + section.duration * 0.4 : sectionStart;
      const bassEndGlobal = sectionEnd;
      if (bassEndGlobal > overlapStart && bassStartGlobal < overlapEnd) {
        const effStart = Math.max(bassStartGlobal, overlapStart);
        const effEnd = Math.min(bassEndGlobal, overlapEnd);
        const bassEvents = generateBassline(root, parsedScale, effStart, effEnd - effStart, beatDuration, bassStyle, energy, rng);
        for (const evt of bassEvents) {
          const groovedGlobal = applyGrooveTiming(evt.time, sixteenthDur, groove, rng);
          if (groovedGlobal >= overlapStart && groovedGlobal < overlapEnd) {
            const localTime = groovedGlobal - startTime;
            if (localTime >= 0 && localTime < segDuration) {
              renderBassNote(bassCtx, bassBus, localTime, midiToFreq(evt.midi), evt.duration, evt.velocity, bassWaveform);
              sfBassEvents.push({ time: localTime, midi: evt.midi, duration: evt.duration, velocity: evt.velocity });
            }
          }
        }
      }
    }

    // MELODY / LEAD / HOOK
    if ((isDrop || isBuild || isChorus || isVerse) && energy > 0.3) {
      const effStart = Math.max(sectionStart, overlapStart);
      const effEnd = Math.min(sectionEnd, overlapEnd);

      // Use hook style for high-energy sections (drops, choruses), motif-lead for verses
      const sectionMelodyStyle = (isDrop || isChorus) && energy > 0.65 ? 'hook' as const : melodyStyle;

      const melEvents = generateMelody(
        root, parsedScale, effStart, effEnd - effStart, beatDuration, energy,
        sectionMelodyStyle, rng,
        trackMotMotif, // pass the track's motif for coherence
        trackHook,  // pass the track's hook for high-energy sections
      );
      for (const evt of melEvents) {
        const groovedGlobal = applyGrooveTiming(evt.time, sixteenthDur, groove, rng);
        if (groovedGlobal >= overlapStart && groovedGlobal < overlapEnd) {
          const localTime = groovedGlobal - startTime;
          if (localTime >= 0 && localTime < segDuration) {
            renderLeadNote(synthCtx, synthBus, localTime, midiToFreq(evt.midi), evt.duration, evt.velocity, leadWaveform);
            sfLeadEvents.push({ time: localTime, midi: evt.midi, duration: evt.duration, velocity: evt.velocity });
          }
        }
      }
    }

    // PADS / CHORDS
    if (isIntro || isBreakdown || isOutro || energy < 0.5 || isVerse) {
      const effStart = Math.max(sectionStart, overlapStart);
      const effEnd = Math.min(sectionEnd, overlapEnd);
      const chordEvents = generateChords(root, parsedScale, effStart, effEnd - effStart, beatDuration, energy, rng);
      for (const evt of chordEvents) {
        if (evt.time >= overlapStart && evt.time < overlapEnd) {
          const localTime = evt.time - startTime;
          if (localTime >= 0 && localTime < segDuration) {
            const chordDur = Math.min(evt.duration, segDuration - localTime);
            renderPadChord(padCtx, padBus, localTime, evt.midis.map(midiToFreq), chordDur, evt.velocity);
            for (const m of evt.midis) {
              sfPadEvents.push({ time: localTime, midi: m, duration: chordDur, velocity: evt.velocity });
            }
          }
        }
      }
    }

    sectionStart = sectionEnd;
  }

  try {
    const [drums, bassOsc, melodyOsc, padsOsc, fx] = await Promise.all([
      drumCtx.startRendering(),
      bassCtx.startRendering(),
      synthCtx.startRendering(),
      padCtx.startRendering(),
      fxCtx.startRendering(),
    ]);

    let bass = bassOsc;
    let melody = melodyOsc;
    let pads = padsOsc;

    // If SoundFont mode is requested, try to swap the bass/melody/pads
    // buffers for soundfont-rendered ones. Any failure (network, IDB,
    // unsupported worklet, missing .sf3 asset) silently falls back to the
    // oscillator buffers we already produced — the user always gets audio.
    if (intent.useSoundFont) {
      try {
        const sfBuffers = await renderSegmentStemsSoundFont({
          bassEvents: sfBassEvents,
          leadEvents: sfLeadEvents,
          padEvents: sfPadEvents,
          durationSeconds: segDuration,
          sampleRate,
          numChannels,
        });
        bass = sfBuffers.bass;
        melody = sfBuffers.lead;
        pads = sfBuffers.pads;
      } catch (err) {
        // Once we hit the "cached miss" path (asset is 404), the SF renderer
        // throws cheaply with no network call. Log only once per session in
        // that case — for genuine errors (worklet failure, etc.) we still
        // surface the first occurrence.
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('cached miss')) {
          console.warn('[music-engine] SoundFont render failed — using oscillator fallback.', msg);
        }
      }
    }

    return { drums, bass, melody, pads, fx };
  } finally {
    renderRandomSource = null;
  }
}

function concatenateBuffers(buffers: AudioBuffer[], sampleRate: number): AudioBuffer {
  const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
  const numChannels = buffers[0]?.numberOfChannels || 2;
  const finalBuffer = new AudioBuffer({ length: totalLength, numberOfChannels: numChannels, sampleRate });

  let offset = 0;
  for (const buf of buffers) {
    for (let ch = 0; ch < numChannels; ch++) {
      const srcData = buf.getChannelData(ch);
      const destData = finalBuffer.getChannelData(ch);
      destData.set(srcData, offset);
    }
    offset += buf.length;
  }
  return finalBuffer;
}

// ===== Main Generation Function (Segmented) =====

export interface GenerateTrackResult {
  instrumentalBuffer: AudioBuffer;
  stems: AudioStems;
  rngState: number;
  compositionGraph: CompositionGraph;
  diagnostics: {
    stemFamilies: string[];
    arrangementSignature: string;
    instrumentationSignature: string;
    tempo: number;
    sectionNames: string[];
  };
}

export async function generateTrack(
  intent: MusicIntent,
  onProgress: ProgressCallback,
  seed?: number,
): Promise<GenerateTrackResult> {
  // Use GenerationDNA seed if available, otherwise create high-entropy seed
  const dna = intent.generationDNA;
  const seedVal = seed ?? (dna
    ? getGenerationSeedNumber(dna)
    : ((Date.now() & 0x7fffffff) ^ getCryptoRandomUint32() ^ getCryptoRandomUint32()));
  const rng = createRng(seedVal);

  // Apply DNA biases to the RNG to further differentiate outputs
  if (dna) {
    // Burn through some RNG iterations based on DNA values to shift the sequence
    const burnCount = Math.floor(dna.motifShape * 50) + Math.floor(dna.grooveBias * 30);
    for (let i = 0; i < burnCount; i++) rng();
  }

  const { tempo: baseTempo, key, scale, structure, durationSeconds, energy: globalEnergy } = intent;
  const sampleRate = INTERNAL_SAMPLE_RATE;

  console.log(`[Engine] GenerationDNA seed=${dna?.seed || seedVal}, motif=${dna?.motifShape?.toFixed(3)}, groove=${dna?.grooveBias?.toFixed(3)}, harmonic=${dna?.harmonicMood?.toFixed(3)}`);

  onProgress('generating_melody', 0.12);
  await sleep(30);

  // ===== Get profile: AI-inferred (primary) or hardcoded fallback =====
  let profile: GenreProfile;
  if (intent.styleProfile) {
    // PRIMARY PATH: Use AI-inferred StyleProfile
    profile = createProfileFromAI(intent.styleProfile);
    console.log('[Engine] Using AI-inferred StyleProfile:', intent.styleProfile.characteristics?.join(', '));
  } else {
    // FALLBACK: Use hardcoded genre profiles
    const genres = intent.genres?.length ? intent.genres : [intent.genre];
    profile = blendGenreProfiles(genres);
    console.log('[Engine] Using fallback genre profiles for:', genres.join(', '));
  }

  // ===== Tempo Engine: BPM variation from GenerationSeed (identical prompts → different songs) =====
  const [tempoMin, tempoMax] = profile.tempoRange;
  const effectiveTempo = dna
    ? Math.max(60, Math.min(200, Math.round(tempoMin + dna.grooveBias * (tempoMax - tempoMin))))
    : baseTempo;

  // ===== Instrument Orchestration: vary combinations every generation via DNA =====
  if (dna && profile.instruments.length > 4) {
    const rngBurn = createRng(getGenerationSeedNumber(dna));
    for (let i = 0; i < 20; i++) rngBurn();
    const shuffled = shuffleWithRng(profile.instruments, rngBurn);
    const count = Math.max(4, Math.min(profile.instruments.length, Math.floor(4 + dna.textureDensity * (profile.instruments.length - 3))));
    profile = { ...profile, instruments: shuffled.slice(0, count) };
  }

  // ===== DNA → Musical-shape biases (not just notes) =====
  // Wire grooveBias, harmonicMood, motifShape, textureDensity into the
  // structural / rhythmic / harmonic decisions so two runs with the same
  // prompt produce songs that feel different in shape, not just in pitch.
  if (dna) {
    // Widened amplitudes — the previous ±0.15 swing / ±0.125 density were
    // too subtle relative to the fixed structure templates, so the user
    // reported "same output every time". Doubling the deltas + adding more
    // characteristic tags makes the DNA actually audible across runs.
    const swingShift = (dna.grooveBias - 0.5) * 0.6;          // ±0.3
    const newSwing = Math.max(0, Math.min(0.85, (profile.swing ?? 0) + swingShift));
    const densityShift = (dna.textureDensity - 0.5) * 0.5;    // ±0.25
    const newDensity = Math.max(0.1, Math.min(1, (profile.density ?? 0.6) + densityShift));

    // Pick a different rhythm-pattern tag based on grooveBias so the
    // drum / bass templates pull from a genuinely different feel.
    const rhythmFamilies = ['driving', 'syncopated', 'steady', 'minimal', 'polyrhythmic', 'broken-beat', 'half-time', 'double-time'];
    const rhythmIdx = Math.floor(dna.grooveBias * rhythmFamilies.length) % rhythmFamilies.length;
    const newRhythmStyle = rhythmFamilies[rhythmIdx];

    // Add DNA-derived "characteristic" flags so chooseMelodyStyle and
    // chooseBassStyleDynamic see real signal. Thresholds tightened so a
    // greater share of runs land in one of the distinct flavor buckets
    // (previously only ~30% of runs got bright/dark/hook-led tags).
    const dnaCharacteristics: string[] = [];
    if (dna.harmonicMood > 0.6) dnaCharacteristics.push('bright', 'consonant', 'lifted');
    else if (dna.harmonicMood < 0.4) dnaCharacteristics.push('dark', 'modal', 'minor-leaning', 'brooding');
    else dnaCharacteristics.push('balanced');
    if (dna.motifShape > 0.55) dnaCharacteristics.push('hook-led', 'memorable');
    else if (dna.motifShape < 0.45) dnaCharacteristics.push('texture-led', 'atmospheric');
    if (dna.textureDensity > 0.6) dnaCharacteristics.push('dense', 'layered', 'busy');
    else if (dna.textureDensity < 0.4) dnaCharacteristics.push('sparse', 'restrained', 'spacious');
    // grooveBias drives feel buckets that read distinctly in the final mix
    if (dna.grooveBias > 0.7) dnaCharacteristics.push('shuffled', 'swung');
    else if (dna.grooveBias < 0.3) dnaCharacteristics.push('locked', 'straight');

    profile = {
      ...profile,
      swing: newSwing,
      density: newDensity,
      rhythmStyle: newRhythmStyle as GenreProfile['rhythmStyle'],
      characteristics: [...(profile.characteristics ?? []), ...dnaCharacteristics],
    };
  }

  const groove = getGrooveTemplate(profile.grooveTemplate);

  const { root, scale: parsedScale } = parseKey(`${key} ${scale}`);
  const beatDuration = 60 / effectiveTempo;
  const sixteenthDur = beatDuration / 4;

  const sections = structure.length > 0 ? structure : generateArrangement(profile, durationSeconds, rng);

  // ===== CompositionGraph: Bar Grid Calculation =====
  const beatsPerBar = 4; // standard 4/4
  const totalBars = Math.floor(durationSeconds / (60 / effectiveTempo) / beatsPerBar);
  const barsPerSection: { [key: string]: number } = {};

  let accumulatedBars = 0;
  sections.forEach((sec, i) => {
    let bars = Math.round(sec.duration / (60 / effectiveTempo) / beatsPerBar);
    if (i === sections.length - 1) {
      bars = Math.max(1, totalBars - accumulatedBars); // Fit remainder
    }
    barsPerSection[`${sec.name}_${i}`] = bars;
    accumulatedBars += bars;
  });

  // Choose styles dynamically based on profile characteristics
  const bassStyle = chooseBassStyleDynamic(profile.rhythmStyle, profile.characteristics, profile.swing);
  const melodyStyle = chooseMelodyStyle(intent.genre, globalEnergy / 10, profile.characteristics);

  // Waveform selection based on harmonic style and DNA
  const harmonicStr = (profile.harmonicStyle || '').toLowerCase();
  const dnaHarmonicShift = dna ? (dna.harmonicMood > 0.6 ? 'bright' : dna.harmonicMood < 0.4 ? 'dark' : 'neutral') : 'neutral';
  
  const leadWaveform: OscillatorType =
    dnaHarmonicShift === 'bright' ? 'sawtooth' : dnaHarmonicShift === 'dark' ? 'sine' : 'square';
  const bassWaveform: OscillatorType = profile.swing > 0.2 || dna?.grooveBias > 0.6 ? 'sine' : 'sawtooth';

  // ===== Generate track-wide motif and hook for coherence =====
  const trackMotif = generateMotif(rng, globalEnergy / 10);
  const trackHook = generateHook(rng);

  // Generate a real chord progression for the CompositionGraph
  const chordProgression = generateChords(root, parsedScale, 0, durationSeconds, beatDuration, globalEnergy / 10, rng).map(c => 
    c.midis.map(m => m.toString()).join(',')
  );

  const compositionGraph: CompositionGraph = {
    tempo: effectiveTempo,
    scale: parsedScale,
    chordProgression,
    motif: trackMotif.intervals,
    songStructure: sections,
    barGrid: {
      totalBars,
      barsPerSection
    }
  };

  onProgress('synthesizing_instruments', 0.18);

  // ===== Segmented rendering =====
  // Each segment rendered through its own 5 OfflineAudioContexts (one per
  // stem) which already run in parallel inside renderSegment. We additionally
  // overlap the render of segment N+1 with segment N: while one segment
  // renders, the next is dispatched. concurrency=2 is the sweet spot — too
  // high and the browser thrashes on many concurrent audio contexts. This
  // roughly halves end-to-end audio gen time on multi-core machines.
  const totalSegments = Math.ceil(durationSeconds / SEGMENT_DURATION);
  const drumSegments: AudioBuffer[] = new Array(totalSegments);
  const bassSegments: AudioBuffer[] = new Array(totalSegments);
  const melodySegments: AudioBuffer[] = new Array(totalSegments);
  const padSegments: AudioBuffer[] = new Array(totalSegments);
  const fxSegments: AudioBuffer[] = new Array(totalSegments);

  const SEGMENT_CONCURRENCY = 2;
  let nextSegmentIndex = 0;
  let completedSegments = 0;

  const dispatchSegment = async (i: number) => {
    const segStart = i * SEGMENT_DURATION;
    const segEnd = Math.min((i + 1) * SEGMENT_DURATION, durationSeconds);
    const segStems = await renderSegment(
      intent, i, segStart, segEnd,
      profile, groove, sections,
      root, parsedScale, beatDuration, sixteenthDur,
      bassStyle, melodyStyle, leadWaveform, bassWaveform, rng,
      trackMotif, trackHook,
    );
    drumSegments[i] = segStems.drums;
    bassSegments[i] = segStems.bass;
    melodySegments[i] = segStems.melody;
    padSegments[i] = segStems.pads;
    fxSegments[i] = segStems.fx;
    completedSegments++;
    const segProgress = 0.20 + (completedSegments / totalSegments) * 0.35;
    onProgress('synthesizing_instruments', segProgress);
  };

  const runWorker = async () => {
    while (true) {
      const i = nextSegmentIndex++;
      if (i >= totalSegments) return;
      await dispatchSegment(i);
      // Yield to the UI thread so progress updates render.
      await sleep(0);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(SEGMENT_CONCURRENCY, totalSegments) }, () => runWorker()),
  );

  onProgress('synthesizing_instruments', 0.57);

  // ===== Combine segments into full stems =====
  onProgress('mixing_audio', 0.58);
  const stems: AudioStems = {
    drums: concatenateBuffers(drumSegments, sampleRate),
    bass: concatenateBuffers(bassSegments, sampleRate),
    melody: concatenateBuffers(melodySegments, sampleRate),
    pads: concatenateBuffers(padSegments, sampleRate),
    fx: concatenateBuffers(fxSegments, sampleRate),
  };

  // We return the raw stems. Mixing and mastering will be handled by the production orchestrator.
  // For backwards compatibility and immediate preview, we do a basic mix here but mark it for Phase 2 replacement.
  const instrumentalBuffer = await mixStemsLocally(stems);

  return {
    instrumentalBuffer,
    stems,
    rngState: seedVal,
    compositionGraph,
    diagnostics: {
      stemFamilies: ['drums', 'bass', 'melody', 'effects', ...(profile.instruments.some((instrument) => /pad|strings|keys|organ/i.test(instrument)) ? ['pads'] : [])],
      arrangementSignature: sections.map((section) => `${section.name}:${section.duration.toFixed(2)}:${section.energy.toFixed(2)}`).join('|'),
      instrumentationSignature: profile.instruments.join('|'),
      tempo: effectiveTempo,
      sectionNames: sections.map((section) => section.name),
    },
  };
}

/**
 * Generate a synthetic impulse response for ConvolverNode.
 * Creates a realistic-sounding algorithmic reverb tail.
 */
function generateReverbIR(
  ctx: OfflineAudioContext,
  decaySeconds: number,
  preDelayMs: number = 12,
  brightness: number = 0.7,
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * decaySeconds);
  const numChannels = 2;
  const ir = ctx.createBuffer(numChannels, length, sampleRate);
  const preDelaySamples = Math.floor(preDelayMs * sampleRate / 1000);

  for (let ch = 0; ch < numChannels; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = preDelaySamples; i < length; i++) {
      const t = (i - preDelaySamples) / (length - preDelaySamples);
      // Exponential decay with early reflection bumps
      const envelope = Math.exp(-t * 5) * (1 - t);
      // Filtered noise with channel decorrelation
      const noise = (Math.random() * 2 - 1);
      // Early reflections: sparse strong taps in first 50ms
      const earlyWindow = i < sampleRate * 0.05 ? 2.5 : 1;
      // High-frequency roll-off over time (darker as it decays)
      const hfRolloff = 1 - t * (1 - brightness);
      data[i] = noise * envelope * earlyWindow * hfRolloff;
    }
  }
  return ir;
}

async function mixStemsLocally(stems: AudioStems): Promise<AudioBuffer> {
  const { drums, bass, melody, pads, fx } = stems;
  const sampleRate = drums.sampleRate;
  const length = drums.length;
  const numChannels = drums.numberOfChannels;

  const ctx = new OfflineAudioContext(numChannels, length, sampleRate);

  // ===== Master bus with EQ and compression =====
  const masterBus = ctx.createGain();
  masterBus.gain.value = 0.92;

  // Low-cut to remove mud
  const lowCut = ctx.createBiquadFilter();
  lowCut.type = 'highpass';
  lowCut.frequency.value = 30;
  lowCut.Q.value = 0.7;

  // Low-mid warmth boost (adds body)
  const warmthEQ = ctx.createBiquadFilter();
  warmthEQ.type = 'peaking';
  warmthEQ.frequency.value = 250;
  warmthEQ.gain.value = 1.5;
  warmthEQ.Q.value = 0.8;

  // Presence boost
  const presenceEQ = ctx.createBiquadFilter();
  presenceEQ.type = 'peaking';
  presenceEQ.frequency.value = 3000;
  presenceEQ.gain.value = 2.0;
  presenceEQ.Q.value = 1.0;

  // Air/sparkle
  const airEQ = ctx.createBiquadFilter();
  airEQ.type = 'highshelf';
  airEQ.frequency.value = 10000;
  airEQ.gain.value = 2.5;

  // Master bus glue compressor
  const glueComp = ctx.createDynamicsCompressor();
  glueComp.threshold.value = -12;
  glueComp.knee.value = 6;
  glueComp.ratio.value = 3;
  glueComp.attack.value = 0.01;
  glueComp.release.value = 0.2;

  // Master limiter
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2.0;
  limiter.knee.value = 2;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;

  masterBus.connect(lowCut).connect(warmthEQ).connect(presenceEQ).connect(airEQ).connect(glueComp).connect(limiter).connect(ctx.destination);

  // ===== Reverb send (shared reverb bus for spatial cohesion) =====
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 1.0;
  const reverbConvolver = ctx.createConvolver();
  reverbConvolver.buffer = generateReverbIR(ctx, 1.8, 15, 0.65);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.28; // wet level — enough to add space without washing out
  // Pre-filter on reverb return: cut low-end rumble from the reverb tail
  const reverbHPF = ctx.createBiquadFilter();
  reverbHPF.type = 'highpass';
  reverbHPF.frequency.value = 200;
  reverbHPF.Q.value = 0.5;

  reverbSend.connect(reverbConvolver).connect(reverbHPF).connect(reverbReturn).connect(masterBus);

  // ===== Delay send (tempo-synced feel) =====
  const delaySend = ctx.createGain();
  delaySend.gain.value = 1.0;
  const delayNode = ctx.createDelay(2.0);
  delayNode.delayTime.value = 0.35; // ~quarter note at 120 BPM
  const delayFeedback = ctx.createGain();
  delayFeedback.gain.value = 0.3;
  const delayReturn = ctx.createGain();
  delayReturn.gain.value = 0.18;
  const delayFilter = ctx.createBiquadFilter();
  delayFilter.type = 'lowpass';
  delayFilter.frequency.value = 3000; // darken repeats

  delaySend.connect(delayNode).connect(delayFilter).connect(delayReturn).connect(masterBus);
  delayFilter.connect(delayFeedback).connect(delayNode); // feedback loop

  // ===== Stem sources with improved gain staging =====
  const drumNode = ctx.createBufferSource(); drumNode.buffer = drums;
  const bassNode = ctx.createBufferSource(); bassNode.buffer = bass;
  const melodyNode = ctx.createBufferSource(); melodyNode.buffer = melody;
  const padNode = ctx.createBufferSource(); padNode.buffer = pads;
  const fxNode = ctx.createBufferSource(); fxNode.buffer = fx;

  // Boosted gain levels — previous values were too conservative
  const drumGain = ctx.createGain(); drumGain.gain.value = 0.88;
  const bassGain = ctx.createGain(); bassGain.gain.value = 0.78;
  const melodyGain = ctx.createGain(); melodyGain.gain.value = 0.68;
  const padGain = ctx.createGain(); padGain.gain.value = 0.52;
  const fxGain = ctx.createGain(); fxGain.gain.value = 0.50;

  // Per-stem reverb sends (different amounts per stem)
  const drumReverbSendGain = ctx.createGain(); drumReverbSendGain.gain.value = 0.15; // light room
  const melodyReverbSendGain = ctx.createGain(); melodyReverbSendGain.gain.value = 0.35; // lead needs space
  const padReverbSendGain = ctx.createGain(); padReverbSendGain.gain.value = 0.50; // pads swim in reverb
  const fxReverbSendGain = ctx.createGain(); fxReverbSendGain.gain.value = 0.40;

  // Per-stem delay sends
  const melodyDelaySendGain = ctx.createGain(); melodyDelaySendGain.gain.value = 0.25;
  const fxDelaySendGain = ctx.createGain(); fxDelaySendGain.gain.value = 0.20;

  // ===== Per-stem EQ for frequency separation =====
  // Bass: cut highs to keep it focused but allow some harmonics through
  const bassEQ = ctx.createBiquadFilter();
  bassEQ.type = 'lowpass';
  bassEQ.frequency.value = 800;
  bassEQ.Q.value = 0.5;

  // Melody: cut low-end to avoid clashing with bass
  const melodyEQ = ctx.createBiquadFilter();
  melodyEQ.type = 'highpass';
  melodyEQ.frequency.value = 180;
  melodyEQ.Q.value = 0.5;

  // Pads: bandpass to sit in the mid-range pocket
  const padEQ = ctx.createBiquadFilter();
  padEQ.type = 'highpass';
  padEQ.frequency.value = 220;
  padEQ.Q.value = 0.5;
  const padLP = ctx.createBiquadFilter();
  padLP.type = 'lowpass';
  padLP.frequency.value = 5000;
  padLP.Q.value = 0.5;

  // ===== Bus compressor on drums for glue =====
  const drumComp = ctx.createDynamicsCompressor();
  drumComp.threshold.value = -15;
  drumComp.knee.value = 6;
  drumComp.ratio.value = 4;
  drumComp.attack.value = 0.005;
  drumComp.release.value = 0.08;

  // ===== Routing =====
  // Drums → compressor → master + reverb send
  drumNode.connect(drumGain).connect(drumComp).connect(masterBus);
  drumGain.connect(drumReverbSendGain).connect(reverbSend);

  // Bass → EQ → master (NO reverb on bass — keep it tight)
  bassNode.connect(bassGain).connect(bassEQ).connect(masterBus);

  // Melody → EQ → master + reverb send + delay send
  melodyNode.connect(melodyGain).connect(melodyEQ).connect(masterBus);
  melodyGain.connect(melodyReverbSendGain).connect(reverbSend);
  melodyGain.connect(melodyDelaySendGain).connect(delaySend);

  // Pads → EQ → master + heavy reverb send
  padNode.connect(padGain).connect(padEQ).connect(padLP).connect(masterBus);
  padGain.connect(padReverbSendGain).connect(reverbSend);

  // FX → master + reverb + delay
  fxNode.connect(fxGain).connect(masterBus);
  fxGain.connect(fxReverbSendGain).connect(reverbSend);
  fxGain.connect(fxDelaySendGain).connect(delaySend);

  drumNode.start(0);
  bassNode.start(0);
  melodyNode.start(0);
  padNode.start(0);
  fxNode.start(0);

  return await ctx.startRendering();
}

/**
 * Professional Audio Mixing Engine.
 * Combines multiple instrument stems and vocals into a cohesive mix.
 * Implements sidechain ducking for vocal clarity and frequency balancing.
 */
export async function mixStems(
  instrumentalStems: AudioStems,
  vocalStem: AudioBuffer | null,
  vocalLevel: number = 1.1,
): Promise<AudioBuffer> {
  const { drums, bass, melody, pads, fx } = instrumentalStems;
  const sampleRate = drums.sampleRate;
  const length = drums.length;
  const numChannels = drums.numberOfChannels;

  const ctx = new OfflineAudioContext(numChannels, length, sampleRate);

  // ===== Master bus with professional mastering chain =====
  const masterBus = ctx.createGain();
  masterBus.gain.value = 0.90;

  const lowCut = ctx.createBiquadFilter();
  lowCut.type = 'highpass';
  lowCut.frequency.value = 30;
  lowCut.Q.value = 0.7;

  const warmthEQ = ctx.createBiquadFilter();
  warmthEQ.type = 'peaking';
  warmthEQ.frequency.value = 250;
  warmthEQ.gain.value = 1.5;
  warmthEQ.Q.value = 0.8;

  const presenceEQ = ctx.createBiquadFilter();
  presenceEQ.type = 'peaking';
  presenceEQ.frequency.value = 3000;
  presenceEQ.gain.value = 2.0;
  presenceEQ.Q.value = 1.0;

  const airEQ = ctx.createBiquadFilter();
  airEQ.type = 'highshelf';
  airEQ.frequency.value = 10000;
  airEQ.gain.value = 2.5;

  const glueComp = ctx.createDynamicsCompressor();
  glueComp.threshold.value = -12;
  glueComp.knee.value = 6;
  glueComp.ratio.value = 3;
  glueComp.attack.value = 0.01;
  glueComp.release.value = 0.2;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2.0;
  limiter.knee.value = 2;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;

  masterBus.connect(lowCut).connect(warmthEQ).connect(presenceEQ).connect(airEQ).connect(glueComp).connect(limiter).connect(ctx.destination);

  // ===== Reverb send (shared for spatial cohesion) =====
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 1.0;
  const reverbConvolver = ctx.createConvolver();
  reverbConvolver.buffer = generateReverbIR(ctx, 1.6, 12, 0.6);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.24;
  const reverbHPF = ctx.createBiquadFilter();
  reverbHPF.type = 'highpass';
  reverbHPF.frequency.value = 200;
  reverbSend.connect(reverbConvolver).connect(reverbHPF).connect(reverbReturn).connect(masterBus);

  // ===== Delay send =====
  const delaySend = ctx.createGain();
  delaySend.gain.value = 1.0;
  const delayNode = ctx.createDelay(2.0);
  delayNode.delayTime.value = 0.35;
  const delayFeedback = ctx.createGain();
  delayFeedback.gain.value = 0.25;
  const delayReturn = ctx.createGain();
  delayReturn.gain.value = 0.15;
  const delayFilter = ctx.createBiquadFilter();
  delayFilter.type = 'lowpass';
  delayFilter.frequency.value = 3000;
  delaySend.connect(delayNode).connect(delayFilter).connect(delayReturn).connect(masterBus);
  delayFilter.connect(delayFeedback).connect(delayNode);

  // ===== Stem sources =====
  const drumNode = ctx.createBufferSource(); drumNode.buffer = drums;
  const bassNode = ctx.createBufferSource(); bassNode.buffer = bass;
  const melodyNode = ctx.createBufferSource(); melodyNode.buffer = melody;
  const padNode = ctx.createBufferSource(); padNode.buffer = pads;
  const fxNode = ctx.createBufferSource(); fxNode.buffer = fx;

  const drumGain = ctx.createGain(); drumGain.gain.value = 0.85;
  const bassGain = ctx.createGain(); bassGain.gain.value = 0.75;
  const melodyGain = ctx.createGain(); melodyGain.gain.value = 0.62;
  const padGain = ctx.createGain(); padGain.gain.value = 0.48;
  const fxGain = ctx.createGain(); fxGain.gain.value = 0.48;

  // Per-stem reverb sends
  const drumReverbSendGain = ctx.createGain(); drumReverbSendGain.gain.value = 0.12;
  const melodyReverbSendGain = ctx.createGain(); melodyReverbSendGain.gain.value = 0.30;
  const padReverbSendGain = ctx.createGain(); padReverbSendGain.gain.value = 0.45;
  const fxReverbSendGain = ctx.createGain(); fxReverbSendGain.gain.value = 0.35;
  const melodyDelaySendGain = ctx.createGain(); melodyDelaySendGain.gain.value = 0.20;

  // ===== Per-stem EQ for frequency separation =====
  const bassEQ = ctx.createBiquadFilter();
  bassEQ.type = 'lowpass';
  bassEQ.frequency.value = 800;
  bassEQ.Q.value = 0.5;

  const melodyEQ = ctx.createBiquadFilter();
  melodyEQ.type = 'highpass';
  melodyEQ.frequency.value = 180;
  melodyEQ.Q.value = 0.5;

  const padEQ = ctx.createBiquadFilter();
  padEQ.type = 'highpass';
  padEQ.frequency.value = 220;
  padEQ.Q.value = 0.5;
  const padLP = ctx.createBiquadFilter();
  padLP.type = 'lowpass';
  padLP.frequency.value = 5000;
  padLP.Q.value = 0.5;

  // Drum bus compressor
  const drumComp = ctx.createDynamicsCompressor();
  drumComp.threshold.value = -15;
  drumComp.knee.value = 6;
  drumComp.ratio.value = 4;
  drumComp.attack.value = 0.005;
  drumComp.release.value = 0.08;

  // Routing with reverb/delay sends
  drumNode.connect(drumGain).connect(drumComp).connect(masterBus);
  drumGain.connect(drumReverbSendGain).connect(reverbSend);
  bassNode.connect(bassGain).connect(bassEQ).connect(masterBus);
  melodyNode.connect(melodyGain).connect(melodyEQ).connect(masterBus);
  melodyGain.connect(melodyReverbSendGain).connect(reverbSend);
  melodyGain.connect(melodyDelaySendGain).connect(delaySend);
  padNode.connect(padGain).connect(padEQ).connect(padLP).connect(masterBus);
  padGain.connect(padReverbSendGain).connect(reverbSend);
  fxNode.connect(fxGain).connect(masterBus);
  fxGain.connect(fxReverbSendGain).connect(reverbSend);

  if (vocalStem) {
    const vocalNode = ctx.createBufferSource();
    vocalNode.buffer = vocalStem;
    const vocalGain = ctx.createGain();
    vocalGain.gain.value = vocalLevel;

    // Vocal presence EQ — boost 2-5 kHz for clarity
    const vocalPresence = ctx.createBiquadFilter();
    vocalPresence.type = 'peaking';
    vocalPresence.frequency.value = 3500;
    vocalPresence.gain.value = 3;
    vocalPresence.Q.value = 0.8;

    // Vocal de-esser region (gentle cut)
    const vocalDeEss = ctx.createBiquadFilter();
    vocalDeEss.type = 'peaking';
    vocalDeEss.frequency.value = 7000;
    vocalDeEss.gain.value = -2;
    vocalDeEss.Q.value = 2;

    // Sidechain ducking: reduce melody + pads when vocals are present
    const duckingNode = ctx.createGain();
    duckingNode.gain.value = 1.0;
    const vocalData = vocalStem.getChannelData(0);
    const windowSize = Math.floor(sampleRate * 0.05); // 50ms windows (tighter)
    for (let i = 0; i < vocalData.length; i += windowSize) {
      let rms = 0;
      const end = Math.min(i + windowSize, vocalData.length);
      for (let j = i; j < end; j++) rms += vocalData[j] * vocalData[j];
      rms = Math.sqrt(rms / (end - i));
      const t = i / sampleRate;
      if (rms > 0.03) {
        // Duck proportionally to vocal level — stronger vocals = more ducking
        const duckAmount = Math.max(0.45, 1 - rms * 2.5);
        duckingNode.gain.setTargetAtTime(duckAmount, t, 0.03);
      } else {
        duckingNode.gain.setTargetAtTime(1.0, t, 0.08);
      }
    }

    melodyGain.disconnect();
    padGain.disconnect();
    melodyGain.connect(melodyEQ).connect(duckingNode);
    padGain.connect(padEQ).connect(padLP).connect(duckingNode);
    duckingNode.connect(masterBus);

    vocalNode.connect(vocalGain).connect(vocalPresence).connect(vocalDeEss).connect(masterBus);
    vocalNode.start(0);
  }

  drumNode.start(0);
  bassNode.start(0);
  melodyNode.start(0);
  padNode.start(0);
  fxNode.start(0);

  return await ctx.startRendering();
}

function copyAudioBuffer(buffer: AudioBuffer): AudioBuffer {
  const copy = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    copy.copyToChannel(buffer.getChannelData(ch).slice(), ch);
  }
  return copy;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
