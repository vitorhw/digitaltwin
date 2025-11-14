"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { deleteProceduralRule, type ProceduralRule } from "@/app/actions/procedural-rules"

export function ProceduralRulesPanel({
  rules,
  onRulesChange,
}: {
  rules: ProceduralRule[]
  onRulesChange: (next: ProceduralRule[]) => void
}) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleDelete = async (id: string) => {
    setLoading(true)
    const result = await deleteProceduralRule(id)

    if (result.success) {
      toast({ title: "Rule deleted" })
      onRulesChange(rules.filter((rule) => rule.id !== id))
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

  if (rules.length === 0) {
    return <p className="text-sm text-muted-foreground">No procedural rules found</p>
  }

  return (
    <div className="space-y-3">
      {rules.map((rule) => (
        <div key={rule.id} className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={getRuleTypeColor(rule.rule_type)}>{rule.rule_type}</Badge>
            {rule.frequency && <Badge variant="outline">{rule.frequency}</Badge>}
            <Badge variant="outline">Confidence {(rule.confidence * 100).toFixed(0)}%</Badge>
            <Badge variant="outline">Importance {(rule.importance * 100).toFixed(0)}%</Badge>
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
            <span>Observed: {rule.times_observed}x</span>
            {rule.times_applied > 0 && <span>Applied: {rule.times_applied}x</span>}
            {rule.last_observed_at && (
              <span>Last observed: {new Date(rule.last_observed_at).toLocaleDateString()}</span>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={() => handleDelete(rule.id)} disabled={loading}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
