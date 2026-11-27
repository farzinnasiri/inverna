import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isArrayOf, isBoolean, isNullable, isNumber, isOneOf, isRecord, isRecordOf, isString, pickValid } from '@/core/decode'
import { GAMES, type GameId, type NightIntent } from '@/core/games/catalog'
import { PHONE_HABITS, SLEEP_FACTORS, type Difficulty, type SleepProfile } from '@/core/profile'
import type { DayAnswer, NowAnswer } from '@/core/tonight'
import {
  DEFAULT_RANGE_MIN,
  DEFAULT_SCHEDULE,
  effectiveSchedule,
  isBedtimeOverride,
  isSchedule,
  nightKey,
  type BedtimeOverride,
  type Schedule,
} from '@/core/night'
import { learnedRange, recordSignal, type SleepSignal, type SleepSignalKind } from '@/core/sleepRange'
import type { ModulationDepth } from '@/core/sound/arc'
import { DEFAULT_PRESET_ID, isCustomSound, isMix, normalizeBand, SILENT_MIX, type CustomSound, type Mix } from '@/core/sound/catalog'
import { kvStorage } from './storage'

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
  /** nightKey() of the night the check-in was last offered, so it asks once a night. */
  checkInAskedNight: string | null
  /** nightKey() of the night the answers below belong to. */
  checkInAnsweredNight: string | null
  /** The last check-in's answers (tonight's only when checkInAnsweredNight is tonight). */
  tonightDay: DayAnswer | null
  tonightNow: NowAnswer | null
  /** What Inverna decided from the check-in: which kind of games lead tonight. */
  tonightIntent: NightIntent | null
  /** First name, if they shared it. Used sparingly: greetings and reminders. */
  userName: string
  /** Daily reminder when it's time to wind down. Off until they turn it on. */
  reminders: boolean
  /** nightKey() of the night onboarding finished (the reminder offer waits until after it). */
  onboardedNight: string | null
  /** When the reminder offer was last shown (ms). */
  reminderOfferAt: number | null
  /** Times they said "Not now" to it. */
  reminderOfferDeclines: number
  /** nightKey()s of nights Inverna was opened, the last 30 (for the rating prompt). */
  nightsUsed: string[]
  /** When the rating prompt was last asked for (ms). */
  reviewAskedAt: number | null
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

const isGameId = isOneOf(GAMES.map((g) => g.id) as GameId[])
const isDifficulty = isOneOf(['easy', 'medium', 'hard'] as const)
const isIntent = isOneOf(['melt', 'focus', 'light'] as const)
const isUnit = (v: unknown): v is number => isNumber(v) && v >= 0 && v <= 1

const isProfile = (v: unknown): v is SleepProfile =>
  isRecord(v) &&
  isArrayOf(isOneOf(SLEEP_FACTORS))(v.factors) &&
  isUnit(v.mind) &&
  isArrayOf(isOneOf(PHONE_HABITS))(v.habits) &&
  isRecordOf(isOneOf([1, -1] as const))(v.liked) &&
  isUnit(v.volume)

const isPlayLayout = (v: unknown): v is PlayLayout =>
  isRecord(v) &&
  isString(v.night) &&
  (v.usual === null || isIntent(v.usual)) &&
  isArrayOf(isGameId)(v.order) &&
  isArrayOf(isGameId)(v.wide) &&
  isArrayOf(isGameId)(v.picks)

const isSleepSignal = (v: unknown): v is SleepSignal =>
  isRecord(v) && isString(v.night) && isNumber(v.minute) && isOneOf(['lightsOut', 'leftApp'] as const)(v.kind)

/**
 * What a saved field must look like to be loaded. A field that doesn't fit
 * (damaged, or written by a version that stored it differently) keeps its
 * default instead of reaching the app. Every saved field needs a check here,
 * or it isn't loaded.
 */
const SAVED: { [K in Exclude<keyof SettingsState, 'set' | 'setSchedule' | 'recordSleep'>]: (v: unknown) => boolean } = {
  warmth: isUnit,
  brightness: isUnit,
  adaptiveLight: isBoolean,
  schedule: isSchedule,
  sessionMinutes: isNumber,
  sessionPreset: isNullable(isString),
  modulationDepth: isOneOf(['off', 'subtle', 'deep'] as const),
  autoDescent: isBoolean,
  sfx: isBoolean,
  haptics: isBoolean,
  mix: isMix,
  hasCustomMix: isBoolean,
  customSounds: isArrayOf(isCustomSound),
  sleepTimer: isNumber,
  onboarded: isBoolean,
  lastGame: isNullable(isGameId),
  checkInAskedNight: isNullable(isString),
  checkInAnsweredNight: isNullable(isString),
  tonightDay: isNullable(isOneOf(['good', 'calm', 'busy', 'stressful', 'exhausting', 'sad'] as const)),
  tonightNow: isNullable(isOneOf(['sleepy', 'relaxed', 'worn_out', 'overthinking', 'wide_awake', 'restless'] as const)),
  tonightIntent: isNullable(isIntent),
  userName: isString,
  reminders: isBoolean,
  onboardedNight: isNullable(isString),
  reminderOfferAt: isNullable(isNumber),
  reminderOfferDeclines: isNumber,
  nightsUsed: isArrayOf(isString),
  reviewAskedAt: isNullable(isNumber),
  difficulty: (v) => isRecord(v) && Object.entries(v).every(([k, d]) => isGameId(k) && isDifficulty(d)),
  defaultDifficulty: isDifficulty,
  profile: isNullable(isProfile),
  plays: (v) => isRecord(v) && Object.entries(v).every(([k, n]) => isGameId(k) && isNumber(n)),
  playLayout: isNullable(isPlayLayout),
  volume: isUnit,
  bedtimeNudgeNight: isNullable(isString),
  lastLightsOut: isNullable(isString),
  lastLightsOutNight: isNullable(isString),
  tonightBedtime: isNullable(isBedtimeOverride),
  sleepSignals: isArrayOf(isSleepSignal),
  rangeLearnedNights: isNullable(isNumber),
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
      checkInAskedNight: null,
      checkInAnsweredNight: null,
      tonightDay: null,
      tonightNow: null,
      tonightIntent: null,
      userName: '',
      reminders: false,
      onboardedNight: null,
      reminderOfferAt: null,
      reminderOfferDeclines: 0,
      nightsUsed: [],
      reviewAskedAt: null,
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
      version: 10,
      merge: (saved, current) => {
        const next = pickValid(saved, current, SAVED)
        // Their own sounds are kept one by one: a damaged one never costs the rest.
        const sounds = isRecord(saved) ? saved.customSounds : undefined
        return Array.isArray(sounds) ? { ...next, customSounds: sounds.filter(isCustomSound) } : next
      },
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
        if (version < 9) {
          // One date stamp meant both "asked" and "answered"; dismissing the
          // check-in re-dated the night before's answers. Now there are two.
          const { lastCheckInDate, ...rest } = next
          const stamp = typeof lastCheckInDate === 'string' ? lastCheckInDate : null
          next = { ...rest, checkInAskedNight: stamp, checkInAnsweredNight: rest.tonightIntent ? stamp : null }
        }
        if (version < 10) {
          // Reminders became opt-in, offered now and then. Someone already set
          // up keeps their choice; the offer may show them from tomorrow on.
          next = { ...next, onboardedNight: next.onboarded ? '1970-01-01' : null, reminders: next.reminders === true }
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
