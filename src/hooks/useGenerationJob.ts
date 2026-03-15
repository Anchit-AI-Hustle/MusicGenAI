import { useState, useCallback, useRef, useEffect } from 'react';
import { CreativeContext } from "@/types/creative-context";

export type JobStatus = 'idle' | 'starting' | 'processing' | 'succeeded' | 'failed';

export interface JobState {
  status: JobStatus;
  jobId: string | null;
  audioUrl: string | null;
  error: string | null;
  mixData: any | null;
  route: string | null;
}

export function useGenerationJob() {
  const [state, setState] = useState<JobState>({
    status: 'idle',
    jobId: null,
    audioUrl: null,
    error: null,
    mixData: null,
    route: null
  });
  
  const pollIntervalRef = useRef<NodeJS.Timeout>();

  const update = useCallback((updates: Partial<JobState>) => {
      setState(prev => ({ ...prev, ...updates }));
  }, []);

  const clearPolling = useCallback(() => {
     if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = undefined;
     }
  }, []);

  useEffect(() => {
      return clearPolling;
  }, [clearPolling]);

  const startJob = useCallback(async (context: CreativeContext) => {
    try {
      clearPolling();
      update({ status: 'starting', error: null, audioUrl: null, mixData: null, jobId: null, route: null });
      
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context)
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to start generation');
      
      if (data.status === 'succeeded' && data.audio) {
          // Synchronous ElevenLabs fast path or similar
          update({ status: 'succeeded', audioUrl: data.audio, route: data.route, jobId: data.jobId });
          return;
      }
      
      update({ status: 'processing', jobId: data.jobId, mixData: data.mixData, route: data.route });
      
      // Start polling
      pollIntervalRef.current = setInterval(async () => {
          try {
             const statusRes = await fetch(`/api/generate/status?jobId=${data.jobId}`);
             if (!statusRes.ok) return; // Wait for next tick if minor network blip

             const statusData = await statusRes.json();
             
             if (statusData.status === 'succeeded') {
                 clearPolling();
                 update({ status: 'succeeded', audioUrl: statusData.output });
             } else if (statusData.status === 'failed' || statusData.status === 'canceled') {
                 clearPolling();
                 update({ status: 'failed', error: statusData.error || 'Job failed' });
             }
          } catch (err) {
              console.error("Polling error", err);
              // Do not fail the whole job immediately on one poll error, let it retry on next interval
          }
      }, 3000);
      
    } catch (err: any) { 
        clearPolling();
        update({ status: "failed", error: err.message || "An unknown error occurred" });
    }
  }, [update, clearPolling]);

  const reset = useCallback(() => {
      clearPolling();
      setState({
        status: 'idle',
        jobId: null,
        audioUrl: null,
        error: null,
        mixData: null,
        route: null
      });
  }, [clearPolling]);

  return { ...state, startJob, reset };
}
