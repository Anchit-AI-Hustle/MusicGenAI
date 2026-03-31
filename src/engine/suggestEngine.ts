import {
  CANONICAL_MOODS,
  DEFAULT_STRUCTURE,
  GENRE_TEMPO_CENTERS,
  MUSIC_PROMPT_BOUNDS,
} from './CONSTANTS';
import { GENRE_INSTRUMENTATION_MAP, moodToVector, parseSongStructure } from './normalizer';
import type { CanonicalMood, NormalizedInput } from './types';

const MOOD_ALIASES: Record<string, CanonicalMood> = {
  brooding: 'dark',
  uplifting: 'happy',
  dreamy: 'chill',
  aggressive: 'angry',
  emotional: 'melancholic',
  triumphant: 'epic',
};

const VOCAL_STYLE_SUGGESTIONS: Record<string, string> = {
  'rock:angry': 'raw, chest voice',
  'pop:happy': 'bright, mixed voice',
  'rnb:romantic': 'silky, melismatic',
  'hip-hop:*': 'rhythmic, punchy delivery',
  'classical:*': 'operatic, breath control',
  'edm:*': 'processed, ethereal',
};

function pickPrimaryGenre(input: Partial<NormalizedInput>): string {
  if (input.genre_profile?.primary) return input.genre_profile.primary;
  if (input.genres && input.genres.length > 0) return input.genres[0];
  return 'pop';
}

function pickMood(input: Partial<NormalizedInput>): CanonicalMood {
  const raw = input.mood?.label?.toLowerCase() ?? '';
  if ((CANONICAL_MOODS as readonly string[]).includes(raw)) return raw as CanonicalMood;
  if (MOOD_ALIASES[raw]) return MOOD_ALIASES[raw];
  if (input.music_prompt) {
    const m = input.music_prompt.toLowerCase();
    for (const mood of CANONICAL_MOODS) {
      if (m.includes(mood)) return mood;
    }
    for (const [alias, canonical] of Object.entries(MOOD_ALIASES)) {
      if (m.includes(alias)) return canonical;
    }
  }
  return 'happy';
}

function clampWords(text: string, minWords: number, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length > maxWords) return words.slice(0, maxWords).join(' ');
  if (words.length < minWords) {
    const filler = 'with coherent arrangement transitions, clear hook definition, dynamic contrast, and emotionally consistent melodic phrasing';
    return `${text.trim()} ${filler}`;
  }
  return text.trim();
}

function instrumentationHints(input: Partial<NormalizedInput>): string[] {
  const genre = pickPrimaryGenre(input);
  const base = GENRE_INSTRUMENTATION_MAP[genre] ?? ['drums', 'bass', 'keys'];
  const fromProfile = input.genre_profile?.instrumentation ?? [];
  return [...new Set([...fromProfile, ...base])].slice(0, 5);
}

function artistHint(input: Partial<NormalizedInput>): string {
  const refs = input.style_reference ?? [];
  if (refs.length > 0) return refs.map((r) => `${r.artist} (${r.production_style})`).join(', ');
  if (input.artist_inspiration && input.artist_inspiration.length > 0) return input.artist_inspiration.join(', ');
  return 'modern cinematic production';
}

/** Suggests a deterministic, context-valid music prompt. */
export function suggestMusicPrompt(partialInput: Partial<NormalizedInput>): string {
  const mood = pickMood(partialInput);
  const genre = pickPrimaryGenre(partialInput);
  const instruments = instrumentationHints(partialInput).join(', ');
  const artist = artistHint(partialInput);
  const userPrompt = partialInput.music_prompt?.trim();

  const prompt = `${mood} ${genre} track with ${instruments}, tight rhythmic focus, expressive melodic contour, and ${artist} as production reference. Build a clear emotional arc from introduction to finale, maintain tonal consistency, and emphasize high-quality dynamics and spatial depth.${userPrompt ? ` Preserve the intent: ${userPrompt}.` : ''}`;
  return clampWords(prompt, MUSIC_PROMPT_BOUNDS.MIN_WORDS, MUSIC_PROMPT_BOUNDS.MAX_WORDS);
}

/** Suggests canonical mood label from context. */
export function suggestMood(partialInput: Partial<NormalizedInput>): string {
  if (partialInput.mood?.label) return pickMood(partialInput);

  const genre = pickPrimaryGenre(partialInput);
  const tempo = partialInput.tempo_bpm ?? GENRE_TEMPO_CENTERS[genre] ?? 110;
  if (genre === 'metal') return 'angry';
  if (genre === 'classical') return 'epic';
  if (genre === 'jazz' && tempo <= 100) return 'chill';
  if (tempo >= 150) return 'euphoric';
  if (tempo <= 80) return 'melancholic';
  return 'happy';
}

/** Suggests deterministic tempo in BPM. */
export function suggestTempo(partialInput: Partial<NormalizedInput>): number {
  const genres = partialInput.genres && partialInput.genres.length > 0
    ? partialInput.genres
    : [pickPrimaryGenre(partialInput)];

  const centers = genres.map((g) => GENRE_TEMPO_CENTERS[g] ?? 110);
  const base = centers.reduce((sum, v) => sum + v, 0) / centers.length;
  const moodVector = partialInput.mood ?? moodToVector(suggestMood(partialInput));
  const adjustment = Math.round(((moodVector.arousal - 5) / 5) * 10);
  return Math.max(40, Math.min(220, Math.round(base + adjustment)));
}

/** Suggests deterministic song structure from genre. */
export function suggestSongStructure(partialInput: Partial<NormalizedInput>): string {
  const genre = pickPrimaryGenre(partialInput);
  const map: Record<string, string> = {
    pop: 'Intro-Verse-Chorus-Verse-Chorus-Bridge-Chorus-Outro',
    'hip-hop': 'Intro-Verse-Hook-Verse-Hook-Bridge-Hook-Outro',
    edm: 'Intro-Build-Drop-Break-Build-Drop-Outro',
    classical: 'Intro-Theme-Development-Recapitulation-Coda',
    jazz: 'Intro-Head-Solo-Head-Outro',
    rock: 'Intro-Verse-Chorus-Verse-Chorus-Bridge-Solo-Chorus-Outro',
    metal: 'Intro-Riff-Verse-Chorus-Verse-Chorus-Breakdown-Solo-Chorus-Outro',
  };
  return map[genre] ?? DEFAULT_STRUCTURE;
}

/** Suggests vocal style based on genre and mood constraints. */
export function suggestVocalStyle(partialInput: Partial<NormalizedInput>): string {
  const genre = pickPrimaryGenre(partialInput);
  const mood = pickMood(partialInput);
  const exact = VOCAL_STYLE_SUGGESTIONS[`${genre}:${mood}`];
  if (exact) return exact;
  const wildcard = VOCAL_STYLE_SUGGESTIONS[`${genre}:*`];
  if (wildcard) return wildcard;
  return 'controlled, expressive mixed voice';
}

/** Suggests video style from mood/genre with artist era texture. */
export function suggestVideoStyle(partialInput: Partial<NormalizedInput>): string {
  const mood = pickMood(partialInput);
  const genre = pickPrimaryGenre(partialInput);
  const baseMap: Record<string, string> = {
    'dark:hip-hop': 'cinematic noir',
    'euphoric:edm': 'neon abstract',
    'epic:classical': 'orchestral visual',
    'romantic:pop': 'soft cinematic',
    'chill:jazz': 'lo-fi aesthetic',
    'angry:metal': 'industrial brutal',
    'sad:rnb': 'moody film grain',
    'happy:pop': 'colorful vibrant',
  };
  const base = baseMap[`${mood}:${genre}`] ?? `${mood} ${genre} visual narrative`;
  const era = partialInput.style_reference?.[0]?.era ?? 'modern';
  return `${base}, ${era} texture`;
}

/** Enhances a field without semantic contradiction. */
export function enhanceField(field: string, currentValue: string, context: Partial<NormalizedInput>): string {
  const genre = pickPrimaryGenre(context);
  const mood = pickMood(context);
  const safeCurrent = currentValue.trim() || `${mood} ${genre}`;

  const templates: Record<string, string> = {
    music_prompt: `${safeCurrent} with focused ${genre} instrumentation, refined groove articulation, richer harmonic detail, and emotionally coherent ${mood} phrasing.`,
    lyric_theme: `${safeCurrent} explored through vivid imagery, consistent narrative voice, and ${mood} emotional pacing.`,
    vocal_style: `${safeCurrent}, tailored to ${genre} phrasing and controlled dynamic contour.`,
  };

  return templates[field] ?? `${safeCurrent} with clearer structure, tighter specificity, and improved production clarity aligned to ${genre} and ${mood}.`;
}

/** Generates a context-valid alternative for the field. */
export function newAlternativeField(field: string, currentValue: string, context: Partial<NormalizedInput>): string {
  const genre = pickPrimaryGenre(context);
  const mood = pickMood(context);

  if (field === 'mood') {
    const alternatives: Record<CanonicalMood, CanonicalMood[]> = {
      happy: ['euphoric', 'romantic'],
      sad: ['melancholic', 'dark'],
      angry: ['tense', 'dark'],
      romantic: ['happy', 'melancholic'],
      epic: ['tense', 'euphoric'],
      melancholic: ['sad', 'dark'],
      euphoric: ['happy', 'epic'],
      dark: ['tense', 'melancholic'],
      chill: ['romantic', 'happy'],
      tense: ['dark', 'angry'],
    };
    const next = alternatives[mood][0];
    return next;
  }

  if (field === 'song_structure') {
    const candidate = suggestSongStructure({ ...context, genres: [genre] });
    const parsed = parseSongStructure(candidate);
    return parsed.map((segment) => segment.name).join('-');
  }

  if (field === 'vocal_style') {
    const base = suggestVocalStyle(context);
    if (base === currentValue) return `${base}, nuanced articulation`;
    return base;
  }

  if (field === 'video_style') {
    return suggestVideoStyle(context);
  }

  return `${currentValue || `${mood} ${genre}`} alternative`;
}

