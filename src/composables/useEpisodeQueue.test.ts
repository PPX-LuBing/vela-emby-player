import { computed, shallowRef } from 'vue'
import { describe, expect, it } from 'vitest'
import { useEpisodeQueue } from './useEpisodeQueue'
import type { EmbyItem } from './useEmbyClient'

describe('useEpisodeQueue', () => {
  it('builds a track queue for music albums', () => {
    const currentItem = shallowRef<EmbyItem | null>({
      Id: 'album-1',
      Name: 'Album One',
      Type: 'MusicAlbum',
    })
    const tracks = shallowRef<EmbyItem[]>([
      {
        Id: 'track-1',
        Name: 'Track 1',
        Type: 'Audio',
        AlbumId: 'album-1',
        Album: 'Album One',
        ParentIndexNumber: 1,
        IndexNumber: 1,
      },
      {
        Id: 'track-2',
        Name: 'Track 2',
        Type: 'Audio',
        AlbumId: 'album-1',
        Album: 'Album One',
        ParentIndexNumber: 1,
        IndexNumber: 2,
      },
    ])
    const selectedIds: string[] = []

    const queue = useEpisodeQueue({
      item: computed(() => currentItem.value),
      episodes: computed(() => tracks.value),
      onSelectEpisode: (episode) => {
        selectedIds.push(episode.Id)
      },
    })

    expect(queue.episodeOptions.value.map((item) => item.Id)).toEqual(['track-1', 'track-2'])
    expect(queue.selectedEpisodeId.value).toBe('track-1')
    expect(queue.nextEpisode.value?.Id).toBe('track-1')

    queue.selectedEpisodeId.value = 'track-2'
    expect(selectedIds).toEqual(['track-2'])

    currentItem.value = tracks.value[1]
    expect(queue.selectedEpisodeId.value).toBe('track-2')
    expect(queue.previousEpisode.value?.Id).toBe('track-1')
  })

  it('builds a playable queue for item collections', () => {
    const currentItem = shallowRef<EmbyItem | null>({
      Id: 'collection-1',
      Name: 'Collection One',
      Type: 'BoxSet',
    })
    const collectionItems = shallowRef<EmbyItem[]>([
      { Id: 'movie-2', Name: 'Movie B', Type: 'Movie' },
      { Id: 'movie-1', Name: 'Movie A', Type: 'Movie' },
    ])

    const queue = useEpisodeQueue({
      item: computed(() => currentItem.value),
      episodes: computed(() => collectionItems.value),
      onSelectEpisode: () => {},
    })

    expect(queue.episodeOptions.value.map((item) => item.Id)).toEqual(['movie-1', 'movie-2'])
    expect(queue.selectedEpisodeId.value).toBe('movie-1')
    expect(queue.nextEpisode.value?.Id).toBe('movie-1')
  })

  it('builds a track queue for music artists', () => {
    const currentItem = shallowRef<EmbyItem | null>({
      Id: 'artist-1',
      Name: 'Artist One',
      Type: 'MusicArtist',
    })
    const tracks = shallowRef<EmbyItem[]>([
      { Id: 'track-2', Name: 'Track 2', Type: 'Audio', IndexNumber: 2, Artists: ['Artist One'] },
      { Id: 'track-1', Name: 'Track 1', Type: 'Audio', IndexNumber: 1, Artists: ['Artist One'] },
      { Id: 'movie-1', Name: 'Movie 1', Type: 'Movie' },
    ])

    const queue = useEpisodeQueue({
      item: computed(() => currentItem.value),
      episodes: computed(() => tracks.value),
      onSelectEpisode: () => {},
    })

    expect(queue.episodeOptions.value.map((item) => item.Id)).toEqual(['track-1', 'track-2'])
    expect(queue.nextEpisode.value?.Id).toBe('track-1')
  })
})
