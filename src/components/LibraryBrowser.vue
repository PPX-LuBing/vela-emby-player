<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { Check, Clapperboard, Film, Library, Search, Tv } from 'lucide-vue-next'
import type { EmbyItem, EmbyLibrary, LibrarySortKey, SortOrder } from '../composables/useEmbyClient'

type LibraryFilterKey = 'all' | 'favorites' | 'unplayed' | 'resumable'

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

const props = defineProps<{
  libraries: readonly EmbyLibrary[]
  items: readonly EmbyItem[]
  itemsTotalCount: number
  resumeItems: readonly EmbyItem[]
  latestItems: readonly EmbyItem[]
  favoriteItems: readonly EmbyItem[]
  searchResults: readonly EmbyItem[]
  searchTotalCount: number
  selectedItem: Readonly<EmbyItem | null>
  isBusy: boolean
  librarySortBy: LibrarySortKey
  librarySortOrder: SortOrder
  getImageUrl: (item: EmbyItem, width?: number) => string
}>()

const emit = defineEmits<{
  changeSort: [payload: { sortBy: LibrarySortKey; sortOrder: SortOrder }]
  loadMore: []
  loadMoreSearch: []
  search: [query: string]
  selectLibrary: [library: EmbyLibrary]
  selectItem: [item: EmbyItem]
}>()

const activeLibraryId = shallowRef('')
const query = shallowRef('')
const libraryFilter = shallowRef<LibraryFilterKey>('all')
let searchTimer = 0
const hasSelectedLibrary = computed(() => Boolean(activeLibraryId.value))
const hasHomeRows = computed(() => Boolean(props.resumeItems.length || props.latestItems.length || props.favoriteItems.length))
const normalizedQuery = computed(() => query.value.trim())
const isSearching = computed(() => normalizedQuery.value.length >= 2)
const canLoadMore = computed(() => hasSelectedLibrary.value && props.items.length < props.itemsTotalCount)
const canLoadMoreSearch = computed(() => isSearching.value && props.searchResults.length < props.searchTotalCount)

const filteredItems = computed(() => {
  const localQuery = normalizedQuery.value.toLowerCase()
  return props.items.filter((item) => {
    if (!matchesLibraryFilter(item)) {
      return false
    }

    if (!localQuery) {
      return true
    }

    const haystack = [item.Name, item.SeriesName, item.ProductionYear]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(localQuery)
  })
})

const activeFilterLabel = computed(() => {
  return filterOptions.find((option) => option.value === libraryFilter.value)?.label ?? '全部'
})

watch(normalizedQuery, (nextQuery) => {
  if (searchTimer) {
    window.clearTimeout(searchTimer)
  }

  searchTimer = window.setTimeout(() => {
    emit('search', nextQuery)
  }, nextQuery.length >= 2 ? 250 : 0)
})

function changeSortBy(sortBy: LibrarySortKey) {
  emit('changeSort', { sortBy, sortOrder: props.librarySortOrder })
}

function changeSortOrder(sortOrder: SortOrder) {
  emit('changeSort', { sortBy: props.librarySortBy, sortOrder })
}

function selectLibrary(library: EmbyLibrary) {
  activeLibraryId.value = library.Id
  libraryFilter.value = 'all'
  emit('selectLibrary', library)
}

function showHome() {
  activeLibraryId.value = ''
  libraryFilter.value = 'all'
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

function scrollTabs(event: WheelEvent) {
  const target = event.currentTarget
  if (!(target instanceof HTMLElement) || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    return
  }

  event.preventDefault()
  target.scrollLeft += event.deltaY
}

function formatMeta(item: EmbyItem) {
  const parts = []
  if (item.Type === 'Series') {
    const count = item.RecursiveItemCount ?? item.ChildCount ?? item.UserData?.UnplayedItemCount
    if (count) {
      parts.push(`${count} 集`)
    }
  }
  if (item.Type === 'Episode' && item.SeriesName) {
    parts.push(item.SeriesName)
  }
  if (item.ProductionYear) {
    parts.push(String(item.ProductionYear))
  }
  if (item.RunTimeTicks) {
    parts.push(`${Math.round(item.RunTimeTicks / 600_000_000)} 分钟`)
  }

  return parts.join(' · ') || item.Type
}

function isTvItem(item: EmbyItem) {
  return item.Type === 'Series' || item.Type === 'Episode'
}

function progressPercent(item: EmbyItem) {
  const percent = item.UserData?.PlayedPercentage
  if (typeof percent === 'number') {
    return Math.min(100, Math.max(0, percent))
  }

  const position = item.UserData?.PlaybackPositionTicks ?? 0
  const runtime = item.RunTimeTicks ?? 0
  if (!runtime) {
    return 0
  }

  return Math.min(100, Math.max(0, (position / runtime) * 100))
}

function hasPlaybackProgress(item: EmbyItem) {
  const percent = progressPercent(item)
  return percent > 0 && percent < 98 && !item.UserData?.Played
}

function isPlayed(item: EmbyItem) {
  return Boolean(item.UserData?.Played)
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
        placeholder="搜索影片或剧集"
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
        <div class="library-tabs" aria-label="媒体库列表" @wheel="scrollTabs">
        <VChip
          class="library-tabs__button"
          :color="!hasSelectedLibrary ? 'primary' : undefined"
          :variant="!hasSelectedLibrary ? 'flat' : 'tonal'"
          label
          @click="showHome"
        >
          <Clapperboard :size="16" />
          首页
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
        <span>{{ searchResults.length }} / {{ searchTotalCount || searchResults.length }} 项</span>
      </div>

      <VSheet v-if="!searchResults.length" class="empty-state">
        <Search :size="28" />
        <span>{{ isBusy ? '正在搜索媒体库' : '没有找到匹配的媒体' }}</span>
      </VSheet>

      <div v-else class="media-grid">
        <VCard
          v-for="item in searchResults"
          :key="`search-${item.Id}`"
          class="media-card"
          :class="{ 'media-card--active': selectedItem?.Id === item.Id }"
          tag="button"
          type="button"
          variant="flat"
          @click="emit('selectItem', item)"
        >
          <span class="media-card__poster">
            <img
              v-if="getImageUrl(item)"
              :src="getImageUrl(item, 360)"
              :alt="item.Name"
              loading="lazy"
            />
            <Tv v-else-if="isTvItem(item)" :size="34" />
            <Film v-else :size="34" />
            <span v-if="isPlayed(item)" class="media-card__played" title="已观看">
              <Check :size="13" />
            </span>
            <span v-else-if="hasPlaybackProgress(item)" class="media-card__progress">
              <i :style="{ width: `${progressPercent(item)}%` }"></i>
            </span>
          </span>
          <span class="media-card__body">
            <span class="media-card__name">{{ item.Name }}</span>
            <span class="media-card__meta">{{ formatMeta(item) }}</span>
          </span>
        </VCard>
      </div>

      <div v-if="canLoadMoreSearch" class="load-more-row">
        <VBtn :loading="isBusy" variant="tonal" type="button" @click="emit('loadMoreSearch')">
          加载更多搜索结果
        </VBtn>
      </div>
    </section>

    <div v-else-if="!hasSelectedLibrary" class="home-sections">
      <section v-if="favoriteItems.length" class="media-row-section">
        <div class="shelf-heading">
          <div>
            <h3 class="shelf-heading__title">我的收藏</h3>
          </div>
          <span>{{ favoriteItems.length }} 项</span>
        </div>

        <div class="media-row" @wheel="scrollTabs">
          <VCard
            v-for="item in favoriteItems"
            :key="`favorite-${item.Id}`"
            class="media-card media-card--row"
            :class="{ 'media-card--active': selectedItem?.Id === item.Id }"
            tag="button"
            type="button"
            variant="flat"
            @click="emit('selectItem', item)"
          >
            <span class="media-card__poster">
              <img
                v-if="getImageUrl(item)"
                :src="getImageUrl(item, 360)"
                :alt="item.Name"
                loading="lazy"
              />
              <Tv v-else-if="isTvItem(item)" :size="34" />
              <Film v-else :size="34" />
              <span v-if="isPlayed(item)" class="media-card__played" title="已观看">
                <Check :size="13" />
              </span>
              <span v-else-if="hasPlaybackProgress(item)" class="media-card__progress">
                <i :style="{ width: `${progressPercent(item)}%` }"></i>
              </span>
            </span>
            <span class="media-card__body">
              <span class="media-card__name">{{ item.Name }}</span>
              <span class="media-card__meta">{{ formatMeta(item) }}</span>
            </span>
          </VCard>
        </div>
      </section>

      <section v-if="resumeItems.length" class="media-row-section">
        <div class="shelf-heading">
          <div>
            <h3 class="shelf-heading__title">继续观看</h3>
          </div>
          <span>{{ resumeItems.length }} 项</span>
        </div>

        <div class="media-row" @wheel="scrollTabs">
          <VCard
            v-for="item in resumeItems"
            :key="`resume-${item.Id}`"
            class="media-card media-card--row"
            :class="{ 'media-card--active': selectedItem?.Id === item.Id }"
            tag="button"
            type="button"
            variant="flat"
            @click="emit('selectItem', item)"
          >
            <span class="media-card__poster">
              <img
                v-if="getImageUrl(item)"
                :src="getImageUrl(item, 360)"
                :alt="item.Name"
                loading="lazy"
              />
              <Tv v-else-if="isTvItem(item)" :size="34" />
              <Film v-else :size="34" />
              <span v-if="isPlayed(item)" class="media-card__played" title="已观看">
                <Check :size="13" />
              </span>
              <span v-else-if="hasPlaybackProgress(item)" class="media-card__progress">
                <i :style="{ width: `${progressPercent(item)}%` }"></i>
              </span>
            </span>
            <span class="media-card__body">
              <span class="media-card__name">{{ item.Name }}</span>
              <span class="media-card__meta">{{ formatMeta(item) }}</span>
            </span>
          </VCard>
        </div>
      </section>

      <section v-if="latestItems.length" class="media-row-section">
        <div class="shelf-heading">
          <div>
            <h3 class="shelf-heading__title">最近添加</h3>
          </div>
          <span>{{ latestItems.length }} 项</span>
        </div>

        <div class="media-row" @wheel="scrollTabs">
          <VCard
            v-for="item in latestItems"
            :key="`latest-${item.Id}`"
            class="media-card media-card--row"
            :class="{ 'media-card--active': selectedItem?.Id === item.Id }"
            tag="button"
            type="button"
            variant="flat"
            @click="emit('selectItem', item)"
          >
            <span class="media-card__poster">
              <img
                v-if="getImageUrl(item)"
                :src="getImageUrl(item, 360)"
                :alt="item.Name"
                loading="lazy"
              />
              <Tv v-else-if="isTvItem(item)" :size="34" />
              <Film v-else :size="34" />
              <span v-if="isPlayed(item)" class="media-card__played" title="已观看">
                <Check :size="13" />
              </span>
              <span v-else-if="hasPlaybackProgress(item)" class="media-card__progress">
                <i :style="{ width: `${progressPercent(item)}%` }"></i>
              </span>
            </span>
            <span class="media-card__body">
              <span class="media-card__name">{{ item.Name }}</span>
              <span class="media-card__meta">{{ formatMeta(item) }}</span>
            </span>
          </VCard>
        </div>
      </section>

      <VSheet v-if="!hasHomeRows" class="empty-state">
        <Film :size="28" />
        <span>{{ isBusy ? '正在读取首页内容' : '选择一个媒体库开始浏览' }}</span>
      </VSheet>
    </div>

    <VSheet v-else-if="!items.length" class="empty-state">
      <Film :size="28" />
      <span>{{ isBusy ? '正在读取媒体条目' : '选择一个媒体库开始浏览' }}</span>
      <span v-if="isBusy" class="loading-dots" aria-hidden="true">
        <i></i>
        <i></i>
        <i></i>
      </span>
    </VSheet>

    <div v-else class="shelf-heading">
      <div>
        <h3 class="shelf-heading__title">当前媒体库</h3>
      </div>
      <span>{{ filteredItems.length }} / {{ itemsTotalCount || filteredItems.length }} 项</span>
    </div>

    <div v-if="hasSelectedLibrary && !isSearching" class="library-controls">
      <VSelect
        v-model="libraryFilter"
        class="library-controls__select"
        :items="filterOptions"
        item-title="label"
        item-value="value"
        label="筛选"
        density="compact"
        variant="solo-filled"
        hide-details
      />
      <VSelect
        class="library-controls__select"
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
        class="library-controls__select"
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

    <VSheet v-if="items.length && !filteredItems.length" class="empty-state empty-state--compact">
      <Film :size="28" />
      <span>当前已加载条目中没有匹配“{{ activeFilterLabel }}”的内容</span>
    </VSheet>

    <div v-if="items.length" class="media-grid">
      <VCard
        v-for="item in filteredItems"
        :key="item.Id"
        class="media-card"
        :class="{ 'media-card--active': selectedItem?.Id === item.Id }"
        tag="button"
        type="button"
        variant="flat"
        @click="emit('selectItem', item)"
      >
        <span class="media-card__poster">
          <img
            v-if="getImageUrl(item)"
            :src="getImageUrl(item, 360)"
            :alt="item.Name"
            loading="lazy"
          />
          <Tv v-else-if="isTvItem(item)" :size="34" />
          <Film v-else :size="34" />
          <span v-if="isPlayed(item)" class="media-card__played" title="已观看">
            <Check :size="13" />
          </span>
          <span v-else-if="hasPlaybackProgress(item)" class="media-card__progress">
            <i :style="{ width: `${progressPercent(item)}%` }"></i>
          </span>
        </span>
        <span class="media-card__body">
          <span class="media-card__name">{{ item.Name }}</span>
          <span class="media-card__meta">{{ formatMeta(item) }}</span>
        </span>
      </VCard>
    </div>

    <div v-if="canLoadMore && !isSearching" class="load-more-row">
      <VBtn :loading="isBusy" variant="tonal" type="button" @click="emit('loadMore')">
        加载更多
      </VBtn>
    </div>
  </section>
</template>

<style scoped>
.library-browser {
  display: grid;
  align-content: start;
  gap: 14px;
  min-width: 0;
  min-height: 0;
  animation: surface-enter var(--motion-emphasized) both;
}

.library-browser__chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-width: 0;
  padding: 0;
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
  color: var(--color-text);
  font-size: 1rem;
  font-weight: 650;
  line-height: 1.25;
}

.shelf-heading span {
  color: var(--color-muted);
  font-size: 0.82rem;
}

.home-sections {
  display: grid;
  gap: 24px;
  min-width: 0;
}

.media-row-section {
  display: grid;
  gap: 12px;
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

.library-controls {
  display: flex;
  justify-content: end;
  gap: 10px;
  min-width: 0;
}

.library-controls__select {
  max-width: 190px;
}

.library-tabs-shell {
  min-width: 0;
  overflow: hidden;
  mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 30px), transparent 100%);
}

.library-tabs {
  display: flex;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 0 10px;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.library-tabs::-webkit-scrollbar {
  display: none;
}

.library-tabs__button {
  flex: 0 0 auto;
  gap: 8px;
  height: 36px;
  border-radius: 8px;
  cursor: pointer;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(clamp(132px, 13vw, 172px), 1fr));
  gap: 18px 14px;
}

.load-more-row {
  display: flex;
  justify-content: center;
  padding: 4px 0 12px;
}

.media-row {
  display: grid;
  grid-auto-columns: clamp(136px, 14vw, 176px);
  grid-auto-flow: column;
  gap: 14px;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 0 12px;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.media-row::-webkit-scrollbar {
  display: none;
}

.media-card {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 8px;
  color: inherit;
  text-align: left;
  background: color-mix(in srgb, var(--color-panel) 72%, transparent);
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 8px;
  cursor: pointer;
  transition:
    opacity var(--motion-fast),
    transform var(--motion-fast);
}

.media-card:hover {
  transform: translateY(-3px);
}

.media-card :deep(.v-card__overlay) {
  border-radius: 8px;
}

.media-card__poster {
  position: relative;
  display: grid;
  aspect-ratio: 2 / 3;
  place-items: center;
  overflow: hidden;
  color: var(--color-muted);
  background: linear-gradient(145deg, var(--color-panel-strong), #0d1219);
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 6px;
  box-shadow: none;
  transition:
    border-color var(--motion-fast),
    box-shadow var(--motion-fast),
    transform var(--motion-fast);
}

.media-card--row {
  width: 100%;
}

.media-card__progress {
  position: absolute;
  right: 8px;
  bottom: 8px;
  left: 8px;
  height: 4px;
  overflow: hidden;
  background: rgb(255 255 255 / 24%);
  border-radius: 999px;
}

.media-card__progress i {
  display: block;
  height: 100%;
  background: var(--color-signal);
  border-radius: inherit;
}

.media-card__played {
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-grid;
  width: 24px;
  height: 24px;
  place-items: center;
  color: #061015;
  background: var(--color-signal);
  border: 1px solid rgb(255 255 255 / 42%);
  border-radius: 999px;
  box-shadow: 0 8px 20px rgb(0 0 0 / 28%);
}

.media-card__poster img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-card__body {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 0 2px 4px;
}

.media-card__name {
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-text);
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1.28;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.media-card__meta {
  overflow: hidden;
  color: var(--color-muted);
  font-size: 0.78rem;
  line-height: 1.28;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-card--active .media-card__poster {
  border-color: var(--color-signal);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--color-signal) 28%, transparent),
    var(--elevation-3);
}

.empty-state {
  display: grid;
  min-height: 260px;
  place-items: center;
  align-content: center;
  gap: 12px;
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-panel) 82%, transparent);
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 10px;
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
  background: var(--color-signal);
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

  .media-grid {
    grid-template-columns: repeat(auto-fill, minmax(126px, 1fr));
    gap: 16px 12px;
  }

  .media-card__name {
    font-size: 0.84rem;
  }
}
</style>
