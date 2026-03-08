# Music Generation Worker

Modular Python service for AI music synthesis using MusicGen and Bark.

## Endpoints

- `GET /health` — Returns model load status
- `POST /generate-segment` — Generate a single instrumental segment (MusicGen)
- `POST /generate` — Legacy: generate a single audio chunk
- `POST /generate-vocals` — Generate vocal audio (Bark)
- `POST /align-vocals` — Align and mix vocals with instrumental
- `POST /stitch` — Crossfade-stitch multiple segments into one track
- `POST /master` — Lightweight mastering (EQ, compression, limiter, stereo widening)

## Architecture

```
Edge Function (orchestrator)
  → /generate-segment (×N parallel, max 3)
  → /generate-vocals (optional)
  → /stitch (crossfade + trim)
  → /align-vocals (optional)
  → /master (EQ, compression, limiter, LUFS)
  → Final WAV uploaded to storage
```

## Local Development

```bash
cd music-worker
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8080
```

## Docker

```bash
docker build -t music-worker .
docker run -p 8080:8080 music-worker
```

## Railway Deployment

Connect this repository to Railway and set the root directory to `music-worker/`.
Railway will auto-detect the Dockerfile and deploy.
