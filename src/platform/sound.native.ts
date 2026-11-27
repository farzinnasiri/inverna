import { Image } from 'react-native'
import { AudioContext, AudioManager, PlaybackNotificationManager } from 'react-native-audio-api'
import { artworkIcon, type ArtworkIconId, type SoundIconId } from '@/core/sound/catalog'
import type { NowPlayingMeta, SoundEngine } from '@/core/sound/engine'
import { createNeuroSoundEngine, type NowPlayingState } from './audio'
import type { AudioContextLike } from './audio/types'

const DEFAULT_ARTWORK_MODULE = require('../../assets/images/icon.png')

/**
 * Exact 1-to-1 512x512 Watchmaker PNG artworks matching EVERY in-app soundscape icon
 * so Dynamic Island & Lock Screen always show the exact icon of the playing soundscape.
 */
const ICON_ARTWORK_MODULES: Record<ArtworkIconId, number> = {
  rain: require('../../assets/artwork/icon-rain.png'),
  piano: require('../../assets/artwork/icon-piano.png'),
  fire: require('../../assets/artwork/icon-fire.png'),
  waves: require('../../assets/artwork/icon-waves.png'),
  moon: require('../../assets/artwork/icon-moon.png'),
  wind: require('../../assets/artwork/icon-wind.png'),
  feather: require('../../assets/artwork/icon-feather.png'),
  disc: require('../../assets/artwork/icon-disc.png'),
  orbit: require('../../assets/artwork/icon-orbit.png'),
  book: require('../../assets/artwork/icon-book.png'),
  trees: require('../../assets/artwork/icon-trees.png'),
  compass: require('../../assets/artwork/icon-compass.png'),
}

const artworkUriCache = new Map<string, string | undefined>()

function resolveArtworkUri(icon?: SoundIconId): string | undefined {
  const key = icon ?? 'default'
  if (artworkUriCache.has(key)) return artworkUriCache.get(key)
  try {
    const mod = icon ? ICON_ARTWORK_MODULES[artworkIcon(icon)] : DEFAULT_ARTWORK_MODULE
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
        // Only once it worked: a failure is tried again next time (it used to stick).
        sessionConfigured = true
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
      const artwork = resolveArtworkUri(meta?.icon)
      const showPromise = PlaybackNotificationManager.show({
        title: meta?.title ?? 'Theta rain',
        artist: 'Inverna',
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
          .catch(() => {
            // Try again with the next update.
            controlsConfigured = false
          })
      } else {
        void showPromise.catch(() => {})
      }
    } catch {
      /* ignore if notification center unavailable */
    }
  }

  return createNeuroSoundEngine({
    compensateBufferSampleRate: true,
    createContext: () => {
      try {
        void prepareSession()
        // 'playback' asks iOS for a 4096-frame IO buffer (~85 ms). Locked on a
        // charger with the Always-On Display, iOS runs audio on its slowest
        // cores; the bigger buffer gives the render thread slack. The cost is
        // later game-cue taps. iOS treats it as a preference.
        // Measured on device: development builds can't keep up there (the
        // audio library compiles unoptimised and runs a debug check on every
        // 128-frame slice), so judge this in a release build.
        // The device's own sample rate. The crackle seen while hot and charging
        // (and when taking a screenshot) was a development-build problem: a
        // release build on TestFlight plays cleanly at the device rate, so
        // this stays the tested setup.
        return new AudioContext({ latencyHint: 'playback' }) as unknown as AudioContextLike
      } catch {
        return null
      }
    },
    hooks: {
      onPrepareSession: prepareSession,
      onNowPlayingUpdate: updateNowPlaying,
      // The sleep timer ran out: hand the audio session back so iOS can let the app sleep.
      onIdle: () => {
        if (!sessionActive) return
        sessionActive = false
        void AudioManager.setAudioSessionActivity(false).catch(() => {})
      },
      bindRemoteControls: ({ onPause, onPlay, onInterruption, isPlaying }) => {
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
            // Headphones or a speaker went away: pause, as Music does, instead
            // of carrying on out loud from the phone (ISS-15.4).
            AudioManager.addSystemEventListener('routeChange', (ev) => {
              if (ev.reason === 'OldDeviceUnavailable' && isPlaying()) onPause()
            }),
          )
          subs.push(
            AudioManager.addSystemEventListener('interruption', (ev) => {
              sessionActive = false
              if (ev.type === 'began') {
                onInterruption({ phase: 'began' })
              } else if (ev.type === 'ended') {
                // The sound store decides whether to play again (not past its deadline, not stopped meanwhile).
                if (ev.shouldResume) void prepareSession().then(() => onInterruption({ phase: 'ended', shouldResume: true }))
                else onInterruption({ phase: 'ended', shouldResume: false })
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

