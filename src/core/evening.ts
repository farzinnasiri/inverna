/**
 * Where tonight stands relative to bedtime, so Play can say the right thing.
 *
 * Bedtime is the pivot. It's a range (the usual sleep range's early and late
 * edges); with no range both edges are the same time. Around it:
 * - asleepRange: between the early and late edge: a normal night, no nagging.
 * - past:    the late edge went by less than PAST_WINDOW ago (and we're not
 *            asleep): ask, don't count down 23 hours.
 * - winding: inside the wind-down window: the lead time before bedtime, or
 *            since the user pressed Wind down.
 * - evening: within EVENING_WINDOW of the window starting.
 * - morning: after the night, until noon.
 * - day:     everything else.
 * - none:    no bedtime set.
 *
 * Pure: the schedule passed in is already the effective one (tonight-only
 * changes applied), and time comes in as an argument.
 */
import { bedtimeAround, rangeMinutesOf, type Schedule } from './night'

export type EveningKind = 'none' | 'day' | 'morning' | 'evening' | 'winding' | 'asleepRange' | 'past'

export interface EveningState {
  kind: EveningKind
  /**
   * Tonight's bedtime: the early edge of the range ('asleepRange': the one
   * tonight started at; 'past': the late edge that just went by).
   */
  bedtime: Date | null
  /** Late edge of tonight's range ('asleepRange' and 'past'). */
  rangeEnd: Date | null
  /** Start of the wind-down window before `bedtime` ('winding' and 'evening'). */
  windowStart: Date | null
  minutesToBedtime: number | null
  minutesSinceBedtime: number | null
}

/** How long after bedtime we still ask "wind down?" instead of moving on. */
export const PAST_WINDOW_MIN = 4 * 60
/** How long before the window opens the evening countdown starts. */
export const EVENING_WINDOW_MIN = 3 * 60

const MIN = 60_000

export function eveningState(schedule: Schedule, now: Date, windDownFrom?: number | null): EveningState {
  const none: EveningState = {
    kind: 'none',
    bedtime: null,
    rangeEnd: null,
    windowStart: null,
    minutesToBedtime: null,
    minutesSinceBedtime: null,
  }
  if (!schedule.enabled || schedule.days.length === 0) return none

  const { previous, next } = bedtimeAround(schedule, now)
  const t = now.getTime()
  const range = rangeMinutesOf(schedule) * MIN

  if (previous) {
    const lateEdge = previous.getTime() + range
    if (t < lateEdge) {
      return {
        kind: 'asleepRange',
        bedtime: previous,
        rangeEnd: new Date(lateEdge),
        windowStart: null,
        minutesToBedtime: null,
        minutesSinceBedtime: Math.round((t - previous.getTime()) / MIN),
      }
    }
    if (t - lateEdge < PAST_WINDOW_MIN * MIN) {
      return {
        kind: 'past',
        bedtime: new Date(lateEdge),
        rangeEnd: new Date(lateEdge),
        windowStart: null,
        minutesToBedtime: null,
        minutesSinceBedtime: Math.round((t - lateEdge) / MIN),
      }
    }
  }
  if (!next) return none

  const lead = Math.max(5, schedule.leadMinutes) * MIN
  const fromLead = next.getTime() - lead
  // Wind down pressed by hand: the window starts then, whether that's earlier
  // or later than the usual lead time.
  const windowStart = new Date(windDownFrom && windDownFrom < next.getTime() ? windDownFrom : fromLead)
  const minutesToBedtime = Math.max(0, Math.round((next.getTime() - t) / MIN))
  const base = { bedtime: next, rangeEnd: new Date(next.getTime() + range), windowStart, minutesToBedtime, minutesSinceBedtime: null }

  if (t >= windowStart.getTime()) return { kind: 'winding', ...base }
  if (windowStart.getTime() - t <= EVENING_WINDOW_MIN * MIN) return { kind: 'evening', ...base }
  if (now.getHours() < 12 && previous && t - previous.getTime() < 14 * 60 * MIN) return { kind: 'morning', ...base }
  return { kind: 'day', ...base }
}

/** 0..1 through the wind-down window, for the timeline needle. */
export function windowProgress(state: EveningState, now: Date): number {
  if (!state.windowStart || !state.bedtime) return 0
  const span = state.bedtime.getTime() - state.windowStart.getTime()
  if (span <= 0) return 1
  return Math.min(1, Math.max(0, (now.getTime() - state.windowStart.getTime()) / span))
}
