import { createRng } from '../../rng'

/** 0 = empty, 1 = filled, 2 = marked cross (×). */
export type WeaveCell = 0 | 1 | 2
export type WeaveTool = 'fill' | 'mark'

export const MAX_UNDO = 25

export interface WeavePuzzleDef {
  id: string
  title: string
  size: 5 | 7 | 8
  /** Compact ASCII pattern: '#' = filled (1), '.' = empty (0). */
  pattern: readonly string[]
}

export interface WeaveState {
  puzzleNumber: number
  puzzleId: string
  title: string
  rows: number
  cols: number
  seed: number
  rngState: number
  calm: number
  solution: number[][]
  rowClues: number[][]
  colClues: number[][]
  grid: WeaveCell[][]
  undoStack: WeaveCell[][][]
  moves: number
  solved: boolean
}

export interface CreateWeaveOptions {
  seed?: number
  calm?: number
  puzzleNumber?: number
  puzzleId?: string
  excludeId?: string
}

/**
 * Twenty curated pixel silhouettes across 5×5 (gentle), 7×7 (standard),
 * and 8×8 (richer). Every row and column holds at least one filled cell.
 */
export const WEAVE_PUZZLES: readonly WeavePuzzleDef[] = [
  // --- 5×5 (7 gentle patterns) ---
  {
    id: 'heart',
    title: 'Heart',
    size: 5,
    pattern: [
      '.#.#.',
      '#####',
      '#####',
      '.###.',
      '..#..',
    ],
  },
  {
    id: 'hourglass',
    title: 'Hourglass',
    size: 5,
    pattern: [
      '#####',
      '.###.',
      '..#..',
      '.###.',
      '#####',
    ],
  },
  {
    id: 'crown',
    title: 'Crown',
    size: 5,
    pattern: [
      '#.#.#',
      '#.#.#',
      '#####',
      '#####',
      '.###.',
    ],
  },
  {
    id: 'sail',
    title: 'Sail',
    size: 5,
    pattern: [
      '..#..',
      '..##.',
      '.####',
      '#####',
      '.###.',
    ],
  },
  {
    id: 'pine',
    title: 'Pine',
    size: 5,
    pattern: [
      '..#..',
      '.###.',
      '.###.',
      '#####',
      '..#..',
    ],
  },
  {
    id: 'teacup',
    title: 'Teacup',
    size: 5,
    pattern: [
      '####.',
      '###.#',
      '####.',
      '.##..',
      '#####',
    ],
  },
  {
    id: 'star',
    title: 'Star',
    size: 5,
    pattern: [
      '..#..',
      '#####',
      '.###.',
      '.#.#.',
      '#...#',
    ],
  },

  // --- 7×7 (7 standard patterns) ---
  {
    id: 'crescent',
    title: 'Crescent',
    size: 7,
    pattern: [
      '..####.',
      '.####..',
      '###...#',
      '###....',
      '###....',
      '.####..',
      '..####.',
    ],
  },
  {
    id: 'lantern',
    title: 'Lantern',
    size: 7,
    pattern: [
      '..###..',
      '...#...',
      '.#####.',
      '##.#.##',
      '##.#.##',
      '.#####.',
      '..###..',
    ],
  },
  {
    id: 'anchor',
    title: 'Anchor',
    size: 7,
    pattern: [
      '..###..',
      '...#...',
      '.#####.',
      '...#...',
      '#..#..#',
      '##.#.##',
      '.#####.',
    ],
  },
  {
    id: 'key',
    title: 'Key',
    size: 7,
    pattern: [
      '.#####.',
      '##...##',
      '##...##',
      '.#####.',
      '...#...',
      '...###.',
      '...##..',
    ],
  },
  {
    id: 'umbrella',
    title: 'Umbrella',
    size: 7,
    pattern: [
      '...#...',
      '.#####.',
      '#######',
      '#..#..#',
      '...#...',
      '.#.#...',
      '.###...',
    ],
  },
  {
    id: 'mountain',
    title: 'Mountain',
    size: 7,
    pattern: [
      '...#...',
      '..###..',
      '..#.#..',
      '.#####.',
      '##...##',
      '#######',
      '#######',
    ],
  },
  {
    id: 'leaf',
    title: 'Leaf',
    size: 7,
    pattern: [
      '....###',
      '..#####',
      '.####.#',
      '.###.##',
      '.##.###',
      '.#.###.',
      '##.....',
    ],
  },

  // --- 8×8 (6 richer patterns) ---
  {
    id: 'owl',
    title: 'Owl',
    size: 8,
    pattern: [
      '#......#',
      '########',
      '##.##.##',
      '########',
      '.######.',
      '.#.##.#.',
      '..####..',
      '..#..#..',
    ],
  },
  {
    id: 'whale',
    title: 'Whale',
    size: 8,
    pattern: [
      '..#.#...',
      '...#....',
      '.#####..',
      '######.#',
      '##.###.#',
      '########',
      '.######.',
      '..####..',
    ],
  },
  {
    id: 'pagoda',
    title: 'Pagoda',
    size: 8,
    pattern: [
      '...##...',
      '.######.',
      '..####..',
      '########',
      '..#..#..',
      '########',
      '.##..##.',
      '########',
    ],
  },
  {
    id: 'compass',
    title: 'Compass',
    size: 8,
    pattern: [
      '...##...',
      '...##...',
      '..#..#..',
      '###..###',
      '###..###',
      '..#..#..',
      '...##...',
      '...##...',
    ],
  },
  {
    id: 'bell',
    title: 'Bell',
    size: 8,
    pattern: [
      '...##...',
      '..####..',
      '.##.###.',
      '.##.###.',
      '.######.',
      '########',
      '.######.',
      '...##...',
    ],
  },
  {
    id: 'vessel',
    title: 'Vessel',
    size: 8,
    pattern: [
      '..####..',
      '...##...',
      '.######.',
      '#.#..#.#',
      '#.#..#.#',
      '.######.',
      '..####..',
      '.######.',
    ],
  },
]

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

export function parsePattern(pattern: readonly string[]): number[][] {
  return pattern.map((row) => Array.from(row, (ch) => (ch === '#' ? 1 : 0)))
}

/** Computes run-length clues for a single row or column (returns [0] when empty). */
export function computeLineClue(line: readonly number[]): number[] {
  const runs: number[] = []
  let run = 0
  for (let i = 0; i < line.length; i++) {
    if (line[i] === 1) {
      run++
    } else if (run > 0) {
      runs.push(run)
      run = 0
    }
  }
  if (run > 0) runs.push(run)
  return runs.length > 0 ? runs : [0]
}

export function computeClues(solution: readonly (readonly number[])[]): {
  rowClues: number[][]
  colClues: number[][]
} {
  const rows = solution.length
  const cols = rows > 0 ? solution[0]!.length : 0
  const rowClues = solution.map((row) => computeLineClue(row))
  const colClues: number[][] = []

  for (let c = 0; c < cols; c++) {
    const col: number[] = []
    for (let r = 0; r < rows; r++) {
      col.push(solution[r]![c]!)
    }
    colClues.push(computeLineClue(col))
  }

  return { rowClues, colClues }
}

export function isLineSatisfied(line: readonly number[], clue: readonly number[]): boolean {
  const actual = computeLineClue(line)
  if (actual.length !== clue.length) return false
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== clue[i]) return false
  }
  return true
}

export function getColumnLine(grid: readonly (readonly WeaveCell[])[], col: number): WeaveCell[] {
  const line: WeaveCell[] = []
  for (let r = 0; r < grid.length; r++) {
    line.push(grid[r]![col]!)
  }
  return line
}

export function isWeaveSolved(
  grid: readonly (readonly WeaveCell[])[],
  rowClues: readonly (readonly number[])[],
  colClues: readonly (readonly number[])[],
): boolean {
  for (let r = 0; r < rowClues.length; r++) {
    if (!isLineSatisfied(grid[r]!, rowClues[r]!)) return false
  }
  for (let c = 0; c < colClues.length; c++) {
    if (!isLineSatisfied(getColumnLine(grid, c), colClues[c]!)) return false
  }
  return true
}

/** Allowed grid sizes for a given calm level (0..1). */
export function allowedSizesForCalm(calm: number): readonly (5 | 7 | 8)[] {
  const c = clamp01(calm)
  if (c < 0.35) return [8, 7]
  if (c < 0.65) return [7, 5]
  return [5]
}

function emptyGrid(rows: number, cols: number): WeaveCell[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0 as WeaveCell))
}

function cloneGrid(grid: readonly (readonly WeaveCell[])[]): WeaveCell[][] {
  return grid.map((row) => row.slice())
}

function pushUndo(state: WeaveState): WeaveCell[][][] {
  const next = [...state.undoStack, cloneGrid(state.grid)]
  return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next
}

export function createWeave(opts: CreateWeaveOptions = {}): WeaveState {
  const seed = (opts.seed ?? 1) >>> 0
  const calm = clamp01(opts.calm ?? 0)
  const puzzleNumber = opts.puzzleNumber ?? 1
  const rng = createRng(seed)

  let chosen: WeavePuzzleDef | undefined
  if (opts.puzzleId) {
    chosen = WEAVE_PUZZLES.find((p) => p.id === opts.puzzleId)
  }

  if (!chosen) {
    const allowed = allowedSizesForCalm(calm)
    const pool = WEAVE_PUZZLES.filter((p) => allowed.includes(p.size) && p.id !== opts.excludeId)
    const fallbackPool = WEAVE_PUZZLES.filter((p) => allowed.includes(p.size))
    chosen = rng.pick(pool.length > 0 ? pool : fallbackPool)
  }

  const solution = parsePattern(chosen.pattern)
  const { rowClues, colClues } = computeClues(solution)
  const rows = solution.length
  const cols = solution[0]!.length

  return {
    puzzleNumber,
    puzzleId: chosen.id,
    title: chosen.title,
    rows,
    cols,
    seed,
    rngState: rng.state(),
    calm,
    solution,
    rowClues,
    colClues,
    grid: emptyGrid(rows, cols),
    undoStack: [],
    moves: 0,
    solved: false,
  }
}

export function setCell(
  state: WeaveState,
  row: number,
  col: number,
  value: WeaveCell,
  opts?: { recordUndo?: boolean },
): WeaveState {
  if (state.solved) return state
  if (!Number.isInteger(row) || !Number.isInteger(col)) return state
  if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return state
  if (value !== 0 && value !== 1 && value !== 2) return state
  if (state.grid[row]![col] === value) return state

  const nextGrid = cloneGrid(state.grid)
  nextGrid[row]![col] = value
  const solved = isWeaveSolved(nextGrid, state.rowClues, state.colClues)
  const recordUndo = opts?.recordUndo ?? true

  return {
    ...state,
    grid: nextGrid,
    undoStack: recordUndo ? pushUndo(state) : state.undoStack,
    moves: state.moves + 1,
    solved,
  }
}

export function toggleCell(
  state: WeaveState,
  row: number,
  col: number,
  tool: WeaveTool,
): WeaveState {
  if (state.solved) return state
  if (!Number.isInteger(row) || !Number.isInteger(col)) return state
  if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return state

  const current = state.grid[row]![col]!
  const target: WeaveCell =
    tool === 'fill' ? (current === 1 ? 0 : 1) : current === 2 ? 0 : 2
  return setCell(state, row, col, target, { recordUndo: true })
}

export function undoWeave(state: WeaveState): WeaveState {
  if (state.solved || state.undoStack.length === 0) return state
  const prev = state.undoStack[state.undoStack.length - 1]!
  return {
    ...state,
    grid: cloneGrid(prev),
    undoStack: state.undoStack.slice(0, -1),
  }
}

export function clearWeave(state: WeaveState): WeaveState {
  if (state.solved) return state
  const hasAny = state.grid.some((row) => row.some((c) => c !== 0))
  if (!hasAny) return state
  return {
    ...state,
    grid: emptyGrid(state.rows, state.cols),
    undoStack: pushUndo(state),
  }
}

export function restartPuzzle(state: WeaveState): WeaveState {
  return {
    ...state,
    grid: emptyGrid(state.rows, state.cols),
    undoStack: [],
    moves: 0,
    solved: false,
  }
}

export function nextPuzzle(state: WeaveState, calm: number): WeaveState {
  const rng = createRng(state.rngState)
  const nextSeed = (Math.floor(rng.next() * 0xffffffff) ^ (state.puzzleNumber * 0x9e3779b9)) >>> 0
  return createWeave({
    seed: nextSeed === 0 ? 1 : nextSeed,
    calm,
    puzzleNumber: state.puzzleNumber + 1,
    excludeId: state.puzzleId,
  })
}

export function countFilledCells(state: WeaveState): { filled: number; total: number } {
  let filled = 0
  let total = 0
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.grid[r]![c] === 1) filled++
      if (state.solution[r]![c] === 1) total++
    }
  }
  return { filled, total }
}
