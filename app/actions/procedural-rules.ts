"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export interface ProceduralRule {
  id: string
  user_id: string
  rule_type: "habit" | "preference" | "routine" | "if_then" | "skill"
  condition?: string
  action: string
  context?: string
  confidence: number
  frequency?: "always" | "usually" | "sometimes" | "rarely"
  importance: number
  times_observed: number
  times_applied: number
  last_observed_at: string
  last_applied_at?: string
  status: "active" | "inactive" | "deprecated"
  provenance_kind: string
  provenance_source: string
  created_at: string
  updated_at: string
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
    return data.data[0].embedding
  } catch (error) {
    console.error("[v0] Error generating embedding:", error)
    throw error
  }
}

export async function getProceduralRules() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("procedural_rules")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("importance", { ascending: false })

  if (error) {
    console.error("[v0] Error fetching procedural rules:", error)
    return { error: error.message }
  }

  return { rules: data as ProceduralRule[] }
}

export async function createProceduralRule(
  ruleType: ProceduralRule["rule_type"],
  action: string,
  options: {
    condition?: string
    context?: string
    confidence?: number
    frequency?: ProceduralRule["frequency"]
    importance?: number
  } = {},
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    // Generate embedding from action + condition + context
    const embeddingText = [options.condition, action, options.context].filter(Boolean).join(" ")
    const embedding = await generateEmbedding(embeddingText)

    const { data, error } = await supabase
      .from("procedural_rules")
      .insert({
        user_id: user.id,
        rule_type: ruleType,
        action,
        condition: options.condition,
        context: options.context,
        confidence: options.confidence ?? 0.7,
        frequency: options.frequency,
        importance: options.importance ?? 0.5,
        embedding: `[${embedding.join(",")}]`,
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error creating procedural rule:", error)
      return { error: error.message }
    }

    revalidatePath("/")
    return { success: true, rule: data as ProceduralRule }
  } catch (error) {
    console.error("[v0] Error in createProceduralRule:", error)
    return { error: error instanceof Error ? error.message : "Failed to create procedural rule" }
  }
}

export async function updateProceduralRule(
  id: string,
  updates: Partial<
    Pick<ProceduralRule, "action" | "condition" | "context" | "confidence" | "frequency" | "importance" | "status">
  >,
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    // If action, condition, or context changed, regenerate embedding
    let embedding: number[] | undefined
    if (updates.action || updates.condition || updates.context) {
      const { data: existing } = await supabase
        .from("procedural_rules")
        .select("action, condition, context")
        .eq("id", id)
        .eq("user_id", user.id)
        .single()

      if (existing) {
        const embeddingText = [
          updates.condition ?? existing.condition,
          updates.action ?? existing.action,
          updates.context ?? existing.context,
        ]
          .filter(Boolean)
          .join(" ")
        embedding = await generateEmbedding(embeddingText)
      }
    }

    const updateData: any = { ...updates }
    if (embedding) {
      updateData.embedding = `[${embedding.join(",")}]`
    }

    const { data, error } = await supabase
      .from("procedural_rules")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error) {
      console.error("[v0] Error updating procedural rule:", error)
      return { error: error.message }
    }

    revalidatePath("/")
    return { success: true, rule: data as ProceduralRule }
  } catch (error) {
    console.error("[v0] Error in updateProceduralRule:", error)
    return { error: error instanceof Error ? error.message : "Failed to update procedural rule" }
  }
}

export async function recordRuleObservation(id: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { error } = await supabase.rpc("increment_rule_observation", {
    p_rule_id: id,
    p_user_id: user.id,
  })

  if (error) {
    // Fallback if RPC doesn't exist
    const { data: rule, error: fetchError } = await supabase
      .from("procedural_rules")
      .select("times_observed")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (fetchError) {
      console.error("[v0] Error fetching rule for observation fallback:", fetchError)
      return { error: fetchError.message }
    }

    const { error: updateError } = await supabase
      .from("procedural_rules")
      .update({
        times_observed: (rule?.times_observed ?? 0) + 1,
        last_observed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)

    if (updateError) {
      console.error("[v0] Error recording rule observation:", updateError)
      return { error: updateError.message }
    }
  }

  return { success: true }
}

export async function recordRuleApplication(id: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: rule, error: fetchError } = await supabase
    .from("procedural_rules")
    .select("times_applied")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (fetchError) {
    console.error("[v0] Error fetching rule for application:", fetchError)
    return { error: fetchError.message }
  }

  const { error } = await supabase
    .from("procedural_rules")
    .update({
      times_applied: (rule?.times_applied ?? 0) + 1,
      last_applied_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) {
    console.error("[v0] Error recording rule application:", error)
    return { error: error.message }
  }

  return { success: true }
}

export async function deleteProceduralRule(id: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { error } = await supabase.from("procedural_rules").delete().eq("id", id).eq("user_id", user.id)

  if (error) {
    console.error("[v0] Error deleting procedural rule:", error)
    return { error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}
