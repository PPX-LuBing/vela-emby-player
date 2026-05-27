<script setup lang="ts">
import { computed } from 'vue'
import { RadioTower } from 'lucide-vue-next'
import {
  createLiveTvGuideWindow,
  createLiveTvTimeline,
  type LiveTvTimelineProgram,
} from '../composables/embyLiveTvApi'
import type { EmbyItem } from '../composables/useEmbyClient'

const SLOT_WIDTH = 148
const clockFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
})

const props = defineProps<{
  channels: readonly EmbyItem[]
  programsByChannel: Readonly<Record<string, readonly EmbyItem[]>>
  selectedChannelId?: string
}>()

const emit = defineEmits<{
  selectChannel: [channel: EmbyItem]
}>()

const guideWindow = computed(() => createLiveTvGuideWindow())
const timeline = computed(() => createLiveTvTimeline(
  props.channels,
  props.programsByChannel,
  guideWindow.value,
))
const timelineView = computed(() => ({
  slots: timeline.value.slots.map((slot) => ({
    ...slot,
    label: formatClock(slot.startMs),
  })),
  rows: timeline.value.rows.map((row) => ({
    ...row,
    channelNumber: channelNumber(row.channel),
    programs: row.programs.map((entry) => {
      const timeLabel = formatProgramTime(entry.program)
      return {
        ...entry,
        style: programStyle(entry),
        timeLabel,
        title: `${row.channel.Name} · ${timeLabel} · ${entry.program.Name}`,
      }
    }),
  })),
}))
const timelineCssVars = computed<Record<string, string>>(() => {
  const slotCount = Math.max(1, timeline.value.slots.length)
  return {
    '--live-tv-slot-count': String(slotCount),
    '--live-tv-slot-width': `${SLOT_WIDTH}px`,
    '--live-tv-timeline-width': `${slotCount * SLOT_WIDTH}px`,
  }
})
const guideWindowLabel = computed(() => {
  if (!timeline.value.slots.length) {
    return '暂无节目单'
  }

  return `${formatClock(timeline.value.startMs)} - ${formatClock(timeline.value.endMs)}`
})

function selectChannel(channel: EmbyItem) {
  emit('selectChannel', channel)
}

function channelNumber(channel: EmbyItem) {
  return channel.ChannelNumber || channel.Number || ''
}

function programStyle(entry: LiveTvTimelineProgram) {
  return {
    left: `${entry.offsetPercent}%`,
    width: `${entry.widthPercent}%`,
  }
}

function formatClock(value: number) {
  return clockFormatter.format(value)
}

function formatProgramTime(program: EmbyItem) {
  const start = Date.parse(program.StartDate ?? '')
  const end = Date.parse(program.EndDate ?? '')
  if (!Number.isFinite(start)) {
    return ''
  }

  if (!Number.isFinite(end)) {
    return formatClock(start)
  }

  return `${formatClock(start)}-${formatClock(end)}`
}
</script>

<template>
  <VSheet class="live-tv-guide" :style="timelineCssVars">
    <div class="live-tv-guide__heading">
      <div>
        <h4 class="live-tv-guide__title">节目时间轴</h4>
        <p class="live-tv-guide__subtitle">按频道横向查看当前和即将播出的节目</p>
      </div>
      <span>{{ guideWindowLabel }}</span>
    </div>

    <div class="live-tv-guide__scroll" aria-label="电视直播节目时间轴">
      <div class="live-tv-guide__header-row">
        <div class="live-tv-guide__channel-header">频道</div>
        <div class="live-tv-guide__slots">
          <span
            v-for="slot in timelineView.slots"
            :key="slot.id"
            class="live-tv-guide__slot"
          >
            {{ slot.label }}
          </span>
        </div>
      </div>

      <div
        v-for="row in timelineView.rows"
        :key="row.channel.Id"
        class="live-tv-guide__row"
      >
        <button
          class="live-tv-guide__channel"
          :class="{ 'live-tv-guide__channel--active': selectedChannelId === row.channel.Id }"
          type="button"
          @click="selectChannel(row.channel)"
        >
          <span class="live-tv-guide__channel-icon">
            <RadioTower :size="18" />
          </span>
          <span class="live-tv-guide__channel-body">
            <strong>{{ row.channel.Name }}</strong>
            <em v-if="row.channelNumber">频道 {{ row.channelNumber }}</em>
          </span>
        </button>

        <div class="live-tv-guide__lane">
          <button
            v-for="entry in row.programs"
            :key="entry.program.Id"
            class="live-tv-guide__program"
            :class="{
              'live-tv-guide__program--clipped-start': entry.startsBeforeWindow,
              'live-tv-guide__program--clipped-end': entry.endsAfterWindow,
            }"
            type="button"
            :style="entry.style"
            :title="entry.title"
            @click="selectChannel(row.channel)"
          >
            <strong>{{ entry.program.Name }}</strong>
            <span>{{ entry.timeLabel }}</span>
          </button>
          <span v-if="!row.programs.length" class="live-tv-guide__empty-row">暂无节目单</span>
        </div>
      </div>
    </div>
  </VSheet>
</template>

<style scoped>
.live-tv-guide {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 16px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
}

.live-tv-guide__heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}

.live-tv-guide__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.2;
}

.live-tv-guide__subtitle {
  margin: 4px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 0.78rem;
}

.live-tv-guide__heading span {
  flex: 0 0 auto;
  color: rgb(255 255 255 / 54%);
  font-size: 0.78rem;
}

.live-tv-guide__scroll {
  min-width: 0;
  overflow: auto;
  border: 1px solid rgb(255 255 255 / 8%);
  scrollbar-color: rgb(255 255 255 / 22%) transparent;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.live-tv-guide__header-row,
.live-tv-guide__row {
  display: grid;
  grid-template-columns: minmax(156px, 184px) var(--live-tv-timeline-width);
  width: max-content;
  min-width: 100%;
}

.live-tv-guide__header-row {
  position: sticky;
  top: 0;
  z-index: 3;
  min-height: 42px;
  background: rgb(var(--v-theme-surface));
}

.live-tv-guide__channel-header,
.live-tv-guide__channel {
  position: sticky;
  left: 0;
  z-index: 2;
  background: rgb(var(--v-theme-surface));
  border-right: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.live-tv-guide__channel-header {
  display: flex;
  align-items: center;
  padding: 0 12px;
  color: rgb(255 255 255 / 54%);
  font-size: 0.76rem;
  font-weight: 750;
  letter-spacing: 0.06em;
}

.live-tv-guide__slots {
  display: grid;
  grid-template-columns: repeat(var(--live-tv-slot-count), var(--live-tv-slot-width));
  width: var(--live-tv-timeline-width);
}

.live-tv-guide__slot {
  display: flex;
  align-items: center;
  padding: 0 12px;
  color: rgb(255 255 255 / 52%);
  border-left: 1px solid rgb(255 255 255 / 7%);
  font-size: 0.75rem;
  font-weight: 700;
}

.live-tv-guide__row {
  min-height: 72px;
  border-top: 1px solid rgb(255 255 255 / 7%);
}

.live-tv-guide__channel {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 12px;
  color: inherit;
  text-align: left;
  border-top: 0;
  border-bottom: 0;
  border-left: 0;
  cursor: pointer;
}

.live-tv-guide__channel:hover,
.live-tv-guide__channel--active {
  background: rgba(var(--v-theme-primary), 0.12);
}

.live-tv-guide__channel-icon {
  display: grid;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  place-items: center;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.live-tv-guide__channel-body {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.live-tv-guide__channel-body strong,
.live-tv-guide__program strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.live-tv-guide__channel-body strong {
  font-size: 0.82rem;
  font-weight: 500;
}

.live-tv-guide__channel-body em {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 0.74rem;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.live-tv-guide__lane {
  position: relative;
  width: var(--live-tv-timeline-width);
  min-height: 72px;
  background-image: repeating-linear-gradient(
    90deg,
    transparent 0,
    transparent calc(var(--live-tv-slot-width) - 1px),
    rgb(255 255 255 / 7%) calc(var(--live-tv-slot-width) - 1px),
    rgb(255 255 255 / 7%) var(--live-tv-slot-width)
  );
}

.live-tv-guide__program {
  position: absolute;
  top: 10px;
  bottom: 10px;
  display: grid;
  align-content: center;
  gap: 4px;
  min-width: 76px;
  padding: 9px 11px;
  overflow: hidden;
  text-align: left;
  background: rgb(var(--v-theme-surface));
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  cursor: pointer;
}

.live-tv-guide__program:hover {
  border-color: rgb(var(--v-theme-primary));
}

.live-tv-guide__program--clipped-start {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.live-tv-guide__program--clipped-end {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.live-tv-guide__program strong {
  min-width: 0;
  font-size: 0.8rem;
  font-weight: 500;
}

.live-tv-guide__program span {
  overflow: hidden;
  color: rgb(255 255 255 / 58%);
  font-size: 0.7rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.live-tv-guide__empty-row {
  position: absolute;
  top: 50%;
  left: 14px;
  color: rgb(255 255 255 / 54%);
  font-size: 0.78rem;
  transform: translateY(-50%);
}

@media (max-width: 720px) {
  .live-tv-guide {
    padding: 12px;
  }

  .live-tv-guide__heading {
    align-items: start;
    flex-direction: column;
    gap: 6px;
  }

  .live-tv-guide__header-row,
  .live-tv-guide__row {
    grid-template-columns: minmax(132px, 148px) var(--live-tv-timeline-width);
  }

  .live-tv-guide__channel {
    padding: 10px;
  }

  .live-tv-guide__channel-icon {
    display: none;
  }
}
</style>
