import { create } from 'zustand'
import { computeDescent, type DescentSnapshot } from '@/core/sound/arc'
import { DEFAULT_PRESET_ID, presetById, type Mix, type SoundIconId } from '@/core/sound/catalog'
import { DEFAULT_HARMONIC_KEY, type HarmonicKeyId } from '@/core/sound/harmonics'
import { sound } from '@/platform'
import { useSession } from './session'
import { useSettings } from './settings'

interface SoundState {
  playing: boolean
  presetId: string | null
  mix: Mix | null
  harmonicKey: HarmonicKeyId
  descent: DescentSnapshot
  volume: number
  stopAt: number | null
  playPreset: (id: string, timerMinutes?: number) => void
  playMix: (mix: Mix, timerMinutes?: number) => void
  updateMix: (mix: Mix) => void
  setVolume: (volume: number) => void
  setTimer: (minutes: number) => void
  syncDescent: (now?: Date, rampSeconds?: number) => DescentSnapshot
  stop: (fadeSeconds?: number, opts?: { hideNotification?: boolean }) => void
}

const SLEEP_FADE_SECONDS = 12

const timerToStopAt = (minutes: number | undefined) => (minutes && minutes > 0 ? Date.now() + minutes * 60_000 : null)

function syncNativeSleepFade(minutes: number | undefined) {
  if (minutes && minutes > 0) {
    sound.scheduleSleepFade?.(minutes * 60, SLEEP_FADE_SECONDS)
  } else {
    sound.cancelSleepFade?.()
  }
}

function inferIconFromMix(mix: Mix | null): SoundIconId {
  if (!mix) return 'rain'
  if (mix.classicalMotif === 'reverie') return 'feather'
  if (mix.classicalMotif === 'adagio') return 'disc'
  if (mix.classicalMotif === 'nocturne') return 'piano'
  const l = mix.layers
  const ranked: [SoundIconId, number][] = [
    ['rain', l.rain ?? 0],
    ['waves', l.waves ?? 0],
    ['fire', l.fire ?? 0],
    ['wind', l.wind ?? 0],
    ['moon', (l.brown ?? 0) + (l.pink ?? 0) * 0.6 + (mix.band === 'delta' ? 0.5 : 0)],
  ]
  ranked.sort((a, b) => b[1] - a[1])
  return ranked[0]![1] > 0.05 ? ranked[0]![0] : 'rain'
}

function buildDescentSnapshot(presetId: string | null, now = new Date()): DescentSnapshot {
  const settings = useSettings.getState()
  const session = useSession.getState().session
  const preset = presetById(presetId ?? settings.sessionPreset ?? DEFAULT_PRESET_ID)
  return computeDescent({
    schedule: settings.schedule,
    now,
    session,
    preset,
    depth: settings.modulationDepth,
    followBedtime: settings.autoDescent,
  })
}

function nowPlayingSubtitle(hint: string, mins: number): string {
  return mins > 0 ? `${hint} · ${mins}m timer` : hint
}

export const useSound = create<SoundState>()((set, get) => {
  sound.onExternalPause?.(() => {
    sound.cancelSleepFade?.()
    set({ playing: false, stopAt: null })
  })
  sound.onExternalPlay?.(() => {
    const mins = useSettings.getState().sleepTimer
    syncNativeSleepFade(mins)
    set({ playing: true, stopAt: timerToStopAt(mins) })
  })

  const initialPreset = presetById(useSettings.getState().sessionPreset ?? DEFAULT_PRESET_ID)
  const initialKey = initialPreset?.harmonicKey ?? DEFAULT_HARMONIC_KEY
  const initialDescent = buildDescentSnapshot(initialPreset?.id ?? DEFAULT_PRESET_ID)
  sound.setHarmonicKey?.(initialKey)
  sound.setDescent?.(initialDescent, 0.1)

  return {
    playing: false,
    presetId: null,
    mix: null,
    harmonicKey: initialKey,
    descent: initialDescent,
    volume: 0.85,
    stopAt: null,

    playPreset: (id, timerMinutes) => {
      const preset = presetById(id)
      if (!preset) return
      void sound.unlock()
      const mins = timerMinutes ?? useSettings.getState().sleepTimer
      const descent = buildDescentSnapshot(preset.id)
      sound.setHarmonicKey?.(preset.harmonicKey)
      sound.setDescent?.(descent, 0.6)
      sound.setNowPlayingMeta?.({
        title: preset.name,
        subtitle: nowPlayingSubtitle(preset.hint, mins),
        icon: preset.icon,
        scene: preset.scene,
      })
      sound.setMaster(get().volume, 0.5)
      sound.setMix(preset.mix, 1.4)
      syncNativeSleepFade(mins)
      set({
        playing: true,
        presetId: preset.id,
        mix: preset.mix,
        harmonicKey: preset.harmonicKey,
        descent,
        stopAt: timerToStopAt(mins),
      })
    },

    playMix: (mix, timerMinutes) => {
      void sound.unlock()
      const mins = timerMinutes ?? useSettings.getState().sleepTimer
      const key = mix.harmonicKey ?? get().harmonicKey ?? DEFAULT_HARMONIC_KEY
      const descent = buildDescentSnapshot(null)
      const icon = inferIconFromMix(mix)
      sound.setHarmonicKey?.(key)
      sound.setDescent?.(descent, 0.6)
      sound.setNowPlayingMeta?.({
        title: 'Custom mix',
        subtitle: nowPlayingSubtitle('Your layered blend', mins),
        icon,
      })
      sound.setMaster(get().volume, 0.5)
      sound.setMix({ ...mix, harmonicKey: key }, 1.2)
      syncNativeSleepFade(mins)
      set({
        playing: true,
        presetId: null,
        mix: { ...mix, harmonicKey: key },
        harmonicKey: key,
        descent,
        stopAt: timerToStopAt(mins),
      })
    },

    updateMix: (mix) => {
      const key = mix.harmonicKey ?? get().harmonicKey ?? DEFAULT_HARMONIC_KEY
      const nextMix = { ...mix, harmonicKey: key }
      sound.setHarmonicKey?.(key)
      if (get().playing) {
        const mins = useSettings.getState().sleepTimer
        sound.setNowPlayingMeta?.({
          title: 'Custom mix',
          subtitle: nowPlayingSubtitle('Your layered blend', mins),
          icon: inferIconFromMix(nextMix),
        })
        sound.setMix(nextMix, 0.25)
      }
      set({ mix: nextMix, presetId: null, harmonicKey: key })
    },

    setVolume: (raw) => {
      const volume = Math.min(1, Math.max(0, raw))
      sound.setMaster(volume, 0.12)
      set({ volume })
    },

    setTimer: (minutes) => {
      if (get().playing) {
        const preset = get().presetId ? presetById(get().presetId!) : null
        sound.setNowPlayingMeta?.({
          title: preset?.name ?? 'Custom mix',
          subtitle: nowPlayingSubtitle(preset?.hint ?? 'Your layered blend', minutes),
          icon: preset?.icon ?? inferIconFromMix(get().mix),
          scene: preset?.scene,
        })
        syncNativeSleepFade(minutes)
        set({ stopAt: timerToStopAt(minutes) })
      }
    },

    syncDescent: (now = new Date(), rampSeconds = 3.0) => {
      const state = get()
      const settings = useSettings.getState()
      const activePreset = presetById(state.presetId ?? settings.sessionPreset ?? DEFAULT_PRESET_ID)
      const key = state.mix?.harmonicKey ?? activePreset?.harmonicKey ?? DEFAULT_HARMONIC_KEY
      const next = buildDescentSnapshot(state.presetId ?? activePreset?.id ?? DEFAULT_PRESET_ID, now)

      sound.setHarmonicKey?.(key)
      sound.setDescent?.(next, rampSeconds)

      set({ descent: next, harmonicKey: key })
      return next
    },

    stop: (fadeSeconds = 1.4, opts) => {
      sound.stop(fadeSeconds, opts)
      set({ playing: false, stopAt: null })
    },
  }
})
