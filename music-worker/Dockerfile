FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    build-essential \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip

# Install PyTorch CPU wheel
RUN pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu

# Install audiocraft separately
RUN pip install audiocraft

# Copy requirements
COPY requirements.txt .

# Install remaining packages
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
