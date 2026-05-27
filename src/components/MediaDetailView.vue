<script setup lang="ts">
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Film, Heart, ListPlus, ListVideo, Music2, Play, RadioTower, Star, Tv, Video } from 'lucide-vue-next'
import type { EmbyItem } from '../composables/useEmbyClient'
import {
  formatPlaybackTime,
  formatRuntimeMinutes,
  getResumePositionSeconds,
  getResumePositionTicks,
  isItemCollection as isCollectionItem,
  isLiveTvItem as isLiveTvMediaItem,
  isMusicItem as isMusicMediaItem,
} from '../composables/mediaItemDisplay'
import MediaCredits from './MediaCredits.vue'
import MediaTechnicalInfo from './MediaTechnicalInfo.vue'
import RelatedMediaRail from './RelatedMediaRail.vue'

const props = defineProps<{
  item: Readonly<EmbyItem | null>
  seasons: readonly EmbyItem[]
  episodes: readonly EmbyItem[]
  similarItems: readonly EmbyItem[]
  isBusy: boolean
  getImageUrl: (item: EmbyItem, width?: number) => string
  getBackdropUrl: (item: EmbyItem, width?: number) => string
}>()

const emit = defineEmits<{
  back: []
  changeFavorite: [payload: { item: EmbyItem; isFavorite: boolean }]
  changePlayed: [payload: { item: EmbyItem; isPlayed: boolean }]
  addToQueue: [item?: EmbyItem]
  play: [item?: EmbyItem]
  selectItem: [item: EmbyItem]
  searchPerson: [name: string]
}>()

const activeSeasonKey = shallowRef('')
const showUnplayedOnly = shallowRef(false)
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

const activeSeasonEpisodes = computed(() => activeSeasonGroup.value?.episodes ?? [])

const nextEpisode = computed(() => {
  return allDetailItems.value
    .filter((episode) => !episode.UserData?.Played)
    .find(Boolean) ?? null
})

const resumeEpisode = computed(() => {
  return allDetailItems.value
    .find((episode) => getResumePositionTicks(episode) > 0) ?? null
})

const resumeItem = computed(() => {
  if (!props.item) {
    return null
  }

  if (props.item.Type === 'Series' || isMusicItem.value) {
    return resumeEpisode.value
  }

  return getResumePositionTicks(props.item) > 0 ? props.item : null
})

const playableItem = computed(() => {
  if (!props.item) {
    return null
  }

  if (props.item.Type === 'Series') {
    return resumeItem.value ?? nextEpisode.value ?? visibleDetailItems.value[0] ?? activeSeasonEpisodes.value[0] ?? allDetailItems.value[0] ?? null
  }

  if ((isMusicItem.value && props.item.Type !== 'Audio') || isItemCollection.value) {
    return resumeItem.value ?? nextEpisode.value ?? visibleDetailItems.value[0] ?? allDetailItems.value[0] ?? null
  }

  return props.item
})

const primaryPlayLabel = computed(() => {
  if (!props.item) {
    return '播放'
  }

  if (resumeItem.value) {
    return '继续播放'
  }

  if (props.item.Type === 'Series') {
    return nextEpisode.value ? '播放下一集' : '播放第一集'
  }

  if (props.item.Type === 'MusicArtist') {
    return '播放艺术家'
  }

  if (props.item.Type === 'MusicAlbum') {
    return '播放专辑'
  }

  if (props.item.Type === 'Playlist') {
    return '播放列表'
  }

  if (props.item.Type === 'BoxSet') {
    return '播放合集'
  }

  if (props.item.Type === 'Audio') {
    return '播放曲目'
  }

  if (isLiveTvItem.value) {
    return '观看直播'
  }

  return '播放'
})

const primaryPlayDescription = computed(() => {
  if (!playableItem.value) {
    return ''
  }

  if (resumeItem.value) {
    return `从 ${formatPlayableItem(resumeItem.value)} · ${formatPlaybackTime(getResumePositionSeconds(resumeItem.value))} 继续`
  }

  if (props.item?.Type === 'Series' || isMusicItem.value || isItemCollection.value) {
    return formatPlayableItem(playableItem.value)
  }

  return ''
})

const secondaryNextLabel = computed(() => {
  if (!resumeItem.value || !nextEpisode.value || nextEpisode.value.Id === resumeItem.value.Id) {
    return ''
  }

  if (props.item?.Type === 'Series' && !isMusicItem.value) {
    return '播放下一集'
  }

  if (isMusicItem.value) {
    return '播放下一首'
  }

  return ''
})

const itemKind = computed(() => {
  if (props.item?.Type === 'Series') {
    return '剧集'
  }

  if (props.item?.Type === 'Episode') {
    return '分集'
  }

  if (props.item?.Type === 'MusicAlbum') {
    return '专辑'
  }

  if (props.item?.Type === 'MusicArtist') {
    return '艺术家'
  }

  if (props.item?.Type === 'Audio') {
    return '曲目'
  }

  if (props.item?.Type === 'Playlist') {
    return '播放列表'
  }

  if (props.item?.Type === 'BoxSet') {
    return '合集'
  }

  if (props.item?.Type === 'TvChannel' || props.item?.Type === 'Channel') {
    return '电视直播'
  }

  return '电影'
})

const isFavorite = computed(() => Boolean(props.item?.UserData?.IsFavorite))
const isPlayed = computed(() => Boolean(props.item?.UserData?.Played))
const isMusicItem = computed(() => props.item ? isMusicMediaItem(props.item) : false)
const isLiveTvItem = computed(() => props.item ? isLiveTvMediaItem(props.item) : false)
const isItemCollection = computed(() => props.item ? isCollectionItem(props.item) : false)
const isDetailCollection = computed(() => props.item?.Type === 'Series' || isMusicItem.value || isItemCollection.value)
const backdropUrl = computed(() => props.item ? props.getBackdropUrl(props.item, 1800) : '')
const posterUrl = computed(() => props.item ? props.getImageUrl(props.item, 520) : '')
const heroStyle = computed(() => ({
  backgroundImage: backdropUrl.value ? `url(${backdropUrl.value})` : undefined,
}))

const allDetailItems = computed(() => [...props.episodes].sort(compareEpisodesBySeason))

const visibleDetailItems = computed(() => {
  const sourceItems = props.item?.Type === 'Series'
    ? activeSeasonEpisodes.value
    : allDetailItems.value

  if (!showUnplayedOnly.value) {
    return sourceItems
  }

  return sourceItems.filter((item) => !item.UserData?.Played)
})
const visibleDetailCards = computed(() => visibleDetailItems.value.map((detailItem) => ({
  item: detailItem,
  imageUrl: props.getImageUrl(detailItem, 240),
  indexLabel: formatDetailItemIndex(detailItem),
  metaLabel: formatRuntime(detailItem) || formatEpisode(detailItem),
})))

const collectionTitle = computed(() => {
  if (props.item?.Type === 'Series') {
    return '分季与分集'
  }

  if (props.item?.Type === 'Playlist') {
    return '播放列表条目'
  }

  if (props.item?.Type === 'BoxSet') {
    return '合集条目'
  }

  if (props.item?.Type === 'MusicAlbum') {
    return '专辑曲目'
  }

  if (props.item?.Type === 'MusicArtist') {
    return '艺术家曲目'
  }

  if (props.item?.Type === 'Audio') {
    return '相关曲目'
  }

  return '相关条目'
})

const collectionCountLabel = computed(() => {
  const count = visibleDetailItems.value.length
  if (isMusicItem.value) {
    return `${count} 首`
  }

  if (isItemCollection.value) {
    return `${count} 项`
  }

  return `${count} 集`
})

const unplayedFilterLabel = computed(() => (isMusicItem.value ? '仅看未播放' : '仅看未看'))

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
  return formatRuntimeMinutes(item.RunTimeTicks)
}

function formatEpisode(item: EmbyItem) {
  if (isLiveTvMediaItem(item)) {
    return [
      item.ChannelNumber || item.Number ? `频道 ${item.ChannelNumber || item.Number}` : '',
      item.CurrentProgram?.Name,
    ].filter(Boolean).join(' · ')
  }

  if (isMusicMediaItem(item)) {
    const artist = item.AlbumArtist || item.AlbumArtists?.[0] || item.Artists?.[0] || item.Album || ''
    const track = formatAudioTrackNumber(item)
    return [artist, track].filter(Boolean).join(' · ')
  }

  if (item.Type !== 'Episode' && item.Type !== 'Series') {
    return ''
  }

  const season = item.ParentIndexNumber ? `S${String(item.ParentIndexNumber).padStart(2, '0')}` : ''
  const episode = item.IndexNumber ? `E${String(item.IndexNumber).padStart(2, '0')}` : ''
  return [item.SeriesName, `${season}${episode}`].filter(Boolean).join(' · ')
}

function formatSeriesCount(item: EmbyItem) {
  if (isLiveTvMediaItem(item)) {
    return '直播'
  }

  const count = item.RecursiveItemCount ?? item.ChildCount ?? item.UserData?.UnplayedItemCount
  if (item.Type === 'MusicArtist') {
    return count ? `${count} 项` : ''
  }

  if (item.Type === 'MusicAlbum') {
    return count ? `${count} 首` : ''
  }

  if (isCollectionItem(item)) {
    return count ? `${count} 项` : ''
  }

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
  const unplayedCount = group.episodes.filter((episode) => !episode.UserData?.Played).length
  return unplayedCount > 0 ? `${group.episodes.length} 集 · ${unplayedCount} 未看` : `${group.episodes.length} 集`
}

function formatNextEpisode(item: EmbyItem) {
  if (item.Type === 'Audio') {
    const album = item.Album || item.AlbumArtist || item.AlbumArtists?.[0] || ''
    const track = formatAudioTrackNumber(item)
    return [album, track, getEpisodeDisplayName(item)].filter(Boolean).join(' · ')
  }

  const season = item.ParentIndexNumber ? `第 ${item.ParentIndexNumber} 季` : ''
  const episode = item.IndexNumber ? `第 ${item.IndexNumber} 集` : ''
  return [season, episode, getEpisodeDisplayName(item)].filter(Boolean).join(' · ')
}

function formatDetailItemIndex(item: EmbyItem) {
  if (item.Type === 'Audio') {
    return item.IndexNumber ? `第 ${item.IndexNumber} 首` : 'Track'
  }

  if (item.Type === 'Episode') {
    return item.IndexNumber ? `第 ${item.IndexNumber} 集` : 'Episode'
  }

  if (item.Type === 'Movie') {
    return 'Movie'
  }

  if (item.Type === 'MusicVideo') {
    return 'Music Video'
  }

  return item.Type
}

function formatDetailCollectionEmptyState() {
  if (props.isBusy) {
    if (isMusicItem.value) {
      return '正在读取曲目'
    }

    if (isItemCollection.value) {
      return '正在读取条目'
    }

    return '正在读取分集'
  }

  if (isMusicItem.value) {
    return '没有读取到曲目'
  }

  if (isItemCollection.value) {
    return '没有读取到条目'
  }

  return '没有读取到分集'
}

function formatPlayableItem(item: EmbyItem) {
  if (item.Type === 'Episode' || item.Type === 'Audio') {
    return formatNextEpisode(item)
  }

  return item.Name
}

function getEpisodeDisplayName(item: EmbyItem) {
  if ((item.Type !== 'Episode' && item.Type !== 'Audio') || !item.IndexNumber) {
    return item.Name
  }

  const normalizedName = normalizeEpisodeTitle(item.Name)
  const normalizedIndexTitle = normalizeEpisodeTitle(`第 ${item.IndexNumber} 集`)
  const normalizedEpisodeTitle = normalizeEpisodeTitle(`Episode ${item.IndexNumber}`)
  const normalizedTrackTitle = normalizeEpisodeTitle(`Track ${item.IndexNumber}`)
  const normalizedSongTitle = normalizeEpisodeTitle(`第 ${item.IndexNumber} 首`)
  if (
    normalizedName === normalizedIndexTitle ||
    normalizedName === normalizedEpisodeTitle ||
    normalizedName === normalizedTrackTitle ||
    normalizedName === normalizedSongTitle
  ) {
    return ''
  }

  return item.Name
}

function formatAudioTrackNumber(item: EmbyItem) {
  const disc = item.ParentIndexNumber ? `D${String(item.ParentIndexNumber).padStart(2, '0')}` : ''
  const track = item.IndexNumber ? `T${String(item.IndexNumber).padStart(2, '0')}` : ''
  return [disc, track].filter(Boolean).join('')
}

function normalizeEpisodeTitle(value: string) {
  return value.replace(/\s+/g, '').toLowerCase()
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
  const firstSeason = getSeasonSortNumber(first)
  const secondSeason = getSeasonSortNumber(second)
  if (firstSeason !== secondSeason) {
    return firstSeason - secondSeason
  }

  return first.Name.localeCompare(second.Name)
}

function getSeasonSortNumber(season: EmbyItem) {
  const seasonNumber = getSeasonNumber(season)
  return seasonNumber === 0 ? Number.MAX_SAFE_INTEGER : seasonNumber
}

function compareEpisodes(first: EmbyItem, second: EmbyItem) {
  const firstEpisode = first.IndexNumber ?? 0
  const secondEpisode = second.IndexNumber ?? 0
  if (firstEpisode !== secondEpisode) {
    return firstEpisode - secondEpisode
  }

  return first.Name.localeCompare(second.Name)
}

function compareEpisodesBySeason(first: EmbyItem, second: EmbyItem) {
  const firstSeason = first.ParentIndexNumber ?? 0
  const secondSeason = second.ParentIndexNumber ?? 0
  if (firstSeason !== secondSeason) {
    return firstSeason - secondSeason
  }

  return compareEpisodes(first, second)
}

function playSelected() {
  if (playableItem.value) {
    emit('play', playableItem.value)
  }
}

function addSelectedToQueue() {
  emit('addToQueue', playableItem.value ?? props.item ?? undefined)
}

function playNextEpisode() {
  if (nextEpisode.value) {
    emit('play', nextEpisode.value)
  }
}

function toggleFavorite() {
  if (props.item) {
    emit('changeFavorite', { item: props.item, isFavorite: !isFavorite.value })
  }
}

function togglePlayed() {
  if (props.item) {
    emit('changePlayed', { item: props.item, isPlayed: !isPlayed.value })
  }
}

function scrollHorizontal(event: WheelEvent) {
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
  rail.setPointerCapture?.(event.pointerId)
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

  if (rail.hasPointerCapture?.(event.pointerId)) {
    rail.releasePointerCapture(event.pointerId)
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
    <div class="detail-hero" :style="heroStyle">
      <VBtn class="detail-back" variant="tonal" type="button" @click="emit('back')">
        <template #prepend>
          <ArrowLeft :size="18" />
        </template>
        返回媒体库
      </VBtn>

      <div class="detail-hero__content">
        <div class="detail-poster">
          <img v-if="posterUrl" :src="posterUrl" :alt="item.Name" width="520" height="780" fetchpriority="high" />
          <Tv v-else-if="item.Type === 'Series'" :size="42" />
          <ListVideo v-else-if="isItemCollection" :size="42" />
          <Music2 v-else-if="isMusicItem" :size="42" />
          <RadioTower v-else-if="isLiveTvItem" :size="42" />
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
            :disabled="isDetailCollection && !playableItem"
            @click="playSelected"
          >
            <template #prepend>
              <Play :size="19" />
            </template>
            {{ primaryPlayLabel }}
          </VBtn>
          <VBtn
            class="detail-play detail-play--secondary"
            variant="tonal"
            type="button"
            :disabled="isDetailCollection && !playableItem"
            @click="addSelectedToQueue"
          >
            <template #prepend>
              <ListPlus :size="18" />
            </template>
            加入队列
          </VBtn>
          <p v-if="primaryPlayDescription" class="detail-resume">
            {{ primaryPlayDescription }}
          </p>
          <div v-if="!isLiveTvItem" class="detail-actions">
            <VBtn
              :color="isFavorite ? 'primary' : undefined"
              :variant="isFavorite ? 'flat' : 'tonal'"
              type="button"
              :loading="isBusy"
              @click="toggleFavorite"
            >
              <template #prepend>
                <Heart :size="17" />
              </template>
              {{ isFavorite ? '已收藏' : '收藏' }}
            </VBtn>
            <VBtn
              :color="isPlayed ? 'primary' : undefined"
              :variant="isPlayed ? 'flat' : 'tonal'"
              type="button"
              :loading="isBusy"
              @click="togglePlayed"
            >
              <template #prepend>
                <Check :size="17" />
              </template>
              {{ isPlayed ? '标记未看' : '标记已看' }}
            </VBtn>
          </div>
          <p v-if="isLiveTvItem && item.CurrentProgram?.Overview" class="detail-overview">
            {{ item.CurrentProgram.Overview }}
          </p>
          <VBtn
            v-if="secondaryNextLabel"
            class="detail-play detail-play--secondary"
            variant="tonal"
            type="button"
            @click="playNextEpisode"
          >
            <template #prepend>
              <Play :size="18" />
            </template>
            {{ secondaryNextLabel }}
          </VBtn>
          <p v-if="secondaryNextLabel && nextEpisode" class="detail-next">
            {{ formatNextEpisode(nextEpisode) }}
          </p>
        </div>
      </div>
    </div>

    <section v-if="isDetailCollection" class="episode-section">
      <div class="episode-section__header">
        <div>
          <p class="section-kicker">{{ isMusicItem ? 'Tracks' : isItemCollection ? 'Items' : 'Seasons' }}</p>
          <h3 class="episode-section__title">{{ collectionTitle }}</h3>
        </div>
        <span>{{ isBusy ? '读取中' : collectionCountLabel }}</span>
      </div>

      <div class="episode-filters">
        <VBtn
          :color="showUnplayedOnly ? 'primary' : undefined"
          :variant="showUnplayedOnly ? 'flat' : 'tonal'"
          type="button"
          @click="showUnplayedOnly = !showUnplayedOnly"
        >
          <template #prepend>
            <Check :size="16" />
          </template>
          {{ unplayedFilterLabel }}
        </VBtn>
      </div>

      <div v-if="item.Type === 'Series' && seasonGroups.length" class="season-tabs" aria-label="季列表">
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

      <div v-if="visibleDetailItems.length" class="episode-rail-shell">
        <VBtn
          class="episode-rail-button episode-rail-button--previous"
          type="button"
          icon
          variant="tonal"
          :aria-label="isMusicItem ? '上一组曲目' : '上一组分集'"
          @click="scrollEpisodeRail('previous')"
        >
          <ChevronLeft :size="22" />
        </VBtn>

        <div
          ref="episodeRail"
          class="episode-rail"
          :class="{ 'episode-rail--dragging': isDraggingEpisodes }"
          :aria-label="isMusicItem ? '当前专辑曲目' : isItemCollection ? '当前合集条目' : '当前季分集'"
          @wheel="scrollHorizontal"
          @pointerdown="startEpisodeDrag"
          @pointermove="moveEpisodeDrag"
          @pointerup="endEpisodeDrag"
            @pointercancel="endEpisodeDrag"
        >
          <VCard
            v-for="card in visibleDetailCards"
            :key="card.item.Id"
            class="episode-tile"
            tag="button"
            type="button"
            variant="flat"
            :data-episode-id="card.item.Id"
            @click="playEpisode(card.item)"
          >
            <span class="episode-tile__poster">
              <img
                v-if="card.imageUrl"
                :src="card.imageUrl"
                :alt="card.item.Name"
                width="240"
                height="135"
                loading="lazy"
              />
              <Music2 v-else-if="card.item.Type === 'Audio'" :size="24" />
              <Tv v-else-if="card.item.Type === 'Episode'" :size="24" />
              <Film v-else :size="24" />
              <span class="episode-tile__play"><Play :size="16" /></span>
              <span v-if="card.item.UserData?.Played" class="episode-tile__played">
                <Check :size="13" />
              </span>
            </span>
            <span class="episode-tile__body">
              <span class="episode-tile__index">
                {{ card.indexLabel }}
              </span>
              <span class="episode-tile__title">{{ card.item.Name }}</span>
              <span class="episode-tile__meta">{{ card.metaLabel }}</span>
            </span>
          </VCard>
        </div>

        <VBtn
          class="episode-rail-button episode-rail-button--next"
          type="button"
          icon
          variant="tonal"
          :aria-label="isMusicItem ? '下一组曲目' : '下一组分集'"
          @click="scrollEpisodeRail('next')"
        >
          <ChevronRight :size="22" />
        </VBtn>
      </div>

      <VSheet v-else class="episode-empty">
        <Music2 v-if="isMusicItem" :size="26" />
        <ListVideo v-else-if="isItemCollection" :size="26" />
        <Tv v-else :size="26" />
        <span>{{ formatDetailCollectionEmptyState() }}</span>
      </VSheet>
    </section>

    <RelatedMediaRail
      v-if="similarItems.length"
      title="相似推荐"
      :items="similarItems"
      :get-image-url="getImageUrl"
      @select-item="emit('selectItem', $event)"
    />

    <MediaCredits :item="item" @search-person="emit('searchPerson', $event)" />

    <MediaTechnicalInfo :item="item" />
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
  gap: 18px;
  min-height: 0;
}

.detail-hero {
  position: relative;
  display: grid;
  align-content: start;
  min-height: 380px;
  overflow: hidden;
  padding: 22px;
  background-color: rgb(var(--v-theme-surface));
  background-position: center;
  background-size: cover;
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.detail-back {
  position: relative;
  z-index: 1;
  justify-self: start;
}

.detail-hero__content {
  display: grid;
  position: relative;
  z-index: 1;
  grid-template-columns: 188px minmax(0, 1fr);
  gap: 22px;
  align-items: end;
  margin-top: 22px;
}

.detail-poster {
  display: grid;
  aspect-ratio: 2 / 3;
  place-items: center;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.68);
  background: rgba(var(--v-theme-on-surface), 0.08);
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
}

.detail-title {
  overflow-wrap: anywhere;
  margin: 0;
  color: #ffffff;
  font-size: clamp(1.8rem, 4vw, 3.2rem);
  font-weight: 500;
  line-height: 1.06;
  letter-spacing: -0.03em;
}

.detail-series,
.detail-overview {
  margin: 0;
}

.detail-series {
  color: rgb(255 255 255 / 72%);
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
  padding: 6px 11px;
  color: rgb(255 255 255 / 78%);
  background: rgb(0 0 0 / 26%);
  font-size: 0.82rem;
}

.detail-overview {
  max-width: 58rem;
  color: rgb(255 255 255 / 68%);
  font-size: 0.94rem;
  line-height: 1.62;
  overflow-wrap: anywhere;
}

.detail-play {
  justify-self: start;
  min-width: 136px;
  box-shadow: none;
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-play--secondary {
  margin-top: -4px;
}

.detail-play:disabled {
  cursor: default;
  opacity: 0.48;
}

.detail-resume {
  max-width: 42rem;
  margin: -4px 0 0;
  color: #c9d7e3;
  font-size: 0.88rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.detail-next {
  max-width: 42rem;
  margin: -3px 0 0;
  color: #c9d7e3;
  font-size: 0.86rem;
  line-height: 1.4;
}

.episode-section {
  display: grid;
  gap: 16px;
  padding: 20px;
  background: rgb(var(--v-theme-surface));
}

.episode-section__header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}

.episode-section__title {
  margin: 0;
  font-size: 1.06rem;
  font-weight: 500;
  line-height: 1.25;
}

.episode-section__header span {
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 0.82rem;
}

.episode-filters {
  display: flex;
  justify-content: end;
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
  cursor: pointer;
}

.season-tabs__button span {
  max-width: 160px;
  overflow: hidden;
  color: inherit;
  font-size: 0.84rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.season-tabs__button small {
  opacity: 0.72;
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
  padding: 4px 46px 12px;
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
}

.episode-rail-button--previous {
  left: 2px;
}

.episode-rail-button--next {
  right: 2px;
}

.episode-tile {
  display: grid;
  flex: 0 0 204px;
  gap: 9px;
  min-width: 0;
  padding: 8px;
  color: inherit;
  text-align: left;
  background: rgb(var(--v-theme-surface));
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  cursor: pointer;
  scroll-snap-align: start;
}

.episode-tile__poster {
  position: relative;
  display: grid;
  aspect-ratio: 16 / 9;
  place-items: center;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.68);
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.episode-tile__poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  opacity: 0;
  transform: translateY(4px);
}

.episode-tile__played {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: inline-grid;
  width: 24px;
  height: 24px;
  place-items: center;
  color: rgb(var(--v-theme-on-primary));
  background: rgb(var(--v-theme-primary));
}

.episode-tile:hover .episode-tile__poster {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

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
  overflow-wrap: anywhere;
}

.episode-tile__index {
  color: rgb(var(--v-theme-primary));
  font-size: 0.76rem;
  font-weight: 500;
  line-height: 1.25;
}

.episode-tile__title {
  display: block;
  font-size: 0.88rem;
  font-weight: 500;
  line-height: 1.28;
}

.episode-tile__meta {
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 0.78rem;
  line-height: 1.25;
}

.episode-empty {
  display: grid;
  min-height: 150px;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: rgba(var(--v-theme-on-surface), 0.68);
  background: rgb(var(--v-theme-surface));
}

.detail-empty {
  display: grid;
  min-height: calc(100vh - 56px);
  place-items: center;
  align-content: center;
  gap: 12px;
  color: rgba(var(--v-theme-on-surface), 0.68);
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
    flex-basis: 176px;
  }

  .episode-rail-button {
    display: none;
  }

  .episode-rail {
    padding-right: 2px;
    padding-left: 2px;
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
