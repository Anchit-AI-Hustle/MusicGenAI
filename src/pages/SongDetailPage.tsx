import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PortalDropdown } from '@/components/ui/portal-dropdown';
import {
  ArrowLeft, Music, Play, Pause, Download, Clock, Calendar, Disc,
  ChevronDown, ChevronUp, MonitorPlay
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

const toPlayerTrack = (track: Track, creation: MusicCreation): PlayerTrack => ({
  id: track.id,
  title: track.title,
  artist: creation.title,
  audioUrl: track.audioUrl || '',
  videoUrl: track.videoUrl,
  duration: track.duration,
  creationId: creation.id,
  creationType: creation.type,
  genres: creation.genres,
  lyrics: creation.lyrics,
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

/** Single download button with dropdown for MP3/MP4 options */
const SongDownloadMenu: React.FC<{ track: Track; triggerDownload: (url: string, filename: string) => Promise<void> }> = ({ track, triggerDownload }) => {
  const [open, setOpen] = useState(false);
  const triggerBtnRef = useRef<HTMLDivElement>(null);
  const hasVideo = !!track.videoUrl;

  // If only one type, download directly
  if (hasAudio && !hasVideo) {
    return (
      <Button variant="outline" size="lg" onClick={() => triggerDownload(track.audioUrl!, `${track.title}.mp3`)}>
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
        <button onClick={() => { triggerDownload(track.audioUrl!, `${track.title}.mp3`); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors">
          <Music className="w-4 h-4" /> Download MP3
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
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        {/* Back button */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <Button variant="ghost" onClick={onBack} className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Button>
        </motion.div>

        {/* Hero section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl overflow-hidden mb-6"
        >
          <div className="p-6 sm:p-8 flex flex-col sm:flex-row gap-6">
            {/* Cover art */}
            <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl bg-gradient-to-br from-primary/20 via-accent/10 to-secondary flex items-center justify-center flex-shrink-0 mx-auto sm:mx-0 shadow-xl">
              {creation.type === 'album' ? (
                <Disc className="w-20 h-20 text-accent/60" />
              ) : (
                <Music className="w-20 h-20 text-primary/60" />
              )}
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
                  {formatDuration(track?.duration || creation.durationSeconds)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {formatDate(creation.createdAt)}
                </span>
              </div>
              {creation.genres.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 justify-center sm:justify-start">
                  {creation.genres.map(g => (
                    <span key={g} className="px-3 py-1 text-xs rounded-full bg-primary/10 text-primary font-medium">{g}</span>
                  ))}
                </div>
              )}

              {/* Action buttons — single download icon with dropdown */}
              <div className="flex items-center gap-3 mt-6 justify-center sm:justify-start">
                {track?.audioUrl && (
                  <Button variant="glow" size="lg" onClick={handlePlay}>
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </Button>
                )}
                {(track?.audioUrl || track?.videoUrl) && (
                  <SongDownloadMenu track={track} triggerDownload={triggerDownload} />
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Video player */}
        {track?.videoUrl && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
            <VideoPlayer videoUrl={track.videoUrl} title={track.title} duration={track.duration} />
          </motion.div>
        )}

        {/* Lyrics section */}
        {creation.lyrics && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card rounded-2xl overflow-hidden mb-6">
            <button
              onClick={() => setShowLyrics(!showLyrics)}
              className="w-full flex items-center justify-between p-5 hover:bg-secondary/30 transition-colors"
            >
              <h2 className="font-display text-lg font-semibold text-foreground">Lyrics</h2>
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
                      {creation.lyrics}
                    </pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Prompt info */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card rounded-2xl p-5 mb-6">
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">Creation Details</h2>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-muted-foreground">Prompt:</span>
              <p className="text-foreground mt-1">{creation.musicPrompt}</p>
            </div>
            {creation.artistInspiration && (
              <div>
                <span className="text-muted-foreground">Artist Inspiration:</span>
                <p className="text-foreground mt-1">{creation.artistInspiration}</p>
              </div>
            )}
            {creation.vocalLanguages.length > 0 && (
              <div>
                <span className="text-muted-foreground">Vocal Languages:</span>
                <p className="text-foreground mt-1">{creation.vocalLanguages.join(', ')}</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Album track list (if album) */}
        {creation.type === 'album' && creation.tracks.length > 1 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="glass-card rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-border">
              <h2 className="font-display text-lg font-semibold text-foreground">All Tracks</h2>
            </div>
            <div className="divide-y divide-border">
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
                    <span className="w-6 text-center text-sm text-muted-foreground">{i + 1}</span>
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
