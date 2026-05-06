import type { EmbyMediaSource, EmbyMediaStream, PlaybackQualityPreset } from './useEmbyClient'

export const DEFAULT_CUSTOM_MAX_STREAMING_BITRATE = 12_000_000

export const PLAYBACK_QUALITY_OPTIONS: readonly { title: string; value: PlaybackQualityPreset; bitrate: number | null }[] = [
  { title: '原画', value: 'original', bitrate: null },
  { title: '4K · 80 Mbps', value: '4k', bitrate: 80_000_000 },
  { title: '1080p · 20 Mbps', value: '1080p', bitrate: 20_000_000 },
  { title: '720p · 8 Mbps', value: '720p', bitrate: 8_000_000 },
  { title: '480p · 3 Mbps', value: '480p', bitrate: 3_000_000 },
  { title: '自定义码率', value: 'custom', bitrate: null },
]

export function normalizeBitrate(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_CUSTOM_MAX_STREAMING_BITRATE
  }

  return Math.round(Math.min(120_000_000, Math.max(1_000_000, numeric)))
}

export function bitrateToMbps(value: number) {
  return Math.round(normalizeBitrate(value) / 1_000_000)
}

export function mbpsToBitrate(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_CUSTOM_MAX_STREAMING_BITRATE
  }

  return normalizeBitrate(Math.round(numeric * 1_000_000))
}

export function bitrateForQualityPreset(preset: PlaybackQualityPreset, customMaxStreamingBitrate: number) {
  if (preset === 'custom') {
    return normalizeBitrate(customMaxStreamingBitrate)
  }

  return PLAYBACK_QUALITY_OPTIONS.find((option) => option.value === preset)?.bitrate ?? null
}

export function languagePreferences(value: string) {
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

export function streamMatchesLanguage(stream: EmbyMediaStream, preferredLanguage: string) {
  const candidates = [stream.Language, stream.DisplayTitle, stream.Codec]
    .filter(Boolean)
    .map((value) => value?.toLowerCase())

  return candidates.some((candidate) => candidate?.includes(preferredLanguage))
}

export function getPreferredStream(
  source: EmbyMediaSource | undefined,
  type: EmbyMediaStream['Type'],
  preferredLanguages: string,
) {
  const streams = source?.MediaStreams?.filter((stream) => stream.Type === type) ?? []
  const preferences = languagePreferences(preferredLanguages)

  for (const preference of preferences) {
    const matched = streams.find((stream) => streamMatchesLanguage(stream, preference))
    if (matched) {
      return matched
    }
  }

  if (type === 'Subtitle' && preferences.length === 0) {
    return null
  }

  return streams.find((stream) => stream.IsDefault) ?? streams[0] ?? null
}
