/**
 * Night light & bedtime schedule maths. Pure functions; the UI only paints.
 *
 * v2 semantics:
 * - One user control `light` (0 = normal, 1 = lowest).
 * - warmth = light, dim = 0.6 * light.
 * - The bedtime schedule deepens *from* the user's light level rather than
 *   replacing it, so manual adjustments are always immediately visible.
 */
export interface NightFilter {
  warmth: number
  dim: number
}

export interface Schedule {
  enabled: boolean
  /** "HH:MM", 24h. */
  bedtime: string
  /** Minutes before bedtime when dimming begins. Fixed at 45 in v2 UI. */
  leadMinutes: number
  /** 0 = Sunday … 6 = Saturday. */
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

/** Human-friendly 12h clock without leading zero clutter ("11:00"). */
export function formatBedtimeShort(value: string): string {
  const { h, m } = parseHHMM(value)
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')}`
}

/** Explicit 12h clock with AM/PM ("11:00 PM", "12:30 AM"). */
export function formatBedtime12h(value: string): string {
  const { h, m } = parseHHMM(value)
  const h12 = h % 12 || 12
  const period = h < 12 ? 'AM' : 'PM'
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

/**
 * Bedtime instants closest to `now` (the most recent one and the next one),
 * honouring the selected days. Morning cut-off is 06:00.
 */
export function bedtimeAround(schedule: Schedule, now: Date): { previous: Date | null; next: Date | null } {
  const { h, m } = parseHHMM(schedule.bedtime)
  let previous: Date | null = null
  let next: Date | null = null
  for (let offset = -2; offset <= 7; offset++) {
    const d = new Date(now)
    d.setDate(d.getDate() + offset)
    d.setHours(h, m, 0, 0)
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

/** Convert single user `light` level (0..1) into warmth + dim filter channels. */
export function lightToFilter(light: number): NightFilter {
  const l = clamp01(light)
  return { warmth: l, dim: 0.6 * l }
}

/**
 * Effective light level combining the user's manual `light` with the bedtime
 * schedule. The schedule deepens *from* the user's chosen level, so dragging
 * the slider always has an immediate visible effect even inside the lead window.
 */
export function scheduledLight(userLight: number, followBedtime: boolean, schedule: Schedule, now: Date): number {
  const base = clamp01(userLight)
  if (!followBedtime || !schedule.enabled) return base
  const { phase, progress } = nightPhase(schedule, now)
  if (phase === 'day') return base
  return clamp01(base + (1 - base) * 0.5 * smooth(progress))
}

/** Legacy helper kept for compatibility: schedule filter from userLight = 0. */
export function scheduleFilter(schedule: Schedule, now: Date, userLight = 0): NightFilter {
  return lightToFilter(scheduledLight(userLight, schedule.enabled, schedule, now))
}

/** Strongest of several filter requests wins, per channel. */
export function combineFilters(...filters: NightFilter[]): NightFilter {
  return filters.reduce(
    (acc, f) => ({ warmth: Math.max(acc.warmth, clamp01(f.warmth)), dim: Math.max(acc.dim, clamp01(f.dim)) }),
    { warmth: 0, dim: 0 },
  )
}
