# MusicGenAI (MuseVibe Studio) — Replication Guide

AI music generation studio: turns a text song description into a deterministic composition plan, then routes it to multiple music/lyrics/vocal/video providers.

**Last updated:** 2026-06-20
**Live URL:** None documented in repo (PWA app name: "MuseVibe Studio").
**Deploy target:** Vercel via Git integration (push to GitHub → automatic preview/production deploy). No `vercel.json` at root — Vercel auto-detects the Vite build and the `src/app/api/` + root `api/` functions.

---

## 1. Current-state snapshot

### Stack
- **Frontend:** Vite 5 + React 18 + TypeScript SPA (single React Router route `/` → `Index`). shadcn/ui + Radix + Tailwind, TanStack Query, framer-motion, recharts, sonner. PWA (vite-plugin-pwa, manifest "MuseVibe Studio"; PWA disabled on apostrophe paths). Node 20.
- **Backend (3 tiers):**
  - Vercel Functions under `src/app/api/` (+ root `api/debug-env.ts`).
  - Supabase (Postgres + Auth + Deno Edge Functions), project ref `vgmwpdktxsjaymdszvvn`.
  - Python FastAPI vocal microservice (`python-services/vocal-service/`, `docker-compose.vocal.yml`).
- **Determinism layer:** `src/engine/` (zod schema → normalizer → conflict resolver → intent builder → parameter mapper → album/suggest builders) and `src/lib/intelligence/composition-plan.ts` as the single source of truth feeding per-provider prompt assembly.

### Surfaces — pages & endpoints
| Surface | Type | Purpose |
|---|---|---|
| `/` → `Index` | Page | Single SPA route (all UI) |
| `POST /api/generate` | Function | Main orchestrator: rate limit → composition plan → engagement gate → quality router → provider call |
| `GET /api/generate/status?jobId` | Function | Poll generation job status |
| `POST /api/suggest` | Function | Creative suggestions (HuggingFace Llama 3.1) |
| `POST /api/lyrics` | Function | Lyrics generation |
| `POST /api/vocals` | Function | Vocal synthesis |
| `POST /api/video` | Function | Music video generation |
| `GET /api/video/status` | Function | Poll video job |
| `GET /api/download` | Function | Asset download |
| `GET /api/debug-env` | Function (root `api/`) | Env diagnostics |
| Supabase Edge (Deno) | Functions | `ai-suggest`, `analyze-music`, `generate-music`, `infer-context` (+ `_shared/universal-music-knowledge.ts`) |

### What works now
Deterministic intent → composition plan pipeline; per-provider prompt assembly (ACE-Step, Stable Audio, ElevenLabs, Minimax "Master Blueprint"); lyrics + video prompt builders; suggest endpoint (Llama 3.1); Supabase integration + edge functions; local synth (spessasynth MIDI) and DiffSinger vocal path; vitest test setup; CI via GitHub Actions + Dependabot.

### Recent progress (from `.git/logs/HEAD`; live `git log`/`status` could not be captured — Bash was denied this session)
- `341a754` Centralize env access via `src/lib/env.ts`; disable PWA for apostrophe paths
- `c8f6afb` Fill-all-fields: regenerate lyrics + seed artist; force vocal synth
- `6141930` README env var docs incl `PUNJABI_ACE_STEP_MODEL_ID`
- `b81b63e` ci: GitHub Actions + Dependabot
- (+ merge / `pull --tags` commits; earliest visible `f172ca5` "G")
- **Working-tree status:** unverified (Bash denied). Run `git status -s` to confirm clean/dirty.

---

## 2. Clone-to-exact-state runbook

```bash
# 1. Clone
git clone https://github.com/Anchit-s-AI-Hustle/MusicGenAI.git
cd MusicGenAI

# 2. Node 20 (see .nvmrc) — install deps
npm install            # (bun.lock / bun.lockb also present if using bun)

# 3. Env — create .env with the vars in section 4 (repo .env is empty; secrets live in Vercel)

# 4. Run locally
npm run dev            # Vite dev server on http://localhost:8080

# Other scripts (from package.json)
npm run build          # vite build (production)
npm run build:dev      # vite build (development mode)
npm run preview        # preview built output
npm run lint           # eslint .
npm run test           # vitest (watch)
npm run test:watch     # vitest watch
npm run test:coverage  # vitest coverage
npm run supabase:login # supabase login
npm run supabase:link  # supabase link
npm run supabase:db:push  # supabase db push

# 5. Vocal microservice (optional)
docker compose -f docker-compose.vocal.yml up   # FastAPI vocal service

# 6. Deploy — push to GitHub; Vercel auto-builds (no vercel.json; Vite auto-detected)
```

### Definition of "replicated at the same level"
- `npm install` + `npm run dev` serves the SPA on :8080 with the single `/` route rendering.
- `npm run build` succeeds; `npm run lint` and `npm run test` pass.
- Env vars from section 4 are set (in `.env` locally / Vercel for deploy) — at minimum `REPLICATE_API_TOKEN` and the Supabase URL + anon key, or `/api/generate` and Supabase calls will fail.
- `/api/suggest` returns valid JSON suggestions (HuggingFace key set); `/api/generate` returns a job and `/api/generate/status` polls it.
- Supabase project linked (ref `vgmwpdktxsjaymdszvvn`) and edge functions deployed.

---

## 3. Environment variables (names only)

**AI / model providers**
- `REPLICATE_API_TOKEN` (required — ACE-Step / Stable Audio)
- `PUNJABI_ACE_STEP_MODEL_ID`
- `ELEVENLABS_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `HUGGINGFACE_API_KEY`

**Supabase**
- `NEXT_PUBLIC_SUPABASE_URL` / `VITE_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_PROJECT_ID` (`vgmwpdktxsjaymdszvvn`)

**Telemetry**
- `TELEMETRY_SINK_URL`
- `TELEMETRY_DISABLE_CONSOLE`

**Runtime**
- `NODE_ENV`

> Vite exposes only `VITE_*` and `NEXT_PUBLIC_*` to the client (`envPrefix` in `vite.config.ts`). Provider secrets are server-side (functions) only. Repo `.env` is empty/comments — real values live in Vercel.

---

## 4. Master prompts / Knowledge base

This is an AI/LLM app. The composition plan (`src/lib/intelligence/composition-plan.ts`) is assembled into per-provider prompt templates (`src/lib/intelligence/prompt-assembler.ts`, `knowledge-base/data/PROMPT_TEMPLATES.json`). Templates verbatim:

**ACE-Step**
```
{{genre.label}} song. {{production_traits[0:3]}}. [Influenced by: {{references}}.]
{{bpm}} BPM in {{key}} {{humanMode(mode)}}, {{timeSignature}}.
{{vocalRegisterLabel}} {{vocalLanguage}} {{vocalStyle}} vocal. {{vocalProcessing}}. [Or: Instrumental only — no vocals.]
[Lyrics block if present]
Do NOT: {{anti_keywords}}.
```

**Stable Audio** (≤510 chars)
```
{{genre.label}}, {{bpm}} BPM, {{key}} {{humanMode(mode)}}, {{groove_signature}}, {{instrumentation_layers[0:5]}}, {{production_traits[0:3]}}, [style of {{references[0:2]}}], stereo width {{stereoWidthPct}}%, mono lows below 120 Hz, {{lufsIntegrated}} LUFS integrated, high quality, 24-bit lossless feel. Do NOT: {{anti_keywords}}.
```

**ElevenLabs** (≤1000 chars)
```
{{genre.label}} song with {{mood}} mood [in the style of {{references[0:2]}}], {{bpm}} BPM, {{vocalLanguage}} {{vocalStyle}} vocals [or: instrumental — no vocals], {{production_traits[0:3]}}, mix at {{lufsIntegrated}} LUFS, mono bass below 120 Hz.
```

**Minimax "Master Blueprint"** (≤4000 chars)
```
[MASTER MUSIC GEN BLUEPRINT]
IDENTITY: {{mood}} {{genre.label}} track.
SPECS: BPM {{bpm}}; Key {{key}} {{humanMode(mode)}}; Time {{timeSignature}}; Duration {{durationSeconds}}s.
STRUCTURE: {{sections_with_bars_and_energy}}.
INSTRUMENTATION: {{instrumentation_layers}}.
GROOVE: {{groove_signature}}.
VOCALS: {{vocalStyle}} in {{vocalLanguage}}; processing {{vocalProcessing}}; harmony stack {{harmonyStackVoices}}. [Or: instrumental, no vocals.]
LYRICS: {{provided_or_instrumental}}.
INSPIRATION: {{references}} [or: —]
PRODUCTION: {{production_traits}}.
MIX TARGET: {{lufsIntegrated}} LUFS, true peak {{truePeakDb}} dBTP, stereo width {{stereoWidthPct}}%, mono below 120 Hz.
CHORDS: {{progressionRomanNumerals}} ({{progressionVoicingExample}}).
EMOTIONAL ARC: {{section_by_section_feel}}
CONSTRAINTS: do NOT {{anti_keywords}}.
[LYRICS: {{lyrics}}]
```

**Lyrics prompt** (`PROMPT_TEMPLATES.json` → `lyrics-prompt`)
```
Write lyrics for a {{genre}} song.
Theme: {{theme}}.
Language: {{language}}.
Mood arc: {{mood_arc}}.
Structure: {{structure}}.
BPM: {{bpm}} — keep syllable count near {{syllables_per_bar}} per bar.
Rhyme scheme: {{rhyme_scheme}} (e.g., ABAB for verse, AABB for chorus, free for bridge).
Reference vocal style: {{reference_artists}}.
Lyric grammar rules:
- Place stressed syllables on beats 1 and 3 (or 1 and 2-and).
- Avoid more than 2 consecutive unstressed beats.
- Rhyme on the last STRESSED beat of each line.
- Hook (chorus) must be memorable, repeated identically across choruses.
- Verse should narrate; chorus should crystallize emotion.
- Avoid forced rhymes and cliché filler ('yeah', 'oh baby') unless idiomatic to genre.

Do NOT use any banned phrases: {{banned_phrases_csv}}

Return lyrics in this exact format with section tags:
[intro]
[verse 1]
4 lines
[pre-chorus]
2 lines
[chorus]
4 lines (the hook)
[verse 2]
4 lines
[chorus]
4 lines
[bridge]
2-4 lines
[final chorus]
4 lines + ad-libs
[outro]
```

**Video prompt**
```
{{aesthetic.ai_image_keywords}}, {{section_climax_emotion}}, dominant color {{aesthetic.palette_dominant}}, support {{aesthetic.palette_support}}, accent {{aesthetic.palette_accent}}, {{aesthetic.lighting}} lighting, {{aesthetic.camera_archetype}} camera, {{aesthetic.lens_feel}} lens, [{{texture_overlay}} texture, film grain] [or: clean texture], {{bpm}} BPM, beat-synchronized cuts, delivery: {{deliveryTarget}}, {{resolution.width}}x{{resolution.height}} @ {{fps}}fps, cinematic, high detail, professional.
```

**Suggest API system prompt** (`src/app/api/suggest/route.ts` — Llama 3.1, temp 0.95, max 400 tokens)
```
You are an expert music producer. Analyze this song description and provide creative suggestions.
Song: {{description}}
Seed: {{uniqueSeed}}

Respond ONLY with valid JSON (no other text):
{
  "genre": "specific genre like UK Drill, Phonk, Hyperpop, Afrobeats",
  "mood": "emotional tone",
  "tempo": number between 70-170,
  "vocalLanguage": "English/Spanish/Punjabi/etc",
  "artistInspiration": "1 modern artist",
  "vocalStyle": "delivery style",
  "instrumentation": "3-4 key instruments",
  "lyricTheme": "narrative theme", 
  "videoStyle": "visual concept"
}

Be creative and unique.
```

### Knowledge base (`knowledge-base/data/`)
JSON domain banks: `GENRE_KNOWLEDGE_BASE`, `PROMPT_TEMPLATES`, `CHORD_EMOTION_DATABASE`, `VISUAL_STYLE_KNOWLEDGE_BASE`, `AUDIO_BALANCE_RULES`, `ARRANGEMENT_PATTERNS`. Plus `src/lib/intelligence/` modules: `genre-knowledge.ts`, `chord-progression-bank.ts`, `emotional-arc-planner.ts`, `engagement-gate.ts`, `master-pass.ts`, `telemetry.ts`. Supabase shared KB: `supabase/functions/_shared/universal-music-knowledge.ts`.

---

## 5. Common pitfalls

- **Not Next.js.** Despite `package.json` triggering a "next-upgrade" hook, this is Vite + React. Do not apply Next.js codemods/config.
- **`envPrefix` is `["VITE_","NEXT_PUBLIC_"]`** — only those reach the client. Server-only secrets (`REPLICATE_API_TOKEN`, etc.) must NOT be referenced with a public prefix.
- **Duplicated Supabase env names** (`NEXT_PUBLIC_*`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`) — env access is centralized in `src/lib/env.ts`; set the variants it reads.
- **PWA breaks on apostrophe paths** — the project root path itself contains apostrophes/spaces ("ANCHIT'S AI HUSTLE"); PWA is intentionally disabled for such paths (commit `341a754`). Service worker / `navigateFallback` denies `^\/~oauth`.
- **No `vercel.json`** — relies on Vercel auto-detection of Vite + functions; missing build/route config is intentional, not a gap.
- **`REPLICATE_API_TOKEN` required** for core generation; absent → `/api/generate` fails.
- **Loose TypeScript** (`noImplicitAny:false`, `strictNullChecks:false`) — type errors may be silent.
- **`spessasynth_lib` pinned via override to 3.26.6** — do not bump blindly.
- **Node 20 required** (engines + `.nvmrc`).

---

## 6. Where to look next

- `src/lib/intelligence/composition-plan.ts` — single source of truth for the plan that feeds every prompt.
- `src/lib/intelligence/prompt-assembler.ts` — how plan → per-provider prompt text.
- `src/engine/` — deterministic intent normalization (schema → normalizer → conflictResolver → intentBuilder → parameterMapper).
- `src/app/api/generate/` and `src/app/api/suggest/route.ts` — orchestration + suggest logic.
- `src/lib/modelRouter.ts`, `qualityRouter.ts`, `elevenlabsMusic.ts`, `musicgen-browser.ts`, `src/lib/vocal/` — provider/model adapters.
- `supabase/functions/` — Deno edge functions + `_shared/universal-music-knowledge.ts`.
- `knowledge-base/` — `.md` engine docs + `data/*.json` domain banks.
- `python-services/vocal-service/` + `docker-compose.vocal.yml` — DiffSinger vocal microservice.
- `src/lib/env.ts` — centralized env access (which exact names are read).
- `README.md`, `CLAUDE.md` — project-authored docs.
