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
import { buildMasterPrompt } from '@/lib/promptBuilder';
import { applyInferenceToContext } from '@/lib/contextInference';
import { CreativeContext } from '@/types/creative-context';

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
  musicPrompt: string;
  genres: string[];
  status: string;
  durationSeconds: number;
  generateVideo: boolean;
  vocalLanguages: string[];
  lyrics?: string;
  artistInspiration?: string;
  videoStyle?: string;
  progress?: number;
}

export interface CreateMusicInput {
  type: 'song' | 'album';
  title: string;
  musicPrompt: string;
  genres: string[];
  durationSeconds: number;
  generateVideo: boolean;
  vocalLanguages: string[];
  lyrics?: string;
  artistInspiration?: string;
  videoStyle?: string;
  subgenre?: string[];
  tempoBpm?: number;
  mood?: string;
  vocalStructure?: string;
  vocalStyle?: string;
  vocalIntensity?: number;
  vocalLanguage?: string[];
  vocalEffects?: string[];
  songStructure?: string;
  lyricTheme?: string;
  vocalGender?: 'male' | 'female' | 'neutral';
  numberOfTracks?: number;
  musicalKey?: string;
  // Per-track configs for album mode
  albumTracks?: TrackConfig[];
}

export interface FormState {
  musicPrompt: string;
  genres: string[];
  subgenre: string[];
  durationSeconds: number;
  generateVideo: boolean;
  vocalLanguages: string[];
  lyrics?: string;
  artistInspiration?: string;
  videoStyle?: string;
  tempo?: number;
  mood?: string;
  vocalStructure?: string;
  vocalStyle?: string;
  vocalIntensity?: number;
  vocalEffects?: string[];
  songStructure?: string;
  lyricTheme?: string;
  vocalGender?: 'male' | 'female' | 'neutral';
}

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
    musicPrompt: '',
    genres: [],
    durationSeconds: 120,
    generateVideo: true,
    vocalLanguages: ['English'],
    tempo: 120,
    mood: '',
    subgenre: [],
    vocalStructure: 'Verse-Chorus',
    vocalStyle: '',
    vocalIntensity: 5,
    vocalEffects: [],
    songStructure: '',
    lyricTheme: '',
    vocalGender: 'neutral',
  });
  const [suggestionState, setSuggestionState] = useState<AiSuggestionState>({
    loading: {},
    results: {},
    lastRequestId: {},
  });

  const realtimeChannelRef = useRef<any>(null);
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  const updateFormState = useCallback((updates: Partial<FormState>) => {
    setFormState(prev => {
      let newState = { ...prev, ...updates };
      
      // If description (musicPrompt) changed, apply inference
      if (updates.musicPrompt !== undefined) {
        const creative = applyInferenceToContext(updates.musicPrompt, {
          genre: prev.genres[0] || '',
          subgenre: prev.subgenre[0] || '',
          tempo: prev.tempo || 110,
          duration: prev.durationSeconds,
          mood: prev.mood || '',
          songStructure: prev.songStructure || '',
          vocalStyle: prev.vocalStyle || '',
          vocalIntensity: prev.vocalIntensity || 50,
          vocalLanguage: prev.vocalLanguages[0] || 'English',
          vocalLanguages: prev.vocalLanguages,
          vocalEffects: prev.vocalEffects,
          lyrics: prev.lyrics || '',
          lyricTheme: prev.lyricTheme || '',
          artistInspiration: prev.artistInspiration || '',
          videoStyle: prev.videoStyle || '',
          songDescription: updates.musicPrompt,
          vocalGender: prev.vocalGender,
        });

        newState = {
          ...newState,
          genres: creative.genre ? [creative.genre] : newState.genres,
          subgenre: creative.subgenre ? [creative.subgenre] : newState.subgenre,
          tempo: creative.tempo || newState.tempo,
          mood: creative.mood || newState.mood,
          artistInspiration: creative.artistInspiration || newState.artistInspiration,
          lyricTheme: creative.lyricTheme || newState.lyricTheme,
          vocalLanguages: creative.vocalLanguage ? [creative.vocalLanguage] : newState.vocalLanguages,
        };
      }
      
      return newState;
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
          musicPrompt: creation.music_prompt,
          genres: creation.genres || [],
          status: derivedStatus,
          durationSeconds: creation.duration_seconds,
          generateVideo: creation.generate_video,
          vocalLanguages: creation.vocal_languages || [],
          lyrics: creation.lyrics || undefined,
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

      const videoBlob = await generateVideoFromAudio(
        audioUrl,
        input.durationSeconds,
        input.genres,
        input.mood || '',
        input.videoStyle,
        (p) => {
          const stageLabel = p.stage === 'analyzing_beat_structure'
            ? 'Analyzing beats'
            : p.stage === 'rendering_video' || p.stage === 'generating_video'
              ? 'Rendering visuals'
              : p.stage === 'transcoding_video'
                ? 'Optimizing MP4 for all devices'
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

  // Build a CreateMusicInput from a TrackConfig
  const trackConfigToInput = (tc: TrackConfig): CreateMusicInput => ({
    type: 'song',
    title: tc.trackName,
    musicPrompt: tc.musicPrompt,
    genres: genreOptionsToLabels(tc.genres),
    durationSeconds: tc.durationSeconds,
    generateVideo: tc.generateVideo,
    vocalLanguages: tc.vocalLanguages,
    lyrics: tc.lyrics || undefined,
    artistInspiration: tc.artistInspiration || undefined,
    videoStyle: tc.generateVideo ? tc.videoStyle : undefined,
    tempoBpm: tc.tempoBpm,
    mood: tc.mood || undefined,
    musicalKey: undefined,
    vocalStructure: tc.vocalStructure,
    vocalStyle: tc.vocalStyle || undefined,
    vocalIntensity: tc.vocalIntensity,
    vocalEffects: tc.vocalEffects,
    songStructure: tc.songStructure || undefined,
  });

  // Track-level stall detection ref: trackId -> lastUpdateTimestamp
  const trackLastUpdateRef = useRef<Record<string, number>>({});

  // Senior Engineer Utility: Compiles a semantically dense prompt for neural models
  const compileNeuralPrompt = (input: CreateMusicInput): string => {
    const context: CreativeContext = {
      genre: input.genres[0] || 'Pop',
      subgenre: input.subgenre?.[0],
      tempo: input.tempoBpm || 110,
      duration: input.durationSeconds,
      mood: input.mood || 'Neutral',
      songStructure: input.songStructure || '',
      vocalStyle: input.vocalStyle || '',
      vocalIntensity: input.vocalIntensity || 50,
      vocalLanguage: input.vocalLanguage?.[0] || input.vocalLanguages?.[0] || 'English',
      vocalLanguages: input.vocalLanguages || [],
      vocalEffects: input.vocalEffects || [],
      lyrics: input.lyrics || '',
      lyricTheme: input.lyricTheme || '',
      artistInspiration: input.artistInspiration || '',
      videoStyle: input.videoStyle || '',
      songDescription: input.musicPrompt || '',
      vocalGender: input.vocalGender,
      instrumentalOnly: (input.vocalStructure || '').toLowerCase() === 'instrumental'
    };

    return buildMasterPrompt(context);
  };

  // Helper to calculate bars
  const calculateBars = (durationSeconds: number, tempo: number) => {
    return Math.max(1, Math.round(durationSeconds / ((60 / tempo) * 4)));
  };

  // BROWSER-BASED MUSIC GENERATION (poll the Next.js backend)
  const generateTrackInBrowser = async (
    trackId: string, creationId: string, input: CreateMusicInput, trackTitle: string
  ): Promise<'completed' | 'failed'> => {
    try {
      trackLastUpdateRef.current[trackId] = Date.now();
      updateTrackLocal(creationId, trackId, { status: 'analyzing', currentStage: 'Analyzing composition', progress: 0.1 });
      await updateTrackDB(trackId, creationId, 'Analyzing composition', 0.1, 'analyzing');

      // 1. Create Generation DNA (Unique per song)
      const dna = createGenerationDNA();
      const rng = createRng(getGenerationSeedNumber(dna));
      
      // 2. Build Music Intent
      const intent: MusicIntent = {
        genre: input.genres[0] || 'Pop',
        subgenre: input.subgenre?.[0] || '',
        tempo: input.tempoBpm || 110,
        key: input.musicalKey || 'C',
        scale: 'minor', // Default
        mood: input.mood || 'Neutral',
        energy: (input.vocalIntensity || 50) / 10, // scale to 1-10
        structure: [], // Engine generates structure if empty
        instruments: [],
        atmosphere: input.musicPrompt || '',
        durationSeconds: input.durationSeconds,
        genres: input.genres,
        generationDNA: dna
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

      // 4. Generate Vocals if not instrumental-only
      const isInstrumentalOnly = (input.vocalStructure || '').toLowerCase() === 'instrumental';
      
      if (!isInstrumentalOnly && input.lyrics) {
        updateTrackLocal(creationId, trackId, { status: 'processing', currentStage: 'Synthesizing vocals', progress: 0.65 });
        
        const { generateVocals, mixVocalsIntoInstrumental, inferVocalStyle } = await import('@/lib/vocal-engine');
        
        const vocalConfig = {
          lyrics: input.lyrics,
          tempo: intent.tempo,
          key: intent.key,
          scale: intent.scale,
          structure: instrumentalResult.compositionGraph.songStructure,
          durationSeconds: intent.durationSeconds,
          vocalStyle: inferVocalStyle(input.genres, input.vocalStyle),
          vocalIntensity: input.vocalIntensity || 5,
          vocalEffects: input.vocalEffects || [],
          genres: input.genres,
          mood: intent.mood,
          language: input.vocalLanguage?.[0] || 'English'
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
      if (input.generateVideo) {
        runAsyncVideoRender(trackId, creationId, input, trackTitle, localAudioUrl, dna, []).catch(console.warn);
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
      // Insert creation record
      const { data: creationData, error: creationError } = await supabase
        .from('music_creations')
        .insert({
          user_id: user.id,
          type: input.type,
          title: input.title || (input.type === 'song' ? 'Untitled Track' : 'Untitled Album'),
          music_prompt: input.musicPrompt || (input.type === 'album' ? 'Album' : ''),
          genres: input.genres,
          duration_seconds: input.durationSeconds,
          generate_video: input.generateVideo,
          vocal_languages: input.vocalLanguages,
          lyrics: input.lyrics || null,
          artist_inspiration: input.artistInspiration || null,
          video_style: input.videoStyle || null,
          status: 'pending',
        })
        .select()
        .single();

      if (creationError) { toast.error('Failed to create music.'); return null; }

      // Build per-track data
      const isAlbumWithTracks = input.type === 'album' && input.albumTracks && input.albumTracks.length > 0;
      const numberOfTracks = isAlbumWithTracks ? input.albumTracks!.length : (input.type === 'song' ? 1 : (input.numberOfTracks || 5));

      const tracksToCreate = Array.from({ length: numberOfTracks }, (_, i) => {
        const tc = isAlbumWithTracks ? input.albumTracks![i] : null;
        return {
          creation_id: creationData.id,
          title: tc ? tc.trackName : (input.type === 'song' ? (input.title || 'Untitled Track') : `Track ${i + 1}`),
          track_number: i + 1,
          duration_seconds: tc ? tc.durationSeconds : input.durationSeconds,
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
        musicPrompt: creationData.music_prompt,
        genres: creationData.genres || [],
        status: 'pending',
        durationSeconds: creationData.duration_seconds,
        generateVideo: creationData.generate_video,
        vocalLanguages: creationData.vocal_languages || [],
        lyrics: creationData.lyrics || undefined,
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
        if (isAlbumWithTracks) return trackConfigToInput(input.albumTracks![index]);
        return input;
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
      const history = suggestionHistoryRef.current[field] || [];
      const globalHistory = suggestionHistoryRef.current.__global__ || [];
      
      const { inferContextFromDescription } = await import('@/lib/contextInference');
      const { parseSuggestionResponse } = await import('@/lib/suggestionParser');
      
      const compositePrompt = `
        Target Field: ${field}
        Current Value: ${value}
        Overall Music Description: ${effectiveContext.musicPrompt || "Not provided"}
        
        Action: ${action === 'enhance' ? 'Enhance the current value based on the description.' : 'Provide a new value for this field.'}
      `.trim();

      const rawInference = await inferContextFromDescription(compositePrompt);
      
      if (!rawInference) throw new Error("Failed to infer");
      
      const parsedSuggestions = parseSuggestionResponse(JSON.stringify(rawInference));
      
      if (!parsedSuggestions || parsedSuggestions.length === 0) {
         throw new Error("No suggestions returned");
      }

      let suggestionValue = parsedSuggestions.find(s => s.field === field)?.value;
      
      // Prevent technical prompts from leaking into the UI
      if (suggestionValue && suggestionValue.includes('Target Field:')) {
        suggestionValue = undefined;
      }
      
      if (!suggestionValue && field === 'trackName') {
         const mood = parsedSuggestions.find(s => s.field === 'mood')?.value;
         const genre = parsedSuggestions.find(s => s.field === 'genre')?.value;
         suggestionValue = mood && genre ? `${mood} ${genre} Vibe` : (mood || genre || "New Track");
      }

      if (!suggestionValue && parsedSuggestions.length > 0) {
        suggestionValue = parsedSuggestions[0].value;
      }

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
             [field]: { field, action, suggestion: suggestionValue, structured: rawInference } 
          }
        };
      });

      return { field, action, suggestion: suggestionValue, structured: rawInference };

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        toast.error(err.message || 'Failed to get AI suggestion');
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
      musicPrompt: creation.musicPrompt,
      genres: creation.genres,
      durationSeconds: creation.durationSeconds,
      generateVideo: creation.generateVideo,
      vocalLanguages: creation.vocalLanguages,
      lyrics: creation.lyrics,
      artistInspiration: creation.artistInspiration,
    };

    const track = creation.tracks.find(t => t.id === trackId);
    generateTrackInBrowser(trackId, creationId, input, track?.title || 'Track');
  };

  return (
    <MusicContext.Provider value={{
      creations, currentCreation, isLoading, isCreating,
      formState, updateFormState,
      createMusic, setCurrentCreation, refreshCreations, retryTrack, aiSuggest,
      suggestionState,
    }}>
      {children}
    </MusicContext.Provider>
  );
};

export const useMusic = () => {
  const context = useContext(MusicContext);
  if (context === undefined) throw new Error('useMusic must be used within a MusicProvider');
  return context;
};
