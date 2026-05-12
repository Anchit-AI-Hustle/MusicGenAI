"""
Stage-1 stub synthesizer.

Returns a silent WAV the same length as the input melody. Used to verify
the frontend integration end-to-end before Stage 3 plugs in DiffSinger.

Stage 3 will replace `synthesize()` with:
    phonemize(lyrics, language) -> phonemes
    align(phonemes, melody) -> mel frames
    DiffSinger.predict(mel_cond) -> mel
    HiFi-GAN.vocode(mel) -> audio
"""
from __future__ import annotations

import math
from typing import List

import numpy as np

from app.schemas import MelodyNote


def melody_duration_seconds(melody: List[MelodyNote]) -> float:
    """End time of the latest note. Floor at 1.0 second."""
    if not melody:
        return 1.0
    return max(1.0, max(n.start_seconds + n.duration_seconds for n in melody))


def synthesize(
    lyrics: str,
    melody: List[MelodyNote],
    voice: str,
    language: str,
    sample_rate: int,
    seed: int | None,
) -> np.ndarray:
    """
    Produce mono float32 audio in [-1, 1] for the duration of the melody.

    Stage 1: silence + a barely audible sine envelope at the fundamental
    of each note so the test pipeline can verify timing alignment without
    sounding like actual singing.
    """
    total_seconds = melody_duration_seconds(melody)
    n_samples = int(math.ceil(total_seconds * sample_rate))
    out = np.zeros(n_samples, dtype=np.float32)

    # Light deterministic tone-marker per note. Volume is intentionally
    # tiny (≈ -40 dB) — this is a stub, not a vocal.
    rng = np.random.default_rng(seed if seed is not None else 0)
    for note in melody:
        start = int(note.start_seconds * sample_rate)
        end = min(n_samples, start + int(note.duration_seconds * sample_rate))
        if end <= start:
            continue
        freq = 440.0 * (2 ** ((note.midi - 69) / 12))
        t = np.arange(end - start, dtype=np.float32) / sample_rate
        # Very soft sine + tiny noise so spectral analyzers register it.
        sample = 0.01 * np.sin(2 * math.pi * freq * t) * float(note.velocity)
        sample += 0.001 * rng.standard_normal(end - start).astype(np.float32)
        # Apply a quick attack/release so the tone isn't clicky.
        envelope_len = min(len(sample), int(0.01 * sample_rate))
        if envelope_len > 0:
            ramp = np.linspace(0, 1, envelope_len, dtype=np.float32)
            sample[:envelope_len] *= ramp
            sample[-envelope_len:] *= ramp[::-1]
        out[start:end] += sample

    # Note: language / voice / lyrics intentionally unused at Stage 1.
    _ = (language, voice, lyrics)
    return out
