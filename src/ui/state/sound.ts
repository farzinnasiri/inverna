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

export const useSound = create<SoundState>()((set, get) => {
  // Keep Zustand store in sync when the user pauses Lull from the iOS Lock Screen or Dynamic Island.
  sound.onExternalPause?.(() => {
    set({ playing: false, stopAt: null })
  })

  return {
    playing: false,
    presetId: null,
    mix: null,
    volume: 0.85,
    stopAt: null,
    playPreset: (id, timerMinutes) => {
      const preset = presetById(id)
      if (!preset) return
      void sound.unlock()
      const mins = timerMinutes ?? useSettings.getState().sleepTimer
      sound.setNowPlayingMeta?.({
        title: preset.name,
        subtitle: mins > 0 ? `Lull · fades out in ${mins}m` : 'Lull · Night Soundscape',
      })
      sound.setMaster(get().volume, 0.5)
      sound.setMix(preset.mix, 1.8)
      set({
        playing: true,
        presetId: id,
        mix: preset.mix,
        stopAt: timerToStopAt(mins),
      })
    },
    playMix: (mix, timerMinutes) => {
      void sound.unlock()
      const mins = timerMinutes ?? useSettings.getState().sleepTimer
      sound.setNowPlayingMeta?.({
        title: 'Custom Soundscape',
        subtitle: mins > 0 ? `Lull · fades out in ${mins}m` : 'Lull · Night Soundscape',
      })
      sound.setMaster(get().volume, 0.5)
      sound.setMix(mix, 1.4)
      set({
        playing: true,
        presetId: null,
        mix,
        stopAt: timerToStopAt(mins),
      })
    },
    updateMix: (mix) => {
      if (get().playing) {
        sound.setNowPlayingMeta?.({ title: 'Custom Soundscape', subtitle: 'Lull · Night Soundscape' })
        sound.setMix(mix, 0.25)
      }
      set({ mix, presetId: null })
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
          subtitle: minutes > 0 ? `Lull · fades out in ${minutes}m` : 'Lull · Night Soundscape',
        })
        set({ stopAt: timerToStopAt(minutes) })
      }
    },
    stop: (fadeSeconds = 1.4) => {
      sound.stop(fadeSeconds)
      set({ playing: false, stopAt: null })
    },
  }
})
