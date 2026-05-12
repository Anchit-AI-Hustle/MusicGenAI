/**
 * Whisper-tiny browser fallback.
 *
 * Role: when the DiffSinger sidecar is unreachable or returns silence
 * (Stage-1 stub), we still want the user to feel the vocal/lyric layer.
 * This module runs OpenAI Whisper-tiny entirely in the browser via
 * `@huggingface/transformers` (Transformers.js) and produces real
 * word-level timestamps for any audio buffer. Those timestamps drive the
 * existing `lyricCues[]` pipeline in `video-generator.ts`, giving the
 * user true karaoke captions on top of the instrumental.
 *
 * Why Whisper here:
 *   - Runs fully offline after first-load (model cached in IndexedDB).
 *   - ~40 MB compressed model, 1–2 min runtime on a 3-minute song.
 *   - Word-level timing is what we need for karaoke; sentence-level
 *     wouldn't work for syllable-by-syllable highlighting.
 *
 * The model can transcribe vocal audio if it exists. When we only have
 * an instrumental, Whisper will return mostly empty / nonsense — we
 * handle that by aligning the *user-supplied lyrics text* to the audio
 * via duration-proportional fallback timing, so the user still sees
 * captions even when the audio has no voice yet.
 */

export interface WhisperWordCue {
  text: string;
  /** Start time in seconds from the beginning of the audio. */
  startTime: number;
  /** End time in seconds. */
  endTime: number;
}

let pipelinePromise: Promise<unknown> | null = null;

interface ChunkWithTimestamp {
  text?: string;
  timestamp?: [number | null, number | null];
}

interface WhisperPipelineOutput {
  text?: string;
  chunks?: ChunkWithTimestamp[];
}

/**
 * Lazy-load Transformers.js + the Whisper-tiny model. The first call
 * downloads ~40 MB; subsequent calls hit the IndexedDB cache instantly.
 */
async function getPipeline(): Promise<
  (audio: Float32Array, options: Record<string, unknown>) => Promise<WhisperPipelineOutput>
> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const mod = await import("@huggingface/transformers");
      // @ts-expect-error — env is typed loosely upstream
      mod.env.allowLocalModels = false;
      // Use the timestamped variant. Whisper-tiny.en for English-only is
      // ~5x faster than multilingual at the same size; pick at runtime.
      const pipeline = await mod.pipeline(
        "automatic-speech-recognition",
        "Xenova/whisper-tiny",
        { device: "wasm" },
      );
      return pipeline as unknown as (
        audio: Float32Array,
        options: Record<string, unknown>,
      ) => Promise<WhisperPipelineOutput>;
    })();
  }
  return pipelinePromise as Promise<
    (audio: Float32Array, options: Record<string, unknown>) => Promise<WhisperPipelineOutput>
  >;
}

/** Decode an audio source (URL or Blob) to a 16 kHz mono Float32Array. */
async function decodeTo16k(
  audio: ArrayBuffer | Blob | string,
): Promise<Float32Array> {
  const ab =
    audio instanceof ArrayBuffer
      ? audio
      : audio instanceof Blob
      ? await audio.arrayBuffer()
      : await (await fetch(audio)).arrayBuffer();

  // Whisper expects 16 kHz mono.
  const tmpCtx = new OfflineAudioContext(1, 16_000, 16_000);
  const decoded = await tmpCtx.decodeAudioData(ab.slice(0));
  // Decode at native rate, then downsample to 16 kHz mono.
  const channels: Float32Array[] = [];
  for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
  const monoLen = decoded.length;
  const mono = new Float32Array(monoLen);
  for (let i = 0; i < monoLen; i++) {
    let s = 0;
    for (const ch of channels) s += ch[i];
    mono[i] = s / channels.length;
  }
  const targetLen = Math.floor((monoLen * 16_000) / decoded.sampleRate);
  const out = new Float32Array(targetLen);
  const ratio = monoLen / targetLen;
  for (let i = 0; i < targetLen; i++) {
    // Nearest-neighbor downsample — good enough for Whisper-tiny's input
    // (it does its own internal STFT, this is not a quality-critical stage).
    out[i] = mono[Math.min(monoLen - 1, Math.floor(i * ratio))];
  }
  return out;
}

/**
 * Run Whisper on the given audio and return word-level cues.
 *
 * If `expectedLyrics` is provided AND Whisper transcribes very little
 * (likely because the audio is instrumental or the vocal is the Stage-1
 * stub), we fall back to evenly distributing the user's lyric words over
 * the audio duration — at least the captions still show up under the video.
 */
export async function transcribeToCues(
  audio: ArrayBuffer | Blob | string,
  opts: { language?: string; expectedLyrics?: string; onProgress?: (label: string) => void } = {},
): Promise<WhisperWordCue[]> {
  opts.onProgress?.("loading whisper-tiny");
  const pipe = await getPipeline();
  opts.onProgress?.("decoding audio");
  const samples = await decodeTo16k(audio);
  const audioDurationSeconds = samples.length / 16_000;

  opts.onProgress?.("transcribing");
  const result = await pipe(samples, {
    return_timestamps: "word",
    chunk_length_s: 30,
    language: opts.language ?? "english",
    task: "transcribe",
  });

  const chunks = (result?.chunks ?? []) as ChunkWithTimestamp[];
  const cues: WhisperWordCue[] = chunks
    .filter(
      (c): c is Required<Pick<ChunkWithTimestamp, "text" | "timestamp">> =>
        typeof c.text === "string" &&
        Array.isArray(c.timestamp) &&
        c.timestamp[0] != null &&
        c.timestamp[1] != null,
    )
    .map((c) => ({
      text: c.text.trim(),
      startTime: c.timestamp[0] as number,
      endTime: c.timestamp[1] as number,
    }))
    .filter((c) => c.text.length > 0);

  // If Whisper picked up nothing meaningful (instrumental track, or the
  // stub-synth silent vocal), distribute the supplied lyrics evenly.
  const usableTranscript = cues.reduce((acc, c) => acc + c.text.length, 0);
  if (usableTranscript < 8 && opts.expectedLyrics?.trim()) {
    opts.onProgress?.("aligning expected lyrics (fallback)");
    return distributeLyricsByDuration(opts.expectedLyrics, audioDurationSeconds);
  }
  return cues;
}

/**
 * Last-resort timing: when nothing's transcribable, spread the user's
 * lyric tokens proportionally across the audio. Lines lose pitch sync
 * but the captions still scroll in time with the song.
 */
export function distributeLyricsByDuration(lyrics: string, durationSeconds: number): WhisperWordCue[] {
  const tokens = lyrics
    .replace(/\[[^\]]+]/g, " ") // strip [Verse 1], [Chorus], etc.
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (tokens.length === 0) return [];
  const usable = Math.max(2, durationSeconds * 0.95);
  const offset = (durationSeconds - usable) / 2;
  const stride = usable / tokens.length;
  return tokens.map((text, i) => ({
    text,
    startTime: offset + i * stride,
    endTime: offset + (i + 1) * stride,
  }));
}

/**
 * Coalesce word-level cues into bar-aligned phrase cues for use as
 * `LyricVideoCue[]` in the existing video generator. We group words into
 * lines targeting `wordsPerLine` words each so the on-screen caption
 * doesn't flicker every word.
 */
export function cuesToPhrases(
  cues: WhisperWordCue[],
  opts: { wordsPerLine?: number; maxGapSeconds?: number } = {},
): WhisperWordCue[] {
  const wordsPerLine = opts.wordsPerLine ?? 6;
  const maxGap = opts.maxGapSeconds ?? 1.2;
  const out: WhisperWordCue[] = [];
  let buffer: WhisperWordCue[] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    out.push({
      text: buffer.map((b) => b.text).join(" ").replace(/\s+/g, " ").trim(),
      startTime: buffer[0].startTime,
      endTime: buffer[buffer.length - 1].endTime,
    });
    buffer = [];
  };
  for (let i = 0; i < cues.length; i++) {
    const cur = cues[i];
    const prev = buffer[buffer.length - 1];
    if (prev && cur.startTime - prev.endTime > maxGap) flush();
    buffer.push(cur);
    if (buffer.length >= wordsPerLine) flush();
  }
  flush();
  return out;
}
