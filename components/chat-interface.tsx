"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { ChevronDown, ChevronUp, Loader2, Send, Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { setSpeakBackEnabled } from "@/app/actions/voice"
import { useVoiceClone } from "@/components/voice-clone-provider"
import { useAvatar } from "@/components/avatar-context"
import { AudioProgressBar } from "@/components/audio-progress-bar"

type Role = "user" | "assistant"

type MemoryOpName =
  | "propose_fact"
  | "confirm_fact"
  | "propose_episodic"
  | "confirm_episodic"
  | "search_memory"
  | "retrieved_facts"

type MemoryOpStatus = "ok" | "ignored" | "error"

interface MemoryOp {
  id: string
  name: MemoryOpName
  args: Record<string, unknown>
  status?: MemoryOpStatus
  retrieved_data?: unknown
}

interface Bubble {
  role: Role
  text: string
  ops?: MemoryOp[]
  thinking?: boolean
}

function safeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

function decodeOpsFromHeaders(headers: Headers): MemoryOp[] {
  const raw = headers.get("x-memory-ops")
  if (!raw) return []

  try {
  const json = typeof atob === "function" ? atob(raw) : raw
    const parsed = JSON.parse(json) as Array<Record<string, unknown>>
    return parsed
      .map((entry) => {
        const name = entry?.name
        if (
          name !== "propose_fact" &&
          name !== "confirm_fact" &&
          name !== "propose_episodic" &&
          name !== "confirm_episodic" &&
          name !== "search_memory" &&
          name !== "retrieved_facts"
        ) {
          return null
        }

        const args = (entry?.args ?? {}) as Record<string, unknown>
        const status = entry?.status as MemoryOpStatus | undefined
        const retrieved_data = entry?.retrieved_data

        const operation: MemoryOp = {
          id: typeof entry?.id === "string" ? (entry.id as string) : safeId(),
          name,
          args,
        }

        if (typeof status !== "undefined") {
          operation.status = status
        }

        if (typeof retrieved_data !== "undefined") {
          operation.retrieved_data = retrieved_data
        }

        return operation
      })
      .filter((item): item is MemoryOp => item !== null)
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
  const [expandedOps, setExpandedOps] = useState<Set<string>>(new Set())
  const [togglePending, startToggleTransition] = useTransition()
  const { profile, speakBackEnabled, setSpeakBackEnabledLocal, updateProfile, enqueueSpeech, voiceStyle } =
    useVoiceClone()
  const { avatarState, setAudioUrl } = useAvatar()

  const speakEnabled = useMemo(() => speakBackEnabled && Boolean(profile), [profile, speakBackEnabled])
  const pendingAssistantTextRef = useRef("")
  const typingIntervalRef = useRef<number | null>(null)
  const hasAvatar = Boolean(avatarState.meshData)
  const cloneVoiceId = profile?.clone_reference?.voice_id ?? null

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [log])

  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) {
        window.clearInterval(typingIntervalRef.current)
        typingIntervalRef.current = null
      }
    }
  }, [])

  const speechRequestIdRef = useRef(0)

  const handleSpeakToggle = useCallback(() => {
    if (!profile) {
      toast({ title: "No voice sample", description: "Upload a voice sample first." })
      return
    }

    startToggleTransition(async () => {
      const previous = speakBackEnabled
      setSpeakBackEnabledLocal(!previous)
      try {
        const result = await setSpeakBackEnabled(!previous)
        if (result?.error) {
          throw new Error(result.error)
        }
        updateProfile(result.profile ?? { ...profile, speak_back_enabled: !previous })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        toast({ title: "Unable to update speak-back", description: message, variant: "destructive" })
        setSpeakBackEnabledLocal(previous)
      }
    })
  }, [profile, setSpeakBackEnabledLocal, speakBackEnabled, toast, updateProfile])

  const startAssistantTyping = useCallback(
    (text: string, token: number) => {
      if (token !== speechRequestIdRef.current) {
        return
      }
      const safeText = text || ""

      if (typingIntervalRef.current) {
        window.clearInterval(typingIntervalRef.current)
        typingIntervalRef.current = null
      }

      setLog((current) => {
        if (!current.length) return current
        const next = [...current]
        const last = next[next.length - 1]
        if (!last || last.role !== "assistant") return next
        last.thinking = false
        last.text = ""
        return next
      })

      let index = 0
      const interval = Math.max(15, Math.min(50, Math.round(600 / Math.max(1, safeText.length))))

      typingIntervalRef.current = window.setInterval(() => {
        index++
        setLog((current) => {
          if (!current.length) return current
          const next = [...current]
          const last = next[next.length - 1]
          if (!last || last.role !== "assistant") return next
          last.text = safeText.slice(0, index)
          return next
        })
        if (index >= safeText.length) {
          if (typingIntervalRef.current) {
            window.clearInterval(typingIntervalRef.current)
            typingIntervalRef.current = null
          }
        }
      }, interval)
    },
    [setLog],
  )

  const playQueuedSpeech = useCallback(
    (text: string, token: number, onStartTyping?: () => void) => {
      if (token !== speechRequestIdRef.current) {
        return
      }

      onStartTyping?.()

      void enqueueSpeech(text).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        toast({ title: "Speak-back failed", description: message, variant: "destructive" })
      })
    },
    [enqueueSpeech, toast],
  )

  const send = useCallback(async () => {
    const userText = input.trim()
    if (!userText) return

    const willSpeak = speakEnabled
    setInput("")
    setBusy(true)
    setLog((current) => [
      ...current,
      { role: "user", text: userText },
      { role: "assistant", text: "", thinking: willSpeak },
    ])
    pendingAssistantTextRef.current = ""

    let shouldSpeak = true
    let opsAttached = false
    let opsCache: MemoryOp[] = []
    let fullAssistantText = ""

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, speakBack: speakEnabled }),
      })

      opsCache = decodeOpsFromHeaders(response.headers)

      if (!response.ok || !response.body) {
        const errorMsg = await response.text()
        shouldSpeak = false
        setLog((current) => {
          if (current.length === 0) return current
          const next = [...current]
          const last = next[next.length - 1]
          if (last?.role === "assistant") {
            next[next.length - 1] = { role: "assistant", text: `Error: ${errorMsg}`, ops: [] }
          }
          return next
        })
        toast({ title: "Error", description: errorMsg || "Request failed", variant: "destructive" })
        setBusy(false)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value || value.length === 0) continue

        const chunk = decoder.decode(value)
        fullAssistantText += chunk
        pendingAssistantTextRef.current += chunk

        setLog((current) => {
          if (current.length === 0) return current
          const next = [...current]
          const last = next[next.length - 1]
          if (!last || last.role !== "assistant") {
            return next
          }
          if (!opsAttached && opsCache.length > 0) {
            last.ops = opsCache
            opsAttached = true
          }
          return next
        })
      }
    } catch (error) {
      shouldSpeak = false
      const message = error instanceof Error ? error.message : String(error)
      setLog((current) => {
        if (current.length === 0) return current
        const next = [...current]
        const last = next[next.length - 1]
        if (last?.role === "assistant") {
          next[next.length - 1] = { role: "assistant", text: `Error: ${message}`, ops: [] }
        }
        return next
      })
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setBusy(false)

      if (!opsAttached && opsCache.length > 0) {
        setLog((current) => {
          if (current.length === 0) return current
          const next = [...current]
          const last = next[next.length - 1]
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, ops: opsCache }
          }
          return next
        })
      }

      const trimmedText = fullAssistantText.trim()

      if (shouldSpeak && trimmedText) {
        const playbackToken = ++speechRequestIdRef.current
        let typingStarted = false
        const ensureTypingStart = () => {
          if (typingStarted) return
          typingStarted = true
          startAssistantTyping(trimmedText, playbackToken)
        }

        // If avatar is available, use the local avatar backend TTS; otherwise use Coqui TTS
        if (hasAvatar) {
          let voiceForAvatar: string | null = null

          if (avatarState.voice === "coqui" || (!avatarState.voice && cloneVoiceId)) {
            if (cloneVoiceId) {
              voiceForAvatar = `coqui:${cloneVoiceId}`
            } else {
              toast({
                title: "No cloned voice",
                description: "Please enroll a cloned voice in Voice settings before selecting the Coqui voice.",
                variant: "destructive",
              })
            }
          } else if (avatarState.voice) {
            voiceForAvatar = avatarState.voice
          }

          if (voiceForAvatar) {
            try {
              // Use the chat response text directly for TTS
              const payload: {
                text: string
                voice: string | null
                style?: string
              } = {
                text: fullAssistantText,
                voice: voiceForAvatar,
              }
              if (voiceStyle && voiceStyle !== "none") {
                payload.style = voiceStyle
              }
              const response = await fetch("/api/face-avatar/tts", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
              })

              const data = await response.json()
              console.log("[Avatar] TTS response:", data)
              if (data.ok && data.audio) {
                // Build audio URL - handle both /static/... and static/... formats
                let audioPath = data.audio
                if (audioPath.startsWith("/static/")) {
                  audioPath = audioPath.replace("/static/", "")
                } else if (audioPath.startsWith("static/")) {
                  audioPath = audioPath.replace("static/", "")
                }
                const audioUrl = `/api/face-avatar/static/${audioPath}?t=${Date.now()}`
                console.log("[Avatar] Setting audio URL:", audioUrl, "(from:", data.audio, ")")
                if (playbackToken === speechRequestIdRef.current) {
                  setAudioUrl(audioUrl)
                  ensureTypingStart()
                }
              } else {
                console.error("[Avatar] TTS response not ok:", data)
              }
            } catch (error) {
              console.error("[Avatar] TTS failed:", error)
              // Fallback to Coqui if avatar TTS fails
              if (speakEnabled) {
                playQueuedSpeech(trimmedText, playbackToken, ensureTypingStart)
              }
            }
          } else if (speakEnabled) {
            playQueuedSpeech(trimmedText, playbackToken, ensureTypingStart)
          }
        } else if (speakEnabled) {
          playQueuedSpeech(trimmedText, playbackToken, ensureTypingStart)
        }
      } else if (trimmedText) {
        const playbackToken = ++speechRequestIdRef.current
        startAssistantTyping(trimmedText, playbackToken)
      }
    }
  }, [
    enqueueSpeech,
    input,
    speakEnabled,
    toast,
    hasAvatar,
    avatarState.voice,
    setAudioUrl,
    cloneVoiceId,
    voiceStyle,
    playQueuedSpeech,
    startAssistantTyping,
  ])

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        <div className="mx-auto max-w-3xl space-y-4">
          {log.map((bubble, index) => (
            <div key={index} className={bubble.role === "user" ? "text-right" : "text-left"}>
              <span
                className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm ${
                  bubble.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {bubble.role === "assistant" && bubble.thinking ? (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Thinking…
                  </span>
                ) : (
                  bubble.text || ""
                )}
              </span>

              {bubble.role === "assistant" && bubble.ops && bubble.ops.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...bubble.ops]
                    .sort((a, b) => {
                      const aScore = (a.retrieved_data as any)?.[0]?.combined_score || (a.args as any).confidence || 0
                      const bScore = (b.retrieved_data as any)?.[0]?.combined_score || (b.args as any).confidence || 0
                      return Number(bScore) - Number(aScore)
                    })
                    .map((op) => {
                      const keyArg = typeof op.args.key === "string" ? op.args.key : undefined
                      const valueArg = op.args.value
                      const textArg = typeof op.args.text === "string" ? op.args.text : undefined
                      const queryArg = typeof op.args.query === "string" ? op.args.query : undefined
                      const isExpanded = expandedOps.has(op.id)

                      const toggleExpanded = () => {
                        setExpandedOps((prev) => {
                          const next = new Set(prev)
                          if (isExpanded) {
                            next.delete(op.id)
                          } else {
                            next.add(op.id)
                          }
                          return next
                        })
                      }

                      if (op.name === "propose_fact" || op.name === "confirm_fact") {
                        return (
                          <div key={op.id} className="w-full">
                            <button
                              onClick={toggleExpanded}
                              className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400 dark:hover:bg-amber-900"
                            >
                              <b>{op.name === "propose_fact" ? "Proposed Fact" : "Confirmed Fact"}</b>
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                            {isExpanded && (
                              <div className="mt-1">
                                <div className="rounded border border-amber-200 bg-amber-50/50 px-2 py-1 text-xs text-amber-600 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-400">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                      <div className="mb-0.5 flex items-center gap-1">
                                        <Badge variant="outline" className="h-4 px-1 text-[10px]">
                                          fact
                                        </Badge>
                                        {typeof (op.args as any).confidence === "number" && (
                                          <span className="text-[10px] text-muted-foreground">
                                            {((op.args as any).confidence * 100).toFixed(0)}%
                                          </span>
                                        )}
                                      </div>
                                      <p className="break-words">
                                        <b>{keyArg}:</b> {JSON.stringify(valueArg)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      }

                      if (op.name === "propose_episodic" || op.name === "confirm_episodic") {
                        return (
                          <div key={op.id} className="w-full">
                            <button
                              onClick={toggleExpanded}
                              className="inline-flex items-center gap-1 rounded border border-teal-300 bg-teal-50 px-2 py-1 text-xs text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-400 dark:hover:bg-teal-900"
                            >
                              <b>{op.name === "propose_episodic" ? "Proposed Memory" : "Confirmed Memory"}</b>
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                            {isExpanded && (
                              <div className="mt-1">
                                <div className="rounded border border-teal-200 bg-teal-50/50 px-2 py-1 text-xs text-teal-600 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-400">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                      <div className="mb-0.5 flex items-center gap-1">
                                        <Badge variant="outline" className="h-4 px-1 text-[10px]">
                                          episodic
                                        </Badge>
                                        {typeof (op.args as any).confidence === "number" && (
                                          <span className="text-[10px] text-muted-foreground">
                                            {((op.args as any).confidence * 100).toFixed(0)}%
                                          </span>
                                        )}
                                      </div>
                                      <p className="break-words">{textArg}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      }

                      if (op.name === "retrieved_facts" && Array.isArray(op.retrieved_data)) {
                        const facts = op.retrieved_data as Array<Record<string, any>>
                        const displayCount = isExpanded ? facts.length : 3

                        return (
                          <div key={op.id} className="w-full">
                            <button
                              onClick={toggleExpanded}
                              className="inline-flex items-center gap-1 rounded border border-purple-300 bg-purple-50 px-2 py-1 text-xs text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400 dark:hover:bg-purple-900"
                            >
                              <b>Remembered</b> • {facts.length} fact(s)
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                            {isExpanded && facts.length > 0 && (
                              <div className="mt-1 space-y-1">
                                {[...facts]
                                  .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
                                  .slice(0, displayCount)
                                  .map((fact, factIndex) => (
                                    <div
                                      key={factIndex}
                                      className="rounded border border-purple-200 bg-purple-50/50 px-2 py-1 text-xs text-purple-600 dark:border-purple-900 dark:bg-purple-950/50 dark:text-purple-400"
                                      title={JSON.stringify(fact)}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                          <div className="mb-0.5 flex items-center gap-1">
                                            <Badge variant="outline" className="h-4 px-1 text-[10px]">
                                              fact
                                            </Badge>
                                            {fact.confidence && (
                                              <span className="text-[10px] text-muted-foreground">
                                                {(Number(fact.confidence) * 100).toFixed(0)}%
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
                                {facts.length > 3 && !isExpanded && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-full text-xs"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      setExpandedOps((prev) => new Set(prev).add(op.id))
                                    }}
                                  >
                                    +{facts.length - 3} more
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      }

                      if (op.name === "search_memory" && Array.isArray(op.retrieved_data)) {
                        const results = op.retrieved_data as Array<Record<string, any>>
                        const displayCount = isExpanded ? results.length : 3

                        return (
                          <div key={op.id} className="w-full">
                            <button
                              onClick={toggleExpanded}
                              className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400 dark:hover:bg-blue-900"
                            >
                              <b>Remembered</b> • {results.length} item(s)
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                            {isExpanded && results.length > 0 && (
                              <div className="mt-1 space-y-1">
                                {[...results]
                                  .sort((a, b) => Number(b.combined_score || 0) - Number(a.combined_score || 0))
                                  .slice(0, displayCount)
                                  .map((item, itemIndex) => (
                                    <div
                                      key={itemIndex}
                                      className="rounded border border-blue-200 bg-blue-50/50 px-2 py-1 text-xs text-blue-600 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-400"
                                      title={JSON.stringify(item)}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                          <div className="mb-0.5 flex items-center gap-1">
                                            <Badge variant="outline" className="h-4 px-1 text-[10px]">
                                              {item.source}
                                            </Badge>
                                            {item.combined_score && (
                                              <span className="text-[10px] text-muted-foreground">
                                                {(Number(item.combined_score) * 100).toFixed(0)}%
                                              </span>
                                            )}
                                          </div>
                                          <p className="line-clamp-2">{item.text}</p>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                {results.length > 3 && !isExpanded && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-full text-xs"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      setExpandedOps((prev) => new Set(prev).add(op.id))
                                    }}
                                  >
                                    +{results.length - 3} more
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
        </div>
      </div>

      <div className="flex-shrink-0 border-t p-4">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
          className="mx-auto flex max-w-3xl gap-2"
        >
          <Button
            type="button"
            variant={speakEnabled ? "default" : "outline"}
            onClick={handleSpeakToggle}
            disabled={togglePending || !profile}
            className="gap-2"
          >
            {togglePending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : speakEnabled ? (
              <>
                <Volume2 className="h-4 w-4" /> Speak
              </>
            ) : (
              <>
                <VolumeX className="h-4 w-4" /> Muted
              </>
            )}
          </Button>
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type a message..."
            disabled={busy}
            className="flex-1"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
      <AudioProgressBar />
    </div>
  )
}
