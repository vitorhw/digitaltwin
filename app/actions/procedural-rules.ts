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
    const { error: updateError } = await supabase
      .from("procedural_rules")
      .update({
        times_observed: supabase.raw("times_observed + 1"),
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

  const { error } = await supabase
    .from("procedural_rules")
    .update({
      times_applied: supabase.raw("times_applied + 1"),
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

export async function analyzeAndExtractRules() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    // Get recent episodic memories and facts to analyze
    const [memoriesResult, factsResult] = await Promise.all([
      supabase
        .from("episodic_memories")
        .select("text, occurred_at")
        .eq("user_id", user.id)
        .order("occurred_at", { ascending: false })
        .limit(100),
      supabase.from("profile_facts").select("key, value").eq("user_id", user.id).eq("status", "confirmed"),
    ])

    if (memoriesResult.error || factsResult.error) {
      throw new Error("Failed to fetch memories and facts")
    }

    const memories = memoriesResult.data || []
    const facts = factsResult.data || []

    // Use AI to extract procedural rules
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not set")
    }

    const prompt = `Analyze the following memories and facts to extract procedural rules (habits, preferences, routines, if/then rules, and skills).

MEMORIES:
${memories.map((m) => `- ${m.text}`).join("\n")}

FACTS:
${facts.map((f) => `- ${f.key}: ${JSON.stringify(f.value)}`).join("\n")}

Extract procedural rules in the following format. Only extract rules that are clearly evident from the data:

RULES:
[
  {
    "rule_type": "habit|preference|routine|if_then|skill",
    "condition": "optional: when/if this happens",
    "action": "what the person does or prefers",
    "context": "optional: additional context",
    "confidence": 0.0-1.0,
    "frequency": "always|usually|sometimes|rarely",
    "importance": 0.0-1.0
  }
]

Examples:
- If someone mentions "I always book flights with United", extract: {"rule_type": "preference", "action": "book flights with United", "confidence": 0.9, "frequency": "always", "importance": 0.7}
- If someone mentions "I go to the gym every morning", extract: {"rule_type": "routine", "action": "go to the gym", "context": "morning", "confidence": 0.8, "frequency": "always", "importance": 0.6}
- If someone mentions "When I'm stressed, I go for a walk", extract: {"rule_type": "if_then", "condition": "when stressed", "action": "go for a walk", "confidence": 0.8, "frequency": "usually", "importance": 0.7}

Return ONLY the JSON array, no other text.`

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at analyzing personal data to extract behavioral patterns, habits, and preferences. Return only valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      throw new Error("No content in AI response")
    }

    // Parse the JSON response
    const rules = JSON.parse(content)

    if (!Array.isArray(rules)) {
      throw new Error("AI response is not an array")
    }

    // Create the extracted rules
    const createdRules: ProceduralRule[] = []
    for (const rule of rules) {
      const result = await createProceduralRule(rule.rule_type, rule.action, {
        condition: rule.condition,
        context: rule.context,
        confidence: rule.confidence,
        frequency: rule.frequency,
        importance: rule.importance,
      })

      if (result.success && result.rule) {
        createdRules.push(result.rule)
      }
    }

    revalidatePath("/")
    return { success: true, rules: createdRules, count: createdRules.length }
  } catch (error) {
    console.error("[v0] Error in analyzeAndExtractRules:", error)
    return { error: error instanceof Error ? error.message : "Failed to analyze and extract rules" }
  }
}
