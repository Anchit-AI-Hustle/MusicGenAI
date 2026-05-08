/**
 * Video sync bridge.
 *
 * Glue between the new beat-grid analyzer and the existing
 * src/lib/video-generator.ts canvas renderer. The renderer consumes a
 * per-frame `beatStrengths: number[]`. Until that renderer is replaced,
 * we synthesize a sharp beat-pulse mask from the detected BeatGrid and
 * the SyncPlan's cut events, so cuts and pulses land on real beats.
 */

import type { BeatGrid } from "./audio-analyzer";
import type { SyncPlan, CutEvent } from "./audio-visual-sync";

const FPS = 30;
/** Half-width of the beat pulse window in seconds. */
const PULSE_HALF_WIDTH_SEC = 0.06;

/**
 * Produce a per-frame array (length = `totalFrames`) of beat-strength
 * values 0..1 with sharp peaks on detected beats and stronger peaks on
 * downbeats and drop-impacts.
 */
export function beatStrengthsFromGrid(
  grid: BeatGrid,
  durationSeconds: number,
  syncPlan?: SyncPlan,
  fps: number = FPS,
): Float32Array {
  const totalFrames = Math.ceil(durationSeconds * fps);
  const out = new Float32Array(totalFrames);
  if (totalFrames === 0) return out;

  const downbeatSet = new Set(grid.downbeats.map(d => Math.round(d * fps)));
  const impactSet = new Set(
    (syncPlan?.cuts ?? [])
      .filter(c => c.isImpact)
      .map(c => Math.round(c.t * fps))
  );

  for (const t of grid.beats) {
    const center = Math.round(t * fps);
    const half = Math.max(1, Math.round(PULSE_HALF_WIDTH_SEC * fps));
    const isDownbeat = downbeatSet.has(center);
    const isImpact = impactSet.has(center);
    const peak = isImpact ? 1.0 : isDownbeat ? 0.85 : 0.55;
    for (let k = -half; k <= half; k++) {
      const idx = center + k;
      if (idx < 0 || idx >= totalFrames) continue;
      // Triangular pulse — peaks at center, drops linearly to 0 at half.
      const strength = peak * (1 - Math.abs(k) / (half + 1));
      if (strength > out[idx]) out[idx] = strength;
    }
  }
  return out;
}

/** Frames at which cuts should fire, derived from SyncPlan timestamps. */
export function cutFramesFromSyncPlan(syncPlan: SyncPlan, fps: number = FPS): { frame: number; cut: CutEvent }[] {
  return syncPlan.cuts.map(cut => ({
    frame: Math.round(cut.t * fps),
    cut,
  }));
}
