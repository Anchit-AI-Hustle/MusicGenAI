# Music Quality Failures — Root Causes

> Why the current outputs feel weak. Each failure is mapped to a root cause and a fix path.

---

## F1. Output sounds like "AI music" instead of like a song

**Symptom** Listener says "you can tell it's AI."

**Root causes**
- Prompts don't specify reference tracks. Models default to a "centroid" of their training data, which sounds like an average instead of a style.
- No motif planning. Songs lack memorable repeated melodic ideas.
- No anticipation gradient. Drops/choruses arrive without buildup.
- Drums are perfectly quantized — no humanization, no swing, no ghost notes.
- Mix is over-compressed and lifeless.

**Fix path**
- Wire `data/PROMPT_TEMPLATES.json` into prompt builder.
- Add reference-track injection from `GENRE_KNOWLEDGE_BASE.signature_songs`.
- Implement motif-planner (`src/lib/intelligence/motif-planner.ts`).
- Add tension/release scheduling in arrangement engine.
- Post-process with corrective LUFS instead of crushing master.

---

## F2. Emotional flatness — "it doesn't make me feel anything"

**Symptom** Track is technically competent but emotionally inert.

**Root causes**
- No emotional arc planning. Energy curve is mathematical (sine wave or linear ramp), not narrative.
- Mode and chord selection are heuristic ("sad → minor"), not progression-aware ("yearning → Andalusian descent").
- Missing peak emotional payoff. The brain expects a highlight in the final third (Salimpoor's anticipation-peak research) and we don't deliver one.
- No bridge contrast. The whole song sits at one emotional temperature.

**Fix path**
- Implement `emotional-arc-planner.ts` consuming `MUSIC_NEUROSCIENCE_ENGINE.md` retention model.
- Use `CHORD_EMOTION_DATABASE.json` `emotion_to_progression_index` for nuanced selection (not just major/minor).
- Force an emotional peak in the final third (use `final-chorus` section with up-mod or harmony stack add).
- Force bridge to contrast (modal flip, key shift, or density drop).

---

## F3. Generic genre — "this could be anything"

**Symptom** Output for "punjabi pop" sounds like generic pop with maybe a tabla sample.

**Root causes**
- Genre knowledge is shallow. Just BPM + a few keywords.
- No region-specific instrumentation chain.
- No region-specific scale/mode (e.g., harmonic minor for Indian/Punjabi).
- No region-specific progression (Bollywood `Imaj7-vim7-IVmaj7-V`, not `I-V-vi-IV`).

**Fix path**
- Use `GENRE_KNOWLEDGE_BASE.json` per-genre block — primary instruments, key bias, progression IDs, signature songs.
- Inject signature reference tracks into prompt.
- For non-Western genres, route to specialized models when available (e.g., `PUNJABI_ACE_STEP_MODEL_ID` already in code path — extend to other regions).

---

## F4. Vocals sound robotic / detached / pitch-corrected to death

**Symptom** Vocals lack breath, soul, micro-pitch variation.

**Root causes**
- Prompts don't specify register or processing details.
- Cadence not aligned with melody. Lyric agent puts stresses on weak beats.
- Auto-tune applied uniformly even when not idiomatic to genre.

**Fix path**
- Use `PROMPT_TEMPLATES.json` lyrics-prompt scaffold with cadence rules.
- Implement syllable-stress-to-beat alignment in lyric engine.
- Per-genre auto-tune policy (drill/trap = subtle; lo-fi/folk = none; pop = light).
- For high-stakes vocals (Punjabi, Hindi, Bollywood), route to ElevenLabs TTS + instrumental ACE-Step instead of fully generative model.

---

## F5. Drops feel underwhelming

**Symptom** EDM/trap/drill drops don't hit.

**Root causes**
- No sub-drop layering.
- No silence beat before the drop.
- Sidechain not specified in prompt.
- Build doesn't telegraph the drop with risers.
- Drop arrives at non-power-of-2 bar count.

**Fix path**
- Inject `ARRANGEMENT_PATTERNS.json#edm-drop` rules into prompt.
- Force riser section in arrangement plan.
- Specify sidechain and sub-drop in prompt (`AUDIO_BALANCE_RULES.json#sidechain_bass_to_kick_db`).
- Quantize section boundaries to 8/16/32-bar grid.

---

## F6. Mix is muddy — frequencies fight each other

**Symptom** Vocals lost in mix, kick lost behind bass, "boomy" or "honky" feel.

**Root causes**
- No frequency budgeting prompt language.
- No post-render EQ correction.
- Models output stereo-bass that collapses on mono playback.

**Fix path**
- Inject mix-direction language from `MIXING_ENGINE.md` into prompts.
- Post-render: high-pass kick-only at 30 Hz, mono-sum below 120 Hz, gentle 200–400 Hz cut.
- Add `AUDIO_BALANCE_RULES.json` band budgets to prompt as constraints.

---

## F7. Loudness inconsistent across tracks

**Symptom** One track is -8 LUFS and feels loud, next is -16 LUFS and feels quiet.

**Root causes**
- Models output at variable LUFS based on prompt.
- No normalization step in pipeline.

**Fix path**
- Measure LUFS post-render (small Node lib or `ffmpeg -af loudnorm`).
- Apply corrective gain toward genre-typical target from `GENRE_KNOWLEDGE_BASE.json`.
- Optional limiter at -1.0 dBTP.

---

## F8. Songs end abruptly or fade poorly

**Symptom** Outro is weak; song just stops.

**Root causes**
- Prompts don't specify outro style.
- Models default to abrupt ending or hard fade.
- No `outro` section in archetype.

**Fix path**
- All archetypes in `ARRANGEMENT_PATTERNS.json` have `outro` sections.
- Inject explicit outro instruction: "fade out over 8 bars" or "vocal tag with single piano hit on final downbeat".

---

## F9. No memorable hook

**Symptom** Listener can't hum any part of the song after one play.

**Root causes**
- No motif planning. No repeated 4-bar idea.
- Hook is too long (>4 bars) — exceeds working memory.
- Hook melody covers more than a major 6th interval (unsingable).

**Fix path**
- Motif-planner enforces 2-bar or 4-bar hooks.
- Range cap on hook melody (≤ 9 semitones).
- Force hook to repeat ≥ 4 times in the song.
- Place hook within first 0:60.

---

## F10. Long-form pieces lose coherence

**Symptom** Tracks > 3 minutes lose direction by minute 4.

**Root causes**
- Models trained primarily on 30s–3min clips, lose coherence past that.
- No structural anchor (motif callback, key center).

**Fix path**
- For >4 min outputs, generate in segments with explicit structural prompt per segment.
- Use motif callback in final third.
- Or: cap default duration at 3 minutes for pop/EDM.

---

## F11. Bollywood / Indian / Arabic / non-Western outputs sound like Western pop with a token regional instrument

**Symptom** "Bollywood" prompt produces generic 4/4 pop with a tabla loop.

**Root causes**
- Models are heavily Western-trained.
- Prompts use Western genre conventions (verse-chorus, 4/4, 4-bar phrases).
- No raga / maqam awareness in prompt.

**Fix path**
- For Indian classical, use Indian arrangement form (`indian-classical-form` archetype).
- Use raga vocabulary in prompts ("Yaman raga", "Bhairav raga").
- Use Indian taal vocabulary ("teentaal 16-beat cycle", "rupak 7-beat").
- For Arabic, name the maqam ("Maqam Hijaz", "Maqam Bayati").
- Acknowledge model limitations (microtones not renderable) and flag in UI.

---

## F12. Output is too clean / loses character

**Symptom** Lo-fi / folk outputs sound polished and modern instead of dusty/intimate.

**Root causes**
- Default mix targets are pop-typical (loud, bright).
- Prompts don't include character keywords ("vinyl crackle", "tape saturation").

**Fix path**
- Per-genre mix targets enforce dynamics (lo-fi = -14 LUFS, folk = -14 LUFS).
- Prompt template injects character keywords from genre `production_traits`.
- Anti-keywords block "polished", "compressed", "bright" for lo-fi.

---

## How to use this document

When a generation fails, identify which `F*` it matches, then look at the fix path. Some failures share fixes; the priority list in `SYSTEM_AUDIT.md` is ordered by lift across all failures.
