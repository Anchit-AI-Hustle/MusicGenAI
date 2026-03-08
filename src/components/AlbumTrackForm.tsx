import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronUp, Wand2, Zap, RefreshCw, Trash2, Loader2,
  Activity, Clock, Languages, Mic2, Users, Video, Palette, Sparkles, AudioWaveform,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { GENRES, LANGUAGES } from '@/data/genres';

export interface TrackConfig {
  trackName: string;
  musicPrompt: string;
  genres: string[];
  mood: string;
  tempoBpm: number;
  durationSeconds: number;
  vocalLanguages: string[];
  vocalStructure: string;
  vocalStyle: string;
  vocalIntensity: number;
  vocalEffects: string[];
  lyrics: string;
  artistInspiration: string;
  songStructure: string;
  generateVideo: boolean;
  videoStyle: string;
}

export const defaultTrackConfig = (index: number): TrackConfig => ({
  trackName: `Track ${index + 1}`,
  musicPrompt: '',
  genres: [],
  mood: '',
  tempoBpm: 120,
  durationSeconds: 180,
  vocalLanguages: [],
  vocalStructure: 'Instrumental',
  vocalStyle: '',
  vocalIntensity: 5,
  vocalEffects: [],
  lyrics: '',
  artistInspiration: '',
  songStructure: '',
  generateVideo: false,
  videoStyle: '',
});

const VOCAL_STRUCTURE_PRESETS = [
  'Verse – Chorus – Verse – Chorus',
  'Verse – Chorus – Bridge – Chorus',
  'Build – Drop – Build – Drop',
  'Continuous Vocal Flow',
  'Instrumental',
];

const VOCAL_STYLE_PRESETS = ['Male Vocal', 'Female Vocal', 'Robotic Vocal', 'Rap Vocal', 'Choir Vocal', 'Whisper Vocal'];
const VOCAL_EFFECTS_OPTIONS = ['Reverb', 'Delay', 'Chorus', 'Distortion', 'Autotune', 'Vocoder'];

const SONG_STRUCTURE_PRESETS = [
  'Intro → Build → Drop → Breakdown → Drop → Outro',
  'Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro',
  'Intro → Verse → Hook → Verse → Hook → Outro',
  'Intro → Theme → Solo → Theme → Outro',
];

interface AlbumTrackFormProps {
  index: number;
  config: TrackConfig;
  onChange: (config: TrackConfig) => void;
  albumVibe?: string;
  aiSuggest: (field: string, value: string, context: Record<string, any>, action?: 'suggest' | 'enhance') => Promise<string | null>;
}

export const AlbumTrackForm: React.FC<AlbumTrackFormProps> = ({ index, config, onChange, albumVibe, aiSuggest }) => {
  const [expanded, setExpanded] = useState(index === 0);
  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set());
  const [showGenreDropdown, setShowGenreDropdown] = useState(false);
  const [genreSearch, setGenreSearch] = useState('');
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [showVocalStructDD, setShowVocalStructDD] = useState(false);
  const [showVocalStyleDD, setShowVocalStyleDD] = useState(false);
  const [showVocalEffectsDD, setShowVocalEffectsDD] = useState(false);

  const update = (partial: Partial<TrackConfig>) => onChange({ ...config, ...partial });

  const startLoading = (key: string) => setLoadingActions(prev => new Set(prev).add(key));
  const stopLoading = (key: string) => setLoadingActions(prev => { const n = new Set(prev); n.delete(key); return n; });

  const getContext = () => ({ ...config, trackIndex: index });

  const getFieldValue = (field: string): string => {
    switch (field) {
      case 'trackName': return config.trackName;
      case 'prompt': return config.musicPrompt;
      case 'genres': return config.genres.join(', ');
      case 'mood': return config.mood;
      case 'tempoBpm': return String(config.tempoBpm);
      case 'duration': return String(config.durationSeconds);
      case 'lyrics': return config.lyrics;
      case 'artistInspiration': return config.artistInspiration;
      case 'videoStyle': return config.videoStyle;
      case 'vocalStructure': return config.vocalStructure;
      case 'vocalStyle': return config.vocalStyle;
      case 'vocalIntensity': return String(config.vocalIntensity);
      case 'vocalEffects': return config.vocalEffects.join(', ');
      case 'vocalLanguage': return config.vocalLanguages.join(', ');
      case 'songStructure': return config.songStructure;
      default: return '';
    }
  };

  const applyToField = (field: string, value: string) => {
    switch (field) {
      case 'trackName': update({ trackName: value }); break;
      case 'prompt': update({ musicPrompt: value }); break;
      case 'genres':
        const suggested = value.split(',').map(g => g.trim()).filter(g => GENRES.includes(g));
        if (suggested.length > 0) update({ genres: suggested });
        break;
      case 'mood': update({ mood: value }); break;
      case 'tempoBpm': { const p = parseInt(value); if (!isNaN(p)) update({ tempoBpm: Math.max(60, Math.min(200, p)) }); break; }
      case 'duration': { const p = parseInt(value); if (!isNaN(p)) update({ durationSeconds: Math.max(30, Math.min(600, p)) }); break; }
      case 'lyrics': update({ lyrics: value }); break;
      case 'artistInspiration': update({ artistInspiration: value }); break;
      case 'videoStyle': update({ videoStyle: value }); break;
      case 'vocalStructure': update({ vocalStructure: value }); break;
      case 'vocalStyle': update({ vocalStyle: value }); break;
      case 'vocalIntensity': { const p = parseInt(value); if (!isNaN(p)) update({ vocalIntensity: Math.max(1, Math.min(10, p)) }); break; }
      case 'vocalEffects': update({ vocalEffects: value.split(',').map(e => e.trim()).filter(Boolean) }); break;
      case 'vocalLanguage':
        const langs = value.split(',').map(l => l.trim()).filter(l => LANGUAGES.includes(l));
        if (langs.length > 0) update({ vocalLanguages: langs });
        break;
      case 'songStructure': update({ songStructure: value }); break;
    }
  };

  const handleClearField = (field: string) => {
    switch (field) {
      case 'trackName': update({ trackName: '' }); break;
      case 'prompt': update({ musicPrompt: '' }); break;
      case 'genres': update({ genres: [] }); break;
      case 'mood': update({ mood: '' }); break;
      case 'tempoBpm': update({ tempoBpm: 120 }); break;
      case 'duration': update({ durationSeconds: 180 }); break;
      case 'lyrics': update({ lyrics: '' }); break;
      case 'artistInspiration': update({ artistInspiration: '' }); break;
      case 'videoStyle': update({ videoStyle: '' }); break;
      case 'vocalStructure': update({ vocalStructure: 'Instrumental' }); break;
      case 'vocalStyle': update({ vocalStyle: '' }); break;
      case 'vocalIntensity': update({ vocalIntensity: 5 }); break;
      case 'vocalEffects': update({ vocalEffects: [] }); break;
      case 'vocalLanguage': update({ vocalLanguages: [] }); break;
      case 'songStructure': update({ songStructure: '' }); break;
    }
  };

  const handleAiAction = async (field: string, action: 'suggest' | 'enhance' | 'new') => {
    const key = `${action}-${field}`;
    startLoading(key);
    const val = action === 'new' ? '' : getFieldValue(field);
    const suggestion = await aiSuggest(field, val, getContext(), action === 'new' ? 'suggest' : action);
    stopLoading(key);
    if (suggestion) applyToField(field, suggestion);
  };

  const isFieldLoading = (field: string) =>
    loadingActions.has(`suggest-${field}`) || loadingActions.has(`enhance-${field}`) || loadingActions.has(`new-${field}`);

  const getActiveAction = (field: string): string => {
    if (loadingActions.has(`suggest-${field}`)) return 'suggest';
    if (loadingActions.has(`enhance-${field}`)) return 'enhance';
    if (loadingActions.has(`new-${field}`)) return 'new';
    return '';
  };

  const AiToolbar: React.FC<{ field: string }> = ({ field }) => {
    const currentAction = getActiveAction(field);
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => handleAiAction(field, 'suggest')} disabled={currentAction === 'suggest'} className="text-xs h-7 px-2 border-primary/30 text-primary hover:bg-primary/10">
          {currentAction === 'suggest' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wand2 className="w-3 h-3 mr-1" />} AI
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleAiAction(field, 'enhance')} disabled={currentAction === 'enhance'} className="text-xs h-7 px-2 border-accent/30 text-accent hover:bg-accent/10">
          {currentAction === 'enhance' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />} Enhance
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleAiAction(field, 'new')} disabled={currentAction === 'new'} className="text-xs h-7 px-2 border-muted-foreground/30 text-muted-foreground hover:bg-muted/50">
          {currentAction === 'new' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />} New
        </Button>
        <Button variant="ghost" size="sm" onClick={() => handleClearField(field)} disabled={isFieldLoading(field)} className="text-xs h-7 px-2 text-muted-foreground hover:text-destructive">
          <Trash2 className="w-3 h-3 mr-1" /> Clear
        </Button>
      </div>
    );
  };

  const applyAlbumVibe = () => {
    if (albumVibe) update({ musicPrompt: albumVibe });
  };

  const filteredGenres = GENRES.filter(g => g.toLowerCase().includes(genreSearch.toLowerCase()));

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-smooth">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">{index + 1}</span>
          <div className="text-left">
            <p className="font-medium text-foreground">{config.trackName || `Track ${index + 1}`}</p>
            <p className="text-xs text-muted-foreground">{config.genres.length > 0 ? config.genres.slice(0, 3).join(', ') : 'No genres selected'} • {formatDuration(config.durationSeconds)}</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-border">
            <div className="p-4 space-y-5">
              {/* Apply Album Vibe */}
              {albumVibe && (
                <Button variant="outline" size="sm" onClick={applyAlbumVibe} className="text-xs border-accent/30 text-accent hover:bg-accent/10">
                  <Sparkles className="w-3 h-3 mr-1" /> Apply Album Vibe to this Track
                </Button>
              )}

              {/* Track Name */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label className="text-foreground font-medium text-sm">Track Name</Label>
                  <AiToolbar field="trackName" />
                </div>
                <Input value={config.trackName} onChange={e => update({ trackName: e.target.value })} className="bg-input border-border" placeholder="Track name" />
              </div>

              {/* Music Prompt */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label className="text-foreground font-medium text-sm">Music Prompt</Label>
                  <AiToolbar field="prompt" />
                </div>
                <Textarea value={config.musicPrompt} onChange={e => update({ musicPrompt: e.target.value })} className="bg-input border-border min-h-24 resize-none" placeholder="Describe this track's mood and atmosphere..." />
              </div>

              {/* Genres */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label className="text-foreground font-medium text-sm">Genres</Label>
                  <AiToolbar field="genres" />
                </div>
                {config.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {config.genres.map(g => (
                      <Badge key={g} variant="secondary" className="bg-primary/20 text-primary border-primary/30 cursor-pointer text-xs" onClick={() => update({ genres: config.genres.filter(x => x !== g) })}>{g} ×</Badge>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <Input placeholder="Search genres..." value={genreSearch} onChange={e => setGenreSearch(e.target.value)} onFocus={() => setShowGenreDropdown(true)} className="bg-input border-border" />
                  <AnimatePresence>
                    {showGenreDropdown && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute z-20 w-full mt-1 max-h-40 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                        {filteredGenres.slice(0, 30).map(g => (
                          <button key={g} onClick={() => update({ genres: config.genres.includes(g) ? config.genres.filter(x => x !== g) : [...config.genres, g] })} className={`w-full text-left px-3 py-1.5 text-sm hover:bg-secondary ${config.genres.includes(g) ? 'bg-primary/10 text-primary' : 'text-foreground'}`}>{g}</button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {showGenreDropdown && <div className="fixed inset-0 z-10" onClick={() => setShowGenreDropdown(false)} />}
              </div>

              {/* Mood */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label className="text-foreground font-medium text-sm">Mood</Label>
                  <AiToolbar field="mood" />
                </div>
                <Input value={config.mood} onChange={e => update({ mood: e.target.value })} className="bg-input border-border" placeholder="e.g., Dark, euphoric, melancholic..." />
              </div>

              {/* Tempo */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-foreground font-medium text-sm">Tempo: {config.tempoBpm} BPM</Label>
                  </div>
                  <AiToolbar field="tempoBpm" />
                </div>
                <Slider value={[config.tempoBpm]} onValueChange={v => update({ tempoBpm: v[0] })} min={60} max={200} step={1} />
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>60 BPM</span><span>200 BPM</span>
                </div>
              </div>

              {/* Duration */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-foreground font-medium text-sm">Duration: {formatDuration(config.durationSeconds)}</Label>
                  </div>
                  <AiToolbar field="duration" />
                </div>
                <Slider value={[config.durationSeconds]} onValueChange={v => update({ durationSeconds: v[0] })} min={30} max={600} step={1} />
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>0:30</span><span>10:00</span>
                </div>
              </div>

              {/* Vocal Structure + Style row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Label className="text-foreground font-medium text-sm">Vocal Structure</Label>
                    <AiToolbar field="vocalStructure" />
                  </div>
                  <div className="relative">
                    <Input value={config.vocalStructure} onChange={e => update({ vocalStructure: e.target.value })} onFocus={() => setShowVocalStructDD(true)} className="bg-input border-border" />
                    <AnimatePresence>
                      {showVocalStructDD && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute z-20 w-full mt-1 max-h-40 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                          {VOCAL_STRUCTURE_PRESETS.map(p => (
                            <button key={p} onClick={() => { update({ vocalStructure: p }); setShowVocalStructDD(false); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary text-foreground">{p}</button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {showVocalStructDD && <div className="fixed inset-0 z-10" onClick={() => setShowVocalStructDD(false)} />}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Label className="text-foreground font-medium text-sm">Vocal Style</Label>
                    <AiToolbar field="vocalStyle" />
                  </div>
                  <div className="relative">
                    <Input value={config.vocalStyle} onChange={e => update({ vocalStyle: e.target.value })} onFocus={() => setShowVocalStyleDD(true)} className="bg-input border-border" />
                    <AnimatePresence>
                      {showVocalStyleDD && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute z-20 w-full mt-1 max-h-40 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                          {VOCAL_STYLE_PRESETS.map(p => (
                            <button key={p} onClick={() => { update({ vocalStyle: p }); setShowVocalStyleDD(false); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary text-foreground">{p}</button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {showVocalStyleDD && <div className="fixed inset-0 z-10" onClick={() => setShowVocalStyleDD(false)} />}
                  </div>
                </div>
              </div>

              {/* Vocal Intensity */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-foreground font-medium text-sm">Vocal Intensity: {config.vocalIntensity}/10</Label>
                  </div>
                  <AiToolbar field="vocalIntensity" />
                </div>
                <Slider value={[config.vocalIntensity]} onValueChange={v => update({ vocalIntensity: v[0] })} min={1} max={10} step={1} />
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>1 — Soft</span><span>10 — Powerful</span>
                </div>
              </div>

              {/* Vocal Effects */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <AudioWaveform className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-foreground font-medium text-sm">Vocal Effects</Label>
                  </div>
                  <AiToolbar field="vocalEffects" />
                </div>
                {config.vocalEffects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {config.vocalEffects.map(e => (
                      <Badge key={e} variant="secondary" className="bg-accent/20 text-accent border-accent/30 cursor-pointer text-xs" onClick={() => update({ vocalEffects: config.vocalEffects.filter(x => x !== e) })}>{e} ×</Badge>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <button onClick={() => setShowVocalEffectsDD(!showVocalEffectsDD)} className="w-full flex items-center justify-between px-3 py-2 bg-input border border-border rounded-lg text-left text-sm">
                    <span className="text-muted-foreground">{config.vocalEffects.length === 0 ? 'Select effects...' : 'Add more'}</span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <AnimatePresence>
                    {showVocalEffectsDD && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute z-20 w-full mt-1 max-h-40 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                        {VOCAL_EFFECTS_OPTIONS.map(ef => (
                          <button key={ef} onClick={() => update({ vocalEffects: config.vocalEffects.includes(ef) ? config.vocalEffects.filter(x => x !== ef) : [...config.vocalEffects, ef] })} className={`w-full text-left px-3 py-1.5 text-sm hover:bg-secondary ${config.vocalEffects.includes(ef) ? 'bg-accent/10 text-accent' : 'text-foreground'}`}>{ef}</button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {showVocalEffectsDD && <div className="fixed inset-0 z-10" onClick={() => setShowVocalEffectsDD(false)} />}
                </div>
              </div>

              {/* Languages */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Languages className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-foreground font-medium text-sm">Vocal Language(s)</Label>
                  </div>
                  <AiToolbar field="vocalLanguage" />
                </div>
                {config.vocalLanguages.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {config.vocalLanguages.map(l => (
                      <Badge key={l} variant="secondary" className="bg-accent/20 text-accent border-accent/30 cursor-pointer text-xs" onClick={() => update({ vocalLanguages: config.vocalLanguages.filter(x => x !== l) })}>{l} ×</Badge>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <button onClick={() => setShowLangDropdown(!showLangDropdown)} className="w-full flex items-center justify-between px-3 py-2 bg-input border border-border rounded-lg text-left text-sm">
                    <span className="text-muted-foreground">{config.vocalLanguages.length === 0 ? 'Select languages...' : 'Add more'}</span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <AnimatePresence>
                    {showLangDropdown && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute z-20 w-full mt-1 max-h-40 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                        {LANGUAGES.map(l => (
                          <button key={l} onClick={() => update({ vocalLanguages: config.vocalLanguages.includes(l) ? config.vocalLanguages.filter(x => x !== l) : [...config.vocalLanguages, l] })} className={`w-full text-left px-3 py-1.5 text-sm hover:bg-secondary ${config.vocalLanguages.includes(l) ? 'bg-accent/10 text-accent' : 'text-foreground'}`}>{l}</button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {showLangDropdown && <div className="fixed inset-0 z-10" onClick={() => setShowLangDropdown(false)} />}
                </div>
              </div>

              {/* Lyrics */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label className="text-foreground font-medium text-sm">Lyrics</Label>
                  <AiToolbar field="lyrics" />
                </div>
                <Textarea value={config.lyrics} onChange={e => update({ lyrics: e.target.value })} className="bg-input border-border min-h-20 resize-none" placeholder="Lyrics or vocal theme..." />
              </div>

              {/* Artist Inspiration */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label className="text-foreground font-medium text-sm">Artist Inspiration</Label>
                  <AiToolbar field="artistInspiration" />
                </div>
                <Input value={config.artistInspiration} onChange={e => update({ artistInspiration: e.target.value })} className="bg-input border-border" placeholder="e.g., Tame Impala, Daft Punk..." />
              </div>

              {/* Song Structure */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label className="text-foreground font-medium text-sm">Song Structure</Label>
                  <AiToolbar field="songStructure" />
                </div>
                <Input value={config.songStructure} onChange={e => update({ songStructure: e.target.value })} className="bg-input border-border" placeholder="e.g., Intro → Verse → Chorus → Outro" />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {SONG_STRUCTURE_PRESETS.map(p => (
                    <button key={p} onClick={() => update({ songStructure: p })} className={`px-2 py-1 text-xs rounded-md border transition-smooth ${config.songStructure === p ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>{p.length > 40 ? p.slice(0, 40) + '...' : p}</button>
                  ))}
                </div>
              </div>

              {/* Video */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-foreground font-medium text-sm">Generate Video</Label>
                </div>
                <Switch checked={config.generateVideo} onCheckedChange={v => update({ generateVideo: v })} />
              </div>
              {config.generateVideo && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Label className="text-foreground font-medium text-sm">Video Style</Label>
                    <AiToolbar field="videoStyle" />
                  </div>
                  <Input value={config.videoStyle} onChange={e => update({ videoStyle: e.target.value })} className="bg-input border-border" placeholder="e.g., Abstract geometric, neon colors..." />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
