import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

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
    if (!user?.id) {
      setCreations([]);
      return;
    }
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
          })),
      }));

      setCreations(mapped);
    } catch (error) {
      console.error('Error in fetchCreations:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Setup realtime subscriptions
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
        setCreations(prev => prev.map(c => ({ ...c, tracks: c.tracks.map(mapTrack) })));
        // Also update currentCreation
        setCurrentCreation(prev => {
          if (!prev) return prev;
          return { ...prev, tracks: prev.tracks.map(mapTrack) };
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'music_creations' }, (payload) => {
        const updated = payload.new as any;
        setCreations(prev => prev.map(c =>
          c.id === updated.id
            ? { ...c, status: updated.status, progress: updated.progress ?? 0 }
            : c
        ));
        setCurrentCreation(prev =>
          prev?.id === updated.id
            ? { ...prev, status: updated.status, progress: updated.progress ?? 0 }
            : prev
        );
      })
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      fetchCreations();
    } else {
      setCreations([]);
      setCurrentCreation(null);
    }
  }, [isAuthenticated, user?.id, fetchCreations]);

  const createMusic = async (input: CreateMusicInput): Promise<MusicCreation | null> => {
    if (!user?.id) {
      toast.error('Please sign in to create music');
      return null;
    }

    setIsCreating(true);
    try {
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

      if (creationError) {
        console.error('Error creating music:', creationError);
        toast.error('Failed to create music. Please try again.');
        return null;
      }

      const numberOfTracks = input.type === 'song' ? 1 : (input.numberOfTracks || 5);
      const tracksToCreate = Array.from({ length: numberOfTracks }, (_, i) => ({
        creation_id: creationData.id,
        title: input.type === 'song'
          ? (input.title || 'Untitled Track')
          : `Track ${i + 1}`,
        track_number: i + 1,
        duration_seconds: input.durationSeconds,
        status: 'pending',
      }));

      const { data: tracksData, error: tracksError } = await supabase
        .from('tracks')
        .insert(tracksToCreate)
        .select();

      if (tracksError) {
        console.error('Error creating tracks:', tracksError);
        toast.error('Failed to create tracks.');
        return null;
      }

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
          audioUrl: track.audio_url || undefined,
          videoUrl: track.video_url || undefined,
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

      // Trigger generation for each track (fire-and-forget)
      for (const track of newCreation.tracks) {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-music`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            trackId: track.id,
            creationId: newCreation.id,
            input: {
              musicPrompt: input.musicPrompt,
              genres: input.genres,
              durationSeconds: input.durationSeconds,
              vocalLanguages: input.vocalLanguages,
              lyrics: input.lyrics,
              artistInspiration: input.artistInspiration,
              tempoBpm: input.tempoBpm,
              vocalStructure: input.vocalStructure,
              vocalStyle: input.vocalStyle,
              vocalIntensity: input.vocalIntensity,
              vocalEffects: input.vocalEffects,
            },
          }),
        }).catch(err => {
          console.error('Generation trigger error:', err);
          toast.error('Failed to start music generation.');
        });
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

  const aiSuggest = async (field: string, value: string, context: Record<string, any>, action: AiAction = 'suggest'): Promise<string | null> => {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ field, value, context, action }),
      });

      if (!response.ok) {
        const err = await response.json();
        toast.error(err.error || 'AI suggestion failed');
        return null;
      }

      const data = await response.json();
      return data.suggestion || null;
    } catch (e) {
      console.error('AI suggest error:', e);
      toast.error('Failed to get AI suggestion');
      return null;
    }
  };

  const refreshCreations = async () => { await fetchCreations(); };

  const retryTrack = async (trackId: string, creationId: string) => {
    // Find the creation to get input params
    const creation = creations.find(c => c.id === creationId);
    if (!creation) {
      toast.error('Creation not found');
      return;
    }

    // Reset track status in DB
    await supabase.from('tracks').update({
      status: 'pending', progress: 0, error_message: null,
      completed_segments: 0, current_stage: 'pending', estimated_time_left: 0,
    }).eq('id', trackId);
    await supabase.from('music_creations').update({
      status: 'processing', progress: 0,
    }).eq('id', creationId);

    // Delete old segments for this track
    await supabase.from('segments').delete().eq('track_id', trackId);

    // Update local state immediately
    const updateTrack = (t: Track): Track =>
      t.id === trackId ? { ...t, status: 'pending', progress: 0, errorMessage: undefined, completedSegments: 0, currentStage: 'pending', estimatedTimeLeft: 0 } : t;
    setCreations(prev => prev.map(c => c.id === creationId ? { ...c, status: 'processing', progress: 0, tracks: c.tracks.map(updateTrack) } : c));
    setCurrentCreation(prev => prev?.id === creationId ? { ...prev, status: 'processing', progress: 0, tracks: prev.tracks.map(updateTrack) } : prev);

    toast.success('Retrying track generation...');

    // Re-trigger generation
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-music`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        trackId,
        creationId,
        input: {
          musicPrompt: creation.musicPrompt,
          genres: creation.genres,
          durationSeconds: creation.durationSeconds,
          vocalLanguages: creation.vocalLanguages,
          lyrics: creation.lyrics,
          artistInspiration: creation.artistInspiration,
        },
      }),
    }).catch(err => {
      console.error('Retry trigger error:', err);
      toast.error('Failed to retry track generation.');
    });
  };

  return (
    <MusicContext.Provider value={{
      creations,
      currentCreation,
      isLoading,
      isCreating,
      createMusic,
      setCurrentCreation,
      refreshCreations,
      retryTrack,
      aiSuggest,
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
