"""
Unified Backend Server
Combines Face Avatar generation and Coqui TTS functionality
"""

import os
import json
import uvicorn
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import JSONResponse, HTMLResponse, StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from face_avatar.avatar.builder import build_mesh_from_photo, export_obj
from face_avatar.avatar.tts import tts_to_wav

# Coqui TTS imports (optional - only load if available)
COQUI_AVAILABLE = False
try:
    import torch
    import io
    import subprocess
    import numpy as np
    import scipy.io.wavfile as wavfile
    from TTS.api import TTS
    COQUI_AVAILABLE = True
    print("✓ Coqui TTS dependencies found")
except ImportError as e:
    COQUI_AVAILABLE = False
    print(f"ℹ Coqui TTS not available. Install with: pip install TTS torch torchaudio")
    print(f"  Import error: {e}")

BASE_DIR = Path(__file__).parent.resolve()
STATIC_DIR = BASE_DIR / "static"
GEN_DIR = STATIC_DIR / "generated"
GEN_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Unified Avatar & TTS Server", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Initialize Coqui TTS if available
coqui_tts = None
coqui_device = None
voice_embeddings = {}

if COQUI_AVAILABLE:
    try:
        print("Loading Coqui TTS model...")
        coqui_device = "cuda" if torch.cuda.is_available() else "cpu"

        if coqui_device == "cuda":
            torch.backends.cudnn.benchmark = True
            torch.backends.cuda.matmul.allow_tf32 = True

        coqui_tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(coqui_device)
        coqui_tts.eval()
        print(f"✓ Coqui TTS model loaded successfully on {coqui_device}")
    except Exception as e:
        print(f"✗ Warning: Failed to load Coqui TTS: {e}")
        import traceback

        traceback.print_exc()
        COQUI_AVAILABLE = False
        coqui_tts = None
        coqui_device = None
else:
    print("ℹ Coqui TTS dependencies not installed. Install with: pip install TTS torch torchaudio")


def coqui_generate_audio_array(text: str, voice_id: str, language: str = "en"):
    if not COQUI_AVAILABLE or coqui_tts is None:
        raise RuntimeError("Coqui TTS not available")
    if voice_id not in voice_embeddings:
        raise ValueError(f"Voice ID '{voice_id}' not found. Available IDs: {list(voice_embeddings.keys())}")

    embeddings = voice_embeddings[voice_id]
    gpt_cond_latent = embeddings["gpt_cond_latent"].to(coqui_device)
    speaker_embedding = embeddings["speaker_embedding"].to(coqui_device)

    with torch.inference_mode():
        out = coqui_tts.synthesizer.tts_model.inference(
            text=text,
            language=language,
            gpt_cond_latent=gpt_cond_latent,
            speaker_embedding=speaker_embedding,
            temperature=0.75,
            speed=1.0,
        )
        wav = out["wav"] if isinstance(out, dict) else out
        if torch.is_tensor(wav):
            wav = wav.cpu().numpy()
        return wav


class TTSRequest(BaseModel):
    text: str
    voice: str | None = None
    language: str | None = None


class CloneVoiceRequest(BaseModel):
    user_id: str


class SynthesizeRequest(BaseModel):
    text: str
    voice_id: str
    language: str = "en"


@app.get("/")
def index():
    return HTMLResponse((STATIC_DIR / "index.html").read_text(encoding="utf-8"))


@app.get("/health")
async def health_check():
    """Health check endpoint with detailed status"""
    status = {
        "status": "ok",
        "coqui_available": COQUI_AVAILABLE and coqui_tts is not None,
        "coqui_device": coqui_device if (COQUI_AVAILABLE and coqui_tts is not None) else None,
        "voices_stored": len(voice_embeddings) if COQUI_AVAILABLE else 0,
        "voice_ids": list(voice_embeddings.keys()) if COQUI_AVAILABLE else [],
    }

    if not COQUI_AVAILABLE:
        status["coqui_error"] = "Coqui TTS dependencies not installed. Install with: pip install TTS torch torchaudio"
    elif coqui_tts is None:
        status["coqui_error"] = "Coqui TTS model failed to load. Check server logs for details."

    return status


@app.post("/api/generate")
async def api_generate(photo: UploadFile = File(...)):
    """Generate 3D avatar mesh from photo"""
    try:
        upload_path = GEN_DIR / "upload.jpg"
        with open(upload_path, "wb") as f:
            f.write(await photo.read())

        build = build_mesh_from_photo(str(upload_path))
        mesh = build["trimesh"]
        verts = build.get("base_vertices")
        faces = build.get("faces")
        uv = build.get("uv")
        feats = build.get("feature_indices", {})

        out_obj = GEN_DIR / "avatar.obj"
        export_obj(mesh, str(out_obj))

        lower = feats.get("lower_lip", feats.get("lips", []))
        upper = feats.get("upper_lip", [])
        with open(GEN_DIR / "features.json", "w", encoding="utf-8") as f:
            json.dump({"lips": feats.get("lips", []), "lower_lip": lower, "upper_lip": upper}, f)

        mesh_json = {
            "vertices": verts.tolist() if hasattr(verts, "tolist") else verts,
            "faces": faces.tolist() if hasattr(faces, "tolist") else faces,
            "uv": uv.tolist() if hasattr(uv, "tolist") else uv,
        }
        with open(GEN_DIR / "mesh.json", "w", encoding="utf-8") as f:
            json.dump(mesh_json, f)

        return JSONResponse(
            {
                "ok": True,
                "obj": "/static/generated/avatar.obj",
                "features": "/static/generated/features.json",
                "mesh": "/static/generated/mesh.json",
            }
        )
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.post("/api/tts")
async def api_tts(request: TTSRequest):
    """Generate TTS audio from text using pyttsx3 or Coqui"""
    try:
        text = request.text.strip()
        voice = request.voice
        language = request.language or "en"

        if not text:
            return JSONResponse({"ok": False, "error": "Empty text"}, status_code=400)

        out_wav = GEN_DIR / "tts.wav"

        if voice and isinstance(voice, str) and voice.startswith("coqui:"):
            if not COQUI_AVAILABLE or coqui_tts is None:
                return JSONResponse(
                    {"ok": False, "error": "Coqui TTS not available on the unified server."},
                    status_code=503,
                )

            voice_id = voice.split(":", 1)[1]
            try:
                combined_wav = coqui_generate_audio_array(text, voice_id, language=language)
            except ValueError as exc:
                return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)

            max_val = float(np.max(np.abs(combined_wav))) or 1.0
            wav_int16 = np.int16(combined_wav / max_val * 32767)
            wavfile.write(out_wav, 24000, wav_int16)

            return JSONResponse(
                {
                    "ok": True,
                    "audio": "/static/generated/tts.wav",
                    "voice_type": "coqui",
                    "voice_id": voice_id,
                }
            )
        else:
            tts_to_wav(text, str(out_wav), voice_substring=voice, rate=175)

            return JSONResponse(
                {
                    "ok": True,
                    "audio": "/static/generated/tts.wav",
                    "voice_type": "pyttsx3",
                }
            )
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.post("/api/coqui/clone_voice")
async def clone_voice(request: Request, audio_file: UploadFile = File(...)):
    """Clone a voice from an audio sample using Coqui TTS"""
    if not COQUI_AVAILABLE:
        raise HTTPException(status_code=503, detail="Coqui TTS not available")

    user_id = request.query_params.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id query parameter is required")

    try:
        audio_bytes = await audio_file.read()

        filename = audio_file.filename or "audio.webm"
        ext = filename.split(".")[-1].lower() if "." in filename else "webm"

        import tempfile

        temp_dir = tempfile.gettempdir()
        temp_input = os.path.join(temp_dir, f"voice_sample_{user_id}_input.{ext}")
        temp_output = os.path.join(temp_dir, f"voice_sample_{user_id}.wav")

        with open(temp_input, "wb") as f:
            f.write(audio_bytes)

        try:
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    temp_input,
                    "-ar",
                    "22050",
                    "-ac",
                    "1",
                    "-f",
                    "wav",
                    temp_output,
                ],
                check=True,
                capture_output=True,
            )
        except subprocess.CalledProcessError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Audio conversion failed. Please upload MP3, WAV, or WebM. Error: {e.stderr.decode()}",
            )
        finally:
            if os.path.exists(temp_input):
                os.remove(temp_input)

        gpt_cond_latent, speaker_embedding = coqui_tts.synthesizer.tts_model.get_conditioning_latents(audio_path=[temp_output])

        voice_id = f"voice_{user_id}"
        voice_embeddings[voice_id] = {
            "gpt_cond_latent": gpt_cond_latent.cpu(),
            "speaker_embedding": speaker_embedding.cpu(),
        }

        os.remove(temp_output)

        return {
            "voice_id": voice_id,
            "status": "success",
        }

    except Exception as e:
        import traceback

        error_detail = f"{str(e)}\n{traceback.format_exc()}"
        print(f"[Clone Voice] Error: {error_detail}")
        raise HTTPException(status_code=500, detail=f"Voice cloning failed: {str(e)}")


@app.post("/api/coqui/synthesize")
async def synthesize_speech(request: SynthesizeRequest):
    """Synthesize speech with cloned voice using Coqui TTS"""
    if not COQUI_AVAILABLE or coqui_tts is None:
        raise HTTPException(
            status_code=503,
            detail=f"Coqui TTS not available. COQUI_AVAILABLE={COQUI_AVAILABLE}, coqui_tts={coqui_tts is not None}",
        )

    try:
        combined_wav = coqui_generate_audio_array(request.text, request.voice_id, language=request.language)

        print(f"[Synthesize] Generated {len(combined_wav)/24000:.2f}s audio for voice {request.voice_id}")

        wav_bytes = io.BytesIO()

        max_val = float(np.max(np.abs(combined_wav))) or 1.0
        wav_int16 = np.int16(combined_wav / max_val * 32767)

        wavfile.write(wav_bytes, 24000, wav_int16)
        wav_bytes.seek(0)

        return StreamingResponse(
            wav_bytes,
            media_type="audio/wav",
            headers={
                "Cache-Control": "no-cache",
            },
        )

    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        error_detail = f"{type(e).__name__}: {str(e)}"
        print(f"[Synthesize] ERROR: {error_detail}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Speech synthesis failed: {str(e)}")


@app.delete("/api/coqui/voice/{voice_id}")
async def delete_voice(voice_id: str):
    """Delete a cloned voice"""
    if not COQUI_AVAILABLE:
        raise HTTPException(status_code=503, detail="Coqui TTS not available")

    if voice_id in voice_embeddings:
        del voice_embeddings[voice_id]
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Voice not found")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    path = STATIC_DIR / "favicon.ico"
    if path.exists():
        return FileResponse(path, media_type="image/vnd.microsoft.icon")
    png = STATIC_DIR / "favicon.png"
    return FileResponse(png, media_type="image/png")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8001"))
    uvicorn.run("unified_server:app", host="localhost", port=port, reload=False)

