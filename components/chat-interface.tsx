"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"

type Role = "user" | "assistant"
type MemoryOpName =
  | "propose_fact"
  | "confirm_fact"
  | "propose_episodic"
  | "confirm_episodic"
  | "search_memory"
  | "retrieved_facts"
type MemoryOpStatus = "ok" | "ignored" | "error"

type MemoryOp = {
  id: string
  name: MemoryOpName
  args: Record<string, unknown>
  status?: MemoryOpStatus
  retrieved_data?: any
}

interface Bubble {
  role: Role
  text: string
  ops?: MemoryOp[]
}

function decodeOpsFromHeaders(headers: Headers): MemoryOp[] {
  const raw = headers.get("x-memory-ops")
  if (!raw) return []
  try {
    const json = typeof atob === "function" ? atob(raw) : raw
    const parsed = JSON.parse(json) as Array<Record<string, unknown>>
    return parsed
      .map((x) => {
        const id = typeof x?.id === "string" ? x.id : crypto.randomUUID()
        const name = x?.name
        const args = (x?.args ?? {}) as Record<string, unknown>
        const status = (x?.status as MemoryOpStatus) ?? undefined
        const retrieved_data = x?.retrieved_data
        if (
          name === "propose_fact" ||
          name === "confirm_fact" ||
          name === "propose_episodic" ||
          name === "confirm_episodic" ||
          name === "search_memory" ||
          name === "retrieved_facts"
        ) {
          return { id, name, args, status, retrieved_data } as MemoryOp
        }
        return null
      })
      .filter((x): x is MemoryOp => x !== null)
  } catch {
    return []
  }
}

export function ChatInterface() {
  const [input, setInput] = useState("")
  const [log, setLog] = useState<Bubble[]>([])
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const { toast } = useToast()

  const [expandedRemembered, setExpandedRemembered] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [log])

  async function send() {
    const userText = input.trim()
    if (!userText) return

    setInput("")
    setBusy(true)

    setLog((v) => [...v, { role: "user", text: userText }, { role: "assistant", text: "" }])

    let opsAttached = false
    let opsCache: MemoryOp[] = []

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText }),
      })

      opsCache = decodeOpsFromHeaders(r.headers)

      if (!r.ok || !r.body) {
        const errorMsg = await r.text()
        setLog((v) => {
          const copy = [...v]
          copy[copy.length - 1] = {
            role: "assistant",
            text: `Error: ${errorMsg}`,
            ops: [],
          }
          return copy
        })
        toast({
          title: "Error",
          description: errorMsg,
          variant: "destructive",
        })
        setBusy(false)
        return
      }

      const reader = r.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          const chunk = decoder.decode(value)

          setLog((v) => {
            const copy = [...v]
            const last = copy[copy.length - 1]
            const withOps = opsAttached ? last.ops : opsCache
            opsAttached = true
            copy[copy.length - 1] = {
              role: "assistant",
              text: last.text + chunk,
              ops: withOps,
            }
            return copy
          })
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setLog((v) => {
        const copy = [...v]
        copy[copy.length - 1] = {
          role: "assistant",
          text: `Error: ${msg}`,
          ops: [],
        }
        return copy
      })
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        <div className="mx-auto max-w-3xl space-y-4">
          {log.map((b, i) => (
            <div key={i} className={b.role === "user" ? "text-right" : "text-left"}>
              <span
                className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm ${
                  b.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {b.text}
              </span>

              {b.role === "assistant" && b.ops && b.ops.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {b.ops.map((op) => {
                    const keyArg = typeof op.args.key === "string" ? op.args.key : undefined
                    const textArg = typeof op.args.text === "string" ? op.args.text : undefined
                    const queryArg = typeof op.args.query === "string" ? op.args.query : undefined

                    if (op.name === "retrieved_facts" && op.retrieved_data) {
                      const facts = Array.isArray(op.retrieved_data) ? op.retrieved_data : []
                      const isExpanded = expandedRemembered.has(op.id)
                      const displayCount = isExpanded ? facts.length : 3

                      return (
                        <div key={op.id} className="w-full">
                          <span className="inline-block rounded border border-purple-300 bg-purple-50 px-2 py-1 text-xs text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400">
                            <b>Remembered</b> • {facts.length} fact(s)
                          </span>
                          {facts.length > 0 && (
                            <div className="mt-1 space-y-1">
                              {facts.slice(0, displayCount).map((fact: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="rounded border border-purple-200 bg-purple-50/50 px-2 py-1 text-xs text-purple-600 dark:border-purple-900 dark:bg-purple-950/50 dark:text-purple-400"
                                  title={JSON.stringify(fact)}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-1 mb-0.5">
                                        <Badge variant="outline" className="text-[10px] h-4 px-1">
                                          fact
                                        </Badge>
                                        {fact.confidence && (
                                          <span className="text-[10px] text-muted-foreground">
                                            {(fact.confidence * 100).toFixed(0)}%
                                          </span>
                                        )}
                                      </div>
                                      <p className="line-clamp-2">
                                        <b>{fact.key}:</b> {JSON.stringify(fact.value)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {facts.length > 3 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full h-6 text-xs"
                                  onClick={() => {
                                    setExpandedRemembered((prev) => {
                                      const next = new Set(prev)
                                      if (isExpanded) {
                                        next.delete(op.id)
                                      } else {
                                        next.add(op.id)
                                      }
                                      return next
                                    })
                                  }}
                                >
                                  {isExpanded ? "Show less" : `+${facts.length - 3} more`}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    }

                    if (op.name === "search_memory" && op.retrieved_data) {
                      const results = Array.isArray(op.retrieved_data) ? op.retrieved_data : []
                      const isExpanded = expandedRemembered.has(op.id)
                      const displayCount = isExpanded ? results.length : 3

                      return (
                        <div key={op.id} className="w-full">
                          <span className="inline-block rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400">
                            <b>Remembered</b> • {results.length} item(s)
                          </span>
                          {results.length > 0 && (
                            <div className="mt-1 space-y-1">
                              {results.slice(0, displayCount).map((item: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="rounded border border-blue-200 bg-blue-50/50 px-2 py-1 text-xs text-blue-600 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-400"
                                  title={JSON.stringify(item)}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-1 mb-0.5">
                                        <Badge variant="outline" className="text-[10px] h-4 px-1">
                                          {item.source}
                                        </Badge>
                                        {item.combined_score && (
                                          <span className="text-[10px] text-muted-foreground">
                                            {(item.combined_score * 100).toFixed(0)}%
                                          </span>
                                        )}
                                      </div>
                                      <p className="line-clamp-2">{item.text}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {results.length > 3 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full h-6 text-xs"
                                  onClick={() => {
                                    setExpandedRemembered((prev) => {
                                      const next = new Set(prev)
                                      if (isExpanded) {
                                        next.delete(op.id)
                                      } else {
                                        next.add(op.id)
                                      }
                                      return next
                                    })
                                  }}
                                >
                                  {isExpanded ? "Show less" : `+${results.length - 3} more`}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    }

                    const statusColor =
                      op.status === "error"
                        ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                        : op.status === "ignored"
                          ? "border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                          : "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"

                    return (
                      <span
                        key={op.id}
                        className={`rounded border px-2 py-1 text-xs ${statusColor}`}
                        title={JSON.stringify(op.args)}
                      >
                        <b>{op.name}</b>
                        {keyArg ? <> • {keyArg}</> : null}
                        {textArg ? <> • "{textArg.slice(0, 40)}"</> : null}
                        {queryArg ? <> • "{queryArg.slice(0, 40)}"</> : null}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-muted px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t p-4 flex-shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          className="mx-auto flex max-w-3xl gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={busy}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  )
}
