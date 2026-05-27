import type { EmbyItem } from './useEmbyClient'

export const ALL_LIBRARY_FILTER_VALUE = 'all'

export interface LibraryAdvancedFilterState {
  type: string
  year: string
  genre: string
}

export function createDefaultLibraryAdvancedFilters(): LibraryAdvancedFilterState {
  return {
    type: ALL_LIBRARY_FILTER_VALUE,
    year: ALL_LIBRARY_FILTER_VALUE,
    genre: ALL_LIBRARY_FILTER_VALUE,
  }
}

export function filterItemsByAdvancedFilters(
  items: readonly EmbyItem[],
  filters: LibraryAdvancedFilterState,
) {
  return items.filter((item) => matchesAdvancedFilters(item, filters))
}

export function matchesAdvancedFilters(item: EmbyItem, filters: LibraryAdvancedFilterState) {
  if (filters.type !== ALL_LIBRARY_FILTER_VALUE && item.Type !== filters.type) {
    return false
  }

  if (filters.year !== ALL_LIBRARY_FILTER_VALUE && String(item.ProductionYear ?? '') !== filters.year) {
    return false
  }

  if (filters.genre !== ALL_LIBRARY_FILTER_VALUE && !(item.Genres ?? []).includes(filters.genre)) {
    return false
  }

  return true
}

export function createLibraryAdvancedFilterOptions(items: readonly EmbyItem[]) {
  const types = uniqueSorted(items.map((item) => item.Type))
  const years = uniqueSorted(
    items
      .map((item) => item.ProductionYear)
      .filter((year): year is number => typeof year === 'number')
      .map(String),
    (first, second) => Number(second) - Number(first),
  )
  const genres = uniqueSorted(items.flatMap((item) => item.Genres ?? []))

  return {
    types: [createAllOption('全部类型'), ...types.map((type) => ({ label: formatItemType(type), value: type }))],
    years: [createAllOption('全部年份'), ...years.map((year) => ({ label: year, value: year }))],
    genres: [createAllOption('全部类型标签'), ...genres.map((genre) => ({ label: genre, value: genre }))],
  }
}

export function hasActiveLibraryAdvancedFilters(filters: LibraryAdvancedFilterState) {
  return filters.type !== ALL_LIBRARY_FILTER_VALUE ||
    filters.year !== ALL_LIBRARY_FILTER_VALUE ||
    filters.genre !== ALL_LIBRARY_FILTER_VALUE
}

function createAllOption(label: string) {
  return {
    label,
    value: ALL_LIBRARY_FILTER_VALUE,
  }
}

function uniqueSorted(values: readonly string[], compare?: (first: string, second: string) => number) {
  return [...new Set(values.filter(Boolean))].sort(compare ?? ((first, second) => first.localeCompare(second)))
}

function formatItemType(type: string) {
  const labels: Record<string, string> = {
    Audio: '曲目',
    BoxSet: '合集',
    Episode: '分集',
    Movie: '电影',
    MusicAlbum: '专辑',
    MusicArtist: '艺术家',
    MusicVideo: '音乐视频',
    Playlist: '播放列表',
    Series: '剧集',
    TvChannel: '直播频道',
  }

  return labels[type] ?? type
}
