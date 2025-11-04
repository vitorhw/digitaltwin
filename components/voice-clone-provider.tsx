"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { VoiceProfile } from "@/app/actions/voice"

interface CloneReference {
  voice_id: string
}

interface VoiceCloneContextValue {
  profile: VoiceProfile | null
  cloneReference: CloneReference | null
  speakBackEnabled: boolean
  isSynthesizing: boolean
  isPlaying: boolean
  playbackProgress: number
  playbackDuration: number
  updateProfile: (profile: VoiceProfile | null) => void
  setSpeakBackEnabledLocal: (enabled: boolean) => void
  enqueueSpeech: (text: string, options?: { force?: boolean }) => Promise<void>
  stopPlayback: () => void
}

const VoiceCloneContext = createContext<VoiceCloneContextValue | undefined>(undefined)

const STORAGE_KEY = "voice-clone-reference"

function encodeCloneReference(ref: CloneReference | null) {
  if (typeof window === "undefined") return
  if (!ref) {
    window.localStorage.removeItem(STORAGE_KEY)
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ref))
  } catch {
    // ignore storage errors
  }
}

function decodeCloneReference(): CloneReference | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed?.speaker_embedding) && Array.isArray(parsed?.gpt_cond_latent)) {
      return parsed as CloneReference
    }
  } catch {
    // ignore parse errors
  }
  return null
}

export function VoiceCloneProvider({
  initialProfile,
  children,
}: {
  initialProfile: VoiceProfile | null
  children: ReactNode
}) {
  const [profile, setProfile] = useState<VoiceProfile | null>(initialProfile)
  const [cloneReference, setCloneReference] = useState<CloneReference | null>(initialProfile?.clone_reference ?? null)
  const [speakBackEnabled, setSpeakBackEnabled] = useState<boolean>(initialProfile?.speak_back_enabled ?? false)
  const [isSynthesizing, setIsSynthesizing] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackProgress, setPlaybackProgress] = useState(0)
  const [playbackDuration, setPlaybackDuration] = useState(0)

  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const synthesisQueueRef = useRef<Promise<void>>(Promise.resolve())
  const jobsInFlightRef = useRef(0)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!cloneReference) {
      const cached = decodeCloneReference()
      if (cached) {
        setCloneReference(cached)
      }
    }
  }, [])

  useEffect(() => {
    encodeCloneReference(cloneReference)
  }, [cloneReference])

  const stopPlayback = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current.currentTime = 0
      audioElementRef.current.src = ""
    }
    setIsPlaying(false)
    setPlaybackProgress(0)
    setPlaybackDuration(0)
  }, [])

  const synthesizeAndPlay = useCallback(
    async (text: string) => {
      if (!cloneReference?.voice_id) {
        console.error("[Voice] No voice_id available. Clone reference:", cloneReference)
        throw new Error("Voice not enrolled. Please upload a voice sample first.")
      }
      
      console.log("[Voice] Starting synthesis with voice_id:", cloneReference.voice_id)
      
      const payload = {
        text,
        voice_id: cloneReference.voice_id,
        language: "en",
      }

      const response = await fetch("/api/coqui/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok || !response.body) {
        const message = await response.text()
        console.error("[Voice] TTS API error:", message)
        throw new Error(message || "Voice synthesis failed")
      }

      console.log("[Voice] Receiving audio stream...")

      // Collect the entire audio stream into a blob
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) chunks.push(value)
      }

      console.log("[Voice] Received", chunks.length, "audio chunks")

      // Concatenate all chunks
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
      const audioData = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        audioData.set(chunk, offset)
        offset += chunk.length
      }

      console.log("[Voice] Total audio size:", totalLength, "bytes")

      // Create blob and play (Coqui returns WAV)
      const blob = new Blob([audioData], { type: "audio/wav" })
      const audioUrl = URL.createObjectURL(blob)
      
      // Create or reuse audio element
      if (!audioElementRef.current) {
        audioElementRef.current = new Audio()
      }
      
      const audio = audioElementRef.current
      audio.src = audioUrl
      
      console.log("[Voice] Audio element ready, starting playback")
      
      // Set up progress tracking
      const updateProgress = () => {
        setPlaybackProgress(audio.currentTime)
        setPlaybackDuration(audio.duration || 0)
      }
      
      audio.addEventListener("loadedmetadata", () => {
        console.log("[Voice] Audio metadata loaded, duration:", audio.duration)
        setPlaybackDuration(audio.duration)
      })
      
      // Update progress every 100ms
      progressIntervalRef.current = setInterval(updateProgress, 100)
      setIsPlaying(true)
      
      // Play and cleanup
      try {
        await audio.play()
        console.log("[Voice] Playback started successfully")
      } catch (error) {
        console.error("[Voice] Playback error:", error)
        throw error
      }
      
      // Wait for playback to complete
      await new Promise<void>((resolve) => {
        const handleEnded = () => {
          console.log("[Voice] Playback ended")
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current)
            progressIntervalRef.current = null
          }
          setIsPlaying(false)
          setPlaybackProgress(0)
          setPlaybackDuration(0)
          URL.revokeObjectURL(audioUrl)
          audio.removeEventListener("ended", handleEnded)
          audio.removeEventListener("error", handleError)
          audio.removeEventListener("loadedmetadata", updateProgress)
          resolve()
        }
        const handleError = (e: Event) => {
          console.error("[Voice] Audio playback error:", e)
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current)
            progressIntervalRef.current = null
          }
          setIsPlaying(false)
          setPlaybackProgress(0)
          setPlaybackDuration(0)
          URL.revokeObjectURL(audioUrl)
          audio.removeEventListener("ended", handleEnded)
          audio.removeEventListener("error", handleError)
          audio.removeEventListener("loadedmetadata", updateProgress)
          resolve()
        }
        audio.addEventListener("ended", handleEnded)
        audio.addEventListener("error", handleError)
      })
    },
    [cloneReference],
  )

  const enqueueSpeech = useCallback(
    (text: string, options?: { force?: boolean }) => {
      if (!cloneReference?.voice_id) {
        console.warn("[Voice] Cannot enqueue speech: no voice_id")
        return Promise.resolve()
      }

      if (!text.trim()) {
        console.warn("[Voice] Cannot enqueue speech: empty text")
        return Promise.resolve()
      }

      if (!speakBackEnabled && !options?.force) {
        console.log("[Voice] Speak-back disabled, skipping")
        return Promise.resolve()
      }

      console.log("[Voice] Enqueueing speech:", text.substring(0, 50) + "...")

      const run = async () => {
        jobsInFlightRef.current += 1
        setIsSynthesizing(true)
        try {
          await synthesizeAndPlay(text)
        } catch (error) {
          console.error("[Voice] Synthesis error:", error)
          // Error is already logged in synthesizeAndPlay
        } finally {
          jobsInFlightRef.current -= 1
          if (jobsInFlightRef.current <= 0) {
            jobsInFlightRef.current = 0
            setIsSynthesizing(false)
          }
        }
      }

      const next = synthesisQueueRef.current.then(run, run)
      synthesisQueueRef.current = next
      return next
    },
    [cloneReference, speakBackEnabled, synthesizeAndPlay],
  )

  const updateProfile = useCallback((next: VoiceProfile | null) => {
    setProfile(next)
    setCloneReference(next?.clone_reference ?? null)
    setSpeakBackEnabled(next?.speak_back_enabled ?? false)
  }, [])

  const setSpeakBackEnabledLocal = useCallback(
    (enabled: boolean) => {
      setSpeakBackEnabled(enabled)
      if (!enabled) {
        stopPlayback()
      }
    },
    [stopPlayback],
  )

  const value = useMemo<VoiceCloneContextValue>(
    () => ({
      profile,
      cloneReference,
      speakBackEnabled,
      isSynthesizing,
      isPlaying,
      playbackProgress,
      playbackDuration,
      updateProfile,
      setSpeakBackEnabledLocal,
      enqueueSpeech,
      stopPlayback,
    }),
    [
      profile,
      cloneReference,
      speakBackEnabled,
      isSynthesizing,
      isPlaying,
      playbackProgress,
      playbackDuration,
      updateProfile,
      setSpeakBackEnabledLocal,
      enqueueSpeech,
      stopPlayback,
    ],
  )

  return <VoiceCloneContext.Provider value={value}>{children}</VoiceCloneContext.Provider>
}

export function useVoiceClone() {
  const ctx = useContext(VoiceCloneContext)
  if (!ctx) {
    throw new Error("useVoiceClone must be used within a VoiceCloneProvider")
  }
  return ctx
}
