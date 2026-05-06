import { computed, type ComputedRef } from 'vue'
import type { EmbyItem } from './useEmbyClient'

interface UseEpisodeQueueOptions {
  item: ComputedRef<Readonly<EmbyItem | null>>
  episodes: ComputedRef<readonly EmbyItem[]>
  onSelectEpisode: (episode: EmbyItem) => void
}

export function useEpisodeQueue(options: UseEpisodeQueueOptions) {
  const episodeOptions = computed(() => {
    const item = options.item.value
    if (item?.Type !== 'Episode') {
      return []
    }

    const currentSeriesId = item.SeriesId
    const currentSeriesName = item.SeriesName
    return [...options.episodes.value]
      .filter((episode) => {
        if (episode.Type !== 'Episode') {
          return false
        }

        if (currentSeriesId && episode.SeriesId) {
          return episode.SeriesId === currentSeriesId
        }

        return !currentSeriesName || episode.SeriesName === currentSeriesName
      })
      .sort(compareEpisodes)
  })

  const currentEpisodeIndex = computed(() => {
    const item = options.item.value
    if (!item || !episodeOptions.value.length) {
      return -1
    }

    return episodeOptions.value.findIndex((episode) => episode.Id === item.Id)
  })

  const previousEpisode = computed(() => {
    const index = currentEpisodeIndex.value
    return index > 0 ? episodeOptions.value[index - 1] : null
  })

  const nextEpisode = computed(() => {
    const index = currentEpisodeIndex.value
    return index >= 0 && index < episodeOptions.value.length - 1
      ? episodeOptions.value[index + 1]
      : null
  })

  const selectedEpisodeId = computed({
    get: () => options.item.value?.Id ?? '',
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

function formatEpisodeOption(episode: EmbyItem) {
  const season = episode.ParentIndexNumber
    ? `S${String(episode.ParentIndexNumber).padStart(2, '0')}`
    : 'S00'
  const episodeNumber = episode.IndexNumber
    ? `E${String(episode.IndexNumber).padStart(2, '0')}`
    : 'EP'
  return `${season}${episodeNumber}  ${episode.Name}`
}
