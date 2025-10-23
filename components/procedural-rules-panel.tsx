"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trash2, Sparkles, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  getProceduralRules,
  deleteProceduralRule,
  analyzeAndExtractRules,
  type ProceduralRule,
} from "@/app/actions/procedural-rules"

export function ProceduralRulesPanel({ initialRules }: { initialRules: ProceduralRule[] }) {
  const [rules, setRules] = useState<ProceduralRule[]>(initialRules)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const refreshRules = async () => {
    setLoading(true)
    const result = await getProceduralRules()
    if (result.rules) {
      setRules(result.rules)
      toast({ title: "Rules refreshed" })
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }

  const handleDelete = async (id: string) => {
    setLoading(true)
    const result = await deleteProceduralRule(id)

    if (result.success) {
      toast({ title: "Rule deleted" })
      await refreshRules()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }

  const handleAnalyze = async () => {
    if (!confirm("This will analyze your memories and facts to extract procedural rules. Continue?")) {
      return
    }

    setLoading(true)
    toast({ title: "Analyzing memories...", description: "This may take a moment" })

    const result = await analyzeAndExtractRules()

    if (result.success) {
      toast({
        title: "Analysis complete",
        description: `Extracted ${result.count} procedural rule(s)`,
      })
      await refreshRules()
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
    setLoading(false)
  }

  const getRuleTypeColor = (type: string) => {
    switch (type) {
      case "habit":
        return "bg-blue-500/10 text-blue-500"
      case "preference":
        return "bg-purple-500/10 text-purple-500"
      case "routine":
        return "bg-green-500/10 text-green-500"
      case "if_then":
        return "bg-orange-500/10 text-orange-500"
      case "skill":
        return "bg-pink-500/10 text-pink-500"
      default:
        return "bg-gray-500/10 text-gray-500"
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-4 border-b space-y-3">
        <div className="flex gap-2">
          <Button onClick={handleAnalyze} variant="default" size="sm" disabled={loading} className="flex-1">
            <Sparkles className="h-4 w-4 mr-2" />
            Analyze & Extract Rules
          </Button>
          <Button onClick={refreshRules} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Procedural Rules ({rules.length})</CardTitle>
            <CardDescription>Habits, preferences, routines, and behavioral patterns</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {rules.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No procedural rules found</p>
                  <p className="text-xs mt-2">Click "Analyze & Extract Rules" to automatically discover patterns</p>
                </div>
              ) : (
                rules.map((rule) => (
                  <div key={rule.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <Badge className={getRuleTypeColor(rule.rule_type)}>{rule.rule_type}</Badge>
                      {rule.frequency && <Badge variant="outline">{rule.frequency}</Badge>}
                    </div>

                    {rule.condition && (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">When:</span> {rule.condition}
                      </div>
                    )}

                    <div className="text-sm">
                      <span className="font-medium">Action:</span> {rule.action}
                    </div>

                    {rule.context && <div className="text-xs text-muted-foreground">{rule.context}</div>}

                    <div className="flex gap-3 flex-wrap text-xs text-muted-foreground">
                      <span>Confidence: {(rule.confidence * 100).toFixed(0)}%</span>
                      <span>Importance: {(rule.importance * 100).toFixed(0)}%</span>
                      <span>Observed: {rule.times_observed}x</span>
                      {rule.times_applied > 0 && <span>Applied: {rule.times_applied}x</span>}
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(rule.id)} disabled={loading}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
