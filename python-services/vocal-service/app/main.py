"""
MuseVibe Vocal Service — FastAPI entrypoint.

Stage 1 (current): scaffolding + stub synthesizer. The frontend can already
submit jobs, poll status, and download audio — the returned WAV is silent
but exercise-tests the integration end-to-end.

Job lifecycle:
    POST /sing            -> { job_id, status: queued }
    GET  /sing/{job_id}   -> { status, progress, audio_url? }
    GET  /sing/{job_id}/audio  (only after status === "complete")

Jobs run on a background thread so the HTTP request returns immediately.
Stage 3 will swap the stub for the DiffSinger pipeline; the contract here
won't change.
"""
from __future__ import annotations

import io
import logging
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.schemas import (
    HealthResponse,
    JobAcceptedResponse,
    JobStatusResponse,
    SingRequest,
)
from app.services.synth_stub import melody_duration_seconds, synthesize

VERSION = "0.1.0-stage1"
STAGE = 1
STAGE_LABEL = "stub (silent placeholder)"
CAPABILITIES = ["health", "submit-job", "poll-status", "download-wav"]

logger = logging.getLogger("vocal-service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Where finished WAVs land. Configurable via VOCAL_OUTPUT_DIR.
import os
OUTPUT_DIR = Path(os.environ.get("VOCAL_OUTPUT_DIR", "./generated_vocals")).resolve()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class Job:
    job_id: str
    status: str = "queued"
    progress: float = 0.0
    stage_label: str = "queued"
    error: Optional[str] = None
    audio_path: Optional[Path] = None
    duration_seconds: Optional[float] = None
    # Locked so multiple threads (worker + polling reads) don't race.
    lock: threading.Lock = field(default_factory=threading.Lock)


JOBS: Dict[str, Job] = {}
JOBS_LOCK = threading.Lock()


def _set_job(job: Job, **kwargs) -> None:
    with job.lock:
        for k, v in kwargs.items():
            setattr(job, k, v)


def _run_job(job_id: str, req: SingRequest) -> None:
    """
    Worker entry — runs on a background thread. Updates the Job state in
    place. Production-grade error handling: any exception is captured and
    surfaced via the status endpoint instead of killing the worker thread.
    """
    job = JOBS.get(job_id)
    if job is None:
        logger.error("Worker got missing job_id=%s", job_id)
        return

    _set_job(job, status="running", stage_label="phonemizing", progress=0.05)
    try:
        # Stage 1: stub path. Stage 3 will replace this block with the
        # phonemize → align → DiffSinger → HiFi-GAN pipeline.
        time.sleep(0.05)  # simulate boot
        _set_job(job, stage_label="aligning to melody", progress=0.25)
        time.sleep(0.05)
        _set_job(job, stage_label="synthesizing vocal", progress=0.55)

        audio = synthesize(
            lyrics=req.lyrics,
            melody=req.melody,
            voice=req.voice,
            language=req.language,
            sample_rate=req.sample_rate,
            seed=req.seed,
        )
        _set_job(job, stage_label="encoding wav", progress=0.9)

        out_path = OUTPUT_DIR / f"{job_id}.wav"
        sf.write(str(out_path), audio.astype(np.float32), req.sample_rate, subtype="FLOAT")
        duration = float(len(audio) / req.sample_rate)

        _set_job(
            job,
            status="complete",
            stage_label="complete",
            progress=1.0,
            audio_path=out_path,
            duration_seconds=duration,
        )
        logger.info("Job %s complete (%.2fs of audio, stage=%d)", job_id, duration, STAGE)
    except Exception as exc:  # noqa: BLE001 — we want to capture any worker failure
        logger.exception("Job %s failed", job_id)
        _set_job(job, status="failed", stage_label="failed", progress=1.0, error=str(exc))


app = FastAPI(title="MuseVibe Vocal Service", version=VERSION)

# CORS — Vite dev server runs on 5173 / 8080 by default.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        ok=True,
        stage=STAGE,
        stage_label=STAGE_LABEL,
        capabilities=CAPABILITIES,
        version=VERSION,
    )


def _build_urls(request: Request, job_id: str) -> tuple[str, str]:
    base = str(request.base_url).rstrip("/")
    return f"{base}/sing/{job_id}", f"{base}/sing/{job_id}/audio"


@app.post("/sing", response_model=JobAcceptedResponse, status_code=202)
def submit_sing(req: SingRequest, request: Request) -> JobAcceptedResponse:
    if melody_duration_seconds(req.melody) > 600:
        raise HTTPException(status_code=413, detail="Melody longer than 10 minutes is not supported")
    job_id = uuid.uuid4().hex
    job = Job(job_id=job_id)
    with JOBS_LOCK:
        JOBS[job_id] = job
    threading.Thread(target=_run_job, args=(job_id, req), daemon=True).start()
    poll_url, audio_url = _build_urls(request, job_id)
    return JobAcceptedResponse(job_id=job_id, status="queued", poll_url=poll_url, audio_url=audio_url)


@app.get("/sing/{job_id}", response_model=JobStatusResponse)
def get_job(job_id: str, request: Request) -> JobStatusResponse:
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    with job.lock:
        _, audio_url = _build_urls(request, job_id)
        return JobStatusResponse(
            job_id=job.job_id,
            status=job.status,  # type: ignore[arg-type]
            progress=job.progress,
            stage_label=job.stage_label,
            error=job.error,
            audio_url=audio_url if job.status == "complete" else None,
            duration_seconds=job.duration_seconds,
        )


@app.get("/sing/{job_id}/audio")
def get_audio(job_id: str) -> FileResponse:
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    with job.lock:
        if job.status != "complete" or job.audio_path is None:
            raise HTTPException(status_code=409, detail=f"job not complete (status={job.status})")
        path = job.audio_path
    if not path.exists():
        raise HTTPException(status_code=410, detail="audio expired or removed")
    return FileResponse(path, media_type="audio/wav", filename=f"vocal-{job_id}.wav")


# Friendly root for browser sanity checks
@app.get("/")
def root() -> JSONResponse:
    return JSONResponse(
        {
            "service": "MuseVibe Vocal Service",
            "stage": STAGE,
            "version": VERSION,
            "docs": "/docs",
            "health": "/health",
        }
    )
