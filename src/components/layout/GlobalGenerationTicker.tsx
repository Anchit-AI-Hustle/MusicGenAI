import React from 'react';
import { useMusic } from '@/contexts/MusicContext';
import { Loader2, Music, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export const GlobalGenerationTicker: React.FC<{ onNavigate: (page: string) => void }> = ({ onNavigate }) => {
  const { creations } = useMusic();
  
  // Find active creations
  const activeCreations = creations.filter(c => !['completed', 'failed'].includes(c.status));

  if (activeCreations.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-2 px-4 pointer-events-none">
      <AnimatePresence>
        {activeCreations.slice(0, 1).map((creation) => (
          <motion.div
            key={creation.id}
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="pointer-events-auto cursor-pointer bg-black/40 backdrop-blur-xl border border-white/10 rounded-full px-4 py-2 flex items-center shadow-2xl hover:bg-black/60 transition-colors"
            onClick={() => onNavigate('dashboard')}
          >
            <div className="relative flex items-center justify-center w-6 h-6 mr-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin absolute" />
              <Music className="w-3 h-3 text-primary absolute animate-pulse" />
            </div>
            <div className="flex flex-col mr-4">
              <span className="text-xs font-semibold text-white/90 truncate max-w-[150px]">
                {creation.title || "Untitled Track"}
              </span>
              <span className="text-[10px] text-primary space-x-1 flex items-center">
                <span>{Math.round((creation.progress || 0) * 100)}%</span>
                <span>•</span>
                <span className="truncate max-w-[100px]">{creation.tracks[0]?.currentStage || "Creating magic..."}</span>
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center ml-auto">
              <ChevronRight className="w-4 h-4 text-white/60" />
            </div>
            
            <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/10 to-primary/0 -z-10 animate-shimmer rounded-full" />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
