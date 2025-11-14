"use client"

import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import type { CSSProperties } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { GripVertical } from "lucide-react"
import type { VoiceFilterStyle } from "@/components/voice-clone-provider"
import { cn } from "@/lib/utils"

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

interface DraggableAvatarProps {
  meshData: MeshData | null
  features: Features | null
  textureUrl: string | null
  audioUrl: string | null
  onPositionChange?: (position: { x: number; y: number }) => void
  styleMode?: VoiceFilterStyle
  draggable?: boolean
  className?: string
  style?: CSSProperties
  frameless?: boolean
}

export function DraggableAvatar({
  meshData,
  features,
  textureUrl,
  audioUrl,
  onPositionChange,
  styleMode = "none",
  draggable = true,
  className,
  style,
  frameless = false,
}: DraggableAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    controls: OrbitControls
    mesh: THREE.Mesh | null
    origPos: Float32Array | null
    lowerLipIdx: number[]
    upperLipIdx: number[]
    analyser: AnalyserNode | null
    audioCtx: AudioContext | null
    rafId: number | null
  } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: 20, y: 20 })
  const isDraggable = draggable !== false
  const dragStartRef = useRef({ x: 0, y: 0 })

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    const scene = new THREE.Scene()
    scene.background = null // Transparent background
    
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
    camera.position.set(0, 0, 1.1)
    
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.minPolarAngle = Math.PI * 0.45
    controls.maxPolarAngle = Math.PI * 0.55

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const key = new THREE.DirectionalLight(0xffffff, 0.8)
    key.position.set(0.5, 1.0, 1.0)
    scene.add(key)

    const fitCanvas = () => {
      if (containerRef.current) {
        const size = Math.min(containerRef.current.clientWidth, containerRef.current.clientHeight)
        renderer.setSize(size, size, false)
        camera.aspect = 1
        camera.updateProjectionMatrix()
      }
    }

    fitCanvas()
    window.addEventListener("resize", fitCanvas)

    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      mesh: null,
      origPos: null,
      lowerLipIdx: [],
      upperLipIdx: [],
      analyser: null,
      audioCtx: null,
      rafId: null,
    }

    const animate = () => {
      const state = sceneRef.current
      if (!state) return

      state.rafId = requestAnimationFrame(animate)

      if (state.mesh && state.analyser && state.origPos && state.lowerLipIdx.length) {
        const N = 256
        const buf = new Uint8Array(N)
        state.analyser.getByteTimeDomainData(buf)
        let s = 0
        for (let i = 0; i < N; i++) {
          const v = buf[i] - 128
          s += v * v
        }
        const rms = Math.sqrt(s / N) / 26
        const amp = Math.min(1, rms)

        const pos = state.mesh.geometry.getAttribute("position")
        const arr = pos.array as Float32Array

        let sumY = 0,
          n = 0
        const allLipIdx = state.lowerLipIdx.concat(state.upperLipIdx)
        for (const idx of allLipIdx) {
          sumY += state.origPos[idx * 3 + 1]
          n++
        }
        const yC = n ? sumY / n : 0

        for (const idx of state.lowerLipIdx) {
          const baseY = state.origPos[idx * 3 + 1]
          const dy = Math.abs(baseY - yC)
          const falloff = Math.max(0.25, 1.0 - dy * 2.0)
          arr[idx * 3 + 1] = baseY - 0.035 * amp * falloff
        }
        for (const idx of state.upperLipIdx) {
          const baseY = state.origPos[idx * 3 + 1]
          arr[idx * 3 + 1] = baseY
        }
        pos.needsUpdate = true
      }

      renderer.render(scene, camera)
    }

    animate()

    return () => {
      window.removeEventListener("resize", fitCanvas)
      if (sceneRef.current?.rafId) {
        cancelAnimationFrame(sceneRef.current.rafId)
      }
      if (sceneRef.current?.controls) {
        sceneRef.current.controls.dispose()
      }
      if (sceneRef.current?.renderer) {
        sceneRef.current.renderer.dispose()
      }
      if (sceneRef.current?.audioCtx) {
        try {
          sceneRef.current.audioCtx.close()
        } catch {}
      }
    }
  }, [])

  // Build mesh from JSON data
  const buildMeshFromJSON = useCallback((data: MeshData) => {
    const verts = data.vertices
    const faces = data.faces
    const uv = data.uv

    const geometry = new THREE.BufferGeometry()
    const flatPos = new Float32Array(verts.length * 3)
    for (let i = 0; i < verts.length; i++) {
      flatPos[i * 3] = verts[i][0]
      flatPos[i * 3 + 1] = verts[i][1]
      flatPos[i * 3 + 2] = verts[i][2]
    }
    const flatUv = new Float32Array(uv.length * 2)
    for (let i = 0; i < uv.length; i++) {
      flatUv[i * 2] = uv[i][0]
      flatUv[i * 2 + 1] = 1.0 - uv[i][1] // flip V
    }
    const idx = new Uint32Array(faces.length * 3)
    for (let i = 0; i < faces.length; i++) {
      idx[i * 3] = faces[i][0]
      idx[i * 3 + 1] = faces[i][1]
      idx[i * 3 + 2] = faces[i][2]
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(flatPos, 3))
    geometry.setAttribute("uv", new THREE.BufferAttribute(flatUv, 2))
    geometry.setIndex(new THREE.BufferAttribute(idx, 1))
    geometry.computeVertexNormals()
    return geometry
  }, [])

  // Update mesh when data changes
  useEffect(() => {
    if (!sceneRef.current || !meshData) return

    const state = sceneRef.current
    if (state.mesh) {
      state.scene.remove(state.mesh)
      state.mesh.geometry.dispose()
      const disposeMaterial = (material: THREE.Material) => {
        if ("map" in material && (material as THREE.MeshPhongMaterial).map) {
          ;(material as THREE.MeshPhongMaterial).map?.dispose()
        }
        material.dispose()
      }
      const material = state.mesh.material
      if (Array.isArray(material)) {
        material.forEach((item) => disposeMaterial(item))
      } else {
        disposeMaterial(material)
      }
      state.mesh = null
      state.origPos = null
    }

    const geometry = buildMeshFromJSON(meshData)
    const mat = new THREE.MeshPhongMaterial({ side: THREE.DoubleSide })

    if (textureUrl) {
      const tex = new THREE.TextureLoader().load(textureUrl)
      tex.flipY = false
      mat.map = tex
    } else {
      mat.color = new THREE.Color(0xdddddd)
    }

    const mesh = new THREE.Mesh(geometry, mat)
    mesh.rotation.y = Math.PI
    mesh.renderOrder = 0
    state.scene.add(mesh)
    state.mesh = mesh

    // Clone base positions for deformation
    const posAttr = mesh.geometry.getAttribute("position")
    state.origPos = posAttr.array.slice(0) as Float32Array

    // Soft edge silhouette pass
    return () => {}
  }, [meshData, textureUrl, buildMeshFromJSON])

  // Update lip indices when features change
  useEffect(() => {
    if (!sceneRef.current || !features) return
    sceneRef.current.lowerLipIdx = features.lower_lip || features.lips || []
    sceneRef.current.upperLipIdx = features.upper_lip || []
  }, [features])

  // Play audio when audioUrl changes
  useEffect(() => {
    if (!sceneRef.current) return

    const state = sceneRef.current
    
    // Clean up previous audio
    if (state.audioCtx) {
      try {
        state.audioCtx.close()
      } catch {}
      state.audioCtx = null
      state.analyser = null
    }

    if (!audioUrl) {
      console.log("[DraggableAvatar] No audio URL provided")
      return
    }

    console.log("[DraggableAvatar] Loading audio from:", audioUrl)

    // Play new audio
    const audio = new Audio(audioUrl)
    
    // Add error handlers
    audio.addEventListener("error", (e) => {
      console.error("[DraggableAvatar] Audio error:", e, audio.error)
    })
    
    audio.addEventListener("loadstart", () => {
      console.log("[DraggableAvatar] Audio loading started")
    })
    
    audio.addEventListener("canplay", () => {
      console.log("[DraggableAvatar] Audio can play")
    })
    
    audio.addEventListener("loadeddata", () => {
      console.log("[DraggableAvatar] Audio data loaded")
    })
    
    // Wait for audio to be ready before setting up audio context
    const setupAudio = () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        
        // Resume audio context if suspended (required by browser autoplay policies)
        if (ctx.state === "suspended") {
          ctx.resume().then(() => {
            console.log("[DraggableAvatar] Audio context resumed")
          }).catch((err) => {
            console.error("[DraggableAvatar] Failed to resume audio context:", err)
          })
        }
        
        const src = ctx.createMediaElementSource(audio)
        const an = ctx.createAnalyser()
        an.fftSize = 256
        src.connect(an)
        an.connect(ctx.destination)
        state.audioCtx = ctx
        state.analyser = an
        
        console.log("[DraggableAvatar] Audio context setup complete")
      } catch (error) {
        console.error("[DraggableAvatar] Failed to setup audio context:", error)
      }
    }
    
    // Set up audio context when audio is ready
    audio.addEventListener("canplaythrough", setupAudio)
    
    // Also try to set up immediately if already loaded
    if (audio.readyState >= 2) {
      setupAudio()
    }
    
    // Play audio - may require user interaction in some browsers
    const playAudio = () => {
      audio.play()
        .then(() => {
          console.log("[DraggableAvatar] Audio playback started successfully")
        })
        .catch((error) => {
          console.error("[DraggableAvatar] Audio playback failed:", error)
          // Try to resume audio context if suspended
          if (state.audioCtx && state.audioCtx.state === "suspended") {
            state.audioCtx.resume().then(() => {
              console.log("[DraggableAvatar] Audio context resumed, retrying playback")
              audio.play().catch((err) => {
                console.error("[DraggableAvatar] Retry playback failed:", err)
              })
            })
          }
        })
    }
    
    // Try to play when audio is ready
    audio.addEventListener("canplaythrough", playAudio, { once: true })
    
    // Also try to play immediately if already loaded
    if (audio.readyState >= 3) {
      playAudio()
    } else {
      // Load the audio
      audio.load()
    }

    // Clean up when audio ends
    audio.addEventListener("ended", () => {
      console.log("[DraggableAvatar] Audio playback ended")
      // Optionally clear audioUrl after playback
    })
    
    // Store audio element for cleanup
    return () => {
      audio.pause()
      audio.src = ""
    }
  }, [audioUrl])

  // Drag handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isDraggable) return
      if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest('[data-drag-handle]')) {
        return
      }
      setIsDragging(true)
      dragStartRef.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      }
    },
    [isDraggable, position],
  )

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    const newX = e.clientX - dragStartRef.current.x
    const newY = e.clientY - dragStartRef.current.y
    setPosition({ x: newX, y: newY })
    onPositionChange?.({ x: newX, y: newY })
  }, [isDragging, onPositionChange])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
      return () => {
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  if (!meshData) {
    return null
  }

  const isCRT = styleMode === "90s_tv"

  const crtOverlay = useMemo(() => {
    if (!isCRT) return null
    return (
      <>
        <div
          className="pointer-events-none absolute inset-0 opacity-30 mix-blend-screen"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 2px, transparent 2px, transparent 4px)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08), transparent 45%), radial-gradient(circle at 80% 30%, rgba(255,255,255,0.05), transparent 40%), radial-gradient(circle at 50% 80%, rgba(255,255,255,0.04), transparent 50%)",
            mixBlendMode: "screen",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(0,0,0,0.08) 0, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 3px)",
            animation: "crt-noise 1.5s steps(4, end) infinite",
          }}
        />
      </>
    )
  }, [isCRT])

  const canvasMask =
    "radial-gradient(circle at center, rgba(0,0,0,1) 42%, rgba(0,0,0,0.9) 60%, rgba(0,0,0,0.2) 75%, rgba(0,0,0,0) 88%)"
  const canvasFilter = isCRT
    ? "grayscale(0.15) contrast(1.6) brightness(0.8) hue-rotate(110deg) saturate(1.4)"
    : "contrast(1.05) brightness(0.95)"

  const frameClasses = frameless
    ? ""
    : isCRT
      ? "border-emerald-500/60 shadow-[0_0_25px_rgba(0,255,120,0.35)]"
      : "border-primary/30"

  const containerClasses = cn(
    "w-64 h-64 overflow-hidden bg-black",
    frameless ? "" : "rounded-lg border-2 shadow-lg",
    isDraggable ? "fixed z-50 cursor-move" : "relative",
    frameClasses,
    className,
  )

  const defaultShadow =
    !frameless && isCRT ? "0 0 40px rgba(0,150,80,0.45), inset 0 0 25px rgba(0,120,60,0.4)" : undefined

  const containerStyle: CSSProperties = {
    ...(isDraggable
      ? {
          left: `${position.x}px`,
          top: `${position.y}px`,
        }
      : {}),
    ...(defaultShadow ? { boxShadow: defaultShadow } : {}),
    ...style,
  }

  const maskImage = frameless ? "none" : canvasMask

  return (
    <div
      ref={containerRef}
      className={containerClasses}
      style={containerStyle}
      onMouseDown={isDraggable ? handleMouseDown : undefined}
    >
      {isDraggable && (
        <div
          data-drag-handle
          className="absolute top-2 left-2 flex items-center gap-1 text-muted-foreground cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
          <span className="text-xs">Avatar</span>
        </div>
      )}
      {crtOverlay}
      <canvas
        ref={canvasRef}
        className={`relative z-10 h-full w-full ${isCRT ? "mix-blend-screen" : ""}`}
        style={{
          display: "block",
          WebkitMaskImage: maskImage,
          maskImage: maskImage,
          filter: canvasFilter,
        }}
      />
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            boxShadow: "inset 0 0 30px 20px rgba(0,0,0,0.75)",
          }}
        />
      </div>
      <div
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.25) 75%, rgba(0,0,0,0.65) 100%)",
          mixBlendMode: isCRT ? "screen" : "multiply",
        }}
      />
      {isCRT && (
        <div
          className="pointer-events-none absolute inset-0 z-30 opacity-70 mix-blend-screen"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(90,255,150,0.22) 0px, rgba(90,255,150,0.22) 1px, rgba(0,0,0,0.7) 1px, rgba(0,0,0,0.7) 3px)",
          }}
        />
      )}
      {isCRT && (
        <div
          className="pointer-events-none absolute inset-0 z-35 opacity-40 mix-blend-screen"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(0,255,140,0.06) 0px, rgba(0,255,140,0.06) 2px, transparent 2px, transparent 6px)",
          }}
        />
      )}
      {isCRT && (
        <div
          className="pointer-events-none absolute inset-0 z-40 opacity-55"
          style={{
            background:
              "radial-gradient(circle at center, rgba(40,220,120,0.08) 0%, rgba(0,120,70,0.35) 55%, rgba(0,40,20,0.85) 100%)",
            borderRadius: "12px",
            border: "1px solid rgba(30,200,120,0.45)",
            boxShadow: "inset 0 0 35px rgba(30,200,120,0.35)",
          }}
        />
      )}
    </div>
  )
}

// Keyframes for CRT noise animation (injected once)
if (typeof document !== "undefined" && !document.getElementById("crt-noise-keyframes")) {
  const styleEl = document.createElement("style")
  styleEl.id = "crt-noise-keyframes"
  styleEl.textContent = `
    @keyframes crt-noise {
      0% { background-position: 0 0; }
      25% { background-position: 10px -10px; }
      50% { background-position: -10px 10px; }
      75% { background-position: 15px 5px; }
      100% { background-position: 0 0; }
    }
  `
  document.head.appendChild(styleEl)
}
