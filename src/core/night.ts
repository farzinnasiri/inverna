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
  /**
   * "HH:MM", 24h. The early edge of the usual sleep range: when they most
   * nights start falling asleep. Reminders, the check-in and wind down key
   * off this.
   */
  bedtime: string
  /**
   * How long the usual sleep range runs after `bedtime` ("most nights I fall
   * asleep between 11:30 and 12:30" is 60). The "past bedtime" nudge waits for
   * the late edge, so it doesn't nag on normal nights. Missing = 0 (one time).
   */
  rangeMinutes?: number
  /** Minutes before bedtime when dimming and acoustic descent begin (60m = 1 hour). */
  leadMinutes: number
  /** 0 = Sunday … 6 = Saturday. */
  days: number[]
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** A saved schedule that can be used as it is. */
export function isSchedule(v: unknown): v is Schedule {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  return (
    typeof s.enabled === 'boolean' &&
    typeof s.bedtime === 'string' &&
    HHMM.test(s.bedtime) &&
    (s.rangeMinutes === undefined || (typeof s.rangeMinutes === 'number' && s.rangeMinutes >= 0)) &&
    typeof s.leadMinutes === 'number' &&
    s.leadMinutes >= 0 &&
    Array.isArray(s.days) &&
    s.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  )
}

/** The range onboarding and Settings set: one hour, slid along the night. */
export const DEFAULT_RANGE_MIN = 60

export const DEFAULT_SCHEDULE: Schedule = {
  enabled: true,
  bedtime: '23:00',
  rangeMinutes: DEFAULT_RANGE_MIN,
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

/** Minutes the sleep range runs past `bedtime` (0 when it's a single time). */
export function rangeMinutesOf(schedule: Schedule): number {
  return Math.max(0, Math.min(4 * 60, Math.round(schedule.rangeMinutes ?? 0)))
}

/** "HH:MM" of the late edge of the sleep range. */
export function rangeEnd(schedule: Schedule): string {
  const { h, m } = parseHHMM(schedule.bedtime)
  const t = (h * 60 + m + rangeMinutesOf(schedule)) % 1440
  return formatHHMM(Math.floor(t / 60), t % 60)
}

/**
 * "Around 11:45 PM, give or take 30 minutes": how people describe their sleep
 * time, and how onboarding and Settings ask for it. Underneath it's the same
 * range: it starts `giveOrTake` before the time and is twice that long.
 */
export const GIVE_OR_TAKE_MIN = [15, 30, 45, 60] as const

/** "HH:MM" moved by some minutes, wrapping around midnight. */
export function shiftHHMM(value: string, minutes: number): string {
  const { h, m } = parseHHMM(value)
  const t = (((h * 60 + m + minutes) % 1440) + 1440) % 1440
  return formatHHMM(Math.floor(t / 60), t % 60)
}

/** The middle of the range ("around"), "HH:MM". */
export function rangeCentre(schedule: Schedule): string {
  return shiftHHMM(schedule.bedtime, Math.round(rangeMinutesOf(schedule) / 2))
}

/** Half the range, snapped to the closest give-or-take choice. */
export function giveOrTakeOf(schedule: Schedule): number {
  const half = rangeMinutesOf(schedule) / 2
  return GIVE_OR_TAKE_MIN.reduce((best, g) => (Math.abs(g - half) < Math.abs(best - half) ? g : best), GIVE_OR_TAKE_MIN[0])
}

/** The range for "around `centre`, give or take `giveOrTake` minutes". */
export function rangeAround(centre: string, giveOrTake: number): Pick<Schedule, 'bedtime' | 'rangeMinutes'> {
  return { bedtime: shiftHHMM(centre, -giveOrTake), rangeMinutes: giveOrTake * 2 }
}

/** "11:30 PM – 12:30 AM", or one time when the range is empty. */
export function formatRange(schedule: Schedule): string {
  if (rangeMinutesOf(schedule) === 0) return formatBedtime12h(schedule.bedtime)
  return `${formatBedtime12h(schedule.bedtime)} – ${formatBedtime12h(rangeEnd(schedule))}`
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
  // Calendar fields, not "now minus 6 hours": on the night the clocks change
  // an hour goes missing or repeats, and a fixed offset lands on the wrong day.
  const d = new Date(now)
  if (d.getHours() < 6) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A bedtime that applies to one night only, then expires by itself. */
export interface BedtimeOverride {
  /** nightKey() of the night it applies to. */
  night: string
  /** "HH:MM", 24h. */
  bedtime: string
}

export function isBedtimeOverride(v: unknown): v is BedtimeOverride {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.night === 'string' && typeof o.bedtime === 'string' && HHMM.test(o.bedtime)
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

/**
 * Minutes until the late edge of the sleep range: the one tonight is in, or
 * the next. Null with no schedule. This is when "fade at the end of my sleep
 * time" stops a sound.
 */
export function minutesUntilRangeEnd(schedule: Schedule, now: Date): number | null {
  if (!schedule.enabled || schedule.days.length === 0) return null
  const range = rangeMinutesOf(schedule) * 60_000
  const { previous, next } = bedtimeAround(schedule, now)
  const end = previous && now.getTime() < previous.getTime() + range ? previous.getTime() + range : next ? next.getTime() + range : null
  return end === null ? null : Math.round((end - now.getTime()) / 60_000)
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

/**
 * Adaptive light & colour: what the screen does by itself through the day.
 *
 * - Daytime: nothing. Colours are the app's own.
 * - The evening (the 3 hours before wind down starts): a slight warmth and
 *   dimming creep in, too slow to notice.
 * - Wind down (the lead window before the usual range): warmer and dimmer,
 *   toward the night level.
 * - From bedtime until 6 AM: the night level. Warm (less blue, which keeps
 *   melatonin suppressed) and dim enough to be easy on dark-adapted eyes, yet
 *   still easy to read. It never goes as far as the sliders can.
 */
export const ADAPTIVE_NIGHT: NightFilter = { warmth: 0.75, dim: 0.45 }
const ADAPTIVE_EVENING: NightFilter = { warmth: 0.3, dim: 0.12 }
const EVENING_LEAD_MIN = 180

export function adaptiveFilter(schedule: Schedule, now: Date): NightFilter {
  const { phase, progress } = nightPhase(schedule, now)
  if (phase === 'bedtime') return ADAPTIVE_NIGHT
  const lerp = (a: NightFilter, b: NightFilter, t: number): NightFilter => ({
    warmth: a.warmth + (b.warmth - a.warmth) * t,
    dim: a.dim + (b.dim - a.dim) * t,
  })
  if (phase === 'winding') return lerp(ADAPTIVE_EVENING, ADAPTIVE_NIGHT, smooth(progress))
  const toWindDown = minutesUntilBedtime(schedule, now)
  if (toWindDown === null) return { warmth: 0, dim: 0 }
  const before = toWindDown - schedule.leadMinutes
  if (before >= EVENING_LEAD_MIN || before < 0) return { warmth: 0, dim: 0 }
  return lerp({ warmth: 0, dim: 0 }, ADAPTIVE_EVENING, smooth(1 - before / EVENING_LEAD_MIN))
}

/** Darkest the brightness slider goes (as `dim`, 0..1). */
const MANUAL_DIM_MAX = 0.7

/** The sliders: warmth 0..1 (1 warmest) and brightness 0..1 (1 is the screen as it is). */
export function manualFilter(warmth: number, brightness: number): NightFilter {
  return { warmth: clamp01(warmth), dim: MANUAL_DIM_MAX * (1 - clamp01(brightness)) }
}

/** Brightness slider position for a given `dim`, so the locked slider shows what adaptive is doing. */
export function brightnessForDim(dim: number): number {
  return clamp01(1 - dim / MANUAL_DIM_MAX)
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
