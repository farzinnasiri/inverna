/**
 * Night filter maths. Pure functions; the UI only paints the result.
 *
 * warmth 0..1 — how much blue light is removed (1 = deep ember monochrome)
 * dim    0..1 — how much the screen is darkened on top of that
 */
export interface NightFilter {
  warmth: number
  dim: number
}

export interface Schedule {
  enabled: boolean
  /** "HH:MM", 24h. */
  bedtime: string
  /** Minutes before bedtime when wind-down begins. */
  leadMinutes: number
  /** 0 = Sunday … 6 = Saturday. Days whose *evening* has a bedtime. */
  days: number[]
}

export const DEFAULT_SCHEDULE: Schedule = {
  enabled: true,
  bedtime: '23:00',
  leadMinutes: 45,
  days: [0, 1, 2, 3, 4, 5, 6],
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (t: number) => t * t * (3 - 2 * t)

export function parseHHMM(value: string): { h: number; m: number } {
  const [h = '23', m = '0'] = value.split(':')
  return { h: Number(h) % 24, m: Number(m) % 60 }
}

export function formatHHMM(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Bedtime instants closest to `now` (the most recent one and the next one),
 * honouring the selected days. Morning cut-off is 06:00: until then, last
 * night's bedtime still counts as "tonight".
 */
export function bedtimeAround(schedule: Schedule, now: Date): { previous: Date | null; next: Date | null } {
  const { h, m } = parseHHMM(schedule.bedtime)
  let previous: Date | null = null
  let next: Date | null = null
  for (let offset = -2; offset <= 7; offset++) {
    const d = new Date(now)
    d.setDate(d.getDate() + offset)
    d.setHours(h, m, 0, 0)
    // A bedtime after midnight (e.g. 00:30) belongs to the previous evening.
    const eveningDay = h < 12 ? (d.getDay() + 6) % 7 : d.getDay()
    if (!schedule.days.includes(eveningDay)) continue
    if (d.getTime() <= now.getTime()) previous = d
    else if (!next) next = d
  }
  return { previous, next }
}

/** Minutes until the next bedtime, or null if the schedule is off. */
export function minutesUntilBedtime(schedule: Schedule, now: Date): number | null {
  if (!schedule.enabled || schedule.days.length === 0) return null
  const { next } = bedtimeAround(schedule, now)
  return next ? Math.round((next.getTime() - now.getTime()) / 60000) : null
}

export type NightPhase = 'day' | 'winding' | 'bedtime'

/** Where we are relative to tonight's bedtime. */
export function nightPhase(schedule: Schedule, now: Date): { phase: NightPhase; progress: number } {
  if (!schedule.enabled || schedule.days.length === 0) return { phase: 'day', progress: 0 }
  const { previous, next } = bedtimeAround(schedule, now)
  const morning = new Date(now)
  morning.setHours(6, 0, 0, 0)
  if (previous && now.getTime() - previous.getTime() < 8 * 3600_000 && now < morning) {
    return { phase: 'bedtime', progress: 1 }
  }
  if (previous && now.getTime() - previous.getTime() < 3 * 3600_000 && now.getHours() >= 12) {
    return { phase: 'bedtime', progress: 1 }
  }
  if (next) {
    const lead = schedule.leadMinutes * 60_000
    const until = next.getTime() - now.getTime()
    if (until <= lead) return { phase: 'winding', progress: clamp01(1 - until / lead) }
  }
  return { phase: 'day', progress: 0 }
}

/** The filter the schedule asks for right now. */
export function scheduleFilter(schedule: Schedule, now: Date): NightFilter {
  const { phase, progress } = nightPhase(schedule, now)
  if (phase === 'day') return { warmth: 0, dim: 0 }
  const t = smooth(progress)
  return { warmth: 0.35 + 0.55 * t, dim: 0.3 * t }
}

/** Strongest of several filter requests wins, per channel. */
export function combineFilters(...filters: NightFilter[]): NightFilter {
  return filters.reduce(
    (acc, f) => ({ warmth: Math.max(acc.warmth, clamp01(f.warmth)), dim: Math.max(acc.dim, clamp01(f.dim)) }),
    { warmth: 0, dim: 0 },
  )
}
