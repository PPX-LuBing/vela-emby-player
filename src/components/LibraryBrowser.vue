<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Clapperboard, Film, Library, Search, Tv } from 'lucide-vue-next'
import type { EmbyItem, EmbyLibrary } from '../composables/useEmbyClient'

const props = defineProps<{
  libraries: readonly EmbyLibrary[]
  items: readonly EmbyItem[]
  selectedItem: Readonly<EmbyItem | null>
  isBusy: boolean
  getImageUrl: (item: EmbyItem, width?: number) => string
}>()

const emit = defineEmits<{
  selectLibrary: [library: EmbyLibrary]
  selectItem: [item: EmbyItem]
}>()

const activeLibraryId = shallowRef('')
const query = shallowRef('')

const filteredItems = computed(() => {
  const normalizedQuery = query.value.trim().toLowerCase()
  if (!normalizedQuery) {
    return props.items
  }

  return props.items.filter((item) => {
    const haystack = [item.Name, item.SeriesName, item.ProductionYear]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(normalizedQuery)
  })
})

function selectLibrary(library: EmbyLibrary) {
  activeLibraryId.value = library.Id
  emit('selectLibrary', library)
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
      <span>{{ filteredItems.length }} 项</span>
    </div>

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
        </span>
        <span class="media-card__body">
          <span class="media-card__name">{{ item.Name }}</span>
          <span class="media-card__meta">{{ formatMeta(item) }}</span>
        </span>
      </VCard>
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

.library-browser__search {
  width: min(360px, 100%);
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

  .media-grid {
    grid-template-columns: repeat(auto-fill, minmax(126px, 1fr));
    gap: 16px 12px;
  }

  .media-card__name {
    font-size: 0.84rem;
  }
}
</style>
