import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { isSilent, LAYERS, normalizeBand, type LayerId, type Mix, type SleepBandId } from '@/core/sound/catalog'
import type { CueName, SoundEngine } from '@/core/sound/engine'

const LAYER_SOURCES: Record<LayerId, number> = {
  rain: require('../../assets/sounds/rain.wav'),
  waves: require('../../assets/sounds/waves.wav'),
  fire: require('../../assets/sounds/fire.wav'),
  wind: require('../../assets/sounds/wind.wav'),
  brown: require('../../assets/sounds/brown.wav'),
  pink: require('../../assets/sounds/pink.wav'),
  white: require('../../assets/sounds/white.wav'),
}

const BAND_SOURCES: Record<SleepBandId, number> = {
  delta: require('../../assets/sounds/binaural-delta.wav'),
  theta: require('../../assets/sounds/binaural-theta.wav'),
  alpha: require('../../assets/sounds/binaural-alpha.wav'),
}

const CUE_SOURCES: Record<CueName, number> = {
  tap: require('../../assets/sounds/cue-tap.wav'),
  place: require('../../assets/sounds/cue-place.wav'),
  clear: require('../../assets/sounds/cue-clear.wav'),
  chime: require('../../assets/sounds/cue-chime.wav'),
  undo: require('../../assets/sounds/cue-undo.wav'),
}

const ALL_LAYERS: readonly LayerId[] = LAYERS.map((l) => l.id)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Native iOS / Android sound engine powered by `expo-audio`.
 * - Plays seamless looping procedural WAV layers + stereo binaural tracks.
 * - Uses `interruptionMode: 'doNotMix'` + `setActiveForLockScreen(true, ...)` so iOS
 *   displays Lull's live audio controls on the Lock Screen, Control Center, and
 *   Dynamic Island whenever sound is running in the background!
 * - Listens for external OS Pause presses from Lock Screen / Dynamic Island and
 *   cleanly pauses all active layers + notifies `useSound`.
 */
export function createPlatformSoundEngine(): SoundEngine {
  let running = false
  let cuesEnabled = true
  let master = 0.85
  let modeReady = false
  let ignorePauseUntil = 0

  const layerPlayers = new Map<LayerId, AudioPlayer>()
  const bandPlayers = new Map<SleepBandId, AudioPlayer>()
  const cuePlayers = new Map<CueName, AudioPlayer>()

  let activeBand: SleepBandId | null = null
  let lastMix: Mix | null = null
  let lockScreenPlayer: AudioPlayer | null = null
  let lockScreenSub: { remove: () => void } | null = null
  let nowPlayingMeta: { title: string; subtitle?: string } = {
    title: 'Night Soundscape',
    subtitle: 'Lull',
  }
  const externalPauseListeners = new Set<() => void>()

  const ensureAudioMode = async () => {
    if (modeReady) return
    modeReady = true
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        // Apple requires an exclusive audio session (`doNotMix`) for Lock Screen,
        // Control Center, and Dynamic Island Now Playing controls to appear.
        interruptionMode: 'doNotMix',
        allowsRecording: false,
        shouldRouteThroughEarpiece: false,
      })
    } catch {
      /* ignore in unsupported runtime */
    }
  }

  const clearLockScreen = () => {
    lockScreenSub?.remove()
    lockScreenSub = null
    if (lockScreenPlayer) {
      try {
        lockScreenPlayer.clearLockScreenControls()
      } catch {
        /* ignore */
      }
      lockScreenPlayer = null
    }
  }

  const bindLockScreen = (primary: AudioPlayer | null) => {
    if (!primary || !running) {
      clearLockScreen()
      return
    }
    const meta = {
      title: nowPlayingMeta.title,
      artist: 'Lull',
      albumTitle: nowPlayingMeta.subtitle ?? 'Night Soundscape',
    }
    if (lockScreenPlayer === primary) {
      try {
        primary.updateLockScreenMetadata(meta)
      } catch {
        /* ignore */
      }
      return
    }
    clearLockScreen()
    lockScreenPlayer = primary
    try {
      primary.setActiveForLockScreen(true, meta, {
        showSeekBackward: false,
        showSeekForward: false,
        isLiveStream: true,
      })
      // Sync Lock Screen / Dynamic Island Pause button back to all Lull layers + UI state.
      lockScreenSub = primary.addListener('playbackStatusUpdate', (status) => {
        if (!running) return
        if (Date.now() < ignorePauseUntil) return
        if (status && status.isLoaded && !status.playing) {
          running = false
          ignorePauseUntil = Date.now() + 400
          for (const p of layerPlayers.values()) {
            if (p !== primary && p.playing) p.pause()
          }
          for (const p of bandPlayers.values()) {
            if (p !== primary && p.playing) p.pause()
          }
          clearLockScreen()
          for (const fn of externalPauseListeners) fn()
        }
      })
    } catch {
      /* ignore if lock screen controls unavailable on current runtime */
    }
  }

  const getLayer = (id: LayerId): AudioPlayer => {
    let p = layerPlayers.get(id)
    if (!p) {
      p = createAudioPlayer(LAYER_SOURCES[id])
      p.loop = true
      p.volume = 0
      layerPlayers.set(id, p)
    }
    return p
  }

  const getBand = (id: SleepBandId): AudioPlayer => {
    let p = bandPlayers.get(id)
    if (!p) {
      p = createAudioPlayer(BAND_SOURCES[id])
      p.loop = true
      p.volume = 0
      bandPlayers.set(id, p)
    }
    return p
  }

  const getCue = (name: CueName): AudioPlayer => {
    let p = cuePlayers.get(name)
    if (!p) {
      p = createAudioPlayer(CUE_SOURCES[name])
      p.loop = false
      cuePlayers.set(name, p)
    }
    return p
  }

  const applyVolumes = () => {
    if (!lastMix) return
    ignorePauseUntil = Date.now() + 350

    let primaryPlayer: AudioPlayer | null = null
    let primaryGain = 0

    for (const id of ALL_LAYERS) {
      const gain = clamp01(lastMix.layers[id] ?? 0)
      const p = layerPlayers.get(id)
      if (gain > 0.01 && running) {
        const player = p ?? getLayer(id)
        player.volume = gain * master
        if (!player.playing) player.play()
        if (gain > primaryGain) {
          primaryGain = gain
          primaryPlayer = player
        }
      } else if (p) {
        p.volume = 0
        if (p.playing) p.pause()
      }
    }

    const nextBand = running ? normalizeBand(lastMix.band) : null
    if (activeBand && activeBand !== nextBand) {
      const old = bandPlayers.get(activeBand)
      if (old) {
        old.volume = 0
        if (old.playing) old.pause()
      }
    }
    activeBand = nextBand
    if (nextBand) {
      const bp = getBand(nextBand)
      bp.volume = clamp01(lastMix.bandGain) * 0.55 * master
      if (!bp.playing) bp.play()
      if (!primaryPlayer) primaryPlayer = bp
    }

    bindLockScreen(primaryPlayer)
  }

  return {
    async unlock() {
      await ensureAudioMode()
    },

    setMix(mix: Mix) {
      lastMix = mix
      if (isSilent(mix)) {
        running = false
        applyVolumes()
        return
      }
      void ensureAudioMode()
      running = true
      applyVolumes()
    },

    setMaster(volume: number) {
      master = clamp01(volume)
      applyVolumes()
    },

    stop() {
      running = false
      ignorePauseUntil = Date.now() + 400
      clearLockScreen()
      for (const p of layerPlayers.values()) {
        p.volume = 0
        if (p.playing) p.pause()
      }
      for (const p of bandPlayers.values()) {
        p.volume = 0
        if (p.playing) p.pause()
      }
      activeBand = null
    },

    cue(name: CueName, volume = 1) {
      if (!cuesEnabled) return
      try {
        const p = getCue(name)
        p.volume = clamp01(volume) * 0.65
        void p.seekTo(0).then(() => p.play()).catch(() => p.play())
      } catch {
        /* ignore */
      }
    },

    setCuesEnabled(enabled: boolean) {
      cuesEnabled = Boolean(enabled)
    },

    setNowPlayingMeta(meta) {
      if (meta) {
        nowPlayingMeta = meta
        if (lockScreenPlayer && running) {
          try {
            lockScreenPlayer.updateLockScreenMetadata({
              title: meta.title,
              artist: 'Lull',
              albumTitle: meta.subtitle ?? 'Night Soundscape',
            })
          } catch {
            /* ignore */
          }
        }
      }
    },

    onExternalPause(listener) {
      externalPauseListeners.add(listener)
      return () => {
        externalPauseListeners.delete(listener)
      }
    },

    get isRunning() {
      return running
    },
  }
}
