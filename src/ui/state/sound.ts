import { create } from 'zustand'
import { presetById, type Mix } from '@/core/sound/catalog'
import { sound } from '@/platform'
import { useSettings } from './settings'

interface SoundState {
  playing: boolean
  presetId: string | null
  mix: Mix | null
  /** User-controlled ambient master volume 0..1. */
  volume: number
  stopAt: number | null
  playPreset: (id: string, timerMinutes?: number) => void
  playMix: (mix: Mix, timerMinutes?: number) => void
  updateMix: (mix: Mix) => void
  setVolume: (volume: number) => void
  setTimer: (minutes: number) => void
  stop: (fadeSeconds?: number) => void
}

const timerToStopAt = (minutes: number | undefined) => (minutes && minutes > 0 ? Date.now() + minutes * 60_000 : null)

export const useSound = create<SoundState>()((set, get) => ({
  playing: false,
  presetId: null,
  mix: null,
  volume: 0.85,
  stopAt: null,
  playPreset: (id, timerMinutes) => {
    const preset = presetById(id)
    if (!preset) return
    void sound.unlock()
    sound.setMaster(get().volume, 0.5)
    sound.setMix(preset.mix, 1.8)
    set({
      playing: true,
      presetId: id,
      mix: preset.mix,
      stopAt: timerToStopAt(timerMinutes ?? useSettings.getState().sleepTimer),
    })
  },
  playMix: (mix, timerMinutes) => {
    void sound.unlock()
    sound.setMaster(get().volume, 0.5)
    sound.setMix(mix, 1.4)
    set({
      playing: true,
      presetId: null,
      mix,
      stopAt: timerToStopAt(timerMinutes ?? useSettings.getState().sleepTimer),
    })
  },
  updateMix: (mix) => {
    if (get().playing) sound.setMix(mix, 0.25)
    set({ mix, presetId: null })
  },
  setVolume: (raw) => {
    const volume = Math.min(1, Math.max(0, raw))
    sound.setMaster(volume, 0.12)
    set({ volume })
  },
  setTimer: (minutes) => {
    if (get().playing) set({ stopAt: timerToStopAt(minutes) })
  },
  stop: (fadeSeconds = 1.4) => {
    sound.stop(fadeSeconds)
    set({ playing: false, stopAt: null })
  },
}))
