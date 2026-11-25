import { createRng, type Rng } from '../../rng'

export const SPINE_SEGMENTS = 10
export const SPINE_SPACING = 0.024
export const LEAF_COUNT = 4
export const MAX_RIPPLES = 18
export const GATHER_RADIUS = 0.052
export const USER_TARGET_IDLE_MS = 5000

export type MoteColor = 'candle' | 'glow' | 'ember' | 'honey' | 'rose'

export interface Vec2 {
  x: number
  y: number
}

export interface KoiState {
  /** Articulated spine points from head (0) to tail tip (SPINE_SEGMENTS - 1). */
  spine: Vec2[]
  /** Current swimming heading in radians. */
  heading: number
  /** Current scalar speed in normalised pond units per second. */
  speed: number
  /** Continuous tail undulation phase in radians. */
  tailPhase: number
  /** Current angular turn rate in rad/s (drives fin banking). */
  turnRate: number
}

export interface LotusBud extends Vec2 {
  id: number
  openedAt: number | null
}

export type RippleKind = 'tap' | 'gather' | 'tail' | 'wash'

export interface Ripple {
  id: number
  x: number
  y: number
  ageMs: number
  durationMs: number
  startRadius: number
  maxRadius: number
  kind: RippleKind
  color: MoteColor
}

export interface FloatingLeaf {
  id: number
  anchorX: number
  anchorY: number
  x: number
  y: number
  radius: number
  angle: number
  baseAngle: number
  phase: number
  driftSpeed: number
}

export interface PondState {
  koi: KoiState
  target: Vec2 | null
  idleMs: number
  wanderTarget: Vec2
  wanderTimerMs: number
  buds: LotusBud[]
  nextBud: number
  blooms: number
  completedAt: number | null
  ripples: Ripple[]
  leaves: FloatingLeaf[]
  gathered: number
  gatherEventId: number
  nextId: number
  timeMs: number
  tailRippleCooldownMs: number
  rngState: number
}

export interface CreatePondOptions {
  seed: number
  calm: number
}

const CRUISE_SPEED = 0.12
const GUIDED_MAX_SPEED = 0.23
const MIN_SPEED = 0.068
const EDGE_MARGIN = 0.14
const MAX_JOINT_BEND = 0.42
const MAX_SUBSTEP_MS = 50

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

function clamp01(v: number): number {
  return clamp(v, 0, 1)
}

function normalizeAngle(angle: number): number {
  let a = angle
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Smooth calm multiplier: 1.0x at calm=0 down to 0.58x at calm=1. */
export function calmSpeedScale(calm: number): number {
  return 1 - clamp01(calm) * 0.42
}

function buildInitialSpine(headX: number, headY: number, heading: number): Vec2[] {
  const spine: Vec2[] = [{ x: headX, y: headY }]
  const backX = -Math.cos(heading)
  const backY = -Math.sin(heading)
  for (let i = 1; i < SPINE_SEGMENTS; i++) {
    const prev = spine[i - 1]!
    spine.push({
      x: prev.x + backX * SPINE_SPACING,
      y: prev.y + backY * SPINE_SPACING,
    })
  }
  return spine
}

function pickWanderTarget(rng: Rng, from: Vec2): Vec2 {
  let best: Vec2 = { x: 0.5, y: 0.5 }
  let bestDist = -1
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate: Vec2 = {
      x: 0.18 + rng.next() * 0.64,
      y: 0.18 + rng.next() * 0.64,
    }
    const d = dist(candidate, from)
    if (d >= 0.24) return candidate
    if (d > bestDist) {
      best = candidate
      bestDist = d
    }
  }
  return best
}

const CONSTELLATIONS: readonly (readonly (readonly [number, number])[])[] = [
  [[-0.26, 0.12], [0, -0.17], [0.26, 0.12]],
  [[0.12, -0.26], [-0.17, -0.12], [-0.19, 0.15], [0.08, 0.27]],
  [[-0.26, 0.18], [-0.19, -0.18], [0.16, -0.25], [0.26, 0.07], [0.05, 0.11]],
  [[0, -0.27], [0.27, 0], [0, 0.27], [-0.27, 0]],
]

function createConstellation(rng: Rng, blooms: number, firstId: number): LotusBud[] {
  const angle = rng.next() * Math.PI * 2
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const shape = CONSTELLATIONS[blooms % CONSTELLATIONS.length]!
  return shape.map(([x, y], index) => ({
    id: firstId + index,
    x: 0.5 + x * cos - y * sin,
    y: 0.5 + x * sin + y * cos,
    openedAt: null,
  }))
}

function createLeaves(rng: Rng): FloatingLeaf[] {
  const corners: readonly Vec2[] = [
    { x: 0.1, y: 0.12 },
    { x: 0.9, y: 0.16 },
    { x: 0.12, y: 0.87 },
    { x: 0.88, y: 0.85 },
  ]
  const leaves: FloatingLeaf[] = []
  for (let i = 0; i < LEAF_COUNT; i++) {
    const base = corners[i % corners.length]!
    const anchorX = clamp(base.x + (rng.next() - 0.5) * 0.08, 0.05, 0.95)
    const anchorY = clamp(base.y + (rng.next() - 0.5) * 0.08, 0.06, 0.94)
    const baseAngle = rng.next() * Math.PI * 2
    leaves.push({
      id: i + 1,
      anchorX,
      anchorY,
      x: anchorX,
      y: anchorY,
      radius: 0.044 + rng.next() * 0.024,
      angle: baseAngle,
      baseAngle,
      phase: rng.next() * Math.PI * 2,
      driftSpeed: 0.16 + rng.next() * 0.12,
    })
  }
  return leaves
}

function appendRipple(ripples: readonly Ripple[], ripple: Ripple): Ripple[] {
  const next = ripples.length >= MAX_RIPPLES ? ripples.slice(ripples.length - MAX_RIPPLES + 1) : ripples.slice()
  next.push(ripple)
  return next
}

export function createPond({ seed, calm }: CreatePondOptions): PondState {
  const rng = createRng(seed)
  const scale = calmSpeedScale(calm)
  const headX = 0.44 + (rng.next() - 0.5) * 0.12
  const headY = 0.52 + (rng.next() - 0.5) * 0.12
  const heading = (rng.next() - 0.5) * Math.PI * 2
  const spine = buildInitialSpine(headX, headY, heading)
  const head = spine[0]!

  const buds = createConstellation(rng, 0, LEAF_COUNT + 1)
  const nextId = LEAF_COUNT + 1 + buds.length

  const leaves = createLeaves(rng)
  const wanderTarget = pickWanderTarget(rng, head)

  return {
    koi: {
      spine,
      heading,
      speed: CRUISE_SPEED * scale,
      tailPhase: rng.next() * Math.PI * 2,
      turnRate: 0,
    },
    target: null,
    idleMs: 0,
    wanderTarget,
    wanderTimerMs: 5000 + rng.next() * 3000,
    buds,
    nextBud: 0,
    blooms: 0,
    completedAt: null,
    ripples: [],
    leaves,
    gathered: 0,
    gatherEventId: 0,
    nextId,
    timeMs: 0,
    tailRippleCooldownMs: 1800 + rng.next() * 1400,
    rngState: rng.state(),
  }
}

export function setTarget(state: PondState, x: number, y: number): PondState {
  return {
    ...state,
    target: {
      x: clamp(x, 0.04, 0.96),
      y: clamp(y, 0.04, 0.96),
    },
    idleMs: 0,
  }
}

export function clearTarget(state: PondState): PondState {
  if (state.target === null) return state
  return {
    ...state,
    target: null,
  }
}

export function tapPond(state: PondState, x: number, y: number): PondState {
  const tx = clamp(x, 0.04, 0.96)
  const ty = clamp(y, 0.04, 0.96)
  const rng = createRng(state.rngState)
  const ripple: Ripple = {
    id: state.nextId,
    x: tx,
    y: ty,
    ageMs: 0,
    durationMs: 2600 + rng.next() * 800,
    startRadius: 0.008,
    maxRadius: 0.18 + rng.next() * 0.055,
    kind: 'tap',
    color: 'glow',
  }
  return {
    ...state,
    target: { x: tx, y: ty },
    idleMs: 0,
    ripples: appendRipple(state.ripples, ripple),
    nextId: state.nextId + 1,
    rngState: rng.state(),
  }
}

function stepPondOnce(state: PondState, dtMs: number, calm: number): PondState {
  const dt = dtMs / 1000
  const c = clamp01(calm)
  const speedScale = calmSpeedScale(c)
  const rippleScale = 1 - c * 0.34

  const rng = createRng(state.rngState)
  const nextTimeMs = state.timeMs + dtMs
  let nextId = state.nextId

  // 1. Target & autonomous wander bookkeeping
  const prevHead = state.koi.spine[0]!
  let target = state.target
  let idleMs = state.idleMs + dtMs
  let wanderTarget = state.wanderTarget
  let wanderTimerMs = state.wanderTimerMs - dtMs

  if (target !== null) {
    const dTarget = dist(prevHead, target)
    // A slower koi (higher calm) gets proportionally longer to reach where you tapped.
    const patienceMs = USER_TARGET_IDLE_MS / Math.max(0.35, speedScale)
    if (idleMs >= patienceMs || (dTarget < 0.036 && idleMs > 280)) {
      target = null
      wanderTarget = pickWanderTarget(rng, prevHead)
      wanderTimerMs = 4500 + rng.next() * 3500
    }
  }

  if (target === null) {
    if (dist(prevHead, wanderTarget) < 0.09 || wanderTimerMs <= 0) {
      wanderTarget = pickWanderTarget(rng, prevHead)
      wanderTimerMs = 4500 + rng.next() * 3500
    }
  }

  // 2. Smooth steering + soft edge avoidance
  const activeGoal = target ?? wanderTarget
  const gx = activeGoal.x - prevHead.x
  const gy = activeGoal.y - prevHead.y
  const goalDist = Math.hypot(gx, gy)
  let steerX = goalDist > 1e-5 ? gx / goalDist : Math.cos(state.koi.heading)
  let steerY = goalDist > 1e-5 ? gy / goalDist : Math.sin(state.koi.heading)

  // Soft edge-avoidance forces so the koi arcs gracefully around borders
  const edgeWeight = 2.8
  if (prevHead.x < EDGE_MARGIN) {
    const t = (EDGE_MARGIN - prevHead.x) / EDGE_MARGIN
    steerX += t * t * edgeWeight
  } else if (prevHead.x > 1 - EDGE_MARGIN) {
    const t = (prevHead.x - (1 - EDGE_MARGIN)) / EDGE_MARGIN
    steerX -= t * t * edgeWeight
  }
  if (prevHead.y < EDGE_MARGIN) {
    const t = (EDGE_MARGIN - prevHead.y) / EDGE_MARGIN
    steerY += t * t * edgeWeight
  } else if (prevHead.y > 1 - EDGE_MARGIN) {
    const t = (prevHead.y - (1 - EDGE_MARGIN)) / EDGE_MARGIN
    steerY -= t * t * edgeWeight
  }

  const desiredHeading = Math.atan2(steerY, steerX)
  const angleDiff = normalizeAngle(desiredHeading - state.koi.heading)
  const maxTurnRate = (target ? 2.55 : 1.35) * (0.72 + 0.28 * speedScale)
  const desiredTurnRate = clamp(angleDiff * (target ? 3.6 : 2.1), -maxTurnRate, maxTurnRate)
  const turnRate = state.koi.turnRate + (desiredTurnRate - state.koi.turnRate) * Math.min(1, dt * 6.5)
  const heading = normalizeAngle(state.koi.heading + turnRate * dt)

  let desiredSpeed: number
  if (target !== null) {
    desiredSpeed = clamp(MIN_SPEED + goalDist * 0.65, MIN_SPEED, GUIDED_MAX_SPEED) * speedScale
  } else {
    const breath = 0.9 + 0.1 * Math.sin(nextTimeMs * 0.00055)
    desiredSpeed = CRUISE_SPEED * breath * speedScale
  }
  desiredSpeed *= 1 - Math.min(0.28, Math.abs(angleDiff) * 0.14)
  const speed = state.koi.speed + (desiredSpeed - state.koi.speed) * Math.min(1, dt * 3.2)

  // 3. Advance head and solve articulated spine constraints with sinusoidal undulation
  const newHead: Vec2 = {
    x: clamp(prevHead.x + Math.cos(heading) * speed * dt, 0.03, 0.97),
    y: clamp(prevHead.y + Math.sin(heading) * speed * dt, 0.03, 0.97),
  }

  const tailPhase =
    state.koi.tailPhase + dt * (2.4 + (speed / Math.max(0.01, speedScale)) * 18.0) * speedScale
  const swimFactor = clamp(speed / Math.max(0.01, CRUISE_SPEED * speedScale), 0.55, 1.55)

  const newSpine: Vec2[] = new Array(SPINE_SEGMENTS)
  newSpine[0] = newHead

  for (let i = 1; i < SPINE_SEGMENTS; i++) {
    const parent = newSpine[i - 1]!
    const prevSeg = state.koi.spine[i]!
    const parentAngle =
      i === 1
        ? normalizeAngle(heading + Math.PI)
        : Math.atan2(parent.y - newSpine[i - 2]!.y, parent.x - newSpine[i - 2]!.x)

    const dx = prevSeg.x - parent.x
    const dy = prevSeg.y - parent.y
    const rawAngle = Math.hypot(dx, dy) > 1e-6 ? Math.atan2(dy, dx) : parentAngle

    // Subtle travelling sinusoidal wave that grows gently toward the tail
    const tailFrac = i / (SPINE_SEGMENTS - 1)
    const waveOffset = Math.sin(tailPhase - i * 0.56) * (0.04 + 0.13 * tailFrac * tailFrac) * swimFactor
    const waveAngle = normalizeAngle(parentAngle + waveOffset)
    const blend = Math.min(1, dt * (2.2 + 3.6 * tailFrac))
    let segAngle = normalizeAngle(rawAngle + normalizeAngle(waveAngle - rawAngle) * blend)

    // Keep inter-segment bend smooth so the spine never kinks
    const bend = clamp(normalizeAngle(segAngle - parentAngle), -MAX_JOINT_BEND, MAX_JOINT_BEND)
    segAngle = normalizeAngle(parentAngle + bend)

    newSpine[i] = {
      x: parent.x + Math.cos(segAngle) * SPINE_SPACING,
      y: parent.y + Math.sin(segAngle) * SPINE_SPACING,
    }
  }

  // 4. Advance & expire existing ripples
  let ripples: Ripple[] = []
  for (const r of state.ripples) {
    const nextAge = r.ageMs + dtMs * rippleScale
    if (nextAge < r.durationMs) {
      ripples.push({ ...r, ageMs: nextAge })
    }
  }

  // Subtle periodic tail-sweep ripple
  let tailRippleCooldownMs = state.tailRippleCooldownMs - dtMs * speedScale
  if (tailRippleCooldownMs <= 0) {
    const tailTip = newSpine[SPINE_SEGMENTS - 1]!
    ripples = appendRipple(ripples, {
      id: nextId++,
      x: tailTip.x,
      y: tailTip.y,
      ageMs: 0,
      durationMs: 2400 + rng.next() * 700,
      startRadius: 0.005,
      maxRadius: 0.085 + rng.next() * 0.035,
      kind: 'tail',
      color: 'candle',
    })
    tailRippleCooldownMs = 2100 + rng.next() * 1600
  }

  let { buds, nextBud, blooms, completedAt, gathered, gatherEventId } = state
  if (completedAt !== null && nextTimeMs - completedAt >= 2200) {
    buds = createConstellation(rng, blooms, nextId)
    nextId += buds.length
    nextBud = 0
    completedAt = null
  }

  const activeBud = buds[nextBud]
  if (state.target && activeBud && dist(newHead, activeBud) <= GATHER_RADIUS) {
    buds = buds.map((bud, index) => index === nextBud ? { ...bud, openedAt: nextTimeMs } : bud)
    nextBud++
    gathered++
    gatherEventId++
    ripples = appendRipple(ripples, {
      id: nextId++,
      x: activeBud.x,
      y: activeBud.y,
      ageMs: 0,
      durationMs: 2900,
      startRadius: 0.015,
      maxRadius: 0.28,
      kind: 'gather',
      color: 'honey',
    })

    if (nextBud === buds.length) {
      completedAt = nextTimeMs
      blooms++
      ripples = appendRipple(ripples, {
        id: nextId++,
        x: 0.5,
        y: 0.5,
        ageMs: 0,
        durationMs: 3500,
        startRadius: 0.035,
        maxRadius: 1.05,
        kind: 'wash',
        color: 'honey',
      })
    }
  }

  // 6. Imperceptible drift on edge lily/ember leaves
  const nextLeaves: FloatingLeaf[] = state.leaves.map((leaf) => {
    const phase = leaf.phase + dt * leaf.driftSpeed * speedScale
    return {
      ...leaf,
      phase,
      x: clamp(leaf.anchorX + Math.cos(phase) * 0.011, 0.04, 0.96),
      y: clamp(leaf.anchorY + Math.sin(phase * 0.78) * 0.009, 0.04, 0.96),
      angle: leaf.baseAngle + Math.sin(phase * 0.62) * 0.08,
    }
  })

  return {
    koi: {
      spine: newSpine,
      heading,
      speed,
      tailPhase,
      turnRate,
    },
    target,
    idleMs,
    wanderTarget,
    wanderTimerMs,
    buds,
    nextBud,
    blooms,
    completedAt,
    ripples,
    leaves: nextLeaves,
    gathered,
    gatherEventId,
    nextId,
    timeMs: nextTimeMs,
    tailRippleCooldownMs,
    rngState: rng.state(),
  }
}

export function tickPond(state: PondState, dtMs: number, calm: number): PondState {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return state
  let remaining = dtMs
  let current = state
  while (remaining > 0) {
    const step = Math.min(remaining, MAX_SUBSTEP_MS)
    current = stepPondOnce(current, step, calm)
    remaining -= step
  }
  return current
}
