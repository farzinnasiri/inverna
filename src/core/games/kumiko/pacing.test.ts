import { describe, expect, it } from 'vitest'
import {
  contextSleepPrior,
  createPacing,
  DEFAULT_NIGHT_CONTEXT,
  initialChallenge,
  kumikoKinetics,
  recordKnotClosed,
  recordTap,
} from './pacing'
import type { KumikoNightContext } from './types'

describe('Kumiko night-aware pacing and drowsiness sensing', () => {
  it('starts brisker for wide-awake / overthinking nights and gentler for sleepy / past-bedtime nights', () => {
    const wired: KumikoNightContext = {
      ...DEFAULT_NIGHT_CONTEXT,
      calm: 0.1,
      eveningKind: 'evening',
      tonightNow: 'overthinking',
      tonightIntent: 'focus',
      profileMind: 0.85,
      profileHabits: ['short_video'],
    }
    const drowsy: KumikoNightContext = {
      ...DEFAULT_NIGHT_CONTEXT,
      calm: 0.75,
      eveningKind: 'past',
      tonightNow: 'sleepy',
      tonightDay: 'exhausting',
      tonightIntent: 'melt',
    }

    expect(contextSleepPrior(drowsy)).toBeGreaterThan(contextSleepPrior(wired) + 0.3)
    expect(initialChallenge(wired)).toBeGreaterThan(initialChallenge(drowsy) + 0.25)
  })

  it('detects sustained tap slowdown and overshoot against the player’s own baseline, offering handoff once', () => {
    const ctx: KumikoNightContext = {
      ...DEFAULT_NIGHT_CONTEXT,
      calm: 0.45,
      eveningKind: 'winding',
      windowProgress: 0.7,
      tonightNow: 'worn_out',
    }
    let p = createPacing(ctx)
    let t = 1_000

    // Establish a brisk ~360ms personal baseline with clean taps.
    for (let i = 0; i < 7; i++) {
      t += 360
      p = recordTap(p, t, false, ctx, 1)
    }
    expect(p.baselineTapMs).toBeGreaterThan(250)
    expect(p.baselineTapMs).toBeLessThan(500)
    const alertSleepy = p.sleepySignal

    // Now simulate drifting off: 950ms+ sluggish taps with overshoots and long gaps between knots.
    t = 46_000
    let offeredCount = 0
    for (let knot = 1; knot <= 4; knot++) {
      for (let i = 0; i < 4; i++) {
        t += 1_050
        p = recordTap(p, t, i % 2 === 0, ctx, knot)
      }
      t += 11_000
      const res = recordKnotClosed(p, t, ctx, knot)
      p = res.pacing
      if (res.shouldOfferHandoff) offeredCount++
    }

    expect(p.sleepySignal).toBeGreaterThan(alertSleepy + 0.25)
    expect(p.sleepySignal).toBeGreaterThanOrEqual(0.68)
    // Offered once, never spammed on later knots.
    expect(offeredCount).toBe(1)
    expect(kumikoKinetics(p, ctx.calm).allowCrests).toBe(false)
    expect(kumikoKinetics(p, ctx.calm).rotateMs).toBeGreaterThan(330)
  })

  it('never double-prompts when GameShell’s bedtime nudge already fired tonight', () => {
    const ctx: KumikoNightContext = {
      ...DEFAULT_NIGHT_CONTEXT,
      calm: 0.85,
      eveningKind: 'past',
      tonightNow: 'sleepy',
      bedtimeNudgeAlreadyShown: true,
    }
    let p = createPacing(ctx)
    let t = 50_000
    for (let k = 1; k <= 5; k++) {
      for (let i = 0; i < 4; i++) {
        t += 1_400
        p = recordTap(p, t, true, ctx, k)
      }
      const res = recordKnotClosed(p, t, ctx, k)
      p = res.pacing
      expect(res.shouldOfferHandoff).toBe(false)
    }
  })
})
