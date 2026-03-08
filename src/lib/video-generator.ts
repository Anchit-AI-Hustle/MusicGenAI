/**
 * Browser-based video generator using Canvas + MediaRecorder.
 * Creates audio-reactive visualizations synced to the final audio.
 */

export interface VideoStyle {
  name: string;
  colors: string[];
  particleCount: number;
  waveformStyle: 'bars' | 'circle' | 'line' | 'spiral';
  bgGradient: [string, string];
  glowIntensity: number;
  motionSpeed: number;
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
  },
  'cyberpunk city': {
    name: 'Cyberpunk City',
    colors: ['#ff006e', '#00f5d4', '#fee440'],
    particleCount: 120,
    waveformStyle: 'line',
    bgGradient: ['#0d0221', '#150050'],
    glowIntensity: 1.2,
    motionSpeed: 0.8,
  },
  'warehouse rave': {
    name: 'Warehouse Rave',
    colors: ['#ffffff', '#ff0000', '#ffaa00'],
    particleCount: 60,
    waveformStyle: 'bars',
    bgGradient: ['#000000', '#0a0a0a'],
    glowIntensity: 1.5,
    motionSpeed: 1.5,
  },
  'psychedelic abstract': {
    name: 'Psychedelic Abstract',
    colors: ['#ff00ff', '#00ffff', '#ffff00', '#ff6600'],
    particleCount: 200,
    waveformStyle: 'spiral',
    bgGradient: ['#1a0033', '#003366'],
    glowIntensity: 1.0,
    motionSpeed: 0.6,
  },
  'dark techno industrial': {
    name: 'Dark Techno Industrial',
    colors: ['#ff3300', '#cc0000', '#660000'],
    particleCount: 40,
    waveformStyle: 'bars',
    bgGradient: ['#000000', '#1a0000'],
    glowIntensity: 0.6,
    motionSpeed: 1.2,
  },
  'space cinematic': {
    name: 'Space Cinematic',
    colors: ['#4400ff', '#0088ff', '#00ffcc'],
    particleCount: 150,
    waveformStyle: 'circle',
    bgGradient: ['#000011', '#000033'],
    glowIntensity: 0.9,
    motionSpeed: 0.4,
  },
  'neon synthwave': {
    name: 'Neon Synthwave',
    colors: ['#ff00ff', '#00ffff', '#ff6600'],
    particleCount: 100,
    waveformStyle: 'line',
    bgGradient: ['#0a001a', '#1a0033'],
    glowIntensity: 1.3,
    motionSpeed: 0.7,
  },
};

function getStyleFromMetadata(genres: string[], mood: string, videoStyleName?: string): VideoStyle {
  // Direct match
  if (videoStyleName) {
    const key = videoStyleName.toLowerCase();
    for (const [k, v] of Object.entries(VIDEO_STYLES)) {
      if (key.includes(k) || k.includes(key)) return v;
    }
  }

  // Genre-based inference
  const genreStr = genres.join(' ').toLowerCase();
  if (genreStr.includes('techno') || genreStr.includes('industrial')) return VIDEO_STYLES['dark techno industrial'];
  if (genreStr.includes('synthwave') || genreStr.includes('retro')) return VIDEO_STYLES['neon synthwave'];
  if (genreStr.includes('psych') || genreStr.includes('trance')) return VIDEO_STYLES['psychedelic abstract'];
  if (genreStr.includes('ambient') || genreStr.includes('cinematic')) return VIDEO_STYLES['space cinematic'];

  // Mood-based
  const moodStr = (mood || '').toLowerCase();
  if (moodStr.includes('dark') || moodStr.includes('aggressive')) return VIDEO_STYLES['dark techno industrial'];
  if (moodStr.includes('euphori') || moodStr.includes('bright')) return VIDEO_STYLES['neon synthwave'];

  return VIDEO_STYLES['music visualizer'];
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; color: string; life: number; maxLife: number;
}

export interface VideoGenerationProgress {
  stage: string;
  progress: number;
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
  const uniqueId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

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

  return enqueueTranscodeJob(() => transcodeToUniversalMp4Blob(videoBlob, onProgress));
}

/**
 * Generate a video from an audio blob using Canvas-based visualization + MediaRecorder.
 */
export async function generateVideoFromAudio(
  audioUrl: string,
  durationSeconds: number,
  genres: string[],
  mood: string,
  videoStyleName?: string,
  onProgress?: (p: VideoGenerationProgress) => void,
): Promise<Blob> {
  const style = getStyleFromMetadata(genres, mood, videoStyleName);

  onProgress?.({ stage: 'generating_video', progress: 0.02 });

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

  onProgress?.({ stage: 'generating_video', progress: 0.10 });

  // Extract energy envelope from audio
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const fps = 30;
  const totalFrames = Math.ceil(durationSeconds * fps);
  const samplesPerFrame = Math.floor(sampleRate / fps);

  // Pre-compute per-frame energy and frequency bands
  const frameEnergies: number[] = [];
  const frameBass: number[] = [];
  const frameMid: number[] = [];
  const frameHigh: number[] = [];

  for (let f = 0; f < totalFrames; f++) {
    const start = f * samplesPerFrame;
    const end = Math.min(start + samplesPerFrame, channelData.length);
    let energy = 0;
    let bass = 0;
    let mid = 0;
    let high = 0;
    const count = end - start;

    for (let i = start; i < end; i++) {
      const val = Math.abs(channelData[i] || 0);
      energy += val;
      // Simple frequency band approximation
      const pos = (i - start) / count;
      if (pos < 0.2) bass += val;
      else if (pos < 0.6) mid += val;
      else high += val;
    }

    frameEnergies.push(count > 0 ? energy / count : 0);
    frameBass.push(count > 0 ? bass / (count * 0.2) : 0);
    frameMid.push(count > 0 ? mid / (count * 0.4) : 0);
    frameHigh.push(count > 0 ? high / (count * 0.4) : 0);
  }

  // Normalize
  const maxEnergy = Math.max(...frameEnergies, 0.001);
  const maxBass = Math.max(...frameBass, 0.001);
  const maxMid = Math.max(...frameMid, 0.001);
  const maxHigh = Math.max(...frameHigh, 0.001);

  onProgress?.({ stage: 'generating_video', progress: 0.20 });

  // Initialize particles
  const particles: Particle[] = [];
  for (let i = 0; i < style.particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      size: Math.random() * 3 + 1,
      color: style.colors[Math.floor(Math.random() * style.colors.length)],
      life: Math.random() * 100,
      maxLife: 100 + Math.random() * 200,
    });
  }

  // Setup MediaRecorder
  const stream = canvas.captureStream(fps);

  // Add audio track
  const audioSource = audioContext.createBufferSource();
  audioSource.buffer = audioBuffer;
  const dest = audioContext.createMediaStreamDestination();
  audioSource.connect(dest);
  audioSource.connect(audioContext.destination);

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

  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: selectedMime,
    videoBitsPerSecond: 4_000_000,
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  onProgress?.({ stage: 'encoding_video', progress: 0.25 });

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
        audioContext.close().catch(() => undefined);
      }
    };
    mediaRecorder.onerror = (e) => reject(e);

    mediaRecorder.start();
    audioSource.start(0);

    let frame = 0;
    const renderFrame = () => {
      if (frame >= totalFrames) {
        mediaRecorder.stop();
        audioSource.stop();
        onProgress?.({ stage: 'encoding_video', progress: 0.95 });
        return;
      }

      const t = frame / totalFrames;
      const energy = frameEnergies[frame] / maxEnergy;
      const bass = frameBass[frame] / maxBass;
      const mid = frameMid[frame] / maxMid;
      const high = frameHigh[frame] / maxHigh;

      // Draw background
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, style.bgGradient[0]);
      grad.addColorStop(1, style.bgGradient[1]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Draw visualization based on style
      drawVisualization(ctx, style, width, height, t, energy, bass, mid, high, particles, frame);

      // Update progress every 30 frames
      if (frame % 30 === 0) {
        const vidProgress = 0.25 + (t * 0.65);
        onProgress?.({ stage: 'encoding_video', progress: vidProgress });
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
  particles: Particle[],
  frame: number,
) {
  const cx = w / 2;
  const cy = h / 2;

  // Draw particles
  for (const p of particles) {
    p.life++;
    if (p.life > p.maxLife) {
      p.x = Math.random() * w;
      p.y = Math.random() * h;
      p.life = 0;
    }

    p.vx += (Math.random() - 0.5) * energy * style.motionSpeed;
    p.vy += (Math.random() - 0.5) * energy * style.motionSpeed;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.x += p.vx;
    p.y += p.vy;

    // Wrap around
    if (p.x < 0) p.x += w;
    if (p.x > w) p.x -= w;
    if (p.y < 0) p.y += h;
    if (p.y > h) p.y -= h;

    const alpha = Math.min(1, (1 - p.life / p.maxLife) * energy * 2);
    const size = p.size * (1 + bass * 3);
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
  const pulseRadius = 50 + bass * 150;
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
}
