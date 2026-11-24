import { Image } from 'react-native'
import { AudioContext, AudioManager, PlaybackNotificationManager } from 'react-native-audio-api'
import type { SoundSceneId } from '@/core/sound/catalog'
import type { NowPlayingMeta, SoundEngine } from '@/core/sound/engine'
import { createNeuroSoundEngine, type NowPlayingState } from './audio'
import type { AudioContextLike } from './audio/types'

const DEFAULT_ARTWORK_MODULE = require('../../assets/images/icon.png')

/**
 * Per-soundscape 512x512 Watchmaker PNG artworks so Dynamic Island & Lock Screen
 * display each sound signature's own bespoke icon rather than a generic icon.
 */
const SCENE_ARTWORK_MODULES: Record<SoundSceneId, number> = {
  rain: require('../../assets/artwork/scene-rain.png'),
  classical: require('../../assets/artwork/scene-classical.png'),
  fire: require('../../assets/artwork/scene-fire.png'),
  waves: require('../../assets/artwork/scene-waves.png'),
  delta: require('../../assets/artwork/scene-delta.png'),
  wind: require('../../assets/artwork/scene-wind.png'),
  reverie: require('../../assets/artwork/scene-reverie.png'),
}

const artworkUriCache = new Map<string, string | undefined>()

function resolveArtworkUri(scene?: SoundSceneId): string | undefined {
  const key = scene ?? 'default'
  if (artworkUriCache.has(key)) return artworkUriCache.get(key)
  try {
    const mod = scene ? SCENE_ARTWORK_MODULES[scene] : DEFAULT_ARTWORK_MODULE
    const resolved = Image.resolveAssetSource(mod)
    const uri = resolved?.uri || undefined
    artworkUriCache.set(key, uri)
    return uri
  } catch {
    artworkUriCache.set(key, undefined)
    return undefined
  }
}

/**
 * Native iOS / Android real-time neuroacoustic sound engine powered by
 * Software Mansion's `react-native-audio-api` (C++ CoreAudio / Oboe Web Audio API).
 *
 * - Runs the exact same zero-audio-file synthesis graph as Web on the native audio thread.
 * - Uses valid iOS AVAudioSessionCategoryPlayback (`options: []`) — automatically routes
 *   to Speaker, Headphones, Bluetooth A2DP, and AirPlay with silent-mode & background audio.
 * - Integrates `PlaybackNotificationManager` with per-soundscape artwork and persistent
 *   Lock Screen / Dynamic Island Play & Pause controls when paused.
 */
export function createPlatformSoundEngine(): SoundEngine {
  let sessionConfigured = false
  let sessionActive = false
  let controlsConfigured = false

  const prepareSession = async () => {
    try {
      if (!sessionConfigured) {
        sessionConfigured = true
        AudioManager.setSystemOptions({
          ios: {
            category: 'playback',
            mode: 'default',
            options: [],
            allowHaptics: false,
            notifyOthersOnDeactivation: true,
          },
        })
        AudioManager.observeAudioInterruptions(true)
      }
      if (!sessionActive) {
        await AudioManager.setAudioSessionActivity(true)
        sessionActive = true
      }
    } catch {
      sessionActive = false
    }
  }

  const updateNowPlaying = (meta: NowPlayingMeta | null, state: NowPlayingState) => {
    try {
      if (state === 'stopped') {
        void PlaybackNotificationManager.hide().catch(() => {})
        return
      }
      const artwork = resolveArtworkUri(meta?.scene)
      const showPromise = PlaybackNotificationManager.show({
        title: meta?.title ?? 'Theta rain',
        artist: 'Lull',
        album: meta?.subtitle ?? 'Night Soundscape',
        ...(artwork ? { artwork: { uri: artwork } } : {}),
        state: state === 'playing' ? 'playing' : 'paused',
        isLiveStream: true,
      })

      if (!controlsConfigured) {
        controlsConfigured = true
        void showPromise
          .then(async () => {
            await PlaybackNotificationManager.enableControl('play', true)
            await PlaybackNotificationManager.enableControl('pause', true)
            await PlaybackNotificationManager.enableControl('nextTrack', false)
            await PlaybackNotificationManager.enableControl('previousTrack', false)
            await PlaybackNotificationManager.enableControl('skipForward', false)
            await PlaybackNotificationManager.enableControl('skipBackward', false)
            await PlaybackNotificationManager.enableControl('seekTo', false)
          })
          .catch(() => {})
      } else {
        void showPromise.catch(() => {})
      }
    } catch {
      /* ignore if notification center unavailable */
    }
  }

  return createNeuroSoundEngine({
    createContext: () => {
      try {
        void prepareSession()
        return new AudioContext() as unknown as AudioContextLike
      } catch {
        return null
      }
    },
    hooks: {
      onPrepareSession: prepareSession,
      onNowPlayingUpdate: updateNowPlaying,
      bindRemoteControls: ({ onPause, onPlay }) => {
        const subs: ({ remove?: () => void } | undefined)[] = []
        try {
          subs.push(
            PlaybackNotificationManager.addEventListener('playbackNotificationPause', () => onPause()),
          )
          subs.push(
            PlaybackNotificationManager.addEventListener('playbackNotificationStop', () => onPause()),
          )
          subs.push(
            PlaybackNotificationManager.addEventListener('playbackNotificationPlay', () => onPlay()),
          )
          subs.push(
            AudioManager.addSystemEventListener('interruption', (ev) => {
              if (ev.type === 'began') {
                sessionActive = false
                onPause()
              } else if (ev.type === 'ended' && ev.shouldResume) {
                sessionActive = false
                void prepareSession().then(() => onPlay())
              }
            }),
          )
        } catch {
          /* ignore if remote controls unavailable */
        }

        return () => {
          for (const sub of subs) {
            try {
              sub?.remove?.()
            } catch {
              /* ignore */
            }
          }
        }
      },
    },
  })
}
