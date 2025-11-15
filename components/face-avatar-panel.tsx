"use client"

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ChangeEvent,
  type DragEvent,
} from "react"
import { createPortal } from "react-dom"
import { ArrowClockwise, Camera, CaretDown, Check, SpinnerGap, WaveSquare } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { useAvatar } from "@/components/avatar-context"
import { cn } from "@/lib/utils"
import { useSetupFooterPortal } from "@/components/setup-footer-context"

interface MeshData {
  vertices: number[][]
  faces: number[][]
  uv: number[][]
}

interface Features {
  lips?: number[]
  lower_lip?: number[]
  upper_lip?: number[]
}

type CameraOption = { id: string; label: string; disabled?: boolean }

interface FaceAvatarPanelProps {
  onSkip?: () => void
  onComplete?: () => void
}

async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsDataURL(file)
  })
}

async function convertToJpeg(file: File) {
  const dataUrl = await readFileAsDataUrl(file)
  if (file.type.includes("jpeg")) {
    return { file, previewUrl: dataUrl }
  }
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  const canvas = document.createElement("canvas")
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Unable to prepare image")
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const jpegBlob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92),
  )
  if (!jpegBlob) throw new Error("Unable to convert image")
  const jpegFile = new File([jpegBlob], `avatar-upload-${Date.now()}.jpg`, { type: "image/jpeg" })
  const jpegPreview = canvas.toDataURL("image/jpeg", 0.92)
  return { file: jpegFile, previewUrl: jpegPreview }
}

export function FaceAvatarPanel({ onSkip, onComplete }: FaceAvatarPanelProps = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraDevices, setCameraDevices] = useState<CameraOption[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState("")
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false)
  const cameraMenuRef = useRef<HTMLDivElement | null>(null)

  const { toast } = useToast()
  const footerPortal = useSetupFooterPortal()
  const { setMeshData, setFeatures, setTextureUrl } = useAvatar()

  const stopCamera = useCallback(() => {
    setCameraReady(false)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const startCamera = useCallback(async (deviceId?: string) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera preview is unavailable. Upload a photo below.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : { width: 1280, height: 720, facingMode: "user" },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setCameraReady(true)
      setCameraError(null)
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const cameras = devices
          .filter((item) => item.kind === "videoinput" && item.deviceId)
          .map((item, index) => ({
            id: item.deviceId,
            label: item.label || `Camera ${index + 1}`,
          }))
        setCameraDevices(cameras)
        if (!deviceId && cameras.length) {
          setSelectedCameraId((prev) => prev || cameras[0].id)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to access camera"
      setCameraError(message)
      setCameraReady(false)
    }
  }, [])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!cameraMenuOpen) return
      if (cameraMenuRef.current && !cameraMenuRef.current.contains(event.target as Node)) {
        setCameraMenuOpen(false)
      }
    }
    window.addEventListener("mousedown", handleClick)
    return () => window.removeEventListener("mousedown", handleClick)
  }, [cameraMenuOpen])

  useEffect(() => {
    startCamera(selectedCameraId || undefined)
    return () => {
      stopCamera()
    }
  }, [selectedCameraId, startCamera, stopCamera])

  const applyPhotoSelection = useCallback(
    (file: File, previewUrl: string) => {
      setPhotoFile(file)
      setPhotoPreview(previewUrl)
      setTextureUrl(previewUrl)
    },
    [setTextureUrl],
  )

  const clearPhotoSelection = useCallback(() => {
    setPhotoFile(null)
    setPhotoPreview(null)
    setTextureUrl(null)
  }, [setTextureUrl])

  const handleCapture = useCallback(() => {
    const video = videoRef.current
    if (!video) {
      return
    }
    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0, width, height)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92)
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast({
            title: "Capture failed",
            description: "We couldn't read the frame. Try again.",
            variant: "destructive",
          })
          return
        }
        const file = new File([blob], `avatar-capture-${Date.now()}.jpg`, { type: blob.type })
        applyPhotoSelection(file, dataUrl)
        stopCamera()
      },
      "image/jpeg",
      0.92,
    )
  }, [applyPhotoSelection, stopCamera, toast])

  const handleRetake = useCallback(() => {
    clearPhotoSelection()
    startCamera(selectedCameraId || undefined)
  }, [clearPhotoSelection, selectedCameraId, startCamera])

  const processFile = useCallback(
    async (file: File | null) => {
      if (!file) return
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Unsupported file type",
          description: "Please upload a PNG or JPG photo.",
          variant: "destructive",
        })
        return
      }
      try {
        const { file: normalizedFile, previewUrl } = await convertToJpeg(file)
        applyPhotoSelection(normalizedFile, previewUrl)
        stopCamera()
      } catch (error) {
        toast({
          title: "Unable to load photo",
          description: error instanceof Error ? error.message : "Failed to process the selected image.",
          variant: "destructive",
        })
      }
    },
    [applyPhotoSelection, stopCamera, toast],
  )

  const handleFileInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null
      void processFile(file)
      event.target.value = ""
    },
    [processFile],
  )

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const transfer = event.dataTransfer
      if (!transfer) return
      let file: File | null = null
      if (transfer.items?.length) {
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
      }
      if (!file && transfer.files?.length) {
        file = transfer.files[0]
      }
      if (file) {
        void processFile(file)
      }
    },
    [processFile],
  )

  const handleSelectCamera = useCallback((id: string) => {
    setSelectedCameraId(id)
    setCameraMenuOpen(false)
  }, [])

  const generateAvatar = useCallback(async () => {
    if (!photoFile) return
    setIsGenerating(true)
    try {
      const formData = new FormData()
      formData.append("photo", photoFile)
      const response = await fetch("/api/face-avatar/generate", {
        method: "POST",
        body: formData,
      })
      const data = await response.json()
      if (!data.ok) {
        throw new Error(data.error || "Generate failed")
      }
      const [meshResponse, featuresResponse] = await Promise.all([
        fetch(`/api/face-avatar/static${data.mesh.replace("/static", "")}`),
        fetch(`/api/face-avatar/static${data.features.replace("/static", "")}`),
      ])
      const meshJson: MeshData = await meshResponse.json()
      const features: Features = await featuresResponse.json()
      setMeshData(meshJson)
      setFeatures(features)
      toast({
        title: "Avatar ready",
        description: "Your face mesh has been generated.",
      })
      onComplete?.()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate avatar",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }, [onComplete, photoFile, setFeatures, setMeshData, toast])

  const readyToSubmit = Boolean(photoFile) && !isGenerating
  const cameraOptions: CameraOption[] = cameraDevices.length
    ? cameraDevices
    : [{ id: "unavailable", label: "No cameras detected", disabled: true }]
  const captureDisabled = !photoPreview && (!cameraReady || Boolean(cameraError))

  return (
    <div className="flex h-full w-full flex-1 flex-col px-4 py-6 text-center text-white">
      <div className="flex flex-1 flex-col items-center justify-center gap-10">
        <div className="flex items-center justify-center">
          <p className="max-w-md text-sm text-white/75">
            Find a bright space and take a picture of your face
          </p>
        </div>
        <div className="flex w-full max-w-4xl flex-col items-center justify-center gap-10 text-center">
          <div className="relative">
            <div className="relative h-72 w-56 overflow-hidden rounded-[120px]">
              <video
                ref={videoRef}
                className={cn(
                  "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
                  photoPreview ? "opacity-0" : cameraReady ? "opacity-100" : "opacity-40",
                )}
                playsInline
                autoPlay
                muted
              />
              {photoPreview ? (
                <img src={photoPreview} alt="Captured portrait" className="absolute inset-0 h-full w-full object-cover" />
              ) : null}
              <div
                className="pointer-events-none absolute inset-0 rounded-[120px]"
                style={{
                  boxShadow: "inset 0 0 60px rgba(0,0,0,0.85)",
                  background: "radial-gradient(circle at 50% 38%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.7) 80%)",
                }}
              />
            </div>
            <div className="absolute bottom-[-0.5rem] left-1/2 -translate-x-1/2">
              <div className="relative">
                <button
                  type="button"
                  onClick={photoPreview ? handleRetake : handleCapture}
                  disabled={captureDisabled}
                  className={cn(
                    "flex h-16 w-16 items-center justify-center rounded-full text-white shadow-[0_18px_40px_rgba(255,0,72,0.45)] transition focus:outline-none focus-visible:ring-4 focus-visible:ring-red-400/30",
                    captureDisabled
                      ? "bg-gradient-to-b from-red-400 via-red-500 to-red-600 opacity-60"
                      : "bg-gradient-to-b from-red-400 via-red-500 to-red-600 hover:scale-105",
                  )}
                >
                  {photoPreview ? <ArrowClockwise className="h-6 w-6" /> : <Camera className="h-7 w-7" weight="fill" />}
                </button>
                <div ref={cameraMenuRef} className="absolute -bottom-2 -right-2">
                  <div className="relative flex flex-col items-end">
                    <button
                      type="button"
                      onClick={() => setCameraMenuOpen((prev) => !prev)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-black/80 text-white shadow-[0_8px_20px_rgba(0,0,0,0.45)] transition hover:border-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      aria-haspopup="menu"
                      aria-expanded={cameraMenuOpen}
                    >
                      <span className="sr-only">Select camera</span>
                      <CaretDown className="h-3 w-3" weight="bold" />
                    </button>
                    {cameraMenuOpen ? (
                      <div className="absolute top-full z-20 mt-3 w-56 rounded-2xl border border-white/15 bg-black/90 py-2 text-left text-white shadow-[0_30px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                        <p className="px-4 pb-2 text-[11px] uppercase tracking-[0.35em] text-white/40">Camera</p>
                        <div className="max-h-56 overflow-auto">
                          {cameraOptions.map((device) => {
                            const isSelected = selectedCameraId === device.id
                            return (
                              <button
                                key={device.id}
                                type="button"
                                disabled={device.disabled}
                                onClick={() => !device.disabled && handleSelectCamera(device.id)}
                                className={cn(
                                  "flex w-full items-center justify-between px-4 py-2 text-sm transition",
                                  device.disabled
                                    ? "cursor-not-allowed text-white/30"
                                    : isSelected
                                      ? "text-white"
                                      : "text-white/70 hover:bg-white/5 hover:text-white",
                                )}
                              >
                                <span className="truncate">{device.label}</span>
                                {isSelected ? <Check className="h-4 w-4 text-emerald-300" weight="bold" /> : null}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {cameraError ? <p className="text-xs text-amber-200/85">{cameraError}</p> : null}
        </div>
      </div>
      {(() => {
        const footerContent = (
          <div className="flex flex-col items-center gap-3 text-white/80">
            <div
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full max-w-lg cursor-pointer items-center justify-center gap-2 text-xs text-white/60"
            >
              <WaveSquare className="h-3 w-3" />
              <span>or drag and drop a PNG or JPG photo here</span>
            </div>
            <Button
              onClick={() => readyToSubmit && generateAvatar()}
              disabled={!readyToSubmit}
              className={cn(
                "h-14 w-56 rounded-full border border-white/25 text-lg font-semibold tracking-wide transition-all",
                readyToSubmit
                  ? "bg-white text-black shadow-[0_18px_45px_rgba(255,255,255,0.4)] hover:scale-105"
                  : "bg-white/15 text-white/80 backdrop-blur-2xl",
              )}
            >
              {isGenerating ? <SpinnerGap className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isGenerating ? "Generating..." : "Next"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleFileInput}
              className="hidden"
            />
            <Button
              type="button"
              variant="ghost"
              className="text-sm text-white/60 underline-offset-4 hover:text-white"
              onClick={() => {
                clearPhotoSelection()
                stopCamera()
                onSkip?.()
                toast({ title: "Avatar skipped", description: "You can come back and upload a photo anytime." })
              }}
            >
              Skip for now
            </Button>
          </div>
        )
        return footerPortal ? createPortal(footerContent, footerPortal) : footerContent
      })()}
    </div>
  )
}
