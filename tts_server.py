#!/usr/bin/env python3
"""
Coqui TTS API Server
Production-ready voice cloning and TTS using Coqui AI
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
import io
import json
import os
import subprocess
import numpy as np
import scipy.io.wavfile as wavfile
from TTS.api import TTS

app = FastAPI(title="Coqui TTS API", version="1.0.0")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize TTS model (XTTS-v2 for voice cloning)
print("Loading Coqui TTS model...")
device = "cuda" if torch.cuda.is_available() else "cpu"

# Enable optimizations
if device == "cuda":
    torch.backends.cudnn.benchmark = True
    torch.backends.cuda.matmul.allow_tf32 = True

tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)

# Enable inference mode permanently
tts.eval()

print(f"TTS model loaded on {device} with optimizations enabled")

# Store voice embeddings in memory (in production, use Redis or database)
voice_embeddings = {}


class CloneVoiceRequest(BaseModel):
    user_id: str


class SynthesizeRequest(BaseModel):
    text: str
    voice_id: str
    language: str = "en"


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "model": "xtts_v2",
        "device": device,
        "voices_stored": len(voice_embeddings)
    }


@app.post("/clone_voice")
async def clone_voice(
    user_id: str,
    audio_file: UploadFile = File(...)
):
    """
    Clone a voice from an audio sample
    Returns: voice_id that can be used for synthesis
    """
    try:
        # Read audio file
        audio_bytes = await audio_file.read()
        
        # Get file extension from filename or content type
        filename = audio_file.filename or "audio.webm"
        ext = filename.split(".")[-1].lower() if "." in filename else "webm"
        
        # Save original file temporarily
        temp_input = f"/tmp/voice_sample_{user_id}_input.{ext}"
        temp_output = f"/tmp/voice_sample_{user_id}.wav"
        
        with open(temp_input, "wb") as f:
            f.write(audio_bytes)
        
        # Convert to WAV using ffmpeg
        try:
            subprocess.run([
                "ffmpeg", "-y", "-i", temp_input,
                "-ar", "22050",  # 22.05kHz sample rate (XTTS requirement)
                "-ac", "1",       # Mono
                "-f", "wav",
                temp_output
            ], check=True, capture_output=True)
        except subprocess.CalledProcessError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Audio conversion failed. Please upload MP3, WAV, or WebM. Error: {e.stderr.decode()}"
            )
        finally:
            # Clean up input file
            if os.path.exists(temp_input):
                os.remove(temp_input)
        
        # Compute speaker embedding using Coqui TTS
        gpt_cond_latent, speaker_embedding = tts.synthesizer.tts_model.get_conditioning_latents(
            audio_path=[temp_output]
        )
        
        # Store embeddings (keep as tensors to preserve shape)
        voice_id = f"voice_{user_id}"
        voice_embeddings[voice_id] = {
            "gpt_cond_latent": gpt_cond_latent.cpu(),
            "speaker_embedding": speaker_embedding.cpu(),
        }
        
        # Cleanup
        os.remove(temp_output)
        
        return {
            "voice_id": voice_id,
            "status": "success"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/synthesize")
async def synthesize_speech(request: SynthesizeRequest):
    """
    Synthesize speech with cloned voice
    Returns: Audio stream (WAV)
    """
    try:
        if request.voice_id not in voice_embeddings:
            raise HTTPException(status_code=404, detail=f"Voice ID '{request.voice_id}' not found. Available: {list(voice_embeddings.keys())}")
        
        print(f"[Synthesize] Text length: {len(request.text)} chars, Voice: {request.voice_id}")
        
        # Get embeddings (already tensors)
        embeddings = voice_embeddings[request.voice_id]
        gpt_cond_latent = embeddings["gpt_cond_latent"].to(device)
        speaker_embedding = embeddings["speaker_embedding"].to(device)
        
        # Split text into chunks if too long (XTTS has 400 token / ~250 char limit)
        text_chunks = []
        if len(request.text) > 250:
            # Split by sentences
            import re
            sentences = re.split(r'(?<=[.!?])\s+', request.text)
            current_chunk = ""
            
            for sentence in sentences:
                if len(current_chunk) + len(sentence) < 250:
                    current_chunk += sentence + " "
                else:
                    if current_chunk:
                        text_chunks.append(current_chunk.strip())
                    current_chunk = sentence + " "
            
            if current_chunk:
                text_chunks.append(current_chunk.strip())
        else:
            text_chunks = [request.text]
        
        print(f"[Synthesize] Processing {len(text_chunks)} chunks")
        
        # Generate audio for each chunk (sequentially for now, GPU can't parallelize well)
        all_wavs = []
        
        # Use torch.no_grad() and inference mode for speed
        with torch.inference_mode():
            for i, chunk in enumerate(text_chunks):
                out = tts.synthesizer.tts_model.inference(
                    text=chunk,
                    language=request.language,
                    gpt_cond_latent=gpt_cond_latent,
                    speaker_embedding=speaker_embedding,
                    # Speed optimizations
                    temperature=0.75,  # Slightly lower temperature for faster, more consistent output
                    speed=1.0,
                )
                
                # Extract wav directly
                wav = out["wav"] if isinstance(out, dict) else out
                
                # Convert to numpy immediately
                if torch.is_tensor(wav):
                    wav = wav.cpu().numpy()
                
                all_wavs.append(wav)
        
        # Concatenate all audio chunks
        combined_wav = np.concatenate(all_wavs) if len(all_wavs) > 1 else all_wavs[0]
        
        print(f"[Synthesize] Generated {len(combined_wav)/24000:.2f}s audio")
        
        # Convert numpy array to WAV bytes
        wav_bytes = io.BytesIO()
        
        # Convert to int16 PCM format
        wav_int16 = np.int16(combined_wav / np.max(np.abs(combined_wav)) * 32767)
        
        # Write WAV file to bytes
        wavfile.write(wav_bytes, 24000, wav_int16)  # XTTS outputs at 24kHz
        wav_bytes.seek(0)
        
        return StreamingResponse(
            wav_bytes,
            media_type="audio/wav",
            headers={
                "Cache-Control": "no-cache",
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Synthesize] ERROR: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/voice/{voice_id}")
async def delete_voice(voice_id: str):
    """Delete a cloned voice"""
    if voice_id in voice_embeddings:
        del voice_embeddings[voice_id]
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Voice not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
