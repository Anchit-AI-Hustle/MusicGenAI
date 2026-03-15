import { findGenreByName } from "./genres";
import { findMood } from "./moods";

export interface SongSection {
  name: string;
  measures: number;
  lyricsLines: number;
  intensity: number; // 1-10
}

export interface SongStructure {
  totalMeasures: number;
  bpm: number;
  sections: SongSection[];
}

/**
 * Calculates the ideal BPM based on genre and mood.
 */
export function calculateIdealBPM(genre: string, mood?: string): number {
  const genreDef = findGenreByName(genre);
  if (!genreDef) return 120; // Default

  let bpm = genreDef.bpmTypical;

  if (mood) {
    const m = mood.toLowerCase();
    if (["energetic", "intense", "high energy", "pumping", "aggressive"].includes(m)) {
      bpm = Math.min(genreDef.bpmMax, bpm * 1.1);
    } else if (["calm", "sad", "chill", "relaxed", "peaceful", "melancholic"].includes(m)) {
      bpm = Math.max(genreDef.bpmMin, bpm * 0.9);
    }
  }

  return Math.round(bpm);
}

/**
 * Generates a standard song structure based on duration and BPM.
 */
export function generateSongStructure(
  durationSeconds: number,
  bpm: number,
  genre: string
): SongStructure {
  // Simple math: (BPM / 60) beats per second. 
  // Assuming 4/4 time, 4 beats per measure.
  const beatsPerMeasure = 4;
  const totalBeats = (bpm / 60) * durationSeconds;
  const totalMeasures = Math.floor(totalBeats / beatsPerMeasure);

  const sections: SongSection[] = [];
  
  // Basic structures by genre category
  const lowerGenre = genre.toLowerCase();
  
  if (lowerGenre.includes("drill") || lowerGenre.includes("trap") || lowerGenre.includes("hip hop")) {
    // Urban Structure: Intro -> Verse -> Chorus -> Verse -> Chorus -> Outro
    sections.push({ name: "Intro", measures: 4, lyricsLines: 0, intensity: 2 });
    sections.push({ name: "Verse", measures: 16, lyricsLines: 8, intensity: 6 });
    sections.push({ name: "Chorus", measures: 8, lyricsLines: 4, intensity: 8 });
    sections.push({ name: "Verse", measures: 16, lyricsLines: 8, intensity: 6 });
    sections.push({ name: "Chorus", measures: 8, lyricsLines: 4, intensity: 9 });
    sections.push({ name: "Outro", measures: 8, lyricsLines: 2, intensity: 3 });
  } else if (lowerGenre.includes("pop") || lowerGenre.includes("dance") || lowerGenre.includes("bollywood")) {
    // Pop Structure: Intro -> Verse -> Pre-Chorus -> Chorus -> Verse -> Pre-Chorus -> Chorus -> Bridge -> Chorus -> Outro
    sections.push({ name: "Intro", measures: 4, lyricsLines: 0, intensity: 3 });
    sections.push({ name: "Verse", measures: 8, lyricsLines: 4, intensity: 5 });
    sections.push({ name: "Pre-Chorus", measures: 4, lyricsLines: 2, intensity: 6 });
    sections.push({ name: "Chorus", measures: 8, lyricsLines: 4, intensity: 9 });
    sections.push({ name: "Verse", measures: 8, lyricsLines: 4, intensity: 5 });
    sections.push({ name: "Pre-Chorus", measures: 4, lyricsLines: 2, intensity: 6 });
    sections.push({ name: "Chorus", measures: 8, lyricsLines: 4, intensity: 9 });
    sections.push({ name: "Bridge", measures: 8, lyricsLines: 4, intensity: 7 });
    sections.push({ name: "Chorus", measures: 8, lyricsLines: 4, intensity: 10 });
    sections.push({ name: "Outro", measures: 4, lyricsLines: 1, intensity: 3 });
  } else {
    // Standard Rock/General Structure
    sections.push({ name: "Intro", measures: 4, lyricsLines: 0, intensity: 3 });
    sections.push({ name: "Verse", measures: 8, lyricsLines: 4, intensity: 6 });
    sections.push({ name: "Chorus", measures: 8, lyricsLines: 4, intensity: 8 });
    sections.push({ name: "Verse", measures: 8, lyricsLines: 4, intensity: 6 });
    sections.push({ name: "Chorus", measures: 8, lyricsLines: 4, intensity: 9 });
    sections.push({ name: "Bridge", measures: 4, lyricsLines: 2, intensity: 5 });
    sections.push({ name: "Chorus", measures: 8, lyricsLines: 4, intensity: 10 });
    sections.push({ name: "Outro", measures: 4, lyricsLines: 0, intensity: 2 });
  }

  // Adjust structure to fit duration (basic proportional scaling)
  const structuralMeasures = sections.reduce((acc, s) => acc + s.measures, 0);
  const ratio = totalMeasures / structuralMeasures;

  const adjustedSections = sections.map(s => {
    const rawMeasures = Math.round(s.measures * ratio);
    // Ensure even measures for musicality
    const adjustedMeasures = rawMeasures + (rawMeasures % 2 === 0 ? 0 : 1);
    
    // Add some random variation (±1 measure if possible)
    const variation = Math.random() > 0.5 ? 1 : -1;
    const withVariation = (adjustedMeasures + variation > 2) ? adjustedMeasures + variation : adjustedMeasures;
    
    return {
      ...s,
      measures: withVariation,
      lyricsLines: Math.round(s.lyricsLines * (withVariation / s.measures))
    };
  });

  return {
    totalMeasures,
    bpm,
    sections: adjustedSections
  };
}
