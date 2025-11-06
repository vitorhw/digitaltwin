import type { VoiceProfile } from "@/app/actions/voice"

interface CloneResult {
  cloneReference: {
    speaker_embedding: number[]
    gpt_cond_latent: number[][]
    language?: string
  } | null
}

interface SynthesisOptions {
  text: string
  cloneReference: CloneResult["cloneReference"]
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, "")
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  if (process.env.VOICE_CLONE_API_KEY) {
    headers.Authorization = `Bearer ${process.env.VOICE_CLONE_API_KEY}`
  }
  return headers
}

export async function registerVoiceClone(sample: File): Promise<CloneResult> {
  const baseUrl = process.env.VOICE_CLONE_BASE_URL
  if (!baseUrl) {
    return { cloneReference: null }
  }

  try {
    const form = new FormData()
    form.append("wav_file", sample, sample.name || "sample.wav")

    const res = await fetch(`${normalizeBaseUrl(baseUrl)}/clone_speaker`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Voice clone error: ${res.status} ${text}`)
    }

    const payload = (await res.json()) as CloneResult["cloneReference"]

    if (!payload || !Array.isArray(payload.speaker_embedding) || !Array.isArray(payload.gpt_cond_latent)) {
      throw new Error("Voice clone server returned incomplete embedding data")
    }

    return { cloneReference: payload }
  } catch (error) {
    console.error("[voice] registerVoiceClone failed", error)
    return { cloneReference: null }
  }
}

export async function synthesizeVoiceStream(options: SynthesisOptions) {
  const baseUrl = process.env.VOICE_CLONE_BASE_URL
  if (!baseUrl) {
    throw new Error("VOICE_CLONE_BASE_URL not configured")
  }

  if (!options.cloneReference) {
    throw new Error("Missing voice clone reference")
  }

  const { speaker_embedding, gpt_cond_latent, language } = options.cloneReference
  if (!speaker_embedding || !gpt_cond_latent) {
    throw new Error("Invalid voice clone reference")
  }

  const payload = {
    text: options.text,
    language: language || "en",
    speaker_embedding,
    gpt_cond_latent,
    add_wav_header: true,
    stream_chunk_size: "20",
  }

  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/tts_stream`, {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Voice synthesis error: ${res.status} ${text}`)
  }

  if (!res.body) {
    throw new Error("Voice synthesis response did not include a stream")
  }

  const mime = res.headers.get("content-type") || "audio/wav"
  return { stream: res.body, contentType: mime }
}

export function canSpeak(profile: VoiceProfile | null) {
  return Boolean(profile && profile.clone_reference && profile.clone_reference.speaker_embedding)
}
