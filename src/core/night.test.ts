import { describe, expect, it } from 'vitest'
import {
  bedtimeSide,
  combineFilters,
  DEFAULT_SCHEDULE,
  effectiveSchedule,
  adaptiveFilter,
  ADAPTIVE_NIGHT,
  giveOrTakeOf,
  minutesUntilRangeEnd,
  rangeAround,
  rangeCentre,
  shiftHHMM,
  brightnessForDim,
  manualFilter,
  minutesUntilBedtime,
  nightKey,
  nightPhase,
  ribbonBedtime,
  ribbonEarliest,
  ribbonOffset,
  type Schedule,
} from './night'

describe('night schedule & filter', () => {
  it('detects day, winding, and bedtime phases', () => {
    const sched = { ...DEFAULT_SCHEDULE, bedtime: '23:00', leadMinutes: 60 }
    expect(nightPhase(sched, new Date(2026, 10, 23, 15, 0)).phase).toBe('day')

    const winding = nightPhase(sched, new Date(2026, 10, 23, 22, 30))
    expect(winding.phase).toBe('winding')
    expect(winding.progress).toBeCloseTo(0.5, 2)

    expect(nightPhase(sched, new Date(2026, 10, 23, 23, 30)).phase).toBe('bedtime')
    expect(nightPhase(sched, new Date(2026, 10, 24, 1, 0)).phase).toBe('bedtime')
  })

  it('adaptive light leaves the day alone and is off with no bedtime', () => {
    const sched = { ...DEFAULT_SCHEDULE, bedtime: '23:00', leadMinutes: 60 }
    expect(adaptiveFilter(sched, new Date(2026, 10, 23, 14, 0))).toEqual({ warmth: 0, dim: 0 })
    expect(adaptiveFilter(sched, new Date(2026, 10, 24, 9, 0))).toEqual({ warmth: 0, dim: 0 })
    const off = { ...sched, enabled: false }
    expect(adaptiveFilter(off, new Date(2026, 10, 23, 23, 15))).toEqual({ warmth: 0, dim: 0 })
    expect(minutesUntilBedtime(off, new Date(2026, 10, 23, 21, 0))).toBeNull()
  })

  it('adaptive light warms and dims steadily into the night, then holds', () => {
    const sched = { ...DEFAULT_SCHEDULE, bedtime: '23:00', leadMinutes: 60 }
    const at = (h: number, m = 0) => adaptiveFilter(sched, new Date(2026, 10, 23, h, m))
    const times = [at(19, 30), at(21, 0), at(22, 0), at(22, 30), at(22, 59)]
    for (let i = 1; i < times.length; i++) {
      expect(times[i]!.warmth).toBeGreaterThan(times[i - 1]!.warmth)
      expect(times[i]!.dim).toBeGreaterThan(times[i - 1]!.dim)
    }
    expect(at(23, 30)).toEqual(ADAPTIVE_NIGHT)
    expect(adaptiveFilter(sched, new Date(2026, 10, 24, 2, 0))).toEqual(ADAPTIVE_NIGHT)
    // Never as far as the sliders go.
    expect(ADAPTIVE_NIGHT.dim).toBeLessThan(manualFilter(0, 0).dim)
  })

  it('the brightness slider round-trips through dim', () => {
    for (const b of [0, 0.25, 0.6, 1]) expect(brightnessForDim(manualFilter(0, b).dim)).toBeCloseTo(b, 6)
  })

  it('combines filters by taking max per channel clamped to 0..1', () => {
    expect(combineFilters({ warmth: 0.2, dim: 0.5 }, { warmth: 0.8, dim: 0.1 }, { warmth: 1.5, dim: -0.2 })).toEqual({
      warmth: 1,
      dim: 0.5,
    })
  })
})

describe('around, give or take', () => {
  it('reads a range back as its middle and half its width', () => {
    const sched = { ...DEFAULT_SCHEDULE, bedtime: '23:15', rangeMinutes: 60 }
    expect(rangeCentre(sched)).toBe('23:45')
    expect(giveOrTakeOf(sched)).toBe(30)
  })

  it('makes the same range from "around" and "give or take", across midnight', () => {
    expect(rangeAround('00:15', 30)).toEqual({ bedtime: '23:45', rangeMinutes: 60 })
    expect(rangeAround('23:45', 15)).toEqual({ bedtime: '23:30', rangeMinutes: 30 })
    expect(shiftHHMM('23:50', 20)).toBe('00:10')
    expect(shiftHHMM('00:10', -20)).toBe('23:50')
  })

  it('counts down to the late edge, also from inside the range', () => {
    const sched = { ...DEFAULT_SCHEDULE, bedtime: '23:00', rangeMinutes: 60 }
    expect(minutesUntilRangeEnd(sched, new Date(2026, 10, 23, 22, 0))).toBe(120)
    expect(minutesUntilRangeEnd(sched, new Date(2026, 10, 23, 23, 30))).toBe(30)
    expect(minutesUntilRangeEnd({ ...sched, enabled: false }, new Date(2026, 10, 23, 22, 0))).toBeNull()
  })

  it('snaps an odd width to the closest choice', () => {
    expect(giveOrTakeOf({ ...DEFAULT_SCHEDULE, rangeMinutes: 100 })).toBe(45)
    expect(giveOrTakeOf({ ...DEFAULT_SCHEDULE, rangeMinutes: 0 })).toBe(15)
  })
})

describe('tonight-only bedtime', () => {
  const usual: Schedule = { enabled: true, bedtime: '23:00', leadMinutes: 60, days: [0, 1, 2, 3, 4, 5, 6] }

  it('keys the night by its evening until 06:00', () => {
    expect(nightKey(new Date(2026, 10, 24, 23, 30))).toBe('2026-11-24')
    expect(nightKey(new Date(2026, 10, 25, 0, 30))).toBe('2026-11-24')
    expect(nightKey(new Date(2026, 10, 25, 5, 59))).toBe('2026-11-24')
    expect(nightKey(new Date(2026, 10, 25, 6, 1))).toBe('2026-11-25')
  })

  it('moves tonight only and expires on its own', () => {
    const evening = new Date(2026, 10, 24, 22, 0)
    const override = { night: nightKey(evening), bedtime: '00:30' }
    const tonight = effectiveSchedule(usual, override, evening)
    expect(tonight.bedtime).toBe('00:30')
    expect(minutesUntilBedtime(tonight, evening)).toBe(150)
    const tomorrow = new Date(2026, 10, 25, 21, 0)
    expect(effectiveSchedule(usual, override, tomorrow)).toBe(usual)
  })

  it('applies even when the usual schedule is off', () => {
    const evening = new Date(2026, 10, 24, 22, 0)
    const off = { ...usual, enabled: false }
    expect(minutesUntilBedtime(off, evening)).toBeNull()
    const s = effectiveSchedule(off, { night: nightKey(evening), bedtime: '23:15' }, evening)
    expect(minutesUntilBedtime(s, evening)).toBe(75)
  })
})

describe('bedtime ribbon', () => {
  it('maps bedtimes onto the 8 PM – 3 AM ribbon', () => {
    expect(ribbonOffset('20:00')).toBe(0)
    expect(ribbonOffset('23:00')).toBe(180)
    expect(ribbonOffset('00:30')).toBe(270)
    expect(ribbonOffset('03:00')).toBe(420)
    expect(ribbonOffset('19:30')).toBe(-30)
    expect(ribbonOffset('12:30')).toBeLessThan(0)
  })

  it('snaps and clamps back to a bedtime', () => {
    expect(ribbonBedtime(268)).toBe('00:30')
    expect(ribbonBedtime(-40)).toBe('20:00')
    expect(ribbonBedtime(999)).toBe('03:00')
  })

  it('never offers a slot that has already passed', () => {
    expect(ribbonEarliest(new Date(2026, 10, 24, 23, 31))).toBe(225)
    expect(ribbonEarliest(new Date(2026, 10, 24, 23, 30))).toBe(225)
    expect(ribbonEarliest(new Date(2026, 10, 24, 15, 0))).toBe(0)
  })

  it('says which side of midnight a bedtime falls', () => {
    expect(bedtimeSide('00:30')).toBe('after midnight')
    expect(bedtimeSide('12:30')).toBe('this afternoon')
    expect(bedtimeSide('23:00')).toBe('this evening')
  })
})

describe('upcoming wind downs', () => {
  it('lists one start per night, an hour before bed, soonest first', async () => {
    const { upcomingWindDowns } = await import('./night')
    const now = new Date(2026, 10, 24, 12, 0)
    const starts = upcomingWindDowns({ enabled: true, bedtime: '23:00', leadMinutes: 60, days: [0, 1, 2, 3, 4, 5, 6] }, now, 3)
    expect(starts.map((d) => [d.getDate(), d.getHours()])).toEqual([[24, 22], [25, 22], [26, 22]])
  })

  it('skips tonight once its wind down has begun', async () => {
    const { upcomingWindDowns } = await import('./night')
    const now = new Date(2026, 10, 24, 22, 30)
    const [first] = upcomingWindDowns({ enabled: true, bedtime: '23:00', leadMinutes: 60, days: [0, 1, 2, 3, 4, 5, 6] }, now, 1)
    expect(first?.getDate()).toBe(25)
  })
})
