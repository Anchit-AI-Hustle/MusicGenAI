import { CreativeContext } from "@/types/creative-context";
import { findGenreByName } from "@/lib/musicData/genres";

export function applyInferenceToContext(ctx: Partial<CreativeContext>, inferred: Partial<CreativeContext>): CreativeContext {
  // Merge inferred values with context
  return { ...ctx, ...inferred } as CreativeContext;
}

export function resolveCreativeContext(context: Partial<CreativeContext>): CreativeContext {
  const resolved = { ...context } as CreativeContext;

  // Provide defaults for mandatory fields
  resolved.songDescription = resolved.songDescription || "";
  resolved.songTitle = resolved.songTitle || "Untitled Track";
  resolved.genre = resolved.genre || "Pop";
  resolved.mood = resolved.mood || "Energetic";
  resolved.tempo = resolved.tempo || 120;
  resolved.duration = resolved.duration || 180;
  resolved.vocalsEnabled = resolved.vocalsEnabled !== undefined ? resolved.vocalsEnabled : true;
  resolved.vocalLanguage = resolved.vocalLanguage || "English";
  resolved.vocalStyle = resolved.vocalStyle || "Male Vocal";
  resolved.vocalIntensity = resolved.vocalIntensity || 7;
  resolved.artistInspiration = resolved.artistInspiration || "";
  resolved.instruments = resolved.instruments || [];
  resolved.energyLevel = resolved.energyLevel || 7;
  resolved.structureType = resolved.structureType || "Verse-Chorus-Bridge";
  resolved.lyricsTheme = resolved.lyricsTheme || "Story of Us";
  resolved.videoStyle = resolved.videoStyle || "Abstract Geometric";
  resolved.creativityLevel = resolved.creativityLevel || 5;
  resolved.variationSeed = resolved.variationSeed || `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  resolved.generationMode = resolved.generationMode || 'standard';

  return resolved;
}

// ─── Genre keyword database ────────────────────────────────────────────────
// Each entry maps a canonical genre name to its keyword triggers.
// Longer / more specific keywords are listed first so multi-word matches
// (e.g. "hard techno") beat single-word ones ("techno").
// The scoring system below awards more points for longer keyword matches.
interface GenreKeywordEntry {
  genre: string;
  keywords: string[];
}

const GENRE_KEYWORD_DB: GenreKeywordEntry[] = [
  // Very specific first (multi-word phrases)
  { genre: 'Punjabi Drill', keywords: ['punjabi drill', 'uk punjabi drill', 'desi drill'] },
  { genre: 'Hard Techno', keywords: ['hard techno', 'industrial techno'] },
  { genre: 'Acid Techno', keywords: ['acid techno'] },
  { genre: 'Minimal Techno', keywords: ['minimal techno'] },
  { genre: 'Deep House', keywords: ['deep house'] },
  { genre: 'Tech House', keywords: ['tech house'] },
  { genre: 'Progressive House', keywords: ['progressive house', 'prog house'] },
  { genre: 'Drum and Bass', keywords: ['drum and bass', 'drum & bass', 'dnb', 'd&b', 'jungle'] },
  { genre: 'Lo-fi Hip Hop', keywords: ['lo-fi hip hop', 'lofi hip hop', 'chillhop'] },
  { genre: 'UK Drill', keywords: ['uk drill', 'london drill', 'british drill'] },
  { genre: 'Desi Hip Hop', keywords: ['desi hip hop', 'desi rap', 'gully rap', 'hindi rap', 'indian rap'] },
  { genre: 'K-Pop', keywords: ['k-pop', 'kpop', 'korean pop'] },
  { genre: 'J-Pop', keywords: ['j-pop', 'jpop', 'japanese pop'] },
  { genre: 'Latin Pop', keywords: ['latin pop'] },
  { genre: 'Synth-pop', keywords: ['synth-pop', 'synthpop', 'synth pop'] },
  { genre: 'Indie Pop', keywords: ['indie pop', 'indie music'] },
  { genre: 'Punjabi Pop', keywords: ['punjabi pop', 'punjabi song', 'pollywood'] },
  { genre: 'Arabic Pop', keywords: ['arabic pop', 'arabic music'] },
  { genre: 'Bossa Nova', keywords: ['bossa nova'] },

  // Moderately specific
  { genre: 'Techno', keywords: ['techno'] },
  { genre: 'House', keywords: ['house'] },
  { genre: 'Trap', keywords: ['trap'] },
  { genre: 'Drill', keywords: ['drill'] },
  { genre: 'Phonk', keywords: ['phonk', 'memphis phonk', 'drift phonk'] },
  { genre: 'EDM', keywords: ['edm', 'electronic dance'] },
  { genre: 'Reggaeton', keywords: ['reggaeton', 'dembow', 'perreo'] },
  { genre: 'Dubstep', keywords: ['dubstep', 'brostep', 'riddim'] },
  { genre: 'Synthwave', keywords: ['synthwave', 'retrowave', 'outrun'] },
  { genre: 'Ambient', keywords: ['ambient'] },
  { genre: 'Bhangra', keywords: ['bhangra'] },
  { genre: 'Bollywood', keywords: ['bollywood', 'hindi film'] },
  { genre: 'Afrobeats', keywords: ['afrobeats', 'afropop', 'afroswing'] },
  { genre: 'Dancehall', keywords: ['dancehall'] },
  { genre: 'Reggae', keywords: ['reggae', 'roots reggae', 'dub'] },
  { genre: 'Punk', keywords: ['punk'] },
  { genre: 'Blues', keywords: ['blues'] },
  { genre: 'Funk', keywords: ['funk'] },
  { genre: 'Soul', keywords: ['soul'] },

  // Broad genres (single keyword — scored lower)
  { genre: 'Hip Hop', keywords: ['hip hop', 'hip-hop', 'rap', 'boom bap', 'gangsta'] },
  { genre: 'Rock', keywords: ['rock', 'guitar riff'] },
  { genre: 'Metal', keywords: ['metal', 'heavy metal', 'death metal', 'metalcore'] },
  { genre: 'Electronic', keywords: ['electronic', 'synth'] },
  { genre: 'Jazz', keywords: ['jazz', 'swing', 'bebop'] },
  { genre: 'Classical', keywords: ['classical', 'orchestral', 'symphony', 'orchestra'] },
  { genre: 'Lo-fi', keywords: ['lofi', 'lo-fi'] },
  { genre: 'R&B', keywords: ['r&b', 'rnb'] },
  { genre: 'Pop', keywords: ['pop', 'pop fusion', 'mainstream'] },
  { genre: 'Industrial', keywords: ['industrial'] },
  { genre: 'Country', keywords: ['country', 'nashville'] },
  { genre: 'Folk', keywords: ['folk', 'acoustic folk'] },
];

/**
 * Test whether `keyword` appears in `text` as a whole word/phrase —
 * NOT as a substring inside another word. Uses word-boundary regex
 * so "rap" matches "rap" and "rap vocal" but NOT "wrapping" or "trapped".
 * Similarly "metal" matches "metal" but NOT "metallic".
 */
function matchesWholeWord(text: string, keyword: string): boolean {
  // Escape regex special chars in keyword, then wrap with \b
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'i');
  return re.test(text);
}

/**
 * Score all genres against the prompt. Returns all matching genres sorted
 * by relevance (longest keyword match wins). Multi-word keyword matches
 * score higher than single-word ones. Uses whole-word matching to avoid
 * false positives (e.g. "metallic" ≠ "metal", "wrapping" ≠ "rap").
 */
function scoreGenres(text: string): { genre: string; score: number }[] {
  const scored: { genre: string; score: number }[] = [];

  for (const entry of GENRE_KEYWORD_DB) {
    let bestScore = 0;
    for (const kw of entry.keywords) {
      if (matchesWholeWord(text, kw)) {
        // Score = keyword length (longer = more specific = higher score)
        const kwScore = kw.length;
        if (kwScore > bestScore) bestScore = kwScore;
      }
    }
    if (bestScore > 0) {
      scored.push({ genre: entry.genre, score: bestScore });
    }
  }

  // Sort descending by score (most specific match first)
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function inferContextLocally(description: string, seed: string) {
  const text = description.toLowerCase();
  const random = parseInt(seed) % 100;

  // ─── GENRE ────────────────────────────────────────────────────────────
  // Score ALL matching genres. The primary genre is the most specific match.
  // Secondary genres influence instrumentation and tempo blending.
  const genreMatches = scoreGenres(description);
  const primaryGenre = genreMatches.length > 0 ? genreMatches[0].genre : 'Pop';
  const secondaryGenres = genreMatches.slice(1, 3).map(g => g.genre);
  const genre = primaryGenre;

  // ─── MOOD ─────────────────────────────────────────────────────────────
  // Labels MUST match PRESET_MOODS in src/data/form-presets.ts.
  const moodKeywords: Record<string, string[]> = {
    'Aggressive': ['aggressive', 'intense', 'anger', 'rage', 'fight'],
    'Chill': ['calm', 'peaceful', 'chill', 'relax', 'soft', 'gentle'],
    'Melancholic': ['sad', 'melancholic', 'heartbreak', 'pain', 'tears'],
    'Romantic': ['love', 'romantic', 'heart', 'kiss', 'baby'],
    'Uplifting': ['happy', 'uplifting', 'joy', 'celebrate', 'good'],
    'Energetic': ['energetic', 'dance', 'party', 'energy', 'fast', 'hard', 'rave'],
    'Nostalgic': ['nostalgic', 'memory', 'remember', 'past', 'old'],
    'Epic': ['epic', 'hero', 'mountains', 'grand', 'majestic'],
    'Dark': ['dark', 'night', 'shadow', 'evil', 'tense', 'suspense', 'fear', 'scary'],
    'Atmospheric': ['atmospheric', 'ethereal', 'spacey'],
    'Cinematic': ['cinematic', 'film', 'movie', 'score', 'soundtrack'],
    'Dreamy': ['dreamy', 'floating', 'hazy', 'surreal'],
    'Euphoric': ['euphoric', 'ecstatic', 'bliss', 'rush'],
    'Mysterious': ['mysterious', 'enigma', 'unknown', 'wonder'],
  };

  // Genre-implied moods as fallback when prompt has no explicit mood keywords
  const genreMoodDefaults: Record<string, string> = {
    'Techno': 'Energetic', 'Hard Techno': 'Aggressive', 'Acid Techno': 'Dark',
    'House': 'Euphoric', 'Deep House': 'Chill', 'Tech House': 'Energetic',
    'Ambient': 'Atmospheric', 'Lo-fi': 'Chill', 'EDM': 'Euphoric',
    'Metal': 'Aggressive', 'Industrial': 'Aggressive', 'Punk': 'Aggressive', 'Blues': 'Melancholic',
    'Jazz': 'Chill', 'Classical': 'Epic', 'Rock': 'Energetic',
    'Hip Hop': 'Dark', 'Trap': 'Dark', 'Drill': 'Aggressive',
    'UK Drill': 'Aggressive', 'Phonk': 'Dark', 'R&B': 'Romantic',
    'Soul': 'Romantic', 'Pop': 'Uplifting', 'Country': 'Nostalgic',
    'Folk': 'Nostalgic', 'Reggae': 'Chill', 'Dancehall': 'Energetic',
    'Afrobeats': 'Energetic', 'Reggaeton': 'Energetic',
    'Bollywood': 'Romantic', 'Bhangra': 'Energetic',
    'Punjabi Drill': 'Aggressive', 'K-Pop': 'Euphoric', 'J-Pop': 'Uplifting',
    'Synthwave': 'Nostalgic', 'Drum and Bass': 'Energetic',
  };

  let mood = '';
  for (const [m, kws] of Object.entries(moodKeywords)) {
    if (kws.some(k => matchesWholeWord(text, k))) { mood = m; break; }
  }
  if (!mood) {
    mood = genreMoodDefaults[genre] || 'Energetic';
  }

  // ─── TEMPO ────────────────────────────────────────────────────────────
  // Use the PRIMARY genre's BPM range from the database. When multiple
  // genres match, average the typical BPMs weighted by match score.
  const primaryDef = findGenreByName(genre);
  let tempo: number;

  if (genreMatches.length >= 2) {
    // Blend tempos: weighted average of all matched genres
    let totalWeight = 0;
    let weightedSum = 0;
    for (const match of genreMatches.slice(0, 3)) {
      const def = findGenreByName(match.genre);
      if (def) {
        weightedSum += def.bpmTypical * match.score;
        totalWeight += match.score;
      }
    }
    tempo = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : (primaryDef?.bpmTypical ?? 120);
  } else {
    tempo = primaryDef?.bpmTypical ?? 120;
  }

  // Apply speed modifiers from prompt (whole-word match to avoid false positives)
  const isSlow = matchesWholeWord(text, 'slow') || matchesWholeWord(text, 'ballad');
  const isFast = matchesWholeWord(text, 'fast') || matchesWholeWord(text, 'rave') || matchesWholeWord(text, 'hard');
  if (isSlow && primaryDef) {
    tempo = primaryDef.bpmMin;
  } else if (isFast && primaryDef) {
    tempo = Math.min(200, primaryDef.bpmMax);
  } else {
    // Small random jitter
    tempo = tempo + (random % 11) - 5;
  }
  // Clamp to primary genre's range (or global limits)
  if (primaryDef) {
    tempo = Math.max(primaryDef.bpmMin, Math.min(primaryDef.bpmMax, tempo));
  }
  tempo = Math.max(60, Math.min(200, tempo));

  // ─── VOCAL LANGUAGE ───────────────────────────────────────────────────
  const langKeywords: Record<string, string[]> = {
    'English': ['english', 'angrezi'],
    'Spanish': ['spanish', 'reggaeton', 'latin', 'habla'],
    'Punjabi': ['punjabi', 'desi'],
    'Hindi': ['hindi', 'bollywood'],
    'Korean': ['korean', 'k-pop', 'hangul'],
    'Japanese': ['japanese', 'j-pop', 'anime'],
    'Mandarin': ['mandarin', 'chinese', 'mandopop'],
    'French': ['french', 'francais'],
    'Portuguese': ['portuguese', 'brazilian', 'bossa nova'],
    'Arabic': ['arabic'],
  };

  // Genre-implied language fallback
  const genreLanguageDefaults: Record<string, string> = {
    'Bollywood': 'Hindi', 'Bhangra': 'Punjabi', 'Punjabi Drill': 'Punjabi',
    'Punjabi Pop': 'Punjabi', 'Desi Hip Hop': 'Hindi', 'K-Pop': 'Korean',
    'J-Pop': 'Japanese', 'Reggaeton': 'Spanish', 'Latin Pop': 'Spanish',
    'Bossa Nova': 'Portuguese', 'Arabic Pop': 'Arabic',
  };

  // Collect ALL matching languages (user may say "punjabi and english")
  const matchedLanguages: string[] = [];
  for (const [l, kws] of Object.entries(langKeywords)) {
    if (kws.some(k => matchesWholeWord(text, k))) { matchedLanguages.push(l); }
  }
  // Also add genre-implied languages for secondary genres
  if (matchedLanguages.length === 0) {
    const primaryLang = genreLanguageDefaults[genre];
    if (primaryLang) matchedLanguages.push(primaryLang);
    for (const sg of secondaryGenres) {
      const sgLang = genreLanguageDefaults[sg];
      if (sgLang && !matchedLanguages.includes(sgLang)) matchedLanguages.push(sgLang);
    }
  }
  if (matchedLanguages.length === 0) matchedLanguages.push('English');
  const vocalLanguage = matchedLanguages.join(', ');

  // ─── ARTIST INSPIRATION (can match multiple) ────────────────────────
  const matchedArtists: string[] = [];
  const artistPatterns: [string, string[]][] = [
    ['Drake', ['drake']],
    ['The Weeknd', ['weeknd', 'the weeknd']],
    ['Bad Bunny', ['bad bunny', 'badbunny']],
    ['Blackpink', ['blackpink', 'bp']],
    ['BTS', ['bts']],
    ['AP Dhillon', ['ap dhillon', 'dhillon']],
    ['Diljit Dosanjh', ['diljit']],
    ['Yo Yo Honey Singh', ['yo yo', 'honey singh']],
    ['Taylor Swift', ['taylor swift', 'taylor']],
    ['Beyoncé', ['beyonce']],
    ['Dua Lipa', ['dua lipa']],
    ['Travis Scott', ['travis scott']],
    ['Kendrick Lamar', ['kendrick']],
    ['Billie Eilish', ['billie eilish', 'billie']],
    ['Ariana Grande', ['ariana']],
    ['Kanye West', ['kanye', 'ye']],
    ['Daft Punk', ['daft punk']],
    ['Skrillex', ['skrillex']],
    ['Arijit Singh', ['arijit']],
    ['Carl Cox', ['carl cox']],
    ['Charlotte de Witte', ['charlotte de witte']],
    ['Amelie Lens', ['amelie lens']],
  ];
  for (const [artist, triggers] of artistPatterns) {
    if (triggers.some(t => matchesWholeWord(text, t))) { matchedArtists.push(artist); }
  }
  const artistInspiration = matchedArtists.join(', ');

  // ─── VOCAL STYLE (depends on genre) ───────────────────────────────────
  // Labels MUST match PRESET_VOCAL_STYLES.
  const vocalStyleMap: Record<string, string> = {
    'Hip Hop': 'Rap Vocal', 'Trap': 'Rap Vocal', 'Drill': 'Rap Vocal',
    'UK Drill': 'Rap Vocal', 'Desi Hip Hop': 'Rap Vocal', 'Phonk': 'Rap Vocal',
    'Punjabi Drill': 'Rap Vocal',
    'Rock': 'Gravely Rock', 'Punk': 'Gravely Rock',
    'Metal': 'Aggressive Growl',
    'Jazz': 'Sultry Jazz', 'Blues': 'Sultry Jazz', 'Soul': 'Soulful Diva',
    'Classical': 'Opera Tenor',
    'Pop': 'Female Vocal', 'Indie Pop': 'Female Vocal', 'J-Pop': 'Female Vocal',
    'R&B': 'Soulful Diva', 'Bollywood': 'Soulful Diva',
    'Lo-fi': 'Whisper Vocal', 'Ambient': 'Whisper Vocal',
    'Electronic': 'Robotic Vocal', 'EDM': 'Robotic Vocal',
    'Techno': 'Robotic Vocal', 'Hard Techno': 'Robotic Vocal', 'Industrial': 'Aggressive Growl',
    'House': 'Soulful Diva', 'Deep House': 'Soulful Diva',
    'Reggaeton': 'Male Vocal', 'Dancehall': 'Male Vocal',
    'Bhangra': 'Male Vocal', 'Country': 'Male Vocal', 'Folk': 'Male Vocal',
    'K-Pop': 'Choir Vocal',
    'Afrobeats': 'Male Vocal',
    'Synthwave': 'Robotic Vocal',
    'Reggae': 'Male Vocal',
  };
  const vocalStyle = vocalStyleMap[genre] || 'Male Vocal';

  // ─── INSTRUMENTATION (depends on genre, blended with secondaries) ─────
  const instMap: Record<string, string[]> = {
    'Electronic': ['Synths', 'Drum Machine', 'Bass Synth', 'Pad'],
    'Techno': ['Kick', 'Hi-Hats', 'Acid Bass', 'Synth Stabs', 'Clap'],
    'Hard Techno': ['Distorted Kick', 'Industrial Synth', 'Acid 303', 'Clap', 'Noise'],
    'Industrial': ['Distorted Kick', 'Industrial Synth', 'Metal Percussion', 'Noise', 'Clap'],
    'House': ['Piano', '909 Drums', 'Bass', 'Organ', 'Vocal Chops'],
    'Deep House': ['Piano', 'Warm Bass', 'Soft Drums', 'Pad', 'Vocal Chops'],
    'Tech House': ['Kick', 'Hi-Hats', 'Bass', 'Synth Stabs', 'Percussion'],
    'EDM': ['Supersaw Lead', 'Kick', 'Bass Drop', 'Pluck Synth', 'Drums'],
    'Hip Hop': ['808 Bass', 'Drums', 'Piano', 'Synth'],
    'Trap': ['808 Bass', 'Hi-Hat Rolls', 'Snare', 'Synth', 'Piano'],
    'Drill': ['Sliding 808', 'Drill Drums', 'Piano', 'Dark Strings'],
    'UK Drill': ['Sliding 808', 'Drill Drums', 'Piano', 'Dark Strings'],
    'Phonk': ['808 Bass', 'Cowbell', 'Distorted Kick', 'Vocal Samples'],
    'Rock': ['Electric Guitar', 'Drums', 'Bass Guitar', 'Keys'],
    'Metal': ['Distorted Guitar', 'Double Kick', 'Bass', 'Orchestral'],
    'Punk': ['Electric Guitar', 'Fast Drums', 'Bass'],
    'Jazz': ['Piano', 'Saxophone', 'Drums', 'Double Bass'],
    'Blues': ['Electric Guitar', 'Harmonica', 'Piano', 'Bass', 'Drums'],
    'Classical': ['Strings', 'Woodwinds', 'Brass', 'Piano'],
    'Pop': ['Piano', 'Drums', 'Synth', 'Bass', 'Guitar'],
    'R&B': ['Piano', 'Synth', '808', 'Guitar'],
    'Lo-fi': ['Dusty Piano', 'Vinyl Crackle', 'Soft Drums'],
    'Punjabi Drill': ['Sliding 808', 'Drill Drums', 'Dhol', 'Tumbi', 'Dark Piano'],
    'Reggaeton': ['Dembow Drums', '808 Bass', 'Synth', 'Latin Percussion'],
    'Bhangra': ['Dhol', 'Tumbi', 'Bass', 'Drums', 'Chimta'],
    'Bollywood': ['Tabla', 'Sitar', 'Strings', 'Synth', 'Drums'],
    'K-Pop': ['Synths', '808', 'Drums', 'Piano', 'Strings'],
    'J-Pop': ['Synths', 'Drums', 'Bass', 'Guitar', 'Strings'],
    'Country': ['Acoustic Guitar', 'Pedal Steel', 'Fiddle', 'Drums', 'Bass'],
    'Folk': ['Acoustic Guitar', 'Banjo', 'Fiddle', 'Harmonica'],
    'Ambient': ['Pad Synth', 'Reverb Guitar', 'Field Recordings'],
    'Synthwave': ['Analog Synth', 'Drum Machine', 'Bass Synth', 'Guitar'],
    'Drum and Bass': ['Breakbeat Drums', 'Sub Bass', 'Synth', 'Vocal Chops'],
    'Afrobeats': ['Percussion', 'Bass', 'Synth', 'Guitar', 'Drums'],
    'Dancehall': ['Digital Riddim', 'Drum Machine', 'Bass'],
    'Reggae': ['Guitar Skank', 'Bass', 'Organ', 'Drums'],
    'Soul': ['Piano', 'Organ', 'Brass', 'Bass', 'Drums'],
    'Funk': ['Bass Guitar', 'Drums', 'Guitar', 'Brass', 'Organ'],
    'Desi Hip Hop': ['808', 'Sampled Tabla', 'Synth', 'Bass'],
    'Punjabi Pop': ['Dhol', 'Synth', 'Bass', 'Guitar', 'Drums'],
    'Bossa Nova': ['Nylon Guitar', 'Piano', 'Light Percussion', 'Bass'],
  };

  // Start with primary genre instruments, blend in secondaries
  let instrumentList = instMap[genre] || ['Drums', 'Bass', 'Synth', 'Keys'];
  if (secondaryGenres.length > 0) {
    const secondaryInsts = new Set<string>();
    for (const sg of secondaryGenres) {
      const sgInsts = instMap[sg];
      if (sgInsts) sgInsts.forEach(i => secondaryInsts.add(i));
    }
    // Merge: keep primary instruments, add unique secondary ones
    const merged = [...instrumentList];
    for (const si of secondaryInsts) {
      if (!merged.some(m => m.toLowerCase() === si.toLowerCase())) {
        merged.push(si);
      }
    }
    instrumentList = merged.slice(0, 7); // Cap at 7
  }
  const instrumentation = instrumentList.join(', ');

  // ─── LYRIC THEME (depends on mood) ────────────────────────────────────
  const themeMap: Record<string, string> = {
    'Aggressive': 'Fight or Fall', 'Chill': 'Peace Within',
    'Melancholic': 'Lost Love', 'Romantic': 'Heart Beats',
    'Uplifting': 'Rise Up', 'Energetic': 'No Limits',
    'Nostalgic': 'Remember When', 'Epic': 'Hero Journey',
    'Dark': 'Shadows', 'Atmospheric': 'Edge of Dawn',
    'Cinematic': 'The Final Act', 'Dreamy': 'Floating Away',
    'Euphoric': 'Limitless', 'Mysterious': 'Hidden Truths',
  };
  const lyricTheme = themeMap[mood] || 'Story of Us';

  // ─── VIDEO STYLE (depends on genre) ───────────────────────────────────
  // Labels MUST match PRESET_VIDEO_STYLES.
  const videoStyleMap: Record<string, string> = {
    'Electronic': 'Neon Cityscapes', 'Techno': 'Neon Cityscapes',
    'Hard Techno': 'Glitch Art', 'Industrial': 'Glitch Art', 'House': 'Neon Cityscapes',
    'EDM': 'Neon Cityscapes', 'Ambient': 'Cosmic Nebula',
    'Hip Hop': 'Urban Street Art', 'Trap': 'Urban Street Art',
    'Drill': 'Urban Street Art', 'UK Drill': 'Urban Street Art',
    'Rock': 'Glitch Art', 'Metal': 'Glitch Art', 'Punk': 'Glitch Art',
    'Jazz': 'Minimalist Lines', 'Blues': 'Minimalist Lines',
    'Classical': 'Nature & Landscapes',
    'Pop': 'Fluid Liquid Motion', 'Indie Pop': 'Fluid Liquid Motion',
    'R&B': 'Neon Cityscapes', 'Soul': 'Minimalist Lines',
    'Lo-fi': 'Vaporwave Retro', 'Synthwave': 'Vaporwave Retro',
    'Punjabi Drill': 'Neon Cityscapes',
    'Reggaeton': 'Fluid Liquid Motion', 'Bhangra': 'Fluid Liquid Motion',
    'Bollywood': 'Cosmic Nebula', 'K-Pop': 'Neon Cityscapes',
    'J-Pop': 'Vaporwave Retro', 'Country': 'Nature & Landscapes',
    'Folk': 'Nature & Landscapes', 'Afrobeats': 'Fluid Liquid Motion',
    'Drum and Bass': 'Glitch Art', 'Phonk': 'Glitch Art',
  };
  const videoStyle = videoStyleMap[genre] || 'Abstract Geometric';

  // ─── SUBGENRE ─────────────────────────────────────────────────────────
  // When secondary genres exist, use them as subgenres
  let subgenre = '';
  if (secondaryGenres.length > 0) {
    subgenre = secondaryGenres.join(', ');
  } else {
    const subgenreMap: Record<string, string> = {
      'Punjabi Drill': 'UK Punjabi drill', 'Reggaeton': 'Latin trap',
      'Bhangra': 'Modern Bhangra', 'Bollywood': 'Filmi pop',
      'Hip Hop': 'Boom Bap', 'Rock': 'Indie rock', 'Pop': 'Synth-pop',
      'Electronic': 'Future bass', 'R&B': 'Alt-R&B', 'Lo-fi': 'Lo-fi hip hop',
      'Metal': 'Metalcore', 'K-Pop': 'Dance-pop K-Pop', 'J-Pop': 'City pop',
      'Country': 'Country pop', 'Jazz': 'Smooth jazz',
      'Classical': 'Cinematic classical', 'Techno': 'Industrial techno',
      'Hard Techno': 'Acid techno', 'House': 'Deep house',
      'Trap': 'Melodic trap', 'Drill': 'UK drill',
    };
    subgenre = subgenreMap[genre] || '';
  }

  // ─── ENERGY (depends on mood) ─────────────────────────────────────────
  const energyMap: Record<string, number> = {
    Aggressive: 9, Euphoric: 9, Energetic: 8, Epic: 8,
    Uplifting: 7, Cinematic: 7, Dark: 6, Mysterious: 6,
    Romantic: 5, Atmospheric: 4, Nostalgic: 4, Dreamy: 3,
    Melancholic: 3, Chill: 2,
  };
  const energyLevel = energyMap[mood] ?? 7;

  // ─── VOCAL INTENSITY (depends on mood) ────────────────────────────────
  const vocalIntensityMap: Record<string, number> = {
    Aggressive: 9, Euphoric: 9, Energetic: 8, Epic: 8,
    Uplifting: 7, Cinematic: 7, Romantic: 6, Dark: 6,
    Mysterious: 5, Atmospheric: 4, Nostalgic: 4, Dreamy: 3,
    Melancholic: 3, Chill: 2,
  };
  const vocalIntensity = vocalIntensityMap[mood] ?? 7;

  // ─── STRUCTURE (depends on genre) ─────────────────────────────────────
  // Values MUST match SONG_STRUCTURE_PRESETS in src/data/form-presets.ts
  const structureMap: Record<string, string> = {
    'Hip Hop': 'Intro → Verse → Hook → Verse → Hook → Outro',
    'Trap': 'Intro → Verse → Hook → Verse → Hook → Outro',
    'Punjabi Drill': 'Intro → Verse → Hook → Verse → Hook → Outro',
    'Drill': 'Intro → Verse → Hook → Verse → Hook → Outro',
    'Pop': 'Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro',
    'K-Pop': 'Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro',
    'J-Pop': 'Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro',
    'R&B': 'Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro',
    'Country': 'Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro',
    'Folk': 'Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro',
    'Rock': 'Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro',
    'Metal': 'Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro',
    'Electronic': 'Intro → Build → Drop → Breakdown → Drop → Outro',
    'EDM': 'Intro → Build → Drop → Breakdown → Drop → Outro',
    'Techno': 'Intro → Build → Drop → Breakdown → Drop → Outro',
    'Hard Techno': 'Intro → Build → Drop → Breakdown → Drop → Outro',
    'Industrial': 'Intro → Build → Drop → Breakdown → Drop → Outro',
    'House': 'Intro → Build → Drop → Breakdown → Drop → Outro',
    'Drum and Bass': 'Intro → Build → Drop → Breakdown → Drop → Outro',
    'Reggaeton': 'Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro',
    'Classical': 'Exposition → Development → Recapitulation → Coda',
    'Jazz': 'Intro → Theme → Solo → Theme → Outro',
    'Lo-fi': 'Intro → Build → Climax → Resolution → Outro',
    'Ambient': 'Intro → Build → Climax → Resolution → Outro',
    'Bhangra': 'Intro → Verse → Hook → Verse → Hook → Outro',
    'Bollywood': 'Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro',
  };
  const structureType = structureMap[genre] || 'Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro';

  // ─── VOCAL EFFECTS (depends on genre) ─────────────────────────────────
  const effectsMap: Record<string, string[]> = {
    'Hip Hop': ['delay', 'plate reverb', 'light autotune'],
    'Trap': ['autotune', 'delay', 'stereo doubler'],
    'Punjabi Drill': ['autotune', 'short slap delay', 'tight reverb'],
    'Pop': ['bright reverb', 'stereo doubler', 'gentle compression'],
    'R&B': ['lush reverb', 'slap delay', 'subtle autotune'],
    'Reggaeton': ['autotune', 'dub delay', 'plate reverb'],
    'Rock': ['short room reverb', 'saturation'],
    'Metal': ['saturation', 'tight gate'],
    'Electronic': ['sidechain ducking', 'delay throws', 'reverb tails'],
    'Techno': ['sidechain ducking', 'delay throws', 'distortion'],
    'Hard Techno': ['distortion', 'delay throws', 'sidechain ducking'],
    'House': ['sidechain ducking', 'delay', 'bright reverb'],
    'EDM': ['sidechain ducking', 'delay throws', 'reverb tails'],
    'K-Pop': ['stereo doubler', 'bright reverb', 'soft autotune'],
    'J-Pop': ['stereo doubler', 'plate reverb'],
    'Bollywood': ['plate reverb', 'tape delay'],
    'Bhangra': ['plate reverb', 'tape delay'],
    'Country': ['room reverb', 'tape slap'],
    'Jazz': ['plate reverb', 'tape delay'],
    'Classical': ['concert hall reverb', 'early reflections'],
    'Lo-fi': ['vinyl crackle', 'tape saturation'],
    'Ambient': ['long shimmer reverb', 'granular delay'],
    'Drum and Bass': ['short reverb', 'delay throws'],
    'Synthwave': ['gated reverb', 'chorus', 'delay'],
  };
  const vocalEffects = effectsMap[genre] || [];

  // ─── VOCAL ARRANGEMENT (depends on genre) ─────────────────────────────
  // Values MUST be one of: 'solo' | 'duet' | 'choir' | 'none'
  const arrangementMap: Record<string, string> = {
    'K-Pop': 'choir', 'Bollywood': 'duet', 'Bhangra': 'choir',
    'Classical': 'choir', 'Choir Vocal': 'choir',
  };
  const vocalArrangement = arrangementMap[genre] || 'solo';

  // ─── Multi-select arrays for UI fields ──────────────────────────────
  // allGenres: primary + secondaries so the genre SmartSearchInput shows all
  const allGenres = [genre, ...secondaryGenres];
  // allSubgenres: split comma-separated subgenre into array
  const allSubgenres = subgenre ? subgenre.split(',').map(s => s.trim()).filter(Boolean) : [];
  // allLanguages: already collected above
  const allLanguages = matchedLanguages;
  // allArtists: already collected above
  const allArtists = matchedArtists;

  return {
    genre,
    subgenre,
    mood,
    tempo,
    artistInspiration,
    vocalLanguage,
    lyrics: "",
    prompt: description,
    lyricTheme,
    instrumental: matchesWholeWord(text, 'instrumental') || matchesWholeWord(text, 'no vocals'),
    vocalStyle,
    instrumentation,
    videoStyle,
    energyLevel,
    vocalIntensity,
    structureType,
    vocalEffects,
    vocalArrangement,
    // Multi-value arrays for multi-select UI fields
    allGenres,
    allSubgenres,
    allLanguages,
    allArtists,
  };
}

export function inferContextFromDescription(description: string, seed?: string) {
  const uniqueSeed = seed || `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  return inferContextLocally(description, uniqueSeed);
}
