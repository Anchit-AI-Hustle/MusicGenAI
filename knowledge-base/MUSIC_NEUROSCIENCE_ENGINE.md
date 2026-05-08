# Music Neuroscience Engine

> This file is split intentionally into **Validated** (peer-reviewed, replicated, defensible) and **Speculative / heuristic** (useful working models that may not survive scrutiny). We use both, but we never sell speculation as fact.

---

## Part A — Validated findings

### A1. Anticipation drives reward (Huron, Salimpoor, Zatorre)

**Finding** Music activates the dopaminergic reward system *primarily during anticipation* of a peak musical moment, not only at the peak itself. Salimpoor et al. (2011) demonstrated dopamine release in the caudate (anticipation) seconds before the peak, and in the nucleus accumbens at the peak.

**Engineering implication**
- The **build-up** is half of the payoff. A 32-bar build into an 8-bar drop outperforms an 8-bar build into a 32-bar drop.
- Telegraph the drop with risers, snare rolls, sub-drops, vocal cues. The brain rewards correctly-predicted arrivals.
- Surprise the brain occasionally (deceptive cadences, false drops, key-changes) — surprise releases additional dopamine when it resolves to coherence (Huron's ITPRA).

**Implementation rule** Energy curve must contain at least one explicit anticipation gradient over ≥8 bars before any energy peak.

---

### A2. Repetition tolerance is high — much higher than producers think (Margulis 2014)

**Finding** Repetition is the single most universal feature of music. Margulis (*On Repeat*) showed that listeners tolerate, prefer, and remember repeated material — even repetition that feels excessive in transcription is welcome aurally.

**Engineering implication**
- Hooks should be repeated. Verses can recycle melodic cells. Choruses are *meant* to come back identical.
- AI hallucinated "novelty" in every section is a *bug*, not a feature.
- The composer agent should plan a repetition schedule and stick to it.

**Implementation rule** Each motif should appear ≥3 times in a 3-minute song. Hooks ≥4 times.

---

### A3. The chorus must crystallize within 8–12 seconds (Krumhansl 2017, Schafer 2008)

**Finding** Listeners can recognize popular songs from very short fragments (1–2 seconds for known songs; 5–10 for new). The "earworm" effect requires the catchiest moment to arrive in under 30 seconds.

**Engineering implication**
- Pop intros must hint at the hook within the first 10 seconds.
- The first chorus should land before 1:00.
- For Spotify's 30-second skip threshold, the listener should have heard *something* compelling by 0:20.

**Implementation rule** The arrangement engine schedules first chorus / drop in [0:30, 1:00] for pop-format songs.

---

### A4. Tempo correlates strongly with arousal (Husain 2002, Gomez 2007)

**Finding** Tempo has a robust effect on perceived energy and arousal that is independent of mode/key. Sad music with a fast tempo still feels more energetic than sad music with a slow tempo.

**Engineering implication**
- Tempo is the first lever for energy management. Mode handles valence (happy vs. sad). Tempo handles arousal (calm vs. intense).
- Cross-modal: a happy minor track works fine if the tempo is high (Avicii's "Hey Brother", "The Nights").

**Implementation rule** Two-axis emotion mapping:
```
valence (mode/harmony) × arousal (tempo/density)
```
Both must be set independently in the composition plan.

---

### A5. Mode is robustly tied to valence — but it's a cue, not a law (Crowder 1985, Hunter & Schellenberg 2011)

**Finding** Major key trends positive, minor key trends negative — across cultures, in adults *and* in children. But the effect is statistical, not deterministic. Tempo, timbre, and groove can override mode (e.g., happy minor pop, sad major folk).

**Engineering implication**
- Default mode-to-mood mapping is valid (`major → uplifting`, `minor → introspective`) but must be overridable.
- Don't get stuck on naive mappings. A major-key sad song is real (Coldplay's "The Scientist" is in F major).

---

### A6. Frequency masking is a real psychoacoustic constraint (Fletcher, Zwicker)

**Finding** A loud signal in one critical band masks quieter signals in nearby bands. The cochlea has ~24 critical bands ("Bark scale"). Sounds in the same band compete; sounds in different bands coexist cleanly.

**Engineering implication** This is the foundation of mixing. See `MIXING_ENGINE.md` and `data/AUDIO_BALANCE_RULES.json` for the operational rules.

---

### A7. Equal-loudness contours (Fletcher-Munson)

**Finding** The human ear is most sensitive to 2–5 kHz (the "presence" range) and significantly less sensitive to sub-bass (<60 Hz) and very high frequencies (>10 kHz), especially at low listening volumes.

**Engineering implication**
- Mixes that sound "right" at studio volume often sound thin at low listening volume because the bass disappears.
- A loudness-compensation EQ tilt at quiet playback boosts low and high ends relatively. Mastering for streaming compensates for this implicitly via -14 LUFS norms.

---

### A8. Rhythmic entrainment — the urge to move (Patel, Iversen, Janata)

**Finding** Humans (and very few other species) automatically synchronize body movement to musical pulse. Entrainment is strongest when the perceived pulse falls in 60–180 BPM, peaking around 120 BPM.

**Engineering implication**
- Most danceable BPMs cluster 100–135.
- "Half-time" perception lets a 70 BPM track and a 140 BPM track feel like the same body tempo.
- A song with a *shifting or unclear pulse* breaks entrainment and feels uncomfortable for dance — but is fine for ambient / classical.

---

### A9. Groove relies on micro-timing, not just on the beat pattern (Madison, Iversen)

**Finding** Groove ratings are higher when drums sit slightly behind the metronome (10–30 ms) but with low timing variance. Pure quantization scores low. So does sloppy variance.

**Engineering implication** See `MUSIC_THEORY_ENGINE.md` §8 — humanization parameters are essential, not cosmetic.

---

### A10. Frisson / chills correlate with structural surprise + emotional content (Goldstein, Sloboda, Salimpoor)

**Finding** Specific musical events reliably produce chills (piloerection): unexpected harmonies, key changes after a long static section, a soaring vocal entrance after silence, melodic appoggiaturas (resolved suspensions) — typically 60–80% of the way through a song.

**Engineering implication** Build the song so that the strongest emotional payoff arrives in the **final third**. The bridge → final chorus is the canonical chill location.

---

### A11. Repetition with variation (statistical learning) builds memorability (Saffran, Hannon)

**Finding** Infants and adults learn musical patterns from exposure to statistical regularities. Predictable patterns get encoded; carefully placed deviations stand out and are remembered.

**Engineering implication**
- Verse-chorus form works because the chorus return *confirms a learned pattern*.
- A bridge that *almost* returns to the chorus but pivots elsewhere creates a memorable surprise.

---

### A12. Lyric prosody must align with melodic stress (Patel, Lerdahl)

**Finding** Listeners process lyrics best when accented syllables fall on metrically strong beats and longer durations. Mismatch (a stressed syllable on a weak beat) sounds awkward and reduces comprehension.

**Engineering implication** This is a top failure of AI-generated vocals. The lyric agent must align stressed syllables to strong beats. See lyric engine in `src/lib/inference/lyric-engine.ts`.

---

## Part B — Useful but speculative / heuristic

### B1. "Solfeggio" frequencies (528 Hz "love", 432 Hz "natural")

**Status** **Pseudoscience.** No peer-reviewed evidence. Equal-tempered music tuned to 432 Hz has small (perceptually negligible) differences from 440 Hz. Claims of cellular healing, DNA repair, or chakra alignment are unsupported.

**What we'll do**
- Offer 432 Hz tuning as a creative choice (some users prefer the slightly lower feel) but **never claim a health benefit**.
- Do not bake "solfeggio" into healing/meditation modes as if it's medically meaningful.

### B2. Binaural beats for brainwave entrainment

**Status** **Mixed evidence.** Some studies show short-term effects on relaxation / focus. Mechanism (frequency-following response) is debated. Claims of permanent brainwave alteration are unsupported.

**What we'll do**
- Offer binaural beats as an *option* in meditation mode.
- Disclose the science honestly: "may aid relaxation; not medical advice."

### B3. The "bass-heavy = aggressive" generalization

**Status** **Useful generalization, oversimplified.** Bass content does correlate with perceived energy, but timbre and arrangement matter more than raw frequency content. A bass-heavy ambient pad is calm; a thin distorted lead is aggressive.

### B4. "Music color synesthesia" mappings

**Status** **Variable across listeners.** True synesthetes have idiosyncratic mappings. Cross-cultural color-emotion mappings (e.g., red=anger, blue=calm) are partially valid but culturally moderated.

**What we'll do**
- Use color-emotion mappings for video-generation defaults (red=anger, blue=cool, gold=warm) but allow override.
- Document explicitly that we are using cultural conventions, not synesthetic facts.

### B5. "Mozart effect"

**Status** **Largely debunked.** Short-term arousal/mood improvement from listening to music exists, but the specific "Mozart makes you smarter" claim does not replicate.

---

## Part C — Practical retention model (ours)

We do not claim this is "the" retention model — it's a working composite of validated principles A1–A12 and observed listener behavior. We refine it as data comes in.

### Listener attention curve assumptions

For a streaming pop song, plotting `P(continue listening | t seconds)`:

| Time | Audience retained | Required event |
|---|---|---|
| 0–10s | 100% → 80% | Hook foreshadow; recognizable timbre; vocal entrance ideal at 5–10s |
| 10–30s | 80% → 70% | First memorable phrase; melodic contour established |
| 30–60s | 70% → 60% | First chorus or a clear "this is the song" moment |
| 60–120s | 60% → 55% | Variation (verse 2 must feel new but familiar) |
| 120–180s | 55% → 50% | Bridge or new structural element |
| 180s+ | 50% → 40% | Final chorus / climax — payoff arrives |

If the song hasn't hit a hook by 0:30, expect aggressive skip rates. Spotify's 30-second royalty threshold is not arbitrary — it's calibrated to attention.

### Engagement scoring (used by the quality evaluator)

```
engagement_score = w1 * hook_clarity_at_30s
                 + w2 * energy_curve_correctness
                 + w3 * surprise_to_predictability_ratio  // target ~0.3
                 + w4 * motif_repetition_count
                 + w5 * cadence_strength_at_section_ends
                 + w6 * mix_clarity
                 + w7 * final_third_payoff_intensity
```

The TS implementation lives in `src/lib/intelligence/engagement-scorer.ts`.

---

## Part D — Cultural caveat

All of these findings are documented mostly in Western music research. Cross-cultural validity is partial:
- Tonal mode-mood mappings hold across many cultures but with shifts.
- Tempo-arousal is highly cross-cultural (rooted in physiology).
- Specific scale/raga-emotion mappings (Indian classical *rasa*; Maqam *taqsim*) are culturally specific and should be respected.

When generating in a culture-specific genre, defer to the culture's own theoretical framework, not the Western default. See genre-specific notes in `data/GENRE_KNOWLEDGE_BASE.json`.

---

## References (real)

- Salimpoor, Benovoy, Larcher, Dagher, Zatorre. "Anatomically distinct dopamine release during anticipation and experience of peak emotion to music." *Nature Neuroscience* 14, 257–262 (2011).
- Huron, *Sweet Anticipation: Music and the Psychology of Expectation* (MIT Press, 2006).
- Margulis, *On Repeat: How Music Plays the Mind* (Oxford, 2014).
- Levitin, *This Is Your Brain on Music* (2006).
- Patel, *Music, Language, and the Brain* (Oxford, 2008).
- Krumhansl, "Plink: 'Thin Slices' of Music" *Music Perception* 27 (2010).
- Husain, Thompson, Schellenberg. "Effects of Musical Tempo and Mode on Arousal, Mood, and Spatial Abilities." *Music Perception* 20 (2002).
- Hunter, Schellenberg, Schimmack. "Mixed affective responses to music with conflicting cues." *Cognition & Emotion* 22 (2008).
- Saffran, Aslin, Newport. "Statistical learning by 8-month-old infants." *Science* 274 (1996).
- Madison. "Experiencing Groove Induced by Music." *Music Perception* 24 (2006).
- Janata, Tomic, Haberman. "Sensorimotor coupling in music and the psychology of the groove." *J Exp Psych Gen* 141 (2012).
- Fletcher & Munson, "Loudness, its definition, measurement and calculation." *J. Acoust. Soc. Am.* 5 (1933).
- Sloboda. "Music Structure and Emotional Response: Some Empirical Findings." *Psychol Music* 19 (1991).
- Zwicker & Fastl, *Psychoacoustics: Facts and Models* (Springer, 1999).
