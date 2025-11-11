import { NextRequest, NextResponse } from "next/server"

const FACE_AVATAR_API_URL = process.env.FACE_AVATAR_API_URL || "http://localhost:8001"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text, voice, style } = body
    
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { ok: false, error: "Text is required" },
        { status: 400 }
      )
    }
    
    const response = await fetch(`${FACE_AVATAR_API_URL}/api/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, voice: voice || null, style: style || null }),
    }).catch((fetchError) => {
      console.error("[face-avatar] Fetch error:", fetchError)
      throw new Error(
        `Unable to reach the avatar backend (${FACE_AVATAR_API_URL}). Please ensure the server is running. Error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
      )
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText || `Server returned status ${response.status}` }
      }
      console.error("[face-avatar] Server error:", errorData)
      return NextResponse.json(
        { ok: false, ...errorData },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[face-avatar] TTS error:", error)
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

