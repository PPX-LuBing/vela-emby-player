<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, shallowRef } from 'vue'
import { ArrowLeft, Clipboard, Library, ListMusic, Settings, Trash2 } from 'lucide-vue-next'
import {
  DEFAULT_PLAYBACK_USER_AGENT,
  useEmbyClient,
  type EmbyItem,
  type EmbyLibrary,
  type LibrarySortKey,
  type SortOrder,
} from './composables/useEmbyClient'
import { isItemCollection, isLiveTvItem } from './composables/mediaItemDisplay'
import { usePlaybackQueue } from './composables/usePlaybackQueue'

type AppView = 'library' | 'detail' | 'player' | 'settings'

const ConnectionPanel = defineAsyncComponent(() => import('./components/ConnectionPanel.vue').then((module) => module.default))
const LibraryBrowser = defineAsyncComponent(() => import('./components/LibraryBrowser.vue').then((module) => module.default))
const MediaDetailView = defineAsyncComponent(() => import('./components/MediaDetailView.vue').then((module) => module.default))
const PlayerPanel = defineAsyncComponent(() => import('./components/PlayerPanel.vue').then((module) => module.default))
const SettingsView = defineAsyncComponent(() => import('./components/SettingsView.vue').then((module) => module.default))

const {
  session,
  accounts,
  libraries,
  items,
  itemsTotalCount,
  itemsLoadedCount,
  itemsCanLoadMore,
  resumeItems,
  resumeHistoryItems,
  resumeItemsTotalCount,
  resumeItemsCanLoadMore,
  nextUpItems,
  playedItems,
  playedHistoryItems,
  playedItemsTotalCount,
  playedItemsCanLoadMore,
  latestItems,
  favoriteItems,
  liveTvChannels,
  liveTvProgramsByChannel,
  similarItems,
  searchResults,
  searchTotalCount,
  searchResultsLoadedCount,
  searchResultsCanLoadMore,
  seriesSeasons,
  seriesEpisodes,
  selectedItem,
  playbackPreferences,
  playbackUserAgent,
  isBusy,
  librarySortBy,
  librarySortOrder,
  errorMessage,
  clearAllLocalAccounts,
  clearPlaybackProgress,
  getBackdropUrl,
  getImageUrl,
  getMpvAuthContext,
  getPlaybackInfo,
  getPlaybackUrl,
  getSubtitleUrl,
  clearSeriesEpisodes,
  loadHome,
  loadItems,
  loadLiveTvChannels,
  loadLiveTvPrograms,
  loadMoreItems,
  loadMorePlayedItems,
  loadMoreResumeItems,
  loadMoreSearchResults,
  loadSeriesEpisodes,
  loadSimilarItems,
  login,
  logout,
  removeAccount,
  reportPlaybackStart,
  reportPlaybackProgress,
  reportPlaybackStopped,
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
} = useEmbyClient()

const playbackQueue = usePlaybackQueue()

const activeView = shallowRef<AppView>('library')
const previousView = shallowRef<AppView>('library')
const playingItem = shallowRef<EmbyItem | null>(null)
const activeLibrary = shallowRef<EmbyLibrary | null>(null)
const authErrorCopyLabel = shallowRef('复制错误')
const librarySearchQuery = shallowRef('')
const navigationView = computed(() => (activeView.value === 'settings' ? 'settings' : 'library'))
const pageTitle = computed(() => {
  if (activeView.value === 'detail') {
    return selectedItem.value?.Name ?? '详情'
  }

  if (activeView.value === 'settings') {
    return '设置'
  }

  return '媒体库'
})

async function submitLogin(serverUrl: string, username: string, password: string, displayName?: string) {
  await login(serverUrl, username, password, displayName)
  restorePlaybackQueue()
  activeView.value = 'library'
}

async function selectAccount(accountId: string) {
  await switchAccount(accountId)
  restorePlaybackQueue()
  activeView.value = 'library'
}

async function deleteAccount(accountId: string) {
  playbackQueue.clearPersistedQueue(accountId)
  await removeAccount(accountId)
  restorePlaybackQueue()
  activeView.value = session.value ? 'library' : 'settings'
}

function disconnectCurrent() {
  signOutCurrentOnly().catch(() => {
    // The settings view displays shared persistence errors.
  })
  clearPlaybackState({ persist: false })
  activeView.value = 'settings'
}

async function clearLocalAccounts() {
  await clearAllLocalAccounts()
  playbackQueue.clearAllPersistedQueues()
  playingItem.value = null
  activeView.value = 'settings'
}

function clearPlaybackState(options: { persist?: boolean } = {}) {
  playingItem.value = null
  playbackQueue.clearQueue(options)
  playbackQueue.detachQueuePersistence()
}

function restorePlaybackQueue() {
  playingItem.value = null
  if (session.value?.id) {
    playbackQueue.restoreQueue(session.value.id)
    return
  }

  clearPlaybackState({ persist: false })
}

async function copySharedError() {
  if (!errorMessage.value) {
    return
  }

  await navigator.clipboard.writeText(errorMessage.value)
  authErrorCopyLabel.value = '已复制'
  window.setTimeout(() => {
    authErrorCopyLabel.value = '复制错误'
  }, 1800)
}

async function editAccount(accountId: string, updates: { displayName: string; serverUrl: string }) {
  const wasCurrent = session.value?.id === accountId
  updateAccount(accountId, updates)
  if (wasCurrent) {
    await switchAccount(accountId)
  }
}

function openSettings() {
  previousView.value = activeView.value === 'settings' ? 'library' : activeView.value
  activeView.value = 'settings'
}

function closeSettings() {
  activeView.value = previousView.value
}

function openItemDetail(item: EmbyItem) {
  playingItem.value = null
  selectItem(item)
  activeView.value = 'detail'
  const detailChildrenParentId = getDetailChildrenParentId(item)
  clearSeriesEpisodes()
  if (detailChildrenParentId) {
    loadSeriesEpisodes(detailChildrenParentId, item.Type).catch(() => {
      // The detail view displays the shared error state.
    })
  }
  loadSimilarItems(item.Id, item.Type, { manageBusy: false }).catch(() => {
    // Recommendations are optional and should not block the detail page.
  })
}

async function openPlayer(item?: EmbyItem) {
  const playableItem = item ?? selectedItem.value
  if (playableItem) {
    const queueItems = getQueueItemsFor(playableItem)
    playbackQueue.setQueue(queueItems.length ? queueItems : [playableItem], playableItem)
    startPlayerWithItem(playableItem)
  }
}

function openPlaybackQueue() {
  const queueItem = playbackQueue.queueItems.value.find((item) => item.Id === playbackQueue.activeQueueItemId.value)
    ?? playbackQueue.queueItems.value[0]
  if (!queueItem) {
    return
  }

  playbackQueue.activateQueueItem(queueItem)
  startPlayerWithItem(queueItem)
}

function startPlayerWithItem(playableItem: EmbyItem) {
  playingItem.value = playableItem
  activeView.value = 'player'
  if (playableItem.Type === 'Episode' && playableItem.SeriesId) {
    loadSeriesEpisodes(playableItem.SeriesId, playableItem.Type).catch(() => {
      // The player remains usable even if episode navigation cannot be loaded.
    })
  } else if (playableItem.Type === 'Audio') {
    const audioParentId = getDetailChildrenParentId(playableItem)
    if (audioParentId) {
      loadSeriesEpisodes(audioParentId, playableItem.Type).catch(() => {
        // The player remains usable even if track navigation cannot be loaded.
      })
    }
  } else if (hasDetailChildren(playableItem)) {
    loadSeriesEpisodes(playableItem.Id, playableItem.Type).catch(() => {
      // The player remains usable even if collection navigation cannot be loaded.
    })
  }
}

function addDetailItemToQueue(item?: EmbyItem) {
  const queueSource = item ?? selectedItem.value
  if (!queueSource) {
    return
  }

  const queueItems = getQueueItemsFor(queueSource)
  playbackQueue.addToQueue(queueItems.length ? queueItems : [queueSource])
}

function playQueuedItem(item: EmbyItem) {
  playbackQueue.activateQueueItem(item)
  playingItem.value = item
}

async function refreshAfterPlayback() {
  const detailItem = selectedItem.value
  const detailChildrenParentId = detailItem ? getDetailChildrenParentId(detailItem) : ''
  await loadHome()
  await Promise.all([
    activeLibrary.value ? loadItems(activeLibrary.value, { preserveSelection: true }) : Promise.resolve(),
    detailItem && detailChildrenParentId
      ? loadSeriesEpisodes(detailChildrenParentId, detailItem.Type)
      : Promise.resolve(),
  ])
}

function leavePlayer() {
  playingItem.value = null
  activeView.value = selectedItem.value ? 'detail' : 'library'
  refreshAfterPlayback().catch(() => {
    // The shared error state is displayed by the current view.
  })
}

function getQueueItemsFor(item: EmbyItem) {
  if (hasDetailChildren(item)) {
    return getRelatedDetailItems(item)
  }

  if (item.Type === 'Episode') {
    const relatedEpisodes = getRelatedDetailItems(item)
    return relatedEpisodes.length ? relatedEpisodes : [item]
  }

  if (item.Type === 'Audio') {
    const relatedTracks = getRelatedDetailItems(item)
    return relatedTracks.length ? relatedTracks : [item]
  }

  return [item]
}

function getRelatedDetailItems(item: EmbyItem) {
  if (item.Type === 'Series') {
    return seriesEpisodes.value.filter((candidate) => candidate.Type === 'Episode' && candidate.SeriesId === item.Id)
  }

  if (item.Type === 'Episode') {
    const seriesKey = item.SeriesId || item.SeriesName?.trim().toLowerCase() || ''
    return seriesEpisodes.value.filter((candidate) => {
      if (candidate.Type !== 'Episode') {
        return false
      }

      const candidateKey = candidate.SeriesId || candidate.SeriesName?.trim().toLowerCase() || ''
      return Boolean(seriesKey && candidateKey === seriesKey)
    })
  }

  if (item.Type === 'MusicArtist') {
    return seriesEpisodes.value.filter((candidate) => candidate.Type === 'Audio')
  }

  if (item.Type === 'MusicAlbum') {
    return seriesEpisodes.value.filter((candidate) => candidate.Type === 'Audio' && (candidate.AlbumId === item.Id || candidate.ParentId === item.Id))
  }

  if (isItemCollection(item)) {
    return [...seriesEpisodes.value]
  }

  if (item.Type === 'Audio') {
    const albumKey = item.AlbumId || item.ParentId || item.Album?.trim().toLowerCase() || ''
    return seriesEpisodes.value.filter((candidate) => {
      if (candidate.Type !== 'Audio') {
        return false
      }

      const candidateKey = candidate.AlbumId || candidate.ParentId || candidate.Album?.trim().toLowerCase() || ''
      return Boolean(albumKey && candidateKey === albumKey)
    })
  }

  return []
}

function backFromDetail() {
  playingItem.value = null
  activeView.value = 'library'
}

async function loadLibraryItems(library: EmbyLibrary) {
  playingItem.value = null
  activeLibrary.value = library
  await loadItems(library)
  activeView.value = 'library'
}

async function refreshLiveTvChannels() {
  playingItem.value = null
  activeLibrary.value = null
  await loadLiveTvChannels()
  activeView.value = 'library'
}

function searchPerson(name: string) {
  const query = name.trim()
  if (!query) {
    return
  }

  playingItem.value = null
  activeView.value = 'library'
  librarySearchQuery.value = query
}

async function loadMoreLibraryItems() {
  if (!activeLibrary.value) {
    return
  }

  await loadMoreItems(activeLibrary.value)
}

async function changeLibrarySort(payload: { sortBy: LibrarySortKey; sortOrder: SortOrder }) {
  if (!activeLibrary.value) {
    return
  }

  await loadItems(activeLibrary.value, payload)
}

async function refreshAfterUserDataChange(item: EmbyItem) {
  const detailChildrenParentId = getDetailChildrenParentId(item)
  await Promise.all([
    loadHome(),
    activeLibrary.value ? loadItems(activeLibrary.value, { preserveSelection: true }) : Promise.resolve(),
    detailChildrenParentId ? loadSeriesEpisodes(detailChildrenParentId, item.Type) : Promise.resolve(),
  ])
}

function getDetailChildrenParentId(item: EmbyItem) {
  if (hasDetailChildren(item)) {
    return item.Id
  }

  if (item.Type === 'Episode') {
    return item.SeriesId || ''
  }

  if (item.Type === 'Audio') {
    return item.ParentId || item.AlbumId || (item.Album ? `album-name:${item.Album.trim().toLowerCase()}` : '')
  }

  if (isLiveTvItem(item)) {
    return ''
  }

  return ''
}

function hasDetailChildren(item: EmbyItem) {
  return item.Type === 'Series' || item.Type === 'MusicArtist' || item.Type === 'MusicAlbum' || isItemCollection(item)
}

async function changeFavorite(payload: { item: EmbyItem; isFavorite: boolean }) {
  await setFavorite(payload.item.Id, payload.isFavorite)
  await refreshAfterUserDataChange(payload.item)
}

async function changePlayed(payload: { item: EmbyItem; isPlayed: boolean }) {
  await setPlayed(payload.item.Id, payload.isPlayed)
  await refreshAfterUserDataChange(payload.item)
}

async function clearItemPlaybackProgress(item: EmbyItem) {
  await clearPlaybackProgress(item.Id)
  await refreshAfterUserDataChange(item)
}

onMounted(() => {
  restore().then(() => {
    restorePlaybackQueue()
  }).catch(() => {
    // The standalone login screen shows connection errors.
  })
})
</script>

<template>
  <VApp>
    <VMain>
      <main v-if="!session && activeView === 'settings'" class="auth-shell">
        <VCard class="auth-card auth-card--settings">
          <VToolbar density="comfortable" color="transparent">
            <VBtn icon variant="text" type="button" aria-label="返回登录" @click="activeView = 'library'">
              <ArrowLeft :size="20" />
            </VBtn>
            <div class="client-topbar__title">
              <p>本地设置</p>
              <h1>设置</h1>
            </div>
          </VToolbar>

          <SettingsView
            :session="session"
            :accounts="accounts"
            :default-playback-user-agent="DEFAULT_PLAYBACK_USER_AGENT"
            :is-busy="isBusy"
            :playback-preferences="playbackPreferences"
            :playback-user-agent="playbackUserAgent"
            :error-message="errorMessage"
            @login="submitLogin"
            @clear-local-accounts="clearLocalAccounts"
            @logout="logout"
            @remove-account="deleteAccount"
            @sign-out-current-only="disconnectCurrent"
            @switch-account="selectAccount"
            @update-account="editAccount"
            @update-playback-preferences="updatePlaybackPreferences"
            @update-playback-user-agent="updatePlaybackUserAgent"
          />
        </VCard>
      </main>

      <main v-else-if="!session" class="auth-shell">
        <VCard class="auth-card">
          <div class="auth-brand">
            <span class="auth-brand__mark">E</span>
            <div>
              <h1 class="auth-brand__title">Vela Player</h1>
              <p class="auth-brand__subtitle">连接服务器后开始浏览媒体库</p>
            </div>
          </div>
          <ConnectionPanel :session="session" :is-busy="isBusy" @login="submitLogin" @logout="logout" />
          <VAlert v-if="errorMessage" type="error" variant="tonal">
            <div class="auth-error">
              <span>{{ errorMessage }}</span>
              <div class="auth-error__actions">
                <VBtn size="small" variant="tonal" type="button" @click="copySharedError">
                  <template #prepend>
                    <Clipboard :size="15" />
                  </template>
                  {{ authErrorCopyLabel }}
                </VBtn>
                <VBtn size="small" color="error" variant="tonal" type="button" @click="clearLocalAccounts">
                  <template #prepend>
                    <Trash2 :size="15" />
                  </template>
                  清除本地账号
                </VBtn>
                <VBtn size="small" variant="tonal" type="button" @click="openSettings">
                  打开设置
                </VBtn>
              </div>
            </div>
          </VAlert>
        </VCard>
      </main>

      <main v-else-if="activeView === 'player'" class="player-shell">
        <PlayerPanel
          :item="playingItem"
          :episodes="seriesEpisodes"
          :playback-preferences="playbackPreferences"
          :get-playback-info="getPlaybackInfo"
          :get-playback-url="getPlaybackUrl"
          :get-subtitle-url="getSubtitleUrl"
          :get-mpv-auth-context="getMpvAuthContext"
          :report-playback-start="reportPlaybackStart"
          :report-playback-progress="reportPlaybackProgress"
          :report-playback-stopped="reportPlaybackStopped"
          :queue-items="playbackQueue.queueItems.value"
          :active-queue-item-id="playbackQueue.activeQueueItemId.value"
          :next-queue-item="playbackQueue.nextQueueItem.value"
          :playback-mode="playbackQueue.playbackMode.value"
          :previous-queue-item="playbackQueue.previousQueueItem.value"
          @back="leavePlayer"
          @change-item="playQueuedItem"
          @remove-queue-item="playbackQueue.removeFromQueue"
          @clear-queue="playbackQueue.clearQueue"
          @cycle-playback-mode="playbackQueue.cyclePlaybackMode"
        />
      </main>

      <main v-else class="client-shell">
        <aside class="client-rail" aria-label="主导航">
          <div class="client-rail__brand">E</div>
          <div class="client-rail__items">
            <VBtn
              class="rail-destination"
              :class="{ 'rail-destination--active': navigationView === 'library' }"
              :color="navigationView === 'library' ? 'primary' : undefined"
              :variant="navigationView === 'library' ? 'tonal' : 'text'"
              type="button"
              @click="activeView = 'library'"
            >
              <Library :size="22" />
              <span>媒体库</span>
            </VBtn>
            <VBtn
              class="rail-destination"
              :class="{ 'rail-destination--active': navigationView === 'settings' }"
              :color="navigationView === 'settings' ? 'primary' : undefined"
              :variant="navigationView === 'settings' ? 'tonal' : 'text'"
              type="button"
              @click="openSettings"
            >
              <Settings :size="22" />
              <span>设置</span>
            </VBtn>
          </div>
          <div class="client-rail__account">{{ session.username.slice(0, 1).toUpperCase() }}</div>
        </aside>

        <section class="client-workspace">
          <VToolbar class="client-topbar" density="comfortable">
            <VBtn
              v-if="activeView === 'detail' || activeView === 'settings'"
              icon
              variant="text"
              :aria-label="activeView === 'settings' ? '关闭设置' : '返回媒体库'"
              @click="activeView === 'settings' ? closeSettings() : backFromDetail()"
            >
              <ArrowLeft :size="20" />
            </VBtn>

            <div class="client-topbar__title">
              <p>{{ session.username }}</p>
              <h1>{{ pageTitle }}</h1>
            </div>

            <VSpacer />

            <VBtn
              v-if="playbackQueue.queueItems.value.length"
              icon
              variant="tonal"
              aria-label="打开播放队列"
              @click="openPlaybackQueue"
            >
              <ListMusic :size="19" />
            </VBtn>

            <VBtn icon variant="tonal" aria-label="设置" @click="openSettings">
              <Settings :size="19" />
            </VBtn>
          </VToolbar>

          <section class="client-page" :class="{ 'is-loading-line': isBusy }">
            <VAlert
              v-if="errorMessage && activeView !== 'settings'"
              class="client-error"
              type="error"
              variant="tonal"
            >
              <div class="auth-error">
                <span>{{ errorMessage }}</span>
                <div class="auth-error__actions">
                  <VBtn size="small" variant="tonal" type="button" @click="copySharedError">
                    <template #prepend>
                      <Clipboard :size="15" />
                    </template>
                    {{ authErrorCopyLabel }}
                  </VBtn>
                  <VBtn size="small" variant="tonal" type="button" @click="openSettings">
                    打开设置
                  </VBtn>
                  <VBtn size="small" color="error" variant="tonal" type="button" @click="clearLocalAccounts">
                    <template #prepend>
                      <Trash2 :size="15" />
                    </template>
                    清除本地账号
                  </VBtn>
                </div>
              </div>
            </VAlert>

            <Transition name="view-fade" mode="out-in">
              <LibraryBrowser
                v-if="activeView === 'library'"
                key="library"
                :libraries="libraries"
                :items="items"
                :items-total-count="itemsTotalCount"
                :items-loaded-count="itemsLoadedCount"
                :items-can-load-more="itemsCanLoadMore"
                :resume-items="resumeItems"
                :resume-history-items="resumeHistoryItems"
                :resume-items-total-count="resumeItemsTotalCount"
                :resume-items-can-load-more="resumeItemsCanLoadMore"
                :next-up-items="nextUpItems"
                :played-items="playedItems"
                :played-history-items="playedHistoryItems"
                :played-items-total-count="playedItemsTotalCount"
                :played-items-can-load-more="playedItemsCanLoadMore"
                :latest-items="latestItems"
                :favorite-items="favoriteItems"
                :live-tv-channels="liveTvChannels"
                :live-tv-programs-by-channel="liveTvProgramsByChannel"
                v-model:search-query="librarySearchQuery"
                :search-results="searchResults"
                :search-total-count="searchTotalCount"
                :search-results-loaded-count="searchResultsLoadedCount"
                :search-results-can-load-more="searchResultsCanLoadMore"
                :selected-item="selectedItem"
                :is-busy="isBusy"
                :library-sort-by="librarySortBy"
                :library-sort-order="librarySortOrder"
                :get-image-url="getImageUrl"
                @change-sort="changeLibrarySort"
                @clear-playback-progress="clearItemPlaybackProgress"
                @load-more="loadMoreLibraryItems"
                @load-more-played="loadMorePlayedItems"
                @load-more-resume="loadMoreResumeItems"
                @load-more-search="loadMoreSearchResults"
                @search="searchItems"
                @select-library="loadLibraryItems"
                @select-item="openItemDetail"
                @refresh-live-tv="refreshLiveTvChannels"
              />

              <MediaDetailView
                v-else-if="activeView === 'detail'"
                key="detail"
                :item="selectedItem"
                :seasons="seriesSeasons"
                :episodes="seriesEpisodes"
                :similar-items="similarItems"
                :is-busy="isBusy"
                :get-image-url="getImageUrl"
                :get-backdrop-url="getBackdropUrl"
                @back="backFromDetail"
                @change-favorite="changeFavorite"
                @change-played="changePlayed"
                @add-to-queue="addDetailItemToQueue"
                @play="openPlayer"
                @select-item="openItemDetail"
                @search-person="searchPerson"
              />

              <SettingsView
                v-else
                key="settings"
                :session="session"
                :accounts="accounts"
                :default-playback-user-agent="DEFAULT_PLAYBACK_USER_AGENT"
                :is-busy="isBusy"
                :playback-preferences="playbackPreferences"
                :playback-user-agent="playbackUserAgent"
                :error-message="errorMessage"
                @login="submitLogin"
                @clear-local-accounts="clearLocalAccounts"
                @logout="logout"
                @remove-account="deleteAccount"
                @sign-out-current-only="disconnectCurrent"
                @switch-account="selectAccount"
                @update-account="editAccount"
                @update-playback-preferences="updatePlaybackPreferences"
                @update-playback-user-agent="updatePlaybackUserAgent"
              />
            </Transition>
          </section>
        </section>
      </main>
    </VMain>
  </VApp>
</template>
