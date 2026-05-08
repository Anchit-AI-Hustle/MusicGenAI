# Video Synchronization Engine

> Music videos that work feel like the visuals are *of* the music, not laid on top. This file is the bridge between audio analysis and visual composition.

The single biggest reason AI-generated music videos feel disconnected: the visuals run on their own clock, ignoring the song's beat grid, energy curve, structural sections, and lyrical content. Random particles bouncing around to a vague "audio reactivity" filter is not a music video.

A music video is **edited to the song**. We must do the same.

---

## 1. The audio analysis layer (what we extract from the rendered audio)

Before any visual decisions are made, we run analysis on the final audio:

| Feature | Method | Used for |
|---|---|---|
| **BPM** | onset-detection + autocorrelation | Beat grid, cut tempo |
| **Beat grid** | beat tracker (e.g., aubio, librosa-equivalent) | Frame-perfect beat alignment |
| **Downbeats** | downbeat tracker | Section boundaries, emphasis cuts |
| **Energy envelope** | RMS over short windows | Density modulation, particle energy |
| **Spectral centroid** | FFT mean | Hue / brightness mapping |
| **Spectral flux** | FFT delta | Transition detection (drops, builds) |
| **Onset density** | onsets per bar | Camera motion intensity |
| **Vocal presence** | mel-band 200-3kHz energy | Show subject vs. environment |
| **Section boundaries** | self-similarity matrix peaks | Scene transitions |
| **Tempo changes** | tempogram | Slow-mo, time-warp |
| **Chord changes** | chroma analysis (best-effort) | Color palette shifts |

We use a lightweight WebAudio + custom analysis chain in `src/lib/intelligence/audio-analyzer.ts` for browser-side, and `librosa` (server) for the offline pipeline.

---

## 2. The synchronization principles

### 2.1 The beat grid is law
Every cut, every flash, every camera-snap, every particle burst lands on a beat. Off-beat cuts feel sloppy. Use this hierarchy:

1. **Downbeat** (beat 1 of bar) — major scene change, hardest cut
2. **Beat 3** (often as strong as 1 in 4/4) — secondary cut
3. **Backbeat** (beats 2 and 4) — flash, kick, particle pop
4. **Off-beats** — texture, micro-motion
5. **16th-note grid** — strobe / glitch effects only

### 2.2 The energy curve drives intensity
Visual intensity (brightness, contrast, motion blur, particle count, camera shake) tracks the audio energy curve in real time. Quiet → low intensity. Build → ramp. Drop → max intensity for a beat, then sustain.

### 2.3 Section boundaries get architectural cuts
The audio has structural sections (verse, chorus, drop, bridge). Visual must reflect them. A chorus is a different visual *world* from the verse — different palette, different camera, different motion language.

### 2.4 Lyrical alignment when applicable
If the song has lyrics, the visual subject should be visible during vocal phrases. Hide the subject during instrumental sections; reveal them when they sing. Cuts that land on lyric phrase endings feel correct.

### 2.5 Color follows emotion
Each section's dominant color palette derives from the section's emotional tag (joy=warm, sad=cool, anger=red, calm=blue, mystery=purple/violet). Use the `VISUAL_STYLE_KNOWLEDGE_BASE.json` mapping.

---

## 3. The cut-rhythm system

Music videos have a cut tempo that correlates with song tempo and energy. From observation of professional music videos:

| Song energy | Cuts per bar (4/4) | Approximate seconds-per-cut at 120 BPM |
|---|---|---|
| Ambient / build (energy < 0.4) | 0.25 (one cut every 4 bars) | 8.0 s |
| Verse / mellow (energy 0.4–0.6) | 0.5 (one cut every 2 bars) | 4.0 s |
| Chorus / hook (energy 0.6–0.8) | 1 (one cut per bar) | 2.0 s |
| Drop / peak (energy 0.8–1.0) | 2 (one cut every 2 beats) | 1.0 s |
| Climax / strobe section | 4+ (one cut per beat or sub-beat) | 0.5 s or less |

**Implementation**: `src/lib/intelligence/cut-rhythm-planner.ts` consumes the section list and energy curve and emits a list of cut timestamps quantized to the beat grid.

---

## 4. Visual archetypes (parallel to musical archetypes)

| Visual archetype | Cinematic reference | Music match |
|---|---|---|
| **Performance shot** | "Rolling in the Deep" (Adele) | live performance feel — singer-songwriter, soul |
| **Narrative storytelling** | "Take On Me" (a-ha), "Bad Blood" (Swift) | pop with a story arc |
| **Stylized abstract** | Michel Gondry / "Around the World" (Daft Punk) | electronic / artistic |
| **One-take continuous** | "Black or White" (Jackson), Hozier "Cherry Wine" | intimate ballads, single subject |
| **City/location travel** | "Empire State of Mind" (Jay-Z) | hip-hop, regional pride |
| **Dance choreography** | K-pop, "Single Ladies" (Beyoncé) | dance-driven, K-pop, EDM |
| **Symbolic/surreal** | "California Gurls" (Perry), most Tame Impala | pop with concept |
| **Cinematic/film noir** | The Weeknd's videos | R&B / dark pop / synthwave |
| **Concert/festival POV** | EDM festival aftermovies | EDM / festival drops |
| **Anime/illustrated** | YOASOBI / J-pop | J-pop, anime tie-in |
| **Lyric/typography** | "lyric video" trend | mostly any genre, low-budget mode |
| **Audio visualizer** | abstract waveforms | ambient, electronic, lo-fi |
| **Bedroom/intimate** | bedroom-pop aesthetic | indie, lo-fi |
| **Documentary realism** | "Hurt" (Cash) | folk, country, alt |

The archetype is chosen by:
1. Genre fit (`VISUAL_STYLE_KNOWLEDGE_BASE.json`)
2. Mood fit
3. User override (UI dropdown)
4. Story-driven custom archetype if user provided a narrative brief

---

## 5. Color palette planning

Each section has a palette of 3–5 colors. Palette evolves across sections:
- **Verse** → muted, contained palette (3 colors, max chroma 60%)
- **Chorus** → expanded palette (5 colors, max chroma 90%)
- **Drop** → high-contrast palette (2 dominant + 3 accents, peak chroma)
- **Bridge** → contrasting palette (often complementary to chorus)
- **Outro** → fade to monochrome or back to verse palette

Palette principles:
- One **dominant** color (60% of frame area)
- One **support** color (25%)
- One **accent** color (10%)
- 1–2 **highlight** colors (5%)

Color-emotion conventions (cultural, see `MUSIC_NEUROSCIENCE_ENGINE.md` §B4):
- Red / orange — energy, passion, anger, warmth
- Blue / cyan — calm, sadness, longing, tech
- Green — balance, nature, growth
- Purple / violet — mystery, royalty, dreaminess
- Gold / amber — warmth, nostalgia, romance
- Black / white — drama, minimalism, contrast
- Pink / magenta — playfulness, romance, hyperpop

---

## 6. Camera motion language

Camera motion has emotional grammar:
- **Static** → stable, contemplative, intimate (verse, ballad)
- **Slow push-in** → growing intimacy / tension (pre-chorus)
- **Fast push-in** → impact arrival (drop, chorus opening)
- **Pull-out** → release, perspective, scale (bridge, climax fade)
- **Pan** → motion, journey (verse, narrative)
- **Track / dolly** → following subject, immersive (chorus, performance)
- **Whip pan** → punctuation, transition (cut into drop)
- **Handheld / shaky** → urgency, raw, indie (rock, punk, indie)
- **Steady / stabilized** → polish, premium (pop, k-pop)
- **Low angle** → power, dominance (rap, drill)
- **High angle** → vulnerability, sadness (ballad)
- **Dutch tilt** → unease, tension (drill, dark pop, horror score)
- **Crane / drone** → epic scale (cinematic, anthem)

Camera shake intensity tracks energy. At drops, peak shake. In ambient sections, no shake.

---

## 7. Lighting language

| Lighting | Mood |
|---|---|
| Key + fill (Hollywood standard) | safe, polished, pop |
| Single key (Rembrandt / film noir) | dramatic, R&B, ballad |
| High-key (bright, soft shadows) | happy, k-pop, j-pop, anime |
| Low-key (dark, hard shadows) | dark pop, drill, metal, horror score |
| Backlit / silhouette | mystery, romance, atmospheric |
| Color-gel (cyan/magenta) | synthwave, hyperpop |
| Practical lights (neon, screens) | cyberpunk, urban, hip-hop |
| Natural daylight | folk, country, indie |
| Strobe / pulsing | EDM drops, festival |
| Volumetric / haze | cinematic, film score, atmospheric |

---

## 8. Lyric synchronization (when lyrics exist)

For songs with vocals, the video should respect:
1. **Subject visibility during vocal phrases** — the singer (or their stand-in) should be visible when singing.
2. **Cut alignment with phrase endings** — cuts on the last word of a line feel natural.
3. **Symbolic visual when key lyric word appears** — "river" → river shot; "fire" → flame; "alone" → empty frame. Use sparingly to avoid feeling on-the-nose.
4. **Lyric typography (for lyric videos)** — type appears synced to syllable stress, not character-by-character. Use `Inter` or `DM Sans` for clean modern, or genre-appropriate display fonts.

---

## 9. Drop / climax visual choreography (the "money shot")

The drop or climax is the visual centerpiece. It must:
- Land **exactly** on the beat (frame-perfect).
- Be preceded by a brief **silence beat** (1 frame of black, or a pause in motion).
- Introduce a **visually new** element (color, character, environment, effect).
- Feature the **highest-intensity** elements (peak particle count, peak shake, peak brightness contrast).
- **Sustain** the high intensity for 4–8 bars.

A drop without a black-frame "punch in" feels weak. The 1-frame black before the drop is what makes the drop hit.

---

## 10. Transitions library

| Transition | When to use | Duration |
|---|---|---|
| Hard cut | most cuts on beat | 1 frame |
| Whip pan | between scenes in same world | 4–8 frames |
| Black flash | between sections / drops | 1–2 frames |
| White flash | impact, "snap awake" | 1 frame |
| Cross dissolve | mood/time shift, intro/outro | 12–24 frames |
| Match cut | thematic linkage | 1 frame |
| RGB split / glitch | tension, build, hyperpop | 4–12 frames |
| Zoom blur | drop / climax entry | 8–16 frames |
| Speed ramp | build into drop | 24–48 frames |
| Light leak | warm transition, indie/folk | 12–24 frames |

---

## 11. Output format defaults

| Use | Resolution | FPS | Duration | Format |
|---|---|---|---|---|
| Reels / TikTok / Shorts | 1080×1920 (9:16) | 30 | ≤ 60s | mp4, h264 |
| YouTube standard | 1920×1080 (16:9) | 30 or 60 | full song | mp4, h264 |
| Instagram feed | 1080×1080 (1:1) | 30 | ≤ 90s | mp4, h264 |
| Spotify Canvas | 1080×1920 (9:16) | 24 or 30 | 3–8s loop | mp4, h264 |
| Hi-fi master | 3840×2160 (4K, 16:9) | 30 or 60 | full song | mp4, h264 or h265 |

---

## 12. Failure modes to detect

The video critique agent should flag:
- [ ] Cuts not on beats (within ±50 ms tolerance)
- [ ] Drop without preceding "anticipation" frame
- [ ] All sections with same color palette
- [ ] No subject visible during lyric phrases
- [ ] Constant camera shake regardless of energy
- [ ] Constant cut rhythm regardless of section
- [ ] Particle/visualizer the only content (no narrative or subject)
- [ ] Aspect ratio wrong for delivery target

---

## 13. Implementation map (where this knowledge lives in code)

| File | Role |
|---|---|
| `src/lib/intelligence/audio-analyzer.ts` | extract BPM, beats, energy, sections from audio |
| `src/lib/intelligence/cut-rhythm-planner.ts` | plan cut timestamps from section list + energy |
| `src/lib/intelligence/visual-arc-planner.ts` | plan palette / camera / lighting per section |
| `src/lib/intelligence/audio-visual-sync.ts` | unify audio analysis + visual plan into render directives |
| `src/lib/video-generator.ts` | execute render directives into the canvas/MediaRecorder pipeline |

The current `src/lib/video-generator.ts` is canvas-based; the audio-visual sync layer above sits between audio analysis and the renderer. For higher-fidelity video, swap the canvas backend for a Replicate / Runway / Pika model invocation while keeping the timing plan intact.
