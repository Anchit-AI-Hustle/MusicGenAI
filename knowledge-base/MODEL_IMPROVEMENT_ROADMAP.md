# Model & System Improvement Roadmap

> Ordered by impact, not alphabetically. Each item lists the lift, the cost, and the risk.

---

## Tier 0 — Already done in this pass

- ✅ Knowledge base authored (`knowledge-base/`).
- ✅ TypeScript intelligence engine (`src/lib/intelligence/`):
  - genre lookup (`genre-knowledge.ts`)
  - chord progression bank (`chord-progression-bank.ts`)
  - emotional arc planner (`emotional-arc-planner.ts`)
  - composition plan builder (`composition-plan.ts`)
  - prompt assembler (`prompt-assembler.ts`)
  - engagement scorer (`engagement-scorer.ts`)
  - audio-visual sync planner (`audio-visual-sync.ts`)
- ✅ Legacy `promptBuilder.ts` rewritten as a thin wrapper — every existing caller automatically receives music-direction-grade prompts.

---

## Tier 1 — Highest impact, low risk

### T1.1 Post-render LUFS measurement + corrective gain
**Lift** Removes loudness inconsistency (one of the most-noted "AI-generated" tells).
**Cost** ~1 day. Use `ffmpeg -af loudnorm=I=...` server-side, or a small WebAudio-based meter for browser preview.
**Risk** Low. Pure post-process.
**File** New `src/lib/intelligence/master-pass.ts` consuming `MASTERING_ENGINE.md`.

### T1.2 Auto-reroll on engagement score < threshold
**Lift** Catches structurally-broken plans before reaching the user. Doubles average quality.
**Cost** ~2 days. Wire `engagement-scorer.ts` into `/api/generate`. On score < 65, inject the listed `issues` as anti-prompts and re-roll once. Cap at one re-roll for cost.
**Risk** Medium — model failure modes that don't surface in the score will still slip through.
**File** Update `src/app/api/generate/route.ts` orchestration.

### T1.3 Beat-grid detection + frame-perfect video sync
**Lift** Transforms video quality. Cuts on beats feel professional; cuts on amplitude feel amateur.
**Cost** ~3–5 days. Implement `audio-analyzer.ts` (browser WebAudio + autocorrelation) and rewire `video-generator.ts` to read from `audio-visual-sync.ts` SyncPlan instead of running its own redraw loop.
**Risk** Medium. WebAudio analysis is CPU-heavy on mobile.
**Files** New `src/lib/intelligence/audio-analyzer.ts`; refactor `src/lib/video-generator.ts`.

### T1.4 Telemetry — per-stage latency, cost, success
**Lift** Foundational for every later optimization. We can't tune what we don't measure.
**Cost** ~1 day for the simplest path (Supabase table + small client logger).
**Risk** None.
**File** New `src/lib/intelligence/telemetry.ts`.

---

## Tier 2 — High impact, medium effort

### T2.1 Server-side mastering chain (ffmpeg)
**Lift** Consistent commercial-grade master. Frees us from "trust the model".
**Cost** ~1 week. Set up Vercel/Railway worker with ffmpeg + sox; chain LUFS normalization, multi-band gentle glue, true-peak limiter.
**Risk** Medium — bumps deploy footprint.

### T2.2 Stem-separated re-mix
**Lift** Allows independent EQ / sidechain / pan corrections per source after model output.
**Cost** ~1 week. Use Demucs or Spleeter to split into 4 stems (vocals/drums/bass/other), apply per-stem EQ from `AUDIO_BALANCE_RULES.json`, recombine.
**Risk** Medium — separation quality varies; can cause artifacts on loud mixes.

### T2.3 Lyric forced-aligner
**Lift** Word-level lyric timing for lyric videos and karaoke modes. Alignment is the gold standard for sync.
**Cost** ~3 days. Integrate `whisperx` or `aeneas` server-side; pipe `[{word, startMs, endMs}]` to the renderer.
**Risk** Low.

### T2.4 Replace canvas-only video with hybrid pipeline
**Lift** When user wants real footage (people, places, narrative), invoke a Replicate / Pika / Runway video model; canvas fallback only for visualizer aesthetics.
**Cost** ~1–2 weeks. Need a video-prompt-builder per provider, plus stitching of multiple short clips into a song-length sequence.
**Risk** High — video models are expensive and slow; need careful UX (progress, retry, placeholder).

### T2.5 Genre-specific specialized models / LoRAs
**Lift** Authentic Indian classical, Arabic, Punjabi, Bollywood — areas where general-purpose models fail.
**Cost** ~2–4 weeks per genre. Need a fine-tuning dataset and infrastructure (Replicate or Modal).
**Risk** High — copyright in training data is a real concern; need to use licensed corpora.

---

## Tier 3 — Long term

### T3.1 Composition-first pipeline (Suno-grade)
**Lift** Closes the gap with Suno/Udio. Train (or fine-tune) a model that conditions on the structured `CompositionPlan` rather than free-text prompt — so structure, key, BPM, and motifs are honored exactly.
**Cost** Months. Requires data engineering, training infra, evaluation harness.
**Risk** Very high. Most teams attempting this don't ship.

### T3.2 Real-time iterative generation with user feedback
**Lift** User listens to first 30s, says "more bass / less reverb / change to minor", we regenerate from that point.
**Cost** ~1 month if model supports continuation; otherwise requires segment re-generation and crossfade DSP.

### T3.3 Multi-agent orchestrator
**Lift** Each stage handled by a specialized prompted LLM agent (Genre Expert / Composer / Hook / Lyrics / Mix Critique / Video Director). Parallelizable, easier to reason about, easier to swap individual agents.
**Cost** ~1 month to set up; ongoing cost to refine each agent's prompt.
**Risk** Medium — orchestration overhead; LLM cost adds up.

### T3.4 Personalized models per user
**Lift** "More like the last track I made / less like the one I rejected" — user-conditional personalization.
**Cost** Months. Needs preference data, embedding system, and UX for thumbs-up/down.

---

## Track everything that ships

For every Tier task we ship, update `audit/SYSTEM_AUDIT.md` "What we've added in this pass" section. The audit is a living document.
