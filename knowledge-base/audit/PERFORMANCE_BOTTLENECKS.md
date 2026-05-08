# Performance Bottlenecks

> Latency, throughput, and quality bottlenecks in the current pipeline. Ordered by impact.

---

## P1. Synchronous model calls block the request

**Where** `src/app/api/generate/route.ts:52` — `await generateElevenLabsMusic(context)` runs in the request handler. Replicate path is async (returns jobId) but ElevenLabs is fully synchronous.

**Impact** A 30s+ ElevenLabs call holds the API thread; if Vercel function timeout is 10s, the request fails.

**Fix** Move ElevenLabs to a background job pattern (return jobId immediately, complete in a worker). Or use the streaming variant. Or upload to Supabase Storage on completion and return URL.

---

## P2. No parallel generation of audio + video

**Where** UI flow: user requests audio, waits, then requests video.

**Impact** End-to-end time = audio time + video time, when they could be concurrent.

**Fix** Once audio plan is ready, kick off video render in parallel. The video sync engine can plan from the *plan* (BPM, sections, energy curve) and finalize sync only when audio is rendered (cheap re-quantize of beat timestamps).

---

## P3. Polling Replicate inefficiently

**Where** `src/app/api/generate/status/route.ts` is polled by client every N seconds.

**Impact** Many API calls; latency = poll interval + round-trip.

**Fix**
- Use Replicate webhooks if available.
- Or: use long-polling (server side waits for completion or timeout, returns).
- Or: use server-sent events (SSE) for status streaming.

---

## P4. No caching of model responses

**Where** Same prompt → same output is regenerated every time.

**Impact** Costs add up; latency redundant for retried requests.

**Fix** Hash `(prompt, modelId, seed)` → cache audio URL in Supabase Storage. On hit, return immediately. On miss, generate.

---

## P5. Quality variance — no auto-reroll

**Where** First generation is final, regardless of quality.

**Impact** Many low-quality outputs delivered to users.

**Fix** Implement quality scorer (`src/lib/intelligence/engagement-scorer.ts`). On score < threshold, automatically re-roll once with adjusted prompt. Never re-roll silently more than once (cost cap).

---

## P6. Single-region deployment

**Where** Vercel deployment likely single-region.

**Impact** Latency for users in other regions, especially APAC and EU.

**Fix** Deploy to Vercel Edge Functions or Cloudflare Workers for multi-region. Note: long-running ML calls don't benefit from edge — only the orchestration does.

---

## P7. Lyric generation blocks audio generation

**Where** When vocals are required, lyrics are generated first, then audio prompt.

**Impact** Adds 5–15s of LLM call before audio call begins.

**Fix** Streaming: start lyric generation, stream tokens; once first verse is complete, start audio generation in parallel for the instrumental, finalize when lyrics complete. (Only matters when audio model accepts lyrics as input — ACE-Step does.)

---

## P8. Video render is real-time

**Where** `src/lib/video-generator.ts` uses Canvas + MediaRecorder, real-time only.

**Impact** A 3-minute video takes 3 minutes to render.

**Fix** Offscreen canvas + faster-than-realtime frame rendering, then encode via WebCodecs API. Or server-side `ffmpeg` from frame sequence. ~3x speedup.

---

## P9. No telemetry to identify bottlenecks

**Where** No metrics on per-stage latency.

**Impact** We don't know which stage is slow or which model is fastest for each genre.

**Fix** Structured logging:
```ts
log({
  runId, stage: 'plan', startMs, endMs, latencyMs: endMs - startMs,
  provider, modelId, success, costUSD?
})
```
Pipe to a metrics store (Supabase table or external).

---

## P10. Frontend re-renders during job polling

**Where** Polling hooks update React Query cache on every status check.

**Impact** Heavy re-render churn while waiting for long jobs.

**Fix** Throttle React Query revalidation; use a sentinel state machine ("queued → starting → processing → succeeded/failed") with controlled UI updates.

---

## P11. Bundle size — Lovable + shadcn = heavy

**Where** Loading `@radix-ui/*`, `framer-motion`, `recharts` etc. pulls a large JS bundle.

**Impact** First-load latency on mobile.

**Fix**
- Audit bundle with `vite-bundle-visualizer`.
- Lazy-load heavy components (e.g., recharts only on the analytics page).
- Tree-shake unused Radix primitives.

---

## P12. Two backend stacks duplicate work

**Where** Next API + Supabase Edge functions.

**Impact** Both consume API quotas; both must be kept in sync. Bug fixes must be applied twice.

**Fix** Pick Next API (already integrated with React app), retire Supabase Edge functions for music logic. Keep Supabase for Postgres + Storage only.

---

## Priority for ops fixes

1. **P1** — async ElevenLabs (avoids hard timeouts).
2. **P5** — quality auto-reroll (single biggest UX lift).
3. **P9** — telemetry (foundation for all future optimization).
4. **P4** — caching (cost reduction).
5. **P2** — parallel audio + video (UX latency reduction).
6. **P12** — backend consolidation (long-term maintenance).
