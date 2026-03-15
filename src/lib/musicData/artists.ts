export interface ArtistReference {
  name: string;
  genres: string[];
  languages: string[];
  productionNotes: string;
}

export const ARTIST_DATABASE: ArtistReference[] = [
  // South Asian
  { name: "AP Dhillon",          genres: ["Punjabi Pop", "Punjabi Drill", "R&B"], languages: ["Punjabi", "English"], productionNotes: "dark R&B beats with Punjabi melodies, slow tempo, emotional" },
  { name: "Sidhu Moosewala",     genres: ["Punjabi Pop", "Desi Hip Hop"],          languages: ["Punjabi"],           productionNotes: "street Punjabi, raw storytelling, bhangra-meets-trap" },
  { name: "Diljit Dosanjh",      genres: ["Bhangra", "Punjabi Pop"],               languages: ["Punjabi"],           productionNotes: "powerful bhangra energy, party anthem production" },
  { name: "Arijit Singh",        genres: ["Bollywood"],                             languages: ["Hindi", "Urdu"],     productionNotes: "emotionally devastating ballads, ornamental voice" },
  { name: "A.R. Rahman",         genres: ["Bollywood", "World Music"],              languages: ["Hindi", "Tamil"],    productionNotes: "orchestral cinematic, fusion of East and West" },
  { name: "Divine",              genres: ["Desi Hip Hop"],                          languages: ["Hindi", "English"],  productionNotes: "Mumbai street rap, Gully Boy energy, raw production" },
  { name: "Badshah",             genres: ["Punjabi Pop", "Bollywood", "Desi Pop"],  languages: ["Punjabi", "Hindi"],  productionNotes: "party anthem producer, catchy hooks, commercial pop" },
  // Western Hip Hop
  { name: "Kendrick Lamar",      genres: ["Hip Hop"],           languages: ["English"], productionNotes: "complex flows, jazz samples, West Coast, lyrical depth" },
  { name: "Drake",               genres: ["Hip Hop", "R&B"],    languages: ["English"], productionNotes: "OVO sound, 808s, melodic rap, melancholic club" },
  { name: "Travis Scott",        genres: ["Trap"],               languages: ["English"], productionNotes: "psychedelic trap, distorted 808s, chorus chanting" },
  { name: "The Weeknd",          genres: ["R&B", "Trap"],        languages: ["English"], productionNotes: "dark R&B, falsetto, cinematic noir, 80s influence" },
  { name: "Central Cee",         genres: ["UK Drill"],           languages: ["English"], productionNotes: "UK drill flow, calm delivery, dark piano samples" },
  { name: "Dave",                genres: ["UK Drill", "Hip Hop"],languages: ["English"], productionNotes: "UK drill storytelling, political, introspective" },
  // Western Pop
  { name: "Taylor Swift",        genres: ["Pop", "Country", "Indie Pop"], languages: ["English"], productionNotes: "narrative songwriting, bridge-focused structure, emotional" },
  { name: "Dua Lipa",            genres: ["Pop", "Disco"],                 languages: ["English"], productionNotes: "nu-disco production, four-on-the-floor, bright hooks" },
  { name: "Billie Eilish",       genres: ["Indie Pop", "Alternative"],     languages: ["English"], productionNotes: "whisper dynamic, dark pop, spatial production, ASMR quality" },
  { name: "Post Malone",         genres: ["Pop", "Hip Hop", "Rock"],       languages: ["English"], productionNotes: "cross-genre, auto-tune melodic, emotional themes" },
  // Latin
  { name: "Bad Bunny",           genres: ["Reggaeton", "Latin Trap"],  languages: ["Spanish"], productionNotes: "trap-infused reggaeton, experimental, strong personality" },
  { name: "J Balvin",            genres: ["Reggaeton", "Latin Pop"],   languages: ["Spanish"], productionNotes: "colorful reggaeton, party anthems, commercial appeal" },
  { name: "Shakira",             genres: ["Latin Pop", "Rock"],         languages: ["Spanish", "English"], productionNotes: "global crossover, belly dance rhythm, powerful female vocals" },
  // K-Pop / J-Pop
  { name: "BTS",                 genres: ["K-Pop"],    languages: ["Korean", "English"], productionNotes: "layered harmonies, complex production, rap+sing group dynamic" },
  { name: "BLACKPINK",           genres: ["K-Pop"],    languages: ["Korean", "English"], productionNotes: "hip hop K-pop, powerful girls, heavy drop, English crossover" },
  { name: "IU",                  genres: ["K-Pop"],    languages: ["Korean"],             productionNotes: "delicate indie pop, clear vocals, emotional ballads" },
  // Electronic
  { name: "Daft Punk",           genres: ["Electronic", "House", "Funk"], languages: ["English"], productionNotes: "robotic vocals, funk sampling, vocoder, 70s-80s influenced" },
  { name: "Calvin Harris",       genres: ["EDM", "House", "Pop"],         languages: ["English"], productionNotes: "huge drops, radio-friendly, festival anthems, big production" },
  // African
  { name: "Burna Boy",           genres: ["Afrobeats"],  languages: ["English", "Yoruba"], productionNotes: "afro fusion, political themes, international crossover" },
  { name: "Wizkid",              genres: ["Afrobeats"],  languages: ["English", "Yoruba"], productionNotes: "minimalist production, smooth afrobeats, sensual vibes" },
  // Rock/Metal
  { name: "Metallica",           genres: ["Metal"],    languages: ["English"], productionNotes: "thrash metal, tight riffs, heavy production, massive drums" },
  { name: "Arctic Monkeys",      genres: ["Indie Rock", "Rock"], languages: ["English"], productionNotes: "British indie, guitar-driven, narrative lyrics, Alex Turner prose" },
];

export function findArtistsByGenre(genre: string): ArtistReference[] {
  return ARTIST_DATABASE.filter(a =>
    a.genres.some(g => g.toLowerCase().includes(genre.toLowerCase()))
  );
}

export function findArtistsByLanguage(language: string): ArtistReference[] {
  return ARTIST_DATABASE.filter(a => a.languages.includes(language));
}

export function ARTIST_NAMES(): string[] {
  return ARTIST_DATABASE.map(a => a.name);
}
