/**
 * Browser-based music generation engine using Web Audio API OfflineAudioContext.
 * Genre-aware: adapts synthesis, patterns, and arrangements to any music style.
 * Uses genre ontology, groove engine, drum patterns, bassline generator,
 * melody generator, arrangement engine, and transition engine.
 */

import {
  midiToFreq, getScaleMidi, parseKey,
  audioBufferToWav, normalizeAudio, softClipLimiter,
} from './audio-utils';
import { getGenreProfile, blendGenreProfiles, type GenreProfile } from './genre-ontology';
import { getGrooveTemplate, applyGrooveTiming, getGrooveVelocity } from './groove-engine';
import { getDrumPattern, getDrumFill, type DrumHit } from './drum-patterns';
import { generateBassline, chooseBassStyle } from './bassline-generator';
import { generateMelody, generateChords, chooseMelodyStyle } from './melody-generator';
import { generateArrangement, getTransitionType } from './arrangement-engine';
import { renderTransition } from './transition-engine';

// ===== Types =====

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
}

export interface SectionPlan {
  name: string;
  duration: number;
  energy: number; // 0-1
  description: string;
}

type ProgressCallback = (stage: string, progress: number) => void;

// ===== Seeded random =====
function createRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
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

  // Transient click for hard kicks
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
  // Noise component
  const dur = style === 'brush' ? 0.08 : 0.15;
  const bufSize = Math.ceil(ctx.sampleRate * dur);
  const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
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

  // Tonal body (not for brush)
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
  // Multi-layer clap
  for (let layer = 0; layer < 3; layer++) {
    const delay = layer * 0.008;
    const bufSize = Math.ceil(ctx.sampleRate * 0.12);
    const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
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
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
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
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
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
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
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

/** Render a bass note */
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

/** Render an acid/lead synth note */
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

/** Render a pad chord */
function renderPadChord(
  ctx: OfflineAudioContext, dest: AudioNode,
  time: number, freqs: number[], duration: number, velocity: number
) {
  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() - 0.5) * 10;
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

// ===== Main Generation Function =====

export async function generateTrack(
  intent: MusicIntent,
  onProgress: ProgressCallback,
  seed?: number,
): Promise<Blob> {
  const rng = createRng(seed ?? Math.floor(Math.random() * 2147483647));
  const { tempo, key, scale, structure, durationSeconds, energy: globalEnergy } = intent;
  const sampleRate = 44100;
  const numChannels = 2;

  onProgress('generating_midi', 0.12);
  await sleep(50);

  // Get genre profile
  const genres = intent.genres?.length ? intent.genres : [intent.genre];
  const profile = blendGenreProfiles(genres);
  const groove = getGrooveTemplate(profile.grooveTemplate);

  // Parse key
  const { root, scale: parsedScale } = parseKey(`${key} ${scale}`);
  const beatDuration = 60 / tempo;
  const sixteenthDur = beatDuration / 4;

  // Use AI structure or generate from genre profile
  const sections = structure.length > 0 ? structure : generateArrangement(profile, durationSeconds, rng);

  // Choose genre-appropriate styles
  const bassStyle = chooseBassStyle(profile.rhythmStyle, intent.genre);
  const melodyStyle = chooseMelodyStyle(intent.genre, globalEnergy / 10);
  const leadWaveform: OscillatorType = profile.harmonicStyle === 'chromatic' ? 'sawtooth' : 'square';
  const bassWaveform: OscillatorType = profile.swing > 0.2 ? 'sine' : 'sawtooth';

  // Create offline context
  const ctx = new OfflineAudioContext(numChannels, sampleRate * durationSeconds, sampleRate);

  // Master compressor
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 6;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;
  compressor.connect(ctx.destination);

  // Channel buses
  const drumBus = ctx.createGain();
  drumBus.gain.value = 0.8;
  drumBus.connect(compressor);

  const bassBus = ctx.createGain();
  bassBus.gain.value = 0.7;
  bassBus.connect(compressor);

  const synthBus = ctx.createGain();
  synthBus.gain.value = 0.5;
  synthBus.connect(compressor);

  const padBus = ctx.createGain();
  padBus.gain.value = 0.4;
  padBus.connect(compressor);

  const fxBus = ctx.createGain();
  fxBus.gain.value = 0.6;
  fxBus.connect(compressor);

  onProgress('generating_midi', 0.18);

  // ===== Schedule all events per section =====
  let currentTime = 0;
  const totalSections = sections.length;

  for (let sIdx = 0; sIdx < totalSections; sIdx++) {
    const section = sections[sIdx];
    const sectionEnd = currentTime + section.duration;
    const energy = section.energy;
    const name = section.name.toLowerCase();

    const isIntro = name.includes('intro');
    const isDrop = name.includes('drop') || name.includes('peak') || name.includes('climax');
    const isBreakdown = name.includes('break');
    const isBuild = name.includes('build');
    const isOutro = name.includes('outro');
    const isVerse = name.includes('verse');
    const isChorus = name.includes('chorus') || name.includes('hook');

    // --- Transitions ---
    if (sIdx > 0) {
      const prevEnergy = sections[sIdx - 1].energy;
      const transType = getTransitionType(prevEnergy, energy, rng);
      renderTransition(ctx, fxBus, transType, currentTime, Math.min(2, section.duration * 0.15), energy);
    }

    // --- DRUMS ---
    if (energy > 0.1 && !isBreakdown) {
      const pattern = getDrumPattern(profile.rhythmStyle, energy, rng);
      let barStart = isIntro ? currentTime + section.duration * 0.3 : currentTime;

      while (barStart < sectionEnd) {
        for (const hit of pattern) {
          const hitTime = barStart + hit.step * sixteenthDur;
          if (hitTime >= sectionEnd) continue;
          const groovedTime = applyGrooveTiming(hitTime, sixteenthDur, groove, rng);
          const groovedVel = hit.velocity * getGrooveVelocity(hitTime, sixteenthDur, groove, rng);
          if (groovedTime >= 0 && groovedTime < sectionEnd) {
            renderDrumHit(ctx, drumBus, { ...hit, velocity: groovedVel }, groovedTime, profile);
          }
        }
        barStart += beatDuration * 4; // one bar
      }

      // Drum fill at section end (if transitioning to higher energy)
      if (sIdx < totalSections - 1 && sections[sIdx + 1].energy > energy) {
        const fillPattern = getDrumFill(energy, rng);
        const fillStart = sectionEnd - beatDuration * 2;
        for (const hit of fillPattern) {
          const hitTime = fillStart + hit.step * sixteenthDur;
          if (hitTime >= sectionEnd) continue;
          renderDrumHit(ctx, drumBus, hit, hitTime, profile);
        }
      }
    }

    // --- BASS ---
    if (energy > 0.1 && !isBreakdown) {
      const bassStart = isIntro ? currentTime + section.duration * 0.4 : currentTime;
      const bassEvents = generateBassline(
        root, parsedScale, bassStart, sectionEnd - bassStart,
        beatDuration, bassStyle, energy, rng
      );
      for (const evt of bassEvents) {
        const freq = midiToFreq(evt.midi);
        const groovedTime = applyGrooveTiming(evt.time, sixteenthDur, groove, rng);
        if (groovedTime >= 0 && groovedTime < sectionEnd) {
          renderBassNote(ctx, bassBus, groovedTime, freq, evt.duration, evt.velocity, bassWaveform);
        }
      }
    }

    // --- MELODY / LEAD ---
    if ((isDrop || isBuild || isChorus || isVerse) && energy > 0.3) {
      const melEvents = generateMelody(
        root, parsedScale, currentTime, section.duration,
        beatDuration, energy, isDrop || isChorus ? melodyStyle : 'lead', rng
      );
      for (const evt of melEvents) {
        const freq = midiToFreq(evt.midi);
        const groovedTime = applyGrooveTiming(evt.time, sixteenthDur, groove, rng);
        if (groovedTime >= 0 && groovedTime < sectionEnd) {
          renderLeadNote(ctx, synthBus, groovedTime, freq, evt.duration, evt.velocity, leadWaveform);
        }
      }
    }

    // --- PADS / CHORDS ---
    if (isIntro || isBreakdown || isOutro || energy < 0.5 || isVerse) {
      const chordEvents = generateChords(
        root, parsedScale, currentTime, section.duration,
        beatDuration, energy, rng
      );
      for (const evt of chordEvents) {
        const freqs = evt.midis.map(midiToFreq);
        renderPadChord(ctx, padBus, evt.time, freqs, evt.duration, evt.velocity);
      }
    }

    currentTime = sectionEnd;

    // Update progress
    const sectionProgress = 0.20 + (sIdx / totalSections) * 0.50;
    onProgress('rendering_audio', sectionProgress);
  }

  onProgress('rendering_audio', 0.72);

  // ===== Render =====
  const renderedBuffer = await ctx.startRendering();

  onProgress('mixing_mastering', 0.80);
  await sleep(30);

  // ===== Post-processing =====
  normalizeAudio(renderedBuffer, 0.92);
  softClipLimiter(renderedBuffer, 0.88);

  onProgress('mixing_mastering', 0.88);

  const wavBlob = audioBufferToWav(renderedBuffer);

  onProgress('finalizing', 0.92);
  return wavBlob;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
