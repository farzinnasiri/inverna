import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULE, type Schedule } from './night'
import { eveningMinute, KEEP_NIGHTS, LEARN_AFTER_NIGHTS, learnedRange, recordSignal, type SleepSignal } from './sleepRange'

const stated: Schedule = { ...DEFAULT_SCHEDULE, bedtime: '23:00', rangeMinutes: 60 }
const night = (i: number) => `2026-11-${String(i + 1).padStart(2, '0')}`
/** Signals at the given clock times, one per night. */
const nights = (times: string[], kind: SleepSignal['kind'] = 'leftApp'): SleepSignal[] =>
  times.map((t, i) => {
    const [h, m] = t.split(':').map(Number) as [number, number]
    return { night: night(i), minute: eveningMinute(h, m)!, kind }
  })

describe('sleep range learning', () => {
  it('counts evening minutes past midnight and ignores the daytime', () => {
    expect(eveningMinute(18, 0)).toBe(0)
    expect(eveningMinute(23, 30)).toBe(330)
    expect(eveningMinute(0, 45)).toBe(405)
    expect(eveningMinute(5, 59)).toBe(719)
    // 06:00 is the morning, as it is for nightKey.
    expect(eveningMinute(6, 0)).toBeNull()
    expect(eveningMinute(14, 0)).toBeNull()
  })

  it('keeps the latest signal per night, and only the recent nights', () => {
    let list: SleepSignal[] = []
    list = recordSignal(list, 'n1', new Date(2026, 10, 1, 23, 0), 'leftApp')
    list = recordSignal(list, 'n1', new Date(2026, 10, 2, 0, 20), 'leftApp')
    list = recordSignal(list, 'n1', new Date(2026, 10, 1, 22, 0), 'lightsOut')
    expect(list).toEqual([{ night: 'n1', minute: eveningMinute(0, 20), kind: 'leftApp' }])
    // A lights-out at the same minute is the stronger signal.
    list = recordSignal(list, 'n1', new Date(2026, 10, 2, 0, 20), 'lightsOut')
    expect(list[0]!.kind).toBe('lightsOut')
    // Daytime use isn't a bedtime.
    expect(recordSignal([], 'n2', new Date(2026, 10, 2, 13, 0), 'leftApp')).toEqual([])

    list = []
    for (let i = 0; i < KEEP_NIGHTS + 5; i++) list = recordSignal(list, night(i), new Date(2026, 10, 1, 23, 0), 'leftApp')
    expect(list).toHaveLength(KEEP_NIGHTS)
    expect(list[0]!.night).toBe(night(5))
  })

  it('waits for enough nights', () => {
    expect(learnedRange(nights(Array(LEARN_AFTER_NIGHTS - 1).fill('00:30')), stated)).toBeNull()
  })

  it('learns a later range than they said when that is what happens', () => {
    const times = ['00:00', '00:15', '00:30', '00:30', '00:45', '00:45', '01:00', '01:00', '01:15', '01:30']
    const learned = learnedRange(nights(times), stated)
    expect(learned).toEqual({ bedtime: '00:30', rangeMinutes: 30, nights: 10 })
  })

  it('keeps the range between 30 minutes and 2 hours', () => {
    const tight = learnedRange(nights(Array(12).fill('23:40')), stated)
    expect(tight?.rangeMinutes).toBe(30)
    expect(tight?.bedtime).toBe('23:30')
    const spread = ['21:30', '21:30', '21:45', '22:00', '23:00', '00:00', '01:00', '02:00', '02:15', '02:30', '02:30']
    expect(learnedRange(nights(spread), stated)?.rangeMinutes).toBe(120)
  })

  it('ignores leaving the app early in the evening, but not lights out', () => {
    const early = nights(Array(12).fill('19:30'))
    expect(learnedRange(early, stated)).toBeNull()
    expect(learnedRange(nights(Array(12).fill('19:30'), 'lightsOut'), stated)?.bedtime).toBe('19:15')
  })
})
