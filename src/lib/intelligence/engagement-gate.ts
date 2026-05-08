/**
 * Engagement gate — auto-rewrite a CompositionPlan that fails the
 * engagement scorer. Cost-capped to one rewrite per request (T1.2).
 *
 * Strategy: do not re-call the model blindly. Fix the PLAN first (cheap),
 * which will produce a better prompt, which will produce a better track.
 * Specific structural fixes are issue-driven — `engagement-scorer.ts`
 * surfaces named issues; we map each to a concrete plan mutation.
 */

import { CompositionPlan } from "./types";
import { scorePlan } from "./engagement-scorer";

export interface GateResult {
  /** Plan after possible rewrite. */
  plan: CompositionPlan;
  /** Pre-rewrite score. */
  initialScore: number;
  /** Post-rewrite score (same as initial when no rewrite was needed). */
  finalScore: number;
  /** Issues from the initial scoring pass. */
  initialIssues: string[];
  /** Issues that remain after rewrite. */
  finalIssues: string[];
  /** What the gate did. */
  rewrites: string[];
  /** Whether the gate considers the plan acceptable for generation. */
  passed: boolean;
}

const ACCEPTANCE_THRESHOLD = 65;

/**
 * Run the gate. Returns the (possibly rewritten) plan and the decision.
 * Does NOT call any external models — fixes happen entirely on the plan.
 */
export function applyEngagementGate(
  plan: CompositionPlan,
  threshold: number = ACCEPTANCE_THRESHOLD,
): GateResult {
  const initial = scorePlan(plan);
  if (initial.total >= threshold) {
    return {
      plan,
      initialScore: initial.total,
      finalScore: initial.total,
      initialIssues: initial.issues,
      finalIssues: initial.issues,
      rewrites: [],
      passed: true,
    };
  }

  const rewrites: string[] = [];
  const fixed = clonePlan(plan);

  for (const issue of initial.issues) {
    if (/First chorus\/drop at .* exceeds .* deadline/.test(issue)) {
      shortenIntroAndPreChorus(fixed);
      rewrites.push("shortened intro + pre-chorus to bring first chorus inside 60s deadline");
    }
    if (/Energy curve too flat/.test(issue)) {
      sharpenEnergyContrast(fixed);
      rewrites.push("widened verse-chorus energy contrast");
    }
    if (/Highest energy section is not in the final third/.test(issue)) {
      pushPeakToFinalThird(fixed);
      rewrites.push("re-shaped energy curve so peak lands in final third");
    }
    if (/Surprise ratio .* deviates from optimal/.test(issue)) {
      retuneSurprises(fixed);
      rewrites.push("retuned bridge / key-change events to ~30% surprise ratio");
    }
    if (/No motifs planned/.test(issue) || /Hook motif repeats fewer than 4 times/.test(issue)) {
      ensureMotifs(fixed);
      rewrites.push("ensured ≥4 hook repetitions and 4 supporting motifs");
    }
    if (/sections have no resolved progression/.test(issue)) {
      assignDefaultProgression(fixed);
      rewrites.push("assigned default progression to all sections");
    }
    if (/Final-third peak energy below 0.8/.test(issue)) {
      boostFinalThirdPeak(fixed);
      rewrites.push("boosted final-chorus / climax energy ≥0.9");
    }
  }

  const finalScore = scorePlan(fixed);
  return {
    plan: fixed,
    initialScore: initial.total,
    finalScore: finalScore.total,
    initialIssues: initial.issues,
    finalIssues: finalScore.issues,
    rewrites,
    passed: finalScore.total >= threshold,
  };
}

// ---------------------------------------------------------------------------
// Plan-level structural fixes
// ---------------------------------------------------------------------------

function shortenIntroAndPreChorus(plan: CompositionPlan): void {
  for (const s of plan.resolved.sections) {
    if (/intro|establishing/i.test(s.name)) {
      s.bars = Math.max(2, Math.floor(s.bars / 2));
      s.durationSeconds = Math.max(4, Math.floor(s.durationSeconds / 2));
    }
    if (/pre-chorus|build/i.test(s.name)) {
      s.bars = Math.max(2, Math.floor(s.bars * 0.75));
      s.durationSeconds = Math.max(4, Math.floor(s.durationSeconds * 0.75));
    }
  }
}

function sharpenEnergyContrast(plan: CompositionPlan): void {
  for (const s of plan.resolved.sections) {
    if (/intro|outro|verse|breakdown|bridge/i.test(s.name)) {
      s.energy = Math.max(0.15, s.energy - 0.1);
      s.density = Math.max(0.2, s.density - 0.1);
    }
    if (/chorus|drop|hook|climax/i.test(s.name)) {
      s.energy = Math.min(1.0, s.energy + 0.1);
      s.density = Math.min(1.0, s.density + 0.1);
    }
  }
}

function pushPeakToFinalThird(plan: CompositionPlan): void {
  const sections = plan.resolved.sections;
  if (sections.length < 2) return;
  const finalThirdStart = Math.floor(sections.length * 0.66);
  // Find the global peak section (anywhere). If it's already in final third, do nothing.
  let peakIdx = 0;
  for (let i = 1; i < sections.length; i++) {
    if (sections[i].energy > sections[peakIdx].energy) peakIdx = i;
  }
  if (peakIdx >= finalThirdStart) return;
  // Demote the early peak by 0.1, boost a final-third section to 0.95.
  sections[peakIdx].energy = Math.max(0.5, sections[peakIdx].energy - 0.1);
  // Pick the last section that looks like a chorus/climax/final-chorus, fall back to last section.
  let target = sections.length - 1;
  for (let i = finalThirdStart; i < sections.length; i++) {
    if (/chorus|drop|climax|final/i.test(sections[i].name)) target = i;
  }
  sections[target].energy = Math.max(0.95, sections[target].energy);
  sections[target].density = Math.max(0.95, sections[target].density);
}

function retuneSurprises(plan: CompositionPlan): void {
  const arc = plan.resolved.emotionalArc;
  const target = Math.round(arc.length * 0.3);
  // Strip surprise from sections that shouldn't have one (intros, mid verses).
  for (const a of arc) {
    if (/intro|verse-1|outro/i.test(a.sectionName)) a.surpriseElement = undefined;
  }
  // Add surprise to bridge and final climax if missing, keep adding until ratio hits target.
  const candidates = arc.filter(a => /bridge|final|climax/i.test(a.sectionName));
  for (const c of candidates) {
    if (!c.surpriseElement) c.surpriseElement = "key-up-or-modal-flip";
  }
  // Trim back if we overshot.
  let count = arc.filter(a => !!a.surpriseElement).length;
  for (const a of arc) {
    if (count <= target) break;
    if (a.surpriseElement && !/bridge|final|climax/i.test(a.sectionName)) {
      a.surpriseElement = undefined;
      count--;
    }
  }
}

function ensureMotifs(plan: CompositionPlan): void {
  if (plan.resolved.motifs.length === 0) {
    plan.resolved.motifs = [
      { id: "hook", description: "Chorus hook", bars: 4, intervalRangeSemitones: 9, intendedRepeatCount: 4, contour: "arch" },
      { id: "verse", description: "Verse motif", bars: 4, intervalRangeSemitones: 7, intendedRepeatCount: 3, contour: "wave" },
      { id: "counter", description: "Counter melody", bars: 2, intervalRangeSemitones: 7, intendedRepeatCount: 4, contour: "ascending" },
      { id: "bridge", description: "Bridge contrast", bars: 4, intervalRangeSemitones: 9, intendedRepeatCount: 1, contour: "range-expansion" },
    ];
  }
  for (const m of plan.resolved.motifs) {
    if (m.id === "hook" && m.intendedRepeatCount < 4) m.intendedRepeatCount = 4;
    if (m.id !== "hook" && m.id !== "bridge" && m.intendedRepeatCount < 3) m.intendedRepeatCount = 3;
  }
}

function assignDefaultProgression(plan: CompositionPlan): void {
  const id = plan.resolved.progressionId;
  for (const s of plan.resolved.sections) {
    if (!s.primaryProgressionId) s.primaryProgressionId = id;
  }
}

function boostFinalThirdPeak(plan: CompositionPlan): void {
  const sections = plan.resolved.sections;
  const finalThirdStart = Math.floor(sections.length * 0.66);
  // Find the highest-energy final-third section and lift it.
  let target = finalThirdStart;
  for (let i = finalThirdStart + 1; i < sections.length; i++) {
    if (sections[i].energy > sections[target].energy) target = i;
  }
  sections[target].energy = Math.max(0.92, sections[target].energy);
  sections[target].density = Math.max(0.92, sections[target].density);
  sections[target].vocalDensity = Math.max(sections[target].vocalDensity, 0.9);
}

// ---------------------------------------------------------------------------

function clonePlan(p: CompositionPlan): CompositionPlan {
  // Structured clone is fine here — CompositionPlan is plain data.
  return JSON.parse(JSON.stringify(p));
}
