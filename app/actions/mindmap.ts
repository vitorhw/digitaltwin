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

function addNode(
    id: string,
    type: string,
    label : string,
    nodes: Node[],
    position?: { x: number; y: number },
    categoryPositions?: {x: number; y: number},
    parentId?: string) {
    if(position && !parentId) {
        nodes.push({
            id: id,
            type: "mindmap",
            data: { label: label },
            position: position,
        })
    }
    else if(parentId && categoryPositions) {
        nodes.push({
            id: id,
            type: type,
            data: { label: label },
            position: categoryPositions || { x: 0, y: 0 },
            parentId: parentId,
        })
    } else if (position && !categoryPositions && parentId) {
        nodes.push({
            id: id,
            type: type,
            data: { label: label },
            position: position,
            parentId: parentId,
        })
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
    addNode(rootId, "mindmap", rootLabel, nodes, { x: 0, y: 0 }, undefined, undefined)

    const categoryPositions: Record<string, { x: number; y: number }> = {
      doc_chunks: { x: -300, y: -150 },
      episodic_memories: { x: -300, y: 150 },
      profile_facts: { x: 300, y: -150 },
      procedural_rules: { x: 300, y: 150 },
    }

    const createCategoryWithChildren = (
      categoryName: string,
      displayName: string,
      items: Array<Record<string, any>>,
      childLabel: (item: any) => string,
    ) => {
      const categoryId = `category-${categoryName}`

      addNode(categoryId, "mindmap", displayName, nodes, undefined, categoryPositions[categoryName], rootId)
      addEdge(`edge-${rootId}-${categoryId}`, rootId, categoryId, "mindmap", edges)

      items?.forEach((item, index) => {
        const childId = `${categoryName}-${item.id || nanoid()}`
        const angle = (index / Math.max(items.length, 1)) * Math.PI * 2
        const radius = 120

        addNode(childId, "mindmap", childLabel(item), nodes, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, }, undefined, categoryId)
        addEdge(`edge-${categoryId}-${childId}`, categoryId, childId, "mindmap", edges)
      })
    }

    if (docResponse.docChunks && docResponse.docChunks.length > 0) {
      createCategoryWithChildren(
        "doc_chunks",
        `Documents`,
        docResponse.docChunks,
        (item) => `${item.doc_title}: ${item.text}` || "Untitled",
      )
    }

    if (episodicResponse.episodicMemories && episodicResponse.episodicMemories.length > 0) {
      createCategoryWithChildren(
        "episodic_memories",
        `Episodic Memories`,
        episodicResponse.episodicMemories,
        (item) => item.text,
      )
    }

    if (profileResponse.profileFacts && profileResponse.profileFacts.length > 0) {
      const factsId = "category-profile_facts"

      addNode(factsId, "mindmap", `Profile Facts`, nodes, categoryPositions.profile_facts, undefined, rootId)
      addEdge(`edge-${rootId}-${factsId}`, rootId, factsId, "mindmap", edges)

      profileResponse.profileFacts.forEach((fact, index) => {
        const factId = `fact-${fact.id}`
        const angle = (index / Math.max(profileResponse.profileFacts.length, 1)) * Math.PI * 2
        const radius = 120

        if (fact.key !== "name") {
            addNode(
                factId, 
                "mindmap", 
                `${fact.key}: ${JSON.parse(JSON.stringify(fact.value)).text}`, 
                nodes, 
                { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius,}, 
                undefined, 
                factsId
            )
            addEdge(`edge-${factsId}-${factId}`, factsId, factId, "mindmap", edges)
        }
      })
    }

    if (proceduralResponse.proceduralRules && proceduralResponse.proceduralRules.length > 0) {
      createCategoryWithChildren(
        "procedural_rules",
        `Procedural Rules`,
        proceduralResponse.proceduralRules,
        (item) => `${item.rule_type.charAt(0).toUpperCase() + item.rule_type.slice(1)}: ${item.action}`,
      )
    }

    return { data: { nodes, edges } }

  } catch (error) {
    console.error("Error fetching mindmap data:", error)
    return { error: error instanceof Error ? error.message : "Failed to fetch mindmap data" }
  }
}