/**
 * Telemetry — structured per-stage event logging.
 *
 * Every generation request gets a `runId`. Every meaningful step inside it
 * emits one event with stage, latency, success, optional cost. The events
 * land in three places:
 *
 *   1. console.log (always; line-prefixed `[tlm]`)
 *   2. an optional sink endpoint (POST JSON to TELEMETRY_SINK_URL)
 *   3. an optional Supabase table `telemetry_events` if SUPABASE_URL is set
 *
 * Without telemetry we cannot tell which providers are slow, which genres
 * fail, or how often we re-roll. T1.4 in MODEL_IMPROVEMENT_ROADMAP.
 */
import { TELEMETRY_DISABLE_CONSOLE, TELEMETRY_SINK_URL } from "@/lib/env";

export type Stage =
  | "request-received"
  | "rate-limit-check"
  | "plan-build"
  | "plan-score"
  | "plan-rewrite"
  | "prompt-assemble"
  | "model-call"
  | "model-poll"
  | "model-complete"
  | "post-render-analyze"
  | "post-render-master"
  | "video-sync-plan"
  | "video-render"
  | "respond"
  | "error";

export interface TelemetryEvent {
  runId: string;
  stage: Stage;
  startMs: number;
  endMs?: number;
  latencyMs?: number;
  success: boolean;
  provider?: string;
  modelId?: string;
  genreId?: string;
  qualityScore?: number;
  costUSD?: number;
  errorCode?: string;
  errorMessage?: string;
  meta?: Record<string, unknown>;
}

export interface RunContext {
  runId: string;
  startedAt: number;
  events: TelemetryEvent[];
}

const SINK_URL = TELEMETRY_SINK_URL;
const ENABLE_CONSOLE = TELEMETRY_DISABLE_CONSOLE !== "1";

export function newRunId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `run_${t}_${r}`;
}

export function newRun(): RunContext {
  return { runId: newRunId(), startedAt: Date.now(), events: [] };
}

/**
 * Run an async stage and emit a telemetry event with measured latency.
 * Errors are caught, logged, re-thrown.
 */
export async function withStage<T>(
  ctx: RunContext,
  stage: Stage,
  fn: () => Promise<T>,
  meta?: Omit<Partial<TelemetryEvent>, "runId" | "stage" | "startMs" | "endMs" | "latencyMs" | "success">,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    emit(ctx, {
      runId: ctx.runId,
      stage,
      startMs: start,
      endMs: Date.now(),
      latencyMs: Date.now() - start,
      success: true,
      ...meta,
    });
    return result;
  } catch (err: any) {
    emit(ctx, {
      runId: ctx.runId,
      stage,
      startMs: start,
      endMs: Date.now(),
      latencyMs: Date.now() - start,
      success: false,
      errorCode: err?.code ?? "UNKNOWN",
      errorMessage: err?.message ?? String(err),
      ...meta,
    });
    throw err;
  }
}

/**
 * Record a synchronous milestone (no timing). Use for "request-received",
 * "respond", or score-emission events.
 */
export function record(
  ctx: RunContext,
  stage: Stage,
  meta?: Omit<Partial<TelemetryEvent>, "runId" | "stage" | "startMs" | "success">,
): void {
  emit(ctx, {
    runId: ctx.runId,
    stage,
    startMs: Date.now(),
    success: true,
    ...meta,
  });
}

function emit(ctx: RunContext, ev: TelemetryEvent) {
  ctx.events.push(ev);
  if (ENABLE_CONSOLE) {
    const tag = ev.success ? "tlm" : "tlm.err";
    const dur = typeof ev.latencyMs === "number" ? ` ${ev.latencyMs}ms` : "";
    const extra = compactMeta(ev);
    console.log(`[${tag}] ${ev.runId} ${ev.stage}${dur}${extra}`);
  }
  if (SINK_URL) {
    void postSink(ev);
  }
}

function compactMeta(ev: TelemetryEvent): string {
  const out: string[] = [];
  if (ev.provider) out.push(`provider=${ev.provider}`);
  if (ev.modelId) out.push(`model=${ev.modelId}`);
  if (ev.genreId) out.push(`genre=${ev.genreId}`);
  if (typeof ev.qualityScore === "number") out.push(`score=${ev.qualityScore}`);
  if (typeof ev.costUSD === "number") out.push(`$=${ev.costUSD.toFixed(4)}`);
  if (ev.errorCode) out.push(`err=${ev.errorCode}`);
  return out.length ? ` (${out.join(", ")})` : "";
}

async function postSink(ev: TelemetryEvent) {
  try {
    await fetch(SINK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ev),
    });
  } catch {
    // Telemetry must never throw into the request path.
  }
}

/**
 * Summarize a run for response payloads. Includes per-stage latencies and
 * total wall time. Safe to surface to the client.
 */
export function summarizeRun(ctx: RunContext) {
  const total = Date.now() - ctx.startedAt;
  return {
    runId: ctx.runId,
    totalMs: total,
    stages: ctx.events.map(e => ({
      stage: e.stage,
      latencyMs: e.latencyMs,
      success: e.success,
      provider: e.provider,
      qualityScore: e.qualityScore,
      errorCode: e.errorCode,
    })),
  };
}
