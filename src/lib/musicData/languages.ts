export interface LanguageDefinition {
  name: string;
  nativeScript: string;
  romanizationStyle: string;
  aceSupportTier: "primary" | "supported" | "limited";
  minimaxSupport: boolean;
  syllableDensity: number; // relative to English = 1.0. Higher = more syllables per phrase
  codemixPartners: string[];
  associatedGenres: string[];
  lyricsPromptInstruction: string;
  exampleCodemix: string;
}

export const LANGUAGE_DATABASE: LanguageDefinition[] = [

  // ─── SOUTH ASIAN ─────────────────────────────────────────────────────────────
  {
    name: "Punjabi",
    nativeScript: "Gurmukhi / Shahmukhi",
    romanizationStyle: "Romanized Punjabi (no Gurmukhi script)",
    aceSupportTier: "supported",
    minimaxSupport: false,
    syllableDensity: 1.0,
    codemixPartners: ["English"],
    associatedGenres: ["Bhangra", "Punjabi Pop", "Punjabi Drill", "Desi Hip Hop"],
    lyricsPromptInstruction: "Write primarily in Punjabi using romanized transliteration. Natural codemixing with English words and phrases is expected, as is standard in modern Punjabi pop, bhangra, and drill music. At least 65-75% of words must be Punjabi. Common Punjabi words to use naturally: dil (heart), yaar (friend), saanu (to us), kudi (girl), munda (boy), nachna (to dance), pyaar (love), sohna/sohni (beautiful), rabba (God), wah (wow), oye (hey), ki haal (how are you). Do NOT write English with one Punjabi word inserted. The rhythm must feel Punjabi.",
    exampleCodemix: "Tu meri jaan hai baby, dil tera deewana, let's go yaar, nachdi jaave",
  },
  {
    name: "Hindi",
    nativeScript: "Devanagari",
    romanizationStyle: "Romanized Hindi (Hinglish)",
    aceSupportTier: "primary",
    minimaxSupport: false,
    syllableDensity: 1.1,
    codemixPartners: ["English"],
    associatedGenres: ["Bollywood", "Desi Hip Hop", "Hindi Pop"],
    lyricsPromptInstruction: "Write primarily in Hindi using romanized transliteration. Natural Hindi-English codemixing (Hinglish) is standard in modern Bollywood and Desi pop. At least 60% Hindi. Common words: dil, pyaar, mohabbat, yaar, zindagi, kabhi, teri, meri, hum, tum, aaj, raat, khwaab, ishq.",
    exampleCodemix: "Dil mera dhadak raha, you make my heart race, tere bina incomplete",
  },
  {
    name: "Urdu",
    nativeScript: "Nastaliq script",
    romanizationStyle: "Romanized Urdu",
    aceSupportTier: "supported",
    minimaxSupport: false,
    syllableDensity: 1.1,
    codemixPartners: ["English", "Hindi"],
    associatedGenres: ["Ghazal", "Qawwali", "Urdu Pop", "Pakistani Pop"],
    lyricsPromptInstruction: "Write in Urdu using romanized transliteration. Urdu poetry tradition values beautiful imagery and metaphor. Words like: ishq, wafa, junoon, dard, ulfat, tamanna, rooh, subah, shaam, aankhein. Some English is acceptable in modern Urdu pop but Urdu should dominate with poetic rhythm.",
    exampleCodemix: "Ishq mein dooba hoon main, lost in your eyes, tere bina kuch bhi nahi",
  },
  {
    name: "Bengali",
    nativeScript: "Bengali script",
    romanizationStyle: "Romanized Bengali",
    aceSupportTier: "supported",
    minimaxSupport: false,
    syllableDensity: 1.2,
    codemixPartners: ["English"],
    associatedGenres: ["Bangla Pop", "Rabindra Sangeet", "Bangla Rock"],
    lyricsPromptInstruction: "Write in Bengali using romanized transliteration. Bengali music has a rich literary tradition. Common words: aamar, bhalo, basha, mon (heart/mind), premer, tomar, shona, raat, akash, nadi.",
    exampleCodemix: "Aamar mon tomar kache, my heart belongs to you, bhalobashar gaan gai",
  },
  {
    name: "Tamil",
    nativeScript: "Tamil script",
    romanizationStyle: "Romanized Tamil",
    aceSupportTier: "supported",
    minimaxSupport: false,
    syllableDensity: 1.3,
    codemixPartners: ["English"],
    associatedGenres: ["Tamil Pop", "Kollywood", "Tamil Folk"],
    lyricsPromptInstruction: "Write in Tamil using romanized transliteration. Tamil cinema and pop music tradition. Words: en (my), nee (you), kadhal (love), vaanam (sky), manasu (heart), paadal (song), paarvaiyil (in sight), azhagu (beauty). Tamil lyrics have melodic cadence.",
    exampleCodemix: "En manasu nee thaan, you are my everything, kadhal konjam crazy",
  },
  {
    name: "Telugu",
    nativeScript: "Telugu script",
    romanizationStyle: "Romanized Telugu",
    aceSupportTier: "supported",
    minimaxSupport: false,
    syllableDensity: 1.3,
    codemixPartners: ["English"],
    associatedGenres: ["Tollywood", "Telugu Pop", "Telugu Folk"],
    lyricsPromptInstruction: "Write in Telugu using romanized transliteration. Telugu songs are known for poetic beauty. Words: nee, nenu, premalo, manasu, akasam, prema, navvulu, kallu, gundelu.",
    exampleCodemix: "Nee kళla lo prema chusa, fell in love with your eyes, manasu maatladutondi",
  },

  // ─── EAST ASIAN ──────────────────────────────────────────────────────────────
  {
    name: "Korean",
    nativeScript: "Hangul",
    romanizationStyle: "Romanized Korean (no Hangul script)",
    aceSupportTier: "primary",
    minimaxSupport: false,
    syllableDensity: 0.9,
    codemixPartners: ["English"],
    associatedGenres: ["K-Pop", "Korean R&B", "Korean Hip Hop"],
    lyricsPromptInstruction: "Write primarily in Korean using romanized romanization (no actual Hangul characters). Korean-English codemixing is standard in K-pop. Common words: saranghae (I love you), nae maeum (my heart), gateun (same), honja (alone), bimil (secret), haengbok (happy). At least 60% Korean phonetically.",
    exampleCodemix: "Nae maeum sok gipeun곳 where only you exist, saranghae baby",
  },
  {
    name: "Japanese",
    nativeScript: "Hiragana / Katakana / Kanji",
    romanizationStyle: "Romaji (romanized Japanese)",
    aceSupportTier: "primary",
    minimaxSupport: false,
    syllableDensity: 1.5,
    codemixPartners: ["English"],
    associatedGenres: ["J-Pop", "Anime", "City Pop", "Japanese Rock"],
    lyricsPromptInstruction: "Write primarily in Japanese using romaji (romanized). Japanese pop songs often include English phrases naturally. Common words: kokoro (heart), ai (love), yume (dream), sora (sky), kioku (memory), kimi (you), boku/watashi (I). Japanese syllable structure makes every syllable equal length.",
    exampleCodemix: "Kimi no koe ga kikitakute, calling out your name, kokoro ga tomaranai",
  },
  {
    name: "Mandarin",
    nativeScript: "Simplified Chinese characters",
    romanizationStyle: "Pinyin romanization",
    aceSupportTier: "primary",
    minimaxSupport: true,
    syllableDensity: 0.8,
    codemixPartners: ["English"],
    associatedGenres: ["Mandopop", "Chinese R&B", "Chinese Hip Hop"],
    lyricsPromptInstruction: "Write primarily in Mandarin using pinyin romanization (no Chinese characters). Mandarin pop (Mandopop) often includes English phrases. Common words: wo ai ni (I love you), xin (heart), meng (dream), yue liang (moon), tian shi (angel), ni de (your), mei li (beautiful).",
    exampleCodemix: "Wo ai ni baby, ni de xiao rong rang wo, can't stop thinking about you",
  },

  // ─── WESTERN ─────────────────────────────────────────────────────────────────
  {
    name: "English",
    nativeScript: "Latin alphabet",
    romanizationStyle: "Standard English",
    aceSupportTier: "primary",
    minimaxSupport: true,
    syllableDensity: 1.0,
    codemixPartners: [],
    associatedGenres: ["Pop", "Rock", "Hip Hop", "R&B", "Country", "EDM", "Metal"],
    lyricsPromptInstruction: "Write in standard English. Match vocabulary, register, and slang to the genre: Hip Hop uses AAVE and street vernacular; Pop uses accessible emotional language; Country uses rural Southern American imagery; Metal uses dark imagery and power.",
    exampleCodemix: "Standard English — no codemixing needed unless genre-specific slang",
  },
  {
    name: "Spanish",
    nativeScript: "Latin alphabet",
    romanizationStyle: "Standard Spanish",
    aceSupportTier: "primary",
    minimaxSupport: false,
    syllableDensity: 1.2,
    codemixPartners: ["English"],
    associatedGenres: ["Latin Pop", "Reggaeton", "Salsa", "Bachata", "Flamenco"],
    lyricsPromptInstruction: "Write primarily in Spanish. Spanglish codemixing is acceptable and natural in reggaeton and Latin urban genres. Pure Spanish is preferred for salsa, flamenco, and romantic ballads.",
    exampleCodemix: "Tu eres mi vida entera, you know I need you, no puedo vivir sin ti",
  },
  {
    name: "French",
    nativeScript: "Latin alphabet",
    romanizationStyle: "Standard French",
    aceSupportTier: "primary",
    minimaxSupport: false,
    syllableDensity: 1.2,
    codemixPartners: ["English"],
    associatedGenres: ["French Pop", "Chanson", "French Hip Hop", "Electronic"],
    lyricsPromptInstruction: "Write primarily in French. French music values beautiful phrasing (belle langue). French hip hop commonly mixes with English. French chansons are poetic and literary.",
    exampleCodemix: "Je t'aime comme le soleil, you light up my world, sans toi je suis perdu",
  },
  {
    name: "Portuguese",
    nativeScript: "Latin alphabet",
    romanizationStyle: "Standard Portuguese (Brazilian or European)",
    aceSupportTier: "supported",
    minimaxSupport: false,
    syllableDensity: 1.2,
    codemixPartners: ["English", "Spanish"],
    associatedGenres: ["Bossa Nova", "Sertanejo", "Funk Carioca", "Brazilian Pop"],
    lyricsPromptInstruction: "Write in Portuguese. Specify Brazilian Portuguese (softer, nasal vowels, more open) or European Portuguese. Bossa nova lyrics are poetic and understated. Funk Carioca (Brazilian funk) is more street-level.",
    exampleCodemix: "Meu amor, meu coração, you are everything to me, sem você não vivo",
  },
  {
    name: "German",
    nativeScript: "Latin alphabet",
    romanizationStyle: "Standard German",
    aceSupportTier: "supported",
    minimaxSupport: false,
    syllableDensity: 0.9,
    codemixPartners: ["English"],
    associatedGenres: ["Schlager", "German Hip Hop", "Neue Deutsche Welle", "Rammstein-style"],
    lyricsPromptInstruction: "Write in German. German has compound words and strong consonants that can be used rhythmically. German hip hop (Deutschrap) is very popular. German rock has a powerful gutural quality.",
    exampleCodemix: "Mein Herz schlägt nur für dich, you are my everything, ich liebe dich so sehr",
  },
  {
    name: "Italian",
    nativeScript: "Latin alphabet",
    romanizationStyle: "Standard Italian",
    aceSupportTier: "supported",
    minimaxSupport: false,
    syllableDensity: 1.3,
    codemixPartners: ["English"],
    associatedGenres: ["Italian Pop", "Cantautore", "Italian Opera", "Italian Rock"],
    lyricsPromptInstruction: "Write in Italian. Italian is highly melodic and vowel-rich, making it naturally musical. Italian pop values romance and poetic imagery. Opera tradition influences vocal ornamentation.",
    exampleCodemix: "Amore mio, sei il mio sole, you make me feel alive, voglio stare con te",
  },
  {
    name: "Russian",
    nativeScript: "Cyrillic",
    romanizationStyle: "Romanized Russian (no Cyrillic script)",
    aceSupportTier: "supported",
    minimaxSupport: false,
    syllableDensity: 0.9,
    codemixPartners: ["English"],
    associatedGenres: ["Russian Pop", "Russian Hip Hop", "Russian Electronic"],
    lyricsPromptInstruction: "Write in Russian using romanized transliteration (no Cyrillic). Russian pop is emotional and melodramatic. Words: lyubov (love), serdtse (heart), mechta (dream), noch (night), nebo (sky).",
    exampleCodemix: "Moya lyubov, ty moe serdtse, you are my everything, ne mogu bez tebya",
  },
  {
    name: "Arabic",
    nativeScript: "Arabic script",
    romanizationStyle: "Romanized Arabic",
    aceSupportTier: "supported",
    minimaxSupport: false,
    syllableDensity: 0.9,
    codemixPartners: ["English", "French"],
    associatedGenres: ["Arabic Pop", "Khaleeji", "Raï", "Arabic Hip Hop"],
    lyricsPromptInstruction: "Write in Arabic using romanized transliteration. Arabic music uses maqam modal scales which create specific emotional colors. Quarter tone ornaments in the melody match ornamental vocal delivery. Words: habibi/habibti (my love), albi (my heart), ain (eye), shams (sun), leila (night), wein (where).",
    exampleCodemix: "Habibi albi kello lak, you have my whole heart, ma baada gheirak",
  },
  {
    name: "Turkish",
    nativeScript: "Latin alphabet (modern Turkish)",
    romanizationStyle: "Standard Turkish",
    aceSupportTier: "supported",
    minimaxSupport: false,
    syllableDensity: 1.0,
    codemixPartners: ["English"],
    associatedGenres: ["Turkish Pop", "Arabesk", "Turkish Hip Hop", "Turkish Folk"],
    lyricsPromptInstruction: "Write in Turkish. Turkish pop (Türkçe pop) is very melodic. Words: seni seviyorum (I love you), kalbim (my heart), gözlerin (your eyes), aşk (love), güzel (beautiful), gece (night).",
    exampleCodemix: "Seni seviyorum canım, you are everything, kalbim sadece senin için",
  },

  // ─── AFRICAN ─────────────────────────────────────────────────────────────────
  {
    name: "Yoruba",
    nativeScript: "Latin alphabet (tonal)",
    romanizationStyle: "Standard Yoruba",
    aceSupportTier: "limited",
    minimaxSupport: false,
    syllableDensity: 1.1,
    codemixPartners: ["English", "Pidgin"],
    associatedGenres: ["Afrobeats", "Fuji", "Juju", "Afropop"],
    lyricsPromptInstruction: "Write in Yoruba with natural English and Nigerian Pidgin codemixing. Yoruba is tonal and rhythmically rich. Common in Nigerian afrobeats. Words: ife (love), opolopo (plenty), awa (we), ire (good things), ore mi (my friend), ololufe (beloved).",
    exampleCodemix: "Ife mi, you are my everything, awa go dance all night, ire ni o",
  },
  {
    name: "Swahili",
    nativeScript: "Latin alphabet",
    romanizationStyle: "Standard Swahili",
    aceSupportTier: "limited",
    minimaxSupport: false,
    syllableDensity: 1.2,
    codemixPartners: ["English"],
    associatedGenres: ["Bongo Flava", "East African Pop", "Afrobeats"],
    lyricsPromptInstruction: "Write in Swahili with natural English codemixing. Bongo Flava (Tanzanian music) is the main context. Words: nakupenda (I love you), moyo (heart), usiku (night), ndoto (dream), rafiki (friend), nzuri (good/beautiful).",
    exampleCodemix: "Nakupenda sana baby, moyo wangu ni wako, you make me complete",
  },
  {
    name: "Amharic",
    nativeScript: "Ge'ez script",
    romanizationStyle: "Romanized Amharic",
    aceSupportTier: "limited",
    minimaxSupport: false,
    syllableDensity: 1.1,
    codemixPartners: ["English"],
    associatedGenres: ["Ethiopian Pop", "Ethio-jazz", "Ethiopian Hip Hop"],
    lyricsPromptInstruction: "Write in Amharic using romanized transliteration. Ethiopian music has pentatonic scales and unique rhythms. Words: ewedihalehu (I love you), libi (heart), tizita (nostalgia/memory), amlak (God), konjo (beautiful).",
    exampleCodemix: "Ewedihalehu, you are my tizita, libi nachew libe",
  },
];

// ─── LOOKUP AND UTILITY FUNCTIONS ────────────────────────────────────────────

export function findLanguage(name: string): LanguageDefinition | null {
  return LANGUAGE_DATABASE.find(l =>
    l.name.toLowerCase() === name.toLowerCase()
  ) ?? null;
}

export function getLyricsInstruction(language: string, description: string): string {
  const lang = findLanguage(language);
  if (lang) return lang.lyricsPromptInstruction;
  // Fallback for unlisted languages
  return `Write lyrics primarily in ${language}. Respect the natural rhythm, vocabulary, and musical conventions of ${language} popular music.`;
}

export function LANGUAGE_NAMES(): string[] {
  return LANGUAGE_DATABASE.map(l => l.name);
}

export function isMiniMaxCompatible(language: string): boolean {
  const lang = findLanguage(language);
  return lang?.minimaxSupport ?? false;
}

export function isAceStepPrimary(language: string): boolean {
  const lang = findLanguage(language);
  return lang?.aceSupportTier === "primary";
}
