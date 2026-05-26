# MusicGenAI

AI-powered music generation app built with Vite, React, TypeScript, shadcn/ui, and Tailwind CSS.

## Local Development

This project is designed to run on Node.js 20.

```sh
npm install
npm run dev
```

## Scripts

```sh
npm run dev       # Vite dev server on :8080
npm run build     # vite build
npm run test      # vitest watch
npm run lint      # eslint .
```

## Deployment

Deployments are handled by Vercel's Git integration. Pushing to GitHub triggers Vercel preview or production deployments automatically based on your Vercel project settings.

## Environment variables

All env vars are read through `src/lib/env.ts` (handles both `VITE_*` and `NEXT_PUBLIC_*` prefixes and strips BOM / smart-quote pollution).

### Required

| Var | Purpose |
|---|---|
| `REPLICATE_API_TOKEN` | Used by `src/lib/modelRouter.ts` to submit ACE-Step / Stable Audio jobs |

### Optional providers

| Var | What it unlocks |
|---|---|
| `ELEVENLABS_API_KEY` | High-quality vocals via ElevenLabs Music + TTS path |
| `OPENAI_API_KEY` | Suggestion toolbar fallback |
| `GEMINI_API_KEY` | Description interpreter improvements |
| `PUNJABI_ACE_STEP_MODEL_ID` | Custom Punjabi vocal model — see below |

### Custom Punjabi ACE-Step model

Set `PUNJABI_ACE_STEP_MODEL_ID` to the slug of your fine-tuned Replicate model (format: `owner/model-name`). Example:

```
PUNJABI_ACE_STEP_MODEL_ID=anchittandon/punjabi-ace-step-v2
```

When set and `vocalLanguage === "Punjabi"`, the generator routes through this fine-tune via `submitPunjabiAceStepJob` in `src/lib/modelRouter.ts`. When unset, it falls back gracefully to the standard ACE-Step model with a console warning — no user-visible error.

### Telemetry (optional)

| Var | Purpose |
|---|---|
| `TELEMETRY_SINK_URL` | If set, every `withStage` call POSTs run events to this URL |
| `TELEMETRY_DISABLE_CONSOLE` | Set to `1` to silence the `[tlm]` console logs |

## Architecture

See `CLAUDE.md` for a full architectural map. The short version:

```
User input
  → src/engine/ (deterministic intent normalizer)
  → src/lib/intelligence/ (composition/quality plan)
  → src/lib/inference/ (description/lyric/vocal engines)
  → src/lib/modelRouter.ts (Replicate provider call)
  → ElevenLabs / ACE-Step / Stable Audio / MusicGen
  → src/lib/audioMixer.ts (post-production)
  → playback in PlayerContext
```

The 7-provider LLM cascade (OpenAI → Anthropic → Gemini → xAI → Groq → Cerebras → Ollama) is consumed via `src/lib/intelligence/` when extending the suggestion toolbar; for now it lives in `The-Third-Eye/frontend/src/lib/llmCascade.ts`.
