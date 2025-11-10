import { NextResponse } from "next/server"

// Use unified server if available, otherwise fallback to standalone Coqui server
// Default to port 8001 for unified server
const COQUI_API_URL = process.env.FACE_AVATAR_API_URL || process.env.COQUI_API_URL || "http://localhost:8001"
export const runtime = "nodejs"

// Log the URL being used for debugging
if (typeof process !== "undefined" && process.env) {
  console.log("[coqui/tts] Using COQUI_API_URL:", COQUI_API_URL)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { text, voice_id, language = "en" } = body

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 })
    }

    if (!voice_id || typeof voice_id !== "string") {
      return NextResponse.json({ error: "voice_id is required" }, { status: 400 })
    }

    // Call unified server Coqui TTS endpoint
    const response = await fetch(`${COQUI_API_URL}/api/coqui/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_id, language }),
    }).catch((fetchError) => {
      console.error("[coqui] Fetch error:", fetchError)
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError)
      throw new Error(
        `Unable to reach unified server (${COQUI_API_URL}). Please ensure the server is running.\n\nError: ${errorMessage}\n\nStart command: cd backend && python unified_server.py`
      )
    })

    if (!response.ok || !response.body) {
      const error = await response.text()
      return NextResponse.json({ error: error || "TTS synthesis failed" }, { status: response.status || 500 })
    }

    return new NextResponse(response.body, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-cache",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[coqui] TTS error:", message)
    // Return more detailed error for debugging
    return NextResponse.json(
      {
        error: message,
        hint: "Make sure the unified server is running: cd backend && python unified_server.py",
        server_url: COQUI_API_URL,
      },
      { status: 500 },
    )
  }
}
