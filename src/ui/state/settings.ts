import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { GameId } from '@/core/games/catalog'
import { kv, NAMESPACE } from '@/core/storage'
import { DEFAULT_SCHEDULE, type Schedule } from '@/core/night'
import { normalizeBand, SILENT_MIX, type Mix } from '@/core/sound/catalog'
import { bootPlatform } from '@/platform'

// Ensure platform localStorage is installed before any persist store hydrates.
bootPlatform()

/** zustand persistence routed through the platform key-value store. */
export const kvStorage = createJSONStorage(() => ({
  getItem: (k: string) => kv().getItem(NAMESPACE + k),
  setItem: (k: string, v: string) => kv().setItem(NAMESPACE + k, v),
  removeItem: (k: string) => kv().removeItem(NAMESPACE + k),
}))

export type DayFeeling = 'heavy' | 'restless' | 'steady' | 'bright'
export type NightIntent = 'melt' | 'focus' | 'light'

export interface SettingsState {
  /** Single unified night light level, 0 = normal, 1 = lowest. */
  light: number
  /** Let the bedtime schedule deepen light before bedtime. */
  followBedtime: boolean
  schedule: Schedule
  sessionMinutes: number
  sessionPreset: string | null
  sfx: boolean
  haptics: boolean
  /** Last custom mix from the Sounds screen. */
  mix: Mix
  /** True once user has edited a custom mix (adds "Custom" to Sounds mode strip). */
  hasCustomMix: boolean
  /** Sleep timer for ambient sound, minutes (0 = until stopped). */
  sleepTimer: number
  /** Whether the initial tuning has been completed/skipped. */
  onboarded: boolean
  /** Most recently opened game (gets the 2-wide Continue tile on Home). */
  lastGame: GameId | null
  /** Nightly check-in date stamp (YYYY-MM-DD) so it asks gently once per night. */
  lastCheckInDate: string | null
  tonightDay: DayFeeling | null
  tonightIntent: NightIntent | null
  /** Quiet non-streak reflection: formatted time of last completed wind-down. */
  lastLightsOut: string | null
  set: (patch: Partial<Omit<SettingsState, 'set' | 'setSchedule'>>) => void
  setSchedule: (patch: Partial<Schedule>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      light: 0.3,
      followBedtime: true,
      schedule: DEFAULT_SCHEDULE,
      sessionMinutes: 15,
      sessionPreset: 'rainfall',
      sfx: true,
      haptics: true,
      mix: SILENT_MIX,
      hasCustomMix: false,
      sleepTimer: 30,
      onboarded: false,
      lastGame: null,
      lastCheckInDate: null,
      tonightDay: null,
      tonightIntent: null,
      lastLightsOut: null,
      set: (patch) => set(patch),
      setSchedule: (patch) => set((s) => ({ schedule: { ...s.schedule, ...patch } })),
    }),
    {
      name: 'settings',
      storage: kvStorage,
      version: 2,
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== 'object') return persisted
        const p = persisted as Record<string, unknown>
        if (version < 2) {
          const warmth = typeof p.warmth === 'number' ? p.warmth : 0.3
          const dim = typeof p.dim === 'number' ? p.dim : 0
          const light = Math.min(1, Math.max(0, Math.max(warmth, dim / 0.6)))
          const rawMix = p.mix as Mix | undefined
          const mix = rawMix ? { ...rawMix, band: normalizeBand(rawMix.band) } : SILENT_MIX
          const { warmth: _w, dim: _d, ...rest } = p
          return {
            ...rest,
            light,
            mix,
            hasCustomMix: false,
            onboarded: false,
            lastGame: null,
          }
        }
        return persisted
      },
    },
  ),
)
