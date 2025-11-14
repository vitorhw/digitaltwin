"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react"
import { SpinnerGap, Microphone, CaretDown, WaveSquare } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { useVoiceClone } from "@/components/voice-clone-provider"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

const passage =
  "In the luminous hush of the studio, my thoughts flow like calm currents, warm and sincere. Every word carries a gentle curiosity, guiding the listener toward understanding."

interface VoiceSettingsPanelProps {
  onSkip?: () => void
  onComplete?: () => void
}

type MinimalRecognitionEvent = {
  results: ArrayLike<{ 0: { transcript: string } }>
}

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: MinimalRecognitionEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

async function convertBlobToWav(blob: Blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  const { numberOfChannels, sampleRate } = audioBuffer
  const samples = audioBuffer.length
  const bytesPerSample = 2
  const blockAlign = numberOfChannels * bytesPerSample
  const buffer = new ArrayBuffer(44 + samples * blockAlign)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + samples * blockAlign, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numberOfChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeString(36, "data")
  view.setUint32(40, samples * blockAlign, true)

  const channelData = []
  for (let i = 0; i < numberOfChannels; i++) {
    channelData.push(audioBuffer.getChannelData(i))
  }

  let offset = 44
  for (let i = 0; i < samples; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      let sample = channelData[channel][i]
      sample = Math.max(-1, Math.min(1, sample))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += bytesPerSample
    }
  }

  await audioCtx.close()
  return new Blob([view], { type: "audio/wav" })
}

export function VoiceSettingsPanel({ onSkip, onComplete }: VoiceSettingsPanelProps = {}) {
  const { toast } = useToast()
  const { updateProfile, setSpeakBackEnabledLocal } = useVoiceClone()
  const [recording, setRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [duration, setDuration] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [recognitionSupported, setRecognitionSupported] = useState(true)
  const [lastRecordingDuration, setLastRecordingDuration] = useState(0)
  const recordStartRef = useRef<number | null>(null)
  const fallbackDuration = 15
  const fallbackSpeedMultiplier = 3

  const [micDevices, setMicDevices] = useState<Array<{ id: string; label: string }>>([])
  const [selectedMicId, setSelectedMicId] = useState<string>("")
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const animationRef = useRef<number | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const recognitionActiveRef = useRef(false)

  const words = useMemo(() => passage.split(" "), [])
  const normalizedWords = useMemo(
    () => words.map((word) => word.replace(/[^a-z']/gi, "").toLowerCase()),
    [words],
  )

  const drawWaveform = useCallback(() => {
    const canvas = waveCanvasRef.current
    if (!canvas) {
      animationRef.current = requestAnimationFrame(drawWaveform)
      return
    }

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      animationRef.current = requestAnimationFrame(drawWaveform)
      return
    }

    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth * dpr
    const height = canvas.clientHeight * dpr
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height

    ctx.clearRect(0, 0, width, height)

    const analyser = analyserRef.current
    if (!analyser) {
      animationRef.current = requestAnimationFrame(drawWaveform)
      return
    }

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyser.getByteFrequencyData(dataArray)

    const gradient = ctx.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, "rgba(255,0,128,0.55)")
    gradient.addColorStop(0.5, "rgba(255,150,0,0.55)")
    gradient.addColorStop(1, "rgba(0,255,190,0.55)")

    const bars = 90
    const step = Math.max(1, Math.floor(bufferLength / bars))
    const baseWidth = width / bars

    ctx.save()
    ctx.lineCap = "round"
    ctx.shadowColor = "rgba(255,255,255,0.3)"
    ctx.shadowBlur = 12 * dpr
    ctx.globalAlpha = 0.78

    for (let i = 0; i < bars; i++) {
      let sum = 0
      for (let j = 0; j < step; j++) {
        sum += dataArray[i * step + j] || 0
      }
      const value = sum / step / 255
      const barHeight = Math.max(2, value * (height * 0.35))
      const x = i * baseWidth + baseWidth / 2
      const centerY = height / 2
      ctx.beginPath()
      ctx.strokeStyle = gradient
      ctx.lineWidth = baseWidth * 0.35
      ctx.moveTo(x, centerY - barHeight)
      ctx.lineTo(x, centerY + barHeight)
      ctx.stroke()
    }
    ctx.restore()

    animationRef.current = requestAnimationFrame(drawWaveform)
  }, [])

  useEffect(() => {
    animationRef.current = requestAnimationFrame(drawWaveform)
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      if (analyserRef.current) analyserRef.current.disconnect()
      if (sourceNodeRef.current) sourceNodeRef.current.disconnect()
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {})
        audioCtxRef.current = null
      }
    }
  }, [drawWaveform])

  const stopSpeechRecognition = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    recognitionActiveRef.current = false
  }, [])

  const advanceHighlight = useCallback(
    (startIndex: number, transcript: string) => {
      const spokenWords = transcript
        .toLowerCase()
        .split(/\s+/)
        .map((word) => word.replace(/[^a-z']/gi, ""))
        .filter(Boolean)

      let pointer = startIndex
      for (const spoken of spokenWords) {
        if (normalizedWords[pointer] === spoken) {
          pointer = Math.min(normalizedWords.length - 1, pointer + 1)
        } else {
          break
        }
      }
      return pointer
    },
    [normalizedWords],
  )

  const startSpeechRecognition = useCallback(() => {
    if (typeof window === "undefined") return
    const anyWindow = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognitionInstance
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance
    }
    const RecognitionCtor = anyWindow.SpeechRecognition || anyWindow.webkitSpeechRecognition
    if (!RecognitionCtor) {
      setRecognitionSupported(false)
      recognitionActiveRef.current = false
      return
    }
    setRecognitionSupported(true)

      const recognition = new RecognitionCtor()
    recognition.lang = "en-US"
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ")
      setHighlightIndex((prev) => advanceHighlight(prev, transcript))
    }
    recognition.onerror = () => {
      recognitionActiveRef.current = false
    }
    recognition.onend = () => {
      recognitionActiveRef.current = false
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
      recognitionActiveRef.current = true
    } catch {
      recognitionActiveRef.current = false
    }
  }, [advanceHighlight])

  const cleanupRecorder = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      mediaRecorderRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }
    chunksRef.current = []
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current)
      autoStopRef.current = null
    }
    stopSpeechRecognition()
    if (analyserRef.current) {
      analyserRef.current.disconnect()
      analyserRef.current = null
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect()
      sourceNodeRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    setRecording(false)
    setDuration(0)
    setHighlightIndex(0)
  }, [stopSpeechRecognition])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    }
  }, [])

  useEffect(() => () => cleanupRecorder(), [cleanupRecorder])

  useEffect(() => {
    let isMounted = true
    const loadDevices = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        // user might cancel, still try to enumerate with whatever is available
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        if (!isMounted) return
        const audioInputs = devices
          .filter((device) => device.kind === "audioinput")
          .map((device) => ({
            id: device.deviceId || "default",
            label: device.label || `Microphone ${device.deviceId.slice(0, 4)}`,
          }))
        setMicDevices(audioInputs)
        if (audioInputs.length && !selectedMicId) {
          setSelectedMicId(audioInputs[0].id)
        }
      } catch (error) {
        console.error("Failed to enumerate devices", error)
      }
    }
    void loadDevices()
    navigator.mediaDevices?.addEventListener?.("devicechange", loadDevices)
    return () => {
      isMounted = false
      navigator.mediaDevices?.removeEventListener?.("devicechange", loadDevices)
    }
  }, [selectedMicId])

  const startRecording = useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints =
        selectedMicId && micDevices.length
          ? { audio: { deviceId: { exact: selectedMicId } } }
          : { audio: true }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      micStreamRef.current = stream
      const recorder = new MediaRecorder(stream)
      const audioCtx = new AudioContext()
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.85
      const sourceNode = audioCtx.createMediaStreamSource(stream)
      sourceNode.connect(analyser)
      audioCtxRef.current = audioCtx
      analyserRef.current = analyser
      sourceNodeRef.current = sourceNode

      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
        const elapsedSeconds = recordStartRef.current ? (Date.now() - recordStartRef.current) / 1000 : duration
        setLastRecordingDuration(elapsedSeconds)
        recordStartRef.current = null
        setRecordedBlob(blob)
        cleanupRecorder()
      }

      mediaRecorderRef.current = recorder
      recordStartRef.current = Date.now()
      recorder.start()
      setRecording(true)
      setDuration(0)
      setRecordedBlob(null)
      setLastRecordingDuration(0)
      setHighlightIndex(0)
      startSpeechRecognition()
      autoStopRef.current = setTimeout(() => {
        if (mediaRecorderRef.current === recorder && recorder.state === "recording") {
          stopRecording()
        }
      }, 15_000)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Microphone permission denied"
      toast({ title: "Recording failed", description: message, variant: "destructive" })
      cleanupRecorder()
    }
  }, [cleanupRecorder, micDevices.length, selectedMicId, startSpeechRecognition, stopRecording, toast])

  const handleUpload = useCallback(
    async (blob: Blob) => {
      let processedBlob = blob
      if (!blob.type.includes("wav")) {
        try {
          processedBlob = await convertBlobToWav(blob)
        } catch (error) {
          console.error("Failed to convert audio to WAV", error)
        }
      }

      const extension = processedBlob.type.includes("wav") ? "wav" : "webm"
      const file = new File([processedBlob], `voice-sample-${Date.now()}.${extension}`, {
        type: processedBlob.type || "audio/wav",
      })
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
        onComplete?.()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        toast({ title: "Upload failed", description: message, variant: "destructive" })
      } finally {
        setUploading(false)
      }
    },
    [onComplete, setSpeakBackEnabledLocal, toast, updateProfile],
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

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const transfer = event.dataTransfer
      if (!transfer) return
      let file: File | null = null
      if (transfer.items) {
        for (let i = 0; i < transfer.items.length; i++) {
          const item = transfer.items[i]
          if (item.kind === "file") {
            const candidate = item.getAsFile()
            if (candidate) {
              file = candidate
              break
            }
          }
        }
      } else if (transfer.files?.length) {
        file = transfer.files[0]
      }
      if (file) {
        await handleUpload(file)
      }
    },
    [handleUpload],
  )

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

  useEffect(() => {
    if (!recording) return
    if (!recognitionActiveRef.current) {
      const progress = Math.min(1, (duration / fallbackDuration) * fallbackSpeedMultiplier)
      const target = Math.min(words.length - 1, Math.floor(progress * words.length))
      setHighlightIndex((current) => {
        if (target <= current) return current
        const step = Math.min(target - current, 2)
        return current + step
      })
    }
    if (duration >= 15) {
      stopRecording()
    }
  }, [duration, fallbackDuration, fallbackSpeedMultiplier, recording, stopRecording, words.length])

  const countdown = Math.max(0, 15 - duration)
  const readyToSubmit = Boolean(recordedBlob && lastRecordingDuration >= 15)

  return (
    <div
      className="flex w-full items-center justify-center px-4 py-6 text-center text-white"
      style={{ minHeight: "calc(100vh - 240px)" }}
    >
      <div className="flex w-full max-w-4xl flex-col items-center gap-8">
        <p className="text-base text-white/80">Hit record and read the text below</p>

        <div className="relative">
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            className={cn(
              "flex h-24 w-24 items-center justify-center rounded-full text-white shadow-[0_18px_40px_rgba(255,0,72,0.45)] transition focus:outline-none focus-visible:ring-4 focus-visible:ring-red-400/30",
              recording
                ? "bg-gradient-to-b from-red-500 via-red-600 to-red-700 animate-pulse"
                : "bg-gradient-to-b from-red-400 via-red-500 to-red-600 hover:scale-105",
            )}
          >
            {recording ? (
              <span className="text-4xl font-semibold tracking-tight tabular-nums">
                {countdown.toString().padStart(2, "0")}
              </span>
            ) : (
              <Microphone className="h-10 w-10" weight="fill" />
            )}
          </button>
          <Select value={selectedMicId} onValueChange={setSelectedMicId} disabled={!micDevices.length}>
            <SelectTrigger className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-black/90 text-white shadow-[0_8px_20px_rgba(0,0,0,0.45)] focus:outline-none [&>svg:last-child]:hidden">
              <span className="sr-only">Select microphone</span>
              <CaretDown className="h-4 w-4" weight="bold" />
            </SelectTrigger>
            <SelectContent className="border border-white/10 bg-black/70 text-white">
              {micDevices.length ? (
                micDevices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.label || "Default microphone"}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="default">No microphones found</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {!recognitionSupported && (
          <p className="text-xs uppercase tracking-[0.35em] text-amber-200/80">
            Live highlighting unavailable in this browser. Using timed fallback.
          </p>
        )}

        <div className="max-w-4xl text-lg leading-relaxed text-white/80">
          <div
            className="flex flex-wrap justify-center gap-x-3 gap-y-2 text-center"
            style={{ minHeight: "4rem" }}
          >
            {words.map((word, index) => (
              <span
                key={`${word}-${index}`}
                className={cn(
                  "whitespace-nowrap px-1 transition-colors duration-200",
                  index === highlightIndex ? "text-white" : "text-white/35",
                )}
              >
                {word}
              </span>
            ))}
          </div>
        </div>

        <div className="relative w-full max-w-5xl">
          <canvas ref={waveCanvasRef} className="h-40 w-full sm:h-48 md:h-56" />
        </div>

        <div className="flex flex-col items-center gap-4 text-white/80">
          <div
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = "copy"
            }}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full max-w-lg cursor-pointer items-center justify-center gap-2 text-xs text-white/60"
          >
            <WaveSquare className="h-3 w-3" />
            <span>or drag and drop a WAV file here</span>
          </div>
          <Button
            onClick={() => readyToSubmit && recordedBlob && handleUpload(recordedBlob)}
            disabled={!readyToSubmit || uploading}
            className={cn(
              "h-14 w-56 rounded-full border border-white/25 text-lg font-semibold tracking-wide transition-all",
              readyToSubmit
                ? "bg-white text-black shadow-[0_18px_45px_rgba(255,255,255,0.4)] scale-105"
                : "bg-white/15 text-white/80 backdrop-blur-2xl hover:bg-white/25",
            )}
          >
            {uploading ? <SpinnerGap className="mr-2 h-4 w-4 animate-spin" /> : null}
            Next
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            type="button"
            variant="ghost"
            className="text-sm text-white/60 underline-offset-4 hover:text-white"
            onClick={() => {
              onSkip?.()
              toast({ title: "Voice skipped", description: "You can come back anytime." })
            }}
          >
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  )
}
