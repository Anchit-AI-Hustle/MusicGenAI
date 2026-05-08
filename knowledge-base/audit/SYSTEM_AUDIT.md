# System Audit (2026-05-09)

> Snapshot of the existing repository measured against the target architecture in `../README.md`. This is what's there, what's broken, what's salvageable.

---

## Repository inventory

### Frontend
- **Stack** Vite + React 18 + TypeScript, Lovable-tagged components, Tailwind, shadcn/ui (Radix).
- **Entry** `src/App.tsx`, single-page app with React Router.
- **Forms** `AlbumTrackForm.tsx` collects creative context.
- **State** React Query for server state, local hooks for generation jobs.

### Backend (Next.js-style API routes inside Vite repo)
- `src/app/api/generate/route.ts` — orchestrates audio generation, picks a route via `qualityRouter.ts`, fans out to Replicate / ElevenLabs.
- `src/app/api/generate/status/route.ts` — Replicate job polling.
- `src/app/api/lyrics/route.ts` — lyric generation.
- `src/app/api/suggest/route.ts` — context suggestions.
- `src/app/api/video/route.ts` + `status/route.ts` — video generation.
- `src/app/api/vocals/route.ts` — TTS-style vocal generation.
- `src/app/api/download/route.ts` — final asset download.
- `api/debug-env.ts` — env probe.

### Supabase functions (parallel server)
- `supabase/functions/generate-music/index.ts`
- `supabase/functions/ai-suggest/index.ts`
- `supabase/functions/analyze-music/index.ts`
- `supabase/functions/infer-context/index.ts`
- `supabase/functions/_shared/universal-music-knowledge.ts`

There are **two parallel backend implementations** — Next API routes and Supabase Edge functions. This is the first audit finding.

### Music engine modules (already present, partial)
- `src/lib/promptBuilder.ts` — flat prompts, weak.
- `src/lib/musicData/genres.ts` — 36-genre database, surface-level.
- `src/lib/musicData/{moods, tempo, vocals, languages, artists}.ts` — supporting data.
- `src/lib/inference/composition-engine.ts` — basic key/scale/BPM picker, no chord planning.
- `src/lib/inference/lyric-engine.ts`
- `src/lib/inference/vocal-engine.ts`
- `src/lib/inference/prompt-builder.ts` — separate from `promptBuilder.ts` (duplication).
- `src/lib/arrangement-engine.ts` — section templates with energy curves (good skeleton).
- `src/lib/{drum-patterns, bassline-generator, melody-generator, groove-engine, transition-engine}.ts` — DSP-style generators (likely unused at runtime since output comes from Replicate models).
- `src/lib/audio-engine.ts`, `audioMixer.ts`, `audio-utils.ts` — WebAudio scaffolding.
- `src/lib/video-generator.ts` — canvas-based visualizer, audio-reactive but no beat-grid sync.
- `src/lib/genre-ontology.ts` — separate from `musicData/genres.ts` (duplication).
- `src/lib/qualityRouter.ts` — picks between ACE-Step / Stable Audio / ElevenLabs Music.
- `src/lib/modelRouter.ts` — submits Replicate jobs.
- `src/lib/elevenlabsMusic.ts` — ElevenLabs SDK calls.
- `src/lib/rateLimiter.ts` — IP-keyed rate limiting.

### Tests
- `src/lib/__tests__/{logic-layer, logic-layer-v2, multilingual}.test.ts` — basic unit tests.
- `src/tests/engine.test.ts`, `src/test/example.test.ts`.
- Coverage: low (no test for promptBuilder, no test for arrangement-engine).

### Engine v2 (separate)
- `src/engine/{albumPlanBuilder, conflictResolver, constants, intentBuilder, normalizer, parameterMapper, schema, suggestEngine, types}.ts` — looks like a parallel engine attempt (probably superseded).

### Supabase + Postgres
- `src/integrations/supabase/{client, types}.ts`.
- The repo includes a Supabase best-practices skill (`.agents/skills/supabase-postgres-best-practices/`), implying DB use, but actual schema/migrations are not visible.

### Misc
- PWA enabled (`vite-plugin-pwa`), dark mode (`next-themes`).
- Replicate, Anthropic SDK, ElevenLabs (custom client), and Supabase deps installed.

---

## What works

- ✅ Provider routing through `qualityRouter.ts` is sensible (picks ACE-Step for vocals + drill, Stable Audio for instrumentals, ElevenLabs Music when key is set).
- ✅ Genre database (`musicData/genres.ts`) is broader than most projects and includes regional genres.
- ✅ Arrangement engine has a real concept of energy curves and section types.
- ✅ Rate limiting and unique seed-per-request are in place.
- ✅ Lyric formatter, vocal engine, and prompt builder modules exist as scaffolding.
- ✅ Video generator is browser-side and renders something.

---

## What's broken or missing

### Music intelligence
1. **Prompts are flat.** `promptBuilder.ts` produces 1–2 sentence prompts. The model has to invent everything: arrangement, mix, dynamics, references. → Replace with the per-provider templates in `data/PROMPT_TEMPLATES.json` and the long master-prompt in `MUSIC_THEORY_ENGINE.md` §13.
2. **No chord-progression bank.** `composition-engine.ts` picks a key and scale but doesn't plan chord progressions. Without progressions, the model gets no harmonic instruction. → Wire `data/CHORD_EMOTION_DATABASE.json` into a `chord-progression-bank.ts`.
3. **No motif planning.** Memorable songs have 3–5 motifs developed across sections. We don't even have the concept. → Add `motif-planner.ts`.
4. **No emotional arc planning.** The arrangement engine has energy curves but they are math, not emotion. → Add `emotional-arc-planner.ts` that maps moods to section-by-section emotional descriptors.
5. **No tension/release scheduling.** No explicit anticipation gradient before drops/choruses.
6. **No voice-leading awareness.** Models invent voice leading; results often sound stacked rather than sung.
7. **Two genre databases.** `musicData/genres.ts` AND `genre-ontology.ts` AND `data/GENRE_KNOWLEDGE_BASE.json` (now). → Consolidate into one source.
8. **Two prompt builders.** `lib/promptBuilder.ts` AND `lib/inference/prompt-builder.ts`. → Pick one.

### Mix / master
1. **No post-render mix critique.** Generated audio goes straight to user.
2. **No LUFS measurement.** No way to know if output hits target loudness.
3. **No corrective gain or limiter** (despite being a 10-line task).
4. **No genre-typical EQ tilt** applied as fallback.
5. **No mono-bass enforcement** — outputs may be stereo all the way down.

### Video sync
1. **Canvas visualizer ignores beat grid.** `video-generator.ts` uses audio-reactivity (RMS/FFT envelopes) but does not detect or align to beats.
2. **No section-aware visual changes.** Visuals are uniform throughout the song.
3. **No lyric timing.** Even when lyrics exist, the visual ignores them.
4. **No color-emotion mapping.** Color is set per "style" then static — doesn't evolve with song mood arc.
5. **No cut-rhythm system.** Cuts happen on canvas redraws (60Hz), not on musical beats.
6. **Aesthetic styles hard-coded** in TS — no shared knowledge with prompt builder. → Wire `data/VISUAL_STYLE_KNOWLEDGE_BASE.json`.

### Quality evaluation
1. **No scoring of generated output.** No way to detect a bad generation and re-roll.
2. **No A/B comparison** between candidate generations.
3. **No regression testing** for genre-typical "feel".

### Ops / infrastructure
1. **Two backend stacks** (Next API + Supabase functions) doing overlapping work.
2. **No telemetry** — we don't know which routes succeed, which fail, how long each model takes, how often users re-roll.
3. **API keys in `.env`** committed to local copy (should be in `.env.example` only).
4. **No structured error taxonomy** — `console.error` everywhere, returned strings, no error codes.

### Documentation
1. No `CLAUDE.md` in the repo root explaining architecture.
2. No `ARCHITECTURE.md`.
3. No knowledge base — until now.

---

## Priority order to fix

1. **Wire knowledge base into prompts** (immediate: bigger uplift than any model change).
2. **Consolidate duplication**: pick one genre source, one prompt builder, one backend.
3. **Implement post-render LUFS measurement + corrective gain** (10-line task, big quality lift).
4. **Implement audio analyzer + beat-grid for video** (medium task, transforms video quality).
5. **Implement quality evaluator + auto-reroll on score failure** (medium task, biggest UX lift).
6. **Implement chord-progression / motif / emotional-arc planners** (big task, biggest creative lift).
7. **Add telemetry, error codes, monitoring** (ops hygiene).
8. **Build a real DSP mastering chain (server-side ffmpeg)** (long-term).

---

## What we've added in this pass

| New file | Purpose |
|---|---|
| `knowledge-base/README.md` | Index and operating principle |
| `knowledge-base/MUSIC_THEORY_ENGINE.md` | Theory bedrock |
| `knowledge-base/MUSIC_NEUROSCIENCE_ENGINE.md` | Listener science (validated vs. speculative) |
| `knowledge-base/MIXING_ENGINE.md` | Mix knowledge |
| `knowledge-base/MASTERING_ENGINE.md` | Master knowledge |
| `knowledge-base/VIDEO_SYNCH_ENGINE.md` | Audio-visual sync |
| `knowledge-base/ADVANCED_PROMPTING_GUIDE.md` | How to author prompts |
| `knowledge-base/data/GENRE_KNOWLEDGE_BASE.json` | 36 genres × deep DNA |
| `knowledge-base/data/CHORD_EMOTION_DATABASE.json` | Progressions ↔ emotions |
| `knowledge-base/data/ARRANGEMENT_PATTERNS.json` | Section templates with energy curves |
| `knowledge-base/data/PSYCHOACOUSTIC_RULES.json` | Bark bands, masking, LUFS targets |
| `knowledge-base/data/AUDIO_BALANCE_RULES.json` | Genre-specific EQ/comp targets |
| `knowledge-base/data/VISUAL_STYLE_KNOWLEDGE_BASE.json` | Visual aesthetics keyed to genres |
| `knowledge-base/data/PROMPT_TEMPLATES.json` | Per-provider prompt scaffolds |
| `knowledge-base/audit/*` | This audit and companion failure documents |

The TS engines that consume these files are scaffolded in `src/lib/intelligence/`. They are next on the implementation list.
