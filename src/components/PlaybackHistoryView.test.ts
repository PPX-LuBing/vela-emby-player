import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PlaybackHistoryView from './PlaybackHistoryView.vue'
import { vuetifyStubs } from '../test/componentStubs'
import type { EmbyItem } from '../composables/useEmbyClient'

const resumeMovie: EmbyItem = {
  Id: 'movie-resume',
  Name: 'Resume Movie',
  Type: 'Movie',
  RunTimeTicks: 7_200_000_000,
  UserData: {
    PlaybackPositionTicks: 1_800_000_000,
    PlayedPercentage: 25,
    Played: false,
  },
}

const playedEpisode: EmbyItem = {
  Id: 'episode-played',
  Name: 'Played Episode',
  Type: 'Episode',
  SeriesName: 'Series One',
  ParentIndexNumber: 1,
  IndexNumber: 2,
  UserData: {
    LastPlayedDate: '2026-05-13T08:00:00.000Z',
    Played: true,
  },
}

const playedAudio: EmbyItem = {
  Id: 'audio-played',
  Name: 'Played Song',
  Type: 'Audio',
  Album: 'Album One',
  AlbumArtist: 'Artist One',
  UserData: {
    Played: true,
  },
}

describe('PlaybackHistoryView', () => {
  it('filters playback history by media type and emits clear progress', async () => {
    const wrapper = mount(PlaybackHistoryView, {
      props: createProps(),
      global: {
        stubs: vuetifyStubs,
      },
    })

    expect(wrapper.text()).toContain('Resume Movie')
    expect(wrapper.text()).toContain('Played Episode')
    expect(wrapper.text()).toContain('Played Song')

    await wrapper.findAll('.history-filters__chip').find((chip) => chip.text().includes('音乐'))?.trigger('click')

    expect(wrapper.text()).not.toContain('Resume Movie')
    expect(wrapper.text()).not.toContain('Played Episode')
    expect(wrapper.text()).toContain('Played Song')

    await wrapper.findAll('button').find((button) => button.text().includes('清除记录'))?.trigger('click')
    expect(wrapper.text()).toContain('清除播放记录？')
    await wrapper.findAll('button').find((button) => button.text().includes('确认清除'))?.trigger('click')
    expect(wrapper.emitted('clearPlaybackProgress')?.[0]).toEqual([playedAudio])
  })
})

function createProps() {
  return {
    resumeItems: [resumeMovie],
    resumeItemsTotalCount: 2,
    resumeItemsCanLoadMore: true,
    playedItems: [playedEpisode, playedAudio],
    playedItemsTotalCount: 3,
    playedItemsCanLoadMore: true,
    selectedItem: null,
    isBusy: false,
    getImageUrl: () => '',
  }
}
