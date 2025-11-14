import { NextResponse } from "next/server"
import { fetchMindMapData } from "@/app/actions/mindmap"

export async function GET() {
  try {
    const result = await fetchMindMapData()
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    return NextResponse.json(result.data ?? { nodes: [], edges: [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load mind map"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
