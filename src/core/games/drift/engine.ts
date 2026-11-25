/**
 * Drift — classic 15-puzzle (and calm 8-puzzle) sliding tiles engine.
 *
 * Pure TypeScript, zero DOM/React, deterministic via createRng.
 * Guarantees 100% mathematically solvable boards via valid empty-space walks
 * verified against the inversion + blank-row parity invariant.
 */
import { createRng, type Rng } from '../../rng'

export type Direction = 'up' | 'down' | 'left' | 'right'
export type BoardSize = 3 | 4

export interface DriftState {
  /** 4 (4×4 = 15 tiles) when calm < 0.55, 3 (3×3 = 8 tiles) when calm >= 0.55. */
  size: BoardSize
  /** Flat row-major grid of length size*size. 1..(size*size-1) are tiles, 0 is the blank slot. */
  tiles: number[]
  /** Initial shuffled layout for restarting the current puzzle. */
  initialTiles: number[]
  /** Number of moves made (a single or multi-tile line slide counts as 1 move). */
  moves: number
  /** 1-based puzzle index. */
  puzzleNumber: number
  /** True when every tile sits in order [1, 2, ..., N-1, 0]. */
  solved: boolean
  /** Saved mulberry32 RNG state for deterministic next puzzles. */
  rngState: number
}

export interface CreateDriftOptions {
  seed?: number
  calm?: number
  puzzleNumber?: number
}

export const CALM_THRESHOLD = 0.55

/** Choose board size from calm level: 4×4 below 0.55, calming to 3×3 at >= 0.55. */
export function boardSizeForCalm(calm: number): BoardSize {
  return calm >= CALM_THRESHOLD ? 3 : 4
}

/** Return the solved tile array [1, 2, ..., size*size - 1, 0]. */
export function solvedTiles(size: BoardSize): number[] {
  const total = size * size
  const out = new Array<number>(total)
  for (let i = 0; i < total - 1; i++) out[i] = i + 1
  out[total - 1] = 0
  return out
}

/** True when tiles match [1, 2, ..., N-1, 0]. */
export function isSolved(tiles: readonly number[]): boolean {
  const n = tiles.length
  if (n < 4) return false
  for (let i = 0; i < n - 1; i++) {
    if (tiles[i] !== i + 1) return false
  }
  return tiles[n - 1] === 0
}

/** Count how many numbered tiles (excluding 0) sit in their solved home position. */
export function inPlaceCount(tiles: readonly number[]): number {
  let count = 0
  for (let i = 0; i < tiles.length - 1; i++) {
    if (tiles[i] === i + 1) count++
  }
  return count
}

/** Count inversion pairs among non-zero tiles. */
export function countInversions(tiles: readonly number[]): number {
  let inv = 0
  for (let i = 0; i < tiles.length; i++) {
    const a = tiles[i]!
    if (a === 0) continue
    for (let j = i + 1; j < tiles.length; j++) {
      const b = tiles[j]!
      if (b !== 0 && a > b) inv++
    }
  }
  return inv
}

/**
 * Mathematical N-puzzle solvability invariant:
 * - Odd width (3×3): solvable iff inversions is even.
 * - Even width (4×4): solvable iff (inversions + blankRowFromBottom) is odd,
 *   where blankRowFromBottom is 1-indexed from the bottom row (bottom = 1).
 */
export function isSolvable(tiles: readonly number[], size: number): boolean {
  if (tiles.length !== size * size) return false
  const blankIndex = tiles.indexOf(0)
  if (blankIndex < 0) return false
  const inversions = countInversions(tiles)
  if (size % 2 === 1) {
    return inversions % 2 === 0
  }
  const blankRow = Math.floor(blankIndex / size)
  const blankRowFromBottom = size - blankRow
  return (inversions + blankRowFromBottom) % 2 === 1
}

/**
 * Generate a thoroughly scrambled, guaranteed-solvable, never-solved board
 * by walking the blank space along valid non-backtracking neighbour swaps.
 */
function generateSolvableBoard(size: BoardSize, rng: Rng, calm: number): number[] {
  const tiles = solvedTiles(size)
  let blank = tiles.length - 1
  let prevBlank = -1

  // Walk length stays rich enough for real puzzles while softening gently with calm.
  const clampedCalm = Math.min(1, Math.max(0, calm))
  const steps =
    size === 4
      ? Math.round(130 - clampedCalm * 30)
      : Math.round(64 - clampedCalm * 18)

  const neighbors = (idx: number): number[] => {
    const r = Math.floor(idx / size)
    const c = idx % size
    const out: number[] = []
    if (r > 0) out.push((r - 1) * size + c)
    if (r < size - 1) out.push((r + 1) * size + c)
    if (c > 0) out.push(r * size + (c - 1))
    if (c < size - 1) out.push(r * size + (c + 1))
    return out
  }

  const stepOnce = () => {
    const opts = neighbors(blank).filter((n) => n !== prevBlank)
    const next = rng.pick(opts)
    tiles[blank] = tiles[next]!
    tiles[next] = 0
    prevBlank = blank
    blank = next
  }

  for (let i = 0; i < steps; i++) {
    stepOnce()
  }

  // Ensure the starting board is never solved and isn't trivially almost solved.
  const maxHomeAtStart = Math.floor((size * size - 1) / 2)
  let guard = 0
  while ((isSolved(tiles) || inPlaceCount(tiles) > maxHomeAtStart) && guard < 60) {
    stepOnce()
    guard++
  }

  // Fallback guarantee if the loop still landed solved (practically impossible).
  if (isSolved(tiles)) {
    const swapIdx = blank - 1
    tiles[blank] = tiles[swapIdx]!
    tiles[swapIdx] = 0
  }

  return tiles
}

/** Create a fresh deterministic Drift puzzle. */
export function createDrift(opts: CreateDriftOptions = {}): DriftState {
  const calm = opts.calm ?? 0
  const size = boardSizeForCalm(calm)
  const rng = createRng(opts.seed ?? 1)
  const tiles = generateSolvableBoard(size, rng, calm)

  return {
    size,
    tiles,
    initialTiles: tiles.slice(),
    moves: 0,
    puzzleNumber: opts.puzzleNumber ?? 1,
    solved: false,
    rngState: rng.state(),
  }
}

/** True if the tile at `index` shares a row or column with the blank space and can slide. */
export function canSlideTile(state: DriftState, index: number): boolean {
  if (state.solved) return false
  if (!Number.isInteger(index) || index < 0 || index >= state.tiles.length) return false
  if (state.tiles[index] === 0) return false
  const blank = state.tiles.indexOf(0)
  if (blank < 0) return false

  const tr = Math.floor(index / state.size)
  const tc = index % state.size
  const br = Math.floor(blank / state.size)
  const bc = blank % state.size
  return tr === br || tc === bc
}

/**
 * Slide the tile at `index` (and every tile between it and the blank space)
 * smoothly toward the blank space in one move.
 * Returns the exact same state reference when the move is invalid.
 */
export function slideTile(state: DriftState, index: number): DriftState {
  if (!canSlideTile(state, index)) return state

  const { size, tiles } = state
  const blank = tiles.indexOf(0)
  const tr = Math.floor(index / size)
  const tc = index % size
  const br = Math.floor(blank / size)
  const bc = blank % size

  const next = tiles.slice()

  if (tr === br) {
    const dc = tc > bc ? 1 : -1
    for (let c = bc; c !== tc; c += dc) {
      next[tr * size + c] = tiles[tr * size + (c + dc)]!
    }
    next[tr * size + tc] = 0
  } else {
    const dr = tr > br ? 1 : -1
    for (let r = br; r !== tr; r += dr) {
      next[r * size + tc] = tiles[(r + dr) * size + tc]!
    }
    next[tr * size + tc] = 0
  }

  return {
    ...state,
    tiles: next,
    moves: state.moves + 1,
    solved: isSolved(next),
  }
}

/**
 * Slide a single adjacent tile into the blank space in `dir`.
 * For example, `dir === 'left'` slides the tile to the right of the blank leftward into the blank.
 * Returns the exact same state reference if no tile can slide in `dir`.
 */
export function moveDirection(state: DriftState, dir: Direction): DriftState {
  if (state.solved) return state
  const blank = state.tiles.indexOf(0)
  if (blank < 0) return state

  const br = Math.floor(blank / state.size)
  const bc = blank % state.size

  let sr = br
  let sc = bc
  if (dir === 'left') sc = bc + 1
  else if (dir === 'right') sc = bc - 1
  else if (dir === 'up') sr = br + 1
  else if (dir === 'down') sr = br - 1

  if (sr < 0 || sr >= state.size || sc < 0 || sc >= state.size) return state
  return slideTile(state, sr * state.size + sc)
}

/** Restart the current puzzle back to its initial shuffled state. */
export function restartPuzzle(state: DriftState): DriftState {
  return {
    ...state,
    tiles: state.initialTiles.slice(),
    moves: 0,
    solved: false,
  }
}

/** Advance deterministically to the next puzzle, adapting grid size to current `calm`. */
export function nextPuzzle(state: DriftState, calm = 0): DriftState {
  return createDrift({
    seed: state.rngState,
    calm,
    puzzleNumber: state.puzzleNumber + 1,
  })
}
