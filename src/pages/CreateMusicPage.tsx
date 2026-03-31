/*
 * ============================================================
 * MUSEVIBENSTUDIO — FORM COMPONENT FEATURE INVENTORY
 * Update this comment whenever a feature is added or removed.
 * Future rewrites must restore every item listed here.
 * ============================================================
 *
 * AUDIO GENERATION
 *   Trigger    : handleGenerate() button click
 *   Entry      : createMusic({ type: 'song', ... }) via useMusic context calls startGeneration
 *   Hook       : hooks/useGenerationJob.ts → startJob()
 *   Lyrics     : auto-generated inside startJob if context.lyrics empty
 *   State      : creation status, audioUrl, progress via MusicContext
 *   Player     : <audio> / custom player rendered on success
 *   Download   : handleDownload() → /api/download proxy → file save
 *
 * VIDEO GENERATION
 *   Trigger    : useEffect watching job.status === "succeeded"
 *                AND/OR separate "Generate Video" button (keep both)
 *   Entry      : visualizerEnabled(context) defined in this file
 *   API        : POST /api/video → { jobId }
 *   Polling    : GET /api/video/status?jobId=... every 4 seconds
 *   State      : videoStatus, videoUrl, videoError (local useState)
 *   Cleanup    : videoPollRef cleared on unmount
 *   Player     : <video> rendered when videoStatus === "succeeded"
 *   Download   : anchor with download attribute
 *
 * LYRICS
 *   Standalone : "Generate Lyrics" button → POST /api/lyrics → context.lyrics (Currently auto only)
 *   Auto       : inside startJob when context.lyrics is empty
 *   Display    : <textarea> bound to context.lyrics, user-editable
 *
 * AI SUGGESTIONS
 *   Hook       : hooks/useSuggestion.ts via MusicContext aiSuggest
 *   Auto-apply : useEffect([suggestions]) writes to context state
 *   Per-field  : each AiToolbar button calls handleAiSuggest("fieldName")
 *   AI Enhance : handleEnhance("fieldName")
 *   AI New     : handleNewSuggestion("fieldName")
 *   AI Clear   : clears field only
 *
 * CONTEXT REF
 *   contextRef : always holds latest context to avoid stale closures
 *   Updated    : useEffect([deps]) → contextRef.current = getFormContext()
 *
 * RATE LIMITING
 *   Handled    : server-side in /api/generate, 429 shown in UI
 * ============================================================
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PortalDropdown } from '@/components/ui/portal-dropdown';
import { 
  Music, Disc, Wand2, Clock, Languages, Mic2, Users, 
  Video, Palette, Sparkles, Loader2, Play, Pause, Download, ChevronDown, X,
  RefreshCw, Zap, Trash2, Activity, AudioWaveform, Share2, Check, Circle
} from 'lucide-react';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { useMusic, type AiSuggestionResult } from '@/contexts/MusicContext';
import { usePlayer, PlayerTrack } from '@/contexts/PlayerContext';
import { AlbumTrackForm, defaultTrackConfig, type TrackConfig } from '@/components/AlbumTrackForm';
import { SmartSearchInput } from '@/components/ui/smart-search-input';
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
import { GENRE_OPTIONS, normalizeGenreOptions, genreOptionsToLabels, type GenreOption } from '@/data/genres';
import { toast } from 'sonner';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting to start',
  analyzing: 'Analyzing prompt',
  seeding: 'Creating GenerationDNA',
  inferring: 'Inferring musical style',
  planning_structure: 'Planning arrangement',
  generating_melody: 'Generating melody',
  synthesizing_instruments: 'Synthesizing instruments',
  generating_vocals: 'Generating vocals',
  vocal_alignment: 'Aligning vocals',
  mixing_audio: 'Mixing audio',
  mastering_track: 'Mastering track',
  analyzing_beat_structure: 'Analyzing beats',
  generating_video: 'Rendering visuals',
  rendering_video: 'Rendering visuals',
  encoding_video: 'Encoding video',
  transcoding_video: 'Optimizing MP4',
  finalizing: 'Finalizing',
  completed: 'Ready',
  failed: 'Failed',
  audio_complete_video_failed: 'Audio ready (video failed)',
};

const ACTIVE_STATUSES = ['analyzing', 'seeding', 'inferring', 'planning_structure', 'generating_melody', 'synthesizing_instruments', 'generating_vocals', 'vocal_alignment', 'mixing_audio', 'mastering_track', 'analyzing_beat_structure', 'generating_video', 'rendering_video', 'encoding_video', 'transcoding_video', 'finalizing'];

interface CreateMusicPageProps {
  onAuthClick: () => void;
}

interface SongPromptState {
  songDescription: string;
  genre: string;
  subgenre: string;
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
  visualizerEnabled: boolean;
  videoStyle: string;
  useHighQualityVocals: boolean;
}

export const CreateMusicPage: React.FC<CreateMusicPageProps> = ({ onAuthClick }) => {
  const { isAuthenticated } = useAuth();
  const { createMusic, currentCreation, isCreating, aiSuggest, updateFormState, suggestionState } = useMusic();
  const player = usePlayer();
  const [mode, setMode] = useState<'song' | 'album'>('song');
  
  // Album state
  const [albumName, setAlbumName] = useState('');
  const [albumVibe, setAlbumVibe] = useState('');
  const [numberOfSongs, setNumberOfSongs] = useState(5);
  const [albumTracks, setAlbumTracks] = useState<TrackConfig[]>(() => 
    Array.from({ length: 5 }, (_, i) => defaultTrackConfig(i))
  );

  // Song mode state (now strictly mapping to CreativeContext fields)
  const [title, setTitle] = useState('');
  const [songDescription, setSongDescription] = useState('');
  const [genre, setGenre] = useState('Pop');
  const [subgenre, setSubgenre] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<GenreOption[]>(() => normalizeGenreOptions(['Pop']));
  const [selectedSubgenres, setSelectedSubgenres] = useState<string[]>([]);
  const [genreSearch, setGenreSearch] = useState('');
  const [showGenreDropdown, setShowGenreDropdown] = useState(false);
  const [duration, setDuration] = useState(180);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(3);
  const [seconds, setSeconds] = useState(0);
  const [vocalLanguage, setVocalLanguage] = useState('English');
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [lyricsText, setLyricsText] = useState('');
  const [artistInspiration, setArtistInspiration] = useState('');
  const [visualizerEnabled, setGenerateVideo] = useState(false);
  const [videoStyle, setVideoStyle] = useState('Cinematic');
  const [tempo, setTempo] = useState(120);
  const [mood, setMood] = useState('Energetic');
  
  const [vocalsEnabled, setVocalsEnabled] = useState(true);
  const [vocalStyle, setVocalStyle] = useState('Pop Singing');
  const [vocalIntensity, setVocalIntensity] = useState(5);
  const [selectedVocalEffects, setSelectedVocalEffects] = useState<string[]>([]);
  const [showVocalEffectsDropdown, setShowVocalEffectsDropdown] = useState(false);
  const [structureType, setStructureType] = useState('Verse-Chorus-Bridge');
  const [lyricsTheme, setLyricsTheme] = useState('');
  const [energyLevel, setEnergyLevel] = useState(5);
  const [instruments, setInstruments] = useState<string[]>([]);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<"idle" | "generating" | "polling" | "succeeded" | "failed">("idle");
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const genreInputRef = useRef<HTMLDivElement>(null);
  const vocalStructureRef = useRef<HTMLDivElement>(null);
  const vocalStyleRef = useRef<HTMLDivElement>(null);
  const vocalEffectsRef = useRef<HTMLDivElement>(null);
  const languageRef = useRef<HTMLDivElement>(null);

  const getSongPromptState = useCallback((): SongPromptState => ({
    songDescription,
    genre,
    subgenre,
    mood,
    tempo,
    duration,
    vocalsEnabled,
    vocalStyle,
    vocalLanguage,
    vocalIntensity,
    vocalEffects: selectedVocalEffects,
    lyricsText,
    lyricsTheme,
    artistInspiration,
    instruments,
    energyLevel,
    structureType,
    visualizerEnabled,
    videoStyle,
    useHighQualityVocals: false,
  }), [
    songDescription, genre, subgenre, mood, tempo, duration,
    vocalsEnabled, vocalStyle, vocalLanguage, vocalIntensity,
    selectedVocalEffects, lyricsText, lyricsTheme, artistInspiration,
    instruments, energyLevel, structureType, visualizerEnabled, videoStyle
  ]);

  const applySongPromptState = useCallback((next: SongPromptState) => {
    setSongDescription(next.songDescription);
    setGenre(next.genre);
    setSubgenre(next.subgenre);
    setMood(next.mood);
    setTempo(next.tempo);
    setDuration(next.duration);
    setVocalsEnabled(next.vocalsEnabled);
    setVocalStyle(next.vocalStyle);
    setVocalLanguage(next.vocalLanguage);
    setVocalIntensity(next.vocalIntensity);
    setSelectedVocalEffects(next.vocalEffects);
    setLyricsText(next.lyricsText);
    setLyricsTheme(next.lyricsTheme);
    setArtistInspiration(next.artistInspiration);
    setInstruments(next.instruments);
    setEnergyLevel(next.energyLevel);
    setStructureType(next.structureType);
    setGenerateVideo(next.visualizerEnabled);
    setVideoStyle(next.videoStyle);
  }, []);

  const updateSongPrompt = useCallback((updater: Partial<SongPromptState> | ((prev: SongPromptState) => SongPromptState)) => {
    const prev = getSongPromptState();
    const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
    applySongPromptState(next);
  }, [applySongPromptState, getSongPromptState]);

  // Sync with global FormState for AI suggestions
  React.useEffect(() => {
    updateFormState({
      songDescription,
      genre,
      subgenre,
      duration,
      vocalLanguage,
      lyricsText,
      artistInspiration,
      videoStyle,
      tempo,
      mood,
      vocalStyle,
      structureType,
      energyLevel,
      instruments,
      lyricsTheme,
      vocalsEnabled
    });
  }, [
    songDescription, genre, subgenre, duration, vocalLanguage,
    lyricsText, artistInspiration, videoStyle, tempo, mood,
    vocalStyle, structureType, energyLevel, instruments, lyricsTheme,
    vocalsEnabled, updateFormState
  ]);

  useEffect(() => {
    if (!genre) return;
    setSelectedGenres(normalizeGenreOptions([genre]));
  }, [genre]);

  useEffect(() => {
    if (!subgenre) {
      setSelectedSubgenres([]);
      return;
    }
    setSelectedSubgenres(subgenre.split(',').map(s => s.trim()).filter(Boolean));
  }, [subgenre]);

  // Sync album track count
  React.useEffect(() => {
    setAlbumTracks(prev => {
      if (prev.length === numberOfSongs) return prev;
      if (prev.length < numberOfSongs) {
        return [...prev, ...Array.from({ length: numberOfSongs - prev.length }, (_, i) => defaultTrackConfig(prev.length + i))];
      }
      return prev.slice(0, numberOfSongs);
    });
  }, [numberOfSongs]);

  const updateAlbumTrack = (index: number, config: TrackConfig) => {
    setAlbumTracks(prev => prev.map((t, i) => i === index ? { ...t, ...config } : t));
  };

  // Song mode helpers
  const getFormContext = () => ({
    title, 
    songDescription, 
    genre, 
    subgenre,
    duration,
    vocalLanguage, 
    lyricsText, 
    artistInspiration, 
    videoStyle,
    tempo, 
    mood, 
    vocalsEnabled,
    vocalStyle, 
    vocalIntensity, 
    vocalEffects: selectedVocalEffects,
    structureType,
    instruments,
    energyLevel,
    lyricsTheme,
    prompt: getSongPromptState(),
  });

  const applyStructuredPromptSuggestion = (result: AiSuggestionResult) => {
    const structured = result.structured;
    if (!structured) return false;

    updateSongPrompt(prev => ({
      ...prev,
      genre: structured.genre?.length ? structured.genre[0] : prev.genre,
      mood: structured.mood || prev.mood,
      tempo: structured.tempo ? Math.max(60, Math.min(200, parseInt(structured.tempo) || prev.tempo)) : prev.tempo,
      artistInspiration: structured.artist_inspiration || prev.artistInspiration,
      lyricsText: structured.lyrics || prev.lyricsText,
      songDescription: structured.description || structured.prompt || result.suggestion || prev.songDescription,
      subgenre: structured.subgenre && Array.isArray(structured.subgenre) ? structured.subgenre.join(', ') : (structured.subgenre || prev.subgenre),
      lyricsTheme: structured.lyricTheme || prev.lyricsTheme,
    }));
    return true;
  };

  const applyToField = (field: string, value: string) => {
    switch (field) {
      case 'trackName': setTitle(value); break;
      case 'albumName': setAlbumName(value); break;
      case 'albumVibe': setAlbumVibe(value); break;
      case 'prompt': updateSongPrompt({ songDescription: value }); break;
      case 'genre': updateSongPrompt({ genre: value }); break;
      case 'lyrics': updateSongPrompt({ lyricsText: value }); break;
      case 'artistInspiration': updateSongPrompt({ artistInspiration: value }); break;
      case 'vocalLanguage': updateSongPrompt({ vocalLanguage: value }); break;
      case 'videoStyle': updateSongPrompt({ videoStyle: value }); break;
      case 'tempo': updateSongPrompt({ tempo: Math.max(60, Math.min(200, parseInt(value) || 120)) }); break;
      case 'mood': updateSongPrompt({ mood: value }); break;
      case 'structureType': updateSongPrompt({ structureType: value }); break;
      case 'vocalStyle': updateSongPrompt({ vocalStyle: value }); break;
      case 'vocalIntensity': updateSongPrompt({ vocalIntensity: Math.max(1, Math.min(10, parseInt(value) || 5)) }); break;
      case 'vocalEffects':
        const newEffects = value.split(',').map(e => e.trim()).filter(Boolean);
        updateSongPrompt(prev => ({
          ...prev,
          vocalEffects: Array.from(new Set([...prev.vocalEffects, ...newEffects])),
        }));
        break;
      case 'duration': {
        const p = parseInt(value);
        if (!isNaN(p)) {
          const clamped = Math.max(30, Math.min(600, p));
          setDuration(clamped);
          setHours(Math.floor(clamped / 3600));
          setMinutes(Math.floor((clamped % 3600) / 60));
          setSeconds(clamped % 60);
        }
        break;
      }
    }
  };

  const getFieldValue = (field: string): string => {
    switch (field) {
      case 'trackName': return title;
      case 'albumName': return albumName;
      case 'albumVibe': return albumVibe;
      case 'prompt': return songDescription;
      case 'genre': return genre;
      case 'lyrics': return lyricsText;
      case 'artistInspiration': return artistInspiration;
      case 'vocalLanguage': return vocalLanguage;
      case 'videoStyle': return videoStyle;
      case 'tempo': return String(tempo);
      case 'mood': return mood;
      case 'structureType': return structureType;
      case 'vocalStyle': return vocalStyle;
      case 'vocalIntensity': return String(vocalIntensity);
      case 'vocalEffects': return selectedVocalEffects.join(', ');
      case 'duration': return String(duration);
      default: return '';
    }
  };



  const handleAiSuggest = async (field: string) => {
    const result = await aiSuggest(field, getFieldValue(field), getFormContext(), 'suggest');
    if (field === 'prompt' && result?.structured) {
      applyStructuredPromptSuggestion(result);
      return;
    }
    if (result?.suggestion) applyToField(field, result.suggestion);
  };

  const handleEnhance = async (field: string) => {
    const currentVal = getFieldValue(field);
    if (!currentVal.trim()) { toast.error('Nothing to enhance'); return; }
    const result = await aiSuggest(field, currentVal, getFormContext(), 'enhance');
    if (field === 'prompt' && result?.structured) {
      applyStructuredPromptSuggestion(result);
      return;
    }
    if (result?.suggestion) applyToField(field, result.suggestion);
  };

  const handleNewSuggestion = async (field: string) => {
    const result = await aiSuggest(field, '', getFormContext(), 'new');
    if (field === 'prompt' && result?.structured) {
      applyStructuredPromptSuggestion(result);
      return;
    }
    if (result?.suggestion) applyToField(field, result.suggestion);
  };

  const handleClear = (field: string) => {
    switch (field) {
      case 'trackName': setTitle(''); break;
      case 'albumName': setAlbumName(''); break;
      case 'albumVibe': setAlbumVibe(''); break;
      case 'prompt': updateSongPrompt({
        genre: 'Pop',
        mood: 'Energetic',
        tempo: 120,
        artistInspiration: '',
        lyricsText: '',
        songDescription: '',
        vocalLanguage: 'English',
        videoStyle: 'Cinematic',
        vocalsEnabled: true,
        vocalStyle: 'Pop Singing',
        vocalIntensity: 5,
        vocalEffects: [],
        structureType: 'Verse-Chorus-Bridge',
        useHighQualityVocals: false,
      }); break;
      case 'genre': updateSongPrompt({ genre: 'Pop' }); break;
      case 'lyrics': updateSongPrompt({ lyricsText: '' }); break;
      case 'artistInspiration': updateSongPrompt({ artistInspiration: '' }); break;
      case 'vocalLanguage': updateSongPrompt({ vocalLanguage: 'English' }); break;
      case 'videoStyle': updateSongPrompt({ videoStyle: 'Cinematic' }); break;
      case 'tempo': updateSongPrompt({ tempo: 120 }); break;
      case 'mood': updateSongPrompt({ mood: 'Energetic' }); break;
      case 'structureType': updateSongPrompt({ structureType: 'Verse-Chorus-Bridge' }); break;
      case 'vocalStructure': updateSongPrompt({ vocalStructure: 'Instrumental' }); break;
      case 'vocalStyle': updateSongPrompt({ vocalStyle: '' }); break;
      case 'vocalIntensity': updateSongPrompt({ vocalIntensity: 5 }); break;
      case 'vocalEffects': updateSongPrompt({ vocalEffects: [] }); break;
      case 'duration': { setDuration(180); setHours(0); setMinutes(3); setSeconds(0); break; }
    }
  };

  const updateFromSlider = (value: number[]) => {
    const total = value[0];
    setDuration(total);
    setHours(Math.floor(total / 3600));
    setMinutes(Math.floor((total % 3600) / 60));
    setSeconds(total % 60);
  };

  const updateFromInputs = useCallback(() => {
    const total = hours * 3600 + minutes * 60 + seconds;
    setDuration(Math.min(total, 3600));
  }, [hours, minutes, seconds]);

  React.useEffect(() => { updateFromInputs(); }, [hours, minutes, seconds, updateFromInputs]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const contextRef = useRef(getFormContext());
  useEffect(() => { contextRef.current = getFormContext(); }, [
    title, songDescription, genre, subgenre, duration, vocalLanguage,
    lyricsText, artistInspiration, videoStyle, tempo, mood, vocalsEnabled,
    vocalStyle, vocalIntensity, selectedVocalEffects, structureType
  ]);

  const visualizerEnabledTrack = async (ctx: any) => {
    if (videoPollRef.current) {
      clearInterval(videoPollRef.current);
      videoPollRef.current = null;
    }
    setVideoStatus("generating");
    setVideoUrl(null);
    setVideoError(null);

    try {
      const res = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ctx),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `Video API failed: ${res.status}`);
      }

      const data = await res.json();

      if (data.videoUrl) {
        setVideoUrl(data.videoUrl);
        setVideoStatus("succeeded");
        return;
      }

      if (data.jobId) {
        setVideoStatus("polling");
        videoPollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/video/status?jobId=${data.jobId}`);
            const statusData = await statusRes.json();

            if (statusData.status === "succeeded" && statusData.videoUrl) {
              clearInterval(videoPollRef.current!);
              videoPollRef.current = null;
              setVideoUrl(statusData.videoUrl);
              setVideoStatus("succeeded");
            } else if (statusData.status === "failed" || statusData.status === "canceled") {
              clearInterval(videoPollRef.current!);
              videoPollRef.current = null;
              setVideoStatus("failed");
              setVideoError(statusData.error ?? "Video generation failed");
            }
          } catch (pollErr) {
            clearInterval(videoPollRef.current!);
            videoPollRef.current = null;
            setVideoStatus("failed");
            setVideoError((pollErr as Error).message);
          }
        }, 4000);
      }
    } catch (err) {
      setVideoStatus("failed");
      setVideoError((err as Error).message);
    }
  };

  useEffect(() => {
    return () => {
      if (videoPollRef.current) clearInterval(videoPollRef.current);
    };
  }, []);

  useEffect(() => {
    // Determine if audio is done for current session
    if (currentCreation?.status === "completed" && visualizerEnabled && currentCreation.tracks[0]?.audioUrl && videoStatus === 'idle') {
      visualizerEnabledTrack(contextRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCreation?.status, currentCreation?.tracks, visualizerEnabled]);

  const handleGenerate = async () => {
    if (!isAuthenticated) { onAuthClick(); return; }

    console.log("[Generate] Context being sent:", JSON.stringify(contextRef.current, null, 2));
    
    // Reset video state
    setVideoStatus("idle");
    setVideoUrl(null);
    setVideoError(null);

    if (mode === 'album') {
      await createMusic({
        type: 'album',
        title: albumName || 'Untitled Album',
        songDescription: albumVibe,
        genre: albumTracks[0]?.genre || 'Pop',
        duration: albumTracks.reduce((acc, t) => acc + t.duration, 0),
        visualizerEnabled: albumTracks.some(t => t.generateVideo),
        vocalLanguage: albumTracks[0]?.vocalLanguage || 'English',
        albumTracks,
      });
    } else {
      const ctx = contextRef.current;
      await createMusic({
        type: 'song',
        songTitle: ctx.title || 'Untitled Track',
        title: ctx.title || 'Untitled Track',
        songDescription: ctx.songDescription, 
        genre: selectedGenres[0]?.label || ctx.genre || 'Pop',
        duration: ctx.duration, 
        visualizerEnabled,
        vocalLanguage: ctx.vocalLanguage,
        lyricsText: ctx.lyricsText || undefined,
        artistInspiration: ctx.artistInspiration || undefined,
        videoStyle: visualizerEnabled ? ctx.videoStyle : undefined,
        tempo: ctx.tempo, 
        mood: ctx.mood || undefined,
        subgenre: ctx.subgenre,
        vocalsEnabled: ctx.vocalsEnabled,
        vocalStyle: ctx.vocalStyle || undefined,
        vocalIntensity: ctx.vocalIntensity, 
        vocalEffects: ctx.vocalEffects,
        structureType: ctx.structureType || undefined,
        lyricsTheme: ctx.lyricsTheme || undefined,
        energyLevel: ctx.energyLevel,
        instruments: ctx.instruments,
      });
    }
  };

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownload = async (audioUrl?: string, trackTitle?: string) => {
    if (!audioUrl) return;

    try {
      // If it's already a base64 data URL (ElevenLabs path), convert to blob
      if (audioUrl.startsWith("data:")) {
        const response = await fetch(audioUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `musevibe-${trackTitle}.mp3`);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return;
      }

      // If it's a blob: URL
      if (audioUrl.startsWith("blob:")) {
        triggerDownload(audioUrl, `musevibe-${trackTitle}.wav`);
        return;
      }

      // If it's an external URL (Replicate or Vercel Blob)
      // Fetch it through our own proxy to force download headers
      const response = await fetch(`/api/download?url=${encodeURIComponent(audioUrl)}`);
      if (!response.ok) throw new Error("Download fetch failed");
      const blob = await response.blob();
      const contentType = response.headers.get("content-type") ?? "audio/mpeg";
      const ext = contentType.includes("wav") ? "wav" : "mp3";
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, `musevibe-${trackTitle}.${ext}`);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch (err) {
      console.error("Download failed:", err);
      // Last resort fallback: open in new tab
      window.open(audioUrl, "_blank");
    }
  };

  const handleTrackPlay = (track: { id: string; title: string; audioUrl?: string; videoUrl?: string; duration: number; lyrics?: string; lyricCues?: PlayerTrack['lyricCues'] }) => {
    if (!track.audioUrl) return;
    const isCurrentTrack = player.currentTrack?.id === track.id;
    if (isCurrentTrack) {
      player.togglePlay();
    } else {
      player.play({
        id: track.id,
        title: track.title,
        artist: currentCreation?.title || 'HarmonyAI',
        audioUrl: track.audioUrl,
        videoUrl: track.videoUrl,
        duration: track.duration,
        genres: currentCreation?.genre ? [currentCreation.genre] : undefined,
        lyrics: track.lyrics || currentCreation?.lyricsText,
        lyricCues: track.lyricCues,
      });
    }
  };

  const AiToolbar: React.FC<{ field: string }> = ({ field }) => {
    const isSuggesting = !!suggestionState.loading[`${field}-suggest`];
    const isEnhancing = !!suggestionState.loading[`${field}-enhance`];
    const isNew = !!suggestionState.loading[`${field}-new`];
    const isLoading = isSuggesting || isEnhancing || isNew;
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => handleAiSuggest(field)} disabled={isLoading} className="text-xs h-7 px-2 border-primary/30 text-primary hover:bg-primary/10">
          {isSuggesting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wand2 className="w-3 h-3 mr-1" />} AI Suggest
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleEnhance(field)} disabled={isLoading} className="text-xs h-7 px-2 border-accent/30 text-accent hover:bg-accent/10">
          {isEnhancing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />} Enhance
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleNewSuggestion(field)} disabled={isLoading} className="text-xs h-7 px-2 border-muted-foreground/30 text-muted-foreground hover:bg-muted/50">
          {isNew ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />} New
        </Button>
        <Button variant="ghost" size="sm" onClick={() => handleClear(field)} disabled={isLoading} className="text-xs h-7 px-2 text-muted-foreground hover:text-destructive">
          <Trash2 className="w-3 h-3 mr-1" /> Clear
        </Button>
      </div>
    );
  };

  // Pipeline Progress
  const PIPELINE_STEPS = [
    { key: 'analyzing', label: 'Analyzing prompt', icon: '🔍', match: /analyz/i },
    { key: 'seeding', label: 'Creating GenerationDNA', icon: '🧬', match: /generationdna|seed|dna|prepar/i },
    { key: 'inferring', label: 'Inferring musical style', icon: '🎯', match: /infer|style/i },
    { key: 'planning', label: 'Planning arrangement', icon: '🎼', match: /plan|arrang/i },
    { key: 'composing', label: 'Generating melody', icon: '🎹', match: /melody|motif|hook/i },
    { key: 'instrumental', label: 'Synthesizing instruments', icon: '🎵', match: /synthesi[sz].*instrument|instrument layer|segment/i },
    { key: 'vocals', label: 'Generating vocals', icon: '🎤', match: /vocal|lyric|singing|synthe/i },
    { key: 'vocal_align', label: 'Aligning & mixing vocals', icon: '🎙️', match: /align.*vocal|mix.*vocal/i },
    { key: 'mixing', label: 'Mixing audio', icon: '🎚️', match: /mix(?!.*vocal)/i },
    { key: 'mastering', label: 'Mastering track', icon: '💿', match: /master/i },
    { key: 'beat_analysis', label: 'Analyzing beats', icon: '📊', match: /analyzing beats|beat structure/i },
    { key: 'video_gen', label: 'Rendering visuals', icon: '🎬', match: /render.*visual|render.*video|generat.*video/i },
    { key: 'video_enc', label: 'Encoding video', icon: '📹', match: /encod.*video/i },
    { key: 'finalizing', label: 'Finalizing & uploading', icon: '💾', match: /finaliz|upload/i },
    { key: 'complete', label: 'Complete', icon: '✅', match: /complete/i },
  ];

  const PipelineProgress: React.FC<{ currentStage: string; progress: number; estimatedTimeLeft: number }> = ({ currentStage, progress, estimatedTimeLeft }) => {
    const currentStepIdx = PIPELINE_STEPS.findIndex(s => s.match.test(currentStage));
    const activeIdx = currentStepIdx >= 0 ? currentStepIdx : 0;

    const formatEta = (secs: number) => {
      if (secs <= 0) return '';
      if (secs >= 60) return `~${Math.floor(secs / 60)}m ${secs % 60}s`;
      return `~${secs}s`;
    };

    return (
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          {PIPELINE_STEPS.map((step, idx) => {
            const isComplete = idx < activeIdx;
            const isActive = idx === activeIdx;
            const isPending = idx > activeIdx;
            return (
              <div key={step.key} className={`flex items-center gap-2.5 text-xs py-1 px-2 rounded-md transition-all ${isActive ? 'bg-primary/10 border border-primary/20' : ''} ${isPending ? 'opacity-30' : ''}`}>
                {isComplete ? <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /> : isActive ? <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" /> : <Circle className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />}
                <span className="mr-1">{step.icon}</span>
                <span className={`font-medium ${isActive ? 'text-primary' : isComplete ? 'text-green-400' : 'text-muted-foreground'}`}>{step.label}</span>
              </div>
            );
          })}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Step {activeIdx + 1} of {PIPELINE_STEPS.length}</span>
            <div className="flex items-center gap-3">
              {estimatedTimeLeft > 0 && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatEta(estimatedTimeLeft)} remaining</span>}
              <span className="font-mono">{Math.round(progress * 100)}%</span>
            </div>
          </div>
          <Progress value={progress * 100} className="h-2" />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
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
          </motion.div>

          {/* ===== ALBUM MODE ===== */}
          {mode === 'album' && (
            <>
              {/* Album Name + Vibe */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card rounded-xl p-4 sm:p-6 space-y-4">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-2">
                    <Label className="text-foreground font-medium">Album Name</Label>
                    <AiToolbar field="albumName" />
                  </div>
                  <Input placeholder="Enter album name..." value={albumName} onChange={e => setAlbumName(e.target.value)} className="bg-input border-border" />
                </div>
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-1">
                    <div>
                      <Label className="text-foreground font-medium">Album Vibe (optional)</Label>
                      <p className="text-xs text-muted-foreground mt-1">Global inspiration that can be applied to individual tracks</p>
                    </div>
                    <AiToolbar field="albumVibe" />
                  </div>
                  <Textarea placeholder="e.g., Dark atmospheric journey through urban nightscapes..." value={albumVibe} onChange={e => setAlbumVibe(e.target.value)} className="bg-input border-border min-h-20 resize-none" />
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm mb-2 block">Number of Songs</Label>
                  <div className="flex items-center gap-4">
                    <Input type="number" min={2} max={20} value={numberOfSongs} onChange={e => setNumberOfSongs(Math.max(2, Math.min(20, parseInt(e.target.value) || 2)))} className="w-24 bg-input border-border" />
                    <span className="text-sm text-muted-foreground">{numberOfSongs} tracks</span>
                  </div>
                </div>
              </motion.div>

              {/* Per-track forms */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-3">
                <h2 className="font-display text-lg font-semibold text-foreground">Tracks</h2>
                <p className="text-sm text-muted-foreground mb-2">Configure each track independently. Use "Apply Album Vibe" to inherit the global vibe prompt.</p>
                {albumTracks.map((tc, i) => (
                  <AlbumTrackForm
                    key={i}
                    index={i}
                    config={tc}
                    onChange={(c) => updateAlbumTrack(i, c)}
                    albumVibe={albumVibe}
                    aiSuggest={aiSuggest}
                  />
                ))}
              </motion.div>
            </>
          )}

          {/* ===== SONG MODE ===== */}
          {mode === 'song' && (
            <>
              {/* Title */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card rounded-xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
                  <Label className="text-foreground font-medium">Track Name</Label>
                  <AiToolbar field="trackName" />
                </div>
                <Input placeholder="Enter track name (optional)" value={title} onChange={e => setTitle(e.target.value)} className="bg-input border-border" />
              </motion.div>

              {/* Music Prompt */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card rounded-xl p-4 sm:p-6">
                <div className="flex flex-col gap-2 mb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <Label className="text-foreground font-medium">Music Prompt</Label>
                      <p className="text-sm text-muted-foreground mt-1">Describe the mood, energy, atmosphere</p>
                    </div>
                  </div>
                  <AiToolbar field="prompt" />
                </div>
                <Textarea placeholder="e.g., A dreamy nostalgic sunset vibe with warm synths..." value={songDescription} onChange={e => updateSongPrompt({ songDescription: e.target.value })} className="bg-input border-border min-h-32 resize-none" />
              </motion.div>

              {/* Genres */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card rounded-xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
                  <Label className="text-foreground font-medium">Genres</Label>
                  <AiToolbar field="genres" />
                </div>
                <SmartSearchInput
                  value={selectedGenres.map(g => g.label)}
                  onChange={(val: string[]) => {
                    const normalized = normalizeGenreOptions(val);
                    setSelectedGenres(normalized);
                    setGenre(normalized[0]?.label || 'Pop');
                  }}
                  options={GENRE_OPTIONS.map(g => g.label)}
                  placeholder="Type or select genres..."
                  multiSelect
                />
              </motion.div>

              {/* Subgenres */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }} className="glass-card rounded-xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
                  <Label className="text-foreground font-medium">Subgenres / Styles</Label>
                  <AiToolbar field="subgenre" />
                </div>
                <SmartSearchInput
                  value={selectedSubgenres}
                  onChange={(val: string[]) => {
                    setSelectedSubgenres(val);
                    setSubgenre(val.join(', '));
                  }}
                  options={[]} // Dynamically populated by AI or empty for custom
                  placeholder="e.g., Deep, Melodic, Industrial..."
                  multiSelect
                />
              </motion.div>

              {/* Tempo */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="glass-card rounded-xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-muted-foreground" />
                    <Label className="text-foreground font-medium">Tempo (BPM)</Label>
                    <span className="ml-2 text-lg font-display text-primary">{tempo} BPM</span>
                  </div>
                  <AiToolbar field="tempo" />
                </div>
                <Slider value={[tempo]} onValueChange={v => updateSongPrompt({ tempo: v[0] })} min={60} max={200} step={1} className="mb-3" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>60 BPM (Slow)</span><span>200 BPM (Fast)</span>
                </div>
              </motion.div>

              {/* Duration */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card rounded-xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-muted-foreground" />
                    <Label className="text-foreground font-medium">Duration</Label>
                    <span className="ml-2 text-lg font-display text-primary">{formatDuration(duration)}</span>
                  </div>
                  <AiToolbar field="duration" />
                </div>
                <Slider value={[duration]} onValueChange={updateFromSlider} max={600} min={30} step={1} className="mb-6" />
                <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Input type="number" min={0} max={1} value={hours} onChange={e => setHours(Math.min(1, parseInt(e.target.value) || 0))} className="w-14 sm:w-16 bg-input border-border text-center" />
                    <span className="text-muted-foreground text-sm">HH</span>
                  </div>
                  <span className="text-muted-foreground">:</span>
                  <div className="flex items-center gap-2">
                    <Input type="number" min={0} max={59} value={minutes} onChange={e => setMinutes(Math.min(59, parseInt(e.target.value) || 0))} className="w-14 sm:w-16 bg-input border-border text-center" />
                    <span className="text-muted-foreground text-sm">MM</span>
                  </div>
                  <span className="text-muted-foreground">:</span>
                  <div className="flex items-center gap-2">
                    <Input type="number" min={0} max={59} value={seconds} onChange={e => setSeconds(Math.min(59, parseInt(e.target.value) || 0))} className="w-14 sm:w-16 bg-input border-border text-center" />
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
                <SmartSearchInput
                  value={mood}
                  onChange={(val: string) => updateSongPrompt({ mood: val })}
                  options={PRESET_MOODS}
                  placeholder="e.g., Dark, euphoric, melancholic..."
                />
              </motion.div>

              {/* Song Structure */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }} className="glass-card rounded-xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
                  <Label className="text-foreground font-medium">Song Structure</Label>
                  <AiToolbar field="structureType" />
                </div>
                <SmartSearchInput
                  value={structureType}
                  onChange={(val: string) => updateSongPrompt({ structureType: val })}
                  options={SONG_STRUCTURE_PRESETS}
                  placeholder="e.g., Intro → Verse → Chorus → Outro"
                />
              </motion.div>

              {/* Vocal Structure */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.33 }} className="glass-card rounded-xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
                  <div className="flex items-center gap-2">
                    <AudioWaveform className="w-5 h-5 text-muted-foreground" />
                    <Label className="text-foreground font-medium">Vocal Arrangement</Label>
                  </div>
                  <AiToolbar field="structureType" />
                </div>
                <SmartSearchInput
                  value={structureType}
                  onChange={(val: string) => updateSongPrompt({ structureType: val })}
                  options={VOCAL_STRUCTURE_PRESETS}
                  placeholder="e.g., Verse - Chorus - Verse"
                />
              </motion.div>

              {/* Vocal Style */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34 }} className="glass-card rounded-xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
                  <div className="flex items-center gap-2">
                    <Mic2 className="w-5 h-5 text-muted-foreground" />
                    <Label className="text-foreground font-medium">Vocal Style / Delivery</Label>
                  </div>
                  <AiToolbar field="vocalStyle" />
                </div>
                <SmartSearchInput
                  value={vocalStyle}
                  onChange={(val: string) => updateSongPrompt({ vocalStyle: val })}
                  options={PRESET_VOCAL_STYLES}
                  placeholder="e.g., Male Vocal, Rap, Ethereal..."
                />
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
                <Slider value={[vocalIntensity]} onValueChange={v => updateSongPrompt({ vocalIntensity: v[0] })} min={1} max={10} step={1} className="mb-3" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>1 — Soft whisper</span><span>10 — Powerful performance</span>
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
                <SmartSearchInput
                  value={selectedVocalEffects}
                  onChange={(val: string[]) => setSelectedVocalEffects(val)}
                  options={VOCAL_EFFECTS_OPTIONS}
                  placeholder="Select or type effects..."
                  multiSelect
                />
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
                <SmartSearchInput
                  value={vocalLanguage}
                  onChange={(val: string) => setVocalLanguage(val)}
                  options={LANGUAGES}
                  placeholder="Select or type language..."
                />
              </motion.div>

              {/* Lyric Theme */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }} className="glass-card rounded-xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
                  <Label className="text-foreground font-medium">Lyric Theme</Label>
                  <AiToolbar field="lyricsTheme" />
                </div>
                <SmartSearchInput
                  value={lyricsTheme}
                  onChange={(val: string) => setLyricsTheme(val)}
                  options={PRESET_LYRIC_THEMES}
                  placeholder="e.g., Cyberpunk Future, Nature & Peace..."
                />
              </motion.div>

              {/* Lyrics */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card rounded-xl p-4 sm:p-6">
                <div className="flex flex-col gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Mic2 className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <Label className="text-foreground font-medium">Lyrics (optional)</Label>
                      <p className="text-sm text-muted-foreground">Themes, stories, or full lyrics</p>
                    </div>
                  </div>
                  <AiToolbar field="lyrics" />
                </div>
                <Textarea placeholder="e.g., A story about finding hope after loss..." value={lyricsText} onChange={e => setLyricsText(e.target.value)} className="bg-input border-border min-h-32 resize-none" />
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
                <Input placeholder="e.g., Tame Impala, Daft Punk, Billie Eilish..." value={artistInspiration} onChange={e => updateSongPrompt({ artistInspiration: e.target.value })} className="bg-input border-border" />
              </motion.div>

              {/* Video */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass-card rounded-xl p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <Label className="text-foreground font-medium">Generate Video</Label>
                      <p className="text-sm text-muted-foreground">Create a visual accompaniment</p>
                    </div>
                  </div>
                  <Switch checked={visualizerEnabled} onCheckedChange={setGenerateVideo} />
                </div>
                <AnimatePresence>
                  {visualizerEnabled && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
                        <div className="flex items-center gap-2">
                          <Palette className="w-5 h-5 text-muted-foreground" />
                          <Label className="text-foreground font-medium">Video Style</Label>
                        </div>
                        <AiToolbar field="videoStyle" />
                      </div>
                      <SmartSearchInput
                        value={videoStyle}
                        onChange={(val: string) => updateSongPrompt({ videoStyle: val })}
                        options={PRESET_VIDEO_STYLES}
                        placeholder="e.g., Abstract geometric visuals..."
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </>
          )}

          {/* Generate Button */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
            <Button onClick={handleGenerate} disabled={isCreating} variant="glow" size="xl" className="w-full">
              {isCreating ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Creating...</>
              ) : (
                <><Sparkles className="w-5 h-5" /> Generate {mode === 'song' ? 'Song' : `Album (${numberOfSongs} tracks)`}</>
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
                        {track.audioUrl ? (
                          <button onClick={() => handleTrackPlay(track)} className={`w-10 h-10 rounded-full flex items-center justify-center hover:opacity-90 transition-smooth flex-shrink-0 ${player.currentTrack?.id === track.id ? 'bg-primary' : 'bg-primary/80'}`}>
                            {player.currentTrack?.id === track.id && player.isPlaying ? <Pause className="w-5 h-5 text-primary-foreground" /> : <Play className="w-5 h-5 text-primary-foreground ml-0.5" />}
                          </button>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                            {track.status === 'failed' ? <X className="w-5 h-5 text-destructive" /> :
                              track.status === 'pending' ? <Circle className="w-5 h-5 text-muted-foreground" /> :
                              <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium truncate ${player.currentTrack?.id === track.id ? 'text-primary' : 'text-foreground'}`}>
                            {currentCreation.type === 'album' && `${index + 1}. `}{track.title}
                          </p>
                          {track.status === 'pending' && (
                            <p className="text-xs text-muted-foreground mt-1">Waiting to start...</p>
                          )}
                          {ACTIVE_STATUSES.includes(track.status) && (
                            <PipelineProgress
                              currentStage={track.currentStage || track.status}
                              progress={track.progress || 0}
                              estimatedTimeLeft={track.estimatedTimeLeft || 0}
                            />
                          )}
                          {track.audioUrl && (
                            <p className="text-sm text-muted-foreground">{formatDuration(track.duration)}</p>
                          )}
                          {/* VIDEO GENERATION STATUS */}
                          {videoStatus === "generating" && (
                            <div className="flex items-center gap-2 text-sm text-purple-600 mt-4">
                              <span className="inline-block w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                              Creating video visuals...
                            </div>
                          )}

                          {videoStatus === "polling" && (
                            <div className="flex items-center gap-2 text-sm text-purple-600 mt-4">
                              <span className="inline-block w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                              Rendering video...
                            </div>
                          )}

                          {videoStatus === "succeeded" && videoUrl && (
                            <div className="mt-4">
                              <video controls src={videoUrl} className="w-full rounded-lg" />
                              <button
                                type="button"
                                className="mt-2 text-sm text-blue-500 hover:underline"
                                onClick={() => {
                                  const a = document.createElement("a");
                                  a.href = videoUrl;
                                  a.download = "musevibe-video.mp4";
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                }}
                              >
                                ⬇ Download Video
                              </button>
                            </div>
                          )}

                          {videoStatus === "failed" && videoError && (
                            <div className="mt-4 text-sm text-red-500">
                              Video failed: {videoError}
                            </div>
                          )}
                          {track.videoUrl && videoStatus !== "succeeded" && (
                            <div className="mt-3">
                              <VideoPlayer videoUrl={track.videoUrl} title={track.title} duration={track.duration} />
                            </div>
                          )}
                          {track.status === 'failed' && track.errorMessage && (
                            <p className="text-sm text-destructive mt-1">{track.errorMessage}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {track.audioUrl && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => handleDownload(track.audioUrl, track.title || 'track')}>
                                <Download className="w-5 h-5" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(track.audioUrl!); toast.success('Link copied!'); }}>
                                <Share2 className="w-5 h-5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
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
