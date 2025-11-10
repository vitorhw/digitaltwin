"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { GripVertical } from "lucide-react"

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
  onPositionChange?: (x: number, y: number) => void
}

export function DraggableAvatar({
  meshData,
  features,
  textureUrl,
  audioUrl,
  onPositionChange,
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
      if ((state.mesh.material as THREE.MeshPhongMaterial).map) {
        ;(state.mesh.material as THREE.MeshPhongMaterial).map?.dispose()
      }
      state.mesh.material.dispose()
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
    state.scene.add(mesh)
    state.mesh = mesh

    // Clone base positions for deformation
    const posAttr = mesh.geometry.getAttribute("position")
    state.origPos = posAttr.array.slice(0) as Float32Array
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
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest('[data-drag-handle]')) {
      return
    }
    setIsDragging(true)
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    }
  }, [position])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    const newX = e.clientX - dragStartRef.current.x
    const newY = e.clientY - dragStartRef.current.y
    setPosition({ x: newX, y: newY })
    onPositionChange?.(newX, newY)
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

  return (
    <div
      ref={containerRef}
      className="fixed z-50 w-64 h-64 rounded-lg border-2 border-primary/20 bg-background/80 backdrop-blur-sm shadow-lg cursor-move"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onMouseDown={handleMouseDown}
    >
      <div
        data-drag-handle
        className="absolute top-2 left-2 flex items-center gap-1 text-muted-foreground cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
        <span className="text-xs">Avatar</span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: "block" }}
      />
    </div>
  )
}

