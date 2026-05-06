import { invoke } from '@tauri-apps/api/core'

export interface HttpHeader {
  name: string
  value: string
}

export interface PlayerBounds {
  x: number
  y: number
  width: number
  height: number
}

export type PlayerRenderMode = 'embeddedWindow' | 'softwareCanvas'

export type PlayerCommand = 'togglePause' | 'stop' | 'toggleFullscreen'

export interface PlayMediaRequest {
  url: string
  title?: string
  mpvPath?: string
  headers: HttpHeader[]
  startPositionSeconds?: number
  audioStreamIndex?: number | null
  subtitleStreamIndex?: number | null
  subtitleUrl?: string | null
  embedBounds?: PlayerBounds | null
  renderMode?: PlayerRenderMode
}

export interface MpvPlayResponse {
  pid: number
  engine: string
}

export interface PlayerEngineStatus {
  libmpvAvailable: boolean
  libmpvPath: string | null
  message: string
}

export interface PlayerDiagnostics {
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

export interface RenderFrameRequest {
  width: number
  height: number
}

export interface RenderFrameResponse {
  width: number
  height: number
  stride: number
  rgbaBase64: string
}

export function usePlayerEngine() {
  function getEngineStatus() {
    return invoke<PlayerEngineStatus>('player_engine_status')
  }

  function playMedia(request: PlayMediaRequest) {
    return invoke<MpvPlayResponse>('play_media', { request })
  }

  function renderFrame(request: RenderFrameRequest) {
    return invoke<RenderFrameResponse>('render_player_frame', { request })
  }

  function getDiagnostics() {
    return invoke<PlayerDiagnostics>('player_diagnostics')
  }

  function seek(seconds: number) {
    return invoke('seek_player', { seconds })
  }

  function setVolume(volume: number) {
    return invoke('set_player_volume', { volume })
  }

  function control(command: PlayerCommand) {
    return invoke('control_player', { command })
  }

  return {
    control,
    getDiagnostics,
    getEngineStatus,
    playMedia,
    renderFrame,
    seek,
    setVolume,
  }
}

export function normalizePlayerEngineError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('__TAURI__') || message.includes('ipc')) {
    return '当前运行在浏览器开发页中。请使用 pnpm tauri:dev 启动桌面客户端。'
  }

  return message
}
