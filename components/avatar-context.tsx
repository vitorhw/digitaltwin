"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"

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

interface AvatarState {
  meshData: MeshData | null
  features: Features | null
  textureUrl: string | null
  voice: string | null
  position: { x: number; y: number }
  audioUrl: string | null
}

interface AvatarContextType {
  avatarState: AvatarState
  setMeshData: (data: MeshData | null) => void
  setFeatures: (features: Features | null) => void
  setTextureUrl: (url: string | null) => void
  setVoice: (voice: string | null) => void
  setPosition: (position: { x: number; y: number }) => void
  setAudioUrl: (url: string | null) => void
  reset: () => void
}

const AVATAR_STORAGE_KEY = "avatar-state"
const AvatarContext = createContext<AvatarContextType | undefined>(undefined)

export function AvatarProvider({ children }: { children: ReactNode }) {
  const [avatarState, setAvatarState] = useState<AvatarState>({
    meshData: null,
    features: null,
    textureUrl: null,
    voice: null,
    position: { x: 20, y: 20 },
    audioUrl: null,
  })

  // Rehydrate avatar state from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const stored = window.localStorage.getItem(AVATAR_STORAGE_KEY)
      if (!stored) return
      const parsed = JSON.parse(stored) as Partial<AvatarState>
      setAvatarState((prev) => ({
        ...prev,
        ...parsed,
      }))
    } catch (error) {
      console.error("[AvatarProvider] Failed to load stored avatar state:", error)
    }
  }, [])

  // Persist avatar state (excluding transient audio) for reloads
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const persistable: AvatarState = {
        ...avatarState,
        audioUrl: null,
      }
      window.localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(persistable))
    } catch (error) {
      console.error("[AvatarProvider] Failed to persist avatar state:", error)
    }
  }, [avatarState.meshData, avatarState.features, avatarState.textureUrl, avatarState.voice, avatarState.position])

  const setMeshData = (data: MeshData | null) => {
    setAvatarState((prev) => ({ ...prev, meshData: data }))
  }

  const setFeatures = (features: Features | null) => {
    setAvatarState((prev) => ({ ...prev, features }))
  }

  const setTextureUrl = (url: string | null) => {
    setAvatarState((prev) => ({ ...prev, textureUrl: url }))
  }

  const setVoice = (voice: string | null) => {
    setAvatarState((prev) => ({ ...prev, voice }))
  }

  const setPosition = (position: { x: number; y: number }) => {
    setAvatarState((prev) => ({ ...prev, position }))
  }

  const setAudioUrl = (url: string | null) => {
    setAvatarState((prev) => ({ ...prev, audioUrl: url }))
  }

  const reset = () => {
    setAvatarState({
      meshData: null,
      features: null,
      textureUrl: null,
      voice: null,
      position: { x: 20, y: 20 },
      audioUrl: null,
    })
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(AVATAR_STORAGE_KEY)
      } catch {}
    }
  }

  return (
    <AvatarContext.Provider
      value={{
        avatarState,
        setMeshData,
        setFeatures,
        setTextureUrl,
        setVoice,
        setPosition,
        setAudioUrl,
        reset,
      }}
    >
      {children}
    </AvatarContext.Provider>
  )
}

export function useAvatar() {
  const context = useContext(AvatarContext)
  if (context === undefined) {
    throw new Error("useAvatar must be used within an AvatarProvider")
  }
  return context
}
