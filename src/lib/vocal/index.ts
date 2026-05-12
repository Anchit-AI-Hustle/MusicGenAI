/**
 * Vocal-layer orchestrator.
 *
 * Single entry point used by the music pipeline. Decides between:
 *   1. Primary: DiffSinger sidecar (Python service on 127.0.0.1:8765)
 *   2. Backup: Whisper-tiny in the browser for karaoke captions on the
 *      raw instrumental
 *
 * Always returns lyric cues. The vocal WAV is optional — if DiffSinger
 * produced one, we hand it back so the mixer can fold it into the final
 * mix. If not, the caller plays the instrumental alone with the cues
 * shown over the video.
 */

import {
  checkVocalServiceHealth,
  synthesizeVocal,
  type MelodyNote,
  type SingRequest,
  type VoiceGender,
} from "./diffsinger-client";
import {
  cuesToPhrases,
  transcribeToCues,
  type WhisperWordCue,
} from "./whisper-fallback";

export type VocalSource = "diffsinger" | "whisper-fallback" | "none";

export interface VocalLayerInput {
  /** Final mixed instrumental as an AudioBuffer or downloadable URL. */
  instrumental: Blob | string;
  /** Plain lyric text. Section tags ([Verse 1] etc.) are stripped before sync. */
  lyrics: string;
  /** Melody to sing — derived from the music engine's generated lead line. */
  melody: MelodyNote[];
  voice: VoiceGender;
  language: string;
  tempoBpm: number;
  sampleRate: number;
  /** Optional deterministic seed. */
  seed?: number;
  /** Progress reporter. */
  onProgress?: (label: string, progress: number) => void;
  /** Abort the whole vocal step. */
  abortSignal?: AbortSignal;
}

export interface VocalLayerResult {
  /** Whichever path actually produced the timing cues. */
  source: VocalSource;
  /** Word-level cues (Whisper) or per-syllable cues (DiffSinger). */
  wordCues: WhisperWordCue[];
  /**
   * Phrase-level cues batched for display — these slot directly into the
   * existing `LyricVideoCue[]` shape consumed by `video-generator.ts`.
   */
  phraseCues: WhisperWordCue[];
  /** DiffSinger output (a sung vocal WAV) if available. */
  vocalWavUrl?: string;
  vocalDurationSeconds?: number;
  /** Set when the primary path failed. */
  primaryFailureReason?: string;
}

/**
 * Estimate the total audio duration we're working with — used to gate
 * the Whisper fallback's word-distribution path.
 */
async function audioDurationSeconds(audio: Blob | string): Promise<number> {
  try {
    const ab = audio instanceof Blob ? await audio.arrayBuffer() : await (await fetch(audio)).arrayBuffer();
    const ctx = new OfflineAudioContext(1, 16_000, 16_000);
    const decoded = await ctx.decodeAudioData(ab.slice(0));
    return decoded.duration;
  } catch {
    return 0;
  }
}

/**
 * Produce the vocal layer for one track. Never throws — every error path
 * is captured and surfaced via `primaryFailureReason`, with cues falling
 * through to the Whisper backup. The caller can always render a video.
 */
export async function produceVocalLayer(input: VocalLayerInput): Promise<VocalLayerResult> {
  const { instrumental, lyrics, melody, voice, language, tempoBpm, sampleRate, seed, onProgress, abortSignal } = input;

  // ---- Primary: DiffSinger sidecar ----
  let primaryFailureReason: string | undefined;
  let diffsingerOk = false;
  onProgress?.("checking vocal service", 0.02);
  const health = await checkVocalServiceHealth();
  if (health?.ok) {
    diffsingerOk = true;
  } else {
    primaryFailureReason = "sidecar unreachable";
  }

  let vocalWavUrl: string | undefined;
  let vocalDurationSeconds: number | undefined;

  if (diffsingerOk && health) {
    try {
      const req: SingRequest = {
        lyrics,
        melody,
        voice,
        language,
        sample_rate: sampleRate,
        tempo_bpm: tempoBpm,
        seed,
      };
      onProgress?.(`synth: ${health.stage_label}`, 0.06);
      const synth = await synthesizeVocal(req, {
        onProgress: (status) => {
          onProgress?.(
            `vocal: ${status.stage_label || status.status}`,
            0.06 + (status.progress ?? 0) * 0.6,
          );
        },
        abortSignal,
      });
      // Stage 1 returns silent audio; we still take it through because
      // the alignment cues are what matter, and Whisper run on this audio
      // will fall through to lyric-by-duration distribution.
      vocalWavUrl = synth.wavObjectUrl;
      vocalDurationSeconds = synth.durationSeconds;
    } catch (err) {
      primaryFailureReason = err instanceof Error ? err.message : String(err);
      diffsingerOk = false;
    }
  }

  // ---- Backup: Whisper on whatever audio we have ----
  // The Whisper pass produces the karaoke timing. We prefer to run it on
  // the synthesized vocal (so cues lock to the actual sung syllables), but
  // when there is no vocal we run on the instrumental + lyric-duration
  // alignment so the captions still scroll in time.
  onProgress?.("aligning captions (whisper)", 0.7);
  const audioForAlignment: Blob | string = vocalWavUrl ?? instrumental;
  let wordCues: WhisperWordCue[];
  try {
    const knownDuration = vocalDurationSeconds ?? (await audioDurationSeconds(instrumental));
    wordCues = await transcribeToCues(audioForAlignment, {
      language,
      expectedLyrics: lyrics,
      onProgress: (label) => onProgress?.(`whisper: ${label}`, 0.75),
    });
    // Stage-1 stub returns near-silent audio → transcribeToCues already
    // falls back to lyric-duration distribution internally. Defensive
    // double-check here in case transcription succeeded but produced
    // no usable timestamps despite Whisper hallucinating fragments.
    if (wordCues.length === 0) {
      const { distributeLyricsByDuration } = await import("./whisper-fallback");
      wordCues = distributeLyricsByDuration(lyrics, knownDuration || 0);
    }
  } catch (err) {
    // Whisper itself failed (model load, decode, etc.) — last resort is
    // the duration-distribution helper. This is the absolute fallback
    // that always returns something usable.
    const { distributeLyricsByDuration } = await import("./whisper-fallback");
    const fallbackDur = vocalDurationSeconds ?? (await audioDurationSeconds(instrumental));
    wordCues = distributeLyricsByDuration(lyrics, fallbackDur || 0);
    primaryFailureReason = primaryFailureReason ?? (err instanceof Error ? err.message : String(err));
  }

  const phraseCues = cuesToPhrases(wordCues, { wordsPerLine: 6, maxGapSeconds: 1.2 });

  onProgress?.("vocal layer ready", 1.0);
  return {
    source: diffsingerOk ? "diffsinger" : wordCues.length > 0 ? "whisper-fallback" : "none",
    wordCues,
    phraseCues,
    vocalWavUrl,
    vocalDurationSeconds,
    primaryFailureReason,
  };
}

export type { MelodyNote, VoiceGender } from "./diffsinger-client";
export type { WhisperWordCue } from "./whisper-fallback";
