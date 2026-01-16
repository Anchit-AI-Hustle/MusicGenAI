import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, Disc, Play, Download, Calendar, Clock, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useMusic, MusicCreation } from '@/contexts/MusicContext';

type FilterType = 'all' | 'songs' | 'albums';

interface DashboardPageProps {
  onAuthClick: () => void;
  onNavigate: (page: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onAuthClick, onNavigate }) => {
  const { isAuthenticated, user } = useAuth();
  const { getCreationsByUser } = useMusic();
  const [filter, setFilter] = useState<FilterType>('all');

  const creations = user ? getCreationsByUser(user.id) : [];
  
  const filteredCreations = creations.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'songs') return c.type === 'song';
    if (filter === 'albums') return c.type === 'album';
    return true;
  });

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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
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

  return (
    <div className="min-h-screen p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="font-display text-3xl font-bold text-foreground mb-2">
            Dashboard
          </h1>
          <p className="text-muted-foreground">
            All your music creations in one place
          </p>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
        >
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Music className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-foreground">
                  {creations.filter(c => c.type === 'song').length}
                </p>
                <p className="text-sm text-muted-foreground">Songs</p>
              </div>
            </div>
          </div>
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <Disc className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-foreground">
                  {creations.filter(c => c.type === 'album').length}
                </p>
                <p className="text-sm text-muted-foreground">Albums</p>
              </div>
            </div>
          </div>
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
                <Clock className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-foreground">
                  {creations.reduce((acc, c) => acc + c.tracks.reduce((t, tr) => t + tr.duration, 0), 0)}s
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
          className="flex items-center gap-2 mb-6"
        >
          <Filter className="w-4 h-4 text-muted-foreground" />
          <div className="flex gap-2">
            {(['all', 'songs', 'albums'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth ${
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
            className="glass-card rounded-xl p-12 text-center"
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
          <div className="space-y-4">
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
        className={`p-6 ${creation.type === 'album' ? 'cursor-pointer hover:bg-secondary/30' : ''} transition-smooth`}
      >
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
            creation.type === 'song' ? 'bg-primary/10' : 'bg-accent/10'
          }`}>
            <Icon className={`w-7 h-7 ${creation.type === 'song' ? 'text-primary' : 'text-accent'}`} />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-semibold text-foreground truncate">
              {creation.title}
            </h3>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
              <span className="capitalize">{creation.type}</span>
              <span>•</span>
              <span>{creation.tracks.length} track{creation.tracks.length !== 1 ? 's' : ''}</span>
              <span>•</span>
              <span>{formatDuration(totalDuration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
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
                <Button variant="ghost" size="icon">
                  <Download className="w-5 h-5" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Genres */}
        {creation.genres.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {creation.genres.map(genre => (
              <span
                key={genre}
                className="px-2 py-1 text-xs rounded-full bg-secondary text-muted-foreground"
              >
                {genre}
              </span>
            ))}
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
            <div className="p-4 space-y-2">
              {creation.tracks.map((track, i) => (
                <div
                  key={track.id}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-smooth"
                >
                  <span className="w-6 text-center text-sm text-muted-foreground">
                    {i + 1}
                  </span>
                  <button className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center hover:bg-primary/30 transition-smooth">
                    <Play className="w-4 h-4 text-primary ml-0.5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{track.title}</p>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {formatDuration(track.duration)}
                  </span>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
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
