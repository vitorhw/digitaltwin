"use client"

import { useCallback, useState, type ChangeEvent } from "react"
import { SpinnerGap, Play, Square, SpeakerHigh } from '@phosphor-icons/react'
import { Button } from "@/components/ui/button"
import { useVoiceClone } from "@/components/voice-clone-provider"

export function CoquiConsole() {
  const { cloneReference, speakBackEnabled, enqueueSpeech, stopPlayback, isSynthesizing } = useVoiceClone()
  const [text, setText] = useState("Hello from my new cloned voice!")
  const [previewing, setPreviewing] = useState(false)

  const ready = Boolean(cloneReference)

  const handleSpeak = useCallback(async () => {
    if (!ready || !text.trim()) return
    setPreviewing(true)
    try {
  await enqueueSpeech(text, { force: true })
    } finally {
      setPreviewing(false)
    }
  }, [enqueueSpeech, ready, text])

  const handleStop = useCallback(() => {
    stopPlayback()
    setPreviewing(false)
  }, [stopPlayback])

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Quick Speak</h3>
        <p className="text-xs text-muted-foreground">
          Type anything and send it straight to the local Coqui XTTS server. Playback happens entirely in the browser.
        </p>
        <textarea
          value={text}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value)}
          placeholder="Type something to try out your voice clone..."
          className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!ready}
        />
        <div className="flex items-center gap-2">
          <Button onClick={handleSpeak} disabled={!ready || !text.trim() || previewing} className="gap-2">
            {previewing || isSynthesizing ? (
              <SpinnerGap className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Speak
          </Button>
          <Button variant="outline" onClick={handleStop} disabled={!ready} className="gap-2">
            <Square className="h-4 w-4" /> Stop
          </Button>
        </div>
        {!ready && (
          <p className="text-xs text-muted-foreground">
            Upload and enroll a voice sample first. Once the embeddings are cached locally, you can speak instantly.
          </p>
        )}
        {ready && !speakBackEnabled && (
          <p className="text-xs text-muted-foreground">
            Speak-back is disabled for chat replies, but you can still preview responses here.
          </p>
        )}
      </section>

      <section className="space-y-2 rounded border bg-muted/30 p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <SpeakerHigh className="h-4 w-4" /> Clone Status
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="font-semibold text-foreground">Embeddings cached</p>
            <p>{ready ? "Yes" : "No"}</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">Speak-back enabled</p>
            <p>{speakBackEnabled ? "On" : "Off"}</p>
          </div>
        </div>
        <p>
          The embeddings stay in memory (and local storage) so subsequent speech requests go directly to Coqui without
          touching Supabase or the API chat route.
        </p>
      </section>
    </div>
  )
}
