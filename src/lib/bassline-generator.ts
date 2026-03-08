/**
 * Bassline Generator
 * Creates genre-specific bass patterns using scales and rhythm templates.
 */

import { getScaleMidi } from './audio-utils';

export interface BassEvent {
  time: number; // in seconds
  midi: number;
  duration: number; // in seconds
  velocity: number;
}

export type BassStyle = 'rolling' | 'offbeat' | 'acid' | 'syncopated' | 'walking' | 'sub' | 'slap' | 'arpeggiated';

/**
 * Generate bass events for a section.
 */
export function generateBassline(
  root: string,
  scale: string,
  startTime: number,
  duration: number,
  beatDur: number,
  style: BassStyle,
  energy: number,
  rng: () => number,
): BassEvent[] {
  const events: BassEvent[] = [];
  const notes = getScaleMidi(root, scale, 1, 8);
  const sixteenth = beatDur / 4;
  
  let t = startTime;
  let noteIdx = Math.floor(rng() * notes.length);
  
  switch (style) {
    case 'rolling': {
      // Continuous 8th note bass (techno/DnB)
      const step = beatDur / 2;
      while (t < startTime + duration) {
        if (rng() < 0.75 + energy * 0.2) {
          events.push({
            time: t, midi: notes[noteIdx % notes.length],
            duration: step * 0.7, velocity: 0.5 + energy * 0.4,
          });
        }
        noteIdx += rng() < 0.3 ? 1 : rng() < 0.5 ? 0 : -1;
        if (noteIdx < 0) noteIdx = 0;
        t += step;
      }
      break;
    }
    case 'offbeat': {
      // Offbeat bass (reggae, dub)
      const step = beatDur;
      t += beatDur / 2; // start on offbeat
      while (t < startTime + duration) {
        events.push({
          time: t, midi: notes[noteIdx % notes.length],
          duration: step * 0.4, velocity: 0.55 + energy * 0.3,
        });
        noteIdx += rng() < 0.6 ? 0 : 1;
        t += step;
      }
      break;
    }
    case 'acid': {
      // 16th note acid bass with slides
      while (t < startTime + duration) {
        if (rng() < 0.6 + energy * 0.3) {
          const isAccent = rng() < 0.3;
          events.push({
            time: t, midi: notes[noteIdx % notes.length],
            duration: sixteenth * (isAccent ? 1.5 : 0.6),
            velocity: (isAccent ? 0.7 : 0.4) + energy * 0.25,
          });
        }
        noteIdx += rng() < 0.25 ? 2 : rng() < 0.5 ? 1 : rng() < 0.7 ? 0 : -1;
        if (noteIdx < 0) noteIdx = 0;
        t += sixteenth;
      }
      break;
    }
    case 'syncopated': {
      // Funk/hip-hop syncopated bass
      const pattern = [0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1]; // syncopated 16ths
      let step = 0;
      while (t < startTime + duration) {
        if (pattern[step % 16] || rng() < energy * 0.2) {
          events.push({
            time: t, midi: notes[noteIdx % notes.length],
            duration: sixteenth * (pattern[step % 16] ? 1.2 : 0.5),
            velocity: 0.5 + energy * 0.35,
          });
          if (rng() < 0.4) noteIdx += rng() < 0.5 ? 1 : -1;
          if (noteIdx < 0) noteIdx = 0;
        }
        t += sixteenth;
        step++;
      }
      break;
    }
    case 'walking': {
      // Jazz walking bass - quarter notes, stepwise motion
      while (t < startTime + duration) {
        events.push({
          time: t, midi: notes[noteIdx % notes.length],
          duration: beatDur * 0.85, velocity: 0.55 + rng() * 0.15,
        });
        // Mostly stepwise, occasional leap
        const leap = rng();
        if (leap < 0.5) noteIdx += 1;
        else if (leap < 0.7) noteIdx -= 1;
        else if (leap < 0.85) noteIdx += 2;
        else noteIdx -= 2;
        if (noteIdx < 0) noteIdx = 0;
        if (noteIdx >= notes.length) noteIdx = notes.length - 1;
        t += beatDur;
      }
      break;
    }
    case 'sub': {
      // Sub bass - long sustained notes (dubstep, trap)
      while (t < startTime + duration) {
        const noteDur = beatDur * (2 + rng() * 2);
        events.push({
          time: t, midi: notes[noteIdx % notes.length],
          duration: Math.min(noteDur, startTime + duration - t),
          velocity: 0.7 + energy * 0.25,
        });
        noteIdx += rng() < 0.6 ? 0 : rng() < 0.8 ? 1 : -1;
        if (noteIdx < 0) noteIdx = 0;
        t += noteDur;
      }
      break;
    }
    case 'slap': {
      // Slap bass (funk/disco) - rhythmic with dead notes
      const step = sixteenth;
      while (t < startTime + duration) {
        const isHit = rng() < 0.5 + energy * 0.3;
        if (isHit) {
          events.push({
            time: t, midi: notes[noteIdx % notes.length],
            duration: step * (rng() < 0.3 ? 0.2 : 0.6),
            velocity: 0.55 + rng() * 0.3,
          });
          if (rng() < 0.3) noteIdx += rng() < 0.5 ? 1 : -1;
          if (noteIdx < 0) noteIdx = 0;
        }
        t += step;
      }
      break;
    }
    case 'arpeggiated': {
      // Arpeggiated bass (trance, synthwave)
      const step = sixteenth;
      let patIdx = 0;
      const arpPattern = [0, 2, 4, 2]; // scale degrees
      while (t < startTime + duration) {
        const degree = arpPattern[patIdx % arpPattern.length];
        const midi = notes[(noteIdx + degree) % notes.length];
        events.push({
          time: t, midi, duration: step * 0.7, velocity: 0.45 + energy * 0.35,
        });
        patIdx++;
        if (patIdx % (arpPattern.length * 2) === 0 && rng() < 0.4) {
          noteIdx += rng() < 0.5 ? 1 : -1;
          if (noteIdx < 0) noteIdx = 0;
        }
        t += step;
      }
      break;
    }
  }
  
  return events;
}

/**
 * Choose a bass style based on genre characteristics.
 */
export function chooseBassStyle(rhythmStyle: string, genreName: string): BassStyle {
  const g = genreName.toLowerCase();
  if (g.includes('acid')) return 'acid';
  if (g.includes('reggae') || g.includes('dub')) return 'offbeat';
  if (g.includes('jazz') || g.includes('blues')) return 'walking';
  if (g.includes('funk') || g.includes('disco') || g.includes('slap')) return 'slap';
  if (g.includes('trap') || g.includes('dubstep') || g.includes('drill')) return 'sub';
  if (g.includes('trance') || g.includes('synthwave') || g.includes('arp')) return 'arpeggiated';
  if (g.includes('hip hop') || g.includes('r&b') || g.includes('soul')) return 'syncopated';
  if (rhythmStyle === 'breakbeat' || rhythmStyle === 'four-on-floor') return 'rolling';
  return 'rolling';
}
