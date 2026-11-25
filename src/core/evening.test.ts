import { describe, expect, it } from 'vitest'
import { eveningState, windowProgress } from './evening'
import type { Schedule } from './night'

const s = (bedtime: string, leadMinutes = 60): Schedule => ({
  enabled: true,
  bedtime,
  leadMinutes,
  days: [0, 1, 2, 3, 4, 5, 6],
})
const at = (h: number, m = 0, day = 24) => new Date(2026, 10, day, h, m)

describe('evening state around bedtime', () => {
  it('asks instead of counting down when bedtime just went by', () => {
    // The owner's case: bedtime 12:30 PM, opening the app at 2:10 PM.
    const st = eveningState(s('12:30'), at(14, 10))
    expect(st.kind).toBe('past')
    expect(st.minutesSinceBedtime).toBe(100)
    expect(eveningState(s('00:30'), at(1, 15, 25)).kind).toBe('past')
  })

  it('is winding down in the hour before bedtime', () => {
    const st = eveningState(s('23:00'), at(22, 20))
    expect(st.kind).toBe('winding')
    expect(st.minutesToBedtime).toBe(40)
    expect(st.windowStart?.getHours()).toBe(22)
    expect(windowProgress(st, at(22, 20))).toBeCloseTo(20 / 60, 5)
  })

  it('counts the evening down before the window opens', () => {
    expect(eveningState(s('23:00'), at(20, 30)).kind).toBe('evening')
  })

  it('greets the morning after the night and before noon', () => {
    expect(eveningState(s('23:30'), at(8, 0, 25)).kind).toBe('morning')
    expect(eveningState(s('23:30'), at(13, 0, 25)).kind).toBe('day')
  })

  it('opens the window early when wind down is started by hand', () => {
    const now = at(21, 0)
    const st = eveningState(s('23:00'), now, now.getTime())
    expect(st.kind).toBe('winding')
    expect(windowProgress(st, now)).toBe(0)
  })

  it('starts the window when wind down is pressed, even inside the lead time', () => {
    // Pressed at 2:19 for 15 minutes: the timeline runs 2:19 -> 2:34, not 1:34 -> 2:34.
    const pressed = at(2, 19, 25)
    const st = eveningState(s('02:34'), pressed, pressed.getTime())
    expect(st.windowStart?.getTime()).toBe(pressed.getTime())
    expect(windowProgress(st, pressed)).toBe(0)
  })

  it('has nothing to say without a bedtime', () => {
    expect(eveningState({ ...s('23:00'), enabled: false }, at(22, 0)).kind).toBe('none')
  })
})

describe('evening state with a sleep range', () => {
  const ranged = (bedtime: string, rangeMinutes: number): Schedule => ({ ...s(bedtime), rangeMinutes })

  it('is a normal night between the early and late edge, not past bedtime', () => {
    const st = eveningState(ranged('23:30', 60), at(0, 10, 25))
    expect(st.kind).toBe('asleepRange')
    expect(st.bedtime?.getHours()).toBe(23)
    expect(st.rangeEnd?.getHours()).toBe(0)
    expect(st.rangeEnd?.getMinutes()).toBe(30)
  })

  it('asks only once the late edge has gone by, and counts from it', () => {
    const st = eveningState(ranged('23:30', 60), at(0, 45, 25))
    expect(st.kind).toBe('past')
    expect(st.minutesSinceBedtime).toBe(15)
    expect(st.bedtime?.getMinutes()).toBe(30)
  })

  it('still winds down toward the early edge', () => {
    const st = eveningState(ranged('23:30', 60), at(23, 0))
    expect(st.kind).toBe('winding')
    expect(st.minutesToBedtime).toBe(30)
  })
})
