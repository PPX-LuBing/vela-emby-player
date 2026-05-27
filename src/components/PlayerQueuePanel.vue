<script setup lang="ts">
import { computed } from 'vue'
import { Trash2, X } from 'lucide-vue-next'
import type { EmbyItem } from '../composables/useEmbyClient'
import { formatQueueItemTitle } from '../composables/mediaItemDisplay'
import { formatPlaybackMode, type PlaybackMode } from '../composables/usePlaybackQueue'

const props = defineProps<{
  items: readonly EmbyItem[]
  activeItemId: string
  playbackMode: PlaybackMode
}>()

const emit = defineEmits<{
  clear: []
  close: []
  remove: [itemId: string]
  select: [item: EmbyItem]
}>()

const playbackModeLabel = computed(() => formatPlaybackMode(props.playbackMode))
const queueItems = computed(() => props.items.map((item) => ({
  item,
  title: formatQueueItemTitle(item),
  isActive: item.Id === props.activeItemId,
})))
</script>

<template>
  <div class="player-queue">
    <div class="player-queue__header">
      <div class="player-queue__title">
        <strong>播放队列</strong>
        <span>{{ items.length }} 项 · {{ playbackModeLabel }}</span>
      </div>
      <div class="player-queue__actions">
        <VBtn size="small" variant="tonal" type="button" :disabled="!items.length" @click="emit('clear')">
          清空
        </VBtn>
        <VBtn size="small" icon variant="tonal" type="button" aria-label="关闭播放队列" @click="emit('close')">
          <X :size="16" />
        </VBtn>
      </div>
    </div>

    <VSheet v-if="!items.length" class="player-queue__empty">
      队列为空，可以在详情页加入媒体。
    </VSheet>

    <div v-else class="player-queue__list">
      <VCard
        v-for="row in queueItems"
        :key="row.item.Id"
        class="player-queue__item"
        :class="{ 'player-queue__item--active': row.isActive }"
        variant="flat"
      >
        <button type="button" @click="emit('select', row.item)">
          <span>{{ row.title }}</span>
          <small>{{ row.item.Type }}</small>
        </button>
        <VBtn
          icon
          size="small"
          variant="text"
          type="button"
          :aria-label="`移除 ${row.title}`"
          :disabled="row.isActive"
          @click="emit('remove', row.item.Id)"
        >
          <Trash2 :size="15" />
        </VBtn>
      </VCard>
    </div>
  </div>
</template>

<style scoped>
.player-queue {
  position: absolute;
  top: 74px;
  right: 18px;
  z-index: 7;
  display: grid;
  width: min(480px, calc(100% - 36px));
  max-height: calc(100% - 220px);
  gap: 12px;
  padding: 14px;
  overflow: auto;
  background: rgb(var(--v-theme-surface));
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.player-queue__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.player-queue__title {
  display: grid;
  gap: 3px;
}

.player-queue__title strong {
  font-size: 1rem;
  line-height: 1.25;
}

.player-queue__title span,
.player-queue__empty {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.78rem;
}

.player-queue__actions {
  display: inline-flex;
  gap: 8px;
}

.player-queue__empty {
  padding: 14px;
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.player-queue__list {
  display: grid;
  gap: 8px;
}

.player-queue__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.player-queue__item--active {
  border-color: rgb(var(--v-theme-primary));
}

.player-queue__item button {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.player-queue__item span,
.player-queue__item small {
  min-width: 0;
  overflow-wrap: anywhere;
}

.player-queue__item span {
  font-size: 0.84rem;
  font-weight: 500;
  line-height: 1.25;
}

.player-queue__item small {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.72rem;
}

@media (max-width: 720px) {
  .player-queue {
    top: 68px;
    right: 12px;
    left: 12px;
    width: auto;
    max-height: calc(100% - 240px);
  }
}
</style>
