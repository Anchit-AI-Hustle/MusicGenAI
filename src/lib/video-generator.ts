/**
 * Browser-based video generator using Canvas + MediaRecorder.
 * Creates audio-reactive visualizations synced to the final audio.
 * Uses GenerationDNA when provided for reproducible, unique visuals per track.
 */

/**
 * Spawn a tiny Worker that posts back at the requested interval. Used to
 * drive the render loop because `setTimeout` is throttled to ~1Hz in
 * backgrounded tabs, which previously caused 3-minute renders to hang for
 * 90+ minutes when the user switched tabs.
 *
 * Returns { tick, stop }. Each `tick()` registers a one-shot callback that
 * fires after the next worker message.
 */
function createUnthrottledTicker(intervalMs: number): { onTick: (cb: () => void) => void; stop: () => void } {
  const workerCode = `
    let timer = null;
    self.onmessage = (e) => {
      if (e.data === 'stop') { if (timer) clearInterval(timer); timer = null; return; }
      if (e.data && typeof e.data.interval === 'number') {
        if (timer) clearInterval(timer);
        timer = setInterval(() => self.postMessage(0), Math.max(1, e.data.interval));
      }
    };
  `;
  const blobUrl = URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' }));
  const worker = new Worker(blobUrl);
  worker.postMessage({ interval: intervalMs });
  let queued: (() => void) | null = null;
  worker.onmessage = () => {
    const cb = queued;
    queued = null;
    if (cb) cb();
  };
  return {
    onTick: (cb) => { queued = cb; },
    stop: () => {
      worker.postMessage('stop');
      worker.terminate();
      URL.revokeObjectURL(blobUrl);
    },
  };
}

export interface VideoGenerationDNA {
  seed: string;
  numericSeed?: number;
  visualEnergy?: number;
  colorSignature?: string[];
  arrangementStyle?: string;
}

export interface VideoStyle {
  name: string;
  colors: string[];
  particleCount: number;
  waveformStyle: 'bars' | 'circle' | 'line' | 'spiral';
  bgGradient: [string, string];
  glowIntensity: number;
  motionSpeed: number;
  shapeGeometry: 'orbs' | 'rings' | 'shards' | 'grid';
  cameraMovement: number;
  backgroundAnimation: 'pulse' | 'drift' | 'strobe';
}

const VIDEO_STYLES: Record<string, VideoStyle> = {
  'music visualizer': {
    name: 'Music Visualizer',
    colors: ['#00ff88', '#00ccff', '#ff00ff'],
    particleCount: 140,
    waveformStyle: 'bars',
    bgGradient: ['#050510', '#0f1528'],
    glowIntensity: 1.0,
    motionSpeed: 1.0,
    shapeGeometry: 'grid',
    cameraMovement: 16,
    backgroundAnimation: 'pulse',
  },
  'cyberpunk city': {
    name: 'Cyberpunk City',
    colors: ['#ff006e', '#00f5d4', '#fee440'],
    particleCount: 180,
    waveformStyle: 'line',
    bgGradient: ['#0d0221', '#150050'],
    glowIntensity: 1.4,
    motionSpeed: 0.85,
    shapeGeometry: 'shards',
    cameraMovement: 22,
    backgroundAnimation: 'drift',
  },
  'warehouse rave': {
    name: 'Warehouse Rave',
    colors: ['#ffffff', '#ff0000', '#ffaa00'],
    particleCount: 100,
    waveformStyle: 'bars',
    bgGradient: ['#000000', '#080808'],
    glowIntensity: 1.6,
    motionSpeed: 1.4,
    shapeGeometry: 'grid',
    cameraMovement: 12,
    backgroundAnimation: 'strobe',
  },
  'psychedelic abstract': {
    name: 'Psychedelic Abstract',
    colors: ['#ff00ff', '#00ffff', '#ffff00', '#ff6600'],
    particleCount: 250,
    waveformStyle: 'spiral',
    bgGradient: ['#12002a', '#002850'],
    glowIntensity: 1.2,
    motionSpeed: 0.65,
    shapeGeometry: 'orbs',
    cameraMovement: 20,
    backgroundAnimation: 'drift',
  },
  'dark techno industrial': {
    name: 'Dark Techno Industrial',
    colors: ['#ff3300', '#cc0000', '#880000'],
    particleCount: 80,
    waveformStyle: 'bars',
    bgGradient: ['#000000', '#140000'],
    glowIntensity: 0.8,
    motionSpeed: 1.3,
    shapeGeometry: 'shards',
    cameraMovement: 14,
    backgroundAnimation: 'strobe',
  },
  'space cinematic': {
    name: 'Space Cinematic',
    colors: ['#4400ff', '#0088ff', '#00ffcc'],
    particleCount: 200,
    waveformStyle: 'circle',
    bgGradient: ['#000008', '#000025'],
    glowIntensity: 1.1,
    motionSpeed: 0.45,
    shapeGeometry: 'rings',
    cameraMovement: 18,
    backgroundAnimation: 'drift',
  },
  'neon synthwave': {
    name: 'Neon Synthwave',
    colors: ['#ff00ff', '#00ffff', '#ff6600'],
    particleCount: 160,
    waveformStyle: 'line',
    bgGradient: ['#08001a', '#160030'],
    glowIntensity: 1.5,
    motionSpeed: 0.75,
    shapeGeometry: 'grid',
    cameraMovement: 18,
    backgroundAnimation: 'pulse',
  },
};

/** Seeded RNG for reproducible variation from GenerationDNA */
function createSeededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function getCryptoRandomUint32() {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  }
  return (Date.now() & 0xffffffff) >>> 0;
}

function createEntropyToken() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${getCryptoRandomUint32().toString(16)}-${getCryptoRandomUint32().toString(16)}`;
}

function getVideoSeedNumber(dna?: VideoGenerationDNA) {
  if (!dna) return getCryptoRandomUint32();
  if (dna.numericSeed != null) return dna.numericSeed;
  let hash = 2166136261;
  for (let i = 0; i < dna.seed.length; i++) {
    hash ^= dna.seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Randomize a style so each generation looks unique (uses DNA seed when provided) */
function randomizeStyle(base: VideoStyle, dna?: VideoGenerationDNA): VideoStyle {
  const rng = createSeededRng(getVideoSeedNumber(dna));
  const r = rng;
  // Shift hue of colors randomly
  const shiftColor = (hex: string): string => {
    const hueShift = Math.floor(r() * 60 - 30);
    // Parse hex to RGB, rotate hue, return hex
    const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!match) return hex;
    const red = parseInt(match[1], 16);
    const green = parseInt(match[2], 16);
    const blue = parseInt(match[3], 16);
    // Simple hue rotation via channel shifting
    const shift = hueShift / 360;
    const rotated = [
      Math.min(255, Math.max(0, red + Math.floor(shift * 128))),
      Math.min(255, Math.max(0, green + Math.floor(shift * 64))),
      Math.min(255, Math.max(0, blue - Math.floor(shift * 64))),
    ];
    return `#${rotated.map(c => c.toString(16).padStart(2, '0')).join('')}`;
  };

  const waveformStyles: Array<'bars' | 'circle' | 'line' | 'spiral'> = ['bars', 'circle', 'line', 'spiral'];

  const visualMult = dna?.visualEnergy != null ? 0.6 + dna.visualEnergy * 0.8 : 1;
  return {
    ...base,
    colors: (dna?.colorSignature?.length ? dna.colorSignature : base.colors).map(shiftColor),
    particleCount: Math.floor(base.particleCount * (0.7 + r() * 0.6) * visualMult),
    waveformStyle: r() < 0.3 ? waveformStyles[Math.floor(r() * waveformStyles.length)] : base.waveformStyle,
    glowIntensity: base.glowIntensity * (0.7 + r() * 0.6) * visualMult,
    motionSpeed: base.motionSpeed * (0.7 + r() * 0.6),
    cameraMovement: base.cameraMovement * (0.8 + r() * 0.8),
    shapeGeometry: r() < 0.25 ? (['orbs', 'rings', 'shards', 'grid'] as const)[Math.floor(r() * 4)] : base.shapeGeometry,
    backgroundAnimation: r() < 0.25 ? (['pulse', 'drift', 'strobe'] as const)[Math.floor(r() * 3)] : base.backgroundAnimation,
  };
}

function getStyleFromMetadata(genres: string[], mood: string, videoStyleName?: string, dna?: VideoGenerationDNA): VideoStyle {
  let base: VideoStyle;

  // Direct match
  if (videoStyleName) {
    const key = videoStyleName.toLowerCase();
    let found: VideoStyle | null = null;
    for (const [k, v] of Object.entries(VIDEO_STYLES)) {
      if (key.includes(k) || k.includes(key)) { found = v; break; }
    }
    base = found || VIDEO_STYLES['music visualizer'];
  } else {
    // Genre-based inference
    const genreStr = genres.join(' ').toLowerCase();
    if (genreStr.includes('techno') || genreStr.includes('industrial')) base = VIDEO_STYLES['dark techno industrial'];
    else if (genreStr.includes('synthwave') || genreStr.includes('retro')) base = VIDEO_STYLES['neon synthwave'];
    else if (genreStr.includes('psych') || genreStr.includes('trance')) base = VIDEO_STYLES['psychedelic abstract'];
    else if (genreStr.includes('ambient') || genreStr.includes('cinematic')) base = VIDEO_STYLES['space cinematic'];
    else {
      const moodStr = (mood || '').toLowerCase();
      if (moodStr.includes('dark') || moodStr.includes('aggressive')) base = VIDEO_STYLES['dark techno industrial'];
      else if (moodStr.includes('euphori') || moodStr.includes('bright')) base = VIDEO_STYLES['neon synthwave'];
      else base = VIDEO_STYLES['music visualizer'];
    }
  }

  // Always randomize to ensure unique visuals per generation (DNA-driven when available)
  return randomizeStyle(base, dna);
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; color: string; life: number; maxLife: number;
}

interface AudioVisualAnalysis {
  frameEnergies: number[];
  frameBass: number[];
  frameMid: number[];
  frameHigh: number[];
  beatStrengths: number[];
  transitionFlags: boolean[];
}

export interface AudioVisualDiagnostics {
  averageEnergy: number;
  averageBeatStrength: number;
  transitionCount: number;
  bassVariance: number;
  spectrumVariance: number;
}

export interface VideoGenerationProgress {
  stage: string;
  progress: number;
}

export interface LyricVideoCue {
  text: string;
  sectionName: string;
  startTime: number;
  endTime: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function analyzeAudioForVisuals(
  audioBuffer: AudioBuffer,
  durationSeconds: number,
  onProgress?: (p: VideoGenerationProgress) => void,
): AudioVisualAnalysis {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const fps = 30;
  const totalFrames = Math.ceil(durationSeconds * fps);
  const samplesPerFrame = Math.max(1, Math.floor(sampleRate / fps));

  const frameEnergies: number[] = [];
  const frameBass: number[] = [];
  const frameMid: number[] = [];
  const frameHigh: number[] = [];
  const beatStrengths: number[] = new Array(totalFrames).fill(0);
  const transitionFlags: boolean[] = new Array(totalFrames).fill(false);

  for (let f = 0; f < totalFrames; f++) {
    const start = f * samplesPerFrame;
    const end = Math.min(start + samplesPerFrame, channelData.length);
    let energy = 0;
    let bass = 0;
    let mid = 0;
    let high = 0;
    const count = Math.max(1, end - start);

    for (let i = start; i < end; i++) {
      const val = Math.abs(channelData[i] || 0);
      energy += val;
      const pos = (i - start) / count;
      if (pos < 0.18) bass += val;
      else if (pos < 0.62) mid += val;
      else high += val;
    }

    frameEnergies.push(energy / count);
    frameBass.push(bass / Math.max(1, count * 0.18));
    frameMid.push(mid / Math.max(1, count * 0.44));
    frameHigh.push(high / Math.max(1, count * 0.38));
  }

  const normalize = (values: number[]) => {
    const max = Math.max(...values, 0.001);
    return values.map((value) => value / max);
  };

  const normEnergy = normalize(frameEnergies);
  const normBass = normalize(frameBass);
  const normMid = normalize(frameMid);
  const normHigh = normalize(frameHigh);

  for (let i = 0; i < totalFrames; i++) {
    const localStart = Math.max(0, i - 18);
    const localEnd = Math.min(totalFrames, i + 18);
    const localSlice = normEnergy.slice(localStart, localEnd);
    const localAvg = localSlice.reduce((sum, value) => sum + value, 0) / Math.max(1, localSlice.length);
    const prev = i > 0 ? normEnergy[i - 1] : 0;
    const bassPulse = normBass[i];
    const energyRise = normEnergy[i] - prev;
    beatStrengths[i] = clamp01((normEnergy[i] - localAvg) * 2.4 + bassPulse * 0.55 + energyRise * 1.4);

    if (i > 30) {
      const shortWindow = normEnergy.slice(Math.max(0, i - 15), i + 1);
      const longWindow = normEnergy.slice(Math.max(0, i - 60), i + 1);
      const shortAvg = shortWindow.reduce((sum, value) => sum + value, 0) / shortWindow.length;
      const longAvg = longWindow.reduce((sum, value) => sum + value, 0) / longWindow.length;
      transitionFlags[i] = Math.abs(shortAvg - longAvg) > 0.16 && Math.abs(normBass[i] - normBass[Math.max(0, i - 15)]) > 0.12;
    }

    if (i % Math.max(1, Math.floor(totalFrames / 4)) === 0) {
      onProgress?.({ stage: 'analyzing_beat_structure', progress: 0.08 + (i / totalFrames) * 0.10 });
    }
  }

  onProgress?.({ stage: 'analyzing_beat_structure', progress: 0.20 });

  return {
    frameEnergies: normEnergy,
    frameBass: normBass,
    frameMid: normMid,
    frameHigh: normHigh,
    beatStrengths,
    transitionFlags,
  };
}

export async function analyzeAudioVisualDiagnosticsFromUrl(
  audioUrl: string,
  durationSeconds: number,
): Promise<AudioVisualDiagnostics> {
  const audioContext = new AudioContext();
  try {
    const audioResponse = await fetch(audioUrl);
    const audioArrayBuffer = await audioResponse.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(audioArrayBuffer);
    const analysis = analyzeAudioForVisuals(audioBuffer, durationSeconds);

    const averageEnergy = analysis.frameEnergies.reduce((sum, value) => sum + value, 0) / Math.max(1, analysis.frameEnergies.length);
    const averageBeatStrength = analysis.beatStrengths.reduce((sum, value) => sum + value, 0) / Math.max(1, analysis.beatStrengths.length);
    const transitionCount = analysis.transitionFlags.filter(Boolean).length;
    const bassMean = analysis.frameBass.reduce((sum, value) => sum + value, 0) / Math.max(1, analysis.frameBass.length);
    const bassVariance = analysis.frameBass.reduce((sum, value) => sum + Math.pow(value - bassMean, 2), 0) / Math.max(1, analysis.frameBass.length);
    const spectrumCombined = analysis.frameBass.map((bass, index) => bass + (analysis.frameMid[index] || 0) + (analysis.frameHigh[index] || 0));
    const spectrumMean = spectrumCombined.reduce((sum, value) => sum + value, 0) / Math.max(1, spectrumCombined.length);
    const spectrumVariance = spectrumCombined.reduce((sum, value) => sum + Math.pow(value - spectrumMean, 2), 0) / Math.max(1, spectrumCombined.length);

    return {
      averageEnergy,
      averageBeatStrength,
      transitionCount,
      bassVariance,
      spectrumVariance,
    };
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

/**
 * Returns the actual video file extension based on the blob MIME type.
 */
export function getVideoExtension(blob: Blob): string {
  if (blob.type.includes('mp4')) return 'mp4';
  return 'webm';
}

type FfmpegRuntime = {
  ffmpeg: {
    loaded?: boolean;
    load: (options: { coreURL: string; wasmURL: string }) => Promise<void>;
    writeFile: (path: string, data: Uint8Array) => Promise<void>;
    readFile: (path: string) => Promise<Uint8Array | ArrayBuffer>;
    exec: (args: string[]) => Promise<void>;
    deleteFile?: (path: string) => Promise<void>;
    on?: (event: string, callback: (payload: { progress: number }) => void) => void;
    off?: (event: string, callback: (payload: { progress: number }) => void) => void;
  };
  fetchFile: (file: Blob) => Promise<Uint8Array>;
};

let ffmpegRuntimePromise: Promise<FfmpegRuntime> | null = null;
let ffmpegJobQueue: Promise<void> = Promise.resolve();

function enqueueTranscodeJob<T>(job: () => Promise<T>): Promise<T> {
  const nextJob = ffmpegJobQueue.then(job, job);
  ffmpegJobQueue = nextJob.then(() => undefined, () => undefined);
  return nextJob;
}

async function loadFfmpegRuntime(): Promise<FfmpegRuntime> {
  if (!ffmpegRuntimePromise) {
    ffmpegRuntimePromise = (async () => {
      const ffmpegModuleUrl = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
      const utilModuleUrl = 'https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js';
      const ffmpegCoreBaseUrl = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

      const [ffmpegModule, utilModule] = await Promise.all([
        import(/* @vite-ignore */ ffmpegModuleUrl),
        import(/* @vite-ignore */ utilModuleUrl),
      ]);

      const ffmpeg = new ffmpegModule.FFmpeg();
      const toBlobURL = utilModule.toBlobURL as (url: string, mimeType: string) => Promise<string>;
      const fetchFile = utilModule.fetchFile as (file: Blob) => Promise<Uint8Array>;

      const coreURL = await toBlobURL(`${ffmpegCoreBaseUrl}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${ffmpegCoreBaseUrl}/ffmpeg-core.wasm`, 'application/wasm');

      await ffmpeg.load({ coreURL, wasmURL });

      return { ffmpeg, fetchFile };
    })().catch((error) => {
      ffmpegRuntimePromise = null;
      throw error;
    });
  }

  return ffmpegRuntimePromise;
}

async function transcodeToUniversalMp4Blob(
  videoBlob: Blob,
  onProgress?: (p: VideoGenerationProgress) => void,
): Promise<Blob> {
  const { ffmpeg, fetchFile } = await loadFfmpegRuntime();
  const uniqueId = createEntropyToken();

  const inputName = `input-${uniqueId}.${getVideoExtension(videoBlob)}`;
  const outputName = `output-${uniqueId}.mp4`;

  onProgress?.({ stage: 'transcoding_video', progress: 0.02 });

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.({
      stage: 'transcoding_video',
      progress: Math.min(0.98, Math.max(0.02, progress || 0)),
    });
  };

  if (typeof ffmpeg.on === 'function') {
    ffmpeg.on('progress', progressHandler);
  }

  try {
    const inputData = await fetchFile(videoBlob);
    await ffmpeg.writeFile(inputName, inputData);

    // `-preset veryfast` is 3-5x faster than `medium` and visually
     // indistinguishable for the canvas-visualizer content we record. The
     // earlier `medium` preset was the dominant cost on long tracks.
    // CRF 26 keeps file size reasonable while staying near-transparent for
     // these flat-color/particle visuals.
    // 8-min hard cap. WASM ffmpeg occasionally stalls or OOMs silently on
    // long tracks. On timeout, the outer ensureUniversalMp4Blob catch falls
    // back to the raw webm so the user still gets a video.
    const transcodePromise = ffmpeg.exec([
      '-i', inputName,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'fastdecode',
      '-crf', '26',
      '-profile:v', 'high',
      '-level', '4.0',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-ar', '44100',
      '-movflags', '+faststart',
      '-y',
      outputName,
    ]);
    const TRANSCODE_TIMEOUT_MS = 8 * 60 * 1000;
    await Promise.race([
      transcodePromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`MP4 transcode timed out after ${TRANSCODE_TIMEOUT_MS / 1000}s`)), TRANSCODE_TIMEOUT_MS),
      ),
    ]);

    const outputData = await ffmpeg.readFile(outputName);
    const bytes = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData);
    const outputBytes = new Uint8Array(bytes.byteLength);
    outputBytes.set(bytes);
    onProgress?.({ stage: 'transcoding_video', progress: 1 });

    return new Blob([outputBytes], { type: 'video/mp4' });
  } finally {
    if (typeof ffmpeg.off === 'function') {
      ffmpeg.off('progress', progressHandler);
    }
    if (typeof ffmpeg.deleteFile === 'function') {
      await Promise.allSettled([
        ffmpeg.deleteFile(inputName),
        ffmpeg.deleteFile(outputName),
      ]);
    }
  }
}

export async function ensureUniversalMp4Blob(
  videoBlob: Blob,
  onProgress?: (p: VideoGenerationProgress) => void,
): Promise<Blob> {
  if (!videoBlob.type.startsWith('video/')) {
    return videoBlob;
  }

  if (videoBlob.type.includes('mp4')) {
    return videoBlob;
  }

  try {
    return await enqueueTranscodeJob(() => transcodeToUniversalMp4Blob(videoBlob, onProgress));
  } catch (error) {
    console.warn('[Video] MP4 transcode failed, falling back to original recording.', error);
    return videoBlob;
  }
}

/**
 * Generate a video from an audio blob using Canvas-based visualization + MediaRecorder.
 * Pass generationDNA for reproducible, unique visuals driven by the track's GenerationSeed.
 */
export async function generateVideoFromAudio(
  audioUrl: string,
  durationSeconds: number,
  genres: string[],
  mood: string,
  videoStyleName?: string,
  onProgress?: (p: VideoGenerationProgress) => void,
  generationDNA?: VideoGenerationDNA,
  lyricCues: LyricVideoCue[] = [],
  /**
   * Optional per-frame beat strengths from the music intelligence analyzer
   * (src/lib/intelligence/audio-analyzer.ts → video-sync-bridge). When
   * provided, replaces the local heuristic detection so cuts and pulses
   * land on the actual detected beats. Length must equal totalFrames.
   */
  precomputedBeatStrengths?: Float32Array | number[],
): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('This browser does not support video recording.');
  }

  const style = getStyleFromMetadata(genres, mood, videoStyleName, generationDNA);
  const rng = createSeededRng(getVideoSeedNumber(generationDNA) ^ 0x9e3779b9);

  // ===== DNA-driven style mutations across the track =====
  // Pre-compute alternate palettes + waveform variants so the visualizer
  // can rotate between them on section transitions instead of being locked
  // to one look for the entire video.
  const waveformVariants: VideoStyle['waveformStyle'][] = ['bars', 'circle', 'line', 'spiral'];
  const altPalettes: string[][] = [
    style.colors,
    // DNA color signature gives us a fully alternative palette
    (generationDNA?.colorSignature?.length ?? 0) >= 3
      ? generationDNA!.colorSignature.slice(0, 3)
      : style.colors,
    // A complementary palette: shift hue by ~120deg via channel rotation
    style.colors.map((c) => {
      const m = c.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
      if (!m) return c;
      const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
      return `#${[g, b, r].map(v => v.toString(16).padStart(2, '0')).join('')}`;
    }),
    // Inverse-luminance palette for contrast sections
    style.colors.map((c) => {
      const m = c.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
      if (!m) return c;
      return `#${[1,2,3].map(i => (255 - parseInt(m[i], 16)).toString(16).padStart(2, '0')).join('')}`;
    }),
  ];
  let activeStyle: VideoStyle = { ...style };
  let nextMutationFrame = 0;
  const mutationStride = Math.max(60, Math.floor(durationSeconds * 30 / 6)); // ~6 mutations per track

  onProgress?.({ stage: 'analyzing_beat_structure', progress: 0.02 });

  // Create offscreen canvas
  const width = 1280;
  const height = 720;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Decode audio for analysis. Fetch can hang silently when the audio URL
  // is unreachable (Supabase Storage CORS misconfigured, blob: URL lost
  // after reload, transient network failure). Without a timeout the whole
  // video pipeline sits at 84% indefinitely until the outer 5-minute cap.
  // Emit progress before AND after the fetch so the UI shows liveness, and
  // bail loudly if the fetch never resolves.
  onProgress?.({ stage: 'analyzing_beat_structure', progress: 0.04 });
  const audioContext = new AudioContext();
  const FETCH_TIMEOUT_MS = 45_000;
  const audioResponse = await Promise.race([
    fetch(audioUrl, { credentials: 'omit' }),
    new Promise<Response>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Audio fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s — check Supabase Storage CORS for this domain, or the blob URL may have been invalidated by a page reload.`)),
        FETCH_TIMEOUT_MS,
      ),
    ),
  ]);
  if (!audioResponse.ok) {
    throw new Error(`Audio fetch returned ${audioResponse.status} ${audioResponse.statusText} — visual pipeline cannot proceed.`);
  }
  onProgress?.({ stage: 'analyzing_beat_structure', progress: 0.08 });
  const audioArrayBuffer = await audioResponse.arrayBuffer();
  onProgress?.({ stage: 'analyzing_beat_structure', progress: 0.12 });
  const audioBuffer = await audioContext.decodeAudioData(audioArrayBuffer);
  await audioContext.resume().catch(() => undefined);
  onProgress?.({ stage: 'analyzing_beat_structure', progress: 0.18 });

  const fps = 30;
  const totalFrames = Math.ceil(durationSeconds * fps);
  const analysis = analyzeAudioForVisuals(audioBuffer, durationSeconds, onProgress);

  // Override the heuristic beat detector with analyzer-computed beat strengths
  // when the caller provides them. See src/lib/intelligence/video-sync-bridge.ts.
  if (precomputedBeatStrengths && precomputedBeatStrengths.length === totalFrames) {
    for (let i = 0; i < totalFrames; i++) {
      analysis.beatStrengths[i] = precomputedBeatStrengths[i];
    }
  }

  onProgress?.({ stage: 'rendering_video', progress: 0.24 });

  // Initialize particles
  const particles: Particle[] = [];
  for (let i = 0; i < style.particleCount; i++) {
    particles.push({
      x: rng() * width,
      y: rng() * height,
      vx: (rng() - 0.5) * 2,
      vy: (rng() - 0.5) * 2,
      size: rng() * 3 + 1,
      color: style.colors[Math.floor(rng() * style.colors.length)],
      life: rng() * 100,
      maxLife: 100 + rng() * 200,
    });
  }

  // Setup MediaRecorder
  const stream = canvas.captureStream(fps);

  // Add audio track
  const audioSource = audioContext.createBufferSource();
  audioSource.buffer = audioBuffer;
  const dest = audioContext.createMediaStreamDestination();
  audioSource.connect(dest);

  for (const track of dest.stream.getAudioTracks()) {
    stream.addTrack(track);
  }

  // Pick best available capture format, then normalize to universal MP4 after recording
  const mimeOptions = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
  ];
  let selectedMime = '';
  for (const mime of mimeOptions) {
    if (MediaRecorder.isTypeSupported(mime)) {
      selectedMime = mime;
      break;
    }
  }

  let mediaRecorder: MediaRecorder;
  try {
    mediaRecorder = selectedMime
      ? new MediaRecorder(stream, {
          mimeType: selectedMime,
          videoBitsPerSecond: 5_000_000,
        })
      : new MediaRecorder(stream);
  } catch {
    // Some browsers reject the bitrate option — retry without it
    mediaRecorder = selectedMime
      ? new MediaRecorder(stream, { mimeType: selectedMime })
      : new MediaRecorder(stream);
  }

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  onProgress?.({ stage: 'rendering_video', progress: 0.25 });

  return new Promise<Blob>((resolve, reject) => {
    let tickerRef: { stop: () => void } | null = null;
    const cleanupStreams = () => {
      try { tickerRef?.stop(); } catch { /* worker already stopped */ }
      try { stream.getTracks().forEach((track) => track.stop()); } catch { /* already stopped */ }
      try { dest.stream.getTracks().forEach((track) => track.stop()); } catch { /* already stopped */ }
      audioContext.close().catch(() => undefined);
    };
    mediaRecorder.onstop = async () => {
      try {
        const recordedMime = mediaRecorder.mimeType || selectedMime;
        const recordedType = recordedMime.includes('mp4') ? 'video/mp4' : 'video/webm';
        const rawBlob = new Blob(chunks, { type: recordedType });
        if (!chunks.length || rawBlob.size < 256) {
          throw new Error('Video recording produced no usable data. Try again or disable video.');
        }
        const universalMp4Blob = await ensureUniversalMp4Blob(rawBlob, onProgress);
        resolve(universalMp4Blob);
      } catch (error) {
        reject(error);
      } finally {
        cleanupStreams();
      }
    };
    mediaRecorder.onerror = (e) => { cleanupStreams(); reject(e); };

    mediaRecorder.start();
    audioSource.start(0);

    // Web Worker timer to sidestep tab-backgrounding throttling on the main
    // thread. setTimeout in a hidden tab drops to ~1Hz, which would stretch
    // a 3-min render to 90+ minutes. Worker timers are not throttled.
    const ticker = createUnthrottledTicker(Math.max(8, Math.floor(1000 / fps)));
    tickerRef = ticker;

    let frame = 0;
    const finishRender = () => {
      try { ticker.stop(); } catch { /* worker already stopped */ }
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      try {
        audioSource.stop();
      } catch {
        // BufferSource can only be stopped once.
      }
      onProgress?.({ stage: 'rendering_video', progress: 0.98 });
    };

    // Watchdog: if no frame has advanced for 30 s, something's wedged
    // (canvas exception swallowed, ticker frozen, audio stalled). Reject
    // so the outer Promise unblocks and the track fails cleanly instead
    // of sitting at "Rendering visuals" indefinitely.
    let lastFrameAt = Date.now();
    const STALL_MS = 30_000;
    const stallWatchdog = setInterval(() => {
      if (Date.now() - lastFrameAt > STALL_MS && frame < totalFrames) {
        clearInterval(stallWatchdog);
        cleanupStreams();
        reject(new Error(`Video render stalled — no frame advance for ${STALL_MS / 1000}s. Try again or disable video for this track.`));
      }
    }, 5_000);

    const renderFrame = () => {
      if (frame >= totalFrames) {
        clearInterval(stallWatchdog);
        finishRender();
        return;
      }

      const t = frame / totalFrames;
      const energy = analysis.frameEnergies[frame] || 0;
      const bass = analysis.frameBass[frame] || 0;
      const mid = analysis.frameMid[frame] || 0;
      const high = analysis.frameHigh[frame] || 0;
      const beatStrength = analysis.beatStrengths[frame] || 0;
      const sectionTransition = analysis.transitionFlags[frame] || false;
      const currentTime = frame / fps;
      const activeLyricCue = lyricCues.find((cue) => currentTime >= cue.startTime && currentTime <= cue.endTime);
      const lyricFlash = lyricCues.some((cue) => Math.abs(cue.startTime - currentTime) < 0.12) ? 1 : 0;

      // Mutate the visual style on section transitions OR every mutationStride
      // frames as a fallback. Each mutation rotates palette + waveform so the
      // video doesn't look like one screensaver glued to the track.
      if (sectionTransition || frame >= nextMutationFrame) {
        const paletteIdx = Math.floor(rng() * altPalettes.length);
        const waveIdx = Math.floor(rng() * waveformVariants.length);
        activeStyle = {
          ...style,
          colors: altPalettes[paletteIdx],
          waveformStyle: waveformVariants[waveIdx],
          // particleCount also drifts with energy + DNA visualEnergy
          particleCount: Math.max(20, Math.min(200, Math.round(
            style.particleCount * (0.7 + (generationDNA?.visualEnergy ?? 0.5) * 0.6)
          ))),
        };
        nextMutationFrame = frame + mutationStride;
      }

      // Draw visualization — wrap in try/catch so a canvas exception (rare
      // but possible on backgrounded tabs / weird DPRs) doesn't silently
      // wedge the render. On error we bail loudly.
      try {
        drawVisualization(
          ctx,
          activeStyle,
          width,
          height,
          t,
          energy,
          bass,
          mid,
          high,
          beatStrength,
          sectionTransition,
          particles,
          frame,
          rng,
          activeLyricCue?.text || '',
          lyricFlash,
        );
      } catch (drawErr) {
        clearInterval(stallWatchdog);
        cleanupStreams();
        reject(drawErr instanceof Error ? drawErr : new Error(String(drawErr)));
        return;
      }

      // Update progress every 30 frames
      if (frame % 30 === 0) {
        const vidProgress = 0.25 + (t * 0.65);
        onProgress?.({ stage: 'rendering_video', progress: vidProgress });
      }

      lastFrameAt = Date.now();
      frame++;
      if (frame < totalFrames) {
        // Worker-driven tick — not throttled when tab is hidden.
        ticker.onTick(renderFrame);
      } else {
        finishRender();
      }
    };

    // Kick off the first frame immediately, subsequent frames flow from the
    // worker ticker.
    ticker.onTick(renderFrame);
  });
}

function drawVisualization(
  ctx: CanvasRenderingContext2D,
  style: VideoStyle,
  w: number, h: number,
  t: number,
  energy: number, bass: number, mid: number, high: number,
  beatStrength: number,
  sectionTransition: boolean,
  particles: Particle[],
  frame: number,
  rng: () => number,
  activeLyricText: string,
  lyricFlash: number,
) {
  const cx = w / 2;
  const cy = h / 2;

  // ===== Background with animated gradient =====
  const gradAngle = t * 0.3;
  const gx = Math.cos(gradAngle) * w;
  const gy = Math.sin(gradAngle) * h;
  const grad = ctx.createLinearGradient(cx + gx * 0.3, cy + gy * 0.3, cx - gx * 0.3, cy - gy * 0.3);
  grad.addColorStop(0, style.bgGradient[0]);
  grad.addColorStop(1, style.bgGradient[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // ===== Background animation layer =====
  if (style.backgroundAnimation === 'pulse') {
    const pulseAlpha = Math.floor((0.06 + beatStrength * 0.2 + bass * 0.08) * 255);
    ctx.fillStyle = `${style.colors[0]}${Math.min(255, pulseAlpha).toString(16).padStart(2, '0')}`;
    ctx.fillRect(0, 0, w, h);
    // Radial pulse from center on beats
    if (beatStrength > 0.5) {
      const pRad = 100 + beatStrength * 400;
      const pGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pRad);
      pGrad.addColorStop(0, `${style.colors[1 % style.colors.length]}30`);
      pGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = pGrad;
      ctx.fillRect(0, 0, w, h);
    }
  } else if (style.backgroundAnimation === 'drift') {
    // Multiple drifting orbs for depth
    for (let d = 0; d < 3; d++) {
      const dx = cx + Math.sin(t * Math.PI * (1.2 + d * 0.4)) * w * (0.2 + d * 0.08);
      const dy = cy + Math.cos(t * Math.PI * (0.8 + d * 0.3)) * h * (0.15 + d * 0.06);
      const dr = w * (0.15 + d * 0.06) + energy * 60;
      const dGrad = ctx.createRadialGradient(dx, dy, 0, dx, dy, dr);
      dGrad.addColorStop(0, `${style.colors[d % style.colors.length]}28`);
      dGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = dGrad;
      ctx.beginPath();
      ctx.ellipse(dx, dy, dr, dr * 0.7, t * 0.5 + d, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (sectionTransition || beatStrength > 0.65) {
    // Flash on transitions/big beats
    const flashAlpha = Math.min(60, Math.floor(beatStrength * 80));
    ctx.fillStyle = `${style.colors[2 % style.colors.length]}${flashAlpha.toString(16).padStart(2, '0')}`;
    ctx.fillRect(0, 0, w, h);
  }

  // Lyric subtitle glow zone
  if (lyricFlash > 0) {
    const lGrad = ctx.createLinearGradient(0, h * 0.78, 0, h);
    lGrad.addColorStop(0, 'transparent');
    lGrad.addColorStop(1, `${style.colors[0]}25`);
    ctx.fillStyle = lGrad;
    ctx.fillRect(0, h * 0.78, w, h * 0.22);
  }

  ctx.save();
  // ===== Camera motion =====
  const cameraOffsetX = Math.sin(frame * 0.025 * style.motionSpeed) * style.cameraMovement * (0.2 + beatStrength * 0.5);
  const cameraOffsetY = Math.cos(frame * 0.02 * style.motionSpeed) * style.cameraMovement * 0.15;
  const cameraScale = 1 + beatStrength * 0.04 + (sectionTransition ? 0.025 : 0);
  const cameraRotation = Math.sin(frame * 0.008 * style.motionSpeed) * 0.01 * style.cameraMovement / 20;
  ctx.translate(cx, cy);
  ctx.rotate(cameraRotation);
  ctx.scale(cameraScale, cameraScale);
  ctx.translate(-cx + cameraOffsetX, -cy + cameraOffsetY);

  // ===== Geometry layer (behind everything) =====
  if (style.shapeGeometry === 'rings') {
    for (let ring = 1; ring <= 5; ring++) {
      const radius = ring * 70 + bass * 60 + energy * 20;
      const alpha = Math.max(10, Math.floor((0.15 + beatStrength * 0.2 - ring * 0.02) * 255));
      ctx.strokeStyle = `${style.colors[ring % style.colors.length]}${alpha.toString(16).padStart(2, '0')}`;
      ctx.lineWidth = 1.5 + beatStrength * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      // Inner glow
      if (ring <= 2 && beatStrength > 0.4) {
        ctx.shadowColor = style.colors[ring % style.colors.length];
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
  } else if (style.shapeGeometry === 'grid') {
    const spacing = 60;
    ctx.lineWidth = 0.8;
    for (let x = 0; x <= w; x += spacing) {
      const waveX = Math.sin(t * 4 + x * 0.015) * 15 * energy;
      ctx.strokeStyle = `${style.colors[1 % style.colors.length]}${Math.floor(20 + bass * 30).toString(16).padStart(2, '0')}`;
      ctx.beginPath();
      ctx.moveTo(x + waveX, 0);
      ctx.lineTo(x - waveX * 0.5, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += spacing) {
      const waveY = Math.cos(t * 3.5 + y * 0.012) * 12 * energy;
      ctx.strokeStyle = `${style.colors[2 % style.colors.length]}${Math.floor(15 + mid * 25).toString(16).padStart(2, '0')}`;
      ctx.beginPath();
      ctx.moveTo(0, y + waveY);
      ctx.lineTo(w, y - waveY * 0.5);
      ctx.stroke();
    }
  } else if (style.shapeGeometry === 'shards') {
    for (let i = 0; i < 8; i++) {
      const angle = t * Math.PI * 1.5 + i * (Math.PI / 4);
      const radius = 100 + high * 180 + i * 25 + beatStrength * 50;
      const alpha = Math.floor((0.08 + beatStrength * 0.12) * 255);
      ctx.fillStyle = `${style.colors[i % style.colors.length]}${alpha.toString(16).padStart(2, '0')}`;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.lineTo(cx + Math.cos(angle + 0.15) * (radius * 0.55), cy + Math.sin(angle + 0.15) * (radius * 0.55));
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // Orbs with glow
    for (let i = 0; i < 5; i++) {
      const ox = cx + Math.sin(t * (i + 1) * 2.3 + i) * (160 + i * 30);
      const oy = cy + Math.cos(t * (i + 1) * 1.9 + i) * (100 + i * 20);
      const or = 30 + energy * 60 + bass * 30;
      const oGrad = ctx.createRadialGradient(ox, oy, 0, ox, oy, or);
      oGrad.addColorStop(0, `${style.colors[i % style.colors.length]}30`);
      oGrad.addColorStop(0.6, `${style.colors[i % style.colors.length]}10`);
      oGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = oGrad;
      ctx.beginPath();
      ctx.arc(ox, oy, or, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ===== Particles with trails and glow =====
  for (const p of particles) {
    p.life++;
    if (p.life > p.maxLife) {
      p.x = rng() * w;
      p.y = rng() * h;
      p.life = 0;
      p.color = style.colors[Math.floor(rng() * style.colors.length)];
    }

    p.vx += (rng() - 0.5) * (energy + beatStrength) * style.motionSpeed * 1.2;
    p.vy += (rng() - 0.5) * (energy + beatStrength) * style.motionSpeed * 1.2;
    if (sectionTransition) {
      p.vx += (cx - p.x) * 0.002;
      p.vy += (cy - p.y) * 0.002;
    }
    // Gentle gravity toward center on beats
    if (beatStrength > 0.6) {
      p.vx += (cx - p.x) * 0.0004 * beatStrength;
      p.vy += (cy - p.y) * 0.0004 * beatStrength;
    }
    p.vx *= 0.97;
    p.vy *= 0.97;
    const prevX = p.x;
    const prevY = p.y;
    p.x += p.vx;
    p.y += p.vy;

    if (p.x < 0) p.x += w;
    if (p.x > w) p.x -= w;
    if (p.y < 0) p.y += h;
    if (p.y > h) p.y -= h;

    const lifeRatio = 1 - p.life / p.maxLife;
    const alpha = Math.min(1, lifeRatio * (0.6 + energy * 0.5 + beatStrength * 0.4));
    const size = p.size * (1.2 + bass * 3.5 + beatStrength * 2.5);
    const alphaHex = Math.floor(alpha * 255).toString(16).padStart(2, '0');

    // Draw particle trail
    if (Math.abs(p.x - prevX) < w * 0.5 && Math.abs(p.y - prevY) < h * 0.5) {
      ctx.strokeStyle = p.color + Math.floor(alpha * 80).toString(16).padStart(2, '0');
      ctx.lineWidth = size * 0.4;
      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    // Draw particle with glow
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fillStyle = p.color + alphaHex;
    if (size > 3 && alpha > 0.3) {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = size * 3;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ===== Waveform visualization =====
  const barCount = 80;
  const barWidth = w / barCount;

  if (style.waveformStyle === 'bars') {
    for (let i = 0; i < barCount; i++) {
      const frac = i / barCount;
      const barEnergy = frac < 0.25 ? bass : frac < 0.65 ? mid : high;
      const barHeight = barEnergy * h * 0.45 + beatStrength * 15;
      const x = i * barWidth;
      const colorIdx = Math.floor(frac * style.colors.length);
      const barColor = style.colors[colorIdx % style.colors.length];

      // Mirrored bars (top and bottom from center)
      ctx.fillStyle = barColor;
      ctx.shadowColor = barColor;
      ctx.shadowBlur = style.glowIntensity * 12;
      ctx.fillRect(x + 1, cy - barHeight / 2, barWidth - 2, barHeight);

      // Reflection (dimmer)
      ctx.globalAlpha = 0.2;
      ctx.fillRect(x + 1, cy + barHeight / 2, barWidth - 2, barHeight * 0.3);
      ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 0;
  } else if (style.waveformStyle === 'circle') {
    const radius = Math.min(w, h) * 0.18;
    // Draw filled glow circle behind
    const circGlow = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 2.5);
    circGlow.addColorStop(0, `${style.colors[0]}15`);
    circGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = circGlow;
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 2.5 + energy * 3;
    ctx.shadowColor = style.colors[0];
    ctx.shadowBlur = style.glowIntensity * 25;
    ctx.strokeStyle = style.colors[0];
    ctx.beginPath();
    for (let i = 0; i <= barCount; i++) {
      const angle = (i / barCount) * Math.PI * 2;
      const frac = i / barCount;
      const barEnergy = frac < 0.3 ? bass : frac < 0.7 ? mid : high;
      const r = radius + barEnergy * radius * 2.2 + beatStrength * 20;
      const x = cx + Math.cos(angle + t * Math.PI * 2 * style.motionSpeed * 0.5) * r;
      const y = cy + Math.sin(angle + t * Math.PI * 2 * style.motionSpeed * 0.5) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // Inner circle
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    for (let i = 0; i <= barCount; i++) {
      const angle = (i / barCount) * Math.PI * 2;
      const frac = i / barCount;
      const barEnergy = frac < 0.3 ? bass : frac < 0.7 ? mid : high;
      const r = radius * 0.6 + barEnergy * radius * 1.0;
      const x = cx + Math.cos(angle - t * Math.PI * style.motionSpeed * 0.3) * r;
      const y = cy + Math.sin(angle - t * Math.PI * style.motionSpeed * 0.3) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = style.colors[1 % style.colors.length];
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  } else if (style.waveformStyle === 'line') {
    ctx.lineWidth = 2.5 + energy * 3;
    ctx.shadowColor = style.colors[0];
    ctx.shadowBlur = style.glowIntensity * 20;
    // Top line
    ctx.strokeStyle = style.colors[0];
    ctx.beginPath();
    for (let i = 0; i < barCount; i++) {
      const x = (i / barCount) * w;
      const frac = i / barCount;
      const barEnergy = frac < 0.3 ? bass : frac < 0.7 ? mid : high;
      const y = cy - 30 + Math.sin(i * 0.25 + frame * 0.04 * style.motionSpeed) * barEnergy * h * 0.28;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // Mirrored bottom line
    ctx.strokeStyle = style.colors[1 % style.colors.length];
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    for (let i = 0; i < barCount; i++) {
      const x = (i / barCount) * w;
      const frac = i / barCount;
      const barEnergy = frac < 0.3 ? bass : frac < 0.7 ? mid : high;
      const y = cy + 30 - Math.sin(i * 0.25 + frame * 0.04 * style.motionSpeed) * barEnergy * h * 0.2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  } else if (style.waveformStyle === 'spiral') {
    ctx.lineWidth = 2 + energy * 2;
    ctx.shadowColor = style.colors[0];
    ctx.shadowBlur = style.glowIntensity * 18;
    ctx.beginPath();
    for (let i = 0; i < 400; i++) {
      const angle = (i / 200) * Math.PI + t * Math.PI * 2 * style.motionSpeed * 0.4;
      const frac = i / 400;
      const barEnergy = frac < 0.3 ? bass : frac < 0.65 ? mid : high;
      const r = (i / 400) * Math.min(w, h) * 0.38 + barEnergy * 120 + beatStrength * 25;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else {
        const colorIdx = Math.floor(frac * style.colors.length);
        ctx.strokeStyle = style.colors[colorIdx % style.colors.length];
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ===== Central energy pulse with multiple layers =====
  const pulseRadius = 60 + bass * 180 + beatStrength * 80;
  const pulseGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseRadius);
  pulseGrad.addColorStop(0, style.colors[0] + '50');
  pulseGrad.addColorStop(0.3, style.colors[1 % style.colors.length] + '25');
  pulseGrad.addColorStop(0.7, style.colors[2 % style.colors.length] + '10');
  pulseGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = pulseGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
  ctx.fill();

  // Secondary pulse ring on beats
  if (beatStrength > 0.5) {
    const ringRadius = pulseRadius * 1.3;
    ctx.strokeStyle = `${style.colors[0]}${Math.floor(beatStrength * 60).toString(16).padStart(2, '0')}`;
    ctx.lineWidth = 2 + beatStrength * 3;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ===== Lyrics rendering with better styling =====
  if (activeLyricText) {
    const caption = activeLyricText.length > 72 ? `${activeLyricText.slice(0, 72)}...` : activeLyricText;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 34px "Segoe UI", system-ui, -apple-system, sans-serif';

    // Text shadow layers for depth
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(caption, cx, h - 65);

    // Subtle colored glow matching the style
    ctx.shadowColor = style.colors[0];
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 0;
    ctx.globalAlpha = 0.3;
    ctx.fillText(caption, cx, h - 65);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ===== Vignette overlay for cinematic depth =====
  const vignette = ctx.createRadialGradient(cx, cy, w * 0.25, cx, cy, w * 0.7);
  vignette.addColorStop(0, 'transparent');
  vignette.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  ctx.shadowBlur = 0;
  ctx.restore();
}
