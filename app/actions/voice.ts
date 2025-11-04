"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export interface VoiceProfile {
  user_id: string
  sample_object_path: string
  sample_mime_type: string
  clone_reference: {
    voice_id: string
  } | null
  speak_back_enabled: boolean
  created_at: string
  updated_at: string
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  return { supabase, user }
}

export async function getVoiceProfile() {
  const { supabase, user } = await requireUser()

  const { data, error } = await supabase
    .from("voice_profile")
    .select("user_id, sample_object_path, sample_mime_type, clone_reference, speak_back_enabled, created_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) {
    return { error: error.message }
  }

  return { profile: (data as VoiceProfile | null) ?? null }
}

export async function setSpeakBackEnabled(enabled: boolean) {
  const { supabase, user } = await requireUser()

  const { data: existing, error: selectError } = await supabase
    .from("voice_profile")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (selectError) {
    return { error: selectError.message }
  }

  if (!existing) {
    return { error: "Voice profile not found" }
  }

  const { error, data } = await supabase
    .from("voice_profile")
    .update({ speak_back_enabled: enabled })
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/")
  return { profile: data as VoiceProfile }
}

export async function deleteVoiceProfile() {
  const { supabase, user } = await requireUser()

  const { data: existing, error: selectError } = await supabase
    .from("voice_profile")
    .select("sample_object_path")
    .eq("user_id", user.id)
    .maybeSingle()

  if (selectError) {
    return { error: selectError.message }
  }

  if (existing?.sample_object_path) {
    await supabase.storage.from("voice-profiles").remove([existing.sample_object_path])
  }

  const { error } = await supabase.from("voice_profile").delete().eq("user_id", user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}
