import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface Track {
  id: string;
  title: string;
  duration: number;
  audioUrl?: string;
  videoUrl?: string;
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
}

interface MusicContextType {
  creations: MusicCreation[];
  currentCreation: MusicCreation | null;
  addCreation: (creation: MusicCreation) => void;
  setCurrentCreation: (creation: MusicCreation | null) => void;
  getCreationsByUser: (userId: string) => MusicCreation[];
}

const MusicContext = createContext<MusicContextType | undefined>(undefined);

export const MusicProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [creations, setCreations] = useState<MusicCreation[]>([]);
  const [currentCreation, setCurrentCreation] = useState<MusicCreation | null>(null);

  const addCreation = (creation: MusicCreation) => {
    setCreations(prev => [creation, ...prev]);
    setCurrentCreation(creation);
  };

  const getCreationsByUser = (userId: string) => {
    return creations.filter(c => c.userId === userId);
  };

  return (
    <MusicContext.Provider value={{
      creations,
      currentCreation,
      addCreation,
      setCurrentCreation,
      getCreationsByUser,
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
