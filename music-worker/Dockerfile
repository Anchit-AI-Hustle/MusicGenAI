FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    pkg-config \
    git \
    build-essential \
    libsndfile1 \
    libavcodec-dev \
    libavformat-dev \
    libavdevice-dev \
    libavutil-dev \
    libavfilter-dev \
    libswscale-dev \
    libswresample-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip

# Install PyTorch first
RUN pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu

# Install audiocraft after torch
RUN pip install audiocraft

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

CMD ["uvicorn","main:app","--host","0.0.0.0","--port","8080"]
