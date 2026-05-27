import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import LibraryBrowser from './LibraryBrowser.vue'
import { vuetifyStubs } from '../test/componentStubs'
import type { EmbyItem, EmbyLibrary } from '../composables/useEmbyClient'

const library: EmbyLibrary = {
  Id: 'library-1',
  Name: 'Movies',
  CollectionType: 'movies',
}

const items: EmbyItem[] = [
  {
    Id: 'movie-1',
    Name: 'Drama Movie',
    Type: 'Movie',
    ProductionYear: 2026,
    Genres: ['Drama'],
    Tags: ['Festival'],
    People: [{ Name: 'Sam Actor', Type: 'Actor' }],
  },
  { Id: 'movie-2', Name: 'Action Movie', Type: 'Movie', ProductionYear: 2025, Genres: ['Action'] },
  { Id: 'series-1', Name: 'Drama Series', Type: 'Series', ProductionYear: 2026, Genres: ['Drama'] },
]

type LibraryBrowserProps = InstanceType<typeof LibraryBrowser>['$props']

describe('LibraryBrowser', () => {
  it('filters loaded library items by type year and genre', async () => {
    const wrapper = mount(LibraryBrowser, {
      props: createProps(),
      global: {
        stubs: vuetifyStubs,
      },
    })

    await wrapper.findAll('.library-tabs__button').find((button) => button.text().includes('Movies'))?.trigger('click')
    await nextTick()

    const selects = wrapper.findAll('select')
    await selects[3].setValue('Movie')
    await selects[4].setValue('2026')
    await selects[5].setValue('Drama')

    expect(wrapper.text()).toContain('Drama Movie')
    expect(wrapper.text()).not.toContain('Action Movie')
    expect(wrapper.text()).not.toContain('Drama Series')
  })

  it('does not expose a custom discovery tab', () => {
    const wrapper = mount(LibraryBrowser, {
      props: createProps(),
      global: {
        stubs: vuetifyStubs,
      },
    })

    expect(wrapper.findAll('.library-tabs__button').some((button) => button.text().includes('发现'))).toBe(false)
  })

  it('accepts external search text for detail person searches', async () => {
    vi.useFakeTimers()
    const wrapper = mount(LibraryBrowser, {
      props: createProps({ searchQuery: 'Sam Actor' }),
      global: {
        stubs: vuetifyStubs,
      },
    })

    await nextTick()
    await vi.advanceTimersByTimeAsync(260)

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Sam Actor')
    expect(wrapper.text()).toContain('搜索结果')
    expect(wrapper.emitted('search')?.[0]).toEqual(['Sam Actor'])
    vi.useRealTimers()
  })

  it('uses source loaded counts for library pagination controls', async () => {
    const wrapper = mount(LibraryBrowser, {
      props: createProps({
        items: [items[0]],
        itemsLoadedCount: 3,
        itemsTotalCount: 3,
        itemsCanLoadMore: false,
      }),
      global: {
        stubs: vuetifyStubs,
      },
    })

    await wrapper.findAll('.library-tabs__button').find((button) => button.text().includes('Movies'))?.trigger('click')

    expect(wrapper.text()).not.toContain('加载更多')
  })

  it('uses source loaded counts for search pagination controls', async () => {
    const wrapper = mount(LibraryBrowser, {
      props: createProps({
        searchResults: [items[0]],
        searchResultsLoadedCount: 3,
        searchTotalCount: 3,
        searchResultsCanLoadMore: false,
      }),
      global: {
        stubs: vuetifyStubs,
      },
    })

    await wrapper.find('input').setValue('Drama')

    expect(wrapper.text()).toContain('搜索结果')
    expect(wrapper.text()).toContain('3 / 3 项')
    expect(wrapper.text()).not.toContain('加载更多搜索结果')
  })
})

function createProps(overrides: Partial<LibraryBrowserProps> = {}) {
  return {
    ...createPropsBase(),
    ...overrides,
  }
}

function createPropsBase(): LibraryBrowserProps {
  return {
    libraries: [library],
    items,
    itemsTotalCount: items.length,
    itemsLoadedCount: items.length,
    itemsCanLoadMore: false,
    resumeItems: [],
    resumeHistoryItems: [],
    resumeItemsTotalCount: 0,
    resumeItemsCanLoadMore: false,
    nextUpItems: [],
    playedItems: [],
    playedHistoryItems: [],
    playedItemsTotalCount: 0,
    playedItemsCanLoadMore: false,
    latestItems: [],
    favoriteItems: [],
    liveTvChannels: [],
    liveTvProgramsByChannel: {},
    searchQuery: '',
    searchResults: [],
    searchTotalCount: 0,
    searchResultsLoadedCount: 0,
    searchResultsCanLoadMore: false,
    selectedItem: null,
    isBusy: false,
    librarySortBy: 'SortName' as const,
    librarySortOrder: 'Ascending' as const,
    getImageUrl: () => '',
  }
}
