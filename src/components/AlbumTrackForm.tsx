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
import { GENRE_DATABASE, GENRE_NAMES, getModelQualityWarning } from '@/lib/musicData/genres';
import { LANGUAGE_DATABASE, LANGUAGE_NAMES, getVocalQualityAdvisory } from '@/lib/musicData/languages';
import { MOOD_DATABASE, MOOD_NAMES } from '@/lib/musicData/moods';
import { VOCAL_PROFILES, VOCAL_STYLE_LABELS } from '@/lib/musicData/vocals';
import { ARTIST_NAMES } from '@/lib/musicData/artists';
import {
  PRESET_VIDEO_STYLES,
  VOCAL_STRUCTURE_PRESETS,
  SONG_STRUCTURE_PRESETS,
  VOCAL_EFFECTS_OPTIONS,
  PRESET_LYRIC_THEMES,
} from '@/data/form-presets';
import { SmartSearchInput } from '@/components/ui/smart-search-input';
import { useMusic } from '@/contexts/MusicContext';
import { normalizeGenreOptions, genreOptionsToLabels, type GenreOption } from '@/data/genres';
import type { AiSuggestionResult } from '@/contexts/MusicContext';

export interface TrackConfig {
  trackName: string;
  songDescription: string;
  genre: string;
  subgenre?: string;
  mood: string;
  tempo: number;
  duration: number;
  vocalsEnabled: boolean;
  vocalStyle: string;
  vocalGender?: 'male' | 'female' | 'neutral';
  vocalLanguage: string;
  vocalIntensity: number;
  vocalEffects: string[];
  lyricsText: string;
  lyricsTheme: string;
  artistInspiration: string;
  instruments: string[];
  energyLevel: number;
  structureType: string;
  generateVideo: boolean;
  videoStyle: string;
  useHighQualityVocals?: boolean; // Legacy but kept for now
  genres?: GenreOption[]; // Kept for SmartSearch compatibility if needed
}

export const defaultTrackConfig = (index: number): TrackConfig => ({
  trackName: `Track ${index + 1}`,
  songDescription: '',
  genre: 'Pop',
  subgenre: '',
  mood: 'Energetic',
  tempo: 120,
  duration: 180,
  vocalsEnabled: true,
  vocalStyle: 'Pop Singing',
  vocalGender: 'neutral',
  vocalLanguage: 'English',
  vocalIntensity: 5,
  vocalEffects: [],
  lyricsText: '',
  lyricsTheme: '',
  artistInspiration: '',
  instruments: [],
  energyLevel: 5,
  structureType: 'Verse-Chorus-Bridge',
  generateVideo: false,
  videoStyle: 'Cinematic',
  useHighQualityVocals: false
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
      case 'prompt': return config.songDescription;
      case 'genre': return config.genre;
      case 'mood': return config.mood;
      case 'tempo': return String(config.tempo);
      case 'duration': return String(config.duration);
      case 'lyrics': return config.lyricsText;
      case 'artistInspiration': return config.artistInspiration;
      case 'videoStyle': return config.videoStyle;
      case 'vocalStyle': return config.vocalStyle;
      case 'vocalIntensity': return String(config.vocalIntensity);
      case 'vocalEffects': return config.vocalEffects.join(', ');
      case 'vocalLanguage': return config.vocalLanguage;
      case 'structureType': return config.structureType;
      case 'subgenre': return config.subgenre || '';
      case 'lyricsTheme': return config.lyricsTheme;
      default: return '';
    }
  };

  const applyToField = (field: string, value: string) => {
    switch (field) {
      case 'trackName': update({ trackName: value }); break;
      case 'prompt': update({ songDescription: value }); break;
      case 'genre': update({ genre: value }); break;
      case 'mood': update({ mood: value }); break;
      case 'tempo': { const p = parseInt(value); if (!isNaN(p)) update({ tempo: Math.max(60, Math.min(200, p)) }); break; }
      case 'duration': { const p = parseInt(value); if (!isNaN(p)) update({ duration: Math.max(30, Math.min(600, p)) }); break; }
      case 'lyrics': update({ lyricsText: value }); break;
      case 'artistInspiration': update({ artistInspiration: value }); break;
      case 'videoStyle': update({ videoStyle: value }); break;
      case 'vocalStyle': update({ vocalStyle: value }); break;
      case 'vocalIntensity': { const p = parseInt(value); if (!isNaN(p)) update({ vocalIntensity: Math.max(1, Math.min(10, p)) }); break; }
      case 'vocalEffects': update({ vocalEffects: Array.from(new Set([...config.vocalEffects, ...value.split(',').map(e => e.trim()).filter(Boolean)])) }); break;
      case 'vocalLanguage': update({ vocalLanguage: value }); break;
      case 'structureType': update({ structureType: value }); break;
      case 'subgenre': update({ subgenre: value }); break;
      case 'lyricsTheme': update({ lyricsTheme: value }); break;
    }
  };

  const handleClearField = (field: string) => {
    switch (field) {
      case 'trackName': update({ trackName: '' }); break;
      case 'prompt': update({
        songDescription: '',
        genre: 'Pop',
        mood: 'Energetic',
        tempo: 120,
        vocalStyle: 'Pop Singing',
        vocalIntensity: 5,
        vocalEffects: [],
        videoStyle: 'Cinematic',
        useHighQualityVocals: false,
      }); break;
      case 'genre': update({ genre: 'Pop' }); break;
      case 'mood': update({ mood: 'Energetic' }); break;
      case 'tempo': update({ tempo: 120 }); break;
      case 'duration': update({ duration: 180 }); break;
      case 'lyrics': update({ lyricsText: '' }); break;
      case 'artistInspiration': update({ artistInspiration: '' }); break;
      case 'videoStyle': update({ videoStyle: 'Cinematic' }); break;
      case 'vocalStyle': update({ vocalStyle: 'Pop Singing' }); break;
      case 'vocalIntensity': update({ vocalIntensity: 5 }); break;
      case 'vocalEffects': update({ vocalEffects: [] }); break;
      case 'vocalLanguage': update({ vocalLanguage: 'English' }); break;
      case 'structureType': update({ structureType: 'Verse-Chorus-Bridge' }); break;
      case 'subgenre': update({ subgenre: '' }); break;
      case 'lyricsTheme': update({ lyricsTheme: '' }); break;
    }
  };

  const handleMagicFill = async () => {
    const result = await aiSuggest('prompt', config.songDescription, getContext(), 'enhance');
    if (result?.structured) {
      const s = result.structured;
      update({
        genre: s.genre[0] || config.genre,
        mood: s.mood || config.mood,
        tempo: parseInt(s.tempo) || config.tempo,
        duration: config.duration,
        lyricsText: s.lyrics || config.lyricsText,
        vocalLanguage: s.genre[0]?.toLowerCase() === 'indian' ? 'Hindi' : 'English',
        structureType: s.genre[0]?.toLowerCase() === 'classical' ? 'Movement' : 'Verse-Chorus-Bridge',
        lyricsTheme: s.lyricTheme || config.lyricsTheme
      });
    }
  };

  const handleAiAction = async (field: string, action: 'suggest' | 'enhance' | 'new') => {
    const val = action === 'new' ? '' : getFieldValue(field);
    const result = await aiSuggest(field, val, getContext(), action);
    if (result?.structured && field === 'prompt') {
      const { genre, mood, tempo, artist_inspiration, lyrics, description, subgenre, lyricTheme } = result.structured;
      update({
        genre: genre && genre.length > 0 ? genre[0] : config.genre,
        mood: mood || config.mood,
        tempo: tempo ? Math.max(60, Math.min(200, parseInt(tempo) || config.tempo)) : config.tempo,
        artistInspiration: artist_inspiration || config.artistInspiration,
        lyricsText: lyrics || config.lyricsText,
        songDescription: description || result.suggestion || config.songDescription,
        subgenre: subgenre || config.subgenre,
        lyricsTheme: lyricTheme || config.lyricsTheme,
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
    if (albumVibe) update({ songDescription: albumVibe });
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
            <p className="text-xs text-muted-foreground">
              {config.genre || 'No genre selected'} • {formatDuration(config.duration)}
              {config.useHighQualityVocals && <span className="text-accent ml-2 font-medium">• HQ Vocals</span>}
            </p>
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
                <Textarea value={config.songDescription} onChange={e => update({ songDescription: e.target.value })} className="bg-input border-border min-h-24 resize-none" placeholder="Describe this track's mood and atmosphere..." />
              </div>

              {/* Genres */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label className="text-foreground font-medium text-sm">Genre</Label>
                  <AiToolbar field="genre" />
                </div>
                <SmartSearchInput
                  value={config.genre}
                  onChange={(val: string) => update({ genre: val })}
                  options={GENRE_NAMES()}
                  placeholder="Type or select genre..."
                />
                {config.genre && getModelQualityWarning(config.genre) && (
                  <p className="text-[10px] text-amber-500 mt-1 leading-tight flex items-start gap-1">
                    <Activity className="w-3 h-3 mt-0.5 shrink-0" /> {getModelQualityWarning(config.genre)}
                  </p>
                )}
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
                  options={MOOD_NAMES()}
                  placeholder="e.g., Dark, euphoric, melancholic..."
                />
              </div>

              {/* Tempo */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-foreground font-medium text-sm">Tempo: {config.tempo} BPM</Label>
                  </div>
                  <AiToolbar field="tempo" />
                </div>
                <Slider value={[config.tempo]} onValueChange={v => update({ tempo: v[0] })} min={60} max={200} step={1} />
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>60 BPM</span><span>200 BPM</span>
                </div>
              </div>

              {/* Duration */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-foreground font-medium text-sm">Duration: {formatDuration(config.duration)}</Label>
                  </div>
                  <AiToolbar field="duration" />
                </div>
                <Slider value={[config.duration]} onValueChange={v => update({ duration: v[0] })} min={30} max={600} step={1} />
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>0:30</span><span>10:00</span>
                </div>
              </div>

              {/* Vocal Structure + Style row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Label className="text-foreground font-medium text-sm">Vocal Status</Label>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/20">
                    <span className="text-xs text-muted-foreground">Vocals Enabled</span>
                    <Switch checked={config.vocalsEnabled} onCheckedChange={v => update({ vocalsEnabled: v })} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Label className="text-foreground font-medium text-sm">Vocal Style / Delivery</Label>
                    <AiToolbar field="vocalStyle" />
                  </div>
                  <SmartSearchInput
                    value={config.vocalStyle}
                    onChange={(val: string) => update({ vocalStyle: val })}
                    options={VOCAL_STYLE_LABELS}
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

                {/* Vocal Gender */}
                <div className="mt-4">
                  <Label className="text-foreground font-medium text-sm mb-2 block">Vocal Gender Profile</Label>
                  <div className="flex items-center gap-2">
                    {['male', 'female', 'neutral'].map((gender) => (
                      <Button
                        key={gender}
                        variant={config.vocalGender === gender ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => update({ vocalGender: gender as any })}
                        className="flex-1 capitalize text-xs h-8"
                      >
                        {gender === 'neutral' ? 'Auto/Smart' : gender}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Language */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Languages className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-foreground font-medium text-sm">Vocal Language</Label>
                  </div>
                  <AiToolbar field="vocalLanguage" />
                </div>
                <SmartSearchInput
                  value={config.vocalLanguage}
                  onChange={(val: string) => update({ vocalLanguage: val })}
                  options={LANGUAGE_NAMES()}
                  placeholder="Select or type language..."
                />
                {config.vocalLanguage && getVocalQualityAdvisory(config.vocalLanguage) && (
                  <p className="text-[10px] text-accent mt-1 leading-tight flex items-start gap-1">
                    <Sparkles className="w-3 h-3 mt-0.5 shrink-0" /> {getVocalQualityAdvisory(config.vocalLanguage)}
                  </p>
                )}

                {/* HQ Vocals Toggle */}
                <div className="mt-3 p-3 rounded-lg bg-accent/5 border border-accent/20 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-accent">High-Quality Vocal Path</p>
                    <p className="text-[10px] text-muted-foreground">Routes via ElevenLabs for superior pronunciation.</p>
                  </div>
                  <Switch 
                    checked={config.useHighQualityVocals} 
                    onCheckedChange={v => update({ useHighQualityVocals: v })} 
                  />
                </div>
              </div>

              {/* Lyric Theme */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label className="text-foreground font-medium text-sm">Lyric Theme</Label>
                  <AiToolbar field="lyricsTheme" />
                </div>
                <SmartSearchInput
                  value={config.lyricsTheme}
                  onChange={(val: string) => update({ lyricsTheme: val })}
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
                <Textarea value={config.lyricsText} onChange={e => update({ lyricsText: e.target.value })} className="bg-input border-border min-h-20 resize-none" placeholder="Lyrics or vocal theme..." />
              </div>

              {/* Artist Inspiration */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label className="text-foreground font-medium text-sm">Artist Inspiration</Label>
                  <AiToolbar field="artistInspiration" />
                </div>
                <SmartSearchInput
                  value={config.artistInspiration}
                  onChange={(val: string) => update({ artistInspiration: val })}
                  options={ARTIST_NAMES()}
                  placeholder="e.g., AP Dhillon, Bad Bunny..."
                />
              </div>

              {/* Song Structure */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label className="text-foreground font-medium text-sm">Song Structure</Label>
                  <AiToolbar field="structureType" />
                </div>
                <SmartSearchInput
                  value={config.structureType}
                  onChange={(val: string) => update({ structureType: val })}
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
