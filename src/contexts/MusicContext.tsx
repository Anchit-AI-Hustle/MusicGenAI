import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import {
  midiToFreq, getScaleMidi, parseKey,
  masterAudio, INTERNAL_SAMPLE_RATE,
} from '@/lib/audio-utils';
import { generateTrack, type AudioStems, type GenerateTrackResult, MusicIntent, createRng, createGenerationDNA, getGenerationSeedNumber, mixStems, type GenerationDNA } from '@/lib/music-engine';
import { generateVideoFromAudio } from '@/lib/video-generator';
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
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const channel = supabase
      .channel('music-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tracks' }, (payload) => {
        const updated = payload.new as any;
        const mapTrack = (t: Track): Track =>
          t.id === updated.id
            ? {
              ...t,
              status: updated.status,
              audioUrl: updated.audio_url || undefined,
              videoUrl: updated.video_url || undefined,
              progress: updated.progress ?? 0,
              totalSegments: updated.total_segments ?? 1,
              completedSegments: updated.completed_segments ?? 0,
              errorMessage: updated.error_message || undefined,
              duration: updated.duration_seconds,
              currentStage: updated.current_stage || undefined,
              estimatedTimeLeft: updated.estimated_time_left ?? 0,
            }
            : t;

        setCreations(prev => prev.map(c => {
          const tracks = c.tracks.map(mapTrack);
          const { derivedStatus, derivedProgress } = deriveCreationState(tracks);
          return { ...c, tracks, status: derivedStatus, progress: derivedProgress };
        }));

        setCurrentCreation(prev => {
          if (!prev) return prev;
          const tracks = prev.tracks.map(mapTrack);
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
    const mapTrack = (t: Track): Track => t.id === trackId ? { ...t, ...updates } : t;
    setCreations(prev => prev.map(c => {
      if (c.id !== creationId) return c;
      const tracks = c.tracks.map(mapTrack);
      const { derivedStatus, derivedProgress } = deriveCreationState(tracks);
      return { ...c, tracks, status: derivedStatus, progress: derivedProgress };
    }));
    setCurrentCreation(prev => {
      if (prev?.id !== creationId) return prev;
      const tracks = prev.tracks.map(mapTrack);
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
    await supabase.from('tracks').update({
      current_stage: stage, progress, status,
    }).eq('id', trackId);
    // Don't update creation status directly - derive from tracks
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
      const videoBlob = await generateVideoFromAudio(
        audioUrl,
        input.duration || 120,
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
          updateTrackDB(trackId, creationId, stageLabel, 0.84 + p.progress * 0.12, p.stage).catch(console.warn);
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
      );

      updateTrackLocal(creationId, trackId, { status: 'finalizing', currentStage: 'Uploading video', progress: 0.97, audioUrl });
      await updateTrackDB(trackId, creationId, 'Uploading video', 0.97, 'finalizing');

      const isMp4Video = videoBlob.type.includes('mp4');
      const videoExt = isMp4Video ? 'mp4' : 'webm';
      const videoContentType = isMp4Video ? 'video/mp4' : 'video/webm';
      const videoPath = `tracks/${trackId}/video.${videoExt}`;
      const { error: vidUploadError } = await supabase.storage
        .from('music-files')
        .upload(videoPath, videoBlob, { contentType: videoContentType, upsert: true });

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

  const parseList = (value: string | undefined): string[] =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

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
      vocal_arrangement: input.vocalsEnabled === false ? 'none' : 'solo',
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
      const intent: MusicIntent = toMusicIntent(generationIntent, dna, runtimeInput.musicalKey || 'C');

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

      // 6. Final URL Generation
      const localAudioUrl = URL.createObjectURL(mastered.blob);

      updateTrackLocal(creationId, trackId, { 
        status: 'completed', 
        currentStage: 'Completed', 
        progress: 1, 
        audioUrl: localAudioUrl 
      });
      
      await supabase.from('tracks').update({ 
        audio_url: localAudioUrl, 
        status: 'completed', 
        progress: 1, 
        current_stage: 'Completed' 
      }).eq('id', trackId);

      // 7. Handle Video 
      if (runtimeInput.videoStyle) {
        runAsyncVideoRender(trackId, creationId, runtimeInput, trackTitle, localAudioUrl, dna, []).catch(console.warn);
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
  const suggestionGenreFamilyHistoryRef = useRef<string[]>([]);

  const GENRE_FAMILIES = [
    'Electronic / Dance', 'Rock / Alternative', 'Hip-Hop / Rap', 'Pop',
    'Jazz / Blues', 'Classical / Orchestral', 'World',
    'Ambient / Lo-fi', 'Reggae', 'Latin', 'Indian', 'Experimental'
  ];

  const normalizeField = (field: string) => (field === 'genres' ? 'genre' : field);

  const sanitizeSuggestion = (input: unknown): string | null => {
    if (input === undefined || input === null) return null;
    const text = String(input).trim();
    if (!text) return null;
    if (text.toLowerCase().includes('target field:')) return null;
    return text;
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

  const buildFieldSuggestion = (
    field: string,
    value: string,
    context: Record<string, any>,
    rawInference: any,
    action: AiAction
  ): string | null => {
    const normalizedField = normalizeField(field);
    const c = context || {};
    const inferred = rawInference || {};

    const inferredGenre = sanitizeSuggestion(inferred.genre) || sanitizeSuggestion(c.genre) || 'Pop';
    const inferredMood = sanitizeSuggestion(inferred.mood) || sanitizeSuggestion(c.mood) || 'Energetic';
    const inferredArtist = sanitizeSuggestion(inferred.artist_inspiration) || sanitizeSuggestion(inferred.artist) || sanitizeSuggestion(c.artistInspiration);
    const inferredLanguage = sanitizeSuggestion(inferred.language) || sanitizeSuggestion(inferred.vocalLanguage) || sanitizeSuggestion(c.vocalLanguage) || 'English';
    const inferredTempo = Number(inferred.tempo || c.tempo || 120);
    const tempo = Number.isFinite(inferredTempo) ? Math.max(60, Math.min(200, Math.round(inferredTempo))) : 120;
    const desc = sanitizeSuggestion(c.songDescription) || sanitizeSuggestion(inferred.description) || 'music concept';

    switch (normalizedField) {
      case 'trackName':
        if (action === 'enhance' && sanitizeSuggestion(value)) return `${sanitizeSuggestion(value)} (${inferredMood})`;
        return `${inferredMood} ${inferredGenre} Vibe`;
      case 'albumName':
        return sanitizeSuggestion(value) && action === 'enhance'
          ? `${sanitizeSuggestion(value)}: ${inferredMood} Collection`
          : `${inferredMood} ${inferredGenre} Sessions`;
      case 'albumVibe':
      case 'prompt':
        return `${inferredMood} ${inferredGenre} track around ${tempo} BPM with ${inferredLanguage} vocals, ${inferredArtist || 'modern production touches'}, and a ${sanitizeSuggestion(c.videoStyle) || 'cinematic'} atmosphere inspired by "${desc}".`;
      case 'genre':
        return inferredGenre;
      case 'subgenre':
        return sanitizeSuggestion(inferred.subgenre) || `${inferredGenre} Fusion`;
      case 'tempo':
        return String(tempo);
      case 'duration': {
        const base = Number(c.duration || 180);
        const next = action === 'enhance' ? Math.min(300, Math.max(90, base + 20)) : Math.max(90, Math.min(300, base));
        return String(Math.round(next));
      }
      case 'mood':
        return inferredMood;
      case 'structureType':
        return sanitizeSuggestion(c.structureType) || (tempo > 130 ? 'Intro → Build → Drop → Breakdown → Drop → Outro' : 'Verse-Chorus-Bridge');
      case 'vocalStyle':
        return sanitizeSuggestion(c.vocalStyle) || (sanitizeSuggestion(inferredGenre)?.toLowerCase().includes('rap') ? 'Rap Vocal' : 'Pop Singing');
      case 'vocalIntensity': {
        const base = Number(c.vocalIntensity || 5);
        const next = inferredMood.toLowerCase().includes('aggressive') || inferredMood.toLowerCase().includes('energetic')
          ? Math.max(base, 7)
          : inferredMood.toLowerCase().includes('chill') || inferredMood.toLowerCase().includes('melanch')
            ? Math.min(base, 4)
            : base;
        return String(Math.max(1, Math.min(10, Math.round(next))));
      }
      case 'vocalEffects':
        return inferredMood.toLowerCase().includes('dream') || inferredMood.toLowerCase().includes('atmos')
          ? 'Reverb, Delay, Chorus'
          : inferredMood.toLowerCase().includes('aggressive')
            ? 'Distortion, Compression, Delay'
            : 'Reverb, Delay';
      case 'vocalLanguage':
        return inferredLanguage;
      case 'lyricsTheme':
        return sanitizeSuggestion(inferred.lyricTheme) || `${inferredMood} ${inferredGenre} storytelling`;
      case 'lyrics':
        return sanitizeSuggestion(c.lyricsText) && action === 'enhance'
          ? `${sanitizeSuggestion(c.lyricsText)}\n\n(Enhanced with stronger imagery and tighter cadence for ${inferredGenre.toLowerCase()}).`
          : `Write about ${sanitizeSuggestion(c.lyricsTheme) || inferredMood.toLowerCase()} in a ${inferredGenre.toLowerCase()} style with ${inferredLanguage} phrasing.`;
      case 'artistInspiration':
        return inferredArtist || sanitizeSuggestion(c.artistInspiration) || 'Daft Punk';
      case 'videoStyle':
        return sanitizeSuggestion(c.videoStyle) || (inferredMood.toLowerCase().includes('dark') ? 'Neon Cityscapes' : 'Abstract Geometric');
      default:
        return sanitizeSuggestion(inferred.description) || sanitizeSuggestion(inferred.prompt) || sanitizeSuggestion(value);
    }
  };

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

      switch (normalizedField) {
        case 'prompt':
        case 'albumVibe':
          suggestionValue = action === 'enhance'
            ? enhanceField('music_prompt', currentValue || inferredPrompt, suggestionContext)
            : action === 'new'
              ? newAlternativeField('music_prompt', currentValue || inferredPrompt, suggestionContext)
              : inferredPrompt;
          break;
        case 'mood':
          suggestionValue = action === 'new'
            ? newAlternativeField('mood', currentValue || inferredMood, suggestionContext)
            : inferredMood;
          break;
        case 'tempo':
          suggestionValue = String(inferredTempo);
          break;
        case 'structureType':
          suggestionValue = action === 'new'
            ? newAlternativeField('song_structure', currentValue || suggestSongStructure(suggestionContext), suggestionContext)
            : suggestSongStructure(suggestionContext);
          break;
        case 'vocalStyle':
          suggestionValue = action === 'enhance'
            ? enhanceField('vocal_style', currentValue || suggestVocalStyle(suggestionContext), suggestionContext)
            : action === 'new'
              ? newAlternativeField('vocal_style', currentValue || suggestVocalStyle(suggestionContext), suggestionContext)
              : suggestVocalStyle(suggestionContext);
          break;
        case 'videoStyle':
          suggestionValue = suggestVideoStyle(suggestionContext);
          break;
        case 'genre':
          suggestionValue = baseGenre[0].toUpperCase() + baseGenre.slice(1);
          break;
        case 'subgenre':
          suggestionValue = currentValue || `${baseGenre} fusion`;
          break;
        case 'lyricsTheme':
          suggestionValue = action === 'enhance'
            ? enhanceField('lyric_theme', currentValue || `${inferredMood} ${baseGenre} story`, suggestionContext)
            : currentValue || `${inferredMood} ${baseGenre} storytelling`;
          break;
        case 'lyrics':
          suggestionValue = currentValue || `Theme: ${effectiveContext.lyricsTheme || inferredMood}. Style: ${baseGenre}.`;
          break;
        case 'artistInspiration':
          suggestionValue = currentValue || String(effectiveContext.artistInspiration || 'The Weeknd');
          break;
        case 'vocalLanguage':
          suggestionValue = parseList(effectiveContext.vocalLanguage)[0] || 'English';
          break;
        case 'vocalIntensity':
          suggestionValue = String(Math.max(1, Math.min(10, Math.round(suggestionContext.mood.arousal))));
          break;
        case 'duration':
          suggestionValue = String(Math.max(30, Math.min(600, Math.round(Number(effectiveContext.duration || 180)))));
          break;
        case 'trackName':
          suggestionValue = `${inferredMood} ${baseGenre} track`;
          break;
        case 'albumName':
          suggestionValue = `${inferredMood} ${baseGenre} sessions`;
          break;
        default:
          suggestionValue =
            buildFieldSuggestion(normalizedField, value, effectiveContext, null, action) ||
            inferredPrompt;
      }

      suggestionValue = sanitizeSuggestion(suggestionValue);
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
      t.id === trackId ? { ...t, status: 'pending', progress: 0, errorMessage: undefined, completedSegments: 0, currentStage: 'pending', estimatedTimeLeft: 0 } : t;
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
