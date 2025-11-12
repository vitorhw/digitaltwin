"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  const { toast } = useToast()
  const { setMeshData, setFeatures, setTextureUrl, setVoice, avatarState } = useAvatar()

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

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>Generate Avatar</CardTitle>
          <CardDescription>Upload a photo to generate a 3D avatar that will appear on the main interface</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="file-upload">Select Image</Label>
            <Input
              id="file-upload"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
            />
          </div>
          <Button
            onClick={generateAvatar}
            disabled={!selectedFile || isGenerating}
            className="w-full"
          >
            {isGenerating ? "Generating..." : "Generate Avatar"}
          </Button>
          {previewUrl && (
            <div className="w-full aspect-square overflow-hidden rounded border">
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-full object-contain"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="voice-select">Voice Selection</Label>
            <Select
              value={avatarState.voice || undefined}
              onValueChange={(value) => setVoice(value || null)}
            >
              <SelectTrigger id="voice-select" className="w-full">
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="coqui">Cloned Voice (Coqui)</SelectItem>
                <SelectItem value="Zira">Windows: Zira (Female)</SelectItem>
                <SelectItem value="David">Windows: David (Male)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Choose how the avatar speaks. Use "Cloned Voice" after enrolling a Coqui voice profile, or select a built-in Windows voice (Zira/David).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
