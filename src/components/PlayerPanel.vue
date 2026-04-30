<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import {
  ArrowLeft,
  Copy,
  Bug,
  ExternalLink,
  Loader2,
  Maximize2,
  MoreHorizontal,
  MonitorPlay,
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
import type {
  EmbyItem,
  EmbyMediaSource,
  EmbyMediaStream,
  EmbyPlaybackInfo,
  MpvAuthContext,
} from '../composables/useEmbyClient'

const MPV_PATH_KEY = 'vela_player_mpv_path'

interface MpvPlayResponse {
  pid: number
  engine: string
}

interface PlayerEngineStatus {
  libmpvAvailable: boolean
  libmpvPath: string | null
  message: string
}

interface PlayerDiagnostics {
  renderMode: string
  path: string | null
  videoCodec: string | null
  audioCodec: string | null
  position: number | null
  duration: number | null
  voConfigured: boolean | null
  pause: boolean | null
  idleActive: boolean | null
  coreIdle: boolean | null
  volume: number | null
  events: string[]
}

interface PlayerBounds {
  x: number
  y: number
  width: number
  height: number
}

const props = defineProps<{
  item: Readonly<EmbyItem | null>
  episodes: readonly EmbyItem[]
  getPlaybackInfo: (itemId: string) => Promise<EmbyPlaybackInfo>
  getPlaybackUrl: (
    itemId: string,
    source: EmbyMediaSource,
    options?: {
      mediaSourceId?: string
      playSessionId?: string
      audioStreamIndex?: number
      subtitleStreamIndex?: number
      forceTranscode?: boolean
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

const playbackInfo = shallowRef<EmbyPlaybackInfo | null>(null)
const selectedSourceId = shallowRef('')
const selectedAudioIndex = shallowRef<number | null>(null)
const selectedSubtitleIndex = shallowRef<number | null>(null)
const mpvPath = shallowRef(localStorage.getItem(MPV_PATH_KEY) ?? '')
const isLoading = shallowRef(false)
const errorMessage = shallowRef('')
const statusMessage = shallowRef('')
const engineStatus = shallowRef<PlayerEngineStatus | null>(null)
const diagnostics = shallowRef<PlayerDiagnostics | null>(null)
const copied = shallowRef(false)
const isSoftwareRendering = shallowRef(false)
const hasRenderedFrame = shallowRef(false)
const showPlayerSettings = shallowRef(false)
const showDebugPanel = shallowRef(false)
const volumeLevel = shallowRef(100)
const controlsVisible = shallowRef(true)
const isStartingPlayback = shallowRef(false)
const playerOsdMessage = shallowRef('')
const playerStageRef = useTemplateRef<HTMLElement>('playerStage')
const renderCanvasRef = useTemplateRef<HTMLCanvasElement>('renderCanvas')
let renderLoopId = 0
let diagnosticsLoopId = 0
let hideControlsTimer = 0
let osdTimer = 0
let lastProgressReportAt = 0
let didStopForExit = false
let didAutoAdvance = false
let autoplayAfterItemChange = false

const selectedSource = computed(() => {
  const sources = playbackInfo.value?.MediaSources ?? []
  return sources.find((source) => source.Id === selectedSourceId.value) ?? sources[0] ?? null
})

const audioStreams = computed(() => streamsByType(selectedSource.value, 'Audio'))
const subtitleStreams = computed(() => streamsByType(selectedSource.value, 'Subtitle'))

const directPlayUrl = computed(() => {
  if (!props.item || !selectedSource.value) {
    return ''
  }

  return props.getPlaybackUrl(props.item.Id, selectedSource.value, {
    mediaSourceId: selectedSource.value.Id,
    playSessionId: playbackInfo.value?.PlaySessionId,
    audioStreamIndex: selectedAudioIndex.value ?? undefined,
    subtitleStreamIndex: selectedSubtitleIndex.value ?? undefined,
    forceTranscode: false,
  })
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

const episodeOptions = computed(() => {
  if (props.item?.Type !== 'Episode') {
    return []
  }

  const currentSeriesId = props.item.SeriesId
  const currentSeriesName = props.item.SeriesName
  return [...props.episodes]
    .filter((episode) => {
      if (episode.Type !== 'Episode') {
        return false
      }

      if (currentSeriesId && episode.SeriesId) {
        return episode.SeriesId === currentSeriesId
      }

      return !currentSeriesName || episode.SeriesName === currentSeriesName
    })
    .sort(compareEpisodes)
})

const currentEpisodeIndex = computed(() => {
  if (!props.item || !episodeOptions.value.length) {
    return -1
  }

  return episodeOptions.value.findIndex((episode) => episode.Id === props.item?.Id)
})

const previousEpisode = computed(() => {
  const index = currentEpisodeIndex.value
  return index > 0 ? episodeOptions.value[index - 1] : null
})

const nextEpisode = computed(() => {
  const index = currentEpisodeIndex.value
  return index >= 0 && index < episodeOptions.value.length - 1
    ? episodeOptions.value[index + 1]
    : null
})

const selectedEpisodeId = computed({
  get: () => props.item?.Id ?? '',
  set: (episodeId: string) => {
    const episode = episodeOptions.value.find((candidate) => candidate.Id === episodeId)
    if (episode) {
      void switchEpisode(episode)
    }
  },
})

watch(
  () => props.item?.Id,
  async (itemId) => {
    playbackInfo.value = null
    selectedSourceId.value = ''
    selectedAudioIndex.value = null
    selectedSubtitleIndex.value = null
    errorMessage.value = ''
    statusMessage.value = ''
    lastProgressReportAt = 0
    didAutoAdvance = false

    if (!itemId) {
      return
    }

    isLoading.value = true
    try {
      playbackInfo.value = await props.getPlaybackInfo(itemId)
      const firstSource = playbackInfo.value.MediaSources[0]
      selectedSourceId.value = firstSource?.Id ?? ''
      selectedAudioIndex.value = getDefaultStream(firstSource, 'Audio')?.Index ?? null
      selectedSubtitleIndex.value = null
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
  stopRenderLoop()
  stopDiagnosticsLoop()
  clearHideControlsTimer()
  clearOsdTimer()
})

async function refreshEngineStatus() {
  try {
    engineStatus.value = await invoke<PlayerEngineStatus>('player_engine_status')
  } catch {
    engineStatus.value = {
      libmpvAvailable: false,
      libmpvPath: null,
      message: '请使用 pnpm tauri:dev 启动桌面客户端以检测播放引擎',
    }
  }
}

async function playInMpv() {
  const item = props.item
  const source = selectedSource.value
  if (!item || !source || !directPlayUrl.value) {
    return
  }

  errorMessage.value = ''
  statusMessage.value = ''
  hasRenderedFrame.value = false
  lastProgressReportAt = 0
  didStopForExit = false
  isStartingPlayback.value = true
  revealControls()

  try {
    await nextTick()
    const auth = props.getMpvAuthContext()
    const embedBounds = getPlayerBounds()
    await props.reportPlaybackStart(item.Id, source.Id, playbackInfo.value?.PlaySessionId, 0)
    const response = await invoke<MpvPlayResponse>('play_media', {
      request: {
        url: directPlayUrl.value,
        title: displayTitle.value,
        mpvPath: mpvPath.value,
        subtitleUrl: subtitleUrl.value || null,
        startPositionSeconds: 0,
        embedBounds,
        renderMode: 'softwareCanvas',
        headers: [
          { name: 'X-Emby-Token', value: auth.token },
          { name: 'X-Emby-Authorization', value: auth.authorization },
        ],
      },
    })
    isSoftwareRendering.value = response.engine.includes('libmpv-render-sw')
    if (isSoftwareRendering.value) {
      startRenderLoop()
    } else {
      stopRenderLoop()
    }
    startDiagnosticsLoop()
    void refreshEngineStatus()
    showOsd('播放')
  } catch (error) {
    isSoftwareRendering.value = false
    errorMessage.value = normalizeInvokeError(error)
  } finally {
    isStartingPlayback.value = false
  }
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
  await invoke('seek_player', { seconds: nextPosition })
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

function startRenderLoop() {
  stopRenderLoop()

  const draw = async () => {
    if (!isSoftwareRendering.value) {
      return
    }

    await renderFrameToCanvas()
    renderLoopId = window.setTimeout(draw, 66)
  }

  renderLoopId = window.setTimeout(draw, 0)
}

function stopRenderLoop() {
  if (renderLoopId) {
    window.clearTimeout(renderLoopId)
    renderLoopId = 0
  }
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
    diagnostics.value = await invoke<PlayerDiagnostics>('player_diagnostics')
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

  const now = Date.now()
  if (now - lastProgressReportAt < 10_000) {
    return
  }

  lastProgressReportAt = now
  try {
    await props.reportPlaybackProgress({
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

async function renderFrameToCanvas() {
  const canvas = renderCanvasRef.value
  const bounds = getPlayerBounds()
  if (!canvas || !bounds) {
    return
  }

  const width = Math.max(2, Math.min(960, Math.round(bounds.width)))
  const height = Math.max(2, Math.round(width * (bounds.height / bounds.width)))

  try {
    const frame = await invoke<{
      width: number
      height: number
      stride: number
      rgbaBase64: string
    }>('render_player_frame', {
      request: { width, height },
    })
    drawRgbaFrame(canvas, frame)
    hasRenderedFrame.value = true
  } catch (error) {
    errorMessage.value = normalizeInvokeError(error)
    stopRenderLoop()
  }
}

function drawRgbaFrame(
  canvas: HTMLCanvasElement,
  frame: { width: number; height: number; rgbaBase64: string },
) {
  const context = canvas.getContext('2d')
  if (!context) {
    return
  }

  canvas.width = frame.width
  canvas.height = frame.height
  const binary = atob(frame.rgbaBase64)
  const pixels = new Uint8ClampedArray(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    pixels[index] = binary.charCodeAt(index)
  }
  for (let index = 3; index < pixels.length; index += 4) {
    pixels[index] = 255
  }

  context.putImageData(new ImageData(pixels, frame.width, frame.height), 0, 0)
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

  await props.reportPlaybackStopped(
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
  stopRenderLoop()
  stopDiagnosticsLoop()
  isSoftwareRendering.value = false
  hasRenderedFrame.value = false
  diagnostics.value = null

  if (!wasRendering) {
    return
  }

  try {
    await invoke('control_player', { command: 'stop' })
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
  stopRenderLoop()
  stopDiagnosticsLoop()
  isSoftwareRendering.value = false
  hasRenderedFrame.value = false
  diagnostics.value = null

  try {
    await invoke('control_player', { command: 'stop' })
  } catch {
    // The player may already be stopped while switching episodes.
  }
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

    await invoke('control_player', { command })
    if (command === 'togglePause') {
      await refreshDiagnostics()
    } else if (command === 'toggleFullscreen') {
      showOsd('全屏')
    } else {
      isSoftwareRendering.value = false
      hasRenderedFrame.value = false
      stopRenderLoop()
      stopDiagnosticsLoop()
      await markStopped()
      revealControls()
    }
  } catch (error) {
    errorMessage.value = normalizeInvokeError(error)
  }
}

async function seekFromValue(value: number | string) {
  const percent = Number(value)
  if (!Number.isFinite(percent) || !playbackDuration.value) {
    return
  }

  await invoke('seek_player', {
    seconds: (playbackDuration.value * percent) / 100,
  })
  await refreshDiagnostics()
}

async function setVolumeFromValue(value: number | string) {
  const volume = Number(value)
  if (!Number.isFinite(volume)) {
    return
  }

  await invoke('set_player_volume', { volume })
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

function formatSource(source: EmbyMediaSource) {
  const parts = [
    source.Name,
    source.Container?.toUpperCase(),
    source.Bitrate ? `${Math.round(source.Bitrate / 1_000_000)} Mbps` : '',
  ].filter(Boolean)

  return parts.join(' · ') || source.Id
}

function formatStream(stream: EmbyMediaStream) {
  return stream.DisplayTitle || [stream.Language, stream.Codec].filter(Boolean).join(' · ')
}

function compareEpisodes(first: EmbyItem, second: EmbyItem) {
  const firstSeason = first.ParentIndexNumber ?? 0
  const secondSeason = second.ParentIndexNumber ?? 0
  if (firstSeason !== secondSeason) {
    return firstSeason - secondSeason
  }

  const firstEpisode = first.IndexNumber ?? 0
  const secondEpisode = second.IndexNumber ?? 0
  if (firstEpisode !== secondEpisode) {
    return firstEpisode - secondEpisode
  }

  return first.Name.localeCompare(second.Name)
}

function formatEpisodeOption(episode: EmbyItem) {
  const season = episode.ParentIndexNumber
    ? `S${String(episode.ParentIndexNumber).padStart(2, '0')}`
    : 'S00'
  const episodeNumber = episode.IndexNumber
    ? `E${String(episode.IndexNumber).padStart(2, '0')}`
    : 'EP'
  return `${season}${episodeNumber}  ${episode.Name}`
}

function normalizeInvokeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('__TAURI__') || message.includes('ipc')) {
    return '当前运行在浏览器开发页中。请使用 pnpm tauri:dev 启动桌面客户端。'
  }

  return message
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

function secondsToTicks(seconds: number) {
  return Math.max(0, Math.round(seconds * 10_000_000))
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
            @end="seekFromValue"
          />
          <span class="mpv-stage__time">{{ formatTime(playbackDuration) }}</span>
        </div>

        <div class="mpv-stage__control-row">
          <VBtn
            type="button"
            icon
            variant="tonal"
            :disabled="!previousEpisode"
            @click="previousEpisode && switchEpisode(previousEpisode)"
          >
            <SkipBack :size="18" />
          </VBtn>
          <VBtn
            type="button"
            icon
            variant="tonal"
            :disabled="!playbackDuration"
            @click="seekRelative(-10)"
          >
            <RotateCcw :size="18" />
          </VBtn>
          <VBtn
            type="button"
            icon
            variant="tonal"
            :disabled="!directPlayUrl || isLoading"
            @click="togglePlayPause"
          >
            <Pause v-if="!isPaused && isSoftwareRendering" :size="19" />
            <Play v-else :size="19" />
          </VBtn>
          <VBtn
            type="button"
            icon
            variant="tonal"
            :disabled="!playbackDuration"
            @click="seekRelative(10)"
          >
            <RotateCw :size="18" />
          </VBtn>
          <VBtn
            type="button"
            icon
            variant="tonal"
            :disabled="!nextEpisode"
            @click="nextEpisode && switchEpisode(nextEpisode)"
          >
            <SkipForward :size="18" />
          </VBtn>
          <VBtn type="button" icon variant="tonal" @click="controlPlayer('stop')">
            <Square :size="18" />
          </VBtn>
          <VSelect
            v-if="episodeOptions.length"
            v-model="selectedEpisodeId"
            class="mpv-stage__episode-select"
            :items="episodeOptions"
            :item-title="formatEpisodeOption"
            item-value="Id"
            density="compact"
            variant="solo-filled"
            hide-details
            aria-label="选择分集"
          />
          <div class="mpv-stage__volume-group">
            <Volume2 :size="18" class="mpv-stage__volume-icon" />
            <VSlider
              v-model="volumeLevel"
              class="mpv-stage__volume"
              min="0"
              max="100"
              step="1"
              color="primary"
              track-color="rgba(255, 255, 255, 0.2)"
              hide-details
              @end="setVolumeFromValue"
            />
          </div>
          <VBtn type="button" icon variant="tonal" @click="showPlayerSettings = !showPlayerSettings">
            <Settings2 :size="18" />
          </VBtn>
          <VBtn type="button" icon variant="tonal" @click="showDebugPanel = !showDebugPanel">
            <Bug :size="18" />
          </VBtn>
          <VBtn type="button" icon variant="tonal" @click="controlPlayer('toggleFullscreen')">
            <Maximize2 :size="18" />
          </VBtn>
        </div>
      </div>

      <div v-if="showPlayerSettings" class="player-settings">
        <div v-if="playbackInfo" class="player-settings__grid">
          <VSelect
            v-model="selectedSourceId"
            label="媒体源"
            :items="playbackInfo.MediaSources"
            :item-title="formatSource"
            item-value="Id"
            hide-details
          />

          <VSelect
            v-model.number="selectedAudioIndex"
            label="音轨"
            :items="audioStreams"
            :item-title="formatStream"
            item-value="Index"
            hide-details
          />

          <VSelect
            v-model="selectedSubtitleIndex"
            label="字幕"
            :items="[{ Index: null, DisplayTitle: '关闭字幕' }, ...subtitleStreams]"
            :item-title="formatStream"
            item-value="Index"
            hide-details
          />
        </div>

        <div class="player-settings__actions">
          <VBtn variant="tonal" type="button" @click="showDebugPanel = !showDebugPanel">
            <template #prepend>
              <Bug :size="17" />
            </template>
            Debug
          </VBtn>
        </div>
      </div>

      <div v-if="showDebugPanel" class="player-settings player-settings--debug">
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
          <VBtn variant="tonal" type="button" :disabled="!directPlayUrl" @click="copyUrl">
            <template #prepend>
              <Copy :size="17" />
            </template>
            {{ copied ? '已复制' : '复制直链' }}
          </VBtn>
          <VBtn variant="tonal" type="button" :disabled="!selectedSource" @click="markStopped">
            <template #prepend>
              <ExternalLink :size="17" />
            </template>
            上报停止
          </VBtn>
        </div>
      </div>

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

.mpv-stage__controls {
  bottom: 0;
  display: grid;
  gap: 10px;
  padding: 54px 22px 18px;
  background: linear-gradient(0deg, rgb(0 0 0 / 84%) 0%, rgb(0 0 0 / 48%) 58%, transparent 100%);
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

.player-panel__notice {
  position: absolute;
  right: 18px;
  bottom: 158px;
  left: 18px;
  z-index: 6;
}

.player-settings {
  position: absolute;
  right: 18px;
  bottom: 126px;
  z-index: 5;
  display: grid;
  width: min(560px, calc(100% - 36px));
  gap: 12px;
  padding: 14px;
  background: rgb(8 11 16 / 88%);
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 10px;
  box-shadow: 0 22px 70px rgb(0 0 0 / 42%);
  backdrop-filter: blur(22px);
  animation: settings-enter var(--motion-medium) both;
}

.player-settings__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
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
  color: var(--color-muted);
  font-size: 0.78rem;
}

.player-debug strong {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
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

@keyframes settings-enter {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
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

  .player-panel__notice {
    right: 12px;
    bottom: 170px;
    left: 12px;
  }
}
</style>
