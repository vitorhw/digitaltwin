"use client"

import type React from "react"

import { useState } from "react"
import {
  proposeFact,
  confirmFact,
  deleteFact,
  sweepExpiredFacts,
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
  generateMockData,
  checkDatabaseFunctions,
  hybridSearch,
  wipeAllUserData,
} from "@/app/actions/memory"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Trash2, RefreshCw, Sparkles, Database, AlertCircle, Search, AlertTriangle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

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
}: {
  initialFacts: Fact[]
  initialMemories: EpisodicMemory[]
  initialDocuments: Document[]
}) {
  const [facts, setFacts] = useState<Fact[]>(initialFacts)
  const [memories, setMemories] = useState<EpisodicMemory[]>(initialMemories)
  const [documents, setDocuments] = useState<Document[]>(initialDocuments)
  const [loading, setLoading] = useState(false)
  const [diagnostics, setDiagnostics] = useState<any>(null)
  const { toast } = useToast()

  // Facts state
  const [factKey, setFactKey] = useState("")
  const [factValue, setFactValue] = useState("")
  const [factConfidence, setFactConfidence] = useState("0.9")
  const [factSensitivity, setFactSensitivity] = useState<"low" | "medium" | "high">("low")
  const [factTtl, setFactTtl] = useState("")
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

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

  // Search state and functionality
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({ title: "Error", description: "Please enter a search query", variant: "destructive" })
      return
    }

    setSearching(true)
    const result = await hybridSearch(searchQuery, 20)

    if (result.results) {
      setSearchResults(result.results)
      toast({ title: "Search complete", description: `Found ${result.results.length} results` })
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setSearching(false)
  }

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

  const refreshAll = async () => {
    setLoading(true)
    const [factsResult, memoriesResult, documentsResult] = await Promise.all([
      getCurrentFacts(),
      getEpisodicMemories(),
      getDocuments(),
    ])

    if (factsResult.facts) setFacts(factsResult.facts)
    if (memoriesResult.memories) setMemories(memoriesResult.memories)
    if (documentsResult.documents) setDocuments(documentsResult.documents)

    toast({ title: "Data refreshed" })
    setLoading(false)
  }

  const refreshFacts = async () => {
    setLoading(true)
    const result = await getCurrentFacts()
    if (result.facts) {
      setFacts(result.facts)
      toast({ title: "Facts refreshed" })
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }

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

  const handleSweepExpired = async () => {
    setLoading(true)
    const result = await sweepExpiredFacts()

    if (result.success) {
      toast({
        title: "Expired facts swept",
        description: `Deleted ${result.deletedCount} expired fact(s)`,
      })
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

  const handleApproveFact = async (key: string) => {
    setLoading(true)
    const result = await approveFact(key)

    if (result.success) {
      toast({ title: "Fact approved", description: `Key: ${key}` })
      await refreshFacts()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }

  const handleRejectFact = async (key: string) => {
    setLoading(true)
    const result = await rejectFact(key)

    if (result.success) {
      toast({ title: "Fact rejected", description: `Key: ${key}` })
      await refreshFacts()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }

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

  const handleApproveMemory = async (id: string) => {
    setLoading(true)
    const result = await approveEpisodicMemory(id)

    if (result.success) {
      toast({ title: "Memory approved" })
      await refreshAll()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }

  const handleRejectMemory = async (id: string) => {
    setLoading(true)
    const result = await rejectEpisodicMemory(id)

    if (result.success) {
      toast({ title: "Memory rejected" })
      await refreshAll()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }

  const handleInsertDocument = async () => {
    if (!docUri || !docTitle || !docText) {
      toast({ title: "Error", description: "URI, title, and text are required", variant: "destructive" })
      return
    }

    setLoading(true)
    const pageNumber = docPage ? Number.parseInt(docPage) : undefined

    const result = await insertDocumentChunk(docUri, docTitle, docText, docSection || undefined, pageNumber)

    if (result.success) {
      toast({ title: "Document chunk inserted" })
      setDocUri("")
      setDocTitle("")
      setDocText("")
      setDocSection("")
      setDocPage("")
      await refreshAll()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }

  const handleDeleteDocument = async (id: string) => {
    setLoading(true)
    const result = await deleteDocument(id)

    if (result.success) {
      toast({ title: "Document deleted" })
      await refreshAll()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }

  const handleGenerateMockData = async () => {
    if (!confirm("This will generate 20 facts and 500 episodic memories. This may take a few minutes. Continue?")) {
      return
    }

    setLoading(true)
    toast({ title: "Generating mock data...", description: "This may take a few minutes" })

    const result = await generateMockData()

    if (result.success) {
      toast({ title: "Success", description: result.message })
      await refreshAll()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }

  // Function to check all database functions
  const handleCheckFunctions = async (e?: React.MouseEvent) => {
    e?.preventDefault()
    setLoading(true)
    toast({ title: "Checking database functions...", description: "This may take a moment" })

    const result = await checkDatabaseFunctions()

    if (result.success) {
      setDiagnostics(result.diagnostics)
      const hasErrors = result.diagnostics.some((d: any) => d.status === "error")
      toast({
        title: hasErrors ? "Issues found" : "All functions OK",
        description: hasErrors
          ? "Check the diagnostics panel for details"
          : "All database functions are working correctly",
        variant: hasErrors ? "destructive" : "default",
      })
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-4 border-b space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleGenerateMockData}
            variant="default"
            size="sm"
            disabled={loading}
            className="flex-1 min-w-[140px]"
          >
            <Database className="h-4 w-4 mr-2" />
            Mock Data
          </Button>
          <Button
            onClick={handleCheckFunctions}
            variant="outline"
            size="sm"
            disabled={loading}
            className="flex-1 min-w-[140px] bg-transparent"
          >
            <AlertCircle className="h-4 w-4 mr-2" />
            Check Functions
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleSweepExpired}
            variant="outline"
            size="sm"
            disabled={loading}
            className="flex-1 min-w-[100px] bg-transparent"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Sweep Expired
          </Button>
          <Button
            onClick={refreshAll}
            variant="outline"
            size="sm"
            disabled={loading}
            className="flex-1 min-w-[100px] bg-transparent"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={handleWipeData}
            variant="destructive"
            size="sm"
            disabled={loading}
            className="flex-1 min-w-[100px]"
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Wipe Data
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {diagnostics && (
          <Card>
            <CardHeader>
              <CardTitle>Database Function Diagnostics</CardTitle>
              <CardDescription>Status of all database functions and indexes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {diagnostics.map((diag: any, i: number) => (
                  <Alert key={i} variant={diag.status === "error" ? "destructive" : "default"}>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{diag.name}</AlertTitle>
                    <AlertDescription>
                      <div className="text-sm">
                        <div>
                          Status:{" "}
                          <Badge variant={diag.status === "ok" ? "default" : "destructive"}>{diag.status}</Badge>
                        </div>
                        {diag.message && <div className="mt-1">{diag.message}</div>}
                        {diag.error && (
                          <div className="mt-1 text-destructive font-mono text-xs break-all">{diag.error}</div>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Search Memories</CardTitle>
            <CardDescription>Hybrid search across facts, episodic memories, and documents</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search for memories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearch()
                    }
                  }}
                  className="flex-1"
                />
                <Button onClick={handleSearch} disabled={searching || !searchQuery.trim()} size="sm">
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Results ({searchResults.length})</div>
                  {searchResults.map((result, i) => (
                    <div key={i} className="border rounded-lg p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{result.source}</Badge>
                        <span className="text-xs text-muted-foreground">
                          Score: {(result.combined_score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-sm">{result.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="facts" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="facts">Facts ({facts.length})</TabsTrigger>
            <TabsTrigger value="episodic">Episodic ({memories.length})</TabsTrigger>
            <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="facts" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Facts</CardTitle>
                    <CardDescription>All profile facts in the database</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {facts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No facts found</p>
                  ) : (
                    facts.map((fact) => (
                      <div key={fact.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-sm font-semibold">{fact.key}</span>
                              <Badge variant={fact.status === "confirmed" ? "default" : "secondary"}>
                                {fact.status}
                              </Badge>
                              <Badge variant="outline">{fact.sensitivity}</Badge>
                              {fact.schema_name && <Badge variant="secondary">{fact.schema_name}</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {typeof fact.value === "object" ? JSON.stringify(fact.value) : fact.value}
                            </p>
                            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                              <span>Confidence: {(fact.confidence * 100).toFixed(0)}%</span>
                              {fact.ttl_days && <span>TTL: {fact.ttl_days} days</span>}
                              {fact.expires_at && (
                                <span>Expires: {new Date(fact.expires_at).toLocaleDateString()}</span>
                              )}
                              {fact.fact_date && <span>Date: {new Date(fact.fact_date).toLocaleDateString()}</span>}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {fact.status === "candidate" && (
                              <>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => handleApproveFact(fact.key)}
                                  disabled={loading}
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRejectFact(fact.key)}
                                  disabled={loading}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            {fact.status === "confirmed" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteFact(fact.key)}
                                disabled={loading}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Insert Fact</CardTitle>
                <CardDescription>Create a new fact with optional confirmation requirement</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fact-key">Key</Label>
                      <Input
                        id="fact-key"
                        placeholder="e.g., favorite_color"
                        value={factKey}
                        onChange={(e) => setFactKey(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fact-value">Value</Label>
                      <Input
                        id="fact-value"
                        placeholder="e.g., blue"
                        value={factValue}
                        onChange={(e) => setFactValue(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fact-confidence">Confidence (0-1)</Label>
                      <Input
                        id="fact-confidence"
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={factConfidence}
                        onChange={(e) => setFactConfidence(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fact-sensitivity">Sensitivity</Label>
                      <Select value={factSensitivity} onValueChange={(v: any) => setFactSensitivity(v)}>
                        <SelectTrigger id="fact-sensitivity">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fact-ttl">TTL (days, optional)</Label>
                      <Input
                        id="fact-ttl"
                        type="number"
                        placeholder="e.g., 30"
                        value={factTtl}
                        onChange={(e) => setFactTtl(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="needs-confirmation"
                      checked={needsConfirmation}
                      onCheckedChange={(checked) => setNeedsConfirmation(checked as boolean)}
                    />
                    <Label htmlFor="needs-confirmation" className="text-sm font-normal cursor-pointer">
                      Needs confirmation (insert as candidate)
                    </Label>
                  </div>
                  <Button onClick={handleInsertFact} disabled={loading}>
                    {needsConfirmation ? "Insert Candidate Fact" : "Insert Confirmed Fact"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="episodic" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Episodic Memories</CardTitle>
                <CardDescription>Events and experiences</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {memories.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No memories found</p>
                  ) : (
                    memories.map((memory) => (
                      <div key={memory.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm">{memory.text}</p>
                            <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                              <span>Confidence: {(memory.confidence * 100).toFixed(0)}%</span>
                              <span>Occurred: {new Date(memory.occurred_at).toLocaleDateString()}</span>
                              {memory.location && <span>Location: {memory.location}</span>}
                              {memory.emotional_valence !== null && memory.emotional_valence !== undefined && (
                                <span>
                                  Emotion: {memory.emotional_valence > 0 ? "+" : ""}
                                  {memory.emotional_valence.toFixed(1)}
                                </span>
                              )}
                              {memory.importance !== null && memory.importance !== undefined && (
                                <span>Importance: {memory.importance.toFixed(1)}</span>
                              )}
                              {memory.recall_count !== null && memory.recall_count !== undefined && (
                                <span>Recalls: {memory.recall_count}</span>
                              )}
                              {memory.memory_strength !== null && memory.memory_strength !== undefined && (
                                <span>Strength: {memory.memory_strength.toFixed(2)}</span>
                              )}
                              {memory.last_recalled_at && (
                                <span>Last recalled: {new Date(memory.last_recalled_at).toLocaleDateString()}</span>
                              )}
                              <Badge variant="outline" className="ml-auto">
                                {memory.provenance_kind}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {memory.provenance_kind === "ai_proposed" && (
                              <>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => handleApproveMemory(memory.id)}
                                  disabled={loading}
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRejectMemory(memory.id)}
                                  disabled={loading}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteMemory(memory.id)}
                              disabled={loading}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Insert Episodic Memory</CardTitle>
                <CardDescription>Create a new memory with optional confirmation requirement</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="episodic-text">Text</Label>
                    <Textarea
                      id="episodic-text"
                      placeholder="Describe the event or experience..."
                      value={episodicText}
                      onChange={(e) => setEpisodicText(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="episodic-confidence">Confidence (0-1)</Label>
                      <Input
                        id="episodic-confidence"
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={episodicConfidence}
                        onChange={(e) => setEpisodicConfidence(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="episodic-location">Location (optional)</Label>
                      <Input
                        id="episodic-location"
                        placeholder="e.g., San Francisco"
                        value={episodicLocation}
                        onChange={(e) => setEpisodicLocation(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="episodic-needs-confirmation"
                      checked={episodicNeedsConfirmation}
                      onCheckedChange={(checked) => setEpisodicNeedsConfirmation(checked as boolean)}
                    />
                    <Label htmlFor="episodic-needs-confirmation" className="text-sm font-normal cursor-pointer">
                      Needs confirmation (insert as candidate)
                    </Label>
                  </div>
                  <Button onClick={handleInsertEpisodic} disabled={loading}>
                    {episodicNeedsConfirmation ? "Insert Candidate Memory" : "Insert Confirmed Memory"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Document Chunks</CardTitle>
                <CardDescription>Stored document fragments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {documents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No documents found</p>
                  ) : (
                    documents.map((doc) => (
                      <div key={doc.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-sm">{doc.doc_title}</span>
                              <Badge variant="outline">{doc.doc_uri}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">{doc.text}</p>
                            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                              {doc.section_path && <span>Section: {doc.section_path}</span>}
                              {doc.page_number && <span>Page: {doc.page_number}</span>}
                              <span>Created: {new Date(doc.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDocument(doc.id)}
                            disabled={loading}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Insert Document Chunk</CardTitle>
                <CardDescription>Add a new document fragment</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="doc-uri">URI</Label>
                      <Input
                        id="doc-uri"
                        placeholder="e.g., /docs/guide.pdf"
                        value={docUri}
                        onChange={(e) => setDocUri(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="doc-title">Title</Label>
                      <Input
                        id="doc-title"
                        placeholder="e.g., User Guide"
                        value={docTitle}
                        onChange={(e) => setDocTitle(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc-text">Text</Label>
                    <Textarea
                      id="doc-text"
                      placeholder="Document content..."
                      value={docText}
                      onChange={(e) => setDocText(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="doc-section">Section Path (optional)</Label>
                      <Input
                        id="doc-section"
                        placeholder="e.g., Chapter 1 > Introduction"
                        value={docSection}
                        onChange={(e) => setDocSection(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="doc-page">Page Number (optional)</Label>
                      <Input
                        id="doc-page"
                        type="number"
                        placeholder="e.g., 5"
                        value={docPage}
                        onChange={(e) => setDocPage(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button onClick={handleInsertDocument} disabled={loading}>
                    Insert Document Chunk
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
