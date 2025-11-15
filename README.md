# Digital Twin – Personal Memory Chat

A full-stack AI assistant that learns your memories, habits, and voice to act as a conversational "digital twin." The project ships a Next.js frontend plus a FastAPI backend for avatar generation and speech synthesis, including optional Coqui XTTS voice cloning.

## Overview

Digital Twin combines semantic, episodic, and procedural memory systems with personalized communication style modeling. As you chat, the app continuously proposes new memories, rules, and style adjustments that you can review and approve, letting the AI evolve into a faithful representation of you.

## Project Goals

1. **Authenticity** – capture your factual knowledge, lived experiences, and behavioral heuristics so the AI never answers generically.
2. **Transparency** – surface every proposed memory, rule, or style tweak for manual approval, ensuring you stay in control of your data.
3. **Multi‑modal Presence** – pair conversational intelligence with visual avatars and cloned voices so the twin feels embodied, not disembodied text.
4. **Self-host optionality** – run both frontend and backend locally with your own API keys, storage, and TTS pipeline for privacy-sensitive use cases.

These goals guide feature prioritization: every UI surface, backend endpoint, and automation exists to make the twin feel more “you” without sacrificing oversight.

## Key Capabilities

- **Contextual Memory Graph** – semantic facts, episodic events, and procedural rules stored in Supabase with embeddings for fast recall.
- **Style Engine** – configurable sliders for tone, humor, verbosity, and pacing; optional auto-analysis from chat logs.
- **Voice Interface** – enroll a sample, clone via Coqui XTTS, and stream responses through a progress-aware audio player.
- **Avatar Generation** – upload a portrait, receive a lightweight mesh/texture combo for the chat UI.
- **Debug Console** – inspect every recall, rule trigger, or style mutation, and accept/reject proposals in real time.
- **Extensible Backend** – FastAPI endpoints for avatar, baseline TTS (pyttsx3), and Coqui-powered synthesis or cloning.

### Architecture

- **Frontend**: Next.js 15.5 App Router (TypeScript) with Supabase auth/storage, Tailwind CSS v4, Radix UI + shadcn/ui components.
- **Backend**: Python FastAPI service (`backend/unified_server.py`) that provides avatar generation, pyttsx3 TTS, and optional Coqui XTTS cloning endpoints.
- **Storage & Data**: Supabase Postgres for memories/rules, Supabase Storage for voice samples, optional local disk artifacts for generated avatars and synthesized audio.

## How It Works

1. **Conversation ingestion** – the Next.js app streams chat turns through OpenAI via the Vercel AI SDK, tagging each message with metadata.
2. **Memory proposal** – server actions call extraction chains that suggest new facts, episodic snippets, or procedural if/then rules.
3. **Human approval** – proposals surface in the debug/inspector panels so you can confirm or reject before anything is persisted.
4. **Recall & style rendering** – approved items feed the semantic search layer, powering auto-recall, tone adjustments, and rule-triggered responses.
5. **Voice/avatar output** – optional backend calls generate cloned audio or avatar updates, which stream back into the UI.

## Tech Stack

| Layer    | Technologies                                                                                 |
| -------- | -------------------------------------------------------------------------------------------- |
| Frontend | Next.js 15.5, TypeScript, Supabase JS SDK, Tailwind CSS v4, Radix UI, shadcn/ui              |
| Backend  | FastAPI, Python 3.9+, pyttsx3, Coqui XTTS (optional), Pillow/OpenCV for avatar preprocessing |
| AI       | OpenAI GPT-4 via Vercel AI SDK, Coqui TTS (self-hosted)                                      |
| Tooling  | pnpm (preferred), Node.js 18+, Supabase CLI/SQL Editor                                       |

## Prerequisites

- Node.js 18+
- pnpm (or npm/yarn) for the frontend
- Python 3.9+ with `venv`
- Supabase project + service role key
- OpenAI API key
- (Optional) CUDA-capable GPU for faster Coqui synthesis

## Quickstart

### 1. Frontend

```bash
git clone <repo-url>
cd digitaltwin
pnpm install
# create .env.local as shown below
pnpm dev
```

Visit http://localhost:3000 and create an account using Supabase Auth.

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python unified_server.py
```

The backend listens on http://localhost:8001 (health check: `curl http://localhost:8001/health`). Use `start_server.sh` (macOS/Linux) or `start_server.bat` (Windows) for convenience.

## Frontend Setup in Detail

### Environment Variables (`.env.local`)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Coqui backend bridge
COQUI_API_URL=http://localhost:8000

# Auth redirects
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=http://localhost:3000
```

### Database Migrations

Run the SQL scripts inside `scripts/` (e.g. `015_create_procedural_rules.sql`, `016_create_increment_rule_observation_function.sql`, `017_create_voice_profile_table.sql`, etc.) sequentially inside the Supabase SQL editor. These create the fact/episodic/procedural memory tables, functions, and indexes.

### Supabase Storage

Create a **private** bucket named `voice-profiles`. It stores encrypted user voice samples and should only be readable by authenticated users.

### Starting the Frontend

```bash
pnpm dev
# or npm run dev / yarn dev
```

Open http://localhost:3000 and log in. The chat interface loads memories, procedural rules, and voice settings for the authenticated user.

## Backend Setup in Detail

### Virtual Environment & Dependencies

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Coqui dependencies are enabled by default. If you do not plan to use voice cloning, comment them out in `backend/requirements.txt` before installation.

### Running the FastAPI Server

```bash
python unified_server.py
# or ./start_server.sh (macOS/Linux)
# or start_server.bat (Windows)
```

Generated assets live in `backend/static/generated/` and are served at `/static/generated/...`.

### API Surface

| Endpoint                             | Description                                                         |
| ------------------------------------ | ------------------------------------------------------------------- |
| `POST /api/generate`                 | Generate a 3D avatar mesh from a photo                              |
| `POST /api/tts`                      | Synthesize speech using pyttsx3 or Coqui (`voice=coqui:<voice_id>`) |
| `POST /api/coqui/clone_voice`        | Upload and clone a user voice sample                                |
| `POST /api/coqui/synthesize`         | Raw Coqui synthesis for internal flows                              |
| `DELETE /api/coqui/voice/{voice_id}` | Remove a cloned voice                                               |
| `GET /health`                        | Health/diagnostics endpoint                                         |

### Avatar Generation Pipeline

The `/api/generate` route (proxied in Next.js under `/api/face-avatar/generate`) uses a lightweight geometric pipeline instead of a heavy neural renderer:

1. **Landmark detection (MediaPipe FaceMesh)** – `face_avatar/avatar/builder.py` runs Google’s MediaPipe FaceMesh to extract 468 facial landmarks from the uploaded JPEG/PNG. This gives consistent indices for lips, eyes, and the face oval.
2. **Triangulation (SciPy Delaunay)** – the 2D face landmarks are triangulated, then triangles whose centroids lie outside the face oval polygon are discarded to keep only facial surfaces.
3. **Normalization & UVs** – vertex coordinates are centered, flipped to a Y‑up coordinate system, and scaled to fit roughly within a unit cube. UV coordinates come directly from the original pixel positions.
4. **Mesh authoring (trimesh)** – trimesh wraps the geometry and photo texture into a textured mesh. The backend exports both OBJ/MTL for inspection and JSON blobs (`mesh.json`, `features.json`) that the React client consumes.
5. **Feature indices** – lips and eye vertex sets are stored so the frontend can animate mouth shapes or blink states without rerunning landmark detection.

The generated artifacts live under `backend/static/generated/` and are streamed back through `/api/face-avatar/static/*` when the Next.js client loads or plays audio through the avatar.

## Usage Guide

### First-Time Flow

1. Sign up and authenticate via Supabase.
2. Configure communication style from the **Style** tab or auto-analyze from memories.
3. Begin chatting—AI proposes semantic facts, episodic memories, and procedural rules.
4. Review proposals in the debug panel and approve/reject them to shape the twin.

### Chat Experience

- **Remembered**: When the AI pulls relevant facts or episodic memories.
- **Proposed**: Suggested new memories needing approval.
- **Rules Panel**: Shows procedural habits and when they were last observed.
- **Voice Settings**: Upload samples, switch between default TTS and Coqui, and enable "Speak back messages."

## Voice Cloning (Coqui XTTS)

### Requirements

- Python 3.9+
- `torch` + `coqui-tts` (installed via backend `requirements.txt`)
- Optional NVIDIA GPU for faster inference (CPU works fine but slower)

### Setup Steps

1. Install Python dependencies (`pip install -r backend/requirements.txt`). First run downloads ~1.8 GB XTTS-v2 model to `~/.local/share/tts/`.
2. Start the backend server (`python unified_server.py`).
3. Launch the frontend with `pnpm dev`.
4. In **Voice Settings**, upload a 6‑30 second clean audio sample (MP3/WAV/WebM/OGG) and save the profile.
5. Toggle **"Speak back messages"** and send a chat message—the AI replies in your cloned voice with a progress indicator.

### Features

- Multilingual (17 languages)
- Automatic chunking for long text
- Playback progress bar in UI
- Fully self-hosted (no per-call fees)
- Optional GPU acceleration for 2‑4× speedup

See `COQUI_SETUP.md` for troubleshooting startup issues, audio format errors, and deployment tips.

## Project Structure

```
digitaltwin/
├── app/                 # Next.js app router (server actions, API routes)
├── backend/             # FastAPI avatar + speech server
│   ├── unified_server.py
│   ├── requirements.txt
│   └── static/generated/
├── components/          # Chat UI, style panels, voice settings
├── lib/                 # Supabase and voice helpers
├── scripts/             # SQL migrations for Supabase
├── public/              # Static assets
├── requirements.txt     # Root pointer to backend dependencies
├── COQUI_SETUP.md       # Detailed Coqui guide
└── pnpm-lock.yaml / package.json
```

## Key Concepts

### Memory Types

1. **Semantic (Facts)** – timeless truths about you (e.g., `favorite_color: blue`).
2. **Episodic** – context-rich events (e.g., "Visited Paris in June 2023").
3. **Procedural** – behavioral rules and habits (e.g., "If traveling, book with United").

### Approval Workflow

1. **AI proposes** new memories while you chat.
2. **You review** them in the debug panels.
3. **Approve or reject** to update the knowledge base.

### Communication Style Modeling

The system learns your tone, vocabulary, sentence length, humor level, and signature phrases. Style settings can be tweaked manually or derived automatically from stored memories and chat history.

## Development Workflow

- **Install dependencies**: `pnpm install` for the frontend, `pip install -r backend/requirements.txt` inside a Python virtualenv for the backend.
- **Environment parity**: maintain a `.env.local` for the Next.js app and `.env` or shell exports for the backend API keys/paths.
- **Frontend linting**: `pnpm lint` (runs ESLint + TypeScript checks). `pnpm build` ensures the Next.js bundle compiles before deploying.
- **Backend formatting/tests**: run `ruff check` / `ruff format` or `pytest` if you add tests (recommended). Add them to `backend/requirements-dev.txt` if needed.
- **Git workflow**: feature branches + PRs; keep migrations in `scripts/` and document them in the README when adding new tables.
