# Advanced Prompting Guide

> How to write prompts that produce music. Not "lofi beat please". Music-direction-grade specifications.

The current prompts in `src/lib/promptBuilder.ts` are flat — they list a genre, a mood, a tempo, and call it done. The model has to invent everything else, badly.

A good prompt is a **complete specification a session musician could read**. It tells the model:
- exactly what tempo
- exactly what key and mode
- exactly what time signature
- exactly which chord progression family
- exactly which instruments and their roles
- exactly what the song structure is
- exactly what reference tracks to emulate
- exactly what *not* to do

---

## 1. Universal prompt skeleton

Every prompt to a music model should have these slots, in this order:

```
[GENRE + SUBGENRE] + [BPM] + [KEY + MODE] + [TIME SIG]
[STRUCTURE: section list with bar counts]
[INSTRUMENTATION: layered by importance]
[GROOVE: rhythm signature, swing, sidechain]
[VOCALS: language, register, style, processing, harmonies]
[PRODUCTION TRAITS: 3-5 specific traits]
[REFERENCE TRACKS: 2-3 named tracks, real]
[MIX TARGET: LUFS, stereo width, key tonal traits]
[EMOTIONAL ARC: section-by-section feel]
[CONSTRAINTS: what NOT to do]
```

Not every model honors every slot, but the better the model, the more slots are read.

---

## 2. Genre-loaded vs. genre-vague

**Bad** `"upbeat pop song"`
**Better** `"K-pop chorus, 120 BPM, A minor, 4/4, four-on-the-floor kick with stacked vocal harmonies"`
**Best**
```
K-pop dance track, BPM 120, key A minor (with bIII modal flips for the bridge),
4/4. Structure: 8-bar intro (synth pluck + filter sweep) → 16-bar verse-1 (sparse trap drums + bass + lead vocal)
→ 8-bar pre-chorus (ascending melody, snare roll build) → 16-bar chorus
(four-on-the-floor + supersaw stack + 4-voice harmony lead vocal in chorus stack) ...
Reference tracks: "How You Like That" by BLACKPINK for production polish; "Dynamite" by BTS
for chorus stack vocal arrangement. LUFS -7 integrated, mono lows below 120 Hz, stereo synth
spread, bright 12 kHz air shelf.
```

Models like Stable Audio, ACE-Step, ElevenLabs Music respond measurably better to the longer prompt — they have learned associations to reference tracks and production-style language.

---

## 3. Provider-specific prompt grammar

Different models have different prompt grammars. Use the right one.

### 3.1 Stable Audio (Replicate)
- Wants comma-separated **descriptors and tags**, not narrative.
- Length cap ~512 chars.
- Strong response to BPM, instrument, era, mood tags.
- Weak vocal generation — prefer instrumental.

**Template**
```
{genre}, {subgenre}, {bpm} BPM, {mood}, {key} {mode}, {primary instruments comma-list},
{groove descriptor}, {production-trait descriptor}, {era descriptor}, {reference-style descriptor},
high quality, {stereo and dynamic descriptors}
```

**Example (deep house)**
```
deep house, 122 BPM, melancholic warm, A minor, four-on-the-floor kick, warm analog bass,
Rhodes piano stabs, soulful vocal chop, Dixon and Black Coffee influence, 2020s Innervisions
label sound, dynamic, wide stereo, 24-bit lossless feel, high quality
```

### 3.2 ACE-Step
- Wants **paragraph-style** prompt with explicit lyrics if vocals.
- Honors structure, language, and BPM.
- Best with lyrics provided, language tag, vocal-style instruction.

**Template**
```
[Genre + production style description].
[BPM and key].
[Vocal style + language explicit].
[Lyrics in [verse], [chorus], [bridge] format].
```

**Example (Punjabi pop)**
```
Modern Punjabi pop song with dhol percussion accents, electronic production, melodic
romantic vocals. 120 BPM in F harmonic minor, 4/4 time signature.
Male Punjabi vocal, mid-register, slight auto-tune, romantic delivery.
[verse]
{lyrics}
[chorus]
{lyrics}
[bridge]
{lyrics}
```

### 3.3 ElevenLabs Music
- Wants **natural-language description** with style hint.
- Limited to ~1000 chars. Long prompts hurt.
- Best with reference-style hints ("in the style of...") and clear vocal direction.

**Template**
```
{1-sentence genre summary} in the style of {era/region}, {bpm} BPM, {mood + emotional arc},
{vocal direction including language and processing}, {3-4 production traits}.
```

### 3.4 MiniMax / Suno-style
- Long prompts work.
- Wants **emotional and narrative language** plus structural cues.
- Honors mood, tempo, genre, lyrics, and references.

**Template** Full master prompt (slot 1).

---

## 4. Anti-prompts (negative direction)

Most music models do not have a formal negative-prompt slot, but they read **explicit "no X"** instructions in-line. Use them to rule out common misfires.

| Genre | Use |
|---|---|
| Lo-fi | "no compressed master, no bright high-end, no auto-tune" |
| Acoustic folk | "no synthesizer, no electronic drums, no auto-tune" |
| Classical | "no compression, no electric instruments, no drums" |
| Drill | "no major key, no festival drop, no four-on-the-floor" |
| EDM | "no acoustic guitar, no live drums, no whispered vocals" |
| Ambient | "no kick drum, no clear structure, no vocals with words, no compression" |
| Jazz | "no auto-tune, no quantized drums, no compressed master" |

---

## 5. Reference-track prompting (the cheat code)

Naming **real reference tracks** in the prompt does more than any descriptor list. The models have learned associations from massive training data. Use 1–3 references.

**Pattern** "in the style of [Artist] — [Track], with [Element] from [Other Track]"

**Example** "Boom-bap hip-hop in the style of Nas — N.Y. State of Mind, with vocal flow from Mos Def — Mathematics, MPC swing and dusty sample loop."

For **legal safety**, never claim the output *is* by the artist — always frame as influenced by / in the style of.

---

## 6. Lyric prompting

Lyrics deserve their own prompt slot when generating with vocals.

### Lyric structure cues
Use bracketed structural tags so the model knows where lyrics belong:
```
[intro]
[verse 1]
{4 lines}
[pre-chorus]
{2 lines}
[chorus]
{4 lines}
[verse 2]
{4 lines}
[chorus]
{4 lines}
[bridge]
{2 lines}
[final chorus]
{4 lines + ad-libs}
[outro]
```

### Cadence-aware lyric writing
The lyric agent (`src/lib/inference/lyric-engine.ts`) should:
1. Map syllable count to bars (typical pop: 8–14 syllables per bar at 110–120 BPM).
2. Place stressed syllables on beats 1 and 3 (or 1 and 2-and).
3. Avoid more than 2 consecutive unstressed beats (creates awkward "tumble").
4. Rhyme on the **last stressed beat** of each line, not the last word.

### Theme and language fit
Different genres have different lyric grammars:
- **Hip-hop / drill** — first-person narrative, complex internal rhyme
- **Pop** — universal "you and me" language, simple imagery, repeated hook
- **Country / folk** — storytelling, place-grounded, no irony
- **R&B** — emotional vulnerability, sensory detail, ad-libs at section transitions
- **Rock** — anthemic statement + verse narrative
- **Indian classical / film** — devotional / romantic, ornamental phrasing in Hindi/Urdu/Punjabi

---

## 7. Re-prompt loops (refinement)

If the first generation is wrong, **don't re-roll blindly**. Edit the prompt to address the specific failure:

| Output failure | Prompt fix |
|---|---|
| Tempo too fast | Raise BPM hard floor: `"BPM exactly 120 — strict tempo"` |
| Wrong mode | Add `"in [Key] [mode] — strict mode"` |
| Vocal too breathy | Add `"chest-voice vocal, no falsetto"` |
| Mix too compressed | Add `"natural dynamics, minimal compression, dynamic range LU 8+"` |
| Too generic | Add 2 more reference tracks, more genre-specific descriptors |
| Wrong language | Restate language with explicit example: `"Punjabi only, e.g., 'tu mera dil hai'"` |
| Missing instrument | Promote it: `"prominent dhol throughout, 4-bar fills every 16 bars"` |
| Drums sound robotic | Add `"humanized timing offsets, ghost notes on hi-hat, sloppy swing"` |
| No emotional arc | Add explicit section-by-section feel: `"verse: somber → pre-chorus: yearning → chorus: triumphant"` |

---

## 8. Multimodal sync prompting (audio + video)

When the same brief generates audio AND video, the prompts should agree:
- Same genre, BPM, energy curve.
- Same emotional arc per section.
- Same color palette description (use hex codes from `VISUAL_STYLE_KNOWLEDGE_BASE.json`).

The `audio-visual-sync.ts` engine generates a unified `CreativeBrief` object that downstream prompt builders consume. Both prompts derive from the same brief — they don't recompute.

---

## 9. Prompt construction worksheet (the agent uses this)

When the user provides a high-level brief, the system builds the prompt in this order:

```
1. infer genre + subgenre        →  GENRE_KNOWLEDGE_BASE.json lookup
2. infer mood                    →  CHORD_EMOTION_DATABASE.json mood index
3. choose key + mode             →  composition rules
4. choose tempo                  →  genre band ± mood bias
5. choose time signature         →  genre default
6. choose progression(s)         →  CHORD_EMOTION_DATABASE indexes
7. choose arrangement archetype  →  ARRANGEMENT_PATTERNS.json
8. choose vocal style + language →  context
9. choose reference tracks       →  GENRE_KNOWLEDGE_BASE signature_songs
10. choose mix targets           →  AUDIO_BALANCE_RULES.json
11. write lyrics (if any)        →  lyric-engine
12. choose visual aesthetic       →  GENRE_KNOWLEDGE_BASE.video_aesthetic_id → VISUAL_STYLE_KNOWLEDGE_BASE
13. assemble per-provider prompt
```

Each step pulls from a knowledge file. No step is unsourced. No prompt slot is filled with "the model will figure it out."

---

## 10. Example: full master prompt (Punjabi drill)

**User brief** "Dark Punjabi drill song about hustling on the streets of Brampton, hard-edge"

**Resolved values**
- Genre: `punjabi-drill` (alias `desi drill`)
- BPM: 142 (band 138–148, dark mood → mid)
- Key: F harmonic minor (drill default phrygian color, harmonic minor adds Indian flavor)
- Time: 4/4
- Progression: `drill-classic` (i-v-VI-iv) in F harmonic minor → Fm Cm Db Bbm
- Archetype: `hip-hop-trap`
- Vocals: Punjabi rap, male, hard-edged, UK/Canadian street accent
- Reference: "So High" — Sidhu Moose Wala; UK drill production from Headie One
- Mix target: -8 LUFS, sub-heavy 50 Hz, narrow stereo lows

**Final ACE-Step prompt**:
```
Dark Punjabi drill song with hard-edge street narrative. UK drill production with Indian
melodic motifs — sliding distorted 808 bass between F and C, dark piano motif in F
harmonic minor with phrygian flavor. 142 BPM, 4/4. Syncopated drill drums with hi-hat
rolls, snare on beat 3 with deep reverb tail. Sparse arrangement, lots of space.
Influenced by: Sidhu Moose Wala — "So High" for vocal energy; Headie One drill production
for the 808 and drum work; M Huncho for melodic darkness. Male Punjabi rap vocal,
mid-low register, hard-edged delivery, UK/Canadian street accent. No auto-tune.
Mix target: bass-heavy 50 Hz, presence-forward vocal at 3 kHz, narrow stereo lows,
wide stereo for piano motifs and atmosphere. Loud master at -8 LUFS, true peak -1 dBTP.

[verse 1]
{lyrics about the Brampton streets}

[hook]
{4 lines + tag}

[verse 2]
{lyrics develop}

[hook]
{4 lines + ad-libs}

[outro]
{vocal tag fades}

Do NOT: generate happy major-key melody. Do NOT: festival-drop synths. Do NOT: female vocal.
```

This is the standard. Every prompt should be at this level of specification.
