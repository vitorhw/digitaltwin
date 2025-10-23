"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  getCommunicationStyle,
  updateCommunicationStyle,
  analyzeStyleFromMemories,
  deleteCommunicationStyle,
  type CommunicationStyle,
} from "@/app/actions/style"
import { Loader2, Sparkles, Trash2, Plus, X, Save } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function StyleConfigPanel() {
  const [style, setStyle] = useState<CommunicationStyle | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newPhrase, setNewPhrase] = useState("")
  const [newTone, setNewTone] = useState("")
  const [hasChanges, setHasChanges] = useState(false)
  const [localStyle, setLocalStyle] = useState<CommunicationStyle | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    loadStyle()
  }, [])

  const loadStyle = async () => {
    setLoading(true)
    const result = await getCommunicationStyle()
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      setStyle(result.style)
      setLocalStyle(result.style)
      setHasChanges(false)
    }
    setLoading(false)
  }

  const handleAnalyze = async () => {
    setAnalyzing(true)
    const result = await analyzeStyleFromMemories()
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      toast({ title: "Success", description: "Communication style analyzed and updated" })
      await loadStyle()
    }
    setAnalyzing(false)
  }

  const handleSave = async () => {
    if (!localStyle) return
    setSaving(true)
    const result = await updateCommunicationStyle(localStyle)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      setStyle(result.style as CommunicationStyle)
      setLocalStyle(result.style as CommunicationStyle)
      setHasChanges(false)
      toast({ title: "Success", description: "Style saved" })
    }
    setSaving(false)
  }

  const updateLocalStyle = (updates: Partial<CommunicationStyle>) => {
    if (!localStyle) return
    setLocalStyle({ ...localStyle, ...updates })
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
    }
  }

  const addPhrase = () => {
    if (!newPhrase.trim() || !localStyle) return
    updateLocalStyle({
      common_phrases: [...(localStyle.common_phrases || []), newPhrase.trim()],
    })
    setNewPhrase("")
  }

  const removePhrase = (phrase: string) => {
    if (!localStyle) return
    updateLocalStyle({
      common_phrases: localStyle.common_phrases.filter((p) => p !== phrase),
    })
  }

  const addTone = () => {
    if (!newTone.trim() || !localStyle) return
    updateLocalStyle({
      tone_descriptors: [...(localStyle.tone_descriptors || []), newTone.trim()],
    })
    setNewTone("")
  }

  const removeTone = (tone: string) => {
    if (!localStyle) return
    updateLocalStyle({
      tone_descriptors: localStyle.tone_descriptors.filter((t) => t !== tone),
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Communication Style</h3>
          <p className="text-sm text-muted-foreground">Configure how your digital twin communicates</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleAnalyze} disabled={analyzing} size="sm">
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Analyze from Memories
          </Button>
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

      {!localStyle ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center">
              No communication style configured yet. Click "Analyze from Memories" to automatically detect your style.
            </p>
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

          {localStyle.example_messages && localStyle.example_messages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Example Messages</CardTitle>
                <CardDescription className="text-xs">Messages that exemplify your communication style</CardDescription>
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
        </div>
      )}
    </div>
  )
}
