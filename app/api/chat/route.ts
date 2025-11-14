import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import {
  proposeFact,
  confirmFact,
  proposeEpisodic,
  confirmEpisodic,
  hybridSearch,
  getCurrentFacts,
} from "@/app/actions/memory"
import { getCommunicationStyle } from "@/app/actions/style"
import { getProceduralRules, createProceduralRule } from "@/app/actions/procedural-rules"

async function callOpenAI(body: any, stream = false) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY not set")

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ ...body, stream }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${error}`)
  }

  return response
}

function buildTools() {
  return [
    {
      type: "function",
      function: {
        name: "propose_fact",
        description: "Suggest a candidate profile fact that needs user confirmation",
        parameters: {
          type: "object",
          properties: {
            key: { type: "string", description: "The key/name of the fact (e.g., 'occupation', 'favorite_color')" },
            value: { type: "string", description: "The value of the fact" },
            confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence level (0-1)" },
            sensitivity: { type: "string", enum: ["low", "medium", "high"], description: "Sensitivity level" },
          },
          required: ["key", "value", "confidence", "sensitivity"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "confirm_fact",
        description: "Upsert a confirmed, durable fact (only when user clearly confirms)",
        parameters: {
          type: "object",
          properties: {
            key: { type: "string", description: "The key/name of the fact" },
            value: { type: "string", description: "The value of the fact" },
            confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence level (0-1)" },
            sensitivity: { type: "string", enum: ["low", "medium", "high"], description: "Sensitivity level" },
            ttl_days: { type: "number", description: "Time to live in days (optional)" },
          },
          required: ["key", "value", "confidence", "sensitivity"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "propose_episodic",
        description: "Propose an episodic memory describing what happened",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "One-sentence memory, past tense" },
            confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence level (0-1)" },
          },
          required: ["text", "confidence"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "confirm_episodic",
        description: "Confirm and store an episodic memory",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Description of the event or experience" },
            confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence level (0-1)" },
            timestamp: { type: "string", description: "When the event occurred (ISO 8601 format)" },
            location: { type: "string", description: "Where the event occurred" },
          },
          required: ["text", "confidence"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_memory",
        description: "Search through the user's documents and memories using hybrid search",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query" },
            limit: { type: "number", description: "Maximum number of results (default: 5)" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "propose_procedural_rule",
        description:
          "Propose a procedural rule (habit, preference, routine, if/then rule, or skill) based on the conversation",
        parameters: {
          type: "object",
          properties: {
            rule_type: {
              type: "string",
              enum: ["habit", "preference", "routine", "if_then", "skill"],
              description: "Type of procedural rule",
            },
            condition: {
              type: "string",
              description: "Optional: For if/then rules, the condition (e.g., 'when stressed', 'if traveling')",
            },
            action: {
              type: "string",
              description: "The action or behavior (e.g., 'book flights with United', 'go for a walk')",
            },
            context: { type: "string", description: "Optional: Additional context or explanation" },
            confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence level (0-1)" },
            frequency: {
              type: "string",
              enum: ["always", "usually", "sometimes", "rarely"],
              description: "How often this rule applies",
            },
            importance: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Importance level (0-1)",
            },
          },
          required: ["rule_type", "action", "confidence"],
        },
      },
    },
  ]
}

function buildSystemPrompt(facts: any[], style: any | null, rules: any[]): string {
  let basePrompt = `You are a digital twin - a conversational representation of a person based on their memories, experiences, and knowledge.

IMPORTANT: You ARE the person, not an assistant helping them. Respond in first person as if you are them.
- Use "I" not "you" when referring to the person's experiences
- Share memories and knowledge as your own
- Respond naturally as the person would, based on their stored memories`

  if (rules && rules.length > 0) {
    basePrompt += `\n\nPROCEDURAL RULES (Habits, Preferences, and Routines):
You must follow these behavioral patterns and preferences:`

    for (const rule of rules) {
      const ruleText = rule.condition ? `${rule.condition} → ${rule.action}` : rule.action
      const frequency = rule.frequency ? ` (${rule.frequency})` : ""
      basePrompt += `\n- [${rule.rule_type}] ${ruleText}${frequency}`
      if (rule.context) {
        basePrompt += ` - ${rule.context}`
      }
    }

    basePrompt += `\n\nWhen responding, naturally incorporate these rules into your behavior and recommendations.`
  }

  // Add communication style instructions if available
  if (style) {
    basePrompt += `\n\nCOMMUNICATION STYLE:
You must match the person's communication style exactly:`

    if (style.tone_descriptors && style.tone_descriptors.length > 0) {
      basePrompt += `\n- Tone: ${style.tone_descriptors.join(", ")}`
    }

    if (style.formality_level) {
      basePrompt += `\n- Formality: ${style.formality_level.replace("_", " ")}`
    }

    if (style.humor_style) {
      basePrompt += `\n- Humor: ${style.humor_style}`
    }

    if (style.vocabulary_level) {
      basePrompt += `\n- Vocabulary: ${style.vocabulary_level}`
    }

    if (style.sentence_structure) {
      basePrompt += `\n- Sentence structure: ${style.sentence_structure}`
    }

    if (style.emoji_usage) {
      basePrompt += `\n- Emoji usage: ${style.emoji_usage}`
    }

    if (style.punctuation_style) {
      basePrompt += `\n- Punctuation: ${style.punctuation_style}`
    }

    if (style.paragraph_length) {
      basePrompt += `\n- Response length: ${style.paragraph_length}`
    }

    if (style.common_phrases && style.common_phrases.length > 0) {
      basePrompt += `\n- Common phrases you use: ${style.common_phrases.slice(0, 5).join(", ")}`
    }

    if (style.example_messages && style.example_messages.length > 0) {
      basePrompt += `\n\nExample messages that show your style:\n${style.example_messages
        .slice(0, 3)
        .map((msg: string) => `- "${msg}"`)
        .join("\n")}`
    }
  }

  basePrompt += `\n\nMemory capture policy:
- Aggressively store anything new. Even subtle hints (names, small preferences, current tasks, travel details, goals, timelines, etc.) should trigger a tool call.
- When in doubt, propose a memory with lower confidence instead of skipping it.
- Multiple distinct details in one message require multiple tool calls in the same turn.
- Use confirm_fact only when the user clearly affirms the detail; otherwise use propose_fact.
- Use propose_episodic/confirm_episodic for any described event, outing, meeting, booking, purchase, or experience—even if tentative or upcoming.
- Use propose_procedural_rule for routines, habits, operating instructions, "if X then Y" statements, or skills.
- Procedural rules can be derived from subtle statements like "I usually", "I prefer", "I try to", or "When X happens I do Y".
- There is no strict limit on tool calls—call as many as needed to cover every memory fragment before responding.
- Use search_memory whenever it can surface context for the reply.
- After calling tools, answer naturally as the person would. If you stored something to memory, you can briefly acknowledge it naturally (e.g., "Got it, I'll remember that").
- IMPORTANT: If you claim you saved to memory, you must call a tool first.

Temporal references:
- When temporal references like "yesterday", "last week", "two months ago" are mentioned, 
  the system will automatically parse these and convert them to absolute dates.
- You should still include the temporal reference in the memory text for context.
- Example: "went to buy ice cream yesterday" will be stored with the actual date (e.g., Oct 21, 2024)
  and the text will be cleaned to "went to buy ice cream" with the date stored separately.`

  return basePrompt
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const userText: string = body?.message ?? ""

    if (!userText) {
      return NextResponse.json({ error: "message required" }, { status: 400 })
    }

    const [factsResult, styleResult, rulesResult] = await Promise.all([
      getCurrentFacts(),
      getCommunicationStyle(),
      getProceduralRules(),
    ])

    const allFacts = factsResult.facts || []
    const facts = allFacts.filter((f: any) => f.status === "confirmed")
    const style = styleResult.style || null
    const rules = rulesResult.rules || []

    const searchResult = await hybridSearch(userText, 5)
    const allHits = searchResult.results || []

    // Filter out candidate facts and ai_proposed episodic memories
    const hits = allHits.filter((h: any) => {
      if (h.source === "fact") {
        return h.status === "confirmed"
      }
      if (h.source === "episodic") {
        return h.provenance_kind !== "ai_proposed"
      }
      return true
    })

    const contextBlock = [
      `# Profile facts`,
      ...facts.map((f: any) => {
        const key = f?.key || "unknown"
        const value = f?.value ? JSON.stringify(f.value) : "null"
        const confidence = f?.confidence ?? 0
        return `- ${key}: ${value} (conf ${confidence})`
      }),
      `\n# Retrieved snippets`,
      ...hits.map((h: any) => {
        const source = h?.source || "unknown"
        const text = h?.text || ""
        const score = h?.combined_score ?? 0
        return `- [${source}] ${text} (score ${Number(score).toFixed(2)})`
      }),
    ].join("\n")

    const systemPrompt = buildSystemPrompt(facts, style, rules)

    const baseMessages = [
      { role: "system", content: systemPrompt },
      { role: "system", content: `CONTEXT\n${contextBlock}` },
      { role: "user", content: userText },
    ]

    const tools = buildTools()

    // Pass 1: let model decide tool calls
    const firstResponse = await callOpenAI({
      model: "gpt-4o-mini",
      messages: baseMessages,
      tools,
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: 300,
    })

    const firstData = await firstResponse.json()
    const firstMsg = firstData.choices?.[0]?.message

    // Execute tools
    const toolMsgs: any[] = []
    const executedOps: Array<{
      id: string
      name:
        | "propose_fact"
        | "confirm_fact"
        | "propose_episodic"
        | "confirm_episodic"
        | "search_memory"
        | "retrieved_facts"
        | "propose_procedural_rule"
      args: Record<string, unknown>
      status: "ok" | "ignored" | "error"
      error?: string
      retrieved_data?: any
    }> = []

    if (facts.length > 0) {
      executedOps.push({
        id: crypto.randomUUID(),
        name: "retrieved_facts",
        args: {},
        status: "ok",
        retrieved_data: facts,
      })
    }

    for (const tc of firstMsg?.tool_calls ?? []) {
      if (tc.type !== "function") continue
      const callId = tc.id
      const name = tc.function.name as any

      let args: Record<string, unknown> = {}
      try {
        args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}
      } catch {
        // ignore malformed args
      }

      try {
        if (name === "propose_fact") {
          const key = typeof args.key === "string" ? args.key : ""
          const value = typeof args.value === "string" ? args.value : ""
          const confidence = typeof args.confidence === "number" ? args.confidence : 0.7
          const sensitivity = (["low", "medium", "high"] as const).includes(args.sensitivity as any)
            ? (args.sensitivity as any)
            : "low"

          if (!key || !value) {
            executedOps.push({ id: callId, name, args, status: "ignored" })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: "ignored: missing key/value" })
            continue
          }

          const result = await proposeFact(key, value, confidence, sensitivity)
          if (result.error) {
            executedOps.push({ id: callId, name, args, status: "error", error: result.error })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: `error: ${result.error}` })
          } else {
            executedOps.push({ id: callId, name, args, status: "ok" })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: "ok" })
          }
        } else if (name === "confirm_fact") {
          const key = typeof args.key === "string" ? args.key : ""
          const value = typeof args.value === "string" ? args.value : ""
          const confidence = typeof args.confidence === "number" ? args.confidence : 0.9
          const sensitivity = (["low", "medium", "high"] as const).includes(args.sensitivity as any)
            ? (args.sensitivity as any)
            : "low"
          const ttlDays = typeof args.ttl_days === "number" ? args.ttl_days : undefined

          if (!key || !value) {
            executedOps.push({ id: callId, name, args, status: "ignored" })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: "ignored: missing key/value" })
            continue
          }

          const result = await confirmFact(key, value, confidence, sensitivity, ttlDays)
          if (result.error) {
            executedOps.push({ id: callId, name, args, status: "error", error: result.error })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: `error: ${result.error}` })
          } else {
            executedOps.push({ id: callId, name, args, status: "ok" })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: "ok" })
          }
        } else if (name === "propose_episodic") {
          const text = typeof args.text === "string" ? args.text : ""
          const confidence = typeof args.confidence === "number" ? args.confidence : 0.7

          if (!text) {
            executedOps.push({ id: callId, name, args, status: "ignored" })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: "ignored: missing text" })
            continue
          }

          const result = await proposeEpisodic(text, confidence)
          if (result.error) {
            executedOps.push({ id: callId, name, args, status: "error", error: result.error })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: `error: ${result.error}` })
          } else {
            executedOps.push({ id: callId, name, args, status: "ok" })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: "ok" })
          }
        } else if (name === "confirm_episodic") {
          const text = typeof args.text === "string" ? args.text : ""
          const confidence = typeof args.confidence === "number" ? args.confidence : 0.9
          const timestamp = typeof args.timestamp === "string" ? args.timestamp : undefined
          const location = typeof args.location === "string" ? args.location : undefined

          if (!text) {
            executedOps.push({ id: callId, name, args, status: "ignored" })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: "ignored: missing text" })
            continue
          }

          const result = await confirmEpisodic(text, confidence, timestamp, location)
          if (result.error) {
            executedOps.push({ id: callId, name, args, status: "error", error: result.error })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: `error: ${result.error}` })
          } else {
            executedOps.push({ id: callId, name, args, status: "ok" })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: "ok" })
          }
        } else if (name === "search_memory") {
          const query = typeof args.query === "string" ? args.query : ""
          const limit = typeof args.limit === "number" ? args.limit : 5

          if (!query) {
            executedOps.push({ id: callId, name, args, status: "ignored" })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: "ignored: missing query" })
            continue
          }

          const result = await hybridSearch(query, limit)
          if (result.error) {
            executedOps.push({ id: callId, name, args, status: "error", error: result.error })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: `error: ${result.error}` })
          } else {
            executedOps.push({ id: callId, name, args, status: "ok", retrieved_data: result.results })
            const resultCount = result.results?.length || 0
            const resultSummary = result.results
              ?.slice(0, 3)
              .map((r: any) => `[${r.source}] ${r.text?.slice(0, 50)}...`)
              .join("\n")
            toolMsgs.push({
              role: "tool",
              tool_call_id: callId,
              content: `Found ${resultCount} results:\n${resultSummary}`,
            })
          }
        } else if (name === "propose_procedural_rule") {
          const ruleType = args.rule_type as any
          const action = typeof args.action === "string" ? args.action : ""
          const condition = typeof args.condition === "string" ? args.condition : undefined
          const context = typeof args.context === "string" ? args.context : undefined
          const confidence = typeof args.confidence === "number" ? args.confidence : 0.7
          const frequency = args.frequency as any
          const importance = typeof args.importance === "number" ? args.importance : 0.5

          if (!action || !ruleType) {
            executedOps.push({ id: callId, name, args, status: "ignored" })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: "ignored: missing action or rule_type" })
            continue
          }

          const result = await createProceduralRule(ruleType, action, {
            condition,
            context,
            confidence,
            frequency,
            importance,
          })

          if (result.error) {
            executedOps.push({ id: callId, name, args, status: "error", error: result.error })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: `error: ${result.error}` })
          } else {
            executedOps.push({ id: callId, name, args, status: "ok" })
            toolMsgs.push({ role: "tool", tool_call_id: callId, content: "ok" })
          }
        } else {
          executedOps.push({ id: callId, name, args, status: "ignored" })
          toolMsgs.push({ role: "tool", tool_call_id: callId, content: "ignored: unknown tool" })
        }
      } catch (err) {
        executedOps.push({
          id: callId,
          name,
          args,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        })
        toolMsgs.push({ role: "tool", tool_call_id: callId, content: "error" })
      }
    }

    // Pass 2: final answer with streaming
    const followMessages = [
      ...baseMessages,
      ...(firstMsg && firstMsg.tool_calls && firstMsg.tool_calls.length > 0
        ? [
            {
              role: "assistant",
              content: firstMsg.content || null,
              tool_calls: firstMsg.tool_calls,
            },
          ]
        : []),
      ...toolMsgs,
    ]

    const streamResponse = await callOpenAI(
      {
        model: "gpt-4o-mini",
        messages: followMessages,
        temperature: 0.4,
        max_tokens: 300,
      },
      true,
    )

    // Stream the response
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const readable = new ReadableStream({
      async start(controller) {
        const reader = streamResponse.body?.getReader()
        if (!reader) {
          controller.close()
          return
        }

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split("\n").filter((line) => line.trim() !== "")

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6)
                if (data === "[DONE]") continue

                try {
                  const parsed = JSON.parse(data)
                  const content = parsed.choices?.[0]?.delta?.content
                  if (content) {
                    controller.enqueue(encoder.encode(content))
                  }
                } catch {
                  // Skip invalid JSON
                }
              }
            }
          }
        } catch (err) {
          controller.error(err)
        } finally {
          controller.close()
        }
      },
    })

    const opsHeader = Buffer.from(JSON.stringify(executedOps)).toString("base64")
    return new NextResponse(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "x-memory-ops": opsHeader,
        "x-memory-ops-count": String(executedOps.length),
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[v0] Chat error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
