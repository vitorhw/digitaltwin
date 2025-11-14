"use client"

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { Loader2, Mic, StopCircle, UploadCloud } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { useVoiceClone } from "@/components/voice-clone-provider"

export function VoiceSettingsPanel() {
  const { toast } = useToast()
  const { updateProfile, setSpeakBackEnabledLocal } = useVoiceClone()
  const [recording, setRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [duration, setDuration] = useState(0)
  const [uploading, setUploading] = useState(false)
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

  useEffect(() => () => cleanupRecorder(), [cleanupRecorder])

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
        toast({ title: "Voice saved", description: "Cloned audio can now be generated." })
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

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Voice Sample</h3>
        <p className="text-xs text-muted-foreground">
          Record or upload at least 30 seconds of clean speech. The audio never leaves your Supabase project.
        </p>
        <div className="flex flex-wrap gap-2">
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
          <Input type="file" accept="audio/*" onChange={handleFileChange} disabled={uploading} className="max-w-xs" />
          <Button onClick={() => recordedBlob && handleUpload(recordedBlob)} disabled={!recordedBlob || uploading} className="gap-2">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} Upload clip
          </Button>
        </div>
        {recording && <p className="text-xs text-muted-foreground">Recording… {duration}s</p>}
        {recordedBlob && !recording && (
          <p className="text-xs text-muted-foreground">Ready to upload: {(recordedBlob.size / 1024 / 1024).toFixed(2)} MB</p>
        )}
      </div>
    </div>
  )
}
