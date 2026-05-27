import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlaybackQueue } from './usePlaybackQueue'
import type { EmbyItem } from './useEmbyClient'

const movie: EmbyItem = { Id: 'movie', Name: 'Movie', Type: 'Movie' }
const episode: EmbyItem = { Id: 'episode', Name: 'Episode', Type: 'Episode' }
const track: EmbyItem = { Id: 'track', Name: 'Track', Type: 'Audio' }
const album: EmbyItem = { Id: 'album', Name: 'Album', Type: 'MusicAlbum' }

describe('usePlaybackQueue', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    const queue = usePlaybackQueue()
    queue.clearQueue({ persist: false })
    queue.detachQueuePersistence()
  })

  it('sets a deduplicated playable queue', () => {
    const queue = usePlaybackQueue()
    queue.clearQueue()

    queue.setQueue([movie, album, episode, movie], episode)

    expect(queue.queueItems.value.map((item) => item.Id)).toEqual(['movie', 'episode'])
    expect(queue.activeQueueItemId.value).toBe('episode')
    expect(queue.previousQueueItem.value?.Id).toBe('movie')
    expect(queue.nextQueueItem.value).toBeNull()
  })

  it('appends and removes queue items while preserving active state', () => {
    const queue = usePlaybackQueue()
    queue.clearQueue()

    queue.setQueue([movie], movie)
    queue.addToQueue([episode, track, episode])

    expect(queue.queueItems.value.map((item) => item.Id)).toEqual(['movie', 'episode', 'track'])
    expect(queue.nextQueueItem.value?.Id).toBe('episode')

    queue.removeFromQueue('movie')
    expect(queue.activeQueueItemId.value).toBe('episode')
  })

  it('cycles playback modes and wraps queue navigation', () => {
    const queue = usePlaybackQueue()
    queue.clearQueue()
    queue.setPlaybackMode('normal')
    queue.setQueue([movie, episode], episode)

    expect(queue.nextQueueItem.value).toBeNull()

    queue.setPlaybackMode('repeat-all')
    expect(queue.nextQueueItem.value?.Id).toBe('movie')
    expect(queue.previousQueueItem.value?.Id).toBe('movie')

    queue.setPlaybackMode('repeat-one')
    expect(queue.nextQueueItem.value?.Id).toBe('episode')
    expect(queue.previousQueueItem.value?.Id).toBe('episode')

    queue.cyclePlaybackMode()
    expect(queue.playbackMode.value).toBe('shuffle')
  })

  it('persists and restores queues by account', () => {
    vi.stubGlobal('localStorage', createMemoryStorage())
    const queue = usePlaybackQueue()
    queue.restoreQueue('account-a')
    queue.setQueue([movie, episode], episode)
    queue.setPlaybackMode('repeat-all')

    queue.restoreQueue('account-b')
    expect(queue.queueItems.value).toEqual([])
    expect(queue.playbackMode.value).toBe('normal')

    queue.restoreQueue('account-a')
    expect(queue.queueItems.value.map((item) => item.Id)).toEqual(['movie', 'episode'])
    expect(queue.activeQueueItemId.value).toBe('episode')
    expect(queue.playbackMode.value).toBe('repeat-all')
  })
})

function createMemoryStorage() {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return [...values.keys()][index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  } satisfies Storage
}
