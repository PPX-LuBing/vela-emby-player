import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MediaDetailView from './MediaDetailView.vue'
import { vuetifyStubs } from '../test/componentStubs'
import type { EmbyItem } from '../composables/useEmbyClient'

const playlist: EmbyItem = {
  Id: 'playlist-1',
  Name: 'Weekend Queue',
  Type: 'Playlist',
  ChildCount: 1,
}

const movie: EmbyItem = {
  Id: 'movie-1',
  Name: 'Movie One',
  Type: 'Movie',
}

describe('MediaDetailView', () => {
  it('renders playlist children and emits play for a selected item', async () => {
    const wrapper = mount(MediaDetailView, {
      props: {
        item: playlist,
        seasons: [],
        episodes: [movie],
        similarItems: [],
        isBusy: false,
        getImageUrl: () => '',
        getBackdropUrl: () => '',
      },
      global: {
        stubs: vuetifyStubs,
      },
    })

    expect(wrapper.text()).toContain('播放列表条目')
    expect(wrapper.text()).toContain('Movie One')

    const movieTile = wrapper.find('[data-episode-id="movie-1"]')
    await movieTile.trigger('click')

    expect(wrapper.emitted('play')?.[0]).toEqual([movie])
  })

  it('renders music artist tracks as playable detail items', async () => {
    const artist: EmbyItem = {
      Id: 'artist-1',
      Name: 'Artist One',
      Type: 'MusicArtist',
    }
    const track: EmbyItem = {
      Id: 'track-1',
      Name: 'Track One',
      Type: 'Audio',
      Artists: ['Artist One'],
      IndexNumber: 1,
    }
    const wrapper = mount(MediaDetailView, {
      props: {
        item: artist,
        seasons: [],
        episodes: [track],
        similarItems: [],
        isBusy: false,
        getImageUrl: () => '',
        getBackdropUrl: () => '',
      },
      global: {
        stubs: vuetifyStubs,
      },
    })

    expect(wrapper.text()).toContain('艺术家曲目')
    expect(wrapper.text()).toContain('Track One')

    await wrapper.find('[data-episode-id="track-1"]').trigger('click')

    expect(wrapper.emitted('play')?.[0]).toEqual([track])
  })

  it('shows series seasons before credits and places specials after numbered seasons', () => {
    const series: EmbyItem = {
      Id: 'series-1',
      Name: 'Series One',
      Type: 'Series',
      People: [{ Name: 'Sam Actor', Type: 'Actor' }],
    }
    const seasonOne: EmbyItem = {
      Id: 'season-1',
      Name: 'Season 1',
      Type: 'Season',
      IndexNumber: 1,
    }
    const specialSeason: EmbyItem = {
      Id: 'season-special',
      Name: 'Specials',
      Type: 'Season',
      IndexNumber: 0,
    }
    const wrapper = mount(MediaDetailView, {
      props: {
        item: series,
        seasons: [specialSeason, seasonOne],
        episodes: [
          { Id: 'episode-1', Name: 'Episode One', Type: 'Episode', SeasonId: 'season-1', ParentIndexNumber: 1, IndexNumber: 1 },
          { Id: 'special-1', Name: 'Special One', Type: 'Episode', SeasonId: 'season-special', ParentIndexNumber: 0, IndexNumber: 1 },
        ],
        similarItems: [],
        isBusy: false,
        getImageUrl: () => '',
        getBackdropUrl: () => '',
      },
      global: {
        stubs: vuetifyStubs,
      },
    })

    const text = wrapper.text()
    expect(text.indexOf('分季与分集')).toBeLessThan(text.indexOf('演职员与制作信息'))
    expect(text.indexOf('第 1 季')).toBeLessThan(text.indexOf('特别篇 / 剧场版'))
  })

  it('renders similar recommendations and emits select item', async () => {
    const related: EmbyItem = {
      Id: 'movie-2',
      Name: 'Movie Two',
      Type: 'Movie',
      ProductionYear: 2026,
    }
    const wrapper = mount(MediaDetailView, {
      props: {
        item: movie,
        seasons: [],
        episodes: [],
        similarItems: [related],
        isBusy: false,
        getImageUrl: () => '',
        getBackdropUrl: () => '',
      },
      global: {
        stubs: vuetifyStubs,
      },
    })

    expect(wrapper.text()).toContain('相似推荐')
    expect(wrapper.text()).toContain('Movie Two')

    await wrapper.find('[data-related-id="movie-2"]').trigger('click')

    expect(wrapper.emitted('selectItem')?.[0]).toEqual([related])
  })

  it('renders credits and emits search person', async () => {
    const creditedMovie: EmbyItem = {
      ...movie,
      People: [
        { Name: 'Jane Director', Type: 'Director' },
        { Name: 'Alex Writer', Type: 'Writer' },
        { Name: 'Sam Actor', Type: 'Actor', Role: 'Captain' },
      ],
      Studios: [{ Name: 'North Studio' }],
    }
    const wrapper = mount(MediaDetailView, {
      props: {
        item: creditedMovie,
        seasons: [],
        episodes: [],
        similarItems: [],
        isBusy: false,
        getImageUrl: () => '',
        getBackdropUrl: () => '',
      },
      global: {
        stubs: vuetifyStubs,
      },
    })

    expect(wrapper.text()).toContain('演职员与制作信息')
    expect(wrapper.text()).toContain('Jane Director')
    expect(wrapper.text()).toContain('Alex Writer')
    expect(wrapper.text()).toContain('Sam Actor')
    expect(wrapper.text()).toContain('Captain')
    expect(wrapper.text()).toContain('North Studio')

    await wrapper.find('[data-person-name="Sam Actor"]').trigger('click')

    expect(wrapper.emitted('searchPerson')?.[0]).toEqual(['Sam Actor'])
  })

  it('renders technical media metadata', () => {
    const technicalMovie: EmbyItem = {
      ...movie,
      PremiereDate: '2026-05-12T00:00:00.000Z',
      OfficialRating: 'PG-13',
      CommunityRating: 8.4,
      RunTimeTicks: 7_200_000_000,
      MediaSources: [
        {
          Id: 'source-1',
          Name: 'Main Version',
          Container: 'mkv',
          Size: 4_294_967_296,
          Bitrate: 8_500_000,
          MediaStreams: [
            { Index: 0, Type: 'Video', Codec: 'hevc', Width: 3840, Height: 2160, BitRate: 7_800_000 },
            { Index: 1, Type: 'Audio', Codec: 'aac', Channels: 2, Language: 'eng' },
            { Index: 2, Type: 'Subtitle', Codec: 'srt', Language: 'chi', IsExternal: true },
          ],
        },
      ],
    }
    const wrapper = mount(MediaDetailView, {
      props: {
        item: technicalMovie,
        seasons: [],
        episodes: [],
        similarItems: [],
        isBusy: false,
        getImageUrl: () => '',
        getBackdropUrl: () => '',
      },
      global: {
        stubs: vuetifyStubs,
      },
    })

    expect(wrapper.text()).toContain('媒体信息')
    expect(wrapper.text()).toContain('首播日期')
    expect(wrapper.text()).toContain('2026/05/12')
    expect(wrapper.text()).toContain('官方评级')
    expect(wrapper.text()).toContain('PG-13')
    expect(wrapper.text()).toContain('Main Version · MKV · 4.0 GB · 8.5 Mbps')
    expect(wrapper.text()).toContain('4K 3840x2160 · HEVC · 7.8 Mbps')
    expect(wrapper.text()).toContain('AAC · Stereo · ENG')
    expect(wrapper.text()).toContain('1 条字幕 · CHI · 1 条外挂')
  })
})
