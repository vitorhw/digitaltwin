"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";

import {
  analyzeStyleFromConversation,
  detectConversationSpeakers,
  updateCommunicationStyle,
  type CommunicationStyle,
} from "@/app/actions/style";
import { useSetupFooterPortal } from "@/components/setup-footer-context";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SpinnerGap } from "@phosphor-icons/react";

interface StyleSetupPanelProps {
  initialStyle?: CommunicationStyle | null;
  onStyleChange?: (style: CommunicationStyle | null) => void;
  onSkip?: () => void;
  onComplete?: () => void;
}

export function StyleSetupPanel({
  initialStyle,
  onStyleChange,
  onSkip,
  onComplete,
}: StyleSetupPanelProps) {
  const { toast } = useToast();
  const footerPortal = useSetupFooterPortal();
  const [conversationInput, setConversationInput] = useState("");
  const [speakerOptions, setSpeakerOptions] = useState<string[]>([]);
  const [selectedSpeaker, setSelectedSpeaker] = useState("");
  const [detectingSpeakers, setDetectingSpeakers] = useState(false);
  const [savingStyle, setSavingStyle] = useState(false);

  const readyToAnalyze =
    conversationInput.trim().length > 0 && selectedSpeaker.trim().length > 0;

  const handleConversationChange = useCallback((value: string) => {
    setConversationInput(value);
    setSpeakerOptions([]);
    setSelectedSpeaker("");
  }, []);

  const handleDetectSpeakers = useCallback(async () => {
    if (!conversationInput.trim()) {
      toast({
        title: "Conversation required",
        description: "Paste your transcript first.",
        variant: "destructive",
      });
      return;
    }
    setDetectingSpeakers(true);
    setSpeakerOptions([]);
    setSelectedSpeaker("");

    try {
      const result = await detectConversationSpeakers(conversationInput);
      if (result.error) {
        toast({
          title: "Detection failed",
          description: result.error,
          variant: "destructive",
        });
        return;
      }
      const speakers = result.speakers ?? [];
      setSpeakerOptions(speakers);
      if (speakers.length > 0) {
        setSelectedSpeaker(speakers[0]);
        toast({
          title: "Speakers detected",
          description: `Found ${speakers.length} participant${
            speakers.length === 1 ? "" : "s"
          }.`,
        });
      } else {
        toast({
          title: "No speakers found",
          description: "Trim the excerpt and try again.",
          variant: "destructive",
        });
      }
    } finally {
      setDetectingSpeakers(false);
    }
  }, [conversationInput, toast]);

  const handleAnalyzeAndSave = useCallback(async () => {
    if (!readyToAnalyze) {
      toast({
        title: "Pick your speaker",
        description: "Detect participants and choose yourself first.",
        variant: "destructive",
      });
      return;
    }
    setSavingStyle(true);
    try {
      const analysisResult = await analyzeStyleFromConversation(
        conversationInput,
        selectedSpeaker
      );
      if (analysisResult.error || !analysisResult.analysis) {
        toast({
          title: "Analysis failed",
          description: analysisResult.error ?? "No analysis returned.",
          variant: "destructive",
        });
        return;
      }

      const saveResult = await updateCommunicationStyle(
        analysisResult.analysis
      );
      if (saveResult.error) {
        toast({
          title: "Unable to store style",
          description: saveResult.error,
          variant: "destructive",
        });
        return;
      }
      onStyleChange?.(saveResult.style ?? null);
      toast({
        title: "Style captured",
        description: "Your communication blueprint is ready.",
      });
      onComplete?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Unexpected error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSavingStyle(false);
    }
  }, [
    conversationInput,
    onComplete,
    onStyleChange,
    readyToAnalyze,
    selectedSpeaker,
    toast,
  ]);

  const footerContent = (
    <div className="flex flex-col items-center gap-3 text-white/80">
      <Button
        onClick={handleAnalyzeAndSave}
        disabled={!readyToAnalyze || savingStyle}
        className={cn(
          "h-14 w-56 rounded-full border border-white/25 text-lg font-semibold tracking-wide transition-all",
          readyToAnalyze
            ? "bg-white text-black shadow-[0_18px_45px_rgba(255,255,255,0.35)]"
            : "bg-white/15 text-white/80 backdrop-blur-2xl"
        )}
      >
        {savingStyle ? (
          <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        Next
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="text-sm text-white/60 underline-offset-4 hover:text-white"
        onClick={() => {
          toast({
            title: "Style skipped",
            description: "Finish setup later from the system console.",
          });
          onSkip?.();
        }}
      >
        Skip for now
      </Button>
    </div>
  );

  return (
    <div className="flex h-full w-full flex-1 flex-col px-4 py-6 text-center text-white">
      <div className="mb-8 flex flex-col items-center gap-2 text-white/80">
        <p className="max-w-xl text-sm">
          Paste a real conversation you wrote. We will learn how you naturally
          speak from it.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="flex w-full max-w-3xl flex-col gap-6 rounded-[32px] p-8 text-left">
          <Textarea
            placeholder="Paste a chat log here..."
            className="min-h-[200px] resize-none border-white/10 bg-black/20 text-sm text-white placeholder:text-white/30"
            value={conversationInput}
            onChange={(event) => handleConversationChange(event.target.value)}
          />

          <div className="space-y-6">
            <div className="flex justify-center">
              <Button
                size="sm"
                variant="outline"
                className="h-10 rounded-2xl border-white/30 bg-white/5 px-6 text-sm text-white/80 transition hover:bg-white/15 hover:text-white"
                onClick={handleDetectSpeakers}
                disabled={detectingSpeakers || !conversationInput.trim()}
              >
                {detectingSpeakers ? (
                  <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Detect speakers
              </Button>
            </div>

            {speakerOptions.length > 0 ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="text-sm text-white/80">
                  Who are you in this conversation?
                </p>
                <Select value={selectedSpeaker} onValueChange={setSelectedSpeaker}>
                  <SelectTrigger className="h-12 w-full max-w-sm rounded-2xl border-white/30 bg-black/40 text-white">
                    <SelectValue placeholder="Select your display name" />
                  </SelectTrigger>
                  <SelectContent>
                    {speakerOptions.map((speaker) => (
                      <SelectItem key={speaker} value={speaker}>
                        {speaker}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {footerPortal ? createPortal(footerContent, footerPortal) : footerContent}
    </div>
  );
}
