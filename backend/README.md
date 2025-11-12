# Backend Server

This directory contains the unified FastAPI backend for the Digital Twin frontend. It exposes avatar generation, basic speech synthesis (pyttsx3), and optional Coqui XTTS-based cloning APIs.

## Quickstart

### 1. Create virtual environment & install dependencies

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 2. Start the server

```bash
python unified_server.py
```

Alternatively run `start_server.sh` (macOS/Linux) or `start_server.bat` (Windows).

The API listens on `http://localhost:8001` by default. Confirm it is healthy by visiting `http://localhost:8001/health`.

## Optional: Coqui XTTS voice cloning

The default `requirements.txt` includes the Coqui dependencies. If you do not wish to use cloned voices you can comment them out.

Once installed:

1. Start the server as above.
2. Use the frontend voice settings to upload a sample (`/api/coqui/clone_voice`).
3. Set the avatar voice to “Cloned Voice (Coqui)” in the Avatar panel.

## API Endpoints

- `POST /api/generate` – Generate 3D avatar mesh from a photo.
- `POST /api/tts` – Synthesize speech using pyttsx3 or Coqui (when `voice` is `coqui:<voice_id>`).
- `POST /api/coqui/clone_voice` – Clone a user voice.
- `POST /api/coqui/synthesize` – Raw Coqui synthesis (used by legacy flows).
- `DELETE /api/coqui/voice/{voice_id}` – Remove a cloned voice.
- `GET /health` – Health/diagnostics.

Generated files are written to `backend/static/generated/` and served at `/static/generated/...`.

