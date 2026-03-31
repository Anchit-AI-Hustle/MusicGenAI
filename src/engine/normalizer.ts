import {
  CANONICAL_MOODS,
  DEFAULT_STRUCTURE,
  FIELD_LIMITS,
  KEYWORD_SCORES,
  RATIO_PRESETS,
  STRUCTURE_DEFAULT_WEIGHT,
} from './CONSTANTS';
import type {
  ArtistStyleReference,
  GenreProfile,
  MoodVector,
  NormalizedInput,
  RawUserInput,
  StructureSegment,
  StyleVector,
  VocalStyleVector,
} from './types';

const MOOD_TABLE: Record<string, Omit<MoodVector, 'label'>> = {
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
};

export const GENRE_INSTRUMENTATION_MAP: Record<string, string[]> = {
  'hip-hop': ['808 bass', 'trap hi-hats', 'sampler', 'sub kick'],
  rock: ['electric guitar', 'drums', 'bass guitar', 'distortion'],
  jazz: ['upright bass', 'piano', 'trumpet', 'brush drums'],
  edm: ['synthesizer', '4-on-floor kick', 'pad', 'arp', 'sidechain'],
  classical: ['strings', 'piano', 'woodwinds', 'orchestral percussion'],
  pop: ['synth bass', 'programmed drums', 'pad', 'guitar', 'keys'],
  rnb: ['rhodes', '808', 'soul vocals', 'smooth bass'],
  metal: ['distorted guitar', 'double kick', 'bass drop', 'power chords'],
};

const GENRE_RHYTHM_MAP: Record<string, string> = {
  'hip-hop': 'swung 16ths',
  rock: 'straight 8ths with backbeat',
  jazz: 'swung triplets',
  edm: 'straight 4-on-floor',
  classical: 'variable, conductor-dependent',
  pop: 'tight straight 8ths',
  rnb: 'laid-back syncopation',
  metal: 'driving double-time accents',
};

const VOCAL_STYLE_VECTORS: Record<string, VocalStyleVector> = {
  raspy: { register: 'mid', technique: 'chest', texture: 'rough' },
  falsetto: { register: 'high', technique: 'head', texture: 'airy' },
  'spoken-word': { register: 'mid', technique: 'speech', texture: 'dry' },
  spoken: { register: 'mid', technique: 'speech', texture: 'dry' },
  operatic: { register: 'high', technique: 'classical', texture: 'resonant' },
};

export const ARTIST_STYLE_MAP: Record<string, ArtistStyleReference> = {
  'the weeknd': { artist: 'The Weeknd', genre: 'rnb', mood: 'dark', era: '2010s', production_style: 'cinematic synth' },
  'kendrick lamar': { artist: 'Kendrick Lamar', genre: 'hip-hop', mood: 'intense', era: '2010s', production_style: 'jazz-rap' },
  'hans zimmer': { artist: 'Hans Zimmer', genre: 'classical', mood: 'epic', era: '2000s', production_style: 'orchestral hybrid' },
  'daft punk': { artist: 'Daft Punk', genre: 'edm', mood: 'euphoric', era: '2000s', production_style: 'french house' },
  'taylor swift': { artist: 'Taylor Swift', genre: 'pop', mood: 'romantic', era: '2010s', production_style: 'polished pop' },
  'johnny cash': { artist: 'Johnny Cash', genre: 'country', mood: 'melancholic', era: '1960s', production_style: 'stripped acoustic' },
  radiohead: { artist: 'Radiohead', genre: 'alternative', mood: 'dark', era: '2000s', production_style: 'glitchy electronic' },
  'billie eilish': { artist: 'Billie Eilish', genre: 'pop', mood: 'dark', era: '2020s', production_style: 'whisper pop' },
  beethoven: { artist: 'Beethoven', genre: 'classical', mood: 'epic', era: '1800s', production_style: 'symphonic' },
  drake: { artist: 'Drake', genre: 'hip-hop', mood: 'romantic', era: '2010s', production_style: 'trap soul' },
  eminem: { artist: 'Eminem', genre: 'hip-hop', mood: 'angry', era: '2000s', production_style: 'hard-hitting boom bap' },
  'ariana grande': { artist: 'Ariana Grande', genre: 'pop', mood: 'euphoric', era: '2020s', production_style: 'maximalist pop' },
  adele: { artist: 'Adele', genre: 'pop', mood: 'melancholic', era: '2010s', production_style: 'orchestral ballad' },
  'bruno mars': { artist: 'Bruno Mars', genre: 'pop', mood: 'happy', era: '2010s', production_style: 'retro funk pop' },
  'michael jackson': { artist: 'Michael Jackson', genre: 'pop', mood: 'euphoric', era: '1980s', production_style: 'groove-driven pop' },
  metallica: { artist: 'Metallica', genre: 'metal', mood: 'angry', era: '1990s', production_style: 'thrash metal wall' },
  slipknot: { artist: 'Slipknot', genre: 'metal', mood: 'tense', era: '2000s', production_style: 'industrial metal' },
  nirvana: { artist: 'Nirvana', genre: 'rock', mood: 'dark', era: '1990s', production_style: 'grunge rawness' },
  'foo fighters': { artist: 'Foo Fighters', genre: 'rock', mood: 'epic', era: '2000s', production_style: 'arena rock' },
  'red hot chili peppers': { artist: 'Red Hot Chili Peppers', genre: 'rock', mood: 'happy', era: '2000s', production_style: 'funk rock' },
  'miles davis': { artist: 'Miles Davis', genre: 'jazz', mood: 'chill', era: '1960s', production_style: 'modal jazz' },
  'john coltrane': { artist: 'John Coltrane', genre: 'jazz', mood: 'epic', era: '1960s', production_style: 'spiritual jazz' },
  'nina simone': { artist: 'Nina Simone', genre: 'jazz', mood: 'melancholic', era: '1960s', production_style: 'soulful piano jazz' },
  'tiesto': { artist: 'Tiësto', genre: 'edm', mood: 'euphoric', era: '2010s', production_style: 'festival house' },
  skrillex: { artist: 'Skrillex', genre: 'edm', mood: 'angry', era: '2010s', production_style: 'aggressive bass music' },
  'deadmau5': { artist: 'deadmau5', genre: 'edm', mood: 'dark', era: '2010s', production_style: 'progressive electro' },
  'ap dhillon': { artist: 'AP Dhillon', genre: 'hip-hop', mood: 'romantic', era: '2020s', production_style: 'punjabi trap' },
  'ar rahman': { artist: 'A.R. Rahman', genre: 'classical', mood: 'epic', era: '2000s', production_style: 'cinematic indian fusion' },
  'bad bunny': { artist: 'Bad Bunny', genre: 'pop', mood: 'euphoric', era: '2020s', production_style: 'latin urban' },
  'lana del rey': { artist: 'Lana Del Rey', genre: 'pop', mood: 'melancholic', era: '2010s', production_style: 'dream noir' },
  'the beatles': { artist: 'The Beatles', genre: 'rock', mood: 'happy', era: '1960s', production_style: 'vintage analog pop-rock' },
};

/** Converts a free-form string to lower-case canonical slug. */
export function slugify(input: string): string {
  return input.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Maps tempo_bpm to 1-10 energy bucket. */
export function tempoToEnergy(tempoBpm: number): number {
  if (tempoBpm <= 70) return 2;
  if (tempoBpm <= 100) return 5;
  if (tempoBpm <= 130) return 7;
  if (tempoBpm <= 160) return 9;
  return 10;
}

/** Builds a mood vector from canonical map or keyword heuristics. */
export function moodToVector(moodInput: string): MoodVector {
  const mood = moodInput.trim().toLowerCase();
  const mapped = MOOD_TABLE[mood];
  if (mapped) {
    return { label: mood, ...mapped };
  }

  let valence = 5;
  let arousal = 5;
  let tension = 5;

  for (const token of mood.split(/\s+/)) {
    if (KEYWORD_SCORES.AROUSAL_UP.includes(token as never)) arousal += 1;
    if (KEYWORD_SCORES.AROUSAL_DOWN.includes(token as never)) arousal -= 1;
    if (KEYWORD_SCORES.TENSION_UP.includes(token as never)) tension += 1;
    if (['warm', 'soft', 'gentle'].includes(token)) valence += 1;
    if (['dark', 'cold', 'gritty', 'chaotic'].includes(token)) valence -= 1;
  }

  const clamp = (n: number) => Math.max(1, Math.min(10, Math.round(n)));
  return {
    label: moodInput.trim() || 'neutral',
    valence: clamp(valence),
    arousal: clamp(arousal),
    tension: clamp(tension),
  };
}

function inferUnknownGenreInstrumentation(prompt: string, mood: MoodVector): string[] {
  const p = prompt.toLowerCase();
  const instruments = new Set<string>();
  if (p.includes('guitar')) instruments.add('guitar');
  if (p.includes('piano')) instruments.add('piano');
  if (p.includes('synth')) instruments.add('synthesizer');
  if (p.includes('strings')) instruments.add('strings');
  if (p.includes('drum')) instruments.add('drums');
  if (mood.arousal >= 8) instruments.add('punchy percussion');
  if (mood.tension >= 7) instruments.add('dissonant pads');
  if (mood.arousal <= 3) instruments.add('ambient textures');
  if (instruments.size === 0) {
    instruments.add('drums');
    instruments.add('bass');
    instruments.add('keys');
  }
  return [...instruments].slice(0, 10);
}

/** Parses and normalizes structure segments from structure string. */
export function parseSongStructure(rawStructure: string): StructureSegment[] {
  const parts = rawStructure
    .split('-')
    .map((p) => p.trim())
    .filter(Boolean);

  const effectiveParts = parts.length > 0 ? parts : DEFAULT_STRUCTURE.split('-');

  const withWeights = effectiveParts.map((name, idx) => {
    const key = Object.keys(RATIO_PRESETS).find((k) => k.toLowerCase() === name.toLowerCase());
    const weight = key ? RATIO_PRESETS[key as keyof typeof RATIO_PRESETS] : STRUCTURE_DEFAULT_WEIGHT;
    return { name, order: idx + 1, duration_ratio: weight };
  });

  const total = withWeights.reduce((sum, s) => sum + s.duration_ratio, 0);
  return withWeights.map((segment) => ({
    ...segment,
    duration_ratio: Number((segment.duration_ratio / total).toFixed(4)),
  }));
}

/** Converts vocal style string into style vector. */
export function vocalStyleToVector(vocalStyle: string): VocalStyleVector {
  const key = slugify(vocalStyle);
  const mapped = VOCAL_STYLE_VECTORS[key];
  if (mapped) return mapped;

  if (key.includes('low') || key.includes('baritone') || key.includes('bass')) {
    return { register: 'low', technique: 'chest', texture: 'warm' };
  }
  if (key.includes('high') || key.includes('head') || key.includes('falsetto')) {
    return { register: 'high', technique: 'head', texture: 'airy' };
  }
  return { register: 'mid', technique: 'mixed', texture: 'clean' };
}

/** Resolves artist references to canonical style references and averaged style vector. */
export function artistReferencesToStyleVector(artists: string[]): { references: ArtistStyleReference[]; vector: StyleVector } {
  const references = artists.map((artist) => {
    const key = artist.trim().toLowerCase();
    const mapped = ARTIST_STYLE_MAP[key];
    return mapped ?? {
      artist,
      genre: 'pop',
      mood: 'chill',
      era: '2010s',
      production_style: 'modern clean production',
    };
  });

  const genreBias: Record<string, number> = {};
  const moodBias: Record<string, number> = {};
  const eraDistribution: Record<string, number> = {};
  const productionStyleCounts: Record<string, number> = {};

  for (const ref of references) {
    genreBias[ref.genre] = (genreBias[ref.genre] ?? 0) + 1;
    moodBias[ref.mood] = (moodBias[ref.mood] ?? 0) + 1;
    eraDistribution[ref.era] = (eraDistribution[ref.era] ?? 0) + 1;
    productionStyleCounts[ref.production_style] = (productionStyleCounts[ref.production_style] ?? 0) + 1;
  }

  const normalizeMap = (map: Record<string, number>): Record<string, number> => {
    const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, Number((v / total).toFixed(4))]));
  };

  const vector: StyleVector = {
    genre_bias: normalizeMap(genreBias),
    mood_bias: normalizeMap(moodBias),
    era_distribution: normalizeMap(eraDistribution),
    production_styles: Object.entries(productionStyleCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([style]) => style),
  };

  return { references, vector };
}

/** Converts a raw input object into a fully normalized deterministic structure. */
export function normalize(input: RawUserInput): NormalizedInput {
  const normalizedGenres = input.genres.map(slugify).filter(Boolean);
  const primaryGenre = normalizedGenres[0] ?? 'pop';
  const secondaryGenres = normalizedGenres.slice(1);

  const mood = moodToVector(input.mood);
  const genreInstrumentation = normalizedGenres.flatMap((g) => GENRE_INSTRUMENTATION_MAP[g] ?? []);
  const fallbackInstrumentation = inferUnknownGenreInstrumentation(input.music_prompt, mood);
  const instrumentation = [...new Set([...genreInstrumentation, ...fallbackInstrumentation])].slice(0, 10);

  const rhythmPattern = GENRE_RHYTHM_MAP[primaryGenre] ?? 'balanced groove';
  const structureSegments = parseSongStructure(input.song_structure);
  const vocalStyleVector = vocalStyleToVector(input.vocal_style);
  const { references, vector } = artistReferencesToStyleVector(input.artist_inspiration);

  const genreProfile: GenreProfile = {
    primary: primaryGenre,
    secondary: secondaryGenres,
    instrumentation,
    rhythm_pattern: rhythmPattern,
  };

  const lyricsProfile = {
    theme: input.lyric_theme,
    content: input.lyrics,
    sentiment: null,
    requires_adjustment: false,
  };

  const albumSongCount = input.creation_mode === 'album'
    ? Math.max(FIELD_LIMITS.ALBUM_MIN, Math.min(FIELD_LIMITS.ALBUM_MAX, input.album_song_count ?? FIELD_LIMITS.ALBUM_MIN))
    : null;

  const videoStyle = input.generate_video ? input.video_style : null;

  return {
    creation_mode: input.creation_mode,
    album_song_count: albumSongCount,
    track_name: input.track_name.trim(),
    music_prompt: input.music_prompt.trim(),
    genres: normalizedGenres.length > 0 ? normalizedGenres : ['pop'],
    genre_profile: genreProfile,
    subgenres: input.subgenres.map(slugify).filter(Boolean),
    tempo_bpm: Math.max(FIELD_LIMITS.TEMPO_MIN, Math.min(FIELD_LIMITS.TEMPO_MAX, Math.round(input.tempo_bpm))),
    duration_seconds: Math.max(FIELD_LIMITS.DURATION_MIN, Math.min(FIELD_LIMITS.DURATION_MAX, Math.round(input.duration_seconds))),
    mood,
    song_structure: input.song_structure.trim() || DEFAULT_STRUCTURE,
    structure_segments: structureSegments,
    vocal_arrangement: input.vocal_arrangement,
    vocal_style: input.vocal_style.trim(),
    vocal_style_vector: vocalStyleVector,
    vocal_intensity: Math.max(FIELD_LIMITS.VOCAL_INTENSITY_MIN, Math.min(FIELD_LIMITS.VOCAL_INTENSITY_MAX, Math.round(input.vocal_intensity))),
    vocal_effects: [...new Set(input.vocal_effects.map(slugify).filter(Boolean))],
    vocal_language: [...new Set(input.vocal_language.map((language) => language.trim()).filter(Boolean))],
    lyric_theme: input.lyric_theme.trim(),
    lyrics: input.lyrics,
    lyrics_profile: lyricsProfile,
    artist_inspiration: input.artist_inspiration.map((artist) => artist.trim()).filter(Boolean),
    style_reference: references,
    style_vector: vector,
    generate_video: input.generate_video,
    video_style: videoStyle,
  };
}

export const moodLabels = CANONICAL_MOODS;

