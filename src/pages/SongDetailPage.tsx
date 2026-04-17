import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PortalDropdown } from '@/components/ui/portal-dropdown';
import {
  ArrowLeft, Music, Play, Pause, Download, Clock, Calendar, Disc,
  ChevronDown, ChevronUp, MonitorPlay, Activity, Sparkles, ListMusic
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { useMusic, MusicCreation, Track } from '@/contexts/MusicContext';
import { usePlayer, PlayerTrack } from '@/contexts/PlayerContext';
import { ensureUniversalMp4Blob } from '@/lib/video-generator';

interface SongDetailPageProps {
  creationId: string;
  trackId?: string;
  onBack: () => void;
}

const getCreationGenres = (creation: MusicCreation): string[] =>
  (creation.genre || 'Pop')
    .split(',')
    .map(g => g.trim())
    .filter(Boolean);

const toPlayerTrack = (track: Track, creation: MusicCreation): PlayerTrack => ({
  id: track.id,
  title: track.title,
  artist: creation.title,
  audioUrl: track.audioUrl || '',
  videoUrl: track.videoUrl,
  duration: track.duration,
  creationId: creation.id,
  creationType: creation.type,
  genres: getCreationGenres(creation),
  lyrics: track.lyrics || creation.lyricsText,
  lyricCues: track.lyricCues,
});

const formatDuration = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date);

const triggerDownload = async (url: string, filename: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    let blobToDownload = blob;
    let finalFilename = filename;
    const isVideoFile = blob.type.startsWith('video/') || /\.(mp4|webm)$/i.test(filename);

    if (isVideoFile) {
      blobToDownload = await ensureUniversalMp4Blob(blob);
      finalFilename = filename.replace(/\.(webm|mp4)$/i, '.mp4');
      if (!finalFilename.toLowerCase().endsWith('.mp4')) {
        finalFilename = `${finalFilename}.mp4`;
      }
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
};

/** Single download button with dropdown for WAV/MP4 options */
const SongDownloadMenu: React.FC<{ track: Track; triggerDownload: (url: string, filename: string) => Promise<void> }> = ({ track, triggerDownload }) => {
  const [open, setOpen] = useState(false);
  const triggerBtnRef = useRef<HTMLDivElement>(null);
  const hasAudio = !!track.audioUrl;
  const hasVideo = !!track.videoUrl;

  // If only one type, download directly
  if (hasAudio && !hasVideo) {
    return (
      <Button variant="outline" size="lg" onClick={() => triggerDownload(track.audioUrl!, `${track.title}.wav`)}>
        <Download className="w-4 h-4" /> Download
      </Button>
    );
  }
  if (!hasAudio && hasVideo) {
    return (
      <Button variant="outline" size="lg" onClick={() => triggerDownload(track.videoUrl!, `${track.title}.mp4`)}>
        <Download className="w-4 h-4" /> Download
      </Button>
    );
  }


  return (
    <div className="relative" ref={triggerBtnRef}>
      <Button variant="outline" size="lg" onClick={() => setOpen(p => !p)}>
        <Download className="w-4 h-4" /> Download
      </Button>
      <PortalDropdown open={open} onClose={() => setOpen(false)} triggerRef={triggerBtnRef as React.RefObject<HTMLElement>}>
        <button onClick={() => { triggerDownload(track.audioUrl!, `${track.title}.wav`); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors">
          <Music className="w-4 h-4" /> Download WAV
        </button>
        <button onClick={() => { triggerDownload(track.videoUrl!, `${track.title}.mp4`); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors">
          <MonitorPlay className="w-4 h-4" /> Download MP4
        </button>
      </PortalDropdown>
    </div>
  );
};

export const SongDetailPage: React.FC<SongDetailPageProps> = ({ creationId, trackId, onBack }) => {
  const { creations } = useMusic();
  const player = usePlayer();
  const [showLyrics, setShowLyrics] = useState(true);

  const creation = creations.find(c => c.id === creationId);
  if (!creation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Creation not found</p>
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
          </Button>
        </div>
      </div>
    );
  }

  const track = trackId
    ? creation.tracks.find(t => t.id === trackId)
    : creation.tracks[0];

  const isCurrentTrack = player.currentTrack?.id === track?.id;
  const isPlaying = isCurrentTrack && player.isPlaying;

  const handlePlay = () => {
    if (!track?.audioUrl) return;
    if (isCurrentTrack) {
      player.togglePlay();
    } else {
      const playerTracks = creation.tracks
        .filter(t => t.audioUrl)
        .map(t => toPlayerTrack(t, creation));
      const startIdx = playerTracks.findIndex(t => t.id === track.id);
      player.setQueue(playerTracks, Math.max(0, startIdx));
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 overflow-y-auto relative">
      {/* Static Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-accent/[0.03]" />
      <div className="absolute inset-0" style={{ 
        backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(34, 211, 238, 0.06) 0%, transparent 40%)' 
      }} />

      <div className="max-w-4xl mx-auto relative">
        {/* Simple Back button */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <Button variant="ghost" onClick={onBack} className="mb-6 hover:bg-white/5">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Button>
        </motion.div>

        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="glass-card rounded-2xl overflow-hidden mb-6 relative"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
          
          <div className="relative p-6 sm:p-8 flex flex-col sm:flex-row gap-6">
            {/* Cover Art - Simple */}
            <div className="relative">
              <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl bg-gradient-to-br from-primary/30 via-accent/20 to-secondary flex items-center justify-center flex-shrink-0 mx-auto sm:mx-0 shadow-xl">
                {creation.type === 'album' ? (
                  <Disc className="w-20 h-20 text-accent/80" />
                ) : (
                  <Music className="w-20 h-20 text-primary/80" />
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 flex flex-col justify-center text-center sm:text-left">
              <Badge variant="secondary" className="w-fit mx-auto sm:mx-0 mb-2 capitalize">
                {creation.type}
              </Badge>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">
                {track ? track.title : creation.title}
              </h1>
              
              {creation.type === 'album' && track && (
                <p className="text-muted-foreground mb-2">from {creation.title}</p>
              )}
              
              <div className="flex items-center gap-4 text-sm text-muted-foreground justify-center sm:justify-start flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  {formatDuration(track?.duration || creation.duration)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {formatDate(creation.createdAt)}
                </span>
              </div>
              
              {getCreationGenres(creation).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 justify-center sm:justify-start">
                  {getCreationGenres(creation).map((g, i) => (
                    <motion.span 
                      key={g}
                      initial={{ opacity: 0, translateZ: -10 }}
                      animate={{ opacity: 1, translateZ: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="px-3 py-1 text-xs rounded-full bg-primary/15 text-primary font-medium border border-primary/20"
                    >
                      {g}
                    </motion.span>
                  ))}
                </div>
              )}

              {/* Action buttons with 3D effects */}
              <div className="flex items-center gap-3 mt-6 justify-center sm:justify-start">
                {track?.audioUrl && (
                  <motion.div whileHover={{ scale: 1.05, translateZ: 5 }} whileTap={{ scale: 0.98 }}>
                    <Button variant="glow" size="lg" onClick={handlePlay} className="relative overflow-hidden">
                      <motion.div 
                        initial={{ x: '-100%' }}
                        whileHover={{ x: '100%' }}
                        transition={{ duration: 0.5 }}
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" 
                      />
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                      {isPlaying ? 'Pause' : 'Play'}
                    </Button>
                  </motion.div>
                )}
                {(track?.audioUrl || track?.videoUrl) && (
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <SongDownloadMenu track={track} triggerDownload={triggerDownload} />
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Video player section */}
        {track?.videoUrl && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6"
          >
            <div className="glass-card rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center">
                  <MonitorPlay className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-foreground">Music Video</h3>
                  <p className="text-xs text-muted-foreground">AI-generated visual</p>
                </div>
              </div>
              <VideoPlayer videoUrl={track.videoUrl} title={track.title} duration={track.duration} />
            </div>
          </motion.div>
        )}

        {/* Lyrics section */}
        {creation.lyricsText && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card rounded-2xl overflow-hidden mb-6">
            <button
              onClick={() => setShowLyrics(!showLyrics)}
              className="w-full flex items-center justify-between p-5 hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-primary" />
                </div>
                <h2 className="font-display text-lg font-semibold text-foreground">Lyrics</h2>
              </div>
              {showLyrics ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
            </button>
            <AnimatePresence>
              {showLyrics && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5">
                    <pre className="whitespace-pre-wrap text-sm leading-7 text-foreground/80 font-sans">
                      {creation.lyricsText}
                    </pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Prompt info */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <h2 className="font-display text-lg font-semibold text-foreground">Creation Details</h2>
          </div>
          <div className="space-y-4 text-sm">
            <div className="p-4 rounded-xl bg-white/5 border border-white/5">
              <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Prompt</span>
              <p className="text-foreground mt-2 leading-relaxed">{creation.songDescription}</p>
            </div>
            {creation.artistInspiration && (
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Artist Inspiration</span>
                <p className="text-foreground mt-2">{creation.artistInspiration}</p>
              </div>
            )}
            <div className="p-4 rounded-xl bg-white/5 border border-white/5">
              <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Vocal Language</span>
              <p className="text-foreground mt-1">{creation.vocalLanguage}</p>
            </div>
          </div>
        </motion.div>

        {/* Album track list (if album) */}
        {creation.type === 'album' && creation.tracks.length > 1 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="glass-card rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center">
                  <ListMusic className="w-5 h-5 text-accent" />
                </div>
                <h2 className="font-display text-lg font-semibold text-foreground">All Tracks</h2>
              </div>
            </div>
            <div className="divide-y divide-white/5">
              {creation.tracks.map((t, i) => {
                const isCurrent = player.currentTrack?.id === t.id;
                const tPlaying = isCurrent && player.isPlaying;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      if (!t.audioUrl) return;
                      if (isCurrent) player.togglePlay();
                      else player.play(toPlayerTrack(t, creation));
                    }}
                    className={`w-full flex items-center gap-4 p-4 text-left hover:bg-secondary/30 transition-colors ${isCurrent ? 'bg-primary/5' : ''}`}
                  >
                    <span className="w-6 text-center text-sm text-muted-foreground font-mono">{i + 1}</span>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/10 flex-shrink-0">
                      {tPlaying ? <Pause className="w-4 h-4 text-primary" /> : <Play className="w-4 h-4 text-primary ml-0.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate ${isCurrent ? 'text-primary' : 'text-foreground'}`}>{t.title}</p>
                    </div>
                    <span className="text-sm text-muted-foreground">{formatDuration(t.duration)}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
