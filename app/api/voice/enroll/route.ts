import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const COQUI_API_URL = process.env.COQUI_API_URL || "http://localhost:8000"

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await req.formData()
    const audio = formData.get("audio")

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "Audio file required" }, { status: 400 })
    }

    // Get existing profile to track voice_id
    const { data: existing } = await supabase
      .from("voice_profile")
      .select("sample_object_path, clone_reference")
      .eq("user_id", user.id)
      .maybeSingle()

    // Clone voice with Coqui TTS
    const coquiForm = new FormData()
    coquiForm.append("audio_file", audio)

    const cloneResponse = await fetch(`${COQUI_API_URL}/clone_voice?user_id=${encodeURIComponent(user.id)}`, {
      method: "POST",
      body: coquiForm,
    })

    if (!cloneResponse.ok) {
      const error = await cloneResponse.text()
      throw new Error(`Voice cloning failed: ${error}`)
    }

    const { voice_id } = await cloneResponse.json()

    // Delete old audio sample from storage
    if (existing?.sample_object_path) {
      await supabase.storage.from("voice-profiles").remove([existing.sample_object_path])
    }

    // Upload new audio sample to Supabase storage
    const ext = (audio.name.split(".").pop() || "webm").toLowerCase()
    const objectPath = `${user.id}.${ext}`

    const upload = await supabase.storage.from("voice-profiles").upload(objectPath, audio, {
      cacheControl: "3600",
      upsert: true,
      contentType: audio.type || "audio/webm",
    })

    if (upload.error) {
      return NextResponse.json({ error: upload.error.message }, { status: 500 })
    }

    // Store voice profile with Coqui voice_id
    const { data, error } = await supabase
      .from("voice_profile")
      .upsert(
        {
          user_id: user.id,
          sample_object_path: objectPath,
          sample_mime_type: audio.type || "audio/webm",
          clone_reference: { voice_id },
          speak_back_enabled: true,
        },
        { onConflict: "user_id" },
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ profile: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[voice] enroll error", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
