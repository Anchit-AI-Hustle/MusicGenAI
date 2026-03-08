"""
Music Generation Worker — FastAPI service for MusicGen + Bark synthesis.

This service is called by the Supabase Edge Function to generate audio segments.
It loads models once at startup and serves generation requests via HTTP.
"""

import io
import logging
import tempfile
from typing import Optional

import numpy as np
import scipy.io.wavfile as wavfile
import torch
import torchaudio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Music Generation Worker", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== Global model references (loaded once at startup) =====
musicgen_model = None
bark_loaded = False


@app.on_event("startup")
async def load_models():
    """Load MusicGen and Bark models at startup."""
    global musicgen_model, bark_loaded

    logger.info("Loading MusicGen model (facebook/musicgen-medium)...")
    try:
        from audiocraft.models import MusicGen
        musicgen_model = MusicGen.get_pretrained("facebook/musicgen-medium")
        logger.info("✅ MusicGen model loaded successfully")
    except Exception as e:
        logger.error(f"❌ Failed to load MusicGen: {e}")

    logger.info("Preloading Bark models...")
    try:
        from bark import preload_models
        preload_models()
        bark_loaded = True
        logger.info("✅ Bark models loaded successfully")
    except Exception as e:
        logger.error(f"❌ Failed to load Bark: {e}")


# ===== Request/Response Models =====

class GenerateMusicRequest(BaseModel):
    prompt: str = Field(..., description="Text prompt describing the music to generate")
    duration: int = Field(default=30, ge=1, le=60, description="Duration in seconds (max 60)")
    continuation_audio_url: Optional[str] = Field(default=None, description="URL of previous segment for continuation")
    continuation_start: Optional[int] = Field(default=None, description="Start second for continuation context")
    tempo_bpm: Optional[int] = Field(default=None, description="Target BPM for beat grid alignment")


class GenerateVocalsRequest(BaseModel):
    text: str = Field(..., description="Lyrics/text to synthesize")
    voice_preset: str = Field(default="v2/en_speaker_6", description="Bark voice preset identifier")
    text_temp: float = Field(default=0.7, ge=0.1, le=1.5, description="Text generation temperature")
    waveform_temp: float = Field(default=0.7, ge=0.1, le=1.5, description="Waveform generation temperature")


class HealthResponse(BaseModel):
    status: str
    musicgen_loaded: bool
    bark_loaded: bool


# ===== Endpoints =====

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="ok",
        musicgen_loaded=musicgen_model is not None,
        bark_loaded=bark_loaded,
    )


@app.post("/generate")
async def generate_music(request: GenerateMusicRequest):
    """
    Generate an instrumental audio segment using MusicGen.

    Returns a WAV audio stream.
    """
    if musicgen_model is None:
        raise HTTPException(status_code=503, detail="MusicGen model not loaded")

    try:
        logger.info(f"Generating music: duration={request.duration}s, prompt='{request.prompt[:80]}...'")

        # Set generation parameters
        musicgen_model.set_generation_params(
            duration=request.duration,
            use_sampling=True,
            top_k=250,
            top_p=0.0,
            temperature=1.0,
            cfg_coef=3.0,
        )

        # Handle continuation from previous segment
        melody_waveform = None
        melody_sample_rate = None

        if request.continuation_audio_url:
            try:
                import urllib.request
                logger.info(f"Downloading continuation audio from: {request.continuation_audio_url[:80]}...")
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    urllib.request.urlretrieve(request.continuation_audio_url, tmp.name)
                    melody_waveform, melody_sample_rate = torchaudio.load(tmp.name)

                    # Use only the last N seconds for context
                    if request.continuation_start and melody_sample_rate:
                        start_sample = int(request.continuation_start * melody_sample_rate)
                        if start_sample < melody_waveform.shape[1]:
                            melody_waveform = melody_waveform[:, start_sample:]

                    logger.info(f"Continuation audio loaded: {melody_waveform.shape}")
            except Exception as e:
                logger.warning(f"Failed to load continuation audio, generating without: {e}")
                melody_waveform = None

        # Generate audio
        if melody_waveform is not None:
            wav = musicgen_model.generate_with_chroma(
                descriptions=[request.prompt],
                melody_wavs=melody_waveform.unsqueeze(0),
                melody_sample_rate=melody_sample_rate,
                progress=True,
            )
        else:
            wav = musicgen_model.generate(
                descriptions=[request.prompt],
                progress=True,
            )

        # Convert to WAV bytes
        audio_data = wav[0].cpu()  # Shape: [channels, samples]
        sample_rate = musicgen_model.sample_rate

        # Normalize to int16
        audio_np = audio_data.numpy()
        if audio_np.ndim == 2:
            # Average channels to mono for compatibility, or keep stereo
            if audio_np.shape[0] == 2:
                audio_np = audio_np.T  # [samples, 2] for stereo
            else:
                audio_np = audio_np[0]  # mono

        # Normalize
        audio_np = audio_np / (np.abs(audio_np).max() + 1e-8)
        audio_int16 = (audio_np * 32767).astype(np.int16)

        # Write to WAV buffer
        buffer = io.BytesIO()
        wavfile.write(buffer, sample_rate, audio_int16)
        buffer.seek(0)

        logger.info(f"✅ Generated {request.duration}s of audio ({buffer.getbuffer().nbytes} bytes)")

        return StreamingResponse(
            buffer,
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=segment.wav"},
        )

    except Exception as e:
        logger.error(f"❌ MusicGen generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Music generation failed: {str(e)}")


@app.post("/generate-vocals")
async def generate_vocals(request: GenerateVocalsRequest):
    """
    Generate vocal audio using Bark text-to-speech synthesis.

    Returns a WAV audio stream.
    """
    if not bark_loaded:
        raise HTTPException(status_code=503, detail="Bark model not loaded")

    try:
        from bark import generate_audio, SAMPLE_RATE

        logger.info(f"Generating vocals: text='{request.text[:50]}...', voice={request.voice_preset}")

        # Generate audio with Bark
        audio_array = generate_audio(
            request.text,
            history_prompt=request.voice_preset,
            text_temp=request.text_temp,
            waveform_temp=request.waveform_temp,
        )

        # Normalize to int16
        audio_array = audio_array / (np.abs(audio_array).max() + 1e-8)
        audio_int16 = (audio_array * 32767).astype(np.int16)

        # Write to WAV buffer
        buffer = io.BytesIO()
        wavfile.write(buffer, SAMPLE_RATE, audio_int16)
        buffer.seek(0)

        logger.info(f"✅ Generated vocals ({buffer.getbuffer().nbytes} bytes)")

        return StreamingResponse(
            buffer,
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=vocals.wav"},
        )

    except Exception as e:
        logger.error(f"❌ Bark vocal generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Vocal generation failed: {str(e)}")


@app.post("/mix")
async def mix_tracks():
    """
    Future endpoint for mixing instrumental + vocal tracks.
    Requires FFmpeg integration.
    """
    raise HTTPException(status_code=501, detail="Mixing endpoint not yet implemented")
