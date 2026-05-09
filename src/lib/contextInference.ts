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
  resolved.tempo = resolved.tempo || 110;
  resolved.duration = resolved.duration || 120;
  resolved.vocalsEnabled = resolved.vocalsEnabled !== undefined ? resolved.vocalsEnabled : true;
  resolved.vocalLanguage = resolved.vocalLanguage || "English";
  resolved.vocalStyle = resolved.vocalStyle || "Contemporary";
  resolved.vocalIntensity = resolved.vocalIntensity || 5;
  resolved.artistInspiration = resolved.artistInspiration || "";
  resolved.instruments = resolved.instruments || [];
  resolved.energyLevel = resolved.energyLevel || 5;
  resolved.structureType = resolved.structureType || "Verse-Chorus-Bridge";
  resolved.lyricsTheme = resolved.lyricsTheme || "Story of Us";
  resolved.videoStyle = resolved.videoStyle || "Neon City Night";
  resolved.creativityLevel = resolved.creativityLevel || 5;
  resolved.variationSeed = resolved.variationSeed || `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  resolved.generationMode = resolved.generationMode || 'standard';
  
  return resolved;
}

function inferContextLocally(description: string, seed: string) {
  const text = description.toLowerCase();
  const random = parseInt(seed) % 100;

  // GENRE - Keyword matching with fuzzy fallbacks
  const genreKeywords: Record<string, string[]> = {
    'Punjabi Drill': ['punjabi drill', 'uk punjabi', 'desi drill'],
    'Reggaeton': ['reggaeton', 'latin', 'spanish'],
    'Hip Hop': ['hip hop', 'rap', 'trap', 'gangsta'],
    'Rock': ['rock', 'guitar', 'band'],
    'Electronic': ['edm', 'electronic', 'techno', 'house'],
    'Jazz': ['jazz', 'smooth jazz'],
    'Classical': ['classical', 'orchestral', 'symphony'],
    'Lo-fi': ['lofi', 'lo-fi', 'chill'],
    'R&B': ['r&b', 'soul'],
    'Pop': ['pop', 'mainstream'],
    'K-Pop': ['k-pop', 'korean pop', 'kpop'],
    'J-Pop': ['j-pop', 'japanese pop', 'jpop'],
    'Bhangra': ['bhangra', 'punjabi'],
    'Bollywood': ['bollywood', 'hindi'],
    'Country': ['country', 'folk'],
    'Metal': ['metal', 'heavy', 'death'],
  };

  // First-match wins (more specific genres are listed earlier, so a hit on
  // "punjabi drill" should beat the looser "punjabi" → "Bhangra" match below).
  let genre = 'Pop';
  for (const [g, kws] of Object.entries(genreKeywords)) {
    if (kws.some(k => text.includes(k))) { genre = g; break; }
  }

  // MOOD - Based on emotional keywords
  const moodKeywords: Record<string, string[]> = {
    'Aggressive': ['aggressive', 'intense', 'dark', 'anger', 'rage', 'fight', 'hard'],
    'Calm': ['calm', 'peaceful', 'chill', 'relax', 'soft'],
    'Melancholic': ['sad', 'melancholic', 'heartbreak', 'pain', 'tears'],
    'Romantic': ['love', 'romantic', 'heart', 'kiss', 'baby'],
    'Uplifting': ['happy', 'uplifting', 'joy', 'celebrate', 'good'],
    'Energetic': ['energetic', 'dance', 'party', 'energy', 'fast'],
    'Nostalgic': ['nostalgic', 'memory', 'remember', 'past', 'old'],
    'Epic': ['epic', 'cinematic', 'hero', 'mountains'],
    'Tense': ['tense', 'suspense', 'fear', 'scary'],
    'Dark': ['dark', 'night', 'shadow', 'evil'],
  };

  let mood = 'Energetic';
  for (const [m, kws] of Object.entries(moodKeywords)) {
    if (kws.some(k => text.includes(k))) { mood = m; break; }
  }

  // TEMPO - Based on energy + random variation
  const genreDef = findGenreByName(genre);
  let tempo = genreDef?.bpmTypical ?? 110;
  const isSlow = text.includes('slow') || text.includes('ballad') || text.includes('chill');
  const isFast = text.includes('fast') || text.includes('dance') || text.includes('energetic');

  if (isSlow) {
    tempo = genreDef?.bpmMin ?? 70;
  } else if (isFast) {
    tempo = Math.min(180, (genreDef?.bpmMax ?? 160));
  } else {
    // Only jitter when the user hasn't pinned to a slow/fast extreme; the
    // pin should saturate exactly at the genre's bpmMin/bpmMax.
    tempo = tempo + (random % 21) - 10;
  }
  if (genreDef) {
    tempo = Math.max(genreDef.bpmMin, Math.min(genreDef.bpmMax, tempo));
  }

  // VOCAL LANGUAGE - Cultural keywords
  const langKeywords: Record<string, string[]> = {
    'English': ['english', 'angrezi'],
    'Spanish': ['spanish', 'reggaeton', 'latin', 'habla'],
    'Punjabi': ['punjabi', 'punjabi', 'desi'],
    'Hindi': ['hindi', 'bollywood', 'desi'],
    'Korean': ['korean', 'k-pop', 'hangul'],
    'Japanese': ['japanese', 'j-pop', 'anime'],
    'Mandarin': ['mandarin', 'chinese', 'mandopop'],
    'French': ['french', 'francais'],
    'Portuguese': ['portuguese', 'brazilian'],
    'Arabic': ['arabic'],
  };

  let vocalLanguage = 'English';
  for (const [l, kws] of Object.entries(langKeywords)) {
    if (kws.some(k => text.includes(k))) { vocalLanguage = l; break; }
  }

  // ARTIST INSPIRATION - Artist name matching
  let artistInspiration = '';
  const artistLower = text.toLowerCase();
  if (artistLower.includes('drake')) artistInspiration = 'Drake';
  else if (artistLower.includes('weeknd') || artistLower.includes('the weeknd')) artistInspiration = 'The Weeknd';
  else if (artistLower.includes('bad bunny') || artistLower.includes('badbunny')) artistInspiration = 'Bad Bunny';
  else if (artistLower.includes('bp') || artistLower.includes('blackpink')) artistInspiration = 'Blackpink';
  else if (artistLower.includes('bts')) artistInspiration = 'BTS';
  else if (artistLower.includes('ap dhillon') || artistLower.includes('dhillon')) artistInspiration = 'AP Dhillon';
  else if (artistLower.includes('diljit')) artistInspiration = 'Diljit Dosanjh';
  else if (artistLower.includes('yo yo') || artistLower.includes('honey singh')) artistInspiration = 'Yo Yo Honey Singh';
  else if (artistLower.includes('taylor') || artistLower.includes('swift')) artistInspiration = 'Taylor Swift';
  else if (artistLower.includes('beyonce')) artistInspiration = 'Beyoncé';
  else if (artistLower.includes('dua lipa')) artistInspiration = 'Dua Lipa';

  // VOCAL STYLE - Based on genre. Covers every entry in `genreKeywords`.
  const vocalStyleMap: Record<string, string> = {
    'Hip Hop': 'Rapped',
    'Rock': 'Gritty',
    'Jazz': 'Smooth',
    'Classical': 'Operatic',
    'Pop': 'Contemporary',
    'R&B': 'Breathless',
    'Metal': 'Screamed',
    'Lo-fi': 'Whispers',
    'Electronic': 'Auto-tuned',
    'Punjabi Drill': 'Aggressive male rap',
    'Reggaeton': 'Latin Pop',
    'Bhangra': 'Folk Punjabi vocals',
    'Bollywood': 'Filmi playback',
    'K-Pop': 'Polished group harmony',
    'J-Pop': 'Bright lead vocal',
    'Country': 'Storytelling drawl',
  };
  const vocalStyle = vocalStyleMap[genre] || 'Contemporary';

  // INSTRUMENTATION - Based on genre
  const instMap: Record<string, string> = {
    'Electronic': 'Synths, Drums, Bass, Pad',
    'Hip Hop': 'Drums, 808 Bass, Piano, Synth',
    'Rock': 'Electric Guitar, Drums, Bass, Keys',
    'Jazz': 'Piano, Saxophone, Drums, Double Bass',
    'Classical': 'Orchestra, Strings, Brass',
    'Pop': 'Piano, Drums, Synth, Bass',
    'R&B': 'Piano, Synth, 808, Guitar',
    'Metal': 'Electric Guitar, Drums, Bass, Orchestral',
    'Lo-fi': 'Piano, Vinyl, Dusty Keys',
    'Punjabi Drill': 'Sliding 808, Drill Drums, Tabla, Dhol, Sitar',
    'Reggaeton': 'Dembow Drums, 808 Bass, Synth, Latin Percussion',
    'Bhangra': 'Dhol, Tumbi, Sitar, Bass, Drums',
    'Bollywood': 'Tabla, Sitar, Strings, Synth, Drums',
    'K-Pop': 'Synths, 808, Drums, Piano, Strings',
    'J-Pop': 'Synths, Drums, Bass, Guitar, Strings',
    'Country': 'Acoustic Guitar, Banjo, Fiddle, Drums, Bass',
  };
  const instrumentation = instMap[genre] || 'Drums, Bass, Keys, Synth';

  // LYRIC THEME - Based on mood
  const themeMap: Record<string, string> = {
    'Aggressive': 'Fight or Fall',
    'Calm': 'Peace Within',
    'Melancholic': 'Lost Love',
    'Romantic': 'Heart Beats',
    'Uplifting': 'Rise Up',
    'Energetic': 'No Limits',
    'Nostalgic': 'Remember When',
    'Epic': 'Hero Journey',
    'Dark': 'Shadows',
    'Tense': 'Edge of Dawn',
  };
  const lyricTheme = themeMap[mood] || 'Story of Us';

  // VIDEO STYLE - Based on mood + genre
  const videoStyleMap: Record<string, string> = {
    'Electronic': 'Neon City Night',
    'Hip Hop': 'Urban Street',
    'Rock': 'Concert Performance',
    'Jazz': 'Vintage Film',
    'Classical': 'Nature Documentary',
    'Pop': 'Romantic Sunset',
    'R&B': 'Neon City Night',
    'Metal': 'Concert Performance',
    'Lo-fi': 'Vintage Film',
    'Punjabi Drill': 'Cinematic Night City',
    'Reggaeton': 'Beach Party',
    'Bhangra': 'Punjabi Wedding Festival',
    'Bollywood': 'Bollywood Cinematic',
    'K-Pop': 'Choreographed Stage',
    'J-Pop': 'Anime Aesthetic',
    'Country': 'Open Road',
  };
  const videoStyle = videoStyleMap[genre] || 'Abstract Geometric';

  // SUBGENRE - Based on genre. Fallback to a sensible flagship style.
  const subgenreMap: Record<string, string> = {
    'Punjabi Drill': 'UK Punjabi drill',
    'Reggaeton': 'Latin trap',
    'Bhangra': 'Modern Bhangra',
    'Bollywood': 'Filmi pop',
    'Hip Hop': 'Trap',
    'Rock': 'Indie rock',
    'Pop': 'Synth-pop',
    'Electronic': 'Future bass',
    'R&B': 'Alt-R&B',
    'Lo-fi': 'Lo-fi hip hop',
    'Metal': 'Metalcore',
    'K-Pop': 'Dance-pop K-Pop',
    'J-Pop': 'City pop',
    'Country': 'Country pop',
    'Jazz': 'Smooth jazz',
    'Classical': 'Cinematic classical',
  };
  const subgenre = subgenreMap[genre] || '';

  // ENERGY (1-10) - mood-driven so the slider reflects intent.
  const energyMap: Record<string, number> = {
    Aggressive: 9,
    Energetic: 8,
    Epic: 8,
    Uplifting: 7,
    Tense: 7,
    Dark: 6,
    Romantic: 5,
    Nostalgic: 4,
    Melancholic: 3,
    Calm: 2,
  };
  const energyLevel = energyMap[mood] ?? 5;

  // VOCAL INTENSITY (1-10) - mood-driven, slightly higher than energy.
  const vocalIntensityMap: Record<string, number> = {
    Aggressive: 9,
    Energetic: 8,
    Epic: 8,
    Uplifting: 7,
    Romantic: 6,
    Tense: 6,
    Dark: 6,
    Nostalgic: 4,
    Melancholic: 3,
    Calm: 2,
  };
  const vocalIntensity = vocalIntensityMap[mood] ?? 5;

  // STRUCTURE - genre-aware template defaults.
  const structureMap: Record<string, string> = {
    'Hip Hop': 'Verse-Chorus-Verse',
    'Punjabi Drill': 'Verse-Chorus-Verse',
    'Pop': 'Verse-Chorus-Bridge',
    'K-Pop': 'Verse-Chorus-Bridge',
    'J-Pop': 'Verse-Chorus-Bridge',
    'Rock': 'Verse-Chorus-Solo',
    'Metal': 'Verse-Chorus-Breakdown',
    'Electronic': 'Build-Drop-Break',
    'Reggaeton': 'Verse-Chorus-Drop',
    'R&B': 'Verse-Chorus-Bridge',
    'Classical': 'Movement',
    'Jazz': 'Head-Solo-Head',
    'Lo-fi': 'Loop-Variation',
    'Country': 'Verse-Chorus-Bridge',
    'Bhangra': 'Verse-Hook-Verse',
    'Bollywood': 'Antara-Mukhda-Antara',
  };
  const structureType = structureMap[genre] || 'Verse-Chorus-Bridge';

  // VOCAL EFFECTS - genre-typical processing.
  const effectsMap: Record<string, string[]> = {
    'Hip Hop': ['delay', 'plate reverb', 'light autotune'],
    'Punjabi Drill': ['autotune', 'short slap delay', 'tight reverb'],
    'Pop': ['bright reverb', 'stereo doubler', 'gentle compression'],
    'R&B': ['lush reverb', 'slap delay', 'subtle autotune'],
    'Reggaeton': ['autotune', 'dub delay', 'plate reverb'],
    'Rock': ['short room reverb', 'saturation'],
    'Metal': ['saturation', 'tight gate'],
    'Electronic': ['sidechain ducking', 'delay throws', 'reverb tails'],
    'K-Pop': ['stereo doubler', 'bright reverb', 'soft autotune'],
    'J-Pop': ['stereo doubler', 'plate reverb'],
    'Bollywood': ['plate reverb', 'tape delay'],
    'Bhangra': ['plate reverb', 'tape delay'],
    'Country': ['room reverb', 'tape slap'],
    'Jazz': ['plate reverb', 'tape delay'],
    'Classical': ['concert hall reverb', 'early reflections'],
    'Lo-fi': ['vinyl crackle', 'tape saturation'],
  };
  const vocalEffects = effectsMap[genre] || [];

  // VOCAL ARRANGEMENT - solo vs group.
  const arrangementMap: Record<string, string> = {
    'K-Pop': 'group',
    'Bollywood': 'duet',
    'Bhangra': 'group',
    'Classical': 'choir',
  };
  const vocalArrangement = arrangementMap[genre] || 'solo';

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
    instrumental: text.includes('instrumental'),
    vocalStyle,
    instrumentation,
    videoStyle,
    energyLevel,
    vocalIntensity,
    structureType,
    vocalEffects,
    vocalArrangement,
  };
}

export function inferContextFromDescription(description: string, seed?: string) {
  const uniqueSeed = seed || `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  return inferContextLocally(description, uniqueSeed);
}