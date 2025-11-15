"use client"

import type React from "react"

import { useCallback, useEffect, useState } from "react"
import {
  proposeFact,
  confirmFact,
  deleteFact,
  getCurrentFacts,
  approveFact,
  rejectFact,
  proposeEpisodic,
  confirmEpisodic,
  getEpisodicMemories,
  deleteEpisodicMemory,
  approveEpisodicMemory,
  rejectEpisodicMemory,
  getDocuments,
  deleteDocument,
  insertDocumentChunk,
  hybridMagnifyingGlass,
  checkDatabaseFunctions,
  wipeAllUserData,
  type DiagnosticsArtifacts,
} from "@/app/actions/memory"
import { getProceduralRules, type ProceduralRule } from "@/app/actions/procedural-rules"
import type { CommunicationStyle } from "@/app/actions/style"
import { useAvatar } from "@/components/avatar-context"
import { StyleConfigPanel } from "@/components/style-config-panel"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Trash, WarningCircle, Warning, SpinnerGap, MagnifyingGlass } from '@phosphor-icons/react'
import { useToast } from "@/hooks/use-toast"
import { useVoiceClone } from "@/components/voice-clone-provider"
import { CoquiConsole } from "@/components/coqui-console"

interface Fact {
  id: string
  key: string
  value: any
  confidence: number
  status: string
  sensitivity: string
  ttl_days?: number
  expires_at?: string
  created_at: string
  updated_at: string
  schema_name?: string
  fact_date?: string
}

interface EpisodicMemory {
  id: string
  text: string
  confidence: number
  occurred_at: string
  location?: string
  provenance_kind: string
  created_at: string
  emotional_valence?: number
  importance?: number
  recall_count?: number
  memory_strength?: number
  last_recalled_at?: string
}

interface Document {
  id: string
  doc_uri: string
  doc_title: string
  text: string
  section_path?: string
  page_number?: number
  created_at: string
}

export function DebugFactsPanel({
  initialFacts,
  initialMemories,
  initialDocuments,
  initialRules,
  initialStyle,
  onStyleChange,
  onWipeConfigurations,
}: {
  initialFacts: Fact[]
  initialMemories: EpisodicMemory[]
  initialDocuments: Document[]
  initialRules: ProceduralRule[]
  initialStyle?: CommunicationStyle | null
  onStyleChange?: (style: CommunicationStyle | null) => void
  onWipeConfigurations?: () => Promise<void> | void
}) {
  const [mounted, setMounted] = useState(false)
  const [facts, setFacts] = useState<Fact[]>(initialFacts)
  const [memories, setMemories] = useState<EpisodicMemory[]>(initialMemories)
  const [documents, setDocuments] = useState<Document[]>(initialDocuments)
  const [rules, setRules] = useState<ProceduralRule[]>(initialRules)
  const [loading, setLoading] = useState(false)
  const [diagnostics, setDiagnostics] = useState<any>(null)
  const { toast } = useToast()
  const { setMeshData, setFeatures, setTextureUrl, setAudioUrl, setVoice } = useAvatar()
  const { updateProfile, setSpeakBackEnabledLocal, voiceStyle, setVoiceStyle } = useVoiceClone()

  // Facts state
  const [factKey, setFactKey] = useState("")
  const [factValue, setFactValue] = useState("")
  const [factConfidence, setFactConfidence] = useState("0.9")
  const [factSensitivity, setFactSensitivity] = useState<"low" | "medium" | "high">("low")
  const [factTtl, setFactTtl] = useState("")
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [wipingConfigs, setWipingConfigs] = useState(false)

  // Episodic state
  const [episodicText, setEpisodicText] = useState("")
  const [episodicConfidence, setEpisodicConfidence] = useState("0.9")
  const [episodicLocation, setEpisodicLocation] = useState("")
  const [episodicNeedsConfirmation, setEpisodicNeedsConfirmation] = useState(false)

  // Document state
  const [docUri, setDocUri] = useState("")
  const [docTitle, setDocTitle] = useState("")
  const [docText, setDocText] = useState("")
  const [docSection, setDocSection] = useState("")
  const [docPage, setDocPage] = useState("")

  // Function diagnostics state
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  const applyDiagnosticsArtifacts = useCallback(
    (artifacts?: DiagnosticsArtifacts | null) => {
      if (!artifacts) return
      if (artifacts.avatarMesh) {
        setMeshData(artifacts.avatarMesh)
      }
      if (artifacts.avatarFeatures) {
        setFeatures(artifacts.avatarFeatures)
      }
      if (artifacts.avatarTextureDataUrl) {
        setTextureUrl(artifacts.avatarTextureDataUrl)
      }
      if (artifacts.voiceProfile) {
        updateProfile(artifacts.voiceProfile)
        setSpeakBackEnabledLocal(artifacts.voiceProfile.speak_back_enabled)
        setVoice("coqui")
      }
      if (artifacts.voiceAudioDataUrl) {
        setAudioUrl(artifacts.voiceAudioDataUrl)
      }
    },
    [setMeshData, setFeatures, setTextureUrl, setAudioUrl, updateProfile, setSpeakBackEnabledLocal, setVoice],
  )

  // Wipe data functionality
  const handleWipeData = async (e?: React.MouseEvent) => {
    e?.preventDefault()

    console.log("[v0] Wipe data button clicked")
    setLoading(true)

    try {
      const result = await wipeAllUserData()
      console.log("[v0] Wipe data result:", result)

      if (result.success) {
        toast({ title: "Success", description: result.message })
        await refreshAll()
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } catch (error) {
      console.error("[v0] Exception in handleWipeData:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to wipe data",
        variant: "destructive",
      })
    }

    setLoading(false)
  }

  const refreshAll = useCallback(async () => {
    setLoading(true)
    const [factsResult, memoriesResult, documentsResult, rulesResult] = await Promise.all([
      getCurrentFacts(),
      getEpisodicMemories(),
      getDocuments(),
      getProceduralRules(),
    ])

    if (factsResult.facts) setFacts(factsResult.facts)
    if (memoriesResult.memories) setMemories(memoriesResult.memories)
    if (documentsResult.documents) setDocuments(documentsResult.documents)
    if (rulesResult.rules) setRules(rulesResult.rules)

    setLoading(false)
  }, [toast])

  const refreshFacts = useCallback(async () => {
    setLoading(true)
    const result = await getCurrentFacts()
    if (result.facts) {
      setFacts(result.facts)
      toast({ title: "Facts refreshed" })
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }, [toast])

  const handleInsertFact = async () => {
    if (!factKey || !factValue) {
      toast({ title: "Error", description: "Key and value are required", variant: "destructive" })
      return
    }

    setLoading(true)
    const ttlDays = factTtl ? Number.parseInt(factTtl) : undefined
    const confidence = Number.parseFloat(factConfidence)

    // Use proposeFact for candidate, confirmFact for confirmed
    const result = needsConfirmation
      ? await proposeFact(factKey, factValue, confidence, factSensitivity, ttlDays)
      : await confirmFact(factKey, factValue, confidence, factSensitivity, ttlDays)

    if (result.success) {
      toast({
        title: needsConfirmation ? "Candidate fact inserted" : "Confirmed fact inserted",
        description: `Key: ${factKey}`,
      })
      setFactKey("")
      setFactValue("")
      setFactTtl("")
      await refreshFacts()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }

  const handleDeleteFact = async (key: string) => {
    setLoading(true)
    const result = await deleteFact(key)

    if (result.success) {
      toast({ title: "Fact deleted", description: `Key: ${key}` })
      await refreshFacts()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }

  const handleApproveFact = useCallback(async (key: string) => {
    setLoading(true)
    const result = await approveFact(key)

    if (result.success) {
      toast({ title: "Fact approved", description: `Key: ${key}` })
      await refreshFacts()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }, [refreshFacts, toast])

  const handleRejectFact = useCallback(async (key: string) => {
    setLoading(true)
    const result = await rejectFact(key)

    if (result.success) {
      toast({ title: "Fact rejected", description: `Key: ${key}` })
      await refreshFacts()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }, [refreshFacts, toast])

  const handleInsertEpisodic = async () => {
    if (!episodicText) {
      toast({ title: "Error", description: "Text is required", variant: "destructive" })
      return
    }

    setLoading(true)
    const confidence = Number.parseFloat(episodicConfidence)

    const result = episodicNeedsConfirmation
      ? await proposeEpisodic(episodicText, confidence, undefined, episodicLocation || undefined)
      : await confirmEpisodic(episodicText, confidence, undefined, episodicLocation || undefined)

    if (result.success) {
      toast({
        title: episodicNeedsConfirmation ? "Candidate memory inserted" : "Confirmed memory inserted",
      })
      setEpisodicText("")
      setEpisodicLocation("")
      await refreshAll()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }

  const handleDeleteMemory = async (id: string) => {
    setLoading(true)
    const result = await deleteEpisodicMemory(id)

    if (result.success) {
      toast({ title: "Memory deleted" })
      await refreshAll()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }

  const handleApproveMemory = useCallback(async (id: string) => {
    setLoading(true)
    const result = await approveEpisodicMemory(id)

    if (result.success) {
      toast({ title: "Memory approved" })
      await refreshAll()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }, [refreshAll, toast])

  const [searchQuery, setMagnifyingGlassQuery] = useState("")
  const [searchResults, setMagnifyingGlassResults] = useState<any[]>([])
  const [searching, setMagnifyingGlassing] = useState(false)

  const handleMagnifyingGlass = async () => {
    if (!searchQuery.trim()) {
      toast({ title: "Need a query", description: "Type anything to search memories.", variant: "destructive" })
      return
    }

    setMagnifyingGlassing(true)
    const result = await hybridMagnifyingGlass(searchQuery, 12)
    if (result.results) {
      setMagnifyingGlassResults(result.results)
      toast({ title: "MagnifyingGlass complete", description: `Found ${result.results.length} entries.` })
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setMagnifyingGlassing(false)
  }

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  useEffect(() => {
    if (typeof window === "undefined") return
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      if (Array.isArray(detail.facts)) {
        setFacts(detail.facts)
      }
      if (Array.isArray(detail.memories)) {
        setMemories(detail.memories)
      }
      if (Array.isArray(detail.rules)) {
        setRules(detail.rules)
      }
    }
    window.addEventListener("debug-data-update", handler)
    return () => {
      window.removeEventListener("debug-data-update", handler)
    }
  }, [])

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleRejectMemory = useCallback(async (id: string) => {
    setLoading(true)
    const result = await rejectEpisodicMemory(id)

    if (result.success) {
      toast({ title: "Memory rejected" })
      await refreshAll()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }, [refreshAll, toast])

  const handleCheckFunctions = async (e?: React.MouseEvent) => {
    e?.preventDefault()
    setLoading(true)
    toast({ title: "Running system diagnostics...", description: "Testing voice and avatar flows" })

    const result = await checkDatabaseFunctions()

    if (result.diagnostics) {
      setDiagnostics(result.diagnostics)
    }

    if (result.success) {
      applyDiagnosticsArtifacts(result.artifacts)
      toast({
        title: "Voice & avatar OK",
        description: "End-to-end media flow succeeded",
      })
    } else {
      toast({
        title: "Issues found",
        description: result.error || "Review the diagnostics panel for failures",
        variant: "destructive",
      })
    }
    setLoading(false)
  }

  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading debug console...
      </div>
    )
  }

  const pendingFacts = facts.filter((fact) => fact.status === "candidate").slice(0, 4)
  const pendingMemories = memories.filter((memory) => memory.provenance_kind === "ai_proposed").slice(0, 4)
  const topRules = rules.slice(0, 4)
  const recentMemories = memories.slice(0, 5)

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-1 border-b bg-muted/15 px-2 py-2">
        <div className="grid w-full grid-cols-2 gap-2 text-[11px]">
          <Button
            onClick={handleCheckFunctions}
            variant="outline"
            size="sm"
            className="h-8 justify-start gap-1"
            disabled={loading}
          >
            <WarningCircle className="mr-2 h-4 w-4" />
            Check systems
          </Button>
          <Button
            onClick={() => setVoiceStyle(voiceStyle === "90s_tv" ? "none" : "90s_tv")}
            variant={voiceStyle === "90s_tv" ? "default" : "outline"}
            size="sm"
            className="h-8 justify-start gap-1"
          >
            {voiceStyle === "90s_tv" ? "Voice filter on" : "Voice filter off"}
          </Button>
          <Button
            onClick={handleWipeData}
            variant="destructive"
            size="sm"
            className="h-8 justify-start gap-1"
            disabled={loading}
          >
            <Warning className="mr-2 h-4 w-4" />
            Wipe data
          </Button>
          {onWipeConfigurations && (
            <Button
              onClick={async () => {
                if (!onWipeConfigurations) return
                setWipingConfigs(true)
                try {
                  await onWipeConfigurations()
                } catch (error) {
                  const message = error instanceof Error ? error.message : String(error)
                  toast({ title: "Error", description: message, variant: "destructive" })
                } finally {
                  setWipingConfigs(false)
                }
              }}
              variant="secondary"
              size="sm"
              className="h-8 justify-start gap-1"
              disabled={loading || wipingConfigs}
            >
              {wipingConfigs ? <SpinnerGap className="mr-2 h-4 w-4 animate-spin" /> : <Trash className="mr-2 h-4 w-4" />}
              Reset setup
            </Button>
          )}
        </div>
        {diagnostics && (
          <div className="rounded border bg-background/80 px-2 py-1 text-[10px]" role="status" aria-live="polite">
            {diagnostics.map((diag: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span>{diag.name}</span>
                <Badge variant={diag.status === "ok" ? "secondary" : "destructive"}>{diag.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1 border-b bg-muted/10 px-2 py-2">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Hybrid search</p>
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setMagnifyingGlassQuery(e.target.value)}
              placeholder="MagnifyingGlass facts, memories, docs..."
              className="h-8 text-xs"
            />
            <Button onClick={handleMagnifyingGlass} disabled={searching} size="sm" className="h-8 px-3 text-[11px]">
              {searching ? <SpinnerGap className="mr-1 h-4 w-4 animate-spin" /> : <MagnifyingGlass className="mr-1 h-4 w-4" />}
              Go
            </Button>
          </div>
          {searchResults.length > 0 && (
            <div className="max-h-24 space-y-1 overflow-y-auto pr-1 text-[11px]">
              {searchResults.map((result, index) => (
                <div key={`${result.source}-${index}`} className="rounded border bg-background/80 px-2 py-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{result.source}</span>
                    <span className="text-muted-foreground">{(result.combined_score * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-muted-foreground">{result.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 p-3 text-sm">
        <section className="rounded-lg border bg-background/80 p-3">
          <header className="mb-2 space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Communication style</p>
            <p className="text-sm font-medium">Manual override</p>
            <p className="text-xs text-muted-foreground">
              The setup wizard only asks for a chat log—edit every field here.
            </p>
          </header>
          <div className="rounded-2xl border bg-background/70 p-2">
            <StyleConfigPanel initialStyle={initialStyle ?? null} onStyleChange={onStyleChange} />
          </div>
        </section>

        <section className="rounded-lg border bg-background/80 p-3">
          <header className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase text-muted-foreground tracking-wide">Facts</p>
              <p className="text-sm font-medium">{pendingFacts.length ? "Pending approval" : "No pending facts"}</p>
            </div>
            <Badge variant="outline">{facts.length} total</Badge>
          </header>
          <div className="space-y-2">
            {pendingFacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Incoming facts will appear here for quick approval.</p>
            ) : (
              pendingFacts.map((fact) => (
                <div key={fact.id} className="rounded border px-2 py-2">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium">
                    <span className="truncate">{fact.key}</span>
                    <Badge variant="outline">{fact.sensitivity}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground break-words">
                    {typeof fact.value === "object" ? JSON.stringify(fact.value) : fact.value}
                  </p>
                  <div className="mt-2 flex gap-2 text-xs">
                    <Button
                      variant="default"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleApproveFact(fact.key)}
                      disabled={loading}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleRejectFact(fact.key)}
                      disabled={loading}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border bg-background/80 p-3">
          <header className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase text-muted-foreground tracking-wide">Episodic memories</p>
              <p className="text-sm font-medium">
                {pendingMemories.length ? "Needs review" : "Nothing waiting"}
              </p>
            </div>
            <Badge variant="outline">{memories.length} stored</Badge>
          </header>
          <div className="space-y-2">
            {pendingMemories.length === 0 ? (
              <p className="text-xs text-muted-foreground">When new events are proposed they will queue up here.</p>
            ) : (
              pendingMemories.map((memory) => (
                <div key={memory.id} className="rounded border px-2 py-2">
                  <p className="text-xs font-medium">{memory.text}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(memory.occurred_at).toLocaleDateString()}
                    {memory.location ? ` · ${memory.location}` : ""}
                  </p>
                  <div className="mt-2 flex gap-2 text-xs">
                    <Button
                      variant="default"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleApproveMemory(memory.id)}
                      disabled={loading}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleRejectMemory(memory.id)}
                      disabled={loading}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border bg-background/80 p-3">
          <header className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase text-muted-foreground tracking-wide">Procedural hints</p>
              <p className="text-sm font-medium">Top habits & rules</p>
            </div>
            <Badge variant="outline">{rules.length} total</Badge>
          </header>
          <div className="space-y-2">
            {topRules.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active procedural rules yet.</p>
            ) : (
              topRules.map((rule) => (
                <div key={rule.id} className="rounded border px-2 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary">{rule.rule_type}</Badge>
                    <span>Confidence {(rule.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <p className="mt-1 font-medium">{rule.action}</p>
                  {rule.condition && <p className="text-muted-foreground">When: {rule.condition}</p>}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border bg-background/80 p-3">
          <header className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase text-muted-foreground tracking-wide">Memory log</p>
              <p className="text-sm font-medium">Latest entries</p>
            </div>
            <Badge variant="outline">{memories.length} stored</Badge>
          </header>
          <div className="max-h-48 space-y-2 overflow-y-auto pr-1 text-xs">
            {recentMemories.length === 0 ? (
              <p className="text-muted-foreground">Memories you store will show up here for quick browsing.</p>
            ) : (
              recentMemories.map((memory) => (
                <div key={`recent-${memory.id}`} className="rounded border px-2 py-2">
                  <p className="font-medium">{memory.text}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(memory.occurred_at).toLocaleDateString()}
                    {memory.location ? ` · ${memory.location}` : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border bg-background/80 p-3 space-y-2">
          <div>
            <p className="text-[11px] uppercase text-muted-foreground tracking-wide">Voice synthesizer</p>
            <p className="text-sm font-medium">Coqui console</p>
          </div>
          <CoquiConsole />
        </section>
      </div>
    </div>
  )
}
