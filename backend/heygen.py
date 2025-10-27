# backend/heygen.py
# HeyGen API integration for video generation
''' 1. cd backend
    2. uvicorn main:app --host 0.0.0.0 --port 8001 --reload
    3. Open backend_test.html with Live Server to test(VSCode) or use 'npx serve .'
'''
import os, time, json
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from dotenv import load_dotenv

load_dotenv()
# Set HeyGen API key from environment variable
HEYGEN_KEY = os.getenv("HEYGEN_API_KEY")
BASE = "https://api.heygen.com"
JSON = {"Accept": "application/json", "Content-Type": "application/json"}
HDRS = {"X-Api-Key": HEYGEN_KEY, **JSON}

app = FastAPI(title="HeyGen Demo API")
assert HEYGEN_KEY is not None, "HEYGEN_API_KEY environment variable must be set"
# allow static front-end to access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # replace with specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenReq(BaseModel):
    text: str
    avatar_id: Optional[str] = None
    voice_id: Optional[str] = None
    width: int = 1280
    height: int = 720
    speed: float = 1.05
    pitch: float = 1.0
    poll_seconds: int = 5
    timeout_seconds: int = 900

# Helper function to make requests to HeyGen API
def _req(method: str, path: str, **kwargs):
    url = f"{BASE}{path}"
    r = requests.request(method, url, headers=HDRS, timeout=60, **kwargs)
    r.raise_for_status()
    return r.json()

# List available voices
@app.get("/avatars")
def list_avatars():
    if not HEYGEN_KEY:
        raise HTTPException(500, "HEYGEN_API_KEY not set")
    data = _req("GET", "/v2/avatars")
    avatars = data.get("data", {}).get("avatars", [])
    # front-end will request avatar details when user selects one
    return [{"avatar_id": a.get("avatar_id"), "avatar_name": a.get("avatar_name")} for a in avatars]

# List available voices
@app.get("/voices")
def list_voices():
    if not HEYGEN_KEY:
        raise HTTPException(500, "HEYGEN_API_KEY not set")
    data = _req("GET", "/v2/voices")
    voices = data.get("data", {}).get("voices", [])
    return [{
        "voice_id": v.get("voice_id"),
        "name": v.get("name"),
        "language": v.get("language")
    } for v in voices]

# Generate video
@app.post("/generate_video")
def generate_video(req: GenReq):
    if not HEYGEN_KEY:
        raise HTTPException(500, "HEYGEN_API_KEY not set")

    # video generation request
    avatar_id = req.avatar_id or "Lina_Dress_Sitting_Side_public"
    voice_id  = req.voice_id  or "119caed25533477ba63822d5d1552d25"
    payload = {
        "video_inputs": [
            {
                "character": {"type": "avatar", "avatar_id": avatar_id, "avatar_style": "normal"},
                "voice": {
                    "type": "text",
                    "input_text": req.text,
                    "voice_id": voice_id,
                    "speed": req.speed,
                    "pitch": req.pitch
                }
            }
        ],
        "dimension": {"width": req.width, "height": req.height}
    }
    create = _req("POST", "/v2/video/generate", data=json.dumps(payload))
    if create.get("error"):
        raise HTTPException(400, str(create["error"]))
    video_id = create["data"]["video_id"]

    #  wait till done
    start = time.time()
    status_url = f"{BASE}/v1/video_status.get?video_id={video_id}"
    last = None
    while True:
        r = requests.get(status_url, headers={"X-Api-Key": HEYGEN_KEY, "Accept": "application/json"}, timeout=30)
        r.raise_for_status()
        data = r.json().get("data", {})
        st = data.get("status")
        if st != last:
            last = st
        if st == "completed":
            # video will be removed after 7 days, front-end should fetch and cache it
            return {
                "video_id": video_id,
                "status": "completed",
                "video_url": data.get("video_url"),
                "duration": data.get("duration"),
                "thumbnail_url": data.get("thumbnail_url"),
            }
        if st == "failed":
            raise HTTPException(400, f"HeyGen failed: {data.get('error')}")
        if time.time() - start > req.timeout_seconds:
            raise HTTPException(504, "Timeout waiting HeyGen to complete")
        time.sleep(req.poll_seconds)
