<script setup lang="ts">
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import { ArrowLeft, ChevronLeft, ChevronRight, Film, Play, Star, Tv, Video } from 'lucide-vue-next'
import type { EmbyItem } from '../composables/useEmbyClient'

const props = defineProps<{
  item: Readonly<EmbyItem | null>
  seasons: readonly EmbyItem[]
  episodes: readonly EmbyItem[]
  isBusy: boolean
  getImageUrl: (item: EmbyItem, width?: number) => string
  getBackdropUrl: (item: EmbyItem, width?: number) => string
}>()

const emit = defineEmits<{
  back: []
  play: [item?: EmbyItem]
}>()

const activeSeasonKey = shallowRef('')
const episodeRailRef = useTemplateRef<HTMLElement>('episodeRail')
const isDraggingEpisodes = shallowRef(false)
const dragStartX = shallowRef(0)
const dragStartScrollLeft = shallowRef(0)
const hasDraggedEpisodes = shallowRef(false)
const blockNextEpisodeClick = shallowRef(false)

const seasonGroups = computed(() => {
  const seasonMap = new Map<string, { key: string; season: EmbyItem; episodes: EmbyItem[] }>()

  for (const season of props.seasons) {
    const key = getSeasonKey(season)
    seasonMap.set(key, {
      key,
      season,
      episodes: [],
    })
  }

  for (const episode of props.episodes) {
    const key = getEpisodeSeasonKey(episode)
    const existing = seasonMap.get(key)
    if (existing) {
      existing.episodes.push(episode)
      continue
    }

    const fallbackSeason = createFallbackSeason(episode)
    seasonMap.set(key, {
      key,
      season: fallbackSeason,
      episodes: [episode],
    })
  }

  return [...seasonMap.values()]
    .map((group) => ({
      ...group,
      episodes: [...group.episodes].sort(compareEpisodes),
    }))
    .sort((first, second) => compareSeasons(first.season, second.season))
})

const activeSeasonGroup = computed(() => {
  return (
    seasonGroups.value.find((group) => group.key === activeSeasonKey.value) ??
    seasonGroups.value.find((group) => group.episodes.length > 0) ??
    seasonGroups.value[0] ??
    null
  )
})

const playableItem = computed(() => {
  if (!props.item) {
    return null
  }

  if (props.item.Type === 'Series') {
    return activeSeasonGroup.value?.episodes[0] ?? props.episodes[0] ?? null
  }

  return props.item
})

const itemKind = computed(() => {
  if (props.item?.Type === 'Series') {
    return 'Series'
  }

  return props.item?.Type === 'Episode' ? 'Episode' : 'Movie'
})

watch(
  seasonGroups,
  (groups) => {
    if (!groups.length) {
      activeSeasonKey.value = ''
      return
    }

    if (!groups.some((group) => group.key === activeSeasonKey.value)) {
      activeSeasonKey.value = groups.find((group) => group.episodes.length > 0)?.key ?? groups[0].key
    }
  },
  { immediate: true },
)

function formatRuntime(item: EmbyItem) {
  return item.RunTimeTicks ? `${Math.round(item.RunTimeTicks / 600_000_000)} 分钟` : ''
}

function formatEpisode(item: EmbyItem) {
  if (item.Type !== 'Episode' && item.Type !== 'Series') {
    return ''
  }

  const season = item.ParentIndexNumber ? `S${String(item.ParentIndexNumber).padStart(2, '0')}` : ''
  const episode = item.IndexNumber ? `E${String(item.IndexNumber).padStart(2, '0')}` : ''
  return [item.SeriesName, `${season}${episode}`].filter(Boolean).join(' · ')
}

function formatSeriesCount(item: EmbyItem) {
  const count = item.RecursiveItemCount ?? item.ChildCount ?? item.UserData?.UnplayedItemCount
  return count ? `${count} 集` : ''
}

function formatSeasonTitle(season: EmbyItem) {
  const seasonNumber = getSeasonNumber(season)
  if (seasonNumber === 0) {
    return '特别篇 / 剧场版'
  }

  if (season.Name && !/^season\s+\d+$/i.test(season.Name)) {
    return season.Name
  }

  return `第 ${seasonNumber} 季`
}

function formatSeasonMeta(group: { episodes: EmbyItem[] }) {
  return `${group.episodes.length} 集`
}

function getSeasonKey(season: EmbyItem) {
  return season.Id || `season-index:${getSeasonNumber(season)}`
}

function getEpisodeSeasonKey(episode: EmbyItem) {
  return episode.SeasonId || `season-index:${episode.ParentIndexNumber ?? 0}`
}

function getSeasonNumber(season: EmbyItem) {
  return season.IndexNumber ?? season.ParentIndexNumber ?? 0
}

function createFallbackSeason(episode: EmbyItem): EmbyItem {
  const seasonNumber = episode.ParentIndexNumber ?? 0
  return {
    Id: getEpisodeSeasonKey(episode),
    Name: episode.SeasonName || (seasonNumber === 0 ? '特别篇 / 剧场版' : `第 ${seasonNumber} 季`),
    Type: 'Season',
    IndexNumber: seasonNumber,
    ParentIndexNumber: seasonNumber,
  }
}

function compareSeasons(first: EmbyItem, second: EmbyItem) {
  const firstSeason = getSeasonNumber(first)
  const secondSeason = getSeasonNumber(second)
  if (firstSeason !== secondSeason) {
    return firstSeason - secondSeason
  }

  return first.Name.localeCompare(second.Name)
}

function compareEpisodes(first: EmbyItem, second: EmbyItem) {
  const firstEpisode = first.IndexNumber ?? 0
  const secondEpisode = second.IndexNumber ?? 0
  if (firstEpisode !== secondEpisode) {
    return firstEpisode - secondEpisode
  }

  return first.Name.localeCompare(second.Name)
}

function playSelected() {
  if (playableItem.value) {
    emit('play', playableItem.value)
  }
}

function scrollHorizontal(event: WheelEvent) {
  const target = event.currentTarget
  if (!(target instanceof HTMLElement) || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    return
  }

  event.preventDefault()
  target.scrollLeft += event.deltaY
}

function scrollEpisodeRail(direction: 'previous' | 'next') {
  const rail = episodeRailRef.value
  if (!rail) {
    return
  }

  const distance = Math.max(220, Math.round(rail.clientWidth * 0.72))
  rail.scrollBy({
    left: direction === 'next' ? distance : -distance,
    behavior: 'smooth',
  })
}

function startEpisodeDrag(event: PointerEvent) {
  const rail = episodeRailRef.value
  if (!rail || event.button !== 0) {
    return
  }

  isDraggingEpisodes.value = true
  hasDraggedEpisodes.value = false
  dragStartX.value = event.clientX
  dragStartScrollLeft.value = rail.scrollLeft
}

function moveEpisodeDrag(event: PointerEvent) {
  const rail = episodeRailRef.value
  if (!rail || !isDraggingEpisodes.value) {
    return
  }

  const deltaX = event.clientX - dragStartX.value
  if (Math.abs(deltaX) > 5) {
    hasDraggedEpisodes.value = true
  }

  rail.scrollLeft = dragStartScrollLeft.value - deltaX
}

function endEpisodeDrag(event: PointerEvent) {
  const rail = episodeRailRef.value
  if (!rail || !isDraggingEpisodes.value) {
    return
  }

  if (hasDraggedEpisodes.value) {
    blockNextEpisodeClick.value = true
    window.setTimeout(() => {
      blockNextEpisodeClick.value = false
    }, 0)
  }

  hasDraggedEpisodes.value = false
  isDraggingEpisodes.value = false
}

function playEpisode(episode: EmbyItem) {
  if (blockNextEpisodeClick.value) {
    return
  }

  emit('play', episode)
}
</script>

<template>
  <section v-if="item" class="detail-view">
    <div
      class="detail-hero"
      :style="{
        backgroundImage: getBackdropUrl(item)
          ? `linear-gradient(90deg, rgb(16 21 28 / 96%) 0%, rgb(16 21 28 / 88%) 62%, rgb(16 21 28 / 58%) 100%), url(${getBackdropUrl(item, 1800)})`
          : 'linear-gradient(135deg, #111b28, #0a0e14)',
      }"
    >
      <VBtn class="detail-back" variant="tonal" type="button" @click="emit('back')">
        <template #prepend>
          <ArrowLeft :size="18" />
        </template>
        返回媒体库
      </VBtn>

      <div class="detail-hero__content">
        <div class="detail-poster">
          <img v-if="getImageUrl(item)" :src="getImageUrl(item, 520)" :alt="item.Name" />
          <Tv v-else-if="item.Type === 'Series'" :size="42" />
          <Film v-else :size="42" />
        </div>

        <div class="detail-copy">
          <p class="section-kicker">{{ itemKind }}</p>
          <h2 class="detail-title">{{ item.Name }}</h2>
          <p v-if="formatEpisode(item)" class="detail-series">{{ formatEpisode(item) }}</p>
          <div class="detail-meta">
            <span v-if="item.ProductionYear">{{ item.ProductionYear }}</span>
            <span v-if="item.CommunityRating"><Star :size="14" /> {{ item.CommunityRating.toFixed(1) }}</span>
            <span v-if="formatRuntime(item)">{{ formatRuntime(item) }}</span>
            <span v-if="formatSeriesCount(item)">{{ formatSeriesCount(item) }}</span>
            <span v-for="genre in item.Genres?.slice(0, 3)" :key="genre">{{ genre }}</span>
          </div>
          <p v-if="item.Overview" class="detail-overview">{{ item.Overview }}</p>
          <VBtn
            class="detail-play"
            color="primary"
            type="button"
            :disabled="item.Type === 'Series' && !playableItem"
            @click="playSelected"
          >
            <template #prepend>
              <Play :size="19" />
            </template>
            {{ item.Type === 'Series' ? '播放第一集' : '播放' }}
          </VBtn>
        </div>
      </div>
    </div>

    <section v-if="item.Type === 'Series'" class="episode-section">
      <div class="episode-section__header">
        <div>
          <p class="section-kicker">Seasons</p>
          <h3 class="episode-section__title">分季与分集</h3>
        </div>
        <span>{{ isBusy ? '读取中' : `${episodes.length} 集` }}</span>
      </div>

      <div v-if="seasonGroups.length" class="season-tabs" aria-label="季列表">
        <VChip
          v-for="group in seasonGroups"
          :key="group.key"
          class="season-tabs__button"
          :color="activeSeasonGroup?.key === group.key ? 'primary' : undefined"
          :variant="activeSeasonGroup?.key === group.key ? 'flat' : 'tonal'"
          label
          @click="activeSeasonKey = group.key"
        >
          <Video v-if="getSeasonNumber(group.season) === 0" :size="16" />
          <Tv v-else :size="16" />
          <span>{{ formatSeasonTitle(group.season) }}</span>
          <small>{{ formatSeasonMeta(group) }}</small>
        </VChip>
      </div>

      <div v-if="activeSeasonGroup?.episodes.length" class="episode-rail-shell">
        <VBtn
          class="episode-rail-button episode-rail-button--previous"
          type="button"
          icon
          variant="tonal"
          aria-label="上一组分集"
          @click="scrollEpisodeRail('previous')"
        >
          <ChevronLeft :size="22" />
        </VBtn>

        <div
          ref="episodeRail"
          class="episode-rail"
          :class="{ 'episode-rail--dragging': isDraggingEpisodes }"
          aria-label="当前季分集"
          @wheel="scrollHorizontal"
          @pointerdown="startEpisodeDrag"
          @pointermove="moveEpisodeDrag"
          @pointerup="endEpisodeDrag"
          @pointercancel="endEpisodeDrag"
        >
          <VCard
            v-for="episode in activeSeasonGroup.episodes"
            :key="episode.Id"
            class="episode-tile"
            tag="button"
            type="button"
            variant="flat"
            :data-episode-id="episode.Id"
            @click="playEpisode(episode)"
          >
            <span class="episode-tile__poster">
              <img
                v-if="getImageUrl(episode)"
                :src="getImageUrl(episode, 240)"
                :alt="episode.Name"
                loading="lazy"
              />
              <Film v-else :size="24" />
              <span class="episode-tile__play"><Play :size="16" /></span>
            </span>
            <span class="episode-tile__body">
              <span class="episode-tile__index">
                {{ episode.IndexNumber ? `第 ${episode.IndexNumber} 集` : 'Episode' }}
              </span>
              <span class="episode-tile__title">{{ episode.Name }}</span>
              <span class="episode-tile__meta">{{ formatRuntime(episode) || formatEpisode(episode) }}</span>
            </span>
          </VCard>
        </div>

        <VBtn
          class="episode-rail-button episode-rail-button--next"
          type="button"
          icon
          variant="tonal"
          aria-label="下一组分集"
          @click="scrollEpisodeRail('next')"
        >
          <ChevronRight :size="22" />
        </VBtn>
      </div>

      <VSheet v-else class="episode-empty">
        <Tv :size="26" />
        <span>{{ isBusy ? '正在读取分集' : '没有读取到分集' }}</span>
      </VSheet>
    </section>
  </section>

  <section v-else class="detail-empty">
    <Film :size="34" />
    <span>从媒体库选择一个条目查看详情</span>
  </section>
</template>

<style scoped>
.detail-view {
  display: grid;
  align-content: start;
  gap: 16px;
  min-height: 0;
  animation: surface-enter var(--motion-emphasized) both;
}

.detail-hero {
  display: grid;
  align-content: start;
  min-height: 0;
  padding: 18px;
  background-position: center;
  background-size: cover;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 8px;
  box-shadow: none;
}

.detail-back {
  justify-self: start;
  background: rgb(0 0 0 / 28%);
  border: 1px solid rgb(255 255 255 / 12%);
  backdrop-filter: blur(14px);
}

.detail-hero__content {
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  gap: 18px;
  align-items: end;
  margin-top: 18px;
}

.detail-poster {
  display: grid;
  aspect-ratio: 2 / 3;
  place-items: center;
  overflow: hidden;
  color: var(--color-muted);
  background: #111923;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 6px;
  box-shadow: var(--elevation-1);
}

.detail-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-copy {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  backdrop-filter: none;
}

.detail-title {
  overflow-wrap: anywhere;
  margin: 0;
  color: #ffffff;
  font-size: clamp(1.55rem, 3vw, 2.4rem);
  font-weight: 700;
  line-height: 1.12;
}

.detail-series,
.detail-overview {
  margin: 0;
}

.detail-series {
  color: #d8e8f7;
  font-size: 1rem;
  line-height: 1.45;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  color: #dcecf8;
  background: color-mix(in srgb, var(--color-secondary-container) 78%, transparent);
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  font-size: 0.82rem;
}

.detail-overview {
  max-width: 58rem;
  color: var(--color-muted);
  font-size: 0.9rem;
  line-height: 1.55;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.detail-play {
  justify-self: start;
  min-width: 136px;
}

.detail-play:disabled {
  cursor: default;
  opacity: 0.48;
}

.episode-section {
  display: grid;
  gap: 12px;
  padding: 16px;
  background: color-mix(in srgb, var(--color-panel) 78%, transparent);
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 8px;
}

.episode-section__header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}

.episode-section__title {
  margin: 0;
  color: var(--color-text);
  font-size: 1rem;
  font-weight: 650;
  line-height: 1.25;
}

.episode-section__header span {
  color: var(--color-muted);
  font-size: 0.82rem;
}

.season-tabs {
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

.season-tabs::-webkit-scrollbar {
  display: none;
}

.season-tabs__button {
  flex: 0 0 auto;
  gap: 7px;
  height: 38px;
  min-width: 0;
  border-radius: 8px;
  cursor: pointer;
}

.season-tabs__button span {
  max-width: 160px;
  overflow: hidden;
  color: inherit;
  font-size: 0.84rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.season-tabs__button small {
  color: color-mix(in srgb, currentColor 72%, transparent);
  font-size: 0.72rem;
}

.episode-rail-shell {
  position: relative;
  min-width: 0;
}

.episode-rail {
  display: flex;
  gap: 12px;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 46px 12px;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  cursor: grab;
  user-select: none;
  -webkit-overflow-scrolling: touch;
}

.episode-rail::-webkit-scrollbar {
  display: none;
}

.episode-rail--dragging {
  cursor: grabbing;
  scroll-snap-type: none;
}

.episode-rail-button {
  position: absolute;
  top: 43px;
  z-index: 4;
  width: 38px;
  height: 38px;
  background: rgb(5 8 12 / 76%);
  border: 1px solid rgb(255 255 255 / 16%);
  box-shadow: 0 12px 30px rgb(0 0 0 / 34%);
  backdrop-filter: blur(16px);
}

.episode-rail-button:hover {
  background: color-mix(in srgb, var(--color-primary-container) 82%, black 8%);
  border-color: color-mix(in srgb, var(--color-signal) 58%, transparent);
}

.episode-rail-button--previous {
  left: 2px;
}

.episode-rail-button--next {
  right: 2px;
}

.episode-tile {
  display: grid;
  flex: 0 0 196px;
  gap: 9px;
  min-width: 0;
  padding: 8px;
  color: inherit;
  text-align: left;
  background: color-mix(in srgb, var(--color-secondary-container) 46%, transparent);
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 8px;
  cursor: pointer;
  scroll-snap-align: start;
}

.episode-tile__poster {
  position: relative;
  display: grid;
  aspect-ratio: 16 / 9;
  place-items: center;
  overflow: hidden;
  color: var(--color-muted);
  background: #111923;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  box-shadow: var(--elevation-1);
}

.episode-tile__poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--motion-medium);
}

.episode-tile__poster::after {
  position: absolute;
  inset: 0;
  content: '';
  background: linear-gradient(180deg, transparent 42%, rgb(0 0 0 / 50%) 100%);
  opacity: 0;
  transition: opacity var(--motion-fast);
}

.episode-tile__play {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 1;
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  color: #ffffff;
  background: rgb(0 0 0 / 46%);
  border: 1px solid rgb(255 255 255 / 20%);
  border-radius: 50%;
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity var(--motion-fast),
    transform var(--motion-fast);
  backdrop-filter: blur(14px);
}

.episode-tile:hover .episode-tile__poster {
  border-color: color-mix(in srgb, var(--color-signal) 64%, transparent);
  box-shadow: var(--elevation-2);
}

.episode-tile:hover .episode-tile__poster img {
  transform: scale(1.035);
}

.episode-tile:hover .episode-tile__poster::after,
.episode-tile:hover .episode-tile__play {
  opacity: 1;
  transform: translateY(0);
}

.episode-tile__body {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 0 2px 2px;
}

.episode-tile__index,
.episode-tile__title,
.episode-tile__meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.episode-tile__index {
  color: var(--color-signal);
  font-size: 0.76rem;
  font-weight: 700;
  line-height: 1.25;
}

.episode-tile__title {
  display: -webkit-box;
  color: var(--color-text);
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.28;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.episode-tile__meta {
  color: var(--color-muted);
  font-size: 0.76rem;
  line-height: 1.25;
}

.episode-empty {
  display: grid;
  min-height: 150px;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-panel) 86%, transparent);
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 8px;
}

.detail-empty {
  display: grid;
  min-height: calc(100vh - 56px);
  place-items: center;
  align-content: center;
  gap: 12px;
  color: var(--color-muted);
}

@media (max-width: 820px) {
  .detail-hero {
    min-height: auto;
    padding: 18px;
  }

  .detail-hero__content {
    grid-template-columns: 132px minmax(0, 1fr);
    gap: 16px;
    margin-top: 18px;
  }

  .detail-title {
    font-size: 1.6rem;
  }

  .episode-tile {
    flex-basis: 152px;
  }

  .episode-rail {
    padding-right: 42px;
    padding-left: 42px;
  }
}

@media (max-width: 560px) {
  .detail-hero__content {
    grid-template-columns: 104px minmax(0, 1fr);
    gap: 16px;
  }

  .detail-copy {
    padding: 16px;
    border-radius: 8px;
  }

  .detail-title {
    font-size: 1.38rem;
    line-height: 1.14;
  }

  .detail-overview {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 5;
    font-size: 0.9rem;
  }

  .episode-section__header {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .season-tabs__button span {
    max-width: 120px;
  }

  .episode-tile {
    flex-basis: 142px;
  }
}
</style>
