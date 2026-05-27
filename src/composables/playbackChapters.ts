import type { EmbyChapter } from './useEmbyClient'
import { ticksToSeconds } from './mediaItemDisplay'

const SKIP_LEEWAY_SECONDS = 4

export interface PlaybackChapter {
  index: number
  name: string
  startSeconds: number
  endSeconds: number | null
  kind: 'intro' | 'outro' | 'chapter'
}

export function createPlaybackChapters(chapters: readonly EmbyChapter[] | undefined, durationSeconds = 0) {
  const sortedChapters = (chapters ?? [])
    .map((chapter, index) => ({
      index,
      name: chapter.Name?.trim() || `章节 ${index + 1}`,
      startSeconds: ticksToSeconds(chapter.StartPositionTicks ?? 0),
    }))
    .filter((chapter) => Number.isFinite(chapter.startSeconds) && chapter.startSeconds >= 0)
    .sort((first, second) => first.startSeconds - second.startSeconds)

  return sortedChapters.map((chapter, index): PlaybackChapter => {
    const nextChapter = sortedChapters[index + 1]
    const endSeconds = nextChapter?.startSeconds ?? (durationSeconds > chapter.startSeconds ? durationSeconds : null)
    return {
      ...chapter,
      endSeconds,
      kind: classifyChapter(chapter.name),
    }
  })
}

export function getActiveSkippableChapter(chapters: readonly PlaybackChapter[], positionSeconds: number) {
  return chapters.find((chapter) => {
    if (chapter.kind === 'chapter' || chapter.endSeconds === null) {
      return false
    }

    return positionSeconds >= chapter.startSeconds - SKIP_LEEWAY_SECONDS &&
      positionSeconds < chapter.endSeconds - 1
  }) ?? null
}

export function formatChapterRange(chapter: PlaybackChapter, formatTime: (seconds: number) => string) {
  if (chapter.endSeconds === null) {
    return formatTime(chapter.startSeconds)
  }

  return `${formatTime(chapter.startSeconds)} - ${formatTime(chapter.endSeconds)}`
}

function classifyChapter(name: string): PlaybackChapter['kind'] {
  const normalized = name.trim().toLowerCase()
  if (/\b(intro|opening|op)\b|片头|开场/.test(normalized)) {
    return 'intro'
  }

  if (/\b(outro|ending|end credits|credits|ed)\b|片尾|结尾|演职员表/.test(normalized)) {
    return 'outro'
  }

  return 'chapter'
}
