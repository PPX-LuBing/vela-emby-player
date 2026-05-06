<script setup lang="ts">
import {
  Bug,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
} from 'lucide-vue-next'
import type { EmbyItem } from '../composables/useEmbyClient'

defineProps<{
  playbackPosition: number
  playbackDuration: number
  playbackProgress: number
  volumeLevel: number
  canPlay: boolean
  isLoading: boolean
  isPaused: boolean
  isSoftwareRendering: boolean
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
  openSettings: []
  openDebug: []
  toggleFullscreen: []
}>()
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
        :disabled="!previousEpisode"
        @click="previousEpisode && emit('switchEpisode', previousEpisode)"
      >
        <SkipBack :size="18" />
      </VBtn>
      <VBtn
        type="button"
        icon
        variant="tonal"
        :disabled="!playbackDuration"
        @click="emit('seekRelative', -10)"
      >
        <RotateCcw :size="18" />
      </VBtn>
      <VBtn
        type="button"
        icon
        variant="tonal"
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
        :disabled="!playbackDuration"
        @click="emit('seekRelative', 10)"
      >
        <RotateCw :size="18" />
      </VBtn>
      <VBtn
        type="button"
        icon
        variant="tonal"
        :disabled="!nextEpisode"
        @click="nextEpisode && emit('switchEpisode', nextEpisode)"
      >
        <SkipForward :size="18" />
      </VBtn>
      <VBtn type="button" icon variant="tonal" @click="emit('stop')">
        <Square :size="18" />
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
        aria-label="选择分集"
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
      <VBtn type="button" icon variant="tonal" @click="emit('openSettings')">
        <Settings2 :size="18" />
      </VBtn>
      <VBtn type="button" icon variant="tonal" @click="emit('openDebug')">
        <Bug :size="18" />
      </VBtn>
      <VBtn type="button" icon variant="tonal" @click="emit('toggleFullscreen')">
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
  z-index: 3;
  display: grid;
  gap: 10px;
  padding: 54px 22px 18px;
  background: linear-gradient(0deg, rgb(0 0 0 / 84%) 0%, rgb(0 0 0 / 48%) 58%, transparent 100%);
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
  color: #ffffff;
  background: rgb(255 255 255 / 12%);
  border: 1px solid rgb(255 255 255 / 15%);
  border-radius: 50%;
  backdrop-filter: blur(12px);
}

.mpv-stage__control-row :deep(.v-btn:hover) {
  background: rgb(255 255 255 / 17%);
}

.mpv-stage__time {
  flex: 0 0 auto;
  min-width: 0;
  color: rgb(255 255 255 / 72%);
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
  color: #ffffff;
  background: rgb(255 255 255 / 8%);
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 8px;
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
  background: rgb(255 255 255 / 8%);
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 8px;
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
