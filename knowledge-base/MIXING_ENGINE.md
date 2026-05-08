# Mixing Engine

> Operational mixing knowledge. Used by the post-generation mix-critique agent and by the prompt builder when describing target mixes.

The most common reasons AI-generated music sounds "amateur":
1. No frequency separation (everything fights in 200–500 Hz)
2. No depth (no front-back distance)
3. No stereo strategy (everything centered or everything wide)
4. Over-compressed master (no dynamic life)
5. No groove sidechain (kick and bass collide)
6. Vocals sit on top of, not in, the mix

This file is the antidote.

---

## 1. Gain staging — the silent foundation

Set every channel so its peak is around `-12 dBFS` and its average is `-18 to -20 dBFS`. This:
- Leaves headroom on the master bus for processing.
- Keeps plugin algorithms in their sweet spot (most are calibrated to -18 dBFS).
- Prevents inter-sample peaks during normalization.

**Rule** Master bus output should never exceed `-6 dBFS` before mastering chain.

---

## 2. The frequency budget — where each instrument lives

Treat 20 Hz – 20 kHz as a finite resource. Every instrument should have a primary band (where it dominates) and ideally be filtered/EQ'd to **stay out of other instruments' primary bands**.

### Per-instrument frequency map
| Instrument | Primary band (Hz) | Cut elsewhere | Notes |
|---|---|---|---|
| Sub-bass / 808 | 30–80 | high-pass everything else < 100 | Mono only |
| Kick fundamental | 50–80 | — | Center-mono |
| Kick beater click | 2k–5k | — | Adds intelligibility on phone speakers |
| Bass guitar (root) | 80–250 | — | Mono below 120 |
| Bass guitar (body) | 300–600 | — | Where electric bass sits |
| Bass attack | 700–1k | — | Pluck character |
| Acoustic guitar body | 80–200 | high-pass at 80 | |
| Acoustic guitar fingerpicking sparkle | 4k–10k | — | "Air" in fingerpicking |
| Electric guitar body | 200–800 | scoop 2.5k for vocal | |
| Electric guitar bite | 2k–4k | — | Intelligibility |
| Snare body | 150–300 | — | "Thump" |
| Snare crack | 2k–5k | — | "Snap" |
| Hi-hats / shaker | 6k–12k | high-pass at 500 | |
| Cymbals | 4k–15k | high-pass at 300 | |
| Lead vocal fundamental (male) | 100–250 | — | High-pass at 80 |
| Lead vocal fundamental (female) | 200–400 | — | High-pass at 100 |
| Lead vocal presence | 1k–5k | — | Where intelligibility lives |
| Lead vocal "air" | 8k–14k | — | Lift gently |
| Synth pad | wide (200–8k) | — | Make space; sidechain to kick |
| Strings | 200–8k with body 400–800 | — | Wide stereo |

### Frequency-budget rule of thumb
At any point in the song, **at most 2 instruments occupy the same primary band**. If you have a piano (fundamental 200–500) and a vocal (fundamental 200–400) and a guitar (200–800), one of them must go — or be filtered to a different range.

---

## 3. EQ — additive vs. subtractive

**Subtractive EQ first, additive EQ last.** Mix engineers' #1 mistake is boosting everything. Cut where you don't need it; boost only where you need it to feel different.

### Standard subtractive cuts
- **40 Hz high-pass** on every channel except kick, sub, bass, and the lowest pad.
- **150–250 Hz cut** on guitars and synths to clear bass space ("low-mid mud").
- **400–500 Hz cut** on guitars/keys to clear "boxiness".
- **2.5 kHz cut** on guitars when vocal present.
- **8 kHz dynamic cut** on vocal de-essing.

### Standard additive boosts (gentle, 1–3 dB)
- **80 Hz** on kick — "thump"
- **100 Hz** on bass — "fatness"
- **5 kHz** on snare — "crack"
- **3 kHz** on lead vocal — "presence"
- **12 kHz shelf** on master — "air"

### Dynamic EQ
For vocals, dynamic EQ that ducks 2.5–4 kHz only when sibilance peaks works better than static de-essing. For competing elements (vocal vs. guitar), a sidechained dynamic EQ on the guitar that ducks 2 kHz only when vocal is present is invisible and effective.

---

## 4. Compression — taste, not rule

### Why compression exists
1. To pull quiet parts up and loud parts down, evening dynamics.
2. To shape transient envelopes (slow attack accentuates transients; fast attack tames them).
3. To glue separate elements into one sounding object (bus compression).

### Per-instrument starting points
| Instrument | Ratio | Attack | Release | GR target |
|---|---|---|---|---|
| Lead vocal | 3:1 | 5 ms | 100 ms | 3–6 dB |
| Vocal — second compressor (catching) | 8:1 | 1 ms | 50 ms | 1–3 dB |
| Bass | 4:1 | 30 ms | 100 ms | 4–8 dB |
| Kick | 4:1 | 10 ms | 50 ms | 2–4 dB |
| Snare | 4:1 | 5 ms | 80 ms | 3–5 dB |
| Drum bus | 4:1 | 30 ms | auto | 2–3 dB |
| Mix bus | 2:1 | 30 ms | auto | 1–2 dB |

### Slow-attack rule
Slow attack lets the transient through, then squashes the body. Use this to *enhance* punch, not destroy it. A fast attack on a kick = squashed pancake.

---

## 5. Sidechain — the secret weapon

Sidechaining bass to kick is what makes EDM/house feel "alive". The bass ducks 3–6 dB whenever the kick hits, then springs back, creating the breathing pumping motion.

### Sidechain decisions per genre
| Genre | Sidechain target | Source | Amount |
|---|---|---|---|
| EDM/House | bass, pads, sometimes everything | kick | 6–12 dB GR |
| Techno | minimal | kick | 2–3 dB |
| Pop | bass, sometimes pads | kick | 3–5 dB |
| Hip-hop | rare; bass ducks vocally | kick | 1–2 dB or none |
| Trap | 808 ducks subtly to kick | kick | 1–2 dB |
| Rock | none — band breathing is natural | — | — |
| Jazz/Classical | none | — | — |

### Vocal-driven sidechain
A subtler trick: sidechain instruments (especially synth pads or guitar) to the lead vocal. When the vocal is singing, instruments duck 1–3 dB. Listener never notices but the vocal feels "in front" without being louder.

---

## 6. Reverb & delay — the depth axis

Mono-mix lives on the L-R axis. Stereo-mix adds a "front-back" depth axis via reverb and delay.

### Three reverbs in any modern mix
1. **Plate / short reverb** (0.8–1.5 s) on snare and vocal — creates "the room"
2. **Hall / long reverb** (2–4 s) on pads, lead vocal tail, lead synth — creates "the space"
3. **Spring / short slap delay** (50–150 ms) on vocal, lead — creates "thickness"

### Pre-delay
A reverb pre-delay of 30–80 ms keeps the reverb behind the source so the source stays clear. Without pre-delay, the reverb smears the source and reduces intelligibility. **Always set pre-delay** before mixing reverb level.

### EQ on reverb returns
- High-pass reverb at 250 Hz so it doesn't muddy the low end.
- Low-pass reverb at 8 kHz so it doesn't compete with cymbal sizzle.
- Optional: dynamic EQ that ducks 2.5 kHz on the reverb send when vocal is present (keeps tail behind the dry).

### Delay tempo-sync
Always sync delays to song tempo. 1/4-note delay, 1/8-dotted, 1/16-triplet are the three universal rhythmic delays. Free-running delays usually clash with the groove.

---

## 7. Stereo strategy

A mix needs **width strategy**, not just "make it wide." Width should reinforce the song, not flatten it.

### Width by element category
- **Foundation** (kick, sub, bass, lead vocal) — center / mono. These are the song's spine.
- **Rhythm** (snare, hat, ride) — center to slightly off-center.
- **Melody and color** (rhythm guitars, synth pads, strings) — wide.
- **Atmosphere** (reverb tails, ambient FX, risers) — hyper-wide.

### Mid/Side processing
Use M/S EQ to:
- Cut bass from the sides (keeps low end mono, focused).
- Boost air (10–15 kHz) on the sides only — opens up the mix without making vocals harsh.

### Width per genre
| Genre | Strategy |
|---|---|
| EDM | wide synth, mono lows, hyper-wide pads |
| Hip-hop | narrow — vocal-forward, stereo limited to drums and FX |
| Pop | balanced; wide chorus, narrower verse |
| Rock | hard-panned rhythm guitars (L100/R100), centered solo |
| Lo-fi | natural width, low Side energy |
| Ambient | hyper-wide, all elements stereo |

---

## 8. Vocal mixing — the most important channel

Vocals carry meaning. Listeners forgive instrumental flaws but never vocal flaws.

### The vocal chain (in order)
1. **High-pass** at 80 Hz (male) / 100 Hz (female).
2. **Subtractive EQ** — cut 200–400 Hz mud, 800 Hz boxiness, 2.5–3 kHz harshness if singer is bright.
3. **Compressor 1** (3:1, 5 ms attack, 100 ms release) — even out dynamics, GR 3–6 dB.
4. **De-esser** — dynamic cut at 6–9 kHz for sibilance, GR 1–3 dB on peaks.
5. **Additive EQ** — boost 3 kHz for presence, 12 kHz shelf for air.
6. **Compressor 2 / limiter** (8:1 fast catch, GR 1–2 dB) — catch loud peaks.
7. **Saturation** (very subtle) — adds harmonic body, helps vocal cut through dense mix.
8. **Reverb send** — short plate (0.8–1.2 s) and hall (2–3 s) on auxes.
9. **Delay send** — 1/8 or 1/4 delay, post-fader, low pass 6 kHz.

### Vocal volume vs. mix
The lead vocal should be **3–6 dB above the next-loudest element** in pop/R&B; equal to drums in rock; equal or lower than the band in jazz/folk; lower than the drop synth in EDM.

### Backing vocals
- High-pass higher than lead (200–250 Hz) to clear lead.
- Pan stack hard L and R for stereo width.
- Compress harder than lead (5:1, 3–6 dB GR).
- Reverb wetter than lead (gives "behind/around" feel).
- Volume 3–6 dB below lead.

---

## 9. Genre-specific mix chain shortcuts

### EDM / House drop chain
1. Heavy sidechain bass-and-pads → kick (6–10 dB GR)
2. Master bus: 2:1 glue compression with 2 dB GR
3. Master EQ: 60 Hz boost (sub thump), 5 kHz boost (presence), 12 kHz shelf
4. Limiter → -7 to -8 LUFS

### Trap / Drill chain
1. 808 sidechained to kick (1–2 dB GR — subtle)
2. Vocal: heavy compression (6–8 dB GR), bright EQ, hall reverb
3. Master bus: light glue compression (1 dB GR)
4. Limiter → -7 LUFS

### Lo-fi chain
1. NO heavy compression on master (dynamic range is intentional)
2. Tape saturation plugin on every channel (subtle)
3. Vinyl crackle bus
4. Low-pass at 12 kHz on master (warm, not bright)
5. Limiter → -14 LUFS (matches Spotify; preserves dynamics)

### Pop chain
1. Vocal-forward mix (vocal +3 to +6 dB above nearest element)
2. Drum bus 2:1 compression
3. Master glue 2:1, 2 dB GR
4. Master EQ: 80 Hz, 3 kHz, 12 kHz lifts
5. Limiter → -8 LUFS

### Acoustic / Folk chain
1. Minimal compression on individual tracks (preserve dynamics)
2. Natural reverb (room or short hall)
3. NO master limiter (or very gentle, 1 dB GR max)
4. Target -14 LUFS

### Cinematic chain
1. Wide reverb on strings (hall, 4–6 s)
2. Sub-drop layer on impacts
3. NO heavy master compression (preserve impact dynamics)
4. Target -14 LUFS for streaming, -23 LUFS for film

---

## 10. The "is it mixed?" checklist (used by the mix-critique agent)

Run after every generation:
- [ ] Vocal sits clearly in 1–3 kHz; intelligible at low volume?
- [ ] Sub/kick clearly distinct; no 60–80 Hz mush?
- [ ] No frequency masking in 200–400 Hz?
- [ ] Stereo image: foundation centered, rhythm narrow, color wide?
- [ ] Reverb has pre-delay; tail high-passed?
- [ ] Master peak ≤ -1.0 dBTP?
- [ ] Master integrated LUFS within 0.5 of platform target for genre?
- [ ] Crest factor genre-appropriate?
- [ ] Dynamic range LU ≥ genre minimum (see GENRE_KNOWLEDGE_BASE)?
- [ ] Chorus measurably louder than verse (1–3 LU)?
- [ ] No clipping (digital "fizz" on transients)?

If 2+ items fail, a re-mix or post-process is required.

---

## 11. Implementation note

We do not currently have a real DSP mix engine — generative model output is a finished stereo file. Our post-process is limited to:
- LUFS measurement and gain trim toward target
- Optional limiter at the end
- Optional EQ tilt for genre-typical brightness
- Optional sidechain "ducking" applied via downstream processing if we render in stems

The mix knowledge here is also used as **prompt material** — when prompting models that accept mix-direction language (Stable Audio, ElevenLabs Music), we include phrases from this guide.
