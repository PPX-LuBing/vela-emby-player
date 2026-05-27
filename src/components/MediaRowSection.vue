<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { EmbyItem } from '../composables/useEmbyClient'
import LibraryMediaCard from './LibraryMediaCard.vue'

interface MediaProgramRow {
  id: string
  name: string
  time: string
}

const props = withDefaults(defineProps<{
  title: string
  countLabel: string
  items: readonly EmbyItem[]
  selectedItemId?: string
  getImageUrl: (item: EmbyItem, width?: number) => string
  getMeta: (item: EmbyItem) => string
  getCurrentProgramName?: (item: EmbyItem) => string
  getProgramRows?: (item: EmbyItem) => readonly MediaProgramRow[]
  showLiveBadge?: boolean
  showStatus?: boolean
}>(), {
  getCurrentProgramName: undefined,
  getProgramRows: undefined,
  selectedItemId: '',
  showLiveBadge: false,
  showStatus: true,
})

const emit = defineEmits<{
  selectItem: [item: EmbyItem]
}>()

const mediaRowRef = useTemplateRef<HTMLElement>('mediaRow')

function scrollMediaRow(direction: 'previous' | 'next') {
  const row = mediaRowRef.value
  if (!row) {
    return
  }

  const distance = Math.max(220, Math.round(row.clientWidth * 0.78))
  row.scrollBy({
    left: direction === 'next' ? distance : -distance,
    behavior: 'smooth',
  })
}

function scrollHorizontalArea(event: WheelEvent) {
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) {
    return
  }

  const horizontalDelta = Math.abs(event.deltaX)
  const verticalDelta = Math.abs(event.deltaY)
  const shouldScrollHorizontally = horizontalDelta > verticalDelta || event.shiftKey
  if (!shouldScrollHorizontally) {
    return
  }

  const delta = event.shiftKey && verticalDelta > horizontalDelta ? event.deltaY : event.deltaX
  if (delta === 0 || target.scrollWidth <= target.clientWidth) {
    return
  }

  const maxScrollLeft = target.scrollWidth - target.clientWidth
  const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, target.scrollLeft + delta))
  if (nextScrollLeft === target.scrollLeft) {
    return
  }

  event.preventDefault()
  target.scrollLeft = nextScrollLeft
}

function currentProgramName(item: EmbyItem) {
  return props.getCurrentProgramName?.(item) ?? ''
}

function programRows(item: EmbyItem) {
  return props.getProgramRows?.(item) ?? []
}
</script>

<template>
  <section class="media-row-section">
    <div class="shelf-heading">
      <div>
        <h3 class="shelf-heading__title">{{ title }}</h3>
      </div>
      <span>{{ countLabel }}</span>
    </div>

    <div class="media-row-shell">
      <VBtn
        class="media-row-button media-row-button--previous"
        type="button"
        icon
        variant="tonal"
        :aria-label="`上一组${title}`"
        @click="scrollMediaRow('previous')"
      >
        <ChevronLeft :size="22" />
      </VBtn>

      <div ref="mediaRow" class="media-row" @wheel="scrollHorizontalArea">
        <LibraryMediaCard
          v-for="item in items"
          :key="item.Id"
          row
          :item="item"
          :selected="selectedItemId === item.Id"
          :meta="getMeta(item)"
          :get-image-url="getImageUrl"
          :current-program-name="currentProgramName(item)"
          :program-rows="programRows(item)"
          :show-live-badge="showLiveBadge"
          :show-status="showStatus"
          @select-item="emit('selectItem', $event)"
        />
      </div>

      <VBtn
        class="media-row-button media-row-button--next"
        type="button"
        icon
        variant="tonal"
        :aria-label="`下一组${title}`"
        @click="scrollMediaRow('next')"
      >
        <ChevronRight :size="22" />
      </VBtn>
    </div>
  </section>
</template>

<style scoped>
.media-row-section {
  display: grid;
  gap: 12px;
  min-width: 0;
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

.media-row-shell {
  position: relative;
  min-width: 0;
}

.media-row {
  display: grid;
  grid-auto-columns: clamp(140px, 14vw, 184px);
  grid-auto-flow: column;
  gap: 14px;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 46px 14px;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.media-row::-webkit-scrollbar {
  display: none;
}

.media-row-button {
  position: absolute;
  top: 40%;
  z-index: 4;
  width: 38px;
  height: 38px;
  transform: translateY(-50%);
}

.media-row-button--previous {
  left: 2px;
}

.media-row-button--next {
  right: 2px;
}

@media (max-width: 720px) {
  .media-row-button {
    display: none;
  }

  .media-row {
    padding-right: 2px;
    padding-left: 2px;
  }
}
</style>
