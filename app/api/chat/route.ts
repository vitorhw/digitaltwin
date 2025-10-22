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

export const runtime = "nodejs"
export const maxDuration = 30

type ToolName = "propose_fact" | "confirm_fact" | "propose_episodic" | "confirm_episodic" | "search_memory"
type Sensitivity = "low" | "medium" | "high"

const SYSTEM_PROMPT = `You are a helpful personal memory assistant with access to the user's memory.

Tool policy:
- If user shares a durable preference/profile detail and explicitly confirms: call confirm_fact.
- If it's likely but not certain: call propose_fact.
- If they describe an event ("I went to ...", "I booked ..."): call propose_episodic or confirm_episodic.
- Use search_memory to find relevant information before answering questions.
- Prefer at most 1–2 tool calls per turn.
- After calling tools, answer concisely and, if you changed memory, add a short parenthetical like "(saved to memory)".
- IMPORTANT: If you claim you saved to memory, you must call a tool first.

Temporal references:
- When the user mentions temporal references like "yesterday", "last week", "two months ago", etc., 
  the system will automatically parse these and convert them to absolute dates.
- You should still include the temporal reference in the memory text for context.
- Example: "went to buy ice cream yesterday" will be stored with the actual date (e.g., Oct 21, 2024)
  and the text will be cleaned to "went to buy ice cream" with the date stored separately.
`

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
  ]
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

    // Get current facts for context
    const factsResult = await getCurrentFacts()
    const facts = factsResult.facts || []

    // Search for relevant memories
    const searchResult = await hybridSearch(userText, 5)
    const hits = searchResult.results || []

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

    const baseMessages = [
      { role: "system", content: SYSTEM_PROMPT },
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
    })

    const firstData = await firstResponse.json()
    const firstMsg = firstData.choices?.[0]?.message

    // Execute tools
    const toolMsgs: any[] = []
    const executedOps: Array<{
      id: string
      name: ToolName | "retrieved_facts"
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
      const name = tc.function.name as ToolName

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
          const sensitivity = (["low", "medium", "high"] as const).includes(args.sensitivity as Sensitivity)
            ? (args.sensitivity as Sensitivity)
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
          const sensitivity = (["low", "medium", "high"] as const).includes(args.sensitivity as Sensitivity)
            ? (args.sensitivity as Sensitivity)
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
