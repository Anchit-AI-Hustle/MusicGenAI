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
  tempoTendency?: 'very slow' | 'slow' | 'midtempo' | 'fast' | 'very fast';
  rhythmComplexity?: 'minimal' | 'steady' | 'driving' | 'syncopated' | 'polyrhythmic';
  groovePattern?: string;
  energyLevel?: number; // 1-10
  instrumentPalette?: string[];
  vocalStyle?: string;
  textureDensity?: number; // 0-1
  atmosphere?: string;
  tempoRange?: [number, number];
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
}

export interface SectionPlan {
  name: string;
  duration: number;
  energy: number; // 0-1
  description: string;
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
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  const startFreq = style === 'hard' ? 180 : style === 'sub' ? 120 : 150;
  const endFreq = style === 'sub' ? 25 : 35;
  const decay = style === 'hard' ? 0.3 : style === 'sub' ? 0.6 : 0.4;
  osc.frequency.setValueAtTime(startFreq, time);
  osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.07);
  gain.gain.setValueAtTime(velocity * 0.9, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
  osc.connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + decay + 0.1);

  if (style === 'hard' && velocity > 0.5) {
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'square';
    click.frequency.value = 800;
    clickGain.gain.setValueAtTime(velocity * 0.2, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.01);
    click.connect(clickGain).connect(dest);
    click.start(time);
    click.stop(time + 0.02);
  }
}

function renderSnare(
  ctx: OfflineAudioContext, dest: AudioNode,
  time: number, velocity: number, style: string = 'default'
) {
  const dur = style === 'brush' ? 0.08 : 0.15;
  const bufSize = Math.ceil(ctx.sampleRate * dur);
  const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = renderRandom() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = style === 'rimshot' ? 'highpass' : 'bandpass';
  filter.frequency.value = style === 'rimshot' ? 5000 : 3000;
  filter.Q.value = style === 'brush' ? 0.5 : 1.5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(velocity * (style === 'brush' ? 0.25 : 0.5), time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
  src.connect(filter).connect(gain).connect(dest);
  src.start(time);
  src.stop(time + dur + 0.01);

  if (style !== 'brush') {
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.exponentialRampToValueAtTime(120, time + 0.05);
    oscGain.gain.setValueAtTime(velocity * 0.3, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    osc.connect(oscGain).connect(dest);
    osc.start(time);
    osc.stop(time + 0.1);
  }
}

function renderClap(
  ctx: OfflineAudioContext, dest: AudioNode,
  time: number, velocity: number
) {
  for (let layer = 0; layer < 3; layer++) {
    const delay = layer * 0.008;
    const bufSize = Math.ceil(ctx.sampleRate * 0.12);
    const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = renderRandom() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2500 + layer * 500;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(velocity * 0.2, time + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, time + delay + 0.1);
    src.connect(filter).connect(gain).connect(dest);
    src.start(time + delay);
    src.stop(time + delay + 0.15);
  }
}

function renderHihat(
  ctx: OfflineAudioContext, dest: AudioNode,
  time: number, velocity: number, open: boolean = false
) {
  const duration = open ? 0.15 : 0.04;
  const bufSize = Math.ceil(ctx.sampleRate * duration);
  const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = renderRandom() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = open ? 7000 : 9000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(velocity * 0.35, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  src.connect(filter).connect(gain).connect(dest);
  src.start(time);
  src.stop(time + duration + 0.01);
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
  const osc = ctx.createOscillator();
  osc.type = waveform;
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, time);
  filter.frequency.exponentialRampToValueAtTime(200, time + duration * 0.8);
  filter.Q.value = 4;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(velocity * 0.45, time);
  gain.gain.setValueAtTime(velocity * 0.4, time + duration * 0.1);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  osc.connect(filter).connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + duration + 0.01);
}

function renderLeadNote(
  ctx: OfflineAudioContext, dest: AudioNode,
  time: number, freq: number, duration: number, velocity: number,
  waveform: OscillatorType = 'square'
) {
  const osc = ctx.createOscillator();
  osc.type = waveform;
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(freq * 8, time);
  filter.frequency.exponentialRampToValueAtTime(freq * 1.5, time + duration * 0.6);
  filter.Q.value = 10;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, time);
  gain.gain.linearRampToValueAtTime(velocity * 0.2, time + 0.01);
  gain.gain.setValueAtTime(velocity * 0.18, time + duration * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  osc.connect(filter).connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + duration + 0.01);
}

function renderPadChord(
  ctx: OfflineAudioContext, dest: AudioNode,
  time: number, freqs: number[], duration: number, velocity: number
) {
  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.detune.value = (renderRandom() - 0.5) * 10;
    const gain = ctx.createGain();
    const attack = Math.min(0.8, duration * 0.15);
    const release = Math.min(1.5, duration * 0.3);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(velocity * 0.08, time + attack);
    gain.gain.setValueAtTime(velocity * 0.07, time + duration - release);
    gain.gain.linearRampToValueAtTime(0.001, time + duration);
    osc.connect(gain).connect(dest);
    osc.start(time);
    osc.stop(time + duration + 0.05);
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
  trackMotif: Motif,
  trackHook: Motif,
): Promise<AudioBuffer> {
  renderRandomSource = rng;
  const segDuration = endTime - startTime;
  const sampleRate = INTERNAL_SAMPLE_RATE;
  const numChannels = 2;
  const ctx = new OfflineAudioContext(numChannels, Math.ceil(sampleRate * segDuration), sampleRate);

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 8;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;
  
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.5;
  compressor.connect(masterGain).connect(ctx.destination);

  const drumBus = ctx.createGain(); drumBus.gain.value = 0.65; drumBus.connect(compressor);
  const bassBus = ctx.createGain(); bassBus.gain.value = 0.55; bassBus.connect(compressor);
  const synthBus = ctx.createGain(); synthBus.gain.value = 0.40; synthBus.connect(compressor);
  const padBus = ctx.createGain(); padBus.gain.value = 0.30; padBus.connect(compressor);
  const fxBus = ctx.createGain(); fxBus.gain.value = 0.45; fxBus.connect(compressor);

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
      renderTransition(ctx, fxBus, transType, localTransTime, Math.min(2, section.duration * 0.15), energy, rng);
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
            renderDrumHit(ctx, drumBus, { ...hit, velocity: groovedVel }, localTime, profile);
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
                renderDrumHit(ctx, drumBus, hit, localTime, profile);
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
              renderBassNote(ctx, bassBus, localTime, midiToFreq(evt.midi), evt.duration, evt.velocity, bassWaveform);
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
        trackMotif, // pass the track's motif for coherence
        trackHook,  // pass the track's hook for high-energy sections
      );
      for (const evt of melEvents) {
        const groovedGlobal = applyGrooveTiming(evt.time, sixteenthDur, groove, rng);
        if (groovedGlobal >= overlapStart && groovedGlobal < overlapEnd) {
          const localTime = groovedGlobal - startTime;
          if (localTime >= 0 && localTime < segDuration) {
            renderLeadNote(ctx, synthBus, localTime, midiToFreq(evt.midi), evt.duration, evt.velocity, leadWaveform);
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
            renderPadChord(ctx, padBus, localTime, evt.midis.map(midiToFreq), Math.min(evt.duration, segDuration - localTime), evt.velocity);
          }
        }
      }
    }

    sectionStart = sectionEnd;
  }

  try {
    return await ctx.startRendering();
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
  blob: Blob;
  instrumentalBuffer: AudioBuffer;
  rngState: number;
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

  const groove = getGrooveTemplate(profile.grooveTemplate);

  const { root, scale: parsedScale } = parseKey(`${key} ${scale}`);
  const beatDuration = 60 / effectiveTempo;
  const sixteenthDur = beatDuration / 4;

  const sections = structure.length > 0 ? structure : generateArrangement(profile, durationSeconds, rng);

  // Choose styles dynamically based on profile characteristics
  const bassStyle = chooseBassStyleDynamic(profile.rhythmStyle, profile.characteristics, profile.swing);
  const melodyStyle = chooseMelodyStyle(intent.genre, globalEnergy / 10, profile.characteristics);

  // Waveform selection based on harmonic style
  const harmonicStr = (profile.harmonicStyle || '').toLowerCase();
  const leadWaveform: OscillatorType = 
    harmonicStr.includes('chromatic') || harmonicStr.includes('blues') ? 'sawtooth' : 'square';
  const bassWaveform: OscillatorType = profile.swing > 0.2 ? 'sine' : 'sawtooth';

  // ===== Generate track-wide motif and hook for coherence =====
  const trackMotif = generateMotif(rng, globalEnergy / 10);
  const trackHook = generateHook(rng);

  onProgress('synthesizing_instruments', 0.18);

  // ===== Segmented rendering =====
  const totalSegments = Math.ceil(durationSeconds / SEGMENT_DURATION);
  const segmentBuffers: AudioBuffer[] = [];

  for (let i = 0; i < totalSegments; i++) {
    const segStart = i * SEGMENT_DURATION;
    const segEnd = Math.min((i + 1) * SEGMENT_DURATION, durationSeconds);

    const segProgress = 0.20 + (i / totalSegments) * 0.35;
    onProgress('synthesizing_instruments', segProgress);

    const segBuffer = await renderSegment(
      intent, i, segStart, segEnd,
      profile, groove, sections,
      root, parsedScale, beatDuration, sixteenthDur,
      bassStyle, melodyStyle, leadWaveform, bassWaveform, rng,
      trackMotif, trackHook,
    );

    segmentBuffers.push(segBuffer);
    await sleep(10);
  }

  onProgress('synthesizing_instruments', 0.57);

  // ===== Combine segments =====
  onProgress('mixing_audio', 0.58);
  const fullBuffer = concatenateBuffers(segmentBuffers, sampleRate);

  const instrumentalBuffer = copyAudioBuffer(fullBuffer);

  // ===== Professional mastering pipeline =====
  onProgress('mastering_track', 0.60);
  console.log('[Mastering] Starting professional mastering pipeline...');
  
  const masterResult = masterAudio(fullBuffer, 2);
  
  console.log(`[Mastering] Complete — Peak: ${masterResult.stats.peakDb.toFixed(1)} dB, ` +
    `LUFS: ${masterResult.stats.lufs.toFixed(1)}, Clipping: ${masterResult.stats.clipping}, ` +
    `Artifacts: ${masterResult.stats.artifacts}, Quality: ${masterResult.stats.passedQualityCheck ? 'PASS' : 'WARN'}`);

  onProgress('mastering_track', 0.65);

  return {
    blob: masterResult.blob,
    instrumentalBuffer,
    rngState: seedVal,
    diagnostics: {
      stemFamilies: ['drums', 'bass', 'melody', 'effects', ...(profile.instruments.some((instrument) => /pad|strings|keys|organ/i.test(instrument)) ? ['pads'] : [])],
      arrangementSignature: sections.map((section) => `${section.name}:${section.duration.toFixed(2)}:${section.energy.toFixed(2)}`).join('|'),
      instrumentationSignature: profile.instruments.join('|'),
      tempo: effectiveTempo,
      sectionNames: sections.map((section) => section.name),
    },
  };
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
