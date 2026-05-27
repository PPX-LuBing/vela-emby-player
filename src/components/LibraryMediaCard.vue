<script setup lang="ts">
import { computed } from 'vue'
import { Check, Film, ListVideo, Music2, RadioTower, Tv } from 'lucide-vue-next'
import type { EmbyItem } from '../composables/useEmbyClient'
import {
  hasPlaybackProgress,
  isItemCollection,
  isLiveTvItem,
  isMusicItem,
  isPlayed,
  isTvItem,
  progressPercent,
} from '../composables/mediaItemDisplay'

interface MediaProgramRow {
  id: string
  name: string
  time: string
}

const props = withDefaults(defineProps<{
  item: EmbyItem
  selected: boolean
  meta: string
  getImageUrl: (item: EmbyItem, width?: number) => string
  currentProgramName?: string
  programRows?: readonly MediaProgramRow[]
  posterVariant?: 'poster' | 'channel'
  row?: boolean
  showLiveBadge?: boolean
  showStatus?: boolean
}>(), {
  currentProgramName: '',
  posterVariant: 'poster',
  programRows: () => [],
  row: false,
  showLiveBadge: false,
  showStatus: true,
})

const emit = defineEmits<{
  selectItem: [item: EmbyItem]
}>()

const imageUrl = computed(() => props.getImageUrl(props.item, 360))
const imageHeight = computed(() => props.posterVariant === 'channel' ? 225 : 540)
const isChannelPoster = computed(() => props.posterVariant === 'channel')
</script>

<template>
  <VCard
    class="media-card"
    :class="{
      'media-card--active': selected,
      'media-card--channel': isChannelPoster,
      'media-card--row': row,
    }"
    tag="button"
    type="button"
    variant="flat"
    @click="emit('selectItem', item)"
  >
    <span class="media-card__poster" :class="{ 'media-card__poster--channel': isChannelPoster }">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="item.Name"
        width="360"
        :height="imageHeight"
        loading="lazy"
      />
      <RadioTower v-else-if="isLiveTvItem(item)" :size="34" />
      <ListVideo v-else-if="isItemCollection(item)" :size="34" />
      <Tv v-else-if="isTvItem(item)" :size="34" />
      <Music2 v-else-if="isMusicItem(item)" :size="34" />
      <Film v-else :size="34" />

      <span v-if="showLiveBadge" class="media-card__live">直播</span>
      <template v-if="showStatus">
        <span v-if="isPlayed(item)" class="media-card__played" title="已观看">
          <Check :size="13" />
        </span>
        <span v-else-if="hasPlaybackProgress(item)" class="media-card__progress">
          <i :style="{ width: `${progressPercent(item)}%` }"></i>
        </span>
      </template>
    </span>

    <span class="media-card__body">
      <span class="media-card__name">{{ item.Name }}</span>
      <span class="media-card__meta">{{ meta }}</span>
      <span v-if="currentProgramName" class="media-card__program">
        正在播：{{ currentProgramName }}
      </span>
      <span v-if="programRows.length" class="media-card__guide">
        <span
          v-for="program in programRows"
          :key="program.id"
          class="media-card__guide-row"
        >
          <strong>{{ program.time }}</strong>
          <em>{{ program.name }}</em>
        </span>
      </span>
    </span>
  </VCard>
</template>

<style scoped>
.media-card {
  display: grid;
  gap: 9px;
  min-width: 0;
  padding: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.media-card :deep(.v-card__overlay) {
  border-radius: inherit;
}

.media-card svg {
  display: block;
  flex: 0 0 auto;
}

.media-card--row {
  width: 100%;
}

.media-card__poster {
  position: relative;
  display: grid;
  aspect-ratio: 2 / 3;
  place-items: center;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.68);
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.media-card__poster::after {
  position: absolute;
  inset: 0;
  content: '';
  border: 2px solid transparent;
  pointer-events: none;
}

.media-card--channel .media-card__poster,
.media-card__poster--channel {
  aspect-ratio: 16 / 10;
}

.media-card__poster img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-card__progress {
  position: absolute;
  right: 8px;
  bottom: 8px;
  left: 8px;
  height: 4px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.24);
}

.media-card__progress i {
  display: block;
  height: 100%;
  background: rgb(var(--v-theme-primary));
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
  color: rgb(var(--v-theme-on-primary));
  background: rgb(var(--v-theme-primary));
}

.media-card__live {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  color: rgb(var(--v-theme-on-primary));
  background: rgb(var(--v-theme-primary));
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.04em;
}

.media-card__body {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 0 4px 2px;
}

.media-card__name {
  display: block;
  overflow-wrap: anywhere;
  font-size: 0.92rem;
  font-weight: 500;
  line-height: 1.28;
}

.media-card__meta {
  overflow-wrap: anywhere;
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 0.8rem;
  line-height: 1.28;
}

.media-card__program,
.media-card__guide {
  display: block;
  overflow-wrap: anywhere;
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 0.76rem;
  line-height: 1.35;
}

.media-card__program {
  color: rgb(var(--v-theme-primary));
  font-weight: 500;
}

.media-card__guide {
  display: grid;
  gap: 4px;
  margin-top: 2px;
}

.media-card__guide-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 7px;
  min-width: 0;
}

.media-card__guide-row strong {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.74rem;
  font-weight: 500;
}

.media-card__guide-row em {
  min-width: 0;
  overflow-wrap: anywhere;
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-style: normal;
}

.media-card--active .media-card__poster {
  box-shadow: 0 0 0 1px rgba(var(--v-theme-primary), 0.24);
}

.media-card--active .media-card__poster::after {
  border-color: rgb(var(--v-theme-primary));
}

@media (max-width: 720px) {
  .media-card__name {
    font-size: 0.88rem;
  }
}
</style>
