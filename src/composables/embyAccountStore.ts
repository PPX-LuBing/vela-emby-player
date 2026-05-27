import { invoke } from '@tauri-apps/api/core'
import { PLAYBACK_QUALITY_OPTIONS, normalizeBitrate } from './playbackPreferences'
import type { EmbySession, PlaybackPreferences, PlaybackQualityPreset } from './useEmbyClient'

export const CLIENT_NAME = 'Vela Player'
export const DEVICE_NAME = 'Browser'
export const DEFAULT_PLAYBACK_USER_AGENT = 'Emby/4.8.0 VelaPlayer/0.1.0 (macOS)'
export const DEVICE_ID_KEY = 'emby_external_player_device_id'
export const SESSION_KEY = 'emby_external_player_session'
export const ACCOUNTS_KEY = 'vela_player_accounts'
export const ACTIVE_ACCOUNT_KEY = 'vela_player_active_account'
export const PLAYBACK_USER_AGENT_KEY = 'vela_player_playback_user_agent'
export const PLAYBACK_PREFERENCES_KEY = 'vela_player_playback_preferences'
export const KEYCHAIN_MIGRATION_KEY = 'vela_player_keychain_migration_checked'

interface SecureStoragePayload {
  value?: string | null
}

export function normalizeNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return `无法连接 Emby 服务器。请检查服务器地址、网络连接或反向代理配置。原始错误：${message}`
}

export function normalizeEmbyHttpError(status: number) {
  if (status === 401 || status === 403) {
    return 'Emby 登录已失效或权限不足。请在设置中切换账号，或清除本地账号后重新登录。'
  }

  if (status === 404) {
    return 'Emby 没有找到请求的媒体或接口。请刷新媒体库后重试。'
  }

  if (status >= 500) {
    return `Emby 服务器返回错误 HTTP ${status}。请稍后重试，或检查服务器日志。`
  }

  return `Emby 请求失败：HTTP ${status}`
}

export function normalizeAccountStorageError(error: unknown, action: '读取' | '写入' | '删除') {
  const message = error instanceof Error ? error.message : String(error)
  return `本地账号存储${action}失败。请确认应用数据目录可用，必要时在设置中清除本地账号后重新登录。原始错误：${message}`
}

export function normalizeSecureStorageError(error: unknown, action: '读取' | '写入' | '删除') {
  const message = error instanceof Error ? error.message : String(error)
  return `旧 Keychain 账号${action}失败。原始错误：${message}`
}

export function normalizeServerUrl(serverUrl: string) {
  const trimmed = serverUrl.trim().replace(/\/+$/, '')
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  return `http://${trimmed}`
}

export function createSessionId(serverUrl: string, userId: string) {
  return `${serverUrl}::${userId}`
}

export function getInitialPlaybackUserAgent() {
  return localStorage.getItem(PLAYBACK_USER_AGENT_KEY)?.trim() || DEFAULT_PLAYBACK_USER_AGENT
}

export function getInitialPlaybackPreferences(): PlaybackPreferences {
  const rawPreferences = localStorage.getItem(PLAYBACK_PREFERENCES_KEY)
  if (!rawPreferences) {
    return normalizePlaybackPreferences({})
  }

  try {
    return normalizePlaybackPreferences(JSON.parse(rawPreferences) as Partial<PlaybackPreferences>)
  } catch {
    localStorage.removeItem(PLAYBACK_PREFERENCES_KEY)
    return normalizePlaybackPreferences({})
  }
}

export function normalizePlaybackPreferences(preferences: Partial<PlaybackPreferences>): PlaybackPreferences {
  const qualityPreset = isPlaybackQualityPreset(preferences.defaultQualityPreset)
    ? preferences.defaultQualityPreset
    : 'original'

  return {
    preferredAudioLanguage: preferences.preferredAudioLanguage?.trim().toLowerCase() ?? '',
    preferredSubtitleLanguage: preferences.preferredSubtitleLanguage?.trim().toLowerCase() ?? '',
    defaultForceTranscode: preferences.defaultForceTranscode === true,
    defaultQualityPreset: qualityPreset,
    customMaxStreamingBitrate: normalizeBitrate(preferences.customMaxStreamingBitrate),
  }
}

export function buildAuthorizationHeader(token?: string) {
  const parts = [
    `MediaBrowser Client="${CLIENT_NAME}"`,
    `Device="${DEVICE_NAME}"`,
    `DeviceId="${getDeviceId()}"`,
    'Version="0.1.0"',
  ]

  if (token) {
    parts.push(`Token="${token}"`)
  }

  return parts.join(', ')
}

export function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) {
    return existing
  }

  const next = crypto.randomUUID()
  localStorage.setItem(DEVICE_ID_KEY, next)
  return next
}

export async function readLocalAccounts() {
  let localPayload: SecureStoragePayload
  try {
    localPayload = await invoke<SecureStoragePayload>('read_local_accounts')
  } catch (error) {
    throw new Error(normalizeAccountStorageError(error, '读取'))
  }

  return parseAccounts(localPayload.value ?? '')
}

export async function writeLocalAccounts(accounts: readonly EmbySession[]) {
  try {
    await invoke('write_local_accounts', { value: JSON.stringify(accounts) })
  } catch (error) {
    throw new Error(normalizeAccountStorageError(error, '写入'))
  }

  clearLegacyAccountStorage()
}

export async function deleteLocalAccounts() {
  try {
    await invoke('delete_local_accounts')
  } catch (error) {
    throw new Error(normalizeAccountStorageError(error, '删除'))
  }
}

export async function readSecureAccounts() {
  let securePayload: SecureStoragePayload
  try {
    securePayload = await invoke<SecureStoragePayload>('read_secure_accounts')
  } catch (error) {
    throw new Error(normalizeSecureStorageError(error, '读取'))
  }

  return parseAccounts(securePayload.value ?? '')
}

export async function writeSecureAccounts(accounts: readonly EmbySession[]) {
  try {
    await invoke('write_secure_accounts', { value: JSON.stringify(accounts) })
  } catch (error) {
    throw new Error(normalizeSecureStorageError(error, '写入'))
  }

  clearLegacyAccountStorage()
}

export async function deleteSecureAccounts() {
  try {
    await invoke('delete_secure_accounts')
  } catch (error) {
    throw new Error(normalizeSecureStorageError(error, '删除'))
  }
}

export function hasCheckedKeychainMigration() {
  return localStorage.getItem(KEYCHAIN_MIGRATION_KEY) === '1'
}

export function markKeychainMigrationChecked() {
  localStorage.setItem(KEYCHAIN_MIGRATION_KEY, '1')
}

export function loadLegacyAccounts() {
  const rawAccounts = localStorage.getItem(ACCOUNTS_KEY)
  const legacySession = loadLegacySession()

  if (!rawAccounts) {
    return legacySession ? [normalizeSession(legacySession)] : []
  }

  try {
    const parsed = JSON.parse(rawAccounts) as EmbySession[]
    const normalized = parsed.map(normalizeSession)
    if (legacySession && !normalized.some((account) => account.id === normalizeSession(legacySession).id)) {
      normalized.unshift(normalizeSession(legacySession))
    }

    return normalized
  } catch {
    localStorage.removeItem(ACCOUNTS_KEY)
    return legacySession ? [normalizeSession(legacySession)] : []
  }
}

export function parseAccounts(rawAccounts: string) {
  if (!rawAccounts) {
    return []
  }

  try {
    return (JSON.parse(rawAccounts) as EmbySession[]).map(normalizeSession)
  } catch {
    return []
  }
}

export function mergeAccounts(primaryAccounts: readonly EmbySession[], secondaryAccounts: readonly EmbySession[]) {
  const merged = [...primaryAccounts]
  for (const account of secondaryAccounts) {
    if (!merged.some((existing) => existing.id === account.id)) {
      merged.push(account)
    }
  }

  return merged
}

export function clearLegacyAccountStorage() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(ACCOUNTS_KEY)
}

export function getInitialSession(savedAccounts: EmbySession[]) {
  const activeId = localStorage.getItem(ACTIVE_ACCOUNT_KEY)
  return (
    savedAccounts.find((account) => account.id === activeId) ??
    savedAccounts[0] ??
    null
  )
}

export function normalizeSession(savedSession: Partial<EmbySession> & Omit<EmbySession, 'id' | 'displayName' | 'lastUsedAt'>) {
  const id = savedSession.id ?? createSessionId(savedSession.serverUrl, savedSession.userId)
  return {
    ...savedSession,
    id,
    displayName: savedSession.displayName ?? `${savedSession.username} · ${safeHost(savedSession.serverUrl)}`,
    lastUsedAt: savedSession.lastUsedAt ?? Date.now(),
  }
}

export function safeHost(serverUrl: string) {
  try {
    return new URL(serverUrl).host
  } catch {
    return serverUrl
  }
}

function loadLegacySession() {
  const rawSession = localStorage.getItem(SESSION_KEY)
  if (!rawSession) {
    return null
  }

  try {
    return JSON.parse(rawSession) as EmbySession
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

function isPlaybackQualityPreset(value: unknown): value is PlaybackQualityPreset {
  return PLAYBACK_QUALITY_OPTIONS.some((option) => option.value === value)
}
