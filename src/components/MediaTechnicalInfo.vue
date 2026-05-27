<script setup lang="ts">
import { computed } from 'vue'
import { BadgeInfo, CalendarDays, Captions, Disc3, Gauge, HardDrive, Monitor, Volume2 } from 'lucide-vue-next'
import type { EmbyItem, EmbyMediaStream } from '../composables/useEmbyClient'
import { formatRuntimeMinutes } from '../composables/mediaItemDisplay'

interface InfoItem {
  key: string
  label: string
  value: string
}

const props = defineProps<{
  item: Readonly<EmbyItem>
}>()

const firstMediaSource = computed(() => props.item.MediaSources?.[0] ?? null)
const videoStreams = computed(() => mediaStreamsByType('Video'))
const audioStreams = computed(() => mediaStreamsByType('Audio'))
const subtitleStreams = computed(() => mediaStreamsByType('Subtitle'))
const hasTechnicalInfo = computed(() => Boolean(
  detailItems.value.length || videoSummary.value || audioSummary.value || subtitleSummary.value || sourceSummary.value,
))

const detailItems = computed<InfoItem[]>(() => {
  const items: InfoItem[] = []
  const premiereDate = formatDate(props.item.PremiereDate)
  if (premiereDate) {
    items.push({ key: 'premiere', label: '首播日期', value: premiereDate })
  }

  if (props.item.OfficialRating) {
    items.push({ key: 'rating', label: '官方评级', value: props.item.OfficialRating })
  }

  if (props.item.CommunityRating) {
    items.push({ key: 'community-rating', label: '用户评分', value: props.item.CommunityRating.toFixed(1) })
  }

  const runtime = formatRuntimeMinutes(props.item.RunTimeTicks)
  if (runtime) {
    items.push({ key: 'runtime', label: '时长', value: runtime })
  }

  return items
})

const sourceSummary = computed(() => {
  const source = firstMediaSource.value
  if (!source) {
    return ''
  }

  return [
    source.Name,
    source.Container?.toUpperCase(),
    formatBytes(source.Size),
    formatBitrate(source.Bitrate),
  ].filter(Boolean).join(' · ')
})

const videoSummary = computed(() => {
  const stream = videoStreams.value[0]
  if (!stream) {
    return ''
  }

  return [
    formatResolution(stream),
    stream.Codec?.toUpperCase(),
    formatBitrate(stream.BitRate),
  ].filter(Boolean).join(' · ')
})

const audioSummary = computed(() => {
  if (!audioStreams.value.length) {
    return ''
  }

  return audioStreams.value
    .slice(0, 3)
    .map((stream) => [
      stream.DisplayTitle || stream.Codec?.toUpperCase(),
      formatChannels(stream),
      stream.Language?.toUpperCase(),
    ].filter(Boolean).join(' · '))
    .join(' / ')
})

const subtitleSummary = computed(() => {
  if (!subtitleStreams.value.length) {
    return ''
  }

  const languages = [...new Set(subtitleStreams.value.map((stream) => stream.Language?.toUpperCase()).filter(Boolean))]
  const externalCount = subtitleStreams.value.filter((stream) => stream.IsExternal).length
  return [
    `${subtitleStreams.value.length} 条字幕`,
    languages.slice(0, 4).join(' / '),
    externalCount ? `${externalCount} 条外挂` : '',
  ].filter(Boolean).join(' · ')
})

function mediaStreamsByType(type: EmbyMediaStream['Type']) {
  return firstMediaSource.value?.MediaStreams?.filter((stream) => stream.Type === type) ?? []
}

function formatDate(value: string | undefined) {
  const timestamp = Date.parse(value ?? '')
  if (!Number.isFinite(timestamp)) {
    return ''
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(timestamp)
}

function formatResolution(stream: EmbyMediaStream) {
  if (!stream.Width || !stream.Height) {
    return ''
  }

  if (stream.Height >= 2160) {
    return `4K ${stream.Width}x${stream.Height}`
  }

  if (stream.Height >= 1080) {
    return `1080p ${stream.Width}x${stream.Height}`
  }

  if (stream.Height >= 720) {
    return `720p ${stream.Width}x${stream.Height}`
  }

  return `${stream.Width}x${stream.Height}`
}

function formatChannels(stream: EmbyMediaStream) {
  if (stream.ChannelLayout) {
    return stream.ChannelLayout
  }

  if (!stream.Channels) {
    return ''
  }

  if (stream.Channels === 1) {
    return 'Mono'
  }

  if (stream.Channels === 2) {
    return 'Stereo'
  }

  return `${stream.Channels} 声道`
}

function formatBitrate(value: number | undefined) {
  if (!value) {
    return ''
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} Mbps`
  }

  return `${Math.round(value / 1_000)} Kbps`
}

function formatBytes(value: number | undefined) {
  if (!value) {
    return ''
  }

  if (value >= 1_073_741_824) {
    return `${(value / 1_073_741_824).toFixed(1)} GB`
  }

  if (value >= 1_048_576) {
    return `${(value / 1_048_576).toFixed(1)} MB`
  }

  return `${Math.round(value / 1024)} KB`
}
</script>

<template>
  <section v-if="hasTechnicalInfo" class="grid gap-4 bg-[rgb(var(--v-theme-surface))] p-5">
    <div class="flex items-end justify-between gap-4">
      <div>
        <p class="m-0 mb-1 text-[0.72rem] font-500 tracking-[0.11em] uppercase">Metadata</p>
        <h3 class="m-0 text-[1.06rem] font-500 leading-[1.25]">媒体信息</h3>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2.5 lt-md:grid-cols-1">
      <div v-for="info in detailItems" :key="info.key" class="flex min-w-0 gap-2.5 bg-[rgba(var(--v-theme-on-surface),0.06)] p-3">
        <span class="grid h-[30px] w-[30px] flex-none place-items-center bg-[rgba(var(--v-theme-on-surface),0.08)] text-[rgb(var(--v-theme-primary))]">
          <CalendarDays v-if="info.key === 'premiere'" :size="16" />
          <BadgeInfo v-else :size="16" />
        </span>
        <span class="grid min-w-0 gap-[3px]">
          <strong class="min-w-0 [overflow-wrap:anywhere] text-[0.74rem] font-500 text-[rgba(var(--v-theme-on-surface),0.6)]">{{ info.label }}</strong>
          <em class="min-w-0 [overflow-wrap:anywhere] text-[0.84rem] not-italic leading-[1.35]">{{ info.value }}</em>
        </span>
      </div>

      <div v-if="sourceSummary" class="col-span-full flex min-w-0 gap-2.5 bg-[rgba(var(--v-theme-on-surface),0.06)] p-3">
        <span class="grid h-[30px] w-[30px] flex-none place-items-center bg-[rgba(var(--v-theme-on-surface),0.08)] text-[rgb(var(--v-theme-primary))]"><HardDrive :size="16" /></span>
        <span class="grid min-w-0 gap-[3px]">
          <strong class="min-w-0 [overflow-wrap:anywhere] text-[0.74rem] font-500 text-[rgba(var(--v-theme-on-surface),0.6)]">媒体源</strong>
          <em class="min-w-0 [overflow-wrap:anywhere] text-[0.84rem] not-italic leading-[1.35]">{{ sourceSummary }}</em>
        </span>
      </div>

      <div v-if="videoSummary" class="col-span-full flex min-w-0 gap-2.5 bg-[rgba(var(--v-theme-on-surface),0.06)] p-3">
        <span class="grid h-[30px] w-[30px] flex-none place-items-center bg-[rgba(var(--v-theme-on-surface),0.08)] text-[rgb(var(--v-theme-primary))]"><Monitor :size="16" /></span>
        <span class="grid min-w-0 gap-[3px]">
          <strong class="min-w-0 [overflow-wrap:anywhere] text-[0.74rem] font-500 text-[rgba(var(--v-theme-on-surface),0.6)]">视频</strong>
          <em class="min-w-0 [overflow-wrap:anywhere] text-[0.84rem] not-italic leading-[1.35]">{{ videoSummary }}</em>
        </span>
      </div>

      <div v-if="audioSummary" class="col-span-full flex min-w-0 gap-2.5 bg-[rgba(var(--v-theme-on-surface),0.06)] p-3">
        <span class="grid h-[30px] w-[30px] flex-none place-items-center bg-[rgba(var(--v-theme-on-surface),0.08)] text-[rgb(var(--v-theme-primary))]"><Volume2 :size="16" /></span>
        <span class="grid min-w-0 gap-[3px]">
          <strong class="min-w-0 [overflow-wrap:anywhere] text-[0.74rem] font-500 text-[rgba(var(--v-theme-on-surface),0.6)]">音频</strong>
          <em class="min-w-0 [overflow-wrap:anywhere] text-[0.84rem] not-italic leading-[1.35]">{{ audioSummary }}</em>
        </span>
      </div>

      <div v-if="subtitleSummary" class="col-span-full flex min-w-0 gap-2.5 bg-[rgba(var(--v-theme-on-surface),0.06)] p-3">
        <span class="grid h-[30px] w-[30px] flex-none place-items-center bg-[rgba(var(--v-theme-on-surface),0.08)] text-[rgb(var(--v-theme-primary))]"><Captions :size="16" /></span>
        <span class="grid min-w-0 gap-[3px]">
          <strong class="min-w-0 [overflow-wrap:anywhere] text-[0.74rem] font-500 text-[rgba(var(--v-theme-on-surface),0.6)]">字幕</strong>
          <em class="min-w-0 [overflow-wrap:anywhere] text-[0.84rem] not-italic leading-[1.35]">{{ subtitleSummary }}</em>
        </span>
      </div>

      <div v-if="item.MediaSources?.length" class="flex min-w-0 gap-2.5 bg-[rgba(var(--v-theme-on-surface),0.06)] p-3">
        <span class="grid h-[30px] w-[30px] flex-none place-items-center bg-[rgba(var(--v-theme-on-surface),0.08)] text-[rgb(var(--v-theme-primary))]"><Disc3 :size="16" /></span>
        <span class="grid min-w-0 gap-[3px]">
          <strong class="min-w-0 [overflow-wrap:anywhere] text-[0.74rem] font-500 text-[rgba(var(--v-theme-on-surface),0.6)]">版本</strong>
          <em class="min-w-0 [overflow-wrap:anywhere] text-[0.84rem] not-italic leading-[1.35]">{{ item.MediaSources.length }} 个媒体源</em>
        </span>
      </div>

      <div v-if="firstMediaSource?.Bitrate" class="flex min-w-0 gap-2.5 bg-[rgba(var(--v-theme-on-surface),0.06)] p-3">
        <span class="grid h-[30px] w-[30px] flex-none place-items-center bg-[rgba(var(--v-theme-on-surface),0.08)] text-[rgb(var(--v-theme-primary))]"><Gauge :size="16" /></span>
        <span class="grid min-w-0 gap-[3px]">
          <strong class="min-w-0 [overflow-wrap:anywhere] text-[0.74rem] font-500 text-[rgba(var(--v-theme-on-surface),0.6)]">总码率</strong>
          <em class="min-w-0 [overflow-wrap:anywhere] text-[0.84rem] not-italic leading-[1.35]">{{ formatBitrate(firstMediaSource.Bitrate) }}</em>
        </span>
      </div>
    </div>
  </section>
</template>
