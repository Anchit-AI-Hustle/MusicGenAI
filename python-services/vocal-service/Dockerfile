# Stage 1 image — minimal Python + uvicorn. Heavy ML deps land in Stage 3.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# libsndfile is needed by `soundfile` at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt

COPY app /app/app

EXPOSE 8765
ENV VOCAL_OUTPUT_DIR=/data/generated_vocals
VOLUME ["/data/generated_vocals"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765"]
