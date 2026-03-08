/**
 * Browser-based Vocal Synthesis Engine
 * Uses formant synthesis (oscillator banks + filters) to generate sung/spoken vocals
 * from lyrics text, aligned to song structure and timing.
 * 
 * Supports vocal styles: melodic singing, robotic vocoder, rap, choir, whisper
 */

import { midiToFreq, getScaleMidi, parseKey, INTERNAL_SAMPLE_RATE } from './audio-utils';
import type { SectionPlan } from './music-engine';

// ===== Types =====

export interface VocalConfig {
  lyrics: string;
  tempo: number;
  key: string;
  scale: string;
  structure: SectionPlan[];
  durationSeconds: number;
  vocalStyle: VocalStyleType;
  vocalIntensity: number; // 1-10
  vocalEffects: string[];
  genres: string[];
  mood: string;
}

export type VocalStyleType = 
  | 'male_electronic' | 'female_melodic' | 'robotic_vocoder' 
  | 'rap' | 'choir' | 'whisper' | 'melodic_singing';

export interface VocalSegment {
  text: string;
  sectionName: string;
  startTime: number;
  endTime: number;
  energy: number;
}

export interface VocalProgress {
  stage: 'parsing' | 'generating' | 'aligning' | 'mixing';
  progress: number;
}

// ===== Formant Data =====
// Vowel formant frequencies (F1, F2, F3) for synthesis
const VOWEL_FORMANTS: Record<string, [number, number, number]> = {
  'a': [800, 1200, 2500],
  'e': [400, 2200, 2800],
  'i': [300, 2700, 3300],
  'o': [500, 900, 2500],
  'u': [350, 700, 2500],
};

// Consonant characteristics
const CONSONANT_TYPES: Record<string, 'plosive' | 'fricative' | 'nasal' | 'liquid' | 'silent'> = {
  'b': 'plosive', 'p': 'plosive', 'd': 'plosive', 't': 'plosive', 'g': 'plosive', 'k': 'plosive',
  'f': 'fricative', 'v': 'fricative', 's': 'fricative', 'z': 'fricative', 'h': 'fricative',
  'th': 'fricative', 'sh': 'fricative', 'ch': 'fricative',
  'm': 'nasal', 'n': 'nasal', 'ng': 'nasal',
  'l': 'liquid', 'r': 'liquid', 'w': 'liquid', 'y': 'liquid',
  ' ': 'silent',
};

// ===== Vocal Style Parameters =====

interface StyleParams {
  baseOctave: number;
  vibratoRate: number;
  vibratoDepth: number;
  breathiness: number;
  formantShift: number; // multiplier for formant frequencies
  attackTime: number;
  releaseTime: number;
  waveform: OscillatorType;
  harmonicRichness: number;
}

function getStyleParams(style: VocalStyleType, intensity: number): StyleParams {
  const intensityFactor = intensity / 10;
  
  switch (style) {
    case 'female_melodic':
      return {
        baseOctave: 4, vibratoRate: 5.5, vibratoDepth: 8 * intensityFactor,
        breathiness: 0.3, formantShift: 1.15, attackTime: 0.03,
        releaseTime: 0.08, waveform: 'sine', harmonicRichness: 0.4,
      };
    case 'male_electronic':
      return {
        baseOctave: 3, vibratoRate: 4.5, vibratoDepth: 5 * intensityFactor,
        breathiness: 0.15, formantShift: 0.9, attackTime: 0.02,
        releaseTime: 0.06, waveform: 'sawtooth', harmonicRichness: 0.6,
      };
    case 'robotic_vocoder':
      return {
        baseOctave: 3, vibratoRate: 0, vibratoDepth: 0,
        breathiness: 0.05, formantShift: 1.0, attackTime: 0.005,
        releaseTime: 0.01, waveform: 'square', harmonicRichness: 0.9,
      };
    case 'rap':
      return {
        baseOctave: 3, vibratoRate: 0, vibratoDepth: 0,
        breathiness: 0.25, formantShift: 0.95, attackTime: 0.01,
        releaseTime: 0.03, waveform: 'sawtooth', harmonicRichness: 0.5,
      };
    case 'choir':
      return {
        baseOctave: 4, vibratoRate: 5, vibratoDepth: 10 * intensityFactor,
        breathiness: 0.2, formantShift: 1.0, attackTime: 0.08,
        releaseTime: 0.15, waveform: 'sine', harmonicRichness: 0.3,
      };
    case 'whisper':
      return {
        baseOctave: 4, vibratoRate: 0, vibratoDepth: 0,
        breathiness: 0.85, formantShift: 1.1, attackTime: 0.02,
        releaseTime: 0.05, waveform: 'sine', harmonicRichness: 0.1,
      };
    case 'melodic_singing':
    default:
      return {
        baseOctave: 4, vibratoRate: 5, vibratoDepth: 6 * intensityFactor,
        breathiness: 0.2, formantShift: 1.0, attackTime: 0.025,
        releaseTime: 0.07, waveform: 'sine', harmonicRichness: 0.5,
      };
  }
}

// ===== Infer Vocal Style from Genre =====

export function inferVocalStyle(genres: string[], vocalStyle?: string): VocalStyleType {
  if (vocalStyle) {
    const lower = vocalStyle.toLowerCase();
    if (lower.includes('male') && lower.includes('electronic')) return 'male_electronic';
    if (lower.includes('female')) return 'female_melodic';
    if (lower.includes('robot') || lower.includes('vocoder')) return 'robotic_vocoder';
    if (lower.includes('rap')) return 'rap';
    if (lower.includes('choir')) return 'choir';
    if (lower.includes('whisper')) return 'whisper';
    if (lower.includes('melodic') || lower.includes('singing')) return 'melodic_singing';
  }
  
  const genreStr = genres.join(' ').toLowerCase();
  if (genreStr.includes('techno') || genreStr.includes('industrial')) return 'robotic_vocoder';
  if (genreStr.includes('trap') || genreStr.includes('hip hop') || genreStr.includes('rap')) return 'rap';
  if (genreStr.includes('pop') || genreStr.includes('r&b')) return 'female_melodic';
  if (genreStr.includes('choir') || genreStr.includes('gospel')) return 'choir';
  if (genreStr.includes('ambient') || genreStr.includes('lo-fi')) return 'whisper';
  if (genreStr.includes('edm') || genreStr.includes('house') || genreStr.includes('electronic')) return 'male_electronic';
  return 'melodic_singing';
}

// ===== Lyrics Parser =====

interface LyricLine {
  text: string;
  section: string; // verse, chorus, bridge, etc.
  words: string[];
}

function parseLyrics(lyrics: string): LyricLine[] {
  const lines: LyricLine[] = [];
  let currentSection = 'verse';
  
  for (const raw of lyrics.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    
    // Detect section markers
    const sectionMatch = line.match(/^\[?(verse|chorus|bridge|intro|outro|hook|pre-chorus|post-chorus)\s*\d*\]?$/i);
    if (sectionMatch) {
      currentSection = sectionMatch[1].toLowerCase();
      continue;
    }
    
    // Also detect implicit section labels without brackets
    const implicitSection = line.match(/^(verse|chorus|bridge|intro|outro|hook)\s*\d*$/i);
    if (implicitSection) {
      currentSection = implicitSection[1].toLowerCase();
      continue;
    }
    
    lines.push({
      text: line,
      section: currentSection,
      words: line.split(/\s+/).filter(w => w.length > 0),
    });
  }
  
  return lines;
}

// ===== Align Lyrics to Song Structure =====

function alignLyricsToStructure(
  lyricLines: LyricLine[],
  structure: SectionPlan[],
  durationSeconds: number,
): VocalSegment[] {
  const segments: VocalSegment[] = [];
  
  // Build section timeline
  const sectionTimeline: { name: string; start: number; end: number; energy: number }[] = [];
  let t = 0;
  for (const section of structure) {
    sectionTimeline.push({ name: section.name.toLowerCase(), start: t, end: t + section.duration, energy: section.energy });
    t += section.duration;
  }
  
  // Map lyric lines to vocal sections (skip intros/outros)
  const vocalSections = sectionTimeline.filter(s => 
    !s.name.includes('intro') && !s.name.includes('outro') && !s.name.includes('break')
  );
  
  if (vocalSections.length === 0 || lyricLines.length === 0) return segments;
  
  // Distribute lyrics across vocal sections
  let lineIdx = 0;
  for (const section of vocalSections) {
    if (lineIdx >= lyricLines.length) break;
    
    // Count lines for this section type
    const matchingLines: LyricLine[] = [];
    while (lineIdx < lyricLines.length) {
      matchingLines.push(lyricLines[lineIdx]);
      lineIdx++;
      // Limit lines per section based on duration
      const maxLines = Math.max(2, Math.floor(section.end - section.start) / 3);
      if (matchingLines.length >= maxLines) break;
    }
    
    if (matchingLines.length === 0) continue;
    
    // Distribute lines evenly within section, leaving margins
    const margin = 0.5;
    const sectionDur = (section.end - section.start) - margin * 2;
    const lineSpacing = sectionDur / matchingLines.length;
    
    for (let i = 0; i < matchingLines.length; i++) {
      const startTime = section.start + margin + i * lineSpacing;
      const endTime = startTime + lineSpacing * 0.85; // small gap between lines
      
      segments.push({
        text: matchingLines[i].text,
        sectionName: section.name,
        startTime,
        endTime: Math.min(endTime, section.end - 0.1),
        energy: section.energy,
      });
    }
  }
  
  // If we have leftover lyrics, loop back through sections
  if (lineIdx < lyricLines.length && vocalSections.length > 0) {
    let sIdx = 0;
    while (lineIdx < lyricLines.length) {
      const section = vocalSections[sIdx % vocalSections.length];
      // Add to existing section timeline (overlay)
      segments.push({
        text: lyricLines[lineIdx].text,
        sectionName: section.name,
        startTime: section.start + (section.end - section.start) * 0.5,
        endTime: section.end - 0.2,
        energy: section.energy,
      });
      lineIdx++;
      sIdx++;
    }
  }
  
  return segments;
}

// ===== Phoneme Extraction (Simplified) =====

interface Phoneme {
  char: string;
  isVowel: boolean;
  formants: [number, number, number] | null;
  duration: number; // relative
}

function textToPhonemes(text: string): Phoneme[] {
  const phonemes: Phoneme[] = [];
  const lower = text.toLowerCase().replace(/[^a-z\s]/g, '');
  
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    const vowelFormant = VOWEL_FORMANTS[ch];
    
    if (vowelFormant) {
      phonemes.push({ char: ch, isVowel: true, formants: vowelFormant, duration: 1.5 });
    } else if (ch === ' ') {
      phonemes.push({ char: ' ', isVowel: false, formants: null, duration: 0.3 });
    } else {
      // Consonant
      const type = CONSONANT_TYPES[ch] || 'fricative';
      const dur = type === 'plosive' ? 0.3 : type === 'nasal' ? 0.8 : type === 'liquid' ? 0.7 : 0.4;
      phonemes.push({ char: ch, isVowel: false, formants: null, duration: dur });
    }
  }
  
  return phonemes;
}

// ===== Render Single Vocal Segment =====

function renderVocalSegment(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  segment: VocalSegment,
  localStartTime: number,
  localEndTime: number,
  style: StyleParams,
  scaleMidi: number[],
  rng: () => number,
) {
  const segDuration = localEndTime - localStartTime;
  if (segDuration <= 0) return;
  
  const phonemes = textToPhonemes(segment.text);
  const totalRelDur = phonemes.reduce((s, p) => s + p.duration, 0);
  if (totalRelDur === 0) return;
  
  const volume = 0.25 * (segment.energy * 0.5 + 0.5);
  let phonemeTime = localStartTime;
  
  for (const phoneme of phonemes) {
    const phDur = (phoneme.duration / totalRelDur) * segDuration;
    if (phonemeTime + phDur > localEndTime) break;
    
    if (phoneme.isVowel && phoneme.formants) {
      // Choose a pitch from the scale
      const noteIdx = Math.floor(rng() * Math.min(5, scaleMidi.length));
      const basePitch = midiToFreq(scaleMidi[noteIdx]);
      
      // Main oscillator (vocal carrier)
      const osc = ctx.createOscillator();
      osc.type = style.waveform;
      osc.frequency.setValueAtTime(basePitch, phonemeTime);
      
      // Vibrato
      if (style.vibratoRate > 0 && style.vibratoDepth > 0) {
        const vibLfo = ctx.createOscillator();
        const vibGain = ctx.createGain();
        vibLfo.frequency.value = style.vibratoRate;
        vibGain.gain.value = style.vibratoDepth;
        vibLfo.connect(vibGain).connect(osc.frequency);
        vibLfo.start(phonemeTime);
        vibLfo.stop(phonemeTime + phDur + 0.01);
      }
      
      // Formant filters (3-band)
      const formants = phoneme.formants.map(f => f * style.formantShift);
      
      // Create parallel formant filter bank
      const formantGains: GainNode[] = [];
      for (let fi = 0; fi < 3; fi++) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = formants[fi];
        filter.Q.value = fi === 0 ? 8 : fi === 1 ? 10 : 12;
        
        const fGain = ctx.createGain();
        const fLevel = fi === 0 ? 1.0 : fi === 1 ? 0.7 : 0.4;
        fGain.gain.value = fLevel * volume;
        
        osc.connect(filter).connect(fGain).connect(dest);
        formantGains.push(fGain);
      }
      
      // Harmonics for richer vocal timbre
      if (style.harmonicRichness > 0.2) {
        const harm = ctx.createOscillator();
        harm.type = 'sawtooth';
        harm.frequency.value = basePitch;
        const harmGain = ctx.createGain();
        harmGain.gain.setValueAtTime(volume * style.harmonicRichness * 0.15, phonemeTime);
        harmGain.gain.exponentialRampToValueAtTime(0.001, phonemeTime + phDur);
        const harmFilter = ctx.createBiquadFilter();
        harmFilter.type = 'lowpass';
        harmFilter.frequency.value = formants[1];
        harm.connect(harmFilter).connect(harmGain).connect(dest);
        harm.start(phonemeTime);
        harm.stop(phonemeTime + phDur + 0.01);
      }
      
      // Envelope
      const envGain = ctx.createGain();
      envGain.gain.setValueAtTime(0.001, phonemeTime);
      envGain.gain.linearRampToValueAtTime(volume, phonemeTime + style.attackTime);
      envGain.gain.setValueAtTime(volume * 0.9, phonemeTime + phDur - style.releaseTime);
      envGain.gain.linearRampToValueAtTime(0.001, phonemeTime + phDur);
      
      // Route through envelope
      for (const fg of formantGains) {
        fg.connect(envGain);
      }
      envGain.connect(dest);
      
      // Breathiness (filtered noise)
      if (style.breathiness > 0.1) {
        const noiseDur = phDur;
        const bufSize = Math.ceil(ctx.sampleRate * noiseDur);
        if (bufSize > 0) {
          const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
          const noiseData = noiseBuf.getChannelData(0);
          for (let i = 0; i < bufSize; i++) noiseData[i] = (rng() * 2 - 1);
          const noiseSrc = ctx.createBufferSource();
          noiseSrc.buffer = noiseBuf;
          const noiseFilter = ctx.createBiquadFilter();
          noiseFilter.type = 'bandpass';
          noiseFilter.frequency.value = formants[0];
          noiseFilter.Q.value = 2;
          const noiseGain = ctx.createGain();
          noiseGain.gain.setValueAtTime(style.breathiness * volume * 0.5, phonemeTime);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, phonemeTime + noiseDur);
          noiseSrc.connect(noiseFilter).connect(noiseGain).connect(dest);
          noiseSrc.start(phonemeTime);
          noiseSrc.stop(phonemeTime + noiseDur + 0.01);
        }
      }
      
      osc.start(phonemeTime);
      osc.stop(phonemeTime + phDur + 0.01);
      
    } else if (phoneme.char !== ' ') {
      // Consonant: short noise burst
      const consType = CONSONANT_TYPES[phoneme.char] || 'fricative';
      const consDur = Math.min(phDur, 0.05);
      const bufSize = Math.ceil(ctx.sampleRate * consDur);
      if (bufSize > 0) {
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (rng() * 2 - 1);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        
        if (consType === 'plosive') {
          filter.type = 'highpass';
          filter.frequency.value = 2000;
        } else if (consType === 'nasal') {
          filter.type = 'bandpass';
          filter.frequency.value = 300;
          filter.Q.value = 5;
        } else {
          filter.type = 'highpass';
          filter.frequency.value = 4000;
        }
        
        const gain = ctx.createGain();
        const consVol = consType === 'plosive' ? volume * 0.4 : volume * 0.2;
        gain.gain.setValueAtTime(consVol, phonemeTime);
        gain.gain.exponentialRampToValueAtTime(0.001, phonemeTime + consDur);
        src.connect(filter).connect(gain).connect(dest);
        src.start(phonemeTime);
        src.stop(phonemeTime + consDur + 0.01);
      }
    }
    
    phonemeTime += phDur;
  }
}

// ===== Apply Vocal Effects =====

function applyVocalEffects(
  ctx: OfflineAudioContext,
  source: AudioNode,
  dest: AudioNode,
  effects: string[],
  genres: string[],
): AudioNode {
  let current: AudioNode = source;
  
  // EQ: cut below 120Hz for vocal clarity
  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = 120;
  hpf.Q.value = 0.7;
  current.connect(hpf);
  current = hpf;
  
  // Presence boost around 3kHz
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 3000;
  presence.gain.value = 3;
  presence.Q.value = 1.5;
  current.connect(presence);
  current = presence;
  
  // Compression for consistent levels
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.knee.value = 6;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.1;
  current.connect(comp);
  current = comp;
  
  // Genre-specific or user-selected effects
  const genreStr = genres.join(' ').toLowerCase();
  const effectSet = new Set(effects.map(e => e.toLowerCase()));
  
  // Vocoder effect for electronic/techno
  if (effectSet.has('vocoder') || genreStr.includes('techno') || genreStr.includes('industrial')) {
    const vocoderFilter = ctx.createBiquadFilter();
    vocoderFilter.type = 'bandpass';
    vocoderFilter.frequency.value = 1500;
    vocoderFilter.Q.value = 15;
    current.connect(vocoderFilter);
    current = vocoderFilter;
  }
  
  // Reverb (convolution approximation via delay network)
  if (effectSet.has('reverb') || genreStr.includes('pop') || genreStr.includes('ambient')) {
    const reverbDelay = ctx.createDelay(0.5);
    reverbDelay.delayTime.value = 0.03;
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.2;
    const reverbFilter = ctx.createBiquadFilter();
    reverbFilter.type = 'lowpass';
    reverbFilter.frequency.value = 4000;
    current.connect(reverbDelay).connect(reverbFilter).connect(reverbGain).connect(dest);
    // Also direct signal
  }
  
  // Delay
  if (effectSet.has('delay') || genreStr.includes('techno') || genreStr.includes('dub')) {
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.375; // dotted eighth at ~120bpm
    const delayGain = ctx.createGain();
    delayGain.gain.value = 0.15;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    current.connect(delay).connect(feedback).connect(delay);
    delay.connect(delayGain).connect(dest);
  }
  
  // Autotune effect (pitch snapping is already inherent in our synthesis)
  // Distortion
  if (effectSet.has('distortion')) {
    const distGain = ctx.createGain();
    distGain.gain.value = 1.5;
    const waveshaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = (Math.PI + 3) * x / (Math.PI + 3 * Math.abs(x));
    }
    waveshaper.curve = curve;
    current.connect(distGain).connect(waveshaper);
    current = waveshaper;
  }
  
  current.connect(dest);
  return dest;
}

// ===== Main Vocal Generation Function =====

export async function generateVocals(
  config: VocalConfig,
  onProgress: (p: VocalProgress) => void,
  rng: () => number,
): Promise<AudioBuffer | null> {
  const { lyrics, tempo, key, scale, structure, durationSeconds, vocalStyle, vocalIntensity, vocalEffects, genres } = config;
  
  if (!lyrics || lyrics.trim().length === 0) return null;
  
  onProgress({ stage: 'parsing', progress: 0 });
  
  // Step 1: Parse lyrics
  const lyricLines = parseLyrics(lyrics);
  if (lyricLines.length === 0) return null;
  
  onProgress({ stage: 'parsing', progress: 0.2 });
  
  // Step 2: Align lyrics to structure
  const vocalSegments = alignLyricsToStructure(lyricLines, structure, durationSeconds);
  if (vocalSegments.length === 0) return null;
  
  onProgress({ stage: 'aligning', progress: 0.3 });
  
  // Step 3: Get style parameters
  const styleParams = getStyleParams(vocalStyle, vocalIntensity);
  const { root, scale: parsedScale } = parseKey(`${key} ${scale}`);
  const scaleMidi = getScaleMidi(root, parsedScale, styleParams.baseOctave, 8);
  
  // Step 4: Render vocals
  onProgress({ stage: 'generating', progress: 0.35 });
  
  const sampleRate = INTERNAL_SAMPLE_RATE;
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * durationSeconds), sampleRate);
  
  // Vocal bus with effects chain
  const vocalBus = ctx.createGain();
  vocalBus.gain.value = 0.6; // Vocal level
  
  // Apply effects chain
  const effectsBus = ctx.createGain();
  effectsBus.gain.value = 1.0;
  applyVocalEffects(ctx, vocalBus, effectsBus, vocalEffects, genres);
  effectsBus.connect(ctx.destination);
  
  // Render each vocal segment
  for (let i = 0; i < vocalSegments.length; i++) {
    const segment = vocalSegments[i];
    
    // Clamp to audio duration
    const startTime = Math.max(0, segment.startTime);
    const endTime = Math.min(durationSeconds, segment.endTime);
    
    if (endTime > startTime) {
      renderVocalSegment(ctx, vocalBus, segment, startTime, endTime, styleParams, scaleMidi, rng);
    }
    
    // Progress update
    const genProgress = 0.35 + (i / vocalSegments.length) * 0.55;
    onProgress({ stage: 'generating', progress: genProgress });
    
    // Yield to UI
    if (i % 4 === 0) await sleep(5);
  }
  
  onProgress({ stage: 'mixing', progress: 0.92 });
  
  // Render the vocal buffer
  const vocalBuffer = await ctx.startRendering();
  
  onProgress({ stage: 'mixing', progress: 1.0 });
  
  return vocalBuffer;
}

// ===== Mix Vocals into Instrumental =====

export function mixVocalsIntoInstrumental(
  instrumental: AudioBuffer,
  vocals: AudioBuffer,
  vocalLevel: number = 0.7, // 0-1, how prominent vocals are
): AudioBuffer {
  const sampleRate = instrumental.sampleRate;
  const numChannels = instrumental.numberOfChannels;
  const length = instrumental.length;
  
  const mixed = new AudioBuffer({ length, numberOfChannels: numChannels, sampleRate });
  
  for (let ch = 0; ch < numChannels; ch++) {
    const instData = instrumental.getChannelData(ch);
    const vocalData = ch < vocals.numberOfChannels ? vocals.getChannelData(ch) : vocals.getChannelData(0);
    const mixData = mixed.getChannelData(ch);
    
    const vocalSamples = Math.min(length, vocals.length);
    
    for (let i = 0; i < length; i++) {
      const inst = instData[i];
      // Slight ducking of instrumental when vocals are present
      const vocal = i < vocalSamples ? vocalData[i] * vocalLevel : 0;
      const vocalPresence = Math.abs(vocal) > 0.01 ? 1 : 0;
      const instDuck = 1 - vocalPresence * 0.15; // Duck instrumental by 15% when vocals present
      
      mixData[i] = inst * instDuck + vocal;
    }
  }
  
  return mixed;
}

// ===== Auto-generate Lyrics from Prompt =====

export function generateDefaultLyrics(prompt: string, genres: string[], mood: string, structure: SectionPlan[]): string {
  // Generate simple placeholder lyrics based on sections
  const lines: string[] = [];
  let verseCount = 0;
  let chorusCount = 0;
  
  for (const section of structure) {
    const name = section.name.toLowerCase();
    if (name.includes('intro') || name.includes('outro') || name.includes('break')) continue;
    
    if (name.includes('verse')) {
      verseCount++;
      lines.push(`[Verse ${verseCount}]`);
      lines.push(`Feel the rhythm in the ${mood || 'night'}`);
      lines.push(`${genres[0] || 'Music'} taking over my soul`);
      lines.push(`Moving through the sound and light`);
      lines.push(`Let the melody make me whole`);
      lines.push('');
    } else if (name.includes('chorus') || name.includes('hook') || name.includes('drop')) {
      chorusCount++;
      lines.push('[Chorus]');
      lines.push(`We are ${mood || 'alive'}, we are the sound`);
      lines.push(`${prompt.split(' ').slice(0, 4).join(' ') || 'Feel the beat'}`);
      lines.push(`Rising up, never coming down`);
      lines.push('');
    } else if (name.includes('bridge')) {
      lines.push('[Bridge]');
      lines.push(`Through the ${mood || 'dark'}ness we find our way`);
      lines.push(`Every note a brand new day`);
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
