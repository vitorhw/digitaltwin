"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import { extractTemporalInfo } from "@/lib/temporal-parser"
import fs from "node:fs/promises"
import path from "node:path"
import { Buffer } from "node:buffer"
import { cookies } from "next/headers"
import type { VoiceProfile } from "@/app/actions/voice"

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
      const { date } = await extractTemporalInfo(value)
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
    const { date: parsedDate, cleanedText, temporalPhrase } = await extractTemporalInfo(text)

    // Use parsed date if available, otherwise use provided occurredAt or current time
    const finalOccurredAt = parsedDate?.toISOString() ?? occurredAt ?? null

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
    const { date: parsedDate, cleanedText, temporalPhrase } = await extractTemporalInfo(text)

    // Use parsed date if available, otherwise use provided occurredAt or current time
    const finalOccurredAt = parsedDate?.toISOString() ?? occurredAt ?? null

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
        .eq("user_id", user.id)
        .limit(1000), // Add limit to prevent overwhelming queries
      supabase
        .from("episodic_memories")
        .select("id, text, confidence, occurred_at, location, provenance_kind, created_at, embedding")
        .eq("user_id", user.id)
        .limit(1000), // Add limit to prevent overwhelming queries
      supabase
        .from("doc_chunks")
        .select("id, doc_uri, doc_title, text, section_path, page_number, created_at, embedding")
        .eq("user_id", user.id)
        .limit(1000), // Add limit to prevent overwhelming queries
    ])

    // Check for errors with better error messages
    if (factsResult.error) {
      console.error("[v0] Error fetching facts:", factsResult.error)
      throw new Error(`Failed to fetch facts: ${factsResult.error.message}`)
    }
    if (memoriesResult.error) {
      console.error("[v0] Error fetching memories:", memoriesResult.error)
      throw new Error(`Failed to fetch memories: ${memoriesResult.error.message}`)
    }
    if (documentsResult.error) {
      console.error("[v0] Error fetching documents:", documentsResult.error)
      throw new Error(`Failed to fetch documents: ${documentsResult.error.message}`)
    }

    return {
      facts: factsResult.data || [],
      memories: memoriesResult.data || [],
      documents: documentsResult.data || [],
    }
  } catch (error) {
    console.error("[v0] Error fetching memory graph data:", error)

    const errorMessage = error instanceof Error ? error.message : "Failed to fetch memory graph data"
    if (errorMessage.includes("Too Many") || errorMessage.includes("rate limit")) {
      return { error: "Rate limit exceeded. Please wait a moment and try again." }
    }

    return { error: errorMessage }
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

interface DiagnosticEntry {
  name: string
  status: "ok" | "error"
  message?: string
  error?: string
}

export interface DiagnosticsArtifacts {
  voiceAudioDataUrl?: string
  avatarMesh?: MeshData
  avatarFeatures?: Features
  avatarTextureDataUrl?: string
  voiceProfile?: VoiceProfile | null
}

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

const VOICE_MIME_TYPES: Record<string, string> = {
  ".wav": "audio/wav",
  ".webm": "audio/webm",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
}

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
}

function detectMimeType(filePath: string, fallback: string, overrides: Record<string, string>) {
  const ext = path.extname(filePath).toLowerCase()
  return overrides[ext] || fallback
}

function bufferToBlobPart(buffer: Buffer) {
  return new Uint8Array(buffer)
}

async function buildCookieHeader() {
  const cookieStore = await cookies()
  const pairs = cookieStore.getAll().map(({ name, value }) => `${name}=${value}`)
  return pairs.length ? pairs.join("; ") : null
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return "Unknown error"
}

export async function checkDatabaseFunctions() {
  const supabase = await createClient()
  let adminSupabase = null
  try {
    adminSupabase = createAdminClient()
  } catch (error) {
    console.error("[v0] Failed to create admin Supabase client:", error)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const diagnostics: DiagnosticEntry[] = []
  const artifacts: DiagnosticsArtifacts = {}
  const cookieHeader = await buildCookieHeader()
  const authHeaders = cookieHeader ? { cookie: cookieHeader } : undefined
  const baseUrl =
    process.env.SYSTEM_CHECK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  const coquiUrl = process.env.FACE_AVATAR_API_URL || process.env.COQUI_API_URL || "http://localhost:8001"

  const sampleDir = process.env.SYSTEM_CHECK_SAMPLE_DIR
    ? path.resolve(process.cwd(), process.env.SYSTEM_CHECK_SAMPLE_DIR)
    : path.join(process.cwd(), "system-check-assets")
  const voiceSampleName = process.env.SYSTEM_CHECK_VOICE_FILE || "voice-sample.wav"
  const faceSampleName = process.env.SYSTEM_CHECK_FACE_FILE || "face-sample.jpg"
  const voiceSamplePath = path.join(sampleDir, voiceSampleName)
  const faceSamplePath = path.join(sampleDir, faceSampleName)

  const relativeVoicePath = path.relative(process.cwd(), voiceSamplePath)
  const relativeFacePath = path.relative(process.cwd(), faceSamplePath)

  let voiceSample: Buffer | null = null
  let faceSample: Buffer | null = null

  try {
    voiceSample = await fs.readFile(voiceSamplePath)
    diagnostics.push({
      name: "voice_sample",
      status: "ok",
      message: `Loaded ${relativeVoicePath} (${(voiceSample.length / 1024).toFixed(1)} KB)`,
    })
  } catch (error) {
    diagnostics.push({
      name: "voice_sample",
      status: "error",
      error: formatErrorMessage(error),
      message: `Place a voice file at ${relativeVoicePath}`,
    })
  }

  try {
    faceSample = await fs.readFile(faceSamplePath)
    diagnostics.push({
      name: "face_sample",
      status: "ok",
      message: `Loaded ${relativeFacePath} (${(faceSample.length / 1024).toFixed(1)} KB)`,
    })
  } catch (error) {
    diagnostics.push({
      name: "face_sample",
      status: "error",
      error: formatErrorMessage(error),
      message: `Place an image at ${relativeFacePath}`,
    })
  }

  let clonedVoiceId: string | null = null
  if (!voiceSample) {
    diagnostics.push({
      name: "voice_clone",
      status: "error",
      message: "Skipped voice cloning because the sample file is missing.",
    })
  } else {
    const form = new FormData()
    const mimeType = detectMimeType(voiceSamplePath, "audio/wav", VOICE_MIME_TYPES)
    form.append("audio_file", new Blob([bufferToBlobPart(voiceSample)], { type: mimeType }), voiceSampleName)
    const cloneUrl = `${coquiUrl}/api/coqui/clone_voice?user_id=${encodeURIComponent(user.id)}`
    try {
      const response = await fetch(cloneUrl, {
        method: "POST",
        body: form,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Clone endpoint responded with ${response.status}`)
      }

      const payload = (await response.json()) as { voice_id?: string }
      if (!payload.voice_id) {
        throw new Error("Clone endpoint did not return a voice_id")
      }

      clonedVoiceId = payload.voice_id
      diagnostics.push({
        name: "voice_clone",
        status: "ok",
        message: `Cloned voice via ${cloneUrl} (${clonedVoiceId})`,
      })

      if (!adminSupabase) {
        diagnostics.push({
          name: "voice_profile_sync",
          status: "error",
          message:
            "Missing Supabase service role credentials. Set SUPABASE_SERVICE_ROLE_KEY to allow automated profile updates.",
        })
      } else if (voiceSample) {
        const ext = path.extname(voiceSampleName) || ".wav"
        const objectPath = `${user.id}${ext}`
        const upload = await adminSupabase.storage.from("voice-profiles").upload(objectPath, voiceSample, {
          cacheControl: "3600",
          upsert: true,
          contentType: mimeType,
        })

        if (upload.error) {
          diagnostics.push({
            name: "voice_profile_storage",
            status: "error",
            error: upload.error.message,
            message: "Failed to upload voice sample to Supabase storage.",
          })
        } else {
          const { data: profileData, error: profileError } = await adminSupabase
            .from("voice_profile")
            .upsert(
              {
                user_id: user.id,
                sample_object_path: objectPath,
                sample_mime_type: mimeType,
                clone_reference: { voice_id: clonedVoiceId },
                speak_back_enabled: true,
              },
              { onConflict: "user_id" },
            )
            .select()
            .single()

          if (profileError) {
            diagnostics.push({
              name: "voice_profile_sync",
              status: "error",
              error: profileError.message,
              message: "Failed to sync voice profile record.",
            })
          } else {
            artifacts.voiceProfile = profileData as VoiceProfile
            diagnostics.push({
              name: "voice_profile_sync",
              status: "ok",
              message: "Voice profile stored and speak-back enabled.",
            })
          }
        }
      }
    } catch (error) {
      diagnostics.push({
        name: "voice_clone",
        status: "error",
        error: formatErrorMessage(error),
        message: `Failed while calling ${cloneUrl}`,
      })
    }
  }

  if (!clonedVoiceId) {
    diagnostics.push({
      name: "voice_tts",
      status: "error",
      message: "Skipped playback test because cloning failed.",
    })
  } else {
    const synthUrl = `${coquiUrl}/api/coqui/synthesize`
    try {
      const response = await fetch(synthUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "System diagnostics ping. This should play back quickly.",
          voice_id: clonedVoiceId,
          language: "en",
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Synthesize endpoint returned ${response.status}`)
      }

      const audioBuffer = await response.arrayBuffer()
      artifacts.voiceAudioDataUrl = `data:audio/wav;base64,${Buffer.from(audioBuffer).toString("base64")}`
      diagnostics.push({
        name: "voice_tts",
        status: "ok",
        message: `Synthesized ${(audioBuffer.byteLength / 1024).toFixed(1)} KB of audio`,
      })
    } catch (error) {
      diagnostics.push({
        name: "voice_tts",
        status: "error",
        error: formatErrorMessage(error),
        message: `Failed while calling ${synthUrl}`,
      })
    }
  }

  let meshPath: string | null = null
  let featuresPath: string | null = null
  if (!faceSample) {
    diagnostics.push({
      name: "avatar_generate",
      status: "error",
      message: "Skipped avatar generation because the sample image is missing.",
    })
  } else {
    const faceForm = new FormData()
    const mimeType = detectMimeType(faceSamplePath, "image/jpeg", IMAGE_MIME_TYPES)
    artifacts.avatarTextureDataUrl = `data:${mimeType};base64,${faceSample.toString("base64")}`
    faceForm.append("photo", new Blob([bufferToBlobPart(faceSample)], { type: mimeType }), faceSampleName)

    const generateUrl = new URL("/api/face-avatar/generate", baseUrl).toString()
    try {
      const response = await fetch(generateUrl, {
        method: "POST",
        headers: authHeaders,
        body: faceForm,
      })
      const rawText = await response.text()
      let payload: { ok?: boolean; mesh?: string; features?: string; error?: string } | null = null
      try {
        payload = JSON.parse(rawText)
      } catch {
        throw new Error(`Avatar API returned non-JSON response: ${rawText.slice(0, 200)}`)
      }

      if (!response.ok || !payload?.ok) {
        const errorMessage = payload?.error || `Avatar endpoint returned ${response.status}`
        throw new Error(errorMessage)
      }

      meshPath = payload.mesh ?? null
      featuresPath = payload.features ?? null

      diagnostics.push({
        name: "avatar_generate",
        status: "ok",
        message: `Avatar backend responded with mesh ${meshPath} and features ${featuresPath}`,
      })
    } catch (error) {
      diagnostics.push({
        name: "avatar_generate",
        status: "error",
        error: formatErrorMessage(error),
        message: `Failed while calling ${generateUrl}`,
      })
    }
  }

  const proxyStatic = async (fieldName: string, remotePath: string | null, label: string) => {
    if (!remotePath) {
      diagnostics.push({
        name: fieldName,
        status: "error",
        message: `Skipped ${label} fetch because the generate step failed.`,
      })
      return
    }

    const normalizedPath = remotePath.startsWith("/static") ? remotePath.replace("/static", "") : remotePath
    const staticUrl = new URL(`/api/face-avatar/static${normalizedPath}`, baseUrl).toString()
    try {
      const response = await fetch(staticUrl, { headers: authHeaders })
      if (!response.ok) {
        throw new Error(`Proxy returned status ${response.status}`)
      }
      const payload = await response.json()

      let summary = `Fetched ${label} via ${staticUrl}`
      if (fieldName === "avatar_mesh_fetch" && Array.isArray(payload?.vertices)) {
        artifacts.avatarMesh = payload as MeshData
        summary = `Fetched mesh (${payload.vertices.length} vertices) via ${staticUrl}`
      } else if (fieldName === "avatar_features_fetch") {
        const featureKeys = Object.keys(payload || {})
        artifacts.avatarFeatures = payload as Features
        summary = `Fetched features (${featureKeys.join(", ") || "no keys"}) via ${staticUrl}`
      }

      diagnostics.push({
        name: fieldName,
        status: "ok",
        message: summary,
      })
    } catch (error) {
      diagnostics.push({
        name: fieldName,
        status: "error",
        error: formatErrorMessage(error),
        message: `Failed while calling ${staticUrl}`,
      })
    }
  }

  await proxyStatic("avatar_mesh_fetch", meshPath, "mesh data")
  await proxyStatic("avatar_features_fetch", featuresPath, "facial feature data")

  const success = diagnostics.every((diag) => diag.status === "ok")
  return { success, diagnostics, artifacts }
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
