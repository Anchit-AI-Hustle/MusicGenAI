/**
 * Frontend client for the Python DiffSinger sidecar service.
 *
 * Contract mirrors `python-services/vocal-service/app/schemas.py`. The
 * service exposes:
 *   POST   /sing            → 202 { job_id, poll_url, audio_url }
 *   GET    /sing/{id}       → status + progress
 *   GET    /sing/{id}/audio → WAV file (only after status === "complete")
 *
 * Stage 1 status: the sidecar returns silent audio. The wire protocol
 * here is the contract Stage 3 will fulfill once DiffSinger is plugged
 * in — no caller change required.
 *
 * Failure handling: every call is wrapped in a timeout. If the service
 * is unreachable, the timeout fires, an error is returned, and the
 * higher-level pipeline falls back to the in-browser Whisper backup
 * (see `whisper-fallback.ts`).
 */

export type VoiceGender = "male" | "female" | "neutral";

export interface MelodyNote {
  start_seconds: number;
  duration_seconds: number;
  midi: number;
  velocity: number;
}

export interface SingRequest {
  lyrics: string;
  melody: MelodyNote[];
  voice: VoiceGender;
  language: string;
  sample_rate: number;
  tempo_bpm: number;
  seed?: number;
}

export interface JobStatus {
  job_id: string;
  status: "queued" | "running" | "complete" | "failed";
  progress: number;
  stage_label: string;
  error?: string | null;
  audio_url?: string | null;
  duration_seconds?: number | null;
}

export interface HealthResponse {
  ok: boolean;
  stage: number;
  stage_label: string;
  capabilities: string[];
  version: string;
}

const DEFAULT_BASE_URL =
  (typeof import.meta !== "undefined"
    ? (import.meta as ImportMeta & { env?: { VITE_VOCAL_SERVICE_URL?: string } }).env
        ?.VITE_VOCAL_SERVICE_URL
    : undefined) ?? "http://127.0.0.1:8765";

/**
 * Timeouts. Generation is slow once Stage 3 ships (CPU DiffSinger can take
 * 10–30 minutes for a 3-minute song), so the poll timeout is generous.
 * Health and submit are quick: if they're slow, the service is dead.
 */
const HEALTH_TIMEOUT_MS = 2_500;
const SUBMIT_TIMEOUT_MS = 10_000;
// 10-min ceiling — was 1 hour, which left the UI stuck on "Synthesizing
// vocals" for an hour if the local Python sidecar accepted a job and died.
// Real renders finish in <2 min; anything past 10 is stuck.
const POLL_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 1_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

/** Quick liveness check. Returns null when unreachable instead of throwing. */
export async function checkVocalServiceHealth(
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<HealthResponse | null> {
  try {
    const res = await withTimeout(
      fetch(`${baseUrl}/health`, { method: "GET" }),
      HEALTH_TIMEOUT_MS,
      "vocal health",
    );
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

/** Submit a synthesis job. Throws on submit failure. */
async function submitJob(req: SingRequest, baseUrl: string): Promise<JobStatus> {
  const res = await withTimeout(
    fetch(`${baseUrl}/sing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }),
    SUBMIT_TIMEOUT_MS,
    "vocal submit",
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`vocal submit failed: ${res.status} ${res.statusText} ${text}`);
  }
  const json = (await res.json()) as { job_id: string };
  return {
    job_id: json.job_id,
    status: "queued",
    progress: 0,
    stage_label: "queued",
  };
}

async function pollJob(jobId: string, baseUrl: string): Promise<JobStatus> {
  const res = await withTimeout(
    fetch(`${baseUrl}/sing/${jobId}`, { method: "GET" }),
    SUBMIT_TIMEOUT_MS,
    `vocal poll ${jobId}`,
  );
  if (!res.ok) throw new Error(`vocal poll ${jobId} failed: ${res.status}`);
  return (await res.json()) as JobStatus;
}

export interface SynthesizeResult {
  /** Object URL pointing to the synthesized vocal WAV (revoke when done). */
  wavObjectUrl: string;
  /** Duration of the produced audio in seconds. */
  durationSeconds: number;
  /** True if the audio came from the DiffSinger sidecar. */
  fromSidecar: true;
}

/**
 * Submit a synthesis request and resolve once the WAV is downloaded.
 * Calls `onProgress` at every poll with the latest status.
 *
 * Throws if the service is unreachable, the job fails, or polling times
 * out. Callers are expected to catch and fall back to Whisper.
 */
export async function synthesizeVocal(
  req: SingRequest,
  opts: {
    baseUrl?: string;
    onProgress?: (status: JobStatus) => void;
    abortSignal?: AbortSignal;
  } = {},
): Promise<SynthesizeResult> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const submitted = await submitJob(req, baseUrl);
  const jobId = submitted.job_id;
  opts.onProgress?.(submitted);

  const start = Date.now();
  // poll loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (opts.abortSignal?.aborted) throw new Error("vocal synth aborted");
    if (Date.now() - start > POLL_TIMEOUT_MS) {
      throw new Error(`vocal synth poll timeout after ${POLL_TIMEOUT_MS}ms`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const status = await pollJob(jobId, baseUrl);
    opts.onProgress?.(status);
    if (status.status === "failed") {
      throw new Error(`vocal synth failed: ${status.error ?? "unknown"}`);
    }
    if (status.status === "complete") {
      const audioRes = await fetch(`${baseUrl}/sing/${jobId}/audio`);
      if (!audioRes.ok) throw new Error(`vocal audio download failed: ${audioRes.status}`);
      const blob = await audioRes.blob();
      return {
        wavObjectUrl: URL.createObjectURL(blob),
        durationSeconds: status.duration_seconds ?? 0,
        fromSidecar: true,
      };
    }
  }
}
