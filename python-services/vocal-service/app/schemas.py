"""
Request / response schemas for the vocal service.

These shapes match `src/lib/vocal/diffsinger-client.ts` on the frontend
side, so any change here MUST be mirrored there.
"""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


VoiceGender = Literal["male", "female", "neutral"]


class MelodyNote(BaseModel):
    """One note on the melody line that the singer should follow."""
    start_seconds: float = Field(..., ge=0, description="Note onset in seconds")
    duration_seconds: float = Field(..., gt=0, description="Note length in seconds")
    midi: int = Field(..., ge=0, le=127, description="MIDI pitch number")
    velocity: float = Field(0.8, ge=0, le=1, description="0–1 dynamic")


class SingRequest(BaseModel):
    """
    Synthesize a sung vocal line from lyrics + a per-note pitch plan.

    The frontend extracts these from the existing music engine
    (`generateMelody`) — every melody event becomes a MelodyNote, and the
    user's lyric text is segmented to one syllable per note.
    """
    lyrics: str = Field(..., min_length=1, description="Full lyric text. May contain section tags like [Verse 1].")
    melody: List[MelodyNote] = Field(..., min_length=1, description="Melodic plan to sing to")
    voice: VoiceGender = "neutral"
    language: str = Field("en", description="ISO-639-1 lyric language. Drives phonemizer selection.")
    sample_rate: int = Field(44100, ge=16000, le=48000, description="Output WAV sample rate")
    tempo_bpm: float = Field(120.0, gt=0, description="Tempo for any beat-relative timing decisions")
    seed: Optional[int] = Field(None, description="Deterministic seed for reproducibility")


class JobAcceptedResponse(BaseModel):
    job_id: str
    status: Literal["queued"] = "queued"
    poll_url: str
    audio_url: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: Literal["queued", "running", "complete", "failed"]
    progress: float = Field(0.0, ge=0, le=1)
    stage_label: str = ""
    error: Optional[str] = None
    audio_url: Optional[str] = None
    duration_seconds: Optional[float] = None


class HealthResponse(BaseModel):
    ok: bool
    stage: int
    stage_label: str
    capabilities: List[str]
    version: str
