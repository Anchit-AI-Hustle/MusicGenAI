import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import {
  midiToFreq, getScaleMidi, parseKey,
  masterAudio, INTERNAL_SAMPLE_RATE,
} from '@/lib/audio-utils';
import { generateTrack, type AudioStems, type GenerateTrackResult, MusicIntent, createRng, createGenerationDNA, getGenerationSeedNumber, mixStems, type GenerationDNA } from '@/lib/music-engine';
import { generateVocals, generateLyricCues, inferVocalStyle, generateDefaultLyrics, mixVocalsIntoInstrumental, type LyricCue, type VocalConfig, type VocalStyleType } from '@/lib/vocal-engine';
import { aiMusicClient } from '@/lib/ai-music-client';
import type { TrackConfig } from '@/components/AlbumTrackForm';
import { genreOptionsToLabels } from '@/data/genres';
import {
  buildAlbumPlan,
  buildGenerationIntent,
  enhanceField,
  newAlternativeField,
  suggestMood,
  suggestMusicPrompt,
  suggestSongStructure,
  suggestTempo,
  suggestVideoStyle,
  suggestVocalStyle,
} from '@/engine';
import { moodToVector } from '@/engine/normalizer';
import { applyInferenceToContext, resolveCreativeContext } from '@/lib/contextInference';
import { nextGenerationNonce } from '@/lib/intelligence';
import { CreativeContext } from '@/types/creative-context';
import type { GenerationIntent, RawUserInput } from '@/engine/types';

export interface Track {
  id: string;
  title: string;
  duration: number;
  audioUrl?: string;
  videoUrl?: string;
  lyrics?: string;
  lyricCues?: LyricCue[];
  status: string;
  trackNumber: number;
  createdAt: Date;
  progress?: number;
  totalSegments?: number;
  completedSegments?: number;
  errorMessage?: string;
  currentStage?: string;
  estimatedTimeLeft?: number;
  lastUpdatedAt?: number;
}

export interface MusicCreation {
  id: string;
  userId: string;
  type: 'song' | 'album';
  title: string;
  tracks: Track[];
  createdAt: Date;
  songDescription: string;
  genre: string;
  status: string;
  duration: number;
  visualizerEnabled: boolean;
  vocalLanguage: string;
  lyricsText?: string;
  artistInspiration?: string;
  videoStyle?: string;
  progress?: number;
}

export interface CreateMusicInput extends Partial<CreativeContext> {
  type: 'song' | 'album';
  title: string;
  numberOfTracks?: number;
  musicalKey?: string;
  vocalArrangement?: 'solo' | 'duet' | 'choir' | 'none' | string;
  // Per-track configs for album mode
  albumTracks?: TrackConfig[];
}

export type FormState = CreativeContext;

type AiAction = 'suggest' | 'enhance' | 'new';

export interface StructuredPromptSuggestion {
  genre: string[];
  mood: string;
  energy: string;
  tempo: string;
  artist_inspiration: string;
  lyrics: string;
  description: string;
  prompt: string;
  subgenre?: string[];
  lyricTheme?: string;
}

export interface AiSuggestionResult {
  field: string;
  action: AiAction;
  suggestion: string | null;
  seed?: string;
  genreFamily?: string;
  structured?: StructuredPromptSuggestion | null;
}

export interface AiSuggestionState {
  loading: Record<string, boolean>;
  results: Record<string, AiSuggestionResult | null>;
  lastRequestId: Record<string, string>;
}

interface MusicContextType {
  creations: MusicCreation[];
  currentCreation: MusicCreation | null;
  isLoading: boolean;
  isCreating: boolean;
  formState: FormState;
  updateFormState: (updates: Partial<FormState>) => void;
  createMusic: (input: CreateMusicInput) => Promise<MusicCreation | null>;
  setCurrentCreation: (creation: MusicCreation | null) => void;
  refreshCreations: () => Promise<void>;
  retryTrack: (trackId: string, creationId: string) => Promise<void>;
  aiSuggest: (field: string, value: string, context?: Record<string, any>, action?: AiAction) => Promise<AiSuggestionResult | null>;
  suggestionState: AiSuggestionState;
}

const MusicContext = createContext<MusicContextType | undefined>(undefined);

/** Rejects if promise does not settle within ms (uploads / video can hang indefinitely otherwise). */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

const AUDIO_UPLOAD_TIMEOUT_MS = 4 * 60 * 1000;
const VIDEO_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

function videoRenderTimeoutMs(durationSeconds: number) {
  return Math.min(45 * 60 * 1000, Math.max(5 * 60 * 1000, durationSeconds * 90 * 1000));
}

const TERMINAL_TRACK_STATUSES = ['completed', 'audio_complete_video_failed', 'failed'];

function deriveCreationState(tracks: Track[]) {
  const statuses = tracks.map(t => t.status);
  const derivedStatus = statuses.some(s => s === 'failed') && statuses.every(s => TERMINAL_TRACK_STATUSES.includes(s))
    ? 'completed'
    : statuses.every(s => s === 'completed' || s === 'audio_complete_video_failed')
      ? 'completed'
      : statuses.find(s => !['pending', 'completed', 'audio_complete_video_failed'].includes(s)) || 'pending';
  const derivedProgress = tracks.reduce((a, t) => a + (t.progress ?? 0), 0) / (tracks.length || 1);
  return { derivedStatus, derivedProgress };
}

export const MusicProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [creations, setCreations] = useState<MusicCreation[]>([]);
  const [currentCreation, setCurrentCreation] = useState<MusicCreation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [formState, setFormState] = useState<FormState>({
    songDescription: '',
    songTitle: 'Untitled Track',
    genre: 'Pop',
    subgenre: '',
    mood: 'Energetic',
    tempo: 120,
    duration: 120,
    vocalsEnabled: true,
    vocalStyle: 'Pop Singing',
    vocalGender: 'neutral',
    vocalLanguage: 'English',
    vocalIntensity: 5,
    vocalEffects: [],
    lyricsMode: 'auto',
    lyricsText: '',
    lyricsTheme: '',
    artistInspiration: '',
    instruments: [],
    energyLevel: 5,
    structureType: 'Verse-Chorus-Bridge',
    videoStyle: 'Cinematic',
    visualizerEnabled: true,
    creativityLevel: 5,
    variationSeed: `${Math.floor(Math.random() * 1000000)}`,
    generationMode: 'standard'
  });
  const [suggestionState, setSuggestionState] = useState<AiSuggestionState>({
    loading: {},
    results: {},
    lastRequestId: {},
  });

  const realtimeChannelRef = useRef<any>(null);
  const abortControllersRef = useRef<Record<string, AbortController>>({});
  const trackLastUpdateRef = useRef<Record<string, number>>({});

  const updateFormState = useCallback((updates: Partial<FormState>) => {
    setFormState(prev => {
      const merged = { ...prev, ...updates };
      
      // If description (songDescription) changed, apply inference
      if (updates.songDescription !== undefined) {
        return applyInferenceToContext(updates.songDescription, merged);
      }
      
      // Otherwise just resolve any direct dependency changes
      return resolveCreativeContext(merged);
    });
  }, []);

  const fetchCreations = useCallback(async () => {
    if (!user?.id) { setCreations([]); return; }
    setIsLoading(true);
    try {
      const { data: creationsData, error: creationsError } = await supabase
        .from('music_creations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (creationsError) { console.error('Error fetching creations:', creationsError); return; }

      const creationIds = creationsData?.map(c => c.id) || [];
      let tracksData: any[] = [];
      if (creationIds.length > 0) {
        const { data, error: tracksError } = await supabase
          .from('tracks')
          .select('*')
          .in('creation_id', creationIds)
          .order('track_number', { ascending: true });
        if (!tracksError) tracksData = data || [];
      }

      for (const t of tracksData) {
        if (typeof t.audio_url === 'string' && t.audio_url.startsWith('blob:')) {
          const { error: fixErr } = await supabase.from('tracks').update({
            status: 'failed',
            current_stage: 'Upload incomplete',
            error_message: 'Browser session ended before audio was saved to storage. Use Retry to regenerate.',
            progress: 0,
          }).eq('id', t.id);
          if (!fixErr) {
            t.audio_url = null;
            t.status = 'failed';
            t.current_stage = 'Upload incomplete';
            t.error_message = 'Browser session ended before audio was saved to storage. Use Retry to regenerate.';
            t.progress = 0;
          }
        }
      }

      const mapped: MusicCreation[] = (creationsData || []).map(creation => {
        const tracks = tracksData
          .filter(t => t.creation_id === creation.id)
          .map(track => ({
            id: track.id,
            title: track.title,
            duration: track.duration_seconds,
            audioUrl: track.audio_url || undefined,
            videoUrl: track.video_url || undefined,
            lyrics: track.lyrics || undefined,
            lyricCues: track.lyric_cues || undefined,
            status: track.status,
            trackNumber: track.track_number,
            createdAt: new Date(track.created_at),
            progress: track.progress ?? 0,
            totalSegments: track.total_segments ?? 1,
            completedSegments: track.completed_segments ?? 0,
            errorMessage: track.error_message || undefined,
            currentStage: track.current_stage || undefined,
            estimatedTimeLeft: track.estimated_time_left ?? 0,
          }));
        const { derivedStatus, derivedProgress } = deriveCreationState(tracks);
        return {
          id: creation.id,
          userId: creation.user_id,
          type: creation.type as 'song' | 'album',
          title: creation.title,
          songDescription: creation.music_prompt,
          genre: Array.isArray(creation.genres) ? creation.genres[0] : (creation.genres || 'Pop'),
          status: derivedStatus,
          duration: creation.duration_seconds,
          visualizerEnabled: creation.generate_video,
          vocalLanguage: Array.isArray(creation.vocal_languages) ? creation.vocal_languages[0] : (creation.vocal_languages || 'English'),
          lyricsText: creation.lyrics || undefined,
          artistInspiration: creation.artist_inspiration || undefined,
          videoStyle: creation.video_style || undefined,
          createdAt: new Date(creation.created_at),
          progress: derivedProgress,
          tracks,
        };
      });

      setCreations(mapped);
    } catch (error) {
      console.error('Error in fetchCreations:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Realtime subscriptions
  const mapTrack = (t: Track, updated: any): Track =>
    t.id === updated.id
      ? {
        ...t,
        status: updated.status,
        audioUrl: updated.audio_url || updated.audioUrl || t.audioUrl,
        videoUrl: updated.video_url || updated.videoUrl || t.videoUrl,
        progress: updated.progress ?? t.progress ?? 0,
        totalSegments: updated.total_segments ?? updated.totalSegments ?? t.totalSegments ?? 1,
        completedSegments: updated.completed_segments ?? updated.completedSegments ?? t.completedSegments ?? 0,
        errorMessage: updated.error_message || updated.errorMessage || t.errorMessage,
        duration: updated.duration_seconds || updated.duration || t.duration,
        currentStage: updated.current_stage || updated.currentStage || t.currentStage,
        estimatedTimeLeft: updated.estimated_time_left || updated.estimatedTimeLeft || t.estimatedTimeLeft || 0,
        lastUpdatedAt: Date.now(),
      }
      : t;

  // Realtime subscriptions
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const channel = supabase
      .channel('music-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tracks' }, (payload) => {
        const updated = payload.new as any;
        
        setCreations(prev => prev.map(c => {
          const tracks = c.tracks.map(t => mapTrack(t, updated));
          const { derivedStatus, derivedProgress } = deriveCreationState(tracks);
          return { ...c, tracks, status: derivedStatus, progress: derivedProgress };
        }));

        setCurrentCreation(prev => {
          if (!prev) return prev;
          const tracks = prev.tracks.map(t => mapTrack(t, updated));
          const { derivedStatus, derivedProgress } = deriveCreationState(tracks);
          return { ...prev, tracks, status: derivedStatus, progress: derivedProgress };
        });
      })
      .subscribe();

    realtimeChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (isAuthenticated && user?.id) fetchCreations();
    else { setCreations([]); setCurrentCreation(null); }
  }, [isAuthenticated, user?.id, fetchCreations]);

  // Helper to update track state locally
  const updateTrackLocal = (creationId: string, trackId: string, updates: Partial<Track>) => {
    const updatedPayload = { id: trackId, ...updates, lastUpdatedAt: Date.now() };
    
    setCreations(prev => prev.map(c => {
      if (c.id !== creationId) return c;
      const tracks = c.tracks.map(t => mapTrack(t, updatedPayload));
      const { derivedStatus, derivedProgress } = deriveCreationState(tracks);
      return { ...c, tracks, status: derivedStatus, progress: derivedProgress };
    }));
    
    setCurrentCreation(prev => {
      if (prev?.id !== creationId) return prev;
      const tracks = prev.tracks.map(t => mapTrack(t, updatedPayload));
      const { derivedStatus, derivedProgress } = deriveCreationState(tracks);
      return { ...prev, tracks, status: derivedStatus, progress: derivedProgress };
    });
  };

  const updateCreationLocal = (creationId: string, updates: Partial<MusicCreation>) => {
    setCreations(prev => prev.map(c => c.id === creationId ? { ...c, ...updates } : c));
    setCurrentCreation(prev => prev?.id === creationId ? { ...prev, ...updates } : prev);
  };

  // Helper to update track in DB
  const updateTrackDB = async (trackId: string, creationId: string, stage: string, progress: number, status: string) => {
    const { error } = await supabase.from('tracks').update({
      current_stage: stage, progress, status,
    }).eq('id', trackId);
    if (error) console.error('[tracks]', trackId, error.message, { stage, status });
  };

  const runAsyncVideoRender = async (
    trackId: string,
    creationId: string,
    input: CreateMusicInput,
    trackTitle: string,
    audioUrl: string,
    dna: GenerationDNA,
    lyricCues: LyricCue[] = [],
  ) => {
    try {
      updateTrackLocal(creationId, trackId, { status: 'analyzing_beat_structure', currentStage: 'Analyzing beats', progress: 0.84, audioUrl });
      await updateTrackDB(trackId, creationId, 'Analyzing beats', 0.84, 'analyzing_beat_structure');

      const { generateVideoFromAudio } = await import('@/lib/video-generator');
      const dur = input.duration || 120;
      const videoBlob = await withTimeout(
        generateVideoFromAudio(
          audioUrl,
          dur,
          [input.genre || 'Pop'],
          input.mood || '',
          input.videoStyle || 'Cinematic',
          (p) => {
            const stageLabel = p.stage === 'analyzing_beat_structure'
              ? 'Analyzing beats'
              : p.stage === 'rendering_video' || p.stage === 'generating_video'
                ? 'Rendering visuals'
                : p.stage === 'transcoding_video'
                  ? 'Optimizing MP4'
                  : 'Encoding video';

            updateTrackLocal(creationId, trackId, {
              status: p.stage as string,
              currentStage: stageLabel,
              progress: 0.84 + p.progress * 0.12,
              audioUrl,
            });
            void updateTrackDB(trackId, creationId, stageLabel, 0.84 + p.progress * 0.12, p.stage);
            trackLastUpdateRef.current[trackId] = Date.now();
          },
          {
            seed: dna.seed,
            numericSeed: getGenerationSeedNumber(dna),
            visualEnergy: dna.visualEnergy,
            colorSignature: dna.colorSignature,
            arrangementStyle: dna.arrangementStyle,
          },
          lyricCues,
        ),
        videoRenderTimeoutMs(dur),
        'Video rendering',
      );

      updateTrackLocal(creationId, trackId, { status: 'uploading_video', currentStage: 'Uploading video', progress: 0.97, audioUrl });
      await updateTrackDB(trackId, creationId, 'Uploading video', 0.97, 'uploading_video');

      const isMp4Video = videoBlob.type.includes('mp4');
      const videoExt = isMp4Video ? 'mp4' : 'webm';
      const videoContentType = isMp4Video ? 'video/mp4' : 'video/webm';
      const videoPath = `tracks/${trackId}/video.${videoExt}`;
      const uploadPromise = supabase.storage
        .from('music-files')
        .upload(videoPath, videoBlob, { contentType: videoContentType, upsert: true });
      const { error: vidUploadError } = await withTimeout(uploadPromise, VIDEO_UPLOAD_TIMEOUT_MS, 'Video upload');

      if (vidUploadError) throw new Error(`Video upload failed: ${vidUploadError.message}`);

      const { data: vidUrlData } = supabase.storage.from('music-files').getPublicUrl(videoPath);
      const videoUrl = vidUrlData.publicUrl;

      await supabase.from('tracks').update({
        status: 'completed',
        video_url: videoUrl,
        audio_url: audioUrl,
        progress: 1,
        current_stage: 'Completed',
        estimated_time_left: 0,
      }).eq('id', trackId);

      updateTrackLocal(creationId, trackId, {
        status: 'completed',
        currentStage: 'Completed',
        progress: 1,
        audioUrl,
        videoUrl,
      });
      toast.success(`Visuals attached for "${trackTitle}".`);
    } catch (videoError) {
      console.error(`[${trackId}] Video generation failed:`, videoError);
      await supabase.from('tracks').update({
        status: 'audio_complete_video_failed',
        current_stage: 'Audio ready, video failed',
        error_message: `Video: ${videoError instanceof Error ? videoError.message : 'Unknown error'}`,
        audio_url: audioUrl,
        progress: 1,
        estimated_time_left: 0,
      }).eq('id', trackId);
      updateTrackLocal(creationId, trackId, {
        status: 'audio_complete_video_failed',
        currentStage: 'Audio ready, video failed',
        errorMessage: `Video: ${videoError instanceof Error ? videoError.message : 'Unknown error'}`,
        progress: 1,
        audioUrl,
      });
      toast.error(`Video generation failed for "${trackTitle}" — audio is still available.`);
    } finally {
      delete trackLastUpdateRef.current[trackId];
    }
  };

  // Senior Engineer Utility: Compiles a CreateMusicInput from a TrackConfig
  const trackConfigToInput = (tc: TrackConfig): CreateMusicInput => ({
    type: 'song',
    songTitle: tc.trackName,
    title: tc.trackName,
    songDescription: tc.songDescription,
    genre: tc.genre,
    subgenre: tc.subgenre,
    duration: tc.duration,
    vocalsEnabled: tc.vocalsEnabled,
    vocalLanguage: tc.vocalLanguage,
    lyricsText: tc.lyricsText || undefined,
    artistInspiration: tc.artistInspiration || undefined,
    videoStyle: tc.generateVideo ? tc.videoStyle : undefined,
    tempo: tc.tempo,
    mood: tc.mood,
    vocalStyle: tc.vocalStyle,
    vocalIntensity: tc.vocalIntensity,
    vocalEffects: tc.vocalEffects,
    structureType: tc.structureType,
    energyLevel: tc.energyLevel,
    instruments: tc.instruments,
    lyricsTheme: tc.lyricsTheme,
  });

  const parseList = (value: unknown): string[] => {
    if (value === null || value === undefined) return [];

    if (Array.isArray(value)) {
      return value
        .flatMap((entry) => parseList(entry))
        .map((item) => item.trim())
        .filter(Boolean);
    }

    if (typeof value === 'object') {
      const candidate = value as { label?: unknown; value?: unknown; name?: unknown };
      if (typeof candidate.label === 'string') return [candidate.label.trim()].filter(Boolean);
      if (typeof candidate.value === 'string') return [candidate.value.trim()].filter(Boolean);
      if (typeof candidate.name === 'string') return [candidate.name.trim()].filter(Boolean);
      return [];
    }

    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const normalizeStructure = (value: string | undefined): string => {
    const raw = (value ?? 'Intro-Verse-Chorus-Verse-Chorus-Bridge-Chorus-Outro').trim();
    if (!raw) return 'Intro-Verse-Chorus-Verse-Chorus-Bridge-Chorus-Outro';
    return raw
      .replace(/\s*→\s*/g, '-')
      .replace(/\s*-\s*/g, '-');
  };

  const toRawUserInput = (input: CreateMusicInput, creationMode: 'single' | 'album', albumCount?: number): RawUserInput => {
    const genreCandidates = parseList(input.genre).length > 0
      ? parseList(input.genre)
      : ['Pop'];
    const subgenreCandidates = parseList(input.subgenre);
    const artistList = parseList(input.artistInspiration);
    const languageList = parseList(input.vocalLanguage);
    const vocalEffects = (input.vocalEffects && input.vocalEffects.length > 0)
      ? input.vocalEffects
      : ['none'];

    const normalizedArrangement = (() => {
      if (input.vocalsEnabled === false) return 'none';
      const raw = String(input.vocalArrangement || 'solo').trim().toLowerCase();
      if (raw === 'solo' || raw === 'duet' || raw === 'choir' || raw === 'none') return raw;
      return 'solo';
    })();

    return {
      creation_mode: creationMode,
      album_song_count: creationMode === 'album' ? albumCount : undefined,
      track_name: input.songTitle || input.title || 'Untitled Track',
      music_prompt: (input.songDescription || '').trim() || `${genreCandidates[0]} ${input.mood || 'neutral'} track`,
      genres: genreCandidates,
      subgenres: subgenreCandidates.length > 0 ? subgenreCandidates : ['general'],
      tempo_bpm: input.tempo ?? 120,
      duration_seconds: input.duration ?? 180,
      mood: input.mood || 'happy',
      song_structure: normalizeStructure(input.structureType),
      vocal_arrangement: normalizedArrangement as RawUserInput['vocal_arrangement'],
      vocal_style: input.vocalStyle || 'mixed voice',
      vocal_intensity: input.vocalIntensity ?? 5,
      vocal_effects: vocalEffects,
      vocal_language: languageList.length > 0 ? languageList : ['English'],
      lyric_theme: input.lyricsTheme || (input.mood || 'emotional narrative'),
      lyrics: input.lyricsText?.trim() ? input.lyricsText : null,
      artist_inspiration: artistList.length > 0 ? artistList : ['MuseVibe Reference'],
      generate_video: !!input.videoStyle,
      video_style: input.videoStyle ? input.videoStyle : null,
    };
  };

  const toRuntimeInput = (base: CreateMusicInput, intent: GenerationIntent): CreateMusicInput => ({
    ...base,
    songTitle: intent.meta.track_name,
    title: intent.meta.track_name,
    songDescription: intent.generation_prompt,
    genre: intent.genre_profile.primary,
    subgenre: intent.genre_profile.secondary.join(', '),
    duration: intent.meta.duration_seconds,
    tempo: intent.tempo_bpm,
    mood: intent.mood.label,
    structureType: intent.structure.raw,
    vocalArrangement: intent.vocal.arrangement,
    vocalsEnabled: intent.vocal.arrangement !== 'none',
    vocalStyle: intent.vocal.style,
    vocalLanguage: intent.vocal.languages.join(', '),
    vocalIntensity: intent.vocal.intensity,
    vocalEffects: [...intent.vocal.effects],
    lyricsText: intent.lyrics.content ?? '',
    lyricsTheme: intent.lyrics.theme,
    artistInspiration: intent.style_reference.map((ref) => ref.artist).join(', '),
    instruments: [...intent.audio_parameters.instrumentation],
    energyLevel: intent.energy,
    videoStyle: intent.visual.enabled ? (intent.visual.style ?? base.videoStyle) : undefined,
    visualizerEnabled: intent.visual.enabled,
  });

  const toMusicIntent = (intent: GenerationIntent, dna: GenerationDNA, key: string): MusicIntent => ({
    genre: intent.genre_profile.primary,
    subgenre: intent.genre_profile.secondary[0] || '',
    tempo: intent.tempo_bpm,
    key,
    scale: intent.mood.valence >= 6 ? 'major' : 'minor',
    mood: intent.mood.label,
    energy: intent.energy,
    structure: intent.structure.segments.map((segment) => ({
      name: segment.name,
      duration: Math.max(4, Math.round(intent.meta.duration_seconds * segment.duration_ratio)),
      energy: Math.max(0.1, Math.min(1, intent.energy / 10)),
      description: `${segment.name} section`,
    })),
    instruments: [...intent.audio_parameters.instrumentation],
    atmosphere: intent.generation_prompt,
    durationSeconds: intent.meta.duration_seconds,
    genres: [intent.genre_profile.primary, ...intent.genre_profile.secondary],
    generationDNA: dna,
  });

  // Helper to calculate bars
  const calculateBars = (duration: number, tempo: number) => {
    return Math.max(1, Math.round(duration / ((60 / tempo) * 4)));
  };

  // BROWSER-BASED MUSIC GENERATION (poll the Next.js backend)
  const generateTrackInBrowser = async (
    trackId: string, creationId: string, input: CreateMusicInput, trackTitle: string
  ): Promise<'completed' | 'failed'> => {
    try {
      trackLastUpdateRef.current[trackId] = Date.now();
      updateTrackLocal(creationId, trackId, { status: 'analyzing', currentStage: 'Analyzing composition', progress: 0.1 });
      await updateTrackDB(trackId, creationId, 'Analyzing composition', 0.1, 'analyzing');

      const { intent: generationIntent } = buildGenerationIntent(
        toRawUserInput(input, 'single'),
      );
      const runtimeInput = toRuntimeInput(input, generationIntent);

      // 1. Create Generation DNA (Unique per song)
      const dna = createGenerationDNA();
      const rng = createRng(getGenerationSeedNumber(dna));
      
      // 2. Build Music Intent
      const baseIntent: MusicIntent = toMusicIntent(generationIntent, dna, runtimeInput.musicalKey || 'C');
      
      // Override parsed intent with explicit user form inputs for exact tracking
      const intent: MusicIntent = {
        ...baseIntent,
        genre: input.genre || baseIntent.genre,
        subgenre: input.subgenre || baseIntent.subgenre,
        tempo: input.tempo || baseIntent.tempo,
        mood: input.mood || baseIntent.mood,
        energy: input.energyLevel || baseIntent.energy,
        durationSeconds: input.duration || baseIntent.durationSeconds,
        instruments: input.instruments && input.instruments.length > 0 ? input.instruments : baseIntent.instruments,
        atmosphere: input.songDescription || baseIntent.atmosphere,
      };

      // 3. Generate Instrumental Stems
      updateTrackLocal(creationId, trackId, { status: 'processing', currentStage: 'Generating arrangement', progress: 0.2 });
      const { generateTrack } = await import('@/lib/music-engine');
      const instrumentalResult = await generateTrack(
        intent,
        (stage: string, progress: number) => {
          updateTrackLocal(creationId, trackId, { 
            status: 'processing', 
            currentStage: stage, 
            progress: 0.2 + (progress * 0.4) // 20% to 60%
          });
        }
      );

      let finalBuffer = instrumentalResult.instrumentalBuffer;

      if (runtimeInput.vocalsEnabled && runtimeInput.lyricsText) {
        updateTrackLocal(creationId, trackId, { status: 'processing', currentStage: 'Synthesizing vocals', progress: 0.65 });
        
        const { generateVocals, mixVocalsIntoInstrumental, inferVocalStyle } = await import('@/lib/vocal-engine');
        
        const vocalConfig = {
          lyrics: runtimeInput.lyricsText,
          tempo: intent.tempo,
          key: intent.key,
          scale: intent.scale,
          structure: instrumentalResult.compositionGraph.songStructure,
          durationSeconds: intent.durationSeconds,
          vocalStyle: inferVocalStyle(intent.genres || [intent.genre], runtimeInput.vocalStyle),
          vocalIntensity: runtimeInput.vocalIntensity || 5,
          vocalEffects: runtimeInput.vocalEffects || [],
          genres: intent.genres || [intent.genre],
          mood: intent.mood,
          language: runtimeInput.vocalLanguage || 'English'
        };

        const vocalBuffer = await generateVocals(vocalConfig as any, (p) => {
           updateTrackLocal(creationId, trackId, { 
            status: 'processing', 
            currentStage: `Vocals: ${p.stage}`, 
            progress: 0.65 + (p.progress * 0.2) // 65% to 85%
          });
        }, rng);

        if (vocalBuffer) {
           updateTrackLocal(creationId, trackId, { status: 'processing', currentStage: 'Mixing master stems', progress: 0.9 });
           finalBuffer = mixVocalsIntoInstrumental(finalBuffer, vocalBuffer, 1.15);
        }
      }

      // 5. Mastering
      updateTrackLocal(creationId, trackId, { status: 'processing', currentStage: 'Finalizing & Mastering', progress: 0.95 });
      const { masterAudio } = await import('@/lib/audio-utils');
      const mastered = masterAudio(finalBuffer);

      // 6. Persist audio to storage (blob: URLs break after reload and block reliable video fetch)
      const audioPath = `tracks/${trackId}/master.wav`;
      const audioUploadPromise = supabase.storage
        .from('music-files')
        .upload(audioPath, mastered.blob, { contentType: 'audio/wav', upsert: true });
      const { error: audioUpErr } = await withTimeout(audioUploadPromise, AUDIO_UPLOAD_TIMEOUT_MS, 'Audio upload');
      if (audioUpErr) throw new Error(`Could not upload audio: ${audioUpErr.message}`);

      const { data: audioPub } = supabase.storage.from('music-files').getPublicUrl(audioPath);
      const publicAudioUrl = audioPub.publicUrl;

      updateTrackLocal(creationId, trackId, {
        status: 'completed',
        currentStage: 'Completed',
        progress: 1,
        audioUrl: publicAudioUrl,
      });

      const { error: audioDbErr } = await supabase.from('tracks').update({
        audio_url: publicAudioUrl,
        status: 'completed',
        progress: 1,
        current_stage: 'Completed',
      }).eq('id', trackId);
      if (audioDbErr) console.error('[tracks] audio finalize', trackId, audioDbErr.message);

      // 7. Handle Video (uses stable HTTPS URL)
      if (runtimeInput.videoStyle) {
        runAsyncVideoRender(trackId, creationId, runtimeInput, trackTitle, publicAudioUrl, dna, []).catch(console.warn);
      }

      return 'completed';

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${trackId}] Browser Generation failed:`, errorMsg);

      await supabase.from('tracks').update({
        status: 'failed', current_stage: 'Failed', error_message: errorMsg,
        estimated_time_left: 0,
      }).eq('id', trackId);

      updateTrackLocal(creationId, trackId, {
        status: 'failed', currentStage: 'Failed', errorMessage: errorMsg, progress: 0,
      });

      delete trackLastUpdateRef.current[trackId];
      return 'failed';
    }
  };

  // ALBUM ORCHESTRATOR: sequential generation with retry + skip-on-failure
  const MAX_RETRIES = 3;

  const orchestrateAlbum = async (
    tracks: { id: string; title: string; trackNumber: number }[],
    creationId: string,
    getTrackInput: (index: number) => CreateMusicInput,
  ) => {
    const sortedTracks = [...tracks].sort((a, b) => a.trackNumber - b.trackNumber);

    // Mark all as waiting
    for (const track of sortedTracks) {
      updateTrackLocal(creationId, track.id, { status: 'pending', currentStage: 'Waiting to start', progress: 0 });
      await supabase.from('tracks').update({ status: 'pending', current_stage: 'Waiting to start', progress: 0 }).eq('id', track.id);
    }

    for (let i = 0; i < sortedTracks.length; i++) {
      const track = sortedTracks[i];
      const trackInput = getTrackInput(i);
      let result: 'completed' | 'failed' = 'failed';

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        console.log(`[Orchestrator] Track ${track.trackNumber} "${track.title}" — attempt ${attempt}/${MAX_RETRIES}`);

        // Reset track for retry
        if (attempt > 1) {
          updateTrackLocal(creationId, track.id, { status: 'analyzing', currentStage: `Retrying (attempt ${attempt})...`, progress: 0, errorMessage: undefined });
          await supabase.from('tracks').update({
            status: 'pending', progress: 0, error_message: null,
            current_stage: `Retrying (attempt ${attempt})`, estimated_time_left: 0,
          }).eq('id', track.id);
          // Small delay before retry
          await new Promise(r => setTimeout(r, 2000));
        }

        result = await generateTrackInBrowser(track.id, creationId, trackInput, track.title);

        if (result === 'completed') break;

        if (attempt < MAX_RETRIES) {
          toast.error(`Track "${track.title}" failed (attempt ${attempt}/${MAX_RETRIES}), retrying...`);
        }
      }

      if (result === 'failed') {
        toast.error(`Track "${track.title}" failed after ${MAX_RETRIES} attempts. Skipping to next track.`);
        // Continue with the next track — don't freeze the album
      }
    }

    // Derive final album status from track statuses
    const { data: finalTracks } = await supabase.from('tracks').select('status').eq('creation_id', creationId);
    const statuses = (finalTracks || []).map(t => t.status);
    const albumStatus = statuses.every(s => s === 'completed') ? 'completed'
      : statuses.some(s => s === 'failed') ? 'completed' // album is "done" even if some tracks failed
        : 'completed';

    await supabase.from('music_creations').update({ status: albumStatus, progress: 1 }).eq('id', creationId);
    toast.success('Album generation complete!');
  };

  const createMusic = async (input: CreateMusicInput): Promise<MusicCreation | null> => {
    if (!user?.id) { toast.error('Please sign in to create music'); return null; }

    setIsCreating(true);
    try {
      const isAlbumWithTracks = input.type === 'album' && input.albumTracks && input.albumTracks.length > 0;
      const requestedTrackCount = isAlbumWithTracks
        ? input.albumTracks!.length
        : (input.type === 'song' ? 1 : (input.numberOfTracks || 5));

      let resolvedTrackInputs: CreateMusicInput[] = [];

      if (isAlbumWithTracks) {
        resolvedTrackInputs = input.albumTracks!.map((trackConfig) => {
          const baseTrackInput = trackConfigToInput(trackConfig);
          const { intent } = buildGenerationIntent(toRawUserInput(baseTrackInput, 'single'));
          return toRuntimeInput(baseTrackInput, intent);
        });
      } else if (input.type === 'album') {
        const albumRaw = toRawUserInput(
          {
            ...input,
            type: 'song',
            songTitle: input.title || 'Untitled Album',
            title: input.title || 'Untitled Album',
          },
          'album',
          requestedTrackCount,
        );
        const { intent: baseAlbumIntent } = buildGenerationIntent(albumRaw);
        const albumPlan = buildAlbumPlan(baseAlbumIntent, requestedTrackCount);
        resolvedTrackInputs = albumPlan.map((plannedIntent, index) =>
          toRuntimeInput(
            {
              ...input,
              type: 'song',
              songTitle: `${input.title || 'Untitled Album'} - Track ${index + 1}`,
              title: `${input.title || 'Untitled Album'} - Track ${index + 1}`,
            },
            plannedIntent,
          ),
        );
      } else {
        const { intent } = buildGenerationIntent(toRawUserInput(input, 'single'));
        resolvedTrackInputs = [toRuntimeInput(input, intent)];
      }

      const creationSeedInput = resolvedTrackInputs[0] || input;
      const creationGenres = parseList(creationSeedInput.genre);
      const creationLanguages = parseList(creationSeedInput.vocalLanguage);

      // Insert creation record
      const { data: creationData, error: creationError } = await supabase
        .from('music_creations')
        .insert({
          user_id: user.id,
          type: input.type,
          title: input.title || input.songTitle || (input.type === 'song' ? 'Untitled Track' : 'Untitled Album'),
          music_prompt: creationSeedInput.songDescription || (input.type === 'album' ? 'Album' : ''),
          genres: creationGenres.length > 0 ? creationGenres : ['Pop'],
          duration_seconds: creationSeedInput.duration || 120,
          generate_video: resolvedTrackInputs.some((trackInput) => !!trackInput.videoStyle),
          vocal_languages: creationLanguages.length > 0 ? creationLanguages : ['English'],
          lyrics: creationSeedInput.lyricsText || null,
          artist_inspiration: creationSeedInput.artistInspiration || null,
          video_style: creationSeedInput.videoStyle || null,
          status: 'pending',
        })
        .select()
        .single();

      if (creationError) { toast.error('Failed to create music.'); return null; }

      // Build per-track data
      const numberOfTracks = resolvedTrackInputs.length;

      const tracksToCreate = Array.from({ length: numberOfTracks }, (_, i) => {
        const resolvedInput = resolvedTrackInputs[i];
        return {
          creation_id: creationData.id,
          title: resolvedInput?.songTitle || resolvedInput?.title || `Track ${i + 1}`,
          track_number: i + 1,
          duration_seconds: resolvedInput?.duration || 120,
          status: 'pending',
        };
      });

      const { data: tracksData, error: tracksError } = await supabase
        .from('tracks')
        .insert(tracksToCreate)
        .select();

      if (tracksError) { toast.error('Failed to create tracks.'); return null; }

      const newCreation: MusicCreation = {
        id: creationData.id,
        userId: creationData.user_id,
        type: creationData.type as 'song' | 'album',
        title: creationData.title,
        songDescription: creationData.music_prompt,
        genre: Array.isArray(creationData.genres) ? creationData.genres[0] : (creationData.genres || 'Pop'),
        status: 'pending',
        duration: creationData.duration_seconds,
        visualizerEnabled: creationData.generate_video,
        vocalLanguage: Array.isArray(creationData.vocal_languages) ? creationData.vocal_languages[0] : (creationData.vocal_languages || 'English'),
        lyricsText: creationData.lyrics || undefined,
        artistInspiration: creationData.artist_inspiration || undefined,
        videoStyle: creationData.video_style || undefined,
        createdAt: new Date(creationData.created_at),
        progress: 0,
        tracks: (tracksData || []).map(track => ({
          id: track.id,
          title: track.title,
          duration: track.duration_seconds,
          status: track.status,
          trackNumber: track.track_number,
          createdAt: new Date(track.created_at),
          progress: 0,
          totalSegments: 1,
          completedSegments: 0,
          lastUpdatedAt: Date.now(),
        })),
      };

      setCreations(prev => [newCreation, ...prev]);
      setCurrentCreation(newCreation);
      toast.success(`${input.type === 'album' ? 'Album' : 'Music'} creation started!`);

      // Build track input resolver
      const getTrackInput = (index: number): CreateMusicInput => {
        return resolvedTrackInputs[index] || input;
      };

      // Launch orchestrator (fire-and-forget, non-blocking)
      if (numberOfTracks === 1) {
        // Single song: direct generation
        generateTrackInBrowser(newCreation.tracks[0].id, newCreation.id, getTrackInput(0), newCreation.tracks[0].title)
          .catch(console.error);
      } else {
        // Album: use orchestrator with retry logic
        orchestrateAlbum(
          newCreation.tracks.map(t => ({ id: t.id, title: t.title, trackNumber: t.trackNumber })),
          newCreation.id,
          getTrackInput,
        );
      }

      return newCreation;
    } catch (error) {
      console.error('Error in createMusic:', error);
      toast.error('An error occurred. Please try again.');
      return null;
    } finally {
      setIsCreating(false);
    }
  };

  // Session suggestion history
  const suggestionHistoryRef = useRef<Record<string, string[]>>({});

  const normalizeField = (field: string) => (field === 'genres' ? 'genre' : field);

  const sanitizeSuggestion = (input: unknown): string | null => {
    if (input === undefined || input === null) return null;
    const text = String(input).trim();
    if (!text) return null;
    if (text.toLowerCase().includes('target field:')) return null;
    return text;
  };

  const normalizeToken = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim();

  const pickNovelCandidate = (
    candidates: string[],
    currentValue: string,
    history: string[],
    globalHistory: string[],
  ): string => {
    const pool = Array.from(new Set(
      candidates
        .map((item) => sanitizeSuggestion(item))
        .filter((item): item is string => !!item),
    ));
    if (pool.length === 0) return currentValue;

    // Shuffle pool to ensure unique random suggestion every time
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const seen = new Set<string>([
      normalizeToken(currentValue),
      ...history.map(normalizeToken),
      ...globalHistory.map((entry) => normalizeToken(entry.split(':').slice(1).join(':') || entry)),
    ]);

    const fresh = pool.find((item) => !seen.has(normalizeToken(item)));
    if (fresh) return fresh;
    // Pool exhausted vs. history. Salt with a fresh nonce so the fallback
    // varies between rapid clicks instead of always returning pool[0].
    const nonce = nextGenerationNonce('pick');
    const idx = nonce.split('').reduce((a, c) => (a + c.charCodeAt(0)) >>> 0, 0) % pool.length;
    return pool[idx];
  };

  const formatSuggestionForField = (field: string, value: string): string => {
    if (field === 'lyrics') {
      return value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n');
    }
    return value.replace(/\s+/g, ' ').trim();
  };

  const toSuggestionContext = (context: Record<string, any>) => {
    const genres = parseList(context.genre);
    const primaryGenre = genres[0] || 'pop';
    const secondary = genres.slice(1);
    const moodLabel = String(context.mood || 'happy');
    const mood = moodToVector(moodLabel);
    const artistList = parseList(context.artistInspiration);
    const languages = parseList(context.vocalLanguage);
    const effects = Array.isArray(context.vocalEffects) && context.vocalEffects.length > 0
      ? context.vocalEffects
      : parseList(context.vocalEffects);

    return {
      genres: genres.length > 0 ? genres.map((g) => g.toLowerCase()) : ['pop'],
      genre_profile: {
        primary: primaryGenre.toLowerCase(),
        secondary: secondary.map((g) => g.toLowerCase()),
        instrumentation: [],
        rhythm_pattern: '',
      },
      mood,
      tempo_bpm: Number(context.tempo || 120),
      music_prompt: String(context.songDescription || ''),
      artist_inspiration: artistList.length > 0 ? artistList : ['MuseVibe Reference'],
      lyric_theme: String(context.lyricsTheme || ''),
      vocal_style: String(context.vocalStyle || ''),
      video_style: context.videoStyle ? String(context.videoStyle) : null,
      vocal_language: languages.length > 0 ? languages : ['English'],
      vocal_effects: effects,
      duration_seconds: Number(context.duration || 180),
    };
  };

  const buildStructuredSuggestion = (
    suggestionText: string,
    suggestionContext: ReturnType<typeof toSuggestionContext>,
    context: Record<string, any>,
  ): StructuredPromptSuggestion => ({
    genre: suggestionContext.genres.map((g) => g[0].toUpperCase() + g.slice(1)),
    mood: suggestMood(suggestionContext),
    energy: String(Math.max(1, Math.min(10, Math.round(suggestionContext.mood.arousal)))),
    tempo: String(suggestTempo(suggestionContext)),
    artist_inspiration: parseList(context.artistInspiration).join(', ') || 'MuseVibe Reference',
    lyrics: String(context.lyricsText || ''),
    description: suggestionText,
    prompt: suggestionText,
    subgenre: parseList(context.subgenre),
    lyricTheme: String(context.lyricsTheme || `${suggestMood(suggestionContext)} ${suggestionContext.genre_profile.primary} narrative`),
  });

  const aiSuggest = async (
    field: string, 
    value: string, 
    context?: Record<string, any>, 
    action: AiAction = 'suggest'
  ): Promise<AiSuggestionResult | null> => {
    const effectiveContext = context || formState;
    
    // 1. Cancel previous request for THIS field
    if (abortControllersRef.current[field]) {
      abortControllersRef.current[field].abort();
    }
    const controller = new AbortController();
    abortControllersRef.current[field] = controller;

    // 2. Generate unique Request ID
    const requestId = crypto.randomUUID();
    const loadingKey = `${field}-${action}`;
    
    setSuggestionState(prev => ({
      ...prev,
      loading: { ...prev.loading, [loadingKey]: true },
      lastRequestId: { ...prev.lastRequestId, [field]: requestId }
    }));

    try {
      const normalizedField = normalizeField(field);
      const history = suggestionHistoryRef.current[normalizedField] || [];
      const globalHistory = suggestionHistoryRef.current.__global__ || [];

      const suggestionContext = toSuggestionContext({
        ...effectiveContext,
        __history: history,
        __global: globalHistory,
      });

      const currentValue = sanitizeSuggestion(value) || '';
      const baseGenre = suggestionContext.genre_profile.primary;
      const inferredMood = suggestMood(suggestionContext);
      const inferredTempo = suggestTempo(suggestionContext);
      const inferredPrompt = suggestMusicPrompt(suggestionContext);

      let suggestionValue: string | null = null;
      const titleCase = (token: string) => token ? `${token[0].toUpperCase()}${token.slice(1)}` : token;
      const unique = (items: string[]) => [...new Set(items.map((item) => item.trim()).filter(Boolean))];
      const genreArtistMap: Record<string, string[]> = {
        'hip-hop': ['Kendrick Lamar', 'Drake', 'J Dilla'],
        trap: ['Travis Scott', 'Future', 'Metro Boomin'],
        pop: ['Taylor Swift', 'Bruno Mars', 'Billie Eilish'],
        rnb: ['The Weeknd', 'Frank Ocean', 'Beyonce'],
        rock: ['Radiohead', 'Led Zeppelin', 'Pink Floyd'],
        metal: ['Metallica', 'Slipknot', 'Bring Me The Horizon'],
        jazz: ['Miles Davis', 'John Coltrane', 'Herbie Hancock'],
        classical: ['Hans Zimmer', 'John Williams', 'Beethoven'],
        edm: ['Daft Punk', 'Calvin Harris', 'Swedish House Mafia'],
        house: ['Daft Punk', 'Disclosure', 'KAYTRANADA'],
        ambient: ['Brian Eno', 'Aphex Twin', 'Nils Frahm'],
        folk: ['Bon Iver', 'Johnny Cash', 'Bob Dylan'],
      };
      const genreSubgenreMap: Record<string, string[]> = {
        'hip-hop': ['boom bap', 'trap soul', 'lo-fi rap'],
        trap: ['melodic trap', 'drill', 'dark trap'],
        pop: ['dance-pop', 'synth-pop', 'electro-pop'],
        rnb: ['neo-soul', 'alt-rnb', 'trap soul'],
        rock: ['alt rock', 'indie rock', 'arena rock'],
        metal: ['metalcore', 'thrash metal', 'industrial metal'],
        jazz: ['lo-fi jazz', 'nu jazz', 'cool jazz'],
        classical: ['orchestral', 'neo-classical', 'cinematic classical'],
        edm: ['future bass', 'progressive house', 'melodic techno'],
        house: ['deep house', 'tech house', 'progressive house'],
        ambient: ['drone', 'cinematic ambient', 'dark ambient'],
        folk: ['indie folk', 'acoustic folk', 'folk-pop'],
      };
      const genreEffectsMap: Record<string, string[]> = {
        'hip-hop': ['delay', 'plate reverb', 'light autotune'],
        trap: ['autotune', 'delay', 'stereo doubler'],
        pop: ['bright reverb', 'stereo doubler', 'gentle compression'],
        rnb: ['lush reverb', 'slap delay', 'subtle autotune'],
        rock: ['short room reverb', 'saturation', 'parallel compression'],
        metal: ['saturation', 'short slap delay', 'tight gate'],
        jazz: ['plate reverb', 'tape delay', 'light saturation'],
        classical: ['concert hall reverb', 'early reflections', 'stereo room'],
        edm: ['sidechain ducking', 'delay throws', 'reverb tails'],
        house: ['sidechain ducking', 'delay', 'tight reverb'],
        ambient: ['long shimmer reverb', 'ping-pong delay', 'chorus'],
        folk: ['room reverb', 'tape slap', 'subtle chorus'],
      };
      const moodTrackNames: Record<string, string[]> = {
        dark: ['Neon Shadows', 'Midnight Static', 'Afterlight'],
        melancholic: ['Fading Polaroids', 'Quiet Rain', 'Last Letter'],
        euphoric: ['Skyline Pulse', 'Golden Rush', 'Infinite Lift'],
        epic: ['Iron Horizon', 'Final Ascent', 'Empire of Light'],
        happy: ['Sunset Run', 'Wildflowers', 'City Smiles'],
        romantic: ['Velvet Orbit', 'Slow Sparks', 'Moonlit Hearts'],
        angry: ['Redline', 'Break the Silence', 'No Retreat'],
        chill: ['Soft Frequency', 'Low Tide', 'Night Drive'],
        tense: ['Pressure Point', 'Cracked Signals', 'Edge of Dawn'],
        sad: ['Empty Station', 'Cold Echoes', 'Without You'],
      };
      const genreCompanionMap: Record<string, string[]> = {
        pop: ['R&B', 'Dance', 'Synthpop'],
        'hip-hop': ['Trap', 'R&B', 'Boom Bap'],
        trap: ['Drill', 'Hip-Hop', 'Dark Trap'],
        edm: ['House', 'Future Bass', 'Melodic Techno'],
        house: ['Deep House', 'Nu Disco', 'EDM'],
        rock: ['Alternative Rock', 'Indie Rock', 'Pop Rock'],
        metal: ['Metalcore', 'Industrial Metal', 'Hard Rock'],
        jazz: ['Nu Jazz', 'Lo-fi Jazz', 'Soul Jazz'],
        classical: ['Orchestral', 'Cinematic', 'Neo-Classical'],
        ambient: ['Downtempo', 'Cinematic Ambient', 'Chillout'],
        folk: ['Indie Folk', 'Acoustic', 'Americana'],
        rnb: ['Soul', 'Alt-R&B', 'Pop'],
      };
      const lyricThemeMap: Record<string, string[]> = {
        dark: ['neon loneliness and midnight escape', 'city shadows and hidden truths', 'obsession, risk, and aftermath'],
        melancholic: ['healing after loss', 'nostalgia for a fading summer', 'letters never sent'],
        euphoric: ['breaking free into open skies', 'dancefloor catharsis at sunrise', 'friends, freedom, and momentum'],
        epic: ['rising against impossible odds', 'legacy, sacrifice, and victory', 'a final stand before dawn'],
        happy: ['everyday joy in small moments', 'carefree roadtrip memories', 'new beginnings and bold optimism'],
        romantic: ['late-night confession under city lights', 'gravity between two strangers', 'fragile love after distance'],
        angry: ['turning pain into power', 'refusing control and expectation', 'burning bridges to rebuild stronger'],
        chill: ['slow mornings and gentle confidence', 'coastal night drive reflections', 'quiet peace after chaos'],
        tense: ['countdown before impact', 'secrets unraveling in real time', 'adrenaline through uncertainty'],
        sad: ['empty rooms and echoes', 'goodbye without closure', 'holding on while letting go'],
      };
      const genreDurationMap: Record<string, number[]> = {
        pop: [165, 185, 205],
        'hip-hop': [150, 180, 210],
        trap: [150, 175, 200],
        edm: [180, 210, 240],
        house: [180, 210, 240],
        rock: [190, 220, 250],
        metal: [210, 240, 270],
        ambient: [240, 300, 360],
        classical: [240, 300, 420],
        jazz: [210, 260, 320],
        folk: [180, 210, 240],
        rnb: [170, 200, 230],
      };
      const albumNameTemplates = [
        `${titleCase(inferredMood)} ${titleCase(baseGenre)} Sessions`,
        `${titleCase(inferredMood)} Horizons`,
        `${titleCase(baseGenre)} After Hours`,
        `${titleCase(inferredMood)} Reverie`,
      ];
      const moodOptionsByGenre: Record<string, string[]> = {
        pop: ['happy', 'romantic', 'euphoric', 'melancholic'],
        'hip-hop': ['dark', 'tense', 'angry', 'euphoric'],
        trap: ['dark', 'tense', 'angry', 'euphoric'],
        edm: ['euphoric', 'epic', 'happy', 'tense'],
        house: ['euphoric', 'chill', 'happy', 'romantic'],
        rock: ['epic', 'tense', 'melancholic', 'angry'],
        metal: ['angry', 'dark', 'epic', 'tense'],
        jazz: ['chill', 'romantic', 'melancholic', 'happy'],
        classical: ['epic', 'romantic', 'melancholic', 'happy'],
        ambient: ['chill', 'dark', 'melancholic', 'romantic'],
        folk: ['melancholic', 'romantic', 'happy', 'chill'],
        rnb: ['romantic', 'melancholic', 'dark', 'chill'],
      };

      switch (normalizedField) {
        case 'prompt':
        case 'albumVibe':
          suggestionValue = action === 'enhance'
            ? enhanceField('music_prompt', currentValue || inferredPrompt, suggestionContext)
            : action === 'new'
              ? pickNovelCandidate(
                [
                  newAlternativeField('music_prompt', currentValue || inferredPrompt, suggestionContext),
                  `${inferredPrompt} Prioritize dynamic contrast, cleaner hooks, and a distinctive sonic identity.`,
                  `${inferredPrompt} Emphasize cinematic transitions, stronger motif recall, and polished arrangement pacing.`,
                ],
                currentValue,
                history,
                globalHistory,
              )
              : inferredPrompt;
          break;
        case 'mood':
          suggestionValue = action === 'new'
            ? pickNovelCandidate(
              [
                newAlternativeField('mood', currentValue || inferredMood, suggestionContext),
                ...(moodOptionsByGenre[baseGenre] ?? ['euphoric', 'melancholic', 'dark', 'chill']),
                'euphoric',
                'melancholic',
                'dark',
                'chill',
                'tense',
                'romantic',
              ],
              currentValue || inferredMood,
              history,
              globalHistory,
            )
            : inferredMood;
          break;
        case 'tempo':
          suggestionValue = action === 'new'
            ? String(Math.max(60, Math.min(200, inferredTempo + (inferredTempo >= 125 ? -8 : 8))))
            : String(inferredTempo);
          break;
        case 'structureType':
          suggestionValue = action === 'new'
            ? pickNovelCandidate(
              [
                newAlternativeField('song_structure', currentValue || suggestSongStructure(suggestionContext), suggestionContext),
                'Intro-Verse-Pre-Chorus-Chorus-Verse-Chorus-Bridge-Chorus-Outro',
                'Intro-Build-Drop-Verse-Build-Drop-Break-Outro',
                'Intro-Theme-Variation-Climax-Coda',
              ],
              currentValue,
              history,
              globalHistory,
            )
            : suggestSongStructure(suggestionContext);
          break;
        case 'vocalStyle':
          suggestionValue = action === 'enhance'
            ? enhanceField('vocal_style', currentValue || suggestVocalStyle(suggestionContext), suggestionContext)
            : action === 'new'
              ? pickNovelCandidate(
                [
                  newAlternativeField('vocal_style', currentValue || suggestVocalStyle(suggestionContext), suggestionContext),
                  'intimate, close-mic phrasing with emotional restraint',
                  'dynamic mixed-voice delivery with rhythmic accents',
                  'airy falsetto layers with clean lead articulation',
                ],
                currentValue,
                history,
                globalHistory,
              )
              : suggestVocalStyle(suggestionContext);
          break;
        case 'videoStyle':
          suggestionValue = action === 'new'
            ? pickNovelCandidate(
              [
                suggestVideoStyle(suggestionContext),
                'cinematic wide-angle storytelling with atmospheric color wash',
                'stylized handheld realism with grain texture and punchy cuts',
                'abstract geometric motion synced to rhythmic accents',
              ],
              currentValue,
              history,
              globalHistory,
            )
            : suggestVideoStyle(suggestionContext);
          break;
        case 'genre':
          suggestionValue = pickNovelCandidate(
            [
              unique([
                ...suggestionContext.genres,
                ...(genreCompanionMap[baseGenre] ?? []),
              ]).slice(0, 3).map(titleCase).join(', '),
              unique([titleCase(baseGenre), ...(genreCompanionMap[baseGenre] ?? [])]).slice(0, 3).join(', '),
            ],
            currentValue,
            history,
            globalHistory,
          ) || titleCase(baseGenre);
          break;
        case 'subgenre':
          suggestionValue = pickNovelCandidate(
            [
              unique(genreSubgenreMap[baseGenre] ?? [`${baseGenre} fusion`, 'melodic', 'cinematic'])
                .slice(0, 3)
                .join(', '),
              unique([`${baseGenre} fusion`, 'cinematic', `${inferredMood} wave`]).slice(0, 3).join(', '),
            ],
            currentValue,
            history,
            globalHistory,
          );
          break;
        case 'lyricsTheme':
          suggestionValue = action === 'enhance'
            ? enhanceField('lyric_theme', currentValue || `${inferredMood} ${baseGenre} story`, suggestionContext)
            : pickNovelCandidate(
              [
                currentValue || `${inferredMood} ${baseGenre} storytelling`,
                ...(lyricThemeMap[inferredMood] ?? []),
              ],
              currentValue,
              history,
              globalHistory,
            );
          break;
        case 'lyrics':
          suggestionValue = action === 'new'
            ? pickNovelCandidate(
              [
                `City lights fade while we run from yesterday.\nEvery scar is a map to where we are today.\nHold me through the noise until the dawn arrives.\nTurn this ache to fire and bring us back to life.`,
                `Static in the skyline, thunder in my chest.\nI learned to dance with fear and still call this progress.\nIf the night keeps pulling, I will pull back too.\nMake a home in the chaos till the morning cuts through.`,
                `We were shadows on the overpass, names lost in rain.\nYou said every wound can bloom if we stay through pain.\nWhen the sirens fade, keep your heartbeat close to mine.\nWe'll turn broken neon into something that can shine.`,
              ],
              currentValue,
              history,
              globalHistory,
            )
            : currentValue || `City lights fade while we run from yesterday.\nEvery scar is a map to where we are today.\nHold me through the noise until the dawn arrives.\nTurn this ache to fire and bring us back to life.`;
          break;
        case 'artistInspiration':
          suggestionValue = pickNovelCandidate(
            [
              unique([
                ...parseList(effectiveContext.artistInspiration),
                ...(genreArtistMap[baseGenre] ?? ['The Weeknd', 'Kendrick Lamar', 'Hans Zimmer']),
              ]).slice(0, 3).join(', '),
              unique([...(genreArtistMap[baseGenre] ?? []), 'Tame Impala', 'Rosalia']).slice(0, 3).join(', '),
            ],
            currentValue,
            history,
            globalHistory,
          );
          break;
        case 'vocalLanguage':
          suggestionValue = pickNovelCandidate(
            [
              unique([
                ...parseList(effectiveContext.vocalLanguage),
                'English',
                'Hindi',
                'Spanish',
              ]).slice(0, 3).join(', '),
              unique(['English', 'Hindi', 'Punjabi']).slice(0, 3).join(', '),
              unique(['English', 'Spanish', 'French']).slice(0, 3).join(', '),
            ],
            currentValue,
            history,
            globalHistory,
          );
          break;
        case 'vocalIntensity':
          suggestionValue = action === 'new'
            ? String(Math.max(1, Math.min(10, Math.round(suggestionContext.mood.arousal + (suggestionContext.mood.arousal >= 6 ? -2 : 2)))))
            : String(Math.max(1, Math.min(10, Math.round(suggestionContext.mood.arousal))));
          break;
        case 'vocalEffects':
          suggestionValue = pickNovelCandidate(
            [
              unique([
                ...parseList(effectiveContext.vocalEffects),
                ...(genreEffectsMap[baseGenre] ?? ['reverb', 'delay', 'compression']),
              ]).slice(0, 3).join(', '),
              unique([...(genreEffectsMap[baseGenre] ?? []), 'parallel compression', 'micro pitch']).slice(0, 3).join(', '),
            ],
            currentValue,
            history,
            globalHistory,
          );
          break;
        case 'vocalArrangement':
          suggestionValue = pickNovelCandidate(
            [
              baseGenre === 'classical'
                ? 'choir'
                : baseGenre === 'edm' || baseGenre === 'ambient'
                  ? 'solo'
                  : baseGenre === 'rnb'
                    ? 'duet'
                    : 'solo',
              'duet',
              'solo',
              'choir',
            ],
            currentValue,
            history,
            globalHistory,
          );
          break;
        case 'energyLevel':
          suggestionValue = action === 'new'
            ? String(Math.max(1, Math.min(10, Math.round(suggestionContext.mood.arousal + (suggestionContext.mood.arousal >= 6 ? -2 : 2)))))
            : String(Math.max(1, Math.min(10, Math.round(suggestionContext.mood.arousal))));
          break;
        case 'instruments':
          suggestionValue = pickNovelCandidate(
            [
              unique([
                ...parseList(effectiveContext.instruments),
                ...(baseGenre === 'rock' ? ['electric guitar', 'bass', 'drums'] : []),
                ...(baseGenre === 'pop' ? ['synth', 'drum machine', 'acoustic guitar'] : []),
                ...(baseGenre === 'classical' ? ['strings', 'piano'] : []),
              ]).slice(0, 3).join(', '),
              unique(['piano', 'strings', 'synthesizer']).slice(0, 3).join(', '),
            ],
            currentValue,
            history,
            globalHistory,
          );
          break;
        case 'duration':
          suggestionValue = action === 'new'
            ? pickNovelCandidate(
              (genreDurationMap[baseGenre] ?? [160, 180, 220]).map((seconds) => String(seconds)),
              currentValue || String(effectiveContext.duration || 180),
              history,
              globalHistory,
            )
            : String(Math.max(30, Math.min(600, Math.round(Number(effectiveContext.duration || 180)))));
          break;
        case 'trackName':
          suggestionValue = pickNovelCandidate(
            moodTrackNames[inferredMood.toLowerCase()] ?? [`${titleCase(inferredMood)} ${titleCase(baseGenre)}`],
            currentValue,
            history,
            globalHistory,
          ).trim();
          break;
        case 'albumName':
          suggestionValue = pickNovelCandidate(
            albumNameTemplates,
            currentValue,
            history,
            globalHistory,
          );
          break;
        default:
          suggestionValue = currentValue || inferredPrompt;
      }

      suggestionValue = sanitizeSuggestion(suggestionValue);
      if (suggestionValue) suggestionValue = formatSuggestionForField(normalizedField, suggestionValue);
      if (!suggestionValue) throw new Error('No suggestions returned');

      suggestionHistoryRef.current[normalizedField] = [
        ...(suggestionHistoryRef.current[normalizedField] || []).slice(-5),
        suggestionValue,
      ];
      suggestionHistoryRef.current.__global__ = [
        ...(suggestionHistoryRef.current.__global__ || []).slice(-20),
        `${normalizedField}:${suggestionValue}`,
      ];

      setSuggestionState(prev => {
        if (prev.lastRequestId[field] !== requestId) return prev;
        const loadingKey = `${field}-${action}`;
        const newLoading = { ...prev.loading };
        delete newLoading[loadingKey];
        return {
          ...prev,
          loading: newLoading,
          results: { 
            ...prev.results,
            [field]: {
              field: normalizedField,
              action,
              suggestion: suggestionValue,
              structured: normalizedField === 'prompt'
                ? buildStructuredSuggestion(suggestionValue, suggestionContext, effectiveContext)
                : null,
            }
          }
        };
      });

      return {
        field: normalizedField,
        action,
        suggestion: suggestionValue,
        structured: normalizedField === 'prompt'
          ? buildStructuredSuggestion(suggestionValue, suggestionContext, effectiveContext)
          : null,
      };

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const rawMessage = String(err?.message || '');
        const isProviderIssue =
          rawMessage.toLowerCase().includes('timeout') ||
          rawMessage.toLowerCase().includes('invalid api key') ||
          rawMessage.toLowerCase().includes('providerid') ||
          rawMessage.toLowerCase().includes('modelid');
        toast.error(isProviderIssue ? 'AI suggestion is temporarily unavailable. Please try again.' : (err.message || 'Failed to get AI suggestion'));
      }
      setSuggestionState(prev => {
        const loadingKey = `${field}-${action}`;
        const newLoading = { ...prev.loading };
        delete newLoading[loadingKey];
        return { ...prev, loading: newLoading };
      });
      return null;
    }
  };

  const refreshCreations = async () => { await fetchCreations(); };

  const retryTrack = async (trackId: string, creationId: string) => {
    const creation = creations.find(c => c.id === creationId);
    if (!creation) { toast.error('Creation not found'); return; }

    await supabase.from('tracks').update({
      status: 'pending', progress: 0, error_message: null,
      completed_segments: 0, current_stage: 'pending', estimated_time_left: 0,
    }).eq('id', trackId);

    const updateTrack = (t: Track): Track =>
      t.id === trackId ? { ...t, status: 'pending', progress: 0, errorMessage: undefined, completedSegments: 0, currentStage: 'pending', estimatedTimeLeft: 0, lastUpdatedAt: Date.now() } : t;
    setCreations(prev => prev.map(c => c.id === creationId ? { ...c, tracks: c.tracks.map(updateTrack) } : c));

    toast.success('Retrying track generation...');

    const input: CreateMusicInput = {
      type: creation.type,
      title: creation.title,
      songDescription: creation.songDescription,
      genre: creation.genre,
      duration: creation.duration,
      visualizerEnabled: creation.visualizerEnabled,
      vocalLanguage: creation.vocalLanguage,
      lyricsText: creation.lyricsText,
      artistInspiration: creation.artistInspiration,
      videoStyle: creation.videoStyle,
    };

    const track = creation.tracks.find(t => t.id === trackId);
    generateTrackInBrowser(trackId, creationId, input, track?.title || 'Track');
  };

  return (
    <MusicContext.Provider value={{
      creations,
      currentCreation,
      isLoading,
      isCreating,
      formState,
      updateFormState,
      createMusic,
      setCurrentCreation,
      refreshCreations: fetchCreations,
      retryTrack,
      aiSuggest,
      suggestionState,
    }}>
      {children}
    </MusicContext.Provider>
  );
};

export const useMusic = () => {
  const context = useContext(MusicContext);
  if (context === undefined) {
    throw new Error('useMusic must be used within a MusicProvider');
  }
  return context;
};
