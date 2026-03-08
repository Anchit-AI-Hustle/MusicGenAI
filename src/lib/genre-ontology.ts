/**
 * Genre Ontology System
 * Maps genres to musical properties: tempo ranges, instrument palettes,
 * rhythm patterns, song structures, harmonic tendencies, and groove templates.
 */

export interface GenreProfile {
  tempoRange: [number, number];
  instruments: string[];
  rhythmStyle: 'four-on-floor' | 'breakbeat' | 'boom-bap' | 'swing' | 'straight' | 'shuffle' | 'halftime' | 'polyrhythm';
  grooveTemplate: string;
  structureTemplate: string[];
  harmonicStyle: 'minor' | 'major' | 'modal' | 'chromatic' | 'pentatonic' | 'blues';
  energyCurve: 'build-drop' | 'verse-chorus' | 'through-composed' | 'arc' | 'plateau' | 'escalating';
  density: number; // 0-1, how many layers typically active
  swing: number; // 0-1, amount of swing/shuffle
  characteristics: string[];
}

const GENRE_PROFILES: Record<string, GenreProfile> = {
  // ===== ELECTRONIC =====
  'techno': {
    tempoRange: [125, 140], instruments: ['kick', 'clap', 'hihat', 'bass', 'acid_synth', 'pad', 'perc'],
    rhythmStyle: 'four-on-floor', grooveTemplate: 'warehouse', structureTemplate: ['intro', 'build', 'drop', 'breakdown', 'drop', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'build-drop', density: 0.7, swing: 0, characteristics: ['driving', 'hypnotic', 'repetitive'],
  },
  'hard techno': {
    tempoRange: [140, 155], instruments: ['kick', 'clap', 'hihat', 'distorted_bass', 'acid_synth', 'industrial_perc'],
    rhythmStyle: 'four-on-floor', grooveTemplate: 'berlin', structureTemplate: ['intro', 'build', 'drop', 'breakdown', 'drop', 'peak', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'escalating', density: 0.85, swing: 0, characteristics: ['aggressive', 'industrial', 'relentless'],
  },
  'house': {
    tempoRange: [118, 130], instruments: ['kick', 'clap', 'hihat', 'bass', 'organ', 'pad', 'vocal_chop'],
    rhythmStyle: 'four-on-floor', grooveTemplate: 'swing', structureTemplate: ['intro', 'verse', 'build', 'drop', 'breakdown', 'drop', 'outro'],
    harmonicStyle: 'major', energyCurve: 'build-drop', density: 0.6, swing: 0.15, characteristics: ['groovy', 'soulful', 'uplifting'],
  },
  'deep house': {
    tempoRange: [118, 125], instruments: ['kick', 'clap', 'hihat', 'deep_bass', 'pad', 'keys', 'perc'],
    rhythmStyle: 'four-on-floor', grooveTemplate: 'swing', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'arc', density: 0.5, swing: 0.2, characteristics: ['deep', 'warm', 'atmospheric'],
  },
  'trance': {
    tempoRange: [130, 145], instruments: ['kick', 'clap', 'hihat', 'bass', 'lead_synth', 'pad', 'arp'],
    rhythmStyle: 'four-on-floor', grooveTemplate: 'minimal', structureTemplate: ['intro', 'build', 'drop', 'breakdown', 'build', 'climax', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'build-drop', density: 0.7, swing: 0, characteristics: ['euphoric', 'melodic', 'epic'],
  },
  'drum & bass': {
    tempoRange: [170, 180], instruments: ['kick', 'snare', 'hihat', 'bass', 'pad', 'amen_break', 'reese_bass'],
    rhythmStyle: 'breakbeat', grooveTemplate: 'shuffle', structureTemplate: ['intro', 'drop', 'breakdown', 'drop', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'build-drop', density: 0.75, swing: 0.1, characteristics: ['fast', 'energetic', 'rolling'],
  },
  'dubstep': {
    tempoRange: [138, 142], instruments: ['kick', 'snare', 'hihat', 'wobble_bass', 'pad', 'fx'],
    rhythmStyle: 'halftime', grooveTemplate: 'minimal', structureTemplate: ['intro', 'build', 'drop', 'breakdown', 'build', 'drop', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'build-drop', density: 0.8, swing: 0, characteristics: ['heavy', 'wobbly', 'bass-heavy'],
  },
  'ambient': {
    tempoRange: [60, 90], instruments: ['pad', 'texture', 'bell', 'drone', 'field_recording'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['intro', 'section_a', 'section_b', 'section_a', 'outro'],
    harmonicStyle: 'modal', energyCurve: 'through-composed', density: 0.25, swing: 0, characteristics: ['ethereal', 'spacious', 'meditative'],
  },
  'synthwave': {
    tempoRange: [100, 120], instruments: ['kick', 'snare', 'hihat', 'bass', 'lead_synth', 'pad', 'arp'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'verse-chorus', density: 0.65, swing: 0, characteristics: ['retro', 'nostalgic', '80s'],
  },
  'hardstyle': {
    tempoRange: [150, 160], instruments: ['kick', 'clap', 'hihat', 'screech_lead', 'reverse_bass', 'pad'],
    rhythmStyle: 'four-on-floor', grooveTemplate: 'berlin', structureTemplate: ['intro', 'build', 'climax', 'break', 'climax', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'escalating', density: 0.85, swing: 0, characteristics: ['hard', 'distorted', 'euphoric'],
  },
  // ===== HIP HOP & R&B =====
  'hip hop': {
    tempoRange: [85, 100], instruments: ['kick', 'snare', 'hihat', 'bass', 'keys', 'vocal_sample'],
    rhythmStyle: 'boom-bap', grooveTemplate: 'swing', structureTemplate: ['intro', 'verse', 'hook', 'verse', 'hook', 'bridge', 'hook', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'verse-chorus', density: 0.55, swing: 0.25, characteristics: ['rhythmic', 'sample-based', 'head-nodding'],
  },
  'trap': {
    tempoRange: [130, 160], instruments: ['kick', 'snare', 'hihat_roll', 'bass_808', 'bell', 'pad'],
    rhythmStyle: 'halftime', grooveTemplate: 'minimal', structureTemplate: ['intro', 'verse', 'hook', 'verse', 'hook', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'verse-chorus', density: 0.6, swing: 0, characteristics: ['dark', 'heavy_808', 'hi-hat_rolls'],
  },
  'drill': {
    tempoRange: [140, 150], instruments: ['kick', 'snare', 'hihat_roll', 'bass_808', 'dark_pad', 'bell'],
    rhythmStyle: 'halftime', grooveTemplate: 'minimal', structureTemplate: ['intro', 'verse', 'hook', 'verse', 'hook', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'verse-chorus', density: 0.6, swing: 0, characteristics: ['dark', 'menacing', 'sliding_808'],
  },
  'lo-fi hip hop': {
    tempoRange: [70, 90], instruments: ['kick', 'snare', 'hihat', 'bass', 'keys', 'pad', 'vinyl_crackle'],
    rhythmStyle: 'boom-bap', grooveTemplate: 'swing', structureTemplate: ['intro', 'section_a', 'section_b', 'section_a', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'through-composed', density: 0.4, swing: 0.3, characteristics: ['chill', 'dusty', 'warm'],
  },
  'r&b': {
    tempoRange: [65, 85], instruments: ['kick', 'snare', 'hihat', 'bass', 'keys', 'pad', 'strings'],
    rhythmStyle: 'shuffle', grooveTemplate: 'swing', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
    harmonicStyle: 'major', energyCurve: 'verse-chorus', density: 0.55, swing: 0.3, characteristics: ['smooth', 'soulful', 'lush'],
  },
  // ===== ROCK & METAL =====
  'rock': {
    tempoRange: [110, 140], instruments: ['kick', 'snare', 'hihat', 'bass', 'guitar_rhythm', 'guitar_lead'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'solo', 'chorus', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'verse-chorus', density: 0.7, swing: 0, characteristics: ['driving', 'guitar-driven', 'powerful'],
  },
  'indie rock': {
    tempoRange: [100, 130], instruments: ['kick', 'snare', 'hihat', 'bass', 'guitar_clean', 'guitar_jangly', 'keys'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
    harmonicStyle: 'major', energyCurve: 'verse-chorus', density: 0.55, swing: 0.05, characteristics: ['jangly', 'melodic', 'understated'],
  },
  'metal': {
    tempoRange: [120, 180], instruments: ['kick_double', 'snare', 'hihat', 'bass', 'guitar_distorted', 'guitar_lead'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'breakdown', 'solo', 'chorus', 'outro'],
    harmonicStyle: 'chromatic', energyCurve: 'escalating', density: 0.85, swing: 0, characteristics: ['heavy', 'aggressive', 'technical'],
  },
  'punk': {
    tempoRange: [150, 200], instruments: ['kick', 'snare', 'hihat', 'bass', 'guitar_distorted'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'],
    harmonicStyle: 'major', energyCurve: 'plateau', density: 0.8, swing: 0, characteristics: ['fast', 'raw', 'energetic'],
  },
  'shoegaze': {
    tempoRange: [90, 120], instruments: ['kick', 'snare', 'hihat', 'bass', 'guitar_reverb', 'pad', 'noise_wall'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'],
    harmonicStyle: 'modal', energyCurve: 'through-composed', density: 0.7, swing: 0, characteristics: ['dreamy', 'wall-of-sound', 'ethereal'],
  },
  'post-rock': {
    tempoRange: [80, 120], instruments: ['kick', 'snare', 'hihat', 'bass', 'guitar_clean', 'guitar_reverb', 'pad', 'strings'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['intro', 'build', 'climax', 'quiet', 'build', 'climax', 'outro'],
    harmonicStyle: 'modal', energyCurve: 'arc', density: 0.5, swing: 0, characteristics: ['cinematic', 'building', 'atmospheric'],
  },
  // ===== POP & DANCE =====
  'pop': {
    tempoRange: [100, 130], instruments: ['kick', 'snare', 'hihat', 'bass', 'keys', 'synth', 'pad'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['intro', 'verse', 'pre_chorus', 'chorus', 'verse', 'pre_chorus', 'chorus', 'bridge', 'chorus', 'outro'],
    harmonicStyle: 'major', energyCurve: 'verse-chorus', density: 0.6, swing: 0.05, characteristics: ['catchy', 'polished', 'hooky'],
  },
  'k-pop': {
    tempoRange: [110, 140], instruments: ['kick', 'snare', 'hihat', 'bass', 'synth', 'brass', 'strings', 'keys'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['intro', 'verse', 'pre_chorus', 'chorus', 'verse', 'pre_chorus', 'chorus', 'bridge', 'chorus', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'verse-chorus', density: 0.75, swing: 0, characteristics: ['polished', 'dynamic', 'genre-blending'],
  },
  'disco': {
    tempoRange: [110, 130], instruments: ['kick', 'snare', 'hihat', 'bass', 'strings', 'guitar_funk', 'keys'],
    rhythmStyle: 'four-on-floor', grooveTemplate: 'swing', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'breakdown', 'chorus', 'outro'],
    harmonicStyle: 'major', energyCurve: 'verse-chorus', density: 0.7, swing: 0.15, characteristics: ['groovy', 'danceable', 'funky'],
  },
  'funk': {
    tempoRange: [95, 115], instruments: ['kick', 'snare', 'hihat', 'bass_slap', 'guitar_funk', 'keys', 'brass'],
    rhythmStyle: 'shuffle', grooveTemplate: 'swing', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'verse-chorus', density: 0.7, swing: 0.35, characteristics: ['groovy', 'syncopated', 'tight'],
  },
  // ===== JAZZ & BLUES =====
  'jazz': {
    tempoRange: [100, 180], instruments: ['kick', 'ride', 'snare_brush', 'bass_upright', 'piano', 'sax'],
    rhythmStyle: 'swing', grooveTemplate: 'swing', structureTemplate: ['intro', 'theme', 'solo_a', 'solo_b', 'theme', 'outro'],
    harmonicStyle: 'chromatic', energyCurve: 'through-composed', density: 0.5, swing: 0.4, characteristics: ['improvisational', 'sophisticated', 'complex'],
  },
  'blues': {
    tempoRange: [70, 120], instruments: ['kick', 'snare', 'hihat', 'bass', 'guitar_blues', 'keys', 'harmonica'],
    rhythmStyle: 'shuffle', grooveTemplate: 'shuffle', structureTemplate: ['intro', 'verse', 'verse', 'chorus', 'verse', 'solo', 'verse', 'outro'],
    harmonicStyle: 'blues', energyCurve: 'through-composed', density: 0.5, swing: 0.35, characteristics: ['soulful', 'expressive', 'raw'],
  },
  'soul': {
    tempoRange: [80, 110], instruments: ['kick', 'snare', 'hihat', 'bass', 'keys', 'guitar_clean', 'brass', 'strings'],
    rhythmStyle: 'shuffle', grooveTemplate: 'swing', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
    harmonicStyle: 'major', energyCurve: 'verse-chorus', density: 0.6, swing: 0.25, characteristics: ['warm', 'emotional', 'vocal-driven'],
  },
  // ===== CLASSICAL & ORCHESTRAL =====
  'classical': {
    tempoRange: [60, 140], instruments: ['strings', 'woodwinds', 'brass', 'piano', 'timpani'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['exposition', 'development', 'recapitulation', 'coda'],
    harmonicStyle: 'major', energyCurve: 'arc', density: 0.6, swing: 0, characteristics: ['orchestral', 'dynamic', 'structured'],
  },
  'cinematic': {
    tempoRange: [80, 130], instruments: ['strings', 'brass', 'choir', 'timpani', 'pad', 'piano'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['intro', 'build', 'climax', 'resolution', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'arc', density: 0.7, swing: 0, characteristics: ['epic', 'emotional', 'dramatic'],
  },
  // ===== WORLD & REGIONAL =====
  'afrobeats': {
    tempoRange: [100, 115], instruments: ['kick', 'snare', 'hihat', 'bass', 'guitar_afro', 'keys', 'shaker', 'percussion'],
    rhythmStyle: 'polyrhythm', grooveTemplate: 'shuffle', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
    harmonicStyle: 'major', energyCurve: 'verse-chorus', density: 0.65, swing: 0.2, characteristics: ['rhythmic', 'infectious', 'layered_percussion'],
  },
  'reggae': {
    tempoRange: [65, 85], instruments: ['kick', 'snare_rimshot', 'hihat', 'bass', 'guitar_skank', 'keys', 'organ'],
    rhythmStyle: 'shuffle', grooveTemplate: 'shuffle', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'],
    harmonicStyle: 'major', energyCurve: 'through-composed', density: 0.5, swing: 0.3, characteristics: ['laid-back', 'offbeat', 'groove'],
  },
  'reggaeton': {
    tempoRange: [88, 98], instruments: ['kick', 'snare', 'hihat', 'bass_808', 'dembow_perc', 'synth'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'verse-chorus', density: 0.65, swing: 0, characteristics: ['dembow', 'latin', 'urban'],
  },
  'flamenco': {
    tempoRange: [80, 140], instruments: ['guitar_nylon', 'cajon', 'palmas', 'bass'],
    rhythmStyle: 'polyrhythm', grooveTemplate: 'swing', structureTemplate: ['intro', 'falseta', 'verse', 'falseta', 'verse', 'climax', 'outro'],
    harmonicStyle: 'chromatic', energyCurve: 'arc', density: 0.5, swing: 0.2, characteristics: ['passionate', 'rhythmic', 'spanish'],
  },
  'bossa nova': {
    tempoRange: [115, 140], instruments: ['guitar_nylon', 'bass_upright', 'brush_drums', 'piano', 'flute'],
    rhythmStyle: 'shuffle', grooveTemplate: 'swing', structureTemplate: ['intro', 'theme_a', 'theme_b', 'theme_a', 'outro'],
    harmonicStyle: 'major', energyCurve: 'through-composed', density: 0.4, swing: 0.25, characteristics: ['gentle', 'brazilian', 'sophisticated'],
  },
  // ===== FOLK & COUNTRY =====
  'folk': {
    tempoRange: [90, 130], instruments: ['acoustic_guitar', 'bass', 'kick', 'snare', 'fiddle', 'banjo'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
    harmonicStyle: 'major', energyCurve: 'verse-chorus', density: 0.45, swing: 0.1, characteristics: ['acoustic', 'storytelling', 'organic'],
  },
  'country': {
    tempoRange: [100, 140], instruments: ['kick', 'snare', 'hihat', 'bass', 'guitar_acoustic', 'guitar_electric', 'pedal_steel', 'fiddle'],
    rhythmStyle: 'straight', grooveTemplate: 'shuffle', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
    harmonicStyle: 'major', energyCurve: 'verse-chorus', density: 0.55, swing: 0.15, characteristics: ['twangy', 'storytelling', 'heartfelt'],
  },
  // ===== EXPERIMENTAL =====
  'experimental': {
    tempoRange: [60, 180], instruments: ['noise', 'texture', 'glitch', 'pad', 'perc', 'drone'],
    rhythmStyle: 'polyrhythm', grooveTemplate: 'minimal', structureTemplate: ['section_a', 'section_b', 'section_c', 'section_a'],
    harmonicStyle: 'chromatic', energyCurve: 'through-composed', density: 0.5, swing: 0.1, characteristics: ['unpredictable', 'textural', 'avant-garde'],
  },
};

// Alias mapping for subgenres → parent profiles
const GENRE_ALIASES: Record<string, string> = {
  'industrial techno': 'hard techno', 'dark techno': 'hard techno', 'warehouse techno': 'techno',
  'minimal techno': 'techno', 'acid techno': 'techno', 'acid house': 'house',
  'tech house': 'house', 'progressive house': 'house', 'progressive trance': 'trance',
  'psytrance': 'trance', 'uplifting trance': 'trance', 'goa trance': 'trance',
  'neurofunk': 'drum & bass', 'liquid dnb': 'drum & bass', 'jungle': 'drum & bass',
  'brostep': 'dubstep', 'future bass': 'dubstep', 'riddim': 'dubstep',
  'hardcore': 'hardstyle', 'gabber': 'hardstyle', 'frenchcore': 'hardstyle',
  'dark ambient': 'ambient', 'ambient techno': 'ambient',
  'idm': 'experimental', 'glitch': 'experimental', 'noise': 'experimental',
  'darksynth': 'synthwave', 'retrowave': 'synthwave', 'outrun': 'synthwave',
  'vaporwave': 'synthwave', 'future funk': 'synthwave',
  'electro': 'house', 'electro house': 'house',
  'downtempo': 'ambient', 'chillout': 'ambient',
  'uk bass': 'dubstep', 'grime': 'dubstep',
  'boom bap': 'hip hop', 'cloud rap': 'hip hop', 'phonk': 'trap',
  'memphis rap': 'trap', 'uk drill': 'drill',
  'neo-soul': 'r&b', 'alternative r&b': 'r&b', 'contemporary r&b': 'r&b',
  'alternative rock': 'rock', 'garage rock': 'rock', 'surf rock': 'rock',
  'psychedelic rock': 'rock', 'progressive rock': 'rock',
  'post-punk': 'punk', 'hardcore punk': 'punk', 'pop punk': 'punk', 'emo': 'punk',
  'heavy metal': 'metal', 'thrash metal': 'metal', 'death metal': 'metal',
  'black metal': 'metal', 'doom metal': 'metal', 'progressive metal': 'metal', 'metalcore': 'metal',
  'grunge': 'rock', 'noise rock': 'rock', 'math rock': 'rock',
  'synth pop': 'pop', 'electropop': 'pop', 'indie pop': 'pop', 'art pop': 'pop',
  'dance pop': 'pop', 'j-pop': 'pop', 'c-pop': 'pop',
  'eurodance': 'disco', 'eurobeat': 'disco', 'nu-disco': 'disco', 'italo disco': 'disco',
  'p-funk': 'funk', 'electro-funk': 'funk',
  'bebop': 'jazz', 'free jazz': 'jazz', 'jazz fusion': 'jazz', 'acid jazz': 'jazz',
  'smooth jazz': 'jazz', 'cool jazz': 'jazz', 'modal jazz': 'jazz',
  'delta blues': 'blues', 'chicago blues': 'blues', 'electric blues': 'blues',
  'northern soul': 'soul', 'southern soul': 'soul',
  'baroque': 'classical', 'romantic': 'classical', 'contemporary classical': 'classical',
  'orchestral': 'cinematic', 'film score': 'cinematic', 'epic orchestral': 'cinematic',
  'chamber music': 'classical', 'minimalist': 'classical', 'neo-classical': 'classical',
  'afro house': 'afrobeats', 'amapiano': 'afrobeats', 'highlife': 'afrobeats',
  'dub': 'reggae', 'dancehall': 'reggae', 'ska': 'reggae',
  'latin pop': 'reggaeton', 'salsa': 'reggaeton', 'cumbia': 'reggaeton', 'bachata': 'reggaeton',
  'samba': 'bossa nova', 'mpb': 'bossa nova',
  'fado': 'flamenco',
  'bollywood': 'pop', 'bhangra': 'pop',
  'celtic': 'folk', 'irish folk': 'folk', 'nordic folk': 'folk', 'indie folk': 'folk', 'neofolk': 'folk',
  'alt-country': 'country', 'bluegrass': 'country', 'americana': 'country',
  'singer-songwriter': 'folk',
  'gospel': 'soul', 'worship': 'soul',
  'new age': 'ambient', 'meditation': 'ambient',
  'video game music': 'synthwave', 'chiptune': 'synthwave', '8-bit': 'synthwave',
};

/**
 * Get the genre profile for a given genre string.
 * Falls back through aliases, then to a default electronic profile.
 */
export function getGenreProfile(genre: string): GenreProfile {
  const lower = genre.toLowerCase().trim();
  if (GENRE_PROFILES[lower]) return GENRE_PROFILES[lower];
  const alias = GENRE_ALIASES[lower];
  if (alias && GENRE_PROFILES[alias]) return GENRE_PROFILES[alias];
  // Default
  return GENRE_PROFILES['techno'];
}

/**
 * Blend multiple genre profiles into one composite profile.
 */
export function blendGenreProfiles(genres: string[]): GenreProfile {
  if (genres.length === 0) return GENRE_PROFILES['techno'];
  if (genres.length === 1) return getGenreProfile(genres[0]);

  const profiles = genres.map(getGenreProfile);
  const n = profiles.length;

  return {
    tempoRange: [
      Math.round(profiles.reduce((s, p) => s + p.tempoRange[0], 0) / n),
      Math.round(profiles.reduce((s, p) => s + p.tempoRange[1], 0) / n),
    ],
    instruments: [...new Set(profiles.flatMap(p => p.instruments))],
    rhythmStyle: profiles[0].rhythmStyle,
    grooveTemplate: profiles[0].grooveTemplate,
    structureTemplate: profiles[0].structureTemplate,
    harmonicStyle: profiles[0].harmonicStyle,
    energyCurve: profiles[0].energyCurve,
    density: profiles.reduce((s, p) => s + p.density, 0) / n,
    swing: profiles.reduce((s, p) => s + p.swing, 0) / n,
    characteristics: [...new Set(profiles.flatMap(p => p.characteristics))],
  };
}
