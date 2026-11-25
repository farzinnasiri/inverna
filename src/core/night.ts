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
  /** Minutes before bedtime when dimming and acoustic descent begin (60m = 1 hour). */
  leadMinutes: number
  /** 0 = Sunday … 6 = Saturday. */
  days: number[]
}

export const DEFAULT_SCHEDULE: Schedule = {
  enabled: true,
  bedtime: '23:00',
  leadMinutes: 60,
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

/**
 * Which night a moment belongs to, as YYYY-MM-DD of the evening. The night
 * runs until 06:00, so 12:30 AM still belongs to the evening before.
 */
export function nightKey(now: Date): string {
  const d = new Date(now.getTime() - 6 * 3600_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A bedtime that applies to one night only, then expires by itself. */
export interface BedtimeOverride {
  /** nightKey() of the night it applies to. */
  night: string
  /** "HH:MM", 24h. */
  bedtime: string
}

export function overrideActive(override: BedtimeOverride | null | undefined, now: Date): override is BedtimeOverride {
  return Boolean(override && override.night === nightKey(now))
}

/**
 * The schedule in force right now: the usual one, or tonight's bedtime when
 * the user changed it just for tonight. A tonight-only bedtime also applies
 * when the usual schedule is off or skips tonight.
 */
export function effectiveSchedule(schedule: Schedule, override: BedtimeOverride | null | undefined, now: Date): Schedule {
  if (!overrideActive(override, now)) return schedule
  return { ...schedule, enabled: true, bedtime: override.bedtime, days: [0, 1, 2, 3, 4, 5, 6] }
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

/* ---------------------------------------------------------- bedtime ribbon */

/** The Play bedtime ribbon spans 8:00 PM to 3:00 AM, in 15-minute steps. */
export const RIBBON_START_MIN = 20 * 60
export const RIBBON_SPAN_MIN = 7 * 60
export const RIBBON_STEP_MIN = 15

/** Minutes after 8:00 PM for a "HH:MM" bedtime (may fall outside 0..span). */
export function ribbonOffset(bedtime: string): number {
  const { h, m } = parseHHMM(bedtime)
  const off = (h * 60 + m - RIBBON_START_MIN + 1440) % 1440
  // Times late in the day before 8 PM read as "earlier than the ribbon", not "tomorrow".
  return off > RIBBON_SPAN_MIN + 6 * 60 ? off - 1440 : off
}

/** "HH:MM" for an offset on the ribbon, snapped to 15 minutes and kept on the ribbon. */
export function ribbonBedtime(offset: number): string {
  const snapped = Math.round(offset / RIBBON_STEP_MIN) * RIBBON_STEP_MIN
  const clamped = Math.min(RIBBON_SPAN_MIN, Math.max(0, snapped))
  const t = (RIBBON_START_MIN + clamped) % 1440
  return formatHHMM(Math.floor(t / 60), t % 60)
}

/** The first 15-minute slot on the ribbon that is still ahead of `now`. */
export function ribbonEarliest(now: Date): number {
  const off = ribbonOffset(formatHHMM(now.getHours(), now.getMinutes()))
  if (off < 0 || off > RIBBON_SPAN_MIN) return 0
  return Math.min(RIBBON_SPAN_MIN, Math.ceil((off + 1) / RIBBON_STEP_MIN) * RIBBON_STEP_MIN)
}

/** "after midnight" / "this evening" / "this afternoon": says which side of midnight a bedtime is. */
export function bedtimeSide(bedtime: string): string {
  const { h } = parseHHMM(bedtime)
  if (h < 6) return 'after midnight'
  if (h < 12) return 'in the morning'
  if (h < 18) return 'this afternoon'
  return 'this evening'
}

/**
 * When the next `count` wind downs start (bedtime minus the lead time), soonest
 * first, skipping any that already began. Used to schedule one reminder a night.
 */
export function upcomingWindDowns(schedule: Schedule, now: Date, count: number): Date[] {
  if (!schedule.enabled || schedule.days.length === 0) return []
  const out: Date[] = []
  let cursor = now
  for (let guard = 0; out.length < count && guard < count * 3; guard++) {
    const { next } = bedtimeAround(schedule, cursor)
    if (!next) break
    const start = new Date(next.getTime() - schedule.leadMinutes * 60_000)
    if (start.getTime() > now.getTime()) out.push(start)
    cursor = new Date(next.getTime() + 60_000)
  }
  return out
}
