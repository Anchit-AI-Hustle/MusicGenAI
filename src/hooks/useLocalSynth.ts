import { useCallback, useRef, useState } from "react";
import {
  buildCompositionPlan,
  exportMidi,
  masterAudioBuffer,
  renderCompositionPlan,
  scorePlan,
} from "@/lib/intelligence";
import type { BriefInput, CompositionPlan, LoudnessReport } from "@/lib/intelligence";
import { encodeWav16 } from "@/lib/intelligence/wav-encoder";

export interface LocalSynthGenerateInput extends BriefInput {
  vocoderVoice?: boolean;
}

export interface LocalSynthResult {
  plan: CompositionPlan;
  seed: string;
  wavUrl: string;
  wavArrayBuffer: ArrayBuffer;
  midiArrayBuffer: ArrayBuffer;
  loudness: {
    before: LoudnessReport;
    after: LoudnessReport;
    appliedGainDb: number;
    limited: boolean;
  };
  quality: {
    score: number;
    issues: string[];
  };
  elapsedMs: number;
}

interface LocalSynthState {
  loading: boolean;
  progress: number;
  error: string | null;
  result: LocalSynthResult | null;
}

const initialState: LocalSynthState = {
  loading: false,
  progress: 0,
  error: null,
  result: null,
};

export function useLocalSynth() {
  const [state, setState] = useState<LocalSynthState>(initialState);
  const wavUrlRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    if (wavUrlRef.current) {
      URL.revokeObjectURL(wavUrlRef.current);
      wavUrlRef.current = null;
    }
    setState(initialState);
  }, []);

  const generate = useCallback(async (input: LocalSynthGenerateInput): Promise<LocalSynthResult> => {
    if (wavUrlRef.current) {
      URL.revokeObjectURL(wavUrlRef.current);
      wavUrlRef.current = null;
    }

    const seed = input.seed ?? `local-${Date.now()}`;
    const start = performance.now();
    setState({ loading: true, progress: 0.02, error: null, result: null });

    try {
      const plan = buildCompositionPlan({
        ...input,
        seed,
      });
      setState((prev) => ({ ...prev, progress: 0.1 }));

      const rendered = await renderCompositionPlan(plan, {
        vocoderVoice: input.vocoderVoice,
        onProgress: (progress) => {
          setState((prev) => ({ ...prev, progress: Math.max(prev.progress, 0.1 + progress * 0.6) }));
        },
      });

      const master = masterAudioBuffer(rendered.channels, rendered.sampleRate, {
        lufsIntegrated: plan.resolved.mixTargets.lufsIntegrated,
        truePeakDb: plan.resolved.mixTargets.truePeakDb,
      });
      setState((prev) => ({ ...prev, progress: 0.82 }));

      const wavArrayBuffer = encodeWav16(master.channels, rendered.sampleRate);
      const midiArrayBuffer = exportMidi(plan);
      const wavBlob = new Blob([wavArrayBuffer], { type: "audio/wav" });
      const wavUrl = URL.createObjectURL(wavBlob);
      wavUrlRef.current = wavUrl;

      const scoredPlan: CompositionPlan = {
        ...plan,
        postRender: {
          ...plan.postRender,
          measuredLUFS: master.after.integratedLufs,
          measuredTruePeakDb: master.after.truePeakDb,
        },
      };
      const quality = scorePlan(scoredPlan);

      const result: LocalSynthResult = {
        plan: scoredPlan,
        seed,
        wavUrl,
        wavArrayBuffer,
        midiArrayBuffer,
        loudness: {
          before: master.before,
          after: master.after,
          appliedGainDb: master.appliedGainDb,
          limited: master.limited,
        },
        quality: {
          score: quality.total,
          issues: quality.issues,
        },
        elapsedMs: performance.now() - start,
      };

      setState({ loading: false, progress: 1, error: null, result });
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setState({ loading: false, progress: 0, error: message, result: null });
      throw error;
    }
  }, []);

  return {
    ...state,
    generate,
    reset,
  };
}

export function downloadArrayBuffer(buffer: ArrayBuffer, filename: string, mimeType: string) {
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
