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
import { GENRE_OPTIONS, normalizeGenreOptions, genreOptionsToLabels, type GenreOption } from '@/data/genres';
import { SmartSearchInput } from '@/components/ui/smart-search-input';
import { useMusic } from '@/contexts/MusicContext';
import { 
  LANGUAGES, 
  PRESET_MOODS, 
  PRESET_VOCAL_STYLES, 
  PRESET_VIDEO_STYLES, 
  VOCAL_STRUCTURE_PRESETS,
  SONG_STRUCTURE_PRESETS,
  VOCAL_EFFECTS_OPTIONS,
  PRESET_LYRIC_THEMES
} from '@/data/form-presets';
import type { AiSuggestionResult } from '@/contexts/MusicContext';

export interface TrackConfig {
  trackName: string;
  musicPrompt: string;
  genres: GenreOption[];
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
  subgenre: string[];
  lyricTheme: string;
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
  subgenre: [],
  lyricTheme: '',
  generateVideo: false,
  videoStyle: '',
});

interface AlbumTrackFormProps {
  index: number;
  config: TrackConfig;
  onChange: (config: TrackConfig) => void;
  albumVibe?: string;
  aiSuggest: (field: string, value: string, context: Record<string, any>, action?: 'suggest' | 'enhance' | 'new') => Promise<AiSuggestionResult | null>;
}

export const AlbumTrackForm: React.FC<AlbumTrackFormProps> = ({ index, config, onChange, albumVibe, aiSuggest }) => {
  const { suggestionState } = useMusic();
  const [expanded, setExpanded] = useState(index === 0);
  const update = (partial: Partial<TrackConfig>) => onChange({ ...config, ...partial });

  const getContext = () => ({ ...config, trackIndex: index });

  const getFieldValue = (field: string): string => {
    switch (field) {
      case 'trackName': return config.trackName;
      case 'prompt': return config.musicPrompt;
      case 'genres': return genreOptionsToLabels(config.genres).join(', ');
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
      case 'subgenre': return config.subgenre.join(', ');
      case 'lyricTheme': return config.lyricTheme;
      default: return '';
    }
  };

  const applyToField = (field: string, value: string) => {
    switch (field) {
      case 'trackName': update({ trackName: value }); break;
      case 'prompt': update({ musicPrompt: value }); break;
      case 'genres':
        const suggested = normalizeGenreOptions(value.split(',').map(g => g.trim()).filter(Boolean));
        if (suggested.length > 0) update({ genres: normalizeGenreOptions([...config.genres, ...suggested]) });
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
      case 'vocalEffects': update({ vocalEffects: Array.from(new Set([...config.vocalEffects, ...value.split(',').map(e => e.trim()).filter(Boolean)])) }); break;
      case 'vocalLanguage':
        const langs = value.split(',').map(l => l.trim()).filter(l => LANGUAGES.includes(l));
        if (langs.length > 0) update({ vocalLanguages: Array.from(new Set([...config.vocalLanguages, ...langs])) });
        break;
      case 'songStructure': update({ songStructure: value }); break;
      case 'subgenre': update({ subgenre: Array.from(new Set([...config.subgenre, ...value.split(',').map(s => s.trim()).filter(Boolean)])) }); break;
      case 'lyricTheme': update({ lyricTheme: value }); break;
    }
  };

  const handleClearField = (field: string) => {
    switch (field) {
      case 'trackName': update({ trackName: '' }); break;
      case 'prompt': update({
        musicPrompt: '',
        genres: [],
        mood: '',
        tempoBpm: 120,
        lyrics: '',
        artistInspiration: '',
        vocalLanguages: [],
        vocalStructure: 'Instrumental',
        vocalStyle: '',
        vocalIntensity: 5,
        vocalEffects: [],
        songStructure: '',
        videoStyle: '',
      }); break;
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
      case 'subgenre': update({ subgenre: [] }); break;
      case 'lyricTheme': update({ lyricTheme: '' }); break;
    }
  };

  const handleAiAction = async (field: string, action: 'suggest' | 'enhance' | 'new') => {
    const val = action === 'new' ? '' : getFieldValue(field);
    const result = await aiSuggest(field, val, { ...getContext(), genres: genreOptionsToLabels(config.genres) }, action);
    if (result?.structured && field === 'prompt') {
      const { genre, mood, tempo, artist_inspiration, lyrics, description, subgenre, lyricTheme } = result.structured;
      update({
        genres: genre && genre.length > 0 ? normalizeGenreOptions([...config.genres, ...genre]) : config.genres,
        mood: mood || config.mood,
        tempoBpm: tempo ? Math.max(60, Math.min(200, parseInt(tempo) || config.tempoBpm)) : config.tempoBpm,
        artistInspiration: artist_inspiration || config.artistInspiration,
        lyrics: lyrics || config.lyrics,
        musicPrompt: description || result.suggestion || config.musicPrompt,
        subgenre: subgenre || config.subgenre,
        lyricTheme: lyricTheme || config.lyricTheme,
      });
      return;
    }
    if (result?.suggestion) applyToField(field, result.suggestion);
  };

  const isFieldLoading = (field: string) => !!suggestionState.loading[field];

  const getActiveAction = (field: string): string => {
    // This is a simplification; the context now handles loading generally for the field
    return suggestionState.loading[field] ? 'loading' : '';
  };

  const AiToolbar: React.FC<{ field: string }> = ({ field }) => {
    const isLoading = isFieldLoading(field);
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => handleAiAction(field, 'suggest')} disabled={isLoading} className="text-xs h-7 px-2 border-primary/30 text-primary hover:bg-primary/10">
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wand2 className="w-3 h-3 mr-1" />} AI
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleAiAction(field, 'enhance')} disabled={isLoading} className="text-xs h-7 px-2 border-accent/30 text-accent hover:bg-accent/10">
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />} Enhance
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleAiAction(field, 'new')} disabled={isLoading} className="text-xs h-7 px-2 border-muted-foreground/30 text-muted-foreground hover:bg-muted/50">
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />} New
        </Button>
        <Button variant="ghost" size="sm" onClick={() => handleClearField(field)} disabled={isLoading} className="text-xs h-7 px-2 text-muted-foreground hover:text-destructive">
          <Trash2 className="w-3 h-3 mr-1" /> Clear
        </Button>
      </div>
    );
  };

  const applyAlbumVibe = () => {
    if (albumVibe) update({ musicPrompt: albumVibe });
  };

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
            <p className="text-xs text-muted-foreground">{config.genres.length > 0 ? config.genres.slice(0, 3).map(g => g.label).join(', ') : 'No genres selected'} • {formatDuration(config.durationSeconds)}</p>
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
                <SmartSearchInput
                  value={config.genres.map(g => g.label)}
                  onChange={(val: string[]) => update({ genres: normalizeGenreOptions(val) })}
                  options={GENRE_OPTIONS.map(g => g.label)}
                  placeholder="Type or select genres..."
                  multiSelect
                />
              </div>

              {/* Subgenres */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label className="text-foreground font-medium text-sm">Subgenres / Styles</Label>
                  <AiToolbar field="subgenre" />
                </div>
                <SmartSearchInput
                  value={config.subgenre}
                  onChange={(val: string[]) => update({ subgenre: val })}
                  options={[]}
                  placeholder="e.g., Deep, Melodic, Industrial..."
                  multiSelect
                />
              </div>

              {/* Mood */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label className="text-foreground font-medium text-sm">Mood</Label>
                  <AiToolbar field="mood" />
                </div>
                <SmartSearchInput
                  value={config.mood}
                  onChange={(val: string) => update({ mood: val })}
                  options={PRESET_MOODS}
                  placeholder="e.g., Dark, euphoric, melancholic..."
                />
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
                  <SmartSearchInput
                    value={config.vocalStructure}
                    onChange={(val: string) => update({ vocalStructure: val })}
                    options={VOCAL_STRUCTURE_PRESETS}
                    placeholder="e.g., Verse - Chorus"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Label className="text-foreground font-medium text-sm">Vocal Style / Delivery</Label>
                    <AiToolbar field="vocalStyle" />
                  </div>
                  <SmartSearchInput
                    value={config.vocalStyle}
                    onChange={(val: string) => update({ vocalStyle: val })}
                    options={PRESET_VOCAL_STYLES}
                    placeholder="e.g., Male Vocal, Rap"
                  />
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
                <SmartSearchInput
                  value={config.vocalEffects}
                  onChange={(val: string[]) => update({ vocalEffects: val })}
                  options={VOCAL_EFFECTS_OPTIONS}
                  placeholder="Select or type effects..."
                  multiSelect
                />
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
                <SmartSearchInput
                  value={config.vocalLanguages}
                  onChange={(val: string[]) => update({ vocalLanguages: val })}
                  options={LANGUAGES}
                  placeholder="Select or type languages..."
                  multiSelect
                />
              </div>

              {/* Lyric Theme */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label className="text-foreground font-medium text-sm">Lyric Theme</Label>
                  <AiToolbar field="lyricTheme" />
                </div>
                <SmartSearchInput
                  value={config.lyricTheme}
                  onChange={(val: string) => update({ lyricTheme: val })}
                  options={PRESET_LYRIC_THEMES}
                  placeholder="e.g., Cyberpunk Future, Nature & Peace..."
                />
              </div>

              {/* Lyrics */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label className="text-foreground font-medium text-sm">Lyrics (optional)</Label>
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
                <SmartSearchInput
                  value={config.songStructure}
                  onChange={(val: string) => update({ songStructure: val })}
                  options={SONG_STRUCTURE_PRESETS}
                  placeholder="e.g., Intro → Verse → Chorus → Outro"
                />
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
                  <SmartSearchInput
                    value={config.videoStyle}
                    onChange={(val: string) => update({ videoStyle: val })}
                    options={PRESET_VIDEO_STYLES}
                    placeholder="e.g., Abstract geometric visuals..."
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
