<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, shallowRef } from 'vue'
import { ArrowLeft, Library, Settings } from 'lucide-vue-next'
import {
  DEFAULT_PLAYBACK_USER_AGENT,
  useEmbyClient,
  type EmbyItem,
  type EmbyLibrary,
  type LibrarySortKey,
  type SortOrder,
} from './composables/useEmbyClient'

type AppView = 'library' | 'detail' | 'player' | 'settings'

const ConnectionPanel = defineAsyncComponent(() => import('./components/ConnectionPanel.vue'))
const LibraryBrowser = defineAsyncComponent(() => import('./components/LibraryBrowser.vue'))
const MediaDetailView = defineAsyncComponent(() => import('./components/MediaDetailView.vue'))
const PlayerPanel = defineAsyncComponent(() => import('./components/PlayerPanel.vue'))
const SettingsView = defineAsyncComponent(() => import('./components/SettingsView.vue'))

const {
  session,
  accounts,
  libraries,
  items,
  itemsTotalCount,
  resumeItems,
  latestItems,
  favoriteItems,
  searchResults,
  searchTotalCount,
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
  getBackdropUrl,
  getImageUrl,
  getMpvAuthContext,
  getPlaybackInfo,
  getPlaybackUrl,
  getSubtitleUrl,
  clearSeriesEpisodes,
  loadHome,
  loadItems,
  loadMoreItems,
  loadMoreSearchResults,
  loadSeriesEpisodes,
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

const activeView = shallowRef<AppView>('library')
const previousView = shallowRef<AppView>('library')
const playingItem = shallowRef<EmbyItem | null>(null)
const activeLibrary = shallowRef<EmbyLibrary | null>(null)
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
  activeView.value = 'library'
}

async function selectAccount(accountId: string) {
  await switchAccount(accountId)
  activeView.value = 'library'
}

function deleteAccount(accountId: string) {
  removeAccount(accountId)
  activeView.value = session.value ? 'library' : 'settings'
}

function disconnectCurrent() {
  signOutCurrentOnly().catch(() => {
    // The settings view displays shared persistence errors.
  })
  activeView.value = 'settings'
}

async function clearLocalAccounts() {
  await clearAllLocalAccounts()
  activeView.value = 'settings'
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
  if (item.Type === 'Series') {
    loadSeriesEpisodes(item.Id).catch(() => {
      // The detail view displays the shared error state.
    })
  } else {
    clearSeriesEpisodes()
  }
}

async function openPlayer(item?: EmbyItem) {
  const playableItem = item ?? selectedItem.value
  if (playableItem) {
    playingItem.value = playableItem
    activeView.value = 'player'
    if (playableItem.Type === 'Episode' && playableItem.SeriesId) {
      loadSeriesEpisodes(playableItem.SeriesId).catch(() => {
        // The player remains usable even if episode navigation cannot be loaded.
      })
    }
  }
}

async function refreshAfterPlayback() {
  await Promise.all([
    loadHome(),
    activeLibrary.value ? loadItems(activeLibrary.value) : Promise.resolve(),
  ])
}

function leavePlayer() {
  playingItem.value = null
  activeView.value = selectedItem.value ? 'detail' : 'library'
  refreshAfterPlayback().catch(() => {
    // The shared error state is displayed by the current view.
  })
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
  await Promise.all([
    loadHome(),
    activeLibrary.value ? loadItems(activeLibrary.value) : Promise.resolve(),
    item.Type === 'Series' ? loadSeriesEpisodes(item.Id) : Promise.resolve(),
    item.Type === 'Episode' && item.SeriesId ? loadSeriesEpisodes(item.SeriesId) : Promise.resolve(),
  ])
}

async function changeFavorite(payload: { item: EmbyItem; isFavorite: boolean }) {
  await setFavorite(payload.item.Id, payload.isFavorite)
  await refreshAfterUserDataChange(payload.item)
}

async function changePlayed(payload: { item: EmbyItem; isPlayed: boolean }) {
  await setPlayed(payload.item.Id, payload.isPlayed)
  await refreshAfterUserDataChange(payload.item)
}

onMounted(() => {
  restore().catch(() => {
    // The standalone login screen shows connection errors.
  })
})
</script>

<template>
  <VApp>
    <VMain>
      <main v-if="!session" class="auth-shell">
        <VCard class="auth-card">
          <div class="auth-brand">
            <span class="auth-brand__mark">E</span>
            <div>
              <h1 class="auth-brand__title">Vela Player</h1>
              <p class="auth-brand__subtitle">连接服务器后开始浏览媒体库</p>
            </div>
          </div>
          <ConnectionPanel :session="session" :is-busy="isBusy" @login="submitLogin" @logout="logout" />
          <VAlert v-if="errorMessage" type="error" variant="tonal">{{ errorMessage }}</VAlert>
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
          @back="leavePlayer"
          @change-item="playingItem = $event"
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
              @click="activeView === 'settings' ? closeSettings() : backFromDetail()"
            >
              <ArrowLeft :size="20" />
            </VBtn>

            <div class="client-topbar__title">
              <p>{{ session.username }}</p>
              <h1>{{ pageTitle }}</h1>
            </div>

            <VSpacer />

            <VBtn icon variant="tonal" aria-label="设置" @click="openSettings">
              <Settings :size="19" />
            </VBtn>
          </VToolbar>

          <section class="client-page" :class="{ 'is-loading-line': isBusy }">
            <Transition name="view-fade" mode="out-in">
              <LibraryBrowser
                v-if="activeView === 'library'"
                key="library"
                :libraries="libraries"
                :items="items"
                :items-total-count="itemsTotalCount"
                :resume-items="resumeItems"
                :latest-items="latestItems"
                :favorite-items="favoriteItems"
                :search-results="searchResults"
                :search-total-count="searchTotalCount"
                :selected-item="selectedItem"
                :is-busy="isBusy"
                :library-sort-by="librarySortBy"
                :library-sort-order="librarySortOrder"
                :get-image-url="getImageUrl"
                @change-sort="changeLibrarySort"
                @load-more="loadMoreLibraryItems"
                @load-more-search="loadMoreSearchResults"
                @search="searchItems"
                @select-library="loadLibraryItems"
                @select-item="openItemDetail"
              />

              <MediaDetailView
                v-else-if="activeView === 'detail'"
                key="detail"
                :item="selectedItem"
                :seasons="seriesSeasons"
                :episodes="seriesEpisodes"
                :is-busy="isBusy"
                :get-image-url="getImageUrl"
                :get-backdrop-url="getBackdropUrl"
                @back="backFromDetail"
                @change-favorite="changeFavorite"
                @change-played="changePlayed"
                @play="openPlayer"
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
