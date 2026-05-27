import { computed, type ComputedRef } from 'vue'
import type { EmbyItem } from './useEmbyClient'
import { isItemCollection } from './mediaItemDisplay'

interface UseEpisodeQueueOptions {
  item: ComputedRef<Readonly<EmbyItem | null>>
  episodes: ComputedRef<readonly EmbyItem[]>
  onSelectEpisode: (episode: EmbyItem) => void
}

export function useEpisodeQueue(options: UseEpisodeQueueOptions) {
  const episodeOptions = computed(() => {
    const item = options.item.value
    if (!item || !isPlayableQueueItem(item)) {
      return []
    }

    if (item.Type === 'MusicArtist') {
      return [...options.episodes.value]
        .filter((episode) => episode.Type === 'Audio')
        .sort(compareEpisodes)
    }

    if (isItemCollection(item)) {
      return [...options.episodes.value]
        .filter(isPlayableQueueItem)
        .sort(compareEpisodes)
    }

    const currentGroupKey = getQueueGroupKey(item)
    return [...options.episodes.value]
      .filter((episode) => {
        if (!isPlayableQueueItem(episode)) {
          return false
        }

        return matchesQueueGroup(item, episode, currentGroupKey)
      })
      .sort(compareEpisodes)
  })

  const currentEpisodeIndex = computed(() => {
    const item = options.item.value
    if (!item || !episodeOptions.value.length || isQueueRoot(item)) {
      return -1
    }

    return episodeOptions.value.findIndex((episode) => episode.Id === item.Id)
  })

  const previousEpisode = computed(() => {
    if (options.item.value && isQueueRoot(options.item.value)) {
      return null
    }

    const index = currentEpisodeIndex.value
    return index > 0 ? episodeOptions.value[index - 1] : null
  })

  const nextEpisode = computed(() => {
    if (options.item.value && isQueueRoot(options.item.value)) {
      return episodeOptions.value[0] ?? null
    }

    const index = currentEpisodeIndex.value
    return index >= 0 && index < episodeOptions.value.length - 1
      ? episodeOptions.value[index + 1]
      : null
  })

  const selectedEpisodeId = computed({
    get: () => episodeOptions.value.find((candidate) => candidate.Id === options.item.value?.Id)?.Id
      ?? episodeOptions.value[0]?.Id
      ?? '',
    set: (episodeId: string) => {
      const episode = episodeOptions.value.find((candidate) => candidate.Id === episodeId)
      if (episode) {
        options.onSelectEpisode(episode)
      }
    },
  })

  return {
    episodeOptions,
    formatEpisodeOption,
    nextEpisode,
    previousEpisode,
    selectedEpisodeId,
  }
}

function compareEpisodes(first: EmbyItem, second: EmbyItem) {
  const firstSeason = first.ParentIndexNumber ?? 0
  const secondSeason = second.ParentIndexNumber ?? 0
  if (firstSeason !== secondSeason) {
    return firstSeason - secondSeason
  }

  const firstEpisode = first.IndexNumber ?? 0
  const secondEpisode = second.IndexNumber ?? 0
  if (firstEpisode !== secondEpisode) {
    return firstEpisode - secondEpisode
  }

  return first.Name.localeCompare(second.Name)
}

function isPlayableQueueItem(item: EmbyItem) {
  return ['Episode', 'Audio', 'MusicArtist', 'MusicAlbum', 'Movie', 'MusicVideo', 'BoxSet', 'Playlist'].includes(item.Type)
}

function isQueueRoot(item: EmbyItem) {
  return item.Type === 'MusicArtist' || item.Type === 'MusicAlbum' || isItemCollection(item)
}

function getQueueGroupKey(item: EmbyItem) {
  if (item.Type === 'Episode') {
    return item.SeriesId || item.SeriesName?.trim().toLowerCase() || item.Name.trim().toLowerCase()
  }

  if (item.Type === 'MusicAlbum') {
    return item.Id
  }

  if (item.Type === 'Audio') {
    return item.AlbumId || item.ParentId || item.Album?.trim().toLowerCase() || item.Name.trim().toLowerCase()
  }

  return ''
}

function matchesQueueGroup(current: EmbyItem, candidate: EmbyItem, currentGroupKey: string) {
  if (!currentGroupKey) {
    return false
  }

  if (current.Type === 'Episode' && candidate.Type !== 'Episode') {
    return false
  }

  if ((current.Type === 'Audio' || current.Type === 'MusicAlbum') && candidate.Type !== 'Audio') {
    return false
  }

  const candidateGroupKey = getQueueGroupKey(candidate)
  return Boolean(candidateGroupKey && candidateGroupKey === currentGroupKey)
}

function formatEpisodeOption(episode: EmbyItem) {
  if (episode.Type === 'Audio') {
    const disc = episode.ParentIndexNumber ? `D${String(episode.ParentIndexNumber).padStart(2, '0')}` : 'D00'
    const track = episode.IndexNumber ? `T${String(episode.IndexNumber).padStart(2, '0')}` : 'Track'
    return `${disc}${track}  ${episode.Name}`
  }

  const season = episode.ParentIndexNumber
    ? `S${String(episode.ParentIndexNumber).padStart(2, '0')}`
    : 'S00'
  const episodeNumber = episode.IndexNumber
    ? `E${String(episode.IndexNumber).padStart(2, '0')}`
    : 'EP'
  return `${season}${episodeNumber}  ${episode.Name}`
}
