"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  getCommunicationStyle,
  updateCommunicationStyle,
  deleteCommunicationStyle,
  type CommunicationStyle,
} from "@/app/actions/style"
import { SpinnerGap, Trash, Plus, X, FloppyDisk } from "@phosphor-icons/react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
  const [loading, setLoading] = useState(initialStyle === undefined)
  const [saving, setSaving] = useState(false)
  const [newPhrase, setNewPhrase] = useState("")
  const [newTone, setNewTone] = useState("")
  const [hasChanges, setHasChanges] = useState(false)
  const [localStyle, setLocalStyle] = useState<CommunicationStyle | null>(initialStyle ?? null)
  const { toast } = useToast()

  useEffect(() => {
    if (initialStyle === undefined) {
      loadStyle()
    } else {
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
      setLocalStyle(nextStyle)
      setHasChanges(false)
      onStyleChange?.(nextStyle)
    }
    setLoading(false)
  }

  const handleFloppyDisk = async () => {
    if (!localStyle) return
    const payload = sanitizeStyleForFloppyDisk(localStyle)
    if (!payload) return
    setSaving(true)
    const result = await updateCommunicationStyle(payload)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      const updated = result.style as CommunicationStyle
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

  const handleStartFromScratch = () => {
    setLocalStyle(createEmptyStyle())
    setHasChanges(true)
  }

  const sanitizeStyleForFloppyDisk = (styleToFloppyDisk: CommunicationStyle | null) => {
    if (!styleToFloppyDisk) return null
    const { id: _id, user_id: _userId, created_at: _created, updated_at: _updated, ...rest } = styleToFloppyDisk
    return rest
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <SpinnerGap className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-background/80 p-4 shadow-sm">
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold">Communication Style</h3>
            <p className="text-sm text-muted-foreground">
              Fine-tune the tone detected during Step 3 or craft it manually.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {localStyle ? (
              <>
                <Button onClick={handleFloppyDisk} disabled={saving || !hasChanges} size="sm" variant="default">
                  {saving ? <SpinnerGap className="mr-2 h-4 w-4 animate-spin" /> : <FloppyDisk className="mr-2 h-4 w-4" />}
                  Save changes
                </Button>
                <Button onClick={handleDelete} variant="destructive" size="sm">
                  <Trash className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={handleStartFromScratch}>
                Start from scratch
              </Button>
            )}
          </div>
        </div>
      </div>

      {!localStyle ? (
        <Card>
          <CardContent className="space-y-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No communication style detected yet. Paste a chat log on Step 3 or build it manually here.
            </p>
            <Button variant="outline" size="sm" onClick={handleStartFromScratch}>
              Create manually
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
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

              {localStyle.last_analyzed_at && (
                <p className="text-xs text-muted-foreground text-center">
                  Last analyzed: {new Date(localStyle.last_analyzed_at).toLocaleString()}
                </p>
              )}
        </div>
      )}
    </div>
  )
}
