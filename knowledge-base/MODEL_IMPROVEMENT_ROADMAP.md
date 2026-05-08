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

## Tier 1 — Highest impact, low risk — ALL SHIPPED

### T1.1 ✅ Post-render LUFS measurement + corrective gain
- `src/lib/intelligence/master-pass.ts` — ITU-R BS.1770 K-weighted gated LUFS, 4× true-peak estimate, corrective gain capped at ±12 dB, optional brick-wall limiter at -1.0 dBTP. Pure WebAudio.
- `src/lib/intelligence/wav-encoder.ts` — encode mastered Float32 channels to a 16-bit PCM WAV.
- `src/hooks/usePostProduction.ts` — client hook that decodes audio (URL or `data:` MP3), runs the master pass against the plan's LUFS target, returns a mastered WAV blob URL plus loudness measurements.
- ffmpeg recipes (`ffmpegLoudnormPass1`/`ffmpegLoudnormPass2`) included for the future server-side worker (T2.1).

### T1.2 ✅ Auto-reroll / engagement gate
- `src/lib/intelligence/engagement-gate.ts` — when a plan scores below 65, applies issue-driven plan rewrites (shorten intro, sharpen energy contrast, push peak to final third, retune surprise ratio, ensure motifs, assign progression to all sections, boost final-third peak) and re-scores. One rewrite per request — cost-capped.
- Wired into `src/app/api/generate/route.ts`. Response now exposes `quality.score`, `quality.rewrites`, and `quality.issues`.

### T1.3 ✅ Beat-grid detection + video sync
- `src/lib/intelligence/audio-analyzer.ts` — radix-2 FFT, spectral-flux onset detector with adaptive threshold, autocorrelation tempo estimator (60–200 BPM, perceptual halving/doubling), DP-light beat tracker, downbeat picker. Outputs `BeatGrid { bpm, beats[], downbeats[], onsets[], energyEnvelope }`.
- `src/lib/intelligence/video-sync-bridge.ts` — converts `BeatGrid` + optional `SyncPlan` into a per-frame beat-strength `Float32Array` aligned to the existing canvas renderer.
- `src/lib/video-generator.ts` extended with `precomputedBeatStrengths?: Float32Array` parameter. When present, overrides the local heuristic detector.
- `usePostProduction` returns `beatStrengthsPerFrame` ready to pass straight into `generateVideoFromAudio`.

### T1.4 ✅ Telemetry
- `src/lib/intelligence/telemetry.ts` — per-stage `withStage()` and `record()` helpers. Logs to console always; optional `TELEMETRY_SINK_URL` env for fire-and-forget HTTP shipping. Each request gets a `runId`. Stages: `request-received → rate-limit-check → plan-build → plan-score → plan-rewrite → model-call → respond` (or `error`).
- `summarizeRun(ctx)` returns a serializable object that's now included in `/api/generate` responses for client-side debugging.

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
