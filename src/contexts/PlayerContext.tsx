/**
 * PlayerContext — Isolated playback state manager.
 * 
 * CRITICAL: This context stores ONLY playback-related values.
 * Generation progress (MusicContext) must never trigger player re-renders.
 * 
 * Synchronized with global AudioEngine singleton for cross-view continuity.
 */

import React, { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo, ReactNode } from 'react';
import { audioEngine, AudioState } from '@/lib/audio-engine';

export type PlaybackMode = 'audio' | 'video' | 'visualizer';

export interface PlayerLyricCue {
  text: string;
  startTime: number;
  endTime: number;
  sectionName?: string;
}

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
  lyrics?: string;
  lyricCues?: PlayerLyricCue[];
}

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
  setIsImmersive: (immersive: boolean) => void;
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
  isImmersive: boolean;
  audioElement: HTMLAudioElement | null;
}

interface PlayerTimeState {
  currentTime: number;
  duration: number;
}

const PlayerStateContext = createContext<(PlayerState & PlayerActions & PlayerRefs) | undefined>(undefined);
const PlayerTimeContext = createContext<PlayerTimeState | undefined>(undefined);

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(audioEngine.audioInstance);
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
  const [isImmersive, setIsImmersive] = useState(false);

  const [timeState, setTimeState] = useState<PlayerTimeState>({ currentTime: 0, duration: 0 });
  const timeRafRef = useRef<number>(0);
  const lastTimeFlushRef = useRef(0);

  useEffect(() => { queueRef.current = queue; }, [queue]);

  // Sync state with global AudioEngine
  useEffect(() => {
    const handleStateChange = (state: AudioState) => {
      setIsPlaying(state.isPlaying);
      setVolumeState(state.volume);
      setPlaybackSpeedState(state.playbackRate);

      const ct = state.currentTime;
      const dur = state.duration;
      currentTimeRef.current = ct;
      durationRef.current = dur;

      // Throttle time updates to 4Hz for React state to prevent render storms
      const now = performance.now();
      if (now - lastTimeFlushRef.current > 250) {
        lastTimeFlushRef.current = now;
        setTimeState({ currentTime: ct, duration: dur });
      }
    };

    const unsubscribe = audioEngine.subscribe(handleStateChange);
    return () => unsubscribe();
  }, []);

  const loadAndPlay = useCallback((track: PlayerTrack) => {
    setCurrentTrack(track);
    setPlaybackModeState(track.videoUrl ? 'video' : 'audio');
    audioEngine.play(track.audioUrl, track.id);
  }, []);

  const play = useCallback((track?: PlayerTrack) => {
    if (track) {
      if (currentTrack?.id === track.id) {
        audioEngine.play();
        return;
      }
      const q = queueRef.current;
      const idx = q.findIndex(t => t.id === track.id);
      if (idx >= 0) {
        setQueueIndex(idx);
      } else {
        setQueueState(prev => [...prev, track]);
        setQueueIndex(q.length);
      }
      loadAndPlay(track);
    } else {
      audioEngine.play();
    }
  }, [currentTrack?.id, loadAndPlay]);

  const pause = useCallback(() => { audioEngine.pause(); }, []);

  const togglePlay = useCallback(() => {
    const state = audioEngine.getState();
    if (state.isPlaying) audioEngine.pause();
    else audioEngine.play();
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
    const state = audioEngine.getState();
    if (state.currentTime > 3) {
      audioEngine.seek(0);
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
    audioEngine.seek(time);
    currentTimeRef.current = time;
    if (videoRef.current) videoRef.current.currentTime = time;
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    setIsMuted(false);
    audioEngine.setVolume(v);
  }, []);

  const setPlaybackMode = useCallback((mode: PlaybackMode) => setPlaybackModeState(mode), []);

  const setPlaybackSpeed = useCallback((speed: number) => {
    setPlaybackSpeedState(speed);
    audioEngine.setPlaybackRate(speed);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const nextMute = !prev;
      audioEngine.setVolume(nextMute ? 0 : volume);
      return nextMute;
    });
  }, [volume]);

  const addToQueue = useCallback((track: PlayerTrack) => {
    setQueueState(prev => prev.find(t => t.id === track.id) ? prev : [...prev, track]);
  }, []);

  const setQueue = useCallback((tracks: PlayerTrack[], startIndex = 0) => {
    setQueueState(tracks);
    setQueueIndex(startIndex);
    if (tracks.length > startIndex) loadAndPlay(tracks[startIndex]);
  }, [loadAndPlay]);

  const clearQueue = useCallback(() => {
    audioEngine.pause();
    setQueueState([]);
    setQueueIndex(0);
    setCurrentTrack(null);
    setIsPlaying(false);
    setIsExpanded(false);
    setIsImmersive(false);
    setTimeState({ currentTime: 0, duration: 0 });
  }, []);

  const stateValue = useMemo(() => ({
    currentTrack, queue, queueIndex, isPlaying, volume, playbackMode,
    playbackSpeed, isMuted, isExpanded, isImmersive,
    audioElement: audioRef.current,
    audioRef, videoRef, currentTimeRef, durationRef,
    play, pause, togglePlay, next, previous, seek,
    setVolume, setPlaybackMode, setPlaybackSpeed, toggleMute,
    addToQueue, setQueue, clearQueue, setIsExpanded, setIsImmersive,
  }), [
    currentTrack, queue, queueIndex, isPlaying, volume, playbackMode,
    playbackSpeed, isMuted, isExpanded, isImmersive,
    play, pause, togglePlay, next, previous, seek,
    setVolume, setPlaybackMode, setPlaybackSpeed, toggleMute,
    addToQueue, setQueue, clearQueue, setIsExpanded, setIsImmersive,
  ]);

  return (
    <PlayerStateContext.Provider value={stateValue}>
      <PlayerTimeContext.Provider value={timeState}>
        {children}
      </PlayerTimeContext.Provider>
    </PlayerStateContext.Provider>
  );
};

export const usePlayer = () => {
  const ctx = useContext(PlayerStateContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
};

export const usePlayerTime = () => {
  const ctx = useContext(PlayerTimeContext);
  if (!ctx) throw new Error('usePlayerTime must be used within PlayerProvider');
  return ctx;
};
