import { describe, expect, it } from 'vitest'
import {
  combineFilters,
  DEFAULT_SCHEDULE,
  lightToFilter,
  minutesUntilBedtime,
  nightPhase,
  scheduledLight,
  scheduleFilter,
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

  it('returns zero filter during day or when disabled', () => {
    const sched = { ...DEFAULT_SCHEDULE, enabled: false }
    expect(scheduleFilter(sched, new Date(2026, 10, 23, 23, 15))).toEqual({ warmth: 0, dim: 0 })
    expect(minutesUntilBedtime(sched, new Date(2026, 10, 23, 21, 0))).toBeNull()
  })

  it('manual light is visible inside the lead window (never overridden by schedule)', () => {
    const sched = { ...DEFAULT_SCHEDULE, bedtime: '23:00', leadMinutes: 45 }
    const evening = new Date(2026, 10, 23, 22, 30)
    const low = scheduledLight(0.1, true, sched, evening)
    const mid = scheduledLight(0.4, true, sched, evening)
    const high = scheduledLight(0.8, true, sched, evening)

    expect(low).toBeGreaterThan(0.1)
    expect(mid).toBeGreaterThan(low)
    expect(high).toBeGreaterThan(mid)
    expect(lightToFilter(high).dim).toBeGreaterThan(lightToFilter(low).dim)
  })

  it('combines filters by taking max per channel clamped to 0..1', () => {
    expect(combineFilters({ warmth: 0.2, dim: 0.5 }, { warmth: 0.8, dim: 0.1 }, { warmth: 1.5, dim: -0.2 })).toEqual({
      warmth: 1,
      dim: 0.5,
    })
  })
})
