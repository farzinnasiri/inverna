import { createRng, type Rng } from '../../rng'

export type RallyDifficulty = 'easy' | 'medium' | 'hard'

export type RallyEvent = 'paddle' | 'wall' | 'scorePlayer' | 'scoreAi' | null

export type RallyRippleKind = 'paddle' | 'wall' | 'scorePlayer' | 'scoreAi'

export interface Vec2 {
  x: number
  y: number
}

export interface BallState {
  x: number
  y: number
  vx: number
  vy: number
}

export interface RallyRipple {
  id: number
  x: number
  y: number
  ageMs: number
  durationMs: number
  maxRadius: number
  kind: RallyRippleKind
}

export interface RallyState {
  difficulty: RallyDifficulty
  playerX: number
  playerTargetX: number | null
  playerDir: number
  playerVel: number
  aiX: number
  aiAimOffset: number
  paddleWidth: number
  ball: BallState
  serveDelayMs: number
  serveDir: 1 | -1
  playerScore: number
  aiScore: number
  rally: number
  bestRally: number
  event: RallyEvent
  eventId: number
  trail: Vec2[]
  trailTimerMs: number
  ripples: RallyRipple[]
  nextRippleId: number
  timeMs: number
  rngState: number
}

export interface CreateRallyOptions {
  seed: number
  difficulty?: RallyDifficulty
  calm?: number
}

export const PLAYER_Y = 0.92
export const AI_Y = 0.08
export const BALL_RADIUS = 0.016
export const PADDLE_HALF_HEIGHT = 0.01
export const BASE_PADDLE_WIDTH = 0.21
export const CALM_PADDLE_BONUS = 0.055
/** The opponent's paddle never widens with calm: calm should only ever help you. */
export const AI_PADDLE_WIDTH = BASE_PADDLE_WIDTH
export const TRAIL_LENGTH = 7
export const MAX_RIPPLES = 12
export const INITIAL_SERVE_DELAY_MS = 900
export const SERVE_DELAY_MS = 1050

const MAX_SUBSTEP_MS = 8
const TRAIL_SAMPLE_MS = 22
const PLAYER_KEY_SPEED = 0.94
const MAX_BOUNCE_ANGLE = (56 * Math.PI) / 180

interface DifficultyProfile {
  baseSpeed: number
  speedPerHit: number
  maxSpeed: number
  aiMaxSpeed: number
  aiDeadzone: number
  aiAimSpread: number
  aiPrediction: number
  aiReactY: number
  aiIdleFollow: number
}

const PROFILES: Record<RallyDifficulty, DifficultyProfile> = {
  easy: {
    baseSpeed: 0.48,
    speedPerHit: 0.01,
    maxSpeed: 0.66,
    aiMaxSpeed: 0.36,
    aiDeadzone: 0.048,
    aiAimSpread: 0.06,
    aiPrediction: 0,
    aiReactY: 0.78,
    aiIdleFollow: 0.14,
  },
  // Medium sits closer to Easy: a slower ball that speeds up more gently.
  medium: {
    baseSpeed: 0.5,
    speedPerHit: 0.0105,
    maxSpeed: 0.68,
    aiMaxSpeed: 0.58,
    aiDeadzone: 0.018,
    aiAimSpread: 0.03,
    aiPrediction: 0.48,
    aiReactY: 0.95,
    aiIdleFollow: 0.22,
  },
  hard: {
    baseSpeed: 0.6,
    speedPerHit: 0.016,
    maxSpeed: 0.88,
    aiMaxSpeed: 0.96,
    aiDeadzone: 0.004,
    aiAimSpread: 0.036,
    aiPrediction: 1,
    aiReactY: 1,
    aiIdleFollow: 0.3,
  },
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

function clamp01(v: number): number {
  return clamp(v, 0, 1)
}

/** Calm speed multiplier: 1.0x at calm=0 down to 0.72x at calm=1. */
export function calmSpeedScale(calm: number): number {
  return 1 - clamp01(calm) * 0.28
}

/** Paddle width widens gently as wind-down calm increases. */
export function paddleWidthFor(calm: number): number {
  return BASE_PADDLE_WIDTH + clamp01(calm) * CALM_PADDLE_BONUS
}

/** Gentle speed ramp per rally hit, capped and scaled smoothly by calm. */
export function targetBallSpeed(difficulty: RallyDifficulty, rally: number, calm: number): number {
  const p = PROFILES[difficulty]
  const raw = Math.min(p.maxSpeed, p.baseSpeed + Math.max(0, rally) * p.speedPerHit)
  return raw * calmSpeedScale(calm)
}

/**
 * Predict horizontal x-coordinate where a ball travelling toward `targetY`
 * will arrive after accounting for side-wall reflections.
 */
export function predictInterceptX(bx: number, by: number, vx: number, vy: number, targetY: number): number {
  if (Math.abs(vy) < 1e-6) return clamp(bx, BALL_RADIUS, 1 - BALL_RADIUS)
  const t = (targetY - by) / vy
  if (t <= 0) return clamp(bx, BALL_RADIUS, 1 - BALL_RADIUS)

  const minX = BALL_RADIUS
  const maxX = 1 - BALL_RADIUS
  const span = maxX - minX
  const period = span * 2
  const rawRel = bx + vx * t - minX
  const mod = ((rawRel % period) + period) % period
  return mod <= span ? minX + mod : maxX - (mod - span)
}

function pickAiAimOffset(rng: Rng, difficulty: RallyDifficulty): number {
  const spread = PROFILES[difficulty].aiAimSpread
  return (rng.next() * 2 - 1) * spread
}

function launchBall(
  rng: Rng,
  difficulty: RallyDifficulty,
  calm: number,
  serveDir: 1 | -1,
): BallState {
  const speed = targetBallSpeed(difficulty, 0, calm)
  const sign = rng.next() < 0.5 ? -1 : 1
  const minAngle = (9 * Math.PI) / 180
  const maxAngle = (24 * Math.PI) / 180
  const angle = sign * (minAngle + rng.next() * (maxAngle - minAngle))
  return {
    x: 0.5,
    y: 0.5,
    vx: Math.sin(angle) * speed,
    vy: serveDir * Math.cos(angle) * speed,
  }
}

function eventPriority(ev: RallyEvent): number {
  if (ev === 'scorePlayer' || ev === 'scoreAi') return 3
  if (ev === 'paddle') return 2
  if (ev === 'wall') return 1
  return 0
}

function pushRipple(ripples: RallyRipple[], ripple: RallyRipple): void {
  if (ripples.length >= MAX_RIPPLES) {
    ripples.splice(0, ripples.length - MAX_RIPPLES + 1)
  }
  ripples.push(ripple)
}

export function createRally({ seed, difficulty = 'medium', calm = 0 }: CreateRallyOptions): RallyState {
  const rng = createRng(seed)
  const aiAimOffset = pickAiAimOffset(rng, difficulty)
  return {
    difficulty,
    playerX: 0.5,
    playerTargetX: null,
    playerDir: 0,
    playerVel: 0,
    aiX: 0.5,
    aiAimOffset,
    paddleWidth: paddleWidthFor(calm),
    ball: { x: 0.5, y: 0.5, vx: 0, vy: 0 },
    serveDelayMs: INITIAL_SERVE_DELAY_MS,
    serveDir: 1,
    playerScore: 0,
    aiScore: 0,
    rally: 0,
    bestRally: 0,
    event: null,
    eventId: 0,
    trail: [],
    trailTimerMs: 0,
    ripples: [],
    nextRippleId: 1,
    timeMs: 0,
    rngState: rng.state(),
  }
}

/** Direct horizontal target for touch/pointer drag. */
export function setPlayerX(state: RallyState, x: number): RallyState {
  if (!Number.isFinite(x)) return state
  const halfW = state.paddleWidth * 0.5
  const clamped = clamp(x, halfW, 1 - halfW)
  return {
    ...state,
    playerTargetX: clamped,
    playerDir: 0,
  }
}

/** Directional horizontal input (`-1` left, `0` stop, `1` right) for keyboard play. */
export function setPlayerVelocity(state: RallyState, dir: number): RallyState {
  const clamped = Number.isFinite(dir) ? clamp(dir, -1, 1) : 0
  return {
    ...state,
    playerDir: clamped,
    playerTargetX: clamped !== 0 ? null : state.playerTargetX,
  }
}

/** Immediately launches a waiting serve (tap or Space). */
export function serveNow(state: RallyState, calm = 0): RallyState {
  if (state.serveDelayMs <= 0) return state
  const rng = createRng(state.rngState)
  const ball = launchBall(rng, state.difficulty, calm, state.serveDir)
  const aiAimOffset = pickAiAimOffset(rng, state.difficulty)
  return {
    ...state,
    ball,
    serveDelayMs: 0,
    aiAimOffset,
    trail: [],
    trailTimerMs: 0,
    rngState: rng.state(),
  }
}

/** Switches AI difficulty without interrupting a calm session. */
export function setDifficulty(
  state: RallyState,
  difficulty: RallyDifficulty,
  calm = 0,
): RallyState {
  if (state.difficulty === difficulty) return state
  const rng = createRng(state.rngState)
  const aiAimOffset = pickAiAimOffset(rng, difficulty)
  let ball = state.ball
  if (state.serveDelayMs <= 0) {
    const mag = Math.hypot(ball.vx, ball.vy)
    if (mag > 1e-6) {
      const nextSpeed = targetBallSpeed(difficulty, state.rally, calm)
      ball = {
        ...ball,
        vx: (ball.vx / mag) * nextSpeed,
        vy: (ball.vy / mag) * nextSpeed,
      }
    }
  }
  return {
    ...state,
    difficulty,
    aiAimOffset,
    ball,
    rngState: rng.state(),
  }
}

export function tickRally(state: RallyState, dtMs: number, calm: number): RallyState {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return state

  const c = clamp01(calm)
  const profile = PROFILES[state.difficulty]
  const paddleWidth = paddleWidthFor(c)
  const halfW = paddleWidth * 0.5
  const speedScale = calmSpeedScale(c)
  // The AI slows at least as much as the ball does, a little more at high calm.
  const aiCalmFactor = speedScale * (1 - 0.12 * c)
  const aiHalfW = AI_PADDLE_WIDTH * 0.5

  const rng = createRng(state.rngState)

  let playerX = clamp(state.playerX, halfW, 1 - halfW)
  const playerTargetX = state.playerTargetX !== null ? clamp(state.playerTargetX, halfW, 1 - halfW) : null
  const playerDir = state.playerDir
  let playerVel = state.playerVel

  let aiX = clamp(state.aiX, aiHalfW, 1 - aiHalfW)
  let aiAimOffset = state.aiAimOffset

  let bx = state.ball.x
  let by = state.ball.y
  let vx = state.ball.vx
  let vy = state.ball.vy

  let serveDelayMs = state.serveDelayMs
  let serveDir = state.serveDir
  let playerScore = state.playerScore
  let aiScore = state.aiScore
  let rally = state.rally
  let bestRally = state.bestRally

  let tickEvent: RallyEvent = null
  let eventId = state.eventId
  const trail = state.trail.slice()
  let trailTimerMs = state.trailTimerMs
  let ripples = state.ripples.map((r) => ({ ...r }))
  let nextRippleId = state.nextRippleId
  let timeMs = state.timeMs

  const emit = (ev: Exclude<RallyEvent, null>) => {
    eventId += 1
    if (eventPriority(ev) >= eventPriority(tickEvent)) {
      tickEvent = ev
    }
  }

  let remaining = dtMs
  while (remaining > 0) {
    const stepMs = Math.min(remaining, MAX_SUBSTEP_MS)
    remaining -= stepMs
    const dt = stepMs / 1000
    timeMs += stepMs

    // 1. Update player paddle smoothly (touch target or keyboard velocity)
    if (playerTargetX !== null) {
      const alpha = 1 - Math.exp(-dt * 28)
      let nextX = playerX + (playerTargetX - playerX) * alpha
      if (Math.abs(playerTargetX - nextX) < 0.0005) {
        nextX = playerTargetX
      }
      playerVel = dt > 0 ? (nextX - playerX) / dt : 0
      playerX = clamp(nextX, halfW, 1 - halfW)
    } else {
      const desiredVel = playerDir * PLAYER_KEY_SPEED
      const velAlpha = 1 - Math.exp(-dt * (playerDir !== 0 ? 18 : 22))
      playerVel += (desiredVel - playerVel) * velAlpha
      if (playerDir === 0 && Math.abs(playerVel) < 0.004) {
        playerVel = 0
      }
      playerX = clamp(playerX + playerVel * dt, halfW, 1 - halfW)
    }

    // 2. Update AI paddle according to difficulty profile
    const aiContactY = AI_Y + PADDLE_HALF_HEIGHT + BALL_RADIUS
    let desiredAiX = 0.5
    if (serveDelayMs > 0) {
      desiredAiX = 0.5
    } else if (vy < 0 && by <= profile.aiReactY) {
      const predictedX =
        profile.aiPrediction > 0 ? predictInterceptX(bx, by, vx, vy, aiContactY) : bx
      const trackedX = bx + (predictedX - bx) * profile.aiPrediction
      desiredAiX = trackedX + aiAimOffset
    } else {
      desiredAiX = 0.5 + (bx - 0.5) * profile.aiIdleFollow
    }
    desiredAiX = clamp(desiredAiX, aiHalfW, 1 - aiHalfW)

    const aiDiff = desiredAiX - aiX
    if (Math.abs(aiDiff) > profile.aiDeadzone) {
      const maxMove = profile.aiMaxSpeed * aiCalmFactor * dt
      const move = clamp(aiDiff, -maxMove, maxMove)
      aiX = clamp(aiX + move, aiHalfW, 1 - aiHalfW)
    }

    // 3. Age and expire impact ripples
    if (ripples.length > 0) {
      const alive: RallyRipple[] = []
      for (const r of ripples) {
        const nextAge = r.ageMs + stepMs
        if (nextAge < r.durationMs) {
          r.ageMs = nextAge
          alive.push(r)
        }
      }
      ripples = alive
    }

    // 4. Serve pause countdown or active ball physics
    if (serveDelayMs > 0) {
      serveDelayMs = Math.max(0, serveDelayMs - stepMs)
      if (serveDelayMs === 0) {
        const launched = launchBall(rng, state.difficulty, c, serveDir)
        bx = launched.x
        by = launched.y
        vx = launched.vx
        vy = launched.vy
        aiAimOffset = pickAiAimOffset(rng, state.difficulty)
        trail.length = 0
        trailTimerMs = 0
      }
      continue
    }

    // Keep ball speed smoothly aligned with calm & rally count
    const desiredSpeed = targetBallSpeed(state.difficulty, rally, c)
    const currSpeed = Math.hypot(vx, vy)
    if (currSpeed > 1e-6 && Math.abs(currSpeed - desiredSpeed) > 1e-4) {
      const ratio = desiredSpeed / currSpeed
      vx *= ratio
      vy *= ratio
    }

    const prevBx = bx
    const prevBy = by
    bx += vx * dt
    by += vy * dt

    // 5. Side wall reflections
    if (bx < BALL_RADIUS && vx < 0) {
      bx = clamp(BALL_RADIUS + (BALL_RADIUS - bx), BALL_RADIUS, 1 - BALL_RADIUS)
      vx = Math.abs(vx)
      emit('wall')
      pushRipple(ripples, {
        id: nextRippleId++,
        x: BALL_RADIUS,
        y: clamp(by, 0.04, 0.96),
        ageMs: 0,
        durationMs: 400,
        maxRadius: 0.055,
        kind: 'wall',
      })
    } else if (bx > 1 - BALL_RADIUS && vx > 0) {
      bx = clamp(1 - BALL_RADIUS - (bx - (1 - BALL_RADIUS)), BALL_RADIUS, 1 - BALL_RADIUS)
      vx = -Math.abs(vx)
      emit('wall')
      pushRipple(ripples, {
        id: nextRippleId++,
        x: 1 - BALL_RADIUS,
        y: clamp(by, 0.04, 0.96),
        ageMs: 0,
        durationMs: 400,
        maxRadius: 0.055,
        kind: 'wall',
      })
    }

    // 6. Player paddle collision (bottom)
    const playerTop = PLAYER_Y - PADDLE_HALF_HEIGHT
    const playerContactY = playerTop - BALL_RADIUS
    if (
      vy > 0 &&
      prevBy <= playerContactY + 0.015 &&
      by >= playerContactY &&
      by <= PLAYER_Y + PADDLE_HALF_HEIGHT + BALL_RADIUS
    ) {
      const denom = by - prevBy
      const t = Math.abs(denom) > 1e-6 ? clamp((playerContactY - prevBy) / denom, 0, 1) : 1
      const hitX = prevBx + (bx - prevBx) * t
      if (Math.abs(hitX - playerX) <= halfW + BALL_RADIUS * 0.85) {
        const offset = clamp((hitX - playerX) / halfW, -1, 1)
        const angle = offset * MAX_BOUNCE_ANGLE
        rally += 1
        if (rally > bestRally) bestRally = rally
        const nextSpeed = targetBallSpeed(state.difficulty, rally, c)
        vx = Math.sin(angle) * nextSpeed
        vy = -Math.cos(angle) * nextSpeed
        bx = clamp(hitX, BALL_RADIUS, 1 - BALL_RADIUS)
        by = playerContactY - 0.0005
        aiAimOffset = pickAiAimOffset(rng, state.difficulty)
        emit('paddle')
        pushRipple(ripples, {
          id: nextRippleId++,
          x: bx,
          y: playerTop,
          ageMs: 0,
          durationMs: 540,
          maxRadius: 0.088,
          kind: 'paddle',
        })
      }
    }

    // 7. AI paddle collision (top)
    const aiBottom = AI_Y + PADDLE_HALF_HEIGHT
    if (
      vy < 0 &&
      prevBy >= aiContactY - 0.015 &&
      by <= aiContactY &&
      by >= AI_Y - PADDLE_HALF_HEIGHT - BALL_RADIUS
    ) {
      const denom = by - prevBy
      const t = Math.abs(denom) > 1e-6 ? clamp((aiContactY - prevBy) / denom, 0, 1) : 1
      const hitX = prevBx + (bx - prevBx) * t
      if (Math.abs(hitX - aiX) <= aiHalfW + BALL_RADIUS * 0.85) {
        const offset = clamp((hitX - aiX) / aiHalfW, -1, 1)
        const angle = offset * MAX_BOUNCE_ANGLE
        rally += 1
        if (rally > bestRally) bestRally = rally
        const nextSpeed = targetBallSpeed(state.difficulty, rally, c)
        vx = Math.sin(angle) * nextSpeed
        vy = Math.cos(angle) * nextSpeed
        bx = clamp(hitX, BALL_RADIUS, 1 - BALL_RADIUS)
        by = aiContactY + 0.0005
        emit('paddle')
        pushRipple(ripples, {
          id: nextRippleId++,
          x: bx,
          y: aiBottom,
          ageMs: 0,
          durationMs: 540,
          maxRadius: 0.088,
          kind: 'paddle',
        })
      }
    }

    // 8. Scoring checks
    if (by < -BALL_RADIUS) {
      playerScore += 1
      rally = 0
      emit('scorePlayer')
      pushRipple(ripples, {
        id: nextRippleId++,
        x: clamp(bx, 0.1, 0.9),
        y: 0.025,
        ageMs: 0,
        durationMs: 760,
        maxRadius: 0.14,
        kind: 'scorePlayer',
      })
      bx = 0.5
      by = 0.5
      vx = 0
      vy = 0
      serveDelayMs = SERVE_DELAY_MS
      serveDir = -1
      trail.length = 0
      trailTimerMs = 0
    } else if (by > 1 + BALL_RADIUS) {
      aiScore += 1
      rally = 0
      emit('scoreAi')
      pushRipple(ripples, {
        id: nextRippleId++,
        x: clamp(bx, 0.1, 0.9),
        y: 0.975,
        ageMs: 0,
        durationMs: 760,
        maxRadius: 0.14,
        kind: 'scoreAi',
      })
      bx = 0.5
      by = 0.5
      vx = 0
      vy = 0
      serveDelayMs = SERVE_DELAY_MS
      serveDir = 1
      trail.length = 0
      trailTimerMs = 0
    } else {
      // 9. Sample tapering 7-point trail while ball is in flight
      trailTimerMs += stepMs
      if (trailTimerMs >= TRAIL_SAMPLE_MS) {
        trailTimerMs -= TRAIL_SAMPLE_MS
        trail.push({ x: bx, y: by })
        if (trail.length > TRAIL_LENGTH) {
          trail.splice(0, trail.length - TRAIL_LENGTH)
        }
      }
    }
  }

  return {
    difficulty: state.difficulty,
    playerX,
    playerTargetX,
    playerDir,
    playerVel,
    aiX,
    aiAimOffset,
    paddleWidth,
    ball: { x: bx, y: by, vx, vy },
    serveDelayMs,
    serveDir,
    playerScore,
    aiScore,
    rally,
    bestRally,
    event: tickEvent,
    eventId,
    trail,
    trailTimerMs,
    ripples,
    nextRippleId,
    timeMs,
    rngState: rng.state(),
  }
}
