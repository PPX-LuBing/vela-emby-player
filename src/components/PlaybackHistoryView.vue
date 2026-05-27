<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Check, Clock3, PlayCircle } from 'lucide-vue-next'
import type { EmbyItem } from '../composables/useEmbyClient'
import {
  formatPlaybackTime,
  formatRuntimeMinutes,
  hasPlaybackProgress,
  isMusicItem,
  isPlayed,
  isTvItem,
  progressPercent,
  ticksToSeconds,
} from '../composables/mediaItemDisplay'
import PlaybackHistoryCard from './PlaybackHistoryCard.vue'

type PlaybackHistoryFilter = 'all' | 'movie' | 'episode' | 'music'

const filterOptions: { label: string; value: PlaybackHistoryFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '电影', value: 'movie' },
  { label: '剧集', value: 'episode' },
  { label: '音乐', value: 'music' },
]

const props = defineProps<{
  resumeItems: readonly EmbyItem[]
  resumeItemsTotalCount: number
  resumeItemsCanLoadMore: boolean
  playedItems: readonly EmbyItem[]
  playedItemsTotalCount: number
  playedItemsCanLoadMore: boolean
  selectedItem: EmbyItem | null
  isBusy: boolean
  getImageUrl: (item: EmbyItem, width?: number) => string
}>()

const emit = defineEmits<{
  clearPlaybackProgress: [item: EmbyItem]
  loadMorePlayed: []
  loadMoreResume: []
  selectItem: [item: EmbyItem]
}>()

const activeFilter = shallowRef<PlaybackHistoryFilter>('all')
const pendingClearItem = shallowRef<EmbyItem | null>(null)
const pendingClearMode = shallowRef<'progress' | 'record'>('progress')

const resumeEntries = computed(() => props.resumeItems.filter(hasPlaybackProgress))
const playedEntries = computed(() => props.playedItems.filter(isPlayed))
const filteredResumeEntries = computed(() => resumeEntries.value.filter(matchesActiveFilter))
const filteredPlayedEntries = computed(() => playedEntries.value.filter(matchesActiveFilter))
const canLoadMoreResume = computed(() => props.resumeItemsCanLoadMore)
const canLoadMorePlayed = computed(() => props.playedItemsCanLoadMore)
const hasAnyHistory = computed(() => Boolean(resumeEntries.value.length || playedEntries.value.length))
const pendingClearTitle = computed(() => pendingClearMode.value === 'progress' ? '清除播放进度？' : '清除播放记录？')
const pendingClearDescription = computed(() => {
  const itemName = pendingClearItem.value?.Name ?? '该条目'
  return pendingClearMode.value === 'progress'
    ? `这会清除 ${itemName} 的继续观看进度。`
    : `这会清除 ${itemName} 的已播放记录。`
})

function openClearDialog(item: EmbyItem, mode: 'progress' | 'record') {
  pendingClearItem.value = item
  pendingClearMode.value = mode
}

function closeClearDialog() {
  pendingClearItem.value = null
}

function confirmClearPlaybackProgress() {
  const item = pendingClearItem.value
  if (!item) {
    return
  }

  emit('clearPlaybackProgress', item)
  closeClearDialog()
}

function matchesActiveFilter(item: EmbyItem) {
  if (activeFilter.value === 'movie') {
    return item.Type === 'Movie'
  }

  if (activeFilter.value === 'episode') {
    return isTvItem(item)
  }

  if (activeFilter.value === 'music') {
    return isMusicItem(item)
  }

  return true
}

function formatHistoryMeta(item: EmbyItem) {
  const parts = [formatKind(item), formatSeriesOrAlbum(item), formatRuntime(item), formatPlayedDate(item)]
  return parts.filter(Boolean).join(' · ')
}

function formatKind(item: EmbyItem) {
  if (item.Type === 'Episode') {
    return '分集'
  }

  if (item.Type === 'Audio') {
    return '曲目'
  }

  if (item.Type === 'MusicAlbum') {
    return '专辑'
  }

  if (item.Type === 'MusicArtist') {
    return '艺术家'
  }

  if (item.Type === 'Series') {
    return '剧集'
  }

  return '电影'
}

function formatSeriesOrAlbum(item: EmbyItem) {
  if (item.Type === 'Episode') {
    const season = item.ParentIndexNumber ? `S${String(item.ParentIndexNumber).padStart(2, '0')}` : ''
    const episode = item.IndexNumber ? `E${String(item.IndexNumber).padStart(2, '0')}` : ''
    return [item.SeriesName, `${season}${episode}`].filter(Boolean).join(' ')
  }

  if (item.Type === 'Audio') {
    const artist = item.AlbumArtist || item.AlbumArtists?.[0] || item.Artists?.[0]
    return [item.Album, artist].filter(Boolean).join(' · ')
  }

  return item.ProductionYear ? String(item.ProductionYear) : ''
}

function formatRuntime(item: EmbyItem) {
  return formatRuntimeMinutes(item.RunTimeTicks)
}

function formatPlayedDate(item: EmbyItem) {
  const date = item.UserData?.LastPlayedDate
  if (!date) {
    return ''
  }

  const timestamp = Date.parse(date)
  if (!Number.isFinite(timestamp)) {
    return ''
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function formatResumePosition(item: EmbyItem) {
  const position = ticksToSeconds(item.UserData?.PlaybackPositionTicks ?? 0)
  const runtime = ticksToSeconds(item.RunTimeTicks ?? 0)
  if (position <= 0) {
    return `${Math.round(progressPercent(item))}%`
  }

  return runtime > 0
    ? `${formatPlaybackTime(position)} / ${formatPlaybackTime(runtime)}`
    : formatPlaybackTime(position)
}

function countLabel(visibleCount: number, loadedCount: number, totalCount: number) {
  const total = totalCount || loadedCount
  return `${visibleCount} / ${total} 项`
}
</script>

<template>
  <section class="playback-history-view">
    <VSheet class="history-hero">
      <div>
        <p class="section-kicker">Playback</p>
        <h3 class="history-hero__title">播放历史</h3>
        <p class="history-hero__copy">集中查看继续观看和最近播放记录，也可以清除不需要保留的进度。</p>
      </div>
    </VSheet>

    <div class="history-filters" aria-label="播放历史类型筛选">
      <VChip
        v-for="option in filterOptions"
        :key="option.value"
        class="history-filters__chip"
        :color="activeFilter === option.value ? 'primary' : undefined"
        :variant="activeFilter === option.value ? 'flat' : 'tonal'"
        label
        @click="activeFilter = option.value"
      >
        {{ option.label }}
      </VChip>
    </div>

    <VSheet v-if="!hasAnyHistory" class="history-empty">
      <Clock3 :size="30" />
      <span>{{ isBusy ? '正在读取播放历史' : '还没有播放历史' }}</span>
    </VSheet>

    <template v-else>
      <section class="history-section">
        <div class="history-section__heading">
          <div>
            <p class="section-kicker">Resume</p>
            <h4 class="history-section__title">继续观看</h4>
          </div>
          <span class="history-section__count">{{ countLabel(filteredResumeEntries.length, resumeItems.length, resumeItemsTotalCount) }}</span>
        </div>

        <VSheet v-if="!filteredResumeEntries.length" class="history-empty history-empty--compact">
          <PlayCircle :size="28" />
          <span>当前筛选下没有可继续观看的条目</span>
        </VSheet>

        <div v-else class="history-list">
          <PlaybackHistoryCard
            v-for="item in filteredResumeEntries"
            :key="`resume-${item.Id}`"
            :item="item"
            :selected="selectedItem?.Id === item.Id"
            mode="progress"
            :is-busy="isBusy"
            :meta="formatHistoryMeta(item)"
            :resume-position="formatResumePosition(item)"
            :get-image-url="getImageUrl"
            @clear="openClearDialog"
            @select-item="emit('selectItem', $event)"
          />
        </div>

        <div v-if="canLoadMoreResume" class="history-load-more">
          <VBtn variant="tonal" type="button" :loading="isBusy" @click="emit('loadMoreResume')">
            加载更多继续观看
          </VBtn>
        </div>
      </section>

      <section class="history-section">
        <div class="history-section__heading">
          <div>
            <p class="section-kicker">Recently Played</p>
            <h4 class="history-section__title">最近播放</h4>
          </div>
          <span class="history-section__count">{{ countLabel(filteredPlayedEntries.length, playedItems.length, playedItemsTotalCount) }}</span>
        </div>

        <VSheet v-if="!filteredPlayedEntries.length" class="history-empty history-empty--compact">
          <Check :size="28" />
          <span>当前筛选下没有最近播放记录</span>
        </VSheet>

        <div v-else class="history-list">
          <PlaybackHistoryCard
            v-for="item in filteredPlayedEntries"
            :key="`played-${item.Id}`"
            :item="item"
            :selected="selectedItem?.Id === item.Id"
            mode="record"
            :is-busy="isBusy"
            :meta="formatHistoryMeta(item)"
            :get-image-url="getImageUrl"
            @clear="openClearDialog"
            @select-item="emit('selectItem', $event)"
          />
        </div>

        <div v-if="canLoadMorePlayed" class="history-load-more">
          <VBtn variant="tonal" type="button" :loading="isBusy" @click="emit('loadMorePlayed')">
            加载更多播放历史
          </VBtn>
        </div>
      </section>
    </template>

    <VDialog :model-value="Boolean(pendingClearItem)" max-width="440" @update:model-value="closeClearDialog">
      <VCard class="history-dialog" variant="flat">
        <h4 class="history-dialog__title">{{ pendingClearTitle }}</h4>
        <p class="history-dialog__copy">{{ pendingClearDescription }}</p>
        <div class="history-dialog__actions">
          <VBtn variant="tonal" type="button" @click="closeClearDialog">
            取消
          </VBtn>
          <VBtn color="error" type="button" :loading="isBusy" @click="confirmClearPlaybackProgress">
            确认清除
          </VBtn>
        </div>
      </VCard>
    </VDialog>
  </section>
</template>
