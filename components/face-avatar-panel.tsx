"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAvatar } from "@/components/avatar-context"

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

export function FaceAvatarPanel() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { toast } = useToast()
  const { setMeshData, setFeatures, setTextureUrl, setVoice, avatarState } = useAvatar()

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      setTextureUrl(url)
    } else {
      setSelectedFile(null)
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
      setPreviewUrl(null)
      setTextureUrl(null)
    }
  }, [previewUrl, setTextureUrl])

  const generateAvatar = useCallback(async () => {
    if (!selectedFile) return

    setIsGenerating(true)
    try {
      const formData = new FormData()
      formData.append("photo", selectedFile)

      const response = await fetch("/api/face-avatar/generate", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()
      if (!data.ok) {
        throw new Error(data.error || "Generate failed")
      }

      // Fetch mesh and features through Next.js API proxy
      const [meshResponse, featuresResponse] = await Promise.all([
        fetch(`/api/face-avatar/static${data.mesh.replace("/static", "")}`),
        fetch(`/api/face-avatar/static${data.features.replace("/static", "")}`),
      ])

      const meshJson: MeshData = await meshResponse.json()
      const features: Features = await featuresResponse.json()

      // Update avatar context
      setMeshData(meshJson)
      setFeatures(features)

      toast({
        title: "Success",
        description: "Avatar generated successfully! It will appear on the main interface.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate avatar",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }, [selectedFile, setMeshData, setFeatures, toast])

  if (!mounted) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border text-xs text-muted-foreground">
        Loading avatar tools...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="avatar-file">Portrait Photo</Label>
        <Input id="avatar-file" type="file" accept="image/*" onChange={handleFileChange} />
        <p className="text-xs text-muted-foreground">Upload a clear, front-facing photo (JPG or PNG).</p>
      </div>
      <Button onClick={generateAvatar} disabled={!selectedFile || isGenerating} className="w-full sm:w-auto">
        {isGenerating ? "Generating..." : "Generate Avatar"}
      </Button>
      {previewUrl && (
        <div className="w-full h-52 overflow-hidden rounded-xl border bg-black/60">
          <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="voice-select">Voice Selection</Label>
        <Select value={avatarState.voice || undefined} onValueChange={(value) => setVoice(value || null)}>
          <SelectTrigger id="voice-select" className="w-full">
            <SelectValue placeholder="Default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="coqui">Cloned Voice (Coqui)</SelectItem>
            <SelectItem value="Zira">Windows: Zira (Female)</SelectItem>
            <SelectItem value="David">Windows: David (Male)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Select the default narration voice. Choose Coqui once a voice profile is registered.
        </p>
      </div>
    </div>
  )
}
