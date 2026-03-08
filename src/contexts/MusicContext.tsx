import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { generateTrack, MusicIntent } from '@/lib/music-engine';

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

interface CreateMusicInput {
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

// Pipeline status labels
const STATUS_FLOW = [
  'pending', 'analyzing', 'planning_structure', 'generating_midi',
  'rendering_audio', 'mixing_mastering', 'finalizing', 'completed', 'failed',
];

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

  // Setup realtime subscriptions for external updates
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
    setCreations(prev => prev.map(c => c.id === creationId ? { ...c, tracks: c.tracks.map(mapTrack), progress: updates.progress ?? c.progress, status: updates.status ?? c.status } : c));
    setCurrentCreation(prev => prev?.id === creationId ? { ...prev, tracks: prev.tracks.map(mapTrack), progress: updates.progress ?? prev.progress, status: updates.status ?? prev.status } : prev);
  };

  // Helper to update track in DB
  const updateTrackDB = async (trackId: string, creationId: string, stage: string, progress: number, status: string) => {
    await supabase.from('tracks').update({
      current_stage: stage, progress, status,
    }).eq('id', trackId);
    await supabase.from('music_creations').update({
      progress, status,
    }).eq('id', creationId);
  };

  // ===== BROWSER-BASED MUSIC GENERATION =====
  const generateTrackInBrowser = async (
    trackId: string, creationId: string, input: CreateMusicInput, trackTitle: string
  ): Promise<void> => {
    try {
      // Step 1: Analyze with AI (edge function)
      updateTrackLocal(creationId, trackId, { status: 'analyzing', currentStage: 'Analyzing your musical vision', progress: 0.05 });
      await updateTrackDB(trackId, creationId, 'Analyzing your musical vision', 0.05, 'analyzing');

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

      if (!analyzeResponse.ok) {
        const err = await analyzeResponse.json().catch(() => ({ error: 'Analysis failed' }));
        throw new Error(err.error || 'AI analysis failed');
      }

      const { musicIntent } = await analyzeResponse.json() as { musicIntent: MusicIntent };

      // Step 2: Planning structure
      updateTrackLocal(creationId, trackId, { status: 'planning_structure', currentStage: 'Planning song structure', progress: 0.10 });
      await updateTrackDB(trackId, creationId, 'Planning song structure', 0.10, 'planning_structure');

      console.log(`[${trackId}] MusicIntent:`, musicIntent);

      // Step 3-5: Generate audio in browser with Tone.js
      const onProgress = (stage: string, progress: number) => {
        const stageLabels: Record<string, string> = {
          generating_midi: 'Composing MIDI patterns',
          rendering_audio: 'Rendering audio synthesis',
          mixing_mastering: 'Mixing and mastering',
          finalizing: 'Finalizing track',
        };
        const label = stageLabels[stage] || stage;
        updateTrackLocal(creationId, trackId, {
          status: stage, currentStage: label, progress,
        });
        // Don't await DB update during rapid progress - fire and forget
        updateTrackDB(trackId, creationId, label, progress, stage).catch(console.warn);
      };

      const wavBlob = await generateTrack(musicIntent, onProgress);

      // Step 6: Upload to storage
      updateTrackLocal(creationId, trackId, { status: 'finalizing', currentStage: 'Uploading final track', progress: 0.94 });
      await updateTrackDB(trackId, creationId, 'Uploading final track', 0.94, 'finalizing');

      const filePath = `tracks/${trackId}/final.wav`;
      const { error: uploadError } = await supabase.storage
        .from('music-files')
        .upload(filePath, wavBlob, { contentType: 'audio/wav', upsert: true });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: urlData } = supabase.storage.from('music-files').getPublicUrl(filePath);
      const audioUrl = urlData.publicUrl;

      // Step 7: Complete
      await supabase.from('tracks').update({
        status: 'completed', audio_url: audioUrl, progress: 1,
        duration_seconds: input.durationSeconds,
        current_stage: 'Completed', estimated_time_left: 0,
      }).eq('id', trackId);

      await supabase.from('music_creations').update({
        status: 'completed', progress: 1,
      }).eq('id', creationId);

      updateTrackLocal(creationId, trackId, {
        status: 'completed', currentStage: 'Completed', progress: 1, audioUrl,
      });

      toast.success(`"${trackTitle}" is ready! 🎵`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${trackId}] Generation failed:`, errorMsg);

      await supabase.from('tracks').update({
        status: 'failed', current_stage: 'Failed', error_message: errorMsg,
        estimated_time_left: 0,
      }).eq('id', trackId);
      await supabase.from('music_creations').update({ status: 'failed' }).eq('id', creationId);

      updateTrackLocal(creationId, trackId, {
        status: 'failed', currentStage: 'Failed', errorMessage: errorMsg, progress: 0,
      });

      toast.error(`Generation failed: ${errorMsg}`);
    }
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
          music_prompt: input.musicPrompt,
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

      // Create track records
      const numberOfTracks = input.type === 'song' ? 1 : (input.numberOfTracks || 5);
      const tracksToCreate = Array.from({ length: numberOfTracks }, (_, i) => ({
        creation_id: creationData.id,
        title: input.type === 'song' ? (input.title || 'Untitled Track') : `Track ${i + 1}`,
        track_number: i + 1,
        duration_seconds: input.durationSeconds,
        status: 'pending',
      }));

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
      toast.success('Music creation started! Generating your track...');

      // Start browser-based generation for each track sequentially
      (async () => {
        for (const track of newCreation.tracks) {
          await generateTrackInBrowser(track.id, newCreation.id, input, track.title);
        }
      })();

      return newCreation;
    } catch (error) {
      console.error('Error in createMusic:', error);
      toast.error('An error occurred. Please try again.');
      return null;
    } finally {
      setIsCreating(false);
    }
  };

  // Session suggestion history to prevent repeats
  const suggestionHistoryRef = useRef<Record<string, string[]>>({});

  const aiSuggest = async (field: string, value: string, context: Record<string, any>, action: AiAction = 'suggest'): Promise<string | null> => {
    const maxRetries = 3;
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
          await new Promise(r => setTimeout(r, (attempt + 1) * 2000 + Math.random() * 1000));
          continue;
        }

        if (!response.ok) {
          const err = await response.json();
          toast.error(err.error || 'AI suggestion failed');
          return null;
        }

        const data = await response.json();
        const suggestion = data.suggestion || null;

        // Store in history to prevent future repeats
        if (suggestion) {
          if (!suggestionHistoryRef.current[field]) suggestionHistoryRef.current[field] = [];
          suggestionHistoryRef.current[field].push(suggestion);
        }

        return suggestion;
      } catch (e) {
        if (attempt === maxRetries) { toast.error('Failed to get AI suggestion'); return null; }
        await new Promise(r => setTimeout(r, (attempt + 1) * 1500));
      }
    }
    return null;
  };

  const refreshCreations = async () => { await fetchCreations(); };

  const retryTrack = async (trackId: string, creationId: string) => {
    const creation = creations.find(c => c.id === creationId);
    if (!creation) { toast.error('Creation not found'); return; }

    // Reset track status
    await supabase.from('tracks').update({
      status: 'pending', progress: 0, error_message: null,
      completed_segments: 0, current_stage: 'pending', estimated_time_left: 0,
    }).eq('id', trackId);
    await supabase.from('music_creations').update({ status: 'pending', progress: 0 }).eq('id', creationId);

    const updateTrack = (t: Track): Track =>
      t.id === trackId ? { ...t, status: 'pending', progress: 0, errorMessage: undefined, completedSegments: 0, currentStage: 'pending', estimatedTimeLeft: 0 } : t;
    setCreations(prev => prev.map(c => c.id === creationId ? { ...c, status: 'pending', progress: 0, tracks: c.tracks.map(updateTrack) } : c));

    toast.success('Retrying track generation...');

    // Rebuild input from creation data
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
