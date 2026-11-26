import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { GameId, NightIntent } from '@/core/games/catalog'
import type { Difficulty, SleepProfile } from '@/core/profile'
import type { DayAnswer, NowAnswer } from '@/core/tonight'
import { DEFAULT_RANGE_MIN, DEFAULT_SCHEDULE, effectiveSchedule, nightKey, type BedtimeOverride, type Schedule } from '@/core/night'
import { learnedRange, recordSignal, type SleepSignal, type SleepSignalKind } from '@/core/sleepRange'
import type { ModulationDepth } from '@/core/sound/arc'
import { DEFAULT_PRESET_ID, normalizeBand, SILENT_MIX, type CustomSound, type Mix } from '@/core/sound/catalog'
import { kv, NAMESPACE } from '@/core/storage'
import { bootPlatform } from '@/platform'

// Ensure platform localStorage is installed before any persist store hydrates.
bootPlatform()

/** zustand persistence routed through the platform key-value store. */
export const kvStorage = createJSONStorage(() => ({
  getItem: (k: string) => kv().getItem(NAMESPACE + k),
  setItem: (k: string, v: string) => kv().setItem(NAMESPACE + k, v),
  removeItem: (k: string) => kv().removeItem(NAMESPACE + k),
}))

export type { NightIntent }

export type { Difficulty }

export interface PlayLayout {
  /** nightKey() it was set for. */
  night: string
  /** The usual intent it was made for; a new one (onboarding again) remakes it. */
  usual: NightIntent | null
  order: GameId[]
  wide: GameId[]
  /** Games marked for tonight before any check-in (a check-in tonight replaces them). */
  picks: GameId[]
}

export interface SettingsState {
  /** Screen warmth from the Warmth slider, 0 = the app's own colours, 1 = warmest. */
  warmth: number
  /** Screen brightness from the Brightness slider, 1 = as it is, 0 = dimmest. */
  brightness: number
  /** Adaptive light & colour: warmth and brightness follow the time and bedtime; the sliders only show it. */
  adaptiveLight: boolean
  schedule: Schedule
  sessionMinutes: number
  sessionPreset: string | null
  /** Intensity of neural amplitude modulation & binaural reinforcement. */
  modulationDepth: ModulationDepth
  /** Automatically step frequency & warmth down across the final 60m before bedtime. */
  autoDescent: boolean
  sfx: boolean
  haptics: boolean
  /** Last custom mix from the Sounds screen. */
  mix: Mix
  /** True once user has edited a custom mix (adds "Custom" to Sounds mode strip). */
  hasCustomMix: boolean
  /** Sounds they made in the Mix studio and saved, oldest first. On this device only. */
  customSounds: CustomSound[]
  /** Sleep timer for ambient sound, minutes (0 = until stopped). */
  sleepTimer: number
  /** Whether the initial tuning has been completed/skipped. */
  onboarded: boolean
  /** Most recently opened game (gets the 2-wide Continue tile on Home). */
  lastGame: GameId | null
  /** Nightly check-in date stamp (YYYY-MM-DD) so it asks gently once per night. */
  lastCheckInDate: string | null
  /** Tonight's check-in answers (reset by lastCheckInDate each night). */
  tonightDay: DayAnswer | null
  tonightNow: NowAnswer | null
  /** What Inverna decided from the check-in: which kind of games lead tonight. */
  tonightIntent: NightIntent | null
  /** First name, if they shared it. Used sparingly: greetings and reminders. */
  userName: string
  /** Daily reminder when it's time to wind down. */
  reminders: boolean
  /** Chosen difficulty per game (games without their own difficulty use it through `useCalm`). */
  difficulty: Partial<Record<GameId, Difficulty>>
  /** Difficulty for games not set one by one; from onboarding. */
  defaultDifficulty: Difficulty
  /** What onboarding learned (stays on the device); null if skipped. */
  profile: SleepProfile | null
  /** Times each game was opened; Play gives the favourites the wide tiles. */
  plays: Partial<Record<GameId, number>>
  /** Play's tile layout, set once a night so tiles never move while in use. */
  playLayout: PlayLayout | null
  /** Sound volume, 0..1, kept between launches. */
  volume: number
  /** nightKey() of the night the in-game bedtime prompt was answered, so it asks once. */
  bedtimeNudgeNight: string | null
  /** Quiet non-streak reflection: formatted time of last completed wind-down. */
  lastLightsOut: string | null
  /** nightKey() of the night that lastLightsOut belongs to. */
  lastLightsOutNight: string | null
  /** Bedtime changed for one night only (tapping the time on Play). Expires at 06:00. */
  tonightBedtime: BedtimeOverride | null
  /** One moment close to falling asleep per recent night (see core/sleepRange). */
  sleepSignals: SleepSignal[]
  /** Nights the usual range was learned from; null while it's still what they said. */
  rangeLearnedNights: number | null
  set: (patch: Partial<Omit<SettingsState, 'set' | 'setSchedule' | 'recordSleep'>>) => void
  /** A change made by hand. Changing the range starts learning over. */
  setSchedule: (patch: Partial<Schedule>) => void
  /** Note a moment close to sleep tonight, and update the learned range. */
  recordSleep: (kind: SleepSignalKind, at?: Date) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      warmth: 0,
      brightness: 1,
      adaptiveLight: true,
      schedule: DEFAULT_SCHEDULE,
      sessionMinutes: 15,
      sessionPreset: DEFAULT_PRESET_ID,
      modulationDepth: 'subtle',
      autoDescent: true,
      sfx: true,
      haptics: true,
      mix: SILENT_MIX,
      hasCustomMix: false,
      customSounds: [],
      sleepTimer: -1, // until lights out
      onboarded: false,
      lastGame: null,
      lastCheckInDate: null,
      tonightDay: null,
      tonightNow: null,
      tonightIntent: null,
      userName: '',
      reminders: true,
      difficulty: {},
      defaultDifficulty: 'medium',
      profile: null,
      plays: {},
      playLayout: null,
      volume: 0.85,
      bedtimeNudgeNight: null,
      lastLightsOut: null,
      lastLightsOutNight: null,
      tonightBedtime: null,
      sleepSignals: [],
      rangeLearnedNights: null,
      set: (patch) => set(patch),
      setSchedule: (patch) =>
        set((s) => {
          const schedule = { ...s.schedule, ...patch }
          const rangeMoved = schedule.bedtime !== s.schedule.bedtime || schedule.rangeMinutes !== s.schedule.rangeMinutes
          return rangeMoved ? { schedule, sleepSignals: [], rangeLearnedNights: null } : { schedule }
        }),
      recordSleep: (kind, at = new Date()) =>
        set((s) => {
          const sleepSignals = recordSignal(s.sleepSignals, nightKey(at), at, kind)
          const learned = learnedRange(sleepSignals, s.schedule)
          if (!learned) return { sleepSignals }
          return {
            sleepSignals,
            rangeLearnedNights: learned.nights,
            schedule: { ...s.schedule, bedtime: learned.bedtime, rangeMinutes: learned.rangeMinutes },
          }
        }),
    }),
    {
      name: 'settings',
      storage: kvStorage,
      version: 8,
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== 'object') return persisted
        const p = persisted as Record<string, unknown>
        let next = { ...p }
        if (version < 2) {
          const warmth = typeof next.warmth === 'number' ? next.warmth : 0.3
          const dim = typeof next.dim === 'number' ? next.dim : 0
          const light = Math.min(1, Math.max(0, Math.max(warmth, dim / 0.6)))
          const rawMix = next.mix as Mix | undefined
          const mix = rawMix ? { ...rawMix, band: normalizeBand(rawMix.band) } : SILENT_MIX
          const { warmth: _w, dim: _d, ...rest } = next
          next = {
            ...rest,
            light,
            mix,
            hasCustomMix: false,
            onboarded: false,
            lastGame: null,
          }
        }
        if (version < 3) {
          const prevPreset = next.sessionPreset
          next = {
            ...next,
            sessionPreset: prevPreset === 'rainfall' || !prevPreset ? DEFAULT_PRESET_ID : prevPreset,
            modulationDepth: 'subtle',
            autoDescent: true,
          }
        }
        if (version < 5 && next.profile && typeof next.profile === 'object') {
          // Onboarding asks different things now: keep what still applies.
          const old = next.profile as Record<string, unknown>
          next = {
            ...next,
            profile: {
              factors: [],
              mind: typeof old.mind === 'number' ? old.mind : 0.4,
              styles: [],
              liked: old.liked && typeof old.liked === 'object' ? old.liked : {},
              volume: typeof old.volume === 'number' ? old.volume : 0.8,
            },
          }
        }
        if (version < 6 && next.schedule && typeof next.schedule === 'object') {
          // Bedtime became a range: what they set is its early edge.
          const sched = next.schedule as Schedule
          next = {
            ...next,
            schedule: { ...sched, rangeMinutes: sched.rangeMinutes ?? DEFAULT_RANGE_MIN },
            sleepSignals: [],
            rangeLearnedNights: null,
          }
        }
        if (version < 7) {
          // One night-light slider became Warmth and Brightness, and following
          // bedtime became Adaptive light & colour.
          const light = typeof next.light === 'number' ? Math.min(1, Math.max(0, next.light)) : 0.3
          const { light: _l, followBedtime, ...rest } = next
          next = {
            ...rest,
            warmth: light,
            brightness: 1 - light * 0.85,
            adaptiveLight: followBedtime !== false,
          }
        }
        if (version < 8 && next.profile && typeof next.profile === 'object') {
          // "Which game style helps" became "what do you do on your phone in bed".
          const { styles: _s, ...profile } = next.profile as Record<string, unknown>
          next = { ...next, profile: { ...profile, habits: Array.isArray(profile.habits) ? profile.habits : [] } }
        }
        if (version < 4) {
          // The check-in asks different questions now.
          next = { ...next, tonightDay: null, tonightNow: null, tonightIntent: null, lastCheckInDate: null }
          delete next.usualIntent
        }
        return next
      },
    },
  ),
)

/** The schedule in force now: the usual one, or tonight's bedtime if it was changed for tonight. */
export function currentSchedule(now = new Date()): Schedule {
  const st = useSettings.getState()
  return effectiveSchedule(st.schedule, st.tonightBedtime, now)
}

/** React view of `currentSchedule`; re-renders when the schedule or tonight's change does. */
export function useCurrentSchedule(now: Date): Schedule {
  const schedule = useSettings((s) => s.schedule)
  const tonight = useSettings((s) => s.tonightBedtime)
  return effectiveSchedule(schedule, tonight, now)
}
