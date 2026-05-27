import type { EmbyItem } from './useEmbyClient'

const DEFAULT_TIMELINE_SLOT_MINUTES = 30
const MS_PER_MINUTE = 60_000

export interface LiveTvGuideWindow {
  minStartDate: string
  maxStartDate: string
}

export interface LiveTvTimelineSlot {
  id: string
  startMs: number
  endMs: number
}

export interface LiveTvTimelineProgram {
  program: EmbyItem
  startMs: number
  endMs: number
  offsetPercent: number
  widthPercent: number
  startsBeforeWindow: boolean
  endsAfterWindow: boolean
}

export interface LiveTvTimelineRow {
  channel: EmbyItem
  programs: LiveTvTimelineProgram[]
}

export interface LiveTvTimeline {
  startMs: number
  endMs: number
  slots: LiveTvTimelineSlot[]
  rows: LiveTvTimelineRow[]
}

export function liveTvFields() {
  return [
    'Overview',
    'ChannelInfo',
    'PrimaryImageAspectRatio',
    'UserData',
    'MediaSources',
  ].join(',')
}

export function liveTvProgramFields() {
  return [
    'Overview',
    'ChannelId',
    'ChannelName',
    'StartDate',
    'EndDate',
    'Genres',
    'ImageTags',
  ].join(',')
}

export function createLiveTvGuideWindow(now = Date.now()): LiveTvGuideWindow {
  return {
    minStartDate: new Date(now - 30 * 60 * 1000).toISOString(),
    maxStartDate: new Date(now + 8 * 60 * 60 * 1000).toISOString(),
  }
}

export function normalizeLiveTvChannels(channels: readonly EmbyItem[]) {
  return [...channels]
    .filter((channel) => channel.Type === 'TvChannel' || channel.Type === 'Channel')
    .sort(compareChannels)
}

export function normalizeLiveTvPrograms(programs: readonly EmbyItem[]) {
  const groups: Record<string, EmbyItem[]> = {}

  for (const program of programs) {
    if (!program.ChannelId) {
      continue
    }

    groups[program.ChannelId] = groups[program.ChannelId] ?? []
    groups[program.ChannelId].push(program)
  }

  for (const channelId of Object.keys(groups)) {
    groups[channelId] = [...groups[channelId]].sort(comparePrograms)
  }

  return groups
}

export function createLiveTvTimelineSlots(
  guideWindow: LiveTvGuideWindow,
  slotMinutes = DEFAULT_TIMELINE_SLOT_MINUTES,
) {
  const window = normalizeTimelineWindow(guideWindow, slotMinutes)
  if (!window) {
    return []
  }

  return createTimelineSlots(window.startMs, window.endMs, timelineSlotMs(slotMinutes))
}

export function createLiveTvTimeline(
  channels: readonly EmbyItem[],
  programsByChannel: Readonly<Record<string, readonly EmbyItem[]>>,
  guideWindow: LiveTvGuideWindow,
  slotMinutes = DEFAULT_TIMELINE_SLOT_MINUTES,
): LiveTvTimeline {
  const window = normalizeTimelineWindow(guideWindow, slotMinutes)
  if (!window) {
    return {
      startMs: 0,
      endMs: 0,
      slots: [],
      rows: [],
    }
  }

  return {
    startMs: window.startMs,
    endMs: window.endMs,
    slots: createTimelineSlots(window.startMs, window.endMs, timelineSlotMs(slotMinutes)),
    rows: channels.map((channel) => ({
      channel,
      programs: timelineProgramsForChannel(
        programsByChannel[channel.Id] ?? [],
        window.startMs,
        window.endMs,
      ),
    })),
  }
}

export function isProgramAiringNow(
  program: Pick<EmbyItem, 'StartDate' | 'EndDate'> | undefined,
  now = Date.now(),
) {
  if (!program) {
    return false
  }

  const start = Date.parse(program.StartDate ?? '')
  const end = Date.parse(program.EndDate ?? '')
  return Number.isFinite(start) && Number.isFinite(end) && start <= now && end > now
}

function compareChannels(first: EmbyItem, second: EmbyItem) {
  const firstNumber = channelNumber(first)
  const secondNumber = channelNumber(second)
  if (firstNumber !== null && secondNumber !== null && firstNumber !== secondNumber) {
    return firstNumber - secondNumber
  }

  if (firstNumber !== null) {
    return -1
  }

  if (secondNumber !== null) {
    return 1
  }

  return first.Name.localeCompare(second.Name)
}

function channelNumber(channel: EmbyItem) {
  const value = channel.ChannelNumber ?? channel.Number
  if (!value) {
    return null
  }

  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function comparePrograms(first: EmbyItem, second: EmbyItem) {
  const firstStart = Date.parse(first.StartDate ?? '')
  const secondStart = Date.parse(second.StartDate ?? '')
  if (Number.isFinite(firstStart) && Number.isFinite(secondStart) && firstStart !== secondStart) {
    return firstStart - secondStart
  }

  return first.Name.localeCompare(second.Name)
}

function normalizeTimelineWindow(guideWindow: LiveTvGuideWindow, slotMinutes: number) {
  const start = Date.parse(guideWindow.minStartDate)
  const end = Date.parse(guideWindow.maxStartDate)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null
  }

  const slotMs = timelineSlotMs(slotMinutes)
  return {
    startMs: Math.floor(start / slotMs) * slotMs,
    endMs: Math.ceil(end / slotMs) * slotMs,
  }
}

function timelineSlotMs(slotMinutes: number) {
  const minutes = Number.isFinite(slotMinutes) && slotMinutes > 0
    ? slotMinutes
    : DEFAULT_TIMELINE_SLOT_MINUTES
  return minutes * MS_PER_MINUTE
}

function createTimelineSlots(startMs: number, endMs: number, slotMs: number) {
  const slots: LiveTvTimelineSlot[] = []
  for (let slotStart = startMs; slotStart < endMs; slotStart += slotMs) {
    slots.push({
      id: new Date(slotStart).toISOString(),
      startMs: slotStart,
      endMs: Math.min(slotStart + slotMs, endMs),
    })
  }
  return slots
}

function timelineProgramsForChannel(programs: readonly EmbyItem[], windowStartMs: number, windowEndMs: number) {
  return programs
    .map((program) => createTimelineProgram(program, windowStartMs, windowEndMs))
    .filter((program): program is LiveTvTimelineProgram => Boolean(program))
    .sort(compareTimelinePrograms)
}

function createTimelineProgram(program: EmbyItem, windowStartMs: number, windowEndMs: number) {
  const start = Date.parse(program.StartDate ?? '')
  const end = Date.parse(program.EndDate ?? '')
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null
  }

  const visibleStart = Math.max(start, windowStartMs)
  const visibleEnd = Math.min(end, windowEndMs)
  if (visibleEnd <= visibleStart) {
    return null
  }

  const windowDuration = windowEndMs - windowStartMs
  return {
    program,
    startMs: visibleStart,
    endMs: visibleEnd,
    offsetPercent: ((visibleStart - windowStartMs) / windowDuration) * 100,
    widthPercent: ((visibleEnd - visibleStart) / windowDuration) * 100,
    startsBeforeWindow: start < windowStartMs,
    endsAfterWindow: end > windowEndMs,
  }
}

function compareTimelinePrograms(first: LiveTvTimelineProgram, second: LiveTvTimelineProgram) {
  if (first.startMs !== second.startMs) {
    return first.startMs - second.startMs
  }

  return first.program.Name.localeCompare(second.program.Name)
}
