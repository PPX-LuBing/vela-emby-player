import { readonly, shallowRef } from 'vue'
import {
  PLAYBACK_QUALITY_OPTIONS,
} from './playbackPreferences'
import {
  ACTIVE_ACCOUNT_KEY,
  DEFAULT_PLAYBACK_USER_AGENT,
  PLAYBACK_PREFERENCES_KEY,
  PLAYBACK_USER_AGENT_KEY,
  SESSION_KEY,
  buildAuthorizationHeader,
  clearLegacyAccountStorage,
  createSessionId,
  deleteLocalAccounts,
  deleteSecureAccounts,
  getInitialPlaybackPreferences,
  getInitialPlaybackUserAgent,
  getInitialSession,
  hasCheckedKeychainMigration,
  loadLegacyAccounts,
  markKeychainMigrationChecked,
  mergeAccounts,
  normalizeEmbyHttpError,
  normalizeNetworkError,
  normalizePlaybackPreferences,
  normalizeServerUrl,
  readLocalAccounts,
  readSecureAccounts,
  safeHost,
  writeLocalAccounts,
} from './embyAccountStore'
import {
  FAVORITE_ITEM_TYPES,
  LIBRARY_PAGE_SIZE,
  LATEST_ITEM_TYPES,
  PLAYED_ITEM_TYPES,
  RESUME_ITEM_TYPES,
  SEARCH_PAGE_SIZE,
  SEARCH_ITEM_TYPES,
  compareEpisodes,
  compareSeasons,
  createSeasonsFromEpisodes,
  filterPlayableLibraries,
  getLibraryItemTypes,
  itemFields,
  normalizeLibraryItems,
  type LibraryQueryOptions,
} from './embyLibraryApi'
import {
  createLiveTvGuideWindow,
  liveTvFields,
  liveTvProgramFields,
  isProgramAiringNow,
  normalizeLiveTvChannels,
  normalizeLiveTvPrograms,
} from './embyLiveTvApi'
import { createEmbyPlaybackApi } from './embyPlaybackApi'
import { mergeUserData, updateItemsUserData } from './embyUserDataApi'

export { DEFAULT_PLAYBACK_USER_AGENT }
export { PLAYBACK_QUALITY_OPTIONS }

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

export interface EmbyPerson {
  Id?: string
  Name: string
  Type?: string
  Role?: string
  PrimaryImageTag?: string
  ImageTags?: Record<string, string>
}

export interface EmbyStudio {
  Id?: string
  Name: string
}

export interface EmbyChapter {
  Name?: string
  StartPositionTicks?: number
  ImageTag?: string
}

export interface EmbyItem {
  Id: string
  Name: string
  Type: string
  Overview?: string
  ProductionYear?: number
  PremiereDate?: string
  OfficialRating?: string
  RunTimeTicks?: number
  ParentId?: string
  SeriesId?: string
  SeriesName?: string
  SeriesPrimaryImageTag?: string
  SeasonId?: string
  SeasonName?: string
  Album?: string
  AlbumId?: string
  AlbumArtist?: string
  AlbumArtists?: readonly string[]
  Artists?: readonly string[]
  AlbumPrimaryImageTag?: string
  ChannelNumber?: string
  Number?: string
  CurrentProgram?: {
    Id?: string
    Name?: string
    Overview?: string
    StartDate?: string
    EndDate?: string
  }
  ChannelId?: string
  ChannelName?: string
  StartDate?: string
  EndDate?: string
  ParentIndexNumber?: number
  IndexNumber?: number
  ChildCount?: number
  RecursiveItemCount?: number
  UserData?: {
    IsFavorite?: boolean
    LastPlayedDate?: string
    PlaybackPositionTicks?: number
    PlayCount?: number
    Played?: boolean
    PlayedPercentage?: number
    UnplayedItemCount?: number
  }
  ImageTags?: Record<string, string>
  BackdropImageTags?: readonly string[]
  Genres?: readonly string[]
  Tags?: readonly string[]
  People?: readonly EmbyPerson[]
  Studios?: readonly EmbyStudio[]
  Chapters?: readonly EmbyChapter[]
  CommunityRating?: number
  MediaSources?: readonly {
    Id: string
    Name?: string
    Container?: string
    Path?: string
    Size?: number
    Bitrate?: number
    MediaStreams?: readonly EmbyMediaStream[]
  }[]
}

export interface EmbyMediaStream {
  Index: number
  Type: 'Audio' | 'Subtitle' | 'Video'
  Codec?: string
  Language?: string
  DisplayTitle?: string
  Width?: number
  Height?: number
  BitRate?: number
  Channels?: number
  ChannelLayout?: string
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
  itemType?: string
  mediaSourceId?: string
  playSessionId?: string
  audioStreamIndex?: number
  subtitleStreamIndex?: number
  forceTranscode?: boolean
  maxStreamingBitrate?: number | null
}

export type PlaybackQualityPreset = 'original' | '4k' | '1080p' | '720p' | '480p' | 'custom'

export interface PlaybackPreferences {
  preferredAudioLanguage: string
  preferredSubtitleLanguage: string
  defaultForceTranscode: boolean
  defaultQualityPreset: PlaybackQualityPreset
  customMaxStreamingBitrate: number
}

export interface MpvAuthContext {
  token: string
  authorization: string
  userAgent: string
}

export type LibrarySortKey = 'SortName' | 'DateCreated' | 'PremiereDate' | 'CommunityRating'
export type SortOrder = 'Ascending' | 'Descending'

export interface UserItemData {
  IsFavorite?: boolean
  LastPlayedDate?: string
  PlaybackPositionTicks?: number
  PlayCount?: number
  Played?: boolean
  PlayedPercentage?: number
  UnplayedItemCount?: number
}

interface EmbyItemsPage {
  Items: EmbyItem[]
  TotalRecordCount?: number
}

interface PlaybackHistoryPageOptions {
  startIndex?: number
  limit?: number
}

const HOME_SECTION_LIMIT = 16
const PLAYBACK_HISTORY_PAGE_SIZE = 48

interface AuthenticateResponse {
  User: {
    Id: string
    Name: string
  }
  AccessToken: string
}

const accounts = shallowRef<EmbySession[]>([])
const session = shallowRef<EmbySession | null>(null)
const libraries = shallowRef<EmbyLibrary[]>([])
const itemSourceItems = shallowRef<EmbyItem[]>([])
const items = shallowRef<EmbyItem[]>([])
const itemsLoadedCount = shallowRef(0)
const itemsCanLoadMore = shallowRef(false)
const resumeItems = shallowRef<EmbyItem[]>([])
const resumeHistoryItems = shallowRef<EmbyItem[]>([])
const resumeItemsTotalCount = shallowRef(0)
const resumeItemsCanLoadMore = shallowRef(false)
const nextUpItems = shallowRef<EmbyItem[]>([])
const playedItems = shallowRef<EmbyItem[]>([])
const playedHistoryItems = shallowRef<EmbyItem[]>([])
const playedItemsTotalCount = shallowRef(0)
const playedItemsCanLoadMore = shallowRef(false)
const latestItems = shallowRef<EmbyItem[]>([])
const favoriteItems = shallowRef<EmbyItem[]>([])
const liveTvChannels = shallowRef<EmbyItem[]>([])
const liveTvProgramsByChannel = shallowRef<Record<string, EmbyItem[]>>({})
const similarItems = shallowRef<EmbyItem[]>([])
const searchResultItems = shallowRef<EmbyItem[]>([])
const searchResultItemsLoadedCount = shallowRef(0)
const searchResults = shallowRef<EmbyItem[]>([])
const searchTotalCount = shallowRef(0)
const searchResultsLoadedCount = shallowRef(0)
const searchResultsCanLoadMore = shallowRef(false)
const activeSearchQuery = shallowRef('')
const itemsTotalCount = shallowRef(0)
const librarySortBy = shallowRef<LibrarySortKey>('SortName')
const librarySortOrder = shallowRef<SortOrder>('Ascending')
const seriesSeasons = shallowRef<EmbyItem[]>([])
const seriesEpisodes = shallowRef<EmbyItem[]>([])
const episodeGroupsBySeries = shallowRef<Record<string, EmbyItem[]>>({})
const selectedItem = shallowRef<EmbyItem | null>(null)
const playbackUserAgent = shallowRef(getInitialPlaybackUserAgent())
const playbackPreferences = shallowRef<PlaybackPreferences>(getInitialPlaybackPreferences())
const isBusy = shallowRef(false)
const errorMessage = shallowRef('')
let lastPersistedAccountsJson = ''
let pendingBusyRequests = 0
let libraryRequestId = 0
let libraryPageRequestId = 0
let detailItemsRequestId = 0
let similarItemsRequestId = 0
let searchRequestId = 0

export function useEmbyClient() {
  async function login(serverUrl: string, username: string, password: string, displayName?: string) {
    const normalizedUrl = normalizeServerUrl(serverUrl)
    beginBusy()

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
      await upsertAccount(nextSession)
      setActiveSession(nextSession)
      await loadHome()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '登录失败'
      throw error
    } finally {
      endBusy()
    }
  }

  async function restore() {
    await restoreAccountsFromSecureStorage()
    if (!session.value) {
      return
    }
    await loadHome()
  }

  function logout() {
    if (session.value) {
      removeAccount(session.value.id).catch((error) => {
        errorMessage.value = error instanceof Error ? error.message : '账号删除失败'
      })
      return
    }

    clearCurrentData()
  }

  async function switchAccount(accountId: string) {
    const target = accounts.value.find((account) => account.id === accountId)
    if (!target) {
      return
    }

    setActiveSession(target)
    await loadHome()
  }

  async function removeAccount(accountId: string) {
    accounts.value = accounts.value.filter((account) => account.id !== accountId)
    await persistAccounts()

    if (session.value?.id === accountId) {
      const nextSession = accounts.value[0] ?? null
      setActiveSession(nextSession)
      if (nextSession) {
        loadHome().catch(() => {
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
    persistAccounts().catch((error) => {
      errorMessage.value = error instanceof Error ? error.message : '账号保存失败'
    })

    const updatedCurrent = accounts.value.find((account) => account.id === session.value?.id)
    if (updatedCurrent) {
      setActiveSession(updatedCurrent)
    }
  }

  function clearCurrentData() {
    libraryRequestId += 1
    libraryPageRequestId += 1
    detailItemsRequestId += 1
    similarItemsRequestId += 1
    searchRequestId += 1
    libraries.value = []
    itemSourceItems.value = []
    items.value = []
    itemsLoadedCount.value = 0
    itemsCanLoadMore.value = false
    resumeItems.value = []
    resumeHistoryItems.value = []
    resumeItemsTotalCount.value = 0
    resumeItemsCanLoadMore.value = false
    nextUpItems.value = []
    playedItems.value = []
    playedHistoryItems.value = []
    playedItemsTotalCount.value = 0
    playedItemsCanLoadMore.value = false
    latestItems.value = []
    favoriteItems.value = []
    liveTvChannels.value = []
    liveTvProgramsByChannel.value = {}
    similarItems.value = []
    searchResultItems.value = []
    searchResultItemsLoadedCount.value = 0
    searchResults.value = []
    searchTotalCount.value = 0
    searchResultsLoadedCount.value = 0
    searchResultsCanLoadMore.value = false
    activeSearchQuery.value = ''
    itemsTotalCount.value = 0
    librarySortBy.value = 'SortName'
    librarySortOrder.value = 'Ascending'
    seriesSeasons.value = []
    seriesEpisodes.value = []
    episodeGroupsBySeries.value = {}
    selectedItem.value = null
  }

  function beginBusy() {
    pendingBusyRequests += 1
    isBusy.value = true
    errorMessage.value = ''
  }

  function endBusy() {
    pendingBusyRequests = Math.max(0, pendingBusyRequests - 1)
    isBusy.value = pendingBusyRequests > 0
  }

  function setActiveSession(nextSession: EmbySession | null) {
    session.value = nextSession
    clearCurrentData()

    if (nextSession) {
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, nextSession.id)
    } else {
      localStorage.removeItem(ACTIVE_ACCOUNT_KEY)
    }
    localStorage.removeItem(SESSION_KEY)
  }

  async function upsertAccount(nextSession: EmbySession | null) {
    if (!nextSession) {
      return
    }

    accounts.value = [
      nextSession,
      ...accounts.value.filter((account) => account.id !== nextSession.id),
    ]
    await persistAccounts()
  }

  async function persistAccounts() {
    const nextAccountsJson = serializeAccounts(accounts.value)
    if (nextAccountsJson === lastPersistedAccountsJson) {
      return
    }

    await writeLocalAccounts(accounts.value)
    lastPersistedAccountsJson = nextAccountsJson
  }

  async function signOutCurrentOnly() {
    session.value = null
    clearCurrentData()
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(ACTIVE_ACCOUNT_KEY)
  }

  async function clearAllLocalAccounts() {
    beginBusy()

    try {
      accounts.value = []
      session.value = null
      clearCurrentData()
      clearLegacyAccountStorage()
      localStorage.removeItem(ACTIVE_ACCOUNT_KEY)
      await deleteLocalAccounts()
      deleteSecureAccounts().catch(() => {
        // Legacy Keychain cleanup is best-effort; local encrypted storage is now authoritative.
      })
      lastPersistedAccountsJson = serializeAccounts([])
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '清除本地账号失败'
      throw error
    } finally {
      endBusy()
    }
  }

  function updatePlaybackUserAgent(nextUserAgent: string) {
    const normalized = nextUserAgent.trim() || DEFAULT_PLAYBACK_USER_AGENT
    playbackUserAgent.value = normalized
    localStorage.setItem(PLAYBACK_USER_AGENT_KEY, normalized)
  }

  function updatePlaybackPreferences(nextPreferences: PlaybackPreferences) {
    const normalized = normalizePlaybackPreferences(nextPreferences)
    playbackPreferences.value = normalized
    localStorage.setItem(PLAYBACK_PREFERENCES_KEY, JSON.stringify(normalized))
  }

  async function restoreAccountsFromSecureStorage() {
    const localAccounts = await readLocalAccounts()
    const legacyAccounts = loadLegacyAccounts()
    const shouldTryKeychainMigration = localAccounts.length === 0 && !hasCheckedKeychainMigration()
    const secureAccounts = shouldTryKeychainMigration ? await readAccountsFromLegacyKeychain() : []
    const mergedAccounts = mergeAccounts(mergeAccounts(localAccounts, secureAccounts), legacyAccounts)

    accounts.value = mergedAccounts
    session.value = getInitialSession(mergedAccounts)
    lastPersistedAccountsJson = serializeAccounts(mergedAccounts)

    if (legacyAccounts.length > 0 || secureAccounts.length > 0 || localAccounts.length !== mergedAccounts.length) {
      lastPersistedAccountsJson = serializeAccounts(localAccounts)
      await persistAccounts()
    }

    clearLegacyAccountStorage()
  }

  async function readAccountsFromLegacyKeychain() {
    try {
      const secureAccounts = await readSecureAccounts()
      markKeychainMigrationChecked()
      return secureAccounts
    } catch (error) {
      markKeychainMigrationChecked()
      errorMessage.value = error instanceof Error ? error.message : '旧 Keychain 账号迁移失败'
      return []
    }
  }

  async function loadLibraries(options: { manageBusy?: boolean } = {}) {
    const manageBusy = options.manageBusy ?? true
    const active = requireSession()
    if (manageBusy) {
      beginBusy()
    }

    try {
      const data = await request<{ Items: EmbyLibrary[] }>(
        `/Users/${active.userId}/Views`,
      )
      libraries.value = filterPlayableLibraries(data.Items)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '媒体库加载失败'
      throw error
    } finally {
      if (manageBusy) {
        endBusy()
      }
    }
  }

  async function loadHome() {
    beginBusy()

    try {
      await loadLibraries({ manageBusy: false })
      const [resumeData, nextUpData, playedData, latestData, favoriteData] = await Promise.all([
        loadResumeItems({ limit: HOME_SECTION_LIMIT }),
        loadNextUpItems().catch(() => []),
        loadPlayedItems({ limit: HOME_SECTION_LIMIT }),
        loadLatestItems(),
        loadFavoriteItems(),
        loadLiveTvChannels({ manageBusy: false }).catch(() => []),
      ])
      const normalizedResume = normalizeLibraryItems(resumeData.Items)
      const normalizedNextUp = normalizeLibraryItems(nextUpData)
      const normalizedPlayed = normalizeLibraryItems(playedData.Items)
      const normalizedLatest = normalizeLibraryItems(latestData)
      resumeHistoryItems.value = resumeData.Items
      resumeItems.value = normalizedResume.items
      resumeItemsTotalCount.value = resumeData.TotalRecordCount ?? resumeData.Items.length
      resumeItemsCanLoadMore.value = hasMorePage(0, resumeData.Items.length, resumeData.TotalRecordCount, HOME_SECTION_LIMIT)
      nextUpItems.value = nextUpData
      playedHistoryItems.value = playedData.Items
      playedItems.value = normalizedPlayed.items
      playedItemsTotalCount.value = playedData.TotalRecordCount ?? playedData.Items.length
      playedItemsCanLoadMore.value = hasMorePage(0, playedData.Items.length, playedData.TotalRecordCount, HOME_SECTION_LIMIT)
      latestItems.value = normalizedLatest.items
      favoriteItems.value = favoriteData
      episodeGroupsBySeries.value = {
        ...episodeGroupsBySeries.value,
        ...normalizedResume.episodeGroups,
        ...normalizedNextUp.episodeGroups,
        ...normalizedPlayed.episodeGroups,
        ...normalizedLatest.episodeGroups,
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '首页内容加载失败'
      throw error
    } finally {
      endBusy()
    }
  }

  async function loadResumeItems(options: PlaybackHistoryPageOptions = {}) {
    const active = requireSession()
    const params = new URLSearchParams({
      Recursive: 'true',
      IncludeItemTypes: RESUME_ITEM_TYPES,
      Filters: 'IsResumable',
      Fields: itemFields(),
      SortBy: 'DatePlayed',
      SortOrder: 'Descending',
      StartIndex: String(options.startIndex ?? 0),
      Limit: String(options.limit ?? PLAYBACK_HISTORY_PAGE_SIZE),
    })
    return request<EmbyItemsPage>(
      `/Users/${active.userId}/Items?${params.toString()}`,
    )
  }

  async function loadNextUpItems() {
    const active = requireSession()
    const params = new URLSearchParams({
      UserId: active.userId,
      Fields: itemFields(),
      Limit: '16',
      EnableUserData: 'true',
    })
    const data = await request<{ Items: EmbyItem[] }>(
      `/Shows/NextUp?${params.toString()}`,
    )
    return data.Items
  }

  async function loadPlayedItems(options: PlaybackHistoryPageOptions = {}) {
    const active = requireSession()
    const params = new URLSearchParams({
      Recursive: 'true',
      IncludeItemTypes: PLAYED_ITEM_TYPES,
      Filters: 'IsPlayed',
      Fields: itemFields(),
      SortBy: 'DatePlayed',
      SortOrder: 'Descending',
      StartIndex: String(options.startIndex ?? 0),
      Limit: String(options.limit ?? PLAYBACK_HISTORY_PAGE_SIZE),
    })
    return request<EmbyItemsPage>(
      `/Users/${active.userId}/Items?${params.toString()}`,
    )
  }

  async function loadMoreResumeItems() {
    if (!resumeItemsCanLoadMore.value) {
      return []
    }

    beginBusy()

    try {
      const startIndex = resumeHistoryItems.value.length
      const data = await loadResumeItems({
        startIndex,
        limit: PLAYBACK_HISTORY_PAGE_SIZE,
      })
      const nextItems = mergeUniqueItems(resumeHistoryItems.value, data.Items)
      const normalized = normalizeLibraryItems(nextItems)
      resumeHistoryItems.value = nextItems
      resumeItems.value = normalized.items
      resumeItemsTotalCount.value = data.TotalRecordCount ?? nextItems.length
      resumeItemsCanLoadMore.value = hasMorePage(startIndex, data.Items.length, data.TotalRecordCount, PLAYBACK_HISTORY_PAGE_SIZE)
      mergeEpisodeGroups(normalized)
      return data.Items
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '更多继续观看加载失败'
      throw error
    } finally {
      endBusy()
    }
  }

  async function loadMorePlayedItems() {
    if (!playedItemsCanLoadMore.value) {
      return []
    }

    beginBusy()

    try {
      const startIndex = playedHistoryItems.value.length
      const data = await loadPlayedItems({
        startIndex,
        limit: PLAYBACK_HISTORY_PAGE_SIZE,
      })
      const nextItems = mergeUniqueItems(playedHistoryItems.value, data.Items)
      const normalized = normalizeLibraryItems(nextItems)
      playedHistoryItems.value = nextItems
      playedItems.value = normalized.items
      playedItemsTotalCount.value = data.TotalRecordCount ?? nextItems.length
      playedItemsCanLoadMore.value = hasMorePage(startIndex, data.Items.length, data.TotalRecordCount, PLAYBACK_HISTORY_PAGE_SIZE)
      mergeEpisodeGroups(normalized)
      return data.Items
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '更多播放历史加载失败'
      throw error
    } finally {
      endBusy()
    }
  }

  function mergeUniqueItems(existingItems: readonly EmbyItem[], nextItems: readonly EmbyItem[]) {
    const seenIds = new Set(existingItems.map((item) => item.Id))
    const mergedItems = [...existingItems]
    for (const item of nextItems) {
      if (seenIds.has(item.Id)) {
        continue
      }

      seenIds.add(item.Id)
      mergedItems.push(item)
    }

    return mergedItems
  }

  function nextLoadedCount(startIndex: number, receivedCount: number, totalCount?: number) {
    if (receivedCount === 0 && typeof totalCount === 'number') {
      return totalCount
    }

    return startIndex + receivedCount
  }

  function hasMorePage(startIndex: number, receivedCount: number, totalCount: number | undefined, pageSize: number) {
    if (typeof totalCount === 'number') {
      return startIndex + receivedCount < totalCount
    }

    return receivedCount >= pageSize
  }

  function mergeEpisodeGroups(normalized: ReturnType<typeof normalizeLibraryItems>) {
    episodeGroupsBySeries.value = {
      ...episodeGroupsBySeries.value,
      ...normalized.episodeGroups,
    }
  }

  async function loadLatestItems() {
    const active = requireSession()
    const params = new URLSearchParams({
      Recursive: 'true',
      IncludeItemTypes: LATEST_ITEM_TYPES,
      Fields: itemFields(),
      SortBy: 'DateCreated',
      SortOrder: 'Descending',
      Limit: '16',
    })
    const data = await request<{ Items: EmbyItem[] }>(
      `/Users/${active.userId}/Items?${params.toString()}`,
    )
    return data.Items
  }

  async function loadFavoriteItems() {
    const active = requireSession()
    const params = new URLSearchParams({
      Recursive: 'true',
      IncludeItemTypes: FAVORITE_ITEM_TYPES,
      Filters: 'IsFavorite',
      Fields: itemFields(),
      SortBy: 'DateCreated',
      SortOrder: 'Descending',
      Limit: '16',
    })
    const data = await request<{ Items: EmbyItem[] }>(
      `/Users/${active.userId}/Items?${params.toString()}`,
    )
    return normalizeLibraryItems(data.Items).items
  }

  async function loadLiveTvChannels(options: { manageBusy?: boolean } = {}) {
    const active = requireSession()
    const manageBusy = options.manageBusy ?? true
    if (manageBusy) {
      beginBusy()
    }

    try {
      const params = new URLSearchParams({
        UserId: active.userId,
        Fields: liveTvFields(),
        EnableUserData: 'true',
      })
      const data = await request<{ Items: EmbyItem[] }>(`/LiveTv/Channels?${params.toString()}`)
      const channels = normalizeLiveTvChannels(data.Items)
      liveTvChannels.value = channels
      await loadLiveTvPrograms({ manageBusy: false, channels })
      return channels
    } catch (error) {
      if (manageBusy) {
        errorMessage.value = error instanceof Error ? error.message : '直播频道加载失败'
        throw error
      }

      return []
    } finally {
      if (manageBusy) {
        endBusy()
      }
    }
  }

  async function loadLiveTvPrograms(options: { manageBusy?: boolean; channels?: readonly EmbyItem[] } = {}) {
    const manageBusy = options.manageBusy ?? true
    const channels = options.channels ?? liveTvChannels.value
    if (!channels.length) {
      liveTvProgramsByChannel.value = {}
      return {}
    }

    if (manageBusy) {
      beginBusy()
    }

    try {
      const guideWindow = createLiveTvGuideWindow()
      const params = new URLSearchParams({
        ChannelIds: channels.map((channel) => channel.Id).join(','),
        Fields: liveTvProgramFields(),
        MinStartDate: guideWindow.minStartDate,
        MaxStartDate: guideWindow.maxStartDate,
        EnableImages: 'true',
      })
      const data = await request<{ Items: EmbyItem[] }>(`/LiveTv/Programs?${params.toString()}`)
      const programsByChannel = normalizeLiveTvPrograms(data.Items)
      liveTvProgramsByChannel.value = programsByChannel
      liveTvChannels.value = liveTvChannels.value.map((channel) => ({
        ...channel,
        CurrentProgram: getCurrentProgram(programsByChannel[channel.Id]) ?? channel.CurrentProgram,
      }))
      return programsByChannel
    } catch (error) {
      if (manageBusy) {
        errorMessage.value = error instanceof Error ? error.message : '直播节目单加载失败'
        throw error
      }

      return {}
    } finally {
      if (manageBusy) {
        endBusy()
      }
    }
  }

  async function searchItems(query: string) {
    const requestId = ++searchRequestId
    const trimmedQuery = query.trim()
    searchResultItems.value = []
    searchResultItemsLoadedCount.value = 0
    searchResults.value = []
    searchTotalCount.value = 0
    searchResultsLoadedCount.value = 0
    searchResultsCanLoadMore.value = false
    activeSearchQuery.value = trimmedQuery
    if (trimmedQuery.length < 2) {
      activeSearchQuery.value = ''
      return
    }

    const active = requireSession()
    beginBusy()

    try {
      const params = new URLSearchParams({
        Recursive: 'true',
        IncludeItemTypes: SEARCH_ITEM_TYPES,
        SearchTerm: trimmedQuery,
        Fields: itemFields(),
        StartIndex: '0',
        Limit: String(SEARCH_PAGE_SIZE),
      })
      const data = await request<{ Items: EmbyItem[], TotalRecordCount?: number }>(
        `/Users/${active.userId}/Items?${params.toString()}`,
      )
      if (requestId !== searchRequestId) {
        return
      }

      const normalized = normalizeLibraryItems(data.Items).items
      const liveTvMatches = searchLiveTvChannels(trimmedQuery)
      const sourceTotalCount = data.TotalRecordCount ?? data.Items.length
      searchResultItems.value = data.Items
      searchResultItemsLoadedCount.value = data.Items.length
      searchResults.value = [...normalized, ...liveTvMatches]
      searchTotalCount.value = sourceTotalCount + liveTvMatches.length
      searchResultsLoadedCount.value = searchResultItemsLoadedCount.value + liveTvMatches.length
      searchResultsCanLoadMore.value = hasMorePage(0, data.Items.length, data.TotalRecordCount, SEARCH_PAGE_SIZE)
    } catch (error) {
      if (requestId !== searchRequestId) {
        return
      }
      errorMessage.value = error instanceof Error ? error.message : '搜索失败'
      throw error
    } finally {
      endBusy()
    }
  }

  async function loadMoreSearchResults() {
    const query = activeSearchQuery.value.trim()
    if (query.length < 2 || !searchResultsCanLoadMore.value) {
      return
    }

    const requestId = searchRequestId
    const active = requireSession()
    beginBusy()

    try {
      const startIndex = searchResultItemsLoadedCount.value
      const params = new URLSearchParams({
        Recursive: 'true',
        IncludeItemTypes: SEARCH_ITEM_TYPES,
        SearchTerm: query,
        Fields: itemFields(),
        StartIndex: String(startIndex),
        Limit: String(SEARCH_PAGE_SIZE),
      })
      const data = await request<{ Items: EmbyItem[], TotalRecordCount?: number }>(
        `/Users/${active.userId}/Items?${params.toString()}`,
      )
      if (requestId !== searchRequestId) {
        return
      }

      const nextRawItems = mergeUniqueItems(searchResultItems.value, data.Items)
      const normalized = normalizeLibraryItems(nextRawItems).items
      const liveTvMatches = searchLiveTvChannels(query)
      const nextLoaded = nextLoadedCount(startIndex, data.Items.length, data.TotalRecordCount)
      const sourceTotalCount = data.TotalRecordCount ?? nextLoaded
      searchResultItems.value = nextRawItems
      searchResultItemsLoadedCount.value = nextLoaded
      searchResults.value = [...normalized, ...liveTvMatches]
      searchTotalCount.value = sourceTotalCount + liveTvMatches.length
      searchResultsLoadedCount.value = nextLoaded + liveTvMatches.length
      searchResultsCanLoadMore.value = hasMorePage(startIndex, data.Items.length, data.TotalRecordCount, SEARCH_PAGE_SIZE)
    } catch (error) {
      if (requestId !== searchRequestId) {
        return
      }
      errorMessage.value = error instanceof Error ? error.message : '更多搜索结果加载失败'
      throw error
    } finally {
      endBusy()
    }
  }

  function searchLiveTvChannels(query: string) {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
      return []
    }

    return liveTvChannels.value.filter((channel) => {
      const haystack = [
        channel.Name,
        channel.ChannelNumber,
        channel.Number,
        channel.CurrentProgram?.Name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }

  async function loadItems(library: string | EmbyLibrary, options: LibraryQueryOptions = {}) {
    const active = requireSession()
    const parentId = typeof library === 'string' ? library : library.Id
    const collectionType = typeof library === 'string' ? undefined : library.CollectionType
    const sortBy = options.sortBy ?? librarySortBy.value
    const sortOrder = options.sortOrder ?? librarySortOrder.value
    const requestId = ++libraryRequestId
    libraryPageRequestId += 1
    beginBusy()

    try {
      librarySortBy.value = sortBy
      librarySortOrder.value = sortOrder
      const params = new URLSearchParams({
        ParentId: parentId,
        Recursive: 'true',
        IncludeItemTypes: getLibraryItemTypes(collectionType),
        Fields: itemFields(),
        SortBy: sortBy,
        SortOrder: sortOrder,
        StartIndex: '0',
        Limit: String(LIBRARY_PAGE_SIZE),
      })
      const data = await request<{ Items: EmbyItem[], TotalRecordCount?: number }>(
        `/Users/${active.userId}/Items?${params.toString()}`,
      )
      if (requestId !== libraryRequestId) {
        return
      }

      const normalized = normalizeLibraryItems(data.Items)
      const loadedCount = data.Items.length
      itemSourceItems.value = data.Items
      itemsLoadedCount.value = loadedCount
      items.value = normalized.items
      itemsTotalCount.value = data.TotalRecordCount ?? loadedCount
      itemsCanLoadMore.value = hasMorePage(0, data.Items.length, data.TotalRecordCount, LIBRARY_PAGE_SIZE)
      episodeGroupsBySeries.value = normalized.episodeGroups
      if (!options.preserveSelection) {
        seriesSeasons.value = []
        seriesEpisodes.value = []
        selectedItem.value = normalized.items[0] ?? null
      }
    } catch (error) {
      if (requestId !== libraryRequestId) {
        return
      }

      errorMessage.value = error instanceof Error ? error.message : '条目加载失败'
      throw error
    } finally {
      endBusy()
    }
  }

  async function loadMoreItems(library: string | EmbyLibrary) {
    if (!itemsCanLoadMore.value) {
      return
    }

    const active = requireSession()
    const parentId = typeof library === 'string' ? library : library.Id
    const collectionType = typeof library === 'string' ? undefined : library.CollectionType
    const requestId = ++libraryPageRequestId
    const parentRequestId = libraryRequestId
    beginBusy()

    try {
      const startIndex = itemsLoadedCount.value
      const params = new URLSearchParams({
        ParentId: parentId,
        Recursive: 'true',
        IncludeItemTypes: getLibraryItemTypes(collectionType),
        Fields: itemFields(),
        SortBy: librarySortBy.value,
        SortOrder: librarySortOrder.value,
        StartIndex: String(startIndex),
        Limit: String(LIBRARY_PAGE_SIZE),
      })
      const data = await request<{ Items: EmbyItem[], TotalRecordCount?: number }>(
        `/Users/${active.userId}/Items?${params.toString()}`,
      )
      if (requestId !== libraryPageRequestId || parentRequestId !== libraryRequestId) {
        return
      }

      const nextRawItems = mergeUniqueItems(itemSourceItems.value, data.Items)
      const normalized = normalizeLibraryItems(nextRawItems)
      const nextLoaded = nextLoadedCount(startIndex, data.Items.length, data.TotalRecordCount)
      itemSourceItems.value = nextRawItems
      itemsLoadedCount.value = nextLoaded
      items.value = normalized.items
      itemsTotalCount.value = data.TotalRecordCount ?? nextLoaded
      itemsCanLoadMore.value = hasMorePage(startIndex, data.Items.length, data.TotalRecordCount, LIBRARY_PAGE_SIZE)
      episodeGroupsBySeries.value = normalized.episodeGroups
    } catch (error) {
      if (requestId !== libraryPageRequestId || parentRequestId !== libraryRequestId) {
        return
      }

      errorMessage.value = error instanceof Error ? error.message : '更多条目加载失败'
      throw error
    } finally {
      endBusy()
    }
  }

  async function loadSeriesEpisodes(seriesId: string, parentType?: string) {
    const active = requireSession()
    const cachedEpisodes = episodeGroupsBySeries.value[seriesId]
    const requestId = ++detailItemsRequestId
    beginBusy()
    const isAudioCollection = parentType === 'MusicArtist' || parentType === 'MusicAlbum' || parentType === 'Audio'
    const isItemCollection = parentType === 'BoxSet' || parentType === 'Playlist'

    try {
      if (cachedEpisodes?.length) {
        seriesSeasons.value = isAudioCollection || isItemCollection ? [] : createSeasonsFromEpisodes(cachedEpisodes)
        seriesEpisodes.value = cachedEpisodes
      }

      if (seriesId.startsWith('series-name:') || seriesId.startsWith('album-name:')) {
        if (isAudioCollection && !cachedEpisodes?.length) {
          seriesEpisodes.value = []
          seriesSeasons.value = []
        }
        return
      }

      if (isAudioCollection) {
        const params = new URLSearchParams({
          ParentId: seriesId,
          Recursive: 'true',
          IncludeItemTypes: 'Audio',
          Fields: itemFields(),
          SortBy: 'SortName',
          SortOrder: 'Ascending',
        })
        const data = await request<{ Items: EmbyItem[] }>(`/Users/${active.userId}/Items?${params.toString()}`)
        if (requestId !== detailItemsRequestId) {
          return
        }

        seriesEpisodes.value = [...data.Items].sort(compareEpisodes)
        seriesSeasons.value = []
        return
      }

      if (isItemCollection) {
        const params = new URLSearchParams({
          ParentId: seriesId,
          Recursive: 'false',
          IncludeItemTypes: 'Movie,Episode,Audio,MusicVideo',
          Fields: itemFields(),
          SortBy: parentType === 'Playlist' ? 'SortName' : 'PremiereDate,SortName',
          SortOrder: 'Ascending',
        })
        const data = await request<{ Items: EmbyItem[] }>(`/Users/${active.userId}/Items?${params.toString()}`)
        if (requestId !== detailItemsRequestId) {
          return
        }

        seriesEpisodes.value = [...data.Items].sort(compareEpisodes)
        seriesSeasons.value = []
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
      if (requestId !== detailItemsRequestId) {
        return
      }

      seriesEpisodes.value = [...episodesData.Items].sort(compareEpisodes)
      seriesSeasons.value =
        seasonsData.Items.length > 0
          ? [...seasonsData.Items].sort(compareSeasons)
          : createSeasonsFromEpisodes(seriesEpisodes.value)
    } catch (error) {
      if (requestId !== detailItemsRequestId) {
        return
      }

      if (cachedEpisodes?.length) {
        return
      }

      errorMessage.value = error instanceof Error ? error.message : '分集加载失败'
      throw error
    } finally {
      endBusy()
    }
  }

  async function loadSimilarItems(itemId: string, itemType?: string, options: { manageBusy?: boolean } = {}) {
    const requestId = ++similarItemsRequestId
    similarItems.value = []
    if (!supportsSimilarItems(itemType)) {
      return []
    }

    const active = requireSession()
    const manageBusy = options.manageBusy ?? true
    if (manageBusy) {
      beginBusy()
    }

    try {
      const params = new URLSearchParams({
        UserId: active.userId,
        Fields: itemFields(),
        Limit: '12',
        EnableUserData: 'true',
      })
      const data = await request<{ Items: EmbyItem[] }>(
        `/Items/${encodeURIComponent(itemId)}/Similar?${params.toString()}`,
      )
      if (requestId !== similarItemsRequestId) {
        return []
      }

      const normalized = normalizeLibraryItems(data.Items.filter((item) => item.Id !== itemId))
      similarItems.value = normalized.items
      episodeGroupsBySeries.value = {
        ...episodeGroupsBySeries.value,
        ...normalized.episodeGroups,
      }
      return similarItems.value
    } catch (error) {
      if (requestId !== similarItemsRequestId) {
        return []
      }

      if (manageBusy) {
        errorMessage.value = error instanceof Error ? error.message : '相似推荐加载失败'
        throw error
      }

      return []
    } finally {
      if (manageBusy) {
        endBusy()
      }
    }
  }

  function clearSeriesEpisodes() {
    detailItemsRequestId += 1
    similarItemsRequestId += 1
    seriesSeasons.value = []
    seriesEpisodes.value = []
    similarItems.value = []
  }

  function selectItem(item: EmbyItem) {
    selectedItem.value = item
  }

  async function setFavorite(itemId: string, isFavorite: boolean) {
    const active = requireSession()
    beginBusy()

    try {
      const userData = await request<UserItemData>(`/Users/${active.userId}/FavoriteItems/${itemId}`, {
        method: isFavorite ? 'POST' : 'DELETE',
      })
      applyUserData(itemId, userData)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '收藏状态更新失败'
      throw error
    } finally {
      endBusy()
    }
  }

  async function setPlayed(itemId: string, isPlayed: boolean) {
    await updatePlayedStatus(itemId, isPlayed, '观看状态更新失败')
  }

  async function clearPlaybackProgress(itemId: string) {
    await updatePlayedStatus(itemId, false, '播放进度清除失败')
  }

  async function updatePlayedStatus(itemId: string, isPlayed: boolean, failureMessage: string) {
    const active = requireSession()
    beginBusy()

    try {
      const userData = await request<UserItemData | undefined>(`/Users/${active.userId}/PlayedItems/${itemId}`, {
        method: isPlayed ? 'POST' : 'DELETE',
      })
      applyUserData(itemId, normalizePlayedUserData(userData, isPlayed))
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : failureMessage
      throw error
    } finally {
      endBusy()
    }
  }

  function normalizePlayedUserData(userData: UserItemData | undefined, isPlayed: boolean): UserItemData {
    if (isPlayed) {
      return {
        ...(userData ?? {}),
        Played: true,
      }
    }

    return {
      ...(userData ?? {}),
      LastPlayedDate: undefined,
      PlaybackPositionTicks: 0,
      PlayCount: 0,
      Played: false,
      PlayedPercentage: 0,
    }
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

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const active = requireSession()
    let response: Response
    try {
      response = await fetch(`${active.serverUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Emby-Token': active.accessToken,
        'X-Emby-Authorization': buildAuthorizationHeader(active.accessToken),
        ...init.headers,
      },
      })
    } catch (error) {
      throw new Error(normalizeNetworkError(error))
    }

    if (!response.ok) {
      throw new Error(normalizeEmbyHttpError(response.status))
    }

    if (response.status === 204) {
      return undefined as T
    }

    const text = await response.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  function applyUserData(itemId: string, userData: UserItemData) {
    items.value = updateItemsUserData(items.value, itemId, userData)
    itemSourceItems.value = updateItemsUserData(itemSourceItems.value, itemId, userData)
    resumeItems.value = updateItemsUserData(resumeItems.value, itemId, userData)
    resumeHistoryItems.value = updateItemsUserData(resumeHistoryItems.value, itemId, userData)
    nextUpItems.value = updateItemsUserData(nextUpItems.value, itemId, userData)
    playedItems.value = updateItemsUserData(playedItems.value, itemId, userData)
    playedHistoryItems.value = updateItemsUserData(playedHistoryItems.value, itemId, userData)
    latestItems.value = updateItemsUserData(latestItems.value, itemId, userData)
    favoriteItems.value = updateItemsUserData(favoriteItems.value, itemId, userData)
    liveTvChannels.value = updateItemsUserData(liveTvChannels.value, itemId, userData)
    similarItems.value = updateItemsUserData(similarItems.value, itemId, userData)
    searchResultItems.value = updateItemsUserData(searchResultItems.value, itemId, userData)
    searchResults.value = updateItemsUserData(searchResults.value, itemId, userData)
    seriesSeasons.value = updateItemsUserData(seriesSeasons.value, itemId, userData)
    seriesEpisodes.value = updateItemsUserData(seriesEpisodes.value, itemId, userData)
    episodeGroupsBySeries.value = Object.fromEntries(
      Object.entries(episodeGroupsBySeries.value).map(([seriesId, episodes]) => [
        seriesId,
        updateItemsUserData(episodes, itemId, userData),
      ]),
    )

    if (selectedItem.value?.Id === itemId) {
      selectedItem.value = mergeUserData(selectedItem.value, userData)
    }
  }

  function getCurrentProgram(programs: readonly EmbyItem[] | undefined) {
    const now = Date.now()
    return programs?.find((program) => isProgramAiringNow(program, now)) ?? null
  }

  const playbackApi = createEmbyPlaybackApi({
    playbackUserAgent,
    request,
    requireSession,
  })

  return {
    session: readonly(session),
    accounts: readonly(accounts),
    libraries: readonly(libraries),
    items: readonly(items),
    itemsTotalCount: readonly(itemsTotalCount),
    itemsLoadedCount: readonly(itemsLoadedCount),
    itemsCanLoadMore: readonly(itemsCanLoadMore),
    resumeItems: readonly(resumeItems),
    resumeHistoryItems: readonly(resumeHistoryItems),
    resumeItemsTotalCount: readonly(resumeItemsTotalCount),
    resumeItemsCanLoadMore: readonly(resumeItemsCanLoadMore),
    nextUpItems: readonly(nextUpItems),
    playedItems: readonly(playedItems),
    playedHistoryItems: readonly(playedHistoryItems),
    playedItemsTotalCount: readonly(playedItemsTotalCount),
    playedItemsCanLoadMore: readonly(playedItemsCanLoadMore),
    latestItems: readonly(latestItems),
    favoriteItems: readonly(favoriteItems),
    liveTvChannels: readonly(liveTvChannels),
    liveTvProgramsByChannel: readonly(liveTvProgramsByChannel),
    similarItems: readonly(similarItems),
    searchResults: readonly(searchResults),
    searchTotalCount: readonly(searchTotalCount),
    searchResultsLoadedCount: readonly(searchResultsLoadedCount),
    searchResultsCanLoadMore: readonly(searchResultsCanLoadMore),
    seriesSeasons: readonly(seriesSeasons),
    seriesEpisodes: readonly(seriesEpisodes),
    selectedItem: readonly(selectedItem),
    playbackUserAgent: readonly(playbackUserAgent),
    playbackPreferences: readonly(playbackPreferences),
    isBusy: readonly(isBusy),
    librarySortBy: readonly(librarySortBy),
    librarySortOrder: readonly(librarySortOrder),
    errorMessage: readonly(errorMessage),
    getImageUrl,
    getBackdropUrl,
    getMpvAuthContext: playbackApi.getMpvAuthContext,
    getPlaybackInfo: playbackApi.getPlaybackInfo,
    getPlaybackUrl: playbackApi.getPlaybackUrl,
    getSubtitleUrl: playbackApi.getSubtitleUrl,
    clearAllLocalAccounts,
    clearPlaybackProgress,
    clearSeriesEpisodes,
    loadHome,
    loadItems,
    loadMoreItems,
    loadMorePlayedItems,
    loadMoreResumeItems,
    loadMoreSearchResults,
    loadLiveTvChannels,
    loadLiveTvPrograms,
    loadSeriesEpisodes,
    loadSimilarItems,
    login,
    logout,
    removeAccount,
    reportPlaybackProgress: playbackApi.reportPlaybackProgress,
    reportPlaybackStart: playbackApi.reportPlaybackStart,
    reportPlaybackStopped: playbackApi.reportPlaybackStopped,
    restore,
    searchItems,
    selectItem,
    setFavorite,
    setPlayed,
    signOutCurrentOnly,
    switchAccount,
    updateAccount,
    updatePlaybackPreferences,
    updatePlaybackUserAgent,
  }
}

function requireSession() {
  if (!session.value) {
    throw new Error('尚未连接 Emby 服务器')
  }

  return session.value
}

function serializeAccounts(nextAccounts: readonly EmbySession[]) {
  return JSON.stringify(nextAccounts)
}

function supportsSimilarItems(itemType: string | undefined) {
  return Boolean(itemType && [
    'Movie',
    'Series',
    'Episode',
    'MusicAlbum',
    'MusicArtist',
    'Audio',
  ].includes(itemType))
}
