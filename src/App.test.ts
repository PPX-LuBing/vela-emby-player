import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, shallowRef } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { vuetifyStubs } from './test/componentStubs'
import type { EmbyItem, EmbyLibrary, EmbySession } from './composables/useEmbyClient'

const library: EmbyLibrary = {
  Id: 'library-1',
  Name: 'TV Shows',
  CollectionType: 'tvshows',
}

const movie: EmbyItem = {
  Id: 'movie-1',
  Name: 'Movie One',
  Type: 'Movie',
}

const series: EmbyItem = {
  Id: 'series-1',
  Name: 'Series One',
  Type: 'Series',
}

const episode: EmbyItem = {
  Id: 'episode-1',
  Name: 'Episode One',
  Type: 'Episode',
  SeriesId: 'series-1',
  SeriesName: 'Series One',
  IndexNumber: 1,
}

const session: EmbySession = {
  id: 'account-1',
  serverUrl: 'https://emby.test',
  userId: 'user-1',
  accessToken: 'token',
  username: 'ice',
  displayName: 'ice',
  lastUsedAt: 1,
}

describe('App playback detail regression', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  it('keeps the selected series detail after returning from the player', async () => {
    const client = createClientMock()
    mockAppDependencies(client)
    const App = (await import('./App.vue')).default
    const wrapper = mount(App, {
      global: {
        stubs: vuetifyStubs,
      },
    })

    await flushPromises()
    await wrapper.find('[data-test="select-library"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-test="open-series"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Series One')
    expect(wrapper.text()).toContain('episodes:1')

    await wrapper.find('[data-test="play-detail"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('player:Episode One')

    await wrapper.find('[data-test="player-back"]').trigger('click')
    await flushPromises()

    expect(client.loadItems).toHaveBeenLastCalledWith(library, { preserveSelection: true })
    expect(wrapper.text()).toContain('Series One')
    expect(wrapper.text()).toContain('episodes:1')
  })
})

function createClientMock() {
  const selectedItem = shallowRef<EmbyItem | null>(null)
  const seriesEpisodes = shallowRef<EmbyItem[]>([])
  const loadItems = vi.fn(async (_library: EmbyLibrary, options?: { preserveSelection?: boolean }) => {
    if (!options?.preserveSelection) {
      selectedItem.value = movie
    }
  })

  return {
    session: shallowRef<EmbySession | null>(session),
    accounts: shallowRef([session]),
    libraries: shallowRef([library]),
    items: shallowRef([series]),
    itemsTotalCount: shallowRef(1),
    itemsLoadedCount: shallowRef(1),
    itemsCanLoadMore: shallowRef(false),
    resumeItems: shallowRef([]),
    resumeHistoryItems: shallowRef([]),
    resumeItemsTotalCount: shallowRef(0),
    resumeItemsCanLoadMore: shallowRef(false),
    nextUpItems: shallowRef([]),
    playedItems: shallowRef([]),
    playedHistoryItems: shallowRef([]),
    playedItemsTotalCount: shallowRef(0),
    playedItemsCanLoadMore: shallowRef(false),
    latestItems: shallowRef([]),
    favoriteItems: shallowRef([]),
    liveTvChannels: shallowRef([]),
    liveTvProgramsByChannel: shallowRef({}),
    similarItems: shallowRef([]),
    searchResults: shallowRef([]),
    searchTotalCount: shallowRef(0),
    searchResultsLoadedCount: shallowRef(0),
    searchResultsCanLoadMore: shallowRef(false),
    seriesSeasons: shallowRef([]),
    seriesEpisodes,
    selectedItem,
    playbackPreferences: shallowRef({
      preferredAudioLanguage: '',
      preferredSubtitleLanguage: '',
      defaultForceTranscode: false,
      defaultQualityPreset: 'original',
      customMaxStreamingBitrate: 12_000_000,
    }),
    playbackUserAgent: shallowRef('Vela Test'),
    isBusy: shallowRef(false),
    librarySortBy: shallowRef('SortName'),
    librarySortOrder: shallowRef('Ascending'),
    errorMessage: shallowRef(''),
    clearAllLocalAccounts: vi.fn().mockResolvedValue(undefined),
    clearPlaybackProgress: vi.fn().mockResolvedValue(undefined),
    getBackdropUrl: vi.fn(() => ''),
    getImageUrl: vi.fn(() => ''),
    getMpvAuthContext: vi.fn(),
    getPlaybackInfo: vi.fn(),
    getPlaybackUrl: vi.fn(),
    getSubtitleUrl: vi.fn(),
    clearSeriesEpisodes: vi.fn(() => {
      seriesEpisodes.value = []
    }),
    loadHome: vi.fn().mockResolvedValue(undefined),
    loadItems,
    loadLiveTvChannels: vi.fn().mockResolvedValue(undefined),
    loadLiveTvPrograms: vi.fn().mockResolvedValue(undefined),
    loadMoreItems: vi.fn().mockResolvedValue(undefined),
    loadMorePlayedItems: vi.fn().mockResolvedValue(undefined),
    loadMoreResumeItems: vi.fn().mockResolvedValue(undefined),
    loadMoreSearchResults: vi.fn().mockResolvedValue(undefined),
    loadSeriesEpisodes: vi.fn(async () => {
      seriesEpisodes.value = [episode]
    }),
    loadSimilarItems: vi.fn().mockResolvedValue([]),
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    removeAccount: vi.fn().mockResolvedValue(undefined),
    reportPlaybackStart: vi.fn(),
    reportPlaybackProgress: vi.fn(),
    reportPlaybackStopped: vi.fn(),
    restore: vi.fn().mockResolvedValue(undefined),
    searchItems: vi.fn().mockResolvedValue(undefined),
    selectItem: vi.fn((item: EmbyItem) => {
      selectedItem.value = item
    }),
    setFavorite: vi.fn().mockResolvedValue(undefined),
    setPlayed: vi.fn().mockResolvedValue(undefined),
    signOutCurrentOnly: vi.fn().mockResolvedValue(undefined),
    switchAccount: vi.fn().mockResolvedValue(undefined),
    updateAccount: vi.fn(),
    updatePlaybackPreferences: vi.fn(),
    updatePlaybackUserAgent: vi.fn(),
  }
}

function mockAppDependencies(client: ReturnType<typeof createClientMock>) {
  vi.doMock('./composables/useEmbyClient', () => ({
    DEFAULT_PLAYBACK_USER_AGENT: 'Vela Test',
    useEmbyClient: () => client,
  }))

  vi.doMock('./components/ConnectionPanel.vue', () => ({
    default: defineComponent({
      name: 'ConnectionPanel',
      setup: () => () => h('div', 'connection'),
    }),
  }))

  vi.doMock('./components/LibraryBrowser.vue', () => ({
    default: defineComponent({
      name: 'LibraryBrowser',
      emits: ['select-library', 'select-item'],
      setup(_, { emit }) {
        return () => h('div', [
          h('button', { 'data-test': 'select-library', onClick: () => emit('select-library', library) }, 'select library'),
          h('button', { 'data-test': 'open-series', onClick: () => emit('select-item', series) }, 'open series'),
        ])
      },
    }),
  }))

  vi.doMock('./components/MediaDetailView.vue', () => ({
    default: defineComponent({
      name: 'MediaDetailView',
      props: ['item', 'episodes'],
      emits: ['play'],
      setup(props, { emit }) {
        return () => h('div', [
          h('span', String(props.item?.Name ?? 'no item')),
          h('span', `episodes:${props.episodes?.length ?? 0}`),
          h('button', { 'data-test': 'play-detail', onClick: () => emit('play', props.episodes?.[0]) }, 'play'),
        ])
      },
    }),
  }))

  vi.doMock('./components/PlayerPanel.vue', () => ({
    default: defineComponent({
      name: 'PlayerPanel',
      props: ['item'],
      emits: ['back'],
      setup(props, { emit }) {
        return () => h('div', [
          h('span', `player:${props.item?.Name ?? 'none'}`),
          h('button', { 'data-test': 'player-back', onClick: () => emit('back') }, 'back'),
        ])
      },
    }),
  }))

  vi.doMock('./components/SettingsView.vue', () => ({
    default: defineComponent({
      name: 'SettingsView',
      setup: () => () => h('div', 'settings'),
    }),
  }))
}
