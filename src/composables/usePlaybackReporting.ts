export interface PlaybackProgressPayload {
  itemId: string
  mediaSourceId: string
  playSessionId?: string
  positionTicks: number
  isPaused: boolean
  isMuted: boolean
  volumeLevel: number
}

export interface PlaybackReportingActions {
  reportPlaybackStart: (
    itemId: string,
    mediaSourceId: string,
    playSessionId: string | undefined,
    positionTicks: number,
  ) => Promise<void>
  reportPlaybackProgress: (payload: PlaybackProgressPayload) => Promise<void>
  reportPlaybackStopped: (
    itemId: string,
    mediaSourceId: string,
    playSessionId: string | undefined,
    positionTicks: number,
  ) => Promise<void>
}

export function usePlaybackReporting(actions: PlaybackReportingActions) {
  let lastProgressReportAt = 0

  function resetProgressReporting() {
    lastProgressReportAt = 0
  }

  async function reportStart(
    itemId: string,
    mediaSourceId: string,
    playSessionId: string | undefined,
    positionTicks: number,
  ) {
    await actions.reportPlaybackStart(itemId, mediaSourceId, playSessionId, positionTicks)
  }

  async function reportProgress(payload: PlaybackProgressPayload, intervalMs = 10_000) {
    const now = Date.now()
    if (now - lastProgressReportAt < intervalMs) {
      return
    }

    lastProgressReportAt = now
    await actions.reportPlaybackProgress(payload)
  }

  async function reportStopped(
    itemId: string,
    mediaSourceId: string,
    playSessionId: string | undefined,
    positionTicks: number,
  ) {
    await actions.reportPlaybackStopped(itemId, mediaSourceId, playSessionId, positionTicks)
  }

  return {
    reportProgress,
    reportStart,
    reportStopped,
    resetProgressReporting,
  }
}
