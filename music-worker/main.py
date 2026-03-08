"""
Music Generation Worker — Modular FastAPI service for AI music synthesis.

Endpoints:
  GET  /health            — Model load status
  POST /generate-segment  — Generate a single instrumental segment (MusicGen)
  POST /generate-vocals   — Generate vocal audio (Bark)
  POST /align-vocals      — Align vocals to instrumental beat grid
  POST /stitch            — Crossfade-stitch multiple segments into one track
  POST /master            — Lightweight mastering (EQ, compression, limiter, stereo widening)
"""

import io
import os
import struct
import tempfile
import random
import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="Music Generation Worker")

# Global model references
musicgen_model = None
bark_loaded = False
SAMPLE_RATE = 32000  # MusicGen default


class SegmentRequest(BaseModel):
    prompt: str = "ambient electronic music"
    segment_name: str = "intro"
    duration: int = 30
    tempo: int = 120
    genre: str = "electronic"
    mood: str = "neutral"
    seed: Optional[int] = None


class VocalRequest(BaseModel):
    text: str
    voice_preset: str = "v2/en_speaker_6"
    text_temp: float = 0.7
    waveform_temp: float = 0.7


class StitchRequest(BaseModel):
    crossfade_seconds: float = 0.5
    target_duration: Optional[int] = None  # Trim to exact duration if set


class MasterRequest(BaseModel):
    target_lufs: float = -14.0
    stereo_width: float = 1.2
    compression_ratio: float = 3.0
    compression_threshold_db: float = -18.0


@app.on_event("startup")
async def load_models():
    """Load MusicGen model once at startup."""
    global musicgen_model, bark_loaded, SAMPLE_RATE
    try:
        from audiocraft.models import MusicGen
        model_name = os.environ.get("MUSICGEN_MODEL", "facebook/musicgen-small")
        print(f"[Worker] Loading MusicGen model ({model_name})...")
        musicgen_model = MusicGen.get_pretrained(model_name)
        musicgen_model.set_generation_params(use_sampling=True, top_k=250, duration=30)
        SAMPLE_RATE = musicgen_model.sample_rate
        print(f"[Worker] MusicGen loaded. Sample rate: {SAMPLE_RATE}")
    except Exception as e:
        print(f"[Worker] WARNING: Failed to load MusicGen: {e}")
        musicgen_model = None

    try:
        from bark import preload_models
        preload_models()
        bark_loaded = True
        print("[Worker] Bark loaded successfully.")
    except Exception as e:
        print(f"[Worker] Bark not loaded (optional): {e}")
        bark_loaded = False


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "musicgen_loaded": musicgen_model is not None,
        "bark_loaded": bark_loaded,
        "sample_rate": SAMPLE_RATE,
    }


# ─────────────────────────────────────────────
# STAGE 2 — SEGMENT GENERATION
# ─────────────────────────────────────────────

def _generate_musicgen_chunk(prompt: str, duration: int, seed: Optional[int] = None) -> np.ndarray:
    """Generate a single MusicGen chunk (max 30s). Returns float32 mono array."""
    import torch

    if seed is not None:
        torch.manual_seed(seed)
        np.random.seed(seed)

    capped = min(max(duration, 5), 30)
    musicgen_model.set_generation_params(use_sampling=True, top_k=250, duration=capped)

    with torch.no_grad():
        wav = musicgen_model.generate([prompt])

    audio = wav[0].cpu().numpy()
    if audio.ndim > 1:
        audio = audio[0]

    # Normalize to [-1, 1]
    peak = np.abs(audio).max()
    if peak > 0:
        audio = audio / peak
    return audio


@app.post("/generate-segment")
async def generate_segment(req: SegmentRequest):
    """Generate an instrumental segment. If duration > 30s, generates multiple chunks and concatenates."""
    if musicgen_model is None:
        raise HTTPException(status_code=503, detail="MusicGen model not loaded")

    try:
        base_seed = req.seed if req.seed is not None else random.randint(0, 2**31)
        full_prompt = f"{req.prompt}. {req.genre} music. {req.mood} mood. Section: {req.segment_name}. {req.tempo} BPM."

        # If duration ≤ 30, single chunk
        if req.duration <= 30:
            audio = _generate_musicgen_chunk(full_prompt, req.duration, base_seed)
        else:
            # Generate multiple 30s chunks and concatenate with short crossfade
            chunks = []
            remaining = req.duration
            chunk_idx = 0
            while remaining > 0:
                chunk_dur = min(30, remaining)
                chunk_seed = base_seed + chunk_idx
                chunk_audio = _generate_musicgen_chunk(full_prompt, chunk_dur, chunk_seed)
                chunks.append(chunk_audio)
                remaining -= chunk_dur
                chunk_idx += 1

            # Crossfade chunks together (0.25s crossfade between internal chunks)
            audio = chunks[0]
            crossfade_samples = int(0.25 * SAMPLE_RATE)
            for i in range(1, len(chunks)):
                if len(audio) >= crossfade_samples and len(chunks[i]) >= crossfade_samples:
                    fade_out = np.linspace(1, 0, crossfade_samples)
                    fade_in = np.linspace(0, 1, crossfade_samples)
                    audio[-crossfade_samples:] = audio[-crossfade_samples:] * fade_out + chunks[i][:crossfade_samples] * fade_in
                    audio = np.concatenate([audio, chunks[i][crossfade_samples:]])
                else:
                    audio = np.concatenate([audio, chunks[i]])

        # Trim to exact sample count
        target_samples = int(req.duration * SAMPLE_RATE)
        if len(audio) > target_samples:
            audio = audio[:target_samples]
        elif len(audio) < target_samples:
            # Pad with fade-out loop of last second
            loop_len = min(SAMPLE_RATE, len(audio))
            loop = audio[-loop_len:]
            fade = np.linspace(1, 0, loop_len)
            loop = loop * fade
            while len(audio) < target_samples:
                needed = target_samples - len(audio)
                audio = np.concatenate([audio, loop[:needed]])

        audio_int16 = (audio * 32767).astype(np.int16)
        buf = io.BytesIO()
        sf.write(buf, audio_int16, SAMPLE_RATE, format='WAV', subtype='PCM_16')
        buf.seek(0)

        return Response(
            content=buf.read(),
            media_type="audio/wav",
            headers={
                "Content-Disposition": f"attachment; filename={req.segment_name}.wav",
                "X-Sample-Rate": str(SAMPLE_RATE),
                "X-Duration": str(req.duration),
                "X-Seed": str(base_seed),
            },
        )
    except Exception as e:
        print(f"[Worker] Segment generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# BACKWARD COMPAT — old /generate endpoint
# ─────────────────────────────────────────────

class LegacyGenerateRequest(BaseModel):
    prompt: str = "ambient electronic music"
    duration: int = 30
    tempo: Optional[int] = 120
    genre: Optional[List[str]] = []
    mood: Optional[List[str]] = []
    continuation_audio_url: Optional[str] = None
    continuation_start: Optional[float] = None
    tempo_bpm: Optional[int] = None


@app.post("/generate")
async def generate_legacy(req: LegacyGenerateRequest):
    """Legacy endpoint — wraps generate_segment."""
    seg_req = SegmentRequest(
        prompt=req.prompt,
        segment_name="segment",
        duration=min(req.duration, 30),
        tempo=req.tempo_bpm or req.tempo or 120,
        genre=", ".join(req.genre) if req.genre else "electronic",
        mood=", ".join(req.mood) if req.mood else "neutral",
    )
    return await generate_segment(seg_req)


# ─────────────────────────────────────────────
# STAGE 3 — VOCAL GENERATION (Bark)
# ─────────────────────────────────────────────

@app.post("/generate-vocals")
async def generate_vocals(req: VocalRequest):
    """Generate vocal audio using Bark."""
    if not bark_loaded:
        raise HTTPException(status_code=503, detail="Bark model not loaded")

    try:
        from bark import generate_audio, SAMPLE_RATE as BARK_SR

        audio_array = generate_audio(
            req.text,
            history_prompt=req.voice_preset,
            text_temp=req.text_temp,
            waveform_temp=req.waveform_temp,
        )

        peak = np.abs(audio_array).max()
        if peak > 0:
            audio_array = audio_array / peak
        audio_int16 = (audio_array * 32767).astype(np.int16)

        buf = io.BytesIO()
        sf.write(buf, audio_int16, BARK_SR, format='WAV', subtype='PCM_16')
        buf.seek(0)

        return Response(
            content=buf.read(),
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=vocals.wav"},
        )
    except Exception as e:
        print(f"[Worker] Vocal generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# STAGE 4 — VOCAL ALIGNMENT
# ─────────────────────────────────────────────

@app.post("/align-vocals")
async def align_vocals(
    instrumental: UploadFile = File(...),
    vocals: UploadFile = File(...),
    tempo: int = Form(120),
):
    """Align vocal track to instrumental beat grid using simple onset detection and time-stretching."""
    try:
        inst_data, inst_sr = sf.read(io.BytesIO(await instrumental.read()))
        vocal_data, vocal_sr = sf.read(io.BytesIO(await vocals.read()))

        # Ensure mono
        if inst_data.ndim > 1:
            inst_data = inst_data.mean(axis=1)
        if vocal_data.ndim > 1:
            vocal_data = vocal_data.mean(axis=1)

        # Resample vocals to match instrumental SR if different
        if vocal_sr != inst_sr:
            from scipy.signal import resample
            ratio = inst_sr / vocal_sr
            vocal_data = resample(vocal_data, int(len(vocal_data) * ratio))

        # Time-stretch vocals to match instrumental length
        inst_len = len(inst_data)
        vocal_len = len(vocal_data)

        if vocal_len != inst_len:
            # Simple linear resampling to match lengths
            from scipy.signal import resample
            vocal_data = resample(vocal_data, inst_len)

        # Normalize vocals
        peak = np.abs(vocal_data).max()
        if peak > 0:
            vocal_data = vocal_data / peak * 0.7  # Vocals at 70% volume relative to instrumental

        # Mix: instrumental at full volume, vocals layered on top
        mix = inst_data * 0.8 + vocal_data * 0.5
        peak = np.abs(mix).max()
        if peak > 0:
            mix = mix / peak * 0.95

        mix_int16 = (mix * 32767).astype(np.int16)
        buf = io.BytesIO()
        sf.write(buf, mix_int16, inst_sr, format='WAV', subtype='PCM_16')
        buf.seek(0)

        return Response(
            content=buf.read(),
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=aligned.wav"},
        )
    except Exception as e:
        print(f"[Worker] Vocal alignment error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# STAGE 5 — SEGMENT STITCHING
# ─────────────────────────────────────────────

@app.post("/stitch")
async def stitch_segments(
    segments: List[UploadFile] = File(...),
    crossfade_seconds: float = Form(0.5),
    target_duration: Optional[int] = Form(None),
):
    """Stitch multiple audio segments with crossfade. Normalize sample rates. Trim to target duration."""
    try:
        audio_arrays = []
        common_sr = None

        for seg_file in segments:
            data, sr = sf.read(io.BytesIO(await seg_file.read()))
            if data.ndim > 1:
                data = data.mean(axis=1)  # Convert to mono

            if common_sr is None:
                common_sr = sr
            elif sr != common_sr:
                # Resample to common SR
                from scipy.signal import resample
                ratio = common_sr / sr
                data = resample(data, int(len(data) * ratio))

            audio_arrays.append(data)

        if not audio_arrays:
            raise HTTPException(status_code=400, detail="No segments provided")

        # Crossfade stitch
        crossfade_samples = int(crossfade_seconds * common_sr)
        result = audio_arrays[0]

        for i in range(1, len(audio_arrays)):
            seg = audio_arrays[i]
            if len(result) >= crossfade_samples and len(seg) >= crossfade_samples:
                fade_out = np.linspace(1, 0, crossfade_samples)
                fade_in = np.linspace(0, 1, crossfade_samples)
                result[-crossfade_samples:] = result[-crossfade_samples:] * fade_out + seg[:crossfade_samples] * fade_in
                result = np.concatenate([result, seg[crossfade_samples:]])
            else:
                result = np.concatenate([result, seg])

        # Trim to exact target duration
        if target_duration is not None:
            target_samples = int(target_duration * common_sr)
            if len(result) > target_samples:
                # Apply short fade-out before trimming
                fade_len = min(int(0.1 * common_sr), target_samples)
                result[target_samples - fade_len:target_samples] *= np.linspace(1, 0, fade_len)
                result = result[:target_samples]
            elif len(result) < target_samples:
                # Extend with faded loop of the last second
                loop_len = min(common_sr, len(result))
                loop = result[-loop_len:] * np.linspace(1, 0, loop_len)
                while len(result) < target_samples:
                    needed = target_samples - len(result)
                    result = np.concatenate([result, loop[:needed]])

        # Normalize
        peak = np.abs(result).max()
        if peak > 0:
            result = result / peak * 0.95

        result_int16 = (result * 32767).astype(np.int16)
        buf = io.BytesIO()
        sf.write(buf, result_int16, common_sr, format='WAV', subtype='PCM_16')
        buf.seek(0)

        return Response(
            content=buf.read(),
            media_type="audio/wav",
            headers={
                "Content-Disposition": "attachment; filename=stitched.wav",
                "X-Sample-Rate": str(common_sr),
                "X-Duration": str(len(result) / common_sr),
            },
        )
    except Exception as e:
        print(f"[Worker] Stitch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# STAGE 6 — MASTERING
# ─────────────────────────────────────────────

@app.post("/master")
async def master_audio(
    audio: UploadFile = File(...),
    target_lufs: float = Form(-14.0),
    stereo_width: float = Form(1.2),
    compression_ratio: float = Form(3.0),
    compression_threshold_db: float = Form(-18.0),
):
    """Lightweight mastering: EQ shelf boost, compression, limiter, stereo widening, LUFS normalization."""
    try:
        data, sr = sf.read(io.BytesIO(await audio.read()))
        is_mono = data.ndim == 1

        if is_mono:
            data = np.column_stack([data, data])  # Convert to stereo for processing

        left = data[:, 0].astype(np.float64)
        right = data[:, 1].astype(np.float64)

        # ── EQ: gentle high-shelf boost (presence) ──
        # Simple first-order high-shelf at ~3kHz
        from scipy.signal import butter, lfilter
        cutoff = 3000 / (sr / 2)
        if cutoff < 1.0:
            b, a = butter(1, cutoff, btype='high')
            left_high = lfilter(b, a, left)
            right_high = lfilter(b, a, right)
            # Boost high frequencies by ~2dB
            boost = 10 ** (2.0 / 20)
            left = left + left_high * (boost - 1)
            right = right + right_high * (boost - 1)

        # ── Compression ──
        threshold = 10 ** (compression_threshold_db / 20)
        for ch in [left, right]:
            abs_ch = np.abs(ch)
            mask = abs_ch > threshold
            ch[mask] = np.sign(ch[mask]) * (threshold + (abs_ch[mask] - threshold) / compression_ratio)

        # ── Stereo widening ──
        mid = (left + right) / 2
        side = (left - right) / 2
        side *= stereo_width
        left = mid + side
        right = mid - side

        # ── Mono-sum kick & bass (below 200Hz) ──
        cutoff_low = 200 / (sr / 2)
        if cutoff_low < 1.0:
            b_low, a_low = butter(2, cutoff_low, btype='low')
            left_low = lfilter(b_low, a_low, left)
            right_low = lfilter(b_low, a_low, right)
            mono_low = (left_low + right_low) / 2
            left = left - left_low + mono_low
            right = right - right_low + mono_low

        # ── Limiter (brick wall at -1dBFS) ──
        limit = 10 ** (-1.0 / 20)  # ~0.891
        stereo = np.column_stack([left, right])
        peak = np.abs(stereo).max()
        if peak > limit:
            stereo = stereo * (limit / peak)

        # ── LUFS normalization (approximate) ──
        rms = np.sqrt(np.mean(stereo ** 2))
        if rms > 0:
            current_lufs_approx = 20 * np.log10(rms) - 0.691
            gain_db = target_lufs - current_lufs_approx
            gain = 10 ** (gain_db / 20)
            stereo = stereo * gain
            # Re-apply limiter
            peak = np.abs(stereo).max()
            if peak > limit:
                stereo = stereo * (limit / peak)

        stereo_int16 = (np.clip(stereo, -1, 1) * 32767).astype(np.int16)
        buf = io.BytesIO()
        sf.write(buf, stereo_int16, sr, format='WAV', subtype='PCM_16')
        buf.seek(0)

        return Response(
            content=buf.read(),
            media_type="audio/wav",
            headers={
                "Content-Disposition": "attachment; filename=mastered.wav",
                "X-Target-LUFS": str(target_lufs),
            },
        )
    except Exception as e:
        print(f"[Worker] Mastering error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
