import type { EmbyItem, EmbyLibrary, LibrarySortKey, SortOrder } from './useEmbyClient'

export const LIBRARY_PAGE_SIZE = 80
export const SEARCH_PAGE_SIZE = 48
export const COLLECTION_ITEM_TYPES = 'BoxSet,Playlist'
export const MUSIC_ITEM_TYPES = 'MusicArtist,MusicAlbum,Audio'
export const PLAYABLE_COLLECTION_ITEM_TYPES = `Movie,Series,${MUSIC_ITEM_TYPES},${COLLECTION_ITEM_TYPES}`
export const HOME_ITEM_TYPES = 'Movie,Episode,Audio,MusicAlbum'
export const RESUME_ITEM_TYPES = 'Movie,Episode,Audio'
export const PLAYED_ITEM_TYPES = 'Movie,Episode,Audio'
export const LATEST_ITEM_TYPES = `Movie,Episode,Audio,MusicAlbum,${COLLECTION_ITEM_TYPES}`
export const FAVORITE_ITEM_TYPES = `Movie,Series,Episode,Audio,MusicAlbum,${COLLECTION_ITEM_TYPES}`
export const SEARCH_ITEM_TYPES = FAVORITE_ITEM_TYPES

export interface LibraryQueryOptions {
  sortBy?: LibrarySortKey
  sortOrder?: SortOrder
  preserveSelection?: boolean
}

export function itemFields() {
  return [
    'Overview',
    'ProductionYear',
    'PremiereDate',
    'OfficialRating',
    'RunTimeTicks',
    'ParentId',
    'SeriesId',
    'SeriesPrimaryImageTag',
    'SeasonId',
    'SeasonName',
    'Album',
    'AlbumId',
    'AlbumArtist',
    'AlbumArtists',
    'Artists',
    'AlbumPrimaryImageTag',
    'MediaSources',
    'Path',
    'BackdropImageTags',
    'Genres',
    'Tags',
    'People',
    'Studios',
    'Chapters',
    'CommunityRating',
    'ChildCount',
    'RecursiveItemCount',
    'UserData',
  ].join(',')
}

export function getLibraryItemTypes(collectionType?: string) {
  if (collectionType === 'tvshows') {
    return 'Series'
  }

  if (collectionType === 'movies') {
    return `Movie,${COLLECTION_ITEM_TYPES}`
  }

  if (collectionType === 'music') {
    return MUSIC_ITEM_TYPES
  }

  if (collectionType === 'musicvideos') {
    return 'MusicVideo'
  }

  return PLAYABLE_COLLECTION_ITEM_TYPES
}

export function filterPlayableLibraries(libraries: EmbyLibrary[]) {
  return libraries.filter((library) =>
    ['movies', 'tvshows', 'music', 'musicvideos', 'boxsets', 'playlists', 'mixed', undefined].includes(library.CollectionType),
  )
}

export function normalizeLibraryItems(rawItems: EmbyItem[]) {
  const episodeGroups = groupEpisodesBySeries(rawItems)
  const audioGroups = groupAudioByAlbum(rawItems)
  const seriesIds = new Set(
    rawItems
      .filter((item) => item.Type === 'Series')
      .map((item) => item.Id),
  )
  const albumIds = new Set(
    rawItems
      .filter((item) => item.Type === 'MusicAlbum')
      .map((item) => item.Id),
  )
  const displayItems: EmbyItem[] = []
  const insertedSyntheticIds = new Set<string>()

  for (const item of rawItems) {
    if (item.Type === 'Episode') {
      const seriesId = item.SeriesId || createSeriesNameId(item.SeriesName || item.Name)
      if (!seriesIds.has(seriesId) && !insertedSyntheticIds.has(seriesId)) {
        displayItems.push(createSeriesItemFromEpisodes(seriesId, episodeGroups[seriesId]))
        insertedSyntheticIds.add(seriesId)
      }
      continue
    }

    if (item.Type === 'Audio') {
      const albumId = item.AlbumId || item.ParentId || createAlbumNameId(item.Album || item.Name)
      if (!albumIds.has(albumId) && !insertedSyntheticIds.has(albumId)) {
        displayItems.push(createAlbumItemFromAudio(albumId, audioGroups[albumId]))
        insertedSyntheticIds.add(albumId)
      }
      continue
    }

    displayItems.push(item)
  }

  return {
    items: displayItems,
    episodeGroups: {
      ...episodeGroups,
      ...audioGroups,
    },
  }
}

export function createSeasonsFromEpisodes(episodes: readonly EmbyItem[]) {
  const seasonMap = new Map<string, EmbyItem>()

  for (const episode of episodes) {
    const seasonKey = getEpisodeSeasonKey(episode)
    if (seasonMap.has(seasonKey)) {
      continue
    }

    const seasonNumber = episode.ParentIndexNumber ?? 0
    seasonMap.set(seasonKey, {
      Id: seasonKey,
      Name: episode.SeasonName || formatSeasonName(seasonNumber),
      Type: 'Season',
      SeriesId: episode.SeriesId,
      SeriesName: episode.SeriesName,
      ParentIndexNumber: seasonNumber,
    })
  }

  return [...seasonMap.values()].sort(compareSeasons)
}

export function compareSeasons(first: EmbyItem, second: EmbyItem) {
  const firstSeason = first.IndexNumber ?? first.ParentIndexNumber ?? 0
  const secondSeason = second.IndexNumber ?? second.ParentIndexNumber ?? 0
  if (firstSeason !== secondSeason) {
    return firstSeason - secondSeason
  }

  return first.Name.localeCompare(second.Name)
}

export function compareEpisodes(first: EmbyItem, second: EmbyItem) {
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

function groupEpisodesBySeries(rawItems: EmbyItem[]) {
  const groups: Record<string, EmbyItem[]> = {}

  for (const item of rawItems) {
    if (item.Type !== 'Episode') {
      continue
    }

    const seriesId = item.SeriesId || createSeriesNameId(item.SeriesName || item.Name)
    groups[seriesId] = groups[seriesId] ?? []
    groups[seriesId].push(item)
  }

  for (const seriesId of Object.keys(groups)) {
    groups[seriesId] = [...groups[seriesId]].sort(compareEpisodes)
  }

  return groups
}

function groupAudioByAlbum(rawItems: EmbyItem[]) {
  const groups: Record<string, EmbyItem[]> = {}

  for (const item of rawItems) {
    if (item.Type !== 'Audio') {
      continue
    }

    const albumId = item.AlbumId || item.ParentId || createAlbumNameId(item.Album || item.Name)
    groups[albumId] = groups[albumId] ?? []
    groups[albumId].push(item)
  }

  for (const albumId of Object.keys(groups)) {
    groups[albumId] = [...groups[albumId]].sort(compareEpisodes)
  }

  return groups
}

function createSeriesItemFromEpisodes(seriesId: string, episodes: EmbyItem[]): EmbyItem {
  const firstEpisode = episodes[0]
  const seriesName = firstEpisode?.SeriesName || firstEpisode?.Name || '未命名剧集'

  return {
    Id: seriesId,
    Name: seriesName,
    Type: 'Series',
    Overview: firstEpisode?.Overview,
    ProductionYear: firstEpisode?.ProductionYear,
    PremiereDate: firstEpisode?.PremiereDate,
    OfficialRating: firstEpisode?.OfficialRating,
    ChildCount: episodes.length,
    RecursiveItemCount: episodes.length,
    ImageTags: firstEpisode?.SeriesPrimaryImageTag && !seriesId.startsWith('series-name:')
      ? { Primary: firstEpisode.SeriesPrimaryImageTag }
      : undefined,
    Genres: firstEpisode?.Genres,
    Tags: firstEpisode?.Tags,
    People: firstEpisode?.People,
    Studios: firstEpisode?.Studios,
    Chapters: firstEpisode?.Chapters,
    CommunityRating: firstEpisode?.CommunityRating,
    UserData: {
      ...firstEpisode?.UserData,
      UnplayedItemCount: episodes.filter((episode) => !episode.UserData?.Played).length,
    },
  }
}

function createAlbumItemFromAudio(albumId: string, tracks: EmbyItem[]): EmbyItem {
  const firstTrack = tracks[0]
  const albumName = firstTrack?.Album || firstTrack?.Name || '未命名专辑'

  return {
    Id: albumId,
    Name: albumName,
    Type: 'MusicAlbum',
    Overview: firstTrack?.Overview,
    ProductionYear: firstTrack?.ProductionYear,
    PremiereDate: firstTrack?.PremiereDate,
    OfficialRating: firstTrack?.OfficialRating,
    ChildCount: tracks.length,
    RecursiveItemCount: tracks.length,
    ImageTags: firstTrack?.AlbumPrimaryImageTag && !albumId.startsWith('album-name:')
      ? { Primary: firstTrack.AlbumPrimaryImageTag }
      : firstTrack?.ImageTags,
    Genres: firstTrack?.Genres,
    Tags: firstTrack?.Tags,
    People: firstTrack?.People,
    Studios: firstTrack?.Studios,
    Chapters: firstTrack?.Chapters,
    AlbumArtist: firstTrack?.AlbumArtist,
    AlbumArtists: firstTrack?.AlbumArtists,
    Artists: firstTrack?.Artists,
    UserData: {
      ...firstTrack?.UserData,
      UnplayedItemCount: tracks.filter((track) => !track.UserData?.Played).length,
    },
  }
}

function createSeriesNameId(seriesName: string) {
  return `series-name:${seriesName.trim().toLowerCase()}`
}

function createAlbumNameId(albumName: string) {
  return `album-name:${albumName.trim().toLowerCase()}`
}

function getEpisodeSeasonKey(episode: EmbyItem) {
  return episode.SeasonId || `season-index:${episode.ParentIndexNumber ?? 0}`
}

function formatSeasonName(seasonNumber: number) {
  if (seasonNumber === 0) {
    return '特别篇 / 剧场版'
  }

  return `第 ${seasonNumber} 季`
}
