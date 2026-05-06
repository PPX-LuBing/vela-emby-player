import { describe, expect, it } from 'vitest'
import {
  bitrateForQualityPreset,
  bitrateToMbps,
  getPreferredStream,
  languagePreferences,
  mbpsToBitrate,
  normalizeBitrate,
} from './playbackPreferences'
import type { EmbyMediaSource } from './useEmbyClient'

const mediaSource: EmbyMediaSource = {
  Id: 'source-1',
  MediaStreams: [
    { Index: 1, Type: 'Audio', Language: 'eng', DisplayTitle: 'English Stereo', IsDefault: true },
    { Index: 2, Type: 'Audio', Language: 'jpn', DisplayTitle: 'Japanese 5.1' },
    { Index: 3, Type: 'Subtitle', Language: 'eng', DisplayTitle: 'English SDH' },
    { Index: 4, Type: 'Subtitle', Language: 'chi', DisplayTitle: 'Chinese Simplified' },
  ],
}

describe('playback preferences', () => {
  it('normalizes bitrate bounds', () => {
    expect(normalizeBitrate(0)).toBe(12_000_000)
    expect(normalizeBitrate(500_000)).toBe(1_000_000)
    expect(normalizeBitrate(200_000_000)).toBe(120_000_000)
  })

  it('converts between Mbps and bps', () => {
    expect(mbpsToBitrate(8)).toBe(8_000_000)
    expect(bitrateToMbps(20_000_000)).toBe(20)
  })

  it('resolves bitrate for quality presets', () => {
    expect(bitrateForQualityPreset('original', 12_000_000)).toBeNull()
    expect(bitrateForQualityPreset('720p', 12_000_000)).toBe(8_000_000)
    expect(bitrateForQualityPreset('custom', 9_000_000)).toBe(9_000_000)
  })

  it('parses language priority lists', () => {
    expect(languagePreferences('chi, zho, eng')).toEqual(['chi', 'zho', 'eng'])
  })

  it('selects streams by priority language', () => {
    expect(getPreferredStream(mediaSource, 'Audio', 'jpn')?.Index).toBe(2)
    expect(getPreferredStream(mediaSource, 'Subtitle', 'zho, chi')?.Index).toBe(4)
  })

  it('falls back to default audio and disables subtitles without preference', () => {
    expect(getPreferredStream(mediaSource, 'Audio', '')?.Index).toBe(1)
    expect(getPreferredStream(mediaSource, 'Subtitle', '')).toBeNull()
  })
})
