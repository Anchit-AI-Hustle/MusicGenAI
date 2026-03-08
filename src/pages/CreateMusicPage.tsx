import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Music, Disc, Wand2, Clock, Languages, Mic2, Users, 
  Video, Palette, Sparkles, Loader2, Play, Pause, Download, ChevronDown, X,
  RefreshCw, Zap, Trash2, Activity, AudioWaveform, Share2, Check, Circle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { useMusic } from '@/contexts/MusicContext';
import { GENRES, LANGUAGES } from '@/data/genres';
import { toast } from 'sonner';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting to start',
  analyzing: 'Analyzing inputs',
  planning_structure: 'Planning song structure',
  generating_midi: 'Composing patterns',
  rendering_audio: 'Rendering audio',
  mixing_mastering: 'Mixing & mastering',
  finalizing: 'Finalizing',
  completed: 'Ready',
  failed: 'Failed',
};

const ACTIVE_STATUSES = ['analyzing', 'planning_structure', 'generating_midi', 'rendering_audio', 'mixing_mastering', 'finalizing'];

interface CreateMusicPageProps {
  onAuthClick: () => void;
}

const VOCAL_STRUCTURE_PRESETS = [
  'Verse – Chorus – Verse – Chorus',
  'Verse – Chorus – Bridge – Chorus',
  'Build – Drop – Build – Drop',
  'Continuous Vocal Flow',
  'Instrumental',
];

const VOCAL_STYLE_PRESETS = [
  'Male Vocal',
  'Female Vocal',
  'Robotic Vocal',
  'Rap Vocal',
  'Choir Vocal',
  'Whisper Vocal',
];

const VOCAL_EFFECTS_OPTIONS = [
  'Reverb',
  'Delay',
  'Chorus',
  'Distortion',
  'Autotune',
  'Vocoder',
];

export const CreateMusicPage: React.FC<CreateMusicPageProps> = ({ onAuthClick }) => {
  const { isAuthenticated } = useAuth();
  const { createMusic, currentCreation, isCreating, aiSuggest } = useMusic();

  const [mode, setMode] = useState<'song' | 'album'>('song');
  const [numberOfSongs, setNumberOfSongs] = useState(5);
  const [title, setTitle] = useState('');
  const [musicPrompt, setMusicPrompt] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [genreSearch, setGenreSearch] = useState('');
  const [showGenreDropdown, setShowGenreDropdown] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(180);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(3);
  const [seconds, setSeconds] = useState(0);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [lyrics, setLyrics] = useState('');
  const [artistInspiration, setArtistInspiration] = useState('');
  const [generateVideo, setGenerateVideo] = useState(false);
  const [videoStyle, setVideoStyle] = useState('');

  // New fields
  const [tempoBpm, setTempoBpm] = useState(120);
  const [mood, setMood] = useState('');
  const [musicalKey, setMusicalKey] = useState('D minor');
  const [vocalStructure, setVocalStructure] = useState('Instrumental');
  const [showVocalStructureDropdown, setShowVocalStructureDropdown] = useState(false);
  const [vocalStyle, setVocalStyle] = useState('');
  const [showVocalStyleDropdown, setShowVocalStyleDropdown] = useState(false);
  const [vocalIntensity, setVocalIntensity] = useState(5);
  const [selectedVocalEffects, setSelectedVocalEffects] = useState<string[]>([]);
  const [showVocalEffectsDropdown, setShowVocalEffectsDropdown] = useState(false);

  // Track which field+action pairs are loading (supports parallel)
  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set());

  // Audio player state
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const getFormContext = () => ({
    title, musicPrompt, genres: selectedGenres, durationSeconds,
    vocalLanguages: selectedLanguages, lyrics, artistInspiration, videoStyle,
    tempoBpm, mood, musicalKey, vocalStructure, vocalStyle, vocalIntensity, vocalEffects: selectedVocalEffects,
  });

  // Apply value directly to a field
  const applyToField = (field: string, value: string) => {
    switch (field) {
      case 'trackName': setTitle(value); break;
      case 'prompt': setMusicPrompt(value); break;
      case 'genres':
        const suggested = value.split(',').map(g => g.trim()).filter(g => GENRES.includes(g));
        if (suggested.length > 0) setSelectedGenres(suggested);
        break;
      case 'lyrics': setLyrics(value); break;
      case 'artistInspiration': setArtistInspiration(value); break;
      case 'vocalLanguage':
        const langs = value.split(',').map(l => l.trim()).filter(l => LANGUAGES.includes(l));
        if (langs.length > 0) setSelectedLanguages(langs);
        break;
      case 'videoStyle': setVideoStyle(value); break;
      case 'tempoBpm': {
        const parsed = parseInt(value);
        if (!isNaN(parsed)) setTempoBpm(Math.max(60, Math.min(200, parsed)));
        break;
      }
      case 'mood': setMood(value); break;
      case 'musicalKey': setMusicalKey(value); break;
      case 'vocalStructure': setVocalStructure(value); break;
      case 'vocalStyle': setVocalStyle(value); break;
      case 'vocalIntensity': {
        const parsed = parseInt(value);
        if (!isNaN(parsed)) setVocalIntensity(Math.max(1, Math.min(10, parsed)));
        break;
      }
      case 'vocalEffects': {
        const effects = value.split(',').map(e => e.trim()).filter(Boolean);
        setSelectedVocalEffects(effects);
        break;
      }
    }
  };

  const getFieldValue = (field: string): string => {
    switch (field) {
      case 'trackName': return title;
      case 'prompt': return musicPrompt;
      case 'genres': return selectedGenres.join(', ');
      case 'lyrics': return lyrics;
      case 'artistInspiration': return artistInspiration;
      case 'vocalLanguage': return selectedLanguages.join(', ');
      case 'videoStyle': return videoStyle;
      case 'tempoBpm': return String(tempoBpm);
      case 'mood': return mood;
      case 'musicalKey': return musicalKey;
      case 'vocalStructure': return vocalStructure;
      case 'vocalStyle': return vocalStyle;
      case 'vocalIntensity': return String(vocalIntensity);
      case 'vocalEffects': return selectedVocalEffects.join(', ');
      default: return '';
    }
  };

  const startLoading = (key: string) => setLoadingActions(prev => new Set(prev).add(key));
  const stopLoading = (key: string) => setLoadingActions(prev => { const next = new Set(prev); next.delete(key); return next; });

  // Instant AI Suggest — applies directly (parallel-safe)
  const handleAiSuggest = async (field: string) => {
    const key = `suggest-${field}`;
    startLoading(key);
    const suggestion = await aiSuggest(field, getFieldValue(field), getFormContext(), 'suggest');
    stopLoading(key);
    if (suggestion) applyToField(field, suggestion);
  };

  // Instant Enhance — applies directly (parallel-safe)
  const handleEnhance = async (field: string) => {
    const currentVal = getFieldValue(field);
    if (!currentVal.trim()) {
      toast.error('Nothing to enhance — add some content first');
      return;
    }
    const key = `enhance-${field}`;
    startLoading(key);
    const enhanced = await aiSuggest(field, currentVal, getFormContext(), 'enhance');
    stopLoading(key);
    if (enhanced) applyToField(field, enhanced);
  };

  // New Suggestions — generates fresh and applies directly (parallel-safe)
  const handleNewSuggestion = async (field: string) => {
    const key = `new-${field}`;
    startLoading(key);
    const suggestion = await aiSuggest(field, '', getFormContext(), 'suggest');
    stopLoading(key);
    if (suggestion) applyToField(field, suggestion);
  };

  // Clear field
  const handleClear = (field: string) => {
    switch (field) {
      case 'trackName': setTitle(''); break;
      case 'prompt': setMusicPrompt(''); break;
      case 'genres': setSelectedGenres([]); break;
      case 'lyrics': setLyrics(''); break;
      case 'artistInspiration': setArtistInspiration(''); break;
      case 'vocalLanguage': setSelectedLanguages([]); break;
      case 'videoStyle': setVideoStyle(''); break;
      case 'tempoBpm': setTempoBpm(120); break;
      case 'mood': setMood(''); break;
      case 'musicalKey': setMusicalKey('D minor'); break;
      case 'vocalStructure': setVocalStructure('Instrumental'); break;
      case 'vocalStyle': setVocalStyle(''); break;
      case 'vocalIntensity': setVocalIntensity(5); break;
      case 'vocalEffects': setSelectedVocalEffects([]); break;
    }
  };

  const updateFromSlider = (value: number[]) => {
    const total = value[0];
    setDurationSeconds(total);
    setHours(Math.floor(total / 3600));
    setMinutes(Math.floor((total % 3600) / 60));
    setSeconds(total % 60);
  };

  const updateFromInputs = useCallback(() => {
    const total = hours * 3600 + minutes * 60 + seconds;
    setDurationSeconds(Math.min(total, 3600));
  }, [hours, minutes, seconds]);

  React.useEffect(() => { updateFromInputs(); }, [hours, minutes, seconds, updateFromInputs]);

  const toggleGenre = (genre: string) => {
    setSelectedGenres(prev => prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]);
  };

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]);
  };

  const toggleVocalEffect = (effect: string) => {
    setSelectedVocalEffects(prev => prev.includes(effect) ? prev.filter(e => e !== effect) : [...prev, effect]);
  };

  const filteredGenres = GENRES.filter(g => g.toLowerCase().includes(genreSearch.toLowerCase()));

  const handleGenerate = async () => {
    if (!isAuthenticated) { onAuthClick(); return; }
    await createMusic({
      type: mode,
      title: title || (mode === 'song' ? 'Untitled Track' : 'Untitled Album'),
      musicPrompt, genres: selectedGenres, durationSeconds, generateVideo,
      vocalLanguages: selectedLanguages,
      lyrics: lyrics || undefined,
      artistInspiration: artistInspiration || undefined,
      videoStyle: generateVideo ? videoStyle : undefined,
      numberOfTracks: mode === 'album' ? numberOfSongs : 1,
      tempoBpm,
      mood: mood || undefined,
      musicalKey,
      vocalStructure,
      vocalStyle: vocalStyle || undefined,
      vocalIntensity,
      vocalEffects: selectedVocalEffects,
    });
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const togglePlay = (trackId: string, audioUrl: string) => {
    if (playingTrackId === trackId) {
      audioRef.current?.pause();
      setPlayingTrackId(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(audioUrl);
      audio.play();
      audio.onended = () => setPlayingTrackId(null);
      audioRef.current = audio;
      setPlayingTrackId(trackId);
    }
  };

  const isFieldLoading = (field: string) => 
    loadingActions.has(`suggest-${field}`) || loadingActions.has(`enhance-${field}`) || loadingActions.has(`new-${field}`);

  const getActiveAction = (field: string): string => {
    if (loadingActions.has(`suggest-${field}`)) return 'suggest';
    if (loadingActions.has(`enhance-${field}`)) return 'enhance';
    if (loadingActions.has(`new-${field}`)) return 'new';
    return '';
  };

  // AI Action Toolbar for each field
  const AiToolbar: React.FC<{ field: string }> = ({ field }) => {
    const fieldLoading = isFieldLoading(field);
    const currentAction = getActiveAction(field);
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAiSuggest(field)}
          disabled={currentAction === 'suggest'}
          className="text-xs h-7 px-2 border-primary/30 text-primary hover:bg-primary/10"
        >
          {currentAction === 'suggest' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wand2 className="w-3 h-3 mr-1" />}
          AI Suggest
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleEnhance(field)}
          disabled={currentAction === 'enhance'}
          className="text-xs h-7 px-2 border-accent/30 text-accent hover:bg-accent/10"
        >
          {currentAction === 'enhance' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
          Enhance
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleNewSuggestion(field)}
          disabled={currentAction === 'new'}
          className="text-xs h-7 px-2 border-muted-foreground/30 text-muted-foreground hover:bg-muted/50"
        >
          {currentAction === 'new' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
          New
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleClear(field)}
          disabled={fieldLoading}
          className="text-xs h-7 px-2 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="w-3 h-3 mr-1" />
          Clear
        </Button>
      </div>
    );
  };

  // ===== Pipeline Progress Component =====
  const PIPELINE_STEPS = [
    { key: 'analyzing', label: 'Analyzing musical vision', icon: '🔍', match: /analyz/i },
    { key: 'planning', label: 'Planning song structure', icon: '🎼', match: /plan/i },
    { key: 'midi', label: 'Composing MIDI patterns', icon: '🎹', match: /midi|compos/i },
    { key: 'rendering', label: 'Rendering audio synthesis', icon: '🎵', match: /render/i },
    { key: 'mixing', label: 'Mixing & mastering', icon: '🎚️', match: /mix|master/i },
    { key: 'finalizing', label: 'Finalizing & uploading', icon: '💾', match: /finaliz|upload/i },
    { key: 'complete', label: 'Complete', icon: '✅', match: /complete/i },
  ];

  const PipelineProgress: React.FC<{
    currentStage: string; progress: number; estimatedTimeLeft: number;
    completedSegments: number; totalSegments: number;
  }> = ({ currentStage, progress, estimatedTimeLeft }) => {
    const currentStepIdx = PIPELINE_STEPS.findIndex(s => s.match.test(currentStage));
    const activeIdx = currentStepIdx >= 0 ? currentStepIdx : 0;

    const formatEta = (secs: number) => {
      if (secs <= 0) return '';
      if (secs >= 3600) return `~${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
      if (secs >= 60) return `~${Math.floor(secs / 60)}m ${secs % 60}s`;
      return `~${secs}s`;
    };

    return (
      <div className="mt-4 space-y-3">
        {/* Step indicators */}
        <div className="space-y-1.5">
          {PIPELINE_STEPS.map((step, idx) => {
            const isComplete = idx < activeIdx;
            const isActive = idx === activeIdx;
            const isPending = idx > activeIdx;

            return (
              <div key={step.key} className={`flex items-center gap-2.5 text-xs py-1 px-2 rounded-md transition-all ${
                isActive ? 'bg-primary/10 border border-primary/20' : ''
              } ${isPending ? 'opacity-30' : ''}`}>
              {isComplete ? (
                  <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                ) : isActive ? (
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
                )}
                <span className="mr-1">{step.icon}</span>
                <span className={`font-medium ${isActive ? 'text-primary' : isComplete ? 'text-green-400' : 'text-muted-foreground'}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Overall progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Step {activeIdx + 1} of {PIPELINE_STEPS.length}</span>
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

        {/* Segment sub-progress during generation */}
      </div>
    );
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 sm:mb-8">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">Create Music</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Describe your musical vision and let AI bring it to life</p>
        </motion.div>

        <div className="grid gap-6 sm:gap-8">
          {/* Mode Selection */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card rounded-xl p-4 sm:p-6">
            <Label className="text-foreground font-medium mb-4 block">Creation Mode</Label>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <button onClick={() => setMode('song')} className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-smooth ${mode === 'song' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                <Music className={`w-6 h-6 ${mode === 'song' ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="text-left">
                  <p className={`font-medium ${mode === 'song' ? 'text-foreground' : 'text-muted-foreground'}`}>Single Song</p>
                  <p className="text-sm text-muted-foreground">Create one track</p>
                </div>
              </button>
              <button onClick={() => setMode('album')} className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-smooth ${mode === 'album' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                <Disc className={`w-6 h-6 ${mode === 'album' ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="text-left">
                  <p className={`font-medium ${mode === 'album' ? 'text-foreground' : 'text-muted-foreground'}`}>Album</p>
                  <p className="text-sm text-muted-foreground">Create multiple tracks</p>
                </div>
              </button>
            </div>
            <AnimatePresence>
              {mode === 'album' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4">
                  <Label className="text-muted-foreground text-sm mb-2 block">Number of Songs</Label>
                  <div className="flex items-center gap-4">
                    <Input type="number" min={2} max={20} value={numberOfSongs} onChange={(e) => setNumberOfSongs(parseInt(e.target.value) || 2)} className="w-24 bg-input border-border" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Title */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
              <Label className="text-foreground font-medium">{mode === 'song' ? 'Track Name' : 'Album Name'}</Label>
              <AiToolbar field="trackName" />
            </div>
            <Input placeholder={mode === 'song' ? 'Enter track name (optional)' : 'Enter album name (optional)'} value={title} onChange={(e) => setTitle(e.target.value)} className="bg-input border-border" />
          </motion.div>

          {/* Music Prompt */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <Label className="text-foreground font-medium">Music Prompt</Label>
                  <p className="text-sm text-muted-foreground mt-1">Describe the mood, energy, atmosphere, and imagery</p>
                </div>
              </div>
              <AiToolbar field="prompt" />
            </div>
            <Textarea placeholder="e.g., A dreamy, nostalgic sunset vibe with warm synths and gentle beats..." value={musicPrompt} onChange={(e) => setMusicPrompt(e.target.value)} className="bg-input border-border min-h-32 resize-none" />
          </motion.div>

          {/* Genres */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
              <Label className="text-foreground font-medium">Genres</Label>
              <AiToolbar field="genres" />
            </div>
            {selectedGenres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedGenres.map(genre => (
                  <Badge key={genre} variant="secondary" className="bg-primary/20 text-primary border-primary/30 cursor-pointer hover:bg-primary/30" onClick={() => toggleGenre(genre)}>
                    {genre} ×
                  </Badge>
                ))}
              </div>
            )}
            <div className="relative">
              <Input placeholder="Search genres..." value={genreSearch} onChange={(e) => setGenreSearch(e.target.value)} onFocus={() => setShowGenreDropdown(true)} className="bg-input border-border" />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <AnimatePresence>
                {showGenreDropdown && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute z-10 w-full mt-2 max-h-48 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                    {filteredGenres.slice(0, 50).map(genre => (
                      <button key={genre} onClick={() => toggleGenre(genre)} className={`w-full text-left px-4 py-2 hover:bg-secondary transition-smooth ${selectedGenres.includes(genre) ? 'bg-primary/10 text-primary' : 'text-foreground'}`}>
                        {genre}
                      </button>
                    ))}
                    {filteredGenres.length > 50 && (
                      <div className="px-4 py-2 text-sm text-muted-foreground">Type to search {filteredGenres.length - 50} more...</div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {showGenreDropdown && <div className="fixed inset-0 z-0" onClick={() => setShowGenreDropdown(false)} />}
          </motion.div>

          {/* Tempo (BPM) */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-muted-foreground" />
                <Label className="text-foreground font-medium">Tempo (BPM)</Label>
                <span className="ml-2 text-lg font-display text-primary">{tempoBpm} BPM</span>
              </div>
              <AiToolbar field="tempoBpm" />
            </div>
            <Slider
              value={[tempoBpm]}
              onValueChange={(v) => setTempoBpm(v[0])}
              min={60}
              max={200}
              step={1}
              className="mb-3"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>60 BPM (Slow)</span>
              <span>200 BPM (Fast)</span>
            </div>
          </motion.div>

          {/* Duration */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <Label className="text-foreground font-medium">Duration</Label>
              <span className="ml-auto text-lg font-display text-primary">{formatDuration(durationSeconds)}</span>
            </div>
            <Slider value={[durationSeconds]} onValueChange={updateFromSlider} max={600} min={30} step={1} className="mb-6" />
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Input type="number" min={0} max={1} value={hours} onChange={(e) => setHours(Math.min(1, parseInt(e.target.value) || 0))} className="w-14 sm:w-16 bg-input border-border text-center" />
                <span className="text-muted-foreground text-sm">HH</span>
              </div>
              <span className="text-muted-foreground">:</span>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(Math.min(59, parseInt(e.target.value) || 0))} className="w-14 sm:w-16 bg-input border-border text-center" />
                <span className="text-muted-foreground text-sm">MM</span>
              </div>
              <span className="text-muted-foreground">:</span>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} max={59} value={seconds} onChange={(e) => setSeconds(Math.min(59, parseInt(e.target.value) || 0))} className="w-14 sm:w-16 bg-input border-border text-center" />
                <span className="text-muted-foreground text-sm">SS</span>
              </div>
            </div>
          </motion.div>

          {/* Mood */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.31 }} className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
              <Label className="text-foreground font-medium">Mood</Label>
              <AiToolbar field="mood" />
            </div>
            <Input placeholder="e.g., Dark, euphoric, melancholic, aggressive..." value={mood} onChange={(e) => setMood(e.target.value)} className="bg-input border-border" />
          </motion.div>

          {/* Musical Key */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }} className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
              <Label className="text-foreground font-medium">Musical Key</Label>
              <AiToolbar field="musicalKey" />
            </div>
            <div className="relative">
              <select value={musicalKey} onChange={(e) => setMusicalKey(e.target.value)} className="w-full px-4 py-3 bg-input border border-border rounded-lg text-foreground appearance-none cursor-pointer">
                {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].flatMap(note =>
                  ['minor', 'major', 'dorian', 'phrygian'].map(scale => (
                    <option key={`${note} ${scale}`} value={`${note} ${scale}`}>{note} {scale}</option>
                  ))
                )}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </motion.div>

          {/* Vocal Structure */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.33 }} className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
              <div className="flex items-center gap-2">
                <AudioWaveform className="w-5 h-5 text-muted-foreground" />
                <Label className="text-foreground font-medium">Vocal Structure</Label>
              </div>
              <AiToolbar field="vocalStructure" />
            </div>
            <div className="relative">
              <Input
                placeholder="Type or select a vocal structure..."
                value={vocalStructure}
                onChange={(e) => setVocalStructure(e.target.value)}
                onFocus={() => setShowVocalStructureDropdown(true)}
                className="bg-input border-border"
              />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <AnimatePresence>
                {showVocalStructureDropdown && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute z-10 w-full mt-2 max-h-48 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                    {VOCAL_STRUCTURE_PRESETS.map(preset => (
                      <button key={preset} onClick={() => { setVocalStructure(preset); setShowVocalStructureDropdown(false); }} className={`w-full text-left px-4 py-2 hover:bg-secondary transition-smooth ${vocalStructure === preset ? 'bg-primary/10 text-primary' : 'text-foreground'}`}>
                        {preset}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {showVocalStructureDropdown && <div className="fixed inset-0 z-0" onClick={() => setShowVocalStructureDropdown(false)} />}
          </motion.div>

          {/* Vocal Style */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34 }} className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
              <div className="flex items-center gap-2">
                <Mic2 className="w-5 h-5 text-muted-foreground" />
                <Label className="text-foreground font-medium">Vocal Style</Label>
              </div>
              <AiToolbar field="vocalStyle" />
            </div>
            <div className="relative">
              <Input
                placeholder="Type or select a vocal style..."
                value={vocalStyle}
                onChange={(e) => setVocalStyle(e.target.value)}
                onFocus={() => setShowVocalStyleDropdown(true)}
                className="bg-input border-border"
              />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <AnimatePresence>
                {showVocalStyleDropdown && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute z-10 w-full mt-2 max-h-48 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                    {VOCAL_STYLE_PRESETS.map(preset => (
                      <button key={preset} onClick={() => { setVocalStyle(preset); setShowVocalStyleDropdown(false); }} className={`w-full text-left px-4 py-2 hover:bg-secondary transition-smooth ${vocalStyle === preset ? 'bg-primary/10 text-primary' : 'text-foreground'}`}>
                        {preset}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {showVocalStyleDropdown && <div className="fixed inset-0 z-0" onClick={() => setShowVocalStyleDropdown(false)} />}
          </motion.div>

          {/* Vocal Intensity */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-muted-foreground" />
                <Label className="text-foreground font-medium">Vocal Intensity</Label>
                <span className="ml-2 text-lg font-display text-primary">{vocalIntensity}/10</span>
              </div>
              <AiToolbar field="vocalIntensity" />
            </div>
            <Slider
              value={[vocalIntensity]}
              onValueChange={(v) => setVocalIntensity(v[0])}
              min={1}
              max={10}
              step={1}
              className="mb-3"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>1 — Soft whisper</span>
              <span>10 — Powerful performance</span>
            </div>
          </motion.div>

          {/* Vocal Effects */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }} className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
              <div className="flex items-center gap-2">
                <AudioWaveform className="w-5 h-5 text-muted-foreground" />
                <Label className="text-foreground font-medium">Vocal Effects</Label>
              </div>
              <AiToolbar field="vocalEffects" />
            </div>
            {selectedVocalEffects.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedVocalEffects.map(effect => (
                  <Badge key={effect} variant="secondary" className="bg-accent/20 text-accent border-accent/30 cursor-pointer hover:bg-accent/30" onClick={() => toggleVocalEffect(effect)}>
                    {effect} ×
                  </Badge>
                ))}
              </div>
            )}
            <div className="relative">
              <button onClick={() => setShowVocalEffectsDropdown(!showVocalEffectsDropdown)} className="w-full flex items-center justify-between px-4 py-3 bg-input border border-border rounded-lg text-left">
                <span className="text-muted-foreground">{selectedVocalEffects.length === 0 ? 'Select effects...' : 'Add more effects'}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
              <AnimatePresence>
                {showVocalEffectsDropdown && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute z-10 w-full mt-2 max-h-48 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                    {VOCAL_EFFECTS_OPTIONS.map(effect => (
                      <button key={effect} onClick={() => toggleVocalEffect(effect)} className={`w-full text-left px-4 py-2 hover:bg-secondary transition-smooth ${selectedVocalEffects.includes(effect) ? 'bg-accent/10 text-accent' : 'text-foreground'}`}>
                        {effect}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {showVocalEffectsDropdown && <div className="fixed inset-0 z-0" onClick={() => setShowVocalEffectsDropdown(false)} />}
          </motion.div>

          {/* Vocal Language */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.37 }} className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
              <div className="flex items-center gap-2">
                <Languages className="w-5 h-5 text-muted-foreground" />
                <Label className="text-foreground font-medium">Vocal Language(s)</Label>
              </div>
              <AiToolbar field="vocalLanguage" />
            </div>
            {selectedLanguages.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedLanguages.map(lang => (
                  <Badge key={lang} variant="secondary" className="bg-accent/20 text-accent border-accent/30 cursor-pointer hover:bg-accent/30" onClick={() => toggleLanguage(lang)}>
                    {lang} ×
                  </Badge>
                ))}
              </div>
            )}
            <div className="relative">
              <button onClick={() => setShowLanguageDropdown(!showLanguageDropdown)} className="w-full flex items-center justify-between px-4 py-3 bg-input border border-border rounded-lg text-left">
                <span className="text-muted-foreground">{selectedLanguages.length === 0 ? 'Select languages...' : 'Add more languages'}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
              <AnimatePresence>
                {showLanguageDropdown && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute z-10 w-full mt-2 max-h-48 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                    {LANGUAGES.map(lang => (
                      <button key={lang} onClick={() => toggleLanguage(lang)} className={`w-full text-left px-4 py-2 hover:bg-secondary transition-smooth ${selectedLanguages.includes(lang) ? 'bg-accent/10 text-accent' : 'text-foreground'}`}>
                        {lang}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {showLanguageDropdown && <div className="fixed inset-0 z-0" onClick={() => setShowLanguageDropdown(false)} />}
          </motion.div>

          {/* Lyrics */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Mic2 className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label className="text-foreground font-medium">Lyrics or Vocal Theme</Label>
                  <p className="text-sm text-muted-foreground">Themes, stories, or full lyrics</p>
                </div>
              </div>
              <AiToolbar field="lyrics" />
            </div>
            <Textarea placeholder="e.g., A story about finding hope after loss..." value={lyrics} onChange={(e) => setLyrics(e.target.value)} className="bg-input border-border min-h-32 resize-none" />
          </motion.div>

          {/* Artist Inspiration */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-muted-foreground" />
                <Label className="text-foreground font-medium">Artist Inspiration</Label>
              </div>
              <AiToolbar field="artistInspiration" />
            </div>
            <Input placeholder="e.g., Tame Impala, Daft Punk, Billie Eilish..." value={artistInspiration} onChange={(e) => setArtistInspiration(e.target.value)} className="bg-input border-border" />
          </motion.div>

          {/* Video Toggle */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass-card rounded-xl p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label className="text-foreground font-medium">Generate Video</Label>
                  <p className="text-sm text-muted-foreground">Create a visual accompaniment</p>
                </div>
              </div>
              <Switch checked={generateVideo} onCheckedChange={setGenerateVideo} />
            </div>
            <AnimatePresence>
              {generateVideo && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-6">
                  <div className="flex flex-col gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Palette className="w-5 h-5 text-muted-foreground" />
                      <Label className="text-foreground font-medium">Video Style</Label>
                    </div>
                    <AiToolbar field="videoStyle" />
                  </div>
                  <Input placeholder="e.g., Abstract geometric visuals, neon colors..." value={videoStyle} onChange={(e) => setVideoStyle(e.target.value)} className="bg-input border-border" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Generate Button */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
            <Button onClick={handleGenerate} disabled={isCreating} variant="glow" size="xl" className="w-full">
              {isCreating ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Creating...</>
              ) : (
                <><Sparkles className="w-5 h-5" /> Generate {mode === 'song' ? 'Song' : 'Album'}</>
              )}
            </Button>
          </motion.div>

          {/* Output Section with Pipeline Progress + Audio Player */}
          <AnimatePresence>
            {currentCreation && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="glass-card rounded-xl p-4 sm:p-6 border-primary/30">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-xl font-semibold text-foreground">
                    Your {currentCreation.type === 'song' ? 'Track' : 'Album'}
                  </h3>
                  <Badge variant="secondary" className={`${currentCreation.status === 'completed' ? 'bg-green-500/20 text-green-400' : currentCreation.status === 'failed' ? 'bg-destructive/20 text-destructive' : 'bg-primary/20 text-primary'}`}>
                    {STATUS_LABELS[currentCreation.status] || currentCreation.status}
                  </Badge>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  {currentCreation.tracks.map((track, index) => (
                    <div key={track.id} className="p-3 sm:p-4 bg-secondary/50 rounded-lg">
                      <div className="flex items-center gap-3 sm:gap-4">
                        {track.status === 'completed' && track.audioUrl ? (
                          <button
                            onClick={() => togglePlay(track.id, track.audioUrl!)}
                            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:opacity-90 transition-smooth flex-shrink-0"
                          >
                            {playingTrackId === track.id ? (
                              <Pause className="w-5 h-5 text-primary-foreground" />
                            ) : (
                              <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
                            )}
                          </button>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                            {track.status === 'failed' ? (
                              <X className="w-5 h-5 text-destructive" />
                            ) : (
                              <Loader2 className="w-5 h-5 text-primary animate-spin" />
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {currentCreation.type === 'album' && `${index + 1}. `}{track.title}
                          </p>

                          {/* 7-Step Pipeline Progress */}
                          {ACTIVE_STATUSES.includes(track.status) && (
                            <PipelineProgress
                              currentStage={track.currentStage || track.status}
                              progress={track.progress || 0}
                              estimatedTimeLeft={track.estimatedTimeLeft || 0}
                              completedSegments={track.completedSegments || 0}
                              totalSegments={track.totalSegments || 1}
                            />
                          )}

                          {track.status === 'completed' && (
                            <p className="text-sm text-muted-foreground">{formatDuration(track.duration)}</p>
                          )}
                          {track.status === 'failed' && track.errorMessage && (
                            <div className="mt-2">
                              <p className="text-sm text-destructive">{track.errorMessage}</p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-2 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                                onClick={handleGenerate}
                              >
                                <RefreshCw className="w-3 h-3 mr-1" /> Retry Generation
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {track.status === 'completed' && track.audioUrl && (
                            <>
                              <a href={track.audioUrl} download>
                                <Button variant="ghost" size="icon"><Download className="w-5 h-5" /></Button>
                              </a>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  navigator.clipboard.writeText(track.audioUrl!);
                                  toast.success('Link copied to clipboard!');
                                }}
                              >
                                <Share2 className="w-5 h-5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      {track.status === 'completed' && track.audioUrl && (
                        <audio controls className="w-full mt-3" src={track.audioUrl} />
                      )}
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
