import { Image } from 'react-native'
import { AudioContext, AudioManager, PlaybackNotificationManager } from 'react-native-audio-api'
import type { SoundEngine } from '@/core/sound/engine'
import { createNeuroSoundEngine } from './audio'
import type { AudioContextLike } from './audio/types'

const LULL_ARTWORK_MODULE = require('../../assets/images/icon.png')
let cachedArtworkUri: string | undefined

function resolveArtworkUri(): string | undefined {
  if (cachedArtworkUri !== undefined) return cachedArtworkUri
  try {
    const resolved = Image.resolveAssetSource(LULL_ARTWORK_MODULE)
    cachedArtworkUri = resolved?.uri || undefined
  } catch {
    cachedArtworkUri = undefined
  }
  return cachedArtworkUri
}

/**
 * Native iOS / Android real-time neuroacoustic sound engine powered by
 * Software Mansion's `react-native-audio-api` (C++ CoreAudio / Oboe Web Audio API).
 *
 * - Runs the exact same zero-audio-file synthesis graph as Web on the native audio thread.
 * - Configures AVAudioSession (`playback` + Bluetooth A2DP + AirPlay + haptics allowed)
 *   so audio plays in silent mode and continues smoothly when the screen locks.
 * - Integrates `PlaybackNotificationManager` for iOS Dynamic Island, Lock Screen, and
 *   Control Center artwork + play/pause synchronization.
 */
export function createPlatformSoundEngine(): SoundEngine {
  let sessionConfigured = false
  let controlsConfigured = false

  const prepareSession = async () => {
    try {
      if (!sessionConfigured) {
        sessionConfigured = true
        AudioManager.setSystemOptions({
          ios: {
            category: 'playback',
            mode: 'default',
            options: ['allowBluetoothA2DP', 'allowAirPlay'],
            allowHaptics: true,
          },
        })
        AudioManager.observeAudioInterruptions(true)
      }
      await AudioManager.setAudioSessionActivity(true)
    } catch {
      /* ignore on unsupported runtimes */
    }
  }

  const updateNowPlaying = (meta: { title: string; subtitle?: string } | null, playing: boolean) => {
    try {
      if (!playing) {
        void PlaybackNotificationManager.hide().catch(() => {})
        return
      }
      const artwork = resolveArtworkUri()
      const showPromise = PlaybackNotificationManager.show({
        title: meta?.title ?? 'Theta rain',
        artist: 'Lull',
        album: meta?.subtitle ?? 'Neuroacoustic Soundscape',
        ...(artwork ? { artwork: { uri: artwork } } : {}),
        state: 'playing',
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
                onPause()
              } else if (ev.type === 'ended' && ev.shouldResume) {
                onPlay()
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
