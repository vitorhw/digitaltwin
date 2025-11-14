"use client"

import { useState, useEffect } from "react"
import type { ChangeEvent } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  getCommunicationStyle,
  updateCommunicationStyle,
  deleteCommunicationStyle,
  detectConversationSpeakers,
  analyzeStyleFromConversation,
  type CommunicationStyle,
} from "@/app/actions/style"
import { Loader2, Trash2, Plus, X, Save, Upload } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const createEmptyStyle = (): CommunicationStyle => ({
  id: "",
  user_id: "",
  tone_descriptors: [],
  formality_level: "neutral",
  humor_style: null,
  common_phrases: [],
  vocabulary_level: "moderate",
  sentence_structure: "mixed",
  emoji_usage: "occasional",
  punctuation_style: null,
  paragraph_length: "moderate",
  example_messages: [],
  confidence: 0.7,
  last_analyzed_at: null,
  created_at: "",
  updated_at: "",
})

type StyleUpdate = Partial<CommunicationStyle> | ((prev: CommunicationStyle) => CommunicationStyle)

export function StyleConfigPanel({
  initialStyle,
  onStyleChange,
}: {
  initialStyle?: CommunicationStyle | null
  onStyleChange?: (style: CommunicationStyle | null) => void
}) {
  const [style, setStyle] = useState<CommunicationStyle | null>(initialStyle ?? null)
  const [loading, setLoading] = useState(initialStyle === undefined)
  const [saving, setSaving] = useState(false)
  const [newPhrase, setNewPhrase] = useState("")
  const [newTone, setNewTone] = useState("")
  const [hasChanges, setHasChanges] = useState(false)
  const [localStyle, setLocalStyle] = useState<CommunicationStyle | null>(initialStyle ?? null)
  const [conversationInput, setConversationInput] = useState("")
  const [speakerOptions, setSpeakerOptions] = useState<string[]>([])
  const [selectedSpeaker, setSelectedSpeaker] = useState("")
  const [detectingSpeakers, setDetectingSpeakers] = useState(false)
  const [analyzingConversation, setAnalyzingConversation] = useState(false)
  const [fileName, setFileName] = useState("")
  const { toast } = useToast()

  useEffect(() => {
    if (initialStyle === undefined) {
      loadStyle()
    } else {
      setStyle(initialStyle ?? null)
      setLocalStyle(initialStyle ?? null)
      setHasChanges(false)
      setLoading(false)
    }
  }, [initialStyle])

  const loadStyle = async () => {
    setLoading(true)
    const result = await getCommunicationStyle()
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      const nextStyle = result.style ?? null
      setStyle(nextStyle)
      setLocalStyle(nextStyle)
      setHasChanges(false)
      onStyleChange?.(nextStyle)
    }
    setLoading(false)
  }

  const handleSave = async () => {
    if (!localStyle) return
    const payload = sanitizeStyleForSave(localStyle)
    if (!payload) return
    setSaving(true)
    const result = await updateCommunicationStyle(payload)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      const updated = result.style as CommunicationStyle
      setStyle(updated)
      setLocalStyle(updated)
      setHasChanges(false)
      toast({ title: "Success", description: "Style saved" })
      onStyleChange?.(updated)
    }
    setSaving(false)
  }

  const updateLocalStyle = (updates: StyleUpdate) => {
    setLocalStyle((prev) => {
      const base = prev ?? createEmptyStyle()
      return typeof updates === "function" ? updates(base) : { ...base, ...updates }
    })
    setHasChanges(true)
  }

  const handleDelete = async () => {
    if (!confirm("Delete communication style configuration?")) return
    const result = await deleteCommunicationStyle()
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      setStyle(null)
      setLocalStyle(null)
      setHasChanges(false)
      toast({ title: "Success", description: "Style configuration deleted" })
      onStyleChange?.(null)
    }
  }

  const addPhrase = () => {
    if (!newPhrase.trim()) return
    const trimmed = newPhrase.trim()
    updateLocalStyle((current) => ({
      ...current,
      common_phrases: [...(current.common_phrases || []), trimmed],
    }))
    setNewPhrase("")
  }

  const removePhrase = (phrase: string) => {
    updateLocalStyle((current) => ({
      ...current,
      common_phrases: current.common_phrases?.filter((p) => p !== phrase) ?? [],
    }))
  }

  const addTone = () => {
    if (!newTone.trim()) return
    const trimmed = newTone.trim()
    updateLocalStyle((current) => ({
      ...current,
      tone_descriptors: [...(current.tone_descriptors || []), trimmed],
    }))
    setNewTone("")
  }

  const removeTone = (tone: string) => {
    updateLocalStyle((current) => ({
      ...current,
      tone_descriptors: current.tone_descriptors?.filter((t) => t !== tone) ?? [],
    }))
  }

  const handleConversationChange = (value: string) => {
    setConversationInput(value)
    setSpeakerOptions([])
    setSelectedSpeaker("")
  }

  const handleConversationUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    try {
      const text = await file.text()
      handleConversationChange(text)
    } catch (error) {
      toast({
        title: "Failed to read file",
        description: error instanceof Error ? error.message : "Please try a different conversation export.",
        variant: "destructive",
      })
    }
  }

  const handleDetectSpeakers = async () => {
    if (!conversationInput.trim()) {
      toast({ title: "Conversation required", description: "Paste or upload a transcript first.", variant: "destructive" })
      return
    }
    setDetectingSpeakers(true)
    const result = await detectConversationSpeakers(conversationInput)
    if (result.error) {
      toast({ title: "Detection failed", description: result.error, variant: "destructive" })
    } else {
      const speakers = result.speakers ?? []
      setSpeakerOptions(speakers)
      if (!speakers.length) {
        toast({
          title: "No speakers found",
          description: "Try highlighting just a few turns of the conversation.",
          variant: "destructive",
        })
      } else {
        setSelectedSpeaker(speakers[0])
      }
    }
    setDetectingSpeakers(false)
  }

  const handleAnalyzeConversation = async () => {
    if (!conversationInput.trim()) {
      toast({ title: "Conversation required", description: "Paste or upload a transcript first.", variant: "destructive" })
      return
    }
    if (!selectedSpeaker.trim()) {
      toast({ title: "Select your speaker", description: "Tell us which participant represents you.", variant: "destructive" })
      return
    }
    setAnalyzingConversation(true)
    const result = await analyzeStyleFromConversation(conversationInput, selectedSpeaker)
    if (result.error) {
      toast({ title: "Analysis failed", description: result.error, variant: "destructive" })
    } else if (result.analysis) {
      setLocalStyle((prev) => {
        const base = prev ?? createEmptyStyle()
        return { ...base, ...result.analysis }
      })
      setHasChanges(true)
      toast({ title: "Conversation analyzed", description: "Review the detected fields and save when ready." })
    }
    setAnalyzingConversation(false)
  }

  const handleStartFromScratch = () => {
    setLocalStyle(createEmptyStyle())
    setStyle(null)
    setHasChanges(true)
  }

  const sanitizeStyleForSave = (styleToSave: CommunicationStyle | null) => {
    if (!styleToSave) return null
    const { id: _id, user_id: _userId, created_at: _created, updated_at: _updated, ...rest } = styleToSave
    return rest
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 p-4 border-b">
        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">Communication Style</h3>
            <p className="text-sm text-muted-foreground">Configure how your digital twin communicates</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {localStyle && (
              <>
                <Button onClick={handleSave} disabled={saving || !hasChanges} size="sm" variant="default">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save
                </Button>
                <Button onClick={handleDelete} variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Jump-start from a conversation</CardTitle>
              <CardDescription className="text-xs">
                Paste a WhatsApp/Discord thread or upload a .txt export. We&apos;ll detect participants and autofill your style.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Conversation Transcript</Label>
                <Textarea
                  placeholder="Paste a chat log here…"
                  className="text-xs min-h-[140px]"
                  value={conversationInput}
                  onChange={(e) => handleConversationChange(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Input type="file" accept=".txt,.text,.log" onChange={handleConversationUpload} className="max-w-[220px] text-xs" />
                  {fileName && <span className="text-xs">Loaded: {fileName}</span>}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDetectSpeakers}
                    disabled={detectingSpeakers || !conversationInput.trim()}
                  >
                    {detectingSpeakers ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    Detect speakers
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Who are you in this conversation?</Label>
                {speakerOptions.length > 0 && (
                  <Select value={selectedSpeaker} onValueChange={setSelectedSpeaker}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Select your display name" />
                    </SelectTrigger>
                    <SelectContent>
                      {speakerOptions.map((speaker) => (
                        <SelectItem key={speaker} value={speaker}>
                          {speaker}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Input
                  placeholder="Type your name/handle as it appears"
                  value={selectedSpeaker}
                  onChange={(e) => setSelectedSpeaker(e.target.value)}
                  className="text-xs"
                />
                <Button
                  onClick={handleAnalyzeConversation}
                  size="sm"
                  disabled={analyzingConversation || !conversationInput.trim() || !selectedSpeaker.trim()}
                >
                  {analyzingConversation ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Analyze conversation
                </Button>
              </div>
            </CardContent>
          </Card>

          {!localStyle ? (
            <Card>
              <CardContent className="pt-6 space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  No communication style configured yet. Paste a conversation above or start filling it out manually.
                </p>
                <Button variant="outline" size="sm" onClick={handleStartFromScratch}>
                  Start from scratch
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Tone & Personality</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Tone Descriptors</Label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {localStyle.tone_descriptors?.map((tone) => (
                        <Badge key={tone} variant="secondary" className="text-xs">
                          {tone}
                          <button onClick={() => removeTone(tone)} className="ml-1 hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add tone (e.g., casual, humorous)"
                        value={newTone}
                        onChange={(e) => setNewTone(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addTone()}
                        className="text-xs"
                      />
                      <Button onClick={addTone} size="sm" variant="outline">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Formality Level</Label>
                    <Select
                      value={localStyle.formality_level}
                      onValueChange={(value) =>
                        updateLocalStyle({
                          formality_level: value as CommunicationStyle["formality_level"],
                        })
                      }
                    >
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="very_casual">Very Casual</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="neutral">Neutral</SelectItem>
                        <SelectItem value="formal">Formal</SelectItem>
                        <SelectItem value="very_formal">Very Formal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Humor Style</Label>
                    <Input
                      value={localStyle.humor_style || ""}
                      onChange={(e) => updateLocalStyle({ humor_style: e.target.value })}
                      placeholder="e.g., sarcastic, witty, dry"
                      className="text-xs"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Language Patterns</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Common Phrases</Label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {localStyle.common_phrases?.map((phrase) => (
                        <Badge key={phrase} variant="outline" className="text-xs">
                          {phrase}
                          <button onClick={() => removePhrase(phrase)} className="ml-1 hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add common phrase"
                        value={newPhrase}
                        onChange={(e) => setNewPhrase(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addPhrase()}
                        className="text-xs"
                      />
                      <Button onClick={addPhrase} size="sm" variant="outline">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Vocabulary</Label>
                      <Select
                        value={localStyle.vocabulary_level}
                        onValueChange={(value) =>
                          updateLocalStyle({
                            vocabulary_level: value as CommunicationStyle["vocabulary_level"],
                          })
                        }
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="simple">Simple</SelectItem>
                          <SelectItem value="moderate">Moderate</SelectItem>
                          <SelectItem value="advanced">Advanced</SelectItem>
                          <SelectItem value="technical">Technical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Sentence Structure</Label>
                      <Select
                        value={localStyle.sentence_structure}
                        onValueChange={(value) =>
                          updateLocalStyle({
                            sentence_structure: value as CommunicationStyle["sentence_structure"],
                          })
                        }
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="short">Short</SelectItem>
                          <SelectItem value="mixed">Mixed</SelectItem>
                          <SelectItem value="long">Long</SelectItem>
                          <SelectItem value="complex">Complex</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Emoji Usage</Label>
                      <Select
                        value={localStyle.emoji_usage}
                        onValueChange={(value) =>
                          updateLocalStyle({
                            emoji_usage: value as CommunicationStyle["emoji_usage"],
                          })
                        }
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="never">Never</SelectItem>
                          <SelectItem value="rare">Rare</SelectItem>
                          <SelectItem value="occasional">Occasional</SelectItem>
                          <SelectItem value="frequent">Frequent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Response Length</Label>
                      <Select
                        value={localStyle.paragraph_length}
                        onValueChange={(value) =>
                          updateLocalStyle({
                            paragraph_length: value as CommunicationStyle["paragraph_length"],
                          })
                        }
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="brief">Brief</SelectItem>
                          <SelectItem value="moderate">Moderate</SelectItem>
                          <SelectItem value="detailed">Detailed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Punctuation Style</Label>
                    <Input
                      value={localStyle.punctuation_style || ""}
                      onChange={(e) => updateLocalStyle({ punctuation_style: e.target.value })}
                      placeholder="e.g., minimal, standard, expressive"
                      className="text-xs"
                    />
                  </div>
                </CardContent>
              </Card>

              {localStyle.example_messages && localStyle.example_messages.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Example Messages</CardTitle>
                    <CardDescription className="text-xs">
                      Messages that exemplify your communication style
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {localStyle.example_messages.slice(0, 5).map((msg, i) => (
                        <div key={i} className="text-xs p-2 bg-muted rounded border">
                          {msg}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {localStyle.last_analyzed_at && (
                <p className="text-xs text-muted-foreground text-center">
                  Last analyzed: {new Date(localStyle.last_analyzed_at).toLocaleString()}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
