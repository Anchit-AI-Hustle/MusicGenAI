/**
 * Style Inference & Genre Profile System
 * 
 * Now supports TWO modes:
 * 1. AI-inferred StyleProfile (primary) — dynamically generated from user prompt via analyze-music
 * 2. Hardcoded genre profiles (fallback) — used only when AI analysis is unavailable
 * 
 * The GenreProfile interface is the universal format used by all synthesis engines.
 */

export interface GenreProfile {
  tempoRange: [number, number];
  instruments: string[];
  rhythmStyle: 'four-on-floor' | 'breakbeat' | 'boom-bap' | 'swing' | 'straight' | 'shuffle' | 'halftime' | 'polyrhythm';
  grooveTemplate: string;
  structureTemplate: string[];
  harmonicStyle: string;
  energyCurve: 'build-drop' | 'verse-chorus' | 'through-composed' | 'arc' | 'plateau' | 'escalating';
  density: number; // 0-1
  swing: number; // 0-1
  characteristics: string[];
}

type AIStyleProfile = {
  tempoTendency?: string;
  rhythmComplexity?: string;
  groovePattern?: string;
  energyLevel?: number;
  instrumentPalette?: string[];
  vocalStyle?: string;
  textureDensity?: number;
  atmosphere?: string;
  tempoRange?: [number, number];
  instruments?: string[];
  rhythmStyle?: string;
  grooveTemplate?: string;
  structureTemplate?: string[];
  harmonicStyle?: string;
  energyCurve?: string;
  density?: number;
  swing?: number;
  characteristics?: string[];
};

function inferTempoRange(styleProfile: AIStyleProfile): [number, number] {
  if (styleProfile.tempoRange) return styleProfile.tempoRange;

  switch ((styleProfile.tempoTendency || '').toLowerCase()) {
    case 'very slow':
      return [55, 75];
    case 'slow':
      return [70, 95];
    case 'fast':
      return [128, 155];
    case 'very fast':
      return [155, 185];
    case 'midtempo':
    default:
      return [96, 124];
  }
}

function inferRhythmStyle(styleProfile: AIStyleProfile): GenreProfile['rhythmStyle'] {
  const validRhythms = ['four-on-floor', 'breakbeat', 'boom-bap', 'swing', 'straight', 'shuffle', 'halftime', 'polyrhythm'] as const;
  if (validRhythms.includes(styleProfile.rhythmStyle as any)) {
    return styleProfile.rhythmStyle as GenreProfile['rhythmStyle'];
  }

  switch ((styleProfile.rhythmComplexity || '').toLowerCase()) {
    case 'minimal':
    case 'steady':
      return 'straight';
    case 'driving':
      return 'four-on-floor';
    case 'syncopated':
      return 'shuffle';
    case 'polyrhythmic':
      return 'polyrhythm';
    default:
      return 'straight';
  }
}

function inferEnergyCurve(styleProfile: AIStyleProfile): GenreProfile['energyCurve'] {
  const validCurves = ['build-drop', 'verse-chorus', 'through-composed', 'arc', 'plateau', 'escalating'] as const;
  if (validCurves.includes(styleProfile.energyCurve as any)) {
    return styleProfile.energyCurve as GenreProfile['energyCurve'];
  }

  const energy = styleProfile.energyLevel ?? 5;
  if (energy >= 8) return 'build-drop';
  if (energy <= 3) return 'through-composed';
  return 'verse-chorus';
}

/**
 * Create a GenreProfile from an AI-inferred StyleProfile object.
 * This is the PRIMARY path — AI dynamically determines all musical parameters.
 */
export function createProfileFromAI(styleProfile: AIStyleProfile): GenreProfile {
  const rhythmStyle = inferRhythmStyle(styleProfile);
  const energyCurve = inferEnergyCurve(styleProfile);
  const density = styleProfile.density ?? styleProfile.textureDensity;
  const instruments = styleProfile.instruments?.length
    ? styleProfile.instruments
    : styleProfile.instrumentPalette?.length
      ? styleProfile.instrumentPalette
      : ['kick', 'bass', 'synth', 'pad'];

  return {
    tempoRange: inferTempoRange(styleProfile),
    instruments,
    rhythmStyle,
    grooveTemplate: styleProfile.grooveTemplate || styleProfile.groovePattern || 'minimal',
    structureTemplate: styleProfile.structureTemplate?.length ? styleProfile.structureTemplate : ['intro', 'verse', 'chorus', 'outro'],
    harmonicStyle: styleProfile.harmonicStyle || 'minor',
    energyCurve,
    density: Math.max(0, Math.min(1, density ?? 0.6)),
    swing: Math.max(0, Math.min(1, styleProfile.swing ?? 0.0)),
    characteristics: styleProfile.characteristics?.length
      ? styleProfile.characteristics
      : [styleProfile.atmosphere || 'dynamic'].filter(Boolean),
  };
}

// ===== FALLBACK: Hardcoded profiles for when AI is unavailable =====

const GENRE_PROFILES: Record<string, GenreProfile> = {
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
  'rock': {
    tempoRange: [110, 140], instruments: ['kick', 'snare', 'hihat', 'bass', 'guitar_rhythm', 'guitar_lead'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'solo', 'chorus', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'verse-chorus', density: 0.7, swing: 0, characteristics: ['driving', 'guitar-driven', 'powerful'],
  },
  'metal': {
    tempoRange: [120, 180], instruments: ['kick_double', 'snare', 'hihat', 'bass', 'guitar_distorted', 'guitar_lead'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'breakdown', 'solo', 'chorus', 'outro'],
    harmonicStyle: 'chromatic', energyCurve: 'escalating', density: 0.85, swing: 0, characteristics: ['heavy', 'aggressive', 'technical'],
  },
  'pop': {
    tempoRange: [100, 130], instruments: ['kick', 'snare', 'hihat', 'bass', 'keys', 'synth', 'pad'],
    rhythmStyle: 'straight', grooveTemplate: 'minimal', structureTemplate: ['intro', 'verse', 'pre_chorus', 'chorus', 'verse', 'pre_chorus', 'chorus', 'bridge', 'chorus', 'outro'],
    harmonicStyle: 'major', energyCurve: 'verse-chorus', density: 0.6, swing: 0.05, characteristics: ['catchy', 'polished', 'hooky'],
  },
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
  'funk': {
    tempoRange: [95, 115], instruments: ['kick', 'snare', 'hihat', 'bass_slap', 'guitar_funk', 'keys', 'brass'],
    rhythmStyle: 'shuffle', grooveTemplate: 'swing', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'outro'],
    harmonicStyle: 'minor', energyCurve: 'verse-chorus', density: 0.7, swing: 0.35, characteristics: ['groovy', 'syncopated', 'tight'],
  },
  'reggae': {
    tempoRange: [65, 85], instruments: ['kick', 'snare_rimshot', 'hihat', 'bass', 'guitar_skank', 'keys', 'organ'],
    rhythmStyle: 'shuffle', grooveTemplate: 'shuffle', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'],
    harmonicStyle: 'major', energyCurve: 'through-composed', density: 0.5, swing: 0.3, characteristics: ['laid-back', 'offbeat', 'groove'],
  },
  'afrobeats': {
    tempoRange: [100, 115], instruments: ['kick', 'snare', 'hihat', 'bass', 'guitar_afro', 'keys', 'shaker', 'percussion'],
    rhythmStyle: 'polyrhythm', grooveTemplate: 'shuffle', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
    harmonicStyle: 'major', energyCurve: 'verse-chorus', density: 0.65, swing: 0.2, characteristics: ['rhythmic', 'infectious', 'layered_percussion'],
  },
  'r&b': {
    tempoRange: [65, 85], instruments: ['kick', 'snare', 'hihat', 'bass', 'keys', 'pad', 'strings'],
    rhythmStyle: 'shuffle', grooveTemplate: 'swing', structureTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
    harmonicStyle: 'major', energyCurve: 'verse-chorus', density: 0.55, swing: 0.3, characteristics: ['smooth', 'soulful', 'lush'],
  },
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
  'memphis rap': 'trap', 'uk drill': 'trap', 'drill': 'trap',
  'neo-soul': 'r&b', 'alternative r&b': 'r&b', 'soul': 'r&b',
  'alternative rock': 'rock', 'indie rock': 'rock', 'punk': 'rock',
  'heavy metal': 'metal', 'thrash metal': 'metal', 'death metal': 'metal',
  'grunge': 'rock', 'post-rock': 'rock', 'shoegaze': 'rock',
  'synth pop': 'pop', 'electropop': 'pop', 'indie pop': 'pop', 'k-pop': 'pop',
  'disco': 'funk', 'nu-disco': 'funk',
  'folk': 'pop', 'country': 'pop',
  'bossa nova': 'jazz', 'flamenco': 'jazz',
  'reggaeton': 'reggae',
  'gospel': 'r&b', 'new age': 'ambient', 'meditation': 'ambient',
  'lo-fi hip hop': 'hip hop',
};

/**
 * Get the genre profile for a given genre string (FALLBACK only).
 */
export function getGenreProfile(genre: string): GenreProfile {
  const lower = genre.toLowerCase().trim();
  if (GENRE_PROFILES[lower]) return GENRE_PROFILES[lower];
  const alias = GENRE_ALIASES[lower];
  if (alias && GENRE_PROFILES[alias]) return GENRE_PROFILES[alias];
  return GENRE_PROFILES['pop']; // neutral fallback
}

/**
 * Blend multiple genre profiles into one composite profile (FALLBACK only).
 */
export function blendGenreProfiles(genres: string[]): GenreProfile {
  if (genres.length === 0) return GENRE_PROFILES['pop'];
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
