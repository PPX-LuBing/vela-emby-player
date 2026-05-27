<script setup lang="ts">
import { computed } from 'vue'
import { Check, Film, Music2, Trash2, Tv } from 'lucide-vue-next'
import type { EmbyItem } from '../composables/useEmbyClient'
import { isMusicItem, isTvItem, progressPercent } from '../composables/mediaItemDisplay'

type PlaybackHistoryCardMode = 'progress' | 'record'

const props = defineProps<{
  item: EmbyItem
  selected: boolean
  mode: PlaybackHistoryCardMode
  isBusy: boolean
  meta: string
  resumePosition?: string
  getImageUrl: (item: EmbyItem, width?: number) => string
}>()

const emit = defineEmits<{
  clear: [item: EmbyItem, mode: PlaybackHistoryCardMode]
  selectItem: [item: EmbyItem]
}>()

const imageUrl = computed(() => props.getImageUrl(props.item, 240))
const isProgressCard = computed(() => props.mode === 'progress')
const clearLabel = computed(() => props.mode === 'progress' ? '清除进度' : '清除记录')
</script>

<template>
  <VCard
    class="history-card"
    :class="{ 'history-card--active': selected }"
    variant="flat"
  >
    <button class="history-card__main" type="button" @click="emit('selectItem', item)">
      <span class="history-card__poster">
        <img
          v-if="imageUrl"
          class="history-card__image"
          :src="imageUrl"
          :alt="item.Name"
          width="240"
          height="150"
          loading="lazy"
        />
        <Tv v-else-if="isTvItem(item)" :size="25" />
        <Music2 v-else-if="isMusicItem(item)" :size="25" />
        <Film v-else :size="25" />
        <span v-if="mode === 'record'" class="history-card__played"><Check :size="13" /></span>
      </span>

      <span class="history-card__body">
        <span class="history-card__title">{{ item.Name }}</span>
        <span class="history-card__meta">{{ meta }}</span>
        <template v-if="isProgressCard">
          <span class="history-card__progress-label">继续于 {{ resumePosition }}</span>
          <span class="history-card__progress"><i class="history-card__progress-fill" :style="{ width: `${progressPercent(item)}%` }"></i></span>
        </template>
      </span>
    </button>

    <div class="history-card__actions">
      <VBtn size="small" variant="tonal" type="button" :loading="isBusy" @click="emit('clear', item, mode)">
        <template #prepend>
          <Trash2 :size="15" />
        </template>
        {{ clearLabel }}
      </VBtn>
    </div>
  </VCard>
</template>
