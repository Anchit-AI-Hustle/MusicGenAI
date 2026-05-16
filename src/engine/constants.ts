export const TEMPO_RANGES = {
  MIN: 40,
  MAX: 220,
  GENRE_CENTERS: {
    'hip-hop': 85,
    trap: 140,
    edm: 128,
    pop: 110,
    rock: 130,
    jazz: 120,
    classical: 80,
    metal: 160,
    rnb: 90,
    chill: 75,
    folk: 95,
    blues: 100,
    reggae: 90,
    country: 105,
    funk: 108,
    soul: 92,
    ambient: 70,
    house: 125,
    techno: 135,
    'drum-and-bass': 170,
  } as const,
} as const;

export const VOCAL_INTENSITY_RANGE = { MIN: 1, MAX: 10 } as const;
export const DURATION_RANGE = { MIN: 30, MAX: 600 } as const;
export const ALBUM_SONG_COUNT_RANGE = { MIN: 2, MAX: 20 } as const;
export const MAX_INSTRUMENTATION_COUNT = 10 as const;
export const GENERATION_PROMPT_WORD_RANGE = { MIN: 80, MAX: 150 } as const;
// Suno/Udio-grade prompts. Floor (MIN) prevents one-liners; MAX is a soft
// hint only — the local fallback now skips the truncation step entirely
// for prose fields (see suggestEngine.suggestMusicPrompt). Edge-function
// LLM responses also have no upper word cap.
export const SUGGEST_PROMPT_WORD_RANGE = { MIN: 30, MAX: 80 } as const;
export const MOOD_VALENCE_CONFLICT_THRESHOLD = 3 as const;
export const ALBUM_MIN_TEMPO_SPREAD = 20 as const;

export const ENERGY_FROM_TEMPO: Array<{ range: [number, number]; energy: number }> = [
  { range: [40, 70], energy: 2 },
  { range: [71, 100], energy: 4 },
  { range: [101, 130], energy: 6 },
  { range: [131, 160], energy: 8 },
  { range: [161, 220], energy: 10 },
];

export const STRUCTURE_DURATION_RATIOS: Record<string, number> = {
  Intro: 0.08,
  Verse: 0.20,
  'Pre-Chorus': 0.10,
  Chorus: 0.20,
  Bridge: 0.12,
  Outro: 0.10,
  Drop: 0.18,
  Hook: 0.15,
  Solo: 0.12,
  Build: 0.10,
  Breakdown: 0.10,
  Riff: 0.08,
  Theme: 0.18,
  Development: 0.22,
  Recapitulation: 0.18,
  Coda: 0.10,
  Head: 0.18,
};

export const DEFAULT_STRUCTURE = 'Intro-Verse-Chorus-Verse-Chorus-Bridge-Chorus-Outro' as const;

export const CANONICAL_MOODS = [
  'happy',
  'sad',
  'angry',
  'romantic',
  'epic',
  'melancholic',
  'euphoric',
  'dark',
  'chill',
  'tense',
] as const;

export const MOOD_MAPPINGS = {
  happy: { valence: 9, arousal: 7, tension: 2 },
  sad: { valence: 2, arousal: 3, tension: 5 },
  angry: { valence: 3, arousal: 9, tension: 9 },
  romantic: { valence: 8, arousal: 5, tension: 3 },
  epic: { valence: 7, arousal: 9, tension: 8 },
  melancholic: { valence: 3, arousal: 4, tension: 6 },
  euphoric: { valence: 10, arousal: 10, tension: 1 },
  dark: { valence: 2, arousal: 6, tension: 8 },
  chill: { valence: 6, arousal: 2, tension: 1 },
  tense: { valence: 4, arousal: 7, tension: 10 },
} as const;

export const HIGH_AROUSAL_WORDS = ['intense', 'heavy', 'chaotic', 'powerful', 'wild', 'energetic', 'fierce'] as const;
export const LOW_AROUSAL_WORDS = ['soft', 'gentle', 'warm', 'quiet', 'peaceful', 'calm', 'tender'] as const;
export const HIGH_TENSION_WORDS = ['dark', 'gritty', 'conflict', 'brutal', 'harsh', 'aggressive', 'desperate'] as const;
export const LOW_TENSION_WORDS = ['bright', 'light', 'airy', 'sweet', 'playful', 'joyful'] as const;

export const POSITIVE_WORDS = [
  'love', 'joy', 'happy', 'bright', 'hope', 'dream', 'free', 'shine', 'smile',
  'bliss', 'warm', 'light', 'peace', 'rise', 'soar', 'laugh', 'dance', 'glow', 'thrive', 'celebrate',
  'radiant', 'uplift', 'paradise', 'golden', 'alive',
] as const;

export const NEGATIVE_WORDS = [
  'pain', 'cry', 'dark', 'broken', 'lost', 'dead', 'hurt', 'hate', 'fear',
  'tears', 'alone', 'empty', 'void', 'shatter', 'despair', 'hollow', 'bleed', 'cold', 'numb',
  'grieve', 'suffer', 'collapse', 'fade', 'burn', 'torn',
] as const;

export const TENSION_WORDS = [
  'fight', 'rage', 'war', 'chaos', 'clash', 'struggle', 'conflict',
  'explode', 'rebel', 'crash', 'destroy', 'fury', 'storm', 'battle', 'resist',
] as const;

export const GENRE_INSTRUMENTATION_MAP: Record<string, string[]> = {
  'hip-hop': ['808 bass', 'trap hi-hats', 'sampler', 'sub kick', 'synth pad'],
  trap: ['808 bass', 'hi-hat rolls', 'sub kick', 'arp synth', 'snare clap'],
  rock: ['electric guitar', 'drums', 'bass guitar', 'distortion pedal'],
  metal: ['distorted guitar', 'double kick', 'bass drop', 'power chords', 'blast beats'],
  jazz: ['upright bass', 'piano', 'trumpet', 'brush drums', 'saxophone'],
  edm: ['synthesizer', '4-on-floor kick', 'pad', 'arp', 'sidechain bass'],
  classical: ['strings', 'piano', 'woodwinds', 'orchestral percussion', 'choir'],
  pop: ['synth bass', 'programmed drums', 'pad', 'guitar', 'keys'],
  rnb: ['rhodes', '808', 'soul vocals', 'smooth bass', 'synth pad'],
  chill: ['lo-fi drums', 'warm pad', 'muted guitar', 'soft bass', 'vinyl crackle'],
  ambient: ['evolving pad', 'field recordings', 'sparse piano', 'granular texture'],
  house: ['4-on-floor kick', 'offbeat hi-hat', 'sub bass', 'chord stabs', 'arp'],
  techno: ['industrial kick', 'sequenced synth', 'acid bass', 'percussive noise'],
  folk: ['acoustic guitar', 'banjo', 'fiddle', 'upright bass', 'harmonica'],
  blues: ['electric guitar', 'harmonica', 'upright bass', 'drum kit', 'organ'],
  country: ['acoustic guitar', 'steel guitar', 'fiddle', 'bass', 'percussion'],
  funk: ['slap bass', 'rhythm guitar', 'horns', 'drums', 'clavinet'],
  soul: ['organ', 'rhodes', 'horns', 'bass', 'gospel choir'],
  reggae: ['offbeat guitar', 'bass', 'organ', 'drums', 'horns'],
};

export const GENRE_RHYTHM_PATTERN_MAP: Record<string, string> = {
  'hip-hop': 'swung 16ths',
  trap: 'hi-hat triplet rolls with swung 16ths',
  edm: 'straight 4-on-floor',
  house: 'straight 4-on-floor with offbeat hi-hat',
  jazz: 'swung triplets',
  rock: 'straight 8ths with backbeat',
  metal: 'straight 16ths with double kick',
  classical: 'variable, conductor-dependent',
  pop: 'straight 8ths with programmed fill',
  rnb: 'swung 16ths with laid-back groove',
  funk: 'tight 16ths with syncopated bass',
  reggae: 'offbeat skank pattern',
};

export const DEFAULT_RHYTHM_PATTERN = 'straight 8ths with backbeat' as const;

export const SENTIMENT_FALLBACK_BASE = {
  valence: 5,
  arousal: 5,
  tension: 5,
} as const;
