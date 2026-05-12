/**
 * In-browser AI instrumental generation via Transformers.js + MusicGen-small.
 *
 * Free forever — compute happens on the user's device. Model weights (~250 MB
 * for MusicGen-small) are downloaded once and cached in the browser's storage
 * by Transformers.js. Subsequent runs are offline.
 *
 * MusicGen-small outputs 32 kHz mono. We resample to the app's internal
 * sample rate (48 kHz) and stitch multiple segments together with a short
 * crossfade so we can synthesize tracks longer than the model's practical
 * per-call ceiling (~12s of audio on consumer hardware).
 *
 * If WebGPU is unavailable, Transformers.js falls back to WASM (slower but
 * still works). If the whole load fails, callers should fall back to the
 * procedural engine.
 */
import type { MusicIntent } from './music-engine';
import { INTERNAL_SAMPLE_RATE } from './audio-utils';

// MusicGen-small native output sample rate.
const MUSICGEN_SAMPLE_RATE = 32000;

// Per-call ceiling. MusicGen tokens ≈ 50 tokens/sec of audio. 10s is a
// reliable sweet-spot — short enough to finish in <60s on a mid-tier laptop
// with WebGPU, long enough that 6 segments = a 1-minute track with audible
// musical phrasing.
const SEGMENT_SECONDS = 10;
const TOKENS_PER_SECOND = 50;

// Crossfade between stitched segments (smooths the boundary so consecutive
// MusicGen prompts feel like one piece).
const CROSSFADE_SECONDS = 0.4;

type ProgressCb = (msg: string, progress?: number) => void;

interface MusicGenPipe {
  (
    prompt: string,
    options?: { max_new_tokens?: number; do_sample?: boolean; guidance_scale?: number },
  ): Promise<{ audio: Float32Array; sampling_rate: number }>;
}

let pipePromise: Promise<MusicGenPipe> | null = null;

async function getPipeline(onProgress?: ProgressCb): Promise<MusicGenPipe> {
  if (!pipePromise) {
    pipePromise = (async () => {
      onProgress?.('Loading MusicGen (one-time ~250 MB download)…', 0);
      const tf = await import('@huggingface/transformers');
      const { pipeline, env } = tf as unknown as {
        pipeline: (task: string, model: string, opts: Record<string, unknown>) => Promise<MusicGenPipe>;
        env: { allowLocalModels: boolean; useBrowserCache: boolean };
      };
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      // Prefer WebGPU; transformers.js falls back to wasm if unavailable.
      const device = (typeof navigator !== 'undefined' && 'gpu' in navigator) ? 'webgpu' : 'wasm';
      const pipe = await pipeline('text-to-audio', 'Xenova/musicgen-small', {
        device,
        dtype: 'fp32',
        progress_callback: (p: { status: string; progress?: number; file?: string }) => {
          if (p.status === 'progress' && typeof p.progress === 'number') {
            onProgress?.(`Downloading ${p.file ?? 'model'}…`, p.progress / 100);
          }
        },
      });
      return pipe;
    })().catch((err) => {
      pipePromise = null;
      throw err;
    });
  }
  return pipePromise;
}

/**
 * Build a MusicGen text prompt from the app's MusicIntent. MusicGen reads
 * short, comma-separated descriptors better than long sentences.
 */
export function buildMusicGenPrompt(intent: MusicIntent, atmosphere?: string): string {
  const parts: string[] = [];

  const genres = intent.genres && intent.genres.length > 0 ? intent.genres : [intent.genre];
  if (genres.length) parts.push(genres.filter(Boolean).slice(0, 3).join(' / '));

  if (intent.subgenre) parts.push(intent.subgenre);
  if (intent.mood) parts.push(`${intent.mood} mood`);

  if (typeof intent.energy === 'number') {
    if (intent.energy >= 8) parts.push('high energy, driving, punchy');
    else if (intent.energy >= 5) parts.push('medium energy, groovy');
    else parts.push('low energy, mellow, sparse');
  }

  if (typeof intent.tempo === 'number') parts.push(`${Math.round(intent.tempo)} bpm`);
  if (intent.scale) parts.push(`${intent.key ?? ''} ${intent.scale}`.trim());

  if (intent.instruments && intent.instruments.length > 0) {
    parts.push(intent.instruments.slice(0, 6).join(', '));
  }

  // Always-on production adjectives that nudge MusicGen toward modern,
  // well-mixed output rather than thin/lo-fi demo-grade tones.
  parts.push('professional studio production, wide stereo, tight low end');

  if (atmosphere) {
    const cleaned = atmosphere.replace(/\s+/g, ' ').trim().slice(0, 140);
    if (cleaned) parts.push(cleaned);
  }

  // Instrumental — MusicGen-small is instrumental-only. Marking this
  // discourages the model from attempting vocal-like artifacts.
  parts.push('instrumental');

  return parts.filter(Boolean).join(', ');
}

/**
 * Resample a mono Float32Array from `inRate` to `outRate` using
 * OfflineAudioContext (fast, browser-native).
 */
async function resampleMonoToStereo(
  monoSamples: Float32Array,
  inRate: number,
  outRate: number,
): Promise<AudioBuffer> {
  const lengthOut = Math.ceil((monoSamples.length / inRate) * outRate);
  const ctx = new OfflineAudioContext(2, lengthOut, outRate);
  const source = ctx.createBuffer(1, monoSamples.length, inRate);
  source.getChannelData(0).set(monoSamples);
  const node = ctx.createBufferSource();
  node.buffer = source;
  // Duplicate mono → stereo so downstream mixers (which expect 2 channels)
  // don't have to handle mono specially.
  const splitter = ctx.createChannelMerger(2);
  node.connect(splitter, 0, 0);
  node.connect(splitter, 0, 1);
  splitter.connect(ctx.destination);
  node.start();
  return ctx.startRendering();
}

/**
 * Equal-power crossfade two AudioBuffers tail→head, returning a single
 * buffer of length (a + b - overlap).
 */
function crossfade(a: AudioBuffer, b: AudioBuffer, overlapSec: number): AudioBuffer {
  const sr = a.sampleRate;
  const overlapSamples = Math.min(Math.floor(overlapSec * sr), a.length, b.length);
  const channels = Math.max(a.numberOfChannels, b.numberOfChannels);
  const outLen = a.length + b.length - overlapSamples;
  const out = new AudioBuffer({ length: outLen, sampleRate: sr, numberOfChannels: channels });

  for (let c = 0; c < channels; c++) {
    const aCh = a.getChannelData(Math.min(c, a.numberOfChannels - 1));
    const bCh = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
    const outCh = out.getChannelData(c);

    // Pre-overlap (a, full volume)
    for (let i = 0; i < a.length - overlapSamples; i++) outCh[i] = aCh[i];

    // Overlap (equal-power: cos² + sin² = 1)
    for (let i = 0; i < overlapSamples; i++) {
      const t = i / overlapSamples;
      const gA = Math.cos(t * Math.PI * 0.5);
      const gB = Math.sin(t * Math.PI * 0.5);
      outCh[a.length - overlapSamples + i] = aCh[a.length - overlapSamples + i] * gA + bCh[i] * gB;
    }

    // Post-overlap (b, full volume)
    for (let i = overlapSamples; i < b.length; i++) {
      outCh[a.length - overlapSamples + i] = bCh[i];
    }
  }
  return out;
}

export interface MusicGenOptions {
  intent: MusicIntent;
  atmosphere?: string;
  durationSeconds: number;
  onProgress?: ProgressCb;
}

/**
 * Generate an instrumental AudioBuffer of approximately `durationSeconds`
 * by running MusicGen multiple times and crossfading the segments together.
 *
 * Returns null if the model fails to load — callers should fall back to the
 * procedural engine in that case.
 */
export async function generateInstrumentalWithMusicGen(
  opts: MusicGenOptions,
): Promise<AudioBuffer | null> {
  const { intent, atmosphere, durationSeconds, onProgress } = opts;

  try {
    const pipe = await getPipeline(onProgress);
    const basePrompt = buildMusicGenPrompt(intent, atmosphere);

    const numSegments = Math.max(1, Math.ceil(durationSeconds / SEGMENT_SECONDS));
    const tokensPerSegment = Math.round(SEGMENT_SECONDS * TOKENS_PER_SECOND);

    let stitched: AudioBuffer | null = null;
    for (let i = 0; i < numSegments; i++) {
      onProgress?.(`Generating segment ${i + 1}/${numSegments}…`, i / numSegments);

      // Slight variation per segment so the model doesn't loop the same riff.
      // Segments 0 / mid / final get phase-of-track hints that nudge the model
      // toward intro / development / outro feels respectively.
      let segmentPrompt = basePrompt;
      if (i === 0) segmentPrompt += ', intro, building up';
      else if (i === numSegments - 1) segmentPrompt += ', outro, resolving';
      else segmentPrompt += ', main section, full arrangement';

      const out = await pipe(segmentPrompt, {
        max_new_tokens: tokensPerSegment,
        do_sample: true,
        guidance_scale: 3.0,
      });

      const segBuf = await resampleMonoToStereo(
        out.audio,
        out.sampling_rate ?? MUSICGEN_SAMPLE_RATE,
        INTERNAL_SAMPLE_RATE,
      );

      stitched = stitched === null ? segBuf : crossfade(stitched, segBuf, CROSSFADE_SECONDS);
    }

    // Trim to requested duration if we overshot.
    if (stitched && stitched.length > durationSeconds * INTERNAL_SAMPLE_RATE) {
      const target = Math.floor(durationSeconds * INTERNAL_SAMPLE_RATE);
      const trimmed = new AudioBuffer({
        length: target,
        sampleRate: INTERNAL_SAMPLE_RATE,
        numberOfChannels: stitched.numberOfChannels,
      });
      for (let c = 0; c < stitched.numberOfChannels; c++) {
        trimmed.getChannelData(c).set(stitched.getChannelData(c).subarray(0, target));
      }
      stitched = trimmed;
    }

    onProgress?.('AI instrumental ready', 1);
    return stitched;
  } catch (err) {
    console.error('[MusicGen] generation failed, will fall back to procedural engine:', err);
    return null;
  }
}
