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

import { applyGain, measurePeak, midiToFreq, getScaleMidi, normalizeAudio, parseKey, INTERNAL_SAMPLE_RATE } from './audio-utils';
import type { SectionPlan } from './music-engine';

import { synthesizeVocals, getVocalRoutingStatus } from './inference/vocal-engine';
import { CreativeContext } from '@/types/creative-context';

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
  language?: string;
}

export type VocalStyleType =
  | 'male_electronic' | 'female_melodic' | 'robotic_vocoder'
  | 'rap' | 'choir' | 'whisper' | 'melodic_singing' | 'spoken_word';

export interface VocalSegment {
  text: string;
  sectionName: string;
  startTime: number;
  endTime: number;
  energy: number;
  language: string;
}

export interface LyricCue {
  text: string;
  sectionName: string;
  startTime: number;
  endTime: number;
  language: string;
}

interface LyricTimingSyllable {
  text: string;
  startTime: number;
  endTime: number;
}

interface LyricTimingLine extends VocalSegment {
  syllables: string[];
  syllableTimings: LyricTimingSyllable[];
}

interface LyricTimingMap {
  lines: LyricTimingLine[];
}

interface LyricTimingOptions {
  tempo: number;
  vocalStyle: VocalStyleType;
  vocalIntensity: number;
  language?: string;
}

interface DefaultLyricOptions extends LyricTimingOptions {
  durationSeconds: number;
  language?: string;
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
  const isRap = style === 'rap' || style === 'spoken_word';

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

const LANGUAGE_VOWEL_MODS: Record<string, Record<string, [number, number, number]>> = {
  'punjabi': {
    'a': [850, 1150, 2400], // Deeper, more open
    'u': [380, 720, 2400],
  },
  'french': {
    'e': [450, 2100, 2700], // More nasal/closed
    'u': [320, 1600, 2300], // Fronted 'u'
  },
  'spanish': {
    'a': [750, 1300, 2500],
    'e': [450, 1900, 2600],
  },
  'hindi': {
    'a': [820, 1180, 2450],
    'i': [320, 2600, 3200],
  },
  'korean': {
    'o': [480, 850, 2400],
    'e': [420, 2150, 2750],
  },
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
    case 'spoken_word':
      return { baseOctave: 3, vibratoRate: 0, vibratoDepth: 0, breathiness: 0.18, formantShift: 0.98, attackTime: 0.01, releaseTime: 0.025, waveform: 'triangle', harmonicRichness: 0.42, pitchGlide: 0.008 };
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
    if (lower.includes('spoken') || lower.includes('word')) return 'spoken_word';
    if (lower.includes('choir')) return 'choir';
    if (lower.includes('whisper')) return 'whisper';
    if (lower.includes('melodic') || lower.includes('singing')) return 'melodic_singing';
  }
  const g = genres.join(' ').toLowerCase();
  if (g.includes('techno') || g.includes('industrial')) return 'robotic_vocoder';
  if (g.includes('trap') || g.includes('hip hop') || g.includes('rap')) return 'rap';
  if (g.includes('spoken word') || g.includes('poetry')) return 'spoken_word';
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
  explicitStartTime?: number;
  language: string;
}

function parseLyrics(lyrics: string): LyricLine[] {
  const lines: LyricLine[] = [];
  let currentSection = 'verse';
  let currentLanguage = 'english';

  for (const raw of lyrics.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    // Detect section or language tags: [Chorus] or [Spanish]
    // Require brackets to distinguish from song text
    const tagMatch = line.match(/^\[(verse|chorus|bridge|intro|outro|hook|pre-chorus|post-chorus|drop|break|instrumental break|punjabi|spanish|hindi|french|yoruba|korean|english)\s*\d*\]$/i);
    if (tagMatch) {
      const tag = tagMatch[1].toLowerCase();
      const languages = ['punjabi', 'spanish', 'hindi', 'french', 'yoruba', 'korean', 'english'];
      if (languages.includes(tag)) {
        currentLanguage = tag;
      } else {
        currentSection = tag;
      }
      continue;
    }

    // Check for [MM:SS] timestamp
    let explicitStartTime: number | undefined;
    const timeMatch = line.match(/^\[(\d{2}):(\d{2})\]\s*(.*)$/);
    let textToProcess = line;

    if (timeMatch) {
      const minutes = parseInt(timeMatch[1], 10);
      const seconds = parseInt(timeMatch[2], 10);
      explicitStartTime = (minutes * 60) + seconds;
      textToProcess = timeMatch[3];
    }

    // Inline language override: "Hola [Spanish]"
    let lineLanguage = currentLanguage;
    const inlineLangMatch = textToProcess.match(/\[(punjabi|spanish|hindi|french|yoruba|korean|english)\]/i);
    if (inlineLangMatch) {
      lineLanguage = inlineLangMatch[1].toLowerCase();
      textToProcess = textToProcess.replace(inlineLangMatch[0], '').trim();
    }

    const syllables = lineToSyllables(textToProcess);
    if (syllables.length > 0) {
      lines.push({ text: textToProcess, section: currentSection, syllables, explicitStartTime, language: lineLanguage });
    }
  }
  return lines;
}

// ===== Lyric Timing Planning =====

function normalizeSectionName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('pre')) return 'pre-chorus';
  if (lower.includes('post')) return 'post-chorus';
  if (lower.includes('chorus')) return 'chorus';
  if (lower.includes('hook')) return 'hook';
  if (lower.includes('verse')) return 'verse';
  if (lower.includes('bridge')) return 'bridge';
  if (lower.includes('drop')) return 'drop';
  if (lower.includes('intro')) return 'intro';
  if (lower.includes('outro')) return 'outro';
  if (lower.includes('break')) return 'break';
  return lower;
}

function buildSectionTimeline(structure: SectionPlan[]) {
  const timeline: { name: string; normalizedName: string; start: number; end: number; duration: number; energy: number }[] = [];
  let time = 0;
  for (const section of structure) {
    const normalizedName = normalizeSectionName(section.name);
    timeline.push({
      name: section.name,
      normalizedName,
      start: time,
      end: time + section.duration,
      duration: section.duration,
      energy: section.energy,
    });
    time += section.duration;
  }
  return timeline;
}

function isVocalSection(name: string): boolean {
  return !['intro', 'outro', 'break'].includes(normalizeSectionName(name));
}

function getSyllablePacing(style: VocalStyleType, intensity: number) {
  const intensityFactor = Math.max(0.8, Math.min(1.25, 0.9 + intensity / 20));
  switch (style) {
    case 'rap':
      return { min: Math.round(12 * intensityFactor), max: Math.round(16 * intensityFactor), preferredLineBars: 2, silenceRatio: 0.1 };
    case 'spoken_word':
      return { min: 8, max: 12, preferredLineBars: 2, silenceRatio: 0.14 };
    case 'whisper':
      return { min: 4, max: 6, preferredLineBars: 2, silenceRatio: 0.25 };
    case 'robotic_vocoder':
      return { min: 6, max: 9, preferredLineBars: 2, silenceRatio: 0.16 };
    case 'choir':
      return { min: 5, max: 8, preferredLineBars: 4, silenceRatio: 0.22 };
    case 'male_electronic':
      return { min: 6, max: 10, preferredLineBars: 2, silenceRatio: 0.14 };
    case 'female_melodic':
    case 'melodic_singing':
    default:
      return { min: 6, max: 10, preferredLineBars: 2, silenceRatio: 0.18 };
  }
}

function estimateSectionBars(durationSeconds: number, tempo: number) {
  const secondsPerBar = (60 / tempo) * 4;
  return Math.max(1, Math.round(durationSeconds / secondsPerBar));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distributeEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function allocateWeightedDurations(totalDuration: number, weights: number[], minimum = 0.12): number[] {
  if (weights.length === 0) return [];
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || weights.length;
  const durations = weights.map((weight) => Math.max(minimum, (weight / totalWeight) * totalDuration));
  const currentTotal = durations.reduce((sum, value) => sum + value, 0);
  if (currentTotal === 0) return Array(weights.length).fill(totalDuration / weights.length);
  const scale = totalDuration / currentTotal;
  return durations.map((value) => value * scale);
}

function fitLineToSyllableTarget(base: string, targetSyllables: number, fillerWords: string[]): string {
  const tokens = base.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return base;
  let current = tokens.join(' ');
  let syllableCount = lineToSyllables(current).length;
  let fillerIndex = 0;

  while (syllableCount < targetSyllables - 1 && fillerIndex < fillerWords.length * 2) {
    current += ` ${fillerWords[fillerIndex % fillerWords.length]}`;
    fillerIndex++;
    syllableCount = lineToSyllables(current).length;
  }

  while (syllableCount > targetSyllables + 1 && current.includes(' ')) {
    current = current.split(' ').slice(0, -1).join(' ');
    syllableCount = lineToSyllables(current).length;
  }

  return current;
}

interface CulturalContext {
  primaryLanguage: string;
  secondaryLanguage?: string;
  region?: string;
  tradition?: string;
  artistInspirations: string[];
}

interface LanguageDistribution {
  primaryWeight: number; // 0.7 - 0.85
  secondaryWeight: number; // 0.1 - 0.25
  adLibWeight: number; // 0.05 - 0.1
}

function detectCulturalContext(prompt: string, genres: string[]): CulturalContext {
  const lower = prompt.toLowerCase();
  const allContext = [...genres.map(g => g.toLowerCase()), lower].join(' ');

  let primary = 'english';
  let secondary: string | undefined;
  let region: string | undefined;
  let tradition: string | undefined;

  // Language & Region Detection
  if (allContext.includes('punjabi') || allContext.includes('bhangra') || allContext.includes('punjab')) {
    primary = 'punjabi';
    secondary = 'english';
    region = 'punjab';
  } else if (allContext.includes('spanish') || allContext.includes('latin') || allContext.includes('reggaeton') || allContext.includes('espanol')) {
    primary = 'spanish';
    secondary = 'english';
    region = 'latin america';
  } else if (allContext.includes('hindi') || allContext.includes('bollywood') || allContext.includes('indian')) {
    primary = 'hindi';
    secondary = 'english';
    region = 'india';
  } else if (allContext.includes('french') || allContext.includes('paris') || allContext.includes('france')) {
    primary = 'french';
    secondary = 'english';
    region = 'france';
  } else if (allContext.includes('afro') || allContext.includes('nigeria') || allContext.includes('yoruba')) {
    primary = 'english';
    secondary = 'yoruba';
    region = 'west africa';
  } else if (allContext.includes('k-pop') || allContext.includes('korean') || allContext.includes('seoul')) {
    primary = 'korean';
    secondary = 'english';
    region = 'south korea';
  }

  return {
    primaryLanguage: primary,
    secondaryLanguage: secondary,
    region,
    tradition,
    artistInspirations: [], // Could be parsed further if needed
  };
}

function calculateLanguageDistribution(genres: string[], context: CulturalContext): LanguageDistribution {
  const genreStr = genres.join(' ').toLowerCase();

  // Default distribution
  let dist: LanguageDistribution = {
    primaryWeight: 0.8,
    secondaryWeight: 0.15,
    adLibWeight: 0.05
  };

  if (genreStr.includes('rap') || genreStr.includes('drill') || genreStr.includes('trap')) {
    dist.primaryWeight = 0.75;
    dist.secondaryWeight = 0.2;
  } else if (genreStr.includes('pop') || genreStr.includes('dance')) {
    dist.primaryWeight = 0.85;
    dist.secondaryWeight = 0.1;
  }

  return dist;
}

function detectLanguage(language?: string) {
  const lower = (language || 'english').toLowerCase();
  if (lower.includes('spanish') || lower.includes('espanol')) return 'spanish';
  if (lower.includes('hindi')) return 'hindi';
  if (lower.includes('punjabi')) return 'punjabi';
  if (lower.includes('french')) return 'french';
  if (lower.includes('korean')) return 'korean';
  if (lower.includes('yoruba')) return 'yoruba';
  return 'english';
}

function sanitizePromptWords(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 12);
}

function buildHookSeed(prompt: string, mood: string, genres: string[], language: string) {
  const promptWords = sanitizePromptWords(prompt);
  const detectedLanguage = detectLanguage(language);
  const promptLead = promptWords.slice(0, 4).join(' ');

  if (detectedLanguage === 'spanish') {
    return promptLead || `${mood || 'fuego'} en la noche`;
  }
  if (detectedLanguage === 'hindi') {
    return promptLead || `${mood || 'raat'} ki dhadkan`;
  }
  if (detectedLanguage === 'punjabi') {
    return promptLead || `${mood || 'shaan'} vakhri`;
  }
  if (detectedLanguage === 'french') {
    return promptLead || `${mood || 'danse'} sous la pluie`;
  }
  if (detectedLanguage === 'yoruba') {
    return promptLead || `${mood || 'ayo'} ninu orin`;
  }
  if (detectedLanguage === 'korean') {
    return promptLead || `${mood || 'nolae'}leul bulleo`;
  }
  return promptLead || `${mood || genres[0] || 'midnight'} in motion`;
}

function buildLanguageLexicon(language?: string) {
  const detectedLanguage = detectLanguage(language);
  if (detectedLanguage === 'spanish') {
    return {
      fillers: ['ahora', 'todavia', 'siempre', 'despacio', 'encima', 'adentro'],
      verseOpeners: ['Cruzo la niebla', 'Sigo el pulso', 'Bajo la lluvia', 'Miro las luces'],
      chorusOpeners: ['Sube conmigo', 'No cae el fuego', 'Siente el ritmo', 'Gira la noche'],
      bridgeOpeners: ['Cambio la marea', 'Rompo el silencio', 'Toco el borde'],
      imagery: ['neon', 'humo', 'calle', 'mar', 'latido', 'sombra'],
    };
  }
  if (detectedLanguage === 'hindi') {
    return {
      fillers: ['abhi', 'phir', 'dhire', 'andar', 'upar', 'saath'],
      verseOpeners: ['Dhool mein chalun', 'Raat ko sunun', 'Shehar jagta hai', 'Dil ki sadak par'],
      chorusOpeners: ['Saath utho', 'Yeh dhadkan', 'Roshni bolo', 'Aaj ki raat'],
      bridgeOpeners: ['Saans rukti hai', 'Khamoshi tode', 'Pal badalta hai'],
      imagery: ['raat', 'shehar', 'saans', 'dhadkan', 'roshni', 'dhuaan'],
    };
  }
  if (detectedLanguage === 'punjabi') {
    return {
      fillers: ['aithe', 'uthe', 'hor', 'vi', 'saddi', 'gall'],
      verseOpeners: ['Sadda vakhra style', 'Pind diyan raahan', 'Dil vich zor', 'Sheran wargi tor'],
      chorusOpeners: ['Sadda haq aithe rakh', 'Duniya hila do', 'Bhangra pao', 'Dil sacha'],
      bridgeOpeners: ['Rasta saaf hai', 'Manzil door nahi', 'Yaaran de naal'],
      imagery: ['sher', 'pind', 'shaan', 'zor', 'darru', 'bhagra'],
    };
  }
  if (detectedLanguage === 'french') {
    return {
      fillers: ['encore', 'toujours', 'enfin', 'peut-être', 'ici', 'là'],
      verseOpeners: ['Dans la brume', 'Le silence tombe', 'Les ombres bougent', 'Rue déserte'],
      chorusOpeners: ['Bruite de la ville', 'Cœur de néon', 'Ciel d\'argent', 'Nous brillons'],
      bridgeOpeners: ['Le vent tourne', 'Le temps s\'arrête', 'Un nouveau jour'],
      imagery: ['nuit', 'ville', 'rêve', 'pluie', 'lumière', 'étoile'],
    };
  }
  if (detectedLanguage === 'yoruba') {
    return {
      fillers: ['pẹlu', 'bayi', 'titi', 'onikaluku', 'wa', 'ni'],
      verseOpeners: ['Orin titun ni', 'Ijo n bẹ nibẹ', 'Ọmọ Yoruba', 'Ilẹ̀ wa lẹwa'],
      chorusOpeners: ['Ẹ jẹ k’a jọ gbe', 'Irin ajo yi', 'Ibùkún Ọlọ́run', 'Ayo n bẹ'],
      bridgeOpeners: ['Agbára n bẹ', 'Irora dopin', 'Ìwájú l’ao lọ'],
      imagery: ['orin', 'ijo', 'ife', 'agbara', 'ayo', 'ibukun'],
    };
  }
  if (detectedLanguage === 'korean') {
    return {
      fillers: ['jigeum', 'dasi', 'hamkke', 'neomu', 'uri', 'geu'],
      verseOpeners: ['Seoul-ui bam', 'Heundeullinun bit', 'Gireul ilhneunda', 'Sumi chaonda'],
      chorusOpeners: ['Kkum-eul kkwoyo', 'Dalligo isseo', 'Uriui nolae', 'Saranghaeyo'],
      bridgeOpeners: ['Baram-i bul-eo', 'Meomchuji ma', 'Saeloun sijak'],
      imagery: ['bam', 'kkum', 'bit', 'sarang', 'achime', 'naneun'],
    };
  }
  return {
    fillers: ['tonight', 'inside', 'again', 'forever', 'slowly', 'higher'],
    verseOpeners: ['I chase the signal', 'Through the smoke', 'Under streetlight static', 'I feel the pressure'],
    chorusOpeners: ['Hold that fire', 'We stay alive', 'Hear the whole room', 'Feel this pull'],
    bridgeOpeners: ['Everything bends', 'Silence opens', 'The ceiling turns'],
    imagery: ['neon', 'echo', 'shadow', 'pulse', 'fever', 'tide'],
  };
}

function getStyleVoiceTokens(style: VocalStyleType) {
  switch (style) {
    case 'rap':
      return {
        verseClosers: ['hit hard', 'cut clean', 'talk sharp', 'run deep'],
        chorusClosers: ['bring it back', 'lock that in', 'stay on beat'],
      };
    case 'spoken_word':
      return {
        verseClosers: ['speak plain', 'hold weight', 'land slow', 'cut through'],
        chorusClosers: ['say it twice', 'stay in frame', 'hold that line'],
      };
    case 'whisper':
      return {
        verseClosers: ['fade slow', 'drift near', 'breathe low', 'stay soft'],
        chorusClosers: ['hold me near', 'float with me', 'stay in light'],
      };
    case 'robotic_vocoder':
      return {
        verseClosers: ['coded heat', 'chrome skin', 'signal bloom', 'wired light'],
        chorusClosers: ['pulse in sync', 'system glow', 'stay online'],
      };
    default:
      return {
        verseClosers: ['fall through', 'burn bright', 'keep close', 'move free'],
        chorusClosers: ['come alive', 'lift me up', 'bring me home'],
      };
  }
}

function buildSectionLineTargets(
  sectionName: string,
  sectionDuration: number,
  tempo: number,
  style: VocalStyleType,
  intensity: number,
) {
  const pacing = getSyllablePacing(style, intensity);
  const bars = estimateSectionBars(sectionDuration, tempo);
  const effectiveBars = Math.max(1, Math.floor(bars * (1 - pacing.silenceRatio)));
  const normalizedSection = normalizeSectionName(sectionName);
  const lineBars = normalizedSection === 'chorus' || normalizedSection === 'hook' || normalizedSection === 'drop'
    ? Math.max(1, pacing.preferredLineBars)
    : pacing.preferredLineBars;
  const lineCount = clamp(
    normalizedSection === 'bridge' ? Math.max(2, Math.round(effectiveBars / 2)) : Math.max(2, Math.round(effectiveBars / lineBars)),
    normalizedSection === 'chorus' || normalizedSection === 'hook' ? 2 : 1,
    normalizedSection === 'chorus' || normalizedSection === 'hook' ? 4 : 6,
  );
  const totalSyllables = clamp(
    Math.round(effectiveBars * ((pacing.min + pacing.max) / 2)),
    lineCount * pacing.min,
    lineCount * pacing.max,
  );
  return {
    bars,
    lineCount,
    syllablesPerLine: distributeEvenly(totalSyllables, lineCount).map((value) => clamp(value, pacing.min, pacing.max)),
  };
}

function buildSectionLine(
  sectionName: string,
  lineIndex: number,
  hookSeed: string,
  promptWords: string[],
  mood: string,
  lexicon: ReturnType<typeof buildLanguageLexicon>,
  styleTokens: ReturnType<typeof getStyleVoiceTokens>,
  genres: string[],
): string {
  const section = normalizeSectionName(sectionName);
  const detailWord = promptWords[lineIndex % Math.max(1, promptWords.length)] || lexicon.imagery[lineIndex % lexicon.imagery.length];
  const moodWord = mood || lexicon.imagery[(lineIndex + 1) % lexicon.imagery.length];
  const genreWord = genres[0]?.toLowerCase() || lexicon.imagery[(lineIndex + 2) % lexicon.imagery.length];

  if (section === 'chorus' || section === 'hook' || section === 'drop') {
    const opener = lexicon.chorusOpeners[lineIndex % lexicon.chorusOpeners.length];
    const closer = styleTokens.chorusClosers[lineIndex % styleTokens.chorusClosers.length];
    return `${opener} ${hookSeed} ${closer}`;
  }

  if (section === 'bridge') {
    const opener = lexicon.bridgeOpeners[lineIndex % lexicon.bridgeOpeners.length];
    return `${opener} through ${moodWord} ${detailWord}`;
  }

  if (section === 'intro' || section === 'outro') {
    return `${hookSeed} ${moodWord}`;
  }

  const opener = lexicon.verseOpeners[lineIndex % lexicon.verseOpeners.length];
  const closer = styleTokens.verseClosers[lineIndex % styleTokens.verseClosers.length];
  return `${opener} ${detailWord} in ${genreWord} ${closer}`;
}

function buildLyricTimingMap(
  lyricLines: LyricLine[],
  structure: SectionPlan[],
  durationSeconds: number,
  options: LyricTimingOptions,
): LyricTimingMap {
  const timeline = buildSectionTimeline(structure);
  const vocalSections = timeline.filter((section) => isVocalSection(section.normalizedName));
  if (vocalSections.length === 0 || lyricLines.length === 0) return { lines: [] };

  const plannedLines: LyricTimingLine[] = [];
  const secondsPerBar = (60 / options.tempo) * 4;

  let lineIdx = 0;

  for (const section of vocalSections) {
    const margin = Math.min(0.4, section.duration * 0.08);
    const usableStart = section.start + margin;
    const usableEnd = Math.min(durationSeconds, section.end - margin * 0.5);

    // Collect lines that belong to this section
    const sectionLines: LyricLine[] = [];
    while (lineIdx < lyricLines.length) {
      const line = lyricLines[lineIdx];
      // If it explicitly belongs here or is untagged but fits chronologically
      const fitsChronos = line.explicitStartTime !== undefined && line.explicitStartTime >= section.start && line.explicitStartTime < section.end;
      const fitsTag = normalizeSectionName(line.section) === section.normalizedName;

      if (fitsChronos || (fitsTag && line.explicitStartTime === undefined)) {
        sectionLines.push(line);
        lineIdx++;
      } else if (line.explicitStartTime !== undefined && line.explicitStartTime < section.start) {
        // Orphaned past line, skip
        lineIdx++;
      } else {
        break; // Reached next section's lines
      }
    }

    if (sectionLines.length === 0) continue;

    for (let index = 0; index < sectionLines.length; index++) {
      const line = sectionLines[index];

      // Calculate specific start and end for the line
      let lineStart = line.explicitStartTime !== undefined ? line.explicitStartTime : usableStart + (index * secondsPerBar);
      // Ensure we don't start before the section's usable window unless told to by explicit time
      if (line.explicitStartTime === undefined) {
        lineStart = Math.min(lineStart, usableEnd - 1);
      }

      // Next line's boundary or section end
      const nextLineStart = (index + 1 < sectionLines.length)
        ? (sectionLines[index + 1].explicitStartTime ?? lineStart + (secondsPerBar * 2))
        : usableEnd;

      let lineEnd = Math.min(usableEnd, nextLineStart);

      // Ensure minimum vocal duration
      if (lineEnd - lineStart < 0.25) {
        lineEnd = lineStart + Math.max(0.25, line.syllables.length * 0.2);
      }

      const lineDuration = lineEnd - lineStart;

      const syllableWeights = line.syllables.map((syllable, syllableIndex) => {
        const base = Math.max(1, syllable.replace(/[^a-z]/gi, '').length);
        if (options.vocalStyle === 'rap') return 1;
        if (options.vocalStyle === 'whisper') return base + 0.8;
        return syllableIndex === line.syllables.length - 1 ? base + 1.2 : base;
      });

      // Sub-allocate the line duration into individual syllables
      const syllableDurations = allocateWeightedDurations(lineDuration, syllableWeights, Math.min(lineDuration / Math.max(1, line.syllables.length * 2), 0.05));

      let syllableCursor = lineStart;
      const syllableTimings = line.syllables.map((syllable, syllableIndex) => {
        const syllableStart = syllableCursor;
        const syllableEnd = syllableIndex === line.syllables.length - 1 ? lineEnd : Math.min(lineEnd, syllableCursor + syllableDurations[syllableIndex]);
        syllableCursor = syllableEnd;
        return { text: syllable, startTime: syllableStart, endTime: syllableEnd };
      });

      plannedLines.push({
        text: line.text,
        sectionName: section.name,
        startTime: lineStart,
        endTime: lineEnd,
        energy: section.energy,
        language: line.language || options.language || 'english',
        syllables: line.syllables,
        syllableTimings,
      });
    }
  }

  return { lines: plannedLines };
}

function alignLyricsToStructure(
  lyricLines: LyricLine[],
  structure: SectionPlan[],
  durationSeconds: number,
  options: LyricTimingOptions,
): VocalSegment[] {
  return buildLyricTimingMap(lyricLines, structure, durationSeconds, options).lines.map((line) => ({
    text: line.text,
    sectionName: line.sectionName,
    startTime: line.startTime,
    endTime: line.endTime,
    energy: line.energy,
    language: line.language,
  }));
}

export function generateLyricCues(
  lyrics: string,
  structure: SectionPlan[],
  durationSeconds: number,
  options: LyricTimingOptions = {
    tempo: 120,
    vocalStyle: 'melodic_singing',
    vocalIntensity: 5,
  },
): LyricCue[] {
  const lyricLines = parseLyrics(lyrics);
  if (lyricLines.length === 0) return [];
  return buildLyricTimingMap(lyricLines, structure, durationSeconds, options).lines.map((line) => ({
    text: line.text,
    sectionName: line.sectionName,
    startTime: line.startTime,
    endTime: line.endTime,
    language: line.language,
  }));
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
  language: string = 'english',
) {
  if (duration <= 0.01) return;

  // Extract dominant vowel for formant
  const lower = syllable.toLowerCase().replace(/[^a-z]/g, '');
  let baseFormant: [number, number, number] = VOWEL_FORMANTS['a']; // default
  let consonantPrefix = '';
  let vowelChar = 'a';
  let vowelFound = false;

  for (let i = 0; i < lower.length; i++) {
    if (VOWEL_FORMANTS[lower[i]]) {
      baseFormant = VOWEL_FORMANTS[lower[i]];
      vowelChar = lower[i];
      consonantPrefix = lower.slice(0, i);
      vowelFound = true;
      break;
    }
  }
  if (!vowelFound) consonantPrefix = lower;

  // Apply language-specific mods
  let vowelFormant = [...baseFormant] as [number, number, number];
  const langMods = LANGUAGE_VOWEL_MODS[language.toLowerCase()];
  if (langMods && langMods[vowelChar]) {
    vowelFormant = langMods[vowelChar];
  }

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

  // Dry voiced body to keep the vocal stem audible before formant shaping.
  const bodyGain = ctx.createGain();
  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = 'lowpass';
  bodyFilter.frequency.value = Math.max(900, formants[1] * 1.25);
  bodyGain.gain.setValueAtTime(0.001, vowelStart);
  bodyGain.gain.linearRampToValueAtTime(volume * (0.22 + style.harmonicRichness * 0.18), vowelStart + style.attackTime);
  bodyGain.gain.setValueAtTime(volume * 0.16, vowelStart + Math.max(style.attackTime, vowelDur - style.releaseTime));
  bodyGain.gain.linearRampToValueAtTime(0.001, vowelStart + vowelDur);
  osc.connect(bodyFilter).connect(bodyGain).connect(dest);

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
  segment: LyricTimingLine,
  melody: MelodyNote[],
  style: StyleParams,
  rng: () => number,
) {
  const lineDuration = segment.endTime - segment.startTime;
  if (lineDuration <= 0) return;

  const volume = 0.48 * (segment.energy * 0.55 + 0.45);
  let prevFreq: number | null = null;

  const count = Math.min(segment.syllables.length, melody.length, segment.syllableTimings.length);
  for (let i = 0; i < count; i++) {
    const note = melody[i];
    const syllableWindow = segment.syllableTimings[i];
    const startTime = Math.max(segment.startTime, syllableWindow.startTime);
    const endTime = Math.min(segment.endTime, syllableWindow.endTime);
    const actualDur = endTime - startTime;

    if (actualDur > 0.02) {
      renderSungSyllable(ctx, dest, segment.syllables[i], startTime, actualDur, note.frequency, prevFreq, volume, style, rng, segment.language);
      prevFreq = note.frequency;
    }
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
  const { lyrics, tempo, key, scale, structure, durationSeconds, vocalStyle, vocalIntensity, vocalEffects, genres, language } = config;

  // v2: Dual-path routing check
  const context: CreativeContext = {
    genre: genres[0] || 'Pop',
    mood: config.mood || 'Neutral',
    vocalLanguage: language || 'English',
    tempo: tempo,
    duration: durationSeconds,
    lyrics: lyrics,
    useHighQualityVocals: (config as any).useHighQualityVocals || false,
    songDescription: '',
    vocalStyle: vocalStyle
  };

  const routingStatus = getVocalRoutingStatus(context);
  console.log(`[VocalEngine V2] ${routingStatus}`);

  if (!lyrics || lyrics.trim().length === 0) return null;

  onProgress({ stage: 'parsing', progress: 0 });

  // 1. Parse lyrics into syllable-segmented lines
  const lyricLines = parseLyrics(lyrics);
  if (lyricLines.length === 0) return null;

  onProgress({ stage: 'parsing', progress: 0.15 });

  // 2. Align lyrics to song structure
  const lyricTimingMap = buildLyricTimingMap(lyricLines, structure, durationSeconds, {
    tempo,
    vocalStyle,
    vocalIntensity,
    language: config.language,
  });
  const vocalSegments = lyricTimingMap.lines;
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
    const melody = generateLineMelody(
      seg.syllables.length,
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
  vocalBus.gain.value = vocalStyle === 'whisper' ? 1.05 : 1.18;

  const dryBus = ctx.createGain();
  dryBus.gain.value = vocalStyle === 'robotic_vocoder' ? 0.48 : vocalStyle === 'whisper' ? 0.72 : 0.86;
  vocalBus.connect(dryBus);
  dryBus.connect(ctx.destination);

  const effectsBus = ctx.createGain();
  effectsBus.gain.value = vocalStyle === 'robotic_vocoder' ? 0.95 : 0.82;
  applyVocalEffects(ctx, vocalBus, effectsBus, vocalEffects, genres);
  effectsBus.connect(ctx.destination);

  for (let i = 0; i < vocalSegments.length; i++) {
    const seg = vocalSegments[i];
    const melody = lineMelodies[i];

    const startTime = Math.max(0, seg.startTime);
    const endTime = Math.min(durationSeconds, seg.endTime);

    if (endTime > startTime && melody.length > 0) {
      renderVocalLine(ctx, vocalBus, { ...seg, startTime, endTime }, melody, styleParams, rng);
    }

    const genProgress = 0.4 + (i / vocalSegments.length) * 0.5;
    onProgress({ stage: 'generating', progress: genProgress });

    if (i % 4 === 0) await sleep(5);
  }

  onProgress({ stage: 'mixing', progress: 0.92 });

  const vocalBuffer = await ctx.startRendering();

  const peak = measurePeak(vocalBuffer);
  if (peak <= 0.0005) {
    return null;
  }

  if (peak < 0.08) {
    normalizeAudio(vocalBuffer, 0.34);
  }

  const postNormalizePeak = measurePeak(vocalBuffer);
  if (postNormalizePeak < 0.18) {
    applyGain(vocalBuffer, Math.min(3.2, 0.24 / Math.max(postNormalizePeak, 0.001)));
  }

  onProgress({ stage: 'mixing', progress: 1.0 });

  return vocalBuffer;
}

// ===== Mix Vocals into Instrumental =====

export function mixVocalsIntoInstrumental(
  instrumental: AudioBuffer,
  vocals: AudioBuffer,
  vocalLevel: number = 1.08,
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
      const vocalPresence = Math.abs(vocal) > 0.0025 ? Math.min(1, Math.abs(vocal) * 10) : 0;
      const instDuck = 1 - vocalPresence * 0.34;
      mixData[i] = inst * instDuck + vocal;
    }
  }

  return mixed;
}

// ===== Auto-generate Lyrics from Prompt =====

export function generateDefaultLyrics(
  prompt: string,
  genres: string[],
  mood: string,
  structure: SectionPlan[],
  options?: Partial<DefaultLyricOptions>,
): string {
  return generateDefaultLyricsInternal(prompt, genres, mood, structure, {
    tempo: 120,
    durationSeconds: structure.reduce((sum, section) => sum + section.duration, 0),
    vocalStyle: 'melodic_singing',
    vocalIntensity: 5,
    ...options,
  });
}

function generateDefaultLyricsInternal(
  prompt: string,
  genres: string[],
  mood: string,
  structure: SectionPlan[],
  options: DefaultLyricOptions,
): string {
  const lines: string[] = [];

  // Detect Cultural Context
  const culturalContext = detectCulturalContext(prompt, genres);
  const distribution = calculateLanguageDistribution(genres, culturalContext);

  const primaryLang = options.language || culturalContext.primaryLanguage;
  const secondaryLang = culturalContext.secondaryLanguage || 'english';

  const hookSeed = buildHookSeed(prompt, mood, genres, primaryLang);
  const promptWords = sanitizePromptWords(prompt);

  const primaryLexicon = buildLanguageLexicon(primaryLang);
  const secondaryLexicon = buildLanguageLexicon(secondaryLang);

  const styleTokens = getStyleVoiceTokens(options.vocalStyle);
  const chorusMemory: string[] = [];

  // Bar Grid Calculation
  const beatsPerBar = 4;
  const bpm = options.tempo || 120;
  const secondsPerBeat = 60 / bpm;
  const secondsPerBar = secondsPerBeat * beatsPerBar;

  let currentGlobalTimeSeconds = 0;
  let previousHeader = '';
  let lastInjectedLanguage = '';

  for (const section of structure) {
    const isVocal = isVocalSection(section.name);
    const sectionBars = Math.max(1, Math.round(section.duration / secondsPerBar));

    if (!isVocal || sectionBars < 1) {
      currentGlobalTimeSeconds += section.duration;
      continue;
    }

    const sectionStartTime = currentGlobalTimeSeconds;
    const normalizedName = normalizeSectionName(section.name);
    const header = normalizedName.charAt(0).toUpperCase() + normalizedName.slice(1);

    if (header !== previousHeader || normalizedName === 'verse') {
      lines.push(`[${header}]`);
      previousHeader = header;
    }

    // Syllable Constraint Engine
    let targetSyllablesPerBar = 8;
    const isRap = options.vocalStyle === 'rap' || options.vocalStyle === 'spoken_word';
    const isAmbient = options.vocalStyle === 'whisper';

    if (isRap) {
      targetSyllablesPerBar = 14;
    } else if (isAmbient) {
      targetSyllablesPerBar = 5;
    } else {
      targetSyllablesPerBar = 8;
    }

    const stepsPerLine = isRap ? 1 : 2;

    for (let barIdx = 0; barIdx < sectionBars; barIdx += stepsPerLine) {
      const barsToUse = Math.min(stepsPerLine, sectionBars - barIdx);
      const syllablesTarget = targetSyllablesPerBar * barsToUse;
      const lineTimeSeconds = sectionStartTime + (barIdx * secondsPerBar);

      const minutes = Math.floor(lineTimeSeconds / 60);
      const seconds = Math.floor(lineTimeSeconds % 60);
      const timeStr = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;

      const memoryIdx = Math.floor(barIdx / stepsPerLine);

      // Determine language for this specific line based on distribution
      const roll = Math.random();
      let activeLang = primaryLang;
      let activeLexicon = primaryLexicon;

      if (roll > distribution.primaryWeight) {
        activeLang = secondaryLang;
        activeLexicon = secondaryLexicon;
      }

      // Inject language marker if it changed
      if (activeLang !== lastInjectedLanguage) {
        lines.push(`[${activeLang.charAt(0).toUpperCase() + activeLang.slice(1)}]`);
        lastInjectedLanguage = activeLang;
      }

      let baseLine: string;
      if ((normalizedName === 'chorus' || normalizedName === 'hook' || normalizedName === 'drop') && chorusMemory[memoryIdx]) {
        baseLine = (barIdx + stepsPerLine >= sectionBars)
          ? `${chorusMemory[memoryIdx]} ${activeLexicon.fillers[memoryIdx % activeLexicon.fillers.length]}`
          : chorusMemory[memoryIdx];
      } else {
        baseLine = buildSectionLine(normalizedName, memoryIdx, hookSeed, promptWords, mood, activeLexicon, styleTokens, genres);
        if (normalizedName === 'chorus' || normalizedName === 'hook' || normalizedName === 'drop') {
          chorusMemory[memoryIdx] = baseLine;
        }
      }

      let fittedLine = fitLineToSyllableTarget(baseLine, syllablesTarget, activeLexicon.fillers);

      // Final strict validation
      const currentSyllables = lineToSyllables(fittedLine).length;
      if (currentSyllables > syllablesTarget + 2) {
        const words = fittedLine.split(' ');
        while (words.length > 2 && lineToSyllables(words.join(' ')).length > syllablesTarget + 1) {
          words.pop();
        }
        fittedLine = words.join(' ');
      }

      lines.push(`${timeStr} ${fittedLine}`);
    }

    lines.push('');
    currentGlobalTimeSeconds += section.duration;
  }

  return lines.join('\n').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
