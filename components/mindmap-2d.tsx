"use client"

import { useEffect, useMemo, useState } from "react"
import type { Node as FlowNode, Edge as FlowEdge } from "@xyflow/react"

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
  position: [number, number]
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

const anchorVectors: Record<string, [number, number]> = {
  root: [0, 0],
  category: [0, 0],
  fact: [300, 0],
  episodic: [-300, 0],
  procedural: [0, 300],
  document: [0, -300],
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

function buildPosition(node: ApiNode, index: number): [number, number] {
  const kind = node.data?.kind ?? "category"
  const anchor = anchorVectors[kind] ?? [0, 0]
  const importance = deriveImportance(kind, node.data?.meta ?? undefined)
  const similarityVector = node.data?.meta?.vector as number[] | undefined

  if (similarityVector && similarityVector.length >= 2) {
    return [
      anchor[0] + similarityVector[0] * 200,
      anchor[1] + similarityVector[1] * 200,
    ]
  }

  const spread = 1.5 + (1 - importance)

  const h1 = hashToRange(node.id, 1 + index)
  const h2 = hashToRange(node.data?.label ?? "", 7 + index)

  return [
    anchor[0] + (h1 - 0.5) * 150 * spread,
    anchor[1] + (h2 - 0.5) * 150 * spread,
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

interface NodeCircleProps {
  node: VisualNode
  isSelected: boolean
  onHover: (node: VisualNode | null) => void
  onSelect: (node: VisualNode) => void
  offsetX: number
  offsetY: number
  scale: number
}

function NodeCircle({ node, isSelected, onHover, onSelect, offsetX, offsetY, scale }: NodeCircleProps) {
  const [hovered, setHovered] = useState(false)

  const x = node.position[0] * scale + offsetX
  const y = node.position[1] * scale + offsetY
  const radius = node.size * 20 * scale

  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill={node.color}
        stroke={hovered || isSelected ? node.color : "#475569"}
        strokeWidth={hovered || isSelected ? 3 : 1}
        opacity={hovered || isSelected ? 1 : 0.8}
        style={{ 
          cursor: "pointer",
          filter: hovered || isSelected ? `drop-shadow(0 0 8px ${node.color})` : "none",
          transition: "all 0.2s"
        }}
        onMouseEnter={() => {
          setHovered(true)
          onHover(node)
        }}
        onMouseLeave={() => {
          setHovered(false)
          onHover(null)
        }}
        onClick={() => onSelect(node)}
      />
      {(hovered || isSelected) && (
        <g>
          <rect
            x={x - 60}
            y={y - radius - 45}
            width="120"
            height="35"
            fill="#18181b"
            stroke="#3f3f46"
            strokeWidth="1"
            rx="4"
            opacity="0.95"
          />
          <text
            x={x}
            y={y - radius - 28}
            textAnchor="middle"
            fill="white"
            fontSize="11"
            fontWeight="600"
          >
            {node.label.length > 15 ? node.label.substring(0, 15) + "..." : node.label}
          </text>
          <text
            x={x}
            y={y - radius - 15}
            textAnchor="middle"
            fill="#a1a1aa"
            fontSize="9"
            style={{ textTransform: "uppercase" }}
          >
            {node.kind}
          </text>
        </g>
      )}
    </g>
  )
}

export function MindMap2D() {
  const [data, setData] = useState<MindmapResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hovered, setHovered] = useState<VisualNode | null>(null)
  const [selected, setSelected] = useState<VisualNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

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

  const edges = useMemo(() => {
    if (!data?.edges || !displayNodes.length) return []
    const nodeMap = new Map(displayNodes.map((node) => [node.id, node]))
    return data.edges
      .map((edge) => {
        const source = nodeMap.get(edge.source)
        const target = nodeMap.get(edge.target)
        if (!source || !target) return null
        return { source, target }
      })
      .filter((e) => e !== null) as Array<{ source: VisualNode; target: VisualNode }>
  }, [data?.edges, displayNodes])

  const infoPairs = selected ? describeMeta(selected.kind, selected.meta) : []

  const centerX = 400
  const centerY = 300

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale((s) => Math.min(Math.max(s * delta, 0.1), 3))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest("circle")) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  return (
    <div className="relative flex h-screen w-full bg-slate-950">
      <svg
        className="h-full w-full"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        <g>
          {edges.map((edge, i) => {
            if(edge) {
                const x1 = edge.source.position[0] * scale + centerX + pan.x
                const y1 = edge.source.position[1] * scale + centerY + pan.y
                const x2 = edge.target.position[0] * scale + centerX + pan.x
                const y2 = edge.target.position[1] * scale + centerY + pan.y
                return (
                    <line
                        key={i}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#475569"
                        strokeWidth="1"
                        opacity="0.35"
                    />
                )
            }
          })}

          {displayNodes.map((node) => (
            <NodeCircle
              key={node.id}
              node={node}
              isSelected={selected?.id === node.id}
              onHover={setHovered}
              onSelect={setSelected}
              offsetX={centerX + pan.x}
              offsetY={centerY + pan.y}
              scale={scale}
            />
          ))}
        </g>
      </svg>

      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-400">
          Loading embeddings...
        </div>
      )}

      {error && !loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2 text-xs text-white">
        {hovered && (
          <div className="pointer-events-none rounded border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs text-white shadow-lg text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{hovered.kind}</p>
            <p className="text-sm font-medium">{hovered.label}</p>
          </div>
        )}
        {selected && (
          <div className="rounded border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs text-white shadow-lg text-right max-w-xs">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-300">{selected.kind}</p>
                <h3 className="text-sm font-semibold leading-tight">{selected.label}</h3>
              </div>
              <button className="text-slate-400 hover:text-white" onClick={() => setSelected(null)}>
                ×
              </button>
            </div>
            {selected.meta?.text && <p className="mt-1 text-sm text-slate-300">{selected.meta.text}</p>}
            <dl className="mt-2 space-y-1 text-left">
              {infoPairs.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
                  <dd className="text-sm text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <div className="rounded border border-zinc-700 bg-zinc-900/95 px-3 py-2 shadow-lg text-right">
          <p className="text-[10px] uppercase tracking-wide text-slate-300">Legend</p>
          <div className="mt-1 space-y-1">
            {[
              ["Fact", kindColors.fact, "Size tracks confidence (orange)"],
              ["Episodic", kindColors.episodic, "Size tracks importance (teal)"],
              ["Procedural", kindColors.procedural, "Size tracks importance/confidence (purple)"],
            ].map(([label, color, desc]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: color as string }} />
                <span className="text-xs">
                  {label}: {desc}
                </span>
              </div>
            ))}
            <p className="text-[10px] text-slate-400 mt-2">
              Drag to pan • Scroll to zoom
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}