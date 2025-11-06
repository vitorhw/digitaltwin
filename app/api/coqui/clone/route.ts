import { NextResponse } from "next/server"

export const runtime = "nodejs"

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, "")
}

function authHeaders() {
  const headers: Record<string, string> = {}
  if (process.env.VOICE_CLONE_API_KEY) {
    headers.Authorization = `Bearer ${process.env.VOICE_CLONE_API_KEY}`
  }
  return headers
}

export async function POST(req: Request) {
  const baseUrl = process.env.VOICE_CLONE_BASE_URL
  if (!baseUrl) {
    return NextResponse.json({ error: "VOICE_CLONE_BASE_URL not configured" }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const upstream = await fetch(`${normalizeBaseUrl(baseUrl)}/clone_speaker`, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    })

    const contentType = upstream.headers.get("content-type") || "application/json"
    const bodyText = await upstream.text()

    return new NextResponse(bodyText, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
