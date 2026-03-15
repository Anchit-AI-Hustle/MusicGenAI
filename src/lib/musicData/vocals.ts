export interface VocalProfile {
  id: string;
  label: string;
  gender: "male" | "female" | "neutral";
  register: "bass" | "baritone" | "tenor" | "alto" | "mezzo" | "soprano" | "countertenor";
  style: string;
  associatedGenres: string[];
  associatedLanguages: string[];
  modelPromptKeywords: string;
  elevenLabsVoiceId: string;
  exampleArtists: string[];
}

export const VOCAL_PROFILES: VocalProfile[] = [

  // ─── MALE VOICES ─────────────────────────────────────────────────────────────
  {
    id: "male_deep_soul",
    label: "Deep soulful male (Barry White style)",
    gender: "male", register: "bass",
    style: "Deep, resonant, silky smooth, warm bass",
    associatedGenres: ["Soul", "R&B", "Blues"],
    associatedLanguages: ["English"],
    modelPromptKeywords: "deep male bass voice, warm resonant, soulful baritone",
    elevenLabsVoiceId: "VR6AewLTigWG4xSOukaG",
    exampleArtists: ["Barry White", "Isaac Hayes", "Luther Vandross"],
  },
  {
    id: "male_rap_aggressive",
    label: "Aggressive male rapper",
    gender: "male", register: "baritone",
    style: "Hard, fast, rhythmic, aggressive delivery",
    associatedGenres: ["Hip Hop", "Drill", "Trap", "Punk"],
    associatedLanguages: ["English"],
    modelPromptKeywords: "aggressive male rap vocal, fast rhythmic delivery, hard hitting",
    elevenLabsVoiceId: "TxGEqnHWrfWFTfGW9XjX",
    exampleArtists: ["Kendrick Lamar", "Eminem", "Central Cee"],
  },
  {
    id: "male_melodic_trap",
    label: "Melodic male trap singer",
    gender: "male", register: "tenor",
    style: "Auto-tuned, melodic, emotional, singing-rapping",
    associatedGenres: ["Trap", "Melodic trap", "R&B", "Drill"],
    associatedLanguages: ["English"],
    modelPromptKeywords: "melodic male trap vocal, auto-tune, emotional, singing rap",
    elevenLabsVoiceId: "pqHfZKP75CvOlQylNhV4",
    exampleArtists: ["The Weeknd", "Drake", "Future", "Lil Uzi Vert"],
  },
  {
    id: "male_punjabi_folk",
    label: "Powerful Punjabi male voice",
    gender: "male", register: "baritone",
    style: "Strong, celebratory, bhangra energy, emotional depth",
    associatedGenres: ["Bhangra", "Punjabi Pop", "Punjabi Drill"],
    associatedLanguages: ["Punjabi", "Hindi"],
    modelPromptKeywords: "powerful punjabi male voice, bhangra energy, emotional punjabi vocals",
    elevenLabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
    exampleArtists: ["Sidhu Moosewala", "Diljit Dosanjh", "AP Dhillon", "Babbu Maan"],
  },
  {
    id: "male_bollywood",
    label: "Expressive Bollywood male",
    gender: "male", register: "tenor",
    style: "Melismatic, ornamental, emotional, classical-trained",
    associatedGenres: ["Bollywood", "Desi Hip Hop"],
    associatedLanguages: ["Hindi", "Urdu"],
    modelPromptKeywords: "bollywood male vocals, ornamental hindi singing, emotional tenor",
    elevenLabsVoiceId: "N2lVS1w4EtoT3dr4eOWO",
    exampleArtists: ["Arijit Singh", "Kumar Sanu", "Mohammed Rafi", "Sonu Nigam"],
  },
  {
    id: "male_kpop",
    label: "K-pop trained male idol",
    gender: "male", register: "tenor",
    style: "Precise, harmonized, dance-ready, emotional Korean",
    associatedGenres: ["K-Pop", "Korean R&B"],
    associatedLanguages: ["Korean", "English"],
    modelPromptKeywords: "k-pop male idol vocal, precise korean singing, harmonized",
    elevenLabsVoiceId: "onwK4e9ZLuTAKqWW03F9",
    exampleArtists: ["BTS", "EXO", "SHINee", "NCT"],
  },
  {
    id: "male_latin_urbano",
    label: "Latin urban male voice",
    gender: "male", register: "tenor",
    style: "Street Spanish, melodic, passionate, urban",
    associatedGenres: ["Reggaeton", "Latin Trap", "Latin Pop"],
    associatedLanguages: ["Spanish"],
    modelPromptKeywords: "latin urban male vocal, spanish reggaeton, passionate street",
    elevenLabsVoiceId: "ErXwobaYiN019PkySvjV",
    exampleArtists: ["Bad Bunny", "J Balvin", "Maluma"],
  },
  {
    id: "male_rock_power",
    label: "Rock power male vocals",
    gender: "male", register: "tenor",
    style: "Powerful, gritty, high range, rock screams available",
    associatedGenres: ["Rock", "Metal", "Punk", "Alternative"],
    associatedLanguages: ["English"],
    modelPromptKeywords: "rock male vocals, powerful gritty, high tenor, electric energy",
    elevenLabsVoiceId: "VR6AewLTigWG4xSOukaG",
    exampleArtists: ["Freddie Mercury", "Robert Plant", "Chris Cornell", "Eddie Vedder"],
  },
  {
    id: "male_jazz_crooner",
    label: "Jazz crooner baritone",
    gender: "male", register: "baritone",
    style: "Smooth, conversational, swing phrasing, intimate",
    associatedGenres: ["Jazz", "Blues", "Soul", "Bossa Nova"],
    associatedLanguages: ["English", "Portuguese"],
    modelPromptKeywords: "jazz male crooner, smooth baritone, swing phrasing, intimate",
    elevenLabsVoiceId: "GBv7mTt0atIp3Br8iCZE",
    exampleArtists: ["Frank Sinatra", "Dean Martin", "Tony Bennett"],
  },

  // ─── FEMALE VOICES ───────────────────────────────────────────────────────────
  {
    id: "female_pop_bright",
    label: "Bright female pop voice",
    gender: "female", register: "mezzo",
    style: "Clear, bright, punchy hooks, commercial appeal",
    associatedGenres: ["Pop", "Synth-pop", "Indie Pop", "Dance-pop"],
    associatedLanguages: ["English", "Spanish", "Korean"],
    modelPromptKeywords: "bright female pop voice, clear tone, commercial hooks, energetic",
    elevenLabsVoiceId: "EXAVITQu4vr4xnSDxMaL",
    exampleArtists: ["Taylor Swift", "Katy Perry", "Dua Lipa", "Charli XCX"],
  },
  {
    id: "female_soul_powerful",
    label: "Powerful soul diva",
    gender: "female", register: "mezzo",
    style: "Gospel-rooted, powerful belting, melismatic runs, emotional",
    associatedGenres: ["Soul", "R&B", "Gospel", "Pop"],
    associatedLanguages: ["English"],
    modelPromptKeywords: "powerful female soul vocals, gospel belting, emotional runs, diva",
    elevenLabsVoiceId: "jsCqWAovK2LkecY7zXl4",
    exampleArtists: ["Beyoncé", "Whitney Houston", "Aretha Franklin", "Alicia Keys"],
  },
  {
    id: "female_soft_rnb",
    label: "Soft female R&B whisper",
    gender: "female", register: "mezzo",
    style: "Breathy, intimate, sensual, soft runs",
    associatedGenres: ["R&B", "Alternative R&B", "Neo-soul"],
    associatedLanguages: ["English"],
    modelPromptKeywords: "soft female R&B voice, breathy intimate, gentle runs",
    elevenLabsVoiceId: "ThT5KcBeYPX3keUQqHPh",
    exampleArtists: ["SZA", "H.E.R.", "Sade", "Jhene Aiko"],
  },
  {
    id: "female_bollywood",
    label: "Bollywood female classical",
    gender: "female", register: "soprano",
    style: "High, ornamental, classical-influenced, emotional",
    associatedGenres: ["Bollywood", "Indian Classical", "Ghazal"],
    associatedLanguages: ["Hindi", "Urdu", "Punjabi"],
    modelPromptKeywords: "bollywood female vocals, high soprano, ornamental hindi, classical indian",
    elevenLabsVoiceId: "cgSgspJ2msm6clMCkdW9",
    exampleArtists: ["Lata Mangeshkar", "Shreya Ghoshal", "Asha Bhosle"],
  },
  {
    id: "female_kpop",
    label: "K-pop female idol",
    gender: "female", register: "soprano",
    style: "High, precise, cute or powerful, Korean pronunciation",
    associatedGenres: ["K-Pop", "Korean Pop", "Korean R&B"],
    associatedLanguages: ["Korean", "English"],
    modelPromptKeywords: "k-pop female idol vocals, high korean singing, precise, idol group",
    elevenLabsVoiceId: "XB0fDUnXU5powFXDhCwa",
    exampleArtists: ["BLACKPINK", "TWICE", "aespa", "IU"],
  },
  {
    id: "female_arab",
    label: "Arabic female classical",
    gender: "female", register: "mezzo",
    style: "Maqam ornamentation, quarter tones, emotional depth, melismatic",
    associatedGenres: ["Arabic Pop", "Khaleeji", "Raï"],
    associatedLanguages: ["Arabic"],
    modelPromptKeywords: "arabic female vocals, maqam ornamentation, emotional middle eastern",
    elevenLabsVoiceId: "Xb7hH8MSUJpSbSDYk0k2",
    exampleArtists: ["Fairuz", "Umm Kulthum", "Nancy Ajram", "Amr Diab"],
  },
  {
    id: "female_country",
    label: "Country female storyteller",
    gender: "female", register: "mezzo",
    style: "Warm, twangy, sincere, Southern storytelling",
    associatedGenres: ["Country", "Americana", "Folk"],
    associatedLanguages: ["English"],
    modelPromptKeywords: "country female vocals, warm twang, storytelling, sincere, southern",
    elevenLabsVoiceId: "pFZP5JQG7iQjIQuC4Bku",
    exampleArtists: ["Dolly Parton", "Carrie Underwood", "Maren Morris"],
  },
  {
    id: "female_latin",
    label: "Latin female passionate voice",
    gender: "female", register: "mezzo",
    style: "Passionate, sensual Spanish, dramatic range",
    associatedGenres: ["Latin Pop", "Salsa", "Reggaeton", "Bachata"],
    associatedLanguages: ["Spanish"],
    modelPromptKeywords: "latin female vocals, passionate spanish singing, dramatic, sensual",
    elevenLabsVoiceId: "EXAVITQu4vr4xnSDxMaL",
    exampleArtists: ["Shakira", "Jennifer Lopez", "Gloria Estefan"],
  },

  // ─── NEUTRAL / SPECIAL ───────────────────────────────────────────────────────
  {
    id: "vocoder_robot",
    label: "Vocoded / robotic voice",
    gender: "neutral", register: "baritone",
    style: "Processed, mechanical, pitched vocal synthesis",
    associatedGenres: ["Electronic", "Synth-pop", "EDM", "Techno"],
    associatedLanguages: ["English"],
    modelPromptKeywords: "vocoded vocals, robotic voice, processed harmonics, electronic filter",
    elevenLabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
    exampleArtists: ["Daft Punk", "Kraftwerk", "Bon Iver (auto-tune style)"],
  },
];

export function findVocalProfileByGenreAndLanguage(
  genre: string,
  language: string,
  gender?: "male" | "female" | "neutral"
): VocalProfile {
  let matches = VOCAL_PROFILES.filter(
    v =>
      v.associatedGenres.some(g => g.toLowerCase().includes(genre.toLowerCase())) ||
      v.associatedLanguages.includes(language)
  );
  if (gender) matches = matches.filter(v => v.gender === gender);
  if (matches.length > 0) return matches[0];
  // Default fallback
  return VOCAL_PROFILES.find(v => v.id === "female_pop_bright")!;
}

export function VOCAL_STYLE_LABELS(): string[] {
  return VOCAL_PROFILES.map(v => v.label);
}
