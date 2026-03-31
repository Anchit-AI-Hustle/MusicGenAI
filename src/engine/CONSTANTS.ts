export const CREATION_MODES = {
  SINGLE: 'single',
  ALBUM: 'album',
} as const;

export const VOCAL_ARRANGEMENTS = {
  SOLO: 'solo',
  DUET: 'duet',
  CHOIR: 'choir',
  NONE: 'none',
} as const;

export const MOOD_LABELS = {
  HAPPY: 'happy',
  SAD: 'sad',
  ANGRY: 'angry',
  ROMANTIC: 'romantic',
  EPIC: 'epic',
  MELANCHOLIC: 'melancholic',
  EUPHORIC: 'euphoric',
  DARK: 'dark',
  CHILL: 'chill',
  TENSE: 'tense',
} as const;

export const FIELD_LIMITS = {
  ALBUM_MIN: 2,
  ALBUM_MAX: 20,
  TEMPO_MIN: 40,
  TEMPO_MAX: 220,
  DURATION_MIN: 30,
  DURATION_MAX: 600,
  VOCAL_INTENSITY_MIN: 1,
  VOCAL_INTENSITY_MAX: 10,
} as const;

export const RATIO_PRESETS = {
  Intro: 0.08,
  Verse: 0.2,
  'Pre-Chorus': 0.1,
  Chorus: 0.2,
  Bridge: 0.12,
  Outro: 0.1,
  Drop: 0.18,
  Hook: 0.15,
  Solo: 0.12,
} as const;

export const DEFAULT_STRUCTURE = 'Intro-Verse-Chorus-Verse-Chorus-Bridge-Chorus-Outro';

export const STRUCTURE_DEFAULT_WEIGHT = 0.15;

export const KEYWORD_SCORES = {
  AROUSAL_UP: ['intense', 'heavy', 'chaotic', 'aggressive', 'hype', 'energetic', 'driving'],
  AROUSAL_DOWN: ['soft', 'gentle', 'warm', 'calm', 'ambient', 'mellow', 'slow'],
  TENSION_UP: ['dark', 'gritty', 'conflict', 'anxious', 'dissonant', 'tense', 'ominous'],
} as const;

export const GENRE_TEMPO_CENTERS: Record<string, number> = {
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
};

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

export const SENTIMENT_KEYWORDS = {
  POSITIVE: [
    'love', 'joy', 'hope', 'bright', 'smile', 'sunrise', 'healing', 'grace', 'warm', 'alive',
    'victory', 'peace', 'free', 'home', 'golden', 'uplift', 'dream', 'kiss', 'together', 'happy',
    'light', 'calm', 'bloom', 'trust', 'faith'
  ],
  NEGATIVE: [
    'pain', 'hurt', 'broken', 'cold', 'alone', 'loss', 'tears', 'fall', 'fear', 'doubt',
    'empty', 'shadow', 'bleed', 'dark', 'grief', 'regret', 'failed', 'sorry', 'cry', 'wound',
    'nightmare', 'scar', 'silent', 'fading', 'ash'
  ],
  TENSION: [
    'fight', 'war', 'rage', 'storm', 'pressure', 'burn', 'collapse', 'edge', 'chaos', 'panic',
    'fracture', 'conflict', 'alarm', 'sirens', 'breaking', 'violent', 'strain', 'clash', 'intense', 'tense',
    'anxious', 'nervous', 'threat', 'shiver', 'dread'
  ],
} as const;

export const GENERATION_PROMPT_BOUNDS = {
  MIN_WORDS: 80,
  MAX_WORDS: 150,
} as const;

export const MUSIC_PROMPT_BOUNDS = {
  MIN_WORDS: 30,
  MAX_WORDS: 80,
} as const;

export const ALBUM_DEFAULT_COUNT = 8;
export const ALBUM_MIN_SPREAD_BPM = 20;

