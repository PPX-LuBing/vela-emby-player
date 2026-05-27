<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { ChevronLeft, ChevronRight, Clapperboard, Clock3, Film, Library, RadioTower, Search } from 'lucide-vue-next'
import type { EmbyItem, EmbyLibrary, LibrarySortKey, SortOrder } from '../composables/useEmbyClient'
import { isProgramAiringNow } from '../composables/embyLiveTvApi'
import {
  formatRuntimeMinutes,
  hasPlaybackProgress,
  isItemCollection,
} from '../composables/mediaItemDisplay'
import {
  createDefaultLibraryAdvancedFilters,
  createLibraryAdvancedFilterOptions,
  filterItemsByAdvancedFilters,
  hasActiveLibraryAdvancedFilters,
  type LibraryAdvancedFilterState,
} from '../composables/libraryFilters'
import LibraryAdvancedFilters from './LibraryAdvancedFilters.vue'
import LibraryMediaCard from './LibraryMediaCard.vue'
import LiveTvGuideTimeline from './LiveTvGuideTimeline.vue'
import MediaRowSection from './MediaRowSection.vue'
import PlaybackHistoryView from './PlaybackHistoryView.vue'

type LibraryFilterKey = 'all' | 'favorites' | 'unplayed' | 'resumable'
type LibraryVirtualTab = 'home' | 'live-tv' | 'playback-history'

const sortOptions: { label: string; value: LibrarySortKey }[] = [
  { label: '名称', value: 'SortName' },
  { label: '最近添加', value: 'DateCreated' },
  { label: '首映时间', value: 'PremiereDate' },
  { label: '评分', value: 'CommunityRating' },
]

const orderOptions: { label: string; value: SortOrder }[] = [
  { label: '升序', value: 'Ascending' },
  { label: '降序', value: 'Descending' },
]

const filterOptions: { label: string; value: LibraryFilterKey }[] = [
  { label: '全部', value: 'all' },
  { label: '仅收藏', value: 'favorites' },
  { label: '仅未看', value: 'unplayed' },
  { label: '继续观看', value: 'resumable' },
]
const programTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
})

interface LiveTvChannelMeta {
  currentProgramName: string
  programRows: {
    id: string
    name: string
    time: string
  }[]
}

const props = defineProps<{
  libraries: readonly EmbyLibrary[]
  items: readonly EmbyItem[]
  itemsTotalCount: number
  itemsLoadedCount: number
  itemsCanLoadMore: boolean
  resumeItems: readonly EmbyItem[]
  resumeHistoryItems: readonly EmbyItem[]
  resumeItemsTotalCount: number
  resumeItemsCanLoadMore: boolean
  nextUpItems: readonly EmbyItem[]
  playedItems: readonly EmbyItem[]
  playedHistoryItems: readonly EmbyItem[]
  playedItemsTotalCount: number
  playedItemsCanLoadMore: boolean
  latestItems: readonly EmbyItem[]
  favoriteItems: readonly EmbyItem[]
  liveTvChannels: readonly EmbyItem[]
  liveTvProgramsByChannel: Readonly<Record<string, readonly EmbyItem[]>>
  searchQuery: string
  searchResults: readonly EmbyItem[]
  searchTotalCount: number
  searchResultsLoadedCount: number
  searchResultsCanLoadMore: boolean
  selectedItem: EmbyItem | null
  isBusy: boolean
  librarySortBy: LibrarySortKey
  librarySortOrder: SortOrder
  getImageUrl: (item: EmbyItem, width?: number) => string
}>()

const emit = defineEmits<{
  'update:searchQuery': [query: string]
  changeSort: [payload: { sortBy: LibrarySortKey; sortOrder: SortOrder }]
  clearPlaybackProgress: [item: EmbyItem]
  loadMore: []
  loadMorePlayed: []
  loadMoreResume: []
  loadMoreSearch: []
  refreshLiveTv: []
  search: [query: string]
  selectLibrary: [library: EmbyLibrary]
  selectItem: [item: EmbyItem]
}>()

const activeLibraryId = shallowRef<LibraryVirtualTab | string>('home')
const query = shallowRef('')
const libraryFilter = shallowRef<LibraryFilterKey>('all')
const advancedFilters = shallowRef<LibraryAdvancedFilterState>(createDefaultLibraryAdvancedFilters())
const libraryTabsRef = useTemplateRef<HTMLElement>('libraryTabs')
let searchTimer = 0
let lastEmittedSearchQuery = ''
const hasSelectedLibrary = computed(() => !['home', 'live-tv', 'playback-history', ''].includes(activeLibraryId.value))
const isLiveTvView = computed(() => activeLibraryId.value === 'live-tv')
const isPlaybackHistoryView = computed(() => activeLibraryId.value === 'playback-history')
const hasHomeRows = computed(() => Boolean(
  props.resumeItems.length ||
  props.nextUpItems.length ||
  props.playedItems.length ||
  props.latestItems.length ||
  props.favoriteItems.length ||
  props.liveTvChannels.length,
))
const normalizedQuery = computed(() => query.value.trim())
const isSearching = computed(() => normalizedQuery.value.length >= 2)
const canLoadMore = computed(() => hasSelectedLibrary.value && props.itemsCanLoadMore)
const canLoadMoreSearch = computed(() => isSearching.value && props.searchResultsCanLoadMore)
const searchCountLabel = computed(() => {
  const total = props.searchTotalCount || props.searchResultsLoadedCount || props.searchResults.length
  return `${props.searchResultsLoadedCount || props.searchResults.length} / ${total} 项`
})
const advancedFilterOptions = computed(() => createLibraryAdvancedFilterOptions(props.items))
const hasActiveAdvancedFilters = computed(() => hasActiveLibraryAdvancedFilters(advancedFilters.value))
const liveTvNow = shallowRef(Date.now())
let liveTvClockTimer = 0

const filteredItems = computed(() => {
  const localQuery = normalizedQuery.value.toLowerCase()
  return filterItemsByAdvancedFilters(props.items, advancedFilters.value).filter((item) => {
    if (!matchesLibraryFilter(item)) {
      return false
    }

    if (!localQuery) {
      return true
    }

    const haystack = [
      item.Name,
      item.SeriesName,
      item.Album,
      item.AlbumArtist,
      item.AlbumArtists?.join(' '),
      item.Artists?.join(' '),
      item.ProductionYear,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(localQuery)
  })
})
const libraryCountLabel = computed(() => {
  const total = props.itemsTotalCount || props.itemsLoadedCount || filteredItems.value.length
  return `${filteredItems.value.length} / ${total} 项`
})

const activeFilterLabel = computed(() => {
  const labels = [filterOptions.find((option) => option.value === libraryFilter.value)?.label ?? '全部']
  const typeLabel = advancedFilterOptions.value.types.find((option) => option.value === advancedFilters.value.type)?.label
  const yearLabel = advancedFilterOptions.value.years.find((option) => option.value === advancedFilters.value.year)?.label
  const genreLabel = advancedFilterOptions.value.genres.find((option) => option.value === advancedFilters.value.genre)?.label

  if (advancedFilters.value.type !== 'all' && typeLabel) {
    labels.push(typeLabel)
  }
  if (advancedFilters.value.year !== 'all' && yearLabel) {
    labels.push(yearLabel)
  }
  if (advancedFilters.value.genre !== 'all' && genreLabel) {
    labels.push(genreLabel)
  }

  return labels.join('、')
})

const liveTvChannelMetaById = computed<Record<string, LiveTvChannelMeta>>(() => {
  const now = liveTvNow.value
  const metaById: Record<string, LiveTvChannelMeta> = {}

  for (const channel of props.liveTvChannels) {
    const programs = props.liveTvProgramsByChannel[channel.Id] ?? []
    const currentProgram = programs.find((program) => isProgramAiringNow(program, now))
      ?? (isProgramAiringNow(channel.CurrentProgram, now) ? channel.CurrentProgram : null)
    const programRows = programs
      .filter((program) => {
        const start = Date.parse(program.StartDate ?? '')
        return Number.isFinite(start) && start > now
      })
      .slice(0, 3)
      .map((program) => ({
        id: program.Id,
        name: program.Name ?? '未命名节目',
        time: formatProgramTime(program),
      }))

    metaById[channel.Id] = {
      currentProgramName: currentProgram?.Name ?? '',
      programRows,
    }
  }

  return metaById
})

watch(normalizedQuery, (nextQuery) => {
  if (nextQuery !== props.searchQuery) {
    emit('update:searchQuery', nextQuery)
  }

  if (searchTimer) {
    window.clearTimeout(searchTimer)
    searchTimer = 0
  }

  if (nextQuery.length < 2) {
    if (lastEmittedSearchQuery) {
      lastEmittedSearchQuery = ''
      emit('search', '')
    }
    return
  }

  searchTimer = window.setTimeout(() => {
    lastEmittedSearchQuery = nextQuery
    emit('search', nextQuery)
  }, 250)
})

watch(
  () => props.searchQuery,
  (nextQuery) => {
    const normalizedSearchQuery = nextQuery.trim()
    if (normalizedSearchQuery !== query.value) {
      query.value = normalizedSearchQuery
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (searchTimer) {
    window.clearTimeout(searchTimer)
  }
  stopLiveTvClock()
})

watch(isLiveTvView, (active) => {
  if (active) {
    startLiveTvClock()
    return
  }

  stopLiveTvClock()
}, { immediate: true })

function changeSortBy(sortBy: LibrarySortKey) {
  emit('changeSort', { sortBy, sortOrder: props.librarySortOrder })
}

function changeSortOrder(sortOrder: SortOrder) {
  emit('changeSort', { sortBy: props.librarySortBy, sortOrder })
}

function selectLibrary(library: EmbyLibrary) {
  activeLibraryId.value = library.Id
  resetLibraryFilters()
  emit('selectLibrary', library)
}

function showHome() {
  activeLibraryId.value = 'home'
  resetLibraryFilters()
  query.value = ''
}

function showLiveTv() {
  activeLibraryId.value = 'live-tv'
  resetLibraryFilters()
  query.value = ''
  emit('refreshLiveTv')
}

function showPlaybackHistory() {
  activeLibraryId.value = 'playback-history'
  resetLibraryFilters()
  query.value = ''
}

function updateAdvancedFilters(filters: LibraryAdvancedFilterState) {
  advancedFilters.value = filters
}

function resetLibraryFilters() {
  libraryFilter.value = 'all'
  advancedFilters.value = createDefaultLibraryAdvancedFilters()
}

function matchesLibraryFilter(item: EmbyItem) {
  if (libraryFilter.value === 'favorites') {
    return Boolean(item.UserData?.IsFavorite)
  }

  if (libraryFilter.value === 'unplayed') {
    return !item.UserData?.Played
  }

  if (libraryFilter.value === 'resumable') {
    return hasPlaybackProgress(item)
  }

  return true
}

function scrollTabsWithWheel(event: WheelEvent) {
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) {
    return
  }

  const primaryDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (primaryDelta === 0 || target.scrollWidth <= target.clientWidth) {
    return
  }

  const maxScrollLeft = target.scrollWidth - target.clientWidth
  const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, target.scrollLeft + primaryDelta))
  if (nextScrollLeft === target.scrollLeft) {
    return
  }

  event.preventDefault()
  target.scrollLeft = nextScrollLeft
}

function scrollLibraryTabs(direction: 'previous' | 'next') {
  const tabs = libraryTabsRef.value
  if (!tabs) {
    return
  }

  const distance = Math.max(180, Math.round(tabs.clientWidth * 0.72))
  tabs.scrollBy({
    left: direction === 'next' ? distance : -distance,
    behavior: 'smooth',
  })
}

function formatMeta(item: EmbyItem) {
  const parts = []
  if (item.Type === 'Series') {
    const count = item.RecursiveItemCount ?? item.ChildCount ?? item.UserData?.UnplayedItemCount
    if (count) {
      parts.push(`${count} 集`)
    }
  }
  if (item.Type === 'MusicAlbum') {
    const count = item.RecursiveItemCount ?? item.ChildCount ?? item.UserData?.UnplayedItemCount
    const artist = item.AlbumArtist || item.AlbumArtists?.[0] || item.Artists?.[0]
    if (artist) {
      parts.push(artist)
    }
    if (count) {
      parts.push(`${count} 首`)
    }
  }
  if (item.Type === 'MusicArtist') {
    const count = item.RecursiveItemCount ?? item.ChildCount
    parts.push('艺术家')
    if (count) {
      parts.push(`${count} 项`)
    }
  }
  if (isItemCollection(item)) {
    const count = item.RecursiveItemCount ?? item.ChildCount
    if (count) {
      parts.push(`${count} 项`)
    }
  }
  if (item.Type === 'Episode' && item.SeriesName) {
    parts.push(item.SeriesName)
  }
  if (item.Type === 'Audio') {
    if (item.Album) {
      parts.push(item.Album)
    }
    const artist = item.AlbumArtist || item.AlbumArtists?.[0] || item.Artists?.[0]
    if (artist) {
      parts.push(artist)
    }
  }
  if (item.Type === 'TvChannel') {
    if (item.ChannelNumber || item.Number) {
      parts.push(`频道 ${item.ChannelNumber || item.Number}`)
    }
    if (item.CurrentProgram?.Name) {
      parts.push(item.CurrentProgram.Name)
    }
  }
  if (item.ProductionYear) {
    parts.push(String(item.ProductionYear))
  }
  const runtime = formatRuntimeMinutes(item.RunTimeTicks)
  if (runtime) {
    parts.push(runtime)
  }

  return parts.join(' · ') || item.Type
}

function formatProgramTime(program: EmbyItem) {
  const start = Date.parse(program.StartDate ?? '')
  const end = Date.parse(program.EndDate ?? '')
  if (!Number.isFinite(start)) {
    return ''
  }

  const startLabel = programTimeFormatter.format(start)

  if (!Number.isFinite(end)) {
    return startLabel
  }

  const endLabel = programTimeFormatter.format(end)
  return `${startLabel}-${endLabel}`
}

function liveTvChannelMeta(channel: EmbyItem) {
  return liveTvChannelMetaById.value[channel.Id] ?? { currentProgramName: '', programRows: [] }
}

function currentProgramNameFor(item: EmbyItem) {
  return liveTvChannelMeta(item).currentProgramName || item.CurrentProgram?.Name || ''
}

function startLiveTvClock() {
  liveTvNow.value = Date.now()
  if (liveTvClockTimer) {
    return
  }

  liveTvClockTimer = window.setInterval(() => {
    liveTvNow.value = Date.now()
  }, 60_000)
}

function stopLiveTvClock() {
  if (liveTvClockTimer) {
    window.clearInterval(liveTvClockTimer)
    liveTvClockTimer = 0
  }
}

</script>

<template>
  <section class="library-browser">
    <VSheet class="library-browser__chrome">
      <div>
        <h2 class="section-title">媒体中心</h2>
      </div>
      <VTextField
        v-model.trim="query"
        class="library-browser__search"
        type="search"
        placeholder="搜索影片、剧集、音乐或频道"
        density="compact"
        variant="solo-filled"
        hide-details
      >
        <template #prepend-inner>
          <Search :size="17" />
        </template>
      </VTextField>
    </VSheet>

      <div v-if="libraries.length" class="library-tabs-shell">
        <VBtn
          class="library-tabs-arrow library-tabs-arrow--previous"
          type="button"
          icon
          variant="tonal"
          aria-label="上一组媒体库标签"
          @click="scrollLibraryTabs('previous')"
        >
          <ChevronLeft :size="20" />
        </VBtn>

        <div ref="libraryTabs" class="library-tabs" aria-label="媒体库列表" @wheel="scrollTabsWithWheel">
          <VChip
            class="library-tabs__button"
            :color="activeLibraryId === 'home' ? 'primary' : undefined"
            :variant="activeLibraryId === 'home' ? 'flat' : 'tonal'"
            label
            @click="showHome"
          >
            <Clapperboard :size="16" />
            首页
          </VChip>
          <VChip
            class="library-tabs__button"
            :color="isPlaybackHistoryView ? 'primary' : undefined"
            :variant="isPlaybackHistoryView ? 'flat' : 'tonal'"
            label
            @click="showPlaybackHistory"
          >
            <Clock3 :size="16" />
            播放历史
          </VChip>
          <VChip
            class="library-tabs__button"
            :color="isLiveTvView ? 'primary' : undefined"
            :variant="isLiveTvView ? 'flat' : 'tonal'"
            label
            @click="showLiveTv"
          >
            <RadioTower :size="16" />
            电视直播
          </VChip>
          <VChip
            v-for="library in libraries"
            :key="library.Id"
            class="library-tabs__button"
            :color="activeLibraryId === library.Id ? 'primary' : undefined"
            :variant="activeLibraryId === library.Id ? 'flat' : 'tonal'"
            label
            @click="selectLibrary(library)"
          >
            <Library :size="16" />
            {{ library.Name }}
          </VChip>
        </div>

        <VBtn
          class="library-tabs-arrow library-tabs-arrow--next"
          type="button"
          icon
          variant="tonal"
          aria-label="下一组媒体库标签"
          @click="scrollLibraryTabs('next')"
        >
          <ChevronRight :size="20" />
        </VBtn>
      </div>

    <VSheet v-if="!libraries.length" class="empty-state">
      <Clapperboard :size="28" />
      <span>登录后会显示你的 Emby 媒体库</span>
    </VSheet>

    <section v-else-if="isSearching" class="search-results-section">
      <div class="shelf-heading">
        <div>
          <h3 class="shelf-heading__title">搜索结果</h3>
        </div>
        <span>{{ searchCountLabel }}</span>
      </div>

      <VSheet v-if="!searchResults.length" class="empty-state">
        <Search :size="28" />
        <span>{{ isBusy ? '正在搜索媒体库' : '没有找到匹配的媒体' }}</span>
      </VSheet>

      <div v-else class="media-grid">
        <LibraryMediaCard
          v-for="item in searchResults"
          :key="`search-${item.Id}`"
          :item="item"
          :selected="selectedItem?.Id === item.Id"
          :meta="formatMeta(item)"
          :get-image-url="getImageUrl"
          @select-item="emit('selectItem', $event)"
        />
      </div>

      <div v-if="canLoadMoreSearch" class="load-more-row">
        <VBtn :loading="isBusy" variant="tonal" type="button" @click="emit('loadMoreSearch')">
          加载更多搜索结果
        </VBtn>
      </div>
    </section>

    <div v-else-if="activeLibraryId === 'home'" class="home-sections">
      <MediaRowSection
        v-if="favoriteItems.length"
        title="我的收藏"
        :count-label="`${favoriteItems.length} 项`"
        :items="favoriteItems"
        :selected-item-id="selectedItem?.Id"
        :get-image-url="getImageUrl"
        :get-meta="formatMeta"
        :get-current-program-name="currentProgramNameFor"
        @select-item="emit('selectItem', $event)"
      />

      <MediaRowSection
        v-if="resumeItems.length"
        title="继续观看"
        :count-label="`${resumeItems.length} 项`"
        :items="resumeItems"
        :selected-item-id="selectedItem?.Id"
        :get-image-url="getImageUrl"
        :get-meta="formatMeta"
        @select-item="emit('selectItem', $event)"
      />

      <MediaRowSection
        v-if="nextUpItems.length"
        title="下一集"
        :count-label="`${nextUpItems.length} 集`"
        :items="nextUpItems"
        :selected-item-id="selectedItem?.Id"
        :get-image-url="getImageUrl"
        :get-meta="formatMeta"
        @select-item="emit('selectItem', $event)"
      />

      <MediaRowSection
        v-if="playedItems.length"
        title="最近播放"
        :count-label="`${playedItems.length} 项`"
        :items="playedItems"
        :selected-item-id="selectedItem?.Id"
        :get-image-url="getImageUrl"
        :get-meta="formatMeta"
        @select-item="emit('selectItem', $event)"
      />

      <MediaRowSection
        v-if="latestItems.length"
        title="最近添加"
        :count-label="`${latestItems.length} 项`"
        :items="latestItems"
        :selected-item-id="selectedItem?.Id"
        :get-image-url="getImageUrl"
        :get-meta="formatMeta"
        @select-item="emit('selectItem', $event)"
      />

      <MediaRowSection
        v-if="liveTvChannels.length"
        title="电视直播"
        :count-label="`${liveTvChannels.length} 个频道`"
        :items="liveTvChannels"
        :selected-item-id="selectedItem?.Id"
        :get-image-url="getImageUrl"
        :get-meta="formatMeta"
        show-live-badge
        :show-status="false"
        @select-item="emit('selectItem', $event)"
      />

      <VSheet v-if="!hasHomeRows" class="empty-state">
        <Film :size="28" />
        <span>{{ isBusy ? '正在读取首页内容' : '选择一个媒体库开始浏览' }}</span>
      </VSheet>
    </div>

    <PlaybackHistoryView
      v-else-if="isPlaybackHistoryView"
      :resume-items="resumeHistoryItems"
      :resume-items-total-count="resumeItemsTotalCount"
      :resume-items-can-load-more="resumeItemsCanLoadMore"
      :played-items="playedHistoryItems"
      :played-items-total-count="playedItemsTotalCount"
      :played-items-can-load-more="playedItemsCanLoadMore"
      :selected-item="selectedItem"
      :is-busy="isBusy"
      :get-image-url="getImageUrl"
      @clear-playback-progress="emit('clearPlaybackProgress', $event)"
      @load-more-played="emit('loadMorePlayed')"
      @load-more-resume="emit('loadMoreResume')"
      @select-item="emit('selectItem', $event)"
    />

    <section v-else-if="isLiveTvView" class="search-results-section">
      <div class="shelf-heading">
        <div>
          <h3 class="shelf-heading__title">电视直播</h3>
        </div>
        <span>{{ liveTvChannels.length }} 个频道</span>
      </div>

      <VSheet v-if="!liveTvChannels.length" class="empty-state">
        <RadioTower :size="28" />
        <span>{{ isBusy ? '正在读取直播频道' : '没有可用直播频道' }}</span>
      </VSheet>

      <template v-else>
        <LiveTvGuideTimeline
          :channels="liveTvChannels"
          :programs-by-channel="liveTvProgramsByChannel"
          :selected-channel-id="selectedItem?.Id"
          @select-channel="emit('selectItem', $event)"
        />

        <div class="media-grid media-grid--channels">
          <LibraryMediaCard
            v-for="item in liveTvChannels"
            :key="`live-tv-grid-${item.Id}`"
            :item="item"
            :selected="selectedItem?.Id === item.Id"
            :meta="formatMeta(item)"
            :get-image-url="getImageUrl"
            :current-program-name="liveTvChannelMeta(item).currentProgramName"
            :program-rows="liveTvChannelMeta(item).programRows"
            poster-variant="channel"
            show-live-badge
            :show-status="false"
            @select-item="emit('selectItem', $event)"
          />
        </div>
      </template>
    </section>

    <template v-else-if="hasSelectedLibrary">
      <VSheet v-if="!items.length" class="empty-state">
        <Film :size="28" />
        <span>{{ isBusy ? '正在读取媒体条目' : '这个媒体库没有可显示条目' }}</span>
        <span v-if="isBusy" class="loading-dots" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </span>
      </VSheet>

      <template v-else>
        <div class="shelf-heading">
          <div>
            <h3 class="shelf-heading__title">当前媒体库</h3>
          </div>
          <span>{{ libraryCountLabel }}</span>
        </div>

        <div class="library-filter-bar flex flex-wrap items-center justify-start gap-2.5 min-w-0">
          <div class="library-controls flex flex-wrap items-center justify-start gap-2.5 min-w-0">
            <VSelect
              v-model="libraryFilter"
              class="library-controls__select flex-1 basis-[150px] max-w-[180px] min-w-[140px]"
              :items="filterOptions"
              item-title="label"
              item-value="value"
              label="筛选"
              density="compact"
              variant="solo-filled"
              hide-details
            />
            <VSelect
              class="library-controls__select flex-1 basis-[150px] max-w-[180px] min-w-[140px]"
              :model-value="librarySortBy"
              :items="sortOptions"
              item-title="label"
              item-value="value"
              label="排序"
              density="compact"
              variant="solo-filled"
              hide-details
              @update:model-value="changeSortBy"
            />
            <VSelect
              class="library-controls__select flex-1 basis-[150px] max-w-[180px] min-w-[140px]"
              :model-value="librarySortOrder"
              :items="orderOptions"
              item-title="label"
              item-value="value"
              label="方向"
              density="compact"
              variant="solo-filled"
              hide-details
              @update:model-value="changeSortOrder"
            />
          </div>

          <LibraryAdvancedFilters
            class="library-filter-bar__advanced flex-1 basis-[520px]"
            :filters="advancedFilters"
            :type-options="advancedFilterOptions.types"
            :year-options="advancedFilterOptions.years"
            :genre-options="advancedFilterOptions.genres"
            :has-active-filters="hasActiveAdvancedFilters"
            @update-filters="updateAdvancedFilters"
            @reset="advancedFilters = createDefaultLibraryAdvancedFilters()"
          />
        </div>

        <VSheet v-if="!filteredItems.length" class="empty-state empty-state--compact">
          <Film :size="28" />
          <span>当前已加载条目中没有匹配“{{ activeFilterLabel }}”的内容</span>
        </VSheet>

        <div v-else class="media-grid">
          <LibraryMediaCard
            v-for="item in filteredItems"
            :key="item.Id"
            :item="item"
            :selected="selectedItem?.Id === item.Id"
            :meta="formatMeta(item)"
            :get-image-url="getImageUrl"
            @select-item="emit('selectItem', $event)"
          />
        </div>

        <div v-if="canLoadMore" class="load-more-row">
          <VBtn :loading="isBusy" variant="tonal" type="button" @click="emit('loadMore')">
            加载更多
          </VBtn>
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped>
.library-browser {
  display: grid;
  align-content: start;
  gap: 18px;
  min-width: 0;
  min-height: 0;
}

.library-browser__chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-width: 0;
  padding: 2px 0 4px;
  background: transparent;
  border: 0;
  border-radius: 0;
}

.shelf-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}

.shelf-heading__title {
  margin: 0;
  font-size: clamp(1.1rem, 1.6vw, 1.46rem);
  font-weight: 500;
  line-height: 1.25;
}

.shelf-heading span {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.84rem;
}

.home-sections {
  display: grid;
  gap: 30px;
  min-width: 0;
}

.search-results-section {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.library-browser__search {
  width: min(360px, 100%);
}

.library-browser__search :deep(.v-field) {
  background: rgb(var(--v-theme-surface));
}

.library-browser__search :deep(.v-field__prepend-inner) {
  align-items: center;
  padding-top: 0;
}

.library-controls :deep(.v-field) {
  background: rgb(var(--v-theme-surface));
}

.library-tabs-shell {
  position: relative;
  min-width: 0;
  overflow: hidden;
}

.library-tabs {
  display: flex;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 42px 10px;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.library-tabs::-webkit-scrollbar {
  display: none;
}

.library-tabs__button {
  flex: 0 0 auto;
  height: 36px;
  padding: 0 12px;
  cursor: pointer;
}

.library-tabs__button :deep(.v-chip__content) {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  line-height: 1;
}

.library-tabs-arrow {
  position: absolute;
  top: 18px;
  z-index: 4;
  width: 34px;
  height: 34px;
  transform: translateY(-50%);
}

.library-tabs-arrow--previous {
  left: 0;
}

.library-tabs-arrow--next {
  right: 0;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(clamp(138px, 13vw, 184px), 1fr));
  gap: 20px 16px;
}

.media-grid--channels {
  grid-template-columns: repeat(auto-fill, minmax(clamp(170px, 16vw, 220px), 1fr));
}

.load-more-row {
  display: flex;
  justify-content: center;
  padding: 4px 0 12px;
}

.library-browser svg {
  display: block;
  flex: 0 0 auto;
}

.empty-state {
  display: grid;
  min-height: 260px;
  place-items: center;
  align-content: center;
  gap: 12px;
  color: rgba(var(--v-theme-on-surface), 0.68);
}

.empty-state--compact {
  min-height: 180px;
}

.loading-dots {
  display: inline-flex;
  gap: 5px;
}

.loading-dots i {
  width: 6px;
  height: 6px;
  background: rgb(var(--v-theme-primary));
  border-radius: 50%;
  animation: dot-pulse 900ms infinite ease-in-out;
}

.loading-dots i:nth-child(2) {
  animation-delay: 120ms;
}

.loading-dots i:nth-child(3) {
  animation-delay: 240ms;
}

@keyframes dot-pulse {
  0%,
  80%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-4px);
  }
}

@media (max-width: 720px) {
  .library-browser__chrome {
    align-items: stretch;
    flex-direction: column;
  }

  .library-browser__search {
    width: 100%;
  }

  .library-controls {
    align-items: stretch;
    flex-direction: column;
  }

  .library-controls__select {
    max-width: none;
  }

  .library-tabs-arrow {
    display: none;
  }

  .library-tabs {
    padding-right: 0;
    padding-left: 0;
  }

  .media-grid {
    grid-template-columns: repeat(auto-fill, minmax(126px, 1fr));
    gap: 16px 12px;
  }

}
</style>
