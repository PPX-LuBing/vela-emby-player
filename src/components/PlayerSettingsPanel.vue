<script setup lang="ts">
import { Bug, Copy, ExternalLink, RefreshCw } from 'lucide-vue-next'
import {
  type EmbyMediaSource,
  type EmbyMediaStream,
  type EmbyPlaybackInfo,
  type PlaybackQualityPreset,
} from '../composables/useEmbyClient'
import {
  PLAYBACK_QUALITY_OPTIONS,
  bitrateToMbps,
  mbpsToBitrate,
} from '../composables/playbackPreferences'
import type { PlayerDiagnostics, PlayerEngineStatus } from '../composables/usePlayerEngine'

type SubtitleOption = EmbyMediaStream | { Index: null; DisplayTitle: string }

defineProps<{
  showSettings: boolean
  showDebug: boolean
  playbackInfo: Readonly<EmbyPlaybackInfo | null>
  selectedSourceId: string
  selectedAudioIndex: number | null
  selectedSubtitleIndex: number | null
  forceTranscode: boolean
  qualityPreset: PlaybackQualityPreset
  customMaxStreamingBitrate: number
  selectedSource: Readonly<EmbyMediaSource | null>
  audioStreams: readonly EmbyMediaStream[]
  subtitleOptions: readonly SubtitleOption[]
  engineStatus: Readonly<PlayerEngineStatus | null>
  diagnostics: Readonly<PlayerDiagnostics | null>
  canCopyUrl: boolean
  copied: boolean
  formatSource: (source: EmbyMediaSource) => string
  formatStream: (stream: SubtitleOption) => string
}>()

const emit = defineEmits<{
  updateSource: [sourceId: string]
  updateAudio: [audioIndex: number | null]
  updateSubtitle: [subtitleIndex: number | null]
  updateForceTranscode: [forceTranscode: boolean]
  updateQualityPreset: [qualityPreset: PlaybackQualityPreset]
  updateCustomMaxStreamingBitrate: [bitrate: number]
  applyPlaybackSettings: []
  toggleDebug: []
  copyUrl: []
  markStopped: []
}>()
</script>

<template>
  <div v-if="showSettings" class="player-settings">
    <div v-if="playbackInfo" class="player-settings__grid">
      <VSelect
        :model-value="selectedSourceId"
        label="媒体源"
        :items="playbackInfo.MediaSources"
        :item-title="formatSource"
        item-value="Id"
        hide-details
        @update:model-value="emit('updateSource', $event)"
      />

      <VSelect
        :model-value="selectedAudioIndex"
        label="音轨"
        :items="audioStreams"
        :item-title="formatStream"
        item-value="Index"
        hide-details
        @update:model-value="emit('updateAudio', $event)"
      />

      <VSelect
        :model-value="selectedSubtitleIndex"
        label="字幕"
        :items="subtitleOptions"
        :item-title="formatStream"
        item-value="Index"
        hide-details
        @update:model-value="emit('updateSubtitle', $event)"
      />

      <VSwitch
        :model-value="forceTranscode"
        class="player-settings__switch"
        color="primary"
        label="强制转码"
        hide-details
        @update:model-value="emit('updateForceTranscode', Boolean($event))"
      />

      <VSelect
        :model-value="qualityPreset"
        label="质量"
        :items="PLAYBACK_QUALITY_OPTIONS"
        item-title="title"
        item-value="value"
        hide-details
        @update:model-value="emit('updateQualityPreset', $event)"
      />

      <VTextField
        v-if="qualityPreset === 'custom'"
        :model-value="bitrateToMbps(customMaxStreamingBitrate)"
        label="最大码率 Mbps"
        type="number"
        min="1"
        max="120"
        step="1"
        hide-details
        @update:model-value="emit('updateCustomMaxStreamingBitrate', mbpsToBitrate($event))"
      />
    </div>

    <div class="player-settings__actions">
      <VBtn variant="tonal" type="button" :disabled="!selectedSource" @click="emit('applyPlaybackSettings')">
        <template #prepend>
          <RefreshCw :size="17" />
        </template>
        应用播放设置
      </VBtn>
      <VBtn variant="tonal" type="button" @click="emit('toggleDebug')">
        <template #prepend>
          <Bug :size="17" />
        </template>
        Debug
      </VBtn>
    </div>
  </div>

  <div v-if="showDebug" class="player-settings player-settings--debug">
    <div class="player-debug">
      <div>
        <span>播放引擎</span>
        <strong>{{ engineStatus?.libmpvAvailable ? '内置 libmpv' : '不可用' }}</strong>
      </div>
      <div>
        <span>媒体源</span>
        <strong>{{ selectedSource ? formatSource(selectedSource) : '未载入' }}</strong>
      </div>
      <div>
        <span>渲染</span>
        <strong>{{ diagnostics?.renderMode || '等待诊断' }}</strong>
      </div>
      <div>
        <span>编码</span>
        <strong>{{ diagnostics ? `${diagnostics.videoCodec || 'video'} / ${diagnostics.audioCodec || 'audio'}` : '等待诊断' }}</strong>
      </div>
    </div>

    <div class="player-settings__actions">
      <VBtn variant="tonal" type="button" :disabled="!canCopyUrl" @click="emit('copyUrl')">
        <template #prepend>
          <Copy :size="17" />
        </template>
        {{ copied ? '已复制' : '复制直链' }}
      </VBtn>
      <VBtn variant="tonal" type="button" :disabled="!selectedSource" @click="emit('markStopped')">
        <template #prepend>
          <ExternalLink :size="17" />
        </template>
        上报停止
      </VBtn>
    </div>
  </div>
</template>

<style scoped>
.player-settings {
  position: absolute;
  right: 18px;
  bottom: 126px;
  z-index: 5;
  display: grid;
  width: min(560px, calc(100% - 36px));
  gap: 12px;
  padding: 14px;
  background: rgb(var(--v-theme-surface));
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.player-settings__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.player-settings__grid :deep(.v-field) {
  background: rgb(var(--v-theme-surface));
}

.player-settings__switch {
  align-self: center;
}

.player-settings__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.player-settings--debug {
  bottom: 126px;
}

.player-debug {
  display: grid;
  gap: 8px;
}

.player-debug div {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
  color: rgb(255 255 255 / 58%);
  font-size: 0.78rem;
}

.player-debug strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: 500;
}

@media (max-width: 720px) {
  .player-settings {
    right: 12px;
    bottom: 170px;
    left: 12px;
    width: auto;
    max-height: calc(100% - 250px);
    overflow: auto;
  }

  .player-settings__grid {
    grid-template-columns: 1fr;
  }
}
</style>
