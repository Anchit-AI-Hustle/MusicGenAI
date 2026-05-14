/**
 * The single source of truth.
 * Produce a CompositionPlan from a brief, by consulting the entire
 * knowledge base. Every downstream stage (audio prompt, video prompt,
 * lyric prompt, mastering, sync) reads from this plan.
 */

import { CompositionPlan, MotifPlan, VocalPlan, MixTargets, VisualPlan } from "./types";
import { matchGenreId, getGenre, getBalanceRules, pickBpm, pickModeForMood } from "./genre-knowledge";
import { pickProgression, getVoicingInKey } from "./chord-progression-bank";
import { pickArchetypeId, buildSectionPlans, buildEmotionalArc } from "./emotional-arc-planner";
import { inferContextFromDescription } from "../contextInference";
import { buildHookMelody, buildVerseMelody } from "./local-synth/melody-builder";

const KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

export interface BriefInput {
  mood: string;
  genre: string;
  audience?: string;
  language?: string;
  occasion?: string;
  references?: string[];
  durationSeconds?: number;
  instrumentalOnly?: boolean;
  deliveryTarget?: VisualPlan["deliveryTarget"];
  seed?: string;
}

export function buildCompositionPlan(brief: BriefInput): CompositionPlan {
  // 0. Mine the user's free-text description for additional cues.
  // The brief's `mood` / `genre` / etc. come from form fields, but the
  // description (`occasion`) often carries the actual creative intent.
  // contextInference is local-only keyword classification — no model.
  const inferredFromText = brief.occasion ? inferContextFromDescription(brief.occasion, brief.seed) : null;

  // 1. Resolve genre (canonical id + record). Prefer the user's explicit
  // genre selection; fall back to the inferred genre from the description
  // only when the form genre is the default "Pop".
  const inferredGenreId = inferredFromText ? matchGenreId(inferredFromText.genre) : null;
  const explicitGenreId = matchGenreId(brief.genre);
  const genreId = (explicitGenreId && brief.genre.toLowerCase() !== "pop")
    ? explicitGenreId
    : (inferredGenreId ?? explicitGenreId ?? "pop-mainstream");
  const genre = getGenre(genreId)!;

  // Resolve mood: form mood wins unless it's the default "Energetic".
  const resolvedMood = (brief.mood && brief.mood.toLowerCase() !== "energetic")
    ? brief.mood
    : (inferredFromText?.mood ?? brief.mood ?? "neutral");

  // Seed-driven RNG used to vary plan choices that aren't already
  // user-specified. The hook generates a fresh seed per request, so two
  // identical briefs still produce different (but still on-brief) tracks.
  const seedStr = brief.seed ?? `${Date.now()}-${Math.random()}`;
  const planRng = seededRng(seedStr);

  // 2. Tempo (with ±BPM jitter inside the genre band), key, mode, time sig.
  // If the description inferred a tempo (e.g. "slow ballad" → low edge of
  // band), respect it as the base before jitter.
  const baseBpm = inferredFromText?.tempo ?? pickBpm(genreId, resolvedMood);
  const bpmJitter = Math.round((planRng() - 0.5) * 8); // ±4 BPM
  const bpmMin = (genre.bpm?.min ?? 60);
  const bpmMax = (genre.bpm?.max ?? 200);
  const bpm = clamp(baseBpm + bpmJitter, bpmMin, bpmMax);
  const { mode, isMinor } = pickModeForMood(genreId, resolvedMood);
  const key = pickKey(seedStr, isMinor);
  const timeSignature = (genre.time_signature ?? "4/4") as any;

  // 3. Progression — pick by mood × genre with seed-driven variety,
  //    then transpose to plan's actual key.
  const prog = pickProgression(resolvedMood, genreId, seedStr);
  const voicing = getVoicingInKey(prog, key, isMinor);

  // 4. Arrangement archetype + sections
  const durationSeconds = clamp(brief.durationSeconds ?? 180, 30, 600);
  const archetypeId = pickArchetypeId(genreId, !!brief.instrumentalOnly, durationSeconds);
  const sections = buildSectionPlans(archetypeId, durationSeconds, bpm);

  // 5. Per-section progression assignment (very simple: same prog throughout,
  //    bridge can be alternated to a different one — handled by the prompt builder)
  for (const s of sections) {
    s.primaryProgressionId = prog.id;
    s.instruments = pickInstrumentsForSection(genre, s);
  }

  // 6. Motifs
  const motifs = planMotifs(genreId, !!brief.instrumentalOnly);

  // 7. Pre-compute the hook + verse melodies so the sequencer plays them
  // verbatim every time the section appears. This is what makes a song
  // sound like a song instead of like procedural noise — the brain only
  // latches onto a melody it hears more than once.
  const beatsPerBar = timeSignature === "3/4" ? 3
    : timeSignature === "6/8" ? 6
    : timeSignature === "12/8" ? 12
    : timeSignature === "5/4" ? 5
    : timeSignature === "7/8" ? 7
    : 4;
  const hookRng = makeRng(seedStr + ":hook");
  const verseRng = makeRng(seedStr + ":verse");
  const hookMelody = buildHookMelody({
    mode, bpm, beatsPerBar, rng: hookRng, octaveOffset: 1,
  });
  const verseMelody = buildVerseMelody({
    mode, bpm, beatsPerBar, rng: verseRng, octaveOffset: 0,
  });

  // 8. Emotional arc — uses the resolved mood (form > inference > default).
  const emotionalArc = buildEmotionalArc({ mood: resolvedMood, genre: genreId }, sections);

  // 8. Vocal plan
  const vocal: VocalPlan = brief.instrumentalOnly
    ? { hasVocals: false }
    : {
      hasVocals: true,
      language: brief.language ?? defaultLanguageForGenre(genreId),
      style: defaultVocalStyleForGenre(genreId),
      register: "mid",
      processing: defaultVocalProcessingForGenre(genreId),
      harmonyStackVoices: defaultHarmonyStackForGenre(genreId),
    };

  // 9. Mix targets from balance rules
  const balance = getBalanceRules(genreId);
  const mixTargets: MixTargets = {
    lufsIntegrated: balance.lufs_target ?? -10,
    truePeakDb: -1.0,
    stereoWidthPct: balance.stereo_width_pct ?? 70,
    monoBassThresholdHz: 120,
    compressionTargetGrDb: balance.compression_target_gr_db ?? 3,
    sidechainBassToKickDb: balance.sidechain_bass_to_kick_db ?? 0,
    bandBudgetDbRel: {
      low_60_120: balance.low_60_120_hz_db_relative ?? 0,
      mid_low_120_500: balance.mid_low_120_500_db_relative ?? 0,
      mid_500_2k: balance.mid_500_2k_db_relative ?? 0,
      presence_2k_5k: balance.presence_2k_5k_db_relative ?? 0,
      high_5k_10k: balance.high_5k_10k_db_relative ?? 0,
      air_10k_20k: balance.air_10k_20k_db_relative ?? 0,
    },
  };

  // 10. Visual plan
  const visualAestheticId = genre.video_aesthetic_id ?? "pop-vivid-color";
  const visual: VisualPlan = {
    aestheticId: visualAestheticId,
    perSectionPalette: [],   // populated downstream by visual-arc planner
    cameraArchetype: "track",
    cutRhythm: sections.map(s => ({
      sectionName: s.name,
      cutsPerBar: cutsPerBarFromEnergy(s.energy),
    })),
    deliveryTarget: brief.deliveryTarget ?? "youtube-16-9",
    resolution: deliveryResolution(brief.deliveryTarget ?? "youtube-16-9"),
    fps: 30,
  };

  return {
    brief: {
      mood: resolvedMood,
      genre: brief.genre,
      audience: brief.audience,
      language: brief.language,
      occasion: brief.occasion,
      references: brief.references,
      durationSeconds,
      instrumentalOnly: !!brief.instrumentalOnly,
    },
    resolved: {
      genreId,
      bpm,
      key,
      mode,
      timeSignature,
      progressionId: prog.id,
      progressionRomanNumerals: prog.roman,
      progressionVoicingExample: voicing,
      archetypeId,
      sections,
      motifs,
      hookMelody,
      verseMelody,
      emotionalArc,
      vocal,
      mixTargets,
      visual,
      references: (brief.references && brief.references.length > 0)
        ? brief.references
        : (genre.signature_songs ?? []).slice(0, 3),
      primaryInstruments: genre.instrumentation_layers ?? [],
    },
    prompts: {},
    meta: {
      planVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      seed: seedStr,
    },
  };
}

// ------------------------------------------------------------------
// helpers

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Alias for clarity at call sites inside this file. */
function makeRng(seed: string) { return seededRng(seed); }

function seededRng(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickKey(seed: string | undefined, isMinor: boolean): string {
  // Bias key choice toward singable/idiomatic ranges. Random within bias.
  const popMajor = ["C", "D", "Eb", "F", "G", "A", "Bb"];
  const popMinor = ["A", "C", "D", "E", "F", "G", "Bb"];
  const pool = isMinor ? popMinor : popMajor;
  const idx = seedHash(seed ?? Math.random().toString()) % pool.length;
  return pool[idx];
}

function seedHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickInstrumentsForSection(genre: any, section: { name: string; energy: number }): string[] {
  const layers: string[] = genre.instrumentation_layers ?? [];
  if (layers.length === 0) return [];

  const lower = section.name.toLowerCase();
  const isIntro = /intro|establishing|alap/i.test(lower);
  const isOutro = /outro|tag|jhala/i.test(lower);
  const isBridge = /bridge|break/i.test(lower);

  let count = Math.max(2, Math.round(layers.length * section.energy));
  if (isIntro) count = Math.min(count, Math.max(1, Math.floor(layers.length * 0.4)));
  if (isOutro) count = Math.min(count, Math.max(1, Math.floor(layers.length * 0.5)));
  if (isBridge) count = Math.max(2, Math.floor(layers.length * 0.6));

  return layers.slice(0, count);
}

function planMotifs(genreId: string, instrumentalOnly: boolean): MotifPlan[] {
  const motifs: MotifPlan[] = [
    {
      id: "hook",
      description: "The chorus/drop earworm. 4 bars. Tight intervallic contour.",
      bars: 4,
      intervalRangeSemitones: 9,
      intendedRepeatCount: 4,
      contour: "arch",
      developmentPlan: ["repetition", "sequence"],
    },
    {
      id: "verse",
      description: "Verse melodic thread. Conversational, lower register than chorus.",
      bars: 4,
      intervalRangeSemitones: 7,
      intendedRepeatCount: 3,
      contour: "wave",
      developmentPlan: ["repetition", "fragmentation"],
    },
    {
      id: "counter",
      description: "Instrumental answer to the vocal — fills the gaps in vocal phrasing.",
      bars: 2,
      intervalRangeSemitones: 7,
      intendedRepeatCount: 4,
      contour: "ascending",
      developmentPlan: ["sequence"],
    },
    {
      id: "bridge",
      description: "Bridge contrast motif — modal flip or relative-key restatement of the hook.",
      bars: 4,
      intervalRangeSemitones: 9,
      intendedRepeatCount: 1,
      contour: "range-expansion",
      developmentPlan: ["reharmonization", "augmentation"],
    },
  ];

  // For chant/drone-based genres, replace verse/counter with a sustained tonal motif
  if (genreId === "ambient" || genreId === "meditation-healing" || genreId === "indian-classical") {
    return [
      {
        id: "hook",
        description: "Sustained tonal motif over drone. No conventional hook.",
        bars: 16,
        intervalRangeSemitones: 5,
        intendedRepeatCount: 2,
        contour: "wave",
      },
    ];
  }

  if (instrumentalOnly) {
    // Drop the vocal-coupled assumptions
    motifs[1].description = "Lead instrument verse-figure";
  }

  return motifs;
}

function defaultLanguageForGenre(genreId: string): string {
  const map: Record<string, string> = {
    "k-pop": "Korean",
    "j-pop-anime": "Japanese",
    "bollywood-romantic": "Hindi",
    "bhangra": "Punjabi",
    "punjabi-pop": "Punjabi",
    "punjabi-drill": "Punjabi",
    "indian-classical": "Hindi",
    "arabic-pop": "Arabic",
    "afrobeats": "English",
    "reggaeton": "Spanish",
    "reggae-roots": "English",
  };
  return map[genreId] ?? "English";
}

function defaultVocalStyleForGenre(genreId: string): string {
  if (/drill|trap|hip-hop|phonk/.test(genreId)) return "rap";
  if (/metal|punk/.test(genreId)) return "powerful-rock";
  if (/rnb|neo-soul/.test(genreId)) return "melismatic-soulful";
  if (/k-pop|j-pop/.test(genreId)) return "polished-precise";
  if (/bollywood|indian-classical/.test(genreId)) return "ornamental-melismatic";
  if (/arabic/.test(genreId)) return "ornamental-maqam";
  if (/folk|country/.test(genreId)) return "natural-storytelling";
  return "melodic";
}

function defaultVocalProcessingForGenre(genreId: string): VocalPlan["processing"] {
  if (/drill|trap|phonk/.test(genreId)) return ["auto-tune-light", "reverb-plate", "ad-libs"];
  if (/lo-fi|folk|jazz|classical|indian-classical/.test(genreId)) return ["reverb-plate"];
  if (/k-pop/.test(genreId)) return ["auto-tune-light", "reverb-hall", "doubling", "harmony-stack"];
  if (/rnb|neo-soul/.test(genreId)) return ["doubling", "reverb-plate", "ad-libs"];
  return ["reverb-plate", "doubling"];
}

function defaultHarmonyStackForGenre(genreId: string): number {
  if (/k-pop/.test(genreId)) return 6;
  if (/pop-mainstream|j-pop/.test(genreId)) return 4;
  if (/rnb|neo-soul|gospel/.test(genreId)) return 5;
  if (/rock|metal|country/.test(genreId)) return 3;
  if (/lo-fi|folk|drill|trap|phonk/.test(genreId)) return 1;
  return 2;
}

function cutsPerBarFromEnergy(energy: number): number {
  if (energy < 0.3) return 0.25;
  if (energy < 0.55) return 0.5;
  if (energy < 0.75) return 1;
  if (energy < 0.9) return 2;
  return 4;
}

function deliveryResolution(t: VisualPlan["deliveryTarget"]): { width: number; height: number } {
  switch (t) {
    case "shorts": return { width: 1080, height: 1920 };
    case "youtube-16-9": return { width: 1920, height: 1080 };
    case "square": return { width: 1080, height: 1080 };
    case "spotify-canvas": return { width: 1080, height: 1920 };
    case "hifi-master": return { width: 3840, height: 2160 };
    default: return { width: 1920, height: 1080 };
  }
}
