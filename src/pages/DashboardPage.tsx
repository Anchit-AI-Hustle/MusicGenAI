import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, Disc, Play, Pause, Download, Calendar, Clock, Filter, Loader2, RefreshCw, X, Check, Circle, RotateCcw, ListMusic } from 'lucide-react';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { useMusic, MusicCreation, Track } from '@/contexts/MusicContext';
import { usePlayer, PlayerTrack } from '@/contexts/PlayerContext';

type FilterType = 'all' | 'songs' | 'albums';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting to start',
  analyzing: 'Analyzing inputs',
  planning_structure: 'Planning song structure',
  composing_music: 'Composing patterns',
  generating_instrumental: 'Generating instrumental',
  generating_vocals: 'Generating vocals',
  vocal_alignment: 'Aligning vocals',
  mixing_mastering: 'Mixing & mastering',
  generating_video: 'Generating video',
  encoding_video: 'Encoding video',
  finalizing: 'Finalizing',
  completed: 'Ready',
  failed: 'Failed',
  audio_complete_video_failed: 'Audio ready (video failed)',
};

const ACTIVE_STATUSES = ['analyzing', 'planning_structure', 'composing_music', 'generating_instrumental', 'generating_vocals', 'vocal_alignment', 'mixing_mastering', 'generating_video', 'encoding_video', 'finalizing'];

const isActiveStatus = (status: string) => ACTIVE_STATUSES.includes(status);

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

interface DashboardPageProps {
  onAuthClick: () => void;
  onNavigate: (page: string, params?: Record<string, string>) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onAuthClick, onNavigate }) => {
  const { isAuthenticated } = useAuth();
  const { creations, isLoading, refreshCreations } = useMusic();
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-md">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Music className="w-10 h-10 text-primary" />
          </div>
          <h2 className="font-display text-2xl font-bold text-foreground mb-4">Your Music Awaits</h2>
          <p className="text-muted-foreground mb-8">Sign in to access your music library.</p>
          <Button onClick={onAuthClick} variant="glow" size="lg">Sign In to Continue</Button>
        </motion.div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading your creations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">Dashboard</h1>
            <p className="text-muted-foreground text-sm sm:text-base">All your music creations in one place</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </motion.div>

        {/* Stats */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex items-center gap-4">
              <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Music className="w-5 sm:w-6 h-5 sm:h-6 text-primary" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-display font-bold text-foreground">{creations.filter(c => c.type === 'song').length}</p>
                <p className="text-sm text-muted-foreground">Songs</p>
              </div>
            </div>
          </div>
          <div className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex items-center gap-4">
              <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Disc className="w-5 sm:w-6 h-5 sm:h-6 text-accent" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-display font-bold text-foreground">{creations.filter(c => c.type === 'album').length}</p>
                <p className="text-sm text-muted-foreground">Albums</p>
              </div>
            </div>
          </div>
          <div className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex items-center gap-4">
              <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 sm:w-6 h-5 sm:h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-display font-bold text-foreground">{formatTotalDuration(getTotalDuration())}</p>
                <p className="text-sm text-muted-foreground">Total Duration</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Filter */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex gap-2">
            {(['all', 'songs', 'albums'] as FilterType[]).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth whitespace-nowrap ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Creations List */}
        {filteredCreations.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card rounded-xl p-8 sm:p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
              <Music className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-xl font-semibold text-foreground mb-2">No creations yet</h3>
            <p className="text-muted-foreground mb-6">Start creating music to see your work here</p>
            <Button onClick={() => onNavigate('create')} variant="glow">Create Your First Track</Button>
          </motion.div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            <AnimatePresence>
              {filteredCreations.map((creation, index) => (
                <CreationCard key={creation.id} creation={creation} index={index} formatDuration={formatDuration} formatDate={formatDate} onNavigate={onNavigate} />
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

  const completedTracks = creation.tracks.filter(t => t.status === 'completed' && t.audioUrl);

  const handlePlayAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (completedTracks.length === 0) return;
    const playerTracks = completedTracks.map(t => toPlayerTrack(t, creation));
    player.setQueue(playerTracks, 0);
  };

  const handleDownloadAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    for (const track of completedTracks) {
      if (track.audioUrl) {
        try {
          const response = await fetch(track.audioUrl);
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = `${track.title}_audio.mp3`;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        } catch {
          window.open(track.audioUrl, '_blank');
        }
      }
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ delay: index * 0.05 }} className="glass-card rounded-xl overflow-hidden">
      <div onClick={() => setIsExpanded(!isExpanded)} className="p-4 sm:p-6 cursor-pointer hover:bg-secondary/30 transition-smooth">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className={`w-12 sm:w-14 h-12 sm:h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${creation.type === 'song' ? 'bg-primary/10' : 'bg-accent/10'}`}>
            <Icon className={`w-6 sm:w-7 h-6 sm:h-7 ${creation.type === 'song' ? 'text-primary' : 'text-accent'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-display font-semibold text-foreground truncate">{creation.title}</h3>
              <Badge variant="secondary" className={`text-xs flex-shrink-0 ${creation.status === 'completed' ? 'bg-green-500/20 text-green-400' : creation.status === 'failed' ? 'bg-destructive/20 text-destructive' : isActiveStatus(creation.status) ? 'bg-primary/20 text-primary' : ''}`}>
                {STATUS_LABELS[creation.status] || creation.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground flex-wrap">
              <span className="capitalize">{creation.type}</span>
              <span className="hidden sm:inline">•</span>
              <span>{creation.tracks.length} track{creation.tracks.length !== 1 ? 's' : ''}</span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">{formatDuration(totalDuration)}</span>
            </div>
            {isActiveStatus(creation.status) && (
              <div className="mt-2">
                <Progress value={(creation.progress || 0) * 100} className="h-1.5" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {completedTracks.length > 0 && (
              <Button variant="ghost" size="icon" onClick={handlePlayAll} className="h-10 w-10 rounded-full bg-primary/10 hover:bg-primary/20">
                <Play className="w-5 h-5 text-primary ml-0.5" />
              </Button>
            )}
            <div className="text-right hidden md:block">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                {formatDate(creation.createdAt)}
              </div>
            </div>
          </div>
        </div>
        {creation.genres.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {creation.genres.slice(0, 5).map(genre => (
              <span key={genre} className="px-2 py-1 text-xs rounded-full bg-secondary text-muted-foreground">{genre}</span>
            ))}
            {creation.genres.length > 5 && <span className="px-2 py-1 text-xs rounded-full bg-secondary text-muted-foreground">+{creation.genres.length - 5} more</span>}
          </div>
        )}
      </div>

      {/* Expanded tracks */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-border">
            <div className="p-3 sm:p-4 space-y-2">
              {creation.tracks.map((track, i) => (
                <TrackRow key={track.id} track={track} index={i} formatDuration={formatDuration} creation={creation} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const DASH_PIPELINE_STEPS = [
  { key: 'analyzing', label: 'Analyzing musical vision', icon: '🔍', match: /analyz/i },
  { key: 'planning', label: 'Planning song structure', icon: '🎼', match: /plan/i },
  { key: 'composing', label: 'Composing musical patterns', icon: '🎹', match: /compos/i },
  { key: 'instrumental', label: 'Generating instrumental', icon: '🎵', match: /instrumental|render.*audio|generat.*segment/i },
  { key: 'vocals', label: 'Generating vocals', icon: '🎤', match: /vocal|lyric|singing|synthe/i },
  { key: 'vocal_align', label: 'Aligning & mixing vocals', icon: '🎙️', match: /align.*vocal|mix.*vocal/i },
  { key: 'mixing', label: 'Mixing & mastering', icon: '🎚️', match: /mix|master/i },
  { key: 'video_gen', label: 'Generating video visuals', icon: '🎬', match: /generat.*video/i },
  { key: 'video_enc', label: 'Encoding video', icon: '📹', match: /encod.*video/i },
  { key: 'finalizing', label: 'Finalizing & uploading', icon: '💾', match: /finaliz|upload/i },
  { key: 'complete', label: 'Complete', icon: '✅', match: /complete/i },
];

const DashboardTrackProgress: React.FC<{
  currentStage: string; progress: number; estimatedTimeLeft: number;
}> = ({ currentStage, progress, estimatedTimeLeft }) => {
  const currentStepIdx = DASH_PIPELINE_STEPS.findIndex(s => s.match.test(currentStage));
  const activeIdx = currentStepIdx >= 0 ? currentStepIdx : 0;

  const formatEta = (secs: number) => {
    if (secs <= 0) return '';
    if (secs >= 3600) return `~${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
    if (secs >= 60) return `~${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `~${secs}s`;
  };

  return (
    <div className="mt-3 space-y-2.5">
      <div className="space-y-1">
        {DASH_PIPELINE_STEPS.map((step, idx) => {
          const isComplete = idx < activeIdx;
          const isActive = idx === activeIdx;
          const isPending = idx > activeIdx;
          return (
            <div key={step.key} className={`flex items-center gap-2 text-xs py-1 px-2 rounded-md transition-all ${isActive ? 'bg-primary/10 border border-primary/20' : ''} ${isPending ? 'opacity-30' : ''}`}>
              {isComplete ? <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /> : isActive ? <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" /> : <Circle className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />}
              <span className="mr-0.5">{step.icon}</span>
              <span className={`font-medium ${isActive ? 'text-primary' : isComplete ? 'text-green-400' : 'text-muted-foreground'}`}>{step.label}</span>
            </div>
          );
        })}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium">Step {activeIdx + 1} of {DASH_PIPELINE_STEPS.length}</span>
          <div className="flex items-center gap-3">
            {estimatedTimeLeft > 0 && (
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatEta(estimatedTimeLeft)} remaining</span>
            )}
            <span className="font-mono">{Math.round(progress * 100)}%</span>
          </div>
        </div>
        <Progress value={progress * 100} className="h-2" />
      </div>
    </div>
  );
};

const TrackRow: React.FC<{ track: Track; index: number; formatDuration: (s: number) => string; creation: MusicCreation }> = ({ track, index, formatDuration, creation }) => {
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
    <div className={`p-2 sm:p-3 rounded-lg transition-smooth ${isCurrentTrack ? 'bg-primary/5 border border-primary/20' : 'hover:bg-secondary/50'}`}>
      <div className="flex items-center gap-3 sm:gap-4">
        <span className="w-6 text-center text-sm text-muted-foreground">{index + 1}</span>
        {track.status === 'completed' && track.audioUrl ? (
          <button onClick={handlePlay} className={`w-8 h-8 rounded-full flex items-center justify-center transition-smooth flex-shrink-0 ${isCurrentTrack ? 'bg-primary' : 'bg-primary/20 hover:bg-primary/30'}`}>
            {isTrackPlaying ? <Pause className={`w-4 h-4 ${isCurrentTrack ? 'text-primary-foreground' : 'text-primary'}`} /> : <Play className={`w-4 h-4 ml-0.5 ${isCurrentTrack ? 'text-primary-foreground' : 'text-primary'}`} />}
          </button>
        ) : isActiveStatus(track.status) ? (
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          </div>
        ) : track.status === 'failed' ? (
          <button onClick={handleRetry} disabled={isRetrying} className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center hover:bg-destructive/30 transition-smooth flex-shrink-0">
            {isRetrying ? <Loader2 className="w-4 h-4 text-destructive animate-spin" /> : <RotateCcw className="w-4 h-4 text-destructive" />}
          </button>
        ) : (
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
            <Music className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className={`font-medium truncate ${isCurrentTrack ? 'text-primary' : 'text-foreground'}`}>{track.title}</p>
          {isActiveStatus(track.status) && (
            <DashboardTrackProgress
              currentStage={track.currentStage || track.status}
              progress={track.progress || 0}
              estimatedTimeLeft={track.estimatedTimeLeft || 0}
            />
          )}
          {track.status === 'failed' && track.errorMessage && (
            <p className="text-xs text-destructive/70 truncate mt-0.5">{track.errorMessage}</p>
          )}
        </div>
        <Badge variant="secondary" className={`text-xs hidden sm:inline-flex ${track.status === 'completed' ? 'bg-green-500/20 text-green-400' : track.status === 'failed' ? 'bg-destructive/20 text-destructive' : isActiveStatus(track.status) ? 'bg-primary/20 text-primary' : ''}`}>
          {STATUS_LABELS[track.status] || track.status}
        </Badge>
        {track.status === 'failed' && (
          <Button variant="outline" size="sm" onClick={handleRetry} disabled={isRetrying} className="text-xs h-7 border-destructive/30 text-destructive hover:bg-destructive/10">
            {isRetrying ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RotateCcw className="w-3 h-3 mr-1" />}
            Retry
          </Button>
        )}
        <span className="text-sm text-muted-foreground">{formatDuration(track.duration)}</span>
        {track.status === 'completed' && track.audioUrl && (
          <a href={track.audioUrl} download={`${track.title || 'track'}.wav`}>
            <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:flex"><Download className="w-4 h-4" /></Button>
          </a>
        )}
      </div>
      {track.status === 'completed' && track.videoUrl && (
        <div className="mt-3 ml-9 sm:ml-10">
          <VideoPlayer videoUrl={track.videoUrl} title={track.title} duration={track.duration} />
        </div>
      )}
    </div>
  );
};
