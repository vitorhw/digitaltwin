# Coqui AI TTS Setup Guide

This project uses **Coqui AI TTS (XTTS-v2)** for self-hosted voice cloning. The backend lives under the `backend/` directory.

## Architecture

- **Frontend**: Next.js app on port 3000
- **Backend**: FastAPI server (`backend/unified_server.py`) on port 8001
- **Model**: `tts_models/multilingual/multi-dataset/xtts_v2`
- **Audio Format**: WAV streaming

## Prerequisites

- Python 3.9+ (3.10 recommended)
- Node.js 18+
- **FFmpeg** (for audio format conversion)
- CUDA GPU (optional, for faster synthesis)

### Installing FFmpeg

**Ubuntu/Debian:**
```bash
sudo apt-get update && sudo apt-get install -y ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
Download from https://ffmpeg.org/download.html

## Installation

### 1. Install Python Dependencies

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

**Note**: First run downloads ~1.8GB XTTS-v2 model to `~/.local/share/tts/`

### 2. Start the backend

```bash
python unified_server.py
```

The server listens on `http://localhost:8001`.

### 3. Start the Next.js dev server

```bash
pnpm dev
```

## API Endpoints

### Backend (Port 8001)

- `GET /health` – Check server status, model info, and voice count
- `POST /api/coqui/clone_voice` – Upload audio sample for voice cloning
- `POST /api/coqui/synthesize` – Generate speech from text
- `DELETE /api/coqui/voice/{voice_id}` – Remove stored voice embeddings

### Next.js Proxy (Port 3000)

- `POST /api/voice/enroll` – Voice enrollment (calls backend)
- `POST /api/coqui/tts` – Text-to-speech synthesis (calls backend)

## Usage Flow

1. **Enroll Voice**: Upload a 6-30 second audio sample via the Voice settings panel.
2. **Enable Speak-Back**: Toggle “Speak back messages” in Voice settings.
3. **Chat**: Send messages – AI responses play back in cloned voice.
4. **Progress Bar**: Voice console shows audio playback position.

## Troubleshooting

### Backend won’t start
- **Check Python version**: `python --version` (need 3.9+)
- **Install dependencies**: `pip install -r backend/requirements.txt`
- **Port conflict**: Kill process on port 8001 (`lsof -ti:8001 | xargs kill -9` on macOS/Linux, `Stop-Process -Id <pid>` on Windows)

### Voice enrollment fails
- **Check file format**: Accepts MP3, WAV, OGG
- **Check duration**: 6-30 seconds recommended
- **Check server**: Visit `http://localhost:8001/health`

### TTS synthesis fails
- **Check voice_id**: Must enroll voice first
- **Check logs**: Backend console shows detailed errors
- **Check GPU memory**: CUDA errors mean out of VRAM (fall back to CPU)

### Audio playback stutters
- **Wait for full download**: Ensure the response stream completes
- **Check network**: Proxy route may timeout on slow connections
- **Check browser**: Chrome/Edge recommended for Audio API

## Production Tips

1. **Replace in-memory storage** with Redis for voice embeddings.
2. **Add authentication** around the backend endpoints.
3. **Configure CORS** to allow only trusted origins.
4. **Use GPU** for faster synthesis (CUDA 11.8+ recommended).
5. **Load balance** multiple backend instances behind nginx or another proxy.
