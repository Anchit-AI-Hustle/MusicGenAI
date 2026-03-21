export interface TempoDefinition {
  name: string;
  bpm: number;
  description: string;
}

export interface SongSection {
  name: string;
  durationSeconds: number;
}

export interface SongStructure {
  sections: SongSection[];
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

export function generateSongStructure(durationSeconds: number, bpm: number, genreName: string): SongStructure {
  const sections: SongSection[] = [];
  const genre = genreName.toLowerCase();

  const template =
    genre.includes('drill') || genre.includes('trap') ? ['Intro', 'Verse', 'Hook', 'Verse', 'Hook', 'Outro'] :
    genre.includes('edm') || genre.includes('house') || genre.includes('techno') ? ['Intro', 'Build', 'Drop', 'Breakdown', 'Drop', 'Outro'] :
    genre.includes('reggaeton') ? ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Outro'] :
    ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Chorus', 'Outro'];

  // Keep sectioning stable by bars, then normalize to requested duration.
  const beatsPerBar = 4;
  const secondsPerBar = (60 / Math.max(1, bpm)) * beatsPerBar;
  const roughBarsPerSection = Math.max(4, Math.round((durationSeconds / secondsPerBar) / template.length));

  let used = 0;
  for (let i = 0; i < template.length; i++) {
    const isLast = i === template.length - 1;
    const sectionDuration = isLast
      ? Math.max(4, durationSeconds - used)
      : Math.max(4, Math.round(roughBarsPerSection * secondsPerBar));
    used += sectionDuration;
    sections.push({ name: template[i], durationSeconds: sectionDuration });
  }

  if (sections.length > 0) {
    const sum = sections.reduce((acc, s) => acc + s.durationSeconds, 0);
    sections[sections.length - 1].durationSeconds += durationSeconds - sum;
  }

  return { sections };
}
