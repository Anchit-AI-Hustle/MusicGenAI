# Music Theory Engine

> The single source of truth for everything pitched. Used by `composition-engine.ts`, the chord-emotion picker, the lyric-cadence aligner, and the prompt builder.

## 1. Pitch foundations

### Notes & enharmonic equivalents
12-TET semitone wheel:
`C, C#/Db, D, D#/Eb, E, F, F#/Gb, G, G#/Ab, A, A#/Bb, B`

When generating, **prefer flat spellings for minor / blues / R&B / jazz / film** (`Eb`, `Ab`, `Bb`), **sharp spellings for sharp-key pop / EDM / metal / drill** (`F#`, `C#`, `G#`). Mixing flats and sharps in the same chord chart is a smell.

### Octave register guidance for vocals/leads
| Register | Hz (approx) | Use |
|---|---|---|
| Sub | 20–60 | Sub-bass only — never pitched melodies |
| Bass | 60–250 | Bass guitar / 808 fundamentals |
| Low-mid | 250–500 | Body of male vocal, kick body, guitar lows |
| Mid | 500–2k | Intelligibility, vocal presence, snare crack |
| High-mid | 2k–4k | Vocal "bite", hi-hat sizzle |
| High | 4k–8k | Air, cymbals, breath |
| Top | 8k–20k | Sparkle, "cinematic" shimmer |

A male lead vocal that sits below 200 Hz is muddy. A pop chorus that has nothing above 6 kHz feels dead.

## 2. Scales & modes — emotional identity

| Scale | Intervals | Emotional default | Genre fit |
|---|---|---|---|
| Major (Ionian) | 1 2 3 4 5 6 7 | bright, optimistic, resolved | pop, country, gospel, folk |
| Natural minor (Aeolian) | 1 2 b3 4 5 b6 b7 | sad, contemplative | pop ballad, indie, R&B |
| Harmonic minor | 1 2 b3 4 5 b6 7 | dramatic, exotic, tense | metal, film score, flamenco, Bollywood |
| Melodic minor (asc) | 1 2 b3 4 5 6 7 | sophisticated, jazz | jazz, neo-soul, R&B |
| Dorian | 1 2 b3 4 5 6 b7 | hopeful-sad, "cool minor" | funk, jazz, lo-fi, modal rock |
| Phrygian | 1 b2 b3 4 5 b6 b7 | dark, exotic, aggressive | metal, flamenco, trap, Arabic |
| Phrygian dominant | 1 b2 3 4 5 b6 b7 | exotic, intense, "Eastern" | flamenco, metal, Bhangra fusion, drill |
| Lydian | 1 2 3 #4 5 6 7 | dreamy, magical, cinematic | film score, dream pop |
| Mixolydian | 1 2 3 4 5 6 b7 | bluesy, rock, swagger | rock, country, blues, funk |
| Locrian | 1 b2 b3 4 b5 b6 b7 | unstable, rare | metal, experimental |
| Pentatonic major | 1 2 3 5 6 | uplifting, universal, no friction | pop, country, folk, K-pop hooks |
| Pentatonic minor | 1 b3 4 5 b7 | bluesy, "instant catchy" | rock, blues, hip-hop, lo-fi |
| Blues scale | 1 b3 4 b5 5 b7 | gritty, expressive | blues, rock, soul |
| Hirajoshi (JP) | 1 2 b3 5 b6 | quiet melancholy, traditional | J-pop, anime, koto |
| Bhairav (IND) | 1 b2 3 4 5 b6 7 | devotional, dawn raga | Indian classical, Bollywood devotional |
| Yaman (IND) | 1 2 3 #4 5 6 7 | regal, romantic, evening raga | Bollywood romantic, Indian classical |
| Maqam Hijaz (AR) | 1 b2 3 4 5 b6 b7 | longing, Middle Eastern | Arabic pop, Bhangra fusion |

### Microtonality
Quarter tones (50 cents) are essential to authentic Arabic, Turkish, and some Indian music. Most generative models cannot render these. **If the user asks for "authentic Maqam Bayati", flag the limitation in the UI** rather than pretending.

## 3. Chord families & function

### Diatonic triads (Major key, Roman numerals)
| Numeral | Quality | Function | Sounds like |
|---|---|---|---|
| I | major | tonic — home | resolved, settled |
| ii | minor | predominant | gentle motion forward |
| iii | minor | tonic-substitute | melancholic shading |
| IV | major | predominant | "lifted", open |
| V | major | dominant — pulls home | tension demanding resolution |
| vi | minor | tonic-substitute | bittersweet, the "ballad chord" |
| vii° | diminished | dominant-substitute | unstable |

### Diatonic triads (Natural minor)
| Numeral | Quality | Function |
|---|---|---|
| i | minor | tonic |
| ii° | diminished | predominant (rare) |
| III | major | "lift" out of minor |
| iv | minor | predominant |
| v | minor | weak dominant — does not pull home |
| V | major (borrowed harmonic minor) | strong dominant |
| VI | major | sad-but-warm |
| VII | major | "modal" rock/EDM cadence |

### Seventh chords
| Symbol | Sound | Use |
|---|---|---|
| Maj7 | dreamy, jazzy, "Sunday morning" | neo-soul, lo-fi, R&B, film score |
| m7 | smooth, professional | R&B, jazz, K-pop, lo-fi |
| 7 (dominant 7) | bluesy, edgy tension | blues, funk, rock, gospel |
| m7b5 (half-dim) | jazz, melancholy | jazz, film score |
| dim7 | extreme tension, horror | metal, film score, jump scares |
| Maj9 / m9 | lush, sophisticated | neo-soul, jazz, R&B |
| sus2 / sus4 | suspended, unresolved, "open" | pop, post-rock, ambient |
| add9 | bright, modern | pop, indie, EDM |

## 4. Chord progressions — the canonical bank

> Full bank with emotional tags is in `data/CHORD_EMOTION_DATABASE.json`. The TS engine in `src/lib/intelligence/chord-progression-bank.ts` consumes it.

### Top 12 universal progressions (by usage frequency)
| Progression | Roman | Examples | Mood |
|---|---|---|---|
| **I–V–vi–IV** | "Axis" | "Let It Be", thousands of pop songs | universal, optimistic |
| **vi–IV–I–V** | "Axis rotated" | "Don't Stop Believin'" | nostalgic, anthemic |
| **I–vi–IV–V** | "50s doo-wop" | "Stand By Me" | nostalgic, romantic |
| **ii–V–I** | "Jazz cadence" | every jazz standard | sophisticated motion |
| **i–VI–III–VII** | "Andalusian / minor anthem" | "Hit the Road Jack" | dramatic minor |
| **i–VII–VI–V** | "Andalusian descent" | "Sultans of Swing" | flamenco, drill |
| **I–IV–V** | "12-bar simplified" | rock, blues, country | bluesy, primal |
| **I–IV–vi–V** | "Optimist" | many EDM anthems | uplifting, festival |
| **i–iv–VII–III** | "Minor descent" | "Stairway" | epic minor |
| **vi–V–IV–V** | "Pop pump" | many K-pop choruses | propulsive |
| **I–V/vi–vi–IV** | "Royal road (Japan)" | J-pop / anime | nostalgic, anime opener |
| **I–iii–IV–V** | "Bright lift" | many gospel choruses | uplifted, pop-gospel |

### Genre-loaded progressions
- **Drill / UK Drill**: `i–VI–III–VII` in minor with sliding 808; `i–v–VI–iv` for darker variant
- **Lo-fi / chillhop**: `Imaj7–iiim7–vim7–IVmaj7` (the "lo-fi loop"); `Imaj9–IVmaj9` two-chord
- **Bollywood**: `i–iv–V–i` (harmonic minor), `I–IV–V–vi` (party song), `Imaj7–vim7–IVmaj7–V` (romantic)
- **Bhangra**: harmonic-minor over `i–V–i–VI–V–i`, dhol-driven
- **K-pop chorus**: `IV–V–iii–vi` (royal road) → `IV–V–I` resolution
- **EDM main hook**: `vi–IV–I–V` repeated, with melodic risers
- **Reggaeton**: `i–VI–VII` looped, dembow underneath
- **R&B / neo-soul**: `Imaj9–IIIm9` two-chord vamps; `iim9–V13–Imaj9` jazz cadences
- **Trap**: minor key two-chord vamps `i–VI` or `i–iv`, melodic top from harmonic or natural minor
- **Synthwave**: `i–VI–III–VII` (dark) or `vi–IV–I–V` (bright retrowave) at 110–120 BPM
- **Film score (epic)**: `i–VI–III` then `iv–VI–VII` for the swell, ending on `i` or unresolved `V`

## 5. Cadences (the punctuation marks of music)

| Cadence | Move | Effect |
|---|---|---|
| Authentic (PAC) | V → I (root in soprano on tonic) | full stop |
| Imperfect | V → I (no root in soprano) | period without exclamation |
| Plagal | IV → I | "Amen", gentle resolution |
| Half | anything → V | comma — to be continued |
| Deceptive | V → vi | surprise, hold breath |
| Phrygian (minor) | iv → V or iv6 → V | flamenco / film tension |
| Modal | bVII → I (mixolydian) | rock swagger, "Hey Jude" |
| Picardy third | i → I (final maj on minor) | unexpected hope |

**Rules**:
- A chorus must end on or near a strong cadence (PAC or modal).
- A bridge usually ends on a half cadence (V) to "ramp" into the final chorus.
- A drop should land on the tonic (i or I) on a downbeat.

## 6. Voice leading

The single most-violated principle in AI-generated music. Voice leading is what makes a chord progression *feel like music* instead of stacked sounds.

**Hard rules**:
1. Move each voice (bass, tenor, alto, soprano) by **the smallest interval possible** between chords. Step (1–2 semitones) > leap.
2. Common tones stay still.
3. Avoid parallel 5ths and 8ves between bass and any inner voice (they collapse the chord into a unison ghost).
4. Resolve the leading tone (7) up to tonic (1).
5. In minor, resolve the b6 down to 5.
6. Bass should outline the chord function (root motion is the spine of the song).

**Practical implementation for AI prompting**: when asking the model for a chord arrangement, specify "smooth voice leading, common-tone retention, no parallel fifths" — quality models honor it.

## 7. Melody construction

### Contour shapes (Levitin / Schellenberg)
- **Arch** — climbs to apex mid-phrase, descends. Most singable. Default for choruses.
- **Wave** — repeated up-down. Verse / lo-fi loops.
- **Ascending** — climbs throughout. Pre-chorus risers, build-ups.
- **Descending** — falls throughout. Sad ballads, outros, breakdowns.
- **Pivot** — same note repeated with one neighbor tone. Drill / trap melodic stabs.
- **Range expansion** — each phrase extends higher than the last. Climax sections.

### Rules of thumb
- **Range cap for hooks**: 9 semitones (a major 6th) — keeps it singable. Megan thee Stallion / Drake / Bieber hooks all live inside this.
- **Repetition before variation**: state a 2-bar motif twice, then vary on bar 5–8. The brain rewards "same-then-different" (Huron, *Sweet Anticipation*).
- **Rest > notes**: silence inside a melody is what makes it memorable. The hook of "Old Town Road" is mostly rest.
- **Sing-the-rhyme rule**: in vocal genres, the highest pitch of a phrase should fall on the rhyming syllable.
- **Avoid scale-runs as hooks**: scales are exercises. Hooks are *intervallic* (skips and gaps).

## 8. Rhythm

### Metric grid — the human bias
- **4/4** — 90% of popular music. Default unless user says otherwise.
- **3/4 / 6/8** — waltz, ballads, anime, "Earned It" (6/8 felt as 3+3).
- **6/8** — blues shuffle, slow jam, ballad. Triplet feel.
- **12/8** — gospel ballad, slow blues. Compound.
- **5/4 / 7/8** — odd, tension. Math rock, prog, Indian rhythmic cycles.
- **Indian Taal**: Teentaal (16 beats / 4+4+4+4), Rupak (7), Jhaptaal (10), Dadra (6).

### Groove (the single biggest "this is AI-generated" tell)
- **Microtiming offsets**: humans don't play exactly on the grid. Offsets of ±5–25 ms (bigger for hi-hat, smaller for kick) create groove.
- **Swing**: shift second 8th of each beat *later* by 50–67% (jazz: 67% triplet, hip-hop: 54–58% subtle).
- **Pocket**: kick/snare slightly behind beat (lazy, R&B, neo-soul) or slightly ahead (rock, drum-and-bass — pushes energy).
- **Velocity humanization**: hi-hat velocities should fluctuate ±20% with a pseudo-random pattern. Quantized identical-velocity hats sound like a click track.
- **Ghost notes**: snares and hi-hats benefit from ghost (5–15% velocity) hits between accented hits. They are 80% of why hip-hop beats feel "real".

### Genre rhythm signatures
| Genre | Kick pattern | Snare/clap | Hi-hats | Notes |
|---|---|---|---|---|
| EDM / House | four-on-the-floor (1 2 3 4) | 2 & 4 | offbeat 8ths | sidechain pumping |
| Trap | sparse — typically 1 and "and-of-2" | beat 3 | triplet 16ths/32nds | rolling |
| Drill | 1 and "ah-of-2" | 3 | sparse | sliding 808 |
| Boom bap | 1, 3 (sometimes 2.5) | 2, 4 | 8ths swung | sampled feel |
| Rock | 1, 3 | 2, 4 | 8ths straight | live-room |
| Reggaeton | dembow (1, 1.5, 2.5, 3.5) | offbeat | various | dembow is a fixed pattern |
| Bhangra | dhol pattern (chaal) | claps on 2 & 4 | hand-played | 8-beat repeated |
| Lo-fi | 1, 3 (sloppy) | 2, 4 | dusty 8ths | off-grid intentional |
| Drum & bass | half-time feel at 174 | snare on 3 (half-time) | breakbeat | Amen breaks |
| Bossa nova | 1, 2.5 | gentle, brushed | nylon-guitar syncopation | "samba lite" |

## 9. Tension & release — the engine of emotion

Music is **prediction and surprise** (Huron's ITPRA model: Imagination, Tension, Prediction, Reaction, Appraisal). The brain rewards:
1. **Predictable patterns** that confirm expectation (groove, repetition).
2. **Carefully timed violations** (the "twist" — a sus chord, a deceptive cadence, a key change).

**Practical**:
- Build tension with: rising melody, ascending bass, faster harmonic rhythm, density add, dynamic crescendo, sustained dissonance (b9, #11), held dominant chord, white-noise riser, filter sweep up.
- Release tension with: descending resolution to tonic, density drop, silence, kick-back-in after breakdown, return of the hook with added layer.
- **The ratio**: for a 3-minute pop song, ~70% predictable, ~30% surprising. For experimental music, invert. For lullabies / ambient, 95% predictable.

## 10. Motif development (composition's "soul")

A **motif** is a short recognizable musical idea (2–4 bars). Songs that haunt people use motif development. Songs that don't are forgettable.

Techniques:
- **Repetition** — state it twice exactly. Brain encodes it.
- **Sequence** — restate the motif a step higher or lower.
- **Inversion** — flip the contour upside-down.
- **Augmentation** — slow it down.
- **Diminution** — speed it up.
- **Fragmentation** — use just the rhythm, or just the first 3 notes.
- **Reharmonization** — same melody, new chords underneath. Powerful for last-chorus key changes.
- **Augmentation in the bridge** is one of the oldest tricks: the bridge transforms the verse motif.

The composer agent should plan **3–5 motifs per song**:
1. Hook motif (chorus) — the earworm
2. Verse motif — narrative thread
3. Counter-melody — instrumental answer to the vocal
4. Bridge motif — contrast (often relative minor/major or modal flip)
5. Tag/post-chorus — micro-hook (e.g., "ooh-ah" of "We Will Rock You")

## 11. Key relationships & modulation

Most-used modulation distances:
- **Up a whole step (e.g., C → D)** — "truck driver's gear change". Cheesy if overused, effective in last chorus.
- **Up a half step (C → C#)** — instant lift.
- **Relative major/minor (C ↔ Am)** — bridge contrast, costs nothing.
- **Parallel mode (C major ↔ C minor)** — emotional flip with same tonal center.
- **Up a fourth (C → F)** — gospel / soul / pop bridge.
- **Up a fifth (C → G)** — "brighter" — uncommon outside film score.
- **Tritone (C → F#)** — jazz, film score "stinger".

**Modulation requires a pivot chord or a strong dominant of the new key.** Otherwise it sounds like the rendering broke.

## 12. Idiomatic phrase lengths

| Style | Phrase | Section |
|---|---|---|
| Pop | 4 bars | 8 or 16 bars |
| EDM | 8 bars | 16 or 32 bars (drops are powers of 2) |
| Hip-hop | 4 bars | 8 or 16 (verses are typically 16) |
| Rock | 4 bars | 8 or 16 |
| Jazz | 8 bars | 32-bar AABA standard form |
| Bollywood | 4 or 8 bars | varies — extended interludes common |
| Indian classical | flexible (taal-driven) | ālāp → jor → jhālā (long form) |
| Film score | through-composed | scene length |

**AI failure mode**: models often produce 7-bar or 9-bar phrases, which feel "off" because the brain expects power-of-2 phrase grouping. The arrangement engine must enforce phrase-length quantization.

## 13. Practical lookup recipe (composition agent uses this)

Given a **brief** (mood, genre, language, occasion):

1. Pick **mode** from emotion table (§2).
2. Pick **key** — choose a register that sits the lead vocal (or lead instrument) in its sweet spot.
3. Pick **time signature** (§8) — default 4/4.
4. Pick **BPM** from genre band, biased by mood (sad → low edge of band, energetic → high edge).
5. Pick **progression** from CHORD_EMOTION_DATABASE matching mood + genre.
6. Pick **groove** from genre rhythm table.
7. Pick **arrangement archetype** from ARRANGEMENT_PATTERNS.json.
8. Plan **3–5 motifs** with intended payoffs.
9. Plan **tension/release peaks** along the energy curve (§9).
10. Plan **cadences** at section boundaries (§5).
11. Plan **modulations**, if any, with pivot chord (§11).

Output: a structured JSON `CompositionPlan` consumed by the prompt builder.

## 14. References (real ones)
- Huron, *Sweet Anticipation: Music and the Psychology of Expectation* (2006)
- Levitin, *This Is Your Brain on Music* (2006)
- Patel, *Music, Language, and the Brain* (2008)
- Krumhansl, *Cognitive Foundations of Musical Pitch* (1990)
- Schellenberg & Trehub, "Frequency ratios and the perception of tone patterns" (1996)
- Temperley, *Music and Probability* (2007)
- Tagg, *Music's Meanings* (2013)
- Russ, *Sound Synthesis and Sampling* (4th ed.)
