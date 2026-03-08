/**
 * Groove Engine
 * Applies micro-timing shifts, velocity humanization, and genre-specific feel
 * to quantized MIDI events to create natural-sounding rhythms.
 */

export interface GrooveTemplate {
  name: string;
  /** Per-16th-note timing offsets in ms (16 values, one per 16th in a bar) */
  timingOffsets: number[];
  /** Per-16th-note velocity multipliers */
  velocityMods: number[];
  /** Global swing amount 0-1 */
  swingAmount: number;
}

const GROOVE_TEMPLATES: Record<string, GrooveTemplate> = {
  warehouse: {
    name: 'Warehouse',
    timingOffsets: [0, 0, 0, 2, 0, 0, -1, 3, 0, 1, 0, 2, 0, -1, 0, 4],
    velocityMods: [1.0, 0.6, 0.75, 0.55, 0.9, 0.6, 0.7, 0.5, 1.0, 0.6, 0.75, 0.55, 0.9, 0.6, 0.7, 0.5],
    swingAmount: 0.02,
  },
  berlin: {
    name: 'Berlin',
    timingOffsets: [0, -2, 1, 3, 0, -1, 2, 5, 0, -2, 1, 4, 0, -1, 3, 6],
    velocityMods: [1.0, 0.5, 0.8, 0.4, 0.95, 0.5, 0.7, 0.45, 1.0, 0.55, 0.8, 0.4, 0.95, 0.5, 0.75, 0.4],
    swingAmount: 0.0,
  },
  acid: {
    name: 'Acid',
    timingOffsets: [0, 3, -1, 5, 0, 2, -2, 6, 0, 4, -1, 5, 0, 3, -2, 7],
    velocityMods: [1.0, 0.7, 0.85, 0.6, 0.95, 0.65, 0.8, 0.55, 1.0, 0.7, 0.85, 0.6, 0.9, 0.65, 0.8, 0.5],
    swingAmount: 0.05,
  },
  minimal: {
    name: 'Minimal',
    timingOffsets: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
    velocityMods: [1.0, 0.7, 0.8, 0.65, 0.9, 0.7, 0.8, 0.65, 1.0, 0.7, 0.8, 0.65, 0.9, 0.7, 0.8, 0.65],
    swingAmount: 0.0,
  },
  swing: {
    name: 'Swing',
    timingOffsets: [0, 8, -2, 10, 0, 8, -2, 12, 0, 8, -2, 10, 0, 8, -2, 12],
    velocityMods: [1.0, 0.5, 0.9, 0.4, 0.95, 0.5, 0.85, 0.45, 1.0, 0.5, 0.9, 0.4, 0.95, 0.5, 0.85, 0.45],
    swingAmount: 0.3,
  },
  shuffle: {
    name: 'Shuffle',
    timingOffsets: [0, 5, 0, 6, 0, 5, 0, 7, 0, 5, 0, 6, 0, 5, 0, 7],
    velocityMods: [1.0, 0.6, 0.85, 0.55, 0.95, 0.6, 0.8, 0.55, 1.0, 0.6, 0.85, 0.55, 0.95, 0.6, 0.8, 0.55],
    swingAmount: 0.2,
  },
};

export function getGrooveTemplate(name: string): GrooveTemplate {
  return GROOVE_TEMPLATES[name.toLowerCase()] || GROOVE_TEMPLATES.minimal;
}

/**
 * Apply groove to a time position.
 * @param time - Quantized time in seconds
 * @param sixteenthDur - Duration of one 16th note in seconds
 * @param groove - The groove template
 * @param rng - Random function for humanization
 * @returns Adjusted time with micro-timing
 */
export function applyGrooveTiming(
  time: number, sixteenthDur: number, groove: GrooveTemplate, rng: () => number
): number {
  const sixteenthIndex = Math.round(time / sixteenthDur) % 16;
  const offset = groove.timingOffsets[sixteenthIndex] || 0;
  // Convert ms to seconds + add small random humanization
  const humanize = (rng() - 0.5) * 0.004; // ±2ms random
  return time + (offset / 1000) + humanize;
}

/**
 * Get velocity multiplier for a given position.
 */
export function getGrooveVelocity(
  time: number, sixteenthDur: number, groove: GrooveTemplate, rng: () => number
): number {
  const sixteenthIndex = Math.round(time / sixteenthDur) % 16;
  const mod = groove.velocityMods[sixteenthIndex] || 0.7;
  // Add small velocity randomization
  return mod * (0.92 + rng() * 0.16);
}
