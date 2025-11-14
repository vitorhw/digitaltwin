"use client"

import type { ReactNode } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import {
  getCurrentFacts,
  getEpisodicMemories,
  approveFact,
  rejectFact,
  approveEpisodicMemory,
  rejectEpisodicMemory,
} from "@/app/actions/memory"
import {
  getProceduralRules,
  updateProceduralRule,
  deleteProceduralRule,
  type ProceduralRule,
} from "@/app/actions/procedural-rules"

interface FactSummary {
  id: string
  key: string
  value: any
  status: string
}

interface EpisodicSummary {
  id: string
  text: string
  provenance_kind: string
}

export function ApprovalWatcher({
  initialFacts,
  initialMemories,
  initialRules,
}: {
  initialFacts: FactSummary[]
  initialMemories: EpisodicSummary[]
  initialRules: ProceduralRule[]
}) {
  const [facts, setFacts] = useState<FactSummary[]>(initialFacts)
  const [memories, setMemories] = useState<EpisodicSummary[]>(initialMemories)
  const [rules, setRules] = useState<ProceduralRule[]>(initialRules)
  const pendingKeysRef = useRef<Set<string>>(new Set())
  const { toast } = useToast()

  const refreshPending = useCallback(async () => {
    const [factsResult, memoriesResult, rulesResult] = await Promise.all([
      getCurrentFacts(),
      getEpisodicMemories(),
      getProceduralRules(),
    ])
    if (factsResult.facts) setFacts(factsResult.facts as FactSummary[])
    if (memoriesResult.memories) setMemories(memoriesResult.memories as EpisodicSummary[])
    if (rulesResult.rules) setRules(rulesResult.rules)
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("debug-data-update", {
          detail: {
            facts: factsResult.facts,
            memories: memoriesResult.memories,
            rules: rulesResult.rules,
          },
        }),
      )
    }
  }, [])

  useEffect(() => {
    refreshPending().catch(() => {})
  }, [refreshPending])

  useEffect(() => {
    const interval = setInterval(() => {
      refreshPending().catch(() => {})
    }, 5000)
    return () => clearInterval(interval)
  }, [refreshPending])

  const showApprovalToast = useCallback(
    (
      key: string,
      title: string,
      summary: ReactNode,
      onApprove: () => Promise<void>,
      onReject: () => Promise<void>,
    ) => {
      if (pendingKeysRef.current.has(key)) return
      pendingKeysRef.current.add(key)
      let closed = false
      const cleanup = () => {
        if (!closed) {
          pendingKeysRef.current.delete(key)
          closed = true
        }
      }
      const handleAction = async (action: () => Promise<void>) => {
        await action()
        cleanup()
        await refreshPending()
      }
      toast({
        title,
        description: (
          <div className="space-y-2">
            <p className="text-sm">{summary}</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleAction(onApprove)}>
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleAction(onReject)}>
                Reject
              </Button>
            </div>
          </div>
        ),
        onOpenChange: (open) => {
          if (!open) cleanup()
        },
      })
    },
    [refreshPending, toast],
  )

  useEffect(() => {
    const pendingFact = facts.find((fact) => fact.status === "candidate")
    if (!pendingFact) return
    const preview =
      typeof pendingFact.value === "object" ? JSON.stringify(pendingFact.value).slice(0, 80) : String(pendingFact.value)
    showApprovalToast(
      `fact-${pendingFact.id}`,
      "Review fact proposal",
      (
        <span>
          <span className="font-semibold">{pendingFact.key}</span>: {preview}
        </span>
      ),
      async () => {
        const result = await approveFact(pendingFact.key)
        if (result?.error) {
          toast({ title: "Error", description: result.error, variant: "destructive" })
        } else {
          toast({ title: "Fact approved", description: pendingFact.key })
        }
      },
      async () => {
        const result = await rejectFact(pendingFact.key)
        if (result?.error) {
          toast({ title: "Error", description: result.error, variant: "destructive" })
        } else {
          toast({ title: "Fact rejected", description: pendingFact.key, variant: "destructive" })
        }
      },
    )
  }, [facts, showApprovalToast, toast])

  useEffect(() => {
    const pendingMemory = memories.find((memory) => memory.provenance_kind !== "user_confirmed")
    if (!pendingMemory) return
    const summary = pendingMemory.text.length > 140 ? `${pendingMemory.text.slice(0, 137)}…` : pendingMemory.text
    showApprovalToast(
      `memory-${pendingMemory.id}`,
      "Review episodic memory",
      summary,
      async () => {
        const result = await approveEpisodicMemory(pendingMemory.id)
        if (result?.error) {
          toast({ title: "Error", description: result.error, variant: "destructive" })
        } else {
          toast({ title: "Memory approved" })
        }
      },
      async () => {
        const result = await rejectEpisodicMemory(pendingMemory.id)
        if (result?.error) {
          toast({ title: "Error", description: result.error, variant: "destructive" })
        } else {
          toast({ title: "Memory rejected", variant: "destructive" })
        }
      },
    )
  }, [memories, showApprovalToast, toast])

  useEffect(() => {
    const pendingRule = rules.find((rule) => rule.status !== "active")
    if (!pendingRule) return
    const summary = pendingRule.action.length > 140 ? `${pendingRule.action.slice(0, 137)}…` : pendingRule.action
    showApprovalToast(
      `rule-${pendingRule.id}`,
      "Review procedural rule",
      summary,
      async () => {
        const result = await updateProceduralRule(pendingRule.id, { status: "active" })
        if (result?.error) {
          toast({ title: "Error", description: result.error, variant: "destructive" })
        } else {
          toast({ title: "Rule approved" })
        }
      },
      async () => {
        const result = await deleteProceduralRule(pendingRule.id)
        if (result?.error) {
          toast({ title: "Error", description: result.error, variant: "destructive" })
        } else {
          toast({ title: "Rule rejected", variant: "destructive" })
        }
      },
    )
  }, [rules, showApprovalToast, toast])

  return null
}
