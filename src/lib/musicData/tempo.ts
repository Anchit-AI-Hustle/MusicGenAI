import { findGenreByName } from "./genres";

// ─── TEMPO TERMINOLOGY MAP ────────────────────────────────────────────────────
// These are real musical terms for tempo markings used since the Baroque period.
// When a user says "slow", "fast", etc., map it to the correct BPM range.

export const TEMPO_TERMINOLOGY = [
  { term: "Larghissimo",  label: "Extremely slow", bpmMin: 10,  bpmMax: 20,  bpmCenter: 15  },
  { term: "Grave",        label: "Solemn, very slow", bpmMin: 20, bpmMax: 40, bpmCenter: 35 },
  { term: "Largo",        label: "Slow and broad", bpmMin: 40, bpmMax: 60, bpmCenter: 50 },
  { term: "Larghetto",    label: "Rather slow", bpmMin: 60, bpmMax: 66, bpmCenter: 63 },
  { term: "Adagio",       label: "Slow and stately", bpmMin: 66, bpmMax: 76, bpmCenter: 72 },
  { term: "Andante",      label: "Walking pace", bpmMin: 76, bpmMax: 108, bpmCenter: 90 },
  { term: "Moderato",     label: "Moderate", bpmMin: 108, bpmMax: 120, bpmCenter: 114 },
  { term: "Allegretto",   label: "Moderately fast", bpmMin: 112, bpmMax: 120, bpmCenter: 116 },
  { term: "Allegro",      label: "Fast and bright", bpmMin: 120, bpmMax: 156, bpmCenter: 132 },
  { term: "Vivace",       label: "Lively and fast", bpmMin: 156, bpmMax: 176, bpmCenter: 165 },
  { term: "Presto",       label: "Very fast", bpmMin: 168, bpmMax: 200, bpmCenter: 185 },
  { term: "Prestissimo",  label: "Extremely fast", bpmMin: 200, bpmMax: 240, bpmCenter: 220 },
];

// ─── MOOD-TO-BPM INFLUENCE ───────────────────────────────────────────────────
// Different moods suggest different BPM adjustments.
// Use these to bias the BPM recommendation when genre is known but mood is given.

export const MOOD_BPM_BIAS: Record<string, { bpmShift: number; description: string }> = {
  "Happy":         { bpmShift: +10, description: "Happy songs run slightly faster than genre average" },
  "Energetic":     { bpmShift: +20, description: "High energy pushes tempo to upper end of genre range" },
  "Aggressive":    { bpmShift: +15, description: "Aggressive mood increases pace and intensity" },
  "Rebellious":    { bpmShift: +10, description: "Rebellious songs tend to be faster and more urgent" },
  "Euphoric":      { bpmShift: +15, description: "Euphoric music speeds up slightly for excitement" },
  "Intense":       { bpmShift: +12, description: "Intense songs trend toward upper genre BPM range" },
  "Uplifting":     { bpmShift: +8,  description: "Uplifting songs are brighter and slightly faster" },
  "Triumphant":    { bpmShift: +5,  description: "Triumphant tone is brisk and confident" },
  "Playful":       { bpmShift: +8,  description: "Playful songs have a light, quick feel" },
  "Neutral":       { bpmShift: 0,   description: "No adjustment — use genre typical BPM" },
  "Nostalgic":     { bpmShift: -5,  description: "Nostalgia slightly slows the pace" },
  "Romantic":      { bpmShift: -8,  description: "Romantic songs are slightly slower and more intimate" },
  "Calm":          { bpmShift: -15, description: "Calm songs move toward lower end of genre range" },
  "Peaceful":      { bpmShift: -18, description: "Peaceful songs move significantly slower" },
  "Dreamy":        { bpmShift: -12, description: "Dreamy songs float at a relaxed pace" },
  "Melancholic":   { bpmShift: -10, description: "Melancholic songs slow down for emotional weight" },
  "Sad":           { bpmShift: -15, description: "Sad songs tend toward slow, deliberate timing" },
  "Heartbroken":   { bpmShift: -18, description: "Heartbreak songs are often the slowest in a genre" },
  "Dark":          { bpmShift: -5,  description: "Dark songs can be any tempo but trend slower" },
  "Mysterious":    { bpmShift: -8,  description: "Mysterious songs have a slow, building tension" },
  "Tense":         { bpmShift: +5,  description: "Tense songs can be faster to create urgency" },
  "Raw":           { bpmShift: 0,   description: "Raw emotional delivery works at any tempo" },
  "Bittersweet":   { bpmShift: -5,  description: "Bittersweet songs are slightly reflective" },
  "Chill":         { bpmShift: -20, description: "Chill is the biggest downward tempo shift" },
};

// ─── BPM CALCULATOR ──────────────────────────────────────────────────────────

export function calculateIdealBPM(genre: string, mood: string): number {
  const genreDef = findGenreByName(genre);
  if (!genreDef) return 110; // Universal pop default

  let bpm = genreDef.bpmTypical;
  const moodBias = MOOD_BPM_BIAS[mood];
  if (moodBias) bpm += moodBias.bpmShift;

  // Clamp to genre range
  return Math.max(genreDef.bpmMin, Math.min(genreDef.bpmMax, Math.round(bpm)));
}

// ─── BEAT GRID AND MUSICAL TIMING ────────────────────────────────────────────

export interface BeatGrid {
  bpm: number;
  timeSignature: string;
  secondsPerBeat: number;
  secondsPerMeasure: number;
  beatsPerMeasure: number;
}

export function buildBeatGrid(bpm: number, timeSignature: string = "4/4"): BeatGrid {
  const secondsPerBeat = 60 / bpm;
  const [numerator] = timeSignature.split("/").map(Number);
  const secondsPerMeasure = secondsPerBeat * numerator;
  return {
    bpm,
    timeSignature,
    secondsPerBeat,
    secondsPerMeasure,
    beatsPerMeasure: numerator,
  };
}

// ─── SONG STRUCTURE TIMING ───────────────────────────────────────────────────
// Given a total duration and BPM, generate a realistic song structure
// with measure counts and timestamps for each section.

export interface SongSection {
  name: string;
  tag: string;
  measures: number;
  startSeconds: number;
  endSeconds: number;
  lyricsLines: number;
}

export interface SongStructure {
  sections: SongSection[];
  totalMeasures: number;
  totalSeconds: number;
  lyricsLineTotal: number;
}

export function generateSongStructure(
  totalSeconds: number,
  bpm: number,
  genre: string,
  timeSignature: string = "4/4"
): SongStructure {
  const grid = buildBeatGrid(bpm, timeSignature);
  const totalMeasures = Math.floor(totalSeconds / grid.secondsPerMeasure);

  // Each genre has a typical structure.
  // Lines per section are calculated: 1 lyric line ≈ 1-2 measures at typical BPM.
  // Lyric density = 1 line per 2 measures for slow songs, 1 per measure for fast songs.
  const lyricDensity = bpm > 130 ? 0.8 : bpm > 100 ? 0.6 : 0.4; // lines per measure

  // Template structures by total duration
  let template: { name: string; tag: string; fraction: number }[];

  if (totalSeconds <= 45) {
    template = [
      { name: "Verse",  tag: "[verse]",  fraction: 0.35 },
      { name: "Chorus", tag: "[chorus]", fraction: 0.50 },
      { name: "Outro",  tag: "[outro]",  fraction: 0.15 },
    ];
  } else if (totalSeconds <= 90) {
    template = [
      { name: "Intro",  tag: "[intro]",  fraction: 0.10 },
      { name: "Verse",  tag: "[verse]",  fraction: 0.30 },
      { name: "Chorus", tag: "[chorus]", fraction: 0.30 },
      { name: "Verse 2",tag: "[verse]",  fraction: 0.20 },
      { name: "Outro",  tag: "[outro]",  fraction: 0.10 },
    ];
  } else if (totalSeconds <= 180) {
    template = [
      { name: "Intro",   tag: "[intro]",   fraction: 0.07 },
      { name: "Verse 1", tag: "[verse]",   fraction: 0.20 },
      { name: "Chorus",  tag: "[chorus]",  fraction: 0.15 },
      { name: "Verse 2", tag: "[verse]",   fraction: 0.18 },
      { name: "Chorus 2",tag: "[chorus]",  fraction: 0.15 },
      { name: "Bridge",  tag: "[bridge]",  fraction: 0.12 },
      { name: "Chorus 3",tag: "[chorus]",  fraction: 0.10 },
      { name: "Outro",   tag: "[outro]",   fraction: 0.03 },
    ];
  } else {
    template = [
      { name: "Intro",    tag: "[intro]",   fraction: 0.05 },
      { name: "Verse 1",  tag: "[verse]",   fraction: 0.15 },
      { name: "Pre-Chorus",tag:"[pre-chorus]",fraction: 0.07 },
      { name: "Chorus",   tag: "[chorus]",  fraction: 0.12 },
      { name: "Verse 2",  tag: "[verse]",   fraction: 0.13 },
      { name: "Pre-Chorus 2",tag:"[pre-chorus]",fraction: 0.05 },
      { name: "Chorus 2", tag: "[chorus]",  fraction: 0.12 },
      { name: "Bridge",   tag: "[bridge]",  fraction: 0.10 },
      { name: "Chorus 3", tag: "[chorus]",  fraction: 0.12 },
      { name: "Outro",    tag: "[outro]",   fraction: 0.09 },
    ];
  }

  let cursor = 0;
  let totalLyricsLines = 0;
  const sections: SongSection[] = template.map((t, idx) => {
    // Add ±1 measure variation for variety
    const variation = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
    const baseMeasures = Math.max(2, Math.round(totalMeasures * t.fraction));
    
    // For the last section, use the remainder of totalMeasures to ensure we exactly hit the target duration
    let measures = idx === template.length - 1 
      ? Math.max(2, totalMeasures - (cursor / grid.secondsPerMeasure))
      : Math.max(2, baseMeasures + variation);
    
    const sectionSeconds = measures * grid.secondsPerMeasure;
    const lyricsLines = Math.max(1, Math.round(measures * lyricDensity));
    const section: SongSection = {
      name: t.name,
      tag: t.tag,
      measures,
      startSeconds: cursor,
      endSeconds: cursor + sectionSeconds,
      lyricsLines,
    };
    cursor += sectionSeconds;
    totalLyricsLines += lyricsLines;
    return section;
  });

  return {
    sections,
    totalMeasures,
    totalSeconds,
    lyricsLineTotal: totalLyricsLines,
  };
}
