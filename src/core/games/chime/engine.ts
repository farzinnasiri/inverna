/**
 * Chime — classic Breakout / Brick Breaker in Watchmaker Ink & Brass.
 *
 * Pure TypeScript, zero DOM/React, deterministic via createRng.
 * Normalised court coordinates (0..1 width, 0..1 height) so physics are
 * resolution-independent and Expo/Skia-ready.
 */
import { createRng, type Rng } from '../../rng'

export type PieceStone = 'clay' | 'ochre' | 'straw' | 'sage' | 'rosewood' | 'stone' | 'bone'

export const COURT_COLS = 8
export const COURT_PAD_X = 0.05
export const BRICK_TOP = 0.085
export const BRICK_GAP_X = 0.012
export const BRICK_GAP_Y = 0.012
export const BRICK_W = (1 - COURT_PAD_X * 2 - (COURT_COLS - 1) * BRICK_GAP_X) / COURT_COLS
export const BRICK_H = 0.032

export const PADDLE_Y = 0.9
export const PADDLE_HEIGHT = 0.018
export const PADDLE_WIDTH_MIN = 0.22
export const PADDLE_WIDTH_MAX = 0.28

export const BALL_RADIUS = 0.016
export const BASE_BALL_SPEED = 0.62
export const CALM_SPEED_FACTOR = 0.72

/** Minimum angle from horizontal (radians) so the ball can never loop horizontally. */
export const MIN_VERTICAL_ANGLE_RAD = 0.34
/** Maximum paddle deflection angle from straight up (radians). */
export const MAX_DEFLECTION_ANGLE_RAD = 1.06

export const SHARD_DURATION_MS = 550
export const RING_DURATION_MS = 550
export const TRAIL_LENGTH = 6
export const CALM_SINGLE_HP_THRESHOLD = 0.6

const COLLISION_SUBSTEP_DIST = 0.004
const SHARD_GRAVITY = 0.92
const BALL_PERCH_GAP = 0.002

export interface ChimeBrick {
  id: number
  col: number
  row: number
  x: number
  y: number
  w: number
  h: number
  color: PieceStone
  hp: 1 | 2
  cracked: boolean
}

export interface ChimeBall {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  attached: boolean
  /** Launch angle in radians from straight up (- left, + right) while attached. */
  aimAngle: number
  trail: { x: number; y: number }[]
}

export interface ChimeShard {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  angle: number
  omega: number
  color: PieceStone
  ageMs: number
  durationMs: number
}

export interface ChimeRing {
  id: number
  x: number
  y: number
  color: PieceStone
  ageMs: number
  durationMs: number
  startRadius: number
  maxRadius: number
}

export interface ChimeState {
  levelIndex: number
  levelNumber: number
  patternName: string
  bricks: ChimeBrick[]
  paddleX: number
  paddleWidth: number
  paddleY: number
  paddleHeight: number
  ball: ChimeBall
  shards: ChimeShard[]
  rings: ChimeRing[]
  score: number
  bricksBroken: number
  boardsCleared: number
  solved: boolean
  rngState: number
  nextId: number
  wallEventId: number
  paddleEventId: number
  crackEventId: number
  breakEventId: number
  clearEventId: number
  resetEventId: number
}

interface FormationCell {
  row: number
  col: number
  color: PieceStone
  reinforced?: boolean
}

export interface FormationSpec {
  id: string
  name: string
  cells: readonly FormationCell[]
}

const ROTATING_STONES: readonly PieceStone[] = ['sage', 'clay', 'straw', 'rosewood', 'stone']

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function clamp01(v: number): number {
  return clamp(v, 0, 1)
}

/** Smoothly eases ball speed from 1.0x at calm=0 to 0.72x at calm=1. */
export function ballSpeedForCalm(calm: number): number {
  const c = clamp01(calm)
  const mult = 1 - (1 - CALM_SPEED_FACTOR) * c
  return BASE_BALL_SPEED * mult
}

/** Widens the paddle subtly from 0.22 at calm=0 to 0.28 at calm=1. */
export function paddleWidthForCalm(calm: number): number {
  const c = clamp01(calm)
  return PADDLE_WIDTH_MIN + (PADDLE_WIDTH_MAX - PADDLE_WIDTH_MIN) * c
}

function buildWallCells(): FormationCell[] {
  const rowColors: readonly PieceStone[] = ['ochre', 'sage', 'clay', 'straw', 'rosewood', 'stone']
  const cells: FormationCell[] = []
  for (let row = 0; row < rowColors.length; row++) {
    const color = rowColors[row]!
    for (let col = 0; col < COURT_COLS; col++) {
      cells.push({
        row,
        col,
        color,
        reinforced: row === 0 && col >= 2 && col <= 5,
      })
    }
  }
  return cells
}

function buildArchCells(): FormationCell[] {
  const rows: readonly { row: number; cols: readonly number[]; color: PieceStone; reinforcedCols?: readonly number[] }[] = [
    { row: 0, cols: [1, 2, 3, 4, 5, 6], color: 'ochre', reinforcedCols: [2, 3, 4, 5] },
    { row: 1, cols: [0, 1, 2, 3, 4, 5, 6, 7], color: 'sage' },
    { row: 2, cols: [0, 1, 2, 5, 6, 7], color: 'clay' },
    { row: 3, cols: [0, 1, 6, 7], color: 'straw' },
    { row: 4, cols: [0, 1, 6, 7], color: 'rosewood' },
    { row: 5, cols: [0, 1, 6, 7], color: 'stone' },
    { row: 6, cols: [0, 7], color: 'ochre' },
  ]
  const cells: FormationCell[] = []
  for (const r of rows) {
    for (const col of r.cols) {
      cells.push({
        row: r.row,
        col,
        color: r.color,
        reinforced: r.reinforcedCols?.includes(col) ?? false,
      })
    }
  }
  return cells
}

function buildDiamondCells(): FormationCell[] {
  const cells: FormationCell[] = []
  const spans: readonly [number, number, number][] = [
    [0, 3, 4],
    [1, 2, 5],
    [2, 1, 6],
    [3, 0, 7],
    [4, 1, 6],
    [5, 2, 5],
    [6, 3, 4],
  ]
  for (const [row, start, end] of spans) {
    for (let col = start; col <= end; col++) {
      const isEdge = col === start || col === end
      const isCore = (row === 2 || row === 3 || row === 4) && (col === 3 || col === 4)
      let color: PieceStone
      if (row === 0 || isCore) {
        color = row === 3 ? 'sage' : 'ochre'
      } else if (isEdge) {
        color = row <= 3 ? 'clay' : 'rosewood'
      } else {
        color = row <= 2 ? 'straw' : 'stone'
      }
      cells.push({
        row,
        col,
        color,
        reinforced: (row === 0 && (col === 3 || col === 4)) || (row === 2 && (col === 3 || col === 4)),
      })
    }
  }
  return cells
}

function buildPillarsCells(): FormationCell[] {
  const cells: FormationCell[] = []
  const pillarCols = [0, 2, 5, 7]
  const rowColors: readonly PieceStone[] = ['ochre', 'clay', 'clay', 'straw', 'straw', 'rosewood', 'stone']
  for (let row = 0; row < rowColors.length; row++) {
    for (const col of pillarCols) {
      cells.push({
        row,
        col,
        color: rowColors[row]!,
        reinforced: row === 0,
      })
    }
  }
  // Suspended central lintel between the inner colonnade pillars.
  cells.push({ row: 2, col: 3, color: 'sage', reinforced: false })
  cells.push({ row: 2, col: 4, color: 'sage', reinforced: false })
  return cells
}

function buildChevronCells(): FormationCell[] {
  const rows: readonly { row: number; cols: readonly number[]; color: PieceStone; reinforcedCols?: readonly number[] }[] = [
    { row: 0, cols: [0, 7], color: 'ochre', reinforcedCols: [0, 7] },
    { row: 1, cols: [0, 1, 6, 7], color: 'sage' },
    { row: 2, cols: [1, 2, 5, 6], color: 'clay' },
    { row: 3, cols: [0, 2, 3, 4, 5, 7], color: 'ochre', reinforcedCols: [3, 4] },
    { row: 4, cols: [0, 1, 3, 4, 6, 7], color: 'straw' },
    { row: 5, cols: [1, 2, 5, 6], color: 'rosewood' },
    { row: 6, cols: [2, 3, 4, 5], color: 'stone' },
  ]
  const cells: FormationCell[] = []
  for (const r of rows) {
    for (const col of r.cols) {
      cells.push({
        row: r.row,
        col,
        color: r.color,
        reinforced: r.reinforcedCols?.includes(col) ?? false,
      })
    }
  }
  return cells
}

function buildSanctuaryCells(): FormationCell[] {
  const cells: FormationCell[] = []
  // Outer frame with a quiet bottom doorway at cols 3..4.
  for (let col = 0; col < COURT_COLS; col++) {
    cells.push({
      row: 0,
      col,
      color: col === 3 || col === 4 ? 'ochre' : 'clay',
      reinforced: col === 3 || col === 4,
    })
  }
  for (let row = 1; row <= 4; row++) {
    const sideColor: PieceStone = row % 2 === 1 ? 'rosewood' : 'straw'
    cells.push({ row, col: 0, color: sideColor })
    cells.push({ row, col: 7, color: sideColor })
  }
  for (const col of [0, 1, 2, 5, 6, 7]) {
    cells.push({ row: 5, col, color: 'stone' })
  }
  // Antique Brass inner core.
  for (const row of [2, 3]) {
    for (const col of [3, 4]) {
      cells.push({ row, col, color: 'ochre', reinforced: true })
    }
  }
  return cells
}

function buildStepsCells(): FormationCell[] {
  const rows: readonly { row: number; start: number; end: number; color: PieceStone; reinforced?: boolean }[] = [
    { row: 0, start: 3, end: 4, color: 'ochre', reinforced: true },
    { row: 1, start: 2, end: 5, color: 'sage' },
    { row: 2, start: 2, end: 5, color: 'ochre' },
    { row: 3, start: 1, end: 6, color: 'clay' },
    { row: 4, start: 1, end: 6, color: 'straw' },
    { row: 5, start: 0, end: 7, color: 'rosewood' },
    { row: 6, start: 0, end: 7, color: 'stone' },
  ]
  const cells: FormationCell[] = []
  for (const r of rows) {
    for (let col = r.start; col <= r.end; col++) {
      cells.push({
        row: r.row,
        col,
        color: r.color,
        reinforced: Boolean(r.reinforced),
      })
    }
  }
  return cells
}

function buildConstellationCells(): FormationCell[] {
  const cells: FormationCell[] = []
  const toneRing: readonly PieceStone[] = ['clay', 'straw', 'rosewood', 'sage', 'stone']
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < COURT_COLS; col++) {
      if ((row + col) % 2 !== 0) continue
      const isStar = (row === 0 && (col === 2 || col === 4)) || (row === 2 && (col === 2 || col === 4)) || (row === 4 && col === 4)
      const color: PieceStone = isStar ? 'ochre' : toneRing[(row + Math.floor(col / 2)) % toneRing.length]!
      cells.push({
        row,
        col,
        color,
        reinforced: row === 0 && (col === 2 || col === 4),
      })
    }
  }
  return cells
}

export const FORMATIONS: readonly FormationSpec[] = [
  { id: 'wall', name: 'Wall', cells: buildWallCells() },
  { id: 'arch', name: 'Arch', cells: buildArchCells() },
  { id: 'diamond', name: 'Diamond', cells: buildDiamondCells() },
  { id: 'pillars', name: 'Pillars', cells: buildPillarsCells() },
  { id: 'chevron', name: 'Chevron', cells: buildChevronCells() },
  { id: 'sanctuary', name: 'Sanctuary', cells: buildSanctuaryCells() },
  { id: 'steps', name: 'Steps', cells: buildStepsCells() },
  { id: 'constellation', name: 'Constellation', cells: buildConstellationCells() },
]

function shiftTone(color: PieceStone, shift: number): PieceStone {
  if (shift === 0 || color === 'ochre' || color === 'bone') return color
  const idx = ROTATING_STONES.indexOf(color)
  if (idx === -1) return color
  return ROTATING_STONES[(idx + shift) % ROTATING_STONES.length]!
}

function buildBricksForLevel(
  levelIndex: number,
  calm: number,
  startId: number,
): { patternName: string; bricks: ChimeBrick[]; nextId: number } {
  const count = FORMATIONS.length
  const normalizedIndex = Math.max(0, Math.floor(levelIndex))
  const spec = FORMATIONS[normalizedIndex % count]!
  const cycle = Math.floor(normalizedIndex / count)
  const mirrorX = cycle % 2 === 1
  const toneShift = cycle % ROTATING_STONES.length
  const singleHpOnly = clamp01(calm) >= CALM_SINGLE_HP_THRESHOLD

  let id = startId
  const bricks: ChimeBrick[] = spec.cells.map((cell) => {
    const col = mirrorX ? COURT_COLS - 1 - cell.col : cell.col
    const row = cell.row
    const x = COURT_PAD_X + col * (BRICK_W + BRICK_GAP_X)
    const y = BRICK_TOP + row * (BRICK_H + BRICK_GAP_Y)
    const hp: 1 | 2 = !singleHpOnly && cell.reinforced ? 2 : 1
    return {
      id: id++,
      col,
      row,
      x,
      y,
      w: BRICK_W,
      h: BRICK_H,
      color: shiftTone(cell.color, toneShift),
      hp,
      cracked: false,
    }
  })

  return { patternName: spec.name, bricks, nextId: id }
}

function aimAngleForPaddle(paddleX: number): number {
  const offset = (0.5 - paddleX) * 0.55
  const clamped = clamp(offset, -0.42, 0.42)
  if (Math.abs(clamped) < 0.16) {
    return clamped < 0 ? -0.18 : 0.18
  }
  return clamped
}

function perchedBallY(paddleY: number, paddleHeight: number, radius: number): number {
  return paddleY - paddleHeight * 0.5 - radius - BALL_PERCH_GAP
}

/**
 * Enforce exact speed and a minimum vertical component so the ball never
 * gets stuck bouncing nearly horizontally forever.
 */
export function enforceMinVerticalAngle(vx: number, vy: number, speed: number): { vx: number; vy: number } {
  if (speed <= 0) return { vx: 0, vy: 0 }
  const mag = Math.hypot(vx, vy)
  let nx = mag > 1e-8 ? vx / mag : Math.sin(0.2)
  let ny = mag > 1e-8 ? vy / mag : -Math.cos(0.2)

  const minSin = Math.sin(MIN_VERTICAL_ANGLE_RAD)
  if (Math.abs(ny) < minSin) {
    const signY = ny < 0 ? -1 : ny > 0 ? 1 : -1
    const signX = nx < 0 ? -1 : 1
    ny = signY * minSin
    nx = signX * Math.sqrt(Math.max(0, 1 - ny * ny))
  }

  return { vx: nx * speed, vy: ny * speed }
}

export function createChime(opts: {
  seed: number
  calm: number
  levelIndex?: number
  score?: number
  bricksBroken?: number
  boardsCleared?: number
}): ChimeState {
  const rng = createRng(opts.seed)
  const levelIndex = Math.max(0, Math.floor(opts.levelIndex ?? 0))
  const paddleWidth = paddleWidthForCalm(opts.calm)
  const paddleX = 0.5
  const { patternName, bricks, nextId } = buildBricksForLevel(levelIndex, opts.calm, 1)

  const initialAim = rng.next() < 0.5 ? -0.22 : 0.22

  return {
    levelIndex,
    levelNumber: levelIndex + 1,
    patternName,
    bricks,
    paddleX,
    paddleWidth,
    paddleY: PADDLE_Y,
    paddleHeight: PADDLE_HEIGHT,
    ball: {
      x: paddleX,
      y: perchedBallY(PADDLE_Y, PADDLE_HEIGHT, BALL_RADIUS),
      vx: 0,
      vy: 0,
      radius: BALL_RADIUS,
      attached: true,
      aimAngle: initialAim,
      trail: [],
    },
    shards: [],
    rings: [],
    score: opts.score ?? 0,
    bricksBroken: opts.bricksBroken ?? 0,
    boardsCleared: opts.boardsCleared ?? 0,
    solved: false,
    rngState: rng.state(),
    nextId,
    wallEventId: 0,
    paddleEventId: 0,
    crackEventId: 0,
    breakEventId: 0,
    clearEventId: 0,
    resetEventId: 0,
  }
}

/** Position paddle directly in normalised 0..1 horizontal court space. */
export function setPaddleX(state: ChimeState, targetX: number): ChimeState {
  const halfW = state.paddleWidth * 0.5
  const nextX = clamp(targetX, halfW, 1 - halfW)
  if (Math.abs(nextX - state.paddleX) < 1e-6) return state

  if (state.ball.attached) {
    return {
      ...state,
      paddleX: nextX,
      ball: {
        ...state.ball,
        x: nextX,
        y: perchedBallY(state.paddleY, state.paddleHeight, state.ball.radius),
        aimAngle: aimAngleForPaddle(nextX),
      },
    }
  }

  return {
    ...state,
    paddleX: nextX,
  }
}

/** Nudge paddle horizontally by a normalised delta (ideal for keyboard input). */
export function nudgePaddle(state: ChimeState, dx: number): ChimeState {
  return setPaddleX(state, state.paddleX + dx)
}

/** Gently launch the ball upward from the paddle when attached. */
export function launchBall(state: ChimeState, calm = 0): ChimeState {
  if (!state.ball.attached || state.solved) return state
  const speed = ballSpeedForCalm(calm)
  const angle = clamp(state.ball.aimAngle, -MAX_DEFLECTION_ANGLE_RAD, MAX_DEFLECTION_ANGLE_RAD)
  const rawVx = Math.sin(angle) * speed
  const rawVy = -Math.cos(angle) * speed
  const vel = enforceMinVerticalAngle(rawVx, rawVy, speed)

  return {
    ...state,
    ball: {
      ...state.ball,
      vx: vel.vx,
      vy: vel.vy,
      attached: false,
      trail: [{ x: state.ball.x, y: state.ball.y }],
    },
  }
}

/** Advance to the next curated brick formation while preserving score and totals. */
export function nextLevel(state: ChimeState, calm: number): ChimeState {
  const rng = createRng(state.rngState ^ 0x9e3779b9)
  const nextSeed = (rng.state() + Math.floor(rng.next() * 0xffffffff)) >>> 0
  return createChime({
    seed: nextSeed,
    calm,
    levelIndex: state.levelIndex + 1,
    score: state.score,
    bricksBroken: state.bricksBroken,
    boardsCleared: state.boardsCleared,
  })
}

/** Restart the current level cleanly with the ball resting on the paddle. */
export function restartLevel(state: ChimeState, calm: number): ChimeState {
  const rng = createRng(state.rngState ^ 0x85ebca6b)
  const nextSeed = (rng.state() + Math.floor(rng.next() * 0xffffffff)) >>> 0
  return createChime({
    seed: nextSeed,
    calm,
    levelIndex: state.levelIndex,
    score: 0,
    bricksBroken: 0,
    boardsCleared: state.boardsCleared,
  })
}

/** Strip transient debris & rings before persisting to storage, pausing ball gently on paddle. */
export function stripEphemeralForSave(state: ChimeState): ChimeState {
  return {
    ...state,
    shards: [],
    rings: [],
    ball: {
      ...state.ball,
      x: state.paddleX,
      y: perchedBallY(state.paddleY, state.paddleHeight, state.ball.radius),
      vx: 0,
      vy: 0,
      attached: true,
      aimAngle: aimAngleForPaddle(state.paddleX),
      trail: [],
    },
  }
}

function spawnBrickDebris(
  brick: ChimeBrick,
  impactVx: number,
  impactVy: number,
  rng: Rng,
  nextId: number,
): { shards: ChimeShard[]; ring: ChimeRing; nextId: number } {
  const count = rng.int(2, 3)
  const cx = brick.x + brick.w * 0.5
  const cy = brick.y + brick.h * 0.5
  const shards: ChimeShard[] = []
  let id = nextId

  for (let i = 0; i < count; i++) {
    const slot = count === 2 ? (i === 0 ? -0.26 : 0.26) : (i - 1) * 0.3
    const sx = cx + slot * brick.w + (rng.next() - 0.5) * brick.w * 0.14
    const sy = cy + (rng.next() - 0.5) * brick.h * 0.3
    const shardW = brick.w * (0.28 + rng.next() * 0.14)
    const shardH = brick.h * (0.52 + rng.next() * 0.24)
    const vx = slot * 0.34 + impactVx * 0.14 + (rng.next() - 0.5) * 0.16
    const vy = -(0.12 + rng.next() * 0.16) + Math.min(0.08, impactVy * 0.08)
    const omega = (slot >= 0 ? 1 : -1) * (2.6 + rng.next() * 4.2)

    shards.push({
      id: id++,
      x: sx,
      y: sy,
      vx,
      vy,
      w: shardW,
      h: shardH,
      angle: (rng.next() - 0.5) * 0.4,
      omega,
      color: brick.color,
      ageMs: 0,
      durationMs: SHARD_DURATION_MS,
    })
  }

  const ring: ChimeRing = {
    id: id++,
    x: cx,
    y: cy,
    color: brick.color,
    ageMs: 0,
    durationMs: RING_DURATION_MS,
    startRadius: Math.min(brick.w, brick.h) * 0.45,
    maxRadius: Math.max(brick.w, brick.h) * 0.92,
  }

  return { shards, ring, nextId: id }
}

function advanceEphemerals(
  shards: readonly ChimeShard[],
  rings: readonly ChimeRing[],
  dtMs: number,
): { shards: ChimeShard[]; rings: ChimeRing[]; changed: boolean } {
  if (shards.length === 0 && rings.length === 0) {
    return { shards: shards as ChimeShard[], rings: rings as ChimeRing[], changed: false }
  }

  const dt = dtMs / 1000
  const nextShards: ChimeShard[] = []
  for (const s of shards) {
    const ageMs = s.ageMs + dtMs
    if (ageMs >= s.durationMs) continue
    const vy = s.vy + SHARD_GRAVITY * dt
    nextShards.push({
      ...s,
      x: s.x + s.vx * dt,
      y: s.y + vy * dt,
      vy,
      angle: s.angle + s.omega * dt,
      ageMs,
    })
  }

  const nextRings: ChimeRing[] = []
  for (const r of rings) {
    const ageMs = r.ageMs + dtMs
    if (ageMs >= r.durationMs) continue
    nextRings.push({ ...r, ageMs })
  }

  return { shards: nextShards, rings: nextRings, changed: true }
}

interface BrickHit {
  index: number
  closestX: number
  closestY: number
  dx: number
  dy: number
  distSq: number
}

function findClosestBrickHit(bricks: readonly ChimeBrick[], bx: number, by: number, radius: number): BrickHit | null {
  const rSq = radius * radius
  let best: BrickHit | null = null

  for (let i = 0; i < bricks.length; i++) {
    const b = bricks[i]!
    const closestX = clamp(bx, b.x, b.x + b.w)
    const closestY = clamp(by, b.y, b.y + b.h)
    const dx = bx - closestX
    const dy = by - closestY
    const distSq = dx * dx + dy * dy
    if (distSq <= rSq) {
      if (!best || distSq < best.distSq) {
        best = { index: i, closestX, closestY, dx, dy, distSq }
      }
    }
  }

  return best
}

/**
 * Advance Chime simulation by `dtMs` milliseconds at the current `calm` (0..1).
 * Uses substepped circle-vs-AABB collision so the ball never tunnels or hits
 * multiple bricks in a single substep.
 */
export function tickChime(state: ChimeState, dtMs: number, calm: number): ChimeState {
  if (dtMs <= 0) return state
  const clampedMs = Math.min(100, dtMs)
  const dt = clampedMs / 1000
  const targetPaddleWidth = paddleWidthForCalm(calm)
  const halfW = targetPaddleWidth * 0.5
  const paddleX = clamp(state.paddleX, halfW, 1 - halfW)
  const paddleChanged = Math.abs(targetPaddleWidth - state.paddleWidth) > 1e-6 || Math.abs(paddleX - state.paddleX) > 1e-6

  const { shards: agedShards, rings: agedRings, changed: ephemeralsChanged } = advanceEphemerals(
    state.shards,
    state.rings,
    clampedMs,
  )

  if (state.solved) {
    if (!ephemeralsChanged && !paddleChanged) return state
    return {
      ...state,
      paddleX,
      paddleWidth: targetPaddleWidth,
      shards: agedShards,
      rings: agedRings,
    }
  }

  if (state.ball.attached) {
    if (!ephemeralsChanged && !paddleChanged) return state
    return {
      ...state,
      paddleX,
      paddleWidth: targetPaddleWidth,
      ball: {
        ...state.ball,
        x: paddleX,
        y: perchedBallY(state.paddleY, state.paddleHeight, state.ball.radius),
        aimAngle: aimAngleForPaddle(paddleX),
      },
      shards: agedShards,
      rings: agedRings,
    }
  }

  const speed = ballSpeedForCalm(calm)
  const initialVel = enforceMinVerticalAngle(state.ball.vx, state.ball.vy, speed)
  let bx = state.ball.x
  let by = state.ball.y
  let vx = initialVel.vx
  let vy = initialVel.vy
  const r = state.ball.radius

  let bricks = state.bricks
  let bricksCloned = false
  let shards = agedShards
  let rings = agedRings
  let score = state.score
  let bricksBroken = state.bricksBroken
  let boardsCleared = state.boardsCleared
  let solved = false
  let attached = false
  let aimAngle = state.ball.aimAngle
  let nextId = state.nextId
  let wallEventId = state.wallEventId
  let paddleEventId = state.paddleEventId
  let crackEventId = state.crackEventId
  let breakEventId = state.breakEventId
  let clearEventId = state.clearEventId
  let resetEventId = state.resetEventId
  let rngState = state.rngState
  let rng: Rng | null = null

  const getRng = (): Rng => {
    if (!rng) rng = createRng(rngState)
    return rng
  }

  const totalDist = speed * dt
  const steps = Math.max(1, Math.ceil(totalDist / COLLISION_SUBSTEP_DIST))
  const subDt = dt / steps

  const paddleLeft = paddleX - halfW
  const paddleRight = paddleX + halfW
  const paddleTop = state.paddleY - state.paddleHeight * 0.5
  const paddleBottom = state.paddleY + state.paddleHeight * 0.5

  for (let step = 0; step < steps; step++) {
    bx += vx * subDt
    by += vy * subDt

    // 1. Court walls (left, right, top)
    let hitWall = false
    if (bx - r < 0) {
      bx = r
      vx = Math.abs(vx)
      hitWall = true
    } else if (bx + r > 1) {
      bx = 1 - r
      vx = -Math.abs(vx)
      hitWall = true
    }

    if (by - r < 0) {
      by = r
      vy = Math.abs(vy)
      hitWall = true
    }

    if (hitWall) {
      const clampedVel = enforceMinVerticalAngle(vx, vy, speed)
      vx = clampedVel.vx
      vy = clampedVel.vy
      wallEventId++
    }

    // 2. Bottom miss — zero-stress gentle re-attach to paddle, zero penalty
    if (by - r > 1.02) {
      attached = true
      bx = paddleX
      by = perchedBallY(state.paddleY, state.paddleHeight, r)
      vx = 0
      vy = 0
      aimAngle = aimAngleForPaddle(paddleX)
      resetEventId++
      break
    }

    // 3. Paddle collision (only when travelling downward)
    if (vy > 0 && by + r >= paddleTop && by - r <= paddleBottom) {
      const closestX = clamp(bx, paddleLeft, paddleRight)
      const closestY = clamp(by, paddleTop, paddleBottom)
      const pdx = bx - closestX
      const pdy = by - closestY
      if (pdx * pdx + pdy * pdy <= r * r) {
        const hitOffset = clamp((bx - paddleX) / halfW, -1, 1)
        const angle = hitOffset * MAX_DEFLECTION_ANGLE_RAD
        const bounced = enforceMinVerticalAngle(Math.sin(angle) * speed, -Math.cos(angle) * speed, speed)
        vx = bounced.vx
        vy = bounced.vy
        by = paddleTop - r - 0.0005
        paddleEventId++
      }
    }

    // 4. Brick collision — destroy/damage at most ONE brick per substep
    const hit = findClosestBrickHit(bricks, bx, by, r)
    if (hit) {
      const brick = bricks[hit.index]!
      const preHitVx = vx
      const preHitVy = vy

      if (hit.distSq > 1e-10) {
        const ax = Math.abs(hit.dx)
        const ay = Math.abs(hit.dy)
        if (ax > ay + 1e-6) {
          vx = hit.dx >= 0 ? Math.abs(vx) : -Math.abs(vx)
          bx = hit.closestX + (hit.dx >= 0 ? r + 0.0002 : -(r + 0.0002))
        } else if (ay > ax + 1e-6) {
          vy = hit.dy >= 0 ? Math.abs(vy) : -Math.abs(vy)
          by = hit.closestY + (hit.dy >= 0 ? r + 0.0002 : -(r + 0.0002))
        } else {
          // Exact corner contact: reflect the opposing velocity component(s).
          if ((hit.dx > 0 && vx < 0) || (hit.dx < 0 && vx > 0)) vx = -vx
          if ((hit.dy > 0 && vy < 0) || (hit.dy < 0 && vy > 0)) vy = -vy
          const invLen = 1 / Math.sqrt(hit.distSq)
          bx = hit.closestX + hit.dx * invLen * (r + 0.0002)
          by = hit.closestY + hit.dy * invLen * (r + 0.0002)
        }
      } else {
        // Fallback when ball centre is inside brick bounds: push along shallowest axis.
        const overlapLeft = bx - brick.x
        const overlapRight = brick.x + brick.w - bx
        const overlapTop = by - brick.y
        const overlapBottom = brick.y + brick.h - by
        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom)
        if (minOverlap === overlapLeft) {
          bx = brick.x - r - 0.0002
          vx = -Math.abs(vx)
        } else if (minOverlap === overlapRight) {
          bx = brick.x + brick.w + r + 0.0002
          vx = Math.abs(vx)
        } else if (minOverlap === overlapTop) {
          by = brick.y - r - 0.0002
          vy = -Math.abs(vy)
        } else {
          by = brick.y + brick.h + r + 0.0002
          vy = Math.abs(vy)
        }
      }

      const deflected = enforceMinVerticalAngle(vx, vy, speed)
      vx = deflected.vx
      vy = deflected.vy

      if (!bricksCloned) {
        bricks = bricks.slice()
        bricksCloned = true
      }

      if (brick.hp > 1) {
        bricks[hit.index] = { ...brick, hp: 1, cracked: true }
        score += 5
        crackEventId++
        rings = [
          ...rings,
          {
            id: nextId++,
            x: brick.x + brick.w * 0.5,
            y: brick.y + brick.h * 0.5,
            color: brick.color,
            ageMs: 0,
            durationMs: RING_DURATION_MS * 0.72,
            startRadius: Math.min(brick.w, brick.h) * 0.35,
            maxRadius: Math.max(brick.w, brick.h) * 0.65,
          },
        ]
      } else {
        bricks.splice(hit.index, 1)
        bricksBroken++
        score += brick.cracked ? 15 : 10
        breakEventId++

        const activeRng = getRng()
        const debris = spawnBrickDebris(brick, preHitVx, preHitVy, activeRng, nextId)
        rngState = activeRng.state()
        nextId = debris.nextId
        shards = [...shards, ...debris.shards]
        rings = [...rings, debris.ring]

        if (bricks.length === 0) {
          solved = true
          boardsCleared++
          clearEventId++
          vx = 0
          vy = 0
          break
        }
      }
    }
  }

  // Update 6-dot trail cleanly when in flight
  let nextTrail: { x: number; y: number }[]
  if (attached || solved) {
    nextTrail = []
  } else {
    const prevTrail = state.ball.trail
    const lastPt = prevTrail[prevTrail.length - 1]
    if (!lastPt || Math.hypot(bx - lastPt.x, by - lastPt.y) >= 0.011) {
      nextTrail = [...prevTrail, { x: bx, y: by }].slice(-TRAIL_LENGTH)
    } else {
      nextTrail = prevTrail
    }
  }

  return {
    ...state,
    bricks,
    paddleX,
    paddleWidth: targetPaddleWidth,
    ball: {
      ...state.ball,
      x: bx,
      y: by,
      vx,
      vy,
      attached,
      aimAngle,
      trail: nextTrail,
    },
    shards,
    rings,
    score,
    bricksBroken,
    boardsCleared,
    solved,
    rngState,
    nextId,
    wallEventId,
    paddleEventId,
    crackEventId,
    breakEventId,
    clearEventId,
    resetEventId,
  }
}
