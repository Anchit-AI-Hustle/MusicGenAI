/**
 * Client-side post-production hook.
 *
 * Given a rendered audio source (URL or data: URI), this hook:
 *   1. Decodes via WebAudio.
 *   2. Runs the K-weighted LUFS measurement and corrective master pass
 *      (src/lib/intelligence/master-pass.ts) toward the plan's target.
 *   3. Runs the beat-grid analyzer (src/lib/intelligence/audio-analyzer.ts)
 *      so the video synchronizer can snap cuts to real beats.
 *   4. Re-encodes mastered audio as WAV for download / playback.
 *
 * Server can't easily do this because Vercel's Node runtime would need
 * ffmpeg to decode MP3 from ElevenLabs. The browser already has a free
 * decoder via WebAudio decodeAudioData.
 */

import { useCallback, useState } from "react";
import {
  audioBufferToChannels,
  masterAudioBuffer,
  DEFAULT_TARGETS,
  MasterTargets,
  LoudnessReport,
  analyzeAudio,
  BeatGrid,
  refineSyncPlanWithAudio,
  SyncPlan,
  buildSyncPlan,
  CompositionPlan,
  beatStrengthsFromGrid,
} from "@/lib/intelligence";
import { encodeWav16 } from "@/lib/intelligence/wav-encoder";

export interface PostProductionResult {
  /** Mastered audio as an object URL — assignable to <audio src>. */
  masteredUrl: string;
  /** WAV buffer if the caller wants to download. */
  masteredWav: ArrayBuffer;
  /** LUFS measurements before and after the master pass. */
  loudness: { before: LoudnessReport; after: LoudnessReport; appliedGainDb: number; limited: boolean };
  /** Detected beat grid for video sync. */
  beatGrid: BeatGrid;
  /** SyncPlan refined against the detected beat grid. Drop into the renderer. */
  syncPlan: SyncPlan;
  /**
   * Per-frame (30 fps) beat strengths ready to feed into
   * generateVideoFromAudio's `precomputedBeatStrengths` parameter.
   */
  beatStrengthsPerFrame: Float32Array;
  /** Total processing time (ms). */
  elapsedMs: number;
}

export interface PostProductionState {
  loading: boolean;
  error: string | null;
  result: PostProductionResult | null;
}

const initial: PostProductionState = { loading: false, error: null, result: null };

export function usePostProduction() {
  const [state, setState] = useState<PostProductionState>(initial);

  const run = useCallback(async (audioSrc: string, plan: CompositionPlan): Promise<PostProductionResult> => {
    setState(s => ({ ...s, loading: true, error: null }));
    const start = performance.now();
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decoded = await fetchAndDecode(audioSrc, ctx);
      const channels = audioBufferToChannels(decoded);
      const sr = decoded.sampleRate;

      // 1. Mastering pass
      const targets: MasterTargets = {
        ...DEFAULT_TARGETS,
        lufsIntegrated: plan.resolved.mixTargets.lufsIntegrated,
        truePeakDb: plan.resolved.mixTargets.truePeakDb,
      };
      const master = masterAudioBuffer(channels, sr, targets);

      // 2. Encode mastered output
      const wav = encodeWav16(master.channels, sr);
      const blob = new Blob([wav], { type: "audio/wav" });
      const masteredUrl = URL.createObjectURL(blob);

      // 3. Beat-grid analysis (use the un-mastered or mastered buffer; the
      //    mastered one is preferred because peaks are normalized — gives
      //    better onset detection thresholds).
      const masteredBuffer = ctx.createBuffer(master.channels.length, master.channels[0].length, sr);
      for (let c = 0; c < master.channels.length; c++) masteredBuffer.copyToChannel(master.channels[c], c);
      const beatGrid = await analyzeAudio(masteredBuffer);

      // 4. Refine the SyncPlan against detected beats
      const planned = buildSyncPlan(plan);
      const syncPlan = refineSyncPlanWithAudio(planned, beatGrid);

      // 5. Pre-compute per-frame beat-strength array for the canvas renderer
      const beatStrengthsPerFrame = beatStrengthsFromGrid(
        beatGrid,
        plan.brief.durationSeconds,
        syncPlan,
        30,
      );

      const result: PostProductionResult = {
        masteredUrl,
        masteredWav: wav,
        loudness: {
          before: master.before,
          after: master.after,
          appliedGainDb: master.appliedGainDb,
          limited: master.limited,
        },
        beatGrid,
        syncPlan,
        beatStrengthsPerFrame,
        elapsedMs: performance.now() - start,
      };
      setState({ loading: false, error: null, result });
      try { void ctx.close(); } catch { /* ignore */ }
      return result;
    } catch (err: any) {
      const error = err?.message ?? String(err);
      setState({ loading: false, error, result: null });
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setState(prev => {
      if (prev.result?.masteredUrl) URL.revokeObjectURL(prev.result.masteredUrl);
      return initial;
    });
  }, []);

  return { ...state, run, reset };
}

async function fetchAndDecode(src: string, ctx: AudioContext): Promise<AudioBuffer> {
  let arrayBuffer: ArrayBuffer;
  if (src.startsWith("data:")) {
    const base64 = src.split(",")[1];
    const bytes = atob(base64);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    arrayBuffer = buf.buffer;
  } else {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);
    arrayBuffer = await res.arrayBuffer();
  }
  return ctx.decodeAudioData(arrayBuffer);
}
