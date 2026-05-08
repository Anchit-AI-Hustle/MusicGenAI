/**
 * useLocalSynth — client-side music generation hook.
 *
 *   1. Build a CompositionPlan from a brief
 *   2. Run the engagement gate (auto-rewrite low-scoring plans)
 *   3. Render the plan offline via local-synth
 *   4. Master it with master-pass.ts (corrective gain + true-peak limiter)
 *   5. Return a playable WAV blob URL + a downloadable .mid blob
 *
 * No external API calls. No Replicate, no ElevenLabs, no quotas.
 *
 * Output quality is best for: lo-fi, EDM, house, techno, trance, dubstep,
 * synthwave, phonk, ambient, trap-instrumental, drill-instrumental.
 *
 * Quality is weak for: rock, metal, country, folk, jazz, classical, R&B,
 * Bollywood, anything that needs sampled instruments or vocals.
 */

import { useCallback, useState } from "react";
import {
  buildCompositionPlan,
  applyEngagementGate,
  renderCompositionPlan,
  masterAudioBuffer,
  DEFAULT_TARGETS,
  encodeWav16,
  type CompositionPlan,
  type LoudnessReport,
} from "@/lib/intelligence";
import { exportMidi } from "@/lib/intelligence/midi-export";

export interface LocalSynthBrief {
  mood: string;
  genre: string;
  language?: string;
  occasion?: string;
  references?: string[];
  durationSeconds?: number;
  instrumentalOnly?: boolean;
  /**
   * Layer a vocoder/formant chant on chorus/drop sections. Synthesizes a
   * vowel-tone from chord-tones — Daft-Punk-style vocoder pad. Genre-
   * gated inside the sequencer (only fires for EDM / house / trance /
   * dubstep / synthwave / pop / k-pop / film score).
   */
  vocoderVoice?: boolean;
  seed?: string;
}

export interface LocalSynthResult {
  /** Object URL playable via <audio src>. Revoke when discarded. */
  wavUrl: string;
  /** Mastered WAV ArrayBuffer for download. */
  wavArrayBuffer: ArrayBuffer;
  /** MIDI file ArrayBuffer for download into a DAW. */
  midiArrayBuffer: ArrayBuffer;
  /** Resolved composition plan after the engagement gate. */
  plan: CompositionPlan;
  /** Quality score and any rewrites applied. */
  quality: { score: number; rewrites: string[]; issues: string[] };
  /** LUFS report — before and after mastering. */
  loudness: { before: LoudnessReport; after: LoudnessReport; appliedGainDb: number };
  /** Wall-clock generation time (ms). */
  elapsedMs: number;
}

interface State {
  loading: boolean;
  progress: number;
  message: string;
  error: string | null;
  result: LocalSynthResult | null;
}

const initial: State = { loading: false, progress: 0, message: "", error: null, result: null };

export function useLocalSynth() {
  const [state, setState] = useState<State>(initial);

  const generate = useCallback(async (brief: LocalSynthBrief): Promise<LocalSynthResult> => {
    setState({ ...initial, loading: true, progress: 0.01, message: "Planning composition" });
    const start = performance.now();

    try {
      // 1. Plan
      const rawPlan = buildCompositionPlan({
        mood: brief.mood,
        genre: brief.genre,
        language: brief.language,
        occasion: brief.occasion,
        references: brief.references,
        durationSeconds: brief.durationSeconds ?? 180,
        instrumentalOnly: brief.instrumentalOnly ?? true, // local synth has no vocals
        seed: brief.seed,
      });

      // 2. Quality gate
      setState(s => ({ ...s, progress: 0.1, message: "Scoring composition" }));
      const gate = applyEngagementGate(rawPlan);
      const plan = gate.plan;

      // 3. Offline render
      setState(s => ({ ...s, progress: 0.15, message: "Rendering audio" }));
      const rendered = await renderCompositionPlan(plan, {
        sampleRate: 44100,
        vocoderVoice: brief.vocoderVoice ?? true,
        onProgress: (p, msg) => setState(s => ({ ...s, progress: 0.15 + p * 0.65, message: msg })),
      });

      // 4. Master
      setState(s => ({ ...s, progress: 0.85, message: "Mastering" }));
      const mastered = masterAudioBuffer(rendered.channels, rendered.sampleRate, {
        ...DEFAULT_TARGETS,
        lufsIntegrated: plan.resolved.mixTargets.lufsIntegrated,
        truePeakDb: plan.resolved.mixTargets.truePeakDb,
      });

      // 5. Encode WAV
      setState(s => ({ ...s, progress: 0.93, message: "Encoding WAV" }));
      const wavBuffer = encodeWav16(mastered.channels, rendered.sampleRate);
      const blob = new Blob([wavBuffer], { type: "audio/wav" });
      const wavUrl = URL.createObjectURL(blob);

      // 6. Export MIDI side-by-side
      setState(s => ({ ...s, progress: 0.98, message: "Exporting MIDI" }));
      const midiBuffer = exportMidi(plan);

      const result: LocalSynthResult = {
        wavUrl,
        wavArrayBuffer: wavBuffer,
        midiArrayBuffer: midiBuffer,
        plan,
        quality: {
          score: gate.finalScore,
          rewrites: gate.rewrites,
          issues: gate.finalIssues,
        },
        loudness: {
          before: mastered.before,
          after: mastered.after,
          appliedGainDb: mastered.appliedGainDb,
        },
        elapsedMs: performance.now() - start,
      };

      setState({ loading: false, progress: 1, message: "Done", error: null, result });
      return result;
    } catch (err: any) {
      const error = err?.message ?? String(err);
      setState({ ...initial, error });
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setState(prev => {
      if (prev.result?.wavUrl) URL.revokeObjectURL(prev.result.wavUrl);
      return initial;
    });
  }, []);

  return { ...state, generate, reset };
}

/**
 * Convenience: trigger a browser download of a generated artifact.
 */
export function downloadArrayBuffer(buf: ArrayBuffer, filename: string, mime: string) {
  const blob = new Blob([buf], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
