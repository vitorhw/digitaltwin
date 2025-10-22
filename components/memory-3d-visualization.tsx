"use client"

import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, Html, Environment } from "@react-three/drei"
import { useRef, useState, useMemo } from "react"
import * as THREE from "three"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface MemoryNode {
  id: string
  type: "fact" | "episodic" | "document"
  position: [number, number, number]
  data: any
  embedding?: number[]
  connections: string[]
}

interface Memory3DVisualizationProps {
  facts: any[]
  memories: any[]
  documents: any[]
  highlightedIds?: string[]
}

function MemoryNode({
  node,
  isHighlighted,
  onClick,
  onHover,
}: {
  node: MemoryNode
  isHighlighted: boolean
  onClick: () => void
  onHover: (hovered: boolean) => void
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  // Animate highlighted nodes with pulsing effect
  useFrame((state) => {
    if (meshRef.current && isHighlighted) {
      meshRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 3) * 0.2)
    } else if (meshRef.current && !hovered) {
      meshRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1)
    }
  })

  const size = node.type === "fact" ? 0.5 : node.type === "episodic" ? 0.3 : 0.2

  const color = useMemo(() => {
    if (node.type === "fact") {
      // Semantic memory: stable green/blue (cortical storage)
      return node.data.status === "confirmed" ? "#10b981" : "#f59e0b"
    } else if (node.type === "episodic") {
      // Episodic memory: color fades with time (hippocampal consolidation)
      const age = Date.now() - new Date(node.data.occurred_at || node.data.created_at).getTime()
      const daysSince = age / (1000 * 60 * 60 * 24)
      const brightness = Math.max(0.3, 1 - daysSince / 365)
      return new THREE.Color(0.3 * brightness, 0.6 * brightness, 1 * brightness)
    } else {
      // Document chunks: neutral grey (external knowledge)
      return "#6b7280"
    }
  }, [node])

  return (
    <mesh
      ref={meshRef}
      position={node.position}
      onClick={onClick}
      onPointerOver={() => {
        setHovered(true)
        onHover(true)
      }}
      onPointerOut={() => {
        setHovered(false)
        onHover(false)
      }}
    >
      <sphereGeometry args={[size, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={isHighlighted ? 1.5 : hovered ? 0.8 : 0.3}
        metalness={0.5}
        roughness={0.2}
      />
      {hovered && (
        <Html distanceFactor={10}>
          <div className="bg-popover text-popover-foreground px-3 py-2 rounded-md shadow-lg text-sm max-w-xs pointer-events-none">
            <div className="font-semibold mb-1">
              {node.type === "fact"
                ? node.data.key
                : node.type === "episodic"
                  ? "Memory"
                  : node.data.doc_title || "Document"}
            </div>
            <div className="text-xs opacity-80 line-clamp-2">
              {node.type === "fact"
                ? JSON.stringify(node.data.value)
                : node.type === "episodic"
                  ? node.data.text
                  : node.data.text}
            </div>
            <div className="text-xs opacity-60 mt-1">Confidence: {((node.data.confidence || 0) * 100).toFixed(0)}%</div>
          </div>
        </Html>
      )}
    </mesh>
  )
}

function ConnectionLines({ nodes, highlightedIds }: { nodes: MemoryNode[]; highlightedIds: string[] }) {
  const lines = useMemo(() => {
    const result: Array<{ start: [number, number, number]; end: [number, number, number]; highlighted: boolean }> = []

    nodes.forEach((node) => {
      node.connections.forEach((targetId) => {
        const target = nodes.find((n) => n.id === targetId)
        if (target) {
          const highlighted = highlightedIds.includes(node.id) || highlightedIds.includes(targetId)
          result.push({
            start: node.position,
            end: target.position,
            highlighted,
          })
        }
      })
    })

    return result
  }, [nodes, highlightedIds])

  return (
    <>
      {lines.map((line, i) => (
        <Line key={i} start={line.start} end={line.end} highlighted={line.highlighted} />
      ))}
    </>
  )
}

function Line({
  start,
  end,
  highlighted,
}: {
  start: [number, number, number]
  end: [number, number, number]
  highlighted: boolean
}) {
  const ref = useRef<THREE.Line>(null)

  useFrame((state) => {
    if (ref.current && highlighted) {
      const material = ref.current.material as THREE.LineBasicMaterial
      material.opacity = 0.3 + Math.sin(state.clock.elapsedTime * 2) * 0.2
    }
  })

  const points = useMemo(() => [new THREE.Vector3(...start), new THREE.Vector3(...end)], [start, end])

  return (
    <line ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={points.length}
          array={new Float32Array(points.flatMap((p) => [p.x, p.y, p.z]))}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color={highlighted ? "#3b82f6" : "#374151"} opacity={highlighted ? 0.5 : 0.1} transparent />
    </line>
  )
}

function Scene({
  nodes,
  highlightedIds,
  onNodeClick,
}: {
  nodes: MemoryNode[]
  highlightedIds: string[]
  onNodeClick: (node: MemoryNode) => void
}) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <Environment preset="night" />

      <ConnectionLines nodes={nodes} highlightedIds={highlightedIds} />

      {nodes.map((node) => (
        <MemoryNode
          key={node.id}
          node={node}
          isHighlighted={highlightedIds.includes(node.id)}
          onClick={() => onNodeClick(node)}
          onHover={(hovered) => setHoveredNode(hovered ? node.id : null)}
        />
      ))}

      <OrbitControls enableDamping dampingFactor={0.05} />
    </>
  )
}

// Calculate cosine similarity between two embeddings
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0)
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))
  return dotProduct / (magA * magB)
}

// Parse embedding from database (stored as string)
function parseEmbedding(embedding: any): number[] | undefined {
  if (!embedding) return undefined
  if (Array.isArray(embedding)) return embedding
  if (typeof embedding === "string") {
    try {
      return JSON.parse(embedding)
    } catch {
      return undefined
    }
  }
  return undefined
}

export function Memory3DVisualization({ facts, memories, documents, highlightedIds = [] }: Memory3DVisualizationProps) {
  const [selectedNode, setSelectedNode] = useState<MemoryNode | null>(null)

  const nodes = useMemo(() => {
    const result: MemoryNode[] = []

    // Facts (semantic memory) in cortical layer - outer stable ring
    // Mimics long-term storage in neocortex
    facts.forEach((fact, i) => {
      const angle = (i / facts.length) * Math.PI * 2
      const radius = 8 // Outer cortical layer
      const height = (Math.random() - 0.5) * 2 // Slight vertical spread
      result.push({
        id: fact.id,
        type: "fact",
        position: [Math.cos(angle) * radius, height, Math.sin(angle) * radius],
        data: fact,
        embedding: parseEmbedding(fact.embedding),
        connections: [],
      })
    })

    // Episodic memories in hippocampal region - central cluster
    // Mimics initial encoding in hippocampus before consolidation
    memories.forEach((memory, i) => {
      const angle = (i / memories.length) * Math.PI * 2

      // Recent memories closer to center (hippocampus), older ones migrate outward (consolidation)
      const age = Date.now() - new Date(memory.occurred_at || memory.created_at).getTime()
      const daysSince = age / (1000 * 60 * 60 * 24)
      const consolidationFactor = Math.min(daysSince / 365, 1) // 0 = new, 1 = fully consolidated
      const radius = 3 + consolidationFactor * 3 // 3-6 range (hippocampus → cortex)

      const height = (Math.random() - 0.5) * 4
      result.push({
        id: memory.id,
        type: "episodic",
        position: [Math.cos(angle) * radius, height, Math.sin(angle) * radius],
        data: memory,
        embedding: parseEmbedding(memory.embedding),
        connections: [],
      })
    })

    // Documents in peripheral layer - external knowledge
    // Mimics external sensory input not yet integrated
    documents.forEach((doc, i) => {
      const angle = (i / documents.length) * Math.PI * 2
      const radius = 11 // Outermost layer
      const height = (Math.random() - 0.5) * 3
      result.push({
        id: doc.id,
        type: "document",
        position: [Math.cos(angle) * radius, height, Math.sin(angle) * radius],
        data: doc,
        embedding: parseEmbedding(doc.embedding),
        connections: [],
      })
    })

    result.forEach((node) => {
      if (node.type === "episodic" && node.embedding) {
        // Episodic → Semantic connections (hippocampal-cortical binding)
        result
          .filter((n) => n.type === "fact" && n.embedding)
          .forEach((factNode) => {
            const similarity = cosineSimilarity(node.embedding!, factNode.embedding!)
            if (similarity > 0.65) {
              // Strong semantic association
              node.connections.push(factNode.id)
            }
          })

        // Temporal connections (sequential episodic binding)
        const sortedMemories = result
          .filter((n) => n.type === "episodic" && n.id !== node.id)
          .sort(
            (a, b) =>
              new Date(a.data.occurred_at || a.data.created_at).getTime() -
              new Date(b.data.occurred_at || b.data.created_at).getTime(),
          )
        const nodeIndex = sortedMemories.findIndex((n) => n.id === node.id)

        // Connect to temporally adjacent memories (within 7 days)
        const nodeTime = new Date(node.data.occurred_at || node.data.created_at).getTime()
        sortedMemories.forEach((mem) => {
          const memTime = new Date(mem.data.occurred_at || mem.data.created_at).getTime()
          const daysDiff = Math.abs(nodeTime - memTime) / (1000 * 60 * 60 * 24)
          if (daysDiff < 7 && mem.id !== node.id) {
            node.connections.push(mem.id)
          }
        })
      } else if (node.type === "document" && node.embedding) {
        // Documents connect to semantically similar facts (external knowledge integration)
        result
          .filter((n) => n.type === "fact" && n.embedding)
          .forEach((factNode) => {
            const similarity = cosineSimilarity(node.embedding!, factNode.embedding!)
            if (similarity > 0.7) {
              node.connections.push(factNode.id)
            }
          })
      } else if (node.type === "fact" && node.embedding) {
        // Facts connect to other related facts (semantic network)
        result
          .filter((n) => n.type === "fact" && n.id !== node.id && n.embedding)
          .forEach((factNode) => {
            const similarity = cosineSimilarity(node.embedding!, factNode.embedding!)
            if (similarity > 0.75) {
              // High semantic similarity
              node.connections.push(factNode.id)
            }
          })
      }
    })

    return result
  }, [facts, memories, documents])

  return (
    <div className="relative w-full h-full">
      <Canvas camera={{ position: [0, 8, 20], fov: 60 }}>
        <Scene nodes={nodes} highlightedIds={highlightedIds} onNodeClick={setSelectedNode} />
      </Canvas>

      {/* Detail panel */}
      {selectedNode && (
        <Card className="absolute top-4 right-4 w-80 max-h-[80vh] shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {selectedNode.type === "fact"
                ? selectedNode.data.key
                : selectedNode.type === "episodic"
                  ? "Episodic Memory"
                  : selectedNode.data.doc_title || "Document"}
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedNode(null)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Type</div>
                  <Badge variant="outline">{selectedNode.type}</Badge>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Content</div>
                  <div className="text-sm">
                    {selectedNode.type === "fact"
                      ? JSON.stringify(selectedNode.data.value)
                      : selectedNode.type === "episodic"
                        ? selectedNode.data.text
                        : selectedNode.data.text}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Confidence</div>
                  <div className="text-sm">{((selectedNode.data.confidence || 0) * 100).toFixed(0)}%</div>
                </div>

                {selectedNode.type === "fact" && (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Status</div>
                      <Badge variant={selectedNode.data.status === "confirmed" ? "default" : "secondary"}>
                        {selectedNode.data.status}
                      </Badge>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Sensitivity</div>
                      <Badge variant="outline">{selectedNode.data.sensitivity}</Badge>
                    </div>
                  </>
                )}

                {selectedNode.type === "episodic" && (
                  <>
                    {selectedNode.data.location && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Location</div>
                        <div className="text-sm">{selectedNode.data.location}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Occurred</div>
                      <div className="text-sm">
                        {new Date(selectedNode.data.occurred_at || selectedNode.data.created_at).toLocaleString()}
                      </div>
                    </div>
                  </>
                )}

                {selectedNode.type === "document" && (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Document URI</div>
                      <div className="text-sm break-all">{selectedNode.data.doc_uri}</div>
                    </div>
                    {selectedNode.data.section_path && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Section</div>
                        <div className="text-sm">{selectedNode.data.section_path}</div>
                      </div>
                    )}
                    {selectedNode.data.page_number && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Page</div>
                        <div className="text-sm">{selectedNode.data.page_number}</div>
                      </div>
                    )}
                  </>
                )}

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Connections</div>
                  <div className="text-sm">{selectedNode.connections.length} connected nodes</div>
                </div>

                {selectedNode.embedding && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Embedding Preview</div>
                    <div className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto">
                      [
                      {selectedNode.embedding
                        .slice(0, 5)
                        .map((v) => v.toFixed(3))
                        .join(", ")}
                      ...]
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Created</div>
                  <div className="text-sm">{new Date(selectedNode.data.created_at).toLocaleString()}</div>
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
