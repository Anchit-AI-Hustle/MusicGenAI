# Music Generation Worker Service
# Deploy this as a standalone Python service (Docker, cloud VM, etc.)
# The Supabase Edge Function will call this service via HTTP

## Requirements
# pip install fastapi uvicorn audiocraft torchaudio bark scipy numpy

## Running
# uvicorn music_worker.main:app --host 0.0.0.0 --port 8000

## Docker
# See Dockerfile in this directory
