import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { generateTrack, MusicIntent, createRng, createGenerationDNA, getGenerationSeedNumber, type GenerationDNA } from '@/lib/music-engine';
import { generateVideoFromAudio } from '@/lib/video-generator';
import { generateVocals, mixVocalsIntoInstrumental, inferVocalStyle, generateDefaultLyrics, type VocalConfig } from '@/lib/vocal-engine';
import { masterAudio } from '@/lib/audio-utils';
import type { TrackConfig } from '@/components/AlbumTrackForm';

export interface Track {
  id: string;
  title: string;
  duration: number;
  audioUrl?: string;
  videoUrl?: string;
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

type AiAction = 'suggest' | 'enhance';

interface MusicContextType {
  creations: MusicCreation[];
  currentCreation: MusicCreation | null;
  isLoading: boolean;
  isCreating: boolean;
  createMusic: (input: CreateMusicInput) => Promise<MusicCreation | null>;
  setCurrentCreation: (creation: MusicCreation | null) => void;
  refreshCreations: () => Promise<void>;
  retryTrack: (trackId: string, creationId: string) => Promise<void>;
  aiSuggest: (field: string, value: string, context: Record<string, any>, action?: AiAction) => Promise<string | null>;
}

const MusicContext = createContext<MusicContextType | undefined>(undefined);

export const MusicProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [creations, setCreations] = useState<MusicCreation[]>([]);
  const [currentCreation, setCurrentCreation] = useState<MusicCreation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const realtimeChannelRef = useRef<any>(null);

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

      const mapped: MusicCreation[] = (creationsData || []).map(creation => ({
        id: creation.id,
        userId: creation.user_id,
        type: creation.type as 'song' | 'album',
        title: creation.title,
        musicPrompt: creation.music_prompt,
        genres: creation.genres || [],
        status: creation.status,
        durationSeconds: creation.duration_seconds,
        generateVideo: creation.generate_video,
        vocalLanguages: creation.vocal_languages || [],
        lyrics: creation.lyrics || undefined,
        artistInspiration: creation.artist_inspiration || undefined,
        videoStyle: creation.video_style || undefined,
        createdAt: new Date(creation.created_at),
        progress: creation.progress ?? 0,
        tracks: tracksData
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
          })),
      }));

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
          const statuses = tracks.map(t => t.status);
          const derivedStatus = statuses.some(s => s === 'failed') ? 'failed'
            : statuses.every(s => s === 'completed') ? 'completed'
            : statuses.find(s => !['pending', 'completed'].includes(s)) || 'pending';
          const derivedProgress = tracks.reduce((a, t) => a + (t.progress ?? 0), 0) / (tracks.length || 1);
          return { ...c, tracks, status: derivedStatus, progress: derivedProgress };
        }));

        setCurrentCreation(prev => {
          if (!prev) return prev;
          const tracks = prev.tracks.map(mapTrack);
          const statuses = tracks.map(t => t.status);
          const derivedStatus = statuses.some(s => s === 'failed') ? 'failed'
            : statuses.every(s => s === 'completed') ? 'completed'
            : statuses.find(s => !['pending', 'completed'].includes(s)) || 'pending';
          const derivedProgress = tracks.reduce((a, t) => a + (t.progress ?? 0), 0) / (tracks.length || 1);
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
      const statuses = tracks.map(t => t.status);
      const derivedStatus = statuses.some(s => s === 'failed') ? 'failed'
        : statuses.every(s => s === 'completed') ? 'completed'
        : statuses.find(s => !['pending', 'completed'].includes(s)) || 'pending';
      const derivedProgress = tracks.reduce((a, t) => a + (t.progress ?? 0), 0) / (tracks.length || 1);
      return { ...c, tracks, status: derivedStatus, progress: derivedProgress };
    }));
    setCurrentCreation(prev => {
      if (prev?.id !== creationId) return prev;
      const tracks = prev.tracks.map(mapTrack);
      const statuses = tracks.map(t => t.status);
      const derivedStatus = statuses.some(s => s === 'failed') ? 'failed'
        : statuses.every(s => s === 'completed') ? 'completed'
        : statuses.find(s => !['pending', 'completed'].includes(s)) || 'pending';
      const derivedProgress = tracks.reduce((a, t) => a + (t.progress ?? 0), 0) / (tracks.length || 1);
      return { ...prev, tracks, status: derivedStatus, progress: derivedProgress };
    });
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
    genres: tc.genres,
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

  // BROWSER-BASED MUSIC GENERATION (single track, no retry logic here)
  const generateTrackInBrowser = async (
    trackId: string, creationId: string, input: CreateMusicInput, trackTitle: string
  ): Promise<'completed' | 'failed'> => {
    try {
      trackLastUpdateRef.current[trackId] = Date.now();

      // Step 0: Generate unique DNA for this generation
      const dna = createGenerationDNA();
      console.log(`[${trackId}] GenerationDNA created: seed=${dna.seed}`);

      // Step 1: Analyze with AI
      updateTrackLocal(creationId, trackId, { status: 'analyzing', currentStage: 'Analyzing prompt', progress: 0.03 });
      await updateTrackDB(trackId, creationId, 'Analyzing prompt', 0.03, 'analyzing');
      trackLastUpdateRef.current[trackId] = Date.now();

      // Step 1b: Preparing generation seed
      updateTrackLocal(creationId, trackId, { status: 'seeding', currentStage: 'Creating GenerationDNA', progress: 0.05 });
      await updateTrackDB(trackId, creationId, 'Creating GenerationDNA', 0.05, 'seeding');

      const analyzeResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-music`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          input: {
            musicPrompt: input.musicPrompt,
            genres: input.genres,
            durationSeconds: input.durationSeconds,
            lyrics: input.lyrics,
            artistInspiration: input.artistInspiration,
            tempoBpm: input.tempoBpm || 120,
            vocalStructure: input.vocalStructure,
            vocalStyle: input.vocalStyle,
            mood: input.mood || '',
            musicalKey: input.musicalKey || '',
            songStructure: input.songStructure || '',
          },
          generationDNA: dna,
        }),
      });

      trackLastUpdateRef.current[trackId] = Date.now();

      if (!analyzeResponse.ok) {
        const err = await analyzeResponse.json().catch(() => ({ error: 'Analysis failed' }));
        throw new Error(err.error || 'AI analysis failed');
      }

      const { musicIntent } = await analyzeResponse.json() as { musicIntent: MusicIntent };
      
      // Inject DNA into intent for downstream engines
      musicIntent.generationDNA = dna;

      // Step 2: Inferring style
      updateTrackLocal(creationId, trackId, { status: 'inferring', currentStage: 'Inferring musical style', progress: 0.08 });
      await updateTrackDB(trackId, creationId, 'Inferring musical style', 0.08, 'inferring');

      // Step 3: Planning
      updateTrackLocal(creationId, trackId, { status: 'planning_structure', currentStage: 'Planning arrangement', progress: 0.10 });
      await updateTrackDB(trackId, creationId, 'Planning arrangement', 0.10, 'planning_structure');
      trackLastUpdateRef.current[trackId] = Date.now();

      // Step 3-5: Generate instrumental audio (segmented rendering)
      const totalSegments = Math.ceil(input.durationSeconds / 20);
      const onProgress = (stage: string, progress: number) => {
        const stageLabels: Record<string, string> = {
          generating_melody: 'Generating melody',
          synthesizing_instruments: 'Synthesizing instruments',
          mixing_audio: 'Mixing audio',
          mastering_track: 'Mastering track',
          generating_vocals: 'Generating vocals',
          vocal_alignment: 'Aligning vocals to music',
          analyzing_beat_structure: 'Analyzing beats',
          rendering_video: 'Rendering visuals',
          finalizing: 'Finalizing track',
        };
        let label = stageLabels[stage] || stage;

        // Add segment info during rendering
        if (stage === 'synthesizing_instruments' && totalSegments > 1) {
          const segIdx = Math.min(totalSegments, Math.floor(((progress - 0.20) / 0.35) * totalSegments) + 1);
          label = `Synthesizing instrument layers ${Math.max(1, segIdx)} / ${totalSegments}`;
        }

        updateTrackLocal(creationId, trackId, {
          status: stage, currentStage: label, progress,
          totalSegments: stage === 'synthesizing_instruments' ? totalSegments : undefined,
          completedSegments: stage === 'synthesizing_instruments' ? Math.floor(((progress - 0.20) / 0.35) * totalSegments) : undefined,
        });
        updateTrackDB(trackId, creationId, label, progress, stage).catch(console.warn);
        trackLastUpdateRef.current[trackId] = Date.now();
      };

      const trackResult = await generateTrack(musicIntent, onProgress);
      trackLastUpdateRef.current[trackId] = Date.now();

      // Step 5b: Vocal synthesis (if lyrics provided and not purely instrumental)
      const isInstrumental = (input.vocalStructure || '').toLowerCase() === 'instrumental';
      let finalBlob = trackResult.blob;
      
      if (!isInstrumental && (input.lyrics || input.musicPrompt)) {
        try {
          updateTrackLocal(creationId, trackId, { status: 'generating_vocals', currentStage: 'Generating vocals', progress: 0.66 });
          await updateTrackDB(trackId, creationId, 'Generating vocals', 0.66, 'generating_vocals');

          const vocalStyle = inferVocalStyle(input.genres, input.vocalStyle);
          const lyricsText = input.lyrics || generateDefaultLyrics(
            input.musicPrompt, input.genres, input.mood || '', musicIntent.structure
          );

          const vocalConfig: VocalConfig = {
            lyrics: lyricsText,
            tempo: musicIntent.tempo,
            key: musicIntent.key,
            scale: musicIntent.scale,
            structure: musicIntent.structure,
            durationSeconds: input.durationSeconds,
            vocalStyle,
            vocalIntensity: input.vocalIntensity || 5,
            vocalEffects: input.vocalEffects || [],
            genres: input.genres,
            mood: input.mood || '',
          };

          const vocalBuffer = await generateVocals(vocalConfig, (p) => {
            const vocalProgress = 0.66 + p.progress * 0.08;
            const vocalStageLabels: Record<string, string> = {
              parsing: 'Parsing lyrics into syllables',
              aligning: 'Aligning vocals to structure',
              melody: 'Mapping lyrics to melody',
              generating: 'Synthesizing singing vocals',
              mixing: 'Mixing vocals into track',
            };
            updateTrackLocal(creationId, trackId, {
              status: 'generating_vocals',
              currentStage: vocalStageLabels[p.stage] || 'Generating vocals',
              progress: vocalProgress,
            });
            updateTrackDB(trackId, creationId, vocalStageLabels[p.stage] || 'Generating vocals', vocalProgress, 'generating_vocals').catch(console.warn);
            trackLastUpdateRef.current[trackId] = Date.now();
          }, createRng(trackResult.rngState));

          if (vocalBuffer) {
            updateTrackLocal(creationId, trackId, { status: 'vocal_alignment', currentStage: 'Mixing vocals into track', progress: 0.74 });
            await updateTrackDB(trackId, creationId, 'Mixing vocals into track', 0.74, 'vocal_alignment');

            // Mix vocals into instrumental
            const mixedBuffer = mixVocalsIntoInstrumental(trackResult.instrumentalBuffer, vocalBuffer, 0.7);
            
            // Master the mixed version
            updateTrackLocal(creationId, trackId, { status: 'mastering_track', currentStage: 'Mastering final mix with vocals', progress: 0.76 });
            await updateTrackDB(trackId, creationId, 'Mastering final mix with vocals', 0.76, 'mastering_track');
            
            const mixedMaster = masterAudio(mixedBuffer, 2);
            finalBlob = mixedMaster.blob;
            
            console.log(`[Vocals] Mixed & mastered — Peak: ${mixedMaster.stats.peakDb.toFixed(1)} dB, LUFS: ${mixedMaster.stats.lufs.toFixed(1)}`);
          }
        } catch (vocalError) {
          console.error(`[${trackId}] Vocal generation failed:`, vocalError);
          toast.error(`Vocal synthesis failed — continuing with instrumental version.`);
          // Continue with instrumental blob
        }
      }

      trackLastUpdateRef.current[trackId] = Date.now();

      // Step 6: Upload audio
      updateTrackLocal(creationId, trackId, { status: 'finalizing', currentStage: 'Uploading final audio', progress: 0.80 });
      await updateTrackDB(trackId, creationId, 'Uploading final audio', 0.80, 'finalizing');

      const filePath = `tracks/${trackId}/final.wav`;
      const { error: uploadError } = await supabase.storage
        .from('music-files')
        .upload(filePath, finalBlob, { contentType: 'audio/wav', upsert: true });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: urlData } = supabase.storage.from('music-files').getPublicUrl(filePath);
      const audioUrl = urlData.publicUrl;

      // Also upload instrumental version separately if vocals were added
      if (!isInstrumental && finalBlob !== trackResult.blob) {
        const instPath = `tracks/${trackId}/instrumental.wav`;
        await supabase.storage.from('music-files')
          .upload(instPath, trackResult.blob, { contentType: 'audio/wav', upsert: true })
          .catch(e => console.warn('Instrumental upload failed:', e));
      }

      // Update track with audio URL
      await supabase.from('tracks').update({
        audio_url: audioUrl, progress: 0.82,
        duration_seconds: input.durationSeconds,
        current_stage: 'Audio complete',
      }).eq('id', trackId);

      updateTrackLocal(creationId, trackId, { audioUrl, progress: 0.82 });
      trackLastUpdateRef.current[trackId] = Date.now();

      if (input.generateVideo) {
        await supabase.from('tracks').update({
          status: 'analyzing_beat_structure',
          audio_url: audioUrl,
          progress: 0.84,
          duration_seconds: input.durationSeconds,
          current_stage: 'Analyzing beats',
          estimated_time_left: 0,
        }).eq('id', trackId);
        updateTrackLocal(creationId, trackId, {
          status: 'analyzing_beat_structure',
          currentStage: 'Analyzing beats',
          progress: 0.84,
          audioUrl,
        });
        runAsyncVideoRender(trackId, creationId, input, trackTitle, audioUrl, dna).catch(console.warn);
        toast.success(`"${trackTitle}" audio is ready. Visuals are rendering in the background.`);
      } else {
        await supabase.from('tracks').update({
          status: 'completed', audio_url: audioUrl, progress: 1,
          duration_seconds: input.durationSeconds,
          current_stage: 'Completed', estimated_time_left: 0,
        }).eq('id', trackId);

        updateTrackLocal(creationId, trackId, {
          status: 'completed', currentStage: 'Completed', progress: 1, audioUrl,
        });
        delete trackLastUpdateRef.current[trackId];
        toast.success(`"${trackTitle}" is ready! 🎵`);
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
          .then(async () => {
            await supabase.from('music_creations').update({ status: 'completed', progress: 1 }).eq('id', newCreation.id);
          });
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

  const aiSuggestQueueRef = useRef(Promise.resolve());

  const aiSuggest = async (field: string, value: string, context: Record<string, any>, action: AiAction = 'suggest'): Promise<string | null> => {
    // Serialize requests to avoid flooding the API
    const result = aiSuggestQueueRef.current.then(async () => {
      const maxRetries = 2;
      const history = suggestionHistoryRef.current[field] || [];
      const globalHistory = suggestionHistoryRef.current.__global__ || [];
      const dna = createGenerationDNA();
      // Use crypto-grade random seed for each suggestion request
      const randomSeed = getGenerationSeedNumber(dna);
      const requestNonce = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${randomSeed}`;
      const previousSuggestions = Array.from(new Set([
        ...history.slice(-10),
        ...globalHistory.slice(-25),
      ]));

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-suggest`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              field, value, context, action,
              previousSuggestions,
              randomSeed,
              requestNonce,
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
            toast.error(err.error || 'AI suggestion failed');
            return null;
          }

          const data = await response.json();
          const suggestion = data.suggestion || null;

          if (suggestion) {
            if (!suggestionHistoryRef.current[field]) suggestionHistoryRef.current[field] = [];
            suggestionHistoryRef.current[field].push(suggestion);
            if (!suggestionHistoryRef.current.__global__) suggestionHistoryRef.current.__global__ = [];
            suggestionHistoryRef.current.__global__.push(suggestion);
          }

          return suggestion;
        } catch (e) {
          if (attempt === maxRetries) { toast.error('Failed to get AI suggestion'); return null; }
          await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        }
      }
      return null;
    });
    aiSuggestQueueRef.current = result.then(() => {}, () => {});
    return result;
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
      createMusic, setCurrentCreation, refreshCreations, retryTrack, aiSuggest,
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
