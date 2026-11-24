import { create } from 'zustand'
import { computeDescent, type DescentSnapshot } from '@/core/sound/arc'
import { DEFAULT_PRESET_ID, presetById, type Mix } from '@/core/sound/catalog'
import { DEFAULT_HARMONIC_KEY, type HarmonicKeyId } from '@/core/sound/harmonics'
import { sound } from '@/platform'
import { useSession } from './session'
import { useSettings } from './settings'

interface SoundState {
  playing: boolean
  presetId: string | null
  mix: Mix | null
  /** Active harmonic scale locking pad + interactive game cues. */
  harmonicKey: HarmonicKeyId
  /** Live 60-minute Iso-descent acoustic telemetry snapshot. */
  descent: DescentSnapshot
  /** User-controlled ambient master volume 0..1. */
  volume: number
  stopAt: number | null
  playPreset: (id: string, timerMinutes?: number) => void
  playMix: (mix: Mix, timerMinutes?: number) => void
  updateMix: (mix: Mix) => void
  setVolume: (volume: number) => void
  setTimer: (minutes: number) => void
  syncDescent: (now?: Date, rampSeconds?: number) => DescentSnapshot
  stop: (fadeSeconds?: number) => void
}

const timerToStopAt = (minutes: number | undefined) => (minutes && minutes > 0 ? Date.now() + minutes * 60_000 : null)

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

function nowPlayingSubtitle(descent: DescentSnapshot, mins: number): string {
  const phaseStr =
    descent.depth === 'off'
      ? `${descent.phaseLabel} phase`
      : `${descent.bandLabel} · ${descent.modHz.toFixed(1)} Hz · ${descent.phaseLabel}`
  return mins > 0 ? `${phaseStr} · fades in ${mins}m` : phaseStr
}

export const useSound = create<SoundState>()((set, get) => {
  // Keep Zustand store in sync when the user pauses or resumes from iOS Lock Screen / Dynamic Island.
  sound.onExternalPause?.(() => {
    set({ playing: false, stopAt: null })
  })
  sound.onExternalPlay?.(() => {
    const mins = useSettings.getState().sleepTimer
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
        subtitle: nowPlayingSubtitle(descent, mins),
      })
      sound.setMaster(get().volume, 0.5)
      sound.setMix(preset.mix, 1.8)
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
      sound.setHarmonicKey?.(key)
      sound.setDescent?.(descent, 0.6)
      sound.setNowPlayingMeta?.({
        title: 'Custom Soundscape',
        subtitle: nowPlayingSubtitle(descent, mins),
      })
      sound.setMaster(get().volume, 0.5)
      sound.setMix({ ...mix, harmonicKey: key }, 1.4)
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
          title: 'Custom Soundscape',
          subtitle: nowPlayingSubtitle(get().descent, mins),
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
          title: preset?.name ?? 'Custom Soundscape',
          subtitle: nowPlayingSubtitle(get().descent, minutes),
        })
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

      if (state.playing && next.phase !== state.descent.phase) {
        sound.setNowPlayingMeta?.({
          title: activePreset?.name ?? 'Custom Soundscape',
          subtitle: nowPlayingSubtitle(next, settings.sleepTimer),
        })
      }

      set({ descent: next, harmonicKey: key })
      return next
    },

    stop: (fadeSeconds = 1.4) => {
      sound.stop(fadeSeconds)
      set({ playing: false, stopAt: null })
    },
  }
})
