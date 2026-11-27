import { describe, expect, it } from 'vitest'


describe('the pulse rate shown is the one playing', () => {
  // NAT-03: the Sounds chip showed the slow-down's resting 5 Hz while Lunar tide played its own α pulse.
  it("outside the slow-down it's the sound's own band; inside, the slow-down's", async () => {
    const { computeDescent, pulseRate } = await import('./arc')
    const { DEFAULT_SCHEDULE } = await import('../night')
    const base = { schedule: { ...DEFAULT_SCHEDULE, bedtime: '23:00' }, depth: 'subtle' as const, followBedtime: true }
    const afternoon = computeDescent({ ...base, now: new Date(2026, 10, 2, 15, 0), band: 'alpha' })
    expect(afternoon.modHz).toBe(8.5)
    expect(pulseRate('alpha', afternoon)).toBe(8.5)
    const evening = computeDescent({ ...base, now: new Date(2026, 10, 2, 22, 30), band: 'alpha' })
    expect(evening.autoActive).toBe(true)
    expect(pulseRate('alpha', evening)).toBe(evening.modHz)
    expect(pulseRate(null, evening)).toBeNull()
  })
})
