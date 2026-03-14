/**
 * MuseVibeStudio Global Audio Engine
 * Singleton class to manage a single HTMLAudioElement across the entire application.
 * Ensures playback continuity when switching between mini-player and expanded player.
 */

export interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  currentTrackId: string | null;
}

class AudioEngine {
  private static instance: AudioEngine;
  private audio: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private listeners: Set<(state: AudioState) => void> = new Set();

  private constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';

    // Sync state on audio events
    this.audio.addEventListener('play', () => {
      this.ensureContext();
      this.notify();
    });
    this.audio.addEventListener('pause', () => this.notify());
    this.audio.addEventListener('timeupdate', () => this.notify());
    this.audio.addEventListener('durationchange', () => this.notify());
    this.audio.addEventListener('volumechange', () => this.notify());
    this.audio.addEventListener('ratechange', () => this.notify());
    this.audio.addEventListener('ended', () => this.notify());
  }

  private ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }

    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      this.source = this.ctx.createMediaElementSource(this.audio);
      this.source.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    } catch (e) {
      console.warn('[AudioEngine] Could not initialize web audio context:', e);
    }
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  public get audioInstance(): HTMLAudioElement {
    return this.audio;
  }

  public getAnalyser(): AnalyserNode | null {
    this.ensureContext();
    return this.analyser;
  }

  public getByteFrequencyData(dataArray: Uint8Array) {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(dataArray as any);
      return true;
    }
    return false;
  }

  public getState(): AudioState {
    return {
      isPlaying: !this.audio.paused,
      currentTime: this.audio.currentTime,
      duration: this.audio.duration || 0,
      volume: this.audio.volume,
      playbackRate: this.audio.playbackRate,
      currentTrackId: this.audio.dataset.trackId || null,
    };
  }

  public subscribe(listener: (state: AudioState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach(l => l(state));
  }

  public play(url?: string, trackId?: string) {
    if (url) {
      if (this.audio.src !== url) {
        this.audio.src = url;
        if (trackId) this.audio.dataset.trackId = trackId;
      }
    }
    this.audio.play().catch(console.warn);
  }

  public pause() {
    this.audio.pause();
  }

  public seek(time: number) {
    if (isFinite(time)) {
      this.audio.currentTime = time;
    }
  }

  public setVolume(volume: number) {
    this.audio.volume = Math.max(0, Math.min(1, volume));
  }

  public setPlaybackRate(rate: number) {
    this.audio.playbackRate = rate;
  }
}

export const audioEngine = AudioEngine.getInstance();
export default audioEngine;
