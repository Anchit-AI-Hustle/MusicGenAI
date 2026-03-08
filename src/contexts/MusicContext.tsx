import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { generateTrack, MusicIntent } from '@/lib/music-engine';
import { generateVideoFromAudio } from '@/lib/video-generator';
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
    musicalKey: 'D minor',
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

      // Step 1: Analyze with AI
      updateTrackLocal(creationId, trackId, { status: 'analyzing', currentStage: 'Analyzing your musical vision', progress: 0.05 });
      await updateTrackDB(trackId, creationId, 'Analyzing your musical vision', 0.05, 'analyzing');
      trackLastUpdateRef.current[trackId] = Date.now();

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
            musicalKey: input.musicalKey || 'D minor',
            songStructure: input.songStructure || '',
          },
        }),
      });

      trackLastUpdateRef.current[trackId] = Date.now();

      if (!analyzeResponse.ok) {
        const err = await analyzeResponse.json().catch(() => ({ error: 'Analysis failed' }));
        throw new Error(err.error || 'AI analysis failed');
      }

      const { musicIntent } = await analyzeResponse.json() as { musicIntent: MusicIntent };

      // Step 2: Planning
      updateTrackLocal(creationId, trackId, { status: 'planning_structure', currentStage: 'Planning song structure', progress: 0.10 });
      await updateTrackDB(trackId, creationId, 'Planning song structure', 0.10, 'planning_structure');
      trackLastUpdateRef.current[trackId] = Date.now();

      // Step 3-5: Generate audio (segmented rendering)
      const totalSegments = Math.ceil(input.durationSeconds / 20);
      const onProgress = (stage: string, progress: number) => {
        const stageLabels: Record<string, string> = {
          generating_midi: 'Composing MIDI patterns',
          rendering_audio: 'Rendering audio synthesis',
          mixing_mastering: 'Mixing and mastering',
          finalizing: 'Finalizing track',
        };
        let label = stageLabels[stage] || stage;

        // Add segment info during rendering
        if (stage === 'rendering_audio' && totalSegments > 1) {
          const segIdx = Math.min(totalSegments, Math.floor(((progress - 0.20) / 0.50) * totalSegments) + 1);
          label = `Rendering audio segment ${Math.max(1, segIdx)} / ${totalSegments}`;
        }

        updateTrackLocal(creationId, trackId, {
          status: stage, currentStage: label, progress,
          totalSegments: stage === 'rendering_audio' ? totalSegments : undefined,
          completedSegments: stage === 'rendering_audio' ? Math.floor(((progress - 0.20) / 0.50) * totalSegments) : undefined,
        });
        updateTrackDB(trackId, creationId, label, progress, stage).catch(console.warn);
        trackLastUpdateRef.current[trackId] = Date.now();
      };

      const wavBlob = await generateTrack(musicIntent, onProgress);
      trackLastUpdateRef.current[trackId] = Date.now();

      // Step 6: Upload audio
      updateTrackLocal(creationId, trackId, { status: 'finalizing', currentStage: 'Uploading final audio', progress: 0.80 });
      await updateTrackDB(trackId, creationId, 'Uploading final audio', 0.80, 'finalizing');

      const filePath = `tracks/${trackId}/final.wav`;
      const { error: uploadError } = await supabase.storage
        .from('music-files')
        .upload(filePath, wavBlob, { contentType: 'audio/wav', upsert: true });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: urlData } = supabase.storage.from('music-files').getPublicUrl(filePath);
      const audioUrl = urlData.publicUrl;

      // Update track with audio URL
      await supabase.from('tracks').update({
        audio_url: audioUrl, progress: 0.82,
        duration_seconds: input.durationSeconds,
        current_stage: 'Audio complete',
      }).eq('id', trackId);

      updateTrackLocal(creationId, trackId, { audioUrl, progress: 0.82 });
      trackLastUpdateRef.current[trackId] = Date.now();

      // Step 7: Video generation (if enabled)
      if (input.generateVideo) {
        try {
          updateTrackLocal(creationId, trackId, { status: 'generating_video', currentStage: 'Generating video visuals', progress: 0.84 });
          await updateTrackDB(trackId, creationId, 'Generating video visuals', 0.84, 'generating_video');

          const videoBlob = await generateVideoFromAudio(
            audioUrl,
            input.durationSeconds,
            input.genres,
            input.mood || '',
            input.videoStyle,
            (p) => {
              updateTrackLocal(creationId, trackId, {
                status: p.stage as string,
                currentStage: p.stage === 'generating_video' ? 'Generating video visuals' : 'Encoding video',
                progress: 0.84 + p.progress * 0.12,
              });
              updateTrackDB(trackId, creationId,
                p.stage === 'generating_video' ? 'Generating video visuals' : 'Encoding video',
                0.84 + p.progress * 0.12,
                p.stage,
              ).catch(console.warn);
              trackLastUpdateRef.current[trackId] = Date.now();
            },
          );

          // Upload video
          updateTrackLocal(creationId, trackId, { status: 'finalizing', currentStage: 'Uploading video', progress: 0.96 });
          await updateTrackDB(trackId, creationId, 'Uploading video', 0.96, 'finalizing');

          const videoPath = `tracks/${trackId}/video.webm`;
          const { error: vidUploadError } = await supabase.storage
            .from('music-files')
            .upload(videoPath, videoBlob, { contentType: 'video/webm', upsert: true });

          if (vidUploadError) throw new Error(`Video upload failed: ${vidUploadError.message}`);

          const { data: vidUrlData } = supabase.storage.from('music-files').getPublicUrl(videoPath);
          const videoUrl = vidUrlData.publicUrl;

          await supabase.from('tracks').update({ video_url: videoUrl }).eq('id', trackId);
          updateTrackLocal(creationId, trackId, { videoUrl });
        } catch (videoError) {
          console.error(`[${trackId}] Video generation failed:`, videoError);
          // Video failure doesn't fail the whole track
          await supabase.from('tracks').update({
            status: 'audio_complete_video_failed',
            current_stage: 'Audio ready, video failed',
            error_message: `Video: ${videoError instanceof Error ? videoError.message : 'Unknown error'}`,
          }).eq('id', trackId);
          updateTrackLocal(creationId, trackId, {
            status: 'audio_complete_video_failed',
            currentStage: 'Audio ready, video failed',
            errorMessage: `Video: ${videoError instanceof Error ? videoError.message : 'Unknown error'}`,
          });
          toast.error(`Video generation failed for "${trackTitle}" — audio is still available.`);
        }
      }

      // Step 8: Complete
      await supabase.from('tracks').update({
        status: 'completed', audio_url: audioUrl, progress: 1,
        duration_seconds: input.durationSeconds,
        current_stage: 'Completed', estimated_time_left: 0,
      }).eq('id', trackId);

      updateTrackLocal(creationId, trackId, {
        status: 'completed', currentStage: 'Completed', progress: 1, audioUrl,
      });

      toast.success(`"${trackTitle}" is ready! 🎵${input.generateVideo ? ' 🎬' : ''}`);
      delete trackLastUpdateRef.current[trackId];
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
      const maxRetries = 4;
      const history = suggestionHistoryRef.current[field] || [];
      const randomSeed = Math.floor(Math.random() * 100000);

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
              previousSuggestions: history.slice(-10),
              randomSeed,
            }),
          });

          if (response.status === 429 && attempt < maxRetries) {
            const delay = Math.min(2000 * Math.pow(2, attempt) + Math.random() * 1000, 15000);
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
