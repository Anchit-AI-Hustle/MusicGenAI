export interface TempoDefinition {
  name: string;
  bpm: number;
  description: string;
}

export const TEMPO_DATABASE: TempoDefinition[] = [
  { name: "Very Slow", bpm: 60, description: "Largo/Adagio - Dreamy, extremely relaxed" },
  { name: "Slow", bpm: 80, description: "Andante - Walking pace, balladic" },
  { name: "Medium", bpm: 100, description: "Moderato - Standard modern pop tempo" },
  { name: "Upbeat", bpm: 120, description: "Allegretto - Standard dance/house tempo" },
  { name: "Fast", bpm: 140, description: "Allegro - Driving, energetic, trap/drill" },
  { name: "Very Fast", bpm: 170, description: "Presto - frantic, drum & bass" }
];

export function getBpmFromName(name: string): number {
  return TEMPO_DATABASE.find(t => t.name === name)?.bpm ?? 100;
}

export function TEMPO_NAMES(): string[] { return TEMPO_DATABASE.map(t => t.name); }
