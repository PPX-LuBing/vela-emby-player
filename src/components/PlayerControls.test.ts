import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PlayerControls from './PlayerControls.vue'
import { vuetifyStubs } from '../test/componentStubs'
import type { EmbyItem } from '../composables/useEmbyClient'

const nextEpisode: EmbyItem = {
  Id: 'episode-2',
  Name: 'Episode 2',
  Type: 'Episode',
}

const previousEpisode: EmbyItem = {
  Id: 'episode-1',
  Name: 'Episode 1',
  Type: 'Episode',
}

describe('PlayerControls', () => {
  it('emits playback mode cycle from the visible mode button', async () => {
    const wrapper = mountControls()

    await wrapper.find('button[title="顺序播放"]').trigger('click')

    expect(wrapper.emitted('cyclePlaybackMode')).toHaveLength(1)
  })

  it('emits the requested next item from the next button', async () => {
    const wrapper = mountControls({ nextEpisode })

    await wrapper.find('button[aria-label="下一项"]').trigger('click')

    expect(wrapper.emitted('switchEpisode')?.[0]).toEqual([nextEpisode])
  })
})

function mountControls(overrides: Partial<InstanceType<typeof PlayerControls>['$props']> = {}) {
  return mount(PlayerControls, {
    props: {
      playbackPosition: 0,
      playbackDuration: 120,
      playbackProgress: 0,
      volumeLevel: 80,
      queueLabel: '选择分集',
      canPlay: true,
      isLoading: false,
      isPaused: true,
      isSoftwareRendering: false,
      playbackMode: 'normal',
      previousEpisode,
      nextEpisode,
      episodeOptions: [],
      selectedEpisodeId: '',
      formatEpisodeOption: (item: EmbyItem) => item.Name,
      formatTime: (seconds: number) => String(seconds),
      ...overrides,
    },
    global: {
      stubs: vuetifyStubs,
    },
  })
}
