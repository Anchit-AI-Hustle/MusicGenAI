/**
 * Audio-Visual Sync Engine
 *
 * Plans frame-perfect cuts, color palettes, camera moves keyed off the
 * resolved CompositionPlan. Operates in two phases:
 *
 *   1. PRE-RENDER (this module): schedules cuts by section using the
 *      planned BPM and section bar counts. No audio yet — used for
 *      prompting downstream image/video models.
 *
 *   2. POST-RENDER: refines cut timestamps using actual beat-detected
 *      audio (see VIDEO_SYNCH_ENGINE.md §1). That refinement step lives
 *      in src/lib/intelligence/audio-analyzer.ts (browser/server WebAudio).
 *
 * The output is consumable both by the canvas renderer (today) and by
 * Replicate / Pika / Runway video models (future).
 */

import { CompositionPlan } from "./types";
import { getVisualStyle } from "./genre-knowledge";

export interface CutEvent {
  /** Cut time in seconds from song start. */
  t: number;
  /** Type of cut, used by renderer to decide hardness/transition. */
  kind: "hard" | "whip" | "black-flash" | "white-flash" | "cross-dissolve" | "match" | "glitch" | "zoom-blur" | "speed-ramp";
  /** Section this cut occurs within. */
  sectionName: string;
  /** Optional flag — drop/climax punch frame. */
  isImpact?: boolean;
}

export interface PaletteForSection {
  sectionName: string;
  dominant: string;
  support: string;
  accent: string;
  highlights: string[];
  /** 0-1 chroma scale, expanded in chorus/drop, contracted in verse/intro. */
  chromaScale: number;
}

export interface CameraDirective {
  sectionName: string;
  /** Camera archetype for this section. */
  archetype: "static" | "push-in" | "pull-out" | "track" | "crane" | "handheld" | "dolly" | "drone" | "whip";
  /** Camera shake intensity 0-1 (peaks at drops). */
  shake: number;
  /** Movement speed 0-1 (relative to baseline for archetype). */
  speed: number;
}

export interface SyncPlan {
  bpm: number;
  beatGrid: number[];           // beat timestamps in seconds (planned, not detected)
  downbeatGrid: number[];       // downbeat timestamps
  cuts: CutEvent[];
  palette: PaletteForSection[];
  camera: CameraDirective[];
  totalSeconds: number;
}

export function buildSyncPlan(plan: CompositionPlan): SyncPlan {
  const { bpm, sections, visual } = plan.resolved;
  const beatsPerBar = beatsPerBarOf(plan.resolved.timeSignature);
  const secondsPerBeat = 60 / bpm;
  const totalSeconds = plan.brief.durationSeconds;

  const beatGrid = buildBeatGrid(totalSeconds, secondsPerBeat);
  const downbeatGrid = buildDownbeatGrid(beatGrid, beatsPerBar);
  const cuts = buildCuts(plan, beatGrid, downbeatGrid);
  const palette = buildPalette(plan);
  const camera = buildCameraDirectives(plan);

  return { bpm, beatGrid, downbeatGrid, cuts, palette, camera, totalSeconds };
}

function beatsPerBarOf(ts: string): number {
  if (ts === "3/4") return 3;
  if (ts === "6/8") return 6;
  if (ts === "12/8") return 12;
  if (ts === "5/4") return 5;
  if (ts === "7/8") return 7;
  return 4;
}

function buildBeatGrid(totalSeconds: number, secondsPerBeat: number): number[] {
  const grid: number[] = [];
  for (let t = 0; t < totalSeconds; t += secondsPerBeat) grid.push(roundMs(t));
  return grid;
}

function buildDownbeatGrid(beats: number[], beatsPerBar: number): number[] {
  return beats.filter((_, i) => i % beatsPerBar === 0);
}

function buildCuts(plan: CompositionPlan, beats: number[], downbeats: number[]): CutEvent[] {
  const out: CutEvent[] = [];
  let cursor = 0;

  for (const section of plan.resolved.sections) {
    const sectionStart = cursor;
    const sectionEnd = cursor + section.durationSeconds;
    cursor = sectionEnd;

    const cpb = plan.resolved.visual.cutRhythm.find(c => c.sectionName === section.name)?.cutsPerBar ?? 1;
    const secondsPerBar = (60 / plan.resolved.bpm) * beatsPerBarOf(plan.resolved.timeSignature);
    const intervalSeconds = secondsPerBar / cpb;

    // Section boundary cut
    const isImpact = /chorus|drop|climax/i.test(section.name) && section.energy >= 0.85;
    out.push({
      t: snapToGrid(sectionStart, downbeats),
      kind: isImpact ? "white-flash" : "hard",
      sectionName: section.name,
      isImpact,
    });

    // Black-flash anticipation 1 frame before drop
    if (isImpact && sectionStart > 0.04) {
      out.push({
        t: roundMs(sectionStart - 0.033),
        kind: "black-flash",
        sectionName: section.name,
      });
    }

    // Internal cuts at the cut interval, snapped to nearest beat
    for (let t = sectionStart + intervalSeconds; t < sectionEnd - 0.05; t += intervalSeconds) {
      out.push({
        t: snapToGrid(t, beats),
        kind: pickInternalCutKind(section.energy),
        sectionName: section.name,
      });
    }
  }
  return dedupeByTime(out);
}

function pickInternalCutKind(energy: number): CutEvent["kind"] {
  if (energy < 0.4) return "cross-dissolve";
  if (energy < 0.65) return "hard";
  if (energy < 0.85) return "whip";
  return "glitch";
}

function snapToGrid(t: number, grid: number[]): number {
  if (grid.length === 0) return roundMs(t);
  let best = grid[0];
  let bestDiff = Math.abs(t - best);
  for (const g of grid) {
    const d = Math.abs(t - g);
    if (d < bestDiff) { best = g; bestDiff = d; }
  }
  return best;
}

function dedupeByTime(cuts: CutEvent[]): CutEvent[] {
  const seen = new Set<string>();
  const out: CutEvent[] = [];
  for (const c of cuts) {
    const key = `${c.t.toFixed(3)}|${c.kind}|${c.sectionName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.sort((a, b) => a.t - b.t);
}

function roundMs(t: number): number { return Math.round(t * 1000) / 1000; }

function buildPalette(plan: CompositionPlan): PaletteForSection[] {
  const aesthetic = getVisualStyle(plan.resolved.visual.aestheticId);
  if (!aesthetic) {
    return plan.resolved.sections.map(s => ({
      sectionName: s.name, dominant: "#1a1a1a", support: "#444444",
      accent: "#888888", highlights: ["#ffffff"], chromaScale: 0.5,
    }));
  }
  return plan.resolved.sections.map(s => {
    const isVerse = /verse/i.test(s.name);
    const isChorus = /chorus|drop|climax|hook/i.test(s.name);
    const isBridge = /bridge/i.test(s.name);

    let chroma = 0.7;
    if (isVerse) chroma = 0.55;
    if (isChorus) chroma = 0.95;
    if (isBridge) chroma = 0.4;

    return {
      sectionName: s.name,
      dominant: aesthetic.palette_dominant,
      support: aesthetic.palette_support,
      accent: aesthetic.palette_accent,
      highlights: aesthetic.palette_highlight ?? ["#ffffff"],
      chromaScale: chroma,
    };
  });
}

function buildCameraDirectives(plan: CompositionPlan): CameraDirective[] {
  const aesthetic = getVisualStyle(plan.resolved.visual.aestheticId);
  const baseArchetype = (aesthetic?.camera_archetype ?? "track") as CameraDirective["archetype"];

  return plan.resolved.sections.map(s => {
    const isClimax = /chorus|drop|climax/i.test(s.name) && s.energy >= 0.85;
    const isIntro = /intro|establishing/i.test(s.name);
    const isBridge = /bridge|break|breakdown/i.test(s.name);

    let archetype: CameraDirective["archetype"] = baseArchetype;
    if (isIntro) archetype = "static";
    if (isClimax) archetype = "push-in";
    if (isBridge) archetype = "pull-out";

    return {
      sectionName: s.name,
      archetype,
      shake: clamp01(s.energy * (isClimax ? 1.0 : 0.6)),
      speed: clamp01(0.4 + s.energy * 0.6),
    };
  });
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
