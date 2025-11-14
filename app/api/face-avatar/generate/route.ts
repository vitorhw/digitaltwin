import { NextRequest, NextResponse } from "next/server"

// Default to port 8001 for unified server
const FACE_AVATAR_API_URL = process.env.FACE_AVATAR_API_URL || "http://localhost:8001"

// Log the URL being used for debugging
console.log("[face-avatar/generate] Using FACE_AVATAR_API_URL:", FACE_AVATAR_API_URL)

type NodeRequestInit = RequestInit & { duplex?: "half" }

export async function POST(request: NextRequest) {
  try {
    // Log for debugging
    console.log("[face-avatar] Generating avatar, API URL:", FACE_AVATAR_API_URL)
    
    // Test server connectivity first
    try {
      const healthCheck = await fetch(`${FACE_AVATAR_API_URL}/`, {
        method: "GET",
        signal: AbortSignal.timeout(2000), // 2 second timeout
      })
      console.log("[face-avatar] Server health check:", healthCheck.status)
    } catch (healthError) {
      console.error("[face-avatar] Server health check failed:", healthError)
      return NextResponse.json(
        {
          ok: false,
          error: `Unable to reach the avatar backend (${FACE_AVATAR_API_URL}). Please ensure the server is running.\n\nStart command: cd backend && python unified_server.py`,
        },
        { status: 503 },
      )
    }
    
    const contentType = request.headers.get("content-type") || ""
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      return NextResponse.json(
        { ok: false, error: "Expected multipart/form-data request" },
        { status: 400 },
      )
    }

    const headers = new Headers(request.headers)
    headers.delete("content-length")

    const requestInit: NodeRequestInit = {
      method: "POST",
      headers,
      body: request.body,
      duplex: "half",
    }

    const response = await fetch(`${FACE_AVATAR_API_URL}/api/generate`, requestInit).catch((fetchError) => {
      console.error("[face-avatar] Fetch error:", fetchError)
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError)
      throw new Error(
        `Unable to reach the avatar backend (${FACE_AVATAR_API_URL}). Please ensure the server is running.\n\nError details: ${errorMessage}\n\nCheck:\n1. Is the unified server running (cd backend && python unified_server.py)?\n2. Is it listening on port 8001?\n3. Is a firewall blocking the connection?`,
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
    console.error("[face-avatar] Generate error:", error)
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
