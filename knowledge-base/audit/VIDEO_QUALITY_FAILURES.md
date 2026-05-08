# Video Quality Failures — Root Causes

> The visual feels disconnected from the music. Each failure → root cause → fix.

---

## V1. Cuts don't land on beats

**Symptom** Video cuts, particle bursts, color flashes happen at random — not on the beat.

**Root cause** `video-generator.ts` runs on the canvas redraw loop (60 Hz) and uses an audio-reactivity envelope that responds to *amplitude* but not the underlying tempo grid.

**Fix path**
1. Implement `audio-analyzer.ts` that detects BPM, beats, and downbeats.
2. Implement `cut-rhythm-planner.ts` that emits cut timestamps quantized to the beat grid.
3. The renderer reads the cut plan and triggers visual events at scheduled times instead of reacting to amplitude.

---

## V2. Visuals don't change between sections

**Symptom** A 3-minute song has the same look from intro to outro.

**Root cause** Visual state is global. There is no concept of section in the renderer.

**Fix path**
1. Pass the resolved section list (from `ARRANGEMENT_PATTERNS.json`) to the renderer.
2. Each section has its own palette, particle count, lighting, camera intent — switched at section boundaries.
3. See `VIDEO_SYNCH_ENGINE.md` §4 (visual archetypes) and §5 (color palette planning).

---

## V3. Drop doesn't feel like a drop visually

**Symptom** EDM drop arrives in the audio; the video has no special moment.

**Root cause** Renderer doesn't know what a "drop" is.

**Fix path**
1. Section list includes a `drop` flag.
2. On drop downbeat: insert a 1-frame black "punch" + maximum particle burst + camera shake + brightness peak.
3. Sustain max-intensity visuals for the drop's bar count.
4. See `VIDEO_SYNCH_ENGINE.md` §9.

---

## V4. Lyric videos don't sync words to vocal phrases

**Symptom** Lyric typography lags or leads the audio.

**Root cause** No timing data tying words to audio timestamps.

**Fix path**
1. Use the lyric-timing layer to assign timestamps per phrase (or per word for premium tier).
2. ElevenLabs / forced-aligner can return word-level timestamps.
3. Renderer reads `[{word, startMs, endMs}]` and animates type-on at start, type-off at end.

---

## V5. Color palette doesn't fit the music

**Symptom** Sad ballad has neon hyperpop palette; trap song has pastel colors.

**Root cause** Renderer hardcodes a single palette per "style", and the style picker is shallow.

**Fix path**
1. Use `VISUAL_STYLE_KNOWLEDGE_BASE.json` keyed off `GENRE_KNOWLEDGE_BASE.video_aesthetic_id`.
2. Blend the section palette with the per-section emotion (verse muted, chorus expanded — see `VIDEO_SYNCH_ENGINE.md` §5).

---

## V6. Camera motion is constant or arbitrary

**Symptom** Camera is either always still or always shaking, regardless of what's happening in the audio.

**Root cause** No camera-motion mapping to energy curve.

**Fix path**
1. Camera intensity ∝ section energy.
2. Camera type (push/pan/static) per section archetype — see `VIDEO_SYNCH_ENGINE.md` §6.
3. Whip-pan transitions reserved for section boundaries.

---

## V7. Particle visualizers feel cheap

**Symptom** Particle systems read as "screensaver", not music video.

**Root causes**
- Particle parameters are static (count, color, shape don't change).
- No environmental context (no horizon, no scale references).
- Particles ignore beat, only respond to amplitude.

**Fix path**
1. Particle count, hue, motion speed all change per section.
2. Add a stylized environment behind particles (distant skyline, grid floor, fog plane) for scale.
3. Particle bursts on beats, not just on transient peaks.
4. Long-term: replace canvas-only with a Replicate / Pika video model for performance/landscape footage; canvas only for visualizer-style aesthetics.

---

## V8. Aspect ratio wrong for delivery target

**Symptom** Output is 1080×1080 when user wanted Reels (9:16) or YouTube (16:9).

**Root cause** No delivery-target metadata in pipeline.

**Fix path**
1. UI lets user pick: Shorts/Reels/TikTok (9:16), YouTube (16:9), Square (1:1), Spotify Canvas (9:16, 3-8s loop).
2. Pipeline carries `deliveryTarget` through to renderer.
3. Renderer composes appropriate framing per target.

---

## V9. No subject — just abstract

**Symptom** Music has lyrics about "running through the streets" — video shows abstract shapes.

**Root causes**
- Renderer doesn't read lyrics.
- No subject-image generation step.

**Fix path**
1. Long-term: extract narrative cues from lyrics ("street" → city; "ocean" → water; "dance" → dancer).
2. Generate hero stills via Replicate image model based on narrative cues.
3. Composite stills into the video timeline at section starts.

---

## V10. Performance — render times too long

**Symptom** A 3-minute video takes 5+ minutes to render.

**Root cause** Canvas + MediaRecorder is real-time only — 1:1 ratio.

**Fix path**
1. Move to offscreen canvas + frame-by-frame `webm` encoding (faster than realtime).
2. Or: render via server-side `ffmpeg` from a frame sequence.
3. Or: invoke a video model on Replicate (slow per-token but fast per-clip).

---

## V11. Aspect / crop issues with 9:16 mode

**Symptom** Subject cut off at top or bottom in vertical export.

**Root cause** No safe-area awareness. UI overlays (TikTok username, captions) cover ~15% top and ~25% bottom.

**Fix path**
1. Renderer keeps subject within safe-area (vertically centered in middle 60% of frame).
2. Captions / typography respect safe-area margins.

---

## V12. Audio drift over long renders

**Symptom** By minute 3, audio and video are out of sync by ~100ms.

**Root cause** Float accumulation when rendering frame-by-frame via timestamps.

**Fix path**
1. Use sample-accurate timestamps tied to audio playhead, not wall clock.
2. Re-anchor visual frames every 8 bars to drift-correct.

---

## How to use this document

For each video issue, find its `V*` and apply the fix. Some issues compound (V1 + V3 + V6 are all root-cause "no audio analysis" — fixing the analyzer fixes all three).
