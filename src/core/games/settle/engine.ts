/**
 * Settle — pure deterministic Tetris engine for Lull.
 *
 * Zero DOM, zero React, zero Math.random. Ports to React Native unchanged.
 *
 * Sleep-friendly rules:
 * - Speed NEVER increases with lines cleared.
 * - Gravity slows gently as `calm` (0..1) rises during wind-down.
 * - In Endless, if a newly spawned piece collides with the stack, the
 *   bottom 4 rows dissolve into embers so play continues seamlessly.
 */
import { createRng } from '../../rng'

export const BOARD_COLS = 10
export const BOARD_ROWS = 20

/** Base gravity at calm = 0 (ms per row). */
export const BASE_GRAVITY_MS = 850
/** Slowest gravity at calm = 1 (ms per row). */
export const MAX_CALM_GRAVITY_MS = 1450

/** Lock delay once a piece rests on a surface (ms). */
export const LOCK_DELAY_MS = 450
/** Cap on move/rotate lock resets so pieces still settle naturally. */
export const MAX_LOCK_RESETS = 12

/** Brief candlelight bloom before cleared rows collapse (ms). */
export const CLEAR_DURATION_MS = 260
/** Number of bottom rows dissolved when the stack reaches the top. */
export const DISSOLVE_ROWS = 4
/** Duration of the serene ember-dissolve visual notice (ms). */
export const DISSOLVE_DURATION_MS = 1600

export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
export type Rotation = 0 | 1 | 2 | 3

/** Matches Lull's 7 Ember piece colour tokens (`src/design/tokens.ts`). */
export type PieceColor = 'ember' | 'saffron' | 'honey' | 'moss' | 'clay' | 'rose' | 'sand'

export type Cell = PieceColor | null

export const TETROMINO_TYPES: readonly TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

export const PIECE_COLORS: Record<TetrominoType, PieceColor> = {
  I: 'sand',
  O: 'honey',
  T: 'rose',
  S: 'moss',
  Z: 'ember',
  J: 'clay',
  L: 'saffron',
}

type Offset = readonly [number, number]

/**
 * Standard SRS rotation states as `[col, row]` offsets (+x right, +y down).
 * Verified 90° CW rotations around each piece's SRS pivot.
 */
const SHAPES: Record<TetrominoType, readonly (readonly Offset[])[]> = {
  I: [
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
    [
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
    ],
    [
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
    ],
  ],
  O: [
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
  ],
  T: [
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  ],
  S: [
    [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
    ],
    [
      [1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  ],
  Z: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
    [
      [2, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ],
  ],
  J: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [2, 0],
      [1, 1],
      [1, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [2, 2],
    ],
    [
      [1, 0],
      [1, 1],
      [0, 2],
      [1, 2],
    ],
  ],
  L: [
    [
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  ],
}

/**
 * Standard SRS wall-kick offsets (`[dx, dy]` with +y down).
 * Keyed by `${from}>${to}`.
 */
const JLSTZ_KICKS: Record<string, readonly Offset[]> = {
  '0>1': [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  '1>0': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
  '1>2': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
  '2>1': [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  '2>3': [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  '3>2': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  '3>0': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  '0>3': [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
}

const I_KICKS: Record<string, readonly Offset[]> = {
  '0>1': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, 1],
    [1, -2],
  ],
  '1>0': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, -1],
    [-1, 2],
  ],
  '1>2': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, -2],
    [2, 1],
  ],
  '2>1': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, 2],
    [-2, -1],
  ],
  '2>3': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, -1],
    [-1, 2],
  ],
  '3>2': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, 1],
    [1, -2],
  ],
  '3>0': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, 2],
    [-2, -1],
  ],
  '0>3': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, -2],
    [2, 1],
  ],
}

export interface ActivePiece {
  type: TetrominoType
  x: number
  y: number
  rotation: Rotation
}

export interface DissolveEvent {
  /** Monotonic dissolve counter for animation keys. */
  id: number
  /** Snapshot of the dissolved bottom rows (top to bottom). */
  rows: Cell[][]
  /** Remaining duration (ms) for the ember-dissolve visual glow & notice. */
  remainingMs: number
}

export type SettleMode = 'endless' | 'classic'

export interface SettleState {
  mode: SettleMode
  gameOver: boolean
  board: Cell[][]
  active: ActivePiece | null
  hold: TetrominoType | null
  canHold: boolean
  /** Upcoming pieces; always kept at length >= 7 so at least 3+ are visible. */
  queue: TetrominoType[]
  rngState: number
  lines: number
  pieces: number
  gravityTimerMs: number
  lockTimerMs: number
  lockResets: number
  /** Lowest row `y` reached by the current active piece (for fair lock resets). */
  lowestY: number
  /** Row indices currently in the ~260ms candlelight bloom before collapse. */
  clearingRows: number[]
  clearTimerMs: number
  /** Increments when a lock creates full rows (for sound/haptic triggers). */
  clearEventId: number
  /** Number of rows cleared in the most recent clear event (1..4). */
  lastClearCount: number
  /** Total times the stack topped out and dissolved bottom rows. */
  dissolveCount: number
  /** Active ember-dissolve glow snapshot while fading out, or null. */
  dissolving: DissolveEvent | null
}

export type SettleAction =
  | { type: 'moveLeft' }
  | { type: 'moveRight' }
  | { type: 'softDrop' }
  | { type: 'hardDrop' }
  | { type: 'rotateCW' }
  | { type: 'rotateCCW' }
  | { type: 'hold' }
  | { type: 'restart'; seed: number }

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function createEmptyBoard(): Cell[][] {
  return Array.from({ length: BOARD_ROWS }, () => Array<Cell>(BOARD_COLS).fill(null))
}

export function getShapeCells(type: TetrominoType, rotation: Rotation = 0): readonly Offset[] {
  return SHAPES[type][rotation]
}

export function getPieceCells(piece: ActivePiece): [number, number][] {
  return SHAPES[piece.type][piece.rotation].map(([dx, dy]) => [piece.x + dx, piece.y + dy])
}

/**
 * Row-drop interval in ms. Never speeds up with lines cleared; slows smoothly
 * as `calm` rises from 0 to 1 during a wind-down session.
 */
export function gravityIntervalMs(calm: number): number {
  const c = Math.max(0, Math.min(1, calm))
  return Math.round(BASE_GRAVITY_MS + c * (MAX_CALM_GRAVITY_MS - BASE_GRAVITY_MS))
}

export function canPlace(board: readonly (readonly Cell[])[], type: TetrominoType, x: number, y: number, rotation: Rotation): boolean {
  for (const [dx, dy] of SHAPES[type][rotation]) {
    const cx = x + dx
    const cy = y + dy
    if (cx < 0 || cx >= BOARD_COLS || cy >= BOARD_ROWS) return false
    if (cy >= 0 && board[cy]![cx] !== null) return false
  }
  return true
}

/** Returns the resting Y coordinate for the ghost piece, or null if no piece is active. */
export function getGhostY(state: SettleState): number | null {
  if (!state.active) return null
  const { type, x, rotation } = state.active
  let y = state.active.y
  while (canPlace(state.board, type, x, y + 1, rotation)) {
    y += 1
  }
  return y
}

function spawnPosition(type: TetrominoType): { x: number; y: number } {
  if (type === 'I') return { x: 3, y: -1 }
  if (type === 'O') return { x: 4, y: 0 }
  return { x: 3, y: 0 }
}

function refillQueue(queue: readonly TetrominoType[], rngState: number, minLen = 7): { queue: TetrominoType[]; rngState: number } {
  const nextQueue = queue.slice()
  const rng = createRng(rngState)
  while (nextQueue.length < minLen) {
    nextQueue.push(...rng.shuffle(TETROMINO_TYPES))
  }
  return { queue: nextQueue, rngState: rng.state() }
}

function cloneBoard(board: readonly (readonly Cell[])[]): Cell[][] {
  return board.map((row) => row.slice())
}

function dissolveBottomRows(board: Cell[][]): { board: Cell[][]; dissolved: Cell[][] } {
  const keepCount = Math.max(0, BOARD_ROWS - DISSOLVE_ROWS)
  const dissolved = board.slice(keepCount).map((row) => row.slice())
  const freshTop = Array.from({ length: DISSOLVE_ROWS }, () => Array<Cell>(BOARD_COLS).fill(null))
  const shifted = board.slice(0, keepCount).map((row) => row.slice())
  return { board: [...freshTop, ...shifted], dissolved }
}

function spawnPiece(
  board: Cell[][],
  type: TetrominoType,
  dissolveCount: number,
  dissolving: DissolveEvent | null,
  mode: SettleMode,
): { board: Cell[][]; active: ActivePiece | null; dissolveCount: number; dissolving: DissolveEvent | null } {
  const pos = spawnPosition(type)
  let nextBoard = board
  let nextDissolveCount = dissolveCount
  let nextDissolving = dissolving

  if (!canPlace(nextBoard, type, pos.x, pos.y, 0)) {
    if (mode === 'classic') return { board, active: null, dissolveCount, dissolving }

    // Sleep-friendly top-out: dissolve bottom 4 rows into embers so play continues.
    let latestDissolved: Cell[][] = []
    let safety = 0
    while (!canPlace(nextBoard, type, pos.x, pos.y, 0) && safety < 5) {
      const res = dissolveBottomRows(nextBoard)
      nextBoard = res.board
      latestDissolved = res.dissolved
      safety += 1
    }
    nextDissolveCount += 1
    nextDissolving = {
      id: nextDissolveCount,
      rows: latestDissolved,
      remainingMs: DISSOLVE_DURATION_MS,
    }
  }

  return {
    board: nextBoard,
    active: { type, x: pos.x, y: pos.y, rotation: 0 },
    dissolveCount: nextDissolveCount,
    dissolving: nextDissolving,
  }
}

function spawnNextFromQueue(state: SettleState, board: Cell[][]): SettleState {
  const [nextType, ...rest] = state.queue
  const refilled = refillQueue(rest, state.rngState)
  const spawned = spawnPiece(board, nextType!, state.dissolveCount, state.dissolving, state.mode)
  return {
    ...state,
    board: spawned.board,
    active: spawned.active,
    gameOver: spawned.active === null,
    canHold: spawned.active !== null,
    queue: refilled.queue,
    rngState: refilled.rngState,
    gravityTimerMs: 0,
    lockTimerMs: 0,
    lockResets: 0,
    lowestY: spawned.active?.y ?? 0,
    dissolveCount: spawned.dissolveCount,
    dissolving: spawned.dissolving,
  }
}

function lockActivePiece(state: SettleState): SettleState {
  if (!state.active) return state
  const board = cloneBoard(state.board)
  const color = PIECE_COLORS[state.active.type]
  for (const [cx, cy] of getPieceCells(state.active)) {
    if (cy >= 0 && cy < BOARD_ROWS && cx >= 0 && cx < BOARD_COLS) {
      board[cy]![cx] = color
    }
  }

  const fullRows: number[] = []
  for (let r = 0; r < BOARD_ROWS; r++) {
    if (board[r]!.every((cell) => cell !== null)) {
      fullRows.push(r)
    }
  }

  const nextPieces = state.pieces + 1

  if (fullRows.length > 0) {
    return {
      ...state,
      board,
      active: null,
      pieces: nextPieces,
      gravityTimerMs: 0,
      lockTimerMs: 0,
      lockResets: 0,
      clearingRows: fullRows,
      clearTimerMs: CLEAR_DURATION_MS,
      clearEventId: state.clearEventId + 1,
      lastClearCount: fullRows.length,
    }
  }

  return spawnNextFromQueue({ ...state, pieces: nextPieces }, board)
}

function collapseClearingRows(state: SettleState): SettleState {
  if (state.clearingRows.length === 0) return state
  const clearSet = new Set(state.clearingRows)
  const kept = state.board.filter((_, idx) => !clearSet.has(idx)).map((row) => row.slice())
  const clearedCount = state.clearingRows.length
  const freshTop = Array.from({ length: clearedCount }, () => Array<Cell>(BOARD_COLS).fill(null))
  const nextBoard = [...freshTop, ...kept]

  return spawnNextFromQueue(
    {
      ...state,
      lines: state.lines + clearedCount,
      clearingRows: [],
      clearTimerMs: 0,
    },
    nextBoard,
  )
}

function applyMoveReset(state: SettleState, nextActive: ActivePiece): SettleState {
  const resetLock = state.lockTimerMs > 0 && state.lockResets < MAX_LOCK_RESETS
  return {
    ...state,
    active: nextActive,
    lockTimerMs: resetLock ? 0 : state.lockTimerMs,
    lockResets: resetLock ? state.lockResets + 1 : state.lockResets,
  }
}

/* -------------------------------------------------------------------------- */
/* Public Engine API                                                          */
/* -------------------------------------------------------------------------- */

export function createSettle(opts: { seed: number; calm?: number; mode?: SettleMode }): SettleState {
  const initial = refillQueue([], opts.seed >>> 0, 14)
  const [first, ...rest] = initial.queue
  const refilled = refillQueue(rest, initial.rngState)
  const board = createEmptyBoard()
  const pos = spawnPosition(first!)
  return {
    board,
    mode: opts.mode ?? 'endless',
    gameOver: false,
    active: { type: first!, x: pos.x, y: pos.y, rotation: 0 },
    hold: null,
    canHold: true,
    queue: refilled.queue,
    rngState: refilled.rngState,
    lines: 0,
    pieces: 0,
    gravityTimerMs: 0,
    lockTimerMs: 0,
    lockResets: 0,
    lowestY: pos.y,
    clearingRows: [],
    clearTimerMs: 0,
    clearEventId: 0,
    lastClearCount: 0,
    dissolveCount: 0,
    dissolving: null,
  }
}

export function moveLeft(state: SettleState): SettleState {
  if (!state.active) return state
  const { type, x, y, rotation } = state.active
  if (!canPlace(state.board, type, x - 1, y, rotation)) return state
  return applyMoveReset(state, { type, x: x - 1, y, rotation })
}

export function moveRight(state: SettleState): SettleState {
  if (!state.active) return state
  const { type, x, y, rotation } = state.active
  if (!canPlace(state.board, type, x + 1, y, rotation)) return state
  return applyMoveReset(state, { type, x: x + 1, y, rotation })
}

export function softDrop(state: SettleState): SettleState {
  if (!state.active) return state
  const { type, x, y, rotation } = state.active
  if (!canPlace(state.board, type, x, y + 1, rotation)) return state
  const nextY = y + 1
  const reachedLower = nextY > state.lowestY
  return {
    ...state,
    active: { type, x, y: nextY, rotation },
    gravityTimerMs: 0,
    lockTimerMs: 0,
    lockResets: reachedLower ? 0 : state.lockResets,
    lowestY: reachedLower ? nextY : state.lowestY,
  }
}

export function hardDrop(state: SettleState): SettleState {
  if (!state.active) return state
  const ghostY = getGhostY(state)
  if (ghostY === null) return state
  return lockActivePiece({
    ...state,
    active: { ...state.active, y: ghostY },
  })
}

function rotate(state: SettleState, delta: 1 | -1): SettleState {
  if (!state.active) return state
  const { type, x, y, rotation } = state.active
  const nextRot = (((rotation + delta) % 4 + 4) % 4) as Rotation
  if (type === 'O') {
    return applyMoveReset(state, { type, x, y, rotation: nextRot })
  }
  const key = `${rotation}>${nextRot}`
  const kicks = type === 'I' ? I_KICKS[key] : JLSTZ_KICKS[key]
  if (!kicks) return state

  for (const [kx, ky] of kicks) {
    if (canPlace(state.board, type, x + kx, y + ky, nextRot)) {
      return applyMoveReset(state, { type, x: x + kx, y: y + ky, rotation: nextRot })
    }
  }
  return state
}

export function rotateCW(state: SettleState): SettleState {
  return rotate(state, 1)
}

export function rotateCCW(state: SettleState): SettleState {
  return rotate(state, -1)
}

export function hold(state: SettleState): SettleState {
  if (!state.active || !state.canHold) return state
  const heldType = state.active.type
  let nextType: TetrominoType
  let nextQueue = state.queue
  let nextRng = state.rngState

  if (state.hold !== null) {
    nextType = state.hold
  } else {
    const [drawn, ...rest] = state.queue
    const refilled = refillQueue(rest, state.rngState)
    nextType = drawn!
    nextQueue = refilled.queue
    nextRng = refilled.rngState
  }

  const spawned = spawnPiece(cloneBoard(state.board), nextType, state.dissolveCount, state.dissolving, state.mode)
  return {
    ...state,
    board: spawned.board,
    active: spawned.active,
    gameOver: spawned.active === null,
    hold: heldType,
    canHold: false,
    queue: nextQueue,
    rngState: nextRng,
    gravityTimerMs: 0,
    lockTimerMs: 0,
    lockResets: 0,
    lowestY: spawned.active?.y ?? 0,
    dissolveCount: spawned.dissolveCount,
    dissolving: spawned.dissolving,
  }
}

export function restart(state: SettleState, seed: number): SettleState {
  return createSettle({ seed, mode: state.mode })
}

export function settleReducer(state: SettleState, action: SettleAction): SettleState {
  switch (action.type) {
    case 'moveLeft':
      return moveLeft(state)
    case 'moveRight':
      return moveRight(state)
    case 'softDrop':
      return softDrop(state)
    case 'hardDrop':
      return hardDrop(state)
    case 'rotateCW':
      return rotateCW(state)
    case 'rotateCCW':
      return rotateCCW(state)
    case 'hold':
      return hold(state)
    case 'restart':
      return restart(state, action.seed)
  }
}

/**
 * Advances gravity, lock delay, line-clear bloom, and dissolve fade by `dtMs`.
 * Pure & deterministic — time comes in as an argument.
 */
export function tickSettle(state: SettleState, dtMs: number, calm: number): SettleState {
  if (state.gameOver || dtMs <= 0) return state

  let next = state

  // 1. Advance active dissolve notice/glow fade
  if (next.dissolving) {
    const remainingMs = next.dissolving.remainingMs - dtMs
    next = {
      ...next,
      dissolving: remainingMs > 0 ? { ...next.dissolving, remainingMs } : null,
    }
  }

  // 2. Advance brief line-clear bloom before rows collapse
  if (next.clearingRows.length > 0) {
    const remaining = next.clearTimerMs - dtMs
    if (remaining > 0) {
      return { ...next, clearTimerMs: remaining }
    }
    return collapseClearingRows(next)
  }

  if (!next.active) return next

  const interval = gravityIntervalMs(calm)
  const { type, x, y, rotation } = next.active
  const grounded = !canPlace(next.board, type, x, y + 1, rotation)

  // 3. Grounded -> count lock delay
  if (grounded) {
    const lockTimerMs = next.lockTimerMs + dtMs
    if (lockTimerMs >= LOCK_DELAY_MS) {
      return lockActivePiece(next)
    }
    return {
      ...next,
      gravityTimerMs: 0,
      lockTimerMs,
    }
  }

  // 4. Airborne -> apply calm gravity (step down as many rows as elapsed)
  let gravityTimerMs = next.gravityTimerMs + dtMs
  let curY = y
  let lowestY = next.lowestY
  let lockResets = next.lockResets

  while (gravityTimerMs >= interval && canPlace(next.board, type, x, curY + 1, rotation)) {
    gravityTimerMs -= interval
    curY += 1
    if (curY > lowestY) {
      lowestY = curY
      lockResets = 0
    }
  }

  // If the piece just touched down during this tick, start counting lock delay gently next tick.
  const nowGrounded = !canPlace(next.board, type, x, curY + 1, rotation)
  return {
    ...next,
    // Keep the same object while the piece hasn't moved so screens can skip re-rendering.
    active: curY === y ? next.active : { type, x, y: curY, rotation },
    gravityTimerMs: nowGrounded ? 0 : gravityTimerMs,
    lockTimerMs: 0,
    lockResets,
    lowestY,
  }
}
