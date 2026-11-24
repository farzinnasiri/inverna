import { describe, expect, it } from 'vitest'
import {
  clearTarget,
  createPond,
  GATHER_RADIUS,
  LEAF_COUNT,
  MAX_RIPPLES,
  setTarget,
  SPINE_SEGMENTS,
  SPINE_SPACING,
  tapPond,
  tickPond,
  USER_TARGET_IDLE_MS,
  type PondState,
} from './engine'

function stepFor(state: PondState, totalMs: number, calm = 0, stepMs = 16): PondState {
  let s = state
  let elapsed = 0
  while (elapsed < totalMs) {
    const dt = Math.min(stepMs, totalMs - elapsed)
    s = tickPond(s, dt, calm)
    elapsed += dt
  }
  return s
}

describe('pond engine', () => {
  it('initialises spine, lotus buds, leaves, and clean counters deterministically', () => {
    const a = createPond({ seed: 42, calm: 0 })
    const b = createPond({ seed: 42, calm: 0 })
    expect(a).toEqual(b)
    expect(a.koi.spine).toHaveLength(SPINE_SEGMENTS)
    expect(a.buds.length).toBeGreaterThanOrEqual(3)
    expect(a.buds.length).toBeLessThanOrEqual(5)
    expect(a.leaves).toHaveLength(LEAF_COUNT)
    expect(a.gathered).toBe(0)
    expect(a.gatherEventId).toBe(0)
  })

  it('preserves exact spine segment spacing during movement and tight turns', () => {
    let state = createPond({ seed: 101, calm: 0 })
    const waypoints: [number, number][] = [
      [0.85, 0.2],
      [0.15, 0.85],
      [0.82, 0.82],
      [0.2, 0.2],
    ]

    for (const [tx, ty] of waypoints) {
      state = setTarget(state, tx, ty)
      for (let i = 0; i < 60; i++) {
        state = tickPond(state, 20, 0)
        expect(state.koi.spine).toHaveLength(SPINE_SEGMENTS)
        for (let seg = 1; seg < SPINE_SEGMENTS; seg++) {
          const prev = state.koi.spine[seg - 1]!
          const curr = state.koi.spine[seg]!
          const d = Math.hypot(curr.x - prev.x, curr.y - prev.y)
          expect(d).toBeCloseTo(SPINE_SPACING, 6)
        }
        const head = state.koi.spine[0]!
        expect(head.x).toBeGreaterThanOrEqual(0.03)
        expect(head.x).toBeLessThanOrEqual(0.97)
        expect(head.y).toBeGreaterThanOrEqual(0.03)
        expect(head.y).toBeLessThanOrEqual(0.97)
      }
    }
  })

  it('steers smoothly toward a user target', () => {
    let state = createPond({ seed: 7, calm: 0 })
    const target = { x: 0.82, y: 0.22 }
    const startHead = state.koi.spine[0]!
    const initialDist = Math.hypot(target.x - startHead.x, target.y - startHead.y)

    state = setTarget(state, target.x, target.y)
    state = stepFor(state, 2600, 0, 20)

    const endHead = state.koi.spine[0]!
    const finalDist = Math.hypot(target.x - endHead.x, target.y - endHead.y)
    expect(finalDist).toBeLessThan(initialDist * 0.45)
  })

  it('drifts autonomously along wandering waypoints when untouched', () => {
    let state = createPond({ seed: 19, calm: 0 })
    state = setTarget(state, 0.85, 0.85)
    expect(state.target).not.toBeNull()

    // Leave untouched past the idle threshold so target clears and wandering takes over
    state = stepFor(state, USER_TARGET_IDLE_MS + 1000, 0, 25)
    expect(state.target).toBeNull()

    const posA = { ...state.koi.spine[0]! }
    state = stepFor(state, 2200, 0, 25)
    const posB = state.koi.spine[0]!
    expect(Math.hypot(posB.x - posA.x, posB.y - posA.y)).toBeGreaterThan(0.1)

    // Explicit clearTarget also works immediately
    state = setTarget(state, 0.3, 0.3)
    expect(state.target).not.toBeNull()
    state = clearTarget(state)
    expect(state.target).toBeNull()
  })

  it('opens only the guided active bud and washes the pond after the last bloom', () => {
    let state = createPond({ seed: 55, calm: 0 })
    const head = state.koi.spine[0]!
    const heading = state.koi.heading
    const nearHead = {
      x: head.x + Math.cos(heading) * (GATHER_RADIUS * 0.45),
      y: head.y + Math.sin(heading) * (GATHER_RADIUS * 0.45),
    }
    const staged = (index: number): PondState => ({
      ...state,
      buds: state.buds.map((bud, i) => i === index ? { ...bud, ...nearHead } : bud),
    })

    expect(tickPond(setTarget(staged(1), nearHead.x, nearHead.y), 16, 0).nextBud).toBe(0)
    expect(tickPond(staged(0), 16, 0).nextBud).toBe(0)
    const budCount = state.buds.length
    for (let index = 0; index < budCount; index++) {
      state = tickPond(setTarget(staged(index), nearHead.x, nearHead.y), 16, 0)
      expect(state.nextBud).toBe(index + 1)
      expect(state.buds[index]!.openedAt).not.toBeNull()
      expect(state.ripples.some((ripple) => ripple.kind === 'gather')).toBe(true)
    }
    expect(state.blooms).toBe(1)
    expect(state.ripples.some((ripple) => ripple.kind === 'wash')).toBe(true)
    const previousIds = state.buds.map((bud) => bud.id)
    state = stepFor(clearTarget(state), 2300)
    expect(state.nextBud).toBe(0)
    expect(state.buds.every((bud) => bud.openedAt === null && !previousIds.includes(bud.id))).toBe(true)
  })

  it('creates ripples on tap, caps active ripples, and expires them after their lifetime', () => {
    let state = createPond({ seed: 303, calm: 0 })
    for (let i = 0; i < MAX_RIPPLES + 6; i++) {
      state = tapPond(state, 0.2 + (i % 5) * 0.15, 0.3 + (i % 3) * 0.2)
    }
    expect(state.ripples.length).toBeLessThanOrEqual(MAX_RIPPLES)
    expect(state.ripples.every((r) => r.kind === 'tap')).toBe(true)

    const initialTapIds = new Set(state.ripples.map((r) => r.id))
    // Advance 4.5s — every tap ripple (duration 2.6..3.4s) must expire
    state = stepFor(state, 4500, 0, 50)
    for (const r of state.ripples) {
      expect(initialTapIds.has(r.id)).toBe(false)
    }
  })

  it('slows swim speed and ripple progression as calm increases from 0 to 1', () => {
    const start = createPond({ seed: 88, calm: 0 })

    // Steady autonomous cruising speed scales down cleanly (~0.58x at calm = 1)
    const activeCruise = stepFor(start, 2000, 0, 20)
    const calmCruise = stepFor(start, 2000, 1, 20)
    expect(calmCruise.koi.speed).toBeLessThan(activeCruise.koi.speed * 0.65)

    // Guided travel toward a distant tap covers less distance and ages ripples slower at calm = 1
    const tapped = tapPond(start, 0.9, 0.9)
    const activeTap = stepFor(tapped, 1200, 0, 20)
    const calmTap = stepFor(tapped, 1200, 1, 20)

    const headStart = tapped.koi.spine[0]!
    const activeDist = Math.hypot(
      activeTap.koi.spine[0]!.x - headStart.x,
      activeTap.koi.spine[0]!.y - headStart.y,
    )
    const calmDist = Math.hypot(
      calmTap.koi.spine[0]!.x - headStart.x,
      calmTap.koi.spine[0]!.y - headStart.y,
    )
    expect(calmDist).toBeLessThan(activeDist * 0.72)

    const activeTapRipple = activeTap.ripples.find((r) => r.kind === 'tap')
    const calmTapRipple = calmTap.ripples.find((r) => r.kind === 'tap')
    expect(activeTapRipple).toBeDefined()
    expect(calmTapRipple).toBeDefined()
    expect(calmTapRipple!.ageMs).toBeLessThan(activeTapRipple!.ageMs * 0.75)
  })

  it('round-trips cleanly through JSON serialisation and resumes deterministically', () => {
    let state = createPond({ seed: 1234, calm: 0.3 })
    state = tapPond(state, 0.72, 0.31)
    state = stepFor(state, 900, 0.3, 20)

    const roundTripped = JSON.parse(JSON.stringify(state)) as PondState
    expect(roundTripped).toEqual(state)

    const nextA = stepFor(state, 1000, 0.3, 20)
    const nextB = stepFor(roundTripped, 1000, 0.3, 20)
    expect(nextA).toEqual(nextB)
  })
})
