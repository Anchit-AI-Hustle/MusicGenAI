import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, Disc, Play, Download, Calendar, Clock, Filter, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useMusic, MusicCreation } from '@/contexts/MusicContext';

type FilterType = 'all' | 'songs' | 'albums';

interface DashboardPageProps {
  onAuthClick: () => void;
  onNavigate: (page: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onAuthClick, onNavigate }) => {
  const { isAuthenticated, user } = useAuth();
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

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  const getTotalDuration = () => {
    return creations.reduce((acc, c) => {
      const tracksDuration = c.tracks.reduce((t, tr) => t + tr.duration, 0);
      return acc + tracksDuration;
    }, 0);
  };

  const formatTotalDuration = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Music className="w-10 h-10 text-primary" />
          </div>
          <h2 className="font-display text-2xl font-bold text-foreground mb-4">
            Your Music Awaits
          </h2>
          <p className="text-muted-foreground mb-8">
            Sign in to access your music library and see all your creations in one place.
          </p>
          <Button onClick={onAuthClick} variant="glow" size="lg">
            Sign In to Continue
          </Button>
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
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8"
        >
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">
              Dashboard
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              All your music creations in one place
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8"
        >
          <div className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex items-center gap-4">
              <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Music className="w-5 sm:w-6 h-5 sm:h-6 text-primary" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-display font-bold text-foreground">
                  {creations.filter(c => c.type === 'song').length}
                </p>
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
                <p className="text-xl sm:text-2xl font-display font-bold text-foreground">
                  {creations.filter(c => c.type === 'album').length}
                </p>
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
                <p className="text-xl sm:text-2xl font-display font-bold text-foreground">
                  {formatTotalDuration(getTotalDuration())}
                </p>
                <p className="text-sm text-muted-foreground">Total Duration</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Filter */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex items-center gap-2 mb-6 overflow-x-auto pb-2"
        >
          <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex gap-2">
            {(['all', 'songs', 'albums'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth whitespace-nowrap ${
                  filter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Creations List */}
        {filteredCreations.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card rounded-xl p-8 sm:p-12 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
              <Music className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-xl font-semibold text-foreground mb-2">
              No creations yet
            </h3>
            <p className="text-muted-foreground mb-6">
              Start creating music to see your work here
            </p>
            <Button onClick={() => onNavigate('create')} variant="glow">
              Create Your First Track
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            <AnimatePresence>
              {filteredCreations.map((creation, index) => (
                <CreationCard
                  key={creation.id}
                  creation={creation}
                  index={index}
                  formatDuration={formatDuration}
                  formatDate={formatDate}
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
}

const CreationCard: React.FC<CreationCardProps> = ({ 
  creation, 
  index, 
  formatDuration, 
  formatDate 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = creation.type === 'song' ? Music : Disc;
  
  const totalDuration = creation.tracks.reduce((acc, t) => acc + t.duration, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ delay: index * 0.05 }}
      className="glass-card rounded-xl overflow-hidden"
    >
      <div
        onClick={() => creation.type === 'album' && setIsExpanded(!isExpanded)}
        className={`p-4 sm:p-6 ${creation.type === 'album' ? 'cursor-pointer hover:bg-secondary/30' : ''} transition-smooth`}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <div className={`w-12 sm:w-14 h-12 sm:h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${
            creation.type === 'song' ? 'bg-primary/10' : 'bg-accent/10'
          }`}>
            <Icon className={`w-6 sm:w-7 h-6 sm:h-7 ${creation.type === 'song' ? 'text-primary' : 'text-accent'}`} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-display font-semibold text-foreground truncate">
                {creation.title}
              </h3>
              <Badge variant="secondary" className="capitalize text-xs flex-shrink-0">
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
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-right hidden md:block">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                {formatDate(creation.createdAt)}
              </div>
            </div>
            
            {creation.type === 'song' && (
              <div className="flex items-center gap-2">
                <button className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:opacity-90 transition-smooth">
                  <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
                </button>
                <Button variant="ghost" size="icon" className="hidden sm:flex">
                  <Download className="w-5 h-5" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Genres */}
        {creation.genres.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {creation.genres.slice(0, 5).map(genre => (
              <span
                key={genre}
                className="px-2 py-1 text-xs rounded-full bg-secondary text-muted-foreground"
              >
                {genre}
              </span>
            ))}
            {creation.genres.length > 5 && (
              <span className="px-2 py-1 text-xs rounded-full bg-secondary text-muted-foreground">
                +{creation.genres.length - 5} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Expanded album tracks */}
      <AnimatePresence>
        {creation.type === 'album' && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border"
          >
            <div className="p-3 sm:p-4 space-y-2">
              {creation.tracks.map((track, i) => (
                <div
                  key={track.id}
                  className="flex items-center gap-3 sm:gap-4 p-2 sm:p-3 rounded-lg hover:bg-secondary/50 transition-smooth"
                >
                  <span className="w-6 text-center text-sm text-muted-foreground">
                    {i + 1}
                  </span>
                  <button className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center hover:bg-primary/30 transition-smooth flex-shrink-0">
                    <Play className="w-4 h-4 text-primary ml-0.5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{track.title}</p>
                  </div>
                  <Badge variant="secondary" className="capitalize text-xs hidden sm:inline-flex">
                    {track.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {formatDuration(track.duration)}
                  </span>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:flex">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
