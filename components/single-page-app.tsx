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
import { StyleSetupPanel } from "@/components/style-setup-panel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { SetupFooterPortalContext } from "@/components/setup-footer-context";
import { useToast } from "@/hooks/use-toast";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  Bug,
  CheckCircle,
  DotsThreeCircle,
  PenNibStraight,
  SignOut,
  Sphere,
  Waveform,
} from "@phosphor-icons/react";
import Image from "next/image";
import type { CSSProperties } from "react";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const TV_FRAME_WIDTH = 547;
const TV_FRAME_HEIGHT = 467;
const TV_SCREEN = {
  width: 400,
  height: 339,
  offsetX: 26,
  offsetY: 35,
};
const NOISE_DATA_URI = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
    <filter id="grain-noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" seed="8"/>
    </filter>
    <rect width="100%" height="100%" filter="url(#grain-noise)"/>
  </svg>`
)}`;

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
  const [styleSkipped, setStyleSkipped] = useState(false);
  const [voiceSkipped, setVoiceSkipped] = useState(false);
  const [avatarSkipped, setAvatarSkipped] = useState(false);
  const [voiceSetupComplete, setVoiceSetupComplete] = useState(voiceReady);
  const [avatarSetupComplete, setAvatarSetupComplete] = useState(avatarReady);
  const voiceComplete = voiceReady || voiceSkipped || voiceSetupComplete;
  const avatarComplete = avatarReady || avatarSkipped || avatarSetupComplete;
  const styleComplete = styleReady || styleSkipped;
  const [selectedPage, setSelectedPage] = useState<PageView>(() => {
    if (!voiceComplete) return "voice";
    if (!avatarComplete) return "avatar";
    if (!styleComplete) return "style";
    return "chat";
  });
  const currentPage: PageView = selectedPage;
  const [debugOpen, setDebugOpen] = useState(false);
  const [speakTogglePending, setSpeakTogglePending] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const [tvScreenRect, setTvScreenRect] = useState<DOMRect | null>(null);
  const [avatarInteractionElement, setAvatarInteractionElement] =
    useState<HTMLElement | null>(null);
  const [chatInteractionLocked, setChatInteractionLocked] = useState(false);
  const [avatarAim, setAvatarAim] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [setupFooterPortal, setSetupFooterPortal] =
    useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (voiceReady) {
      setVoiceSetupComplete(true);
    }
  }, [voiceReady]);

  useEffect(() => {
    if (avatarReady) {
      setAvatarSetupComplete(true);
    }
  }, [avatarReady]);

  const handleNav = useCallback(
    (page: PageView, options?: { force?: boolean }) => {
      const canNavigate =
        page === "voice" ||
        (page === "avatar" && voiceComplete) ||
        (page === "style" && voiceComplete && avatarComplete) ||
        ((page === "chat" || page === "mindmap") &&
          voiceComplete &&
          avatarComplete &&
          styleComplete);

      if (!canNavigate && !options?.force) return;
      setSelectedPage(page);
    },
    [avatarComplete, styleComplete, voiceComplete]
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
      const message = error instanceof Error ? error.message : String(error);
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

  useEffect(() => {
    if (currentPage !== "chat") {
      setTvScreenRect(null);
      setAvatarInteractionElement(null);
      setChatInteractionLocked(false);
      setAvatarAim({ x: 0, y: 0 });
    }
  }, [currentPage]);

  useEffect(() => {
    if (currentPage !== "chat") return;
    const handlePointer = (event: PointerEvent) => {
      if (typeof window === "undefined") return;
      const width = window.innerWidth || 1;
      const height = window.innerHeight || 1;
      const normalizedX = Math.min(
        Math.max((event.clientX / width) * 2 - 1, -1),
        1
      );
      const normalizedY = Math.min(
        Math.max((event.clientY / height) * 2 - 1, -1),
        1
      );
      setAvatarAim({ x: -normalizedX, y: -normalizedY });
    };
    const resetAim = () => setAvatarAim({ x: 0, y: 0 });
    window.addEventListener("pointermove", handlePointer);
    window.addEventListener("pointerleave", resetAim);
    window.addEventListener("blur", resetAim);
    return () => {
      window.removeEventListener("pointermove", handlePointer);
      window.removeEventListener("pointerleave", resetAim);
      window.removeEventListener("blur", resetAim);
    };
  }, [currentPage]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!settingsMenuRef.current) return;
      if (!settingsMenuRef.current.contains(event.target as Node)) {
        setSettingsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, []);

  useEffect(() => {
    if (!settingsMenuOpen) return;
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [settingsMenuOpen]);

  const handleStyleChange = useCallback((next: CommunicationStyle | null) => {
    setStyleData(next);
    setStyleSkipped(false);
    setStyleReady(Boolean(next));
  }, []);

  const handleWipeConfigurations = useCallback(async () => {
    try {
      await deleteCommunicationStyle();
      setStyleData(null);
      setStyleReady(false);
      setStyleSkipped(false);
      await deleteVoiceProfile();
      updateProfile(null);
      setSpeakBackEnabledLocal(false);
      resetAvatar();
      setVoiceSkipped(false);
      setAvatarSkipped(false);
      setVoiceSetupComplete(false);
      setAvatarSetupComplete(false);
      toast({ title: "Voice, avatar, and style cleared" });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to wipe configurations";
      toast({ title: "Error", description: message, variant: "destructive" });
      throw error;
    }
  }, [
    resetAvatar,
    setAvatarSetupComplete,
    setSpeakBackEnabledLocal,
    setVoiceSetupComplete,
    toast,
    updateProfile,
  ]);

  const mainNavItems = useMemo(
    () => [
      {
        value: "chat" as PageView,
        label: "Chat",
        disabled: !voiceComplete || !avatarComplete || !styleComplete,
      },
      {
        value: "mindmap" as PageView,
        label: "Brain",
        disabled: !voiceComplete || !avatarComplete || !styleComplete,
      },
    ],
    [avatarComplete, styleComplete, voiceComplete]
  );

  const setupOptions = useMemo(
    () => [
      { value: "voice" as PageView, label: "Voice", disabled: false },
      {
        value: "avatar" as PageView,
        label: "Avatar",
        disabled: !voiceComplete,
      },
      {
        value: "style" as PageView,
        label: "Style",
        disabled: !voiceComplete || !avatarComplete,
      },
    ],
    [avatarComplete, voiceComplete]
  );

  const isSetupPage =
    currentPage === "voice" ||
    currentPage === "avatar" ||
    currentPage === "style";
  const setupComplete = voiceComplete && avatarComplete && styleComplete;

  const handleSetupSelection = useCallback(
    (value: string) => {
      setSettingsMenuOpen(false);
      if (value === "signout") {
        onSignOut();
        return;
      }
      if (value === "toggle-debug") {
        setDebugOpen((prev) => !prev);
        return;
      }
      if (value === "setup") {
        handleNav("voice");
        return;
      }
      handleNav(value as PageView);
    },
    [handleNav, onSignOut, setDebugOpen, setSettingsMenuOpen]
  );

  const renderPage = () => {
    switch (currentPage) {
      case "voice":
        return (
          <SetupScreen
            contentClassName="border-none bg-transparent p-0 shadow-none"
          >
            <VoiceSettingsPanel
              onSkip={() => {
                setVoiceSkipped(true);
                handleNav("avatar", { force: true });
                toast({
                  title: "Voice setup skipped",
                  description: "You can return here anytime.",
                });
              }}
              onComplete={() => {
                setVoiceSkipped(false);
                setVoiceSetupComplete(true);
                handleNav("avatar", { force: true });
              }}
            />
          </SetupScreen>
        );
      case "avatar":
        return (
          <SetupScreen
          >
            <FaceAvatarPanel
              onSkip={() => {
                setAvatarSkipped(true);
                handleNav("style", { force: true });
              }}
              onComplete={() => {
                setAvatarSkipped(false);
                setAvatarSetupComplete(true);
                handleNav("style", { force: true });
              }}
            />
          </SetupScreen>
        );
      case "style":
        return (
          <SetupScreen
            contentClassName="px-0"
          >
            <StyleSetupPanel
              initialStyle={styleData}
              onStyleChange={handleStyleChange}
              onSkip={() => {
                setStyleSkipped(true);
                handleNav("chat", { force: true });
              }}
              onComplete={() => {
                setStyleSkipped(false);
                handleNav("chat", { force: true });
              }}
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
          <div className="relative flex h-full w-full flex-1 overflow-hidden">
            <LivingRoomBackdrop />
            <div
              className="absolute inset-0 z-10 flex items-center justify-center"
              style={{ transform: "translateY(-50px)" }}
            >
              <RetroTelevision
                onScreenRectChange={setTvScreenRect}
                interactionTarget={avatarInteractionElement}
                aim={avatarAim}
              />
            </div>
            <DynamicGrainLayer />
            <div className="relative z-20 flex flex-1 overflow-hidden pt-0">
              <div
                className={cn(
                  "mx-auto flex w-full flex-1 items-end px-4 pb-12 pt-6 md:px-8",
                  chatInteractionLocked
                    ? "pointer-events-none"
                    : "pointer-events-auto"
                )}
              >
                <ChatInterface />
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background relative">
      {isSetupPage ? (
        <SetupFooterPortalContext.Provider value={setupFooterPortal}>
          <div className="relative flex min-h-screen flex-1 flex-col bg-gradient-to-br from-[#03170f] via-[#020c08] to-[#010203] text-white">
            <div className="flex flex-1 overflow-y-auto px-4 py-10">
              <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-between gap-8 text-center">
                <header className="flex justify-center">
                  <SetupProgressHeader
                    currentStep={currentPage}
                    voiceComplete={voiceComplete}
                    avatarComplete={avatarComplete}
                    styleComplete={styleComplete}
                    onSelect={handleNav}
                    allComplete={setupComplete}
                  />
                </header>
                <main className="flex flex-1 items-center justify-center">
                  <div className="flex w-full">{renderPage()}</div>
                </main>
                <footer
                  ref={setSetupFooterPortal}
                  className="flex min-h-[110px] items-center justify-center"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDebugOpen(true)}
              className="pointer-events-auto fixed bottom-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-white/10 text-white/80 opacity-80 shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition hover:opacity-100 hover:text-white"
              aria-label="Open debug panel"
            >
              <Bug className="h-4 w-4" weight="fill" />
            </button>
          </div>
        </SetupFooterPortalContext.Provider>
      ) : (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-3 py-0">
          <div className="pointer-events-auto flex w-full items-center gap-3 py-2.5">
            <div className="flex items-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white shadow-[0_18px_35px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
                <Image
                  src="/logo.svg"
                  alt="Digital Twin logo"
                  width={22}
                  height={22}
                  className="h-6 w-6"
                  priority
                />
              </div>
            </div>
            <div className="flex flex-1 justify-center">
              <div className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 shadow-[0_25px_45px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
                {mainNavItems.map((item) => {
                  const isActive = currentPage === item.value;
                  return (
                    <Button
                      key={item.value}
                      variant="ghost"
                      className={cn(
                        "flex w-32 items-center justify-center gap-3 rounded-2xl px-4 py-1.5 text-sm capitalize tracking-wide transition",
                        isActive
                          ? "bg-white/35 text-white shadow-[0_18px_45px_rgba(0,0,0,0.4)]"
                          : "text-white/70 hover:bg-white/15"
                      )}
                      disabled={item.disabled}
                      onClick={() => handleNav(item.value)}
                    >
                      {item.label.toLowerCase()}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-end">
              <div
                ref={settingsMenuRef}
                className="relative flex flex-col items-end"
              >
                <button
                  type="button"
                  onClick={() => setSettingsMenuOpen((prev) => !prev)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/80 text-white shadow-[0_18px_35px_rgba(0,0,0,0.45)] transition hover:border-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  aria-haspopup="menu"
                  aria-expanded={settingsMenuOpen}
                  aria-label="Open settings menu"
                >
                  <DotsThreeCircle className="h-6 w-6" weight="fill" />
                </button>
                {settingsMenuOpen ? (
                  <div className="absolute right-0 top-full z-30 mt-3 w-56 rounded-2xl border border-white/15 bg-black/90 py-3 text-left text-white shadow-[0_30px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                    <p className="px-4 pb-2 text-[11px] uppercase tracking-[0.35em] text-white/40">
                      Settings
                    </p>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        disabled={isSetupPage}
                        onClick={() => handleSetupSelection("setup")}
                        className={cn(
                          "flex w-full items-center justify-between px-4 py-2 text-sm transition",
                          isSetupPage
                            ? "cursor-not-allowed text-white/30"
                            : "text-white/80 hover:bg-white/5 hover:text-white"
                        )}
                      >
                        <span>Setup</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetupSelection("toggle-debug")}
                        className="flex w-full items-center justify-between px-4 py-2 text-sm text-white/80 transition hover:bg-white/5 hover:text-white"
                      >
                        <span>Console</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetupSelection("signout")}
                        className="flex w-full items-center justify-between px-4 py-2 text-sm text-white/80 transition hover:bg-white/5 hover:text-white"
                      >
                        <div className="flex items-center gap-2">
                          <SignOut className="h-4 w-4 text-white" />
                          <span>Logout</span>
                        </div>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
      {!isSetupPage && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {renderPage()}
        </div>
      )}

      {currentPage === "chat" && tvScreenRect ? (
        <AvatarInteractionOverlay
          rect={tvScreenRect}
          onPointerEngaged={setChatInteractionLocked}
          onElementReady={setAvatarInteractionElement}
          onAimChange={setAvatarAim}
        />
      ) : null}

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
                initialStyle={styleData}
                onStyleChange={handleStyleChange}
                onWipeConfigurations={handleWipeConfigurations}
              />
            </div>
          </Card>
        </div>
      ) : null}

      <GreenCursorGlow />
    </div>
  );
}

interface SetupScreenProps {
  children: React.ReactNode;
  contentClassName?: string;
}

function SetupScreen({ children, contentClassName }: SetupScreenProps) {
  return (
    <section
      className={cn(
        "flex w-full flex-1 flex-col text-white",
        contentClassName
      )}
    >
      {children}
    </section>
  );
}

interface AvatarDisplayProps {
  draggable?: boolean;
  className?: string;
  frameless?: boolean;
  style?: CSSProperties;
  interactionTarget?: HTMLElement | null;
  aim?: { x: number; y: number } | null;
}

function AvatarDisplay({
  draggable = true,
  className,
  frameless = false,
  style,
  interactionTarget,
  aim = null,
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
      interactionTarget={interactionTarget}
      aim={aim}
    />
  );
}

interface SetupProgressHeaderProps {
  currentStep: PageView;
  voiceComplete: boolean;
  avatarComplete: boolean;
  styleComplete: boolean;
  onSelect: (step: PageView) => void;
  allComplete: boolean;
}

function SetupProgressHeader({
  currentStep,
  voiceComplete,
  avatarComplete,
  styleComplete,
  onSelect,
  allComplete,
}: SetupProgressHeaderProps) {
  const labels: Record<
    PageView,
    {
      step: string;
      title: string;
    }
  > = {
    voice: { step: "Step 1", title: "Capture My Voice" },
    avatar: { step: "Step 2", title: "Build My Avatar" },
    style: { step: "Step 3", title: "Tune My Style" },
    chat: { step: "", title: "" },
    mindmap: { step: "", title: "" },
  };

  const steps: Array<{
    key: PageView;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { key: "voice", icon: Waveform },
    { key: "avatar", icon: Sphere },
    { key: "style", icon: PenNibStraight },
  ];

  const statusFor = (key: PageView) => {
    if (currentStep === key) return "current";
    if (key === "voice" && voiceComplete) return "complete";
    if (key === "avatar" && avatarComplete) return "complete";
    if (key === "style" && styleComplete) return "complete";
    return "upcoming";
  };

  return (
    <div className="w-full text-white">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 text-center">
        <Image
          src="/logo.svg"
          alt="Digital Twin logo"
          width={28}
          height={28}
          className="h-7 w-7"
          priority
        />
        <div className="space-y-0.5 text-white/90">
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-emerald-200">
            {labels[currentStep].step}
          </p>
          <h2 className="text-xl font-semibold text-white">
            {labels[currentStep].title}
          </h2>
        </div>

        <div className="flex w-full max-w-lg items-center justify-center gap-4 text-emerald-100">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const status = statusFor(step.key);
            return (
              <Fragment key={step.key}>
                <button
                  type="button"
                  onClick={() => onSelect(step.key)}
                  className={cn(
                    "relative flex h-10 w-10 items-center justify-center rounded-full border transition",
                    status === "current" &&
                      "border-transparent bg-white text-black shadow-[0_6px_18px_rgba(0,0,0,0.35)]",
                    status === "complete" &&
                      "border-transparent bg-emerald-400 text-emerald-950 shadow-[0_5px_14px_rgba(0,255,150,0.3)]",
                    status === "upcoming" && "border-white/30 text-white/40"
                  )}
                >
                  <Icon className="h-4 w-4" weight="regular" />
                </button>
                {index < steps.length - 1 && (
                  <div className="h-px w-12 bg-white/15" />
                )}
              </Fragment>
            );
          })}
        </div>
        {currentStep === "style" && !allComplete ? (
          <p className="text-xs text-white/50">
            Finish the remaining steps to unlock the Digital Twin experience.
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface AvatarInteractionOverlayProps {
  rect: DOMRect;
  onPointerEngaged?: (active: boolean) => void;
  onElementReady?: (element: HTMLElement | null) => void;
}

function AvatarInteractionOverlay({
  rect,
  onPointerEngaged,
  onElementReady,
}: AvatarInteractionOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = overlayRef.current;
    onElementReady?.(element);
    return () => {
      onElementReady?.(null);
      onPointerEngaged?.(false);
    };
  }, [onElementReady, onPointerEngaged]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]" aria-hidden="true">
      <div
        ref={overlayRef}
        className="pointer-events-auto absolute cursor-grab active:cursor-grabbing"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }}
        onPointerDown={() => {
          onPointerEngaged?.(true);
        }}
        onPointerUp={() => {
          onPointerEngaged?.(false);
        }}
        onPointerCancel={() => {
          onPointerEngaged?.(false);
        }}
        onPointerLeave={() => {
          onPointerEngaged?.(false);
        }}
      />
    </div>
  );
}

function DynamicGrainLayer() {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) {
      return;
    }

    overlay.style.setProperty("--cursor-x", "50%");
    overlay.style.setProperty("--cursor-y", "50%");

    const interval = window.setInterval(() => {
      overlay.style.backgroundPosition = `${Math.random() * 100}% ${
        Math.random() * 100
      }%`;
    }, 120);

    const handlePointer = (event: PointerEvent) => {
      if (!overlayRef.current || typeof window === "undefined") return;
      const x = (event.clientX / window.innerWidth) * 100;
      const y = (event.clientY / window.innerHeight) * 100;
      overlayRef.current.style.setProperty("--cursor-x", `${x}%`);
      overlayRef.current.style.setProperty("--cursor-y", `${y}%`);
    };

    window.addEventListener("pointermove", handlePointer);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pointermove", handlePointer);
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute inset-0 z-[15] opacity-35"
      style={{
        backgroundImage: `url("${NOISE_DATA_URI}")`,
        backgroundSize: "220px",
        mixBlendMode: "screen",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at var(--cursor-x, 50%) var(--cursor-y, 50%), rgba(0,255,140,0.2), transparent 45%)",
          mixBlendMode: "soft-light",
        }}
      />
    </div>
  );
}

interface RetroTelevisionProps {
  onScreenRectChange?: (rect: DOMRect | null) => void;
  interactionTarget?: HTMLElement | null;
  aim?: { x: number; y: number };
}

function RetroTelevision({
  onScreenRectChange,
  interactionTarget,
  aim,
}: RetroTelevisionProps) {
  const { avatarState } = useAvatar();
  const screenRef = useRef<HTMLDivElement>(null);
  const screenStyle = useMemo(() => {
    return {
      left: `${(TV_SCREEN.offsetX / TV_FRAME_WIDTH) * 100}%`,
      top: `${(TV_SCREEN.offsetY / TV_FRAME_HEIGHT) * 100}%`,
      width: `${(TV_SCREEN.width / TV_FRAME_WIDTH) * 100}%`,
      height: `${(TV_SCREEN.height / TV_FRAME_HEIGHT) * 100}%`,
    };
  }, []);

  useLayoutEffect(() => {
    if (!onScreenRectChange || typeof window === "undefined") return;
    const updateRect = () => {
      if (!screenRef.current) return;
      onScreenRectChange(screenRef.current.getBoundingClientRect());
    };
    updateRect();
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("resize", updateRect);
      onScreenRectChange(null);
    };
  }, [onScreenRectChange]);

  return (
    <div
      className="relative w-full"
      style={{ width: "min(55vw, 55vh, 520px)" }}
    >
      <div className="relative w-full">
        <Image
          src="/tv-frame.png"
          alt="Retro television frame"
          width={TV_FRAME_WIDTH}
          height={TV_FRAME_HEIGHT}
          priority
          className="h-auto w-full select-none pointer-events-none brightness-[0.85] contrast-[1.05]"
        />
        <div
          ref={screenRef}
          className="absolute pointer-events-none"
          style={screenStyle}
        >
          <div
            className="pointer-events-auto relative h-full w-full overflow-hidden border border-black/60 bg-black"
            style={{
              boxShadow:
                "inset 0 50px 120px rgba(0,0,0,0.95), inset 0 -45px 90px rgba(0,0,0,0.9), inset 35px 0 80px rgba(0,0,0,0.85), inset -35px 0 80px rgba(0,0,0,0.85)",
              filter: "brightness(0.9) contrast(1.1)",
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
                className="!h-full !w-full cursor-grab active:cursor-grabbing"
                style={{ width: "100%", height: "100%", borderRadius: 0 }}
                interactionTarget={interactionTarget}
                aim={aim}
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

function GreenCursorGlow() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const glow = glowRef.current;
    if (!glow) {
      return;
    }

    let frame: number;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;

    const handlePointer = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
    };

    const animate = () => {
      currentX += (targetX - currentX) * 0.2;
      currentY += (targetY - currentY) * 0.2;
      glow.style.transform = `translate3d(${currentX - 120}px, ${
        currentY - 120
      }px, 0)`;
      frame = window.requestAnimationFrame(animate);
    };

    animate();

    window.addEventListener("pointermove", handlePointer);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handlePointer);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] mix-blend-screen">
      <div
        ref={glowRef}
        className="absolute h-60 w-60 rounded-full opacity-40 blur-3xl transition-transform duration-150"
        style={{
          background:
            "radial-gradient(circle, rgba(0,255,157,0.6) 0%, rgba(0,255,157,0.1) 40%, transparent 70%)",
          boxShadow: "0 0 120px rgba(0,255,157,0.4)",
          transform: "translate3d(-999px, -999px, 0)",
        }}
      />
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
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
    </div>
  );
}
