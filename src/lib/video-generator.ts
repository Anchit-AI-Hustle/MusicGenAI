/**
 * Browser-based video generator using Canvas + MediaRecorder.
 * Creates audio-reactive visualizations synced to the final audio.
 * Uses GenerationDNA when provided for reproducible, unique visuals per track.
 */

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
    particleCount: 80,
    waveformStyle: 'bars',
    bgGradient: ['#0a0a0a', '#1a1a2e'],
    glowIntensity: 0.8,
    motionSpeed: 1.0,
    shapeGeometry: 'grid',
    cameraMovement: 14,
    backgroundAnimation: 'pulse',
  },
  'cyberpunk city': {
    name: 'Cyberpunk City',
    colors: ['#ff006e', '#00f5d4', '#fee440'],
    particleCount: 120,
    waveformStyle: 'line',
    bgGradient: ['#0d0221', '#150050'],
    glowIntensity: 1.2,
    motionSpeed: 0.8,
    shapeGeometry: 'shards',
    cameraMovement: 24,
    backgroundAnimation: 'drift',
  },
  'warehouse rave': {
    name: 'Warehouse Rave',
    colors: ['#ffffff', '#ff0000', '#ffaa00'],
    particleCount: 60,
    waveformStyle: 'bars',
    bgGradient: ['#000000', '#0a0a0a'],
    glowIntensity: 1.5,
    motionSpeed: 1.5,
    shapeGeometry: 'grid',
    cameraMovement: 10,
    backgroundAnimation: 'strobe',
  },
  'psychedelic abstract': {
    name: 'Psychedelic Abstract',
    colors: ['#ff00ff', '#00ffff', '#ffff00', '#ff6600'],
    particleCount: 200,
    waveformStyle: 'spiral',
    bgGradient: ['#1a0033', '#003366'],
    glowIntensity: 1.0,
    motionSpeed: 0.6,
    shapeGeometry: 'orbs',
    cameraMovement: 18,
    backgroundAnimation: 'drift',
  },
  'dark techno industrial': {
    name: 'Dark Techno Industrial',
    colors: ['#ff3300', '#cc0000', '#660000'],
    particleCount: 40,
    waveformStyle: 'bars',
    bgGradient: ['#000000', '#1a0000'],
    glowIntensity: 0.6,
    motionSpeed: 1.2,
    shapeGeometry: 'shards',
    cameraMovement: 12,
    backgroundAnimation: 'strobe',
  },
  'space cinematic': {
    name: 'Space Cinematic',
    colors: ['#4400ff', '#0088ff', '#00ffcc'],
    particleCount: 150,
    waveformStyle: 'circle',
    bgGradient: ['#000011', '#000033'],
    glowIntensity: 0.9,
    motionSpeed: 0.4,
    shapeGeometry: 'rings',
    cameraMovement: 20,
    backgroundAnimation: 'drift',
  },
  'neon synthwave': {
    name: 'Neon Synthwave',
    colors: ['#ff00ff', '#00ffff', '#ff6600'],
    particleCount: 100,
    waveformStyle: 'line',
    bgGradient: ['#0a001a', '#1a0033'],
    glowIntensity: 1.3,
    motionSpeed: 0.7,
    shapeGeometry: 'grid',
    cameraMovement: 16,
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
    let red = parseInt(match[1], 16);
    let green = parseInt(match[2], 16);
    let blue = parseInt(match[3], 16);
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

export interface VideoGenerationProgress {
  stage: string;
  progress: number;
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

    await ffmpeg.exec([
      '-i', inputName,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-profile:v', 'high',
      '-level', '4.0',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-movflags', '+faststart',
      '-y',
      outputName,
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
): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('This browser does not support video recording.');
  }

  const style = getStyleFromMetadata(genres, mood, videoStyleName, generationDNA);
  const rng = createSeededRng(getVideoSeedNumber(generationDNA) ^ 0x9e3779b9);

  onProgress?.({ stage: 'analyzing_beat_structure', progress: 0.02 });

  // Create offscreen canvas
  const width = 1280;
  const height = 720;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Decode audio for analysis
  const audioContext = new AudioContext();
  const audioResponse = await fetch(audioUrl);
  const audioArrayBuffer = await audioResponse.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(audioArrayBuffer);
  await audioContext.resume().catch(() => undefined);

  const fps = 30;
  const totalFrames = Math.ceil(durationSeconds * fps);
  const analysis = analyzeAudioForVisuals(audioBuffer, durationSeconds, onProgress);

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
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  let selectedMime = 'video/webm';
  for (const mime of mimeOptions) {
    if (MediaRecorder.isTypeSupported(mime)) {
      selectedMime = mime;
      break;
    }
  }

  const mediaRecorder = selectedMime
    ? new MediaRecorder(stream, {
        mimeType: selectedMime,
        videoBitsPerSecond: 4_000_000,
      })
    : new MediaRecorder(stream);

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  onProgress?.({ stage: 'rendering_video', progress: 0.25 });

  return new Promise<Blob>((resolve, reject) => {
    mediaRecorder.onstop = async () => {
      try {
        const recordedMime = mediaRecorder.mimeType || selectedMime;
        const recordedType = recordedMime.includes('mp4') ? 'video/mp4' : 'video/webm';
        const rawBlob = new Blob(chunks, { type: recordedType });
        const universalMp4Blob = await ensureUniversalMp4Blob(rawBlob, onProgress);
        resolve(universalMp4Blob);
      } catch (error) {
        reject(error);
      } finally {
        stream.getTracks().forEach((track) => track.stop());
        dest.stream.getTracks().forEach((track) => track.stop());
        audioContext.close().catch(() => undefined);
      }
    };
    mediaRecorder.onerror = (e) => reject(e);

    mediaRecorder.start();
    audioSource.start(0);

    let frame = 0;
    const renderFrame = () => {
      if (frame >= totalFrames) {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
        try {
          audioSource.stop();
        } catch {
          // BufferSource can only be stopped once.
        }
        onProgress?.({ stage: 'rendering_video', progress: 0.98 });
        return;
      }

      const t = frame / totalFrames;
      const energy = analysis.frameEnergies[frame] || 0;
      const bass = analysis.frameBass[frame] || 0;
      const mid = analysis.frameMid[frame] || 0;
      const high = analysis.frameHigh[frame] || 0;
      const beatStrength = analysis.beatStrengths[frame] || 0;
      const sectionTransition = analysis.transitionFlags[frame] || false;

      // Draw visualization based on style
      drawVisualization(
        ctx,
        style,
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
      );

      // Update progress every 30 frames
      if (frame % 30 === 0) {
        const vidProgress = 0.25 + (t * 0.65);
        onProgress?.({ stage: 'rendering_video', progress: vidProgress });
      }

      frame++;
      // Use requestAnimationFrame for smooth rendering, but throttle to target fps
      if (frame < totalFrames) {
        setTimeout(renderFrame, 1000 / fps);
      } else {
        renderFrame(); // final call
      }
    };

    renderFrame();
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
) {
  const cx = w / 2;
  const cy = h / 2;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, style.bgGradient[0]);
  grad.addColorStop(1, style.bgGradient[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  if (style.backgroundAnimation === 'pulse') {
    ctx.fillStyle = `${style.colors[0]}${Math.floor((0.08 + beatStrength * 0.15) * 255).toString(16).padStart(2, '0')}`;
    ctx.fillRect(0, 0, w, h);
  } else if (style.backgroundAnimation === 'drift') {
    ctx.fillStyle = `${style.colors[1 % style.colors.length]}22`;
    ctx.beginPath();
    ctx.ellipse(cx + Math.sin(t * Math.PI * 2) * w * 0.18, cy, w * 0.28, h * 0.22, t * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  } else if (sectionTransition || beatStrength > 0.72) {
    ctx.fillStyle = `${style.colors[2 % style.colors.length]}18`;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.save();
  const cameraOffsetX = Math.sin(frame * 0.03 * style.motionSpeed) * style.cameraMovement * (0.15 + beatStrength * 0.6);
  const cameraOffsetY = Math.cos(frame * 0.024 * style.motionSpeed) * style.cameraMovement * 0.12;
  const cameraScale = 1 + beatStrength * 0.03 + (sectionTransition ? 0.02 : 0);
  ctx.translate(cameraOffsetX, cameraOffsetY);
  ctx.translate(cx, cy);
  ctx.scale(cameraScale, cameraScale);
  ctx.translate(-cx, -cy);

  if (style.shapeGeometry === 'rings') {
    ctx.strokeStyle = `${style.colors[0]}33`;
    ctx.lineWidth = 2;
    for (let ring = 1; ring <= 3; ring++) {
      ctx.beginPath();
      ctx.arc(cx, cy, ring * 90 + bass * 55, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (style.shapeGeometry === 'grid') {
    ctx.strokeStyle = `${style.colors[1 % style.colors.length]}20`;
    for (let x = 0; x <= w; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(t * 6 + x * 0.01) * 10 * energy, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  } else if (style.shapeGeometry === 'shards') {
    ctx.fillStyle = `${style.colors[2 % style.colors.length]}18`;
    for (let i = 0; i < 6; i++) {
      const angle = t * Math.PI * 2 + i * (Math.PI / 3);
      const radius = 120 + high * 140 + i * 30;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.lineTo(cx + Math.cos(angle + 0.18) * (radius * 0.58), cy + Math.sin(angle + 0.18) * (radius * 0.58));
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.fillStyle = `${style.colors[0]}10`;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(
        cx + Math.sin(t * (i + 1) * 3.1) * 180,
        cy + Math.cos(t * (i + 1) * 2.7) * 120,
        40 + energy * 70,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  // Draw particles
  for (const p of particles) {
    p.life++;
    if (p.life > p.maxLife) {
      p.x = rng() * w;
      p.y = rng() * h;
      p.life = 0;
    }

    p.vx += (rng() - 0.5) * (energy + beatStrength) * style.motionSpeed;
    p.vy += (rng() - 0.5) * (energy + beatStrength) * style.motionSpeed;
    if (sectionTransition) {
      p.vx += (p.x - cx) * -0.0009;
      p.vy += (p.y - cy) * -0.0009;
    }
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.x += p.vx;
    p.y += p.vy;

    // Wrap around
    if (p.x < 0) p.x += w;
    if (p.x > w) p.x -= w;
    if (p.y < 0) p.y += h;
    if (p.y > h) p.y -= h;

    const alpha = Math.min(1, (1 - p.life / p.maxLife) * (0.5 + energy + beatStrength));
    const size = p.size * (1 + bass * 3 + beatStrength * 2);
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fillStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
    ctx.fill();
  }

  // Draw waveform
  ctx.lineWidth = 2 + energy * 4;
  ctx.strokeStyle = style.colors[0];
  ctx.shadowColor = style.colors[0];
  ctx.shadowBlur = style.glowIntensity * 20 * energy;

  const barCount = 64;
  const barWidth = w / barCount;

  if (style.waveformStyle === 'bars') {
    for (let i = 0; i < barCount; i++) {
      const barEnergy = (i < barCount * 0.3 ? bass : i < barCount * 0.7 ? mid : high);
      const barHeight = barEnergy * h * 0.4;
      const x = i * barWidth;
      const colorIdx = Math.floor(i / barCount * style.colors.length);
      ctx.fillStyle = style.colors[colorIdx % style.colors.length];
      ctx.fillRect(x + 2, cy - barHeight / 2, barWidth - 4, barHeight);
    }
  } else if (style.waveformStyle === 'circle') {
    const radius = Math.min(w, h) * 0.2;
    ctx.beginPath();
    for (let i = 0; i <= barCount; i++) {
      const angle = (i / barCount) * Math.PI * 2;
      const barEnergy = (i < barCount * 0.3 ? bass : i < barCount * 0.7 ? mid : high);
      const r = radius + barEnergy * radius * 2;
      const x = cx + Math.cos(angle + t * Math.PI * 2 * style.motionSpeed) * r;
      const y = cy + Math.sin(angle + t * Math.PI * 2 * style.motionSpeed) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  } else if (style.waveformStyle === 'line') {
    ctx.beginPath();
    for (let i = 0; i < barCount; i++) {
      const x = (i / barCount) * w;
      const barEnergy = (i < barCount * 0.3 ? bass : i < barCount * 0.7 ? mid : high);
      const y = cy + Math.sin(i * 0.3 + frame * 0.05 * style.motionSpeed) * barEnergy * h * 0.3;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else if (style.waveformStyle === 'spiral') {
    ctx.beginPath();
    for (let i = 0; i < 360; i++) {
      const angle = (i / 180) * Math.PI + t * Math.PI * 2 * style.motionSpeed;
      const barEnergy = (i < 120 ? bass : i < 240 ? mid : high);
      const r = (i / 360) * Math.min(w, h) * 0.35 + barEnergy * 100;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      const colorIdx = Math.floor(i / 360 * style.colors.length);
      ctx.strokeStyle = style.colors[colorIdx % style.colors.length];
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Central energy pulse
  const pulseRadius = 50 + bass * 150 + beatStrength * 60;
  const pulseGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseRadius);
  pulseGrad.addColorStop(0, style.colors[0] + '40');
  pulseGrad.addColorStop(0.5, style.colors[1 % style.colors.length] + '20');
  pulseGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = pulseGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
  ctx.fill();

  // Reset shadow
  ctx.shadowBlur = 0;
  ctx.restore();
}
