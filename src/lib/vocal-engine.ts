/**
 * Browser-based Vocal Synthesis Engine — Melody-Mapped Singing
 * 
 * Converts lyrics into sung vocals by:
 * 1. Splitting text into syllables
 * 2. Generating a melodic contour per line (scale-constrained)
 * 3. Mapping each syllable to a specific note & beat-aligned duration
 * 4. Rendering via formant synthesis with vibrato, breathiness, harmonics
 * 
 * Supports vocal styles: melodic singing, robotic vocoder, rap, choir, whisper, etc.
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
  stage: 'parsing' | 'melody' | 'generating' | 'aligning' | 'mixing';
  progress: number;
}

// ===== Syllable Splitter =====

function splitIntoSyllables(word: string): string[] {
  // Simple English syllable heuristic based on vowel clusters
  const vowels = new Set(['a', 'e', 'i', 'o', 'u', 'y']);
  const lower = word.toLowerCase().replace(/[^a-z]/g, '');
  if (lower.length <= 2) return [word];

  const syllables: string[] = [];
  let current = '';
  let prevVowel = false;

  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    const isV = vowels.has(ch);
    current += word[i] || ch;

    if (prevVowel && !isV && i < lower.length - 1) {
      // Check if next char is vowel — if so, split before this consonant
      const nextIsV = i + 1 < lower.length && vowels.has(lower[i + 1]);
      if (nextIsV && current.length > 1) {
        // Split: move this consonant to the next syllable
        syllables.push(current.slice(0, -1));
        current = current.slice(-1);
        prevVowel = false;
        continue;
      }
    }

    if (isV && prevVowel && current.length > 2) {
      // New vowel cluster — split before it
      syllables.push(current.slice(0, -1));
      current = current.slice(-1);
    }

    prevVowel = isV;
  }

  if (current.length > 0) {
    if (syllables.length > 0 && current.length === 1 && !vowels.has(current.toLowerCase())) {
      syllables[syllables.length - 1] += current;
    } else {
      syllables.push(current);
    }
  }

  return syllables.length > 0 ? syllables : [word];
}

function lineToSyllables(line: string): string[] {
  const words = line.split(/\s+/).filter(w => w.length > 0);
  const syllables: string[] = [];
  for (const word of words) {
    syllables.push(...splitIntoSyllables(word));
  }
  return syllables;
}

// ===== Melody Generator =====

interface MelodyNote {
  midiNote: number;
  frequency: number;
  durationBeats: number;
}

/**
 * Generate a melodic contour for a line of N syllables.
 * Uses scale-constrained stepwise motion with occasional leaps.
 * Section energy influences register and range.
 */
function generateLineMelody(
  numSyllables: number,
  scaleMidi: number[],
  energy: number,
  sectionName: string,
  tempo: number,
  lineDurationSec: number,
  rng: () => number,
  style: VocalStyleType,
): MelodyNote[] {
  if (numSyllables === 0 || scaleMidi.length === 0) return [];

  const isChorus = /chorus|hook|drop/i.test(sectionName);
  const isBridge = /bridge/i.test(sectionName);
  const isRap = style === 'rap';

  // Pick starting note — higher energy → higher in scale
  const rangeStart = Math.floor(scaleMidi.length * 0.2);
  const rangeEnd = Math.floor(scaleMidi.length * (0.5 + energy * 0.4));
  let noteIdx = rangeStart + Math.floor(rng() * Math.max(1, rangeEnd - rangeStart));
  noteIdx = Math.min(noteIdx, scaleMidi.length - 1);

  // Chorus tends to start higher
  if (isChorus) noteIdx = Math.min(noteIdx + 2, scaleMidi.length - 1);
  if (isBridge) noteIdx = Math.max(noteIdx - 1, 0);

  const beatDuration = 60 / tempo; // seconds per beat
  const totalBeats = lineDurationSec / beatDuration;
  
  // Distribute beats across syllables with musical rhythm
  const rhythmPatterns = isRap
    ? generateRapRhythm(numSyllables, totalBeats, rng)
    : generateSingingRhythm(numSyllables, totalBeats, isChorus, rng);

  const notes: MelodyNote[] = [];

  for (let i = 0; i < numSyllables; i++) {
    const midi = scaleMidi[noteIdx];
    notes.push({
      midiNote: midi,
      frequency: midiToFreq(midi),
      durationBeats: rhythmPatterns[i],
    });

    // Move to next note — stepwise with occasional leap
    if (isRap) {
      // Rap: mostly monotone with small variations
      const move = rng() < 0.7 ? 0 : (rng() < 0.5 ? 1 : -1);
      noteIdx = Math.max(0, Math.min(scaleMidi.length - 1, noteIdx + move));
    } else {
      // Singing: stepwise motion (±1-2) with occasional leap (±3-4)
      const leap = rng() < 0.15;
      const direction = rng() < 0.5 ? 1 : -1;
      const step = leap ? Math.floor(rng() * 3) + 2 : (rng() < 0.6 ? 1 : 0);
      noteIdx = Math.max(0, Math.min(scaleMidi.length - 1, noteIdx + direction * step));

      // Tendency to resolve back toward starting note at end of phrase
      if (i > numSyllables * 0.7) {
        const target = rangeStart + Math.floor((rangeEnd - rangeStart) * 0.3);
        if (noteIdx > target) noteIdx = Math.max(target, noteIdx - 1);
        else if (noteIdx < target) noteIdx = Math.min(target, noteIdx + 1);
      }
    }
  }

  return notes;
}

function generateSingingRhythm(numSyllables: number, totalBeats: number, isChorus: boolean, rng: () => number): number[] {
  // Common musical note durations (in beats): 0.5, 0.75, 1, 1.5, 2
  const weights = isChorus
    ? [0.15, 0.15, 0.35, 0.2, 0.15]  // Chorus: longer, more sustained
    : [0.25, 0.2, 0.35, 0.15, 0.05]; // Verse: more eighth notes

  const durationOptions = [0.5, 0.75, 1.0, 1.5, 2.0];
  const durations: number[] = [];

  for (let i = 0; i < numSyllables; i++) {
    const r = rng();
    let cumulative = 0;
    let chosen = 1.0;
    for (let j = 0; j < weights.length; j++) {
      cumulative += weights[j];
      if (r < cumulative) { chosen = durationOptions[j]; break; }
    }
    durations.push(chosen);
  }

  // Normalize to fit total beats
  const sum = durations.reduce((a, b) => a + b, 0);
  const scale = totalBeats / sum;
  return durations.map(d => Math.max(0.25, d * scale));
}

function generateRapRhythm(numSyllables: number, totalBeats: number, rng: () => number): number[] {
  // Rap: fast, mostly sixteenth/eighth notes with occasional longer holds
  const durations: number[] = [];
  for (let i = 0; i < numSyllables; i++) {
    const r = rng();
    durations.push(r < 0.5 ? 0.25 : r < 0.8 ? 0.5 : 0.75);
  }
  const sum = durations.reduce((a, b) => a + b, 0);
  const scale = totalBeats / sum;
  return durations.map(d => Math.max(0.15, d * scale));
}

// ===== Formant Data =====

const VOWEL_FORMANTS: Record<string, [number, number, number]> = {
  'a': [800, 1200, 2500],
  'e': [400, 2200, 2800],
  'i': [300, 2700, 3300],
  'o': [500, 900, 2500],
  'u': [350, 700, 2500],
  'y': [300, 2200, 3000],
};

const CONSONANT_TYPES: Record<string, 'plosive' | 'fricative' | 'nasal' | 'liquid' | 'silent'> = {
  'b': 'plosive', 'p': 'plosive', 'd': 'plosive', 't': 'plosive', 'g': 'plosive', 'k': 'plosive',
  'f': 'fricative', 'v': 'fricative', 's': 'fricative', 'z': 'fricative', 'h': 'fricative',
  'th': 'fricative', 'sh': 'fricative', 'ch': 'fricative',
  'm': 'nasal', 'n': 'nasal', 'ng': 'nasal',
  'l': 'liquid', 'r': 'liquid', 'w': 'liquid',
  ' ': 'silent',
};

// ===== Vocal Style Parameters =====

interface StyleParams {
  baseOctave: number;
  vibratoRate: number;
  vibratoDepth: number;
  breathiness: number;
  formantShift: number;
  attackTime: number;
  releaseTime: number;
  waveform: OscillatorType;
  harmonicRichness: number;
  pitchGlide: number; // portamento time in seconds between notes
}

function getStyleParams(style: VocalStyleType, intensity: number): StyleParams {
  const f = intensity / 10;
  switch (style) {
    case 'female_melodic':
      return { baseOctave: 4, vibratoRate: 5.5, vibratoDepth: 8 * f, breathiness: 0.3, formantShift: 1.15, attackTime: 0.03, releaseTime: 0.08, waveform: 'sine', harmonicRichness: 0.4, pitchGlide: 0.04 };
    case 'male_electronic':
      return { baseOctave: 3, vibratoRate: 4.5, vibratoDepth: 5 * f, breathiness: 0.15, formantShift: 0.9, attackTime: 0.02, releaseTime: 0.06, waveform: 'sawtooth', harmonicRichness: 0.6, pitchGlide: 0.03 };
    case 'robotic_vocoder':
      return { baseOctave: 3, vibratoRate: 0, vibratoDepth: 0, breathiness: 0.05, formantShift: 1.0, attackTime: 0.005, releaseTime: 0.01, waveform: 'square', harmonicRichness: 0.9, pitchGlide: 0 };
    case 'rap':
      return { baseOctave: 3, vibratoRate: 0, vibratoDepth: 0, breathiness: 0.25, formantShift: 0.95, attackTime: 0.008, releaseTime: 0.02, waveform: 'sawtooth', harmonicRichness: 0.5, pitchGlide: 0.01 };
    case 'choir':
      return { baseOctave: 4, vibratoRate: 5, vibratoDepth: 10 * f, breathiness: 0.2, formantShift: 1.0, attackTime: 0.08, releaseTime: 0.15, waveform: 'sine', harmonicRichness: 0.3, pitchGlide: 0.06 };
    case 'whisper':
      return { baseOctave: 4, vibratoRate: 0, vibratoDepth: 0, breathiness: 0.85, formantShift: 1.1, attackTime: 0.02, releaseTime: 0.05, waveform: 'sine', harmonicRichness: 0.1, pitchGlide: 0 };
    case 'melodic_singing':
    default:
      return { baseOctave: 4, vibratoRate: 5, vibratoDepth: 6 * f, breathiness: 0.2, formantShift: 1.0, attackTime: 0.025, releaseTime: 0.07, waveform: 'sine', harmonicRichness: 0.5, pitchGlide: 0.035 };
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
  const g = genres.join(' ').toLowerCase();
  if (g.includes('techno') || g.includes('industrial')) return 'robotic_vocoder';
  if (g.includes('trap') || g.includes('hip hop') || g.includes('rap')) return 'rap';
  if (g.includes('pop') || g.includes('r&b')) return 'female_melodic';
  if (g.includes('choir') || g.includes('gospel')) return 'choir';
  if (g.includes('ambient') || g.includes('lo-fi')) return 'whisper';
  if (g.includes('edm') || g.includes('house') || g.includes('electronic')) return 'male_electronic';
  return 'melodic_singing';
}

// ===== Lyrics Parser =====

interface LyricLine {
  text: string;
  section: string;
  syllables: string[];
}

function parseLyrics(lyrics: string): LyricLine[] {
  const lines: LyricLine[] = [];
  let currentSection = 'verse';

  for (const raw of lyrics.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const sectionMatch = line.match(/^\[?(verse|chorus|bridge|intro|outro|hook|pre-chorus|post-chorus)\s*\d*\]?$/i);
    if (sectionMatch) { currentSection = sectionMatch[1].toLowerCase(); continue; }
    const implicitSection = line.match(/^(verse|chorus|bridge|intro|outro|hook)\s*\d*$/i);
    if (implicitSection) { currentSection = implicitSection[1].toLowerCase(); continue; }

    const syllables = lineToSyllables(line);
    if (syllables.length > 0) {
      lines.push({ text: line, section: currentSection, syllables });
    }
  }
  return lines;
}

// ===== Align Lyrics to Song Structure =====

function alignLyricsToStructure(
  lyricLines: LyricLine[],
  structure: SectionPlan[],
  _durationSeconds: number,
): VocalSegment[] {
  const segments: VocalSegment[] = [];

  const sectionTimeline: { name: string; start: number; end: number; energy: number }[] = [];
  let t = 0;
  for (const section of structure) {
    sectionTimeline.push({ name: section.name.toLowerCase(), start: t, end: t + section.duration, energy: section.energy });
    t += section.duration;
  }

  // Only place vocals in vocal-appropriate sections
  const vocalSections = sectionTimeline.filter(s =>
    !s.name.includes('intro') && !s.name.includes('outro') && !s.name.includes('break')
  );

  if (vocalSections.length === 0 || lyricLines.length === 0) return segments;

  let lineIdx = 0;
  for (const section of vocalSections) {
    if (lineIdx >= lyricLines.length) break;

    const matchingLines: LyricLine[] = [];
    const maxLines = Math.max(2, Math.floor((section.end - section.start) / 3));
    while (lineIdx < lyricLines.length && matchingLines.length < maxLines) {
      matchingLines.push(lyricLines[lineIdx]);
      lineIdx++;
    }
    if (matchingLines.length === 0) continue;

    const margin = 0.5;
    const sectionDur = (section.end - section.start) - margin * 2;
    const lineSpacing = sectionDur / matchingLines.length;

    for (let i = 0; i < matchingLines.length; i++) {
      const startTime = section.start + margin + i * lineSpacing;
      const endTime = Math.min(startTime + lineSpacing * 0.85, section.end - 0.1);
      segments.push({
        text: matchingLines[i].text,
        sectionName: section.name,
        startTime,
        endTime,
        energy: section.energy,
      });
    }
  }

  // Wrap leftover lines back into sections
  if (lineIdx < lyricLines.length && vocalSections.length > 0) {
    let sIdx = 0;
    while (lineIdx < lyricLines.length) {
      const section = vocalSections[sIdx % vocalSections.length];
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

// ===== Render a Sung Syllable =====

function renderSungSyllable(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  syllable: string,
  startTime: number,
  duration: number,
  frequency: number,
  prevFreq: number | null,
  volume: number,
  style: StyleParams,
  rng: () => number,
) {
  if (duration <= 0.01) return;

  // Extract dominant vowel for formant
  const lower = syllable.toLowerCase().replace(/[^a-z]/g, '');
  let vowelFormant: [number, number, number] = VOWEL_FORMANTS['a']; // default
  let consonantPrefix = '';
  let vowelFound = false;
  for (let i = 0; i < lower.length; i++) {
    if (VOWEL_FORMANTS[lower[i]]) {
      vowelFormant = VOWEL_FORMANTS[lower[i]];
      consonantPrefix = lower.slice(0, i);
      vowelFound = true;
      break;
    }
  }
  if (!vowelFound) consonantPrefix = lower;

  const consonantDur = Math.min(0.04 * consonantPrefix.length, duration * 0.2);
  const vowelStart = startTime + consonantDur;
  const vowelDur = duration - consonantDur;

  // === Consonant attack ===
  if (consonantDur > 0.005) {
    const bufSize = Math.ceil(ctx.sampleRate * consonantDur);
    if (bufSize > 0) {
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (rng() * 2 - 1);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 2000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume * 0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + consonantDur);
      src.connect(filter).connect(gain).connect(dest);
      src.start(startTime);
      src.stop(startTime + consonantDur + 0.01);
    }
  }

  // === Pitched vowel (sung note) ===
  if (vowelDur < 0.02) return;

  const osc = ctx.createOscillator();
  osc.type = style.waveform;

  // Pitch glide from previous note (portamento)
  if (prevFreq && style.pitchGlide > 0) {
    osc.frequency.setValueAtTime(prevFreq, vowelStart);
    osc.frequency.exponentialRampToValueAtTime(frequency, vowelStart + Math.min(style.pitchGlide, vowelDur * 0.3));
  } else {
    osc.frequency.setValueAtTime(frequency, vowelStart);
  }

  // Vibrato LFO
  if (style.vibratoRate > 0 && style.vibratoDepth > 0) {
    const vibLfo = ctx.createOscillator();
    const vibGain = ctx.createGain();
    vibLfo.frequency.value = style.vibratoRate;
    vibGain.gain.value = style.vibratoDepth;
    vibLfo.connect(vibGain).connect(osc.frequency);
    // Delay vibrato onset to mimic natural singing
    vibGain.gain.setValueAtTime(0, vowelStart);
    vibGain.gain.linearRampToValueAtTime(style.vibratoDepth, vowelStart + Math.min(vowelDur * 0.3, 0.15));
    vibLfo.start(vowelStart);
    vibLfo.stop(vowelStart + vowelDur + 0.01);
  }

  // Formant filters (3-band parallel)
  const formants = vowelFormant.map(f => f * style.formantShift);

  for (let fi = 0; fi < 3; fi++) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = formants[fi];
    filter.Q.value = fi === 0 ? 8 : fi === 1 ? 10 : 12;

    const fGain = ctx.createGain();
    const fLevel = (fi === 0 ? 1.0 : fi === 1 ? 0.7 : 0.4) * volume;

    // ADSR envelope per formant
    fGain.gain.setValueAtTime(0.001, vowelStart);
    fGain.gain.linearRampToValueAtTime(fLevel, vowelStart + style.attackTime);
    fGain.gain.setValueAtTime(fLevel * 0.9, vowelStart + vowelDur - style.releaseTime);
    fGain.gain.linearRampToValueAtTime(0.001, vowelStart + vowelDur);

    osc.connect(filter).connect(fGain).connect(dest);
  }

  // Harmonics for richer timbre
  if (style.harmonicRichness > 0.2) {
    const harm = ctx.createOscillator();
    harm.type = 'sawtooth';
    harm.frequency.value = frequency;
    if (prevFreq && style.pitchGlide > 0) {
      harm.frequency.setValueAtTime(prevFreq, vowelStart);
      harm.frequency.exponentialRampToValueAtTime(frequency, vowelStart + Math.min(style.pitchGlide, vowelDur * 0.3));
    }
    const harmGain = ctx.createGain();
    harmGain.gain.setValueAtTime(volume * style.harmonicRichness * 0.12, vowelStart);
    harmGain.gain.exponentialRampToValueAtTime(0.001, vowelStart + vowelDur);
    const harmFilter = ctx.createBiquadFilter();
    harmFilter.type = 'lowpass';
    harmFilter.frequency.value = formants[1];
    harm.connect(harmFilter).connect(harmGain).connect(dest);
    harm.start(vowelStart);
    harm.stop(vowelStart + vowelDur + 0.01);
  }

  // Breathiness (filtered noise)
  if (style.breathiness > 0.1) {
    const bufSize = Math.ceil(ctx.sampleRate * vowelDur);
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
      noiseGain.gain.setValueAtTime(style.breathiness * volume * 0.4, vowelStart);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, vowelStart + vowelDur);
      noiseSrc.connect(noiseFilter).connect(noiseGain).connect(dest);
      noiseSrc.start(vowelStart);
      noiseSrc.stop(vowelStart + vowelDur + 0.01);
    }
  }

  osc.start(vowelStart);
  osc.stop(vowelStart + vowelDur + 0.01);
}

// ===== Render Full Vocal Line (syllables mapped to melody) =====

function renderVocalLine(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  segment: VocalSegment,
  melody: MelodyNote[],
  syllables: string[],
  style: StyleParams,
  tempo: number,
  rng: () => number,
) {
  const lineDuration = segment.endTime - segment.startTime;
  if (lineDuration <= 0) return;

  const beatDuration = 60 / tempo;
  const volume = 0.3 * (segment.energy * 0.5 + 0.5);
  let time = segment.startTime;
  let prevFreq: number | null = null;

  const count = Math.min(syllables.length, melody.length);
  for (let i = 0; i < count; i++) {
    const note = melody[i];
    const sylDuration = note.durationBeats * beatDuration;
    const endTime = Math.min(time + sylDuration, segment.endTime);
    const actualDur = endTime - time;

    if (actualDur > 0.02) {
      renderSungSyllable(ctx, dest, syllables[i], time, actualDur, note.frequency, prevFreq, volume, style, rng);
      prevFreq = note.frequency;
    }

    time = endTime;
    if (time >= segment.endTime) break;
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

  // HPF: cut below 120Hz
  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = 120;
  hpf.Q.value = 0.7;
  current.connect(hpf);
  current = hpf;

  // Presence boost 3kHz
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 3000;
  presence.gain.value = 3;
  presence.Q.value = 1.5;
  current.connect(presence);
  current = presence;

  // Compression
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.knee.value = 6;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.1;
  current.connect(comp);
  current = comp;

  const genreStr = genres.join(' ').toLowerCase();
  const effectSet = new Set(effects.map(e => e.toLowerCase()));

  // Vocoder
  if (effectSet.has('vocoder') || genreStr.includes('techno') || genreStr.includes('industrial')) {
    const vocoderFilter = ctx.createBiquadFilter();
    vocoderFilter.type = 'bandpass';
    vocoderFilter.frequency.value = 1500;
    vocoderFilter.Q.value = 15;
    current.connect(vocoderFilter);
    current = vocoderFilter;
  }

  // Reverb (delay-based approximation)
  if (effectSet.has('reverb') || genreStr.includes('pop') || genreStr.includes('ambient')) {
    const reverbDelay = ctx.createDelay(0.5);
    reverbDelay.delayTime.value = 0.03;
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.2;
    const reverbFilter = ctx.createBiquadFilter();
    reverbFilter.type = 'lowpass';
    reverbFilter.frequency.value = 4000;
    current.connect(reverbDelay).connect(reverbFilter).connect(reverbGain).connect(dest);
  }

  // Delay
  if (effectSet.has('delay') || genreStr.includes('techno') || genreStr.includes('dub')) {
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.375;
    const delayGain = ctx.createGain();
    delayGain.gain.value = 0.15;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    current.connect(delay).connect(feedback).connect(delay);
    delay.connect(delayGain).connect(dest);
  }

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

// ===== Main Generation Function =====

export async function generateVocals(
  config: VocalConfig,
  onProgress: (p: VocalProgress) => void,
  rng: () => number,
): Promise<AudioBuffer | null> {
  const { lyrics, tempo, key, scale, structure, durationSeconds, vocalStyle, vocalIntensity, vocalEffects, genres } = config;

  if (!lyrics || lyrics.trim().length === 0) return null;

  onProgress({ stage: 'parsing', progress: 0 });

  // 1. Parse lyrics into syllable-segmented lines
  const lyricLines = parseLyrics(lyrics);
  if (lyricLines.length === 0) return null;

  onProgress({ stage: 'parsing', progress: 0.15 });

  // 2. Align lyrics to song structure
  const vocalSegments = alignLyricsToStructure(lyricLines, structure, durationSeconds);
  if (vocalSegments.length === 0) return null;

  onProgress({ stage: 'aligning', progress: 0.2 });

  // 3. Build scale & style
  const styleParams = getStyleParams(vocalStyle, vocalIntensity);
  const { root, scale: parsedScale } = parseKey(`${key} ${scale}`);
  const scaleMidi = getScaleMidi(root, parsedScale, styleParams.baseOctave, 12);

  // 4. Generate melody for each line
  onProgress({ stage: 'melody', progress: 0.25 });

  const lineMelodies: MelodyNote[][] = [];
  for (let i = 0; i < vocalSegments.length; i++) {
    const seg = vocalSegments[i];
    const line = lyricLines.find(l => l.text === seg.text) || { text: seg.text, section: seg.sectionName, syllables: lineToSyllables(seg.text) };
    const melody = generateLineMelody(
      line.syllables.length,
      scaleMidi,
      seg.energy,
      seg.sectionName,
      tempo,
      seg.endTime - seg.startTime,
      rng,
      vocalStyle,
    );
    lineMelodies.push(melody);
  }

  onProgress({ stage: 'melody', progress: 0.35 });

  // 5. Render vocals
  onProgress({ stage: 'generating', progress: 0.4 });

  const sampleRate = INTERNAL_SAMPLE_RATE;
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * durationSeconds), sampleRate);

  const vocalBus = ctx.createGain();
  vocalBus.gain.value = 0.65;

  const effectsBus = ctx.createGain();
  effectsBus.gain.value = 1.0;
  applyVocalEffects(ctx, vocalBus, effectsBus, vocalEffects, genres);
  effectsBus.connect(ctx.destination);

  for (let i = 0; i < vocalSegments.length; i++) {
    const seg = vocalSegments[i];
    const melody = lineMelodies[i];
    const line = lyricLines.find(l => l.text === seg.text) || { text: seg.text, section: seg.sectionName, syllables: lineToSyllables(seg.text) };

    const startTime = Math.max(0, seg.startTime);
    const endTime = Math.min(durationSeconds, seg.endTime);

    if (endTime > startTime && melody.length > 0) {
      renderVocalLine(ctx, vocalBus, { ...seg, startTime, endTime }, melody, line.syllables, styleParams, tempo, rng);
    }

    const genProgress = 0.4 + (i / vocalSegments.length) * 0.5;
    onProgress({ stage: 'generating', progress: genProgress });

    if (i % 4 === 0) await sleep(5);
  }

  onProgress({ stage: 'mixing', progress: 0.92 });

  const vocalBuffer = await ctx.startRendering();

  onProgress({ stage: 'mixing', progress: 1.0 });

  return vocalBuffer;
}

// ===== Mix Vocals into Instrumental =====

export function mixVocalsIntoInstrumental(
  instrumental: AudioBuffer,
  vocals: AudioBuffer,
  vocalLevel: number = 0.7,
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
      const vocal = i < vocalSamples ? vocalData[i] * vocalLevel : 0;
      const vocalPresence = Math.abs(vocal) > 0.01 ? 1 : 0;
      const instDuck = 1 - vocalPresence * 0.15;
      mixData[i] = inst * instDuck + vocal;
    }
  }

  return mixed;
}

// ===== Auto-generate Lyrics from Prompt =====

export function generateDefaultLyrics(prompt: string, genres: string[], mood: string, structure: SectionPlan[]): string {
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
