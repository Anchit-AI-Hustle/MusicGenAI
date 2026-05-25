import React, { useEffect } from 'react';
import { useMusic } from '@/contexts/MusicContext';
import { Loader2, Music, ChevronRight, Download, RefreshCw, EyeOff, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface HiddenCreation {
  creationId: string;
  hiddenAt: number;
}

const HIDDEN_CREATIONS_KEY = 'musevibe_hidden_creations';

const getHiddenCreations = (): HiddenCreation[] => {
  try {
    const stored = localStorage.getItem(HIDDEN_CREATIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const hideCreation = (creationId: string) => {
  const hidden = getHiddenCreations();
  hidden.push({ creationId, hiddenAt: Date.now() });
  localStorage.setItem(HIDDEN_CREATIONS_KEY, JSON.stringify(hidden));
};

const isCreationHidden = (creationId: string): boolean => {
  const hidden = getHiddenCreations();
  return hidden.some(h => h.creationId === creationId);
};

export const GlobalGenerationTicker: React.FC<{
  onNavigate: (page: string, params?: Record<string, string>) => void;
  /** Tailwind class used to offset the fixed ticker so it doesn't sit
   * on top of the sidebar. Defaults preserve the legacy `sm:left-64` look. */
  sidebarOffsetClass?: string;
}> = ({ onNavigate, sidebarOffsetClass = 'lg:left-64' }) => {
  const { creations, retryTrack } = useMusic();
  
  // Only show for brand new pending creations (created in last 5 seconds)
  const displayCreations = creations.filter(c => {
    const isHidden = isCreationHidden(c.id);
    const isNewPending = c.status === 'pending' && (Date.now() - c.createdAt.getTime()) < 5000;
    return !isHidden && isNewPending;
  }).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  if (displayCreations.length === 0) return null;

  const inPipeline = new Set([
    'pending', 'analyzing', 'processing', 'analyzing_beat_structure',
    'generating_video', 'rendering_video', 'encoding_video', 'transcoding_video',
    'uploading_video', 'finalizing',
  ]);

  const handleHide = (e: React.MouseEvent, creationId: string) => {
    e.stopPropagation();
    e.preventDefault();
    hideCreation(creationId);
    // Force re-render by using a timestamp
    window.location.reload();
  };

  const handleDownload = async (track: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const audioUrl = track?.audioUrl;
    const videoUrl = track?.videoUrl;
    
    if (!audioUrl && !videoUrl) return;

    try {
      if (audioUrl) {
        const response = await fetch(audioUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${track.title || 'track'}.wav`;
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      if (videoUrl) {
        const response = await fetch(videoUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${track.title || 'track'}-video.mp4`;
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  return (
    <div className={`fixed top-0 left-0 right-0 z-30 flex flex-col items-center pt-3 px-4 pointer-events-none transition-[left] duration-300 ${sidebarOffsetClass}`}>
      <AnimatePresence>
        {displayCreations.slice(0, 1).map((creation) => {
          const activeTrack = creation.tracks.find(t => inPipeline.has(t.status)) || creation.tracks[0];
          const isStuck = activeTrack && activeTrack.status !== 'completed' && activeTrack.status !== 'failed' && activeTrack.status !== 'audio_complete_video_failed'
            && activeTrack.lastUpdatedAt != null && Date.now() - activeTrack.lastUpdatedAt > 120000;
          const isFailed = creation.status === 'failed' || creation.tracks.some(t => t.status === 'failed') || isStuck;
          const progress = creation.progress || 0;
          const currentStage = isStuck ? "Process timed out" : (activeTrack?.currentStage || "Creating magic...");
          const activeTrackId = activeTrack?.id;
          const isActive = activeTrack && inPipeline.has(activeTrack.status);

          return (
            <motion.div
              key={creation.id}
              initial={{ y: -50, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -50, opacity: 0, scale: 0.95 }}
              className={`pointer-events-auto cursor-pointer backdrop-blur-2xl border rounded-2xl p-4 flex items-center shadow-2xl transition-all w-full max-w-lg group relative overflow-hidden ${
                isFailed 
                ? 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20' 
                : 'bg-gradient-to-r from-black/80 via-black/60 to-black/80 border-white/10 hover:border-primary/40'
              }`}
              onClick={() => onNavigate('dashboard')}
            >
              {!isFailed && (
                <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-primary to-accent transition-all duration-500" style={{ width: `${progress * 100}%` }} />
              )}
              
              <div className="relative flex items-center justify-center w-10 h-10 mr-3 shrink-0 rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/20">
                {isFailed ? (
                  <Music className="w-5 h-5 text-white" />
                ) : (
                  <>
                    <Loader2 className="w-6 h-6 text-white absolute animate-spin" />
                    <Music className="w-3 h-3 text-white/80 absolute" />
                  </>
                )}
              </div>
              
              <div className="flex flex-col flex-1 min-w-0 mr-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white truncate group-hover:text-primary transition-colors">
                    {creation.title || "Untitled Track"}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    isFailed 
                    ? 'bg-red-500/20 text-red-400' 
                    : 'bg-primary/20 text-primary font-medium'
                  }`}>
                    {isFailed ? 'Failed' : `${Math.round(progress * 100)}%`}
                  </span>
                </div>
                <span className={`text-xs flex items-center gap-1.5 mt-0.5 ${isFailed ? 'text-red-400' : 'text-primary/80'}`}>
                  {isFailed ? (
                    <span className="font-medium">Tap to retry</span>
                  ) : (
                    <span className="truncate opacity-80 group-hover:opacity-100">{currentStage}</span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isFailed ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeTrackId) retryTrack(activeTrackId, creation.id);
                    }}
                    className="px-3 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg text-xs font-bold hover:from-red-600 hover:to-red-700 transition-all shadow-lg shadow-red-500/20"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                ) : (
                  <>
                    <button
                      onClick={(e) => handleHide(e, creation.id)}
                      className="w-8 h-8 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 hover:text-white flex items-center justify-center transition-all"
                      title="Hide ticker"
                    >
                      <EyeOff className="w-4 h-4" />
                    </button>
                    
                    {activeTrack && inPipeline.has(activeTrack.status) && (
                      <button
                        onClick={(e) => handleHide(e, creation.id)}
                        className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/40 flex items-center justify-center transition-all"
                        title="Cancel generation"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    
                    {(activeTrack?.audioUrl || activeTrack?.videoUrl) && (
                      <button
                        onClick={(e) => handleDownload(activeTrack, e)}
                        className="w-8 h-8 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white flex items-center justify-center transition-all"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                    
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                      <ChevronRight className="w-4 h-4 text-white/60" />
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};