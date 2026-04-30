import { computed, readonly, shallowRef } from 'vue'

const CLIENT_NAME = 'Vela Player'
const DEVICE_NAME = 'Browser'
const DEVICE_ID_KEY = 'emby_external_player_device_id'
const SESSION_KEY = 'emby_external_player_session'
const ACCOUNTS_KEY = 'vela_player_accounts'
const ACTIVE_ACCOUNT_KEY = 'vela_player_active_account'

export interface EmbySession {
  id: string
  serverUrl: string
  userId: string
  accessToken: string
  username: string
  displayName: string
  lastUsedAt: number
}

export interface EmbyLibrary {
  Id: string
  Name: string
  CollectionType?: string
}

export interface EmbyItem {
  Id: string
  Name: string
  Type: string
  Overview?: string
  ProductionYear?: number
  RunTimeTicks?: number
  SeriesId?: string
  SeriesName?: string
  SeriesPrimaryImageTag?: string
  SeasonId?: string
  SeasonName?: string
  ParentIndexNumber?: number
  IndexNumber?: number
  ChildCount?: number
  RecursiveItemCount?: number
  UserData?: {
    PlaybackPositionTicks?: number
    Played?: boolean
    PlayedPercentage?: number
    UnplayedItemCount?: number
  }
  ImageTags?: Record<string, string>
  BackdropImageTags?: readonly string[]
  Genres?: readonly string[]
  CommunityRating?: number
  MediaSources?: readonly {
    Id: string
    Container?: string
    Path?: string
  }[]
}

export interface EmbyMediaStream {
  Index: number
  Type: 'Audio' | 'Subtitle' | 'Video'
  Codec?: string
  Language?: string
  DisplayTitle?: string
  IsDefault?: boolean
  IsForced?: boolean
  IsExternal?: boolean
  DeliveryUrl?: string
}

export interface EmbyMediaSource {
  Id: string
  Name?: string
  Container?: string
  Path?: string
  Size?: number
  Bitrate?: number
  SupportsDirectPlay?: boolean
  SupportsDirectStream?: boolean
  SupportsTranscoding?: boolean
  TranscodingUrl?: string
  DirectStreamUrl?: string
  MediaStreams?: readonly EmbyMediaStream[]
}

export interface EmbyPlaybackInfo {
  MediaSources: readonly EmbyMediaSource[]
  PlaySessionId?: string
}

export interface PlaybackUrlOptions {
  mediaSourceId?: string
  playSessionId?: string
  audioStreamIndex?: number
  subtitleStreamIndex?: number
  forceTranscode?: boolean
}

export interface MpvAuthContext {
  token: string
  authorization: string
}

interface AuthenticateResponse {
  User: {
    Id: string
    Name: string
  }
  AccessToken: string
}

const savedAccounts = loadSavedAccounts()
const accounts = shallowRef<EmbySession[]>(savedAccounts)
const session = shallowRef<EmbySession | null>(getInitialSession(savedAccounts))
const libraries = shallowRef<EmbyLibrary[]>([])
const items = shallowRef<EmbyItem[]>([])
const seriesSeasons = shallowRef<EmbyItem[]>([])
const seriesEpisodes = shallowRef<EmbyItem[]>([])
const episodeGroupsBySeries = shallowRef<Record<string, EmbyItem[]>>({})
const selectedItem = shallowRef<EmbyItem | null>(null)
const isBusy = shallowRef(false)
const errorMessage = shallowRef('')

export function useEmbyClient() {
  const isConnected = computed(() => Boolean(session.value?.accessToken))

  async function login(serverUrl: string, username: string, password: string, displayName?: string) {
    const normalizedUrl = normalizeServerUrl(serverUrl)
    isBusy.value = true
    errorMessage.value = ''

    try {
      const response = await fetch(`${normalizedUrl}/Users/AuthenticateByName`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Emby-Authorization': buildAuthorizationHeader(),
        },
        body: JSON.stringify({
          Username: username,
          Pw: password,
        }),
      })

      if (!response.ok) {
        throw new Error(`登录失败：HTTP ${response.status}`)
      }

      const data = (await response.json()) as AuthenticateResponse
      const nextSession: EmbySession = {
        id: createSessionId(normalizedUrl, data.User.Id),
        serverUrl: normalizedUrl,
        userId: data.User.Id,
        accessToken: data.AccessToken,
        username: data.User.Name,
        displayName: displayName?.trim() || `${data.User.Name} · ${safeHost(normalizedUrl)}`,
        lastUsedAt: Date.now(),
      }
      upsertAccount(nextSession)
      setActiveSession(nextSession)
      await loadLibraries()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '登录失败'
      throw error
    } finally {
      isBusy.value = false
    }
  }

  async function restore() {
    if (!session.value) {
      return
    }
    await loadLibraries()
  }

  function logout() {
    if (session.value) {
      removeAccount(session.value.id)
      return
    }

    clearCurrentData()
  }

  async function switchAccount(accountId: string) {
    const target = accounts.value.find((account) => account.id === accountId)
    if (!target) {
      return
    }

    setActiveSession({
      ...target,
      lastUsedAt: Date.now(),
    })
    upsertAccount(session.value)
    await loadLibraries()
  }

  function removeAccount(accountId: string) {
    accounts.value = accounts.value.filter((account) => account.id !== accountId)
    persistAccounts()

    if (session.value?.id === accountId) {
      const nextSession = accounts.value[0] ?? null
      setActiveSession(nextSession)
      if (nextSession) {
        loadLibraries().catch(() => {
          // Error state is displayed by the UI.
        })
      }
    }
  }

  function updateAccount(accountId: string, updates: Pick<EmbySession, 'displayName' | 'serverUrl'>) {
    const normalizedUrl = normalizeServerUrl(updates.serverUrl)
    accounts.value = accounts.value.map((account) => {
      if (account.id !== accountId) {
        return account
      }

      return {
        ...account,
        displayName: updates.displayName.trim() || `${account.username} · ${safeHost(normalizedUrl)}`,
        serverUrl: normalizedUrl,
      }
    })
    persistAccounts()

    const updatedCurrent = accounts.value.find((account) => account.id === session.value?.id)
    if (updatedCurrent) {
      setActiveSession(updatedCurrent)
    }
  }

  function clearCurrentData() {
    libraries.value = []
    items.value = []
    seriesSeasons.value = []
    seriesEpisodes.value = []
    episodeGroupsBySeries.value = {}
    selectedItem.value = null
  }

  function setActiveSession(nextSession: EmbySession | null) {
    session.value = nextSession
    clearCurrentData()

    if (nextSession) {
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, nextSession.id)
      localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession))
    } else {
      localStorage.removeItem(ACTIVE_ACCOUNT_KEY)
      localStorage.removeItem(SESSION_KEY)
    }
  }

  function upsertAccount(nextSession: EmbySession | null) {
    if (!nextSession) {
      return
    }

    accounts.value = [
      nextSession,
      ...accounts.value.filter((account) => account.id !== nextSession.id),
    ]
    persistAccounts()
  }

  function persistAccounts() {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts.value))
  }

  function signOutCurrentOnly() {
    session.value = null
    clearCurrentData()
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(ACTIVE_ACCOUNT_KEY)
  }

  async function loadLibraries() {
    const active = requireSession()
    isBusy.value = true
    errorMessage.value = ''

    try {
      const data = await request<{ Items: EmbyLibrary[] }>(
        `/Users/${active.userId}/Views`,
      )
      libraries.value = data.Items.filter((library) =>
        ['movies', 'tvshows', 'mixed', undefined].includes(library.CollectionType),
      )
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '媒体库加载失败'
      throw error
    } finally {
      isBusy.value = false
    }
  }

  async function loadItems(library: string | EmbyLibrary) {
    const active = requireSession()
    const parentId = typeof library === 'string' ? library : library.Id
    const collectionType = typeof library === 'string' ? undefined : library.CollectionType
    isBusy.value = true
    errorMessage.value = ''

    try {
      const params = new URLSearchParams({
        ParentId: parentId,
        Recursive: 'true',
        IncludeItemTypes: getLibraryItemTypes(collectionType),
        Fields: itemFields(),
        SortBy: 'SortName',
        SortOrder: 'Ascending',
        Limit: '80',
      })
      const data = await request<{ Items: EmbyItem[] }>(
        `/Users/${active.userId}/Items?${params.toString()}`,
      )
      const normalized = normalizeLibraryItems(data.Items)
      items.value = normalized.items
      episodeGroupsBySeries.value = normalized.episodeGroups
      seriesSeasons.value = []
      seriesEpisodes.value = []
      selectedItem.value = normalized.items[0] ?? null
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '条目加载失败'
      throw error
    } finally {
      isBusy.value = false
    }
  }

  async function loadSeriesEpisodes(seriesId: string) {
    const active = requireSession()
    const cachedEpisodes = episodeGroupsBySeries.value[seriesId]
    isBusy.value = true
    errorMessage.value = ''

    try {
      if (cachedEpisodes?.length) {
        seriesSeasons.value = createSeasonsFromEpisodes(cachedEpisodes)
        seriesEpisodes.value = cachedEpisodes
      }

      if (seriesId.startsWith('series-name:')) {
        return
      }

      const seasonsParams = new URLSearchParams({
        UserId: active.userId,
        Fields: itemFields(),
      })
      const episodesParams = new URLSearchParams({
        UserId: active.userId,
        Fields: itemFields(),
      })
      const [seasonsData, episodesData] = await Promise.all([
        request<{ Items: EmbyItem[] }>(
          `/Shows/${seriesId}/Seasons?${seasonsParams.toString()}`,
        ),
        request<{ Items: EmbyItem[] }>(
          `/Shows/${seriesId}/Episodes?${episodesParams.toString()}`,
        ),
      ])
      seriesEpisodes.value = [...episodesData.Items].sort(compareEpisodes)
      seriesSeasons.value =
        seasonsData.Items.length > 0
          ? [...seasonsData.Items].sort(compareSeasons)
          : createSeasonsFromEpisodes(seriesEpisodes.value)
    } catch (error) {
      if (cachedEpisodes?.length) {
        return
      }

      errorMessage.value = error instanceof Error ? error.message : '分集加载失败'
      throw error
    } finally {
      isBusy.value = false
    }
  }

  function clearSeriesEpisodes() {
    seriesSeasons.value = []
    seriesEpisodes.value = []
  }

  function selectItem(item: EmbyItem) {
    selectedItem.value = item
  }

  function getImageUrl(item: EmbyItem, width = 480) {
    const active = session.value
    if (!active || !item.ImageTags?.Primary) {
      return ''
    }

    return `${active.serverUrl}/Items/${item.Id}/Images/Primary?maxWidth=${width}&quality=90&tag=${item.ImageTags.Primary}&api_key=${active.accessToken}`
  }

  function getBackdropUrl(item: EmbyItem, width = 1200) {
    const active = session.value
    const tag = item.BackdropImageTags?.[0]
    if (!active || !tag) {
      return ''
    }

    return `${active.serverUrl}/Items/${item.Id}/Images/Backdrop/0?maxWidth=${width}&quality=88&tag=${tag}&api_key=${active.accessToken}`
  }

  function getStreamUrl(item: EmbyItem) {
    const active = requireSession()
    const params = new URLSearchParams({
      Static: 'true',
      api_key: active.accessToken,
    })

    return `${active.serverUrl}/Videos/${item.Id}/stream?${params.toString()}`
  }

  async function getPlaybackInfo(itemId: string) {
    const active = requireSession()
    const params = new URLSearchParams({
      UserId: active.userId,
      StartTimeTicks: '0',
      IsPlayback: 'true',
      AutoOpenLiveStream: 'true',
    })

    return request<EmbyPlaybackInfo>(`/Items/${itemId}/PlaybackInfo?${params.toString()}`, {
      method: 'POST',
      body: JSON.stringify({
        DeviceProfile: buildBrowserPlaybackProfile(),
        MaxStreamingBitrate: 80_000_000,
      }),
    })
  }

  function getPlaybackUrl(itemId: string, source: EmbyMediaSource, options: PlaybackUrlOptions = {}) {
    const active = requireSession()

    if (!options.forceTranscode && source.DirectStreamUrl) {
      return absolutizeUrl(source.DirectStreamUrl, active.serverUrl, active.accessToken)
    }

    if (source.TranscodingUrl) {
      return absolutizeUrl(source.TranscodingUrl, active.serverUrl, active.accessToken)
    }

    const mediaSourceId = options.mediaSourceId ?? source.Id
    const shouldUseHls = options.forceTranscode || !isBrowserDirectPlayable(source)

    if (shouldUseHls) {
      const params = new URLSearchParams({
        UserId: active.userId,
        MediaSourceId: mediaSourceId,
        PlaySessionId: options.playSessionId ?? '',
        VideoCodec: 'h264',
        AudioCodec: 'aac',
        AudioStreamIndex: String(options.audioStreamIndex ?? getDefaultStream(source, 'Audio')?.Index ?? 1),
        SubtitleMethod: 'Encode',
        api_key: active.accessToken,
      })

      if (typeof options.subtitleStreamIndex === 'number') {
        params.set('SubtitleStreamIndex', String(options.subtitleStreamIndex))
      }

      return `${active.serverUrl}/Videos/${itemId}/master.m3u8?${params.toString()}`
    }

    const params = new URLSearchParams({
      Static: 'true',
      MediaSourceId: mediaSourceId,
      api_key: active.accessToken,
    })

    if (typeof options.audioStreamIndex === 'number') {
      params.set('AudioStreamIndex', String(options.audioStreamIndex))
    }

    if (typeof options.subtitleStreamIndex === 'number') {
      params.set('SubtitleStreamIndex', String(options.subtitleStreamIndex))
    }

    return `${active.serverUrl}/Videos/${itemId}/stream?${params.toString()}`
  }

  function getSubtitleUrl(itemId: string, mediaSourceId: string, subtitleStreamIndex: number) {
    const active = requireSession()
    const params = new URLSearchParams({
      api_key: active.accessToken,
    })

    return `${active.serverUrl}/Videos/${itemId}/${mediaSourceId}/Subtitles/${subtitleStreamIndex}/Stream.vtt?${params.toString()}`
  }

  function getMpvAuthContext(): MpvAuthContext {
    const active = requireSession()
    return {
      token: active.accessToken,
      authorization: buildAuthorizationHeader(active.accessToken),
    }
  }

  async function reportPlaybackStart(
    itemId: string,
    mediaSourceId: string,
    playSessionId: string | undefined,
    positionTicks: number,
  ) {
    await request<void>('/Sessions/Playing', {
      method: 'POST',
      body: JSON.stringify({
        ItemId: itemId,
        MediaSourceId: mediaSourceId,
        PlaySessionId: playSessionId,
        PositionTicks: Math.round(positionTicks),
        CanSeek: true,
      }),
    })
  }

  async function reportPlaybackProgress(payload: {
    itemId: string
    mediaSourceId: string
    playSessionId?: string
    positionTicks: number
    isPaused: boolean
    isMuted: boolean
    volumeLevel: number
  }) {
    await request<void>('/Sessions/Playing/Progress', {
      method: 'POST',
      body: JSON.stringify({
        ItemId: payload.itemId,
        MediaSourceId: payload.mediaSourceId,
        PlaySessionId: payload.playSessionId,
        PositionTicks: Math.round(payload.positionTicks),
        IsPaused: payload.isPaused,
        IsMuted: payload.isMuted,
        VolumeLevel: Math.round(payload.volumeLevel),
        CanSeek: true,
      }),
    })
  }

  async function reportPlaybackStopped(
    itemId: string,
    mediaSourceId: string,
    playSessionId: string | undefined,
    positionTicks: number,
  ) {
    await request<void>('/Sessions/Playing/Stopped', {
      method: 'POST',
      body: JSON.stringify({
        ItemId: itemId,
        MediaSourceId: mediaSourceId,
        PlaySessionId: playSessionId,
        PositionTicks: Math.round(positionTicks),
      }),
    })
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const active = requireSession()
    const response = await fetch(`${active.serverUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Emby-Token': active.accessToken,
        'X-Emby-Authorization': buildAuthorizationHeader(active.accessToken),
        ...init.headers,
      },
    })

    if (!response.ok) {
      throw new Error(`Emby 请求失败：HTTP ${response.status}`)
    }

    if (response.status === 204) {
      return undefined as T
    }

    const text = await response.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  return {
    session: readonly(session),
    accounts: readonly(accounts),
    libraries: readonly(libraries),
    items: readonly(items),
    seriesSeasons: readonly(seriesSeasons),
    seriesEpisodes: readonly(seriesEpisodes),
    selectedItem: readonly(selectedItem),
    isBusy: readonly(isBusy),
    errorMessage: readonly(errorMessage),
    isConnected,
    getImageUrl,
    getBackdropUrl,
    getMpvAuthContext,
    getPlaybackInfo,
    getPlaybackUrl,
    getSubtitleUrl,
    getStreamUrl,
    clearSeriesEpisodes,
    loadItems,
    loadSeriesEpisodes,
    login,
    logout,
    removeAccount,
    reportPlaybackProgress,
    reportPlaybackStart,
    reportPlaybackStopped,
    restore,
    selectItem,
    signOutCurrentOnly,
    switchAccount,
    updateAccount,
  }
}

function requireSession() {
  if (!session.value) {
    throw new Error('尚未连接 Emby 服务器')
  }

  return session.value
}

function normalizeServerUrl(serverUrl: string) {
  const trimmed = serverUrl.trim().replace(/\/+$/, '')
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  return `http://${trimmed}`
}

function createSessionId(serverUrl: string, userId: string) {
  return `${serverUrl}::${userId}`
}

function itemFields() {
  return [
    'Overview',
    'ProductionYear',
    'RunTimeTicks',
    'SeriesId',
    'SeriesPrimaryImageTag',
    'SeasonId',
    'SeasonName',
    'MediaSources',
    'Path',
    'BackdropImageTags',
    'Genres',
    'CommunityRating',
    'ChildCount',
    'RecursiveItemCount',
    'UserData',
  ].join(',')
}

function getLibraryItemTypes(collectionType?: string) {
  if (collectionType === 'tvshows') {
    return 'Series'
  }

  if (collectionType === 'movies') {
    return 'Movie'
  }

  return 'Movie,Series'
}

function normalizeLibraryItems(rawItems: EmbyItem[]) {
  const episodeGroups = groupEpisodesBySeries(rawItems)
  const seriesIds = new Set(
    rawItems
      .filter((item) => item.Type === 'Series')
      .map((item) => item.Id),
  )
  const displayItems = rawItems.filter((item) => item.Type !== 'Episode')

  for (const [seriesId, episodes] of Object.entries(episodeGroups)) {
    if (seriesIds.has(seriesId)) {
      continue
    }

    displayItems.push(createSeriesItemFromEpisodes(seriesId, episodes))
  }

  return {
    items: displayItems.sort(compareLibraryItems),
    episodeGroups,
  }
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

function createSeriesItemFromEpisodes(seriesId: string, episodes: EmbyItem[]): EmbyItem {
  const firstEpisode = episodes[0]
  const seriesName = firstEpisode?.SeriesName || firstEpisode?.Name || '未命名剧集'

  return {
    Id: seriesId,
    Name: seriesName,
    Type: 'Series',
    Overview: firstEpisode?.Overview,
    ProductionYear: firstEpisode?.ProductionYear,
    ChildCount: episodes.length,
    RecursiveItemCount: episodes.length,
    ImageTags: firstEpisode?.SeriesPrimaryImageTag && !seriesId.startsWith('series-name:')
      ? { Primary: firstEpisode.SeriesPrimaryImageTag }
      : undefined,
    Genres: firstEpisode?.Genres,
    CommunityRating: firstEpisode?.CommunityRating,
    UserData: {
      UnplayedItemCount: episodes.filter((episode) => !episode.UserData?.Played).length,
    },
  }
}

function createSeriesNameId(seriesName: string) {
  return `series-name:${seriesName.trim().toLowerCase()}`
}

function compareLibraryItems(first: EmbyItem, second: EmbyItem) {
  return first.Name.localeCompare(second.Name)
}

function createSeasonsFromEpisodes(episodes: readonly EmbyItem[]) {
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

function getEpisodeSeasonKey(episode: EmbyItem) {
  return episode.SeasonId || `season-index:${episode.ParentIndexNumber ?? 0}`
}

function compareSeasons(first: EmbyItem, second: EmbyItem) {
  const firstSeason = first.IndexNumber ?? first.ParentIndexNumber ?? 0
  const secondSeason = second.IndexNumber ?? second.ParentIndexNumber ?? 0
  if (firstSeason !== secondSeason) {
    return firstSeason - secondSeason
  }

  return first.Name.localeCompare(second.Name)
}

function formatSeasonName(seasonNumber: number) {
  if (seasonNumber === 0) {
    return '特别篇 / 剧场版'
  }

  return `第 ${seasonNumber} 季`
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

function buildAuthorizationHeader(token?: string) {
  const parts = [
    `MediaBrowser Client="${CLIENT_NAME}"`,
    `Device="${DEVICE_NAME}"`,
    `DeviceId="${getDeviceId()}"`,
    'Version="0.1.0"',
  ]

  if (token) {
    parts.push(`Token="${token}"`)
  }

  return parts.join(', ')
}

function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) {
    return existing
  }

  const next = crypto.randomUUID()
  localStorage.setItem(DEVICE_ID_KEY, next)
  return next
}

function loadSavedSession() {
  const rawSession = localStorage.getItem(SESSION_KEY)
  if (!rawSession) {
    return null
  }

  try {
    return JSON.parse(rawSession) as EmbySession
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

function loadSavedAccounts() {
  const rawAccounts = localStorage.getItem(ACCOUNTS_KEY)
  const legacySession = loadSavedSession()

  if (!rawAccounts) {
    return legacySession ? [normalizeSession(legacySession)] : []
  }

  try {
    const parsed = JSON.parse(rawAccounts) as EmbySession[]
    const normalized = parsed.map(normalizeSession)
    if (legacySession && !normalized.some((account) => account.id === normalizeSession(legacySession).id)) {
      normalized.unshift(normalizeSession(legacySession))
    }

    return normalized
  } catch {
    localStorage.removeItem(ACCOUNTS_KEY)
    return legacySession ? [normalizeSession(legacySession)] : []
  }
}

function getInitialSession(savedAccounts: EmbySession[]) {
  const activeId = localStorage.getItem(ACTIVE_ACCOUNT_KEY)
  return (
    savedAccounts.find((account) => account.id === activeId) ??
    savedAccounts[0] ??
    null
  )
}

function normalizeSession(savedSession: Partial<EmbySession> & Omit<EmbySession, 'id' | 'displayName' | 'lastUsedAt'>) {
  const id = savedSession.id ?? createSessionId(savedSession.serverUrl, savedSession.userId)
  return {
    ...savedSession,
    id,
    displayName: savedSession.displayName ?? `${savedSession.username} · ${safeHost(savedSession.serverUrl)}`,
    lastUsedAt: savedSession.lastUsedAt ?? Date.now(),
  }
}

function safeHost(serverUrl: string) {
  try {
    return new URL(serverUrl).host
  } catch {
    return serverUrl
  }
}

function buildBrowserPlaybackProfile() {
  return {
    MaxStreamingBitrate: 80_000_000,
    MaxStaticBitrate: 80_000_000,
    MusicStreamingTranscodingBitrate: 384_000,
    DirectPlayProfiles: [
      {
        Type: 'Video',
        Container: 'mp4,m4v,webm',
        VideoCodec: 'h264,hevc,vp8,vp9,av1',
        AudioCodec: 'aac,mp3,opus,vorbis,flac,alac',
      },
      {
        Type: 'Audio',
        Container: 'mp3,aac,m4a,flac,webm,ogg',
        AudioCodec: 'mp3,aac,flac,opus,vorbis,alac',
      },
    ],
    TranscodingProfiles: [
      {
        Type: 'Video',
        Container: 'ts',
        Protocol: 'hls',
        VideoCodec: 'h264',
        AudioCodec: 'aac,mp3',
        Context: 'Streaming',
      },
      {
        Type: 'Video',
        Container: 'mp4',
        VideoCodec: 'h264',
        AudioCodec: 'aac,mp3',
        Context: 'Streaming',
      },
    ],
    SubtitleProfiles: [
      { Format: 'vtt', Method: 'External' },
      { Format: 'srt', Method: 'External' },
      { Format: 'ass', Method: 'Encode' },
      { Format: 'ssa', Method: 'Encode' },
      { Format: 'pgssub', Method: 'Encode' },
      { Format: 'dvdsub', Method: 'Encode' },
    ],
  }
}

function isBrowserDirectPlayable(source: EmbyMediaSource) {
  const container = source.Container?.toLowerCase()
  return Boolean(
    source.SupportsDirectPlay &&
      container &&
      ['mp4', 'm4v', 'webm'].includes(container),
  )
}

function getDefaultStream(source: EmbyMediaSource, type: EmbyMediaStream['Type']) {
  const streams = source.MediaStreams?.filter((stream) => stream.Type === type) ?? []
  return streams.find((stream) => stream.IsDefault) ?? streams[0]
}

function absolutizeUrl(url: string, serverUrl: string, accessToken: string) {
  const absoluteUrl = url.startsWith('http') ? url : `${serverUrl}${url}`
  if (absoluteUrl.includes('api_key=') || absoluteUrl.includes('api_key%3D')) {
    return absoluteUrl
  }

  const separator = absoluteUrl.includes('?') ? '&' : '?'
  return `${absoluteUrl}${separator}api_key=${accessToken}`
}
