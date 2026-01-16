import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Music, Disc, Wand2, Clock, Languages, Mic2, Users, 
  Video, Palette, Sparkles, Loader2, Play, Download, ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useMusic, MusicCreation, Track } from '@/contexts/MusicContext';

const GENRES = [
  'Pop', 'Rock', 'Hip Hop', 'R&B', 'Jazz', 'Classical', 'Electronic', 
  'Country', 'Folk', 'Blues', 'Metal', 'Punk', 'Reggae', 'Soul', 
  'Funk', 'Disco', 'House', 'Techno', 'Ambient', 'Indie', 'Alternative',
  'Lo-fi', 'Synthwave', 'Cinematic', 'Orchestral'
];

const LANGUAGES = [
  'Instrumental', 'English', 'Spanish', 'French', 'German', 'Italian',
  'Portuguese', 'Japanese', 'Korean', 'Chinese', 'Hindi', 'Arabic'
];

interface CreateMusicPageProps {
  onAuthClick: () => void;
}

export const CreateMusicPage: React.FC<CreateMusicPageProps> = ({ onAuthClick }) => {
  const { isAuthenticated, user } = useAuth();
  const { addCreation, currentCreation } = useMusic();

  // Mode selection
  const [mode, setMode] = useState<'song' | 'album'>('song');
  const [numberOfSongs, setNumberOfSongs] = useState(5);

  // Form fields
  const [title, setTitle] = useState('');
  const [musicPrompt, setMusicPrompt] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [genreSearch, setGenreSearch] = useState('');
  const [showGenreDropdown, setShowGenreDropdown] = useState(false);
  
  // Duration
  const [durationSeconds, setDurationSeconds] = useState(180);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(3);
  const [seconds, setSeconds] = useState(0);

  // Vocals
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [lyrics, setLyrics] = useState('');

  // Inspiration
  const [artistInspiration, setArtistInspiration] = useState('');

  // Video
  const [generateVideo, setGenerateVideo] = useState(false);
  const [videoStyle, setVideoStyle] = useState('');

  // Loading state
  const [isGenerating, setIsGenerating] = useState(false);

  // Duration sync
  const updateFromSlider = (value: number[]) => {
    const total = value[0];
    setDurationSeconds(total);
    setHours(Math.floor(total / 3600));
    setMinutes(Math.floor((total % 3600) / 60));
    setSeconds(total % 60);
  };

  const updateFromInputs = useCallback(() => {
    const total = hours * 3600 + minutes * 60 + seconds;
    setDurationSeconds(Math.min(total, 3600)); // Max 1 hour
  }, [hours, minutes, seconds]);

  React.useEffect(() => {
    updateFromInputs();
  }, [hours, minutes, seconds, updateFromInputs]);

  const toggleGenre = (genre: string) => {
    setSelectedGenres(prev => 
      prev.includes(genre) 
        ? prev.filter(g => g !== genre)
        : [...prev, genre]
    );
  };

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages(prev => 
      prev.includes(lang) 
        ? prev.filter(l => l !== lang)
        : [...prev, lang]
    );
  };

  const filteredGenres = GENRES.filter(g => 
    g.toLowerCase().includes(genreSearch.toLowerCase())
  );

  const handleGenerate = async () => {
    if (!isAuthenticated) {
      onAuthClick();
      return;
    }

    setIsGenerating(true);

    // Simulate generation (replace with actual API call)
    await new Promise(resolve => setTimeout(resolve, 3000));

    const tracks: Track[] = mode === 'song' 
      ? [{
          id: crypto.randomUUID(),
          title: title || 'Untitled Track',
          duration: durationSeconds,
          createdAt: new Date(),
        }]
      : Array.from({ length: numberOfSongs }, (_, i) => ({
          id: crypto.randomUUID(),
          title: `Track ${i + 1}`,
          duration: durationSeconds,
          createdAt: new Date(),
        }));

    const creation: MusicCreation = {
      id: crypto.randomUUID(),
      userId: user!.id,
      type: mode,
      title: title || (mode === 'song' ? 'Untitled Track' : 'Untitled Album'),
      tracks,
      createdAt: new Date(),
      musicPrompt,
      genres: selectedGenres,
    };

    addCreation(creation);
    setIsGenerating(false);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="font-display text-3xl font-bold text-foreground mb-2">
            Create Music
          </h1>
          <p className="text-muted-foreground">
            Describe your musical vision and let AI bring it to life
          </p>
        </motion.div>

        <div className="grid gap-8">
          {/* Mode Selection */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card rounded-xl p-6"
          >
            <Label className="text-foreground font-medium mb-4 block">Creation Mode</Label>
            <div className="flex gap-4">
              <button
                onClick={() => setMode('song')}
                className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-smooth ${
                  mode === 'song'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <Music className={`w-6 h-6 ${mode === 'song' ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="text-left">
                  <p className={`font-medium ${mode === 'song' ? 'text-foreground' : 'text-muted-foreground'}`}>
                    Single Song
                  </p>
                  <p className="text-sm text-muted-foreground">Create one track</p>
                </div>
              </button>
              <button
                onClick={() => setMode('album')}
                className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-smooth ${
                  mode === 'album'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <Disc className={`w-6 h-6 ${mode === 'album' ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="text-left">
                  <p className={`font-medium ${mode === 'album' ? 'text-foreground' : 'text-muted-foreground'}`}>
                    Album
                  </p>
                  <p className="text-sm text-muted-foreground">Create multiple tracks</p>
                </div>
              </button>
            </div>

            {/* Album track count */}
            <AnimatePresence>
              {mode === 'album' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4"
                >
                  <Label className="text-muted-foreground text-sm mb-2 block">Number of Songs</Label>
                  <div className="flex items-center gap-4">
                    <Input
                      type="number"
                      min={2}
                      max={20}
                      value={numberOfSongs}
                      onChange={(e) => setNumberOfSongs(parseInt(e.target.value) || 2)}
                      className="w-24 bg-input border-border"
                    />
                    <Button variant="aiSuggest" size="sm">
                      <Wand2 className="w-4 h-4 mr-1" />
                      AI Suggest
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass-card rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <Label className="text-foreground font-medium">
                {mode === 'song' ? 'Track Name' : 'Album Name'}
              </Label>
              <Button variant="aiSuggest" size="sm">
                <Wand2 className="w-4 h-4 mr-1" />
                AI Suggest
              </Button>
            </div>
            <Input
              placeholder={mode === 'song' ? 'Enter track name (optional)' : 'Enter album name (optional)'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-input border-border"
            />
          </motion.div>

          {/* Music Prompt */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <Label className="text-foreground font-medium">Music Prompt</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Describe the mood, energy, atmosphere, and imagery
                </p>
              </div>
              <Button variant="aiSuggest" size="sm">
                <Wand2 className="w-4 h-4 mr-1" />
                AI Suggest
              </Button>
            </div>
            <Textarea
              placeholder="e.g., A dreamy, nostalgic sunset vibe with warm synths and gentle beats. Think late summer evenings, golden hour light, and peaceful reflection..."
              value={musicPrompt}
              onChange={(e) => setMusicPrompt(e.target.value)}
              className="bg-input border-border min-h-32 resize-none"
            />
          </motion.div>

          {/* Genres */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="glass-card rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <Label className="text-foreground font-medium">Genres</Label>
              <Button variant="aiSuggest" size="sm">
                <Wand2 className="w-4 h-4 mr-1" />
                AI Suggest
              </Button>
            </div>
            
            {/* Selected genres */}
            {selectedGenres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedGenres.map(genre => (
                  <Badge
                    key={genre}
                    variant="secondary"
                    className="bg-primary/20 text-primary border-primary/30 cursor-pointer hover:bg-primary/30"
                    onClick={() => toggleGenre(genre)}
                  >
                    {genre} ×
                  </Badge>
                ))}
              </div>
            )}

            {/* Genre search dropdown */}
            <div className="relative">
              <Input
                placeholder="Search genres..."
                value={genreSearch}
                onChange={(e) => setGenreSearch(e.target.value)}
                onFocus={() => setShowGenreDropdown(true)}
                className="bg-input border-border"
              />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              
              <AnimatePresence>
                {showGenreDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute z-10 w-full mt-2 max-h-48 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg"
                  >
                    {filteredGenres.map(genre => (
                      <button
                        key={genre}
                        onClick={() => toggleGenre(genre)}
                        className={`w-full text-left px-4 py-2 hover:bg-secondary transition-smooth ${
                          selectedGenres.includes(genre) ? 'bg-primary/10 text-primary' : 'text-foreground'
                        }`}
                      >
                        {genre}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {showGenreDropdown && (
              <div 
                className="fixed inset-0 z-0" 
                onClick={() => setShowGenreDropdown(false)} 
              />
            )}
          </motion.div>

          {/* Duration */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card rounded-xl p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <Label className="text-foreground font-medium">Duration</Label>
              <span className="ml-auto text-lg font-display text-primary">
                {formatDuration(durationSeconds)}
              </span>
            </div>
            
            {/* Slider */}
            <Slider
              value={[durationSeconds]}
              onValueChange={updateFromSlider}
              max={600}
              min={30}
              step={1}
              className="mb-6"
            />

            {/* Time inputs */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={1}
                  value={hours}
                  onChange={(e) => setHours(Math.min(1, parseInt(e.target.value) || 0))}
                  className="w-16 bg-input border-border text-center"
                />
                <span className="text-muted-foreground text-sm">HH</span>
              </div>
              <span className="text-muted-foreground">:</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={minutes}
                  onChange={(e) => setMinutes(Math.min(59, parseInt(e.target.value) || 0))}
                  className="w-16 bg-input border-border text-center"
                />
                <span className="text-muted-foreground text-sm">MM</span>
              </div>
              <span className="text-muted-foreground">:</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={seconds}
                  onChange={(e) => setSeconds(Math.min(59, parseInt(e.target.value) || 0))}
                  className="w-16 bg-input border-border text-center"
                />
                <span className="text-muted-foreground text-sm">SS</span>
              </div>
            </div>
          </motion.div>

          {/* Vocal Language */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="glass-card rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Languages className="w-5 h-5 text-muted-foreground" />
                <Label className="text-foreground font-medium">Vocal Language(s)</Label>
              </div>
              <Button variant="aiSuggest" size="sm">
                <Wand2 className="w-4 h-4 mr-1" />
                AI Suggest
              </Button>
            </div>
            
            {/* Selected languages */}
            {selectedLanguages.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedLanguages.map(lang => (
                  <Badge
                    key={lang}
                    variant="secondary"
                    className="bg-accent/20 text-accent border-accent/30 cursor-pointer hover:bg-accent/30"
                    onClick={() => toggleLanguage(lang)}
                  >
                    {lang} ×
                  </Badge>
                ))}
              </div>
            )}

            <div className="relative">
              <button
                onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                className="w-full flex items-center justify-between px-4 py-3 bg-input border border-border rounded-lg text-left"
              >
                <span className="text-muted-foreground">
                  {selectedLanguages.length === 0 ? 'Select languages...' : 'Add more languages'}
                </span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
              
              <AnimatePresence>
                {showLanguageDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute z-10 w-full mt-2 max-h-48 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg"
                  >
                    {LANGUAGES.map(lang => (
                      <button
                        key={lang}
                        onClick={() => toggleLanguage(lang)}
                        className={`w-full text-left px-4 py-2 hover:bg-secondary transition-smooth ${
                          selectedLanguages.includes(lang) ? 'bg-accent/10 text-accent' : 'text-foreground'
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {showLanguageDropdown && (
              <div 
                className="fixed inset-0 z-0" 
                onClick={() => setShowLanguageDropdown(false)} 
              />
            )}
          </motion.div>

          {/* Lyrics */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-card rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Mic2 className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label className="text-foreground font-medium">Lyrics or Vocal Theme</Label>
                  <p className="text-sm text-muted-foreground">
                    Themes, stories, or full lyrics
                  </p>
                </div>
              </div>
              <Button variant="aiSuggest" size="sm">
                <Wand2 className="w-4 h-4 mr-1" />
                AI Suggest
              </Button>
            </div>
            <Textarea
              placeholder="e.g., A story about finding hope after loss, themes of renewal and resilience..."
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              className="bg-input border-border min-h-32 resize-none"
            />
          </motion.div>

          {/* Artist Inspiration */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="glass-card rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-muted-foreground" />
                <Label className="text-foreground font-medium">Artist Inspiration</Label>
              </div>
              <Button variant="aiSuggest" size="sm">
                <Wand2 className="w-4 h-4 mr-1" />
                AI Suggest
              </Button>
            </div>
            <Input
              placeholder="e.g., Tame Impala, Daft Punk, Billie Eilish..."
              value={artistInspiration}
              onChange={(e) => setArtistInspiration(e.target.value)}
              className="bg-input border-border"
            />
          </motion.div>

          {/* Video Toggle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-card rounded-xl p-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label className="text-foreground font-medium">Generate Video</Label>
                  <p className="text-sm text-muted-foreground">
                    Create a visual accompaniment
                  </p>
                </div>
              </div>
              <Switch
                checked={generateVideo}
                onCheckedChange={setGenerateVideo}
              />
            </div>

            {/* Video Style */}
            <AnimatePresence>
              {generateVideo && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Palette className="w-5 h-5 text-muted-foreground" />
                      <Label className="text-foreground font-medium">Video Style</Label>
                    </div>
                    <Button variant="aiSuggest" size="sm">
                      <Wand2 className="w-4 h-4 mr-1" />
                      AI Suggest
                    </Button>
                  </div>
                  <Input
                    placeholder="e.g., Abstract geometric visuals, neon colors, slow motion..."
                    value={videoStyle}
                    onChange={(e) => setVideoStyle(e.target.value)}
                    className="bg-input border-border"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Generate Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
          >
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              variant="glow"
              size="xl"
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate {mode === 'song' ? 'Song' : 'Album'}
                </>
              )}
            </Button>
          </motion.div>

          {/* Output Section */}
          <AnimatePresence>
            {currentCreation && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="glass-card rounded-xl p-6 border-primary/30"
              >
                <h3 className="font-display text-xl font-semibold text-foreground mb-4">
                  Your {currentCreation.type === 'song' ? 'Track' : 'Album'}
                </h3>
                
                <div className="space-y-4">
                  {currentCreation.tracks.map((track, index) => (
                    <div
                      key={track.id}
                      className="flex items-center gap-4 p-4 bg-secondary/50 rounded-lg"
                    >
                      <button className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:opacity-90 transition-smooth">
                        <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
                      </button>
                      <div className="flex-1">
                        <p className="font-medium text-foreground">
                          {currentCreation.type === 'album' && `${index + 1}. `}
                          {track.title}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDuration(track.duration)}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon">
                        <Download className="w-5 h-5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
