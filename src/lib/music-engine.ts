/**
 * Browser-based music generation engine using Web Audio API OfflineAudioContext.
 * Generates complete techno/EDM tracks with drums, bass, synths, and pads.
 * No external dependencies — runs entirely in the browser.
 */

import {
  midiToFreq, getScaleMidi, parseKey,
  audioBufferToWav, normalizeAudio, softClipLimiter,
} from './audio-utils';

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
}

export interface SectionPlan {
  name: string;
  duration: number;
  energy: number; // 0-1
  description: string;
}

type ProgressCallback = (stage: string, progress: number) => void;

// ===== Seeded random for reproducibility =====
function createRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ===== Instrument Rendering Helpers =====

/** Render a kick drum hit into the audio buffer at a given time */
function renderKick(
  ctx: OfflineAudioContext, destination: AudioNode,
  time: number, velocity: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(35, time + 0.07);
  gain.gain.setValueAtTime(velocity * 0.9, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
  osc.connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + 0.5);
}

/** Render a clap/snare noise hit */
function renderClap(
  ctx: OfflineAudioContext, destination: AudioNode,
  time: number, velocity: number
) {
  const bufferSize = ctx.sampleRate * 0.15;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1);
  }
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 3000;
  filter.Q.value = 1.5;
  
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(velocity * 0.5, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
  
  source.connect(filter).connect(gain).connect(destination);
  source.start(time);
  source.stop(time + 0.15);
}

/** Render a hi-hat noise hit */
function renderHihat(
  ctx: OfflineAudioContext, destination: AudioNode,
  time: number, velocity: number, open: boolean = false
) {
  const duration = open ? 0.15 : 0.04;
  const bufferSize = Math.ceil(ctx.sampleRate * duration);
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1);
  }
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = open ? 7000 : 9000;
  
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(velocity * 0.35, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  
  source.connect(filter).connect(gain).connect(destination);
  source.start(time);
  source.stop(time + duration + 0.01);
}

/** Render a bass note (sawtooth + LP filter) */
function renderBassNote(
  ctx: OfflineAudioContext, destination: AudioNode,
  time: number, freq: number, duration: number, velocity: number
) {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
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
  
  osc.connect(filter).connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + duration + 0.01);
}

/** Render an acid/lead synth note (square + resonant filter) */
function renderAcidNote(
  ctx: OfflineAudioContext, destination: AudioNode,
  time: number, freq: number, duration: number, velocity: number
) {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(freq * 8, time);
  filter.frequency.exponentialRampToValueAtTime(freq * 1.5, time + duration * 0.6);
  filter.Q.value = 12;
  
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, time);
  gain.gain.linearRampToValueAtTime(velocity * 0.2, time + 0.01);
  gain.gain.setValueAtTime(velocity * 0.18, time + duration * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  
  osc.connect(filter).connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + duration + 0.01);
}

/** Render a pad chord (triangle waves) */
function renderPadChord(
  ctx: OfflineAudioContext, destination: AudioNode,
  time: number, freqs: number[], duration: number, velocity: number
) {
  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    
    // Slight detune for width
    osc.detune.value = (Math.random() - 0.5) * 10;
    
    const gain = ctx.createGain();
    const attackTime = Math.min(0.8, duration * 0.15);
    const releaseTime = Math.min(1.5, duration * 0.3);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(velocity * 0.08, time + attackTime);
    gain.gain.setValueAtTime(velocity * 0.07, time + duration - releaseTime);
    gain.gain.linearRampToValueAtTime(0.001, time + duration);
    
    osc.connect(gain).connect(destination);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }
}

/** Render a percussion hit (metallic noise) */
function renderPerc(
  ctx: OfflineAudioContext, destination: AudioNode,
  time: number, velocity: number, type: 'rim' | 'shaker' | 'tom'
) {
  if (type === 'tom') {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.15);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(velocity * 0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    osc.connect(gain).connect(destination);
    osc.start(time);
    osc.stop(time + 0.25);
  } else {
    const dur = type === 'rim' ? 0.02 : 0.06;
    const bufSize = Math.ceil(ctx.sampleRate * dur);
    const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type === 'rim' ? 'highpass' : 'bandpass';
    filter.frequency.value = type === 'rim' ? 5000 : 8000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(velocity * 0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    src.connect(filter).connect(gain).connect(destination);
    src.start(time);
    src.stop(time + dur + 0.01);
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
  await sleep(50); // Allow UI to update

  // Parse key
  const { root, scale: parsedScale } = parseKey(`${key} ${scale}`);

  // Get scale notes for different octaves
  const bassNotes = getScaleMidi(root, parsedScale, 1, 8);
  const leadNotes = getScaleMidi(root, parsedScale, 3, 14);
  const padNotes = getScaleMidi(root, parsedScale, 3, 8);
  const percMidi = getScaleMidi(root, parsedScale, 2, 5);

  const beatDuration = 60 / tempo;
  const sixteenthDur = beatDuration / 4;

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

  // Channel buses with individual gains
  const drumBus = ctx.createGain();
  drumBus.gain.value = 0.85;
  drumBus.connect(compressor);

  const bassBus = ctx.createGain();
  bassBus.gain.value = 0.75;
  bassBus.connect(compressor);

  const synthBus = ctx.createGain();
  synthBus.gain.value = 0.55;
  synthBus.connect(compressor);

  const padBus = ctx.createGain();
  padBus.gain.value = 0.45;
  padBus.connect(compressor);

  onProgress('generating_midi', 0.18);

  // ===== Schedule all events per section =====
  let currentTime = 0;
  const totalSections = structure.length;

  for (let sIdx = 0; sIdx < totalSections; sIdx++) {
    const section = structure[sIdx];
    const sectionEnd = currentTime + section.duration;
    const energy = section.energy;
    const name = section.name.toLowerCase();

    const isIntro = name.includes('intro');
    const isDrop = name.includes('drop') || name.includes('peak') || name.includes('climax');
    const isBreakdown = name.includes('break');
    const isBuild = name.includes('build');
    const isOutro = name.includes('outro');

    // --- KICK (4-on-the-floor) ---
    if (energy > 0.15 && !isBreakdown) {
      let t = currentTime;
      // For intros, delay kick entry
      if (isIntro) t += section.duration * 0.3;
      while (t < sectionEnd) {
        const vel = isDrop ? 0.95 : (0.5 + energy * 0.4);
        renderKick(ctx, drumBus, t, vel);
        t += beatDuration;
      }
    }

    // --- CLAP (beats 2 and 4) ---
    if (energy > 0.3 && !isIntro) {
      let t = currentTime + beatDuration;
      while (t < sectionEnd) {
        renderClap(ctx, drumBus, t, 0.4 + energy * 0.4);
        t += beatDuration * 2;
      }
    }

    // --- HI-HATS (16th notes with velocity variation) ---
    if (energy > 0.15) {
      let t = currentTime;
      let idx = 0;
      while (t < sectionEnd) {
        const isDownbeat = idx % 4 === 0;
        const isUpbeat = idx % 2 === 0;
        const vel = isDownbeat ? 0.6 : isUpbeat ? 0.35 : 0.18;
        const adjustedVel = vel * energy;
        
        // Occasional open hihat on offbeats
        const isOpen = idx % 8 === 4 && rng() < 0.3 * energy;
        
        if (adjustedVel > 0.05) {
          renderHihat(ctx, drumBus, t, adjustedVel, isOpen);
        }
        t += sixteenthDur;
        idx++;
      }
    }

    // --- PERCUSSION (rims, shakers) ---
    if (energy > 0.5 && (isDrop || isBuild)) {
      let t = currentTime + beatDuration * 0.5;
      while (t < sectionEnd) {
        if (rng() < energy * 0.4) {
          const type = rng() < 0.5 ? 'rim' as const : 'shaker' as const;
          renderPerc(ctx, drumBus, t, 0.3 * energy, type);
        }
        t += beatDuration;
      }
    }

    // --- BASS ---
    if (energy > 0.1 && !isBreakdown) {
      let t = currentTime;
      if (isIntro) t += section.duration * 0.4;
      let noteIdx = Math.floor(rng() * bassNotes.length);
      const bassStep = isDrop ? sixteenthDur * 2 : beatDuration;
      
      while (t < sectionEnd) {
        if (rng() < (isDrop ? 0.85 : 0.65) * energy) {
          const midi = bassNotes[noteIdx % bassNotes.length];
          const freq = midiToFreq(midi);
          const dur = bassStep * (isDrop ? 0.7 : 0.5);
          renderBassNote(ctx, bassBus, t, freq, dur, 0.5 + energy * 0.4);
        }
        // Pattern movement
        noteIdx += rng() < 0.4 ? 1 : rng() < 0.6 ? 0 : Math.floor(rng() * 3);
        t += bassStep;
      }
    }

    // --- ACID / LEAD SYNTH ---
    if (energy > 0.35 && (isDrop || isBuild)) {
      let t = currentTime;
      let noteIdx = Math.floor(rng() * leadNotes.length);
      const synthStep = sixteenthDur * (isDrop ? 1 : 2);
      
      while (t < sectionEnd) {
        if (rng() < energy * 0.5) {
          const midi = leadNotes[noteIdx % leadNotes.length];
          const freq = midiToFreq(midi);
          const dur = synthStep * (0.5 + rng() * 0.4);
          renderAcidNote(ctx, synthBus, t, freq, dur, 0.15 + energy * 0.25);
        }
        noteIdx += rng() < 0.3 ? 1 : rng() < 0.5 ? 2 : -1;
        if (noteIdx < 0) noteIdx = 0;
        t += synthStep;
      }
    }

    // --- PAD ---
    if (isIntro || isBreakdown || isOutro || energy < 0.45) {
      const chordInterval = beatDuration * 8;
      let t = currentTime;
      let chordIdx = Math.floor(rng() * 3);
      
      while (t < sectionEnd) {
        const dur = Math.min(chordInterval, sectionEnd - t);
        if (dur > 1) {
          // Build a triad from the scale
          const rootMidi = padNotes[chordIdx % padNotes.length];
          const thirdMidi = padNotes[(chordIdx + 2) % padNotes.length];
          const fifthMidi = padNotes[(chordIdx + 4) % padNotes.length];
          const freqs = [midiToFreq(rootMidi), midiToFreq(thirdMidi), midiToFreq(fifthMidi)];
          renderPadChord(ctx, padBus, t, freqs, dur, 0.2 + (1 - energy) * 0.3);
        }
        t += chordInterval;
        chordIdx++;
      }
    }

    currentTime = sectionEnd;

    // Update progress per section
    const sectionProgress = 0.20 + (sIdx / totalSections) * 0.50;
    onProgress('rendering_audio', sectionProgress);
  }

  onProgress('rendering_audio', 0.72);

  // ===== Render =====
  const renderedBuffer = await ctx.startRendering();

  onProgress('mixing_mastering', 0.80);
  await sleep(30);

  // ===== Post-processing =====
  // Normalize
  normalizeAudio(renderedBuffer, 0.92);
  
  // Soft-clip limiter
  softClipLimiter(renderedBuffer, 0.88);

  onProgress('mixing_mastering', 0.88);

  // Convert to WAV
  const wavBlob = audioBufferToWav(renderedBuffer);

  onProgress('finalizing', 0.92);
  return wavBlob;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
