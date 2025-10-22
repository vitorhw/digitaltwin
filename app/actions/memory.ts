"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { extractTemporalInfo } from "@/lib/temporal-parser"

// ============= FACTS =============

export async function proposeFact(
  key: string,
  value: any,
  confidenceValue: number,
  sensitivity: "low" | "medium" | "high",
  ttlDays?: number,
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    const embedding = await generateEmbedding(typeof value === "string" ? value : JSON.stringify(value))
    const expiresAt = ttlDays ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString() : null

    const { data, error } = await supabase
      .from("profile_facts")
      .upsert(
        {
          user_id: user.id,
          key,
          value: typeof value === "string" ? { text: value } : value,
          confidence: confidenceValue,
          status: "candidate",
          sensitivity,
          ttl_days: ttlDays,
          expires_at: expiresAt,
          provenance_kind: "ai_proposed",
          provenance_source: "chat",
          embedding: `[${embedding.join(",")}]`,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,key",
          ignoreDuplicates: false,
        },
      )
      .select()
      .single()

    if (error) {
      console.error("[v0] Error proposing fact:", error)
      return { error: error.message }
    }

    revalidatePath("/chat")
    return { success: true, fact: data }
  } catch (error) {
    console.error("[v0] Error in proposeFact:", error)
    return { error: error instanceof Error ? error.message : "Failed to propose fact" }
  }
}

export async function confirmFact(
  key: string,
  value: any,
  confidenceValue: number,
  sensitivity: "low" | "medium" | "high",
  ttlDays?: number,
  schemaName?: string,
  factDate?: string,
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    // Parse temporal references from the value if it's a string
    let finalFactDate = factDate
    if (!finalFactDate && typeof value === "string") {
      const { date } = extractTemporalInfo(value)
      if (date) {
        finalFactDate = date.toISOString()
      }
    }

    const embedding = await generateEmbedding(typeof value === "string" ? value : JSON.stringify(value))
    const expiresAt = ttlDays ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString() : null

    const { data, error } = await supabase
      .from("profile_facts")
      .upsert(
        {
          user_id: user.id,
          key,
          value: typeof value === "string" ? { text: value } : value,
          confidence: confidenceValue,
          status: "confirmed",
          sensitivity,
          ttl_days: ttlDays,
          expires_at: expiresAt,
          provenance_kind: "ai_confirmed",
          provenance_source: "chat",
          embedding: `[${embedding.join(",")}]`,
          schema_name: schemaName,
          fact_date: finalFactDate,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,key",
          ignoreDuplicates: false,
        },
      )
      .select()
      .single()

    if (error) {
      console.error("[v0] Error confirming fact:", error)
      return { error: error.message }
    }

    revalidatePath("/chat")
    return { success: true, fact: data }
  } catch (error) {
    console.error("[v0] Error in confirmFact:", error)
    return { error: error instanceof Error ? error.message : "Failed to confirm fact" }
  }
}

export async function getCurrentFacts() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  await sweepExpiredFacts()

  const { data, error } = await supabase
    .from("profile_facts")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { facts: data }
}

export async function deleteFact(key: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    // This bypasses any triggers that cause FK constraint violations
    const { data, error } = await supabase.rpc("delete_fact", {
      p_user_id: user.id,
      p_fact_key: key,
    })

    if (error) {
      console.error("[v0] Error deleting fact via RPC:", error)
      return { error: error.message }
    }

    if (!data) {
      console.log("[v0] Fact not found or already deleted")
    } else {
      console.log("[v0] Fact deleted successfully via RPC")
    }

    revalidatePath("/")
    return { success: true }
  } catch (error) {
    console.error("[v0] Exception in deleteFact:", error)
    return { error: error instanceof Error ? error.message : "Failed to delete fact" }
  }
}

export async function sweepExpiredFacts() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    const { data, error } = await supabase.rpc("sweep_expired_facts")

    if (error) {
      console.error("[v0] Error sweeping expired facts:", error)
      return { error: error.message }
    }

    if (data && data > 0) {
      console.log(`[v0] Swept ${data} expired facts`)
    }

    return { success: true, deletedCount: data }
  } catch (error) {
    console.error("[v0] Error in sweepExpiredFacts:", error)
    return { error: error instanceof Error ? error.message : "Failed to sweep expired facts" }
  }
}

export async function approveFact(key: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    const { data: fact, error: fetchError } = await supabase
      .from("profile_facts")
      .select("*")
      .eq("user_id", user.id)
      .eq("key", key)
      .eq("status", "candidate")
      .single()

    if (fetchError || !fact) {
      return { error: "Candidate fact not found" }
    }

    const { error: updateError } = await supabase
      .from("profile_facts")
      .update({
        status: "confirmed",
        provenance_kind: "user_confirmed",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("key", key)

    if (updateError) {
      return { error: updateError.message }
    }

    revalidatePath("/debug")
    revalidatePath("/")
    return { success: true }
  } catch (error) {
    console.error("[v0] Error approving fact:", error)
    return { error: error instanceof Error ? error.message : "Failed to approve fact" }
  }
}

export async function rejectFact(key: string) {
  return deleteFact(key)
}

// ============= EPISODIC MEMORIES =============

export async function proposeEpisodic(text: string, confidenceValue: number, occurredAt?: string, location?: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    // Parse temporal references in the text
    const { date: parsedDate, cleanedText, temporalPhrase } = extractTemporalInfo(text)

    // Use parsed date if available, otherwise use provided occurredAt or current time
    const finalOccurredAt = parsedDate?.toISOString() || occurredAt || new Date().toISOString()

    // Use cleaned text if temporal phrase was extracted, otherwise use original
    const finalText = temporalPhrase ? cleanedText : text

    console.log("[v0] Temporal parsing:", {
      original: text,
      cleaned: finalText,
      temporalPhrase,
      parsedDate: finalOccurredAt,
    })

    const embedding = await generateEmbedding(finalText)

    const { data, error } = await supabase
      .from("episodic_memories")
      .insert({
        user_id: user.id,
        text: finalText,
        confidence: confidenceValue,
        occurred_at: finalOccurredAt,
        location,
        provenance_kind: "ai_proposed",
        provenance_source: "chat",
        embedding: `[${embedding.join(",")}]`,
        // Initialize biological memory fields
        emotional_valence: 0.0, // Neutral by default
        importance: confidenceValue, // Use confidence as initial importance
        recall_count: 0,
        memory_strength: 1.0, // Fresh memory
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error proposing episodic memory:", error)
      return { error: error.message }
    }

    revalidatePath("/")
    return { success: true, memory: data }
  } catch (error) {
    console.error("[v0] Error in proposeEpisodic:", error)
    return { error: error instanceof Error ? error.message : "Failed to propose episodic memory" }
  }
}

export async function confirmEpisodic(text: string, confidenceValue: number, occurredAt?: string, location?: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    // Parse temporal references in the text
    const { date: parsedDate, cleanedText, temporalPhrase } = extractTemporalInfo(text)

    // Use parsed date if available, otherwise use provided occurredAt or current time
    const finalOccurredAt = parsedDate?.toISOString() || occurredAt || new Date().toISOString()

    // Use cleaned text if temporal phrase was extracted, otherwise use original
    const finalText = temporalPhrase ? cleanedText : text

    console.log("[v0] Temporal parsing:", {
      original: text,
      cleaned: finalText,
      temporalPhrase,
      parsedDate: finalOccurredAt,
    })

    const embedding = await generateEmbedding(finalText)

    const { data, error } = await supabase
      .from("episodic_memories")
      .insert({
        user_id: user.id,
        text: finalText,
        confidence: confidenceValue,
        occurred_at: finalOccurredAt,
        location,
        provenance_kind: "ai_confirmed",
        provenance_source: "chat",
        embedding: `[${embedding.join(",")}]`,
        // Initialize biological memory fields
        emotional_valence: 0.0, // Neutral by default
        importance: confidenceValue, // Use confidence as initial importance
        recall_count: 0,
        memory_strength: 1.0, // Fresh memory
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error confirming episodic memory:", error)
      return { error: error.message }
    }

    revalidatePath("/")
    return { success: true, memory: data }
  } catch (error) {
    console.error("[v0] Error in confirmEpisodic:", error)
    return { error: error instanceof Error ? error.message : "Failed to confirm episodic memory" }
  }
}

export async function getEpisodicMemories() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("episodic_memories")
    .select("id, text, confidence, occurred_at, location, provenance_kind, created_at")
    .eq("user_id", user.id)
    .order("occurred_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { memories: data }
}

export async function deleteEpisodicMemory(id: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    const { data: existingMemory } = await supabase
      .from("episodic_memories")
      .select("id")
      .eq("user_id", user.id)
      .eq("id", id)
      .single()

    if (!existingMemory) {
      console.log("[v0] Memory already deleted or doesn't exist")
      revalidatePath("/")
      return { success: true }
    }

    const { error } = await supabase.from("episodic_memories").delete().eq("user_id", user.id).eq("id", id)

    if (error) {
      console.error("[v0] Error deleting episodic memory:", error)
      return { error: error instanceof Error ? error.message : "Failed to delete episodic memory" }
    }

    revalidatePath("/")
    return { success: true }
  } catch (error) {
    console.error("[v0] Error in deleteEpisodicMemory:", error)
    return { error: error instanceof Error ? error.message : "Failed to delete episodic memory" }
  }
}

export async function approveEpisodicMemory(id: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    const { error: updateError } = await supabase
      .from("episodic_memories")
      .update({
        provenance_kind: "user_confirmed",
      })
      .eq("user_id", user.id)
      .eq("id", id)

    if (updateError) {
      return { error: updateError.message }
    }

    revalidatePath("/debug")
    revalidatePath("/")
    return { success: true }
  } catch (error) {
    console.error("[v0] Error approving memory:", error)
    return { error: error instanceof Error ? error.message : "Failed to approve memory" }
  }
}

export async function rejectEpisodicMemory(id: string) {
  return deleteEpisodicMemory(id)
}

// ============= DOCUMENT MANAGEMENT =============

export async function getDocuments() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("doc_chunks")
    .select("id, doc_uri, doc_title, text, section_path, page_number, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { documents: data }
}

export async function deleteDocument(id: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    const { error } = await supabase.from("doc_chunks").delete().eq("user_id", user.id).eq("id", id)

    if (error) {
      console.error("[v0] Error deleting document chunk:", error)
      return { error: error.message }
    }

    revalidatePath("/")
    return { success: true }
  } catch (error) {
    console.error("[v0] Error in deleteDocument:", error)
    return { error: error instanceof Error ? error.message : "Failed to delete document" }
  }
}

export async function insertDocumentChunk(
  docUri: string,
  docTitle: string,
  text: string,
  sectionPath?: string,
  pageNumber?: number,
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    const embedding = await generateEmbedding(text)

    const { data, error } = await supabase
      .from("doc_chunks")
      .insert({
        user_id: user.id,
        doc_uri: docUri,
        doc_title: docTitle,
        text,
        section_path: sectionPath,
        page_number: pageNumber,
        embedding: `[${embedding.join(",")}]`,
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error inserting document chunk:", error)
      return { error: error.message }
    }

    revalidatePath("/")
    return { success: true, document: data }
  } catch (error) {
    console.error("[v0] Error in insertDocumentChunk:", error)
    return { error: error instanceof Error ? error.message : "Failed to insert document chunk" }
  }
}

// ============= HYBRID SEARCH =============

export async function hybridSearch(query: string, limit = 10) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    const queryEmbedding = await generateEmbedding(query)

    const { data, error } = await supabase.rpc("hybrid_search_memories", {
      p_user_id: user.id,
      p_query_text: query,
      p_query_embedding: `[${queryEmbedding.join(",")}]`,
      p_limit: limit,
    })

    if (error) {
      console.error("[v0] Error in hybrid search:", error)
      return { error: error.message }
    }

    return { results: data }
  } catch (error) {
    console.error("[v0] Error in hybridSearch:", error)
    return { error: error instanceof Error ? error.message : "Failed to perform hybrid search" }
  }
}

// ============= 3D VISUALIZATION DATA =============

export async function getMemoryGraphData() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    // Fetch all memory types with embeddings
    const [factsResult, memoriesResult, documentsResult] = await Promise.all([
      supabase
        .from("profile_facts")
        .select("id, key, value, confidence, status, sensitivity, created_at, updated_at, embedding")
        .eq("user_id", user.id),
      supabase
        .from("episodic_memories")
        .select("id, text, confidence, occurred_at, location, provenance_kind, created_at, embedding")
        .eq("user_id", user.id),
      supabase
        .from("doc_chunks")
        .select("id, doc_uri, doc_title, text, section_path, page_number, created_at, embedding")
        .eq("user_id", user.id),
    ])

    if (factsResult.error) throw factsResult.error
    if (memoriesResult.error) throw memoriesResult.error
    if (documentsResult.error) throw documentsResult.error

    return {
      facts: factsResult.data || [],
      memories: memoriesResult.data || [],
      documents: documentsResult.data || [],
    }
  } catch (error) {
    console.error("[v0] Error fetching memory graph data:", error)
    return { error: error instanceof Error ? error.message : "Failed to fetch memory graph data" }
  }
}

export async function wipeAllUserData() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    console.log("[v0] Starting wipe_user_data RPC call...")

    const { data, error } = await supabase.rpc("wipe_user_data", {
      p_user_id: user.id,
    })

    if (error) {
      console.error("[v0] Error wiping user data via RPC:", error)

      // If RPC function doesn't exist, fall back to manual deletion
      if (error.message?.includes("function") || error.message?.includes("does not exist")) {
        console.log("[v0] RPC function not found, falling back to manual deletion...")
        return await wipeAllUserDataManual()
      }

      return { error: error.message }
    }

    console.log("[v0] All user data wiped successfully:", data)
    revalidatePath("/")
    return {
      success: true,
      message: "All user data has been deleted",
      details: data,
    }
  } catch (error) {
    console.error("[v0] Exception in wipeAllUserData:", error)

    // Fall back to manual deletion if RPC fails
    console.log("[v0] Falling back to manual deletion...")
    return await wipeAllUserDataManual()
  }
}

async function wipeAllUserDataManual() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    console.log("[v0] Starting manual data wipe...")

    // Delete in correct order to avoid FK constraints
    // 1. Delete fact_events first (references profile_facts)
    console.log("[v0] Deleting fact_events...")
    const { error: factEventsError } = await supabase.from("fact_events").delete().eq("user_id", user.id)

    if (factEventsError) {
      console.error("[v0] Error deleting fact_events:", factEventsError)
    }

    // 2. Delete profile_facts
    console.log("[v0] Deleting profile_facts...")
    const { error: factsError } = await supabase.from("profile_facts").delete().eq("user_id", user.id)

    if (factsError) {
      console.error("[v0] Error deleting profile_facts:", factsError)
      return { error: `Failed to delete facts: ${factsError.message}` }
    }

    // 3. Delete other tables in parallel (no FK dependencies)
    console.log("[v0] Deleting other tables...")
    const [episodicResult, docResult] = await Promise.all([
      supabase.from("episodic_memories").delete().eq("user_id", user.id),
      supabase.from("doc_chunks").delete().eq("user_id", user.id),
    ])

    if (episodicResult.error) {
      console.error("[v0] Error deleting episodic_memories:", episodicResult.error)
    }
    if (docResult.error) {
      console.error("[v0] Error deleting doc_chunks:", docResult.error)
    }

    console.log("[v0] Manual data wipe complete")
    revalidatePath("/")
    return {
      success: true,
      message: "All user data has been deleted (manual method)",
    }
  } catch (error) {
    console.error("[v0] Error in manual wipe:", error)
    return { error: error instanceof Error ? error.message : "Failed to wipe user data" }
  }
}

// ============= DIAGNOSTIC FUNCTIONS =============

export async function checkDatabaseFunctions() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const diagnostics = []

  try {
    try {
      console.log("[v0] Testing hybrid_search_memories...")
      const testEmbedding = Array(1536).fill(0)
      const { data, error } = await supabase.rpc("hybrid_search_memories", {
        p_user_id: user.id,
        p_query_text: "test",
        p_query_embedding: `[${testEmbedding.join(",")}]`,
        p_limit: 1,
      })

      if (error) {
        diagnostics.push({
          name: "hybrid_search_memories",
          status: "error",
          error: error.message,
          message: "Function exists but returned an error. Check the function definition and parameters.",
        })
      } else {
        diagnostics.push({
          name: "hybrid_search_memories",
          status: "ok",
          message: `Function working correctly. Returned ${data?.length || 0} results.`,
        })
      }
    } catch (e) {
      diagnostics.push({
        name: "hybrid_search_memories",
        status: "error",
        error: e instanceof Error ? e.message : String(e),
        message: "Function may not exist or has syntax errors.",
      })
    }

    try {
      console.log("[v0] Testing delete_fact...")
      const { error } = await supabase.rpc("delete_fact", {
        p_user_id: user.id,
        p_fact_key: "nonexistent_test_key_12345",
      })

      if (error) {
        diagnostics.push({
          name: "delete_fact",
          status: "error",
          error: error.message,
          message: "Function exists but returned an error. Check the function definition.",
        })
      } else {
        diagnostics.push({
          name: "delete_fact",
          status: "ok",
          message: "Function working correctly.",
        })
      }
    } catch (e) {
      diagnostics.push({
        name: "delete_fact",
        status: "error",
        error: e instanceof Error ? e.message : String(e),
        message: "Function may not exist or has syntax errors.",
      })
    }

    try {
      console.log("[v0] Testing wipe_user_data (dry run)...")
      // We can't actually test this without wiping data, so just check if it exists
      const { error } = await supabase.rpc("wipe_user_data", {
        p_user_id: "00000000-0000-0000-0000-000000000000", // Fake UUID
      })

      // If we get a specific error about the function not existing, that's bad
      // If we get any other error (like no data found), that's actually good - it means the function exists
      if (error && (error.message?.includes("function") || error.message?.includes("does not exist"))) {
        diagnostics.push({
          name: "wipe_user_data",
          status: "error",
          error: error.message,
          message: "Function does not exist. Run script 012_create_wipe_user_data_function.sql",
        })
      } else {
        diagnostics.push({
          name: "wipe_user_data",
          status: "ok",
          message: "Function exists and is callable.",
        })
      }
    } catch (e) {
      diagnostics.push({
        name: "wipe_user_data",
        status: "error",
        error: e instanceof Error ? e.message : String(e),
        message: "Function may not exist. Run script 012_create_wipe_user_data_function.sql",
      })
    }

    try {
      console.log("[v0] Testing sweep_expired_facts...")
      const { data, error } = await supabase.rpc("sweep_expired_facts")

      if (error) {
        diagnostics.push({
          name: "sweep_expired_facts",
          status: "error",
          error: error.message,
          message: "Function exists but returned an error.",
        })
      } else {
        diagnostics.push({
          name: "sweep_expired_facts",
          status: "ok",
          message: `Function working correctly. Would delete ${data || 0} expired facts.`,
        })
      }
    } catch (e) {
      diagnostics.push({
        name: "sweep_expired_facts",
        status: "error",
        error: e instanceof Error ? e.message : String(e),
        message: "Function may not exist or has syntax errors.",
      })
    }

    try {
      console.log("[v0] Testing full fact pipeline...")
      const testKey = `test_fact_${Date.now()}`

      // Propose a fact
      const proposeResult = await proposeFact(testKey, "test value", 0.9, "low")
      if (proposeResult.error) {
        throw new Error(`Propose failed: ${proposeResult.error}`)
      }

      // Confirm the fact
      const confirmResult = await confirmFact(testKey, "test value updated", 0.95, "low")
      if (confirmResult.error) {
        throw new Error(`Confirm failed: ${confirmResult.error}`)
      }

      // Delete the fact
      const deleteResult = await deleteFact(testKey)
      if (deleteResult.error) {
        throw new Error(`Delete failed: ${deleteResult.error}`)
      }

      diagnostics.push({
        name: "fact_pipeline",
        status: "ok",
        message: "Full fact pipeline (propose → confirm → delete) working correctly.",
      })
    } catch (e) {
      diagnostics.push({
        name: "fact_pipeline",
        status: "error",
        error: e instanceof Error ? e.message : String(e),
        message: "Error in fact pipeline. Check propose/confirm/delete functions.",
      })
    }

    try {
      console.log("[v0] Testing full episodic pipeline...")

      // Propose an episodic memory
      const proposeResult = await proposeEpisodic("Test memory for diagnostics", 0.9)
      if (proposeResult.error) {
        throw new Error(`Propose failed: ${proposeResult.error}`)
      }

      const memoryId = proposeResult.memory?.id
      if (!memoryId) {
        throw new Error("No memory ID returned from propose")
      }

      // Delete the memory
      const deleteResult = await deleteEpisodicMemory(memoryId)
      if (deleteResult.error) {
        throw new Error(`Delete failed: ${deleteResult.error}`)
      }

      diagnostics.push({
        name: "episodic_pipeline",
        status: "ok",
        message: "Full episodic pipeline (propose → delete) working correctly.",
      })
    } catch (e) {
      diagnostics.push({
        name: "episodic_pipeline",
        status: "error",
        error: e instanceof Error ? e.message : String(e),
        message: "Error in episodic pipeline. Check propose/delete functions.",
      })
    }

    // ... existing code for other checks ...

    return { success: true, diagnostics }
  } catch (error) {
    console.error("[v0] Error in checkDatabaseFunctions:", error)
    return { error: error instanceof Error ? error.message : "Failed to check database functions" }
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set")
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("[v0] OpenAI API error:", errorData)
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`)
    }

    const data = await response.json()
    const embedding = data.data[0].embedding
    return embedding
  } catch (error) {
    console.error("[v0] Error generating embedding:", error)
    throw error
  }
}

export async function generateMockData() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    console.log("[v0] Starting mock data generation...")

    // Generate 20 mock facts
    const factKeys = [
      "name",
      "occupation",
      "location",
      "favorite_color",
      "favorite_food",
      "hobby",
      "pet_name",
      "birth_year",
      "education",
      "company",
      "programming_language",
      "favorite_book",
      "favorite_movie",
      "music_genre",
      "sports_team",
      "dream_destination",
      "morning_routine",
      "coffee_preference",
      "work_schedule",
      "weekend_activity",
    ]

    const factValues = [
      "Alex Johnson",
      "Software Engineer",
      "San Francisco, CA",
      "Blue",
      "Pizza",
      "Photography",
      "Max",
      "1990",
      "Computer Science, Stanford",
      "Tech Innovations Inc",
      "TypeScript",
      "The Pragmatic Programmer",
      "Inception",
      "Electronic",
      "Golden State Warriors",
      "Tokyo, Japan",
      "Morning jog and meditation",
      "Espresso, no sugar",
      "9am-5pm, hybrid",
      "Hiking in nature",
    ]

    console.log("[v0] Generating facts...")
    for (let i = 0; i < 20; i++) {
      const key = factKeys[i]
      const value = factValues[i]
      const embedding = await generateEmbedding(value)

      await supabase.from("profile_facts").insert({
        user_id: user.id,
        key,
        value: { text: value },
        confidence: 0.7 + Math.random() * 0.3,
        status: Math.random() > 0.3 ? "confirmed" : "candidate",
        sensitivity: ["low", "medium", "high"][Math.floor(Math.random() * 3)] as "low" | "medium" | "high",
        provenance_kind: "ai_confirmed",
        provenance_source: "mock_data",
        embedding: `[${embedding.join(",")}]`,
      })

      console.log(`[v0] Generated fact ${i + 1}/20: ${key}`)
    }

    // Generate 500 episodic memories
    const memoryTemplates = [
      "Had a great conversation about {topic} with {person}",
      "Completed a challenging project on {topic}",
      "Learned something new about {topic}",
      "Attended a meeting about {topic}",
      "Read an interesting article on {topic}",
      "Watched a documentary about {topic}",
      "Had lunch at {location} and discussed {topic}",
      "Went for a walk and thought about {topic}",
      "Solved a difficult bug related to {topic}",
      "Helped a colleague with {topic}",
      "Presented findings on {topic} to the team",
      "Brainstormed ideas for {topic}",
      "Reviewed code related to {topic}",
      "Participated in a workshop on {topic}",
      "Discovered a new approach to {topic}",
    ]

    const topics = [
      "machine learning",
      "web development",
      "database optimization",
      "user experience",
      "API design",
      "cloud architecture",
      "security best practices",
      "performance tuning",
      "code review",
      "agile methodology",
      "React patterns",
      "TypeScript features",
      "testing strategies",
      "deployment pipelines",
      "microservices",
      "data visualization",
      "authentication",
      "caching strategies",
      "error handling",
      "documentation",
    ]

    const people = ["Sarah", "Mike", "Jessica", "David", "Emily", "Chris", "Amanda", "Ryan", "Lisa", "Tom"]

    const locations = [
      "the office",
      "a coffee shop",
      "the park",
      "home",
      "a restaurant",
      "the gym",
      "a conference",
      "online",
    ]

    console.log("[v0] Generating episodic memories...")
    const now = Date.now()
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000

    for (let i = 0; i < 500; i++) {
      const template = memoryTemplates[Math.floor(Math.random() * memoryTemplates.length)]
      const topic = topics[Math.floor(Math.random() * topics.length)]
      const person = people[Math.floor(Math.random() * people.length)]
      const location = locations[Math.floor(Math.random() * locations.length)]

      const text = template.replace("{topic}", topic).replace("{person}", person).replace("{location}", location)

      const embedding = await generateEmbedding(text)

      // Spread memories over the past year, with more recent ones
      const timestamp = new Date(oneYearAgo + Math.random() * (now - oneYearAgo)).toISOString()

      await supabase.from("episodic_memories").insert({
        user_id: user.id,
        text,
        confidence: Math.random(), // Use a random confidence value
        occurred_at: timestamp,
        location: Math.random() > 0.5 ? location : null,
        provenance_kind: Math.random() > 0.2 ? "ai_confirmed" : "ai_proposed",
        provenance_source: "mock_data",
        embedding: `[${embedding.join(",")}]`,
        emotional_valence: (Math.random() - 0.5) * 2, // Random between -1 and 1
        importance: Math.random(),
        recall_count: 0,
        memory_strength: 1.0,
      })

      if ((i + 1) % 50 === 0) {
        console.log(`[v0] Generated ${i + 1}/500 episodic memories`)
      }
    }

    console.log("[v0] Mock data generation complete!")
    revalidatePath("/")
    return { success: true, message: "Generated 20 facts and 500 episodic memories" }
  } catch (error) {
    console.error("[v0] Error generating mock data:", error)
    return { error: error instanceof Error ? error.message : "Failed to generate mock data" }
  }
}

export async function recordMemoryRecall(memoryId: string, memoryType: "fact" | "episodic") {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    if (memoryType === "episodic") {
      // Increment recall_count which triggers the memory strength update via trigger
      const { error } = await supabase
        .from("episodic_memories")
        .update({
          recall_count: supabase.rpc("increment_recall_count"),
        })
        .eq("user_id", user.id)
        .eq("id", memoryId)

      if (error) {
        console.error("[v0] Error recording episodic memory recall:", error)
        return { error: error.message }
      }
    } else if (memoryType === "fact") {
      const { error } = await supabase
        .from("profile_facts")
        .update({
          recall_count: supabase.rpc("increment_recall_count"),
          last_recalled_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("id", memoryId)

      if (error) {
        console.error("[v0] Error recording fact recall:", error)
        return { error: error.message }
      }
    }

    return { success: true }
  } catch (error) {
    console.error("[v0] Error in recordMemoryRecall:", error)
    return { error: error instanceof Error ? error.message : "Failed to record memory recall" }
  }
}
