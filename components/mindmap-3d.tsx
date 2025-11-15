"use client"

import { useEffect, useMemo, useState } from "react"
import { Canvas } from "@react-three/fiber"
import { Html, OrbitControls } from "@react-three/drei"
import type { Node as FlowNode, Edge as FlowEdge } from "@xyflow/react"
import { cn } from "@/lib/utils"

type ApiNode = FlowNode<{
  label: string
  kind?: string
  meta?: Record<string, any>
}>

interface MindmapResponse {
  nodes: ApiNode[]
  edges: FlowEdge[]
}

type VisualNode = {
  id: string
  label: string
  kind: string
  meta?: Record<string, any>
  size: number
  position: [number, number, number]
  color: string
}

const kindColors: Record<string, string> = {
  root: "#f8fafc",
  category: "#94a3b8",
  fact: "#f97316",
  episodic: "#2dd4bf",
  procedural: "#a855f7",
  document: "#38bdf8",
}

const anchorVectors: Record<string, [number, number, number]> = {
  root: [0, 0, 0],
  category: [0, 0, 0],
  fact: [16, 0, 0],
  episodic: [-16, 0, 0],
  procedural: [0, 0, 16],
  document: [0, -16, -4],
}

function hashToRange(input: string, seed = 0) {
  let hash = seed
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) % 1000
  }
  return hash / 1000
}

function deriveImportance(kind: string, meta?: Record<string, any>) {
  if (!meta) return 0.5
  if (kind === "fact") {
    return Number(meta.confidence ?? 0.5)
  }
  if (kind === "episodic") {
    return Number(meta.importance ?? meta.memory_strength ?? 0.5)
  }
  if (kind === "procedural") {
    return Number(meta.importance ?? meta.confidence ?? 0.5)
  }
  return 0.4
}

function buildPosition(node: ApiNode, index: number): [number, number, number] {
  const kind = node.data?.kind ?? "category"
  const anchor = anchorVectors[kind] ?? [0, 0, 0]
  const importance = deriveImportance(kind, node.data?.meta ?? undefined)
  const similarityVector = node.data?.meta?.vector as number[] | undefined

  if (similarityVector && similarityVector.length >= 3) {
    return [
      anchor[0] + similarityVector[0] * 12,
      anchor[1] + similarityVector[1] * 12,
      anchor[2] + similarityVector[2] * 12,
    ]
  }

  const spread = 1.5 + (1 - importance)

  const h1 = hashToRange(node.id, 1 + index)
  const h2 = hashToRange(node.data?.label ?? "", 7 + index)
  const h3 = hashToRange(node.data?.label ?? "", 17 + index)

  return [
    anchor[0] + (h1 - 0.5) * 8 * spread,
    anchor[1] + (h2 - 0.5) * 6 * spread,
    anchor[2] + (h3 - 0.5) * 8 * spread,
  ]
}

function describeMeta(kind: string, meta?: Record<string, any>) {
  if (!meta) return []
  const entries: Array<[string, string]> = []

  if (kind === "fact" && meta.key) {
    entries.push(["Key", meta.key])
  }

  Object.entries(meta).forEach(([key, value]) => {
    if (key === "text") return
    if (typeof value === "object" && value !== null) {
      entries.push([key, JSON.stringify(value)])
    } else if (typeof value === "number") {
      entries.push([key, value.toString()])
    } else {
      entries.push([key, value ? String(value) : "—"])
    }
  })

  return entries
}

interface NodeSphereProps {
  node: VisualNode
  isSelected: boolean
  onHover: (node: VisualNode | null) => void
  onSelect: (node: VisualNode) => void
}

function NodeSphere({ node, isSelected, onHover, onSelect }: NodeSphereProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <group>
      <mesh
        position={node.position}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          onHover(node)
        }}
        onPointerOut={(e) => {
          e.stopPropagation()
          setHovered(false)
          onHover(null)
        }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(node)
        }}
        scale={isSelected ? 1.2 : 1}
      >
        <sphereGeometry args={[node.size, 32, 32]} />
        <meshStandardMaterial color={node.color} emissive={hovered || isSelected ? node.color : "#020617"} emissiveIntensity={hovered || isSelected ? 0.6 : 0.15} />
      </mesh>
      {(hovered || isSelected) && (
        <Html
          position={node.position}
          className="pointer-events-none select-none"
          style={{ transform: "translate(-50%, -150%)" }}
        >
          <div className="rounded border bg-zinc-900/80 px-2 py-1 text-[11px] text-white shadow-lg">
            <p className="font-semibold">{node.label}</p>
            <p className="uppercase tracking-wide text-[9px] opacity-80">{node.kind}</p>
          </div>
        </Html>
      )}
    </group>
  )
}

export function MindMap3D() {
  const [data, setData] = useState<MindmapResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hovered, setHovered] = useState<VisualNode | null>(null)
  const [selected, setSelected] = useState<VisualNode | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch("/api/mindmap", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error((await res.text()) || "Failed to load mind map")
        }
        return res.json()
      })
      .then((payload) => {
        if (!active) return
        setData(payload)
        setError(null)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : "Mind map load failed")
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const displayNodes = useMemo(() => {
    if (!data?.nodes) return []

    return data.nodes
      .filter((node) => node.data?.label)
      .map((node, index) => {
        const kind = node.data?.kind ?? "category"
        const importance = deriveImportance(kind, node.data?.meta)
        const size = 0.6 + importance * 1.2
        const color = kindColors[kind] ?? "#cbd5f5"
        const position = buildPosition(node, index)

        return {
          id: node.id,
          label: node.data?.label ?? "Untitled",
          kind,
          meta: node.data?.meta,
          size,
          color,
          position,
        }
      })
  }, [data?.nodes])

  const edgePositions = useMemo(() => {
    if (!data?.edges || !displayNodes.length) return new Float32Array()
    const nodeMap = new Map(displayNodes.map((node) => [node.id, node]))
    const coords: number[] = []
    data.edges.forEach((edge) => {
      const source = nodeMap.get(edge.source)
      const target = nodeMap.get(edge.target)
      if (!source || !target) return
      coords.push(...source.position, ...target.position)
    })
    return new Float32Array(coords)
  }, [data?.edges, displayNodes])

  const infoPairs = selected ? describeMeta(selected.kind, selected.meta) : []

  return (
    <div className="relative flex h-full w-full">
      <Canvas camera={{ position: [0, 0, 45], fov: 55 }} className="h-full w-full">
        <color attach="background" args={["#020617"]} />
        <ambientLight intensity={0.5} />
        <pointLight position={[30, 30, 30]} intensity={0.8} />
        <pointLight position={[-25, -20, -15]} intensity={0.4} color="#38bdf8" />
        <OrbitControls enableDamping dampingFactor={0.1} />

        {edgePositions.length > 0 && (
          <lineSegments>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" count={edgePositions.length / 3} array={edgePositions} itemSize={3} />
            </bufferGeometry>
            <lineBasicMaterial color="#475569" transparent opacity={0.35} />
          </lineSegments>
        )}

        {displayNodes.map((node) => (
          <NodeSphere key={node.id} node={node} isSelected={selected?.id === node.id} onHover={setHovered} onSelect={setSelected} />
        ))}
      </Canvas>

      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Loading embeddings...
        </div>
      )}

      {error && !loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-red-400">{error}</div>
      )}

      <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2 text-xs text-white">
        {hovered && (
          <div className="pointer-events-none rounded border bg-zinc-900/80 px-3 py-2 text-xs text-white shadow-lg text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{hovered.kind}</p>
            <p className="text-sm font-medium">{hovered.label}</p>
          </div>
        )}
        {selected && (
          <div className="rounded border bg-background/95 px-3 py-2 text-xs text-white shadow-lg text-right">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-300">{selected.kind}</p>
                <h3 className="text-sm font-semibold leading-tight">{selected.label}</h3>
              </div>
              <button className="text-muted-foreground hover:text-foreground" onClick={() => setSelected(null)}>
                ×
              </button>
            </div>
            {selected.meta?.text && <p className="mt-1 text-sm text-muted-foreground">{selected.meta.text}</p>}
            <dl className="mt-2 space-y-1 text-left">
              {infoPairs.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                  <dd className="text-sm text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <div className="rounded border bg-zinc-900/80 px-3 py-2 shadow-lg text-right">
          <p className="text-[10px] uppercase tracking-wide text-slate-300">Legend</p>
          <div className="mt-1 space-y-1">
            {[
              ["Fact", kindColors.fact, "Size tracks confidence (orange)"],
              ["Episodic", kindColors.episodic, "Size tracks importance (teal)"],
              ["Procedural", kindColors.procedural, "Size tracks importance/confidence (purple)"],
            ].map(([label, color, desc]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: color as string }} />
                <span>
                  {label}: {desc}
                </span>
              </div>
            ))}
            <p className="text-[10px] text-slate-300/80">
              3D position follows embeddings (when available) or hash layout, so similar records end up closer.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
