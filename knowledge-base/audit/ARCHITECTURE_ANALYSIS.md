# Architecture Analysis

> Side-by-side: the architecture as-is vs. the architecture we want. The gap is the to-do list.

---

## Current architecture (as-is)

```
[user form] → [creative-context state]
                │
                ▼
[ POST /api/generate ]
                │
                ▼
[ qualityRouter.ts ] picks: ace-step | stable-audio | elevenlabs-music | tts-mix
                │
                ▼
[ promptBuilder.ts ] builds 1-2 sentence prompt   ← thin
                │
                ▼
[ Replicate / ElevenLabs API call ]
                │
                ▼
[ poll /api/generate/status ]
                │
                ▼
[ audio file URL ] ──→ user
                │
                ▼
[ optional /api/video ] → canvas visualizer (no beat sync)
```

Issues:
- No planning before model call.
- No critique after model call.
- Video runs independently of audio analysis.
- Two separate backend stacks (Next + Supabase).

---

## Target architecture (to-be)

```
[user brief]
        │
        ▼
[ INTENT INFERENCE ] resolves: genre, mood, audience, occasion, language, references
        │
        ▼
[ COMPOSITION PLANNER ] (consults knowledge base)
   - genre DNA               ← GENRE_KNOWLEDGE_BASE.json
   - chord progression       ← CHORD_EMOTION_DATABASE.json
   - arrangement archetype   ← ARRANGEMENT_PATTERNS.json
   - emotional arc           ← MUSIC_NEUROSCIENCE_ENGINE.md retention model
   - motif / hook plan       ← MUSIC_THEORY_ENGINE.md §10
   - voice direction         ← genre vocal_traits
   - mix targets             ← AUDIO_BALANCE_RULES.json
   - visual aesthetic        ← VISUAL_STYLE_KNOWLEDGE_BASE.json
        │
        ▼
[ COMPOSITION PLAN (JSON) ] — single source of truth for everything downstream
        │
        ├──────────────────────────┬──────────────────────────────┐
        ▼                          ▼                              ▼
[ LYRIC AGENT ]         [ AUDIO PROMPT BUILDER ]       [ VIDEO PROMPT BUILDER ]
                                   │                              │
                                   ▼                              │
                        [ MODEL CALL: Replicate /                 │
                          ElevenLabs / etc. ]                    │
                                   │                              │
                                   ▼                              │
                        [ rendered stereo audio ]                 │
                                   │                              │
                                   ▼                              │
                        [ POST-RENDER ANALYZER ]                  │
                          - LUFS measurement                       │
                          - tonal balance check                    │
                          - dynamic range check                    │
                          - clipping check                         │
                          - tempo / key estimation                 │
                          - section detection                      │
                                   │                              │
                                   ▼                              │
                        [ MIX-CRITIQUE AGENT ]                    │
                          if score < threshold → re-prompt         │
                          else → continue                          │
                                   │                              │
                                   ▼                              │
                        [ POST-RENDER MASTER ]                    │
                          - corrective gain to LUFS                │
                          - true-peak limiter                      │
                          - optional saturation                    │
                                   │                              │
                                   └────────────┬─────────────────┘
                                                ▼
                                  [ AUDIO-VISUAL SYNC ENGINE ]
                                  - beat grid from audio analysis
                                  - section boundaries
                                  - cut-rhythm plan
                                  - color palette evolution
                                  - camera motion plan
                                                ▼
                                  [ VIDEO RENDERER ]
                                  (canvas backend OR Replicate video model)
                                                ▼
                                  [ FINAL ASSETS ]
                                  audio (mp3 / wav) + video (mp4) + lyrics + cover
                                                ▼
                                            [ user ]
```

---

## Key architectural shifts

### 1. Single Composition Plan as source of truth
Currently, `qualityRouter`, `promptBuilder`, `composition-engine`, and `video-generator` each compute their own version of the same intent. They drift.

**New** A single `CompositionPlan` JSON object derived once and consumed by every downstream stage. Schema:

```ts
interface CompositionPlan {
  brief: { mood, genre, audience, language, occasion, references? }
  resolved: {
    genreId: string                   // key into GENRE_KNOWLEDGE_BASE
    bpm: number
    key: string                       // e.g. "F"
    mode: string                      // e.g. "harmonic-minor"
    timeSignature: string             // "4/4"
    progression: { id: string, romanNumerals: string[], voicing: string[] }
    archetypeId: string               // key into ARRANGEMENT_PATTERNS
    sections: ArrangementSection[]    // resolved section list
    motifs: Motif[]                   // 3-5 planned motifs
    emotionalArc: EmotionalArcStep[]  // section-by-section emotion
    vocal: { language, style, register, processing, harmonyStack }
    lyrics?: string                   // structured, with [tags]
    mixTargets: MixTargets            // from AUDIO_BALANCE_RULES
    visualAestheticId: string         // key into VISUAL_STYLE_KNOWLEDGE_BASE
    references: string[]              // 2-3 named tracks
    durationSeconds: number
  }
  prompts: {
    audio: string                     // assembled per-provider
    video: string
    lyrics: string
  }
  postRender?: {
    measuredLUFS: number
    qualityScore: number
    issues: string[]
  }
}
```

### 2. Pre-call planning + post-call critique
Currently the model output is final. We add:
- **Planner** before the call (composes the prompt deeply).
- **Critique** after the call (measures quality, decides whether to keep or re-roll).

### 3. Audio-visual sync as a real layer
Currently visual and audio diverge. The new sync engine analyzes the actual rendered audio (BPM, beats, energy, sections) and produces a frame-perfect plan for the video renderer.

### 4. Knowledge base as truth, code as consumer
Currently knowledge is duplicated in TS files (`genres.ts`, `tempo.ts`, `moods.ts`). The new approach: **all knowledge in `knowledge-base/data/*.json`**, TS files import and use them. One change to a JSON file updates all consumers.

### 5. Backend consolidation
Pick one: Next API routes OR Supabase Edge functions. Recommendation: Next API (already wired into the Vite app, simpler latency story). Migrate logic from Supabase functions into API routes; keep Supabase for DB only.

### 6. Telemetry first-class
Add structured logging with run IDs:
```
{ runId, stage: 'plan|prompt|generate|analyze|critique|master|video|done',
  provider, modelId, latencyMs, success, costUSD, qualityScore }
```
Without telemetry, we can't tell which models are best for which genres.

---

## Migration path (what to do, in order)

1. **Wire knowledge base into existing prompt builder** without replacing other systems. Immediate quality lift.
2. **Implement `intelligence/` modules** consuming the knowledge base:
   - `chord-progression-bank.ts`
   - `emotional-arc-planner.ts`
   - `motif-planner.ts`
   - `engagement-scorer.ts`
   - `audio-analyzer.ts`
   - `audio-visual-sync.ts`
3. **Add `composition-plan.ts`** that produces the unified plan and feeds it into existing prompt builders (additive, doesn't break existing flow).
4. **Add post-render analyzer + mastering chain.**
5. **Replace canvas video with sync-driven video.**
6. **Consolidate genres / prompt builders / backends.**
7. **Add telemetry + quality scoring + auto-reroll.**

Steps 1–4 give 80% of the quality lift with minimal architectural risk. Steps 5–7 are the long road.
