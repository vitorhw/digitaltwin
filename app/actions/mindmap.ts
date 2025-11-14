"use server"

import { createClient } from "@/lib/supabase/server"
import { Node, Edge } from "@xyflow/react"
import { nanoid } from "nanoid"

export interface MindmapData {
  nodes: Node[]
  edges: Edge[]
}

async function fetchProceduralRules() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
        return { error: "Unauthorized" }
    }
    try {
        const { data, error } = await supabase
            .from("procedural_rules")
            .select("id, action, rule_type")
            .eq("user_id", user.id)
        if (error) {
            return { error: error.message }
        }
        return {proceduralRules: data, rulesError: error}
    }catch (error) {
        console.error("Error in fetchProceduralRules:", error)
        return { error: error instanceof Error ? error.message : "Failed to fetch procedural rules" }
    }
}

async function fetchEpisodicMemories() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
        return { error: "Unauthorized" }
    }
    try {
        const { data, error } = await supabase
            .from("episodic_memories")
            .select("id, text, occurred_at")
            .eq("user_id", user.id)
        if (error) {
            return { error: error.message }
        }
        return {episodicMemories: data, episodicError: error}
    }catch (error) {
        console.error("Error in fetchEpisodicMemories:", error)
        return { error: error instanceof Error ? error.message : "Failed to fetch episodic memories" }
    }
}

async function fetchProfileFacts() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
        return { error: "Unauthorized" }
    }
    try {
        const { data, error } = await supabase
            .from("profile_facts")
            .select("id, key, value")
            .eq("user_id", user.id)
        if (error) {
            return { error: error.message }
        }
        return {profileFacts: data, factsError: error}
    }catch (error) {
        console.error("Error in fetchProfileFacts:", error)
        return { error: error instanceof Error ? error.message : "Failed to fetch profile facts" }
    }
}

async function fetchDocChunks() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
        return { error: "Unauthorized" }
    }
    try {
        const { data, error } = await supabase
            .from("doc_chunks")
            .select("id, doc_title, text")
            .eq("user_id", user.id)
        if (error) {
            return { error: error.message }
        }
        return {docChunks: data, docError: error}
    }catch (error) {
        console.error("Error in fetchDocChunks:", error)
        return { error: error instanceof Error ? error.message : "Failed to fetch doc chunks" }
    }
}

function addEdge(
    id: string,
    source: string,
    target: string,
    type: string,
    edges: Edge[]) {
    edges.push({
        id: id,
        source: source,
        target: target,
        type: type,
    })
}

type NodeKind = "root" | "category" | "fact" | "episodic" | "procedural" | "document"

interface AddNodeOptions {
  id: string
  label: string
  nodes: Node[]
  position?: { x: number; y: number }
  anchor?: { x: number; y: number }
  parentId?: string
  kind: NodeKind
  meta?: Record<string, any>
}

function addMindmapNode({ id, label, nodes, position, anchor, parentId, kind, meta }: AddNodeOptions) {
  const finalPosition = position ?? anchor ?? { x: 0, y: 0 }
  nodes.push({
    id,
    type: "mindmap",
    position: finalPosition,
    parentNode: parentId,
    data: {
      label,
      kind,
      meta,
    },
  })
}

export async function fetchMindMapData(): Promise<{ data?: MindmapData; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    const episodicResponse = await fetchEpisodicMemories()
    const profileResponse = await fetchProfileFacts()
    const proceduralResponse = await fetchProceduralRules()
    const docResponse = await fetchDocChunks()

    if (docResponse.docError || episodicResponse.episodicError || profileResponse.factsError || proceduralResponse.rulesError) {
      const errorMsg =
        docResponse.docError! ||
        episodicResponse.episodicError! ||
        profileResponse.factsError! ||
        proceduralResponse.rulesError!
      return { error: errorMsg }
    }

    const nodes: Node[] = []
    const edges: Edge[] = []

    let rootLabel = "User"
    if (Array.isArray(profileResponse.profileFacts) && profileResponse.profileFacts.length > 0) {
      const nameFact = (profileResponse.profileFacts as any[]).find((f) => f?.key === "name")
      if (nameFact) {
        const nameValue = JSON.parse(JSON.stringify(nameFact.value)).text
        if (typeof nameValue === "string" && nameValue.trim().length > 0) {
          rootLabel = nameValue.trim()
        }
      }
    }

    const rootId = "root"
    addMindmapNode({ id: rootId, label: rootLabel, nodes, position: { x: 0, y: 0 }, kind: "root" })

    const categoryPositions: Record<string, { x: number; y: number }> = {
      doc_chunks: { x: -300, y: -150 },
      episodic_memories: { x: -300, y: 150 },
      profile_facts: { x: 300, y: -150 },
      procedural_rules: { x: 300, y: 150 },
    }

    const emitNodes = (
      categoryName: keyof typeof categoryPositions,
      items: Array<Record<string, any>>,
      kind: NodeKind,
      getPayload: (item: any) => { label: string; meta?: Record<string, any> },
    ) => {
      items?.forEach((item, index) => {
        const childId = `${categoryName}-${item.id || nanoid()}`
        const angle = (index / Math.max(items.length, 1)) * Math.PI * 2
        const radius = 200
        const { label, meta } = getPayload(item)

        addMindmapNode({
          id: childId,
          label,
          nodes,
          position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
          parentId: rootId,
          kind,
          meta,
        })
        addEdge(`edge-${rootId}-${childId}`, rootId, childId, "mindmap", edges)
      })
    }

    if (docResponse.docChunks && docResponse.docChunks.length > 0) {
      // documents are currently excluded from the 3D map at user request
    }

    if (episodicResponse.episodicMemories && episodicResponse.episodicMemories.length > 0) {
      emitNodes(
        "episodic_memories",
        episodicResponse.episodicMemories,
        "episodic",
        (item) => ({
          label: item.text.slice(0, 32),
          meta: {
            text: item.text,
            occurred_at: item.occurred_at,
            location: item.location,
            importance: item.importance,
            confidence: item.confidence,
            emotional_valence: item.emotional_valence,
          },
        }),
      )
    }

    if (profileResponse.profileFacts && profileResponse.profileFacts.length > 0) {
      const filteredFacts = profileResponse.profileFacts.filter((fact) => fact.key !== "name")
      if (filteredFacts.length > 0) {
        emitNodes(
          "profile_facts",
          filteredFacts,
          "fact",
          (fact) => ({
            label: fact.key,
            meta: {
              value: typeof fact.value === "object" ? fact.value : { text: String(fact.value) },
              confidence: fact.confidence,
              sensitivity: fact.sensitivity,
              fact_date: fact.fact_date,
            },
          }),
        )
      }
    }

    if (proceduralResponse.proceduralRules && proceduralResponse.proceduralRules.length > 0) {
      emitNodes(
        "procedural_rules",
        proceduralResponse.proceduralRules,
        "procedural",
        (item) => ({
          label: item.action,
          meta: {
            action: item.action,
            rule_type: item.rule_type,
            condition: item.condition,
            importance: item.importance,
            confidence: item.confidence,
            times_observed: item.times_observed,
          },
        }),
      )
    }

    return { data: { nodes, edges } }

  } catch (error) {
    console.error("Error fetching mindmap data:", error)
    return { error: error instanceof Error ? error.message : "Failed to fetch mindmap data" }
  }
}
