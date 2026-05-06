<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import {
  ArrowLeft,
  Loader2,
  MoreHorizontal,
  MonitorPlay,
  Play,
} from 'lucide-vue-next'
import { PLAYBACK_QUALITY_OPTIONS } from '../composables/useEmbyClient'
import type {
  EmbyItem,
  EmbyMediaSource,
  EmbyMediaStream,
  EmbyPlaybackInfo,
  MpvAuthContext,
  PlaybackPreferences,
  PlaybackQualityPreset,
} from '../composables/useEmbyClient'
import { useEpisodeQueue } from '../composables/useEpisodeQueue'
import PlayerControls from './PlayerControls.vue'
import PlayerSettingsPanel from './PlayerSettingsPanel.vue'
import {
  normalizePlayerEngineError,
  usePlayerEngine,
  type PlayerBounds,
  type PlayerDiagnostics,
  type PlayerEngineStatus,
} from '../composables/usePlayerEngine'
import { usePlaybackReporting } from '../composables/usePlaybackReporting'
import { useSoftwareRenderer } from '../composables/useSoftwareRenderer'

const MPV_PATH_KEY = 'vela_player_mpv_path'

const props = defineProps<{
  item: Readonly<EmbyItem | null>
  episodes: readonly EmbyItem[]
  playbackPreferences: Readonly<PlaybackPreferences>
  getPlaybackInfo: (itemId: string, startTimeTicks?: number) => Promise<EmbyPlaybackInfo>
  getPlaybackUrl: (
    itemId: string,
    source: EmbyMediaSource,
    options?: {
      mediaSourceId?: string
      playSessionId?: string
      audioStreamIndex?: number
      subtitleStreamIndex?: number
      forceTranscode?: boolean
      maxStreamingBitrate?: number | null
    },
  ) => string
  getSubtitleUrl: (
    itemId: string,
    mediaSourceId: string,
    subtitleStreamIndex: number,
  ) => string
  getMpvAuthContext: () => MpvAuthContext
  reportPlaybackStart: (
    itemId: string,
    mediaSourceId: string,
    playSessionId: string | undefined,
    positionTicks: number,
  ) => Promise<void>
  reportPlaybackProgress: (payload: {
    itemId: string
    mediaSourceId: string
    playSessionId?: string
    positionTicks: number
    isPaused: boolean
    isMuted: boolean
    volumeLevel: number
  }) => Promise<void>
  reportPlaybackStopped: (
    itemId: string,
    mediaSourceId: string,
    playSessionId: string | undefined,
    positionTicks: number,
  ) => Promise<void>
}>()

const emit = defineEmits<{
  back: []
  changeItem: [item: EmbyItem]
}>()

const playerEngine = usePlayerEngine()
const playbackReporting = usePlaybackReporting({
  reportPlaybackProgress: props.reportPlaybackProgress,
  reportPlaybackStart: props.reportPlaybackStart,
  reportPlaybackStopped: props.reportPlaybackStopped,
})

const playbackInfo = shallowRef<EmbyPlaybackInfo | null>(null)
const selectedSourceId = shallowRef('')
const selectedAudioIndex = shallowRef<number | null>(null)
const selectedSubtitleIndex = shallowRef<number | null>(null)
const forceTranscode = shallowRef(false)
const qualityPreset = shallowRef<PlaybackQualityPreset>(props.playbackPreferences.defaultQualityPreset)
const customMaxStreamingBitrate = shallowRef(props.playbackPreferences.customMaxStreamingBitrate)
const mpvPath = shallowRef(localStorage.getItem(MPV_PATH_KEY) ?? '')
const isLoading = shallowRef(false)
const errorMessage = shallowRef('')
const statusMessage = shallowRef('')
const engineStatus = shallowRef<PlayerEngineStatus | null>(null)
const diagnostics = shallowRef<PlayerDiagnostics | null>(null)
const copied = shallowRef(false)
const showPlayerSettings = shallowRef(false)
const showDebugPanel = shallowRef(false)
const volumeLevel = shallowRef(100)
const controlsVisible = shallowRef(true)
const isStartingPlayback = shallowRef(false)
const playerOsdMessage = shallowRef('')
const playerStageRef = useTemplateRef<HTMLElement>('playerStage')
const renderCanvasRef = useTemplateRef<HTMLCanvasElement>('renderCanvas')
let diagnosticsLoopId = 0
let hideControlsTimer = 0
let osdTimer = 0
let didStopForExit = false
let didAutoAdvance = false
let autoplayAfterItemChange = false

const selectedSource = computed(() => {
  const sources = playbackInfo.value?.MediaSources ?? []
  return sources.find((source) => source.Id === selectedSourceId.value) ?? sources[0] ?? null
})
const softwareRenderer = useSoftwareRenderer({
  canvasRef: renderCanvasRef,
  getBounds: getPlayerBounds,
  renderFrame: playerEngine.renderFrame,
  onError: (error) => {
    errorMessage.value = normalizePlayerEngineError(error)
  },
})
const isSoftwareRendering = softwareRenderer.isSoftwareRendering
const hasRenderedFrame = softwareRenderer.hasRenderedFrame

const audioStreams = computed(() => streamsByType(selectedSource.value, 'Audio'))
const subtitleStreams = computed(() => streamsByType(selectedSource.value, 'Subtitle'))
const subtitleOptions = computed(() => [
  { Index: null, DisplayTitle: '关闭字幕' },
  ...subtitleStreams.value,
])

const directPlayUrl = computed(() => {
  if (!props.item || !selectedSource.value) {
    return ''
  }

  return props.getPlaybackUrl(props.item.Id, selectedSource.value, {
    mediaSourceId: selectedSource.value.Id,
    playSessionId: playbackInfo.value?.PlaySessionId,
    audioStreamIndex: selectedAudioIndex.value ?? undefined,
    subtitleStreamIndex: selectedSubtitleIndex.value ?? undefined,
    forceTranscode: forceTranscode.value,
    maxStreamingBitrate: selectedMaxStreamingBitrate.value,
  })
})

const selectedMaxStreamingBitrate = computed(() => {
  if (qualityPreset.value === 'custom') {
    return normalizeBitrate(customMaxStreamingBitrate.value)
  }

  return PLAYBACK_QUALITY_OPTIONS.find((option) => option.value === qualityPreset.value)?.bitrate ?? null
})

const subtitleUrl = computed(() => {
  if (
    !props.item ||
    !selectedSource.value ||
    typeof selectedSubtitleIndex.value !== 'number'
  ) {
    return ''
  }

  return props.getSubtitleUrl(
    props.item.Id,
    selectedSource.value.Id,
    selectedSubtitleIndex.value,
  )
})

const displayTitle = computed(() => {
  if (!props.item) {
    return '选择一个媒体条目'
  }

  if (props.item.Type === 'Episode' && props.item.SeriesName) {
    const season = props.item.ParentIndexNumber
      ? `S${String(props.item.ParentIndexNumber).padStart(2, '0')}`
      : ''
    const episode = props.item.IndexNumber
      ? `E${String(props.item.IndexNumber).padStart(2, '0')}`
      : ''
    return `${props.item.SeriesName} ${season}${episode} · ${props.item.Name}`
  }

  return props.item.Name
})
const currentItem = computed(() => props.item)
const availableEpisodes = computed(() => props.episodes)

const playbackPosition = computed(() => diagnostics.value?.position ?? 0)
const playbackDuration = computed(() => diagnostics.value?.duration ?? 0)
const isPaused = computed(() => diagnostics.value?.pause === true)
const hasActivePlayback = computed(() => isSoftwareRendering.value || hasRenderedFrame.value)
const shouldShowControls = computed(
  () =>
    controlsVisible.value ||
    !hasActivePlayback.value ||
    isPaused.value ||
    showPlayerSettings.value ||
    showDebugPanel.value,
)
const startupMessage = computed(() => {
  if (isLoading.value) {
    return '正在获取播放信息'
  }

  if (isStartingPlayback.value) {
    return '正在启动播放器'
  }

  if (isSoftwareRendering.value && !hasRenderedFrame.value) {
    return '正在等待首帧'
  }

  return ''
})
const playbackProgress = computed(() => {
  if (!playbackDuration.value) {
    return 0
  }

  return Math.min(100, Math.max(0, (playbackPosition.value / playbackDuration.value) * 100))
})

const {
  episodeOptions,
  formatEpisodeOption,
  nextEpisode,
  previousEpisode,
  selectedEpisodeId,
} = useEpisodeQueue({
  item: currentItem,
  episodes: availableEpisodes,
  onSelectEpisode: (episode) => {
    void switchEpisode(episode)
  },
})

watch(
  () => props.item?.Id,
  async (itemId) => {
    playbackInfo.value = null
    selectedSourceId.value = ''
    selectedAudioIndex.value = null
    selectedSubtitleIndex.value = null
    forceTranscode.value = false
    qualityPreset.value = props.playbackPreferences.defaultQualityPreset
    customMaxStreamingBitrate.value = props.playbackPreferences.customMaxStreamingBitrate
    errorMessage.value = ''
    statusMessage.value = ''
    playbackReporting.resetProgressReporting()
    didAutoAdvance = false

    if (!itemId) {
      return
    }

    isLoading.value = true
    try {
      playbackInfo.value = await props.getPlaybackInfo(itemId, getResumePositionTicks())
      const firstSource = playbackInfo.value.MediaSources[0]
      selectedSourceId.value = firstSource?.Id ?? ''
      selectedAudioIndex.value = getPreferredStream(firstSource, 'Audio', props.playbackPreferences.preferredAudioLanguage)?.Index ?? null
      selectedSubtitleIndex.value = getPreferredStream(firstSource, 'Subtitle', props.playbackPreferences.preferredSubtitleLanguage)?.Index ?? null
      forceTranscode.value = props.playbackPreferences.defaultForceTranscode
      if (autoplayAfterItemChange) {
        autoplayAfterItemChange = false
        await nextTick()
        await playInMpv()
      }
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : '无法获取 Emby 播放信息'
    } finally {
      isLoading.value = false
    }
  },
  { immediate: true },
)

watch(mpvPath, (nextPath) => {
  localStorage.setItem(MPV_PATH_KEY, nextPath)
})

onMounted(() => {
  void refreshEngineStatus()
  window.addEventListener('keydown', handlePlayerKeydown)
  revealControls()
})

watch(diagnostics, (nextDiagnostics) => {
  if (typeof nextDiagnostics?.volume === 'number') {
    volumeLevel.value = nextDiagnostics.volume
  }
  void maybeAutoPlayNextEpisode(nextDiagnostics)
})

watch(
  [hasActivePlayback, isPaused, showPlayerSettings, showDebugPanel],
  () => {
    revealControls()
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', handlePlayerKeydown)
  void stopPlaybackForExit()
  softwareRenderer.stopRenderLoop()
  stopDiagnosticsLoop()
  clearHideControlsTimer()
  clearOsdTimer()
})

async function refreshEngineStatus() {
  try {
    engineStatus.value = await playerEngine.getEngineStatus()
  } catch {
    engineStatus.value = {
      libmpvAvailable: false,
      libmpvPath: null,
      message: '请使用 pnpm tauri:dev 启动桌面客户端以检测播放引擎',
    }
  }
}

async function playInMpv(startPositionSecondsOverride?: number) {
  const item = props.item
  const source = selectedSource.value
  if (!item || !source || !directPlayUrl.value) {
    return
  }

  errorMessage.value = ''
  statusMessage.value = ''
  softwareRenderer.resetSoftwareRendering()
  playbackReporting.resetProgressReporting()
  didStopForExit = false
  isStartingPlayback.value = true
  revealControls()

  try {
    await nextTick()
    const auth = props.getMpvAuthContext()
    const embedBounds = getPlayerBounds()
    const startPositionSeconds = startPositionSecondsOverride ?? getResumePositionSeconds()
    await playbackReporting.reportStart(
      item.Id,
      source.Id,
      playbackInfo.value?.PlaySessionId,
      secondsToTicks(startPositionSeconds),
    )
    const response = await playerEngine.playMedia({
      url: directPlayUrl.value,
      title: displayTitle.value,
      mpvPath: mpvPath.value,
      subtitleUrl: subtitleUrl.value || null,
      audioStreamIndex: selectedAudioIndex.value,
      subtitleStreamIndex: selectedSubtitleIndex.value,
      startPositionSeconds,
      embedBounds,
      renderMode: 'softwareCanvas',
      headers: [
        { name: 'X-Emby-Token', value: auth.token },
        { name: 'X-Emby-Authorization', value: auth.authorization },
        { name: 'User-Agent', value: auth.userAgent },
      ],
    })
    if (response.engine.includes('libmpv-render-sw')) {
      softwareRenderer.beginSoftwareRendering()
    } else {
      softwareRenderer.resetSoftwareRendering()
    }
    startDiagnosticsLoop()
    void refreshEngineStatus()
    showOsd(startPositionSeconds > 0 ? `从 ${formatTime(startPositionSeconds)} 继续播放` : '播放')
  } catch (error) {
    softwareRenderer.resetSoftwareRendering()
    errorMessage.value = normalizePlayerEngineError(error)
  } finally {
    isStartingPlayback.value = false
  }
}

async function applyPlaybackSettings() {
  if (!props.item || !selectedSource.value) {
    return
  }

  const resumeSeconds = playbackPosition.value || getResumePositionSeconds()
  await restartPlaybackFrom(resumeSeconds)
  showOsd('已应用播放设置')
}

async function togglePlayPause() {
  if (!isSoftwareRendering.value && !hasRenderedFrame.value) {
    await playInMpv()
    return
  }

  const wasPaused = isPaused.value
  await controlPlayer('togglePause')
  showOsd(wasPaused ? '播放' : '暂停')
}

async function seekRelative(seconds: number) {
  if (!playbackDuration.value) {
    return
  }

  const nextPosition = Math.min(
    playbackDuration.value,
    Math.max(0, playbackPosition.value + seconds),
  )
  await playerEngine.seek(nextPosition)
  await refreshDiagnostics()
  showOsd(seconds > 0 ? `快进 ${Math.abs(seconds)} 秒` : `后退 ${Math.abs(seconds)} 秒`)
  revealControls()
}

async function adjustVolume(delta: number) {
  const nextVolume = Math.min(100, Math.max(0, volumeLevel.value + delta))
  volumeLevel.value = nextVolume
  await setVolumeFromValue(nextVolume)
  showOsd(`音量 ${Math.round(nextVolume)}%`)
  revealControls()
}

function startDiagnosticsLoop() {
  stopDiagnosticsLoop()

  let attempts = 0
  const tick = async () => {
    attempts += 1
    await refreshDiagnostics()
    if (attempts < 12 || isSoftwareRendering.value) {
      diagnosticsLoopId = window.setTimeout(tick, 500)
    }
  }

  diagnosticsLoopId = window.setTimeout(tick, 200)
}

function stopDiagnosticsLoop() {
  if (diagnosticsLoopId) {
    window.clearTimeout(diagnosticsLoopId)
    diagnosticsLoopId = 0
  }
}

async function refreshDiagnostics() {
  try {
    diagnostics.value = await playerEngine.getDiagnostics()
    await maybeReportPlaybackProgress()
  } catch {
    diagnostics.value = null
  }
}

async function maybeReportPlaybackProgress() {
  const item = props.item
  const source = selectedSource.value
  const currentDiagnostics = diagnostics.value
  if (!currentDiagnostics) {
    return
  }

  const position = currentDiagnostics.position
  if (!item || !source || typeof position !== 'number') {
    return
  }

  try {
    await playbackReporting.reportProgress({
      itemId: item.Id,
      mediaSourceId: source.Id,
      playSessionId: playbackInfo.value?.PlaySessionId,
      positionTicks: secondsToTicks(position),
      isPaused: currentDiagnostics.pause === true,
      isMuted: currentDiagnostics.volume === 0,
      volumeLevel: currentDiagnostics.volume ?? 100,
    })
  } catch {
    // Playback reporting should not interrupt local playback controls.
  }
}

async function maybeAutoPlayNextEpisode(currentDiagnostics: PlayerDiagnostics | null) {
  if (!currentDiagnostics || didAutoAdvance || !nextEpisode.value) {
    return
  }

  const position = currentDiagnostics.position
  const duration = currentDiagnostics.duration
  if (
    typeof position !== 'number' ||
    typeof duration !== 'number' ||
    duration < 60 ||
    position < duration - 8
  ) {
    return
  }

  didAutoAdvance = true
  showOsd('即将播放下一集')
  await switchEpisode(nextEpisode.value)
}

function getPlayerBounds(): PlayerBounds | null {
  const rect = playerStageRef.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return null
  }

  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

async function markStopped() {
  const item = props.item
  const source = selectedSource.value
  if (!item || !source) {
    return
  }

  await playbackReporting.reportStopped(
    item.Id,
    source.Id,
    playbackInfo.value?.PlaySessionId,
    secondsToTicks(playbackPosition.value),
  )
  statusMessage.value = '已向 Emby 上报停止播放'
}

async function stopPlaybackForExit() {
  if (didStopForExit) {
    return
  }

  didStopForExit = true
  const wasRendering = isSoftwareRendering.value || hasRenderedFrame.value || Boolean(diagnostics.value)
  softwareRenderer.resetSoftwareRendering()
  stopDiagnosticsLoop()
  diagnostics.value = null

  if (!wasRendering) {
    return
  }

  try {
    await playerEngine.control('stop')
  } catch {
    // The player may already be stopped or unavailable during unmount.
  }

  try {
    await markStopped()
  } catch {
    // Reporting must not block navigation away from the player.
  }
}

async function stopPlaybackForSwitch() {
  softwareRenderer.resetSoftwareRendering()
  stopDiagnosticsLoop()
  diagnostics.value = null

  try {
    await playerEngine.control('stop')
  } catch {
    // The player may already be stopped while switching episodes.
  }
}

async function restartPlaybackFrom(positionSeconds: number) {
  softwareRenderer.resetSoftwareRendering()
  stopDiagnosticsLoop()
  diagnostics.value = null

  try {
    await playerEngine.control('stop')
  } catch {
    // The player may not be running yet while applying initial settings.
  }

  await playInMpv(positionSeconds)
}

async function leavePlayer() {
  await stopPlaybackForExit()
  emit('back')
}

async function switchEpisode(episode: EmbyItem) {
  if (episode.Id === props.item?.Id) {
    return
  }

  autoplayAfterItemChange = true
  await stopPlaybackForSwitch()
  emit('changeItem', episode)
}

async function controlPlayer(command: 'togglePause' | 'stop' | 'toggleFullscreen') {
  errorMessage.value = ''

  try {
    if (command === 'toggleFullscreen' && isSoftwareRendering.value) {
      await toggleStageFullscreen()
      showOsd('全屏')
      return
    }

    await playerEngine.control(command)
    if (command === 'togglePause') {
      await refreshDiagnostics()
    } else if (command === 'toggleFullscreen') {
      showOsd('全屏')
    } else {
      softwareRenderer.resetSoftwareRendering()
      stopDiagnosticsLoop()
      await markStopped()
      revealControls()
    }
  } catch (error) {
    errorMessage.value = normalizePlayerEngineError(error)
  }
}

async function seekFromValue(value: number | string) {
  const percent = Number(value)
  if (!Number.isFinite(percent) || !playbackDuration.value) {
    return
  }

  await playerEngine.seek((playbackDuration.value * percent) / 100)
  await refreshDiagnostics()
}

async function setVolumeFromValue(value: number | string) {
  const volume = Number(value)
  if (!Number.isFinite(volume)) {
    return
  }

  await playerEngine.setVolume(volume)
  await refreshDiagnostics()
}

function handlePlayerPointerMove() {
  revealControls()
}

function revealControls() {
  controlsVisible.value = true
  clearHideControlsTimer()

  if (!hasActivePlayback.value || isPaused.value || showPlayerSettings.value || showDebugPanel.value) {
    return
  }

  hideControlsTimer = window.setTimeout(() => {
    controlsVisible.value = false
  }, 2600)
}

function clearHideControlsTimer() {
  if (hideControlsTimer) {
    window.clearTimeout(hideControlsTimer)
    hideControlsTimer = 0
  }
}

function showOsd(message: string) {
  playerOsdMessage.value = message
  clearOsdTimer()
  osdTimer = window.setTimeout(() => {
    playerOsdMessage.value = ''
  }, 1100)
}

function clearOsdTimer() {
  if (osdTimer) {
    window.clearTimeout(osdTimer)
    osdTimer = 0
  }
}

function isEditingTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null
  if (!element) {
    return false
  }

  return Boolean(
    element.closest('input, textarea, select, [contenteditable="true"], .v-field'),
  )
}

function handlePlayerKeydown(event: KeyboardEvent) {
  if (isEditingTarget(event.target)) {
    return
  }

  const key = event.key.toLowerCase()
  if (key === ' ' || key === 'k') {
    event.preventDefault()
    void togglePlayPause()
    return
  }

  if (key === 'arrowleft' || key === 'j') {
    event.preventDefault()
    void seekRelative(-10)
    return
  }

  if (key === 'arrowright' || key === 'l') {
    event.preventDefault()
    void seekRelative(10)
    return
  }

  if (key === 'arrowup') {
    event.preventDefault()
    void adjustVolume(5)
    return
  }

  if (key === 'arrowdown') {
    event.preventDefault()
    void adjustVolume(-5)
    return
  }

  if (key === 'f') {
    event.preventDefault()
    void controlPlayer('toggleFullscreen')
    return
  }

  if (key === 'escape' && document.fullscreenElement) {
    event.preventDefault()
    void document.exitFullscreen()
    return
  }

  if ((key === ']' || key === '.') && nextEpisode.value) {
    event.preventDefault()
    void switchEpisode(nextEpisode.value)
    return
  }

  if ((key === '[' || key === ',') && previousEpisode.value) {
    event.preventDefault()
    void switchEpisode(previousEpisode.value)
  }
}

async function toggleStageFullscreen() {
  const stage = playerStageRef.value
  if (!stage) {
    return
  }

  if (document.fullscreenElement) {
    await document.exitFullscreen()
  } else {
    await stage.requestFullscreen()
  }
}

async function copyUrl() {
  if (!directPlayUrl.value) {
    return
  }

  await navigator.clipboard.writeText(directPlayUrl.value)
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1300)
}

function streamsByType(source: EmbyMediaSource | null, type: EmbyMediaStream['Type']) {
  return source?.MediaStreams?.filter((stream) => stream.Type === type) ?? []
}

function getDefaultStream(source: EmbyMediaSource | undefined, type: EmbyMediaStream['Type']) {
  const streams = source?.MediaStreams?.filter((stream) => stream.Type === type) ?? []
  return streams.find((stream) => stream.IsDefault) ?? streams[0]
}

function getPreferredStream(
  source: EmbyMediaSource | undefined,
  type: EmbyMediaStream['Type'],
  preferredLanguage: string,
) {
  const streams = source?.MediaStreams?.filter((stream) => stream.Type === type) ?? []
  const normalizedPreference = preferredLanguage.trim().toLowerCase()

  if (normalizedPreference) {
    const matched = streams.find((stream) => streamMatchesLanguage(stream, normalizedPreference))
    if (matched) {
      return matched
    }
  }

  if (type === 'Subtitle' && !normalizedPreference) {
    return null
  }

  return streams.find((stream) => stream.IsDefault) ?? streams[0] ?? null
}

function streamMatchesLanguage(stream: EmbyMediaStream, preferredLanguage: string) {
  const candidates = [stream.Language, stream.DisplayTitle, stream.Codec]
    .filter(Boolean)
    .map((value) => value?.toLowerCase())

  return candidates.some((candidate) => candidate?.includes(preferredLanguage))
}

function normalizeBitrate(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 12_000_000
  }

  return Math.round(Math.min(120_000_000, Math.max(1_000_000, value)))
}

function formatSource(source: EmbyMediaSource) {
  const parts = [
    source.Name,
    source.Container?.toUpperCase(),
    source.Bitrate ? `${Math.round(source.Bitrate / 1_000_000)} Mbps` : '',
  ].filter(Boolean)

  return parts.join(' · ') || source.Id
}

function formatStream(stream: Pick<EmbyMediaStream, 'DisplayTitle' | 'Language' | 'Codec'>) {
  return stream.DisplayTitle || [stream.Language, stream.Codec].filter(Boolean).join(' · ')
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00'
  }

  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  }

  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function getResumePositionTicks() {
  const positionTicks = props.item?.UserData?.PlaybackPositionTicks ?? 0
  const runtimeTicks = props.item?.RunTimeTicks ?? 0
  if (positionTicks <= 0) {
    return 0
  }

  if (runtimeTicks > 0 && positionTicks >= runtimeTicks - secondsToTicks(30)) {
    return 0
  }

  return positionTicks
}

function getResumePositionSeconds() {
  return ticksToSeconds(getResumePositionTicks())
}

function secondsToTicks(seconds: number) {
  return Math.max(0, Math.round(seconds * 10_000_000))
}

function ticksToSeconds(ticks: number) {
  return Math.max(0, ticks / 10_000_000)
}

</script>

<template>
  <aside class="player-panel">
    <div
      ref="playerStage"
      class="mpv-stage"
      :class="{ 'mpv-stage--controls-hidden': !shouldShowControls }"
      @mousemove="handlePlayerPointerMove"
      @mouseleave="revealControls"
    >
      <canvas
        ref="renderCanvas"
        class="mpv-stage__canvas"
      />

      <div v-if="!isSoftwareRendering || !hasRenderedFrame" class="mpv-stage__empty">
        <Loader2 v-if="startupMessage" class="mpv-stage__loader" :size="42" />
        <MonitorPlay v-else :size="46" />
        <p>{{ displayTitle }}</p>
        <span v-if="startupMessage">{{ startupMessage }}</span>
      </div>

      <div class="mpv-stage__topbar">
        <VBtn class="player-back" type="button" icon variant="tonal" @click="leavePlayer">
          <ArrowLeft :size="20" />
        </VBtn>
        <div class="mpv-stage__title">
          <strong>{{ displayTitle }}</strong>
        </div>
        <VBtn class="player-icon-button" type="button" icon variant="tonal" @click="showPlayerSettings = !showPlayerSettings">
          <MoreHorizontal :size="21" />
        </VBtn>
      </div>

      <div v-if="playerOsdMessage" class="mpv-stage__osd">
        {{ playerOsdMessage }}
      </div>

      <VBtn
        v-if="!isSoftwareRendering"
        class="mpv-stage__center-play"
        type="button"
        icon
        variant="tonal"
        :disabled="!directPlayUrl || isLoading"
        @click="playInMpv"
      >
        <Play :size="30" />
      </VBtn>

      <PlayerControls
        :playback-position="playbackPosition"
        :playback-duration="playbackDuration"
        :playback-progress="playbackProgress"
        :volume-level="volumeLevel"
        :can-play="Boolean(directPlayUrl)"
        :is-loading="isLoading"
        :is-paused="isPaused"
        :is-software-rendering="isSoftwareRendering"
        :previous-episode="previousEpisode"
        :next-episode="nextEpisode"
        :episode-options="episodeOptions"
        :selected-episode-id="selectedEpisodeId"
        :format-episode-option="formatEpisodeOption"
        :format-time="formatTime"
        @play-pause="togglePlayPause"
        @seek-relative="seekRelative"
        @seek-to-progress="seekFromValue"
        @stop="controlPlayer('stop')"
        @select-episode="selectedEpisodeId = $event"
        @switch-episode="switchEpisode"
        @update-volume="setVolumeFromValue"
        @open-settings="showPlayerSettings = !showPlayerSettings"
        @open-debug="showDebugPanel = !showDebugPanel"
        @toggle-fullscreen="controlPlayer('toggleFullscreen')"
      />

      <PlayerSettingsPanel
        :show-settings="showPlayerSettings"
        :show-debug="showDebugPanel"
        :playback-info="playbackInfo"
        :selected-source-id="selectedSourceId"
        :selected-audio-index="selectedAudioIndex"
        :selected-subtitle-index="selectedSubtitleIndex"
        :force-transcode="forceTranscode"
        :quality-preset="qualityPreset"
        :custom-max-streaming-bitrate="customMaxStreamingBitrate"
        :selected-source="selectedSource"
        :audio-streams="audioStreams"
        :subtitle-options="subtitleOptions"
        :engine-status="engineStatus"
        :diagnostics="diagnostics"
        :can-copy-url="Boolean(directPlayUrl)"
        :copied="copied"
        :format-source="formatSource"
        :format-stream="formatStream"
        @update-source="selectedSourceId = $event"
        @update-audio="selectedAudioIndex = $event"
        @update-subtitle="selectedSubtitleIndex = $event"
        @update-force-transcode="forceTranscode = $event"
        @update-quality-preset="qualityPreset = $event"
        @update-custom-max-streaming-bitrate="customMaxStreamingBitrate = normalizeBitrate($event)"
        @apply-playback-settings="applyPlaybackSettings"
        @toggle-debug="showDebugPanel = !showDebugPanel"
        @copy-url="copyUrl"
        @mark-stopped="markStopped"
      />

      <VAlert
        v-if="errorMessage"
        class="player-panel__notice"
        type="error"
        variant="tonal"
      >
        {{ errorMessage }}
      </VAlert>
      <VAlert
        v-if="statusMessage"
        class="player-panel__notice"
        type="info"
        variant="tonal"
      >
        {{ statusMessage }}
      </VAlert>
    </div>
  </aside>
</template>

<style scoped>
.player-panel {
  display: block;
  height: 100%;
  min-height: 0;
  min-width: 0;
}

.mpv-stage {
  position: relative;
  overflow: hidden;
  height: 100%;
  min-height: 0;
  color: var(--color-muted);
  background: #000000;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 10px;
  box-shadow: 0 30px 90px rgb(0 0 0 / 42%);
  animation: player-enter var(--motion-emphasized) both;
}

.mpv-stage--controls-hidden {
  cursor: none;
}

.mpv-stage__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #000000;
}

.mpv-stage__empty {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  padding: 24px;
  background: linear-gradient(180deg, rgb(10 14 20 / 92%), rgb(1 2 4 / 94%));
}

.mpv-stage__empty p,
.mpv-stage__empty span {
  margin: 0;
}

.mpv-stage__empty p {
  display: -webkit-box;
  max-width: min(720px, 80vw);
  overflow: hidden;
  color: var(--color-text);
  font-size: 1.28rem;
  font-weight: 650;
  line-height: 1.25;
  text-align: center;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.mpv-stage__empty span {
  color: rgb(255 255 255 / 62%);
  font-size: 0.86rem;
}

.mpv-stage__loader {
  color: var(--color-signal);
  animation: player-spin 0.9s linear infinite;
}

.mpv-stage__topbar,
.mpv-stage__controls {
  position: absolute;
  right: 0;
  left: 0;
  z-index: 3;
  opacity: 1;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
  pointer-events: auto;
}

.mpv-stage--controls-hidden .mpv-stage__topbar,
.mpv-stage--controls-hidden .mpv-stage__controls {
  opacity: 0;
  pointer-events: none;
}

.mpv-stage--controls-hidden .mpv-stage__topbar {
  transform: translateY(-14px);
}

.mpv-stage--controls-hidden .mpv-stage__controls {
  transform: translateY(18px);
}

.mpv-stage__topbar {
  top: 0;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 12px;
  padding: 14px 16px 56px;
  background: linear-gradient(180deg, rgb(0 0 0 / 68%), transparent);
}

.player-back,
.player-icon-button {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  color: #ffffff;
  background: rgb(255 255 255 / 10%);
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 50%;
  cursor: pointer;
  backdrop-filter: blur(18px);
}

.player-back:hover,
.player-icon-button:hover {
  background: rgb(255 255 255 / 16%);
}

.mpv-stage__title {
  display: block;
  min-width: 0;
}

.mpv-stage__title strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  color: #ffffff;
  font-size: 1.04rem;
  font-weight: 650;
  line-height: 1.28;
}

.mpv-stage__center-play {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 4;
  display: grid;
  width: 76px;
  height: 76px;
  place-items: center;
  color: #ffffff;
  background: color-mix(in srgb, var(--color-signal) 24%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-signal) 42%, white 12%);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  cursor: pointer;
  backdrop-filter: blur(18px);
}

.mpv-stage__center-play:disabled {
  cursor: default;
  opacity: 0.45;
}

.mpv-stage__osd {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 4;
  max-width: min(320px, calc(100% - 48px));
  padding: 12px 18px;
  color: #ffffff;
  background: rgb(0 0 0 / 54%);
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 10px;
  box-shadow: 0 16px 50px rgb(0 0 0 / 35%);
  font-size: 0.92rem;
  font-weight: 650;
  line-height: 1.2;
  text-align: center;
  transform: translate(-50%, -50%);
  backdrop-filter: blur(18px);
  animation: osd-enter 160ms ease both;
}

.player-panel__notice {
  position: absolute;
  right: 18px;
  bottom: 158px;
  left: 18px;
  z-index: 6;
}

@keyframes player-enter {
  from {
    opacity: 0;
    transform: scale(0.988);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes player-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes osd-enter {
  from {
    opacity: 0;
    transform: translate(-50%, -45%) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@media (max-width: 720px) {
  .player-panel,
  .mpv-stage {
    min-height: 0;
  }

  .mpv-stage__topbar {
    padding: 12px;
  }

  .player-panel__notice {
    right: 12px;
    bottom: 170px;
    left: 12px;
  }
}
</style>
