/**
 * Thread — classic Connect the Dots / Flow Free engine for Inverna.
 *
 * Pure TypeScript: zero DOM, zero React, zero Math.random. Plain serialisable
 * JSON state in, plain state out. Ports to React Native / Expo unchanged.
 *
 * Calm progression:
 * - calm < 0.35: engaging 7×7 and 6×6 boards (5–7 pairs)
 * - 0.35 <= calm < 0.65: moderate 6×6 boards (5–6 pairs)
 * - calm >= 0.65: gentle 5×5 boards (4–5 pairs)
 */
import { createRng } from '../../rng'

/** Matches Inverna's 7 Ember piece colour tokens (`src/design/tokens.ts`). */
export type PieceColor = 'ember' | 'saffron' | 'honey' | 'moss' | 'clay' | 'rose' | 'sand'

export const PIECE_COLORS: readonly PieceColor[] = [
  'ember',
  'saffron',
  'honey',
  'moss',
  'clay',
  'rose',
  'sand',
] as const

export interface Cell {
  row: number
  col: number
}

export interface ThreadPair {
  color: PieceColor
  a: Cell
  b: Cell
}

export interface ThreadPuzzlePair extends ThreadPair {
  /** Verified orthogonal path from `a` to `b` (inclusive). */
  solution: readonly Cell[]
}

export type BoardSize = 5 | 6 | 7

export interface ThreadPuzzle {
  id: string
  size: BoardSize
  pairs: readonly ThreadPuzzlePair[]
}

export type PathMap = Partial<Record<PieceColor, Cell[]>>

export interface ThreadState {
  /** 1-based puzzle counter. */
  puzzleNumber: number
  /** Canonical puzzle id from PUZZLES. */
  puzzleId: string
  /** Grid dimension (size × size). */
  size: BoardSize
  /** Endpoint pairs on this board (after any symmetry transform). */
  pairs: ThreadPair[]
  /** Drawn orthogonal paths per colour. */
  paths: PathMap
  /** Colour currently being dragged, or null when idle. */
  activeColor: PieceColor | null
  /** Pre-stroke paths snapshot used to push onto history when a stroke finishes. */
  strokeSnapshot: PathMap | null
  /** Undo stack of previous path maps (capped at MAX_HISTORY). */
  history: PathMap[]
  /** Count of completed strokes that changed the board. */
  moves: number
  /** True when every pair is connected AND 100% of grid cells are filled. */
  solved: boolean
  /** Calm snapshot (0..1) used when building this puzzle. */
  calm: number
  /** Recently played puzzle IDs to avoid immediate repeats. */
  playedIds: string[]
  /** Mulberry32 internal state for deterministic subsequent puzzles. */
  rngState: number
}

export type ThreadAction =
  | { type: 'start'; cell: Cell }
  | { type: 'extend'; cell: Cell }
  | { type: 'end' }
  | { type: 'cancel' }
  | { type: 'undo' }
  | { type: 'clear' }
  | { type: 'next'; calm: number }

export interface CreateThreadOptions {
  seed?: number
  calm?: number
  puzzleNumber?: number
  puzzleId?: string
}

const MAX_HISTORY = 60

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/* -------------------------------------------------------------------------- */
/*  Curated 100%-grid-filling puzzle library (21 puzzles: 7 each of 5/6/7)    */
/* -------------------------------------------------------------------------- */

type Coord = readonly [number, number]

function definePuzzle(
  id: string,
  size: BoardSize,
  specs: readonly (readonly [PieceColor, readonly Coord[]])[],
): ThreadPuzzle {
  const pairs: ThreadPuzzlePair[] = specs.map(([color, coords]) => {
    const solution: Cell[] = coords.map(([row, col]) => ({ row, col }))
    return {
      color,
      a: solution[0]!,
      b: solution[solution.length - 1]!,
      solution,
    }
  })
  return { id, size, pairs }
}

/**
 * 21 curated Flow Free puzzles (7 × 5×5, 7 × 6×6, 7 × 7×7).
 * Every puzzle has verified, non-overlapping orthogonal solution paths that
 * cover 100% of the board with no trivially adjacent endpoints and no 2×2
 * self-touching blocks.
 */
export const PUZZLES: readonly ThreadPuzzle[] = [
  /* --- 5×5 gentle puzzles (4–5 pairs, 25 cells) --------------------------- */
  definePuzzle('5x5-1', 5, [
    ['ember', [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3]]],
    ['saffron', [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3]]],
    ['honey', [[1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2]]],
    ['moss', [[1, 2], [1, 1], [2, 1], [3, 1]]],
    ['rose', [[2, 2], [3, 2], [3, 3]]],
  ]),
  definePuzzle('5x5-2', 5, [
    ['ember', [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 1]]],
    ['saffron', [[1, 1], [0, 1], [0, 2], [0, 3], [1, 3]]],
    ['honey', [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3]]],
    ['moss', [[1, 2], [2, 2], [2, 1], [3, 1]]],
    ['clay', [[2, 3], [3, 3], [3, 2], [4, 2]]],
  ]),
  definePuzzle('5x5-3', 5, [
    ['ember', [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3]]],
    ['honey', [[0, 4], [1, 4], [2, 4], [3, 4], [3, 3], [3, 2]]],
    ['moss', [[1, 1], [1, 0], [2, 0], [3, 0], [4, 0]]],
    ['sand', [[1, 2], [2, 2], [2, 1], [3, 1], [4, 1], [4, 2], [4, 3], [4, 4]]],
  ]),
  definePuzzle('5x5-4', 5, [
    ['saffron', [[0, 0], [0, 1], [1, 1], [2, 1]]],
    ['ember', [[1, 2], [0, 2], [0, 3], [0, 4], [1, 4], [2, 4], [3, 4]]],
    ['rose', [[1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2]]],
    ['moss', [[1, 3], [2, 3], [3, 3], [4, 3], [4, 4]]],
    ['sand', [[2, 2], [3, 2], [3, 1]]],
  ]),
  definePuzzle('5x5-5', 5, [
    ['clay', [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]]],
    ['saffron', [[0, 1], [0, 2], [0, 3], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3]]],
    ['honey', [[1, 3], [2, 3], [3, 3], [3, 2], [3, 1]]],
    ['ember', [[2, 1], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2]]],
  ]),
  definePuzzle('5x5-6', 5, [
    ['moss', [[0, 0], [0, 1], [0, 2], [1, 2], [1, 3], [2, 3]]],
    ['ember', [[0, 3], [0, 4], [1, 4], [2, 4], [3, 4], [3, 3]]],
    ['honey', [[2, 2], [3, 2], [4, 2], [4, 3], [4, 4]]],
    ['rose', [[1, 0], [2, 0], [3, 0], [4, 0], [4, 1]]],
    ['sand', [[1, 1], [2, 1], [3, 1]]],
  ]),
  definePuzzle('5x5-7', 5, [
    ['ember', [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1]]],
    ['honey', [[0, 1], [0, 2], [1, 2], [2, 2]]],
    ['clay', [[0, 3], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3]]],
    ['moss', [[1, 3], [2, 3], [3, 3], [3, 2]]],
    ['saffron', [[2, 0], [3, 0], [4, 0], [4, 1], [4, 2]]],
  ]),

  /* --- 6×6 moderate puzzles (5–6 pairs, 36 cells) ------------------------- */
  definePuzzle('6x6-1', 6, [
    ['ember', [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [2, 2]]],
    ['saffron', [[0, 5], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3]]],
    ['honey', [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1]]],
    ['moss', [[1, 2], [1, 1], [2, 1], [3, 1], [4, 1]]],
    ['rose', [[3, 3], [3, 2], [4, 2], [5, 2], [5, 3], [5, 4], [5, 5], [4, 5], [3, 5], [2, 5], [1, 5]]],
  ]),
  definePuzzle('6x6-2', 6, [
    ['ember', [[0, 0], [0, 1], [0, 2], [1, 2], [1, 3], [2, 3]]],
    ['saffron', [[0, 3], [0, 4], [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [4, 4]]],
    ['honey', [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1], [5, 2]]],
    ['moss', [[1, 1], [2, 1], [3, 1], [4, 1]]],
    ['clay', [[1, 4], [2, 4], [3, 4], [3, 3]]],
    ['sand', [[2, 2], [3, 2], [4, 2], [4, 3], [5, 3], [5, 4], [5, 5]]],
  ]),
  definePuzzle('6x6-3', 6, [
    ['rose', [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1]]],
    ['saffron', [[0, 1], [0, 2], [0, 3], [1, 3], [2, 3]]],
    ['ember', [[0, 4], [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [4, 4]]],
    ['moss', [[1, 2], [2, 2], [3, 2], [4, 2], [4, 1]]],
    ['honey', [[1, 4], [2, 4], [3, 4], [3, 3], [4, 3], [5, 3], [5, 4], [5, 5]]],
    ['clay', [[2, 0], [3, 0], [4, 0], [5, 0], [5, 1], [5, 2]]],
  ]),
  definePuzzle('6x6-4', 6, [
    ['ember', [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2]]],
    ['saffron', [[2, 3], [1, 3], [0, 3], [0, 4], [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [4, 4]]],
    ['honey', [[1, 1], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1]]],
    ['moss', [[1, 4], [2, 4], [3, 4], [3, 3], [4, 3], [5, 3], [5, 4], [5, 5]]],
    ['rose', [[2, 1], [3, 1], [4, 1], [4, 2], [5, 2]]],
  ]),
  definePuzzle('6x6-5', 6, [
    ['ember', [[2, 0], [1, 0], [0, 0], [0, 1]]],
    ['honey', [[0, 2], [0, 3], [1, 3], [2, 3], [2, 2]]],
    ['moss', [[0, 5], [0, 4], [1, 4], [2, 4], [3, 4], [3, 3], [3, 2]]],
    ['clay', [[1, 2], [1, 1], [2, 1], [3, 1], [4, 1], [4, 2], [4, 3], [4, 4]]],
    ['sand', [[3, 0], [4, 0], [5, 0], [5, 1], [5, 2], [5, 3]]],
    ['rose', [[1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [5, 4]]],
  ]),
  definePuzzle('6x6-6', 6, [
    ['saffron', [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [1, 4], [2, 4], [3, 4]]],
    ['ember', [[0, 4], [0, 5], [1, 5], [2, 5], [3, 5], [4, 5]]],
    ['rose', [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1]]],
    ['moss', [[1, 2], [1, 1], [2, 1], [3, 1], [4, 1]]],
    ['honey', [[2, 3], [2, 2], [3, 2], [4, 2], [5, 2], [5, 3]]],
    ['sand', [[3, 3], [4, 3], [4, 4], [5, 4], [5, 5]]],
  ]),
  definePuzzle('6x6-7', 6, [
    ['honey', [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3]]],
    ['clay', [[0, 5], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4]]],
    ['ember', [[1, 1], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1], [5, 2]]],
    ['moss', [[1, 2], [2, 2], [2, 1], [3, 1], [4, 1]]],
    ['saffron', [[3, 2], [4, 2], [4, 3], [5, 3], [5, 4], [5, 5], [4, 5], [3, 5], [2, 5], [1, 5]]],
  ]),

  /* --- 7×7 engaging puzzles (5–7 pairs, 49 cells) ------------------------- */
  definePuzzle('7x7-1', 7, [
    ['ember', [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3]]],
    ['saffron', [[4, 4], [3, 4], [2, 4], [1, 4], [0, 4], [0, 5], [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6]]],
    ['honey', [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [6, 1], [6, 2]]],
    ['moss', [[1, 2], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [5, 2]]],
    ['clay', [[1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [5, 4]]],
    ['rose', [[2, 2], [3, 2], [4, 2], [4, 3], [5, 3], [6, 3], [6, 4], [6, 5], [6, 6]]],
  ]),
  definePuzzle('7x7-2', 7, [
    ['ember', [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]]],
    ['saffron', [[0, 4], [0, 3], [1, 3], [2, 3], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [6, 5], [6, 6]]],
    ['honey', [[0, 5], [0, 6], [1, 6], [2, 6], [3, 6], [4, 6]]],
    ['moss', [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1], [5, 2]]],
    ['clay', [[1, 1], [2, 1], [3, 1], [4, 1], [4, 2]]],
    ['rose', [[1, 4], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [5, 6]]],
    ['sand', [[3, 2], [3, 3], [4, 3], [5, 3], [6, 3], [6, 2], [6, 1], [6, 0]]],
  ]),
  definePuzzle('7x7-3', 7, [
    ['ember', [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1]]],
    ['honey', [[0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [6, 3]]],
    ['moss', [[0, 4], [0, 5], [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6]]],
    ['saffron', [[1, 2], [2, 2], [3, 2], [4, 2], [4, 1]]],
    ['rose', [[1, 4], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [6, 6]]],
    ['clay', [[2, 0], [3, 0], [4, 0], [5, 0], [5, 1]]],
    ['sand', [[3, 3], [4, 3], [5, 3], [5, 2], [6, 2], [6, 1], [6, 0]]],
  ]),
  definePuzzle('7x7-4', 7, [
    ['ember', [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 4], [1, 5], [2, 5], [3, 5], [4, 5], [4, 4]]],
    ['saffron', [[0, 5], [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [5, 5]]],
    ['honey', [[1, 2], [1, 1], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [6, 1]]],
    ['moss', [[1, 3], [2, 3], [2, 2], [3, 2], [4, 2]]],
    ['rose', [[2, 1], [3, 1], [4, 1], [5, 1], [5, 2], [6, 2], [6, 3]]],
    ['sand', [[2, 4], [3, 4], [3, 3], [4, 3], [5, 3], [5, 4], [6, 4], [6, 5], [6, 6]]],
  ]),
  definePuzzle('7x7-5', 7, [
    ['ember', [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3]]],
    ['saffron', [[5, 4], [4, 4], [3, 4], [2, 4], [1, 4], [0, 4], [0, 5], [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6]]],
    ['honey', [[1, 1], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [6, 1], [6, 2]]],
    ['moss', [[1, 2], [2, 2], [2, 1], [3, 1], [4, 1], [5, 1]]],
    ['rose', [[3, 2], [4, 2], [5, 2], [5, 3], [6, 3], [6, 4], [6, 5], [5, 5], [4, 5], [3, 5], [2, 5], [1, 5]]],
  ]),
  definePuzzle('7x7-6', 7, [
    ['ember', [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]]],
    ['saffron', [[0, 2], [0, 3], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3]]],
    ['honey', [[0, 5], [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [6, 5], [6, 4]]],
    ['moss', [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1]]],
    ['clay', [[1, 3], [2, 3], [3, 3], [3, 2]]],
    ['rose', [[1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [5, 4], [5, 3], [6, 3]]],
    ['sand', [[2, 1], [3, 1], [4, 1], [4, 2], [5, 2], [6, 2], [6, 1], [6, 0]]],
  ]),
  definePuzzle('7x7-7', 7, [
    ['ember', [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [2, 3], [3, 3]]],
    ['saffron', [[0, 2], [0, 3], [0, 4], [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [5, 4]]],
    ['honey', [[0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [6, 5], [6, 4]]],
    ['moss', [[1, 0], [2, 0], [3, 0], [4, 0], [4, 1]]],
    ['rose', [[1, 3], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3], [5, 3], [6, 3], [6, 2], [6, 1]]],
    ['sand', [[2, 1], [3, 1], [3, 2], [4, 2], [5, 2], [5, 1], [5, 0], [6, 0]]],
  ]),
] as const

/* -------------------------------------------------------------------------- */
/*  Cell, path & puzzle helpers                                               */
/* -------------------------------------------------------------------------- */

export function sameCell(a: Cell, b: Cell): boolean {
  return a.row === b.row && a.col === b.col
}

export function isInBounds(size: number, cell: Cell): boolean {
  return (
    Number.isInteger(cell.row) &&
    Number.isInteger(cell.col) &&
    cell.row >= 0 &&
    cell.row < size &&
    cell.col >= 0 &&
    cell.col < size
  )
}

export function isOrthogonallyAdjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1
}

function clonePaths(paths: PathMap): PathMap {
  const copy: PathMap = {}
  for (const color of PIECE_COLORS) {
    const path = paths[color]
    if (path && path.length > 0) {
      copy[color] = path.map((c) => ({ row: c.row, col: c.col }))
    }
  }
  return copy
}

function pathsEqual(a: PathMap, b: PathMap): boolean {
  for (const color of PIECE_COLORS) {
    const pa = a[color] ?? []
    const pb = b[color] ?? []
    if (pa.length !== pb.length) return false
    for (let i = 0; i < pa.length; i++) {
      if (!sameCell(pa[i]!, pb[i]!)) return false
    }
  }
  return true
}

function transformCell(cell: Cell, size: number, symmetry: number): Cell {
  const max = size - 1
  const s = ((symmetry % 8) + 8) % 8
  let { row, col } = cell
  if (s >= 4) {
    col = max - col
  }
  const rot = s % 4
  for (let i = 0; i < rot; i++) {
    const nextRow = col
    const nextCol = max - row
    row = nextRow
    col = nextCol
  }
  return { row, col }
}

function findPair(pairs: readonly ThreadPair[], color: PieceColor): ThreadPair | undefined {
  return pairs.find((p) => p.color === color)
}

export function getEndpointAt(state: Pick<ThreadState, 'pairs'>, cell: Cell): ThreadPair | null {
  for (const pair of state.pairs) {
    if (sameCell(pair.a, cell) || sameCell(pair.b, cell)) return pair
  }
  return null
}

export function getPathOwnerAt(
  state: Pick<ThreadState, 'paths'>,
  cell: Cell,
): { color: PieceColor; index: number } | null {
  for (const color of PIECE_COLORS) {
    const path = state.paths[color]
    if (!path || path.length === 0) continue
    const index = path.findIndex((c) => sameCell(c, cell))
    if (index !== -1) return { color, index }
  }
  return null
}

export function isPairConnected(pair: ThreadPair, path: readonly Cell[] | undefined): boolean {
  if (!path || path.length < 2) return false
  const first = path[0]!
  const last = path[path.length - 1]!
  return (
    (sameCell(first, pair.a) && sameCell(last, pair.b)) ||
    (sameCell(first, pair.b) && sameCell(last, pair.a))
  )
}

export function countConnectedPairs(state: Pick<ThreadState, 'pairs' | 'paths'>): number {
  let count = 0
  for (const pair of state.pairs) {
    if (isPairConnected(pair, state.paths[pair.color])) count++
  }
  return count
}

export function isAllPairsConnected(state: Pick<ThreadState, 'pairs' | 'paths'>): boolean {
  return state.pairs.length > 0 && countConnectedPairs(state) === state.pairs.length
}

/**
 * Count grid cells covered by drawn paths (paths of length >= 2).
 * Returns 0 on a fresh empty board and `size * size` when 100% filled.
 */
export function countFilledCells(state: Pick<ThreadState, 'size' | 'paths'>): number {
  const occupied = new Set<number>()
  for (const color of PIECE_COLORS) {
    const path = state.paths[color]
    if (!path || path.length < 2) continue
    for (const cell of path) {
      occupied.add(cell.row * state.size + cell.col)
    }
  }
  return occupied.size
}

export function boardFillPercent(state: Pick<ThreadState, 'size' | 'paths'>): number {
  const total = state.size * state.size
  if (total <= 0) return 0
  return Math.round((countFilledCells(state) / total) * 100)
}

export function isBoardSolved(
  size: number,
  pairs: readonly ThreadPair[],
  paths: PathMap,
): boolean {
  if (pairs.length === 0) return false
  const occupied = new Set<number>()
  for (const pair of pairs) {
    const path = paths[pair.color]
    if (!isPairConnected(pair, path)) return false
    for (let i = 0; i < path!.length; i++) {
      const cell = path![i]!
      if (!isInBounds(size, cell)) return false
      if (i > 0 && !isOrthogonallyAdjacent(path![i - 1]!, cell)) return false
      const key = cell.row * size + cell.col
      if (occupied.has(key)) return false
      occupied.add(key)
    }
  }
  return occupied.size === size * size
}

/* -------------------------------------------------------------------------- */
/*  Calm progression & puzzle selection                                       */
/* -------------------------------------------------------------------------- */

/**
 * Select board size for a given `calm` level (0..1) and 1-based puzzle number:
 * - calm >= 0.65: gentle 5×5 boards
 * - 0.35 <= calm < 0.65: moderate 6×6 boards
 * - calm < 0.35: engaging 7×7 and 6×6 boards
 */
export function sizeForCalm(calm: number, puzzleNumber = 1): BoardSize {
  const c = clamp01(calm)
  if (c >= 0.65) return 5
  if (c >= 0.35) return 6
  return puzzleNumber % 3 === 2 ? 6 : 7
}

function pickPuzzle(
  calm: number,
  puzzleNumber: number,
  playedIds: readonly string[],
  rng: ReturnType<typeof createRng>,
  explicitPuzzleId?: string,
): { puzzle: ThreadPuzzle; symmetry: number; nextPlayedIds: string[] } {
  if (explicitPuzzleId) {
    const found = PUZZLES.find((p) => p.id === explicitPuzzleId)
    if (found) {
      const nextPlayed = playedIds.includes(found.id) ? [...playedIds] : [...playedIds, found.id]
      return { puzzle: found, symmetry: 0, nextPlayedIds: nextPlayed }
    }
  }

  const targetSize = sizeForCalm(calm, puzzleNumber)
  const pool = PUZZLES.filter((p) => p.size === targetSize)
  const playedSet = new Set(playedIds)
  const fresh = pool.filter((p) => !playedSet.has(p.id))

  let puzzle: ThreadPuzzle
  let symmetry = 0
  let nextPlayedIds: string[]

  if (fresh.length > 0) {
    puzzle = rng.pick(fresh)
    nextPlayedIds = [...playedIds, puzzle.id]
  } else {
    // All puzzles in this size tier have been played — avoid immediate repeat and rotate/mirror for freshness.
    const lastId = playedIds[playedIds.length - 1]
    const candidates = pool.filter((p) => p.id !== lastId)
    puzzle = rng.pick(candidates.length > 0 ? candidates : pool)
    symmetry = rng.int(1, 7)
    // Keep IDs from other size tiers, reset this tier to just the newly chosen puzzle.
    const otherTierIds = playedIds.filter((id) => !pool.some((p) => p.id === id))
    nextPlayedIds = [...otherTierIds, puzzle.id]
  }

  return { puzzle, symmetry, nextPlayedIds }
}

function buildStateFromPuzzle(
  puzzle: ThreadPuzzle,
  symmetry: number,
  puzzleNumber: number,
  calm: number,
  playedIds: string[],
  rngState: number,
): ThreadState {
  const pairs: ThreadPair[] = puzzle.pairs.map((pair) => ({
    color: pair.color,
    a: transformCell(pair.a, puzzle.size, symmetry),
    b: transformCell(pair.b, puzzle.size, symmetry),
  }))

  return {
    puzzleNumber,
    puzzleId: puzzle.id,
    size: puzzle.size,
    pairs,
    paths: {},
    activeColor: null,
    strokeSnapshot: null,
    history: [],
    moves: 0,
    solved: false,
    calm: clamp01(calm),
    playedIds,
    rngState,
  }
}

export function createThread(opts: CreateThreadOptions = {}): ThreadState {
  const seed = opts.seed ?? 1
  const calm = clamp01(opts.calm ?? 0)
  const puzzleNumber = opts.puzzleNumber ?? 1
  const rng = createRng(seed)

  const { puzzle, symmetry, nextPlayedIds } = pickPuzzle(
    calm,
    puzzleNumber,
    [],
    rng,
    opts.puzzleId,
  )
  return buildStateFromPuzzle(puzzle, symmetry, puzzleNumber, calm, nextPlayedIds, rng.state())
}

/* -------------------------------------------------------------------------- */
/*  Path editing state machine                                                */
/* -------------------------------------------------------------------------- */

/**
 * Begin drawing from `cell`.
 * - Starting on an endpoint clears that colour's previous path and begins `[cell]`.
 * - Starting on an existing path trims it back to `cell` and resumes drawing from there.
 */
export function startPath(state: ThreadState, cell: Cell): ThreadState {
  if (state.solved) return state
  if (!isInBounds(state.size, cell)) return state

  const endpointPair = getEndpointAt(state, cell)
  if (endpointPair) {
    const snapshot = state.strokeSnapshot ? clonePaths(state.strokeSnapshot) : clonePaths(state.paths)
    const nextPaths = clonePaths(state.paths)
    nextPaths[endpointPair.color] = [{ row: cell.row, col: cell.col }]
    return {
      ...state,
      paths: nextPaths,
      activeColor: endpointPair.color,
      strokeSnapshot: snapshot,
    }
  }

  const owner = getPathOwnerAt(state, cell)
  if (owner) {
    const snapshot = state.strokeSnapshot ? clonePaths(state.strokeSnapshot) : clonePaths(state.paths)
    const nextPaths = clonePaths(state.paths)
    const existing = nextPaths[owner.color]!
    nextPaths[owner.color] = existing.slice(0, owner.index + 1)
    return {
      ...state,
      paths: nextPaths,
      activeColor: owner.color,
      strokeSnapshot: snapshot,
    }
  }

  return state
}

function stepSingleCell(state: ThreadState, stepCell: Cell): ThreadState {
  const color = state.activeColor
  if (!color) return state
  const activePath = state.paths[color]
  if (!activePath || activePath.length === 0) return state

  const tip = activePath[activePath.length - 1]!
  if (!isOrthogonallyAdjacent(tip, stepCell)) return state

  const pair = findPair(state.pairs, color)
  if (!pair) return state

  // 1. Backtracking onto an earlier cell of the active path truncates cleanly.
  const selfIdx = activePath.findIndex((c) => sameCell(c, stepCell))
  if (selfIdx !== -1) {
    const nextPaths = clonePaths(state.paths)
    nextPaths[color] = activePath.slice(0, selfIdx + 1)
    return {
      ...state,
      paths: nextPaths,
    }
  }

  // 2. If the active path has already reached its target endpoint, don't extend past it.
  if (isPairConnected(pair, activePath)) {
    return state
  }

  // 3. Cannot enter another colour's endpoint dot.
  const endpointAtStep = getEndpointAt(state, stepCell)
  if (endpointAtStep && endpointAtStep.color !== color) {
    return state
  }

  // 4. Crossing another colour's existing path cleanly cuts the other path right before the intersection.
  const nextPaths = clonePaths(state.paths)
  for (const otherColor of PIECE_COLORS) {
    if (otherColor === color) continue
    const otherPath = nextPaths[otherColor]
    if (!otherPath || otherPath.length === 0) continue
    const cutIdx = otherPath.findIndex((c) => sameCell(c, stepCell))
    if (cutIdx !== -1) {
      if (cutIdx <= 1) {
        delete nextPaths[otherColor]
      } else {
        nextPaths[otherColor] = otherPath.slice(0, cutIdx)
      }
    }
  }

  // 5. Append stepCell to active path.
  const updatedPath = [...activePath.map((c) => ({ row: c.row, col: c.col })), { row: stepCell.row, col: stepCell.col }]
  nextPaths[color] = updatedPath

  // 6. Immediately recognise full completion when all pairs connect & 100% of grid is filled.
  if (isBoardSolved(state.size, state.pairs, nextPaths)) {
    const history = state.strokeSnapshot
      ? [...state.history, state.strokeSnapshot].slice(-MAX_HISTORY)
      : state.history
    return {
      ...state,
      paths: nextPaths,
      activeColor: null,
      strokeSnapshot: null,
      history,
      moves: state.moves + 1,
      solved: true,
    }
  }

  return {
    ...state,
    paths: nextPaths,
  }
}

/**
 * Extend the active path toward `cell`.
 * Supports orthogonal steps as well as straight-line step interpolation when
 * fast pointer movement jumps 2+ cells along the same row or column.
 */
export function extendPath(state: ThreadState, cell: Cell): ThreadState {
  if (state.solved || !state.activeColor) return state
  if (!isInBounds(state.size, cell)) return state

  const activePath = state.paths[state.activeColor]
  if (!activePath || activePath.length === 0) return state

  const tip = activePath[activePath.length - 1]!
  if (sameCell(tip, cell)) return state

  const dr = cell.row - tip.row
  const dc = cell.col - tip.col

  // Must be on the same row or same column (orthogonal move or straight-line jump).
  if (dr !== 0 && dc !== 0) return state

  const steps = Math.abs(dr) + Math.abs(dc)
  const stepR = dr === 0 ? 0 : dr > 0 ? 1 : -1
  const stepC = dc === 0 ? 0 : dc > 0 ? 1 : -1

  let current = state
  for (let i = 1; i <= steps; i++) {
    const nextCell: Cell = { row: tip.row + stepR * i, col: tip.col + stepC * i }
    const stepped = stepSingleCell(current, nextCell)
    if (stepped === current) break
    current = stepped
    if (current.solved || !current.activeColor) break
  }

  return current
}

/**
 * Finish the active stroke cleanly, committing to undo history if the board changed.
 */
export function endPath(state: ThreadState): ThreadState {
  if (!state.activeColor) return state

  const nextPaths = clonePaths(state.paths)
  const active = nextPaths[state.activeColor]
  // A 1-cell stub (tapped an endpoint without dragging) clears that colour cleanly.
  if (active && active.length <= 1) {
    delete nextPaths[state.activeColor]
  }

  const changed = state.strokeSnapshot ? !pathsEqual(state.strokeSnapshot, nextPaths) : false
  const history =
    changed && state.strokeSnapshot
      ? [...state.history, state.strokeSnapshot].slice(-MAX_HISTORY)
      : state.history

  const solved = isBoardSolved(state.size, state.pairs, nextPaths)

  return {
    ...state,
    paths: nextPaths,
    activeColor: null,
    strokeSnapshot: null,
    history,
    moves: changed ? state.moves + 1 : state.moves,
    solved,
  }
}

/**
 * Cancel an active in-progress stroke, restoring the pre-stroke board.
 */
export function cancelActivePath(state: ThreadState): ThreadState {
  if (!state.activeColor) return state
  return {
    ...state,
    paths: state.strokeSnapshot ? clonePaths(state.strokeSnapshot) : state.paths,
    activeColor: null,
    strokeSnapshot: null,
  }
}

/**
 * Undo the last completed stroke or board clear.
 */
export function undo(state: ThreadState): ThreadState {
  if (state.solved || state.history.length === 0) return state
  const previous = state.history[state.history.length - 1]!
  return {
    ...state,
    paths: clonePaths(previous),
    activeColor: null,
    strokeSnapshot: null,
    history: state.history.slice(0, -1),
    solved: false,
  }
}

/**
 * Clear all paths on the current board (undoable).
 */
export function clearBoard(state: ThreadState): ThreadState {
  const hasAny = PIECE_COLORS.some((c) => (state.paths[c]?.length ?? 0) > 0)
  if (!hasAny && !state.activeColor) return state

  const snapshot = state.strokeSnapshot ? clonePaths(state.strokeSnapshot) : clonePaths(state.paths)
  const snapshotHasAny = PIECE_COLORS.some((c) => (snapshot[c]?.length ?? 0) > 0)
  const history = snapshotHasAny
    ? [...state.history, snapshot].slice(-MAX_HISTORY)
    : state.history

  return {
    ...state,
    paths: {},
    activeColor: null,
    strokeSnapshot: null,
    history,
    solved: false,
  }
}

/**
 * Advance to the next puzzle, adapting board size to the current `calm` value.
 */
export function nextPuzzle(state: ThreadState, calm: number): ThreadState {
  const normalizedCalm = clamp01(calm)
  const rng = createRng(state.rngState)
  const nextNumber = state.puzzleNumber + 1
  const { puzzle, symmetry, nextPlayedIds } = pickPuzzle(
    normalizedCalm,
    nextNumber,
    state.playedIds,
    rng,
  )
  return buildStateFromPuzzle(
    puzzle,
    symmetry,
    nextNumber,
    normalizedCalm,
    nextPlayedIds,
    rng.state(),
  )
}

export function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
  switch (action.type) {
    case 'start':
      return startPath(state, action.cell)
    case 'extend':
      return extendPath(state, action.cell)
    case 'end':
      return endPath(state)
    case 'cancel':
      return cancelActivePath(state)
    case 'undo':
      return undo(state)
    case 'clear':
      return clearBoard(state)
    case 'next':
      return nextPuzzle(state, action.calm)
  }
}
