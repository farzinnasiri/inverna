import { describe, expect, it } from 'vitest'
import { FADE_SECONDS, sessionDone, sessionEnd, sessionLevels, sessionProgress, type Session } from './session'

describe('wind-down session curve', () => {
  const s: Session = { startedAt: 1_000_000, minutes: 15, presetId: 'rainfall' }

  it('starts warm and gentle and ends faded to black', () => {
    const start = sessionLevels(s, s.startedAt)
    const mid = sessionLevels(s, s.startedAt + 7.5 * 60_000)
    const end = sessionLevels(s, s.startedAt + 15 * 60_000)

    expect(start.warmth).toBeLessThan(mid.warmth)
    expect(mid.warmth).toBeLessThan(end.warmth)
    expect(start.volume).toBeGreaterThan(end.volume)
    expect(start.calm).toBe(0)
    expect(end.calm).toBe(1)
    expect(start.fade).toBe(0)
    expect(mid.fade).toBe(0)
    expect(end.fade).toBe(1)
  })

  it('begins fading only in the final FADE_SECONDS', () => {
    const beforeFade = sessionLevels(s, s.startedAt + (15 * 60 - FADE_SECONDS - 1) * 1000)
    const inFade = sessionLevels(s, s.startedAt + (15 * 60 - FADE_SECONDS / 2) * 1000)
    expect(beforeFade.fade).toBe(0)
    expect(inFade.fade).toBeGreaterThan(0.3)
    expect(inFade.fade).toBeLessThan(0.7)
  })

  it('reports progress and completion accurately', () => {
    expect(sessionProgress(s, s.startedAt + 7.5 * 60_000)).toBeCloseTo(0.5, 4)
    expect(sessionDone(s, s.startedAt + 14 * 60_000)).toBe(false)
    expect(sessionDone(s, s.startedAt + 15 * 60_000)).toBe(true)
  })
})

describe('wind-down end', () => {
  it('ends at its deadline, not when the phone is next unlocked', () => {
    const s: Session = { startedAt: Date.UTC(2026, 10, 2, 22, 0), minutes: 30, presetId: null }
    expect(sessionEnd(s)).toBe(Date.UTC(2026, 10, 2, 22, 30))
  })
})
