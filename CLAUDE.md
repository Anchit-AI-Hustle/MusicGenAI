# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm install
npm run dev              # Vite dev server on :8080
npm run build            # production build (vite build)
npm run build:dev        # development-mode build
npm run lint             # eslint .
npm run preview          # preview built bundle
npm test                 # vitest (watch by default)
npm run test:coverage    # vitest run --coverage (v8)
# run a single test file: npx vitest run src/lib/__tests__/foo.test.ts
# run by name pattern:    npx vitest -t "pattern"
```

Supabase CLI (project is linked to ref `vgmwpdktxsjaymdszvvn`):

```sh
npm run supabase:login
npm run supabase:link
npm run supabase:db:push
```

Node 20 is required (see `engines` in `package.json`). Deployments are handled automatically by Vercel's Git integration.

Both `package-lock.json` and `bun.lock`/`bun.lockb` are checked in. npm is canonical (`npm run …` scripts, Node-pinned `engines`); the Bun lockfiles exist for contributors who prefer Bun locally but are not the source of truth.

`verify-lyrics.ts` at the repo root is a standalone scratch script that exercises `generateDefaultLyrics`/`generateLyricCues` from `src/lib/vocal-engine`. Run it with `npx tsx verify-lyrics.ts` when debugging the lyric/cue generator; it isn't wired into the build, tests, or CI.

## Architecture

This is a Vite + React + TypeScript SPA (`src/App.tsx` mounts a single `Index` route under `BrowserRouter`) with a multi-tier backend made up of Vercel-style serverless routes, Supabase Edge Functions, and a Python microservice. The UI uses shadcn/ui + Tailwind, TanStack Query for data, and `@supabase/supabase-js` for auth/data. Path alias `@/*` → `src/*` is configured in `vite.config.ts`, `tsconfig*.json`, and `vitest.config.ts`.

### Generation pipeline (the core of the app)

User input flows through a deterministic intent layer before it ever hits a model:

1. **`src/engine/`** — pure-TypeScript intent engine. `intentBuilder` normalizes raw form input (via `normalizer` + Zod `schema`), runs `conflictResolver`, maps to model parameters (`parameterMapper`), and yields a `GenerationIntent`. `albumPlanBuilder` extends this to multi-track plans. `suggestEngine` powers the AI suggestion toolbar. Public surface is re-exported from `src/engine/index.ts` — prefer importing from there.
2. **`src/lib/intelligence/`** — higher-level composition/quality logic layered on top of the intent: `composition-plan`, `engagement-gate`/`engagement-scorer`, `emotional-arc-planner`, `master-pass`, `prompt-assembler`, and `telemetry` (the `newRun` / `withStage` / `record` run tracker used across API routes). Re-exported via `src/lib/intelligence/index.ts`.
3. **`src/lib/inference/`** — a parallel inference-side stack used when expanding raw descriptions into model-ready artifacts: `description-interpreter`, `composition-engine`, `lyric-engine`, `vocal-engine`, `prompt-builder`, and `model-vault`. Treat this as the read/expand counterpart to `src/lib/intelligence/`'s plan/score logic; check both before adding new prompt or composition code.
4. **`src/lib/`** — model adapters and audio tooling: `modelRouter` (ACE-Step / Stable Audio / Punjabi ACE-Step on Replicate), `elevenlabsMusic`, `qualityRouter` (selects fast vs. high-quality path), `ai-music-client`, `musicgen-browser` (in-browser MusicGen via `@huggingface/transformers`), `audio-engine` / `audioMixer` / `arrangement-engine` / `groove-engine` / `melody-generator` / `bassline-generator` / `drum-patterns` / `transition-engine`, `vocal-engine` + `src/lib/vocal/` (DiffSinger client + Whisper fallback), `video-generator`, and `rateLimiter`.

### Backend surfaces

- **`src/app/api/**/route.ts`** — route handlers (`generate`, `generate/status`, `suggest`, `lyrics`, `vocals`, `video`, `video/status`, `download`). They import from `next/server` (`NextResponse`) and use `@/lib/...`, but this project is **not** a Next.js app — there is no `next.config`, no `vercel.json`/`vercel.ts`, and the SPA is built by Vite. These files are deployed as Vercel Functions; Vercel's Git integration picks them up automatically from the `src/app/api/` convention. The main `generate` route orchestrates rate limiting → context parsing → `qualityRouter` → `modelRouter`/ElevenLabs → intelligence telemetry.
- **`api/debug-env.ts`** — a separate Vercel Function at the repo root (classic `(req, res) => …` handler signature, not the App Router style). It echoes Supabase env vars and runs a connectivity check against the `profiles` table. Keep it in sync with the env-var names used by `src/integrations/supabase/` when those change.
- **`supabase/functions/`** — Deno Edge Functions (`ai-suggest`, `analyze-music`, `generate-music`, `infer-context`) plus `_shared/universal-music-knowledge.ts`. Migrations live in `supabase/migrations/`. `src/integrations/supabase/` holds the generated client.
- **`python-services/vocal-service/`** — FastAPI vocal service (Dockerfile + `docker-compose.vocal.yml`). Called from `src/lib/vocal/diffsinger-client.ts`.

### Client state

Three React contexts under `src/contexts/` (`AuthContext`, `MusicContext`, `PlayerContext`) provide global state. Job/async work runs through hooks in `src/hooks/` (`useGenerationJob`, `useLocalSynth`, `usePostProduction`, `useSuggestion`). Pages live in `src/pages/`; UI primitives in `src/components/ui/` are shadcn-generated.

### Knowledge base

`knowledge-base/` contains long-form design docs (mixing/mastering engine, music theory engine, neuroscience engine, prompting guide, model roadmap). Consult these before changing the corresponding engines under `src/lib/` — they describe intended behavior that isn't obvious from the code.

### Build / runtime notes

- `vite.config.ts` sets `envPrefix: ["VITE_", "NEXT_PUBLIC_"]` so both prefixes are exposed to the client. The PWA plugin is active in all modes (manifest name "MuseVibe Studio").
- `lovable-tagger` runs only in `mode === "development"`.
- Tests use `jsdom` with setup file `src/test/setup.ts`; only `src/**/*.{test,spec}.{ts,tsx}` are picked up.
- `package.json` pins `spessasynth_core` to `3.26.6` via `overrides` — don't bump it without checking the local synth code in `src/lib/intelligence/local-synth` and `src/hooks/useLocalSynth.ts`.
