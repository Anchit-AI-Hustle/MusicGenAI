# MusicGenAI — Music Intelligence Knowledge Base

This directory is the **brain** of the platform. Everything in here is intentional, production-grade, scientifically grounded where possible, and honest about what is speculative.

The platform is not a "prompt → audio" wrapper. It is an end-to-end production studio modeled as a chain of specialized minds:

> **emotion → composition plan → arrangement → performance → production → mastering → cinematic synchronization**

Every model call, every prompt, every UI decision should consult these files. Nothing in this folder is decorative.

---

## How to use this knowledge base

| When you are... | Read first | Then |
|---|---|---|
| Authoring a new prompt | `ADVANCED_PROMPTING_GUIDE.md` | `PROMPT_TEMPLATES.json` |
| Adding a new genre | `GENRE_KNOWLEDGE_BASE.json` schema | `MUSIC_THEORY_ENGINE.md` cadence rules |
| Picking chords for a mood | `CHORD_EMOTION_DATABASE.json` | `MUSIC_THEORY_ENGINE.md` voice-leading |
| Planning a song structure | `ARRANGEMENT_PATTERNS.json` | `MUSIC_NEUROSCIENCE_ENGINE.md` retention curves |
| Mixing / mastering output | `MIXING_ENGINE.md` + `AUDIO_BALANCE_RULES.json` | `MASTERING_ENGINE.md` LUFS table |
| Generating video | `VIDEO_SYNCH_ENGINE.md` | `VISUAL_STYLE_KNOWLEDGE_BASE.json` |
| Debugging quality | `audit/MUSIC_QUALITY_FAILURES.md` | `audit/PERFORMANCE_BOTTLENECKS.md` |

---

## Index

### Audit & strategy
- [`audit/SYSTEM_AUDIT.md`](audit/SYSTEM_AUDIT.md) — what the repo currently does and where it fails
- [`audit/ARCHITECTURE_ANALYSIS.md`](audit/ARCHITECTURE_ANALYSIS.md) — current vs. target architecture
- [`audit/MUSIC_QUALITY_FAILURES.md`](audit/MUSIC_QUALITY_FAILURES.md) — root causes of weak musical output
- [`audit/VIDEO_QUALITY_FAILURES.md`](audit/VIDEO_QUALITY_FAILURES.md) — why visuals feel disconnected
- [`audit/PERFORMANCE_BOTTLENECKS.md`](audit/PERFORMANCE_BOTTLENECKS.md) — latency and quality bottlenecks

### Composition intelligence
- [`MUSIC_THEORY_ENGINE.md`](MUSIC_THEORY_ENGINE.md) — scales, modes, cadence, voice-leading, motif development
- [`data/GENRE_KNOWLEDGE_BASE.json`](data/GENRE_KNOWLEDGE_BASE.json) — 36 genres × deep DNA (chords, grooves, refs, mix targets)
- [`data/CHORD_EMOTION_DATABASE.json`](data/CHORD_EMOTION_DATABASE.json) — chords/progressions ↔ emotional response
- [`data/ARRANGEMENT_PATTERNS.json`](data/ARRANGEMENT_PATTERNS.json) — section templates with energy curves and time signatures

### Listener science
- [`MUSIC_NEUROSCIENCE_ENGINE.md`](MUSIC_NEUROSCIENCE_ENGINE.md) — validated findings vs. speculative claims, clearly separated
- [`data/PSYCHOACOUSTIC_RULES.json`](data/PSYCHOACOUSTIC_RULES.json) — masking, equal-loudness, roughness, perceptual bands

### Production
- [`MIXING_ENGINE.md`](MIXING_ENGINE.md) — gain staging, frequency separation, depth, width, sidechain
- [`MASTERING_ENGINE.md`](MASTERING_ENGINE.md) — LUFS targets per genre/platform, true-peak, tonal balance
- [`data/AUDIO_BALANCE_RULES.json`](data/AUDIO_BALANCE_RULES.json) — frequency-band budgets per genre, EQ rules

### Multimodal
- [`VIDEO_SYNCH_ENGINE.md`](VIDEO_SYNCH_ENGINE.md) — beat-grid, energy-curve, lyric-sync, color-emotion mapping
- [`data/VISUAL_STYLE_KNOWLEDGE_BASE.json`](data/VISUAL_STYLE_KNOWLEDGE_BASE.json) — visual styles ↔ genres + cinematic refs

### Generation
- [`ADVANCED_PROMPTING_GUIDE.md`](ADVANCED_PROMPTING_GUIDE.md) — how to author music-direction-grade prompts
- [`data/PROMPT_TEMPLATES.json`](data/PROMPT_TEMPLATES.json) — provider-specific prompt scaffolds

### Roadmap
- [`MODEL_IMPROVEMENT_ROADMAP.md`](MODEL_IMPROVEMENT_ROADMAP.md) — what to build next, in priority order

---

## Core principle: the system must think before it generates

Bad system: `prompt → model → audio`
Good system:

```
brief
  → intent inference (emotion, story, audience, occasion)
  → composition plan (key, mode, BPM, time sig, sections, energy curve)
  → arrangement (instruments per section, density, transitions)
  → motif & hook design (repeatable melodic ideas, payoff timing)
  → lyric writing (cadence-aligned, prosody-correct)
  → vocal direction (style, register, harmony stack, ad-libs)
  → producer prompt (genre-authentic refs, mix references)
  → model call (with LoRA / conditioning hints)
  → mix critique → mix correction
  → master critique → master correction
  → video plan (beat grid + energy curve + scene rhythm)
  → render
  → quality scorecard
  → optional re-roll on weakest section
```

Every step has a corresponding file or module. If a step has no knowledge backing, it produces noise.

---

## Honesty about limits

We use real research where it exists (Krumhansl, Huron, Patel, Levitin, Zatorre, Salimpoor) and clearly mark **speculative** claims. We do not invent neuroscience to sell a feature. Files use a `## Validated` / `## Speculative / heuristic` split.

Models we depend on (ACE-Step, ElevenLabs Music, Stable Audio, Replicate) are imperfect. Where the model cannot deliver, we either (a) compensate with smarter prompting, (b) compose post-hoc with our own DSP, or (c) flag the limitation. We never pretend.
