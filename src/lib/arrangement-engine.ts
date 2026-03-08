/**
 * Arrangement & Energy Engine
 * Generates song structures with energy curves, transitions, and section planning.
 */

import { GenreProfile } from './genre-ontology';

export interface ArrangementSection {
  name: string;
  duration: number;
  energy: number;
  instruments: string[];
  hasTransitionIn: boolean;
  hasTransitionOut: boolean;
  description: string;
}

/**
 * Generate a fallback arrangement from genre profile when AI isn't available.
 */
export function generateArrangement(
  profile: GenreProfile,
  durationSeconds: number,
  rng: () => number,
): ArrangementSection[] {
  const template = profile.structureTemplate;
  const n = template.length;
  
  // Energy curves based on genre
  const energyCurves: Record<string, (i: number, n: number) => number> = {
    'build-drop': (i, n) => {
      const pos = i / (n - 1);
      if (pos < 0.15) return 0.15 + pos * 2;
      if (pos < 0.35) return 0.4 + (pos - 0.15) * 2.5;
      if (pos < 0.5) return 0.9;
      if (pos < 0.6) return 0.25;
      if (pos < 0.8) return 0.6 + (pos - 0.6) * 2;
      return 0.95 - (pos - 0.8) * 4;
    },
    'verse-chorus': (i, n) => {
      const pos = i / (n - 1);
      // Alternating low/high
      return i % 2 === 0 ? 0.4 + pos * 0.2 : 0.7 + pos * 0.15;
    },
    'through-composed': (i, n) => 0.3 + (i / (n - 1)) * 0.4 + rng() * 0.15,
    'arc': (i, n) => {
      const pos = i / (n - 1);
      return 0.2 + 0.8 * Math.sin(pos * Math.PI);
    },
    'plateau': (_i, _n) => 0.7 + rng() * 0.2,
    'escalating': (i, n) => 0.2 + (i / (n - 1)) * 0.75,
  };

  const getEnergy = energyCurves[profile.energyCurve] || energyCurves['build-drop'];

  // Distribute duration
  const sections: ArrangementSection[] = template.map((name, i) => {
    const isFirst = i === 0;
    const isLast = i === n - 1;
    const basePct = 1 / n;
    // Intros and outros slightly shorter, drops/choruses slightly longer
    const nameL = name.toLowerCase();
    let pctMod = 1;
    if (nameL.includes('intro') || nameL.includes('outro')) pctMod = 0.7;
    if (nameL.includes('drop') || nameL.includes('chorus') || nameL.includes('climax')) pctMod = 1.3;
    if (nameL.includes('bridge') || nameL.includes('breakdown')) pctMod = 0.8;

    const energy = getEnergy(i, n);

    // Determine active instruments based on energy
    const availableInstruments = profile.instruments;
    const numInstruments = Math.max(2, Math.round(availableInstruments.length * energy));
    const instruments = availableInstruments.slice(0, numInstruments);

    return {
      name,
      duration: Math.round(durationSeconds * basePct * pctMod),
      energy: Math.round(energy * 100) / 100,
      instruments,
      hasTransitionIn: !isFirst,
      hasTransitionOut: !isLast,
      description: `${name} section at ${Math.round(energy * 100)}% energy`,
    };
  });

  // Normalize durations to match exactly
  const total = sections.reduce((s, sec) => s + sec.duration, 0);
  if (total !== durationSeconds && sections.length > 0) {
    sections[sections.length - 1].duration += durationSeconds - total;
  }

  // Ensure minimum section duration
  for (const sec of sections) {
    if (sec.duration < 4) sec.duration = 4;
  }

  return sections;
}

/**
 * Generate a transition effect descriptor between sections.
 */
export function getTransitionType(
  fromEnergy: number, toEnergy: number, rng: () => number
): 'riser' | 'fill' | 'reverse_cymbal' | 'filter_sweep' | 'silence' | 'crash' {
  const delta = toEnergy - fromEnergy;
  if (delta > 0.3) return rng() < 0.5 ? 'riser' : 'filter_sweep';
  if (delta < -0.3) return rng() < 0.5 ? 'reverse_cymbal' : 'silence';
  return rng() < 0.5 ? 'fill' : 'crash';
}
