"""
Music Generation Worker — FastAPI service for MusicGen + Bark synthesis.

This service is called by the Supabase Edge Function to generate audio segments.
It loads models once at startup and serves generation requests via HTTP.
"""

import io
import numpy as np
import scipy.io.wavfile as wavfile
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="Music Generation Worker")

# Global model references (loaded once at startup)
musicgen_model = None
bark_loaded = False


class GenerateRequest(BaseModel):
    prompt: str = "ambient electronic music"
    duration: int = 30
    tempo: Optional[int] = 120
    genre: Optional[List[str]] = []
    mood: Optional[List[str]] = []
    lyrics: Optional[str] = ""
    structure: Optional[str] = ""
    continuation_audio_url: Optional[str] = None
    continuation_start: Optional[float] = None
    tempo_bpm: Optional[int] = None


class VocalRequest(BaseModel):
    text: str
    voice_preset: str = "v2/en_speaker_6"
    text_temp: float = 0.7
    waveform_temp: float = 0.7


@app.on_event("startup")
async def load_models():
    """Load MusicGen model once at startup and keep in memory."""
    global musicgen_model, bark_loaded
    try:
        from audiocraft.models import MusicGen
        print("[Worker] Loading MusicGen model (facebook/musicgen-small)...")
        musicgen_model = MusicGen.get_pretrained("facebook/musicgen-small")
        musicgen_model.set_generation_params(use_sampling=True, top_k=250, duration=30)
        print("[Worker] MusicGen loaded successfully.")
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
    }


@app.post("/generate")
async def generate(req: GenerateRequest):
    """Generate an instrumental audio segment using MusicGen."""
    if musicgen_model is None:
        raise HTTPException(status_code=503, detail="MusicGen model not loaded")

    try:
        prompt_parts = [req.prompt]
        if req.genre:
            prompt_parts.append(f"genre: {', '.join(req.genre)}")
        if req.mood:
            prompt_parts.append(f"mood: {', '.join(req.mood)}")
        if req.structure:
            prompt_parts.append(f"structure: {req.structure}")
        tempo = req.tempo_bpm or req.tempo or 120
        prompt_parts.append(f"{tempo} BPM")
        full_prompt = ". ".join(prompt_parts)

        duration = min(max(req.duration, 5), 30)
        musicgen_model.set_generation_params(use_sampling=True, top_k=250, duration=duration)

        import torch
        with torch.no_grad():
            wav = musicgen_model.generate([full_prompt])

        audio_numpy = wav[0].cpu().numpy()
        if audio_numpy.ndim > 1:
            audio_numpy = audio_numpy[0]

        sample_rate = musicgen_model.sample_rate
        audio_numpy = audio_numpy / (np.abs(audio_numpy).max() + 1e-8)
        audio_int16 = (audio_numpy * 32767).astype(np.int16)

        buf = io.BytesIO()
        wavfile.write(buf, sample_rate, audio_int16)
        buf.seek(0)

        return Response(
            content=buf.read(),
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=segment.wav"},
        )
    except Exception as e:
        print(f"[Worker] Generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-vocals")
async def generate_vocals(req: VocalRequest):
    """Generate vocal audio using Bark."""
    if not bark_loaded:
        raise HTTPException(status_code=503, detail="Bark model not loaded")

    try:
        from bark import generate_audio, SAMPLE_RATE

        audio_array = generate_audio(
            req.text,
            history_prompt=req.voice_preset,
            text_temp=req.text_temp,
            waveform_temp=req.waveform_temp,
        )

        audio_array = audio_array / (np.abs(audio_array).max() + 1e-8)
        audio_int16 = (audio_array * 32767).astype(np.int16)

        buf = io.BytesIO()
        wavfile.write(buf, SAMPLE_RATE, audio_int16)
        buf.seek(0)

        return Response(
            content=buf.read(),
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=vocals.wav"},
        )
    except Exception as e:
        print(f"[Worker] Vocal generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
