/**
 * Melody & Chord Generator
 * Creates melodies, chord progressions, and pad voicings based on genre and energy.
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

/**
 * Generate a melody for a section.
 */
export function generateMelody(
  root: string, scale: string, startTime: number, duration: number,
  beatDur: number, energy: number, style: 'lead' | 'arp' | 'riff' | 'ambient',
  rng: () => number,
): MelodyEvent[] {
  const events: MelodyEvent[] = [];
  const notes = getScaleMidi(root, scale, 4, 14);
  const sixteenth = beatDur / 4;
  let t = startTime;
  let noteIdx = Math.floor(rng() * 5) + 2;

  switch (style) {
    case 'lead': {
      // Melodic lead line
      const step = energy > 0.6 ? sixteenth : sixteenth * 2;
      while (t < startTime + duration) {
        if (rng() < 0.55 + energy * 0.3) {
          const midi = notes[noteIdx % notes.length];
          const dur = step * (0.5 + rng() * 1.0);
          events.push({ time: t, midi, duration: dur, velocity: 0.2 + energy * 0.35 });
        }
        // Melodic movement
        const move = rng();
        if (move < 0.35) noteIdx += 1;
        else if (move < 0.55) noteIdx -= 1;
        else if (move < 0.7) noteIdx += 2;
        else if (move < 0.8) noteIdx -= 2;
        if (noteIdx < 0) noteIdx = 0;
        if (noteIdx >= notes.length) noteIdx = notes.length - 2;
        t += step;
      }
      break;
    }
    case 'arp': {
      // Arpeggio pattern
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
        events.push({ time: t, midi, duration: step * 0.6, velocity: 0.15 + energy * 0.25 });
        patIdx++;
        if (patIdx % (pattern.length * 4) === 0 && rng() < 0.3) {
          noteIdx += rng() < 0.5 ? 1 : -1;
          if (noteIdx < 0) noteIdx = 0;
        }
        t += step;
      }
      break;
    }
    case 'riff': {
      // Short repeating riff (rock/metal)
      const riffLen = Math.floor(2 + rng() * 3); // 2-4 notes
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
          events.push({ time: t, midi, duration: step * 0.7, velocity: 0.3 + energy * 0.4 });
        }
        riffIdx++;
        t += step;
      }
      break;
    }
    case 'ambient': {
      // Sparse ambient tones
      while (t < startTime + duration) {
        const midi = notes[noteIdx % notes.length];
        const dur = beatDur * (2 + rng() * 6);
        events.push({ time: t, midi, duration: Math.min(dur, startTime + duration - t), velocity: 0.08 + energy * 0.12 });
        noteIdx += rng() < 0.5 ? 1 : -1;
        if (noteIdx < 0) noteIdx = 0;
        t += dur * (0.7 + rng() * 0.3);
      }
      break;
    }
  }

  return events;
}

/**
 * Generate chord events for a section.
 */
export function generateChords(
  root: string, scale: string, startTime: number, duration: number,
  beatDur: number, energy: number, rng: () => number,
): ChordEvent[] {
  const events: ChordEvent[] = [];
  const notes = getScaleMidi(root, scale, 3, 8);
  
  const chordInterval = beatDur * (energy > 0.6 ? 4 : 8);
  let t = startTime;
  let chordRoot = 0;

  // Common chord progressions
  const progressions = [
    [0, 3, 4, 3], // i - iv - v - iv
    [0, 5, 3, 4], // i - vi - iv - v
    [0, 4, 5, 3], // i - v - vi - iv
    [0, 2, 3, 4], // i - iii - iv - v
  ];
  const prog = progressions[Math.floor(rng() * progressions.length)];
  let progIdx = 0;

  while (t < startTime + duration) {
    const rootIdx = prog[progIdx % prog.length];
    chordRoot = rootIdx;
    const dur = Math.min(chordInterval, startTime + duration - t);
    if (dur > 0.5) {
      const midis = [
        notes[(chordRoot) % notes.length],
        notes[(chordRoot + 2) % notes.length],
        notes[(chordRoot + 4) % notes.length],
      ];
      events.push({ time: t, midis, duration: dur, velocity: 0.1 + (1 - energy) * 0.2 });
    }
    t += chordInterval;
    progIdx++;
  }

  return events;
}

/**
 * Choose melody style based on genre.
 */
export function chooseMelodyStyle(genreName: string, energy: number): 'lead' | 'arp' | 'riff' | 'ambient' {
  const g = genreName.toLowerCase();
  if (g.includes('ambient') || g.includes('drone') || g.includes('meditation')) return 'ambient';
  if (g.includes('trance') || g.includes('synthwave') || g.includes('euro')) return 'arp';
  if (g.includes('rock') || g.includes('metal') || g.includes('punk') || g.includes('grunge')) return 'riff';
  if (energy < 0.3) return 'ambient';
  return 'lead';
}
