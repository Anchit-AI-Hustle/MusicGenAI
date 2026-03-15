export interface CreativeContext {
  genre: string;
  subgenre: string;
  tempo: number;
  duration: number;
  mood: string;
  songStructure: string;
  vocalStyle: string;
  vocalIntensity: number;
  vocalLanguage: string;
  vocalLanguages: string[]; // For reverse compatibility or multiple selections
  vocalEffects: string[];
  lyrics: string;
  lyricTheme: string;
  artistInspiration: string;
  videoStyle: string;
  songDescription: string;
  instrumentalOnly?: boolean;
  vocalGender?: "male" | "female" | "neutral";
  key?: string;
  scale?: string;
}
