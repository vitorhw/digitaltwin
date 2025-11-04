"use client"

import { useVoiceClone } from "./voice-clone-provider"

export function AudioProgressBar() {
  const { isPlaying, playbackProgress, playbackDuration } = useVoiceClone()

  if (!isPlaying || playbackDuration === 0) {
    return null
  }

  const progressPercent = (playbackProgress / playbackDuration) * 100

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          <span className="text-sm font-medium">Playing Audio</span>
        </div>
        <div className="flex-1">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-primary transition-all duration-100"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatTime(playbackProgress)} / {formatTime(playbackDuration)}
        </span>
      </div>
    </div>
  )
}
