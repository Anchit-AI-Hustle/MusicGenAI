import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, Disc, Play, Pause, Download, Calendar, Clock, Filter, Loader2, RefreshCw, X, Check, Circle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { useMusic, MusicCreation } from '@/contexts/MusicContext';

type FilterType = 'all' | 'songs' | 'albums';

interface DashboardPageProps {
  onAuthClick: () => void;
  onNavigate: (page: string) => void;
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
                <CreationCard key={creation.id} creation={creation} index={index} formatDuration={formatDuration} formatDate={formatDate} />
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
}

const CreationCard: React.FC<CreationCardProps> = ({ creation, index, formatDuration, formatDate }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = creation.type === 'song' ? Music : Disc;
  const totalDuration = creation.tracks.reduce((acc, t) => acc + t.duration, 0);

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
              <Badge variant="secondary" className={`capitalize text-xs flex-shrink-0 ${creation.status === 'completed' ? 'bg-green-500/20 text-green-400' : creation.status === 'failed' ? 'bg-destructive/20 text-destructive' : ''}`}>
                {creation.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground flex-wrap">
              <span className="capitalize">{creation.type}</span>
              <span className="hidden sm:inline">•</span>
              <span>{creation.tracks.length} track{creation.tracks.length !== 1 ? 's' : ''}</span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">{formatDuration(totalDuration)}</span>
            </div>
            {creation.status === 'processing' && (
              <div className="mt-2">
                <Progress value={(creation.progress || 0) * 100} className="h-1.5" />
              </div>
            )}
          </div>
          <div className="text-right hidden md:block">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              {formatDate(creation.createdAt)}
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
                <TrackRow key={track.id} track={track} index={i} formatDuration={formatDuration} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const DASH_PIPELINE_STEPS = [
  { key: 'analyzing', label: 'Analyzing', match: /analyz/i },
  { key: 'expanding', label: 'Production brief', match: /expand/i },
  { key: 'planning', label: 'Planning structure', match: /plan/i },
  { key: 'generating', label: 'Generating segments', match: /generat/i },
  { key: 'downloading', label: 'Downloading audio', match: /download/i },
  { key: 'stitching', label: 'Stitching track', match: /stitch/i },
  { key: 'finalizing', label: 'Finalizing', match: /finaliz/i },
];

const DashboardTrackProgress: React.FC<{
  currentStage: string; progress: number; estimatedTimeLeft: number;
  completedSegments: number; totalSegments: number;
}> = ({ currentStage, progress, estimatedTimeLeft, completedSegments, totalSegments }) => {
  const activeIdx = Math.max(0, DASH_PIPELINE_STEPS.findIndex(s => s.match.test(currentStage)));
  const segMatch = currentStage.match(/\((\d+) of (\d+)\)/);

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2 text-xs">
        <Loader2 className="w-3 h-3 text-primary animate-spin flex-shrink-0" />
        <span className="text-primary font-medium truncate">
          {DASH_PIPELINE_STEPS[activeIdx]?.label || currentStage}
          {activeIdx === 3 && segMatch && ` (${segMatch[1]}/${segMatch[2]})`}
          {activeIdx === 3 && !segMatch && ` (${completedSegments}/${totalSegments})`}
        </span>
        {estimatedTimeLeft > 0 && (
          <span className="text-muted-foreground ml-auto flex-shrink-0">
            ~{estimatedTimeLeft >= 60 ? `${Math.floor(estimatedTimeLeft / 60)}m ${estimatedTimeLeft % 60}s` : `${estimatedTimeLeft}s`}
          </span>
        )}
      </div>
      <Progress value={progress * 100} className="h-1.5" />
      <div className="flex gap-0.5">
        {DASH_PIPELINE_STEPS.map((step, idx) => (
          <div key={step.key} className={`h-1 flex-1 rounded-full ${
            idx < activeIdx ? 'bg-green-400' : idx === activeIdx ? 'bg-primary animate-pulse' : 'bg-muted'
          }`} />
        ))}
      </div>
    </div>
  );
};

const TrackRow: React.FC<{ track: any; index: number; formatDuration: (s: number) => string }> = ({ track, index, formatDuration }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!track.audioUrl) return;
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio(track.audioUrl);
        audioRef.current.onended = () => setIsPlaying(false);
      }
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <div className="p-2 sm:p-3 rounded-lg hover:bg-secondary/50 transition-smooth">
      <div className="flex items-center gap-3 sm:gap-4">
        <span className="w-6 text-center text-sm text-muted-foreground">{index + 1}</span>
        {track.status === 'completed' && track.audioUrl ? (
          <button onClick={togglePlay} className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center hover:bg-primary/30 transition-smooth flex-shrink-0">
            {isPlaying ? <Pause className="w-4 h-4 text-primary" /> : <Play className="w-4 h-4 text-primary ml-0.5" />}
          </button>
        ) : track.status === 'processing' ? (
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          </div>
        ) : track.status === 'failed' ? (
          <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
            <X className="w-4 h-4 text-destructive" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
            <Music className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">{track.title}</p>
          {track.status === 'processing' && (
            <DashboardTrackProgress
              currentStage={track.currentStage || 'pending'}
              progress={track.progress || 0}
              estimatedTimeLeft={track.estimatedTimeLeft || 0}
              completedSegments={track.completedSegments || 0}
              totalSegments={track.totalSegments || 1}
            />
          )}
        </div>
        <Badge variant="secondary" className={`capitalize text-xs hidden sm:inline-flex ${track.status === 'completed' ? 'bg-green-500/20 text-green-400' : track.status === 'failed' ? 'bg-destructive/20 text-destructive' : ''}`}>
          {track.status}
        </Badge>
        <span className="text-sm text-muted-foreground">{formatDuration(track.duration)}</span>
        {track.status === 'completed' && track.audioUrl && (
          <a href={track.audioUrl} download>
            <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:flex"><Download className="w-4 h-4" /></Button>
          </a>
        )}
      </div>
      {/* Full audio controls for completed tracks */}
      {track.status === 'completed' && track.audioUrl && (
        <audio controls className="w-full mt-2 h-8" src={track.audioUrl} />
      )}
    </div>
  );
};
