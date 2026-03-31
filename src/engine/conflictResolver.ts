import {
  ALBUM_DEFAULT_COUNT,
  CREATION_MODES,
  FIELD_LIMITS,
  SENTIMENT_KEYWORDS,
  VOCAL_ARRANGEMENTS,
} from './CONSTANTS';
import { parseSongStructure } from './normalizer';
import type { ConflictReport, NormalizedInput } from './types';

function hasGenre(input: NormalizedInput, genre: string): boolean {
  return input.genres.includes(genre);
}

function clampTempo(input: NormalizedInput, maxOrMin: number, mode: 'max' | 'min', report: ConflictReport, reason: string): void {
  const current = input.tempo_bpm;
  const next = mode === 'max' ? Math.min(current, maxOrMin) : Math.max(current, maxOrMin);
  if (next !== current) {
    input.tempo_bpm = next;
    report.push({
      field: 'tempo_bpm',
      conflict: reason,
      resolution: `tempo_bpm adjusted from ${current} to ${next}`,
    });
  }
}

function scoreLyricsSentiment(lyrics: string): { valence: number; tension: number } {
  const words = lyrics.toLowerCase().match(/[a-z']+/g) ?? [];
  let positive = 0;
  let negative = 0;
  let tension = 0;

  for (const word of words) {
    if (SENTIMENT_KEYWORDS.POSITIVE.includes(word as never)) positive += 1;
    if (SENTIMENT_KEYWORDS.NEGATIVE.includes(word as never)) negative += 1;
    if (SENTIMENT_KEYWORDS.TENSION.includes(word as never)) tension += 1;
  }

  const baseValence = 5 + positive - negative;
  const baseTension = 4 + tension + Math.max(0, negative - positive);
  const clamp = (n: number) => Math.max(1, Math.min(10, n));

  return {
    valence: clamp(baseValence),
    tension: clamp(baseTension),
  };
}

function deriveVideoStyle(moodLabel: string, primaryGenre: string): string {
  const mood = moodLabel.toLowerCase();
  const genre = primaryGenre.toLowerCase();

  if (mood.includes('dark') && genre.includes('hip-hop')) return 'cinematic noir';
  if (mood.includes('euphoric') && genre.includes('edm')) return 'neon abstract';
  if (mood.includes('epic') && genre.includes('classical')) return 'orchestral visual';
  if (mood.includes('romantic') && genre.includes('pop')) return 'soft cinematic';
  if (mood.includes('chill') && genre.includes('jazz')) return 'lo-fi aesthetic';
  if (mood.includes('angry') && genre.includes('metal')) return 'industrial brutal';
  if (mood.includes('sad') && genre.includes('rnb')) return 'moody film grain';
  if (mood.includes('happy') && genre.includes('pop')) return 'colorful vibrant';
  return `${moodLabel} ${primaryGenre} visual narrative`.trim();
}

function applyDurationStructureRules(resolved: NormalizedInput, report: ConflictReport): void {
  const segmentCount = resolved.structure_segments.length;

  if (resolved.duration_seconds < 60 && segmentCount > 3) {
    const previous = resolved.song_structure;
    resolved.song_structure = 'Verse-Chorus-Outro';
    resolved.structure_segments = parseSongStructure(resolved.song_structure);
    report.push({
      field: 'song_structure',
      conflict: 'Duration below 60 seconds with too many segments',
      resolution: `song_structure trimmed from ${previous} to ${resolved.song_structure}`,
    });
  }

  if (resolved.duration_seconds > 300 && segmentCount < 4) {
    const names = resolved.structure_segments.map((s) => s.name);
    const hasBridge = names.some((name) => name.toLowerCase() === 'bridge');
    if (!hasBridge) {
      const chorusIndex = names.map((name) => name.toLowerCase()).lastIndexOf('chorus');
      const insertionIndex = chorusIndex > 0 ? chorusIndex : Math.max(1, names.length - 1);
      names.splice(insertionIndex, 0, 'Bridge');
      const previous = resolved.song_structure;
      resolved.song_structure = names.join('-');
      resolved.structure_segments = parseSongStructure(resolved.song_structure);
      report.push({
        field: 'song_structure',
        conflict: 'Duration above 300 seconds with too few segments',
        resolution: `Inserted Bridge; structure changed from ${previous} to ${resolved.song_structure}`,
      });
    }
  }
}

/** Resolves deterministic conflicts in strict priority order and reports every mutation. */
export function resolveConflicts(input: NormalizedInput): { resolved: NormalizedInput; report: ConflictReport } {
  const resolved: NormalizedInput = {
    ...input,
    genre_profile: { ...input.genre_profile, instrumentation: [...input.genre_profile.instrumentation], secondary: [...input.genre_profile.secondary] },
    structure_segments: input.structure_segments.map((s) => ({ ...s })),
    vocal_effects: [...input.vocal_effects],
    vocal_language: [...input.vocal_language],
    style_reference: input.style_reference.map((s) => ({ ...s })),
    style_vector: {
      genre_bias: { ...input.style_vector.genre_bias },
      mood_bias: { ...input.style_vector.mood_bias },
      era_distribution: { ...input.style_vector.era_distribution },
      production_styles: [...input.style_vector.production_styles],
    },
    lyrics_profile: {
      ...input.lyrics_profile,
      sentiment: input.lyrics_profile.sentiment ? { ...input.lyrics_profile.sentiment } : null,
    },
  };

  const report: ConflictReport = [];

  // C1: Genre-Tempo Mismatch
  if (hasGenre(resolved, 'hip-hop') && resolved.tempo_bpm > 140) {
    clampTempo(resolved, 140, 'max', report, 'hip-hop tempo exceeded 140 BPM');
  }
  if (hasGenre(resolved, 'classical') && resolved.tempo_bpm > 160) {
    clampTempo(resolved, 160, 'max', report, 'classical tempo exceeded 160 BPM');
  }
  if (hasGenre(resolved, 'metal') && resolved.tempo_bpm < 100) {
    clampTempo(resolved, 100, 'min', report, 'metal tempo below 100 BPM');
  }
  if (hasGenre(resolved, 'edm') && resolved.tempo_bpm < 110) {
    const previous = resolved.tempo_bpm;
    resolved.tempo_bpm = 118;
    report.push({
      field: 'tempo_bpm',
      conflict: 'edm tempo below 110 BPM',
      resolution: `tempo_bpm adjusted from ${previous} to 118`,
    });
  }
  if (hasGenre(resolved, 'jazz') && resolved.tempo_bpm > 200) {
    clampTempo(resolved, 200, 'max', report, 'jazz tempo exceeded 200 BPM');
  }

  // C2: Mood-Lyrics Mismatch
  if (resolved.lyrics) {
    const sentiment = scoreLyricsSentiment(resolved.lyrics);
    resolved.lyrics_profile.sentiment = sentiment;
    if (Math.abs(sentiment.valence - resolved.mood.valence) > 3) {
      resolved.lyrics_profile.requires_adjustment = true;
      report.push({
        field: 'lyrics',
        conflict: `lyrics sentiment valence ${sentiment.valence} differs from mood valence ${resolved.mood.valence}`,
        resolution: 'Kept mood unchanged and flagged lyrics for adjustment',
      });
    }
  }

  // C3: Vocal-Genre Incompatibility
  if (hasGenre(resolved, 'classical') && resolved.vocal_effects.includes('autotune')) {
    resolved.vocal_effects = resolved.vocal_effects.filter((effect) => effect !== 'autotune');
    report.push({
      field: 'vocal_effects',
      conflict: 'autotune is incompatible with classical genre',
      resolution: 'Removed autotune from vocal_effects',
    });
  }

  if (hasGenre(resolved, 'instrumental') && resolved.vocal_arrangement !== VOCAL_ARRANGEMENTS.NONE) {
    const previous = resolved.vocal_arrangement;
    resolved.vocal_arrangement = VOCAL_ARRANGEMENTS.NONE;
    report.push({
      field: 'vocal_arrangement',
      conflict: 'instrumental genre conflicts with vocal arrangement',
      resolution: `vocal_arrangement changed from ${previous} to none`,
    });
  }

  if (hasGenre(resolved, 'edm') && resolved.vocal_arrangement === VOCAL_ARRANGEMENTS.CHOIR) {
    resolved.vocal_arrangement = VOCAL_ARRANGEMENTS.SOLO;
    report.push({
      field: 'vocal_arrangement',
      conflict: 'choir arrangement conflicts with edm style profile',
      resolution: 'vocal_arrangement downgraded from choir to solo',
    });
  }

  // C4: Video-Audio Alignment
  if (resolved.generate_video && !resolved.video_style) {
    resolved.video_style = deriveVideoStyle(resolved.mood.label, resolved.genre_profile.primary);
    report.push({
      field: 'video_style',
      conflict: 'generate_video true but video_style missing',
      resolution: `video_style auto-derived as "${resolved.video_style}"`,
    });
  }

  // C5: Album Song Count Validation
  if (resolved.creation_mode === CREATION_MODES.ALBUM && resolved.album_song_count === null) {
    resolved.album_song_count = ALBUM_DEFAULT_COUNT;
    report.push({
      field: 'album_song_count',
      conflict: 'album mode without song count',
      resolution: `album_song_count defaulted to ${ALBUM_DEFAULT_COUNT}`,
    });
  }

  if (resolved.creation_mode === CREATION_MODES.SINGLE && resolved.album_song_count !== null) {
    resolved.album_song_count = null;
    report.push({
      field: 'album_song_count',
      conflict: 'single mode supplied album_song_count',
      resolution: 'album_song_count ignored for single mode',
    });
  }

  if (resolved.album_song_count !== null) {
    resolved.album_song_count = Math.max(FIELD_LIMITS.ALBUM_MIN, Math.min(FIELD_LIMITS.ALBUM_MAX, resolved.album_song_count));
  }

  // C6: Duration-Structure Mismatch
  applyDurationStructureRules(resolved, report);

  return { resolved, report };
}

