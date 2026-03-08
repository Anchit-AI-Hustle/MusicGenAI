/**
 * Drum Pattern Engine
 * Generates genre-specific drum patterns as arrays of hits per 16th note.
 * Each pattern is 16 steps (one bar of 16th notes).
 */

export interface DrumHit {
  step: number; // 0-15
  velocity: number; // 0-1
  instrument: 'kick' | 'snare' | 'clap' | 'hihat_closed' | 'hihat_open' | 'ride' | 'perc' | 'tom';
}

export type DrumPattern = DrumHit[];

type PatternGenerator = (energy: number, rng: () => number) => DrumPattern;

function fourOnFloor(energy: number, rng: () => number): DrumPattern {
  const hits: DrumPattern = [];
  // Kick on every beat
  for (let i = 0; i < 16; i += 4) {
    hits.push({ step: i, velocity: 0.85 + energy * 0.15, instrument: 'kick' });
  }
  // Clap on 2 and 4
  if (energy > 0.25) {
    hits.push({ step: 4, velocity: 0.6 + energy * 0.3, instrument: 'clap' });
    hits.push({ step: 12, velocity: 0.6 + energy * 0.3, instrument: 'clap' });
  }
  // Hi-hats - 16ths with velocity variation
  for (let i = 0; i < 16; i++) {
    const isDownbeat = i % 4 === 0;
    const isUpbeat = i % 2 === 0;
    const vel = isDownbeat ? 0.55 : isUpbeat ? 0.35 : 0.18;
    if (vel * energy > 0.08) {
      const isOpen = i % 8 === 4 && rng() < 0.3 * energy;
      hits.push({ step: i, velocity: vel * (0.7 + energy * 0.3), instrument: isOpen ? 'hihat_open' : 'hihat_closed' });
    }
  }
  // Extra percussion at high energy
  if (energy > 0.6) {
    for (let i = 0; i < 16; i += 4) {
      if (rng() < energy * 0.3) {
        hits.push({ step: (i + 2) % 16, velocity: 0.25 * energy, instrument: 'perc' });
      }
    }
  }
  return hits;
}

function breakbeat(energy: number, rng: () => number): DrumPattern {
  const hits: DrumPattern = [];
  // Kick on 1, and-of-2, 3
  hits.push({ step: 0, velocity: 0.9, instrument: 'kick' });
  hits.push({ step: 6, velocity: 0.75, instrument: 'kick' });
  hits.push({ step: 8, velocity: 0.85, instrument: 'kick' });
  if (energy > 0.5) hits.push({ step: 14, velocity: 0.65, instrument: 'kick' });
  // Snare on 2 and 4
  hits.push({ step: 4, velocity: 0.8, instrument: 'snare' });
  hits.push({ step: 12, velocity: 0.8, instrument: 'snare' });
  // Ghost notes
  if (energy > 0.4) {
    hits.push({ step: 10, velocity: 0.3, instrument: 'snare' });
  }
  // Hi-hats
  for (let i = 0; i < 16; i++) {
    if (rng() < 0.6 + energy * 0.3) {
      hits.push({ step: i, velocity: (i % 4 === 0 ? 0.5 : 0.25) * (0.6 + energy * 0.4), instrument: 'hihat_closed' });
    }
  }
  return hits;
}

function boomBap(energy: number, rng: () => number): DrumPattern {
  const hits: DrumPattern = [];
  // Kick
  hits.push({ step: 0, velocity: 0.9, instrument: 'kick' });
  hits.push({ step: 7, velocity: 0.7, instrument: 'kick' });
  if (energy > 0.5) hits.push({ step: 10, velocity: 0.6, instrument: 'kick' });
  // Snare on 4 and 12
  hits.push({ step: 4, velocity: 0.85, instrument: 'snare' });
  hits.push({ step: 12, velocity: 0.85, instrument: 'snare' });
  // Hi-hats - 8th notes with swing
  for (let i = 0; i < 16; i += 2) {
    hits.push({ step: i, velocity: (i % 4 === 0 ? 0.5 : 0.35) * (0.7 + energy * 0.3), instrument: 'hihat_closed' });
  }
  return hits;
}

function halftime(energy: number, rng: () => number): DrumPattern {
  const hits: DrumPattern = [];
  // Kick on 1
  hits.push({ step: 0, velocity: 0.9, instrument: 'kick' });
  if (energy > 0.6) hits.push({ step: 10, velocity: 0.65, instrument: 'kick' });
  // Snare on 3 (halftime feel)
  hits.push({ step: 8, velocity: 0.85, instrument: 'snare' });
  // Hi-hats - rapid rolls at high energy (trap-style)
  for (let i = 0; i < 16; i++) {
    const isRoll = energy > 0.5 && i >= 12;
    if (isRoll || i % 2 === 0) {
      hits.push({ step: i, velocity: isRoll ? 0.3 + rng() * 0.3 : 0.4, instrument: 'hihat_closed' });
    }
  }
  return hits;
}

function swingPattern(energy: number, rng: () => number): DrumPattern {
  const hits: DrumPattern = [];
  // Ride cymbal - jazz pattern
  for (let i = 0; i < 16; i += 2) {
    if (i % 4 === 0 || (i % 4 === 2 && rng() < 0.7)) {
      hits.push({ step: i, velocity: 0.45 + energy * 0.25, instrument: 'ride' });
    }
  }
  // Kick - sparse
  hits.push({ step: 0, velocity: 0.6, instrument: 'kick' });
  if (rng() < energy * 0.5) hits.push({ step: 6, velocity: 0.4, instrument: 'kick' });
  if (rng() < energy * 0.4) hits.push({ step: 10, velocity: 0.4, instrument: 'kick' });
  // Snare (brush) on 2 and 4
  hits.push({ step: 4, velocity: 0.3 + energy * 0.2, instrument: 'snare' });
  hits.push({ step: 12, velocity: 0.3 + energy * 0.2, instrument: 'snare' });
  // Hi-hat on 2 and 4 (foot)
  hits.push({ step: 4, velocity: 0.3, instrument: 'hihat_closed' });
  hits.push({ step: 12, velocity: 0.3, instrument: 'hihat_closed' });
  return hits;
}

function shufflePattern(energy: number, rng: () => number): DrumPattern {
  const hits: DrumPattern = [];
  // Kick on 1 and 3
  hits.push({ step: 0, velocity: 0.85, instrument: 'kick' });
  hits.push({ step: 8, velocity: 0.8, instrument: 'kick' });
  // Snare on 2 and 4
  hits.push({ step: 4, velocity: 0.75, instrument: 'snare' });
  hits.push({ step: 12, velocity: 0.75, instrument: 'snare' });
  // Shuffled hi-hats (triplet feel simulated)
  for (let i = 0; i < 16; i++) {
    const isTriplet = i % 3 === 0 || i % 4 === 0;
    if (isTriplet || rng() < energy * 0.3) {
      hits.push({ step: i, velocity: 0.35 + rng() * 0.2, instrument: 'hihat_closed' });
    }
  }
  return hits;
}

function polyrhythm(energy: number, rng: () => number): DrumPattern {
  const hits: DrumPattern = [];
  // 3-over-4 polyrhythm
  // Pattern in 4: steps 0, 4, 8, 12
  hits.push({ step: 0, velocity: 0.85, instrument: 'kick' });
  hits.push({ step: 8, velocity: 0.75, instrument: 'kick' });
  // Pattern in 3 (across 16): roughly steps 0, 5, 10
  hits.push({ step: 5, velocity: 0.6, instrument: 'perc' });
  hits.push({ step: 10, velocity: 0.6, instrument: 'perc' });
  // Snare on 4 and 12
  hits.push({ step: 4, velocity: 0.7, instrument: 'snare' });
  hits.push({ step: 12, velocity: 0.7, instrument: 'snare' });
  // Hi-hats
  for (let i = 0; i < 16; i += 2) {
    hits.push({ step: i, velocity: 0.3 + rng() * 0.2, instrument: 'hihat_closed' });
  }
  return hits;
}

const PATTERN_GENERATORS: Record<string, PatternGenerator> = {
  'four-on-floor': fourOnFloor,
  'breakbeat': breakbeat,
  'boom-bap': boomBap,
  'halftime': halftime,
  'swing': swingPattern,
  'shuffle': shufflePattern,
  'straight': fourOnFloor, // straight uses four-on-floor variant
  'polyrhythm': polyrhythm,
};

/**
 * Get a drum pattern for the given rhythm style and energy level.
 */
export function getDrumPattern(
  rhythmStyle: string, energy: number, rng: () => number
): DrumPattern {
  const gen = PATTERN_GENERATORS[rhythmStyle] || PATTERN_GENERATORS['four-on-floor'];
  return gen(Math.max(0, Math.min(1, energy)), rng);
}

/**
 * Generate a drum fill pattern (used for transitions).
 */
export function getDrumFill(energy: number, rng: () => number): DrumPattern {
  const hits: DrumPattern = [];
  // Accelerating hits leading to downbeat
  const numHits = Math.round(4 + energy * 8);
  for (let i = 0; i < numHits; i++) {
    const step = Math.round(16 * (i / numHits));
    hits.push({
      step: Math.min(15, step),
      velocity: 0.4 + (i / numHits) * 0.5,
      instrument: rng() < 0.5 ? 'snare' : 'tom',
    });
  }
  return hits;
}
