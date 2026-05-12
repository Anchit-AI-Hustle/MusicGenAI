# MuseVibe Vocal Service

FastAPI sidecar that synthesizes singing from `{ lyrics, melody_midi, voice }`
and returns a `.wav`. Runs locally on CPU (no GPU required).

## Current status

- **Stage 1 (this commit):** Scaffold + health check + request schema +
  stub synthesis (returns silent WAV the same length as the input MIDI).
  Used to validate the end-to-end frontend wiring before plugging in heavy
  models.
- **Stage 2:** Frontend Whisper-tiny backup ships in parallel — see
  `src/lib/vocal/whisper-fallback.ts` in the main repo.
- **Stage 3 (next):** Real DiffSinger acoustic + HiFi-GAN vocoder.

## Run locally

```bash
cd python-services/vocal-service
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload
```

Health: `curl http://127.0.0.1:8765/health` → `{"ok": true, "stage": 1, ...}`

## Run via Docker

From the project root:

```bash
docker compose -f docker-compose.vocal.yml up --build
```

## Frontend integration

The Vite app calls this service via `src/lib/vocal/diffsinger-client.ts`.
When the service is unreachable, the frontend silently falls back to the
in-browser Whisper-tiny path for karaoke subtitles over the instrumental.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + capability advertisement |
| POST | `/sing` | Submit a synthesis job → returns 202 + `job_id` |
| GET | `/sing/{job_id}` | Poll job status, eventually returns audio URL |
| GET | `/sing/{job_id}/audio` | Download the synthesized WAV |
