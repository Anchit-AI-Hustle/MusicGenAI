import React, { useEffect, useState } from 'react';
import { useMusic } from '@/contexts/MusicContext';
import { Loader2, Music, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export const GlobalGenerationTicker: React.FC<{ onNavigate: (page: string, params?: Record<string, string>) => void }> = ({ onNavigate }) => {
  const { creations, retryTrack } = useMusic();
  const [, setTick] = useState(0);

  // Force re-render periodically to check for stuck tracks
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);
  
  // Find active or failed creations
  const displayCreations = creations
    .filter(c => c.status !== 'completed')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (displayCreations.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex flex-col items-center pt-2 px-4 pointer-events-none space-y-2">
      <AnimatePresence>
        {displayCreations.slice(0, 1).map((creation) => {
          const activeTrack = creation.tracks.find(t => ['analyzing', 'processing', 'failed'].includes(t.status)) || creation.tracks[0];
          const isStuck = activeTrack && activeTrack.status !== 'completed' && activeTrack.status !== 'failed' && (activeTrack.lastUpdatedAt && Date.now() - activeTrack.lastUpdatedAt > 90000);
          const isFailed = creation.status === 'failed' || creation.tracks.some(t => t.status === 'failed') || isStuck;
          const progress = creation.progress || 0;
          const currentStage = isStuck ? "Process timed out" : (activeTrack?.currentStage || "Creating magic...");
          const activeTrackId = activeTrack?.id;

          return (
            <motion.div
              key={creation.id}
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              className={`pointer-events-auto cursor-pointer backdrop-blur-xl border rounded-2xl px-4 py-3 flex items-center shadow-2xl transition-all w-full max-w-md ${
                isFailed 
                ? 'bg-red-500/20 border-red-500/30 hover:bg-red-500/30' 
                : 'bg-black/60 border-white/10 hover:border-primary/30'
              }`}
              onClick={() => onNavigate('song-detail', { creationId: creation.id, trackId: activeTrackId })}
            >
              <div className="relative flex items-center justify-center w-8 h-8 mr-3 shrink-0">
                {isFailed ? (
                  <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                    <Music className="w-4 h-4 text-red-400" />
                  </div>
                ) : (
                  <>
                    <Loader2 className="w-6 h-6 text-primary animate-spin absolute" />
                    <Music className="w-3 h-3 text-primary absolute animate-pulse" />
                  </>
                )}
              </div>
              
              <div className="flex flex-col flex-1 min-w-0 mr-3">
                <span className="text-sm font-semibold text-white/90 truncate">
                  {creation.title || "Untitled Track"}
                </span>
                <span className={`text-xs flex items-center gap-1.5 ${isFailed ? 'text-red-400' : 'text-primary'}`}>
                  {isFailed ? (
                    <span className="font-medium">Generation Failed</span>
                  ) : (
                    <>
                      <span className="font-bold">{Math.round(progress * 100)}%</span>
                      <span className="opacity-40">•</span>
                      <span className="truncate opacity-80">{currentStage}</span>
                    </>
                  )}
                </span>
              </div>

              {isFailed ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (activeTrackId) retryTrack(activeTrackId, creation.id);
                  }}
                  className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 transition-colors shadow-lg"
                >
                  Retry
                </button>
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                  <ChevronRight className="w-4 h-4 text-white/60" />
                </div>
              )}
              
              {!isFailed && (
                <div className="absolute bottom-0 left-0 h-0.5 bg-primary/40 rounded-full transition-all duration-500" style={{ width: `${progress * 100}%` }} />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
