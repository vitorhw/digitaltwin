# Coqui AI TTS Setup Guide

This project uses **Coqui AI TTS (XTTS-v2)** for self-hosted voice cloning, replacing the subscription-based ElevenLabs service.

## Architecture

- **Frontend**: Next.js app on port 3000
- **Backend**: FastAPI Python server on port 8000
- **Model**: `tts_models/multilingual/multi-dataset/xtts_v2` (open-source)
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
pip install -r requirements.txt
```

**Note**: First run downloads ~1.8GB XTTS-v2 model to `~/.local/share/tts/`

### 2. Set Environment Variables

Add to `.env.local`:

```env
COQUI_API_URL=http://localhost:8000
```

### 3. Start the TTS Server

```bash
python tts_server.py
```

Expected output:
```
INFO:     Started server process
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 4. Start Next.js Dev Server

In a separate terminal:

```bash
pnpm dev
```

## API Endpoints

### TTS Server (Port 8000)

- `GET /health` - Check server status, model info, voice count
- `POST /clone_voice` - Upload audio sample for voice cloning
  - Body: `multipart/form-data` with `audio` file and `user_id`
  - Returns: `{ voice_id: string }`
- `POST /synthesize` - Generate speech from text
  - Body: `{ text: string, voice_id: string, language?: string }`
  - Returns: WAV audio stream
- `DELETE /voice/{voice_id}` - Remove stored voice embeddings

### Next.js Proxy (Port 3000)

- `POST /api/voice/enroll` - Voice enrollment (calls Coqui server)
- `POST /api/coqui/tts` - Text-to-speech synthesis (proxies to Coqui server)

## Usage Flow

1. **Enroll Voice**: Upload 6-30 second audio sample via Settings panel
2. **Enable Speak-Back**: Toggle "Speak back messages" in Voice Settings
3. **Chat**: Send messages - AI responses play back in cloned voice
4. **Progress Bar**: Visual feedback shows audio playback position

## Troubleshooting

### Server won't start
- **Check Python version**: `python --version` (need 3.9+)
- **Install dependencies**: `pip install -r requirements.txt`
- **Port conflict**: Kill process on port 8000: `lsof -ti:8000 | xargs kill -9`

### Voice enrollment fails
- **Check file format**: Accepts MP3, WAV, OGG
- **Check duration**: 6-30 seconds recommended
- **Check server**: Visit `http://localhost:8000/health`

### TTS synthesis fails
- **Check voice_id**: Must enroll voice first
- **Check logs**: Python server shows detailed errors
- **Check GPU memory**: CUDA errors mean out of VRAM (use CPU mode)

### Audio playback stutters
- **Wait for full download**: Progress bar should move smoothly
- **Check network**: Proxy route may timeout on slow connections
- **Check browser**: Chrome/Edge recommended for Audio API

## Production Deployment

### Recommended Changes

1. **Replace in-memory storage** with Redis:
   ```python
   import redis
   voice_embeddings = redis.Redis(host='localhost', port=6379, db=0)
   ```

2. **Add authentication** to TTS server:
   ```python
   from fastapi.security import HTTPBearer
   security = HTTPBearer()
   ```

3. **Configure CORS** for production domain:
   ```python
   origins = ["https://yourdomain.com"]
   ```

4. **Use GPU** for faster synthesis:
   - Ensure CUDA 11.8+ installed
   - Server auto-detects GPU on startup

5. **Load balancing**: Run multiple TTS server instances behind nginx

## Model Information

- **Name**: XTTS-v2 (Coqui AI)
- **Languages**: 17 languages (EN, ES, FR, DE, IT, PT, PL, TR, RU, NL, CS, AR, ZH, HU, KO, JA, HI)
- **License**: Mozilla Public License 2.0
- **Size**: ~1.8GB
- **Speed**: ~2-5 seconds per sentence (GPU), ~5-10 seconds (CPU)

## Migration from ElevenLabs

All ElevenLabs code has been removed. Key changes:

- **Endpoint**: `/api/elevenlabs/tts` → `/api/coqui/tts`
- **Audio format**: MP3 → WAV
- **Voice storage**: ElevenLabs API → Local embeddings
- **Cost**: $0/month (self-hosted) vs $5-99/month (ElevenLabs)

See `ELEVENLABS_MIGRATION.md` for full migration history.
