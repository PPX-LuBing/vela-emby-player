import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PlayerPanel from './PlayerPanel.vue'
import { vuetifyStubs } from '../test/componentStubs'
import type {
  EmbyItem,
  EmbyMediaSource,
  EmbyPlaybackInfo,
  PlaybackPreferences,
  PlaybackUrlOptions,
} from '../composables/useEmbyClient'

const playerEngine = vi.hoisted(() => ({
  control: vi.fn(),
  getDiagnostics: vi.fn(),
  getEngineStatus: vi.fn(),
  playMedia: vi.fn(),
  renderFrame: vi.fn(),
  seek: vi.fn(),
  setVolume: vi.fn(),
}))

vi.mock('../composables/usePlayerEngine', () => ({
  normalizePlayerEngineError: (error: unknown) => error instanceof Error ? error.message : String(error),
  usePlayerEngine: () => playerEngine,
}))

const movie: EmbyItem = {
  Id: 'movie-1',
  Name: 'Movie One',
  Type: 'Movie',
}

const mediaSource: EmbyMediaSource = {
  Id: 'source-1',
  Name: 'Main',
  Container: 'mp4',
  MediaStreams: [],
}

const playbackInfo: EmbyPlaybackInfo = {
  MediaSources: [mediaSource],
  PlaySessionId: 'play-session-1',
}

const playbackPreferences: PlaybackPreferences = {
  preferredAudioLanguage: '',
  preferredSubtitleLanguage: '',
  defaultForceTranscode: false,
  defaultQualityPreset: 'original',
  customMaxStreamingBitrate: 12_000_000,
}

describe('PlayerPanel', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    playerEngine.getEngineStatus.mockResolvedValue({
      libmpvAvailable: true,
      libmpvPath: '/usr/local/lib/libmpv.dylib',
      message: 'ok',
    })
    playerEngine.playMedia.mockRejectedValue(new Error('mpv failed'))
    playerEngine.control.mockResolvedValue(undefined)
    playerEngine.seek.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows retry actions after playback startup fails', async () => {
    const getPlaybackUrl = vi.fn((_itemId: string, _source: EmbyMediaSource, _options?: PlaybackUrlOptions) => 'https://example.test/movie.m3u8')
    const wrapper = mount(PlayerPanel, {
      props: createProps({ getPlaybackUrl }),
      global: {
        stubs: {
          ...vuetifyStubs,
          PlayerControls: defineComponent({
            name: 'PlayerControls',
            setup: () => () => h('div'),
          }),
          PlayerSettingsPanel: defineComponent({
            name: 'PlayerSettingsPanel',
            setup: () => () => h('div'),
          }),
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('mpv failed')
    expect(wrapper.text()).toContain('重试')
    expect(wrapper.text()).toContain('强制转码重试')

    const transcodeRetryButton = wrapper.findAll('button')
      .find((button) => button.text().includes('强制转码重试'))
    expect(transcodeRetryButton).toBeTruthy()

    await transcodeRetryButton!.trigger('click')
    await flushPromises()

    expect(playerEngine.playMedia).toHaveBeenCalledTimes(2)
    expect(getPlaybackUrl.mock.calls.some((call) => call[2]?.forceTranscode === true)).toBe(true)
  })

  it('shows chapters and can skip intro', async () => {
    vi.useFakeTimers()
    playerEngine.playMedia.mockResolvedValue({ engine: 'external-mpv' })
    playerEngine.getDiagnostics.mockResolvedValue({
      position: 35,
      duration: 300,
      pause: false,
      volume: 100,
    })

    const wrapper = mount(PlayerPanel, {
      props: createProps({
        item: {
          ...movie,
          Chapters: [
            { Name: 'Intro', StartPositionTicks: 300_000_000 },
            { Name: 'Main', StartPositionTicks: 900_000_000 },
            { Name: 'End Credits', StartPositionTicks: 2700_000_000 },
          ],
        },
      }),
      global: {
        stubs: {
          ...vuetifyStubs,
          PlayerControls: defineComponent({
            name: 'PlayerControls',
            setup: () => () => h('div'),
          }),
          PlayerSettingsPanel: defineComponent({
            name: 'PlayerSettingsPanel',
            setup: () => () => h('div'),
          }),
        },
      },
    })

    await flushPromises()
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()

    const skipIntroButton = wrapper.findAll('button').find((button) => button.text().includes('跳过片头'))
    expect(skipIntroButton).toBeTruthy()
    await skipIntroButton!.trigger('click')

    expect(playerEngine.seek).toHaveBeenCalledWith(90)

    await wrapper.find('[aria-label="打开章节面板"]').trigger('click')
    expect(wrapper.text()).toContain('Intro')
    expect(wrapper.text()).toContain('End Credits')

    await wrapper.find('[data-chapter-name="Main"]').trigger('click')
    expect(playerEngine.seek).toHaveBeenCalledWith(90)
  })
})

function createProps(overrides: Partial<InstanceType<typeof PlayerPanel>['$props']> = {}) {
  return {
    item: movie,
    episodes: [],
    playbackPreferences,
    getPlaybackInfo: vi.fn().mockResolvedValue(playbackInfo),
    getPlaybackUrl: vi.fn(() => 'https://example.test/movie.m3u8'),
    getSubtitleUrl: vi.fn(() => ''),
    getMpvAuthContext: vi.fn(() => ({
      token: 'token',
      authorization: 'MediaBrowser Token="token"',
      userAgent: 'Vela Test',
    })),
    reportPlaybackStart: vi.fn().mockResolvedValue(undefined),
    reportPlaybackProgress: vi.fn().mockResolvedValue(undefined),
    reportPlaybackStopped: vi.fn().mockResolvedValue(undefined),
    queueItems: [],
    activeQueueItemId: '',
    playbackMode: 'normal' as const,
    nextQueueItem: movie,
    previousQueueItem: movie,
    ...overrides,
  }
}
