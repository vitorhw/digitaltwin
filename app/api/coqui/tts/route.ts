import { NextResponse } from "next/server"

const COQUI_API_URL = process.env.COQUI_API_URL || "http://localhost:8000"

export const runtime = "nodejs"

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

    // Call Coqui TTS server
    const response = await fetch(`${COQUI_API_URL}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_id, language }),
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
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
