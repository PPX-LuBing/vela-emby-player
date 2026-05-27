import { describe, expect, it } from 'vitest'
import { createPlaybackChapters, formatChapterRange, getActiveSkippableChapter } from './playbackChapters'

describe('playbackChapters', () => {
  it('sorts chapters and computes ranges', () => {
    const chapters = createPlaybackChapters([
      { Name: 'Main', StartPositionTicks: 1200_000_000 },
      { Name: 'Intro', StartPositionTicks: 300_000_000 },
    ], 300)

    expect(chapters.map((chapter) => chapter.name)).toEqual(['Intro', 'Main'])
    expect(chapters[0].startSeconds).toBe(30)
    expect(chapters[0].endSeconds).toBe(120)
    expect(chapters[1].endSeconds).toBe(300)
  })

  it('detects active intro or outro chapters', () => {
    const chapters = createPlaybackChapters([
      { Name: 'Intro', StartPositionTicks: 300_000_000 },
      { Name: 'Episode', StartPositionTicks: 900_000_000 },
      { Name: 'End Credits', StartPositionTicks: 2700_000_000 },
    ], 300)

    expect(getActiveSkippableChapter(chapters, 31)?.kind).toBe('intro')
    expect(getActiveSkippableChapter(chapters, 95)).toBeNull()
    expect(getActiveSkippableChapter(chapters, 271)?.kind).toBe('outro')
  })

  it('formats chapter ranges', () => {
    const [chapter] = createPlaybackChapters([
      { Name: 'Intro', StartPositionTicks: 300_000_000 },
    ], 90)

    expect(formatChapterRange(chapter, (seconds) => `${seconds}s`)).toBe('30s - 90s')
  })
})
