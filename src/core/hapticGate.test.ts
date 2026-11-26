import { describe, expect, it } from 'vitest'
import { createHapticGate } from './hapticGate'

describe('haptic gate', () => {
  const gaps = { tick: 45, complete: 1500 }

  it('drops a repeat of the same event that comes too soon', () => {
    const admit = createHapticGate(gaps, 35)
    expect(admit('tick', 0)).toBe(true)
    expect(admit('tick', 30)).toBe(false)
    expect(admit('tick', 50)).toBe(true)
  })

  it('keeps two events for one action from doubling, but never hides a heavier one', () => {
    const admit = createHapticGate({ tick: 45, settle: 70, complete: 1500 }, 35)
    expect(admit('settle', 100)).toBe(true)
    expect(admit('tick', 110)).toBe(false)
    expect(admit('complete', 112)).toBe(true)
  })

  it('lets a round complete only once in a burst', () => {
    const admit = createHapticGate(gaps, 35)
    expect(admit('complete', 0)).toBe(true)
    expect(admit('complete', 800)).toBe(false)
    expect(admit('complete', 1600)).toBe(true)
  })
})
