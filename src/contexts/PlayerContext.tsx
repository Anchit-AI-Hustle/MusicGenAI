/**
 * PlayerContext — Isolated playback state manager.
 * 
 * CRITICAL: This context stores ONLY playback-related values.
 * Generation progress (MusicContext) must never trigger player re-renders.
 * 
 * Time updates are stored in a ref and flushed at lower frequency
 * to avoid excessive React re-renders from high-frequency timeupdate events.
 */

import React, { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo, ReactNode } from 'react';

export type PlaybackMode = 'audio' | 'video' | 'visualizer';

export interface PlayerTrack {
  id: string;
  title: string;
  artist?: string;
  audioUrl: string;
  videoUrl?: string;
  duration: number;
  coverArt?: string;
  creationId?: string;
  creationType?: 'song' | 'album';
  genres?: string[];
}

// Stable refs for high-frequency values (currentTime) to avoid re-render storms
interface PlayerRefs {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  currentTimeRef: React.MutableRefObject<number>;
  durationRef: React.MutableRefObject<number>;
}

interface PlayerActions {
  play: (track?: PlayerTrack) => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (v: number) => void;
  setPlaybackMode: (mode: PlaybackMode) => void;
  setPlaybackSpeed: (speed: number) => void;
  toggleMute: () => void;
  addToQueue: (track: PlayerTrack) => void;
  setQueue: (tracks: PlayerTrack[], startIndex?: number) => void;
  clearQueue: () => void;
  setIsExpanded: (expanded: boolean) => void;
}

interface PlayerState {
  currentTrack: PlayerTrack | null;
  queue: PlayerTrack[];
  queueIndex: number;
  isPlaying: boolean;
  volume: number;
  playbackMode: PlaybackMode;
  playbackSpeed: number;
  isMuted: boolean;
  isExpanded: boolean;
}

// Separate context for time (high-frequency updates) to isolate renders
interface PlayerTimeState {
  currentTime: number;
  duration: number;
}

const PlayerStateContext = createContext<(PlayerState & PlayerActions & PlayerRefs) | undefined>(undefined);
const PlayerTimeContext = createContext<PlayerTimeState | undefined>(undefined);

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const queueRef = useRef<PlayerTrack[]>([]);

  const [currentTrack, setCurrentTrack] = useState<PlayerTrack | null>(null);
  const [queue, setQueueState] = useState<PlayerTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [playbackMode, setPlaybackModeState] = useState<PlaybackMode>('audio');
  const [playbackSpeed, setPlaybackSpeedState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Time state — updated at throttled rate (4Hz instead of 60Hz)
  const [timeState, setTimeState] = useState<PlayerTimeState>({ currentTime: 0, duration: 0 });
  const timeRafRef = useRef<number>(0);
  const lastTimeFlushRef = useRef(0);

  // Keep queue ref in sync
  useEffect(() => { queueRef.current = queue; }, [queue]);

  // Create audio element once — no dependency on queue to avoid re-attaching listeners
  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = 'metadata';
      audioRef.current = audio;
    }
    const audio = audioRef.current;

    const flushTime = () => {
      const now = performance.now();
      if (now - lastTimeFlushRef.current > 250) { // 4Hz
        lastTimeFlushRef.current = now;
        const ct = audio.currentTime;
        const dur = audio.duration || 0;
        currentTimeRef.current = ct;
        durationRef.current = dur;
        setTimeState({ currentTime: ct, duration: dur });
      }
      timeRafRef.current = requestAnimationFrame(flushTime);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      // Auto-advance using ref to avoid stale closure
      setQueueIndex(prev => {
        const nextIdx = prev + 1;
        const q = queueRef.current;
        if (nextIdx < q.length) {
          const nextTrack = q[nextIdx];
          setCurrentTrack(nextTrack);
          if (nextTrack.videoUrl) setPlaybackModeState('video');
          else setPlaybackModeState('audio');
          setTimeout(() => {
            if (audioRef.current) {
              audioRef.current.src = nextTrack.audioUrl;
              audioRef.current.play().then(() => setIsPlaying(true)).catch(console.warn);
            }
          }, 50);
          return nextIdx;
        }
        return prev;
      });
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    timeRafRef.current = requestAnimationFrame(flushTime);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      cancelAnimationFrame(timeRafRef.current);
    };
  }, []); // Empty deps — never re-attach

  // Sync volume imperatively
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // Sync playback speed imperatively
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  const loadAndPlay = useCallback((track: PlayerTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTrack(track);
    setPlaybackModeState(track.videoUrl ? 'video' : 'audio');
    audio.src = track.audioUrl;
    audio.load();
    audio.play().then(() => setIsPlaying(true)).catch(console.warn);
  }, []);

  const play = useCallback((track?: PlayerTrack) => {
    if (track) {
      const q = queueRef.current;
      const idx = q.findIndex(t => t.id === track.id);
      if (idx >= 0) {
        setQueueIndex(idx);
      } else {
        setQueueState(prev => [...prev, track]);
        setQueueIndex(q.length);
      }
      loadAndPlay(track);
    } else if (audioRef.current) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.warn);
    }
  }, [loadAndPlay]);

  const pause = useCallback(() => { audioRef.current?.pause(); }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(console.warn);
    else audio.pause();
  }, []);

  const next = useCallback(() => {
    const q = queueRef.current;
    const nextIdx = queueIndex + 1;
    if (nextIdx < q.length) {
      setQueueIndex(nextIdx);
      loadAndPlay(q[nextIdx]);
    }
  }, [queueIndex, loadAndPlay]);

  const previous = useCallback(() => {
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    const q = queueRef.current;
    const prevIdx = queueIndex - 1;
    if (prevIdx >= 0) {
      setQueueIndex(prevIdx);
      loadAndPlay(q[prevIdx]);
    }
  }, [queueIndex, loadAndPlay]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      currentTimeRef.current = time;
      // Sync video ref directly — no state update
      if (videoRef.current) videoRef.current.currentTime = time;
    }
  }, []);

  const setVolume = useCallback((v: number) => { setVolumeState(v); setIsMuted(false); }, []);
  const setPlaybackMode = useCallback((mode: PlaybackMode) => setPlaybackModeState(mode), []);
  const setPlaybackSpeed = useCallback((speed: number) => setPlaybackSpeedState(speed), []);
  const toggleMute = useCallback(() => setIsMuted(prev => !prev), []);

  const addToQueue = useCallback((track: PlayerTrack) => {
    setQueueState(prev => prev.find(t => t.id === track.id) ? prev : [...prev, track]);
  }, []);

  const setQueue = useCallback((tracks: PlayerTrack[], startIndex = 0) => {
    setQueueState(tracks);
    setQueueIndex(startIndex);
    if (tracks.length > startIndex) loadAndPlay(tracks[startIndex]);
  }, [loadAndPlay]);

  const clearQueue = useCallback(() => {
    audioRef.current?.pause();
    setQueueState([]);
    setQueueIndex(0);
    setCurrentTrack(null);
    setIsPlaying(false);
    setTimeState({ currentTime: 0, duration: 0 });
  }, []);

  const stateValue = useMemo(() => ({
    currentTrack, queue, queueIndex, isPlaying, volume, playbackMode,
    playbackSpeed, isMuted, isExpanded,
    audioRef, videoRef, currentTimeRef, durationRef,
    play, pause, togglePlay, next, previous, seek,
    setVolume, setPlaybackMode, setPlaybackSpeed, toggleMute,
    addToQueue, setQueue, clearQueue, setIsExpanded,
  }), [
    currentTrack, queue, queueIndex, isPlaying, volume, playbackMode,
    playbackSpeed, isMuted, isExpanded,
    play, pause, togglePlay, next, previous, seek,
    setVolume, setPlaybackMode, setPlaybackSpeed, toggleMute,
    addToQueue, setQueue, clearQueue,
  ]);

  return (
    <PlayerStateContext.Provider value={stateValue}>
      <PlayerTimeContext.Provider value={timeState}>
        {children}
      </PlayerTimeContext.Provider>
    </PlayerStateContext.Provider>
  );
};

/** Use for controls, track info, queue — does NOT re-render on time ticks */
export const usePlayer = () => {
  const ctx = useContext(PlayerStateContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
};

/** Use ONLY in components that display currentTime/duration (seek bar, time labels) */
export const usePlayerTime = () => {
  const ctx = useContext(PlayerTimeContext);
  if (!ctx) throw new Error('usePlayerTime must be used within PlayerProvider');
  return ctx;
};
