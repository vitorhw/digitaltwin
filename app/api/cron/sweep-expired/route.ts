import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// This endpoint can be called by Vercel Cron Jobs to periodically sweep expired facts
// Add to vercel.json: { "crons": [{ "path": "/api/cron/sweep-expired", "schedule": "0 2 * * *" }] }
export async function GET() {
  try {
    const supabase = await createClient()

    // Call the sweep function
    const { data, error } = await supabase.rpc("sweep_expired_facts")

    if (error) {
      console.error("[v0] Cron: Error sweeping expired facts:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[v0] Cron: Swept ${data || 0} expired facts`)
    return NextResponse.json({ success: true, deletedCount: data || 0 })
  } catch (error) {
    console.error("[v0] Cron: Exception in sweep-expired:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sweep expired facts" },
      { status: 500 },
    )
  }
}
