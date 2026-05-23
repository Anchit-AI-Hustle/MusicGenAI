/**
 * Melody, Chord & Hook Generator
 * 
 * Creates melodies, chord progressions, hooks, and pad voicings.
 * Supports motif-based generation with hook repetition and variation.
 * Automatically chooses tonal center, scale, and melodic style from context.
 */

import { getScaleMidi, midiToFreq } from './audio-utils';

export interface MelodyEvent {
  time: number;
  midi: number;
  duration: number;
  velocity: number;
}

export interface ChordEvent {
  time: number;
  midis: number[];
  duration: number;
  velocity: number;
}

// ===== Motif Engine =====

interface Motif {
  intervals: number[];  // scale degree offsets from root
  durations: number[];  // relative durations (1.0 = beat)
  velocities: number[]; // relative velocities
}

/**
 * Generate a core melodic motif (2-6 notes) that becomes the track identity.
 */
function generateMotif(rng: () => number, energy: number): Motif {
  const length = Math.floor(2 + rng() * 4 + energy * 2); // 2-6 notes
  const intervals: number[] = [0];
  const durations: number[] = [];
  const velocities: number[] = [];

  let current = 0;
  for (let i = 0; i < length; i++) {
    // Stepwise motion with occasional leap
    const leap = rng() < 0.2;
    const dir = rng() < 0.5 ? 1 : -1;
    const step = leap ? Math.floor(rng() * 3) + 2 : (rng() < 0.7 ? 1 : 0);
    current += dir * step;
    current = Math.max(-4, Math.min(8, current));
    if (i > 0) intervals.push(current);

    // Rhythm: mix of short and long
    const durChoice = rng();
    durations.push(durChoice < 0.3 ? 0.5 : durChoice < 0.7 ? 1.0 : 1.5);

    // Velocity: accents on certain beats
    velocities.push(i === 0 || (i === length - 1) ? 0.9 : 0.5 + rng() * 0.4);
  }

  return { intervals, durations, velocities };
}

/**
 * Apply variation to a motif (transposition, rhythmic shift, ornamentation).
 */
function varyMotif(motif: Motif, variationType: number, rng: () => number): Motif {
  const intervals = [...motif.intervals];
  const durations = [...motif.durations];
  const velocities = [...motif.velocities];

  switch (variationType % 5) {
    case 0: // Transpose up
      for (let i = 0; i < intervals.length; i++) intervals[i] += Math.floor(rng() * 3) + 1;
      break;
    case 1: // Transpose down
      for (let i = 0; i < intervals.length; i++) intervals[i] -= Math.floor(rng() * 2) + 1;
      break;
    case 2: // Rhythmic augmentation
      for (let i = 0; i < durations.length; i++) durations[i] *= (1.0 + rng() * 0.5);
      break;
    case 3: // Retrograde (reverse)
      intervals.reverse();
      break;
    case 4: // Ornamentation (add passing tones)
      if (intervals.length > 2) {
        const insertIdx = Math.floor(rng() * (intervals.length - 1)) + 1;
        const passingTone = Math.round((intervals[insertIdx - 1] + intervals[insertIdx]) / 2);
        intervals.splice(insertIdx, 0, passingTone);
        durations.splice(insertIdx, 0, 0.25);
        velocities.splice(insertIdx, 0, 0.4);
      }
      break;
  }

  return { intervals, durations, velocities };
}

/**
 * Render a motif as MelodyEvents at a given time position.
 */
function renderMotif(
  motif: Motif, notes: number[], startNote: number,
  startTime: number, beatDur: number, energy: number,
): MelodyEvent[] {
  const events: MelodyEvent[] = [];
  let t = startTime;

  for (let i = 0; i < motif.intervals.length; i++) {
    const noteIdx = Math.max(0, Math.min(notes.length - 1, startNote + motif.intervals[i]));
    const midi = notes[noteIdx];
    const dur = (motif.durations[i] || 1.0) * beatDur;
    const vel = (motif.velocities[i] || 0.6) * (0.3 + energy * 0.5);

    events.push({ time: t, midi, duration: dur * 0.85, velocity: vel });
    t += dur;
  }

  return events;
}

// ===== Hook Engine =====

/**
 * Generate a recognizable melodic hook that repeats in high-energy sections.
 * The hook is a catchy, short motif with strong rhythmic identity.
 */
function generateHook(rng: () => number): Motif {
  // Hooks are typically 3-4 notes with strong rhythm
  const length = 3 + Math.floor(rng() * 2);
  const intervals: number[] = [0];
  const durations: number[] = [];
  const velocities: number[] = [];

  // Hooks use larger intervals for memorability
  let current = 0;
  for (let i = 0; i < length; i++) {
    if (i > 0) {
      const jump = Math.floor(rng() * 4) + 1;
      current += (rng() < 0.5 ? 1 : -1) * jump;
      current = Math.max(-3, Math.min(7, current));
      intervals.push(current);
    }
    // Strong, punchy rhythm
    durations.push(rng() < 0.4 ? 0.75 : 1.0);
    velocities.push(0.8 + rng() * 0.2); // Hooks are loud
  }

  return { intervals, durations, velocities };
}

// ===== Main Melody Generator =====

/**
 * Generate a melody for a section with motif-based coherence and hook injection.
 */
export function generateMelody(
  root: string, scale: string, startTime: number, duration: number,
  beatDur: number, energy: number, style: 'lead' | 'arp' | 'riff' | 'ambient' | 'hook',
  rng: () => number,
  motif?: Motif,
  hook?: Motif,
): MelodyEvent[] {
  const events: MelodyEvent[] = [];
  const notes = getScaleMidi(root, scale, 4, 14);
  const sixteenth = beatDur / 4;
  let t = startTime;
  let noteIdx = Math.floor(rng() * 5) + 2;

  // Hook style: use the hook motif with variations
  if (style === 'hook' && hook) {
    let variationCount = 0;
    while (t < startTime + duration) {
      const currentHook = variationCount === 0 ? hook : varyMotif(hook, variationCount, rng);
      const hookEvents = renderMotif(currentHook, notes, noteIdx, t, beatDur, energy);
      events.push(...hookEvents);
      const hookDuration = currentHook.durations.reduce((a, b) => a + b, 0) * beatDur;
      t += hookDuration + beatDur * (0.5 + rng()); // gap between repetitions
      variationCount++;
      // Transpose hook slightly for variation
      noteIdx += rng() < 0.5 ? 1 : -1;
      noteIdx = Math.max(0, Math.min(notes.length - 3, noteIdx));
    }
    return events;
  }

  // Motif-based lead: weave the motif through the section
  if (style === 'lead' && motif) {
    let variationCount = 0;
    while (t < startTime + duration) {
      // Alternate between motif and free melody
      if (rng() < 0.6) {
        const currentMotif = variationCount === 0 ? motif : varyMotif(motif, variationCount, rng);
        const motifEvents = renderMotif(currentMotif, notes, noteIdx, t, beatDur, energy);
        events.push(...motifEvents);
        const motifDuration = currentMotif.durations.reduce((a, b) => a + b, 0) * beatDur;
        t += motifDuration;
        variationCount++;
      } else {
        // Free melodic passage
        const passageLen = Math.floor(2 + rng() * 4);
        for (let i = 0; i < passageLen && t < startTime + duration; i++) {
          const midi = notes[noteIdx % notes.length];
          const dur = sixteenth * (1 + rng() * 2);
          events.push({ time: t, midi, duration: dur, velocity: 0.35 + energy * 0.45 });
          const move = rng();
          if (move < 0.35) noteIdx += 1;
          else if (move < 0.55) noteIdx -= 1;
          else if (move < 0.7) noteIdx += 2;
          else if (move < 0.8) noteIdx -= 2;
          noteIdx = Math.max(0, Math.min(notes.length - 2, noteIdx));
          t += dur;
        }
      }
    }
    return events;
  }

  // Original styles (now as fallback or for non-motif sections)
  switch (style) {
    case 'lead': {
      const step = energy > 0.6 ? sixteenth : sixteenth * 2;
      while (t < startTime + duration) {
        if (rng() < 0.55 + energy * 0.3) {
          const midi = notes[noteIdx % notes.length];
          const dur = step * (0.5 + rng() * 1.0);
          events.push({ time: t, midi, duration: dur, velocity: 0.35 + energy * 0.45 });
        }
        const move = rng();
        if (move < 0.35) noteIdx += 1;
        else if (move < 0.55) noteIdx -= 1;
        else if (move < 0.7) noteIdx += 2;
        else if (move < 0.8) noteIdx -= 2;
        noteIdx = Math.max(0, Math.min(notes.length - 2, noteIdx));
        t += step;
      }
      break;
    }
    case 'arp': {
      const arpPatterns = [
        [0, 2, 4, 7], [0, 4, 7, 4], [0, 2, 4, 2],
        [0, 4, 7, 11], [0, 2, 7, 4],
      ];
      const pattern = arpPatterns[Math.floor(rng() * arpPatterns.length)];
      let patIdx = 0;
      const step = sixteenth;
      while (t < startTime + duration) {
        const degree = pattern[patIdx % pattern.length];
        const midi = notes[(noteIdx + degree) % notes.length];
        events.push({ time: t, midi, duration: step * 0.7, velocity: 0.3 + energy * 0.4 });
        patIdx++;
        if (patIdx % (pattern.length * 4) === 0 && rng() < 0.3) {
          noteIdx += rng() < 0.5 ? 1 : -1;
          noteIdx = Math.max(0, Math.min(notes.length - 2, noteIdx));
        }
        t += step;
      }
      break;
    }
    case 'riff': {
      const riffLen = Math.floor(2 + rng() * 3);
      const riffNotes: number[] = [];
      let idx = noteIdx;
      for (let i = 0; i < riffLen; i++) {
        riffNotes.push(notes[idx % notes.length]);
        idx += Math.floor(rng() * 3) - 1;
        if (idx < 0) idx = 0;
      }
      let riffIdx = 0;
      const step = energy > 0.6 ? sixteenth : sixteenth * 2;
      while (t < startTime + duration) {
        const midi = riffNotes[riffIdx % riffNotes.length];
        if (rng() < 0.8) {
          events.push({ time: t, midi, duration: step * 0.75, velocity: 0.4 + energy * 0.45 });
        }
        riffIdx++;
        t += step;
      }
      break;
    }
    case 'ambient': {
      while (t < startTime + duration) {
        const midi = notes[noteIdx % notes.length];
        const dur = beatDur * (2 + rng() * 6);
        events.push({ time: t, midi, duration: Math.min(dur, startTime + duration - t), velocity: 0.18 + energy * 0.25 });
        noteIdx += rng() < 0.5 ? 1 : -1;
        noteIdx = Math.max(0, Math.min(notes.length - 2, noteIdx));
        t += dur * (0.7 + rng() * 0.3);
      }
      break;
    }
  }

  return events;
}

/**
 * Generate chord events for a section with dynamic progressions.
 * Chord progressions are generated fresh each time, not from templates.
 */
export function generateChords(
  root: string, scale: string, startTime: number, duration: number,
  beatDur: number, energy: number, rng: () => number,
): ChordEvent[] {
  const events: ChordEvent[] = [];
  const notes = getScaleMidi(root, scale, 3, 12);

  const chordInterval = beatDur * (energy > 0.6 ? 4 : 8);
  let t = startTime;

  // Generate a unique chord progression using the random seed
  const progLength = 4 + Math.floor(rng() * 3); // 4-6 chords
  const progression: number[] = [0]; // start on root
  for (let i = 1; i < progLength; i++) {
    // Common movements: up by 3rd, 4th, 5th; down by 2nd, 3rd
    const moves = [1, 2, 3, 4, 5, -1, -2, -3];
    const move = moves[Math.floor(rng() * moves.length)];
    const prev = progression[progression.length - 1];
    let next = (prev + move) % 7;
    if (next < 0) next += 7;
    progression.push(next);
  }

  let progIdx = 0;

  while (t < startTime + duration) {
    const rootIdx = progression[progIdx % progression.length];
    const dur = Math.min(chordInterval, startTime + duration - t);
    if (dur > 0.5) {
      // Build chord: root + 3rd + 5th (+ optional 7th for richness)
      const midis = [
        notes[(rootIdx) % notes.length],
        notes[(rootIdx + 2) % notes.length],
        notes[(rootIdx + 4) % notes.length],
      ];
      // Add 7th chord tone for jazz/complex styles
      if (rng() < 0.3) {
        midis.push(notes[(rootIdx + 6) % notes.length]);
      }
      events.push({ time: t, midis, duration: dur, velocity: 0.25 + (1 - energy) * 0.35 });
    }
    t += chordInterval;
    progIdx++;
  }

  return events;
}

/**
 * Choose melody style based on genre profile characteristics and energy.
 * Now works with dynamic style inference, not hardcoded genre names.
 */
export function chooseMelodyStyle(
  genreName: string, energy: number, characteristics?: string[]
): 'lead' | 'arp' | 'riff' | 'ambient' | 'hook' {
  const g = genreName.toLowerCase();
  const chars = (characteristics || []).join(' ').toLowerCase();

  // Hook for high-energy sections
  if (energy > 0.75) return 'hook';

  // Style inference from characteristics
  if (chars.includes('ethereal') || chars.includes('spacious') || chars.includes('meditative')) return 'ambient';
  if (chars.includes('arpeggio') || chars.includes('arpeggiated')) return 'arp';
  if (chars.includes('riff') || chars.includes('guitar-driven') || chars.includes('aggressive')) return 'riff';

  // Genre-based fallback
  if (g.includes('ambient') || g.includes('drone') || g.includes('meditation')) return 'ambient';
  if (g.includes('trance') || g.includes('synthwave') || g.includes('euro')) return 'arp';
  if (g.includes('rock') || g.includes('metal') || g.includes('punk') || g.includes('grunge')) return 'riff';
  if (energy < 0.3) return 'ambient';
  return 'lead';
}

// Export motif/hook generators for use in music-engine
export { generateMotif, generateHook, varyMotif, type Motif };
