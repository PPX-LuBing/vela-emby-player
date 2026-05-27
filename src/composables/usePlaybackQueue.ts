import { computed, readonly, shallowRef } from 'vue'
import type { EmbyItem } from './useEmbyClient'

export type PlaybackMode = 'normal' | 'repeat-one' | 'repeat-all' | 'shuffle'

export function formatPlaybackMode(mode: PlaybackMode) {
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

interface PersistedPlaybackQueue {
  activeItemId?: string
  items?: EmbyItem[]
  playbackMode?: PlaybackMode
}

const PLAYBACK_QUEUE_STORAGE_KEY = 'vela_player_playback_queue_v1'

const queueItems = shallowRef<EmbyItem[]>([])
const activeQueueItemId = shallowRef('')
const playbackMode = shallowRef<PlaybackMode>('normal')
let activePersistenceAccountId = ''

export function usePlaybackQueue() {
  const activeQueueIndex = computed(() => {
    if (!activeQueueItemId.value) {
      return -1
    }

    return queueItems.value.findIndex((item) => item.Id === activeQueueItemId.value)
  })

  const nextQueueItem = computed(() => {
    const index = activeQueueIndex.value
    if (index < 0 || !queueItems.value.length) {
      return null
    }

    if (playbackMode.value === 'repeat-one') {
      return queueItems.value[index] ?? null
    }

    if (playbackMode.value === 'shuffle') {
      return getRandomQueueItem(index)
    }

    if (index < queueItems.value.length - 1) {
      return queueItems.value[index + 1]
    }

    return playbackMode.value === 'repeat-all' ? queueItems.value[0] ?? null : null
  })

  const previousQueueItem = computed(() => {
    const index = activeQueueIndex.value
    if (index < 0 || !queueItems.value.length) {
      return null
    }

    if (playbackMode.value === 'repeat-one') {
      return queueItems.value[index] ?? null
    }

    if (index > 0) {
      return queueItems.value[index - 1]
    }

    return playbackMode.value === 'repeat-all' ? queueItems.value[queueItems.value.length - 1] ?? null : null
  })

  function setQueue(items: readonly EmbyItem[], activeItem?: EmbyItem | null) {
    const uniqueItems = uniquePlayableItems(items)
    queueItems.value = uniqueItems
    activeQueueItemId.value = activeItem?.Id && uniqueItems.some((item) => item.Id === activeItem.Id)
      ? activeItem.Id
      : uniqueItems[0]?.Id ?? ''
    persistQueue()
  }

  function addToQueue(items: readonly EmbyItem[]) {
    const existingIds = new Set(queueItems.value.map((item) => item.Id))
    const nextItems = items.filter((item) => {
      if (!isQueuePlayableItem(item) || existingIds.has(item.Id)) {
        return false
      }

      existingIds.add(item.Id)
      return true
    })
    if (!nextItems.length) {
      return
    }

    queueItems.value = [...queueItems.value, ...nextItems]
    if (!activeQueueItemId.value) {
      activeQueueItemId.value = queueItems.value[0]?.Id ?? ''
    }
    persistQueue()
  }

  function removeFromQueue(itemId: string) {
    const removedIndex = queueItems.value.findIndex((item) => item.Id === itemId)
    if (removedIndex < 0) {
      return
    }

    queueItems.value = queueItems.value.filter((item) => item.Id !== itemId)
    if (activeQueueItemId.value !== itemId) {
      persistQueue()
      return
    }

    activeQueueItemId.value = queueItems.value[removedIndex]?.Id ?? queueItems.value[removedIndex - 1]?.Id ?? ''
    persistQueue()
  }

  function clearQueue(options: { persist?: boolean } = {}) {
    queueItems.value = []
    activeQueueItemId.value = ''
    playbackMode.value = 'normal'
    if (options.persist ?? true) {
      persistQueue()
    }
  }

  function setPlaybackMode(mode: PlaybackMode) {
    playbackMode.value = mode
    persistQueue()
  }

  function cyclePlaybackMode() {
    const modes: PlaybackMode[] = ['normal', 'repeat-all', 'repeat-one', 'shuffle']
    const index = modes.indexOf(playbackMode.value)
    playbackMode.value = modes[(index + 1) % modes.length]
    persistQueue()
  }

  function activateQueueItem(item: EmbyItem | null) {
    activeQueueItemId.value = item?.Id && queueItems.value.some((candidate) => candidate.Id === item.Id)
      ? item.Id
      : ''
    persistQueue()
  }

  function restoreQueue(accountId: string) {
    activePersistenceAccountId = accountId
    const persistedQueue = readPersistedQueues()[accountId]
    const restoredItems = uniquePlayableItems(persistedQueue?.items ?? [])
    queueItems.value = restoredItems
    activeQueueItemId.value = persistedQueue?.activeItemId && restoredItems.some((item) => item.Id === persistedQueue.activeItemId)
      ? persistedQueue.activeItemId
      : restoredItems[0]?.Id ?? ''
    playbackMode.value = normalizePlaybackMode(persistedQueue?.playbackMode)
  }

  function detachQueuePersistence() {
    activePersistenceAccountId = ''
  }

  function clearPersistedQueue(accountId: string) {
    const persistedQueues = readPersistedQueues()
    delete persistedQueues[accountId]
    writePersistedQueues(persistedQueues)
    if (activePersistenceAccountId === accountId) {
      clearQueue({ persist: false })
      detachQueuePersistence()
    }
  }

  function clearAllPersistedQueues() {
    getStorage()?.removeItem(PLAYBACK_QUEUE_STORAGE_KEY)
    clearQueue({ persist: false })
    detachQueuePersistence()
  }

  return {
    activeQueueIndex,
    activeQueueItemId: readonly(activeQueueItemId),
    addToQueue,
    clearQueue,
    nextQueueItem,
    playbackMode: readonly(playbackMode),
    previousQueueItem,
    queueItems: readonly(queueItems),
    removeFromQueue,
    setQueue,
    setPlaybackMode,
    cyclePlaybackMode,
    activateQueueItem,
    restoreQueue,
    detachQueuePersistence,
    clearPersistedQueue,
    clearAllPersistedQueues,
  }
}

function getRandomQueueItem(activeIndex: number) {
  if (queueItems.value.length <= 1) {
    return queueItems.value[activeIndex] ?? null
  }

  const candidates = queueItems.value.filter((_, index) => index !== activeIndex)
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null
}

function uniquePlayableItems(items: readonly EmbyItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!isQueuePlayableItem(item) || seen.has(item.Id)) {
      return false
    }

    seen.add(item.Id)
    return true
  })
}

function isQueuePlayableItem(item: EmbyItem) {
  return !['Series', 'MusicArtist', 'MusicAlbum', 'BoxSet', 'Playlist'].includes(item.Type)
}

function persistQueue() {
  if (!activePersistenceAccountId) {
    return
  }

  const persistedQueues = readPersistedQueues()
  if (!queueItems.value.length && playbackMode.value === 'normal') {
    delete persistedQueues[activePersistenceAccountId]
  } else {
    persistedQueues[activePersistenceAccountId] = {
      activeItemId: activeQueueItemId.value,
      items: queueItems.value,
      playbackMode: playbackMode.value,
    }
  }
  writePersistedQueues(persistedQueues)
}

function normalizePlaybackMode(mode: unknown): PlaybackMode {
  return mode === 'repeat-one' || mode === 'repeat-all' || mode === 'shuffle' ? mode : 'normal'
}

function readPersistedQueues() {
  const storage = getStorage()
  if (!storage) {
    return {} as Record<string, PersistedPlaybackQueue>
  }

  try {
    const rawValue = storage.getItem(PLAYBACK_QUEUE_STORAGE_KEY)
    const parsedValue = rawValue ? JSON.parse(rawValue) : {}
    return parsedValue && typeof parsedValue === 'object'
      ? parsedValue as Record<string, PersistedPlaybackQueue>
      : {}
  } catch {
    return {}
  }
}

function writePersistedQueues(queues: Record<string, PersistedPlaybackQueue>) {
  const storage = getStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(PLAYBACK_QUEUE_STORAGE_KEY, JSON.stringify(queues))
  } catch {
    // Queue persistence is best-effort and must not interrupt playback controls.
  }
}

function getStorage() {
  return typeof localStorage === 'undefined' ? null : localStorage
}
