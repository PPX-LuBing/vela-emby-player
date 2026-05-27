import type { ShallowRef } from 'vue'
import { buildAuthorizationHeader } from './embyAccountStore'
import type {
  EmbyMediaSource,
  EmbyMediaStream,
  EmbyPlaybackInfo,
  EmbySession,
  MpvAuthContext,
  PlaybackUrlOptions,
} from './useEmbyClient'

interface PlaybackApiOptions {
  playbackUserAgent: Readonly<ShallowRef<string>>
  request: <T>(path: string, init?: RequestInit) => Promise<T>
  requireSession: () => EmbySession
}

export function createEmbyPlaybackApi(options: PlaybackApiOptions) {
  async function getPlaybackInfo(itemId: string, startTimeTicks = 0) {
    const active = options.requireSession()
    const params = new URLSearchParams({
      UserId: active.userId,
      StartTimeTicks: String(Math.max(0, Math.round(startTimeTicks))),
      IsPlayback: 'true',
      AutoOpenLiveStream: 'true',
    })

    return options.request<EmbyPlaybackInfo>(`/Items/${itemId}/PlaybackInfo?${params.toString()}`, {
      method: 'POST',
      body: JSON.stringify({
        DeviceProfile: buildBrowserPlaybackProfile(),
        MaxStreamingBitrate: 80_000_000,
      }),
    })
  }

  function getPlaybackUrl(itemId: string, source: EmbyMediaSource, playbackOptions: PlaybackUrlOptions = {}) {
    const active = options.requireSession()
    const maxStreamingBitrate = playbackOptions.maxStreamingBitrate ?? null

    if (playbackOptions.itemType === 'TvChannel') {
      if (source.DirectStreamUrl) {
        return absolutizeUrl(source.DirectStreamUrl, active.serverUrl, active.accessToken)
      }

      if (source.TranscodingUrl) {
        return absolutizeUrl(source.TranscodingUrl, active.serverUrl, active.accessToken)
      }

      const params = new URLSearchParams({
        UserId: active.userId,
        MediaSourceId: playbackOptions.mediaSourceId ?? source.Id,
        PlaySessionId: playbackOptions.playSessionId ?? '',
        VideoCodec: 'h264',
        AudioCodec: 'aac',
        api_key: active.accessToken,
      })

      return `${active.serverUrl}/Videos/${itemId}/master.m3u8?${params.toString()}`
    }

    if (!playbackOptions.forceTranscode && !maxStreamingBitrate && source.DirectStreamUrl) {
      return absolutizeUrl(source.DirectStreamUrl, active.serverUrl, active.accessToken)
    }

    if (!maxStreamingBitrate && source.TranscodingUrl) {
      return absolutizeUrl(source.TranscodingUrl, active.serverUrl, active.accessToken)
    }

    const mediaSourceId = playbackOptions.mediaSourceId ?? source.Id
    const shouldUseHls = playbackOptions.forceTranscode || Boolean(maxStreamingBitrate) || !isBrowserDirectPlayable(source)

    if (shouldUseHls) {
      const params = new URLSearchParams({
        UserId: active.userId,
        MediaSourceId: mediaSourceId,
        PlaySessionId: playbackOptions.playSessionId ?? '',
        VideoCodec: 'h264',
        AudioCodec: 'aac',
        AudioStreamIndex: String(playbackOptions.audioStreamIndex ?? getDefaultStream(source, 'Audio')?.Index ?? 1),
        SubtitleMethod: 'Encode',
        api_key: active.accessToken,
      })

      if (maxStreamingBitrate) {
        params.set('MaxStreamingBitrate', String(maxStreamingBitrate))
      }

      if (typeof playbackOptions.subtitleStreamIndex === 'number') {
        params.set('SubtitleStreamIndex', String(playbackOptions.subtitleStreamIndex))
      }

      return `${active.serverUrl}/Videos/${itemId}/master.m3u8?${params.toString()}`
    }

    const params = new URLSearchParams({
      Static: 'true',
      MediaSourceId: mediaSourceId,
      api_key: active.accessToken,
    })

    if (typeof playbackOptions.audioStreamIndex === 'number') {
      params.set('AudioStreamIndex', String(playbackOptions.audioStreamIndex))
    }

    if (typeof playbackOptions.subtitleStreamIndex === 'number') {
      params.set('SubtitleStreamIndex', String(playbackOptions.subtitleStreamIndex))
    }

    return `${active.serverUrl}/Videos/${itemId}/stream?${params.toString()}`
  }

  function getSubtitleUrl(itemId: string, mediaSourceId: string, subtitleStreamIndex: number) {
    const active = options.requireSession()
    const params = new URLSearchParams({
      api_key: active.accessToken,
    })

    return `${active.serverUrl}/Videos/${itemId}/${mediaSourceId}/Subtitles/${subtitleStreamIndex}/Stream.vtt?${params.toString()}`
  }

  function getMpvAuthContext(): MpvAuthContext {
    const active = options.requireSession()
    return {
      token: active.accessToken,
      authorization: buildAuthorizationHeader(active.accessToken),
      userAgent: options.playbackUserAgent.value,
    }
  }

  async function reportPlaybackStart(
    itemId: string,
    mediaSourceId: string,
    playSessionId: string | undefined,
    positionTicks: number,
  ) {
    await options.request<void>('/Sessions/Playing', {
      method: 'POST',
      body: JSON.stringify({
        ItemId: itemId,
        MediaSourceId: mediaSourceId,
        PlaySessionId: playSessionId,
        PositionTicks: Math.round(positionTicks),
        CanSeek: true,
      }),
    })
  }

  async function reportPlaybackProgress(payload: {
    itemId: string
    mediaSourceId: string
    playSessionId?: string
    positionTicks: number
    isPaused: boolean
    isMuted: boolean
    volumeLevel: number
  }) {
    await options.request<void>('/Sessions/Playing/Progress', {
      method: 'POST',
      body: JSON.stringify({
        ItemId: payload.itemId,
        MediaSourceId: payload.mediaSourceId,
        PlaySessionId: payload.playSessionId,
        PositionTicks: Math.round(payload.positionTicks),
        IsPaused: payload.isPaused,
        IsMuted: payload.isMuted,
        VolumeLevel: Math.round(payload.volumeLevel),
        CanSeek: true,
      }),
    })
  }

  async function reportPlaybackStopped(
    itemId: string,
    mediaSourceId: string,
    playSessionId: string | undefined,
    positionTicks: number,
  ) {
    await options.request<void>('/Sessions/Playing/Stopped', {
      method: 'POST',
      body: JSON.stringify({
        ItemId: itemId,
        MediaSourceId: mediaSourceId,
        PlaySessionId: playSessionId,
        PositionTicks: Math.round(positionTicks),
      }),
    })
  }

  return {
    getMpvAuthContext,
    getPlaybackInfo,
    getPlaybackUrl,
    getSubtitleUrl,
    reportPlaybackProgress,
    reportPlaybackStart,
    reportPlaybackStopped,
  }
}

function buildBrowserPlaybackProfile() {
  return {
    MaxStreamingBitrate: 80_000_000,
    MaxStaticBitrate: 80_000_000,
    MusicStreamingTranscodingBitrate: 384_000,
    DirectPlayProfiles: [
      {
        Type: 'Video',
        Container: 'mp4,m4v,webm',
        VideoCodec: 'h264,hevc,vp8,vp9,av1',
        AudioCodec: 'aac,mp3,opus,vorbis,flac,alac',
      },
      {
        Type: 'Audio',
        Container: 'mp3,aac,m4a,flac,webm,ogg',
        AudioCodec: 'mp3,aac,flac,opus,vorbis,alac',
      },
    ],
    TranscodingProfiles: [
      {
        Type: 'Video',
        Container: 'ts',
        Protocol: 'hls',
        VideoCodec: 'h264',
        AudioCodec: 'aac,mp3',
        Context: 'Streaming',
      },
      {
        Type: 'Video',
        Container: 'mp4',
        VideoCodec: 'h264',
        AudioCodec: 'aac,mp3',
        Context: 'Streaming',
      },
    ],
    SubtitleProfiles: [
      { Format: 'vtt', Method: 'External' },
      { Format: 'srt', Method: 'External' },
      { Format: 'ass', Method: 'Encode' },
      { Format: 'ssa', Method: 'Encode' },
      { Format: 'pgssub', Method: 'Encode' },
      { Format: 'dvdsub', Method: 'Encode' },
    ],
  }
}

function isBrowserDirectPlayable(source: EmbyMediaSource) {
  const container = source.Container?.toLowerCase()
  return Boolean(
    source.SupportsDirectPlay &&
      container &&
      ['mp4', 'm4v', 'webm'].includes(container),
  )
}

function getDefaultStream(source: EmbyMediaSource, type: EmbyMediaStream['Type']) {
  const streams = source.MediaStreams?.filter((stream) => stream.Type === type) ?? []
  return streams.find((stream) => stream.IsDefault) ?? streams[0]
}

function absolutizeUrl(url: string, serverUrl: string, accessToken: string) {
  const absoluteUrl = url.startsWith('http') ? url : `${serverUrl}${url}`
  if (absoluteUrl.includes('api_key=') || absoluteUrl.includes('api_key%3D')) {
    return absoluteUrl
  }

  const separator = absoluteUrl.includes('?') ? '&' : '?'
  return `${absoluteUrl}${separator}api_key=${accessToken}`
}
