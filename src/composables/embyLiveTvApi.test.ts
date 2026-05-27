import { describe, expect, it } from 'vitest'
import {
  createLiveTvGuideWindow,
  createLiveTvTimeline,
  createLiveTvTimelineSlots,
  isProgramAiringNow,
  normalizeLiveTvChannels,
  normalizeLiveTvPrograms,
} from './embyLiveTvApi'
import type { EmbyItem } from './useEmbyClient'

describe('embyLiveTvApi', () => {
  it('keeps live tv channels sorted by numeric channel number', () => {
    const channels = normalizeLiveTvChannels([
      { Id: 'movies', Name: 'Movies', Type: 'TvChannel', ChannelNumber: '12' },
      { Id: 'news', Name: 'News', Type: 'TvChannel', ChannelNumber: '2' },
      { Id: 'ignored', Name: 'Ignored', Type: 'Movie' },
      { Id: 'radio', Name: 'Radio', Type: 'Channel' },
    ] as EmbyItem[])

    expect(channels.map((channel) => channel.Id)).toEqual(['news', 'movies', 'radio'])
  })

  it('groups guide programs by channel and sorts by start date', () => {
    const programs = normalizeLiveTvPrograms([
      {
        Id: 'late',
        Name: 'Late Show',
        Type: 'Program',
        ChannelId: 'news',
        StartDate: '2026-05-12T12:00:00.000Z',
      },
      {
        Id: 'early',
        Name: 'Morning News',
        Type: 'Program',
        ChannelId: 'news',
        StartDate: '2026-05-12T08:00:00.000Z',
      },
      {
        Id: 'no-channel',
        Name: 'Ignored',
        Type: 'Program',
      },
    ] as EmbyItem[])

    expect(programs.news.map((program) => program.Id)).toEqual(['early', 'late'])
    expect(programs['']).toBeUndefined()
  })

  it('creates a bounded guide window around now', () => {
    const guideWindow = createLiveTvGuideWindow(Date.parse('2026-05-12T12:00:00.000Z'))

    expect(guideWindow.minStartDate).toBe('2026-05-12T11:30:00.000Z')
    expect(guideWindow.maxStartDate).toBe('2026-05-12T20:00:00.000Z')
  })

  it('detects only currently airing programs', () => {
    const now = Date.parse('2026-05-12T12:00:00.000Z')

    expect(isProgramAiringNow({
      StartDate: '2026-05-12T11:30:00.000Z',
      EndDate: '2026-05-12T12:30:00.000Z',
    }, now)).toBe(true)
    expect(isProgramAiringNow({
      StartDate: '2026-05-12T12:30:00.000Z',
      EndDate: '2026-05-12T13:00:00.000Z',
    }, now)).toBe(false)
  })

  it('creates aligned timeline slots for the guide window', () => {
    const slots = createLiveTvTimelineSlots({
      minStartDate: '2026-05-12T11:45:00.000Z',
      maxStartDate: '2026-05-12T13:05:00.000Z',
    }, 30)

    expect(slots.map((slot) => [
      new Date(slot.startMs).toISOString(),
      new Date(slot.endMs).toISOString(),
    ])).toEqual([
      ['2026-05-12T11:30:00.000Z', '2026-05-12T12:00:00.000Z'],
      ['2026-05-12T12:00:00.000Z', '2026-05-12T12:30:00.000Z'],
      ['2026-05-12T12:30:00.000Z', '2026-05-12T13:00:00.000Z'],
      ['2026-05-12T13:00:00.000Z', '2026-05-12T13:30:00.000Z'],
    ])
  })

  it('clips timeline programs to the visible window', () => {
    const timeline = createLiveTvTimeline(
      [{ Id: 'news', Name: 'News', Type: 'TvChannel' }] as EmbyItem[],
      {
        news: [
          {
            Id: 'before',
            Name: 'Before Window',
            Type: 'Program',
            StartDate: '2026-05-12T10:00:00.000Z',
            EndDate: '2026-05-12T11:00:00.000Z',
          },
          {
            Id: 'leading',
            Name: 'Leading News',
            Type: 'Program',
            StartDate: '2026-05-12T11:30:00.000Z',
            EndDate: '2026-05-12T12:30:00.000Z',
          },
          {
            Id: 'trailing',
            Name: 'Late News',
            Type: 'Program',
            StartDate: '2026-05-12T13:30:00.000Z',
            EndDate: '2026-05-12T14:30:00.000Z',
          },
        ] as EmbyItem[],
      },
      {
        minStartDate: '2026-05-12T12:00:00.000Z',
        maxStartDate: '2026-05-12T14:00:00.000Z',
      },
      60,
    )

    const programs = timeline.rows[0].programs
    expect(programs.map((entry) => entry.program.Id)).toEqual(['leading', 'trailing'])
    expect(programs[0].startsBeforeWindow).toBe(true)
    expect(programs[0].offsetPercent).toBe(0)
    expect(programs[0].widthPercent).toBe(25)
    expect(programs[1].endsAfterWindow).toBe(true)
    expect(programs[1].offsetPercent).toBe(75)
    expect(programs[1].widthPercent).toBe(25)
  })

  it('keeps timeline rows in channel order and programs sorted by time', () => {
    const timeline = createLiveTvTimeline(
      [
        { Id: 'movies', Name: 'Movies', Type: 'TvChannel' },
        { Id: 'news', Name: 'News', Type: 'TvChannel' },
      ] as EmbyItem[],
      {
        news: [
          {
            Id: 'late',
            Name: 'Late News',
            Type: 'Program',
            StartDate: '2026-05-12T13:00:00.000Z',
            EndDate: '2026-05-12T14:00:00.000Z',
          },
          {
            Id: 'early',
            Name: 'Early News',
            Type: 'Program',
            StartDate: '2026-05-12T12:00:00.000Z',
            EndDate: '2026-05-12T13:00:00.000Z',
          },
        ] as EmbyItem[],
      },
      {
        minStartDate: '2026-05-12T12:00:00.000Z',
        maxStartDate: '2026-05-12T14:00:00.000Z',
      },
      60,
    )

    expect(timeline.rows.map((row) => row.channel.Id)).toEqual(['movies', 'news'])
    expect(timeline.rows[1].programs.map((entry) => entry.program.Id)).toEqual(['early', 'late'])
  })
})
