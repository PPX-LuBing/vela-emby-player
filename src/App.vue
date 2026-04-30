<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, shallowRef } from 'vue'
import { ArrowLeft, Library, Settings } from 'lucide-vue-next'
import { useEmbyClient, type EmbyItem, type EmbyLibrary } from './composables/useEmbyClient'

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
  seriesSeasons,
  seriesEpisodes,
  selectedItem,
  isBusy,
  errorMessage,
  getBackdropUrl,
  getImageUrl,
  getMpvAuthContext,
  getPlaybackInfo,
  getPlaybackUrl,
  getSubtitleUrl,
  clearSeriesEpisodes,
  loadItems,
  loadSeriesEpisodes,
  login,
  logout,
  removeAccount,
  reportPlaybackStart,
  reportPlaybackProgress,
  reportPlaybackStopped,
  restore,
  selectItem,
  signOutCurrentOnly,
  switchAccount,
  updateAccount,
} = useEmbyClient()

const activeView = shallowRef<AppView>('library')
const previousView = shallowRef<AppView>('library')
const playingItem = shallowRef<EmbyItem | null>(null)
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
  signOutCurrentOnly()
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

function leavePlayer() {
  playingItem.value = null
  activeView.value = selectedItem.value ? 'detail' : 'library'
}

function backFromDetail() {
  playingItem.value = null
  activeView.value = 'library'
}

async function loadLibraryItems(library: EmbyLibrary) {
  playingItem.value = null
  await loadItems(library)
  activeView.value = 'library'
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
                :selected-item="selectedItem"
                :is-busy="isBusy"
                :get-image-url="getImageUrl"
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
                @play="openPlayer"
              />

              <SettingsView
                v-else
                key="settings"
                :session="session"
                :accounts="accounts"
                :is-busy="isBusy"
                :error-message="errorMessage"
                @login="submitLogin"
                @logout="logout"
                @remove-account="deleteAccount"
                @sign-out-current-only="disconnectCurrent"
                @switch-account="selectAccount"
                @update-account="editAccount"
              />
            </Transition>
          </section>
        </section>
      </main>
    </VMain>
  </VApp>
</template>
