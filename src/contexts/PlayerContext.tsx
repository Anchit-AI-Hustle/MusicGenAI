import React, { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';

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

interface PlayerState {
  currentTrack: PlayerTrack | null;
  queue: PlayerTrack[];
  queueIndex: number;
  isPlaying: boolean;
  volume: number;
  playbackMode: PlaybackMode;
  playbackSpeed: number;
  currentTime: number;
  duration: number;
  isMuted: boolean;
  isExpanded: boolean; // mobile expand
}

interface PlayerContextType extends PlayerState {
  audioRef: React.RefObject<HTMLAudioElement | null>;
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

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<PlayerTrack | null>(null);
  const [queue, setQueueState] = useState<PlayerTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [playbackMode, setPlaybackModeState] = useState<PlaybackMode>('audio');
  const [playbackSpeed, setPlaybackSpeedState] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Create audio element once
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'metadata';
    }
    const audio = audioRef.current;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      setIsPlaying(false);
      // Auto-advance queue
      setQueueIndex(prev => {
        const nextIdx = prev + 1;
        if (nextIdx < queue.length) {
          const nextTrack = queue[nextIdx];
          setCurrentTrack(nextTrack);
          if (nextTrack.videoUrl) setPlaybackModeState('video');
          setTimeout(() => {
            if (audioRef.current) {
              audioRef.current.src = nextTrack.audioUrl;
              audioRef.current.play().then(() => setIsPlaying(true)).catch(console.warn);
            }
          }, 100);
          return nextIdx;
        }
        return prev;
      });
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [queue]);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Sync playback speed
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  const loadAndPlay = useCallback((track: PlayerTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTrack(track);
    if (track.videoUrl) setPlaybackModeState('video');
    else setPlaybackModeState('audio');
    audio.src = track.audioUrl;
    audio.load();
    audio.play().then(() => setIsPlaying(true)).catch(console.warn);
  }, []);

  const play = useCallback((track?: PlayerTrack) => {
    if (track) {
      // Find in queue or add
      const idx = queue.findIndex(t => t.id === track.id);
      if (idx >= 0) {
        setQueueIndex(idx);
      } else {
        setQueueState(prev => [...prev, track]);
        setQueueIndex(queue.length);
      }
      loadAndPlay(track);
    } else if (currentTrack && audioRef.current) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.warn);
    }
  }, [currentTrack, queue, loadAndPlay]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else if (currentTrack) play();
  }, [isPlaying, currentTrack, play, pause]);

  const next = useCallback(() => {
    const nextIdx = queueIndex + 1;
    if (nextIdx < queue.length) {
      setQueueIndex(nextIdx);
      loadAndPlay(queue[nextIdx]);
    }
  }, [queueIndex, queue, loadAndPlay]);

  const previous = useCallback(() => {
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    const prevIdx = queueIndex - 1;
    if (prevIdx >= 0) {
      setQueueIndex(prevIdx);
      loadAndPlay(queue[prevIdx]);
    }
  }, [queueIndex, queue, loadAndPlay]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    setIsMuted(false);
  }, []);

  const setPlaybackMode = useCallback((mode: PlaybackMode) => setPlaybackModeState(mode), []);
  const setPlaybackSpeed = useCallback((speed: number) => setPlaybackSpeedState(speed), []);
  const toggleMute = useCallback(() => setIsMuted(prev => !prev), []);

  const addToQueue = useCallback((track: PlayerTrack) => {
    setQueueState(prev => {
      if (prev.find(t => t.id === track.id)) return prev;
      return [...prev, track];
    });
  }, []);

  const setQueue = useCallback((tracks: PlayerTrack[], startIndex = 0) => {
    setQueueState(tracks);
    setQueueIndex(startIndex);
    if (tracks.length > startIndex) {
      loadAndPlay(tracks[startIndex]);
    }
  }, [loadAndPlay]);

  const clearQueue = useCallback(() => {
    audioRef.current?.pause();
    setQueueState([]);
    setQueueIndex(0);
    setCurrentTrack(null);
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  return (
    <PlayerContext.Provider value={{
      currentTrack, queue, queueIndex, isPlaying, volume, playbackMode,
      playbackSpeed, currentTime, duration, isMuted, isExpanded,
      audioRef, play, pause, togglePlay, next, previous, seek,
      setVolume, setPlaybackMode, setPlaybackSpeed, toggleMute,
      addToQueue, setQueue, clearQueue, setIsExpanded,
    }}>
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
};
