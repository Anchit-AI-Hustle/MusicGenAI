import { tempoToEnergy } from './normalizer';
import type { AudioParameters, NormalizedInput, VisualParameters } from './types';

function deriveRhythmPattern(genre: string): string {
  if (genre === 'hip-hop') return 'swung 16ths';
  if (genre === 'edm') return 'straight 4-on-floor';
  if (genre === 'jazz') return 'swung triplets';
  if (genre === 'rock') return 'straight 8ths with backbeat';
  if (genre === 'classical') return 'variable, conductor-dependent';
  return 'balanced syncopation';
}

function deriveMixingStyle(genre: string, productionStyles: string[]): string {
  if (productionStyles.length > 0) {
    return `Hybrid mix referencing ${productionStyles.slice(0, 2).join(' + ')}`;
  }
  if (genre === 'edm') return 'loud master, sidechain compression, stereo wide';
  if (genre === 'classical') return 'dynamic, minimal processing, concert hall reverb';
  if (genre === 'hip-hop') return '808 sub emphasis, punchy mid, clear vocal';
  if (genre === 'pop') return 'bright top end, polished, vocal forward';
  if (genre === 'rock') return 'midrange crunch, room ambience, balanced';
  return 'balanced modern mix with controlled dynamics';
}

function deriveSoundDesignStyle(genre: string, tension: number, arousal: number): string {
  if (tension >= 7 && (genre === 'dark' || genre === 'hip-hop' || genre === 'metal')) {
    return 'dissonant pads, harsh textures';
  }
  if (tension <= 3 && arousal <= 4) {
    return 'warm textures, soft attack';
  }
  if (arousal >= 8 && genre === 'edm') {
    return 'euphoric risers, sub drops';
  }
  return 'layered tonal textures with moderate transient shaping';
}

function deriveColorPalette(valence: number, arousal: number, tension: number): string {
  if (tension >= 8) return 'high contrast, deep shadows, minimal hue';
  if (valence >= 7 && arousal >= 7) return 'saturated warm, neon accents';
  if (valence <= 4 && arousal >= 7) return 'desaturated red, sharp contrast';
  if (valence >= 7 && arousal <= 4) return 'pastel warm, soft gradients';
  return 'cool grey, muted blue, low contrast';
}

function deriveMotionStyle(energy: number): string {
  if (energy <= 3) return 'slow drift, long dissolves, ambient';
  if (energy <= 6) return 'rhythmic cuts on beat, moderate panning';
  if (energy <= 9) return 'fast cuts, strobe, kinetic camera';
  return 'chaotic, reactive to every beat transient';
}

function deriveVisualDirection(videoStyle: string | null, eraHint: string): string | null {
  if (!videoStyle) return null;
  return `${videoStyle} visual storytelling with ${eraHint} production-era texture cues`;
}

/** Maps resolved normalized input into deterministic downstream audio and visual parameters. */
export function mapToParameters(resolved: NormalizedInput): AudioParameters & VisualParameters {
  const tempoEnergy = tempoToEnergy(resolved.tempo_bpm);
  const energy = Number(
    Math.max(
      1,
      Math.min(
        10,
        (tempoEnergy * 0.4) + (resolved.mood.arousal * 0.4) + (resolved.vocal_intensity * 0.2),
      ),
    ).toFixed(2),
  );

  const rhythmPattern = deriveRhythmPattern(resolved.genre_profile.primary);
  const instrumentation = [...new Set([
    ...resolved.genre_profile.instrumentation,
    ...resolved.style_reference.flatMap((ref) => ref.production_style.includes('orchestral') ? ['strings', 'low brass'] : []),
    ...resolved.style_reference.flatMap((ref) => ref.production_style.includes('synth') ? ['analog synth', 'pad'] : []),
  ])].slice(0, 10);

  const mixingStyle = deriveMixingStyle(resolved.genre_profile.primary, resolved.style_vector.production_styles);
  const soundDesignStyle = deriveSoundDesignStyle(
    resolved.genre_profile.primary,
    resolved.mood.tension,
    resolved.mood.arousal,
  );

  const colorPalette = resolved.generate_video
    ? deriveColorPalette(resolved.mood.valence, resolved.mood.arousal, resolved.mood.tension)
    : null;
  const motionStyle = resolved.generate_video ? deriveMotionStyle(Math.round(energy)) : null;
  const visualDirection = resolved.generate_video
    ? deriveVisualDirection(resolved.video_style, resolved.style_reference[0]?.era ?? 'modern')
    : null;

  return {
    energy,
    tempo_bpm: resolved.tempo_bpm,
    rhythm_pattern: rhythmPattern,
    structure: resolved.structure_segments,
    instrumentation,
    mixing_style: mixingStyle,
    sound_design_style: soundDesignStyle,
    enabled: resolved.generate_video,
    style: resolved.video_style,
    color_palette: colorPalette,
    motion_style: motionStyle,
    visual_direction: visualDirection,
  };
}

