"use client";

import type React from "react";

import { signIn } from "@/app/actions/auth";
import type { CommunicationStyle } from "@/app/actions/style";
import { deleteCommunicationStyle } from "@/app/actions/style";
import type { VoiceProfile } from "@/app/actions/voice";
import { deleteVoiceProfile, setSpeakBackEnabled } from "@/app/actions/voice";
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
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select";
import {
  VoiceCloneProvider,
  useVoiceClone,
} from "@/components/voice-clone-provider";
import { VoiceSettingsPanel } from "@/components/voice-settings-panel";
import { useToast } from "@/hooks/use-toast";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { CircleEllipsis, LogOut, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

const TV_FRAME_WIDTH = 547;
const TV_FRAME_HEIGHT = 467;
const TV_SCREEN = {
  width: 400,
  height: 339,
  offsetX: 26,
  offsetY: 35,
};

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
  const { profile, updateProfile, setSpeakBackEnabledLocal, speakBackEnabled } =
    useVoiceClone();
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
  const [speakTogglePending, setSpeakTogglePending] = useState(false);
  const [menuValue, setMenuValue] = useState<string>("menu");

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

  const handleSpeakToggle = useCallback(async () => {
    if (!profile) {
      toast({
        title: "No voice sample",
        description: "Upload a voice sample first.",
      });
      return;
    }

    const previous = speakBackEnabled;
    setSpeakTogglePending(true);
    setSpeakBackEnabledLocal(!previous);

    try {
      const result = await setSpeakBackEnabled(!previous);
      if (result?.error) {
        throw new Error(result.error);
      }
      updateProfile(
        result.profile ?? { ...profile, speak_back_enabled: !previous }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      toast({
        title: "Unable to update speak-back",
        description: message,
        variant: "destructive",
      });
      setSpeakBackEnabledLocal(previous);
    } finally {
      setSpeakTogglePending(false);
    }
  }, [
    profile,
    setSpeakBackEnabledLocal,
    speakBackEnabled,
    toast,
    updateProfile,
  ]);

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

  const mainNavItems = useMemo(
    () => [
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

  const setupOptions = useMemo(
    () => [
      { value: "voice" as PageView, label: "Voice", disabled: false },
      { value: "avatar" as PageView, label: "Avatar", disabled: !voiceComplete },
      {
        value: "style" as PageView,
        label: "Style",
        disabled: !voiceComplete || !avatarReady,
      },
    ],
    [avatarReady, voiceComplete]
  );

  const isSetupPage =
    currentPage === "voice" ||
    currentPage === "avatar" ||
    currentPage === "style";

  useEffect(() => {
    if (isSetupPage) {
      setMenuValue(currentPage);
    } else {
      setMenuValue("menu");
    }
  }, [currentPage, isSetupPage]);

  const handleSetupSelection = useCallback(
    (value: string) => {
      if (value === "signout") {
        setMenuValue("menu");
        onSignOut();
        return;
      }
      if (value === "toggle-debug") {
        setMenuValue("menu");
        setDebugOpen((prev) => !prev);
        return;
      }
      setMenuValue(value);
      handleNav(value as PageView);
    },
    [handleNav, onSignOut, setDebugOpen]
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
          <div className="flex h-full w-full min-h-0 flex-1 pt-16">
            <MindMap3D />
          </div>
        );
      case "chat":
      default:
        return (
          <div className="relative flex h-full w-full flex-1 overflow-hidden">
            <LivingRoomBackdrop />
            <div
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
              style={{ transform: "translateY(-50px)" }}
            >
              <RetroTelevision />
            </div>
            <div className="relative z-20 flex flex-1 overflow-hidden">
              <div className="mx-auto flex w-full flex-1 items-end px-4 pb-12 pt-6 md:px-8">
                <ChatInterface />
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center px-4 py-4">
        <div className="pointer-events-auto grid w-full max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-6">
          <div className="flex items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white shadow-[0_25px_45px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
              <Image
                src="/logo.svg"
                alt="Digital Twin logo"
                width={28}
                height={28}
                className="h-7 w-7"
                priority
              />
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 rounded-full border border-white/20 bg-white/10 px-6 py-2 shadow-[0_35px_65px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
            {mainNavItems.map((item) => {
              const isActive = currentPage === item.value;
              return (
                <Button
                  key={item.value}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "flex items-center gap-4 rounded-2xl px-5 py-2 text-base capitalize tracking-wide transition",
                    isActive ? "bg-white/35 text-white shadow-[0_18px_45px_rgba(0,0,0,0.4)]" : "text-white/70 hover:bg-white/15",
                  )}
                  disabled={item.disabled}
                  onClick={() => handleNav(item.value)}
                >
                  {item.label.toLowerCase()}
                </Button>
              );
            })}
          </div>
          <div className="flex items-center justify-end">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white shadow-[0_25px_45px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
              <Select value={menuValue} onValueChange={handleSetupSelection}>
                <SelectTrigger
                  size="sm"
                  className="flex h-12 w-12 items-center justify-center rounded-full border-none bg-transparent p-0 text-white [&>svg:last-child]:hidden"
                >
                  <span className="sr-only">Open setup menu</span>
                  <CircleEllipsis className="h-7 w-7 text-white" strokeWidth={0} fill="currentColor" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border border-white/20 bg-white/10 text-white shadow-[0_25px_65px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
                  <SelectItem value="menu" className="hidden">
                    Menu
                  </SelectItem>
                  {setupOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                      {option.label}
                    </SelectItem>
                  ))}
                  <SelectSeparator />
                  
                  <SelectItem value="toggle-debug">
                    {debugOpen ? "Close debug panel" : "Open debug panel"}
                  </SelectItem>
                  <SelectSeparator />
                  <SelectItem value="signout">
                    <div className="flex items-center gap-2 text-white">
                      <LogOut className="h-4 w-4 text-white" />
                      Sign out
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
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
      ) : null}
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

interface AvatarDisplayProps {
  draggable?: boolean;
  className?: string;
  frameless?: boolean;
  style?: CSSProperties;
}

function AvatarDisplay({
  draggable = true,
  className,
  frameless = false,
  style,
}: AvatarDisplayProps) {
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
      onPositionChange={draggable ? setPosition : undefined}
      styleMode={voiceStyle}
      draggable={draggable}
      className={className}
      frameless={frameless}
      style={style}
    />
  );
}

function RetroTelevision() {
  const { avatarState } = useAvatar();
  const screenStyle = useMemo(() => {
    return {
      left: `${(TV_SCREEN.offsetX / TV_FRAME_WIDTH) * 100}%`,
      top: `${(TV_SCREEN.offsetY / TV_FRAME_HEIGHT) * 100}%`,
      width: `${(TV_SCREEN.width / TV_FRAME_WIDTH) * 100}%`,
      height: `${(TV_SCREEN.height / TV_FRAME_HEIGHT) * 100}%`,
    };
  }, []);

  return (
    <div className="relative w-full max-w-[440px]" style={{ width: "min(440px, 70vw)" }}>
      <div className="relative w-full">
        <Image
          src="/tv-frame.png"
          alt="Retro television frame"
          width={TV_FRAME_WIDTH}
          height={TV_FRAME_HEIGHT}
          priority
          className="h-auto w-full select-none pointer-events-none"
        />
        <div className="absolute" style={screenStyle}>
          <div
            className="relative h-full w-full overflow-hidden border border-black/60 bg-black"
            style={{
              boxShadow:
                "inset 0 50px 120px rgba(0,0,0,0.95), inset 0 -45px 90px rgba(0,0,0,0.9), inset 35px 0 80px rgba(0,0,0,0.85), inset -35px 0 80px rgba(0,0,0,0.85)",
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 z-20"
              style={{
                background:
                  "radial-gradient(circle at center, rgba(0,0,0,0.25) 38%, rgba(0,0,0,0.9) 70%, rgba(0,0,0,0.99) 100%)",
                mixBlendMode: "soft-light",
              }}
            />
            {avatarState.meshData ? (
              <AvatarDisplay
                draggable={false}
                frameless
                className="!h-full !w-full"
                style={{ width: "100%", height: "100%", borderRadius: 0 }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-white/60">
                Avatar loading...
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-black/60 to-black/90" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LivingRoomBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      <Image
        src="/background.png"
        alt="Living room backdrop"
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
    </div>
  );
}
