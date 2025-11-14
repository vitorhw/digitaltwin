"use client";

import type React from "react";

import { signIn } from "@/app/actions/auth";
import type { CommunicationStyle } from "@/app/actions/style";
import { deleteCommunicationStyle } from "@/app/actions/style";
import type { VoiceProfile } from "@/app/actions/voice";
import { deleteVoiceProfile } from "@/app/actions/voice";
import { ApprovalWatcher } from "@/components/approval-watcher";
import { AvatarProvider, useAvatar } from "@/components/avatar-context";
import { ChatInterface } from "@/components/chat-interface";
import { DebugFactsPanel } from "@/components/debug-facts-panel";
import { DraggableAvatar } from "@/components/draggable-avatar";
import { FaceAvatarPanel } from "@/components/face-avatar-panel";
import { MindMap3D } from "@/components/mindmap-3d";
import { StyleConfigPanel } from "@/components/style-config-panel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  VoiceCloneProvider,
  useVoiceClone,
} from "@/components/voice-clone-provider";
import { VoiceSettingsPanel } from "@/components/voice-settings-panel";
import { useToast } from "@/hooks/use-toast";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

interface SinglePageAppProps {
  isLoggedIn: boolean;
  initialFacts: any[];
  initialMemories: any[];
  initialDocuments: any[];
  initialRules: any[];
  initialVoiceProfile: VoiceProfile | null;
  initialStyle: CommunicationStyle | null;
}

export function SinglePageApp({
  isLoggedIn,
  initialFacts,
  initialMemories,
  initialDocuments,
  initialRules,
  initialVoiceProfile,
  initialStyle,
}: SinglePageAppProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const result = await signIn(email, password);

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  const handleSignOut = async () => {
    const supabase = createSupabaseClient();
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to access the memory chat
            </CardDescription>
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
    );
  }

  return (
    <VoiceCloneProvider initialProfile={initialVoiceProfile}>
      <ApprovalWatcher
        initialFacts={initialFacts}
        initialMemories={initialMemories}
        initialRules={initialRules}
      />
      <AvatarProvider>
        <AuthenticatedApp
          initialFacts={initialFacts}
          initialMemories={initialMemories}
          initialDocuments={initialDocuments}
          initialRules={initialRules}
          initialStyle={initialStyle}
          onSignOut={handleSignOut}
        />
      </AvatarProvider>
    </VoiceCloneProvider>
  );
}

type PageView = "voice" | "avatar" | "style" | "chat" | "mindmap";

function AuthenticatedApp({
  initialFacts,
  initialMemories,
  initialDocuments,
  initialRules,
  initialStyle,
  onSignOut,
}: {
  initialFacts: any[];
  initialMemories: any[];
  initialDocuments: any[];
  initialRules: any[];
  initialStyle: CommunicationStyle | null;
  onSignOut: () => Promise<void> | void;
}) {
  const { profile, updateProfile, setSpeakBackEnabledLocal } = useVoiceClone();
  const { avatarState, reset: resetAvatar } = useAvatar();
  const { toast } = useToast();
  const voiceReady = Boolean(profile?.clone_reference?.voice_id);
  const avatarReady = Boolean(avatarState.meshData);
  const [styleData, setStyleData] = useState<CommunicationStyle | null>(
    initialStyle
  );
  const [styleReady, setStyleReady] = useState(Boolean(initialStyle));
  const [voiceSkipped, setVoiceSkipped] = useState(false);
  const voiceComplete = voiceReady || voiceSkipped;
  const [selectedPage, setSelectedPage] = useState<PageView>(() => {
    if (!voiceComplete) return "voice";
    if (!avatarReady) return "avatar";
    if (!styleReady) return "style";
    return "chat";
  });
  const gatingPage: PageView | null = !voiceComplete
    ? "voice"
    : !avatarReady
    ? "avatar"
    : !styleReady
    ? "style"
    : null;
  const currentPage: PageView = gatingPage ?? selectedPage;
  const [debugOpen, setDebugOpen] = useState(false);

  const handleNav = useCallback(
    (page: PageView) => {
      if (gatingPage && page !== gatingPage) return;
      if (page === "avatar" && !voiceComplete) return;
      if (page === "style" && (!voiceComplete || !avatarReady)) return;
      if (
        (page === "chat" || page === "mindmap") &&
        (!voiceComplete || !avatarReady || !styleReady)
      )
        return;
      setSelectedPage(page);
    },
    [avatarReady, gatingPage, styleReady, voiceComplete]
  );

  const handleStyleChange = useCallback((next: CommunicationStyle | null) => {
    setStyleData(next);
    setStyleReady(Boolean(next));
  }, []);

  const handleWipeConfigurations = useCallback(async () => {
    try {
      await deleteCommunicationStyle();
      setStyleData(null);
      setStyleReady(false);
      await deleteVoiceProfile();
      updateProfile(null);
      setSpeakBackEnabledLocal(false);
      resetAvatar();
      setVoiceSkipped(false);
      toast({ title: "Voice, avatar, and style cleared" });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to wipe configurations";
      toast({ title: "Error", description: message, variant: "destructive" });
      throw error;
    }
  }, [resetAvatar, setSpeakBackEnabledLocal, toast, updateProfile]);

  const navItems = useMemo(
    () => [
      { value: "voice" as PageView, label: "Voice Setup", disabled: false },
      {
        value: "avatar" as PageView,
        label: "Avatar",
        disabled: !voiceComplete,
      },
      {
        value: "style" as PageView,
        label: "Style",
        disabled: !voiceComplete || !avatarReady,
      },
      {
        value: "chat" as PageView,
        label: "Chat",
        disabled: !voiceComplete || !avatarReady || !styleReady,
      },
      {
        value: "mindmap" as PageView,
        label: "Mind Map",
        disabled: !voiceComplete || !avatarReady || !styleReady,
      },
    ],
    [avatarReady, styleReady, voiceComplete]
  );

  const renderPage = () => {
    switch (currentPage) {
      case "voice":
        return (
          <SetupScreen
            step="Step 1"
            title="Capture your voice"
            description="Record or upload a clean sample so Coqui can synthesize your speech."
            footer={
              <div className="flex w-full flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Supports WAV, MP3, and WEBM uploads.</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setVoiceSkipped(true);
                    setSelectedPage("avatar");
                    toast({
                      title: "Voice setup skipped",
                      description: "You can return here anytime.",
                    });
                  }}
                >
                  Skip for now
                </Button>
              </div>
            }
          >
            <VoiceSettingsPanel />
          </SetupScreen>
        );
      case "avatar":
        return (
          <SetupScreen
            step="Step 2"
            title="Build your avatar"
            description="Upload a portrait, generate the 3D mesh, and link it to your preferred voice."
          >
            <FaceAvatarPanel />
          </SetupScreen>
        );
      case "style":
        return (
          <SetupScreen
            step="Step 3"
            title="Tune your style"
            description="Define tone, phrases, and writing quirks. Paste a conversation for auto-detection or fill it out manually."
            contentClassName="px-0"
          >
            <StyleConfigPanel
              initialStyle={styleData}
              onStyleChange={handleStyleChange}
            />
          </SetupScreen>
        );
      case "mindmap":
        return (
          <div className="flex h-full w-full min-h-0 flex-1">
            <MindMap3D />
          </div>
        );
      case "chat":
      default:
        return (
          <div className="flex h-full w-full flex-1 flex-col">
            <AvatarDisplay />
            <div className="flex flex-1 overflow-hidden min-h-0">
              <div className="flex-1 overflow-hidden">
                <ChatInterface />
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background relative">
      <div className="flex-shrink-0 border-b px-4 py-2 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Digital Twin Setup</p>
          <p className="text-xs text-muted-foreground">
            Complete Voice → Avatar → Style to unlock chat.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onSignOut} className="gap-2">
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>

      <div className="flex-shrink-0 border-b bg-muted/40 px-4 py-2 flex flex-wrap gap-2">
        {navItems.map((item) => (
          <Button
            key={item.value}
            variant={currentPage === item.value ? "default" : "outline"}
            disabled={item.disabled && gatingPage !== item.value}
            onClick={() => handleNav(item.value)}
            size="sm"
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">{renderPage()}</div>

      {debugOpen ? (
        <div className="fixed bottom-4 right-4 z-50 w-[400px] max-w-[95vw]">
          <Card className="shadow-xl">
            <div className="flex items-center justify-between border-b px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>System Console</span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setDebugOpen(false)}
                aria-label="Close debug console"
              >
                ×
              </Button>
            </div>
            <div className="h-[480px]">
              <DebugFactsPanel
                initialFacts={initialFacts}
                initialMemories={initialMemories}
                initialDocuments={initialDocuments}
                initialRules={initialRules}
                onWipeConfigurations={handleWipeConfigurations}
              />
            </div>
          </Card>
        </div>
      ) : (
        <Button
          variant="default"
          className="fixed bottom-4 right-4 z-40 shadow-lg"
          onClick={() => setDebugOpen(true)}
        >
          Open Debug Panel
        </Button>
      )}
    </div>
  );
}

interface SetupScreenProps {
  step: string;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  contentClassName?: string;
}

function SetupScreen({
  step,
  title,
  description,
  children,
  footer,
  contentClassName,
}: SetupScreenProps) {
  return (
    <div className="flex h-full w-full flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-6">
        <Card>
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {step}
            </p>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className={cn("space-y-6 pb-6", contentClassName)}>
            {children}
          </CardContent>
          {footer ? (
            <CardFooter className="flex flex-wrap gap-2">{footer}</CardFooter>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function AvatarDisplay() {
  const { avatarState, setPosition } = useAvatar();
  const { voiceStyle } = useVoiceClone();

  if (!avatarState.meshData) {
    return null;
  }

  return (
    <DraggableAvatar
      meshData={avatarState.meshData}
      features={avatarState.features}
      textureUrl={avatarState.textureUrl}
      audioUrl={avatarState.audioUrl}
      onPositionChange={setPosition}
      styleMode={voiceStyle}
    />
  );
}
