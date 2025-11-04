"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { signIn } from "@/app/actions/auth"
import { ChatInterface } from "@/components/chat-interface"
import { DebugFactsPanel } from "@/components/debug-facts-panel"
import { StyleConfigPanel } from "@/components/style-config-panel"
import { ProceduralRulesPanel } from "@/components/procedural-rules-panel"
import { VoiceSettingsPanel } from "@/components/voice-settings-panel"
import { CoquiConsole } from "@/components/coqui-console"
import { VoiceCloneProvider, useVoiceClone } from "@/components/voice-clone-provider"
import { createClient as createSupabaseClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { LogOut } from "lucide-react"
import type { VoiceProfile } from "@/app/actions/voice"

interface SinglePageAppProps {
  isLoggedIn: boolean
  initialFacts: any[]
  initialMemories: any[]
  initialDocuments: any[]
  initialRules: any[]
  initialVoiceProfile: VoiceProfile | null
}

export function SinglePageApp({
  isLoggedIn,
  initialFacts,
  initialMemories,
  initialDocuments,
  initialRules,
  initialVoiceProfile,
}: SinglePageAppProps) {
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
    const supabase = createSupabaseClient()
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
    <VoiceCloneProvider initialProfile={initialVoiceProfile}>
      <AuthenticatedApp
        initialFacts={initialFacts}
        initialMemories={initialMemories}
        initialDocuments={initialDocuments}
        initialRules={initialRules}
        onSignOut={handleSignOut}
      />
    </VoiceCloneProvider>
  )
}

function AuthenticatedApp({
  initialFacts,
  initialMemories,
  initialDocuments,
  initialRules,
  onSignOut,
}: {
  initialFacts: any[]
  initialMemories: any[]
  initialDocuments: any[]
  initialRules: any[]
  onSignOut: () => Promise<void> | void
}) {
  const { profile, speakBackEnabled, updateProfile, setSpeakBackEnabledLocal } = useVoiceClone()

  const handleVoiceProfileUpdate = useCallback(
    (next: VoiceProfile | null) => {
      updateProfile(next)
    },
    [updateProfile],
  )

  const handleSpeakBackToggle = useCallback(
    (enabled: boolean) => {
      setSpeakBackEnabledLocal(enabled)
      if (!profile) return
      updateProfile({ ...profile, speak_back_enabled: enabled })
    },
    [profile, setSpeakBackEnabledLocal, updateProfile],
  )

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex-shrink-0 border-b px-4 py-2 flex items-center justify-end">
        <Button variant="ghost" size="sm" onClick={onSignOut} className="gap-2">
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 border-r overflow-hidden">
          <ChatInterface
            speakBackEnabled={speakBackEnabled}
            voiceProfile={profile}
            onSpeakBackChange={handleSpeakBackToggle}
            onProfileRefresh={handleVoiceProfileUpdate}
          />
        </div>

        <div className="w-[500px] flex flex-col overflow-hidden min-h-0">
          <Tabs defaultValue="debug" className="flex-1 flex flex-col overflow-hidden min-h-0">
            <TabsList className="flex-shrink-0 w-full rounded-none border-b">
              <TabsTrigger value="debug" className="flex-1">
                Debug
              </TabsTrigger>
              <TabsTrigger value="rules" className="flex-1">
                Rules
              </TabsTrigger>
              <TabsTrigger value="style" className="flex-1">
                Style
              </TabsTrigger>
              <TabsTrigger value="voice" className="flex-1">
                Voice
              </TabsTrigger>
            </TabsList>
            <TabsContent value="debug" className="flex-1 overflow-hidden min-h-0 m-0">
              <DebugFactsPanel
                initialFacts={initialFacts}
                initialMemories={initialMemories}
                initialDocuments={initialDocuments}
              />
            </TabsContent>
            <TabsContent value="rules" className="flex-1 overflow-hidden min-h-0 m-0">
              <ProceduralRulesPanel initialRules={initialRules} />
            </TabsContent>
            <TabsContent value="style" className="flex-1 overflow-hidden min-h-0 m-0">
              <StyleConfigPanel />
            </TabsContent>
            <TabsContent value="voice" className="flex-1 overflow-hidden min-h-0 m-0 p-0">
              <div className="grid h-full min-h-0 grid-rows-[auto,minmax(0,1fr)] gap-4 overflow-hidden p-4">
                <div className="rounded border bg-card">
                  <VoiceSettingsPanel />
                </div>
                <div className="h-full min-h-0 rounded border bg-card">
                  <CoquiConsole />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
