export interface ArtistStyle {
  name: string;
  genres: string[];
  description: string;
}

/**
 * Trending / chart-relevant artists across global genres.
 * Curated for the 2025-2026 listening landscape — covers the artists most
 * likely to be referenced as influences on this app today. Order roughly
 * follows current cultural prominence (mass streaming + cultural reach).
 */
export const ARTIST_STYLES: ArtistStyle[] = [
  // === Global Pop / R&B / Hip-Hop heavyweights ===
  { name: "Taylor Swift", genres: ["Pop", "Country", "Indie Pop"], description: "Storytelling pop with acoustic elements and catchy hooks" },
  { name: "The Weeknd", genres: ["Pop", "Synth-pop", "R&B"], description: "Dark 80s synth-pop with soaring emotional vocals" },
  { name: "Drake", genres: ["Hip Hop", "Pop", "R&B"], description: "Atmospheric trap with introspective singing/rapping" },
  { name: "Bad Bunny", genres: ["Reggaeton", "Latin Pop", "Trap"], description: "Innovative reggaeton with deep bass and distinct vocal delivery" },
  { name: "Billie Eilish", genres: ["Pop", "Alt Pop", "Electropop"], description: "Whispered intimate vocals over minimal bass-heavy production" },
  { name: "Dua Lipa", genres: ["Pop", "Synth-pop", "House"], description: "Nu-disco influenced pop with driving basslines" },
  { name: "Olivia Rodrigo", genres: ["Pop Rock", "Pop", "Alt Pop"], description: "Confessional teen pop-rock with anthemic choruses" },
  { name: "Sabrina Carpenter", genres: ["Pop", "Disco-pop"], description: "Cheeky disco-tinged pop with playful vocal phrasing" },
  { name: "Chappell Roan", genres: ["Pop", "Synth-pop"], description: "Theatrical synth-pop with bold queer storytelling" },
  { name: "SZA", genres: ["R&B", "Alt R&B", "Soul"], description: "Genre-blurring R&B with vulnerable diaristic lyrics" },
  { name: "Kendrick Lamar", genres: ["Hip Hop", "Jazz", "Funk"], description: "Complex lyricism over jazz-influenced hip hop beats" },
  { name: "Travis Scott", genres: ["Trap", "Hip Hop", "Psychedelic Rap"], description: "Auto-tuned psychedelic trap with cavernous reverbs" },
  { name: "Doja Cat", genres: ["Pop", "Hip Hop", "R&B"], description: "Genre-hopping pop-rap with razor-sharp delivery" },
  { name: "Tyler, The Creator", genres: ["Hip Hop", "Neo-Soul", "Jazz Rap"], description: "Jazz-laced rap with lush harmonic palettes" },
  { name: "Frank Ocean", genres: ["R&B", "Alt R&B", "Soul"], description: "Hazy ambient R&B with intimate confessional vocals" },
  { name: "Ariana Grande", genres: ["Pop", "R&B"], description: "Whistle-tone pop with airy R&B layering" },
  { name: "Beyoncé", genres: ["Pop", "R&B", "Country"], description: "Genre-spanning powerhouse vocals with maximalist production" },

  // === Latin / Reggaeton / Afrobeats ===
  { name: "Karol G", genres: ["Reggaeton", "Latin Pop"], description: "Bright reggaeton hooks with melodic vocal flows" },
  { name: "Peso Pluma", genres: ["Corridos Tumbados", "Regional Mexican"], description: "Trap-influenced corridos with raspy vocal delivery" },
  { name: "Rauw Alejandro", genres: ["Reggaeton", "R&B", "Latin Pop"], description: "Sleek reggaeton with futuristic R&B textures" },
  { name: "Burna Boy", genres: ["Afrobeats", "Afro-fusion"], description: "Afrobeats fused with reggae and dancehall melodics" },
  { name: "Tems", genres: ["Afrobeats", "R&B", "Afro-soul"], description: "Smoky Afro-soul with deep emotional resonance" },
  { name: "Rema", genres: ["Afrobeats", "Afro-pop"], description: "Buoyant Afro-pop with melodic earworm hooks" },
  { name: "Asake", genres: ["Afrobeats", "Amapiano"], description: "Amapiano-tinged Afrobeats with chant-style delivery" },

  // === Desi / Indian / Punjabi (high relevance for this app) ===
  { name: "AP Dhillon", genres: ["Punjabi Pop", "Synth-pop", "Trap"], description: "Modern synth-heavy Punjabi pop with smooth vocals" },
  { name: "Karan Aujla", genres: ["Punjabi Pop", "Hip Hop"], description: "Rhythmic Punjabi rap with modern Western hip hop production" },
  { name: "Diljit Dosanjh", genres: ["Bhangra", "Punjabi Pop"], description: "Classic high-energy bhangra and melodic pop" },
  { name: "Shubh", genres: ["Punjabi Drill", "Desi Hip Hop"], description: "Dark UK drill production with melodic Punjabi vocals" },
  { name: "Sidhu Moose Wala", genres: ["Bhangra", "Punjabi Hip Hop", "Trap"], description: "Aggressive Punjabi rap over folk and trap fusion beats" },
  { name: "A.R. Rahman", genres: ["Bollywood", "Classical", "Electronic"], description: "Complex orchestral arrangements mixed with electronic elements" },
  { name: "Arijit Singh", genres: ["Bollywood", "Pop"], description: "Highly emotional, soft acoustic to orchestral Hindi ballads" },
  { name: "Hanumankind", genres: ["Hip Hop", "Desi Rap"], description: "Hard-hitting Indian hip-hop with bilingual flow" },
  { name: "Anuv Jain", genres: ["Indie Pop", "Acoustic"], description: "Stripped-down Hindi acoustic indie with introspective writing" },
  { name: "Diljit + Sidhu Moose Wala", genres: ["Punjabi Pop", "Bhangra"], description: "High-octane Punjabi crossover energy" },

  // === K-Pop / J-Pop ===
  { name: "BTS", genres: ["K-Pop", "Hip Hop", "Pop"], description: "Maximalist K-pop with EDM, hip-hop and ballad spans" },
  { name: "BLACKPINK", genres: ["K-Pop", "EDM", "Hip Hop"], description: "Trap-EDM K-pop with anthemic group choruses" },
  { name: "NewJeans", genres: ["K-Pop", "Y2K Pop"], description: "Y2K-aesthetic K-pop with airy harmonies and breakbeats" },
  { name: "Stray Kids", genres: ["K-Pop", "Hip Hop"], description: "Hard-hitting hip-hop K-pop with rock crossovers" },
  { name: "LE SSERAFIM", genres: ["K-Pop", "Dance Pop"], description: "Sleek hard-pop K-pop with confident attitude" },

  // === Electronic / Producer ===
  { name: "Fred again..", genres: ["House", "UK Garage", "Electronic"], description: "Voice-memo-driven house with intimate sample chops" },
  { name: "Skrillex", genres: ["Dubstep", "EDM", "Bass"], description: "Aggressive bass design with hyper-edited drops" },
  { name: "Disclosure", genres: ["House", "UK Garage"], description: "Garage-house with soulful vocal collaborations" },
  { name: "Daft Punk", genres: ["House", "Funk", "Disco"], description: "Robotic vocoded funk-house with iconic synth riffs" },
  { name: "Kaytranada", genres: ["House", "Funk", "Hip Hop"], description: "Bouncy funk-house with chopped soul samples" },
  { name: "ODESZA", genres: ["Electronic", "Indietronica"], description: "Cinematic future-bass with stadium-sized breakdowns" },
  { name: "Calvin Harris", genres: ["EDM", "House", "Pop"], description: "Festival-ready house with stadium pop hooks" },
  { name: "Flume", genres: ["Future Bass", "Electronic"], description: "Glitchy future-bass with sliced vocal textures" },

  // === Indie / Alt / Rock ===
  { name: "Tame Impala", genres: ["Psychedelic Rock", "Indie", "Synth-pop"], description: "Lush psychedelic synth-rock with falsetto-driven dreamscapes" },
  { name: "Phoebe Bridgers", genres: ["Indie Folk", "Indie Rock"], description: "Hushed indie-folk with devastating cinematic builds" },
  { name: "Mitski", genres: ["Indie Rock", "Art Pop"], description: "Theatrical indie with sudden dynamic shifts" },
  { name: "boygenius", genres: ["Indie Rock", "Indie Folk"], description: "Three-vocal indie supergroup with layered harmonies" },
  { name: "Arctic Monkeys", genres: ["Indie Rock", "Alt Rock"], description: "Lounge-rock leanings with sharp lyrical wit" },
  { name: "The 1975", genres: ["Pop Rock", "Synth-pop", "Indie Pop"], description: "Glossy 80s-inflected indie-pop with self-aware lyrics" },
  { name: "Lana Del Rey", genres: ["Dream Pop", "Baroque Pop"], description: "Cinematic torch-song dream-pop with vintage Americana" },

  // === Country / Americana ===
  { name: "Zach Bryan", genres: ["Country", "Americana", "Indie Folk"], description: "Raw acoustic country with confessional storytelling" },
  { name: "Morgan Wallen", genres: ["Country", "Country Rap"], description: "Modern country with hip-hop-inflected delivery" },
  { name: "Chris Stapleton", genres: ["Country", "Southern Rock"], description: "Soulful outlaw country with bluesy guitar" },

  // === Producer / Songwriter influences ===
  { name: "Jack Antonoff", genres: ["Pop", "Indie Pop"], description: "Maximalist pop production with vintage-synth nostalgia" },
  { name: "Metro Boomin", genres: ["Trap", "Hip Hop"], description: "Cinematic trap production with orchestral menace" },
  { name: "Pharrell Williams", genres: ["Pop", "Hip Hop", "Funk"], description: "Minimalist funk-pop with iconic claps and bass" },
  { name: "Hans Zimmer", genres: ["Cinematic", "Orchestral"], description: "Massive orchestral-electronic film scoring" },
];

export function getArtistDescription(name: string): string | null {
  return ARTIST_STYLES.find(a => a.name === name)?.description ?? null;
}

export function ARTIST_NAMES(): string[] { return ARTIST_STYLES.map(a => a.name); }
