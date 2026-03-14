import React, { useState, useRef, useEffect, memo, useCallback, useMemo } from 'react';
import { PortalDropdown } from '@/components/ui/portal-dropdown';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  Download, Music, MonitorPlay, Activity, ChevronDown, ListMusic,
  X, Share2, Maximize2, Minimize2
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { usePlayer, usePlayerTime, PlaybackMode, type PlayerLyricCue, type PlayerTrack } from '@/contexts/PlayerContext';
import { AudioVisualizer } from './AudioVisualizer';
import { useIsMobile } from '@/hooks/use-mobile';
import { ensureUniversalMp4Blob } from '@/lib/video-generator';

const formatTime = (secs: number) => {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

const MODE_ICONS: Record<PlaybackMode, React.ReactNode> = {
  audio: <Music className="w-4 h-4" />,
  video: <MonitorPlay className="w-4 h-4" />,
  visualizer: <Activity className="w-4 h-4" />,
};

interface RenderedLyricLine extends PlayerLyricCue {
  id: string;
}

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const getTrackGradient = (track: PlayerTrack) => {
  const base = hashString(`${track.id}-${track.title}`);
  const hueA = base % 360;
  const hueB = (hueA + 48) % 360;
  const hueC = (hueA + 112) % 360;
  return `radial-gradient(circle at top left, hsla(${hueA}, 75%, 58%, 0.28), transparent 40%), radial-gradient(circle at top right, hsla(${hueB}, 72%, 52%, 0.20), transparent 38%), linear-gradient(180deg, hsla(${hueC}, 70%, 10%, 0.95) 0%, hsl(222 25% 6%) 100%)`;
};

const parseLyricsForPlayback = (track: PlayerTrack | null): RenderedLyricLine[] => {
  if (!track) return [];

  if (track.lyricCues && track.lyricCues.length > 0) {
    return track.lyricCues.map((cue, index) => ({
      ...cue,
      id: `${track.id}-cue-${index}`,
    }));
  }

  if (!track.lyrics) return [];

  const lines = track.lyrics.split('\n').map((line) => line.trim()).filter(Boolean);
  const timestamped = lines
    .map((line, index) => {
      const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,2}))?\]\s*(.+)$/);
      if (!match) return null;
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const hundredths = match[3] ? Number(match[3]) / 100 : 0;
      return {
        id: `${track.id}-lrc-${index}`,
        text: match[4],
        startTime: minutes * 60 + seconds + hundredths,
        endTime: track.duration,
      };
    })
    .filter(Boolean) as RenderedLyricLine[];

  if (timestamped.length > 0) {
    return timestamped.map((line, index) => ({
      ...line,
      endTime: index < timestamped.length - 1 ? timestamped[index + 1].startTime : Math.max(line.startTime + 2, track.duration),
    }));
  }

  const contentLines = lines.filter((line) => !/^\[(verse|chorus|bridge|intro|outro|hook|pre-chorus|post-chorus|drop|break)/i.test(line));
  if (contentLines.length === 0) return [];

  const usableDuration = Math.max(8, track.duration - 6);
  const step = usableDuration / contentLines.length;
  return contentLines.map((line, index) => {
    const startTime = 3 + index * step;
    const nextStart = 3 + (index + 1) * step;
    return {
      id: `${track.id}-plain-${index}`,
      text: line,
      startTime,
      endTime: index === contentLines.length - 1 ? Math.max(startTime + 2, track.duration - 1) : Math.max(startTime + 1.4, nextStart),
    };
  });
};

const SeekBar = memo<{ className?: string }>(({ className = '' }) => {
  const { currentTime, duration } = usePlayerTime();
  const { seek } = usePlayer();

  return (
    <div className={className}>
      <Slider
        value={[currentTime]}
        min={0}
        max={duration || 1}
        step={0.1}
        onValueChange={([v]) => seek(v)}
        className="h-1.5 cursor-pointer"
      />
      <div className="flex justify-between text-[11px] text-muted-foreground mt-2">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
});
SeekBar.displayName = 'SeekBar';

const MiniProgress = memo(() => {
  const { currentTime, duration } = usePlayerTime();
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  return (
    <div className="absolute top-0 left-0 right-0 h-0.5 bg-border/50">
      <div
        className="h-full bg-primary"
        style={{ width: `${progress}%`, transition: 'width 0.2s linear' }}
      />
    </div>
  );
});
MiniProgress.displayName = 'MiniProgress';

const StableVideoPlayer = memo<{ videoUrl: string; className?: string }>(({ videoUrl, className }) => {
  const { videoRef, audioRef, isPlaying } = usePlayer();
  const srcRef = useRef('');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (srcRef.current !== videoUrl) {
      srcRef.current = videoUrl;
      video.src = videoUrl;
      video.load();
    }
  }, [videoRef, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) video.play().catch(() => {});
    else video.pause();
  }, [isPlaying, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;
    const sync = window.setInterval(() => {
      if (Math.abs(video.currentTime - audio.currentTime) > 0.3) {
        video.currentTime = audio.currentTime;
      }
    }, 750);
    return () => window.clearInterval(sync);
  }, [audioRef, videoRef]);

  return <video ref={videoRef} className={className} muted playsInline preload="metadata" />;
});
StableVideoPlayer.displayName = 'StableVideoPlayer';

const SyncedLyricsPanel: React.FC<{ track: PlayerTrack }> = ({ track }) => {
  const { currentTime } = usePlayerTime();
  const lyricLines = useMemo(() => parseLyricsForPlayback(track), [track]);
  const activeLineId = useMemo(() => {
    const active = lyricLines.find((line) => currentTime >= line.startTime && currentTime < line.endTime);
    return active?.id || null;
  }, [currentTime, lyricLines]);

  useEffect(() => {
    if (!activeLineId) return;
    const el = document.getElementById(activeLineId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeLineId]);

  if (lyricLines.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-muted-foreground">
        No synced lyrics available for this track.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 md:p-6 h-[320px] md:h-[420px] overflow-y-auto">
      <p className="text-xs uppercase tracking-[0.25em] text-white/45 mb-4">Lyrics</p>
      <div className="space-y-3">
        {lyricLines.map((line) => {
          const isActive = line.id === activeLineId;
          return (
            <div
              key={line.id}
              id={line.id}
              className={`transition-all duration-300 rounded-2xl px-3 py-2 ${
                isActive ? 'bg-white/12 text-white scale-[1.01]' : 'text-white/55'
              }`}
            >
              <p className="text-base md:text-lg leading-relaxed">{line.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const GlobalPlayer: React.FC = () => {
  const {
    currentTrack, isPlaying, volume, playbackMode, playbackSpeed,
    isMuted, isExpanded, isImmersive, queue, queueIndex,
    togglePlay, next, previous, setVolume, setPlaybackMode,
    setPlaybackSpeed, toggleMute, setIsExpanded, setIsImmersive, play,
  } = usePlayer();

  const isMobile = useIsMobile();
  const [showQueue, setShowQueue] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const downloadBtnRef = useRef<HTMLDivElement>(null);
  const speedBtnRef = useRef<HTMLDivElement>(null);

  const triggerDownload = useCallback(async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      let blobToDownload = blob;
      let finalFilename = filename;
      const isVideoFile = blob.type.startsWith('video/') || /\.(mp4|webm)$/i.test(filename);

      if (isVideoFile) {
        blobToDownload = await ensureUniversalMp4Blob(blob);
        finalFilename = filename.replace(/\.(webm|mp4)$/i, '.mp4');
        if (!finalFilename.toLowerCase().endsWith('.mp4')) finalFilename = `${finalFilename}.mp4`;
      }

      const blobUrl = URL.createObjectURL(blobToDownload);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = finalFilename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  }, []);

  const handleShare = useCallback(async () => {
    if (!currentTrack) return;
    const shareUrl = currentTrack.audioUrl || currentTrack.videoUrl || window.location.href;
    const shareData = {
      title: currentTrack.title,
      text: `${currentTrack.title}${currentTrack.artist ? ` by ${currentTrack.artist}` : ''}`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareUrl);
      }
    } catch {
      // no-op
    }
  }, [currentTrack]);

  const collapsePlayer = useCallback(() => {
    setIsImmersive(false);
    setIsExpanded(false);
  }, [setIsExpanded, setIsImmersive]);

  if (!currentTrack) return null;

  const stopBubble = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-xl"
        onClick={() => setIsExpanded(true)}
      >
        <MiniProgress />
        <div className="flex items-center gap-3 px-3 sm:px-4 py-3">
          <button
            onClick={(event) => { stopBubble(event); setIsExpanded(true); }}
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-secondary/80 flex items-center justify-center overflow-hidden shadow-lg shadow-primary/10"
          >
            {currentTrack.coverArt ? (
              <img src={currentTrack.coverArt} alt={currentTrack.title} className="w-full h-full object-cover" />
            ) : (
              <Music className="w-5 h-5 text-primary" />
            )}
          </button>

          <button
            onClick={(event) => { stopBubble(event); setIsExpanded(true); }}
            className="min-w-0 flex-1 text-left"
          >
            <p className="text-sm font-medium text-foreground truncate">{currentTrack.title}</p>
            <p className="text-xs text-muted-foreground truncate">
              {[currentTrack.artist, currentTrack.genres?.slice(0, 2).join(' • ')].filter(Boolean).join(' • ') || 'MuseVibeStudio'}
            </p>
          </button>

          {!isMobile && (
            <div className="hidden sm:flex items-center gap-2" onClick={stopBubble}>
              <button onClick={previous} className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/20"
              >
                {isPlaying ? <Pause className="w-4 h-4 text-primary-foreground" /> : <Play className="w-4 h-4 text-primary-foreground ml-0.5" />}
              </button>
              <button onClick={next} disabled={queueIndex >= queue.length - 1} className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30">
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-1" onClick={stopBubble}>
            {isMobile && (
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-primary flex items-center justify-center"
              >
                {isPlaying ? <Pause className="w-5 h-5 text-primary-foreground" /> : <Play className="w-5 h-5 text-primary-foreground ml-0.5" />}
              </button>
            )}
            <button onClick={() => setIsExpanded(true)} className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.22 }}
            className={`fixed inset-0 z-[60] ${isImmersive ? 'bg-black' : 'bg-black/70 backdrop-blur-xl'}`}
          >
            <div
              className={`absolute inset-0 ${isImmersive ? '' : 'p-3 md:p-6'}`}
              style={{ background: getTrackGradient(currentTrack) }}
            >
              <div className={`h-full w-full ${isImmersive ? '' : 'rounded-[28px] border border-white/10 bg-black/35 backdrop-blur-2xl'} overflow-hidden`}>
                <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-white/10">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-white/40">Now Playing</p>
                    <h3 className="text-white font-semibold">{currentTrack.title}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setIsImmersive(!isImmersive)} className="p-2 rounded-full bg-white/8 text-white hover:bg-white/14 transition-colors">
                      {isImmersive ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                    <button onClick={collapsePlayer} className="p-2 rounded-full bg-white/8 text-white hover:bg-white/14 transition-colors">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid h-[calc(100%-73px)] grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
                  <div className="flex flex-col p-4 md:p-6 lg:p-8 min-h-0">
                    <div className="flex items-start justify-between gap-4 mb-5">
                      <div className="min-w-0">
                        <p className="text-2xl md:text-4xl font-semibold text-white truncate">{currentTrack.title}</p>
                        <p className="text-sm md:text-base text-white/60 mt-1">
                          {[currentTrack.artist, currentTrack.genres?.join(' • ')].filter(Boolean).join(' • ') || 'MuseVibeStudio'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <div className="flex items-center gap-1 rounded-full bg-white/8 p-1">
                          {(['audio', 'video', 'visualizer'] as PlaybackMode[]).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setPlaybackMode(mode)}
                              disabled={mode === 'video' && !currentTrack.videoUrl}
                              className={`p-2 rounded-full transition-colors ${
                                playbackMode === mode ? 'bg-white text-black' : 'text-white/70 hover:text-white'
                              } disabled:opacity-30`}
                            >
                              {MODE_ICONS[mode]}
                            </button>
                          ))}
                        </div>

                        <div className="relative" ref={speedBtnRef}>
                          <button
                            onClick={() => setShowSpeedMenu((prev) => !prev)}
                            className="px-3 py-2 rounded-full bg-white/8 text-sm text-white/80 hover:text-white"
                          >
                            {playbackSpeed}x
                          </button>
                          <PortalDropdown open={showSpeedMenu} onClose={() => setShowSpeedMenu(false)} triggerRef={speedBtnRef as React.RefObject<HTMLElement>} direction="down" align="right" minWidth={90}>
                            {SPEEDS.map((speed) => (
                              <button
                                key={speed}
                                onClick={() => { setPlaybackSpeed(speed); setShowSpeedMenu(false); }}
                                className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary ${playbackSpeed === speed ? 'text-primary font-medium' : 'text-foreground'}`}
                              >
                                {speed}x
                              </button>
                            ))}
                          </PortalDropdown>
                        </div>

                        <button onClick={handleShare} className="p-2 rounded-full bg-white/8 text-white/80 hover:text-white">
                          <Share2 className="w-4 h-4" />
                        </button>

                        <div className="relative" ref={downloadBtnRef}>
                          <button
                            onClick={() => setShowDownloadMenu((prev) => !prev)}
                            className="p-2 rounded-full bg-white/8 text-white/80 hover:text-white"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <PortalDropdown open={showDownloadMenu} onClose={() => setShowDownloadMenu(false)} triggerRef={downloadBtnRef as React.RefObject<HTMLElement>} direction="down" align="right" minWidth={150}>
                            {currentTrack.audioUrl && (
                              <button
                                onClick={() => { triggerDownload(currentTrack.audioUrl, `${currentTrack.title || 'track'}.wav`); setShowDownloadMenu(false); }}
                                className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-secondary"
                              >
                                Download WAV
                              </button>
                            )}
                            {currentTrack.videoUrl && (
                              <button
                                onClick={() => { triggerDownload(currentTrack.videoUrl!, `${currentTrack.title || 'track'}.mp4`); setShowDownloadMenu(false); }}
                                className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-secondary"
                              >
                                Download MP4
                              </button>
                            )}
                          </PortalDropdown>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 rounded-[32px] border border-white/10 bg-black/25 overflow-hidden">
                      {playbackMode === 'video' && currentTrack.videoUrl ? (
                        <StableVideoPlayer videoUrl={currentTrack.videoUrl} className="w-full h-full object-cover" />
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center px-6 md:px-10 py-8">
                          <div className="w-40 h-40 md:w-64 md:h-64 rounded-[32px] bg-white/10 border border-white/10 shadow-2xl flex items-center justify-center overflow-hidden mb-8">
                            {currentTrack.coverArt ? (
                              <img src={currentTrack.coverArt} alt={currentTrack.title} className="w-full h-full object-cover" />
                            ) : playbackMode === 'visualizer' ? (
                              <AudioVisualizer barCount={72} className="w-full h-full p-6" />
                            ) : (
                              <Music className="w-20 h-20 md:w-24 md:h-24 text-white/65" />
                            )}
                          </div>
                          <div className="w-full max-w-2xl h-32 md:h-44">
                            <AudioVisualizer barCount={84} className="w-full h-full" mode={playbackMode === 'audio' ? 'wave' : 'bars'} />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-5 space-y-5">
                      <SeekBar />

                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center justify-center gap-3">
                          <button onClick={previous} className="p-3 rounded-full bg-white/8 text-white hover:bg-white/14 transition-colors">
                            <SkipBack className="w-5 h-5" />
                          </button>
                          <button onClick={togglePlay} className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-xl">
                            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                          </button>
                          <button onClick={next} disabled={queueIndex >= queue.length - 1} className="p-3 rounded-full bg-white/8 text-white hover:bg-white/14 transition-colors disabled:opacity-30">
                            <SkipForward className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-3">
                          <button onClick={toggleMute} className="p-2 rounded-full bg-white/8 text-white/80 hover:text-white">
                            {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : volume < 0.5 ? <Volume1 className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                          </button>
                          <Slider
                            value={[isMuted ? 0 : volume]}
                            min={0}
                            max={1}
                            step={0.01}
                            onValueChange={([value]) => setVolume(value)}
                            className="w-28 md:w-40"
                          />
                          <button onClick={() => setShowQueue((prev) => !prev)} className={`p-2 rounded-full transition-colors ${showQueue ? 'bg-white text-black' : 'bg-white/8 text-white/80 hover:text-white'}`}>
                            <ListMusic className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t xl:border-t-0 xl:border-l border-white/10 p-4 md:p-6 lg:p-8 bg-black/20 min-h-0 overflow-hidden">
                    <SyncedLyricsPanel track={currentTrack} />
                  </div>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {showQueue && (
                <motion.div
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  className="absolute right-4 top-24 bottom-4 w-[320px] max-w-[calc(100vw-2rem)] rounded-[28px] border border-white/10 bg-black/70 backdrop-blur-2xl overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
                    <p className="text-sm font-semibold text-white">Up Next</p>
                    <button onClick={() => setShowQueue(false)} className="text-white/60 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="overflow-y-auto h-full pb-10">
                    {queue.map((track, index) => (
                      <button
                        key={`${track.id}-${index}`}
                        onClick={() => play(track)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          index === queueIndex ? 'bg-white/10' : 'hover:bg-white/5'
                        }`}
                      >
                        <span className="w-5 text-center text-xs text-white/45">
                          {index === queueIndex && isPlaying ? <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" /> : index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm ${index === queueIndex ? 'text-white' : 'text-white/70'}`}>{track.title}</p>
                          <p className="text-xs text-white/40 truncate">{track.artist || formatTime(track.duration)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
