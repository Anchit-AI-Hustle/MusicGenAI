/**
 * Engagement Scorer
 *
 * Heuristic 0-100 score of a CompositionPlan + (optional) post-render
 * measurements. Does not require listening to audio — measures whether the
 * PLAN itself is structurally sound (right hook timing, energy curve,
 * motif repetition, cadence at boundaries, mix targets, final-third peak).
 *
 * Used to gate auto-rerolls in the generation pipeline. If score < threshold,
 * we adjust prompts or re-roll (cost-capped to one attempt per request).
 */

import { CompositionPlan, QualityScore } from "./types";

const HOOK_DEADLINE_SECONDS = 60;
const SURPRISE_PRED_OPTIMAL = 0.3;
const SURPRISE_PRED_TOLERANCE = 0.15;

export function scorePlan(plan: CompositionPlan): QualityScore {
  const r = plan.resolved;
  const issues: string[] = [];

  // 1. Hook clarity at 30s — does a chorus/drop arrive within 60s?
  let cum = 0;
  let hookSeconds = Infinity;
  for (const s of r.sections) {
    cum += s.durationSeconds;
    if (/chorus|drop|hook|climax/i.test(s.name)) { hookSeconds = cum; break; }
  }
  const hookClarityAt30s = hookSeconds === Infinity
    ? 0
    : Math.max(0, 1 - Math.max(0, hookSeconds - HOOK_DEADLINE_SECONDS) / HOOK_DEADLINE_SECONDS);
  if (hookSeconds > HOOK_DEADLINE_SECONDS) {
    issues.push(`First chorus/drop at ${hookSeconds.toFixed(0)}s exceeds ${HOOK_DEADLINE_SECONDS}s deadline. Consider shortening intro.`);
  }

  // 2. Energy curve correctness — must be non-flat with a final-third peak
  const energies = r.sections.map(s => s.energy);
  const finalThird = energies.slice(Math.floor(energies.length * 0.66));
  const peakEnergy = Math.max(...energies);
  const peakIsFinalThird = finalThird.includes(peakEnergy);
  const variance = stdDev(energies);
  const energyCurveCorrectness = clamp01(
    (variance > 0.18 ? 0.6 : variance / 0.3) + (peakIsFinalThird ? 0.4 : 0)
  );
  if (variance < 0.1) issues.push("Energy curve too flat. Add contrast between verse and chorus.");
  if (!peakIsFinalThird) issues.push("Highest energy section is not in the final third — emotional peak placement weak.");

  // 3. Surprise / predictability — count of sections with surpriseElement vs total
  const surpriseCount = r.emotionalArc.filter(e => !!e.surpriseElement).length;
  const surpriseRatio = surpriseCount / Math.max(1, r.emotionalArc.length);
  const surpriseToPredictabilityRatio = clamp01(
    1 - Math.abs(surpriseRatio - SURPRISE_PRED_OPTIMAL) / SURPRISE_PRED_TOLERANCE
  );
  if (Math.abs(surpriseRatio - SURPRISE_PRED_OPTIMAL) > SURPRISE_PRED_TOLERANCE) {
    issues.push(`Surprise ratio ${surpriseRatio.toFixed(2)} deviates from optimal ~${SURPRISE_PRED_OPTIMAL}. Adjust bridge/key-change frequency.`);
  }

  // 4. Motif repetition — hook must repeat ≥4, others ≥3
  const motifRepetitionCount = clamp01(
    r.motifs.length === 0 ? 0 :
    r.motifs.every(m =>
      (m.id === "hook" ? m.intendedRepeatCount >= 4 : m.intendedRepeatCount >= 3)
    ) ? 1 : 0.5
  );
  if (r.motifs.length === 0) issues.push("No motifs planned — composition will feel forgettable.");
  if (r.motifs.some(m => m.id === "hook" && m.intendedRepeatCount < 4)) issues.push("Hook motif repeats fewer than 4 times.");

  // 5. Cadence strength at section ends — proxy: section count with progressionId
  const sectionsWithProgression = r.sections.filter(s => !!s.primaryProgressionId).length;
  const cadenceStrengthAtSectionEnds = clamp01(sectionsWithProgression / Math.max(1, r.sections.length));
  if (cadenceStrengthAtSectionEnds < 0.5) {
    issues.push("Many sections have no resolved progression — boundaries will feel weak.");
  }

  // 6. Mix clarity — proxy: deviation of measured LUFS from target
  let mixClarity = 0.7;  // default — assume model is okay
  const measured = plan.postRender?.measuredLUFS;
  if (typeof measured === "number") {
    const delta = Math.abs(measured - r.mixTargets.lufsIntegrated);
    mixClarity = clamp01(1 - delta / 6);  // 6 LU off = 0
    if (delta > 2) issues.push(`Measured LUFS ${measured.toFixed(1)} deviates ${delta.toFixed(1)} from target ${r.mixTargets.lufsIntegrated}.`);
  }

  // 7. Final-third payoff intensity — peak energy in final third must be ≥ 0.8
  const finalThirdPayoffIntensity = clamp01(Math.max(0, ...finalThird) / 1.0);
  if (Math.max(0, ...finalThird) < 0.8) {
    issues.push("Final-third peak energy below 0.8 — climax weak. Add layer/up-mod for final chorus.");
  }

  const components = {
    hookClarityAt30s,
    energyCurveCorrectness,
    surpriseToPredictabilityRatio,
    motifRepetitionCount,
    cadenceStrengthAtSectionEnds,
    mixClarity,
    finalThirdPayoffIntensity,
  };

  // Weights chosen so a structurally sound plan with no measurements scores ~75
  const weights = {
    hookClarityAt30s: 0.18,
    energyCurveCorrectness: 0.18,
    surpriseToPredictabilityRatio: 0.10,
    motifRepetitionCount: 0.14,
    cadenceStrengthAtSectionEnds: 0.10,
    mixClarity: 0.15,
    finalThirdPayoffIntensity: 0.15,
  };

  const total = Math.round(
    100 *
    (components.hookClarityAt30s * weights.hookClarityAt30s
     + components.energyCurveCorrectness * weights.energyCurveCorrectness
     + components.surpriseToPredictabilityRatio * weights.surpriseToPredictabilityRatio
     + components.motifRepetitionCount * weights.motifRepetitionCount
     + components.cadenceStrengthAtSectionEnds * weights.cadenceStrengthAtSectionEnds
     + components.mixClarity * weights.mixClarity
     + components.finalThirdPayoffIntensity * weights.finalThirdPayoffIntensity)
  );

  return { total, components, issues };
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

function stdDev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}
