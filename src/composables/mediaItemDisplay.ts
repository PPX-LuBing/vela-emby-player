import type { EmbyItem } from './useEmbyClient'

const TICKS_PER_SECOND = 10_000_000
const TICKS_PER_MINUTE = TICKS_PER_SECOND * 60
const DEFAULT_RESUME_END_PADDING_SECONDS = 30

export function isTvItem(item: EmbyItem) {
  return item.Type === 'Series' || item.Type === 'Episode'
}

export function isMusicItem(item: EmbyItem) {
  return item.Type === 'MusicArtist' || item.Type === 'MusicAlbum' || item.Type === 'Audio'
}

export function isLiveTvItem(item: EmbyItem) {
  return item.Type === 'TvChannel' || item.Type === 'Channel'
}

export function formatQueueItemTitle(item: EmbyItem) {
  if (item.Type === 'Episode') {
    const season = item.ParentIndexNumber ? `S${String(item.ParentIndexNumber).padStart(2, '0')}` : ''
    const episode = item.IndexNumber ? `E${String(item.IndexNumber).padStart(2, '0')}` : ''
    return [item.SeriesName, `${season}${episode}`, item.Name].filter(Boolean).join(' · ')
  }

  if (item.Type === 'Audio') {
    return [item.Album || item.AlbumArtists?.[0] || item.Artists?.[0], formatAudioTrackNumber(item), item.Name]
      .filter(Boolean)
      .join(' · ')
  }

  if (isLiveTvItem(item)) {
    return [item.ChannelNumber || item.Number, item.Name, item.CurrentProgram?.Name]
      .filter(Boolean)
      .join(' · ')
  }

  return item.Name
}

export function formatAudioTrackNumber(item: EmbyItem) {
  const disc = item.ParentIndexNumber ? `D${String(item.ParentIndexNumber).padStart(2, '0')}` : ''
  const track = item.IndexNumber ? `T${String(item.IndexNumber).padStart(2, '0')}` : ''
  return [disc, track].filter(Boolean).join('')
}

export function isItemCollection(item: EmbyItem) {
  return item.Type === 'BoxSet' || item.Type === 'Playlist'
}

export function isPlayed(item: EmbyItem) {
  return Boolean(item.UserData?.Played)
}

export function progressPercent(item: EmbyItem) {
  const percent = item.UserData?.PlayedPercentage
  if (typeof percent === 'number') {
    return clampPercent(percent)
  }

  const position = item.UserData?.PlaybackPositionTicks ?? 0
  const runtime = item.RunTimeTicks ?? 0
  if (!runtime) {
    return 0
  }

  return clampPercent((position / runtime) * 100)
}

export function hasPlaybackProgress(item: EmbyItem) {
  const percent = progressPercent(item)
  return percent > 0 && percent < 98 && !isPlayed(item)
}

export function secondsToTicks(seconds: number) {
  return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds * TICKS_PER_SECOND)) : 0
}

export function ticksToSeconds(ticks: number | null | undefined) {
  return Number.isFinite(ticks) ? Math.max(0, (ticks ?? 0) / TICKS_PER_SECOND) : 0
}

export function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00'
  }

  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  }

  return `${minutes}:${String(rest).padStart(2, '0')}`
}

export function formatRuntimeMinutes(runtimeTicks: number | null | undefined) {
  return runtimeTicks ? `${Math.round(runtimeTicks / TICKS_PER_MINUTE)} 分钟` : ''
}

export function getResumePositionTicks(item: EmbyItem | null | undefined, endPaddingSeconds = DEFAULT_RESUME_END_PADDING_SECONDS) {
  const positionTicks = item?.UserData?.PlaybackPositionTicks ?? 0
  const runtimeTicks = item?.RunTimeTicks ?? 0
  if (positionTicks <= 0) {
    return 0
  }

  if (runtimeTicks > 0 && positionTicks >= runtimeTicks - secondsToTicks(endPaddingSeconds)) {
    return 0
  }

  return positionTicks
}

export function getResumePositionSeconds(item: EmbyItem | null | undefined, endPaddingSeconds = DEFAULT_RESUME_END_PADDING_SECONDS) {
  return ticksToSeconds(getResumePositionTicks(item, endPaddingSeconds))
}

function clampPercent(percent: number) {
  return Math.min(100, Math.max(0, percent))
}
