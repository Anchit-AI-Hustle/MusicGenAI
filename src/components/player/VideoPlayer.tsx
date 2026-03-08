/**
 * VideoPlayer — Reusable YouTube-style video player with three view modes:
 *   1. Embedded (default, 16:9, max-w-[900px])
 *   2. Theatre (large, max-w-[1400px], ~90-100% page width)
 *   3. Fullscreen (browser Fullscreen API)
 *
 * Stability rules:
 *   - Video element is always mounted, never conditionally rendered
 *   - Playback controlled via ref, not React state
 *   - Source assigned once via srcRef guard
 *   - Memoized to prevent rerenders from parent state changes
 *   - GPU-accelerated container with will-change: transform
 */

import React, { useRef, useState, useEffect, useCallback, memo } from 'react';
import {
  Play, Pause, Maximize, Minimize, RectangleHorizontal,
  Volume2, VolumeX, Volume1, Monitor, Download
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';

export type ViewMode = 'embedded' | 'theatre' | 'fullscreen';

interface VideoPlayerProps {
  videoUrl: string;
  title?: string;
  duration?: number;
}

const formatTime = (secs: number) => {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const VideoPlayerInner: React.FC<VideoPlayerProps> = ({ videoUrl, title, duration: propDuration }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const srcRef = useRef('');

  const [viewMode, setViewMode] = useState<ViewMode>('embedded');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(propDuration || 0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Assign source only once per URL change
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    if (srcRef.current !== videoUrl) {
      srcRef.current = videoUrl;
      video.src = videoUrl;
      video.load();
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, [videoUrl]);

  // Time update at ~4Hz via rAF
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let rafId = 0;
    let lastFlush = 0;

    const tick = () => {
      const now = performance.now();
      if (now - lastFlush > 250) {
        lastFlush = now;
        setCurrentTime(video.currentTime);
        if (video.duration && !isNaN(video.duration)) setDuration(video.duration);
      }
      rafId = requestAnimationFrame(tick);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    rafId = requestAnimationFrame(tick);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Sync volume imperatively
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement && viewMode === 'fullscreen') {
        setViewMode('embedded');
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [viewMode]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }, []);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const toggleMute = useCallback(() => setIsMuted(p => !p), []);

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    setIsMuted(false);
  }, []);

  const toggleTheatre = useCallback(() => {
    if (viewMode === 'fullscreen' && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setViewMode(prev => prev === 'theatre' ? 'embedded' : 'theatre');
  }, [viewMode]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setViewMode('fullscreen')).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setViewMode('embedded')).catch(() => {});
    }
  }, []);

  // Auto-hide controls
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) setShowControls(true);
    else resetHideTimer();
  }, [isPlaying, resetHideTimer]);

  // Container classes per view mode
  const containerClasses = viewMode === 'theatre'
    ? 'w-full max-w-[1400px] mx-auto'
    : viewMode === 'fullscreen'
    ? 'w-full h-full'
    : 'w-full max-w-[900px]';

  return (
    <div
      ref={containerRef}
      className={`relative group bg-black rounded-xl overflow-hidden ${containerClasses}`}
      style={{ willChange: 'transform', contain: 'layout style' }}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* 16:9 aspect ratio wrapper */}
      <div className={viewMode === 'fullscreen' ? 'w-full h-full' : 'relative w-full pb-[56.25%]'}>
        <video
          ref={videoRef}
          className={`${viewMode === 'fullscreen' ? 'w-full h-full object-contain' : 'absolute inset-0 w-full h-full object-contain'}`}
          playsInline
          preload="metadata"
          onClick={togglePlay}
          style={{ willChange: 'transform' }}
        />
      </div>

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

        {/* Title */}
        {title && (
          <div className="absolute top-0 left-0 right-0 p-3 sm:p-4">
            <p className="text-white text-sm font-medium truncate drop-shadow-lg">{title}</p>
          </div>
        )}

        {/* Center play button (only when paused) */}
        {!isPlaying && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center z-10"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/90 flex items-center justify-center shadow-xl shadow-primary/30 hover:scale-105 transition-transform">
              <Play className="w-8 h-8 sm:w-10 sm:h-10 text-primary-foreground ml-1" />
            </div>
          </button>
        )}

        {/* Bottom controls bar */}
        <div className="relative z-20 px-3 sm:px-4 pb-3 sm:pb-4 space-y-2">
          {/* Seek bar */}
          <Slider
            value={[currentTime]}
            min={0}
            max={duration || 1}
            step={0.1}
            onValueChange={([v]) => seek(v)}
            className="h-1 hover:h-2 transition-all cursor-pointer [&_[role=slider]]:bg-primary [&_[role=slider]]:border-0 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
          />

          {/* Controls row */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Play/Pause */}
            <button onClick={togglePlay} className="text-white hover:text-primary transition-colors p-1">
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            {/* Time */}
            <span className="text-white/80 text-xs sm:text-sm font-mono min-w-[80px]">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Volume */}
            <div className="flex items-center gap-1.5">
              <button onClick={toggleMute} className="text-white/80 hover:text-white transition-colors p-1">
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> :
                 volume < 0.5 ? <Volume1 className="w-4 h-4" /> :
                 <Volume2 className="w-4 h-4" />}
              </button>
              <Slider
                value={[isMuted ? 0 : volume]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={([v]) => handleVolumeChange(v)}
                className="w-16 sm:w-20 h-1 [&_[role=slider]]:bg-white [&_[role=slider]]:border-0 [&_[role=slider]]:h-2.5 [&_[role=slider]]:w-2.5"
              />
            </div>

            {/* Theatre toggle */}
            <button
              onClick={toggleTheatre}
              className={`text-white/80 hover:text-white transition-colors p-1 ${viewMode === 'theatre' ? 'text-primary' : ''}`}
              title={viewMode === 'theatre' ? 'Exit Theatre Mode' : 'Theatre Mode'}
            >
              {viewMode === 'theatre' ? <Monitor className="w-4 h-4" /> : <RectangleHorizontal className="w-4 h-4" />}
            </button>

            {/* Download */}
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const response = await fetch(videoUrl);
                  const blob = await response.blob();
                  const blobUrl = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = blobUrl;
                  a.download = `${title || 'video'}_video.mp4`;
                  a.style.display = 'none';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(blobUrl);
                } catch {
                  window.open(videoUrl, '_blank');
                }
              }}
              className="text-white/80 hover:text-white transition-colors p-1"
              title="Download Video (MP4)"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="text-white/80 hover:text-white transition-colors p-1"
              title={viewMode === 'fullscreen' ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {viewMode === 'fullscreen' ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const VideoPlayer = memo(VideoPlayerInner, (prev, next) => {
  return prev.videoUrl === next.videoUrl && prev.title === next.title && prev.duration === next.duration;
});

VideoPlayer.displayName = 'VideoPlayer';
