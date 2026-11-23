import { create } from 'zustand'
import { presetById, type Mix } from '@/core/sound/catalog'
import { sound } from '@/platform'
import { useSettings } from './settings'

/**
 * Runtime sound state. The engine is the source of truth for audio; this
 * store mirrors what is playing so the UI can render it.
 */
interface SoundState {
  playing: boolean
  /** Preset id when a preset is playing, null for a custom mix. */
  presetId: string | null
  mix: Mix | null
  /** Epoch ms when the sleep timer fades sound out, null = no timer. */
  stopAt: number | null
  playPreset: (id: string, timerMinutes?: number) => void
  playMix: (mix: Mix, timerMinutes?: number) => void
  /** Live-edit the current mix (Sounds screen sliders). */
  updateMix: (mix: Mix) => void
  setTimer: (minutes: number) => void
  stop: (fadeSeconds?: number) => void
}

const timerToStopAt = (minutes: number | undefined) => (minutes && minutes > 0 ? Date.now() + minutes * 60_000 : null)

export const useSound = create<SoundState>()((set, get) => ({
  playing: false,
  presetId: null,
  mix: null,
  stopAt: null,
  playPreset: (id, timerMinutes) => {
    const preset = presetById(id)
    if (!preset) return
    void sound.unlock()
    sound.setMaster(1, 0.5)
    sound.setMix(preset.mix, 2)
    set({
      playing: true,
      presetId: id,
      mix: preset.mix,
      stopAt: timerToStopAt(timerMinutes ?? useSettings.getState().sleepTimer),
    })
  },
  playMix: (mix, timerMinutes) => {
    void sound.unlock()
    sound.setMaster(1, 0.5)
    sound.setMix(mix, 1.5)
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
  setTimer: (minutes) => {
    if (get().playing) set({ stopAt: timerToStopAt(minutes) })
  },
  stop: (fadeSeconds = 1.5) => {
    sound.stop(fadeSeconds)
    set({ playing: false, stopAt: null })
  },
}))
