<script setup lang="ts">
import {
  Bug,
  Maximize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Settings2,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
} from 'lucide-vue-next'
import type { EmbyItem } from '../composables/useEmbyClient'
import type { PlaybackMode } from '../composables/usePlaybackQueue'

defineProps<{
  playbackPosition: number
  playbackDuration: number
  playbackProgress: number
  volumeLevel: number
  queueLabel: string
  canPlay: boolean
  isLoading: boolean
  isPaused: boolean
  isSoftwareRendering: boolean
  playbackMode: PlaybackMode
  previousEpisode: Readonly<EmbyItem | null>
  nextEpisode: Readonly<EmbyItem | null>
  episodeOptions: readonly EmbyItem[]
  selectedEpisodeId: string
  formatEpisodeOption: (episode: EmbyItem) => string
  formatTime: (seconds: number) => string
}>()

const emit = defineEmits<{
  playPause: []
  seekRelative: [seconds: number]
  seekToProgress: [value: number | string]
  stop: []
  selectEpisode: [episodeId: string]
  switchEpisode: [episode: EmbyItem]
  updateVolume: [value: number | string]
  cyclePlaybackMode: []
  openSettings: []
  openDebug: []
  toggleFullscreen: []
}>()

function playbackModeLabel(mode: PlaybackMode) {
  if (mode === 'repeat-all') {
    return '列表循环'
  }

  if (mode === 'repeat-one') {
    return '单项循环'
  }

  if (mode === 'shuffle') {
    return '随机播放'
  }

  return '顺序播放'
}
</script>

<template>
  <div class="mpv-stage__controls">
    <div class="mpv-stage__timeline">
      <span class="mpv-stage__time">{{ formatTime(playbackPosition) }}</span>
      <VSlider
        class="mpv-stage__progress"
        min="0"
        max="100"
        step="0.1"
        :model-value="playbackProgress"
        :disabled="!playbackDuration"
        color="primary"
        track-color="rgba(255, 255, 255, 0.2)"
        hide-details
        @end="emit('seekToProgress', $event)"
      />
      <span class="mpv-stage__time">{{ formatTime(playbackDuration) }}</span>
    </div>

    <div class="mpv-stage__control-row">
      <VBtn
        type="button"
        icon
        variant="tonal"
        aria-label="上一项"
        :disabled="!previousEpisode"
        @click="previousEpisode && emit('switchEpisode', previousEpisode)"
      >
        <SkipBack :size="18" />
      </VBtn>
      <VBtn
        type="button"
        icon
        variant="tonal"
        aria-label="后退 10 秒"
        :disabled="!playbackDuration"
        @click="emit('seekRelative', -10)"
      >
        <RotateCcw :size="18" />
      </VBtn>
      <VBtn
        type="button"
        icon
        variant="tonal"
        aria-label="播放或暂停"
        :disabled="!canPlay || isLoading"
        @click="emit('playPause')"
      >
        <Pause v-if="!isPaused && isSoftwareRendering" :size="19" />
        <Play v-else :size="19" />
      </VBtn>
      <VBtn
        type="button"
        icon
        variant="tonal"
        aria-label="前进 10 秒"
        :disabled="!playbackDuration"
        @click="emit('seekRelative', 10)"
      >
        <RotateCw :size="18" />
      </VBtn>
      <VBtn
        type="button"
        icon
        variant="tonal"
        aria-label="下一项"
        :disabled="!nextEpisode"
        @click="nextEpisode && emit('switchEpisode', nextEpisode)"
      >
        <SkipForward :size="18" />
      </VBtn>
      <VBtn type="button" icon variant="tonal" aria-label="停止播放" @click="emit('stop')">
        <Square :size="18" />
      </VBtn>
      <VBtn
        type="button"
        icon
        variant="tonal"
        aria-label="切换播放模式"
        :title="playbackModeLabel(playbackMode)"
        @click="emit('cyclePlaybackMode')"
      >
        <Repeat1 v-if="playbackMode === 'repeat-one'" :size="18" />
        <Shuffle v-else-if="playbackMode === 'shuffle'" :size="18" />
        <Repeat v-else :size="18" />
      </VBtn>
      <VSelect
        v-if="episodeOptions.length"
        :model-value="selectedEpisodeId"
        class="mpv-stage__episode-select"
        :items="episodeOptions"
        :item-title="formatEpisodeOption"
        item-value="Id"
        density="compact"
        variant="solo-filled"
        hide-details
        :aria-label="queueLabel"
        @update:model-value="emit('selectEpisode', $event)"
      />
      <div class="mpv-stage__volume-group">
        <Volume2 :size="18" class="mpv-stage__volume-icon" />
        <VSlider
          :model-value="volumeLevel"
          class="mpv-stage__volume"
          min="0"
          max="100"
          step="1"
          color="primary"
          track-color="rgba(255, 255, 255, 0.2)"
          hide-details
          @update:model-value="emit('updateVolume', $event)"
          @end="emit('updateVolume', $event)"
        />
      </div>
      <VBtn type="button" icon variant="tonal" aria-label="打开播放设置" @click="emit('openSettings')">
        <Settings2 :size="18" />
      </VBtn>
      <VBtn type="button" icon variant="tonal" aria-label="打开调试信息" @click="emit('openDebug')">
        <Bug :size="18" />
      </VBtn>
      <VBtn type="button" icon variant="tonal" aria-label="切换全屏" @click="emit('toggleFullscreen')">
        <Maximize2 :size="18" />
      </VBtn>
    </div>
  </div>
</template>

<style scoped>
.mpv-stage__controls {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 6;
  display: grid;
  gap: 10px;
  padding: 18px 22px;
  background: rgb(0 0 0 / 68%);
  opacity: 1;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
  pointer-events: auto;
}

.mpv-stage__timeline {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 52px;
  align-items: center;
  gap: 10px;
  max-width: 1120px;
  width: 100%;
  justify-self: center;
}

.mpv-stage__control-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
}

.mpv-stage__control-row :deep(.v-btn) {
  width: 40px;
  height: 40px;
}

.mpv-stage__time {
  flex: 0 0 auto;
  min-width: 0;
  color: rgb(255 255 255 / 76%);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.mpv-stage__progress,
.mpv-stage__volume {
  min-width: 80px;
}

.mpv-stage__progress:disabled {
  opacity: 0.45;
}

.mpv-stage__volume {
  width: 94px;
}

.mpv-stage__episode-select {
  width: min(260px, 26vw);
  min-width: 180px;
}

.mpv-stage__episode-select :deep(.v-field) {
  min-height: 40px;
}

.mpv-stage__episode-select :deep(.v-field__input) {
  min-height: 38px;
  padding-top: 0;
  padding-bottom: 0;
  font-size: 0.8rem;
}

.mpv-stage__volume-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
  padding: 0 10px;
  height: 40px;
}

.mpv-stage__volume-icon {
  flex: 0 0 auto;
  color: rgb(255 255 255 / 72%);
}

@media (max-width: 720px) {
  .mpv-stage__controls {
    padding: 12px;
  }

  .mpv-stage__control-row {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .mpv-stage__volume-group {
    order: 10;
    width: 100%;
    margin-left: 0;
  }

  .mpv-stage__episode-select {
    order: 9;
    width: 100%;
  }

  .mpv-stage__volume {
    width: 100%;
  }
}
</style>
