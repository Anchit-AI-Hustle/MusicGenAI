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
  Music, Disc, Clock, Languages, Mic2, Users,
  Video, Palette, Sparkles, Loader2, Play, Pause, Download, ChevronDown, X,
  Zap, Activity, AudioWaveform, Share2, Check, Circle, MonitorPlay, LayoutDashboard
} from 'lucide-react';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { AiToolbar as SharedAiToolbar } from '@/components/AiToolbar';
import { Button } from '@/components/ui/button';
import { nextGenerationNonce } from '@/lib/intelligence';
import { useLocalSynth, downloadArrayBuffer } from '@/hooks/useLocalSynth';
import { inferContextFromDescription } from '@/lib/contextInference';
import { Wand2 } from 'lucide-react';
import { ARTIST_NAMES } from '@/lib/musicData/artists';
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
  uploading_video: 'Uploading video',
  processing: 'Generating',
  finalizing: 'Finalizing',
  completed: 'Ready',
  failed: 'Failed',
  audio_complete_video_failed: 'Audio ready (video failed)',
};

const ACTIVE_STATUSES = ['analyzing', 'processing', 'seeding', 'inferring', 'planning_structure', 'generating_melody', 'synthesizing_instruments', 'generating_vocals', 'vocal_alignment', 'mixing_audio', 'mastering_track', 'analyzing_beat_structure', 'generating_video', 'rendering_video', 'encoding_video', 'transcoding_video', 'uploading_video', 'finalizing'];

interface CreateMusicPageProps {
  onAuthClick: () => void;
  /** Lets the completion-state CTA jump straight to the dashboard. */
  onNavigate?: (page: string) => void;
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
  vocalGender: 'male' | 'female' | 'neutral';
  vocalLanguage: string;
  vocalIntensity: number;
  vocalEffects: string[];
  lyricsText: string;
  lyricsTheme: string;
  artistInspiration: string;
  instruments: string[];
  energyLevel: number;
  structureType: string;
  vocalArrangement: string;
  visualizerEnabled: boolean;
  videoStyle: string;
  useHighQualityVocals: boolean;
}

export const CreateMusicPage: React.FC<CreateMusicPageProps> = ({ onAuthClick, onNavigate }) => {
  const { isAuthenticated } = useAuth();
  const { createMusic, currentCreation, isCreating, aiSuggest, updateFormState, suggestionState, creations = [], setCurrentCreation } = useMusic();
  const player = usePlayer();
  const [mode, setMode] = useState<'song' | 'album'>('song');

  // ──────────────────────────────────────────────────────────────────────
  // Emergency fallback: local-synth.
  //
  // Local synth is NEVER the primary path. It exists only as automatic
  // backup when the AI/Replicate backend fails (missing keys, model error,
  // rate-limited, network down). We watch `currentCreation.status` and
  // when it transitions to 'failed', we transparently re-render the same
  // brief via the on-device synth so the user still gets a track. The
  // user sees a banner explaining the fallback was triggered.
  // ──────────────────────────────────────────────────────────────────────
  const emergencyLocalSynth = useLocalSynth();
  const [fallbackBriefSnapshot, setFallbackBriefSnapshot] = useState<{
    mood: string;
    genre: string;
    language?: string;
    occasion?: string;
    references?: string[];
    durationSeconds: number;
    seed: string;
  } | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const lastFailedCreationIdRef = useRef<string | null>(null);

  // Watch the active creation for transition into 'failed'. When that
  // happens AND we have a snapshot of the brief (taken inside
  // handleGenerate), automatically run the local synth as backup. The
  // `lastFailedCreationIdRef` guard ensures we only trigger once per
  // failed creation — even if React re-renders.
  useEffect(() => {
    if (!currentCreation || currentCreation.status !== 'failed') return;
    if (!fallbackBriefSnapshot) return;
    if (lastFailedCreationIdRef.current === currentCreation.id) return;
    lastFailedCreationIdRef.current = currentCreation.id;

    const reason = (currentCreation as any).errorMessage || (currentCreation as any).error_message || 'AI backend unavailable';
    setFallbackReason(reason);
    toast.error(`AI generation failed — running local synth fallback. (${reason})`);

    void emergencyLocalSynth.generate({
      mood: fallbackBriefSnapshot.mood,
      genre: fallbackBriefSnapshot.genre,
      language: fallbackBriefSnapshot.language,
      occasion: fallbackBriefSnapshot.occasion,
      references: fallbackBriefSnapshot.references,
      durationSeconds: fallbackBriefSnapshot.durationSeconds,
      instrumentalOnly: false,    // include vocoder vowel-singing
      vocoderVoice: true,
      seed: fallbackBriefSnapshot.seed,
    }).catch((err) => {
      toast.error(`Local-synth fallback also failed: ${err?.message ?? err}`);
    });
  }, [currentCreation, fallbackBriefSnapshot, emergencyLocalSynth]);
  
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
  const [isFillingFromPrompt, setIsFillingFromPrompt] = useState(false);
  const [isFillingAlbum, setIsFillingAlbum] = useState(false);
  const [visualizerEnabled, setGenerateVideo] = useState(true);
  const [videoStyle, setVideoStyle] = useState('Cinematic');
  const [tempo, setTempo] = useState(120);
  const [mood, setMood] = useState('Energetic');

  const [vocalsEnabled, setVocalsEnabled] = useState(true);
  const [vocalArrangement, setVocalArrangement] = useState('solo');
  const [vocalStyle, setVocalStyle] = useState('Female Vocal');
  const [vocalGender, setVocalGender] = useState<'male' | 'female' | 'neutral'>('neutral');
  const [vocalIntensity, setVocalIntensity] = useState(7);
  const [selectedVocalEffects, setSelectedVocalEffects] = useState<string[]>([]);
  const [showVocalEffectsDropdown, setShowVocalEffectsDropdown] = useState(false);
  const [structureType, setStructureType] = useState('Verse-Chorus-Bridge');
  const [lyricsTheme, setLyricsTheme] = useState('');
  const [energyLevel, setEnergyLevel] = useState(7);
  const [instruments, setInstruments] = useState<string[]>(['Piano', 'Drums', 'Synth', 'Bass']);
  // AI Audio always enabled — no user toggle
  const useAiAudio = true;

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
    vocalGender,
    vocalLanguage,
    vocalIntensity,
    vocalEffects: selectedVocalEffects,
    lyricsText,
    lyricsTheme,
    artistInspiration,
    instruments,
    energyLevel,
    structureType,
    vocalArrangement,
    visualizerEnabled,
    videoStyle,
    useHighQualityVocals: false,
  }), [
    songDescription, genre, subgenre, mood, tempo, duration,
    vocalsEnabled, vocalStyle, vocalGender, vocalLanguage, vocalIntensity,
    selectedVocalEffects, lyricsText, lyricsTheme, artistInspiration,
    instruments, energyLevel, structureType, vocalArrangement, visualizerEnabled, videoStyle
  ]);

  const applySongPromptState = useCallback((next: SongPromptState) => {
    setSongDescription(next.songDescription);
    setGenre(next.genre);
    setSubgenre(next.subgenre);
    setMood(next.mood);
    setTempo(next.tempo);
    setDuration(next.duration);
    // Keep HMS fields in sync whenever duration changes through any path
    setHours(Math.floor(next.duration / 3600));
    setMinutes(Math.floor((next.duration % 3600) / 60));
    setSeconds(next.duration % 60);
    setVocalsEnabled(next.vocalsEnabled);
    setVocalStyle(next.vocalStyle);
    setVocalGender(next.vocalGender);
    setVocalLanguage(next.vocalLanguage);
    setVocalIntensity(next.vocalIntensity);
    setSelectedVocalEffects(next.vocalEffects);
    setLyricsText(next.lyricsText);
    setLyricsTheme(next.lyricsTheme);
    setArtistInspiration(next.artistInspiration);
    setInstruments(next.instruments);
    setEnergyLevel(next.energyLevel);
    setStructureType(next.structureType);
    setVocalArrangement(next.vocalArrangement);
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
    // Only sync if selectedGenres doesn't already contain the current genre.
    // This prevents overwriting multi-genre selections set by auto-fill.
    setSelectedGenres(prev => {
      const alreadyHas = prev.some(g => g.label.toLowerCase() === genre.toLowerCase());
      if (alreadyHas) return prev;
      return normalizeGenreOptions([genre]);
    });
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
    vocalArrangement,
    vocalIntensity, 
    vocalEffects: selectedVocalEffects,
    structureType,
    instruments,
    energyLevel,
    lyricsTheme,
    prompt: getSongPromptState(),
  });

  /**
   * Build a "what changed" summary string for the auto-fill toasts.
   * Only includes fields whose value actually changed, capped to 4 lines
   * so the toast stays scannable. Returns null if nothing changed.
   */
  const summarizeFillChanges = (
    before: Record<string, string | number | undefined | null>,
    after: Record<string, string | number | undefined | null>,
  ): string | null => {
    const labels: Record<string, string> = {
      title: 'Track name',
      genre: 'Genre',
      subgenre: 'Subgenre',
      mood: 'Mood',
      tempo: 'Tempo',
      duration: 'Duration',
      vocalLanguage: 'Language',
      artistInspiration: 'Artist',
      lyricsTheme: 'Lyric theme',
      lyricsText: 'Lyrics',
      videoStyle: 'Video style',
      vocalStyle: 'Vocal style',
      vocalGender: 'Vocal gender',
      structureType: 'Structure',
      energyLevel: 'Energy',
      vocalIntensity: 'Vocal intensity',
      instruments: 'Instruments',
      vocalArrangement: 'Vocal arrangement',
    };
    const lines: string[] = [];
    for (const key of Object.keys(labels)) {
      const a = (after[key] ?? '').toString();
      const b = (before[key] ?? '').toString();
      if (a && a !== b) {
        const suffix = key === 'tempo' ? ' BPM' : '';
        lines.push(`${labels[key]} → ${a}${suffix}`);
      }
    }
    if (lines.length === 0) return null;
    const head = lines.slice(0, 4);
    const more = lines.length - head.length;
    return more > 0 ? `${head.join(' · ')}  + ${more} more` : head.join(' · ');
  };

  /**
   * Parse a comma-separated instrumentation string into a clean array,
   * dropping empties and trimming whitespace.
   */
  const parseInstrumentation = (raw?: string): string[] =>
    (raw ?? '').split(',').map(s => s.trim()).filter(Boolean);

  /**
   * Tiny seeded RNG used by buildTrackName / buildLyricsBody. Same nonce →
   * same output (so retries are deterministic per-click), but each new
   * `nextGenerationNonce(...)` produces a fresh sequence.
   */
  const createFillRng = (seedStr: string): (() => number) => {
    let s = Array.from(seedStr).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 2166136261);
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
  };

  /**
   * Auto-fill: take a single freeform prompt and populate every applicable
   * song-mode field (genre, subgenre, mood, tempo, language, artist, lyric
   * theme, video style, instruments, energy, vocal intensity, structure,
   * vocal effects, vocal arrangement, vocals on/off) using the local
   * context-inference engine. Synchronous — no network.
   */
  /**
   * Procedural generators used by the fill action. Salted with a fresh
   * nonce so each click yields a different combination even with the same
   * prompt. Combinatorial pool size > 10000 per field.
   */
  const buildTrackName = (moodLabel: string, genreLabel: string, nonce: string): string => {
    const r = createFillRng(nonce + ':title');
    const adj = ['Neon', 'Velvet', 'Wild', 'Midnight', 'Golden', 'Silver', 'Hollow', 'Crystal', 'Iron', 'Liquid', 'Phantom', 'Sun-bleached', 'Steel', 'Sacred', 'Reckless', 'Quiet', 'Electric', 'Chrome', 'Paper', 'Moonlit'];
    const noun = ['Skyline', 'Echo', 'Pulse', 'Cathedral', 'Highway', 'Static', 'Mirror', 'Bloom', 'Empire', 'Anthem', 'Ghost', 'Tide', 'Heart', 'Ascent', 'Promise', 'Fire', 'Storm', 'Hymn', 'Dawn', 'Lament'];
    const moodNouns: Record<string, string[]> = {
      Aggressive: ['Riot', 'Reckoning', 'Empire', 'Knife', 'Cage'],
      Energetic: ['Pulse', 'Rush', 'Skyline', 'Ascent', 'Sprint'],
      Euphoric: ['Rush', 'Skyline', 'Bliss', 'Ascent', 'Lift'],
      Melancholic: ['Lament', 'Ghost', 'Rain', 'Fade', 'Letter'],
      Romantic: ['Velvet', 'Promise', 'Hymn', 'Heart', 'Bloom'],
      Chill: ['Tide', 'Whisper', 'Shore', 'Drift', 'Lull'],
      Epic: ['Empire', 'Ascent', 'Horizon', 'Cathedral', 'Crown'],
      Dark: ['Shadow', 'Static', 'Hollow', 'Phantom', 'Vault'],
      Atmospheric: ['Edge', 'Pressure', 'Haze', 'Drift', 'Fog'],
      Cinematic: ['Empire', 'Horizon', 'Cathedral', 'Crown', 'Ascent'],
      Dreamy: ['Tide', 'Cloud', 'Shore', 'Drift', 'Bloom'],
      Mysterious: ['Phantom', 'Vault', 'Riddle', 'Cipher', 'Veil'],
      Uplifting: ['Sunrise', 'Dawn', 'Bloom', 'Lift', 'Ascent'],
      Nostalgic: ['Letter', 'Memory', 'Polaroid', 'Echo', 'Yesterday'],
    };
    const finalNoun = (moodNouns[moodLabel] && r() < 0.6)
      ? moodNouns[moodLabel][Math.floor(r() * moodNouns[moodLabel].length)]
      : noun[Math.floor(r() * noun.length)];
    const finalAdj = adj[Math.floor(r() * adj.length)];
    // Sometimes inject a genre word, sometimes just adj+noun
    const useGenre = r() < 0.25 && genreLabel;
    if (useGenre) return `${finalAdj} ${genreLabel}`;
    return `${finalAdj} ${finalNoun}`;
  };

  const buildLyricsBody = (themeLabel: string, nonce: string): string => {
    const r = createFillRng(nonce + ':lyrics');
    const verseBank = [
      `City lights fade while we run from yesterday.\nEvery scar is a map to where we are today.\nHold me through the noise until the dawn arrives.\nTurn this ache to fire and bring us back to life.`,
      `Static in the skyline, thunder in my chest.\nI learned to dance with fear and still call this progress.\nIf the night keeps pulling, I will pull back too.\nMake a home in the chaos till the morning cuts through.`,
      `We were shadows on the overpass, names lost in rain.\nYou said every wound can bloom if we stay through pain.\nWhen the sirens fade, keep your heartbeat close to mine.\nWe'll turn broken neon into something that can shine.`,
      `I keep a candle burning where the silence used to live.\nEvery word I never said is something I forgive.\nThere's a kind of mercy that you only learn alone —\nlearning how to call this body, finally, my home.`,
      `Some nights the rain remembers what the dryness tries to hide.\nI've been writing love letters to the parts of me that died.\nIf you ever come back looking, leave the locks the way they are —\nI replaced them all with windows so I'd never feel that far.`,
    ];
    const chorusBank = [
      `So go wild, go wild, until the morning calls our name.\nGo wild, go wild — we'll burn this beautiful again.`,
      `Hold the line, hold the light, hold the version that survives.\nOne more night, one more night, and we'll forget we ever cried.`,
      `If you fall, I'll fall louder — we go down like fireworks.\nIf you stay, I'll stay forever, even when forever hurts.`,
      `Pull me close, pull me closer, let the static drown the noise.\nWe were always meant to find each other in this kind of poise.`,
    ];
    const verse = verseBank[Math.floor(r() * verseBank.length)];
    const chorus = chorusBank[Math.floor(r() * chorusBank.length)];
    const themeLine = themeLabel ? `Theme: ${themeLabel}.\n\n` : '';
    return `${themeLine}[Verse 1]\n${verse}\n\n[Chorus]\n${chorus}`;
  };

  const inferVocalGender = (genreLabel: string, artistList: string[]): 'male' | 'female' | 'neutral' => {
    const fem = ['Taylor Swift', 'Billie Eilish', 'Dua Lipa', 'Olivia Rodrigo', 'Sabrina Carpenter', 'Chappell Roan', 'SZA', 'Doja Cat', 'Ariana Grande', 'Beyoncé', 'Karol G', 'Tems', 'BLACKPINK', 'NewJeans', 'LE SSERAFIM', 'Phoebe Bridgers', 'Mitski', 'Lana Del Rey', 'boygenius'];
    const masc = ['The Weeknd', 'Drake', 'Bad Bunny', 'Kendrick Lamar', 'Travis Scott', 'Tyler, The Creator', 'Frank Ocean', 'Peso Pluma', 'Rauw Alejandro', 'Burna Boy', 'Rema', 'Asake', 'AP Dhillon', 'Karan Aujla', 'Diljit Dosanjh', 'Shubh', 'Sidhu Moose Wala', 'Arijit Singh', 'Hanumankind', 'Anuv Jain', 'BTS', 'Stray Kids', 'Zach Bryan', 'Morgan Wallen', 'Chris Stapleton'];
    for (const a of artistList) {
      if (fem.includes(a)) return 'female';
      if (masc.includes(a)) return 'male';
    }
    if (/k-pop|j-pop|bollywood/i.test(genreLabel)) return 'female';
    if (/hip hop|rap|drill|metal|industrial|country|punk|rock/i.test(genreLabel)) return 'male';
    return 'neutral';
  };

  const inferDurationFromGenre = (genreLabel: string): number => {
    const map: Record<string, number> = {
      'Hip Hop': 180, 'Punjabi Drill': 165, 'Reggaeton': 200, 'Pop': 200,
      'K-Pop': 200, 'J-Pop': 220, 'Rock': 240, 'Metal': 280, 'Electronic': 240,
      'R&B': 220, 'Lo-fi': 150, 'Country': 200, 'Bhangra': 200, 'Bollywood': 260,
      'Jazz': 280, 'Classical': 300, 'Techno': 300, 'Hard Techno': 300,
      'House': 280, 'Deep House': 280, 'Industrial': 260, 'Ambient': 300,
      'Drum and Bass': 240, 'Trap': 200, 'Drill': 180, 'Phonk': 180,
      'Synthwave': 240, 'Afrobeats': 220, 'Dancehall': 200, 'Reggae': 240,
      'Soul': 240, 'Funk': 240, 'Blues': 260, 'Folk': 220, 'Punk': 180,
      'EDM': 240, 'Dubstep': 240, 'Indie Pop': 200, 'Synth-pop': 200,
    };
    return map[genreLabel] ?? 180;
  };

  const fillSongFromPrompt = async (text: string) => {
    const trimmed = (text || '').trim();
    console.log('[fillSongFromPrompt] click — prompt length:', trimmed.length);
    if (!trimmed) {
      toast.error('Add a prompt or description first.');
      return;
    }
    if (isFillingFromPrompt) {
      console.log('[fillSongFromPrompt] skipping — already filling');
      return;
    }
    setIsFillingFromPrompt(true);
    const fillToastId = toast.loading('Filling all fields from your prompt…');
   try {
    // Yield so the spinner paints before the (synchronous) inference work,
    // and so React's controlled-input updates flush in a clear sequence.
    await new Promise<void>(r => setTimeout(r, 30));
    const fillNonce = nextGenerationNonce('fill');
    // Enrich the prompt with any genres/mood the user already selected
    // manually so inference considers them even if not typed in the description.
    let enrichedPrompt = trimmed;
    const lowerPrompt = trimmed.toLowerCase();
    for (const g of selectedGenres) {
      if (!lowerPrompt.includes(g.label.toLowerCase())) {
        enrichedPrompt += ` ${g.label}`;
      }
    }
    if (mood && !lowerPrompt.includes(mood.toLowerCase())) {
      enrichedPrompt += ` ${mood}`;
    }
    const inferred = inferContextFromDescription(enrichedPrompt, fillNonce);
    console.log('[fillSongFromPrompt] inferred:', inferred);
    const before = {
      title, genre, subgenre, mood, tempo, vocalLanguage, artistInspiration,
      lyricsTheme, lyricsText, videoStyle, vocalStyle, structureType,
      energyLevel: String(energyLevel),
      vocalIntensity: String(vocalIntensity),
      instruments: instruments.join(', '),
      vocalArrangement, vocalGender,
      duration: String(duration),
    };
    const tempoNext = inferred.tempo
      ? Math.max(60, Math.min(200, inferred.tempo))
      : tempo;
    const inferredInstruments = parseInstrumentation(inferred.instrumentation);
    const nextGenre = inferred.genre || genre;
    const nextMood = inferred.mood || mood;
    const nextArtist = inferred.artistInspiration || artistInspiration;
    const artistList = nextArtist.split(',').map(s => s.trim()).filter(Boolean);
    const nextLyricsTheme = inferred.lyricTheme || lyricsTheme;
    // Track name, full lyrics, vocal gender, duration, and visualizer flag
    // are all derived here so EVERY field on the page ends up populated.
    const nextTitle = title.trim() || buildTrackName(nextMood, nextGenre, fillNonce);
    const nextLyricsText = lyricsText.trim() || buildLyricsBody(nextLyricsTheme, fillNonce);
    const nextVocalGender = inferVocalGender(nextGenre, artistList);
    const nextDuration = duration && duration !== 180 ? duration : inferDurationFromGenre(nextGenre);
    const after = {
      title: nextTitle,
      genre: nextGenre,
      subgenre: inferred.subgenre || subgenre,
      mood: nextMood,
      tempo: tempoNext,
      duration: nextDuration,
      vocalLanguage: inferred.vocalLanguage || vocalLanguage,
      artistInspiration: nextArtist,
      lyricsTheme: nextLyricsTheme,
      lyricsText: nextLyricsText,
      videoStyle: inferred.videoStyle || videoStyle,
      vocalStyle: inferred.vocalStyle || vocalStyle,
      vocalGender: nextVocalGender,
      structureType: inferred.structureType || structureType,
      energyLevel: inferred.energyLevel ?? energyLevel,
      vocalIntensity: inferred.vocalIntensity ?? vocalIntensity,
      instruments: inferredInstruments.length > 0 ? inferredInstruments : instruments,
      vocalArrangement: inferred.vocalArrangement || vocalArrangement,
      vocalEffects: inferred.vocalEffects?.length ? inferred.vocalEffects : selectedVocalEffects,
      vocalsEnabled: inferred.instrumental ? false : true,
      visualizerEnabled: true,
    };
    // `title` lives outside SongPromptState — set it directly. Build the
    // prompt update object explicitly to avoid unused-variable lint rules
    // tripping a silent build failure on the dev server.
    setTitle(after.title);

    // ── Sync multi-select UI arrays from inference results ──────────
    // Genre SmartSearchInput uses selectedGenres (GenreOption[])
    if (inferred.allGenres?.length) {
      setSelectedGenres(normalizeGenreOptions(inferred.allGenres));
    } else {
      setSelectedGenres(normalizeGenreOptions([after.genre]));
    }
    // Subgenre SmartSearchInput uses selectedSubgenres (string[])
    if (inferred.allSubgenres?.length) {
      setSelectedSubgenres(inferred.allSubgenres);
    } else if (after.subgenre) {
      setSelectedSubgenres(after.subgenre.split(',').map(s => s.trim()).filter(Boolean));
    }

    const promptUpdates: Partial<SongPromptState> = {
      genre: after.genre,
      subgenre: after.subgenre,
      mood: after.mood,
      tempo: after.tempo,
      duration: after.duration,
      vocalLanguage: after.vocalLanguage,
      artistInspiration: after.artistInspiration,
      lyricsTheme: after.lyricsTheme,
      lyricsText: after.lyricsText,
      videoStyle: after.videoStyle,
      vocalStyle: after.vocalStyle,
      vocalGender: after.vocalGender,
      structureType: after.structureType,
      energyLevel: after.energyLevel,
      vocalIntensity: after.vocalIntensity,
      instruments: after.instruments,
      vocalArrangement: after.vocalArrangement,
      vocalEffects: after.vocalEffects,
      vocalsEnabled: after.vocalsEnabled,
      visualizerEnabled: after.visualizerEnabled,
    };
    updateSongPrompt(prev => ({
      ...prev,
      songDescription: prev.songDescription || trimmed,
      ...promptUpdates,
    }));
    // Sync HMS fields to the new duration (kept outside SongPromptState).
    setHours(Math.floor(after.duration / 3600));
    setMinutes(Math.floor((after.duration % 3600) / 60));
    setSeconds(after.duration % 60);
    const summary = summarizeFillChanges(before, {
      ...after,
      energyLevel: String(after.energyLevel),
      vocalIntensity: String(after.vocalIntensity),
      instruments: after.instruments.join(', '),
      vocalEffects: after.vocalEffects.join(', '),
      duration: String(after.duration),
    });
    console.log('[fillSongFromPrompt] applied:', after);
    toast.dismiss(fillToastId);
    toast.success(
      summary ? `Filled all fields — ${summary}` : 'Already aligned with this prompt.',
      { duration: 4500 },
    );
   } catch (err) {
     console.error('[fillSongFromPrompt] failed:', err);
     toast.dismiss(fillToastId);
     toast.error('Could not fill fields — see console for details.');
   } finally {
     setIsFillingFromPrompt(false);
   }
  };

  /**
   * Auto-fill every track in album mode from the album-level vibe/theme.
   * Each track gets its own nonce-salted inference so tempos and accents
   * vary across the album instead of every track being identical.
   */
  const fillAllTracksFromAlbumVibe = async () => {
    const trimmed = (albumVibe || '').trim();
    if (!trimmed) {
      toast.error('Add an Album Vibe first.');
      return;
    }
    if (isFillingAlbum) return;
    setIsFillingAlbum(true);
    const fillToastId = toast.loading(`Filling ${albumTracks.length} tracks from album vibe…`);
    await new Promise<void>(r => setTimeout(r, 30));

    // Aggregate counts across tracks so we can summarize the album-wide
    // fill in a single toast rather than spamming one per track.
    const genreCounts = new Map<string, number>();
    const moodCounts = new Map<string, number>();
    const tempos: number[] = [];
    const languageCounts = new Map<string, number>();

    setAlbumTracks(prev => prev.map((t, i) => {
      const inferred = inferContextFromDescription(
        trimmed,
        nextGenerationNonce(`album-${i}`),
      );
      const inferredInstruments = parseInstrumentation(inferred.instrumentation);
      const next: TrackConfig = {
        ...t,
        songDescription: t.songDescription || trimmed,
        genre: inferred.genre || t.genre,
        subgenre: inferred.subgenre || t.subgenre,
        mood: inferred.mood || t.mood,
        tempo: inferred.tempo
          ? Math.max(60, Math.min(200, inferred.tempo))
          : t.tempo,
        vocalLanguage: inferred.vocalLanguage || t.vocalLanguage,
        artistInspiration: inferred.artistInspiration || t.artistInspiration,
        lyricsTheme: inferred.lyricTheme || t.lyricsTheme,
        videoStyle: inferred.videoStyle || t.videoStyle,
        vocalStyle: inferred.vocalStyle || t.vocalStyle,
        structureType: inferred.structureType || t.structureType,
        energyLevel: inferred.energyLevel ?? t.energyLevel,
        vocalIntensity: inferred.vocalIntensity ?? t.vocalIntensity,
        instruments: inferredInstruments.length > 0 ? inferredInstruments : t.instruments,
        vocalEffects: inferred.vocalEffects?.length ? inferred.vocalEffects : t.vocalEffects,
        vocalsEnabled: inferred.instrumental ? false : t.vocalsEnabled,
      };
      genreCounts.set(next.genre, (genreCounts.get(next.genre) ?? 0) + 1);
      moodCounts.set(next.mood, (moodCounts.get(next.mood) ?? 0) + 1);
      tempos.push(next.tempo);
      languageCounts.set(next.vocalLanguage, (languageCounts.get(next.vocalLanguage) ?? 0) + 1);
      return next;
    }));

    const topOf = (m: Map<string, number>): string =>
      [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const tempoMin = tempos.length ? Math.min(...tempos) : 0;
    const tempoMax = tempos.length ? Math.max(...tempos) : 0;
    const tempoLabel =
      tempoMin === tempoMax ? `${tempoMin} BPM` : `${tempoMin}–${tempoMax} BPM`;

    const summary = [
      `Genre → ${topOf(genreCounts)}`,
      `Mood → ${topOf(moodCounts)}`,
      `Tempo → ${tempoLabel}`,
      `Language → ${topOf(languageCounts)}`,
    ].filter(Boolean).join(' · ');

    toast.dismiss(fillToastId);
    toast.success(`Filled all ${albumTracks.length} tracks — ${summary}`, { duration: 5000 });
    setIsFillingAlbum(false);
  };

  const applyStructuredPromptSuggestion = (result: AiSuggestionResult) => {
    const structured = result.structured;
    if (!structured) return false;

    // The structured AI payload covers genre/mood/tempo/artist/lyrics/etc.
    // For the fields it doesn't supply (instruments, structure, video style,
    // vocal style/effects/intensity, energy default), run the same local
    // inference engine the "Fill all fields" button uses so a single
    // Suggest action populates the entire form, not just the headline.
    const seedDesc =
      structured.description || structured.prompt || result.suggestion || songDescription;
    const inferred = inferContextFromDescription(seedDesc, nextGenerationNonce('suggest'));
    const inferredInstruments = parseInstrumentation(inferred.instrumentation);

    // Sync multi-select genre/subgenre arrays before SongPromptState update
    const nextGenres = (structured.genre && structured.genre.length > 0)
      ? structured.genre
      : (inferred.allGenres?.length ? inferred.allGenres : undefined);
    if (nextGenres) {
      setSelectedGenres(normalizeGenreOptions(nextGenres));
    }
    const nextSubgenres = Array.isArray(structured.subgenre)
      ? structured.subgenre
      : (inferred.allSubgenres?.length ? inferred.allSubgenres : undefined);
    if (nextSubgenres) {
      setSelectedSubgenres(nextSubgenres);
    }

    updateSongPrompt(prev => {
      const next: SongPromptState = {
        ...prev,
        genre: (structured.genre && structured.genre.length > 0) ? structured.genre[0] : (inferred.genre || prev.genre),
        mood: structured.mood || inferred.mood || prev.mood,
        tempo: structured.tempo
          ? Math.max(60, Math.min(200, parseInt(structured.tempo) || prev.tempo))
          : (inferred.tempo ? Math.max(60, Math.min(200, inferred.tempo)) : prev.tempo),
        artistInspiration: structured.artist_inspiration || inferred.artistInspiration || prev.artistInspiration,
        lyricsText: structured.lyrics || prev.lyricsText,
        songDescription: structured.description || structured.prompt || result.suggestion || prev.songDescription,
        subgenre: Array.isArray(structured.subgenre)
          ? structured.subgenre.join(', ')
          : (structured.subgenre || inferred.subgenre || prev.subgenre),
        lyricsTheme: structured.lyricTheme || inferred.lyricTheme || prev.lyricsTheme,
        energyLevel: structured.energy
          ? Math.max(1, Math.min(10, parseInt(structured.energy) || prev.energyLevel))
          : (inferred.energyLevel ?? prev.energyLevel),
        // Derived-only fields — supplied entirely by local inference.
        vocalLanguage: inferred.vocalLanguage || prev.vocalLanguage,
        videoStyle: inferred.videoStyle || prev.videoStyle,
        vocalStyle: inferred.vocalStyle || prev.vocalStyle,
        structureType: inferred.structureType || prev.structureType,
        vocalIntensity: inferred.vocalIntensity ?? prev.vocalIntensity,
        instruments: inferredInstruments.length > 0 ? inferredInstruments : prev.instruments,
        vocalEffects: inferred.vocalEffects?.length ? inferred.vocalEffects : prev.vocalEffects,
        vocalsEnabled: inferred.instrumental ? false : prev.vocalsEnabled,
      };
      return next;
    });
    return true;
  };

  const applyToField = (field: string, value: string) => {
    const parseCsv = (raw: string): string[] =>
      raw.split(',').map((token) => token.trim()).filter(Boolean);

    switch (field) {
      case 'trackName': setTitle(value); break;
      case 'albumName': setAlbumName(value); break;
      case 'albumVibe': setAlbumVibe(value); break;
      case 'prompt': updateSongPrompt({ songDescription: value }); break;
      case 'genre': {
        const parsed = parseCsv(value);
        const normalized = normalizeGenreOptions(parsed.length > 0 ? parsed : [value]);
        setSelectedGenres(normalized);
        updateSongPrompt({ genre: normalized[0]?.label || value });
        break;
      }
      case 'subgenre': {
        const parsed = parseCsv(value);
        setSelectedSubgenres(parsed);
        updateSongPrompt({ subgenre: parsed.join(', ') });
        break;
      }
      case 'lyrics': updateSongPrompt({ lyricsText: value }); break;
      case 'artistInspiration': updateSongPrompt({ artistInspiration: value }); break;
      case 'vocalLanguage': {
        const parsed = parseCsv(value);
        updateSongPrompt({ vocalLanguage: parsed.join(', ') || value });
        break;
      }
      case 'videoStyle': updateSongPrompt({ videoStyle: value }); break;
      case 'tempo': updateSongPrompt({ tempo: Math.max(60, Math.min(200, parseInt(value) || 120)) }); break;
      case 'mood': updateSongPrompt({ mood: value }); break;
      case 'structureType': updateSongPrompt({ structureType: value }); break;
      case 'vocalArrangement': updateSongPrompt({ vocalArrangement: value }); break;
      case 'vocalStyle': updateSongPrompt({ vocalStyle: value }); break;
      case 'vocalIntensity': updateSongPrompt({ vocalIntensity: Math.max(1, Math.min(10, parseInt(value) || 5)) }); break;
      case 'vocalEffects': {
        const newEffects = value.split(',').map(e => e.trim()).filter(Boolean);
        updateSongPrompt(prev => ({
          ...prev,
          vocalEffects: Array.from(new Set([...prev.vocalEffects, ...newEffects])),
        }));
        break;
      }
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
      case 'energyLevel': updateSongPrompt({ energyLevel: Math.max(1, Math.min(10, parseInt(value) || 5)) }); break;
      case 'instruments': {
        const newInst = value.split(',').map(e => e.trim()).filter(Boolean);
        updateSongPrompt({ instruments: newInst });
        break;
      }
      case 'lyricsTheme': updateSongPrompt({ lyricsTheme: value }); break;
    }
  };

  const getFieldValue = (field: string): string => {
    switch (field) {
      case 'trackName': return title;
      case 'albumName': return albumName;
      case 'albumVibe': return albumVibe;
      case 'prompt': return songDescription;
      case 'genre': return genre;
      case 'subgenre': return subgenre;
      case 'lyrics': return lyricsText;
      case 'artistInspiration': return artistInspiration;
      case 'vocalLanguage': return vocalLanguage;
      case 'videoStyle': return videoStyle;
      case 'tempo': return String(tempo);
      case 'mood': return mood;
      case 'structureType': return structureType;
      case 'vocalArrangement': return vocalArrangement;
      case 'vocalStyle': return vocalStyle;
      case 'vocalIntensity': return String(vocalIntensity);
      case 'vocalEffects': return selectedVocalEffects.join(', ');
      case 'lyricsTheme': return lyricsTheme;
      case 'energyLevel': return String(energyLevel);
      case 'instruments': return instruments.join(', ');
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
      case 'subgenre': {
        setSelectedSubgenres([]);
        updateSongPrompt({ subgenre: '' });
        break;
      }
      case 'lyrics': updateSongPrompt({ lyricsText: '' }); break;
      case 'artistInspiration': updateSongPrompt({ artistInspiration: '' }); break;
      case 'vocalLanguage': updateSongPrompt({ vocalLanguage: 'English' }); break;
      case 'videoStyle': updateSongPrompt({ videoStyle: 'Cinematic' }); break;
      case 'tempo': updateSongPrompt({ tempo: 120 }); break;
      case 'mood': updateSongPrompt({ mood: 'Energetic' }); break;
      case 'structureType': updateSongPrompt({ structureType: 'Verse-Chorus-Bridge' }); break;
      case 'vocalArrangement': updateSongPrompt({ vocalArrangement: 'solo' }); break;
      case 'vocalStyle': updateSongPrompt({ vocalStyle: '' }); break;
      case 'vocalIntensity': updateSongPrompt({ vocalIntensity: 5 }); break;
      case 'vocalEffects': updateSongPrompt({ vocalEffects: [] }); break;
      case 'lyricsTheme': updateSongPrompt({ lyricsTheme: '' }); break;
      case 'energyLevel': updateSongPrompt({ energyLevel: 5 }); break;
      case 'instruments': updateSongPrompt({ instruments: [] }); break;
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

  /**
   * Per-field recommendation engine. Returns an optimal value for a given
   * field based on the current genre + mood, or null if the field is already
   * at the recommended value. Used to show inline "Recommended: X" badges
   * so the user sees smart suggestions without having to click auto-fill.
   */
  const getRecommendation = useCallback((field: string): { label: string; value: string | number | string[] } | null => {
    const inferred = inferContextFromDescription(
      songDescription || `${genre} ${mood}`,
      'rec-' + genre + '-' + mood,
    );
    switch (field) {
      case 'tempo': {
        const rec = inferred.tempo ? Math.max(60, Math.min(200, inferred.tempo)) : null;
        if (!rec || Math.abs(rec - tempo) < 5) return null;
        return { label: `${rec} BPM`, value: rec };
      }
      case 'duration': {
        const rec = inferDurationFromGenre(genre);
        if (Math.abs(rec - duration) < 10) return null;
        return { label: formatDuration(rec), value: rec };
      }
      case 'energyLevel': {
        const rec = inferred.energyLevel ?? 7;
        if (rec === energyLevel) return null;
        return { label: `${rec}/10`, value: rec };
      }
      case 'instruments': {
        const rec = parseInstrumentation(inferred.instrumentation);
        if (rec.length === 0 || JSON.stringify(rec.sort()) === JSON.stringify([...instruments].sort())) return null;
        return { label: rec.slice(0, 3).join(', ') + (rec.length > 3 ? '…' : ''), value: rec };
      }
      case 'vocalStyle': {
        const rec = inferred.vocalStyle;
        if (!rec || rec === vocalStyle) return null;
        return { label: rec, value: rec };
      }
      case 'structureType': {
        const rec = inferred.structureType;
        if (!rec || rec === structureType) return null;
        return { label: rec, value: rec };
      }
      case 'videoStyle': {
        const rec = inferred.videoStyle;
        if (!rec || rec === videoStyle) return null;
        return { label: rec, value: rec };
      }
      default:
        return null;
    }
  }, [songDescription, genre, mood, tempo, duration, energyLevel, instruments, vocalStyle, structureType, videoStyle]);

  /** Inline recommendation chip shown next to fields. Clicking applies the value. */
  const RecommendationBadge: React.FC<{ field: string }> = ({ field }) => {
    const rec = getRecommendation(field);
    if (!rec) return null;
    const handleApply = () => {
      if (field === 'instruments' && Array.isArray(rec.value)) {
        updateSongPrompt({ instruments: rec.value as string[] });
      } else if (field === 'tempo') {
        updateSongPrompt({ tempo: rec.value as number });
      } else if (field === 'duration') {
        updateSongPrompt({ duration: rec.value as number });
      } else if (field === 'energyLevel') {
        updateSongPrompt({ energyLevel: rec.value as number });
      } else {
        applyToField(field, String(rec.value));
      }
      toast.success(`Applied: ${rec.label}`);
    };
    return (
      <button
        onClick={handleApply}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-[11px] font-semibold text-primary/80 hover:bg-primary/20 hover:text-primary transition-all cursor-pointer"
        title={`Click to apply recommended value`}
      >
        <Sparkles className="w-3 h-3" />
        Rec: {rec.label}
      </button>
    );
  };

  const contextRef = useRef(getFormContext());
  // getFormContext is a fresh closure on every render; listing it would cause
  // an infinite loop. The state deps below cover everything it reads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { contextRef.current = getFormContext(); }, [
    title, songDescription, genre, subgenre, duration, vocalLanguage,
    lyricsText, artistInspiration, videoStyle, tempo, mood, vocalsEnabled,
    vocalStyle, vocalIntensity, selectedVocalEffects, structureType,
    vocalArrangement, lyricsTheme
  ]);

  useEffect(() => {
    // Check if the current creation has a track with video status
    if (currentCreation?.tracks?.[0]) {
      const track = currentCreation.tracks[0];
      if (track.videoUrl) {
         setVideoUrl(track.videoUrl);
         setVideoStatus("succeeded");
      } else if (track.status === 'audio_complete_video_failed' || track.status === 'failed') {
         setVideoStatus("failed");
         setVideoError(track.errorMessage || "Video generation failed");
      } else if (visualizerEnabled && track.status !== 'pending' && track.status !== 'idle') {
         setVideoStatus("generating");
      }
    }
  }, [currentCreation?.tracks, visualizerEnabled]);

  const handleGenerate = async () => {
    if (!isAuthenticated) { onAuthClick(); return; }

    const ctx = contextRef.current;

    // Duplicate prompt detection
    if (mode === 'song' && creations && Array.isArray(creations)) {
      const isDuplicate = creations.some(c => c.type === 'song' && c.songDescription === ctx.songDescription);
      if (isDuplicate) {
         const keepName = window.confirm("You are regenerating a song with the same prompt. Do you want to keep the same song name? \n\nClick 'OK' to keep the same name.\nClick 'Cancel' to enter a new name.");
         if (!keepName) {
            const newName = window.prompt("Enter new song name:", ctx.title || "Untitled Track");
            if (newName === null) return; // User cancelled
            ctx.title = newName;
            setTitle(newName);
         }
      }
    }

    console.log("[Generate] Context being sent:", JSON.stringify(ctx, null, 2));

    // Reset video state
    setVideoStatus("idle");
    setVideoUrl(null);
    setVideoError(null);

    // Clear any prior emergency-fallback result so the new attempt starts
    // clean. The fallback only re-fires if the new AI attempt also fails.
    emergencyLocalSynth.reset();
    setFallbackBriefSnapshot(null);
    setFallbackReason(null);
    lastFailedCreationIdRef.current = null;

    // Take a snapshot of the brief for the emergency fallback. If
    // currentCreation later transitions to 'failed', this snapshot is what
    // the local synth uses to render a backup track.
    const fallbackSeed = nextGenerationNonce('fallback');
    if (mode === 'song') {
      setFallbackBriefSnapshot({
        mood: ctx.mood ?? 'Energetic',
        genre: selectedGenres.length > 0 ? selectedGenres[0].label : (ctx.genre ?? 'Pop'),
        language: ctx.vocalLanguage,
        occasion: ctx.songDescription,
        references: ctx.artistInspiration ? [ctx.artistInspiration] : undefined,
        durationSeconds: ctx.duration ?? 180,
        seed: fallbackSeed,
      });
    }

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
      // Song mode — primary AI path. Wrap in try/catch so synchronous
      // failures (auth error, key missing, network down before kickoff)
      // also trigger the local-synth emergency fallback. Async polling
      // failures are caught separately by the failure-watcher useEffect.
      try {
        const result = await createMusic({
          type: 'song',
          songTitle: ctx.title || 'Untitled Track',
          title: ctx.title || 'Untitled Track',
          songDescription: ctx.songDescription,
          genre: selectedGenres.length > 0 ? selectedGenres.map((item) => item.label).join(', ') : (ctx.genre || 'Pop'),
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
          vocalArrangement: ctx.vocalArrangement || undefined,
          vocalIntensity: ctx.vocalIntensity,
          vocalEffects: ctx.vocalEffects,
          structureType: ctx.structureType || undefined,
          lyricsTheme: ctx.lyricsTheme || undefined,
          energyLevel: ctx.energyLevel,
          instruments: ctx.instruments,
          useAiAudio,
        });
        // createMusic returns null on synchronous failure paths (rate
        // limit, missing keys, server 5xx). Trigger fallback directly.
        if (!result) {
          await runEmergencyFallback('AI backend declined the request');
        }
      } catch (err: any) {
        await runEmergencyFallback(err?.message ?? 'AI backend threw an exception');
      }
    }
  };

  /**
   * Run the emergency local-synth fallback with the snapshot brief taken
   * inside handleGenerate. Used by both the kickoff try/catch and (via
   * the failure-watcher useEffect) the async polling-failure path.
   */
  const runEmergencyFallback = async (reason: string) => {
    if (!fallbackBriefSnapshot) {
      // Reconstruct from current form state if snapshot wasn't taken
      const ctx = contextRef.current;
      const brief = {
        mood: ctx.mood ?? 'Energetic',
        genre: selectedGenres.length > 0 ? selectedGenres[0].label : (ctx.genre ?? 'Pop'),
        language: ctx.vocalLanguage,
        occasion: ctx.songDescription,
        references: ctx.artistInspiration ? [ctx.artistInspiration] : undefined,
        durationSeconds: ctx.duration ?? 180,
        seed: nextGenerationNonce('fallback'),
      };
      setFallbackBriefSnapshot(brief);
      setFallbackReason(reason);
      toast.error(`AI generation failed — running local synth fallback. (${reason})`);
      try {
        await emergencyLocalSynth.generate({ ...brief, instrumentalOnly: false, vocoderVoice: true });
      } catch (err: any) {
        toast.error(`Local-synth fallback also failed: ${err?.message ?? err}`);
      }
      return;
    }
    setFallbackReason(reason);
    toast.error(`AI generation failed — running local synth fallback. (${reason})`);
    try {
      await emergencyLocalSynth.generate({
        ...fallbackBriefSnapshot,
        instrumentalOnly: false,
        vocoderVoice: true,
      });
    } catch (err: any) {
      toast.error(`Local-synth fallback also failed: ${err?.message ?? err}`);
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

  const handleCancelTrack = async (trackId: string) => {
    if (!currentCreation) return;
    try {
      const response = await fetch('/api/generate/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId, creationId: currentCreation.id })
      });
      if (response.ok) {
        toast.success('Generation cancelled');
      }
    } catch (err) {
      console.error('Cancel failed:', err);
    }
  };

  const handleDownload = async (audioUrl?: string, trackTitle?: string) => {
    if (!audioUrl) return;
    const safeName = (trackTitle || 'track').replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'track';

    try {
      toast.loading('Preparing download...', { id: 'download-audio' });

      // data: and blob: URLs can be downloaded directly in-browser
      if (audioUrl.startsWith("data:") || audioUrl.startsWith("blob:")) {
        const response = await fetch(audioUrl);
        const blob = await response.blob();
        const ext = blob.type.includes('wav') ? 'wav' : blob.type.includes('ogg') ? 'ogg' : 'mp3';
        const objectUrl = URL.createObjectURL(blob);
        triggerDownload(objectUrl, `musevibe-${safeName}.${ext}`);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
        toast.success('Download started', { id: 'download-audio' });
        return;
      }

      // HTTPS URLs: try direct fetch first (works for same-origin and CORS-enabled),
      // fall back to the download proxy for cross-origin Supabase/CDN URLs
      const filename = `musevibe-${safeName}.wav`;
      let blob: Blob;
      try {
        const directResponse = await fetch(audioUrl);
        if (!directResponse.ok) throw new Error(`${directResponse.status}`);
        blob = await directResponse.blob();
      } catch {
        const proxyResponse = await fetch(`/api/download?url=${encodeURIComponent(audioUrl)}&filename=${encodeURIComponent(filename)}`);
        if (!proxyResponse.ok) throw new Error(`Download proxy failed: ${proxyResponse.status}`);
        blob = await proxyResponse.blob();
      }
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, filename);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
      toast.success('Download started', { id: 'download-audio' });
    } catch (err) {
      console.error("Download failed:", err);
      toast.error('Download failed — try right-clicking the player and "Save As"', { id: 'download-audio' });
    }
  };

  const handleDownloadVideo = async (videoUrl?: string, trackTitle?: string) => {
    if (!videoUrl) return;
    const safeName = (trackTitle || 'track').replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'track';

    try {
      toast.loading('Preparing video download...', { id: 'download-video' });

      // blob: URLs are already local — fetch directly
      if (videoUrl.startsWith('blob:')) {
        const response = await fetch(videoUrl);
        const blob = await response.blob();
        const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
        const objectUrl = URL.createObjectURL(blob);
        triggerDownload(objectUrl, `musevibe-${safeName}-video.${ext}`);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
        toast.success('Video download started', { id: 'download-video' });
        return;
      }

      // HTTPS URLs: try direct, fall back to proxy
      const ext = videoUrl.includes('.webm') ? 'webm' : 'mp4';
      const filename = `musevibe-${safeName}-video.${ext}`;
      let blob: Blob;
      try {
        const directResponse = await fetch(videoUrl);
        if (!directResponse.ok) throw new Error(`${directResponse.status}`);
        blob = await directResponse.blob();
      } catch {
        const proxyResponse = await fetch(`/api/download?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(filename)}`);
        if (!proxyResponse.ok) throw new Error(`Video proxy failed: ${proxyResponse.status}`);
        blob = await proxyResponse.blob();
      }
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, filename);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
      toast.success('Video download started', { id: 'download-video' });
    } catch (err) {
      console.error('Video download failed:', err);
      toast.error('Video download failed', { id: 'download-video' });
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

  // AiToolbar lives in src/components/AiToolbar.tsx — single source of truth
  // for icons, tooltips, colors, and accessibility. The local wrapper below
  // keeps the existing <AiToolbar field="X" /> call-site syntax intact while
  // delegating rendering and behavior to the shared component.
  const AiToolbar: React.FC<{ field: string }> = ({ field }) => {
    // Album-level fields and any field used while in "album" creation mode
    // get the album-flavored CTA headings; everything else stays song-mode.
    const albumOnlyFields = new Set(['albumName', 'albumVibe']);
    const toolbarMode: 'song' | 'album' =
      albumOnlyFields.has(field) || mode === 'album' ? 'album' : 'song';
    return (
      <SharedAiToolbar
        field={field}
        onSuggest={handleAiSuggest}
        onEnhance={handleEnhance}
        onRetry={handleNewSuggestion}
        onClear={handleClear}
        isSuggesting={!!suggestionState.loading[`${field}-suggest`]}
        isEnhancing={!!suggestionState.loading[`${field}-enhance`]}
        isRetrying={!!suggestionState.loading[`${field}-new`]}
        variant="labeled"
        mode={toolbarMode}
      />
    );
  };

  // Pipeline Progress
  const PIPELINE_STEPS = [
    // Narrowed from /analyz/i so it doesn't shadow the later "Analyzing beats"
    // step in the video pipeline (that regex matched first via findIndex, which
    // pinned the UI to step 1 while the video phase was actually running).
    { key: 'analyzing', label: 'Analyzing prompt', icon: '🔍', match: /analyz(?:e|ing).*(?:prompt|composition)/i },
    { key: 'seeding', label: 'Creating GenerationDNA', icon: '🧬', match: /generationdna|seed|dna|prepar/i },
    { key: 'inferring', label: 'Inferring musical style', icon: '🎯', match: /infer|style/i },
    { key: 'planning', label: 'Planning arrangement', icon: '🎼', match: /plan|arrang/i },
    { key: 'composing', label: 'Generating melody', icon: '🎹', match: /melody|motif|hook/i },
    { key: 'ai_audio', label: 'AI music generation', icon: '🤖', match: /\bai\b.*(audio|music|model|segment|instrumental)|loading ai|downloading.*model|musicgen/i },
    { key: 'instrumental', label: 'Synthesizing instruments', icon: '🎵', match: /synthesi[sz].*instrument|instrument layer|segment(?!.*\bai)/i },
    { key: 'vocals', label: 'Generating vocals', icon: '🎤', match: /vocal|lyric|singing|synthe/i },
    { key: 'vocal_align', label: 'Aligning & mixing vocals', icon: '🎙️', match: /align.*vocal|mix.*vocal/i },
    { key: 'mixing', label: 'Mixing audio', icon: '🎚️', match: /mix(?!.*vocal)/i },
    { key: 'mastering', label: 'Mastering track', icon: '💿', match: /master/i },
    { key: 'beat_analysis', label: 'Analyzing beats', icon: '📊', match: /analyzing beats|beat structure/i },
    { key: 'video_gen', label: 'Rendering visuals', icon: '🎬', match: /render.*visual|render.*video|generat.*video/i },
    { key: 'video_enc', label: 'Encoding video', icon: '📹', match: /encod.*video|optimizing mp4|transcod/i },
    { key: 'finalizing', label: 'Finalizing & uploading', icon: '💾', match: /finaliz|upload/i },
    { key: 'complete', label: 'Complete', icon: '✅', match: /complete/i },
  ];

  const PipelineProgress: React.FC<{ currentStage: string; progress: number; estimatedTimeLeft: number; hasVideo?: boolean }> = ({ currentStage, progress, estimatedTimeLeft, hasVideo = false }) => {
    // Hide video-only steps when the track is audio-only so "Step N of M"
    // reflects what's actually going to run.
    const videoStepKeys = new Set(['beat_analysis', 'video_gen', 'video_enc']);
    const visibleSteps = hasVideo ? PIPELINE_STEPS : PIPELINE_STEPS.filter(s => !videoStepKeys.has(s.key));
    const currentStepIdx = visibleSteps.findIndex(s => s.match.test(currentStage));
    const activeIdx = currentStepIdx >= 0 ? currentStepIdx : 0;

    const formatEta = (secs: number) => {
      if (secs <= 0) return '';
      if (secs >= 60) return `~${Math.floor(secs / 60)}m ${secs % 60}s`;
      return `~${secs}s`;
    };

    // Heavy/long-blocking stages — surface a prominent banner so users
    // understand WHY the bar is moving slowly (model download, transcoding).
    const isAiLoading = /loading ai|downloading.*model/i.test(currentStage);
    const isTranscoding = /optimizing mp4|transcod/i.test(currentStage);

    return (
      <div className="mt-4 space-y-3">
        {(isAiLoading || isTranscoding) && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 p-3 rounded-xl bg-primary/10 border border-primary/30"
          >
            <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary">
                {isAiLoading ? 'Loading AI music model' : 'Optimizing video for playback'}
              </p>
              <p className="text-xs text-white/60 mt-0.5">
                {isAiLoading
                  ? 'First run downloads ~250 MB and caches it forever. Subsequent generations skip this step.'
                  : 'Re-encoding to universal MP4 so the video plays everywhere. This is the final video step.'}
              </p>
            </div>
          </motion.div>
        )}
        <div className="space-y-1.5">
          {visibleSteps.map((step, idx) => {
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
            <span className="font-medium">Step {activeIdx + 1} of {visibleSteps.length}</span>
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
                  {/* Album Vibe FIRST so the user can drive the rest of the
                      album (including the album name) from a single prompt. */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-1">
                    <div>
                      <Label className="text-foreground font-medium">Album Vibe (optional)</Label>
                      <p className="text-xs text-muted-foreground mt-1">Global inspiration that can be applied to individual tracks</p>
                    </div>
                    <AiToolbar field="albumVibe" />
                  </div>
                  <Textarea placeholder="e.g., Dark atmospheric journey through urban nightscapes..." value={albumVibe} onChange={e => setAlbumVibe(e.target.value)} className="bg-input border-border min-h-20 resize-none" />
                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      One-click fill every track from this vibe — each track gets its own variation so the album isn't repetitive.
                    </p>
                    <Button
                      type="button"
                      onClick={fillAllTracksFromAlbumVibe}
                      disabled={!albumVibe.trim() || isFillingAlbum}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      {isFillingAlbum
                        ? (<><Loader2 className="w-4 h-4 animate-spin" /> Filling tracks…</>)
                        : (<><Wand2 className="w-4 h-4" /> Fill all tracks from album vibe</>)}
                    </Button>
                  </div>
                </div>
                {/* Album Name — placed AFTER vibe so it can be auto-suggested
                    from the album theme using "Suggest". */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-2">
                    <Label className="text-foreground font-medium">Album Name</Label>
                    <AiToolbar field="albumName" />
                  </div>
                  <Input placeholder="Enter album name..." value={albumName} onChange={e => setAlbumName(e.target.value)} className="bg-input border-border" />
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
              {/* Music Prompt — comes first so the user can fill all fields
                  (including track name) from a single description. */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card rounded-xl p-4 sm:p-6">
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
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    One-click fill: infer genre, mood, tempo, language, artist, lyric theme, and video style from this prompt.
                  </p>
                  <Button
                    type="button"
                    onClick={() => fillSongFromPrompt(songDescription)}
                    disabled={!songDescription.trim() || isFillingFromPrompt}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {isFillingFromPrompt
                      ? (<><Loader2 className="w-4 h-4 animate-spin" /> Filling fields…</>)
                      : (<><Wand2 className="w-4 h-4" /> Fill all fields from this</>)}
                  </Button>
                </div>
              </motion.div>

              {/* Track Name — placed AFTER the prompt so it can be auto-filled
                  from the prompt context using "Suggest". */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card rounded-xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
                  <Label className="text-foreground font-medium">Track Name</Label>
                  <AiToolbar field="trackName" />
                </div>
                <Input placeholder="Enter track name (optional)" value={title} onChange={e => setTitle(e.target.value)} className="bg-input border-border" />
              </motion.div>

              {/* Genres */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card rounded-xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
                  <Label className="text-foreground font-medium">Genres</Label>
                  <AiToolbar field="genre" />
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

              {/* Tempo & Duration Cluster */}
              <div className="grid sm:grid-cols-2 gap-4">
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.22 }} className="glass-card rounded-[32px] p-8 border-white/5 hover:border-primary/20 transition-all group">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <Activity className="w-5 h-5 text-primary" />
                      </div>
                      <Label className="text-white font-bold text-lg tracking-tight">Tempo</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RecommendationBadge field="tempo" />
                      <AiToolbar field="tempo" />
                    </div>
                  </div>
                  <div className="mb-6 flex items-baseline gap-2">
                    <span className="text-4xl font-black text-white tracking-tighter">{tempo}</span>
                    <span className="text-xs font-black text-primary/60 tracking-widest uppercase mb-1">BPM</span>
                  </div>
                  <Slider value={[tempo]} onValueChange={v => updateSongPrompt({ tempo: v[0] })} min={60} max={200} step={1} />
                  <div className="flex justify-between text-[10px] uppercase font-black text-white/20 tracking-widest mt-4">
                    <span>Largo</span><span>Presto</span>
                  </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.23 }} className="glass-card rounded-[32px] p-8 border-white/5 hover:border-primary/20 transition-all group">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <Clock className="w-5 h-5 text-primary" />
                      </div>
                      <Label className="text-white font-bold text-lg tracking-tight">Length</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RecommendationBadge field="duration" />
                      <AiToolbar field="duration" />
                    </div>
                  </div>
                  <div className="mb-6 flex items-baseline gap-2">
                    <span className="text-4xl font-black text-white tracking-tighter">{formatDuration(duration)}</span>
                    <span className="text-xs font-black text-primary/60 tracking-widest uppercase mb-1">M:S</span>
                  </div>
                  <Slider value={[duration]} onValueChange={v => updateSongPrompt({ duration: v[0] })} min={30} max={600} step={1} />
                  <div className="flex justify-between text-[10px] uppercase font-black text-white/20 tracking-widest mt-4">
                    <span>Short</span><span>Epic</span>
                  </div>
                </motion.div>
              </div>

              {/* Energy & Instruments Cluster */}
              <div className="grid sm:grid-cols-2 gap-4">
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.24 }} className="glass-card rounded-[32px] p-8 border-white/5 hover:border-accent/20 transition-all group">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                        <Zap className="w-5 h-5 text-accent" />
                      </div>
                      <Label className="text-white font-bold text-lg tracking-tight">Energy</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RecommendationBadge field="energyLevel" />
                      <AiToolbar field="energyLevel" />
                    </div>
                  </div>
                  <div className="mb-6 flex items-baseline gap-2">
                    <span className="text-4xl font-black text-white tracking-tighter">{energyLevel}</span>
                    <span className="text-xs font-black text-accent/60 tracking-widest uppercase mb-1">Intensity</span>
                  </div>
                  <Slider value={[energyLevel]} onValueChange={v => updateSongPrompt({ energyLevel: v[0] })} min={1} max={10} step={1} />
                  <div className="flex justify-between text-[10px] uppercase font-black text-white/20 tracking-widest mt-4">
                    <span>Ambient</span><span>Aggressive</span>
                  </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 }} className="glass-card rounded-[32px] p-8 border-white/5 hover:border-accent/20 transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center">
                        <Music className="w-5 h-5 text-accent" />
                      </div>
                      <Label className="text-white font-bold text-lg tracking-tight">Orchestra</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RecommendationBadge field="instruments" />
                      <AiToolbar field="instruments" />
                    </div>
                  </div>
                  <SmartSearchInput
                    value={instruments}
                    onChange={(val: string[]) => updateSongPrompt({ instruments: val })}
                    options={['Grand Piano', 'Acoustic Guitar', 'Hardware Synth', '808 Drums', 'Violin Section', 'Electric Bass']}
                    placeholder="Specific instruments..."
                    multiSelect
                  />
                </motion.div>
              </div>

              {/* Performance Section */}
              <div className="flex items-center gap-3 mb-4 mt-12">
                <div className="h-0.5 flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <span className="text-[10px] uppercase font-black tracking-[0.4em] text-white/30">Performance & Tone</span>
                <div className="h-0.5 flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>

              {/* Mood */}
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.31 }} className="glass-card rounded-[32px] p-8 border-white/5 hover:border-primary/20 transition-all group mb-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <Label className="text-white font-bold text-lg tracking-tight">Mood</Label>
                  </div>
                  <AiToolbar field="mood" />
                </div>
                <SmartSearchInput
                  value={mood}
                  onChange={(val: string) => updateSongPrompt({ mood: val })}
                  options={PRESET_MOODS}
                  placeholder="Describe the emotional landscape..."
                />
              </motion.div>

              {/* Song Structure */}
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.32 }} className="glass-card rounded-[32px] p-8 border-white/5 hover:border-primary/20 transition-all group mb-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <AudioWaveform className="w-5 h-5 text-primary" />
                    </div>
                    <Label className="text-white font-bold text-lg tracking-tight">Song Structure</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RecommendationBadge field="structureType" />
                    <AiToolbar field="structureType" />
                  </div>
                </div>
                <SmartSearchInput
                  value={structureType}
                  onChange={(val: string) => updateSongPrompt({ structureType: val })}
                  options={SONG_STRUCTURE_PRESETS}
                  placeholder="Set the journey (e.g., Intro → Hook → Bridge)..."
                />
              </motion.div>

              {/* Voice & Identity Clustering */}
              <div className="space-y-4 pt-4">
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 }} className="glass-card rounded-[32px] p-8 border-white/5 hover:border-primary/30 transition-all">
                  <div className="flex items-center justify-between mb-8 overflow-x-auto pb-2 scrollbar-hide">
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
                        <Mic2 className="w-6 h-6 text-black" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-white tracking-tight">Voice Engine</h3>
                        <p className="text-xs font-bold text-white/30 uppercase tracking-widest">Synthesis & Delivery</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 shrink-0">
                      <span className="text-[10px] font-black uppercase text-white/40">Vocals</span>
                      <Switch checked={vocalsEnabled} onCheckedChange={setVocalsEnabled} />
                    </div>
                  </div>

                  <AnimatePresence>
                    {vocalsEnabled && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }} 
                        animate={{ opacity: 1, height: 'auto' }} 
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-8 overflow-hidden"
                      >
                        <div className="grid sm:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-black uppercase tracking-widest text-white/40">Arrangement</Label>
                              <AiToolbar field="vocalArrangement" />
                            </div>
                            <SmartSearchInput
                              value={vocalArrangement}
                              onChange={(val: string) => updateSongPrompt({ vocalArrangement: val })}
                              options={VOCAL_STRUCTURE_PRESETS}
                              placeholder="Solo, Duet, etc..."
                            />
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-black uppercase tracking-widest text-white/40">Language</Label>
                              <AiToolbar field="vocalLanguage" />
                            </div>
                            <SmartSearchInput
                              value={vocalLanguage.split(',').map((item) => item.trim()).filter(Boolean)}
                              onChange={(val: string[]) => setVocalLanguage(val.join(', '))}
                              options={LANGUAGES}
                              placeholder="English, Spanish, etc..."
                              multiSelect
                            />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-black uppercase tracking-widest text-white/40">Intensity & Dynamics</Label>
                            <AiToolbar field="vocalIntensity" />
                          </div>
                          <div className="flex items-baseline gap-3 mb-2">
                             <span className="text-3xl font-black text-primary tracking-tighter">{vocalIntensity}</span>
                             <span className="text-[10px] uppercase font-bold text-white/20">Energy Scale</span>
                          </div>
                          <Slider value={[vocalIntensity]} onValueChange={v => updateSongPrompt({ vocalIntensity: v[0] })} min={1} max={10} step={1} />
                        </div>

                        <div className="grid sm:grid-cols-2 gap-6">
                           <div className="space-y-3">
                             <div className="flex items-center justify-between">
                               <Label className="text-xs font-black uppercase tracking-widest text-white/40">Vocal Style</Label>
                               <div className="flex items-center gap-2">
                                 <RecommendationBadge field="vocalStyle" />
                                 <AiToolbar field="vocalStyle" />
                               </div>
                             </div>
                             <SmartSearchInput
                               value={vocalStyle}
                               onChange={(val: string) => updateSongPrompt({ vocalStyle: val })}
                               options={PRESET_VOCAL_STYLES}
                               placeholder="e.g., Ethereal, Rap..."
                             />
</div>
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs font-black uppercase tracking-widest text-white/40">Voice Gender</Label>
                              </div>
                              <div className="flex gap-2">
                                {([
                                  { value: 'male' as const, label: 'Male' },
                                  { value: 'female' as const, label: 'Female' },
                                  { value: 'neutral' as const, label: 'Male & Female Both' },
                                ]).map((g) => (
                                  <button
                                    key={g.value}
                                    onClick={() => setVocalGender(g.value)}
                                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                                      vocalGender === g.value
                                        ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/20'
                                        : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                                    }`}
                                  >
                                    {g.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-black uppercase tracking-widest text-white/40">Studio Effects</Label>
                            <AiToolbar field="vocalEffects" />
                          </div>
                          <SmartSearchInput
                            value={selectedVocalEffects}
                            onChange={(val: string[]) => setSelectedVocalEffects(val)}
                            options={VOCAL_EFFECTS_OPTIONS}
                            placeholder="Reverb, Delay..."
                            multiSelect
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Lyrics & Inspiration Cluster */}
                <div className="grid gap-4">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card rounded-[32px] p-8 border-white/5 hover:border-primary/20 transition-all">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center">
                          <Palette className="w-5 h-5 text-white/60" />
                        </div>
                        <Label className="text-white font-bold text-lg tracking-tight">Narrative & Lyrics</Label>
                      </div>
                      <AiToolbar field="lyrics" />
                    </div>
                    <Textarea
                      placeholder="Share the story, theme, or specific lyrics..."
                      value={lyricsText}
                      onChange={e => setLyricsText(e.target.value)}
                      className="bg-black/20 border-white/5 min-h-[140px] rounded-2xl focus:border-primary/50 transition-all text-white placeholder:text-white/30"
                    />
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }} className="glass-card rounded-[32px] p-6 border-white/5">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-[10px] uppercase font-black tracking-widest text-white/30">Artist Influence</Label>
                      <AiToolbar field="artistInspiration" />
                    </div>
                    <SmartSearchInput
                      value={artistInspiration ? artistInspiration.split(',').map(s => s.trim()).filter(Boolean) : []}
                      onChange={(val: string[]) => updateSongPrompt({ artistInspiration: val.join(', ') })}
                      options={ARTIST_NAMES()}
                      placeholder="Search trending artists or type your own..."
                      multiSelect
                    />
                  </motion.div>
                </div>
              </div>

            {/* AI Audio Mode always ON — no user toggle needed */}

            {/* Visualizer Cluster */}
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }} className="glass-card rounded-[32px] p-8 border-white/5 hover:border-accent/30 transition-all">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent to-accent/80 flex items-center justify-center shadow-lg shadow-accent/20">
                        <Video className="w-6 h-6 text-black" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-white tracking-tight">Visual Engine</h3>
                        <p className="text-xs font-bold text-white/30 uppercase tracking-widest">Video Synthesis</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 border border-white/10">
                      <span className="text-[10px] font-black uppercase text-white/40">Render</span>
                      <Switch checked={visualizerEnabled} onCheckedChange={setGenerateVideo} />
                    </div>
                  </div>

                  <AnimatePresence>
                    {visualizerEnabled && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }} 
                        animate={{ opacity: 1, height: 'auto' }} 
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-6 overflow-hidden"
                      >
                         <div className="space-y-3">
                           <div className="flex items-center justify-between">
                             <Label className="text-xs font-black uppercase tracking-widest text-white/40">Visual Aesthetic</Label>
                             <div className="flex items-center gap-2">
                               <RecommendationBadge field="videoStyle" />
                               <AiToolbar field="videoStyle" />
                             </div>
                           </div>
                           <SmartSearchInput
                             value={videoStyle}
                             onChange={(val: string) => updateSongPrompt({ videoStyle: val })}
                             options={PRESET_VIDEO_STYLES}
                             placeholder="Cinematic, 3D Abstract, etc..."
                           />
                         </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </>
            )}

          {/* Generate Button */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
            <Button
              onClick={handleGenerate}
              disabled={isCreating}
              variant="glow"
              size="xl"
              className="w-full"
            >
              {isCreating ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Creating…</>
              ) : (
                <><Sparkles className="w-5 h-5" /> Generate {mode === 'song' ? 'Song' : `Album (${numberOfSongs} tracks)`}</>
              )}
            </Button>
          </motion.div>

          {/* Emergency Local-Synth Fallback Panel.
             *
             * Renders only when the AI/Replicate path failed AND the on-device
             * local synth has either started rendering or finished. Acts as a
             * safety net so the user is never left empty-handed when the
             * remote model is down. Local synth is NEVER the primary path —
             * it appears here only because something went wrong upstream.
             */}
          <AnimatePresence>
            {(emergencyLocalSynth.loading || emergencyLocalSynth.result) && fallbackReason && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="glass-card rounded-xl p-4 sm:p-6 border-amber-500/40 bg-amber-500/5 space-y-3"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-base font-semibold text-amber-300 flex items-center gap-2">
                      <Zap className="w-4 h-4" /> Emergency offline render
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      AI backend failed: <span className="font-mono">{fallbackReason}</span>. Generated locally with no model — instrumental + vocoder vowels.
                    </p>
                  </div>
                  <Badge variant="secondary" className="bg-amber-500/20 text-amber-300">
                    {emergencyLocalSynth.loading ? `Rendering ${Math.round(emergencyLocalSynth.progress * 100)}%` : 'Ready'}
                  </Badge>
                </div>

                {emergencyLocalSynth.loading && (
                  <div className="h-1 w-full bg-white/10 rounded overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-all duration-300"
                      style={{ width: `${Math.round(emergencyLocalSynth.progress * 100)}%` }}
                    />
                  </div>
                )}

                {emergencyLocalSynth.result && (
                  <>
                    <audio src={emergencyLocalSynth.result.wavUrl} controls className="w-full" />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          downloadArrayBuffer(
                            emergencyLocalSynth.result!.wavArrayBuffer,
                            `fallback-${emergencyLocalSynth.result!.plan.resolved.genreId}-${Date.now()}.wav`,
                            'audio/wav',
                          )
                        }
                      >
                        <Download className="w-4 h-4 mr-1" /> WAV
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          downloadArrayBuffer(
                            emergencyLocalSynth.result!.midiArrayBuffer,
                            `fallback-${emergencyLocalSynth.result!.plan.resolved.genreId}-${Date.now()}.mid`,
                            'audio/midi',
                          )
                        }
                      >
                        <Download className="w-4 h-4 mr-1" /> MIDI
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          emergencyLocalSynth.reset();
                          setFallbackReason(null);
                          setFallbackBriefSnapshot(null);
                          lastFailedCreationIdRef.current = null;
                        }}
                      >
                        <X className="w-4 h-4 mr-1" /> Dismiss
                      </Button>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Seed <span className="font-mono">{emergencyLocalSynth.result.seed}</span> &middot;
                      LUFS <span className="font-mono">{emergencyLocalSynth.result.loudness.after.integratedLufs.toFixed(1)}</span> &middot;
                      Quality <span className="font-mono">{emergencyLocalSynth.result.quality.score}/100</span> &middot;
                      Render <span className="font-mono">{(emergencyLocalSynth.result.elapsedMs / 1000).toFixed(1)}s</span>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

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
                    {/* Inline ETA — pulled from the longest-remaining track so
                        users see "Generating · ~2m 30s" at a glance instead of
                        having to scan every track's progress bar. */}
                    {(() => {
                      const eta = Math.max(0, ...currentCreation.tracks.map(t => t.estimatedTimeLeft ?? 0));
                      if (eta <= 0 || currentCreation.status === 'completed' || currentCreation.status === 'failed') return null;
                      const mins = Math.floor(eta / 60);
                      const secs = eta % 60;
                      return <span className="ml-2 opacity-80">· ~{mins > 0 ? `${mins}m ` : ''}{secs}s</span>;
                    })()}
                  </Badge>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  {/* Completion-state CTA — appears once at least one track in this
                      creation is finished. Gives users an obvious path forward
                      (view in dashboard / make another) so the page doesn't dead-end. */}
                  {currentCreation.tracks.some(t => t.status === 'completed' || t.status === 'audio_complete_video_failed') && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-primary/15 via-primary/5 to-accent/10 border border-primary/30"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <Check className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-display text-sm font-semibold text-white">Ready to share</p>
                          <p className="text-xs text-white/60 truncate">Your track is saved to your library. Make another or jump to the dashboard.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {onNavigate && (
                          <Button variant="outline" size="sm" onClick={() => onNavigate('dashboard')} className="gap-2">
                            <LayoutDashboard className="w-4 h-4" /> View in Dashboard
                          </Button>
                        )}
                        <Button variant="default" size="sm" onClick={() => { setCurrentCreation(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="gap-2">
                          <Sparkles className="w-4 h-4" /> Create Another
                        </Button>
                      </div>
                    </motion.div>
                  )}
                  {currentCreation.tracks.map((track, index) => (
                    <div key={track.id} className="p-3 sm:p-4 bg-secondary/50 rounded-lg relative group">
                      {ACTIVE_STATUSES.includes(track.status) && (
                        <button
                          onClick={() => {
                            // Sonner inline confirm — replaces window.confirm so
                            // the cancel flow stays in-app (no native dialog).
                            toast('Cancel this generation?', {
                              description: 'The track will stop processing immediately.',
                              action: {
                                label: 'Cancel track',
                                onClick: () => handleCancelTrack?.(track.id),
                              },
                              cancel: { label: 'Keep going', onClick: () => undefined },
                              duration: 8000,
                            });
                          }}
                          // Always visible on touch devices (no hover); on
                          // pointer-fine devices, fade in on hover only.
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-destructive/20 text-destructive hover:bg-destructive/40 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10"
                          title="Cancel generation"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
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
                              hasVideo={!!visualizerEnabled}
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

                          {videoStatus === "failed" && videoError && (
                            <div className="mt-4 text-sm text-red-500">
                              Video failed: {videoError}
                            </div>
                          )}

                          {/* Once a video URL exists, show the player inline in
                              the track row — no extra "View Video" CTA. The
                              only action button is Download. */}
                          {track.videoUrl && (
                            <div className="mt-4">
                              <div className="glass-card rounded-xl p-4">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center flex-shrink-0">
                                      <MonitorPlay className="w-5 h-5 text-accent" />
                                    </div>
                                    <div className="min-w-0">
                                      <h4 className="font-display text-sm font-semibold text-foreground truncate">Music Video</h4>
                                      <p className="text-xs text-muted-foreground">AI-generated visual</p>
                                    </div>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadVideo(track.videoUrl!, track.title || 'track');
                                    }}
                                    className="flex items-center gap-2 flex-shrink-0"
                                  >
                                    <Download className="w-4 h-4" />
                                    Download Video
                                  </Button>
                                </div>
                                <VideoPlayer videoUrl={track.videoUrl} title={track.title} duration={track.duration} />
                              </div>
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
