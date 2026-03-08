import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  Maximize, Minimize, Download, Music, MonitorPlay, Activity,
  ChevronUp, ChevronDown, ListMusic, X
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { usePlayer, PlaybackMode } from '@/contexts/PlayerContext';
import { AudioVisualizer } from './AudioVisualizer';
import { useIsMobile } from '@/hooks/use-mobile';

const formatTime = (secs: number) => {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const MODE_ICONS: Record<PlaybackMode, React.ReactNode> = {
  audio: <Music className="w-4 h-4" />,
  video: <MonitorPlay className="w-4 h-4" />,
  visualizer: <Activity className="w-4 h-4" />,
};

export const GlobalPlayer: React.FC = () => {
  const {
    currentTrack, isPlaying, volume, playbackMode, playbackSpeed,
    currentTime, duration, isMuted, isExpanded, queue, queueIndex,
    togglePlay, next, previous, seek, setVolume, setPlaybackMode,
    setPlaybackSpeed, toggleMute, setIsExpanded,
  } = usePlayer();

  const isMobile = useIsMobile();
  const [showQueue, setShowQueue] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const { play } = usePlayer();

  // Sync video with audio
  const { audioRef } = usePlayer();
  useEffect(() => {
    if (!videoRef.current || !audioRef.current || playbackMode !== 'video') return;
    const video = videoRef.current;
    const audio = audioRef.current;

    const syncVideo = () => {
      if (Math.abs(video.currentTime - audio.currentTime) > 0.3) {
        video.currentTime = audio.currentTime;
      }
    };

    if (isPlaying) { video.play().catch(() => {}); }
    else { video.pause(); }

    const interval = setInterval(syncVideo, 500);
    return () => clearInterval(interval);
  }, [isPlaying, playbackMode, audioRef]);

  const toggleFullscreen = () => {
    if (!playerRef.current) return;
    if (!document.fullscreenElement) {
      playerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  if (!currentTrack) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Mobile compact player
  if (isMobile && !isExpanded) {
    return (
      <motion.div
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border px-3 py-2"
        onClick={() => setIsExpanded(true)}
      >
        {/* Mini progress bar */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-border">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 overflow-hidden">
            {playbackMode === 'visualizer' ? (
              <AudioVisualizer className="rounded-lg" barCount={8} />
            ) : (
              <Music className="w-5 h-5 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{currentTrack.title}</p>
            <p className="text-xs text-muted-foreground truncate">{currentTrack.artist || 'HarmonyAI'}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0"
          >
            {isPlaying ? <Pause className="w-5 h-5 text-primary-foreground" /> : <Play className="w-5 h-5 text-primary-foreground ml-0.5" />}
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div
        ref={playerRef}
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className={`fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border ${
          isFullscreen ? 'h-screen flex flex-col' : ''
        }`}
      >
        {/* Media display area (expanded mobile or fullscreen) */}
        {(isExpanded || isFullscreen) && (
          <div className={`relative bg-background ${isFullscreen ? 'flex-1' : 'h-48 sm:h-64'}`}>
            {/* Close/minimize for mobile */}
            {isExpanded && isMobile && (
              <button onClick={() => setIsExpanded(false)} className="absolute top-3 left-3 z-10 p-2 rounded-full bg-background/60 backdrop-blur">
                <ChevronDown className="w-5 h-5 text-foreground" />
              </button>
            )}

            {playbackMode === 'video' && currentTrack.videoUrl ? (
              <video
                ref={videoRef}
                src={currentTrack.videoUrl}
                className="w-full h-full object-contain"
                muted
                playsInline
              />
            ) : playbackMode === 'visualizer' ? (
              <div className="w-full h-full flex items-center justify-center p-6">
                <AudioVisualizer barCount={64} />
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl bg-secondary flex items-center justify-center">
                  <Music className="w-12 h-12 sm:w-16 sm:h-16 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-display text-lg font-semibold text-foreground">{currentTrack.title}</p>
                  <p className="text-sm text-muted-foreground">{currentTrack.artist || 'HarmonyAI'}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Seekbar - top of player controls */}
        <div className="px-4 pt-2 group">
          <Slider
            value={[currentTime]}
            min={0}
            max={duration || 1}
            step={0.1}
            onValueChange={([v]) => seek(v)}
            className="h-1 group-hover:h-2 transition-all cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1 px-0.5">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Main controls */}
        <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-6 pb-3 pt-1">
          {/* LEFT: track info (desktop) */}
          {!isMobile && (
            <div className="flex items-center gap-3 w-1/4 min-w-0">
              <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 overflow-hidden">
                {playbackMode === 'visualizer' && isPlaying ? (
                  <AudioVisualizer className="rounded-lg" barCount={8} />
                ) : (
                  <Music className="w-6 h-6 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{currentTrack.title}</p>
                <p className="text-xs text-muted-foreground truncate">{currentTrack.artist || 'HarmonyAI'}</p>
              </div>
            </div>
          )}

          {/* CENTER: playback controls */}
          <div className="flex items-center justify-center gap-2 sm:gap-4 flex-1">
            <button onClick={previous} className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
              <SkipBack className="w-5 h-5" />
            </button>
            <button
              onClick={togglePlay}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-primary flex items-center justify-center hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
              ) : (
                <Play className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground ml-0.5" />
              )}
            </button>
            <button onClick={next} disabled={queueIndex >= queue.length - 1} className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30">
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* RIGHT: volume, mode, extras */}
          <div className="flex items-center gap-1 sm:gap-2 w-auto sm:w-1/4 justify-end">
            {/* Mode switcher */}
            {!isMobile && (
              <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5">
                {(['audio', 'video', 'visualizer'] as PlaybackMode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setPlaybackMode(m)}
                    disabled={m === 'video' && !currentTrack.videoUrl}
                    className={`p-1.5 rounded-md transition-colors ${
                      playbackMode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    } disabled:opacity-20 disabled:cursor-not-allowed`}
                    title={m.charAt(0).toUpperCase() + m.slice(1)}
                  >
                    {MODE_ICONS[m]}
                  </button>
                ))}
              </div>
            )}

            {/* Speed */}
            {!isMobile && (
              <div className="relative">
                <button
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className="px-2 py-1 text-xs font-mono rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                >
                  {playbackSpeed}×
                </button>
                <AnimatePresence>
                  {showSpeedMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowSpeedMenu(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-full mb-2 right-0 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 min-w-[80px]"
                      >
                        {SPEEDS.map(s => (
                          <button
                            key={s}
                            onClick={() => { setPlaybackSpeed(s); setShowSpeedMenu(false); }}
                            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-secondary transition-colors ${
                              playbackSpeed === s ? 'text-primary font-medium' : 'text-foreground'
                            }`}
                          >
                            {s}×
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Volume */}
            {!isMobile && (
              <div className="flex items-center gap-1.5 group/vol">
                <button onClick={toggleMute} className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> :
                   volume < 0.5 ? <Volume1 className="w-4 h-4" /> :
                   <Volume2 className="w-4 h-4" />}
                </button>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={([v]) => setVolume(v)}
                  className="w-20 h-1"
                />
              </div>
            )}

            {/* Queue toggle */}
            <button
              onClick={() => setShowQueue(!showQueue)}
              className={`p-1.5 rounded-md transition-colors ${
                showQueue ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <ListMusic className="w-4 h-4" />
            </button>

            {/* Fullscreen */}
            {!isMobile && (
              <button onClick={toggleFullscreen} className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            )}

            {/* Download */}
            {currentTrack.audioUrl && (
              <a href={currentTrack.audioUrl} download={`${currentTrack.title || 'track'}.wav`}>
                <button className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                  <Download className="w-4 h-4" />
                </button>
              </a>
            )}

            {/* Mobile expand */}
            {isMobile && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Queue panel */}
      <AnimatePresence>
        {showQueue && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowQueue(false)} />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-24 right-4 z-50 w-80 max-h-96 bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h4 className="font-display font-semibold text-foreground text-sm">Queue</h4>
                <button onClick={() => setShowQueue(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-y-auto max-h-72">
                {queue.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground text-center">Queue is empty</p>
                ) : (
                  queue.map((track, i) => (
                    <button
                      key={`${track.id}-${i}`}
                      onClick={() => play(track)}
                      className={`w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/50 transition-colors ${
                        i === queueIndex ? 'bg-primary/10' : ''
                      }`}
                    >
                      <span className="w-5 text-center text-xs text-muted-foreground">
                        {i === queueIndex && isPlaying ? (
                          <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm truncate ${i === queueIndex ? 'text-primary font-medium' : 'text-foreground'}`}>
                          {track.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{formatTime(track.duration)}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
