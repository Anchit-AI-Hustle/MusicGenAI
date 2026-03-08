# Music Generation Worker

Standalone Python service for AI music synthesis using MusicGen and Bark.

## Endpoints

- `GET /health` — Returns model load status
- `POST /generate` — Generate instrumental audio (MusicGen)
- `POST /generate-vocals` — Generate vocal audio (Bark)

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
