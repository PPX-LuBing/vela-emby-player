<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import {
  ArrowLeft,
  BookOpen,
  Loader2,
  ListMusic,
  MoreHorizontal,
  MonitorPlay,
  Play,
  SkipForward,
} from 'lucide-vue-next'
import type {
  EmbyItem,
  EmbyMediaSource,
  EmbyMediaStream,
  EmbyPlaybackInfo,
  MpvAuthContext,
  PlaybackPreferences,
  PlaybackQualityPreset,
} from '../composables/useEmbyClient'
import { formatPlaybackMode, type PlaybackMode } from '../composables/usePlaybackQueue'
import { useEpisodeQueue } from '../composables/useEpisodeQueue'
import PlayerChapterPanel from './PlayerChapterPanel.vue'
import PlayerControls from './PlayerControls.vue'
import PlayerQueuePanel from './PlayerQueuePanel.vue'
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
import {
  bitrateForQualityPreset,
  getPreferredStream,
  normalizeBitrate,
} from '../composables/playbackPreferences'
import {
  createPlaybackChapters,
  getActiveSkippableChapter,
  type PlaybackChapter,
} from '../composables/playbackChapters'
import { formatAudioTrackNumber, getResumePositionSeconds, getResumePositionTicks, secondsToTicks } from '../composables/mediaItemDisplay'

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
      itemType?: string
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
  queueItems: readonly EmbyItem[]
  activeQueueItemId: string
  playbackMode: PlaybackMode
  nextQueueItem: Readonly<EmbyItem | null>
  previousQueueItem: Readonly<EmbyItem | null>
}>()

const emit = defineEmits<{
  back: []
  changeItem: [item: EmbyItem]
  cyclePlaybackMode: []
  clearQueue: []
  removeQueueItem: [itemId: string]
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
const showQueuePanel = shallowRef(false)
const showChapterPanel = shallowRef(false)
const volumeLevel = shallowRef(100)
const controlsVisible = shallowRef(true)
const isStartingPlayback = shallowRef(false)
const isPreparingFirstFrame = shallowRef(false)
const playerOsdMessage = shallowRef('')
const playerStageRef = useTemplateRef<HTMLElement>('playerStage')
const renderCanvasRef = useTemplateRef<HTMLCanvasElement>('renderCanvas')
let diagnosticsLoopId = 0
let hideControlsTimer = 0
let osdTimer = 0
let didStopForExit = false
let didAutoAdvance = false
let lastPlaybackPositionSeconds = 0
let playbackStartRequestId = 0

useEventListener(window, 'keydown', handlePlayerKeydown)

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
    isPreparingFirstFrame.value = false
  },
  onVisibleFrame: () => {
    isPreparingFirstFrame.value = false
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
    itemType: props.item.Type,
    maxStreamingBitrate: selectedMaxStreamingBitrate.value,
  })
})

const selectedMaxStreamingBitrate = computed(() => {
  return bitrateForQualityPreset(qualityPreset.value, customMaxStreamingBitrate.value)
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

  if (props.item.Type === 'Audio') {
    const parts = [
      props.item.Album || props.item.AlbumArtists?.[0] || props.item.Artists?.[0],
      formatAudioTrackNumber(props.item),
      props.item.Name,
    ].filter(Boolean)
    return parts.join(' · ')
  }

  if (props.item.Type === 'MusicAlbum') {
    return [props.item.AlbumArtist || props.item.AlbumArtists?.[0] || props.item.Artists?.[0], props.item.Name]
      .filter(Boolean)
      .join(' · ') || props.item.Name
  }

  if (props.item.Type === 'MusicArtist') {
    return props.item.Name
  }

  if (props.item.Type === 'TvChannel' || props.item.Type === 'Channel') {
    return [props.item.ChannelNumber || props.item.Number, props.item.Name, props.item.CurrentProgram?.Name]
      .filter(Boolean)
      .join(' · ')
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
    showDebugPanel.value ||
    showQueuePanel.value,
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
const playbackLoadingMessage = computed(() => {
  if (isStartingPlayback.value) {
    return '正在启动播放器'
  }

  if (isPreparingFirstFrame.value || (isSoftwareRendering.value && !hasRenderedFrame.value)) {
    return '正在缓冲首帧'
  }

  return ''
})
const playbackProgress = computed(() => {
  if (!playbackDuration.value) {
    return 0
  }

  return Math.min(100, Math.max(0, (playbackPosition.value / playbackDuration.value) * 100))
})
const playbackChapters = computed(() => createPlaybackChapters(props.item?.Chapters, playbackDuration.value))
const activeSkippableChapter = computed(() => getActiveSkippableChapter(playbackChapters.value, playbackPosition.value))

const isLiveTvPlayback = computed(() => props.item?.Type === 'TvChannel' || props.item?.Type === 'Channel')
const canRetryPlayback = computed(() => Boolean(
  errorMessage.value &&
  props.item &&
  !isLoading.value &&
  !isStartingPlayback.value,
))
const canRetryWithTranscode = computed(() => canRetryPlayback.value && !forceTranscode.value && !isLiveTvPlayback.value)

const queueLabel = computed(() => {
  if (props.item?.Type === 'MusicArtist' || props.item?.Type === 'MusicAlbum' || props.item?.Type === 'Audio') {
    return '选择曲目'
  }

  return '选择分集'
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

const displayPreviousItem = computed(() => props.previousQueueItem ?? previousEpisode.value)
const displayNextItem = computed(() => props.nextQueueItem ?? nextEpisode.value)

watch(
  () => props.item?.Id,
  async (itemId, _previousItemId, onCleanup) => {
    let isStaleRequest = false
    onCleanup(() => {
      isStaleRequest = true
    })

    playbackStartRequestId += 1
    playbackInfo.value = null
    selectedSourceId.value = ''
    selectedAudioIndex.value = null
    selectedSubtitleIndex.value = null
    forceTranscode.value = false
    qualityPreset.value = props.playbackPreferences.defaultQualityPreset
    customMaxStreamingBitrate.value = props.playbackPreferences.customMaxStreamingBitrate
    errorMessage.value = ''
    statusMessage.value = ''
    isStartingPlayback.value = false
    isPreparingFirstFrame.value = false
    playbackReporting.resetProgressReporting()
    didAutoAdvance = false
    lastPlaybackPositionSeconds = 0

    if (!itemId) {
      return
    }

    const requestItem = props.item

    isLoading.value = true
    try {
      const nextPlaybackInfo = await props.getPlaybackInfo(itemId, getResumePositionTicks(requestItem))
      if (isStaleRequest || props.item?.Id !== itemId) {
        return
      }

      playbackInfo.value = nextPlaybackInfo
      const firstSource = nextPlaybackInfo.MediaSources[0]
      applyDefaultPlaybackStreams(firstSource)
      forceTranscode.value = props.playbackPreferences.defaultForceTranscode
      await nextTick()
      if (isStaleRequest || props.item?.Id !== itemId) {
        return
      }

      await playInMpv()
    } catch (error) {
      if (isStaleRequest || props.item?.Id !== itemId) {
        return
      }

      errorMessage.value =
        error instanceof Error ? error.message : '无法获取 Emby 播放信息'
    } finally {
      if (!isStaleRequest && props.item?.Id === itemId) {
        isLoading.value = false
      }
    }
  },
  { immediate: true },
)

watch(mpvPath, (nextPath) => {
  localStorage.setItem(MPV_PATH_KEY, nextPath)
})

onMounted(() => {
  void refreshEngineStatus()
  revealControls()
})

watch(diagnostics, (nextDiagnostics) => {
  if (typeof nextDiagnostics?.volume === 'number') {
    volumeLevel.value = nextDiagnostics.volume
  }
  if (typeof nextDiagnostics?.position === 'number') {
    lastPlaybackPositionSeconds = nextDiagnostics.position
  }
  void maybeAutoPlayNextEpisode(nextDiagnostics)
})

watch(
  [hasActivePlayback, isPaused, showPlayerSettings, showDebugPanel, showQueuePanel, showChapterPanel],
  () => {
    revealControls()
  },
)

onUnmounted(() => {
  playbackStartRequestId += 1
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

async function playInMpv(startPositionSecondsOverride?: unknown) {
  const item = props.item
  const source = selectedSource.value
  const playbackUrl = directPlayUrl.value
  if (!item || !source || !playbackUrl) {
    if (item && !source) {
      errorMessage.value = '当前媒体没有可用媒体源。请刷新媒体详情，或在 Emby 服务器检查该媒体文件。'
    }
    return
  }

  const requestId = ++playbackStartRequestId
  const itemId = item.Id
  const sourceId = source.Id
  errorMessage.value = ''
  statusMessage.value = ''
  softwareRenderer.resetSoftwareRendering()
  playbackReporting.resetProgressReporting()
  didStopForExit = false
  lastPlaybackPositionSeconds = 0
  isPreparingFirstFrame.value = true
  isStartingPlayback.value = true
  revealControls()
  let didReportStart = false
  let startPositionSeconds = 0
  let playSessionId: string | undefined

  try {
    await nextTick()
    if (isPlaybackStartStale(requestId, itemId, sourceId)) {
      return
    }

    const auth = props.getMpvAuthContext()
    const embedBounds = getPlayerBounds()
    const playbackTitle = displayTitle.value
    const playbackSubtitleUrl = subtitleUrl.value || null
    const audioStreamIndex = selectedAudioIndex.value
    const subtitleStreamIndex = selectedSubtitleIndex.value
    playSessionId = playbackInfo.value?.PlaySessionId
    startPositionSeconds = typeof startPositionSecondsOverride === 'number'
      ? startPositionSecondsOverride
      : getResumePositionSeconds(item)
    await playbackReporting.reportStart(
      itemId,
      sourceId,
      playSessionId,
      secondsToTicks(startPositionSeconds),
    )
    didReportStart = true
    if (isPlaybackStartStale(requestId, itemId, sourceId)) {
      await reportStoppedFor(itemId, sourceId, playSessionId, startPositionSeconds)
      return
    }

    const response = await playerEngine.playMedia({
      url: playbackUrl,
      title: playbackTitle,
      mpvPath: mpvPath.value,
      subtitleUrl: playbackSubtitleUrl,
      audioStreamIndex,
      subtitleStreamIndex,
      startPositionSeconds,
      embedBounds,
      renderMode: 'softwareCanvas',
      headers: [
        { name: 'X-Emby-Token', value: auth.token },
        { name: 'X-Emby-Authorization', value: auth.authorization },
        { name: 'User-Agent', value: auth.userAgent },
      ],
    })
    if (isPlaybackStartStale(requestId, itemId, sourceId)) {
      await reportStoppedFor(itemId, sourceId, playSessionId, startPositionSeconds)
      return
    }

    if (response.engine.includes('libmpv-render-sw')) {
      softwareRenderer.beginSoftwareRendering()
    } else {
      softwareRenderer.resetSoftwareRendering()
    }
    startDiagnosticsLoop()
    void refreshEngineStatus()
    showOsd(startPositionSeconds > 0 ? `从 ${formatTime(startPositionSeconds)} 继续播放` : '播放')
  } catch (error) {
    if (isPlaybackStartStale(requestId, itemId, sourceId)) {
      if (didReportStart) {
        reportStoppedFor(itemId, sourceId, playSessionId, startPositionSeconds).catch(() => {
          // Stale startup cleanup must not block the active playback request.
        })
      }
      return
    }

    softwareRenderer.resetSoftwareRendering()
    isPreparingFirstFrame.value = false
    if (didReportStart) {
      reportStoppedFor(itemId, sourceId, playSessionId, startPositionSeconds).catch(() => {
        // A failed local startup should not leave the user stuck on reporting cleanup.
      })
    }
    errorMessage.value = normalizePlaybackStartError(error, forceTranscode.value)
  } finally {
    if (!isPlaybackStartStale(requestId, itemId, sourceId)) {
      isStartingPlayback.value = false
    }
  }
}

function isPlaybackStartStale(requestId: number, itemId: string, sourceId: string) {
  return requestId !== playbackStartRequestId || props.item?.Id !== itemId || selectedSource.value?.Id !== sourceId
}

async function reportStoppedFor(
  itemId: string,
  sourceId: string,
  playSessionId: string | undefined,
  positionSeconds: number,
) {
  await playbackReporting.reportStopped(
    itemId,
    sourceId,
    playSessionId,
    secondsToTicks(positionSeconds),
  )
}

async function applyPlaybackSettings() {
  if (!props.item || !selectedSource.value) {
    return
  }

  const resumeSeconds = playbackPosition.value || getResumePositionSeconds(props.item)
  await restartPlaybackFrom(resumeSeconds)
  showOsd('已应用播放设置')
}

async function retryPlayback() {
  if (!props.item) {
    return
  }

  const resumeSeconds = playbackPosition.value || lastPlaybackPositionSeconds || getResumePositionSeconds(props.item)
  if (selectedSource.value) {
    await playInMpv(resumeSeconds)
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    playbackInfo.value = await props.getPlaybackInfo(props.item.Id, secondsToTicks(resumeSeconds))
    applyDefaultPlaybackStreams(playbackInfo.value.MediaSources[0])
    await nextTick()
    await playInMpv(resumeSeconds)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '无法重新获取 Emby 播放信息'
  } finally {
    isLoading.value = false
  }
}

async function retryWithTranscode() {
  forceTranscode.value = true
  await retryPlayback()
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
  const nextItem = props.nextQueueItem ?? nextEpisode.value
  if (!currentDiagnostics || didAutoAdvance || !nextItem) {
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
  await switchEpisode(nextItem)
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

async function markStopped(positionSeconds = playbackPosition.value || lastPlaybackPositionSeconds) {
  if (!canReportPlaybackStop()) {
    return
  }

  didStopForExit = true
  await reportStoppedAt(positionSeconds)
  statusMessage.value = '已向 Emby 上报停止播放'
}

function canReportPlaybackStop() {
  return Boolean(props.item && selectedSource.value && !didStopForExit)
}

async function reportStoppedAt(positionSeconds: number) {
  const item = props.item
  const source = selectedSource.value
  if (!item || !source) {
    return
  }

  await playbackReporting.reportStopped(
    item.Id,
    source.Id,
    playbackInfo.value?.PlaySessionId,
    secondsToTicks(positionSeconds),
  )
}

async function stopPlaybackForExit() {
  if (didStopForExit) {
    return
  }

  didStopForExit = true
  const wasRendering = isSoftwareRendering.value || hasRenderedFrame.value || Boolean(diagnostics.value)
  const stoppedPositionSeconds = playbackPosition.value || lastPlaybackPositionSeconds
  softwareRenderer.resetSoftwareRendering()
  isPreparingFirstFrame.value = false
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
    await reportStoppedAt(stoppedPositionSeconds)
  } catch {
    // Reporting must not block navigation away from the player.
  }
}

async function stopPlaybackForSwitch() {
  if (didStopForExit) {
    return
  }

  didStopForExit = true
  const stoppedPositionSeconds = playbackPosition.value || lastPlaybackPositionSeconds
  softwareRenderer.resetSoftwareRendering()
  isPreparingFirstFrame.value = false
  stopDiagnosticsLoop()
  diagnostics.value = null

  try {
    await playerEngine.control('stop')
  } catch {
    // The player may already be stopped while switching episodes.
  }

  try {
    await reportStoppedAt(stoppedPositionSeconds)
  } catch {
    // Switching items should not be blocked by playback reporting.
  }
}

async function restartPlaybackFrom(positionSeconds: number) {
  softwareRenderer.resetSoftwareRendering()
  isPreparingFirstFrame.value = false
  stopDiagnosticsLoop()
  diagnostics.value = null

  try {
    await playerEngine.control('stop')
  } catch {
    // The player may not be running yet while applying initial settings.
  }

  didStopForExit = false

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
      const stoppedPositionSeconds = playbackPosition.value || lastPlaybackPositionSeconds
      softwareRenderer.resetSoftwareRendering()
      isPreparingFirstFrame.value = false
      stopDiagnosticsLoop()
      await markStopped(stoppedPositionSeconds)
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

  if (!hasActivePlayback.value || isPaused.value || showPlayerSettings.value || showDebugPanel.value || showQueuePanel.value || showChapterPanel.value) {
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

  if (key === 'm') {
    event.preventDefault()
    cyclePlaybackMode()
    return
  }

  if (key === 'escape' && document.fullscreenElement) {
    event.preventDefault()
    void document.exitFullscreen()
    return
  }

  if ((key === ']' || key === '.') && displayNextItem.value) {
    event.preventDefault()
    void switchEpisode(displayNextItem.value)
    return
  }

  if ((key === '[' || key === ',') && displayPreviousItem.value) {
    event.preventDefault()
    void switchEpisode(displayPreviousItem.value)
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

async function seekToChapter(chapter: PlaybackChapter) {
  await playerEngine.seek(chapter.startSeconds)
  await refreshDiagnostics()
  showOsd(`跳转到 ${chapter.name}`)
  revealControls()
}

async function skipActiveChapter() {
  const chapter = activeSkippableChapter.value
  if (!chapter?.endSeconds) {
    return
  }

  await playerEngine.seek(chapter.endSeconds)
  await refreshDiagnostics()
  showOsd(chapter.kind === 'intro' ? '已跳过片头' : '已跳过片尾')
  revealControls()
}

function streamsByType(source: EmbyMediaSource | null, type: EmbyMediaStream['Type']) {
  return source?.MediaStreams?.filter((stream) => stream.Type === type) ?? []
}

function getDefaultStream(source: EmbyMediaSource | undefined, type: EmbyMediaStream['Type']) {
  const streams = source?.MediaStreams?.filter((stream) => stream.Type === type) ?? []
  return streams.find((stream) => stream.IsDefault) ?? streams[0]
}

function normalizePlaybackStartError(error: unknown, isForcedTranscode: boolean) {
  const message = normalizePlayerEngineError(error)
  if (message.includes('无法加载 libmpv') || message.includes('mpv_create') || message.includes('libmpv')) {
    return `${message}。请确认 bundled libmpv 存在，或在 Debug 中复制直链用外部 mpv 排查。`
  }

  if (message.includes('无法启动 mpv') || message.includes('No such file') || message.includes('ENOENT')) {
    return `${message}。请确认 mpv 已安装，或在播放器设置中配置正确的 mpv 路径。`
  }

  if (!isForcedTranscode) {
    return `${message}。如果该媒体无法直放，请开启“强制转码”或选择较低播放质量后重试。`
  }

  return message
}

function formatSource(source: EmbyMediaSource) {
  const parts = [
    source.Name,
    source.Container?.toUpperCase(),
    source.Bitrate ? `${Math.round(source.Bitrate / 1_000_000)} Mbps` : '',
  ].filter(Boolean)

  return parts.join(' · ') || source.Id
}

function applyDefaultPlaybackStreams(source: EmbyMediaSource | undefined) {
  selectedSourceId.value = source?.Id ?? ''
  selectedAudioIndex.value = getPreferredStream(source, 'Audio', props.playbackPreferences.preferredAudioLanguage)?.Index ?? null
  selectedSubtitleIndex.value = getPreferredStream(source, 'Subtitle', props.playbackPreferences.preferredSubtitleLanguage)?.Index ?? null
}

function cyclePlaybackMode() {
  emit('cyclePlaybackMode')
  showOsd(`播放模式：${formatPlaybackMode(getNextPlaybackMode(props.playbackMode))}`)
}

function getNextPlaybackMode(mode: PlaybackMode): PlaybackMode {
  const modes: PlaybackMode[] = ['normal', 'repeat-all', 'repeat-one', 'shuffle']
  const index = modes.indexOf(mode)
  return modes[(index + 1) % modes.length]
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

      <Transition name="player-loading-fade">
        <div v-if="playbackLoadingMessage" class="mpv-stage__loading" role="status" aria-live="polite">
          <span class="mpv-stage__loading-ring" aria-hidden="true"></span>
          <strong>{{ playbackLoadingMessage }}</strong>
          <p>已收到播放请求，正在连接媒体流并准备画面</p>
        </div>
      </Transition>

      <div class="mpv-stage__topbar">
        <VBtn class="player-back" type="button" icon variant="tonal" aria-label="返回详情" @click="leavePlayer">
          <ArrowLeft :size="20" />
        </VBtn>
        <div class="mpv-stage__title">
          <strong>{{ displayTitle }}</strong>
        </div>
        <VBtn class="player-icon-button" type="button" icon variant="tonal" aria-label="打开播放设置" @click="showPlayerSettings = !showPlayerSettings">
          <MoreHorizontal :size="21" />
        </VBtn>
        <VBtn
          v-if="playbackChapters.length"
          class="player-icon-button"
          type="button"
          icon
          variant="tonal"
          aria-label="打开章节面板"
          @click="showChapterPanel = !showChapterPanel"
        >
          <BookOpen :size="20" />
        </VBtn>
        <VBtn class="player-icon-button" type="button" icon variant="tonal" aria-label="打开播放队列" @click="showQueuePanel = !showQueuePanel">
          <ListMusic :size="20" />
        </VBtn>
      </div>

      <div v-if="playerOsdMessage" class="mpv-stage__osd">
        {{ playerOsdMessage }}
      </div>

      <VBtn
        v-if="activeSkippableChapter"
        class="mpv-stage__skip-chapter"
        type="button"
        color="primary"
        variant="flat"
        @click="skipActiveChapter"
      >
        <template #prepend>
          <SkipForward :size="18" />
        </template>
        {{ activeSkippableChapter.kind === 'intro' ? '跳过片头' : '跳过片尾' }}
      </VBtn>

        <VBtn
          v-if="!isSoftwareRendering && !isStartingPlayback"
          class="mpv-stage__center-play"
          type="button"
          icon
          variant="tonal"
          aria-label="开始播放"
          :disabled="!directPlayUrl || isLoading"
          @click="() => playInMpv()"
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
        :playback-mode="playbackMode"
        :previous-episode="displayPreviousItem"
        :next-episode="displayNextItem"
        :episode-options="episodeOptions"
        :selected-episode-id="selectedEpisodeId"
        :format-episode-option="formatEpisodeOption"
        :format-time="formatTime"
        :queue-label="queueLabel"
        @play-pause="togglePlayPause"
        @seek-relative="seekRelative"
        @seek-to-progress="seekFromValue"
        @stop="controlPlayer('stop')"
        @select-episode="selectedEpisodeId = $event"
        @switch-episode="switchEpisode"
        @update-volume="setVolumeFromValue"
        @cycle-playback-mode="cyclePlaybackMode"
        @open-settings="showPlayerSettings = !showPlayerSettings"
        @open-debug="showDebugPanel = !showDebugPanel"
        @toggle-fullscreen="controlPlayer('toggleFullscreen')"
      />

      <PlayerQueuePanel
        v-if="showQueuePanel"
        :items="queueItems"
        :active-item-id="activeQueueItemId"
        :playback-mode="playbackMode"
        @clear="emit('clearQueue')"
        @close="showQueuePanel = false"
        @remove="emit('removeQueueItem', $event)"
        @select="switchEpisode"
      />

      <PlayerChapterPanel
        v-if="showChapterPanel"
        :chapters="playbackChapters"
        :playback-position="playbackPosition"
        :format-time="formatTime"
        @close="showChapterPanel = false"
        @seek="seekToChapter"
      />

      <PlayerSettingsPanel
        v-if="showPlayerSettings || showDebugPanel"
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
        <div class="player-panel__notice-content">
          <span>{{ errorMessage }}</span>
          <div v-if="canRetryPlayback" class="player-panel__notice-actions">
            <VBtn size="small" variant="tonal" type="button" @click="retryPlayback">
              重试
            </VBtn>
            <VBtn
              v-if="canRetryWithTranscode"
              size="small"
              color="primary"
              variant="tonal"
              type="button"
              @click="retryWithTranscode"
            >
              强制转码重试
            </VBtn>
          </div>
        </div>
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
  color: rgba(var(--v-theme-on-surface), 0.7);
  background: #000000;
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
  background: #000000;
}

.mpv-stage__empty p,
.mpv-stage__empty span {
  margin: 0;
}

.mpv-stage__empty p {
  display: block;
  max-width: min(720px, 80vw);
  overflow-wrap: anywhere;
  color: #ffffff;
  font-size: 1.28rem;
  font-weight: 500;
  line-height: 1.25;
  text-align: center;
}

.mpv-stage__empty span {
  color: rgb(255 255 255 / 62%);
  font-size: 0.86rem;
}

.mpv-stage__loader {
  color: rgb(var(--v-theme-primary));
  animation: player-spin 0.9s linear infinite;
}

.mpv-stage__loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  padding: 28px;
  color: #ffffff;
  background: rgb(0 0 0 / 72%);
  text-align: center;
  pointer-events: none;
}

.mpv-stage__loading-ring {
  position: relative;
  width: 54px;
  height: 54px;
  border: 3px solid rgb(255 255 255 / 18%);
  border-top-color: rgb(var(--v-theme-primary));
  border-radius: 50%;
  animation: player-spin 0.85s linear infinite;
}

.mpv-stage__loading strong,
.mpv-stage__loading p {
  margin: 0;
}

.mpv-stage__loading strong {
  color: #ffffff;
  font-size: 1.05rem;
  font-weight: 500;
  line-height: 1.25;
}

.mpv-stage__loading p {
  max-width: min(420px, 80vw);
  color: rgb(255 255 255 / 66%);
  font-size: 0.86rem;
  line-height: 1.45;
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

.mpv-stage__topbar,
.mpv-stage__controls,
.player-panel__notice {
  z-index: 6;
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
  grid-template-columns: 44px minmax(0, 1fr);
  grid-auto-columns: 44px;
  grid-auto-flow: column;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: rgb(0 0 0 / 64%);
}

.player-back,
.player-icon-button {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  cursor: pointer;
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
  display: block;
  overflow-wrap: anywhere;
  color: #ffffff;
  font-size: 1.04rem;
  font-weight: 500;
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
  transform: translate(-50%, -50%);
  cursor: pointer;
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
  background: rgb(0 0 0 / 58%);
  border: 1px solid rgb(255 255 255 / 18%);
  font-size: 0.92rem;
  font-weight: 500;
  line-height: 1.2;
  text-align: center;
  transform: translate(-50%, -50%);
}

.mpv-stage__skip-chapter {
  position: absolute;
  right: 24px;
  bottom: 150px;
  z-index: 5;
}

.player-panel__notice {
  position: absolute;
  right: 18px;
  bottom: 158px;
  left: 18px;
  z-index: 6;
}

.player-panel__notice-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.player-panel__notice-content span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.player-panel__notice-actions {
  display: inline-flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

@keyframes player-spin {
  to {
    transform: rotate(360deg);
  }
}


.player-loading-fade-enter-active,
.player-loading-fade-leave-active {
  transition: opacity 180ms ease;
}

.player-loading-fade-enter-from,
.player-loading-fade-leave-to {
  opacity: 0;
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

  .player-panel__notice-content {
    align-items: flex-start;
    flex-direction: column;
  }

  .player-panel__notice-actions {
    justify-content: flex-start;
  }

}
</style>
