"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export interface CommunicationStyle {
  id: string
  user_id: string
  tone_descriptors: string[]
  formality_level: "very_casual" | "casual" | "neutral" | "formal" | "very_formal"
  humor_style: string | null
  common_phrases: string[]
  vocabulary_level: "simple" | "moderate" | "advanced" | "technical"
  sentence_structure: "short" | "mixed" | "long" | "complex"
  emoji_usage: "never" | "rare" | "occasional" | "frequent"
  punctuation_style: string | null
  paragraph_length: "brief" | "moderate" | "detailed"
  example_messages: string[]
  confidence: number
  last_analyzed_at: string | null
  created_at: string
  updated_at: string
}

export async function getCommunicationStyle() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data, error } = await supabase.from("communication_style").select("*").eq("user_id", user.id).maybeSingle()

  if (error) {
    return { error: error.message }
  }

  // data will be null if no row exists, which is fine
  return { style: data as CommunicationStyle | null }
}

export async function updateCommunicationStyle(styleData: Partial<CommunicationStyle>) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    const { data, error } = await supabase
      .from("communication_style")
      .upsert(
        {
          user_id: user.id,
          ...styleData,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
          ignoreDuplicates: false,
        },
      )
      .select()
      .single()

    if (error) {
      console.error("[v0] Error updating communication style:", error)
      return { error: error.message }
    }

    revalidatePath("/")
    return { success: true, style: data }
  } catch (error) {
    console.error("[v0] Error in updateCommunicationStyle:", error)
    return { error: error instanceof Error ? error.message : "Failed to update communication style" }
  }
}

export async function analyzeStyleFromMemories() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    // Get recent episodic memories to analyze
    const { data: memories, error: memoriesError } = await supabase
      .from("episodic_memories")
      .select("text")
      .eq("user_id", user.id)
      .order("occurred_at", { ascending: false })
      .limit(50)

    if (memoriesError) {
      return { error: memoriesError.message }
    }

    if (!memories || memories.length === 0) {
      return { error: "No memories found to analyze" }
    }

    // Use OpenAI to analyze the communication style
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return { error: "OpenAI API key not configured" }
    }

    const memoryTexts = memories.map((m) => m.text).join("\n")

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
            content: `You are analyzing a person's communication style based on their memories and messages. 
Extract and identify:
1. Tone descriptors (e.g., casual, formal, humorous, direct, empathetic)
2. Formality level (very_casual, casual, neutral, formal, very_formal)
3. Humor style (if any: sarcastic, witty, puns, dry, none)
4. Common phrases or expressions they use
5. Vocabulary level (simple, moderate, advanced, technical)
6. Sentence structure (short, mixed, long, complex)
7. Emoji usage (never, rare, occasional, frequent)
8. Punctuation style (minimal, standard, expressive)
9. Paragraph length preference (brief, moderate, detailed)

Respond with a JSON object containing these fields.`,
          },
          {
            role: "user",
            content: `Analyze the communication style from these texts:\n\n${memoryTexts}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      return { error: `OpenAI API error: ${error}` }
    }

    const result = await response.json()
    const analysis = JSON.parse(result.choices[0].message.content)

    // Update the communication style with the analysis
    const styleUpdate = {
      tone_descriptors: analysis.tone_descriptors || [],
      formality_level: analysis.formality_level || "neutral",
      humor_style: analysis.humor_style || null,
      common_phrases: analysis.common_phrases || [],
      vocabulary_level: analysis.vocabulary_level || "moderate",
      sentence_structure: analysis.sentence_structure || "mixed",
      emoji_usage: analysis.emoji_usage || "occasional",
      punctuation_style: analysis.punctuation_style || "standard",
      paragraph_length: analysis.paragraph_length || "moderate",
      example_messages: memories.slice(0, 5).map((m) => m.text),
      confidence: 0.7,
      last_analyzed_at: new Date().toISOString(),
    }

    return await updateCommunicationStyle(styleUpdate)
  } catch (error) {
    console.error("[v0] Error in analyzeStyleFromMemories:", error)
    return { error: error instanceof Error ? error.message : "Failed to analyze communication style" }
  }
}

export async function deleteCommunicationStyle() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    const { error } = await supabase.from("communication_style").delete().eq("user_id", user.id)

    if (error) {
      console.error("[v0] Error deleting communication style:", error)
      return { error: error.message }
    }

    revalidatePath("/")
    return { success: true }
  } catch (error) {
    console.error("[v0] Error in deleteCommunicationStyle:", error)
    return { error: error instanceof Error ? error.message : "Failed to delete communication style" }
  }
}

function ensureOpenAIKey() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OpenAI API key not configured")
  }
  return apiKey
}

export async function detectConversationSpeakers(conversation: string) {
  try {
    const apiKey = ensureOpenAIKey()
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
              "You receive a multi-person chat transcript. Identify the distinct speaker names or handles exactly as they appear. Respond as JSON: {\"speakers\": [\"name1\", \"name2\", ...]}",
          },
          {
            role: "user",
            content: conversation.slice(0, 8000),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      return { error: `OpenAI API error: ${text}` }
    }

    const result = await response.json()
    let speakers: string[] = []
    try {
      const parsed = JSON.parse(result.choices?.[0]?.message?.content ?? "{}")
      if (Array.isArray(parsed?.speakers)) {
        speakers = parsed.speakers.filter((s: unknown) => typeof s === "string" && s.trim().length > 0)
      }
    } catch (error) {
      console.error("[style] Failed to parse speakers JSON:", error)
    }

    return { speakers }
  } catch (error) {
    console.error("[style] detectConversationSpeakers error:", error)
    return { error: error instanceof Error ? error.message : "Failed to detect speakers" }
  }
}

export async function analyzeStyleFromConversation(conversation: string, speaker: string) {
  try {
    if (!speaker) {
      return { error: "Speaker name is required" }
    }
    const apiKey = ensureOpenAIKey()
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
            content: `You analyze chat transcripts to infer a single participant's communication style. Use only the lines spoken by the specified participant.`,
          },
          {
            role: "user",
            content: `Conversation transcript:\n${conversation.slice(0, 12000)}\n\nParticipant to analyze: ${speaker}\n\nReturn JSON with the fields:\n{\n  "tone_descriptors": [],\n  "formality_level": "very_casual|casual|neutral|formal|very_formal",\n  "humor_style": null or string,\n  "common_phrases": [],\n  "vocabulary_level": "simple|moderate|advanced|technical",\n  "sentence_structure": "short|mixed|long|complex",\n  "emoji_usage": "never|rare|occasional|frequent",\n  "punctuation_style": string or null,\n  "paragraph_length": "brief|moderate|detailed",\n  "example_messages": [array of up to 3 representative quotes],\n  "confidence": 0-1\n}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 600,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      return { error: `OpenAI API error: ${text}` }
    }

    const result = await response.json()
    const analysis = JSON.parse(result.choices?.[0]?.message?.content ?? "{}")

    const normalized = {
      tone_descriptors: analysis.tone_descriptors || [],
      formality_level: analysis.formality_level || "neutral",
      humor_style: analysis.humor_style || null,
      common_phrases: analysis.common_phrases || [],
      vocabulary_level: analysis.vocabulary_level || "moderate",
      sentence_structure: analysis.sentence_structure || "mixed",
      emoji_usage: analysis.emoji_usage || "occasional",
      punctuation_style: analysis.punctuation_style || "standard",
      paragraph_length: analysis.paragraph_length || "moderate",
      example_messages: analysis.example_messages || [],
      confidence: typeof analysis.confidence === "number" ? analysis.confidence : 0.7,
      last_analyzed_at: new Date().toISOString(),
    }

    return { analysis: normalized }
  } catch (error) {
    console.error("[style] analyzeStyleFromConversation error:", error)
    return { error: error instanceof Error ? error.message : "Failed to analyze conversation" }
  }
}
