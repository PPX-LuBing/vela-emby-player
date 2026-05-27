import { describe, expect, it } from 'vitest'
import {
  filterPlayableLibraries,
  getLibraryItemTypes,
  normalizeLibraryItems,
  PLAYED_ITEM_TYPES,
  RESUME_ITEM_TYPES,
} from './embyLibraryApi'
import type { EmbyItem, EmbyLibrary } from './useEmbyClient'

describe('embyLibraryApi', () => {
  it('groups audio tracks into music albums when needed', () => {
    const normalized = normalizeLibraryItems([
      {
        Id: 'track-1',
        Name: 'Track 1',
        Type: 'Audio',
        AlbumId: 'album-1',
        Album: 'Album One',
        AlbumArtist: 'Artist A',
        ParentIndexNumber: 1,
        IndexNumber: 1,
        UserData: { Played: false },
      },
      {
        Id: 'track-2',
        Name: 'Track 2',
        Type: 'Audio',
        AlbumId: 'album-1',
        Album: 'Album One',
        AlbumArtist: 'Artist A',
        ParentIndexNumber: 1,
        IndexNumber: 2,
        UserData: { Played: true },
      },
      {
        Id: 'album-2',
        Name: 'Existing Album',
        Type: 'MusicAlbum',
        AlbumArtist: 'Artist B',
        ChildCount: 4,
      },
    ] as EmbyItem[])

    const syntheticAlbum = normalized.items.find((item) => item.Id === 'album-1')
    expect(syntheticAlbum?.Type).toBe('MusicAlbum')
    expect(syntheticAlbum?.UserData?.UnplayedItemCount).toBe(1)
    expect(normalized.episodeGroups['album-1']).toHaveLength(2)
    expect(normalized.items.some((item) => item.Type === 'Audio')).toBe(false)
    expect(normalized.items.some((item) => item.Id === 'album-2')).toBe(true)
  })

  it('includes music libraries and music item types', () => {
    const libraries: EmbyLibrary[] = [{ Id: 'music', Name: '音乐', CollectionType: 'music' }]

    expect(filterPlayableLibraries(libraries)).toHaveLength(1)
    expect(getLibraryItemTypes('music')).toBe('MusicArtist,MusicAlbum,Audio')
  })

  it('groups episode history into a series display item while preserving episode groups', () => {
    const normalized = normalizeLibraryItems([
      {
        Id: 'episode-1',
        Name: 'Episode One',
        Type: 'Episode',
        SeriesId: 'series-1',
        SeriesName: 'Series One',
        SeriesPrimaryImageTag: 'series-image',
        ParentIndexNumber: 1,
        IndexNumber: 1,
        UserData: { PlaybackPositionTicks: 100, Played: false },
      },
      {
        Id: 'episode-2',
        Name: 'Episode Two',
        Type: 'Episode',
        SeriesId: 'series-1',
        SeriesName: 'Series One',
        ParentIndexNumber: 1,
        IndexNumber: 2,
        UserData: { Played: true },
      },
    ] as EmbyItem[])

    expect(normalized.items).toHaveLength(1)
    expect(normalized.items[0]).toMatchObject({ Id: 'series-1', Name: 'Series One', Type: 'Series' })
    expect(normalized.items.some((item) => item.Type === 'Episode')).toBe(false)
    expect(normalized.episodeGroups['series-1']).toHaveLength(2)
  })

  it('keeps server item order when grouping episodes and audio', () => {
    const normalized = normalizeLibraryItems([
      { Id: 'movie-new', Name: 'Z Movie', Type: 'Movie' },
      {
        Id: 'episode-new',
        Name: 'Episode New',
        Type: 'Episode',
        SeriesId: 'series-new',
        SeriesName: 'A Series',
      },
      {
        Id: 'track-new',
        Name: 'Track New',
        Type: 'Audio',
        AlbumId: 'album-new',
        Album: 'B Album',
      },
      { Id: 'movie-old', Name: 'C Movie', Type: 'Movie' },
    ] as EmbyItem[])

    expect(normalized.items.map((item) => item.Id)).toEqual([
      'movie-new',
      'series-new',
      'album-new',
      'movie-old',
    ])
  })

  it('includes collections and playlists in browseable libraries', () => {
    const libraries: EmbyLibrary[] = [
      { Id: 'collections', Name: '合集', CollectionType: 'boxsets' },
      { Id: 'playlists', Name: '播放列表', CollectionType: 'playlists' },
    ]

    expect(filterPlayableLibraries(libraries)).toHaveLength(2)
    expect(getLibraryItemTypes('movies')).toContain('BoxSet')
    expect(getLibraryItemTypes()).toContain('Playlist')
  })

  it('keeps resume and played history item types playable', () => {
    expect(RESUME_ITEM_TYPES).toBe('Movie,Episode,Audio')
    expect(PLAYED_ITEM_TYPES).toBe(RESUME_ITEM_TYPES)
  })
})
