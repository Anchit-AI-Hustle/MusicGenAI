import { ALBUM_MIN_SPREAD_BPM, CANONICAL_MOODS, FIELD_LIMITS } from './CONSTANTS';
import { moodToVector, parseSongStructure } from './normalizer';
import type { GenerationIntent } from './types';

const STRUCTURE_VARIANTS = [
  'Intro-Verse-Chorus-Verse-Chorus-Bridge-Chorus-Outro',
  'Intro-Verse-Pre-Chorus-Chorus-Verse-Chorus-Bridge-Chorus-Outro',
  'Intro-Verse-Hook-Verse-Hook-Bridge-Hook-Outro',
  'Intro-Build-Drop-Break-Build-Drop-Outro',
  'Intro-Verse-Chorus-Bridge-Chorus-Outro',
  'Intro-Theme-Development-Recapitulation-Coda',
];

function clampTempo(tempo: number): number {
  return Math.max(FIELD_LIMITS.TEMPO_MIN, Math.min(FIELD_LIMITS.TEMPO_MAX, Math.round(tempo)));
}

function uniqueAdjacentMood(previous: string | null, preferred: string): string {
  if (previous !== preferred) return preferred;
  const fallback = CANONICAL_MOODS.find((m) => m !== previous);
  return fallback ?? preferred;
}

function computeEnergyTargets(count: number): number[] {
  if (count === 1) return [8.5];

  const targets = new Array<number>(count).fill(6);

  // Song 1: high energy opener.
  targets[0] = 8.8;

  // Song 2–3: build energy.
  if (count > 1) targets[1] = 7.4;
  if (count > 2) targets[2] = 8.2;

  // Middle songs: include a low energy exploration.
  const middleStart = 3;
  const middleEnd = Math.max(3, count - 2);
  for (let i = middleStart; i < middleEnd; i += 1) {
    targets[i] = i % 2 === 0 ? 4.2 : 6.2;
  }
  if (count >= 5) {
    const lowIndex = Math.floor((middleStart + middleEnd - 1) / 2);
    targets[lowIndex] = 3.2;
  }

  // Second-to-last: peak energy / emotional climax.
  if (count >= 2) targets[count - 2] = 9.4;

  // Last: resolved, lower energy.
  targets[count - 1] = 4.0;

  return targets;
}

function computeMoodSequence(baseMood: string, count: number): string[] {
  const canonicalBase = (CANONICAL_MOODS as readonly string[]).includes(baseMood)
    ? baseMood
    : 'happy';

  const moods = new Array<string>(count).fill(canonicalBase);
  const arcPool: string[] = [
    'epic',
    'euphoric',
    'happy',
    'romantic',
    'chill',
    'melancholic',
    'tense',
    'dark',
  ];

  for (let i = 0; i < count; i += 1) {
    if (i === 0) {
      moods[i] = uniqueAdjacentMood(null, canonicalBase === 'chill' ? 'epic' : canonicalBase);
      continue;
    }
    if (i === count - 1) {
      // Resolved closer, low tension preference.
      moods[i] = uniqueAdjacentMood(moods[i - 1], canonicalBase === 'dark' ? 'melancholic' : 'chill');
      continue;
    }
    if (i === count - 2) {
      moods[i] = uniqueAdjacentMood(moods[i - 1], 'epic');
      continue;
    }

    const pick = arcPool[(i + canonicalBase.length) % arcPool.length] ?? canonicalBase;
    moods[i] = uniqueAdjacentMood(moods[i - 1], pick);
  }

  return moods;
}

function computeTempoSequence(baseTempo: number, count: number): number[] {
  if (count === 1) return [clampTempo(baseTempo)];

  const tempos = new Array<number>(count).fill(baseTempo);
  const spread = Math.max(ALBUM_MIN_SPREAD_BPM, 22);
  const start = baseTempo + 8;
  const end = baseTempo - 12;

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const curve = start + ((end - start) * t);
    tempos[i] = clampTempo(curve + (i % 3 === 0 ? 2 : i % 3 === 1 ? -1 : 0));
  }

  const minTempo = Math.min(...tempos);
  const maxTempo = Math.max(...tempos);
  if (maxTempo - minTempo < spread) {
    tempos[count - 2] = clampTempo(tempos[count - 2] + spread);
  }

  return tempos;
}

function pickStructure(index: number, primaryGenre: string): string {
  const genreStructures: Record<string, string> = {
    pop: STRUCTURE_VARIANTS[0],
    'hip-hop': STRUCTURE_VARIANTS[2],
    edm: STRUCTURE_VARIANTS[3],
    classical: STRUCTURE_VARIANTS[5],
    jazz: 'Intro-Head-Solo-Head-Outro',
    rock: 'Intro-Verse-Chorus-Verse-Chorus-Bridge-Solo-Chorus-Outro',
    metal: 'Intro-Riff-Verse-Chorus-Verse-Chorus-Breakdown-Solo-Chorus-Outro',
  };

  const base = genreStructures[primaryGenre] ?? STRUCTURE_VARIANTS[index % STRUCTURE_VARIANTS.length];
  if (index % 2 === 0) return base;
  return STRUCTURE_VARIANTS[(index + 1) % STRUCTURE_VARIANTS.length] ?? base;
}

function buildPrompt(base: GenerationIntent, mood: string, tempo: number, energy: number, structure: string, index: number): string {
  return [
    `Album track ${index + 1} continuing ${base.genre_profile.primary} identity with ${mood} emotional focus,`,
    `tempo ${tempo} BPM, energy ${energy.toFixed(2)}, and structure ${structure}.`,
    `Keep instrumentation rooted in ${base.genre_profile.instrumentation.slice(0, 6).join(', ')},`,
    `preserve vocal language context ${base.vocal.languages.join(', ')},`,
    `and maintain coherent production continuity with evolving arrangement dynamics across the album arc.`,
  ].join(' ');
}

/**
 * Builds a deterministic album plan with a narrative arc from a base generation intent.
 */
export function buildAlbumPlan(baseIntent: GenerationIntent, count: number): GenerationIntent[] {
  const safeCount = Math.max(1, Math.floor(count));
  const moods = computeMoodSequence(baseIntent.mood.label, safeCount);
  const energies = computeEnergyTargets(safeCount);
  const tempos = computeTempoSequence(baseIntent.tempo_bpm, safeCount);

  return new Array<GenerationIntent>(safeCount).fill(null).map((_, index) => {
    const moodLabel = moods[index] ?? baseIntent.mood.label;
    const moodVector = moodToVector(moodLabel);
    const structureRaw = pickStructure(index, baseIntent.genre_profile.primary);
    const structureSegments = parseSongStructure(structureRaw);
    const energy = Number(Math.max(1, Math.min(10, energies[index] ?? baseIntent.energy)).toFixed(2));

    const visualDirection = baseIntent.visual.enabled && baseIntent.visual.style
      ? `${baseIntent.visual.style} with album-arc progression for track ${index + 1}`
      : null;

    return {
      ...baseIntent,
      meta: {
        ...baseIntent.meta,
        creation_mode: 'album',
        album_song_count: safeCount,
        track_name: `${baseIntent.meta.track_name} - Track ${index + 1}`,
      },
      mood: {
        label: moodVector.label,
        valence: moodVector.valence,
        arousal: moodVector.arousal,
        tension: index === safeCount - 1 ? Math.min(4, moodVector.tension) : moodVector.tension,
      },
      energy,
      tempo_bpm: tempos[index] ?? baseIntent.tempo_bpm,
      genre_profile: {
        primary: baseIntent.genre_profile.primary,
        secondary: [...baseIntent.genre_profile.secondary],
        instrumentation: [...baseIntent.genre_profile.instrumentation],
        rhythm_pattern: baseIntent.genre_profile.rhythm_pattern,
      },
      structure: {
        raw: structureRaw,
        segments: structureSegments,
      },
      vocal: {
        ...baseIntent.vocal,
        languages: [...baseIntent.vocal.languages],
        effects: [...baseIntent.vocal.effects],
      },
      lyrics: {
        ...baseIntent.lyrics,
      },
      style_reference: baseIntent.style_reference.map((item) => ({ ...item })),
      audio_parameters: {
        ...baseIntent.audio_parameters,
        instrumentation: [...baseIntent.audio_parameters.instrumentation],
      },
      visual: {
        ...baseIntent.visual,
        visual_direction: visualDirection,
      },
      generation_prompt: buildPrompt(baseIntent, moodVector.label, tempos[index] ?? baseIntent.tempo_bpm, energy, structureRaw, index),
    };
  });
}
