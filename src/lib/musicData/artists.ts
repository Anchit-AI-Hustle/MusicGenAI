export interface ArtistStyle {
  name: string;
  genres: string[];
  description: string;
}

export const ARTIST_STYLES: ArtistStyle[] = [
  { name: "The Weeknd", genres: ["Pop", "Synth-pop", "R&B"], description: "Dark 80s synth-pop with soaring emotional vocals" },
  { name: "Drake", genres: ["Hip Hop", "Pop", "R&B"], description: "Atmospheric trap with introspective singing/rapping" },
  { name: "Taylor Swift", genres: ["Pop", "Country", "Indie Pop"], description: "Storytelling pop with acoustic elements and catchy hooks" },
  { name: "Bad Bunny", genres: ["Reggaeton", "Latin Pop", "Trap"], description: "Innovative reggaeton with deep bass and distinct vocal delivery" },
  { name: "Dua Lipa", genres: ["Pop", "Synth-pop", "House"], description: "Nu-disco influenced pop with driving basslines" },
  { name: "Kendrick Lamar", genres: ["Hip Hop", "Jazz", "Funk"], description: "Complex lyricism over jazz-influenced hip hop beats" },
  { name: "AP Dhillon", genres: ["Punjabi Pop", "Synth-pop", "Trap"], description: "Modern synth-heavy Punjabi pop with smooth vocals" },
  { name: "Sidhu Moose Wala", genres: ["Bhangra", "Punjabi Hip Hop", "Trap"], description: "Aggressive Punjabi rap over folk and trap fusion beats" },
  { name: "Diljit Dosanjh", genres: ["Bhangra", "Punjabi Pop"], description: "Classic high-energy bhangra and melodic pop" },
  { name: "A.R. Rahman", genres: ["Bollywood", "Classical", "Electronic"], description: "Complex orchestral arrangements mixed with electronic elements" },
  { name: "Karan Aujla", genres: ["Punjabi Pop", "Hip Hop"], description: "Rhythmic Punjabi rap with modern Western hip hop production" },
  { name: "Shubh", genres: ["Punjabi Drill", "Desi Hip Hop"], description: "Dark UK drill production with melodic Punjabi vocals" },
  { name: "Arijit Singh", genres: ["Bollywood", "Pop"], description: "Highly emotional, soft acoustic to orchestral Hindi ballads" }
];

export function getArtistDescription(name: string): string | null {
  return ARTIST_STYLES.find(a => a.name === name)?.description ?? null;
}

export function ARTIST_NAMES(): string[] { return ARTIST_STYLES.map(a => a.name); }
