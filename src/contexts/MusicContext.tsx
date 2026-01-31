import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
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
}

interface MusicContextType {
  creations: MusicCreation[];
  currentCreation: MusicCreation | null;
  isLoading: boolean;
  isCreating: boolean;
  createMusic: (input: CreateMusicInput) => Promise<MusicCreation | null>;
  setCurrentCreation: (creation: MusicCreation | null) => void;
  refreshCreations: () => Promise<void>;
}

const MusicContext = createContext<MusicContextType | undefined>(undefined);

export const MusicProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [creations, setCreations] = useState<MusicCreation[]>([]);
  const [currentCreation, setCurrentCreation] = useState<MusicCreation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Fetch user's creations from Supabase
  const fetchCreations = useCallback(async () => {
    if (!user?.id) {
      setCreations([]);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch music creations
      const { data: creationsData, error: creationsError } = await supabase
        .from('music_creations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (creationsError) {
        console.error('Error fetching creations:', creationsError);
        return;
      }

      // Fetch tracks for all creations
      const creationIds = creationsData?.map(c => c.id) || [];
      let tracksData: any[] = [];
      
      if (creationIds.length > 0) {
        const { data, error: tracksError } = await supabase
          .from('tracks')
          .select('*')
          .in('creation_id', creationIds)
          .order('track_number', { ascending: true });

        if (tracksError) {
          console.error('Error fetching tracks:', tracksError);
        } else {
          tracksData = data || [];
        }
      }

      // Map to MusicCreation format
      const mappedCreations: MusicCreation[] = (creationsData || []).map(creation => ({
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
          })),
      }));

      setCreations(mappedCreations);
    } catch (error) {
      console.error('Error in fetchCreations:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Refresh creations when user changes
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
      // Create the music creation record
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

      // Create tracks
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
        toast.error('Failed to create tracks. Please try again.');
        return null;
      }

      // Map to MusicCreation format
      const newCreation: MusicCreation = {
        id: creationData.id,
        userId: creationData.user_id,
        type: creationData.type as 'song' | 'album',
        title: creationData.title,
        musicPrompt: creationData.music_prompt,
        genres: creationData.genres || [],
        status: creationData.status,
        durationSeconds: creationData.duration_seconds,
        generateVideo: creationData.generate_video,
        vocalLanguages: creationData.vocal_languages || [],
        lyrics: creationData.lyrics || undefined,
        artistInspiration: creationData.artist_inspiration || undefined,
        videoStyle: creationData.video_style || undefined,
        createdAt: new Date(creationData.created_at),
        tracks: (tracksData || []).map(track => ({
          id: track.id,
          title: track.title,
          duration: track.duration_seconds,
          audioUrl: track.audio_url || undefined,
          videoUrl: track.video_url || undefined,
          status: track.status,
          trackNumber: track.track_number,
          createdAt: new Date(track.created_at),
        })),
      };

      setCreations(prev => [newCreation, ...prev]);
      setCurrentCreation(newCreation);
      toast.success('Music creation started!');
      
      return newCreation;
    } catch (error) {
      console.error('Error in createMusic:', error);
      toast.error('An error occurred. Please try again.');
      return null;
    } finally {
      setIsCreating(false);
    }
  };

  const refreshCreations = async () => {
    await fetchCreations();
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
