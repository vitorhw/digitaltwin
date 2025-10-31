import os
import json
import uvicorn
from pathlib import Path
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from face_avatar.avatar.builder import build_mesh_from_photo, export_obj
from face_avatar.avatar.bot import SimpleBot
from face_avatar.avatar.tts import tts_to_wav
from fastapi.responses import FileResponse

BASE_DIR = Path(__file__).parent.resolve()
STATIC_DIR = BASE_DIR / "static"
GEN_DIR = STATIC_DIR / "generated"
GEN_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Face Avatar Standalone", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/", response_class=HTMLResponse)
def index():
    return HTMLResponse((STATIC_DIR / "index.html").read_text(encoding="utf-8"))

@app.post("/api/generate")
async def api_generate(photo: UploadFile = File(...)):
    try:
        # Save upload
        upload_path = GEN_DIR / "upload.jpg"
        with open(upload_path, "wb") as f:
            f.write(await photo.read())

        # Build mesh using current logic
        build = build_mesh_from_photo(str(upload_path))
        mesh = build["trimesh"]
        verts = build.get("base_vertices")
        faces = build.get("faces")
        uv = build.get("uv")
        feats = build.get("feature_indices", {})

        # Export OBJ (optional for user download)
        out_obj = GEN_DIR / "avatar.obj"
        export_obj(mesh, str(out_obj))

        # Write features.json with explicit lips splits if present
        lower = feats.get("lower_lip", feats.get("lips", []))
        upper = feats.get("upper_lip", [])
        with open(GEN_DIR / "features.json", "w", encoding="utf-8") as f:
            json.dump({"lips": feats.get("lips", []), "lower_lip": lower, "upper_lip": upper}, f)

        # Write mesh.json preserving original indexing
        mesh_json = {
            "vertices": verts.tolist() if hasattr(verts, "tolist") else verts,
            "faces": faces.tolist() if hasattr(faces, "tolist") else faces,
            "uv": uv.tolist() if hasattr(uv, "tolist") else uv,
        }
        with open(GEN_DIR / "mesh.json", "w", encoding="utf-8") as f:
            json.dump(mesh_json, f)

        return JSONResponse({
            "ok": True,
            "obj": "/static/generated/avatar.obj",
            "features": "/static/generated/features.json",
            "mesh": "/static/generated/mesh.json"
        })
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.post("/api/ask")
async def api_ask(payload: dict):
    try:
        q = (payload.get("question") or "").strip()
        voice = payload.get("voice") or None
        if not q:
            return JSONResponse({"ok": False, "error": "Empty question"}, status_code=400)
        bot = SimpleBot()
        answer = bot.reply(q)
        out_wav = GEN_DIR / "tts.wav"
        tts_to_wav(answer, str(out_wav), voice_substring=voice, rate=175)
        return JSONResponse({"ok": True, "answer": answer, "audio": "/static/generated/tts.wav"})
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    path = STATIC_DIR / "favicon.ico"
    if path.exists():
        return FileResponse(path, media_type="image/vnd.microsoft.icon")
    # fallback if you only have a PNG
    png = STATIC_DIR / "favicon.png"
    return FileResponse(png, media_type="image/png")

if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=int(os.environ.get("PORT", "8001")), reload=False)