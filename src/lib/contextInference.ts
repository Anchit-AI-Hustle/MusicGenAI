import { CreativeContext } from "@/types/creative-context";
import { findGenreByName } from "@/lib/musicData/genres";

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

  let genre = 'Pop';
  for (const [g, kws] of Object.entries(genreKeywords)) {
    if (kws.some(k => text.includes(k))) genre = g;
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
    if (kws.some(k => text.includes(k))) mood = m;
  }

  // TEMPO - Based on energy + random variation
  const genreDef = findGenreByName(genre);
  let tempo = genreDef?.bpmTypical ?? 110;
  
  if (text.includes('slow') || text.includes('ballad') || text.includes('chill')) {
    tempo = genreDef?.bpmMin ?? 70;
  }
  if (text.includes('fast') || text.includes('dance') || text.includes('energetic')) {
    tempo = Math.min(180, (genreDef?.bpmMax ?? 160));
  }
  // Add seed variation for uniqueness
  tempo = tempo + (random % 21) - 10;

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
    if (kws.some(k => text.includes(k))) vocalLanguage = l;
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

  // VOCAL STYLE - Based on genre
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
  };
  const videoStyle = videoStyleMap[genre] || 'Abstract Geometric';

  return {
    genre,
    subgenre: genre === 'Punjabi Drill' ? 'UK Punjabi drill' : '',
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
  };
}

export function inferContextFromDescription(description: string, seed?: string) {
  const uniqueSeed = seed || `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  return inferContextLocally(description, uniqueSeed);
}