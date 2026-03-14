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
import { generateVocals, generateLyricCues, inferVocalStyle, generateDefaultLyrics, type LyricCue, type VocalConfig } from '@/lib/vocal-engine';
import { aiMusicClient } from '@/lib/ai-music-client';
import type { TrackConfig } from '@/components/AlbumTrackForm';
import { genreOptionsToLabels } from '@/data/genres';

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
  numberOfTracks?: number;
  tempoBpm?: number;
  vocalStructure?: string;
  vocalStyle?: string;
  vocalIntensity?: number;
  vocalEffects?: string[];
  mood?: string;
  musicalKey?: string;
  songStructure?: string;
  // Per-track configs for album mode
  albumTracks?: TrackConfig[];
}

export interface FormState {
  musicPrompt: string;
  genres: string[];
  durationSeconds: number;
  generateVideo: boolean;
  vocalLanguages: string[];
  lyrics?: string;
  artistInspiration?: string;
  videoStyle?: string;
  tempo?: number;
  mood?: string;
  vocalStyle?: string;
  songStructure?: string;
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
    vocalStyle: '',
    songStructure: '',
  });
  const [suggestionState, setSuggestionState] = useState<AiSuggestionState>({
    loading: {},
    results: {},
    lastRequestId: {},
  });

  const realtimeChannelRef = useRef<any>(null);
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  const updateFormState = useCallback((updates: Partial<FormState>) => {
    setFormState(prev => ({ ...prev, ...updates }));
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
    const isInstrumental = (input.vocalStructure || '').toLowerCase() === 'instrumental';
    const genres = input.genres.join(', ');
    const mood = input.mood || 'balanced';
    const tempo = input.tempoBpm || 120;
    const duration = input.durationSeconds || 180;
    
    let prompt = `A professional ${duration}s recording of ${genres}. `;
    prompt += `Context: ${mood} mood, tight ${tempo} BPM rhythmic grid. `;
    
    if (isInstrumental) {
      prompt += "Structure: Instrumental composition. Purely musical, no human voices or vocals. ";
    } else {
      const style = input.vocalStyle || "expressive singing";
      const lang = input.vocalLanguages[0] || "English";
      prompt += `Structure: Vocal-led song featuring ${style} vocals in ${lang}. `;
      if (input.vocalIntensity) prompt += `Vocal energy level: ${input.vocalIntensity}/10. `;
      if (input.vocalEffects?.length) prompt += `Effects: ${input.vocalEffects.join(', ')}. `;
    }

    if (input.songStructure) {
      prompt += `Musical Form: ${input.songStructure}. `;
    }
    
    if (input.musicPrompt) {
      prompt += `Details: ${input.musicPrompt}. `;
    }
    
    if (input.artistInspiration) {
      prompt += `Influence: In the aesthetic spirit of ${input.artistInspiration}. `;
    }

    if (input.lyrics) {
      const lyricGist = input.lyrics.split('\n').slice(0, 3).join(' ').substring(0, 100);
      prompt += `Thematic core: ${lyricGist}... `;
    }
    
    return prompt.trim();
  };

  // BROWSER-BASED MUSIC GENERATION (single track, no retry logic here)
  const generateTrackInBrowser = async (
    trackId: string, creationId: string, input: CreateMusicInput, trackTitle: string
  ): Promise<'completed' | 'failed'> => {
    try {
      trackLastUpdateRef.current[trackId] = Date.now();

      // Step 0: Pre-flight Diagnostic
      const configCheck = aiMusicClient.validateConfig();
      if (!configCheck.valid) {
        console.error(`[Senior Engine] Neural configuration error: ${configCheck.error}`);
        toast.error(`Neural Bridge Config Error: ${configCheck.error}`);
        throw new Error(configCheck.error);
      }

      // Step 1: Generate unique DNA
      const dna = createGenerationDNA();
      console.log(`[${trackId}] Senior Engine DNA generated: seed=${dna.seed}`);

      // Step 1: Analyze & Prepare Semantic Metadata
      updateTrackLocal(creationId, trackId, { status: 'analyzing', currentStage: 'Compiling neural DNA', progress: 0.03 });
      await updateTrackDB(trackId, creationId, 'Compiling neural DNA', 0.03, 'analyzing');

      const neuralPrompt = compileNeuralPrompt(input);
      console.log(`[${trackId}] Semantic Neural Prompt: ${neuralPrompt}`);

      const analyzeResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-music`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          input: {
            ...input,
            musicPrompt: neuralPrompt, // Overwrite with high-entropy prompt
            tempoBpm: input.tempoBpm || 120,
          },
          generationDNA: dna,
        }),
      });

      if (!analyzeResponse.ok) {
        const err = await analyzeResponse.json().catch(() => ({ error: 'Analysis failed' }));
        throw new Error(err.error || 'AI analysis failed');
      }

      const { musicIntent } = await analyzeResponse.json() as { musicIntent: MusicIntent };
      musicIntent.generationDNA = dna;

      // Step 2 & 3: Neural Cloud Generation (Inference)
      updateTrackLocal(creationId, trackId, { status: 'generating_neural', currentStage: 'Streaming waveform from AI cloud', progress: 0.2 });
      await updateTrackDB(trackId, creationId, 'Streaming waveform from AI cloud', 0.2, 'generating_neural');

      let finalBuffer: AudioBuffer | null = null;
      const isInstrumental = (input.vocalStructure || '').toLowerCase() === 'instrumental';
      let lyricCues: LyricCue[] = [];

      try {
        const neuralAudioUrl = await aiMusicClient.generateMusic({
          prompt: neuralPrompt, // Use compiled high-entropy version
          genre: input.genres.join(', '),
          mood: input.mood,
          tempo: input.tempoBpm ?? 120,
          durationSeconds: input.durationSeconds,
          lyrics: input.lyrics,
          vocalStyle: input.vocalStyle,
          vocalLanguage: input.vocalLanguages[0] || 'English',
          isInstrumental: isInstrumental,
          videoStyle: input.videoStyle,
        }, (progress, stage) => {
          updateTrackLocal(creationId, trackId, { currentStage: stage, progress: 0.2 + (progress * 0.5) });
          updateTrackDB(trackId, creationId, stage, 0.2 + (progress * 0.5), 'generating_neural').catch(console.warn);
        });

        // Audio Decoding for Visualization Pipeline
        const audioResponse = await fetch(neuralAudioUrl);
        const arrayBuffer = await audioResponse.arrayBuffer();
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        finalBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        // Sync visualizer cues with generated audio
        if (!isInstrumental) {
          lyricCues = generateLyricCues(input.lyrics || '', musicIntent.structure, input.durationSeconds);
        }

      } catch (neuralError) {
        console.error(`[${trackId}] Neural cloud failed:`, neuralError);
        toast.error(`Neural cloud unavailable — engaging local synth fallback.`);

        // FALLBACK: engagement of legacy procedural engine
        updateTrackLocal(creationId, trackId, { status: 'procedural_fallback', currentStage: 'Procedural synthesis fallback', progress: 0.25 });

        const trackResult = await generateTrack(musicIntent, (stage, progress) => {
          const mappedProgress = 0.25 + progress * 0.4;
          updateTrackLocal(creationId, trackId, { status: stage, progress: mappedProgress });
          updateTrackDB(trackId, creationId, stage, mappedProgress, stage).catch(console.warn);
        });

        finalBuffer = trackResult.instrumentalBuffer;
      }

      if (!finalBuffer) throw new Error('System produced no valid audio buffer');

      // Step 4: Final Signal Processing (Mastering)
      updateTrackLocal(creationId, trackId, { status: 'mastering_track', currentStage: 'Finalizing waveform mastering', progress: 0.76 });
      await updateTrackDB(trackId, creationId, 'Finalizing waveform mastering', 0.76, 'mastering_track');

      const masterResult = masterAudio(finalBuffer, 2);
      const finalBlob = masterResult.blob;

      console.log(`[Production] Mastered Output — Peak DB: ${masterResult.stats.peakDb.toFixed(1)}`);

      // Step 5: Asset Finalization & Storage
      updateTrackLocal(creationId, trackId, { status: 'finalizing', currentStage: 'Storing final production', progress: 0.80 });
      await updateTrackDB(trackId, creationId, 'Storing final production', 0.80, 'finalizing');

      const filePath = `tracks/${trackId}/final.wav`;
      const { error: uploadError } = await supabase.storage
        .from('music-files')
        .upload(filePath, finalBlob, { contentType: 'audio/wav', upsert: true });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: urlData } = supabase.storage.from('music-files').getPublicUrl(filePath);
      const audioUrl = urlData.publicUrl;

      // Persist state to DB
      await supabase.from('tracks').update({
        audio_url: audioUrl, progress: 0.82,
        duration_seconds: input.durationSeconds,
        current_stage: 'Audio Production Complete',
      }).eq('id', trackId);

      updateTrackLocal(creationId, trackId, { audioUrl, progress: 0.82, lyricCues });
      trackLastUpdateRef.current[trackId] = Date.now();

      // Background Video Processing
      if (input.generateVideo) {
        await supabase.from('tracks').update({
          status: 'analyzing_beat_structure',
          audio_url: audioUrl,
          progress: 0.84,
          duration_seconds: input.durationSeconds,
          current_stage: 'Synthesizing visual beats',
          estimated_time_left: 0,
        }).eq('id', trackId);
        updateTrackLocal(creationId, trackId, {
          status: 'analyzing_beat_structure',
          currentStage: 'Synthesizing visual beats',
          progress: 0.84,
          audioUrl,
        });
        runAsyncVideoRender(trackId, creationId, input, trackTitle, audioUrl, dna, lyricCues).catch(console.warn);
        toast.success(`"${trackTitle}" production ready. Video rendering backgrounded.`);
      } else {
        await supabase.from('tracks').update({
          status: 'completed', audio_url: audioUrl, progress: 1,
          duration_seconds: input.durationSeconds,
          current_stage: 'Production Finished', estimated_time_left: 0,
        }).eq('id', trackId);

        updateTrackLocal(creationId, trackId, {
          status: 'completed', currentStage: 'Production Finished', progress: 1, audioUrl,
        });
        delete trackLastUpdateRef.current[trackId];
        toast.success(`"${trackTitle}" production finished! 🎵`);
      }

      return 'completed';
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${trackId}] Generation failed:`, errorMsg);

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
    setSuggestionState(prev => ({
      ...prev,
      loading: { ...prev.loading, [field]: true },
      lastRequestId: { ...prev.lastRequestId, [field]: requestId }
    }));

    try {
      const history = suggestionHistoryRef.current[field] || [];
      const globalHistory = suggestionHistoryRef.current.__global__ || [];
      const dna = createGenerationDNA();
      const randomSeed = getGenerationSeedNumber(dna);
      
      const previousSuggestions = Array.from(new Set([
        ...history.slice(-10),
        ...globalHistory.slice(-25),
      ]));

      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (controller.signal.aborted) return null;

        try {
          const lastFam = suggestionGenreFamilyHistoryRef.current[suggestionGenreFamilyHistoryRef.current.length - 1];
          const nextFamIndex = (GENRE_FAMILIES.indexOf(lastFam || '') + 1) % GENRE_FAMILIES.length;
          const targetGenreFamily = GENRE_FAMILIES[nextFamIndex];

          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-suggest`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            signal: controller.signal,
            body: JSON.stringify({
              field, value, context: effectiveContext, action,
              previousSuggestions,
              previousGenreFamilies: suggestionGenreFamilyHistoryRef.current.slice(-12),
              targetGenreFamily,
              randomSeed,
              requestNonce: requestId,
              generationDNA: dna,
            }),
          });

          if (response.status === 429 && attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 5000);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }

          if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'AI suggestion failed');
          }

          const data = await response.json();
          
          // 3. VALIDATE REQUEST ID BEFORE UPDATING STATE
          setSuggestionState(prev => {
            if (prev.lastRequestId[field] !== requestId) {
              console.log(`[MusicContext] Ignoring stale response for ${field}`);
              return prev;
            }
            
            const result: AiSuggestionResult = {
              field: data.field || field,
              action: data.action || action,
              suggestion: data.suggestion || null,
              seed: data.seed,
              genreFamily: data.genreFamily,
              structured: data.structured || null,
            };

            return {
              ...prev,
              loading: { ...prev.loading, [field]: false },
              results: { ...prev.results, [field]: result }
            };
          });

          if (data.suggestion) {
            if (!suggestionHistoryRef.current[field]) suggestionHistoryRef.current[field] = [];
            suggestionHistoryRef.current[field].push(data.suggestion);
            if (!suggestionHistoryRef.current.__global__) suggestionHistoryRef.current.__global__ = [];
            suggestionHistoryRef.current.__global__.push(data.suggestion);
          }
          if (data.genreFamily) {
            suggestionGenreFamilyHistoryRef.current.push(data.genreFamily);
          }

          // Return result directly for immediate use if needed (e.g. prompt builder)
          return {
            field: data.field || field,
            action: data.action || action,
            suggestion: data.suggestion || null,
            seed: data.seed,
            genreFamily: data.genreFamily,
            structured: data.structured || null,
          };

        } catch (e: any) {
          if (e.name === 'AbortError') return null;
          if (attempt === maxRetries) throw e;
          await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
        }
      }
      return null;
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        toast.error(err.message || 'Failed to get AI suggestion');
      }
      setSuggestionState(prev => ({
        ...prev,
        loading: { ...prev.loading, [field]: false }
      }));
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
