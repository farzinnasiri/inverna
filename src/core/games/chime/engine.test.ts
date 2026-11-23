import { describe, expect, it } from 'vitest'
import {
  BALL_RADIUS,
  BASE_BALL_SPEED,
  CALM_SINGLE_HP_THRESHOLD,
  CALM_SPEED_FACTOR,
  FORMATIONS,
  MIN_VERTICAL_ANGLE_RAD,
  PADDLE_HEIGHT,
  PADDLE_WIDTH_MAX,
  PADDLE_WIDTH_MIN,
  PADDLE_Y,
  RING_DURATION_MS,
  SHARD_DURATION_MS,
  ballSpeedForCalm,
  createChime,
  enforceMinVerticalAngle,
  launchBall,
  nextLevel,
  nudgePaddle,
  paddleWidthForCalm,
  restartLevel,
  setPaddleX,
  stripEphemeralForSave,
  tickChime,
  type ChimeBrick,
  type ChimeState,
} from './engine'

function bricksOverlap(a: ChimeBrick, b: ChimeBrick): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

describe('Chime engine', () => {
  describe('curated formations', () => {
    it('provides 8 distinct architectural formations with valid non-overlapping bounds', () => {
      expect(FORMATIONS).toHaveLength(8)
      const names = new Set<string>()

      for (let i = 0; i < FORMATIONS.length; i++) {
        const state = createChime({ seed: 100 + i, calm: 0, levelIndex: i })
        expect(state.levelNumber).toBe(i + 1)
        expect(state.patternName).toBe(FORMATIONS[i]!.name)
        names.add(state.patternName)
        expect(state.bricks.length).toBeGreaterThanOrEqual(20)

        // Every brick is strictly inside normalised court bounds and well above paddle.
        for (const b of state.bricks) {
          expect(b.x).toBeGreaterThanOrEqual(0)
          expect(b.x + b.w).toBeLessThanOrEqual(1)
          expect(b.y).toBeGreaterThan(0.05)
          expect(b.y + b.h).toBeLessThan(0.6)
          expect(b.w).toBeGreaterThan(0)
          expect(b.h).toBeGreaterThan(0)
          expect(b.hp === 1 || b.hp === 2).toBe(true)
        }

        // Pairwise non-overlapping check.
        for (let a = 0; a < state.bricks.length; a++) {
          for (let b = a + 1; b < state.bricks.length; b++) {
            expect(bricksOverlap(state.bricks[a]!, state.bricks[b]!)).toBe(false)
          }
        }
      }

      expect(names.size).toBe(8)
    })

    it('spawns reinforced hp:2 bricks at low calm and all hp:1 bricks at calm >= 0.6', () => {
      for (let i = 0; i < FORMATIONS.length; i++) {
        const lowCalm = createChime({ seed: 42, calm: 0.1, levelIndex: i })
        expect(lowCalm.bricks.some((b) => b.hp === 2)).toBe(true)

        const highCalm = createChime({ seed: 42, calm: CALM_SINGLE_HP_THRESHOLD, levelIndex: i })
        expect(highCalm.bricks.every((b) => b.hp === 1)).toBe(true)
      }
    })

    it('cycles formations with subtle symmetry mirroring on subsequent loops', () => {
      const first = createChime({ seed: 77, calm: 0, levelIndex: 3 })
      const secondCycle = createChime({ seed: 77, calm: 0, levelIndex: 3 + FORMATIONS.length })
      expect(secondCycle.patternName).toBe(first.patternName)
      expect(secondCycle.bricks).toHaveLength(first.bricks.length)
      expect(secondCycle.levelNumber).toBe(first.levelNumber + FORMATIONS.length)
    })
  })

  describe('launch & paddle controls', () => {
    it('starts resting on the paddle and launches gently upward', () => {
      let state = createChime({ seed: 123, calm: 0 })
      expect(state.ball.attached).toBe(true)
      expect(state.ball.vx).toBe(0)
      expect(state.ball.vy).toBe(0)
      expect(state.paddleY).toBe(PADDLE_Y)

      // Moving paddle while attached moves the ball along with it.
      state = setPaddleX(state, 0.3)
      expect(state.paddleX).toBeCloseTo(0.3, 5)
      expect(state.ball.x).toBeCloseTo(0.3, 5)

      // Clamps cleanly to court walls.
      state = setPaddleX(state, -1)
      expect(state.paddleX).toBeCloseTo(state.paddleWidth / 2, 5)
      state = nudgePaddle(state, 0.2)
      expect(state.paddleX).toBeCloseTo(state.paddleWidth / 2 + 0.2, 5)

      // Launch detaches and sends ball upward at configured speed.
      const launched = launchBall(state, 0)
      expect(launched.ball.attached).toBe(false)
      expect(launched.ball.vy).toBeLessThan(0)
      expect(Math.hypot(launched.ball.vx, launched.ball.vy)).toBeCloseTo(BASE_BALL_SPEED, 4)

      // Subsequent launch while already in flight is a no-op.
      expect(launchBall(launched, 0)).toBe(launched)
    })
  })

  describe('wall bounces, paddle deflection & anti-horizontal-trap', () => {
    it('bounces cleanly off left, right, and top walls', () => {
      const base = createChime({ seed: 10, calm: 0 })
      const emptyCourt: ChimeState = {
        ...base,
        bricks: [],
        solved: false,
      }

      // Left wall bounce
      const headingLeft: ChimeState = {
        ...emptyCourt,
        ball: { ...emptyCourt.ball, attached: false, x: 0.03, y: 0.5, vx: -0.5, vy: -0.35, trail: [] },
      }
      const afterLeft = tickChime(headingLeft, 60, 0)
      expect(afterLeft.ball.vx).toBeGreaterThan(0)
      expect(afterLeft.ball.x).toBeGreaterThanOrEqual(BALL_RADIUS)
      expect(afterLeft.wallEventId).toBe(1)

      // Right wall bounce
      const headingRight: ChimeState = {
        ...emptyCourt,
        ball: { ...emptyCourt.ball, attached: false, x: 0.97, y: 0.5, vx: 0.5, vy: -0.35, trail: [] },
      }
      const afterRight = tickChime(headingRight, 60, 0)
      expect(afterRight.ball.vx).toBeLessThan(0)
      expect(afterRight.ball.x).toBeLessThanOrEqual(1 - BALL_RADIUS)
      expect(afterRight.wallEventId).toBe(1)

      // Top wall bounce
      const headingTop: ChimeState = {
        ...emptyCourt,
        ball: { ...emptyCourt.ball, attached: false, x: 0.5, y: 0.03, vx: 0.3, vy: -0.55, trail: [] },
      }
      const afterTop = tickChime(headingTop, 60, 0)
      expect(afterTop.ball.vy).toBeGreaterThan(0)
      expect(afterTop.ball.y).toBeGreaterThanOrEqual(BALL_RADIUS)
      expect(afterTop.wallEventId).toBe(1)
    })

    it('deflects smoothly based on paddle hit offset and never traps horizontally', () => {
      const base = createChime({ seed: 20, calm: 0 })
      const paddleTop = PADDLE_Y - PADDLE_HEIGHT * 0.5

      // Hit left side of paddle -> bounces upward & left
      const hitLeftState: ChimeState = {
        ...base,
        paddleX: 0.5,
        ball: {
          ...base.ball,
          attached: false,
          x: 0.42,
          y: paddleTop - BALL_RADIUS - 0.002,
          vx: 0.1,
          vy: BASE_BALL_SPEED,
          trail: [],
        },
      }
      const afterLeftHit = tickChime(hitLeftState, 32, 0)
      expect(afterLeftHit.paddleEventId).toBe(1)
      expect(afterLeftHit.ball.vy).toBeLessThan(0)
      expect(afterLeftHit.ball.vx).toBeLessThan(0)

      // Hit right edge of paddle -> bounces upward & right, still honoring minimum vertical angle
      const hitRightEdge: ChimeState = {
        ...base,
        paddleX: 0.5,
        ball: {
          ...base.ball,
          attached: false,
          x: 0.5 + base.paddleWidth * 0.49,
          y: paddleTop - BALL_RADIUS - 0.002,
          vx: 0,
          vy: BASE_BALL_SPEED,
          trail: [],
        },
      }
      const afterRightHit = tickChime(hitRightEdge, 32, 0)
      expect(afterRightHit.paddleEventId).toBe(1)
      expect(afterRightHit.ball.vy).toBeLessThan(0)
      expect(afterRightHit.ball.vx).toBeGreaterThan(0)
      const verticalRatio = Math.abs(afterRightHit.ball.vy) / Math.hypot(afterRightHit.ball.vx, afterRightHit.ball.vy)
      expect(verticalRatio).toBeGreaterThanOrEqual(Math.sin(MIN_VERTICAL_ANGLE_RAD) - 1e-4)

      // Direct anti-horizontal-trap guarantee
      const corrected = enforceMinVerticalAngle(0.62, 0.01, BASE_BALL_SPEED)
      expect(Math.abs(corrected.vy) / BASE_BALL_SPEED).toBeGreaterThanOrEqual(Math.sin(MIN_VERTICAL_ANGLE_RAD) - 1e-4)
      expect(Math.hypot(corrected.vx, corrected.vy)).toBeCloseTo(BASE_BALL_SPEED, 5)
    })
  })

  describe('brick collision, hp cracking, destruction & shards', () => {
    it('cracks hp:2 brick on hit 1 and shatters with shards + hairline ring on hit 2', () => {
      const base = createChime({ seed: 99, calm: 0 })
      const brick: ChimeBrick = {
        id: 500,
        col: 3,
        row: 2,
        x: 0.4,
        y: 0.3,
        w: 0.14,
        h: 0.04,
        color: 'ochre',
        hp: 2,
        cracked: false,
      }
      const keepAliveBrick: ChimeBrick = {
        id: 501,
        col: 0,
        row: 0,
        x: 0.05,
        y: 0.1,
        w: 0.1,
        h: 0.032,
        color: 'clay',
        hp: 1,
        cracked: false,
      }

      // Hit 1: ball rises into bottom of brick -> hp becomes 1, cracked becomes true, ball bounces down.
      let state: ChimeState = {
        ...base,
        bricks: [brick, keepAliveBrick],
        ball: {
          ...base.ball,
          attached: false,
          x: 0.47,
          y: 0.34 + BALL_RADIUS + 0.005,
          vx: 0.05,
          vy: -BASE_BALL_SPEED,
          trail: [],
        },
      }
      state = tickChime(state, 30, 0)
      expect(state.bricks).toHaveLength(2)
      const cracked = state.bricks.find((b) => b.id === 500)!
      expect(cracked.hp).toBe(1)
      expect(cracked.cracked).toBe(true)
      expect(state.crackEventId).toBe(1)
      expect(state.breakEventId).toBe(0)
      expect(state.ball.vy).toBeGreaterThan(0)
      expect(state.score).toBe(5)

      // Hit 2: send ball into the cracked brick again -> brick shatters, spawns 2-3 shards + hairline ring!
      state = {
        ...state,
        ball: {
          ...state.ball,
          x: 0.47,
          y: 0.34 + BALL_RADIUS + 0.005,
          vx: 0.05,
          vy: -BASE_BALL_SPEED,
        },
      }
      state = tickChime(state, 30, 0)
      expect(state.bricks).toHaveLength(1)
      expect(state.bricksBroken).toBe(1)
      expect(state.breakEventId).toBe(1)
      expect(state.score).toBe(20) // 5 crack + 15 shatter
      expect(state.shards.length).toBeGreaterThanOrEqual(2)
      expect(state.shards.length).toBeLessThanOrEqual(3)
      expect(state.rings.length).toBeGreaterThanOrEqual(1)

      // Advance simulation past 550ms -> shards & rings fade and prune cleanly.
      for (let elapsed = 0; elapsed < Math.max(SHARD_DURATION_MS, RING_DURATION_MS) + 120; elapsed += 50) {
        state = tickChime(state, 50, 0)
      }
      expect(state.shards).toHaveLength(0)
      expect(state.rings).toHaveLength(0)
    })

    it('reflects horizontally when hitting the side of a brick', () => {
      const base = createChime({ seed: 55, calm: 0 })
      const brick: ChimeBrick = {
        id: 600,
        col: 4,
        row: 2,
        x: 0.5,
        y: 0.3,
        w: 0.1,
        h: 0.08,
        color: 'sage',
        hp: 1,
        cracked: false,
      }
      const decoy: ChimeBrick = {
        id: 601,
        col: 0,
        row: 0,
        x: 0.05,
        y: 0.1,
        w: 0.1,
        h: 0.032,
        color: 'clay',
        hp: 1,
        cracked: false,
      }

      const state: ChimeState = {
        ...base,
        bricks: [brick, decoy],
        ball: {
          ...base.ball,
          attached: false,
          x: 0.5 - BALL_RADIUS - 0.005,
          y: 0.34,
          vx: 0.52,
          vy: -0.32,
          trail: [],
        },
      }

      const after = tickChime(state, 30, 0)
      expect(after.breakEventId).toBe(1)
      expect(after.ball.vx).toBeLessThan(0)
      expect(after.ball.vy).toBeLessThan(0)
    })
  })

  describe('zero-stress bottom miss, level clear & calm scaling', () => {
    it('gently re-attaches ball to paddle on bottom miss with zero lost bricks or penalty', () => {
      const base = createChime({ seed: 77, calm: 0 })
      const brickCount = base.bricks.length
      const fallingPastBottom: ChimeState = {
        ...base,
        paddleX: 0.25,
        score: 40,
        ball: {
          ...base.ball,
          attached: false,
          x: 0.85,
          y: 0.99,
          vx: 0.1,
          vy: BASE_BALL_SPEED,
          trail: [{ x: 0.85, y: 0.95 }],
        },
      }

      const after = tickChime(fallingPastBottom, 90, 0)
      expect(after.ball.attached).toBe(true)
      expect(after.ball.x).toBeCloseTo(0.25, 5)
      expect(after.ball.vx).toBe(0)
      expect(after.ball.vy).toBe(0)
      expect(after.ball.trail).toHaveLength(0)
      expect(after.resetEventId).toBe(1)
      expect(after.bricks).toHaveLength(brickCount)
      expect(after.score).toBe(40)
      expect(after.solved).toBe(false)
    })

    it('detects level clear on final brick and advances cleanly via nextLevel', () => {
      const base = createChime({ seed: 88, calm: 0.2, levelIndex: 0 })
      const finalBrick: ChimeBrick = {
        id: 900,
        col: 3,
        row: 2,
        x: 0.42,
        y: 0.3,
        w: 0.16,
        h: 0.04,
        color: 'straw',
        hp: 1,
        cracked: false,
      }
      const almostDone: ChimeState = {
        ...base,
        bricks: [finalBrick],
        score: 120,
        bricksBroken: 12,
        ball: {
          ...base.ball,
          attached: false,
          x: 0.5,
          y: 0.34 + BALL_RADIUS + 0.005,
          vx: 0.05,
          vy: -BASE_BALL_SPEED,
          trail: [],
        },
      }

      const cleared = tickChime(almostDone, 30, 0.2)
      expect(cleared.solved).toBe(true)
      expect(cleared.bricks).toHaveLength(0)
      expect(cleared.boardsCleared).toBe(1)
      expect(cleared.bricksBroken).toBe(13)
      expect(cleared.score).toBe(130)
      expect(cleared.clearEventId).toBe(1)

      const next = nextLevel(cleared, 0.7)
      expect(next.solved).toBe(false)
      expect(next.levelIndex).toBe(1)
      expect(next.levelNumber).toBe(2)
      expect(next.patternName).toBe(FORMATIONS[1]!.name)
      expect(next.score).toBe(130)
      expect(next.bricksBroken).toBe(13)
      expect(next.boardsCleared).toBe(1)
      expect(next.ball.attached).toBe(true)
      expect(next.bricks.every((b) => b.hp === 1)).toBe(true)

      const restarted = restartLevel(next, 0.7)
      expect(restarted.levelIndex).toBe(1)
      expect(restarted.score).toBe(0)
      expect(restarted.ball.attached).toBe(true)
    })

    it('scales ball speed (1.0x -> 0.72x) and paddle width (0.22 -> 0.28) with calm', () => {
      expect(ballSpeedForCalm(0)).toBeCloseTo(BASE_BALL_SPEED, 5)
      expect(ballSpeedForCalm(1)).toBeCloseTo(BASE_BALL_SPEED * CALM_SPEED_FACTOR, 5)
      expect(ballSpeedForCalm(0.5)).toBeCloseTo(BASE_BALL_SPEED * (1 - (1 - CALM_SPEED_FACTOR) * 0.5), 5)

      expect(paddleWidthForCalm(0)).toBeCloseTo(PADDLE_WIDTH_MIN, 5)
      expect(paddleWidthForCalm(1)).toBeCloseTo(PADDLE_WIDTH_MAX, 5)

      let state = createChime({ seed: 303, calm: 0 })
      expect(state.paddleWidth).toBeCloseTo(PADDLE_WIDTH_MIN, 5)
      state = launchBall(state, 0)
      state = tickChime(state, 16, 1)
      expect(state.paddleWidth).toBeCloseTo(PADDLE_WIDTH_MAX, 5)
      expect(Math.hypot(state.ball.vx, state.ball.vy)).toBeCloseTo(BASE_BALL_SPEED * CALM_SPEED_FACTOR, 4)
    })

    it('round-trips cleanly through JSON.stringify / JSON.parse', () => {
      let state = createChime({ seed: 404, calm: 0.3, levelIndex: 2 })
      state = setPaddleX(state, 0.62)
      state = launchBall(state, 0.3)
      state = tickChime(state, 40, 0.3)

      const rawRoundTrip = JSON.parse(JSON.stringify(state)) as ChimeState
      expect(rawRoundTrip).toEqual(state)

      const stripped = stripEphemeralForSave(state)
      expect(stripped.shards).toHaveLength(0)
      expect(stripped.rings).toHaveLength(0)
      expect(stripped.ball.attached).toBe(true)
      expect(JSON.parse(JSON.stringify(stripped))).toEqual(stripped)
    })
  })
})
