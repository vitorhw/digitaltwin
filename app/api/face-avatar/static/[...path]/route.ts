import { NextRequest, NextResponse } from "next/server"

const FACE_AVATAR_API_URL = process.env.FACE_AVATAR_API_URL || "http://localhost:8001"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const resolvedParams = await params
    const path = resolvedParams.path.join("/")
    const url = `${FACE_AVATAR_API_URL}/static/${path}`
    
    console.log("[face-avatar/static] Fetching:", url)
    
    const response = await fetch(url).catch((fetchError) => {
      console.error("[face-avatar/static] Fetch error:", fetchError)
      throw fetchError
    })
    
    if (!response.ok) {
      console.error("[face-avatar/static] Response not ok:", response.status, response.statusText)
      return NextResponse.json(
        { error: `File not found: ${path}` },
        { status: response.status }
      )
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream"
    const buffer = await response.arrayBuffer()
    
    console.log("[face-avatar/static] Successfully fetched:", path, "Content-Type:", contentType, "Size:", buffer.byteLength)

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      },
    })
  } catch (error) {
    console.error("[face-avatar/static] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
