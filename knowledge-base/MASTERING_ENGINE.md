# Mastering Engine

> Mastering is the final pre-distribution stage. Goal: deliver a stereo file that translates well across all playback systems and matches platform-loudness norms without sacrificing emotional dynamics.

The single largest mastering mistake in AI-generated music is **over-limiting** to "loudness war" levels (-5 to -6 LUFS). All major streaming platforms now normalize to -14 LUFS — over-loud masters get turned *down* by the platform, with their dynamics already destroyed. You lose twice.

---

## 1. Loudness targets (the truth, 2026)

| Platform | Integrated LUFS | True Peak | Notes |
|---|---|---|---|
| **Spotify** | -14 | -1.0 dBTP | Normalization on by default; loud setting allows up to -11 LUFS but auto-attenuates |
| **Apple Music** | -16 | -1.0 dBTP | Sound Check normalization; targets -16 |
| **YouTube Music** | -14 | -1.0 dBTP | YouTube videos normalize to -14 LUFS |
| **TikTok** | -14 | -1.0 dBTP | Aggressive normalization |
| **Amazon Music HD** | -14 | -2.0 dBTP | Stricter true peak |
| **Tidal** | -14 | -1.0 dBTP | |
| **SoundCloud** | -8 to -10 | -1.0 dBTP | Less normalized; loud masters survive |
| **Broadcast TV (EBU R128)** | -23 | -1.0 dBTP | Strict for European broadcast |
| **Cinema (Dolby Atmos)** | -27 to -23 | -3.0 dBTP | Wide dynamic range required |

**Rule of thumb** Master to **-14 LUFS** for streaming-first releases. Master to **-8 to -10** only if the genre demands it and the platform mix is SoundCloud-heavy.

### Genre-typical LUFS (from `data/AUDIO_BALANCE_RULES.json`)
| Genre | LUFS target |
|---|---|
| Classical / orchestral | -23 |
| Meditation / healing | -20 |
| Indian classical | -18 |
| Jazz | -16 |
| Lo-fi / folk / film score / post-rock | -14 |
| Neo-soul | -12 |
| R&B / rock / country / synthwave / boom-bap / reggae | -10 |
| Bollywood / afrobeats / punjabi pop | -9 |
| Pop / EDM / trap / drill / k-pop / reggaeton / bhangra / metal | -8 to -7 |
| Hyperpop / dubstep / techno / phonk | -7 |

---

## 2. The mastering chain (typical)

Order matters. A standard mastering chain for streaming-targeted pop:

```
[stereo source]
  → 1. Linear-phase EQ (corrective, surgical cuts)
  → 2. Multiband compression (gentle, glue per band)
  → 3. Stereo imager (M/S width adjustments)
  → 4. Tonal balance EQ (Pultec-style or shelf curves)
  → 5. Saturation / harmonic exciter (subtle)
  → 6. Bus compressor (1-2 dB GR for glue)
  → 7. Limiter (catch peaks, hit LUFS)
  → 8. True-peak limiter (final safety, prevents inter-sample peaks)
  → 9. Dither (16-bit only) and loudness measurement
[stereo master out]
```

For genres that need less mastering (classical, ambient, jazz), shrink the chain:
```
[source] → mild corrective EQ → optional gentle compression → true-peak limiter → measure → out
```

---

## 3. EQ on the master bus

Use linear-phase EQ for corrective work (no phase smearing). Surgical cuts only on the master:
- **Sub rumble cut** at 25–30 Hz (high-pass) — removes inaudible content that eats limiter headroom.
- **Low-mid mud cut** at 200–400 Hz, 1–2 dB only — clears vocal space.
- **Sibilance dip** at 6–9 kHz dynamic if vocal is too bright.
- **Air shelf** at 12 kHz, 1–2 dB — modern sparkle.
- **Tilt EQ** for genre — see `data/AUDIO_BALANCE_RULES.json` band budgets.

**Never** boost more than 3 dB on the master. If a frequency needs more, fix it in the mix.

---

## 4. Multiband compression on master

Use **gentle** multiband (max 2–3 dB GR per band) to glue the mix:

| Band | Threshold | Ratio | GR target | Reason |
|---|---|---|---|---|
| Sub (20–100 Hz) | -18 | 2:1 | 2 dB | Tames booms |
| Low-mid (100–500 Hz) | -16 | 1.5:1 | 1 dB | Smooths mud |
| Mid (500–3000 Hz) | -14 | 1.3:1 | 1 dB | Light glue |
| High (3k–20k Hz) | -16 | 1.5:1 | 2 dB | Tames cymbal spikes |

If GR exceeds 4 dB on any band, you're masking mix issues — fix the mix.

---

## 5. Stereo imaging

- **Bass mono below 120 Hz** — non-negotiable for club/phone speaker compatibility.
- **Mids natural** — don't widen vocals (causes phase issues with mono).
- **Highs slightly wider** — M/S boost on the Sides at 6–12 kHz adds "expensive" air.
- **Reverb tails** can go hyper-wide.

A correlation meter should read between **+0.4 and +0.8** for most of the song. Below 0 indicates phase issues; near +1 means mono.

---

## 6. Saturation / harmonic exciter

Adding harmonics creates the perception of loudness without raising peak level. A classic move:
- 0.5–1.5 dB of even-harmonic saturation (tube emulation)
- 0.3–0.8 dB of odd-harmonic saturation (transformer emulation)

Use sparingly. Too much and the master sounds fuzzy and crowded.

---

## 7. Bus compression — "glue"

A slow-attack, slow-release bus compressor at 1.5:1 or 2:1, with 1–2 dB GR, makes the mix feel like one cohesive object. Settings:
- Ratio: 1.5:1 to 2:1
- Attack: 30 ms (let transients through)
- Release: auto or 100 ms
- Knee: soft

If you can hear it pumping, it's too aggressive on the master.

---

## 8. Limiting — the final stage

Set the **ceiling** to **-1.0 dBTP** (true-peak). Do not set ceiling at 0 — encoders (MP3, AAC) can introduce inter-sample peaks above 0 and clip.

The limiter does the bulk of the loudness lifting. To reach -8 LUFS, you might be limiting 6–10 dB GR on peaks. To reach -14 LUFS, 1–3 dB GR.

**Use a true-peak limiter** for final stage. ITU-R BS.1770 specifies 4× oversampling for true-peak detection. Modern limiters (FabFilter Pro-L 2, Ozone Maximizer in IRC IV) handle this.

---

## 9. Dynamic range targets (LU / PLR)

| Genre | LU min | LU max | PLR (peak-loudness ratio) target |
|---|---|---|---|
| Classical | 18 | 24 | 22+ |
| Jazz | 12 | 16 | 14 |
| Acoustic / folk | 10 | 14 | 12 |
| Pop | 6 | 9 | 8 |
| Rock | 7 | 10 | 9 |
| Hip-hop | 6 | 9 | 8 |
| EDM | 5 | 8 | 7 |
| Trap | 5 | 8 | 7 |
| Hyperpop / dubstep | 4 | 7 | 6 |

Below these floors, the mix feels "crushed" and emotionally flat. AI-generated tracks tend to lack dynamic range from the source — a too-aggressive limiter compounds this.

---

## 10. Tonal-balance reference

Use a **reference track** in the same genre. Match the master's spectral curve (in a tonal-balance plugin like iZotope Tonal Balance Control) to the reference within ±2 dB across each band.

References by genre (verify these tracks for current copyright/use):
- EDM: "Levels" — Avicii, "Animals" — Martin Garrix
- Pop: "Blinding Lights" — The Weeknd
- Trap: "XO Tour Llif3" — Lil Uzi Vert
- Lo-fi: any major Lofi Girl release
- Cinematic: "Time" — Hans Zimmer
- K-pop: "Dynamite" — BTS
- Bollywood: "Tum Hi Ho" — Arijit Singh

---

## 11. Bit depth, sample rate, dither

- **Master at 24-bit, 48 kHz** for film, 44.1 kHz for music.
- Down-sample to **16-bit** only for CD distribution. Apply **TPDF dither** when reducing bit depth.
- Streaming platforms accept 24-bit lossless; avoid 16-bit for high-fidelity tiers.

---

## 12. The "is it mastered?" checklist

- [ ] Integrated LUFS within ±0.5 of platform target?
- [ ] True peak ≤ -1.0 dBTP?
- [ ] Dynamic range LU within genre-typical band?
- [ ] Tonal balance roughly matches reference (±2 dB across bands)?
- [ ] Bass is mono below 120 Hz?
- [ ] No phase issues (correlation meter mostly positive)?
- [ ] No audible pumping/breathing on master compressor?
- [ ] No audible distortion on transients (limiter not overdriven)?
- [ ] Dynamic difference between verse and chorus ≥ 1 LU?
- [ ] Plays well on phone speaker (vocal intelligible, bass present-but-not-thumping)?
- [ ] Plays well in car (no harsh transients, vocal clear)?
- [ ] Plays well on studio monitors (full-range, no harshness)?

---

## 13. Implementation note

Our post-render pipeline currently applies:
1. LUFS measurement (via `lufs-meter` library)
2. Gain trim toward target
3. Optional brick-wall limiter at -1.0 dBTP

We do not currently render multi-band, M/S, or saturation processing. The roadmap includes:
- WebAudio-based light mastering chain for browser-side preview
- Server-side `ffmpeg` mastering with `loudnorm` and `aresample` for production output

For now, when generating, we **prompt for genre-typical mastered output** and trust the model. Where the model output deviates measurably from target, we attempt corrective gain and an optional limiter. We never claim our output is "professionally mastered" until the WebAudio mastering chain is in place.
