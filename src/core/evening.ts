/**
 * Where tonight stands relative to bedtime, so Play can say the right thing.
 *
 * Bedtime is the pivot. Around it:
 * - past:    bedtime went by less than PAST_WINDOW ago (and we're not asleep):
 *            ask, don't count down 23 hours.
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
import { bedtimeAround, type Schedule } from './night'

export type EveningKind = 'none' | 'day' | 'morning' | 'evening' | 'winding' | 'past'

export interface EveningState {
  kind: EveningKind
  /** Tonight's bedtime ('past': the one that just went by). */
  bedtime: Date | null
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
  const none: EveningState = { kind: 'none', bedtime: null, windowStart: null, minutesToBedtime: null, minutesSinceBedtime: null }
  if (!schedule.enabled || schedule.days.length === 0) return none

  const { previous, next } = bedtimeAround(schedule, now)
  const t = now.getTime()

  if (previous && t - previous.getTime() < PAST_WINDOW_MIN * MIN) {
    return {
      kind: 'past',
      bedtime: previous,
      windowStart: null,
      minutesToBedtime: null,
      minutesSinceBedtime: Math.round((t - previous.getTime()) / MIN),
    }
  }
  if (!next) return none

  const lead = Math.max(5, schedule.leadMinutes) * MIN
  const fromLead = next.getTime() - lead
  // Wind down pressed by hand: the window starts then, whether that's earlier
  // or later than the usual lead time.
  const windowStart = new Date(windDownFrom && windDownFrom < next.getTime() ? windDownFrom : fromLead)
  const minutesToBedtime = Math.max(0, Math.round((next.getTime() - t) / MIN))
  const base = { bedtime: next, windowStart, minutesToBedtime, minutesSinceBedtime: null }

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
