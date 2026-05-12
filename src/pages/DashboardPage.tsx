import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, Disc, Play, Pause, Download, Calendar, Clock, Filter, Loader2, RefreshCw, Check, Circle, RotateCcw, ListMusic, Sparkles, TrendingUp, AudioWaveform, Heart, Zap, MonitorPlay } from 'lucide-react';
import JSZip from 'jszip';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { useMusic, MusicCreation, Track } from '@/contexts/MusicContext';
import { usePlayer, PlayerTrack } from '@/contexts/PlayerContext';
import { ensureUniversalMp4Blob } from '@/lib/video-generator';
import { toast } from 'sonner';

type FilterType = 'all' | 'songs' | 'albums';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting',
  analyzing: 'Analyzing',
  seeding: 'Creating DNA',
  inferring: 'Inferring style',
  planning_structure: 'Planning',
  generating_melody: 'Generating melody',
  synthesizing_instruments: 'Synthesizing',
  generating_vocals: 'Creating vocals',
  vocal_alignment: 'Mixing',
  mixing_audio: 'Mixing',
  mastering_track: 'Mastering',
  analyzing_beat_structure: 'Analyzing beats',
  generating_video: 'Rendering',
  rendering_video: 'Rendering',
  encoding_video: 'Encoding',
  transcoding_video: 'Optimizing',
  uploading_video: 'Uploading',
  processing: 'Generating',
  finalizing: 'Finalizing',
  completed: 'Complete',
  failed: 'Failed',
  audio_complete_video_failed: 'Audio ready',
};

const ACTIVE_STATUSES = ['analyzing', 'processing', 'seeding', 'inferring', 'planning_structure', 'generating_melody', 'synthesizing_instruments', 'generating_vocals', 'vocal_alignment', 'mixing_audio', 'mastering_track', 'analyzing_beat_structure', 'generating_video', 'rendering_video', 'encoding_video', 'transcoding_video', 'uploading_video', 'finalizing'];

const isActiveStatus = (status: string) => ACTIVE_STATUSES.includes(status);

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

interface DashboardPageProps {
  onAuthClick: () => void;
  onNavigate: (page: string, params?: Record<string, string>) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onAuthClick, onNavigate }) => {
  const { isAuthenticated } = useAuth();
  const { creations, isLoading, refreshCreations, retryTrack } = useMusic();
  const [filter, setFilter] = useState<FilterType>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filteredCreations = creations.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'songs') return c.type === 'song';
    if (filter === 'albums') return c.type === 'album';
    return true;
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshCreations();
    setIsRefreshing(false);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (date: Date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);

  const getTotalDuration = () => creations.reduce((acc, c) => acc + c.tracks.reduce((t, tr) => t + tr.duration, 0), 0);

  const formatTotalDuration = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const completedSongs = creations.filter(c => c.type === 'song' && c.status === 'completed').length;
  const completedAlbums = creations.filter(c => c.type === 'album' && c.status === 'completed').length;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 relative">
        {/* Static Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-background to-accent/[0.04]" />
        <div className="absolute inset-0" style={{ 
          backgroundImage: 'radial-gradient(circle at 30% 50%, rgba(34, 211, 238, 0.08) 0%, transparent 50%)' 
        }} />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative text-center max-w-lg"
        >
          <div className="mb-8">
            <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto border border-white/10">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Music className="w-10 h-10 text-white" />
              </div>
            </div>
          </div>
          
          <h2 className="font-display text-4xl font-bold bg-gradient-to-r from-white via-primary to-accent bg-clip-text text-transparent mb-4">
            Your Music Awaits
          </h2>
          <p className="text-muted-foreground text-lg mb-8">Sign in to access your music library and start creating amazing tracks with AI</p>
          
          <Button onClick={onAuthClick} variant="glow" size="lg" className="text-lg px-10 py-6">
            <Sparkles className="w-5 h-5 mr-2" /> 
            Sign In to Continue
          </Button>
        </motion.div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5" />
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent blur-2xl opacity-50 animate-pulse" />
            <Loader2 className="w-12 h-12 text-primary animate-spin relative" />
          </div>
          <p className="text-muted-foreground text-lg">Loading your creations...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 overflow-y-auto relative">
      {/* Static Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] via-transparent to-accent/[0.02]" />
      <div className="absolute inset-0" style={{ 
        backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(34, 211, 238, 0.05) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(168, 85, 247, 0.05) 0%, transparent 40%)' 
      }} />
      
      <div className="max-w-6xl mx-auto relative">
        <motion.div 
          initial={{ opacity: 0, y: -20, translateZ: -20 }}
          animate={{ opacity: 1, y: 0, translateZ: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8"
        >
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-white mb-1 preserve-3d">
              <motion.span 
                initial={{ opacity: 0, translateZ: -10 }}
                animate={{ opacity: 1, translateZ: 0 }}
                className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"
              >
                Studio
              </motion.span>
              {' '}Dashboard
            </h1>
            <p className="text-muted-foreground">Your creative journey in one place</p>
          </div>
          
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh} 
              disabled={isRefreshing}
              className="border-white/10 hover:bg-white/5 glass-card"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} /> 
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </motion.div>
        </motion.div>

        {/* Simple Stats Cards */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
        >
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <Music className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{creations.filter(c => c.type === 'song').length}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Songs</p>
              </div>
            </div>
          </div>
          
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center">
                <Disc className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{creations.filter(c => c.type === 'album').length}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Albums</p>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-green-500/60 flex items-center justify-center">
                <Check className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{completedSongs + completedAlbums}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Completed</p>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-500/60 flex items-center justify-center">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{formatTotalDuration(getTotalDuration())}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Time</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Simple Filter tabs */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex items-center gap-3 mb-6"
        >
          <Filter className="w-4 h-4 text-muted-foreground" />
          <div className="flex gap-2">
            {(['all', 'songs', 'albums'] as FilterType[]).map(f => (
              <button 
                key={f} 
                onClick={() => setFilter(f)} 
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  filter === f 
                    ? 'bg-gradient-to-r from-primary to-accent text-white' 
                    : 'bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Creations List with enhanced cards */}
        {filteredCreations.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.2 }}
            className="glass-card rounded-2xl p-10 sm:p-14 text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-accent/[0.03]" />
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto mb-6">
                <Music className="w-10 h-10 text-primary" />
              </div>
              <h3 className="font-display text-2xl font-bold text-white mb-2">No creations yet</h3>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">Start creating music to see your work here. Describe your musical vision and let AI bring it to life</p>
              <Button 
                onClick={() => onNavigate('create')} 
                variant="glow" 
                size="lg"
                className="px-8"
              >
                <Sparkles className="w-5 h-5 mr-2" /> Create Your First Track
              </Button>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {filteredCreations.map((creation, index) => (
                <CreationCard 
                  key={creation.id} 
                  creation={creation} 
                  index={index} 
                  formatDuration={formatDuration} 
                  formatDate={formatDate} 
                  onNavigate={onNavigate}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

interface CreationCardProps {
  creation: MusicCreation;
  index: number;
  formatDuration: (secs: number) => string;
  formatDate: (date: Date) => string;
  onNavigate: (page: string, params?: Record<string, string>) => void;
}

const CreationCard: React.FC<CreationCardProps> = ({ creation, index, formatDuration, formatDate, onNavigate }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { retryTrack } = useMusic();
  const player = usePlayer();
  const Icon = creation.type === 'song' ? Music : Disc;
  const totalDuration = creation.tracks.reduce((acc, t) => acc + t.duration, 0);
  const isProcessing = isActiveStatus(creation.status) || creation.tracks.some(t => isActiveStatus(t.status));

  const completedTracks = creation.tracks.filter(t => t.audioUrl);

  const handlePlayAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (completedTracks.length === 0) return;
    const playerTracks = completedTracks.map(t => toPlayerTrack(t, creation));
    player.setQueue(playerTracks, 0);
  };

  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  const handleDownloadAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (completedTracks.length === 0) return;
    setIsDownloadingZip(true);
    try {
      toast.loading('Preparing download...', { id: 'download' });
      const zip = new JSZip();
      await Promise.all(completedTracks.map(async (track) => {
        if (track.audioUrl) {
          try {
            const res = await fetch(track.audioUrl);
            const blob = await res.blob();
            zip.file(`${track.title}.wav`, blob);
          } catch (err) {
            console.warn(`Failed to fetch audio for "${track.title}"`, err);
          }
        }
        if (track.videoUrl) {
          try {
            const res = await fetch(track.videoUrl);
            const blob = await res.blob();
            const universalMp4 = await ensureUniversalMp4Blob(blob);
            zip.file(`${track.title}.mp4`, universalMp4);
          } catch (err) {
            console.warn(`Failed to fetch video for "${track.title}"`, err);
          }
        }
      }));
      const content = await zip.generateAsync({ type: 'blob' });
      const blobUrl = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${creation.title}.zip`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast.success('Download started', { id: 'download' });
    } catch {
      toast.error('Download failed', { id: 'download' });
    }
    setIsDownloadingZip(false);
  };

return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -20 }} 
      transition={{ delay: index * 0.05 }}
      className={`glass-card rounded-2xl overflow-hidden relative group transition-all duration-300 ${
        isProcessing ? 'ring-1 ring-primary/30' : ''
      }`}
    >
      {/* Cancel button for active generations - removed from dashboard */}
      {/* 
      {(isProcessing || creation.tracks.some(t => isActiveStatus(t.status))) && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={(e) => handleCancelCreation(creation.id, e)}
          className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-destructive/30 text-destructive hover:bg-destructive/50 flex items-center justify-center backdrop-blur-xl shadow-lg"
          title="Cancel generation"
        >
          <X className="w-4 h-4" />
        </motion.button>
      )}
      */}
    
    <div 
      onClick={() => setIsExpanded(!isExpanded)} 
        className="p-5 sm:p-6 cursor-pointer transition-all duration-300 hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-4 sm:gap-5">
          {/* Icon with glow */}
          <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
            creation.type === 'song' 
              ? 'bg-gradient-to-br from-primary to-primary/60 shadow-lg shadow-primary/20' 
              : 'bg-gradient-to-br from-accent to-accent/60 shadow-lg shadow-accent/20'
          } ${isProcessing ? 'animate-pulse' : ''}`}>
            <Icon className="w-7 h-7 text-white" />
            {isProcessing && (
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 animate-pulse" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <button 
                onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} 
                className="font-display text-lg font-semibold text-white truncate hover:text-primary transition-colors"
              >
                {creation.title}
              </button>
              
              {/* Status badge */}
              <motion.span 
                layout
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  creation.status === 'completed' 
                    ? 'bg-green-500/20 text-green-400 border border-green-500/20' 
                    : creation.status === 'failed' 
                      ? 'bg-red-500/20 text-red-400 border border-red-500/20'
                      : isProcessing
                        ? 'bg-gradient-to-r from-primary/20 to-accent/20 text-primary border border-primary/30'
                        : 'bg-white/10 text-muted-foreground border border-white/10'
                }`}
              >
                {isProcessing && <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />}
                {STATUS_LABELS[creation.status] || creation.status}
                {isProcessing && ` ${Math.round((creation.progress || 0) * 100)}%`}
              </motion.span>
            </div>
            
            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
              <span className="capitalize flex items-center gap-1">
                {creation.type === 'song' ? <Music className="w-3 h-3" /> : <Disc className="w-3 h-3" />}
                {creation.type}
              </span>
              <span>•</span>
              <span>{creation.tracks.length} track{creation.tracks.length !== 1 ? 's' : ''}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(totalDuration)}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(creation.createdAt)}
              </span>
            </div>
            
            {/* Progress bar for active generations */}
            {isProcessing && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 space-y-2"
              >
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <motion.div 
                    className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                    initial={{ width: 0 }}
                    animate={{ width: `${(creation.progress || 0) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono">{Math.round((creation.progress || 0) * 100)}% complete</span>
                  <span>Processing...</span>
                </div>
              </motion.div>
            )}
          </div>
          
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {completedTracks.length > 0 && (
              <>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handlePlayAll}
                  className="w-11 h-11 rounded-xl bg-gradient-to-r from-primary to-accent text-white flex items-center justify-center shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all"
                >
                  <Play className="w-5 h-5 ml-0.5" />
                </motion.button>
                
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleDownloadAll}
                  disabled={isDownloadingZip}
                  className="w-11 h-11 rounded-xl bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white flex items-center justify-center border border-white/10 transition-all"
                >
                  {isDownloadingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                </motion.button>
              </>
            )}
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-11 h-11 rounded-xl bg-white/5 text-muted-foreground hover:bg-white/10 flex items-center justify-center border border-white/10 transition-all"
            >
              <motion.div 
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.3 }}
              >
                <Zap className="w-4 h-4" />
              </motion.div>
            </motion.button>
          </div>
        </div>
        
        {/* Genres */}
        {getCreationGenres(creation).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {getCreationGenres(creation).slice(0, 5).map(genre => (
              <span 
                key={genre} 
                className="px-3 py-1 text-xs rounded-full bg-white/5 text-muted-foreground border border-white/5"
              >
                {genre}
              </span>
            ))}
            {getCreationGenres(creation).length > 5 && (
              <span className="px-3 py-1 text-xs rounded-full bg-white/5 text-muted-foreground border border-white/5">
                +{getCreationGenres(creation).length - 5} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Expanded tracks */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5 bg-black/20"
          >
            <div className="p-4 sm:p-5 space-y-3">
              {creation.tracks.map((track, i) => (
                <TrackRow 
                  key={track.id} 
                  track={track} 
                  index={i} 
                  formatDuration={formatDuration} 
                  creation={creation} 
                  onNavigate={onNavigate} 
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const DASH_PIPELINE_STEPS = [
  { key: 'analyzing', label: 'Analyzing', match: /analyz(?:e|ing).*(?:prompt|composition)/i },
  { key: 'seeding', label: 'Creating DNA', match: /generationdna|seed|dna/i },
  { key: 'planning', label: 'Planning', match: /plan|arrang/i },
  { key: 'composing', label: 'Composing', match: /melody|motif|hook/i },
  { key: 'ai_audio', label: 'AI Audio', match: /\bai\b.*(audio|music|model|segment|instrumental)|loading ai|downloading.*model|musicgen/i },
  { key: 'instrumental', label: 'Synthesizing', match: /synthesi[sz].*instrument|render.*audio|generat.*segment(?!.*\bai)/i },
  { key: 'vocals', label: 'Vocals', match: /vocal|lyric|singing|synthe/i },
  { key: 'vocal_align', label: 'Mixing', match: /align.*vocal|mix.*vocal/i },
  { key: 'mixing', label: 'Mixing', match: /mix(?!.*vocal)/i },
  { key: 'mastering', label: 'Mastering', match: /master/i },
  { key: 'beats', label: 'Beats', match: /analyzing beats|beat structure/i },
  { key: 'video_gen', label: 'Visuals', match: /render.*visual|render.*video|generat.*video/i },
  { key: 'video_enc', label: 'Encoding', match: /encod.*video|optimizing mp4|transcod/i },
  { key: 'finalizing', label: 'Finalizing', match: /finaliz|upload/i },
  { key: 'complete', label: 'Complete', match: /complete/i },
];

const DashboardTrackProgress: React.FC<{
  currentStage: string; progress: number; estimatedTimeLeft: number;
}> = ({ currentStage, progress, estimatedTimeLeft }) => {
  const currentStepIdx = DASH_PIPELINE_STEPS.findIndex(s => s.match.test(currentStage));
  const activeIdx = currentStepIdx >= 0 ? currentStepIdx : 0;

  const formatEta = (secs: number) => {
    if (secs <= 0) return '';
    if (secs >= 60) return `~${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `~${secs}s`;
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="space-y-1">
        {DASH_PIPELINE_STEPS.map((step, idx) => {
          const isComplete = idx < activeIdx;
          const isActive = idx === activeIdx;
          const isPending = idx > activeIdx;
          return (
            <div 
              key={step.key} 
              className={`flex items-center gap-2 text-xs py-1.5 px-2 rounded-md transition-all ${
                isActive ? 'bg-primary/10 border border-primary/20' : ''
              } ${isPending ? 'opacity-30' : ''}`}
            >
              {isComplete ? (
                <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              ) : isActive ? (
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
              )}
              <span className={`font-medium ${
                isActive ? 'text-primary' : isComplete ? 'text-green-400' : 'text-muted-foreground'
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium">Step {activeIdx + 1} of {DASH_PIPELINE_STEPS.length}</span>
        <div className="flex items-center gap-3">
          {estimatedTimeLeft > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatEta(estimatedTimeLeft)} remaining
            </span>
          )}
          <span className="font-mono">{Math.round(progress * 100)}%</span>
        </div>
      </div>
      <Progress value={progress * 100} className="h-2" />
    </div>
  );
};

const TrackRow: React.FC<{ track: Track; index: number; formatDuration: (s: number) => string; creation: MusicCreation; onNavigate: (page: string, params?: Record<string, string>) => void }> = ({ track, index, formatDuration, creation, onNavigate }) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const { retryTrack } = useMusic();
  const player = usePlayer();

  const isCurrentTrack = player.currentTrack?.id === track.id;
  const isTrackPlaying = isCurrentTrack && player.isPlaying;

  const handlePlay = () => {
    if (!track.audioUrl) return;
    if (isCurrentTrack) {
      player.togglePlay();
    } else {
      player.play(toPlayerTrack(track, creation));
    }
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRetrying(true);
    await retryTrack(track.id, creation.id);
    setIsRetrying(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`p-3 rounded-xl transition-all ${
        isCurrentTrack ? 'bg-primary/10 border border-primary/20' : 'bg-white/5 hover:bg-white/10 border border-transparent'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="w-6 text-center text-sm text-muted-foreground font-mono">{index + 1}</span>
        
        {track.audioUrl ? (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handlePlay}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
              isCurrentTrack 
                ? 'bg-gradient-to-r from-primary to-accent text-white' 
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            {isTrackPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </motion.button>
        ) : isActiveStatus(track.status) ? (
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          </div>
        ) : track.status === 'failed' ? (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleRetry}
            disabled={isRetrying}
            className="w-9 h-9 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center"
          >
            {isRetrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          </motion.button>
        ) : (
          <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center">
            <Music className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate('song-detail', { creationId: creation.id, trackId: track.id }); }}
            className={`font-medium text-left truncate hover:text-primary transition-colors ${
              isCurrentTrack ? 'text-primary' : 'text-white'
            }`}
          >
            {track.title}
          </button>
          
          {isActiveStatus(track.status) && (
            <DashboardTrackProgress
              currentStage={track.currentStage || track.status}
              progress={track.progress || 0}
              estimatedTimeLeft={track.estimatedTimeLeft || 0}
            />
          )}
          
          {track.status === 'failed' && track.errorMessage && (
            <p className="text-xs text-red-400/70 truncate mt-0.5">{track.errorMessage}</p>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {(track.status === 'completed' || track.audioUrl) && (
            <Badge variant="secondary" className="bg-green-500/20 text-green-400 text-xs">
              <Check className="w-3 h-3 mr-1" />
              Ready
            </Badge>
          )}
          
          <span className="text-sm text-muted-foreground font-mono">
            {formatDuration(track.duration)}
          </span>
        </div>
      </div>
      
      {track.videoUrl && (
        <div className="mt-3 ml-9 sm:ml-10">
          <div className="glass-card rounded-xl p-3">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
                <MonitorPlay className="w-4 h-4 text-accent" />
              </div>
              <span className="text-xs font-medium text-accent/80">Music Video</span>
            </div>
            <VideoPlayer videoUrl={track.videoUrl} title={track.title} duration={track.duration} />
          </div>
        </div>
      )}
    </motion.div>
  );
};