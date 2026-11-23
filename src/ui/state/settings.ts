import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { kv, NAMESPACE } from '@/core/storage'
import { DEFAULT_SCHEDULE, type Schedule } from '@/core/night'
import { SILENT_MIX, type Mix } from '@/core/sound/catalog'

/** zustand persistence routed through the platform key-value store. */
export const kvStorage = createJSONStorage(() => ({
  getItem: (k: string) => kv().getItem(NAMESPACE + k),
  setItem: (k: string, v: string) => kv().setItem(NAMESPACE + k, v),
  removeItem: (k: string) => kv().removeItem(NAMESPACE + k),
}))

export interface SettingsState {
  /** Manual night filter, 0..1 each. */
  warmth: number
  dim: number
  /** Let the bedtime schedule warm/dim the screen automatically. */
  followBedtime: boolean
  schedule: Schedule
  sessionMinutes: number
  sessionPreset: string | null
  sfx: boolean
  haptics: boolean
  /** Last custom mix from the Sounds screen. */
  mix: Mix
  /** Sleep timer for ambient sound, minutes (0 = until stopped). */
  sleepTimer: number
  set: (patch: Partial<Omit<SettingsState, 'set' | 'setSchedule'>>) => void
  setSchedule: (patch: Partial<Schedule>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      warmth: 0.2,
      dim: 0,
      followBedtime: true,
      schedule: DEFAULT_SCHEDULE,
      sessionMinutes: 15,
      sessionPreset: 'rainfall',
      sfx: true,
      haptics: true,
      mix: SILENT_MIX,
      sleepTimer: 30,
      set: (patch) => set(patch),
      setSchedule: (patch) => set((s) => ({ schedule: { ...s.schedule, ...patch } })),
    }),
    { name: 'settings', storage: kvStorage, version: 1 },
  ),
)
