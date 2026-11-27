import { describe, expect, it } from 'vitest'
import {
  AI_Y,
  BALL_RADIUS,
  calmSpeedScale,
  createRally,
  INITIAL_SERVE_DELAY_MS,
  PADDLE_HALF_HEIGHT,
  paddleWidthFor,
  PLAYER_Y,
  predictInterceptX,
  SERVE_DELAY_MS,
  serveNow,
  setDifficulty,
  setPlayerVelocity,
  setPlayerX,
  targetBallSpeed,
  tickRally,
  TRAIL_LENGTH,
  type RallyState,
} from './engine'

function stepFor(state: RallyState, totalMs: number, calm = 0, stepMs = 16): RallyState {
  let s = state
  let elapsed = 0
  while (elapsed < totalMs) {
    const dt = Math.min(stepMs, totalMs - elapsed)
    s = tickRally(s, dt, calm)
    elapsed += dt
  }
  return s
}

describe('rally engine', () => {
  it('initialises deterministically and launches serve after pause or immediately via serveNow', () => {
    const a = createRally({ seed: 42, difficulty: 'medium', calm: 0 })
    const b = createRally({ seed: 42, difficulty: 'medium', calm: 0 })
    expect(a).toEqual(b)
    expect(a.serveDelayMs).toBe(INITIAL_SERVE_DELAY_MS)
    expect(a.ball.vx).toBe(0)
    expect(a.ball.vy).toBe(0)

    // Still paused midway through serve delay
    const mid = stepFor(a, 400, 0, 16)
    expect(mid.serveDelayMs).toBeGreaterThan(0)
    expect(mid.ball.vy).toBe(0)

    // Launches automatically once serve delay elapses
    const launched = stepFor(a, INITIAL_SERVE_DELAY_MS + 60, 0, 16)
    expect(launched.serveDelayMs).toBe(0)
    expect(Math.hypot(launched.ball.vx, launched.ball.vy)).toBeCloseTo(
      targetBallSpeed('medium', 0, 0),
      3,
    )
    expect(launched.ball.vy).toBeGreaterThan(0)

    // Immediate serve via serveNow
    const instant = serveNow(a, 0)
    expect(instant.serveDelayMs).toBe(0)
    expect(Math.hypot(instant.ball.vx, instant.ball.vy)).toBeCloseTo(
      targetBallSpeed('medium', 0, 0),
      3,
    )
  })

  it('reflects cleanly off left and right side walls, emitting wall event and ripple', () => {
    const base = createRally({ seed: 10, difficulty: 'medium', calm: 0 })
    const speed = targetBallSpeed('medium', 0, 0)

    // Heading into left wall
    const leftStaged: RallyState = {
      ...base,
      serveDelayMs: 0,
      ball: { x: BALL_RADIUS + 0.008, y: 0.5, vx: -speed * 0.7, vy: speed * 0.714 },
    }
    const afterLeft = tickRally(leftStaged, 40, 0)
    expect(afterLeft.ball.vx).toBeGreaterThan(0)
    expect(afterLeft.ball.x).toBeGreaterThanOrEqual(BALL_RADIUS)
    expect(afterLeft.event).toBe('wall')
    expect(afterLeft.eventId).toBe(1)
    expect(afterLeft.ripples.some((r) => r.kind === 'wall')).toBe(true)

    // Heading into right wall
    const rightStaged: RallyState = {
      ...base,
      serveDelayMs: 0,
      ball: { x: 1 - BALL_RADIUS - 0.008, y: 0.5, vx: speed * 0.7, vy: speed * 0.714 },
    }
    const afterRight = tickRally(rightStaged, 40, 0)
    expect(afterRight.ball.vx).toBeLessThan(0)
    expect(afterRight.ball.x).toBeLessThanOrEqual(1 - BALL_RADIUS)
    expect(afterRight.event).toBe('wall')
    expect(afterRight.eventId).toBe(1)
  })

  it('bounces off bottom and top paddles with off-center angle deflection and increments rally', () => {
    const base = createRally({ seed: 77, difficulty: 'medium', calm: 0 })
    const speed = targetBallSpeed('medium', 0, 0)
    const playerContactY = PLAYER_Y - PADDLE_HALF_HEIGHT - BALL_RADIUS

    // Center hit on bottom paddle -> straight upward return
    const centerHit: RallyState = {
      ...base,
      serveDelayMs: 0,
      playerX: 0.5,
      ball: { x: 0.5, y: playerContactY - 0.005, vx: 0, vy: speed },
    }
    const afterCenter = tickRally(centerHit, 32, 0)
    expect(afterCenter.ball.vy).toBeLessThan(0)
    expect(Math.abs(afterCenter.ball.vx)).toBeLessThan(0.02)
    expect(afterCenter.rally).toBe(1)
    expect(afterCenter.bestRally).toBe(1)
    expect(afterCenter.event).toBe('paddle')
    expect(afterCenter.ripples.some((r) => r.kind === 'paddle')).toBe(true)

    // Off-center right hit on bottom paddle -> angled to the right
    const rightHit: RallyState = {
      ...base,
      serveDelayMs: 0,
      playerX: 0.5,
      ball: { x: 0.5 + base.paddleWidth * 0.4, y: playerContactY - 0.005, vx: 0, vy: speed },
    }
    const afterRight = tickRally(rightHit, 32, 0)
    expect(afterRight.ball.vy).toBeLessThan(0)
    expect(afterRight.ball.vx).toBeGreaterThan(0.25)

    // Off-center left hit on bottom paddle -> angled to the left
    const leftHit: RallyState = {
      ...base,
      serveDelayMs: 0,
      playerX: 0.5,
      ball: { x: 0.5 - base.paddleWidth * 0.4, y: playerContactY - 0.005, vx: 0, vy: speed },
    }
    const afterLeft = tickRally(leftHit, 32, 0)
    expect(afterLeft.ball.vy).toBeLessThan(0)
    expect(afterLeft.ball.vx).toBeLessThan(-0.25)

    // Top AI paddle bounce -> returns downward with off-center deflection
    const aiContactY = AI_Y + PADDLE_HALF_HEIGHT + BALL_RADIUS
    const aiHit: RallyState = {
      ...base,
      serveDelayMs: 0,
      aiX: 0.5,
      ball: { x: 0.5 + base.paddleWidth * 0.35, y: aiContactY + 0.005, vx: 0, vy: -speed },
    }
    const afterAi = tickRally(aiHit, 32, 0)
    expect(afterAi.ball.vy).toBeGreaterThan(0)
    expect(afterAi.ball.vx).toBeGreaterThan(0.2)
    expect(afterAi.rally).toBe(1)
    expect(afterAi.event).toBe('paddle')
  })

  it('scores for player and AI, resets ball to center with serve pause, and keeps bestRally', () => {
    const base = createRally({ seed: 99, difficulty: 'medium', calm: 0 })
    const speed = targetBallSpeed('medium', 4, 0)

    // Ball passes above AI goal line -> player scores
    const playerPoint: RallyState = {
      ...base,
      serveDelayMs: 0,
      aiX: 0.15,
      rally: 4,
      bestRally: 4,
      trail: [{ x: 0.8, y: 0.05 }],
      ball: { x: 0.85, y: 0.01, vx: 0, vy: -speed },
    }
    const afterPlayerScore = tickRally(playerPoint, 80, 0)
    expect(afterPlayerScore.playerScore).toBe(1)
    expect(afterPlayerScore.aiScore).toBe(0)
    expect(afterPlayerScore.rally).toBe(0)
    expect(afterPlayerScore.bestRally).toBe(4)
    expect(afterPlayerScore.event).toBe('scorePlayer')
    expect(afterPlayerScore.ball.x).toBe(0.5)
    expect(afterPlayerScore.ball.y).toBe(0.5)
    expect(afterPlayerScore.serveDelayMs).toBeGreaterThan(SERVE_DELAY_MS - 100)
    expect(afterPlayerScore.trail).toHaveLength(0)

    // Ball passes below player goal line -> AI scores
    const aiPoint: RallyState = {
      ...base,
      serveDelayMs: 0,
      playerX: 0.15,
      rally: 2,
      bestRally: 4,
      ball: { x: 0.85, y: 0.99, vx: 0, vy: speed },
    }
    const afterAiScore = tickRally(aiPoint, 80, 0)
    expect(afterAiScore.aiScore).toBe(1)
    expect(afterAiScore.playerScore).toBe(0)
    expect(afterAiScore.rally).toBe(0)
    expect(afterAiScore.bestRally).toBe(4)
    expect(afterAiScore.event).toBe('scoreAi')
    expect(afterAiScore.ball.x).toBe(0.5)
    expect(afterAiScore.ball.y).toBe(0.5)
  })

  it('distinguishes Easy, Medium, and Hard AI tracking speed and predictive wall-bounce accuracy', () => {
    // Bank shot heading toward right wall, bouncing back toward the left near the AI goal
    const bx = 0.72
    const by = 0.7
    const vx = 0.44
    const vy = -0.42
    const aiContactY = AI_Y + PADDLE_HALF_HEIGHT + BALL_RADIUS
    const trueIntercept = predictInterceptX(bx, by, vx, vy, aiContactY)
    // Confirm the bank shot actually bounces off the right wall and heads left of center
    expect(trueIntercept).toBeLessThan(0.65)

    const runScenario = (difficulty: 'easy' | 'medium' | 'hard') => {
      const start = createRally({ seed: 202, difficulty, calm: 0 })
      const staged: RallyState = {
        ...start,
        serveDelayMs: 0,
        aiX: 0.25,
        aiAimOffset: 0,
        ball: { x: bx, y: by, vx, vy },
      }
      return stepFor(staged, 500, 0, 16)
    }

    const easyAfter = runScenario('easy')
    const medAfter = runScenario('medium')
    const hardAfter = runScenario('hard')

    // Easy moves the slowest from 0.25 toward the ball; Medium faster; Hard fastest & anticipates wall bounce
    const easyTravel = Math.abs(easyAfter.aiX - 0.25)
    const medTravel = Math.abs(medAfter.aiX - 0.25)
    expect(medTravel).toBeGreaterThan(easyTravel)

    // Hard tracks directly toward the predicted bank-shot intercept rather than chasing the raw wall side
    const hardError = Math.abs(hardAfter.aiX - trueIntercept)
    expect(hardError).toBeLessThan(0.06)

    // Direct sprint test: ball heading straight up at x=0.88 from y=0.65
    const sprint = (difficulty: 'easy' | 'medium' | 'hard') => {
      const s = createRally({ seed: 55, difficulty, calm: 0 })
      const staged: RallyState = {
        ...s,
        serveDelayMs: 0,
        aiX: 0.2,
        aiAimOffset: 0,
        ball: { x: 0.88, y: 0.65, vx: 0, vy: -0.5 },
      }
      return stepFor(staged, 400, 0, 16)
    }

    const easySprint = sprint('easy')
    const medSprint = sprint('medium')
    const hardSprint = sprint('hard')
    expect(medSprint.aiX).toBeGreaterThan(easySprint.aiX)
    expect(hardSprint.aiX).toBeGreaterThan(medSprint.aiX)
  })

  it('slows the ball and widens the paddle as calm rises, never speeding up', () => {
    expect(calmSpeedScale(0)).toBeCloseTo(1, 5)
    expect(calmSpeedScale(0.5)).toBeLessThan(calmSpeedScale(0))
    expect(calmSpeedScale(1)).toBeLessThan(calmSpeedScale(0.5))
    expect(paddleWidthFor(1)).toBeGreaterThan(paddleWidthFor(0))

    const active = serveNow(createRally({ seed: 303, difficulty: 'medium', calm: 0 }), 0)
    const restful = serveNow(createRally({ seed: 303, difficulty: 'medium', calm: 1 }), 1)

    const activeSpeed = Math.hypot(active.ball.vx, active.ball.vy)
    const restfulSpeed = Math.hypot(restful.ball.vx, restful.ball.vy)
    // The serve follows the same scale as everything else.
    expect(restfulSpeed / activeSpeed).toBeCloseTo(calmSpeedScale(1), 3)

    // Mid-flight calm change slows the ball and widens the paddle smoothly
    const slowed = tickRally(active, 32, 1)
    expect(Math.hypot(slowed.ball.vx, slowed.ball.vy) / activeSpeed).toBeCloseTo(0.72, 3)
    expect(slowed.paddleWidth).toBeCloseTo(paddleWidthFor(1), 5)
  })

  it('tracks player drag & keyboard inputs smoothly and caps ball trail at 7 points', () => {
    let state = serveNow(createRally({ seed: 808, difficulty: 'easy', calm: 0 }), 0)

    // Touch drag tracking
    state = setPlayerX(state, 0.82)
    state = stepFor(state, 260, 0, 16)
    expect(state.playerX).toBeGreaterThan(0.78)
    expect(state.playerX).toBeLessThanOrEqual(0.83)

    // Keyboard velocity left
    state = setPlayerVelocity(state, -1)
    const beforeLeft = state.playerX
    state = stepFor(state, 260, 0, 16)
    expect(state.playerX).toBeLessThan(beforeLeft - 0.14)

    // Trail populated and capped at 7 points
    expect(state.trail.length).toBeGreaterThan(0)
    expect(state.trail.length).toBeLessThanOrEqual(TRAIL_LENGTH)

    // Difficulty switch works cleanly
    const hard = setDifficulty(state, 'hard', 0)
    expect(hard.difficulty).toBe('hard')
  })

  it('round-trips cleanly through JSON serialisation and resumes deterministically', () => {
    let state = serveNow(createRally({ seed: 1337, difficulty: 'hard', calm: 0.25 }), 0.25)
    state = setPlayerX(state, 0.68)
    state = stepFor(state, 640, 0.25, 16)

    const roundTripped = JSON.parse(JSON.stringify(state)) as RallyState
    expect(roundTripped).toEqual(state)

    const nextA = stepFor(state, 800, 0.25, 16)
    const nextB = stepFor(roundTripped, 800, 0.25, 16)
    expect(nextA).toEqual(nextB)
  })
})
