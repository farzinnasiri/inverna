/**
 * Learning someone's real sleep range from what the app sees at night.
 *
 * What people say in onboarding is their aim. For people who claw back "me
 * time" at night, the real range runs later. Inverna already sees moments close
 * to falling asleep:
 * - `lightsOut`: they chose "Put my phone down", or a wind down ended with
 *   lights out. A strong signal.
 * - `leftApp`: the last time they left Inverna at night. Weaker: they may keep
 *   scrolling elsewhere, or leave early in the evening and come back later.
 *
 * One signal per night is kept (the latest). After LEARN_AFTER_NIGHTS nights
 * the middle half of those times replaces the range they gave. A change made
 * by hand in Settings or onboarding wins, and learning starts over from there.
 *
 * Pure: time comes in as arguments; nights are `nightKey()` strings.
 */
import { formatHHMM, parseHHMM, type Schedule } from './night'

export type SleepSignalKind = 'lightsOut' | 'leftApp'

export interface SleepSignal {
  /** nightKey() of the evening it belongs to. */
  night: string
  /** Minutes after 6:00 PM that evening (0..720; past midnight keeps counting). */
  minute: number
  kind: SleepSignalKind
}

/** Nights of history kept. */
export const KEEP_NIGHTS = 21
/** Nights with a signal before the learned range replaces what they said. */
export const LEARN_AFTER_NIGHTS = 10
/** `leftApp` this long or more before the range starts doesn't count: they left early and slept later. */
export const EARLY_LEAVE_MIN = 120
const NARROWEST = 30
const WIDEST = 120
const STEP = 15
const WIDTH_STEP = 30
const EVENING_START = 18 * 60

/** Minutes after 6 PM for a clock time, or null if it's daytime (6 AM to 6 PM). */
export function eveningMinute(h: number, m: number): number | null {
  const off = (h * 60 + m - EVENING_START + 1440) % 1440
  return off <= 12 * 60 ? off : null
}

function minuteToHHMM(minute: number): string {
  const t = (EVENING_START + minute) % 1440
  return formatHHMM(Math.floor(t / 60), t % 60)
}

function startMinute(schedule: Schedule): number {
  const { h, m } = parseHHMM(schedule.bedtime)
  // A bedtime in the daytime still sorts sensibly: treat it as early evening.
  return eveningMinute(h, m) ?? 0
}

/**
 * Add tonight's signal, keeping one per night (the latest; a lights-out beats
 * leaving the app at the same minute) and the last KEEP_NIGHTS nights.
 * Daytime moments are ignored.
 */
export function recordSignal(signals: readonly SleepSignal[], night: string, at: Date, kind: SleepSignalKind): SleepSignal[] {
  const minute = eveningMinute(at.getHours(), at.getMinutes())
  if (minute === null) return [...signals]
  const prev = signals.find((s) => s.night === night)
  const later = !prev || minute > prev.minute || (minute === prev.minute && kind === 'lightsOut')
  const next: SleepSignal = later ? { night, minute, kind } : prev
  return [...signals.filter((s) => s.night !== night), next]
    .sort((a, b) => (a.night < b.night ? -1 : a.night > b.night ? 1 : 0))
    .slice(-KEEP_NIGHTS)
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)
}

/**
 * The range their nights show, or null until there are enough of them. The
 * range is the middle half of the nights (25th to 75th percentile), starting
 * on a 15-minute mark, 30 minutes to 2 hours wide in 30-minute steps (so it
 * reads back as "around X, give or take 15, 30, 45 or 60 minutes").
 */
export function learnedRange(
  signals: readonly SleepSignal[],
  stated: Schedule,
): { bedtime: string; rangeMinutes: number; nights: number } | null {
  const statedStart = startMinute(stated)
  const usable = signals
    .filter((s) => s.kind === 'lightsOut' || s.minute >= statedStart - EARLY_LEAVE_MIN)
    .map((s) => s.minute)
    .sort((a, b) => a - b)
  if (usable.length < LEARN_AFTER_NIGHTS) return null

  const mid = quantile(usable, 0.5)
  let early = quantile(usable, 0.25)
  let late = quantile(usable, 0.75)
  if (late - early < NARROWEST) {
    early = mid - NARROWEST / 2
    late = mid + NARROWEST / 2
  }
  if (late - early > WIDEST) {
    early = mid - WIDEST / 2
    late = mid + WIDEST / 2
  }
  const start = Math.max(0, Math.round(early / STEP) * STEP)
  const width = Math.min(WIDEST, Math.max(NARROWEST, Math.round((late - early) / WIDTH_STEP) * WIDTH_STEP))
  return { bedtime: minuteToHHMM(start), rangeMinutes: width, nights: usable.length }
}
