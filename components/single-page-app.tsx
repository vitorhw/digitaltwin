"use client"

import type React from "react"

import { useState } from "react"
import { signIn } from "@/app/actions/auth"
import { ChatInterface } from "@/components/chat-interface"
import { DebugFactsPanel } from "@/components/debug-facts-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { LogOut, Brain } from "lucide-react"

interface SinglePageAppProps {
  isLoggedIn: boolean
  initialFacts: any[]
  initialMemories: any[]
  initialDocuments: any[]
}

export function SinglePageApp({ isLoggedIn, initialFacts, initialMemories, initialDocuments }: SinglePageAppProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const result = await signIn(email, password)

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
    }

    setLoading(false)
  }

  const handleSignOut = async () => {
    const supabase = (await import("@/lib/supabase/client")).createBrowserClient()
    await supabase.auth.signOut()
    window.location.reload()
  }

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Enter your credentials to access the memory chat</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header with sign out */}
      <div className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          
        </div>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>

      {/* Main content: Chat + Debug side by side */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat section */}
        <div className="flex-1 border-r">
          <ChatInterface />
        </div>

        {/* Debug section */}
        <div className="w-[500px] flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <DebugFactsPanel
              initialFacts={initialFacts}
              initialMemories={initialMemories}
              initialDocuments={initialDocuments}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
