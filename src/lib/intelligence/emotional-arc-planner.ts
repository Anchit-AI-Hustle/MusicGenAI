/**
 * Emotional Arc Planner
 *
 * Maps an arrangement archetype's section list onto a per-section emotion track.
 * Pulls archetype data from ARRANGEMENT_PATTERNS.json.
 *
 * Why: a song with one mood throughout feels flat. The validated retention
 * model (see knowledge-base/MUSIC_NEUROSCIENCE_ENGINE.md A1, A10, A11)
 * requires anticipation, contrast, and a final-third payoff peak.
 */

import patterns from "../../../knowledge-base/data/ARRANGEMENT_PATTERNS.json";
import { getGenre } from "./genre-knowledge";
import { EmotionalArcStep, SectionPlan } from "./types";

interface ArchetypeRecord {
  label: string;
  fits_genres: string[];
  total_duration_seconds: [number, number];
  sections: {
    name: string;
    duration_pct: number;
    energy: number;
    density: number;
    harmonic_rhythm: number | string;
    transition_in: string;
    vocal_density: number;
    purpose: string;
  }[];
  rules?: string[];
  limitations?: string;
}

const ARCHETYPES = (patterns as any).archetypes as Record<string, ArchetypeRecord>;

export function pickArchetypeId(genreId: string, instrumentalOnly: boolean, durationSeconds: number): string {
  const g = getGenre(genreId);

  // Find archetypes whose fits_genres include this genre
  const fits: { id: string; arch: ArchetypeRecord }[] = [];
  for (const [id, arch] of Object.entries(ARCHETYPES)) {
    if (arch.fits_genres.includes(genreId)) fits.push({ id, arch });
  }
  // Prefer one whose duration band contains the requested duration
  for (const f of fits) {
    const [lo, hi] = f.arch.total_duration_seconds;
    if (durationSeconds >= lo && durationSeconds <= hi) return f.id;
  }
  if (fits.length > 0) return fits[0].id;

  // Genre-driven default
  if (instrumentalOnly && /ambient|meditation|classical|film/.test(genreId)) {
    if (genreId === "indian-classical") return "indian-classical-form";
    if (genreId.includes("film") || genreId === "post-rock") return "cinematic-trailer";
    if (genreId === "ambient" || genreId === "meditation-healing") return "lofi-loop";
  }
  if (genreId === "edm-festival" || genreId === "trance" || genreId === "dubstep" || genreId === "house-deep") return "edm-drop";
  if (genreId === "rock-classic" || genreId === "metal" || genreId === "post-rock") return "rock-anthem";
  if (genreId === "trap" || genreId === "uk-drill" || genreId === "phonk" || genreId === "hip-hop-boom-bap" || genreId === "punjabi-drill") return "hip-hop-trap";
  if (g?.label?.toLowerCase().includes("ballad") || /ballad/.test(genreId)) return "ballad-emotional";
  return "pop-verse-chorus";
}

export function getArchetype(id: string): ArchetypeRecord | null {
  return ARCHETYPES[id] ?? null;
}

/**
 * Given an archetype id, total duration, and BPM, produce concrete section plans
 * with bar counts quantized to power-of-2 phrase lengths.
 */
export function buildSectionPlans(archetypeId: string, totalDurationSeconds: number, bpm: number): SectionPlan[] {
  const arch = getArchetype(archetypeId) ?? ARCHETYPES["pop-verse-chorus"];
  const beatsPerBar = 4;
  const secondsPerBeat = 60 / bpm;
  const secondsPerBar = beatsPerBar * secondsPerBeat;

  return arch.sections.map(s => {
    const rawSec = (typeof s.duration_pct === "number" ? s.duration_pct : 0.1) * totalDurationSeconds;
    let bars = Math.max(2, Math.round(rawSec / secondsPerBar));
    bars = quantizeToPow2(bars);
    const durationSeconds = Math.round(bars * secondsPerBar);
    return {
      name: s.name,
      durationSeconds,
      bars,
      energy: s.energy,
      density: s.density,
      vocalDensity: s.vocal_density,
      harmonicRhythm: typeof s.harmonic_rhythm === "number" ? s.harmonic_rhythm : 1,
      transitionIn: s.transition_in,
      instruments: [],
      notes: s.purpose,
    };
  });
}

function quantizeToPow2(bars: number): number {
  const targets = [2, 4, 8, 16, 32, 64, 128];
  return targets.reduce((best, t) => Math.abs(t - bars) < Math.abs(best - bars) ? t : best, targets[0]);
}

/**
 * Given a brief mood and section plans, produce a per-section emotional arc.
 * Strategy: declare a "spine" emotion from the brief, vary intensity per section,
 * and force a final-third payoff peak (Salimpoor / Huron — anticipation reward).
 */
export function buildEmotionalArc(brief: { mood: string; genre: string }, sections: SectionPlan[]): EmotionalArcStep[] {
  const baseMood = (brief.mood || "neutral").toLowerCase();
  const arc: EmotionalArcStep[] = [];

  const climaxIdx = findFinalThirdClimaxIndex(sections);

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const isClimax = i === climaxIdx;
    const isBridge = /bridge/i.test(s.name);
    const isVerse = /verse/i.test(s.name);
    const isChorus = /chorus|drop|hook|climax/i.test(s.name);
    const isIntro = /intro|establishing|alap/i.test(s.name);
    const isOutro = /outro|tag|jhala/i.test(s.name);

    let primary = baseMood;
    let surprise: string | undefined;

    if (isIntro) primary = `${baseMood}, hinted`;
    else if (isVerse) primary = `${baseMood}, narrative`;
    else if (isBridge) {
      primary = `${baseMood}, contrasted (modal flip or relative-key)`;
      surprise = "deceptive-cadence-or-key-shift";
    }
    else if (isClimax) {
      primary = upgradeMoodAtClimax(baseMood);
      surprise = "key-up-half-step-or-harmony-stack-add";
    }
    else if (isChorus) primary = `${baseMood}, full payoff`;
    else if (isOutro) primary = `${baseMood}, release`;

    arc.push({
      sectionName: s.name,
      primaryEmotion: primary,
      intensity: s.energy,
      surpriseElement: surprise,
    });
  }

  return arc;
}

function findFinalThirdClimaxIndex(sections: SectionPlan[]): number {
  const finalThirdStart = Math.floor(sections.length * 0.66);
  let bestIdx = sections.length - 1;
  let bestEnergy = -1;
  for (let i = finalThirdStart; i < sections.length; i++) {
    if (sections[i].energy > bestEnergy) {
      bestEnergy = sections[i].energy;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function upgradeMoodAtClimax(mood: string): string {
  const m = mood.toLowerCase();
  if (m.includes("sad") || m.includes("melancholic")) return "tragic-cathartic";
  if (m.includes("dark") || m.includes("menacing")) return "menacing-peak";
  if (m.includes("happy") || m.includes("uplift")) return "euphoric-anthem";
  if (m.includes("yearning") || m.includes("nostalg")) return "triumphant-yearning-resolved";
  if (m.includes("calm") || m.includes("chill")) return "luminous-warmth";
  return `${mood}-peak`;
}
