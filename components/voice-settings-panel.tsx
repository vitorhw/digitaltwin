"use client"

import { useCallback, useEffect, useRef, useState, useTransition, type ChangeEvent } from "react"
import { Loader2, Mic, StopCircle, Trash2, UploadCloud, Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { deleteVoiceProfile, setSpeakBackEnabled } from "@/app/actions/voice"
import { useVoiceClone } from "@/components/voice-clone-provider"
export function VoiceSettingsPanel() {
  const { toast } = useToast()
  const { profile, speakBackEnabled, updateProfile, setSpeakBackEnabledLocal, voiceStyle, setVoiceStyle } =
    useVoiceClone()
  const [recording, setRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [duration, setDuration] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [pendingSpeak, startSpeakTransition] = useTransition()
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!recording) return
    timerRef.current = setInterval(() => {
      setDuration((prev) => prev + 1)
    }, 1000)
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [recording])

  const cleanupRecorder = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      mediaRecorderRef.current = null
    }
    chunksRef.current = []
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setRecording(false)
    setDuration(0)
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
        setRecordedBlob(blob)
        cleanupRecorder()
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
      setDuration(0)
      setRecordedBlob(null)
      setTimeout(() => {
        if (mediaRecorderRef.current === recorder && recorder.state === "recording") {
          stopRecording()
        }
      }, 35_000)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Microphone permission denied"
      toast({ title: "Recording failed", description: message, variant: "destructive" })
      cleanupRecorder()
    }
  }, [cleanupRecorder, toast])

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return
    if (mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    }
  }, [])

  useEffect(() => {
    return () => {
      cleanupRecorder()
    }
  }, [cleanupRecorder])

  const handleUpload = useCallback(
    async (blob: Blob) => {
      const file = new File([blob], `voice-sample-${Date.now()}.webm`, { type: blob.type || "audio/webm" })
      const form = new FormData()
      form.set("audio", file)

      setUploading(true)
      try {
        const res = await fetch("/api/voice/enroll", {
          method: "POST",
          body: form,
        })

        const payload = await res.json()
        if (!res.ok) {
          throw new Error(payload.error || "Failed to register voice")
        }

        updateProfile(payload.profile ?? null)
        setSpeakBackEnabledLocal(payload.profile?.speak_back_enabled ?? false)
        setRecordedBlob(null)
        toast({ title: "Voice saved", description: "Speak-back is now enabled." })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        toast({ title: "Upload failed", description: message, variant: "destructive" })
      } finally {
        setUploading(false)
      }
    },
    [updateProfile, setSpeakBackEnabledLocal, toast],
  )

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      await handleUpload(file)
      event.target.value = ""
    },
    [handleUpload],
  )

  const handleSpeakToggle = useCallback(
    (enabled: boolean) => {
      if (!profile) {
        toast({ title: "No voice sample", description: "Upload a sample before enabling speak-back." })
        return
      }
      const previous = speakBackEnabled
      setSpeakBackEnabledLocal(enabled)
      startSpeakTransition(async () => {
        const result = await setSpeakBackEnabled(enabled)
        if (result?.error) {
          toast({ title: "Update failed", description: result.error, variant: "destructive" })
          setSpeakBackEnabledLocal(previous)
          return
        }
        updateProfile(result.profile ?? { ...profile, speak_back_enabled: enabled })
        toast({
          title: enabled ? "Speak-back enabled" : "Speak-back disabled",
          description: enabled ? "Responses will play in your voice." : "The assistant will stay silent.",
        })
      })
    },
    [profile, speakBackEnabled, updateProfile, setSpeakBackEnabledLocal, toast, startSpeakTransition],
  )

  const handleDelete = useCallback(() => {
    startSpeakTransition(async () => {
      const result = await deleteVoiceProfile()
      if (result?.error) {
        toast({ title: "Delete failed", description: result.error, variant: "destructive" })
        return
      }
      updateProfile(null)
      setSpeakBackEnabledLocal(false)
      toast({ title: "Voice removed", description: "Upload a new sample whenever you're ready." })
    })
  }, [updateProfile, setSpeakBackEnabledLocal, toast, startSpeakTransition])

  return (
    <div className="flex h-full flex-col gap-4 p-4 overflow-y-auto">
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Voice Sample</h3>
        <p className="text-xs text-muted-foreground">
          Record or upload at least 30 seconds of clean speech. The audio stays in your private Supabase bucket and is
          used to synthesize responses with the local XTTS server.
        </p>
        <div className="flex items-center gap-2">
          <Button onClick={recording ? stopRecording : startRecording} variant={recording ? "destructive" : "secondary"}>
            {recording ? (
              <>
                <StopCircle className="mr-2 h-4 w-4" /> Stop
              </>
            ) : (
              <>
                <Mic className="mr-2 h-4 w-4" /> Record
              </>
            )}
          </Button>
          <Input type="file" accept="audio/*" onChange={handleFileChange} disabled={uploading} />
          <Button
            onClick={() => recordedBlob && handleUpload(recordedBlob)}
            disabled={!recordedBlob || uploading}
            className="gap-2"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} Upload clip
          </Button>
        </div>
        {recording && <p className="text-xs text-muted-foreground">Recording… {duration}s</p>}
        {recordedBlob && !recording && (
          <p className="text-xs text-muted-foreground">Ready to upload: {(recordedBlob.size / 1024 / 1024).toFixed(2)} MB</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Speak-back</h3>
        <div className="flex items-center justify-between rounded border p-3">
          <div>
            <p className="text-sm font-medium">Play responses in my voice</p>
            <p className="text-xs text-muted-foreground">
              Toggle live playback of GPT replies using your cloned voice.
            </p>
          </div>
          <Button
            variant={speakBackEnabled ? "default" : "outline"}
            onClick={() => handleSpeakToggle(!speakBackEnabled)}
            disabled={pendingSpeak || !profile}
            className="gap-2"
          >
            {pendingSpeak ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : speakBackEnabled ? (
              <>
                <Volume2 className="h-4 w-4" /> On
              </>
            ) : (
              <>
                <VolumeX className="h-4 w-4" /> Off
              </>
            )}
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Voice Filter</h3>
        <p className="text-xs text-muted-foreground">
          Flip the broadcast into a glitchy Matrix feed. Toggle to step behind the green code curtain.
        </p>
        <Button
          variant={voiceStyle === "90s_tv" ? "default" : "outline"}
          onClick={() => setVoiceStyle(voiceStyle === "90s_tv" ? "none" : "90s_tv")}
          className="w-fit gap-2"
        >
          {voiceStyle === "90s_tv" ? (
            <>
              <Volume2 className="h-4 w-4" /> Filter: 90s TV (On)
            </>
          ) : (
            <>
              <VolumeX className="h-4 w-4" /> Filter: Off
            </>
          )}
        </Button>
      </section>

      {profile && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Current sample</h3>
          <div className="rounded border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p>Path: {profile.sample_object_path}</p>
            <p>MIME: {profile.sample_mime_type}</p>
            <p>Updated: {new Date(profile.updated_at).toLocaleString()}</p>
          </div>
          <Button variant="destructive" onClick={handleDelete} className="gap-2">
            <Trash2 className="h-4 w-4" /> Remove voice
          </Button>
        </section>
      )}
    </div>
  )
}
