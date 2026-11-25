import { createRng, type Rng } from '../../rng'

export const BOARD_SIZE = 9
export const CELL_COUNT = 81
export const MAX_UNDO = 15

export interface NineSnapshot {
  values: number[]
  notes: number[][]
}

export type NineDifficulty = 'easy' | 'medium' | 'hard' | 'expert'

const DIFFICULTY_GIVENS: Record<NineDifficulty, number> = { easy: 46, medium: 39, hard: 33, expert: 29 }

export interface NineState {
  difficulty?: NineDifficulty
  puzzleNumber: number
  seed: number
  rngState: number
  calm: number
  /** Verified complete 9×9 solution (digits 1..9). */
  solution: number[]
  /** True for initial puzzle clues that cannot be overwritten. */
  givens: boolean[]
  /** Current board digits: 0 = empty, 1..9 = filled. */
  values: number[]
  /** Pencil notes per cell: sorted unique digits 1..9. */
  notes: number[][]
  selected: number | null
  notesMode: boolean
  undoStack: NineSnapshot[]
  moves: number
  hintsUsed: number
  solved: boolean
}

export interface CreateNineOptions {
  difficulty?: NineDifficulty
  seed?: number
  calm?: number
  puzzleNumber?: number
}

/** Four structurally distinct canonical valid 9×9 Sudoku solutions. */
export const BASE_SOLUTIONS: readonly (readonly number[])[] = [
  [
    5, 3, 4, 6, 7, 8, 9, 1, 2,
    6, 7, 2, 1, 9, 5, 3, 4, 8,
    1, 9, 8, 3, 4, 2, 5, 6, 7,
    8, 5, 9, 7, 6, 1, 4, 2, 3,
    4, 2, 6, 8, 5, 3, 7, 9, 1,
    7, 1, 3, 9, 2, 4, 8, 5, 6,
    9, 6, 1, 5, 3, 7, 2, 8, 4,
    2, 8, 7, 4, 1, 9, 6, 3, 5,
    3, 4, 5, 2, 8, 6, 1, 7, 9,
  ],
  [
    1, 2, 3, 4, 5, 6, 7, 8, 9,
    4, 5, 6, 7, 8, 9, 1, 2, 3,
    7, 8, 9, 1, 2, 3, 4, 5, 6,
    2, 3, 1, 5, 6, 4, 8, 9, 7,
    5, 6, 4, 8, 9, 7, 2, 3, 1,
    8, 9, 7, 2, 3, 1, 5, 6, 4,
    3, 1, 2, 6, 4, 5, 9, 7, 8,
    6, 4, 5, 9, 7, 8, 3, 1, 2,
    9, 7, 8, 3, 1, 2, 6, 4, 5,
  ],
  [
    8, 2, 7, 1, 5, 4, 3, 9, 6,
    9, 6, 5, 3, 2, 7, 1, 4, 8,
    3, 4, 1, 6, 8, 9, 7, 5, 2,
    5, 9, 3, 4, 6, 8, 2, 7, 1,
    4, 7, 2, 5, 1, 3, 6, 8, 9,
    6, 1, 8, 9, 7, 2, 4, 3, 5,
    7, 8, 6, 2, 3, 5, 9, 1, 4,
    1, 5, 4, 7, 9, 6, 8, 2, 3,
    2, 3, 9, 8, 4, 1, 5, 6, 7,
  ],
  [
    4, 3, 5, 2, 6, 9, 7, 8, 1,
    6, 8, 2, 5, 7, 1, 4, 9, 3,
    1, 9, 7, 8, 3, 4, 5, 6, 2,
    8, 2, 6, 1, 9, 5, 3, 4, 7,
    3, 7, 4, 6, 8, 2, 9, 1, 5,
    9, 5, 1, 7, 4, 3, 6, 2, 8,
    5, 1, 9, 3, 2, 6, 8, 7, 4,
    2, 4, 8, 9, 5, 7, 1, 3, 6,
    7, 6, 3, 4, 1, 8, 2, 5, 9,
  ],
]

const ALL_MASK = 0x1ff // bits 0..8 for digits 1..9

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

export function rowOf(idx: number): number {
  return Math.floor(idx / BOARD_SIZE)
}

export function colOf(idx: number): number {
  return idx % BOARD_SIZE
}

export function boxOf(idx: number): number {
  return Math.floor(rowOf(idx) / 3) * 3 + Math.floor(colOf(idx) / 3)
}

/** Precomputed 20 peer indices for each cell 0..80 (same row, col, or 3×3 box). */
const PEER_TABLE: readonly (readonly number[])[] = Array.from({ length: CELL_COUNT }, (_, idx) => {
  const r = rowOf(idx)
  const c = colOf(idx)
  const b = boxOf(idx)
  const peers: number[] = []
  for (let i = 0; i < CELL_COUNT; i++) {
    if (i !== idx && (rowOf(i) === r || colOf(i) === c || boxOf(i) === b)) {
      peers.push(i)
    }
  }
  return peers
})

export function getPeers(idx: number): readonly number[] {
  return PEER_TABLE[idx] ?? []
}

export function isPeer(a: number, b: number): boolean {
  if (a === b || a < 0 || b < 0 || a >= CELL_COUNT || b >= CELL_COUNT) return false
  return rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b)
}

/** Target given count range based on calm level (0..1). */
export function targetGivensForCalm(calm: number, rng: Rng): number {
  const c = clamp01(calm)
  if (c < 0.4) return rng.int(36, 38)
  if (c < 0.75) return rng.int(42, 44)
  return rng.int(48, 50)
}

/** Verifies a 9×9 grid contains digits 1..9 with zero duplicates in any row, col, or box. */
export function isValidSolution(grid: readonly number[]): boolean {
  if (grid.length !== CELL_COUNT) return false
  const rowMask = new Int32Array(9)
  const colMask = new Int32Array(9)
  const boxMask = new Int32Array(9)

  for (let i = 0; i < CELL_COUNT; i++) {
    const d = grid[i]!
    if (!Number.isInteger(d) || d < 1 || d > 9) return false
    const bit = 1 << (d - 1)
    const r = rowOf(i)
    const c = colOf(i)
    const b = boxOf(i)
    if ((rowMask[r]! & bit) || (colMask[c]! & bit) || (boxMask[b]! & bit)) return false
    rowMask[r]! |= bit
    colMask[c]! |= bit
    boxMask[b]! |= bit
  }

  for (let u = 0; u < 9; u++) {
    if (rowMask[u] !== ALL_MASK || colMask[u] !== ALL_MASK || boxMask[u] !== ALL_MASK) {
      return false
    }
  }
  return true
}

function popcount9(mask: number): number {
  let m = mask
  let count = 0
  while (m) {
    m &= m - 1
    count++
  }
  return count
}

/**
 * Counts valid completions of a partial 9×9 Sudoku up to `limit` (default 2)
 * using MRV (minimum remaining values) bitmask backtracking.
 */
export function countSolutions(board: readonly number[], limit = 2): number {
  if (board.length !== CELL_COUNT) return 0
  const rowMask = new Int32Array(9)
  const colMask = new Int32Array(9)
  const boxMask = new Int32Array(9)
  const empties: number[] = []

  for (let i = 0; i < CELL_COUNT; i++) {
    const d = board[i]!
    if (d === 0) {
      empties.push(i)
      continue
    }
    if (!Number.isInteger(d) || d < 1 || d > 9) return 0
    const bit = 1 << (d - 1)
    const r = rowOf(i)
    const c = colOf(i)
    const b = boxOf(i)
    if ((rowMask[r]! & bit) || (colMask[c]! & bit) || (boxMask[b]! & bit)) return 0
    rowMask[r]! |= bit
    colMask[c]! |= bit
    boxMask[b]! |= bit
  }

  let solutions = 0
  const n = empties.length

  function search(filled: number): void {
    if (solutions >= limit) return
    if (filled === n) {
      solutions++
      return
    }

    // Choose the empty cell with the fewest legal candidates (MRV).
    let bestPos = -1
    let bestMask = 0
    let bestCount = 10

    for (let k = filled; k < n; k++) {
      const idx = empties[k]!
      const used = rowMask[rowOf(idx)]! | colMask[colOf(idx)]! | boxMask[boxOf(idx)]!
      const avail = ALL_MASK & ~used
      if (avail === 0) return
      const cnt = popcount9(avail)
      if (cnt < bestCount) {
        bestCount = cnt
        bestPos = k
        bestMask = avail
        if (cnt === 1) break
      }
    }

    // Swap chosen cell into slot `filled`.
    const cellIdx = empties[bestPos]!
    empties[bestPos] = empties[filled]!
    empties[filled] = cellIdx

    const r = rowOf(cellIdx)
    const c = colOf(cellIdx)
    const b = boxOf(cellIdx)

    let bits = bestMask
    while (bits !== 0 && solutions < limit) {
      const bit = bits & -bits
      bits ^= bit
      rowMask[r]! |= bit
      colMask[c]! |= bit
      boxMask[b]! |= bit
      search(filled + 1)
      rowMask[r]! ^= bit
      colMask[c]! ^= bit
      boxMask[b]! ^= bit
    }

    // Restore swap.
    empties[filled] = empties[bestPos]!
    empties[bestPos] = cellIdx
  }

  search(0)
  return solutions
}

/** Transforms a canonical solution using the full Sudoku symmetry group. */
function generateSolution(rng: Rng): number[] {
  const base = rng.pick(BASE_SOLUTIONS)
  const digitMap = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])

  const bandOrder = rng.shuffle([0, 1, 2])
  const rowOrder: number[] = []
  for (const b of bandOrder) {
    for (const r of rng.shuffle([0, 1, 2])) {
      rowOrder.push(b * 3 + r)
    }
  }

  const stackOrder = rng.shuffle([0, 1, 2])
  const colOrder: number[] = []
  for (const s of stackOrder) {
    for (const c of rng.shuffle([0, 1, 2])) {
      colOrder.push(s * 3 + c)
    }
  }

  const transpose = rng.next() < 0.5
  const out = new Array<number>(CELL_COUNT)

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const srcR = rowOrder[transpose ? c : r]!
      const srcC = colOrder[transpose ? r : c]!
      const rawDigit = base[srcR * BOARD_SIZE + srcC]!
      out[r * BOARD_SIZE + c] = digitMap[rawDigit - 1]!
    }
  }

  return out
}

/**
 * Carves clues from a solved grid while guaranteeing a strictly unique solution.
 * Prefers 180-degree symmetric removals first for visual poise, then singletons
 * to hit the exact target given count.
 */
function carveUniquePuzzle(solution: readonly number[], targetGivens: number, rng: Rng): number[] {
  const puzzle = solution.slice()
  let givensCount = CELL_COUNT

  // First pass: 180-degree symmetric pairs (indices 0..39 paired with 80 - i).
  const halfIndices = rng.shuffle(Array.from({ length: 40 }, (_, i) => i))
  for (const a of halfIndices) {
    if (givensCount - 2 < targetGivens) break
    const b = CELL_COUNT - 1 - a
    const savedA = puzzle[a]!
    const savedB = puzzle[b]!
    puzzle[a] = 0
    puzzle[b] = 0
    if (countSolutions(puzzle, 2) === 1) {
      givensCount -= 2
    } else {
      puzzle[a] = savedA
      puzzle[b] = savedB
    }
  }

  // Second pass: singletons (including center 40) to reach the exact target count.
  if (givensCount > targetGivens) {
    const remaining = rng.shuffle(
      Array.from({ length: CELL_COUNT }, (_, i) => i).filter((i) => puzzle[i] !== 0),
    )
    for (const idx of remaining) {
      if (givensCount <= targetGivens) break
      const saved = puzzle[idx]!
      puzzle[idx] = 0
      if (countSolutions(puzzle, 2) === 1) {
        givensCount -= 1
      } else {
        puzzle[idx] = saved
      }
    }
  }

  return puzzle
}

function emptyNotes(): number[][] {
  return Array.from({ length: CELL_COUNT }, () => [])
}

function cloneNotes(notes: readonly (readonly number[])[]): number[][] {
  return notes.map((cell) => cell.slice())
}

function pushUndo(state: NineState): NineSnapshot[] {
  const entry: NineSnapshot = {
    values: state.values.slice(),
    notes: cloneNotes(state.notes),
  }
  const next = [...state.undoStack, entry]
  return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next
}

/** Detects duplicate digits in any row, column, or 3×3 box. */
export function getConflictsFromValues(values: readonly number[]): Set<number> {
  const conflicts = new Set<number>()

  const checkUnit = (indices: readonly number[]) => {
    const seen = new Map<number, number[]>()
    for (const idx of indices) {
      const d = values[idx]!
      if (d < 1 || d > 9) continue
      const list = seen.get(d)
      if (list) list.push(idx)
      else seen.set(d, [idx])
    }
    for (const list of seen.values()) {
      if (list.length > 1) {
        for (const idx of list) conflicts.add(idx)
      }
    }
  }

  // Rows
  for (let r = 0; r < 9; r++) {
    const row: number[] = []
    for (let c = 0; c < 9; c++) row.push(r * 9 + c)
    checkUnit(row)
  }

  // Columns
  for (let c = 0; c < 9; c++) {
    const col: number[] = []
    for (let r = 0; r < 9; r++) col.push(r * 9 + c)
    checkUnit(col)
  }

  // 3×3 Boxes
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const box: number[] = []
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          box.push((br * 3 + dr) * 9 + (bc * 3 + dc))
        }
      }
      checkUnit(box)
    }
  }

  return conflicts
}

export function getConflicts(state: NineState): Set<number> {
  return getConflictsFromValues(state.values)
}

export function isSolvedValues(values: readonly number[]): boolean {
  if (values.length !== CELL_COUNT) return false
  for (let i = 0; i < CELL_COUNT; i++) {
    const d = values[i]!
    if (d < 1 || d > 9) return false
  }
  return getConflictsFromValues(values).size === 0
}

export function getDigitCounts(values: readonly number[]): Record<number, number> {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 }
  for (let i = 0; i < values.length; i++) {
    const d = values[i]!
    if (d >= 1 && d <= 9) counts[d] = (counts[d] ?? 0) + 1
  }
  return counts
}

export function getRemainingCount(state: NineState): number {
  let empty = 0
  for (let i = 0; i < CELL_COUNT; i++) {
    if (state.values[i] === 0) empty++
  }
  return empty
}

function givensFor(difficulty: NineDifficulty, calm: number): number {
  const base = DIFFICULTY_GIVENS[difficulty]
  const easier = Object.values(DIFFICULTY_GIVENS).filter((g) => g > base)
  const ceiling = easier.length > 0 ? Math.min(...easier) - 1 : base + 6
  return Math.min(ceiling, base + Math.round(clamp01(calm) * 6))
}

export function createNine(opts: CreateNineOptions = {}): NineState {
  const seed = (opts.seed ?? 1) >>> 0
  const calm = clamp01(opts.calm ?? 0)
  const puzzleNumber = opts.puzzleNumber ?? 1
  const rng = createRng(seed)

  const solution = generateSolution(rng)
  // A chosen difficulty sets the board; calm only adds a few extra givens
  // (gentler), staying short of the next easier difficulty.
  const targetGivens = opts.difficulty ? givensFor(opts.difficulty, calm) : targetGivensForCalm(calm, rng)
  const values = carveUniquePuzzle(solution, targetGivens, rng)
  const givens = values.map((v) => v !== 0)

  return {
    ...(opts.difficulty ? { difficulty: opts.difficulty } : {}),
    puzzleNumber,
    seed,
    rngState: rng.state(),
    calm,
    solution,
    givens,
    values,
    notes: emptyNotes(),
    selected: null,
    notesMode: false,
    undoStack: [],
    moves: 0,
    hintsUsed: 0,
    solved: false,
  }
}

export function selectCell(state: NineState, idx: number | null): NineState {
  if (idx === null) {
    return state.selected === null ? state : { ...state, selected: null }
  }
  if (!Number.isInteger(idx) || idx < 0 || idx >= CELL_COUNT) return state
  if (state.selected === idx) return state
  return { ...state, selected: idx }
}

export function toggleNotesMode(state: NineState): NineState {
  return { ...state, notesMode: !state.notesMode }
}

function prunePeerNotes(notes: number[][], idx: number, digit: number): void {
  for (const peer of getPeers(idx)) {
    const list = notes[peer]!
    const pos = list.indexOf(digit)
    if (pos !== -1) {
      notes[peer] = list.filter((d) => d !== digit)
    }
  }
}

export function inputDigit(state: NineState, digit: number): NineState {
  if (state.solved) return state
  if (!Number.isInteger(digit) || digit < 1 || digit > 9) return state
  const idx = state.selected
  if (idx === null || state.givens[idx]) return state

  if (state.notesMode) {
    const nextValues = state.values.slice()
    const nextNotes = cloneNotes(state.notes)
    // If the cell currently holds a tentative digit, clear it before adding the note.
    if (nextValues[idx] !== 0) {
      nextValues[idx] = 0
    }
    const existing = nextNotes[idx]!
    if (existing.includes(digit)) {
      nextNotes[idx] = existing.filter((d) => d !== digit)
    } else {
      nextNotes[idx] = [...existing, digit].sort((a, b) => a - b)
    }
    return {
      ...state,
      values: nextValues,
      notes: nextNotes,
      undoStack: pushUndo(state),
    }
  }

  if (state.values[idx] === digit && state.notes[idx]!.length === 0) {
    return state
  }

  const nextValues = state.values.slice()
  const nextNotes = cloneNotes(state.notes)
  nextValues[idx] = digit
  nextNotes[idx] = []
  prunePeerNotes(nextNotes, idx, digit)

  const solved = isSolvedValues(nextValues)

  return {
    ...state,
    values: nextValues,
    notes: solved ? emptyNotes() : nextNotes,
    undoStack: pushUndo(state),
    moves: state.moves + 1,
    solved,
  }
}

export function eraseCell(state: NineState): NineState {
  if (state.solved) return state
  const idx = state.selected
  if (idx === null || state.givens[idx]) return state
  if (state.values[idx] === 0 && state.notes[idx]!.length === 0) return state

  const nextValues = state.values.slice()
  const nextNotes = cloneNotes(state.notes)
  nextValues[idx] = 0
  nextNotes[idx] = []

  return {
    ...state,
    values: nextValues,
    notes: nextNotes,
    undoStack: pushUndo(state),
  }
}

export function undoNine(state: NineState): NineState {
  if (state.solved || state.undoStack.length === 0) return state
  const prev = state.undoStack[state.undoStack.length - 1]!
  return {
    ...state,
    values: prev.values.slice(),
    notes: cloneNotes(prev.notes),
    undoStack: state.undoStack.slice(0, -1),
  }
}

export function hintNine(state: NineState): NineState {
  if (state.solved) return state

  let target: number | null = null

  // 1. Prefer the selected cell if it is editable and not yet correct.
  if (
    state.selected !== null &&
    !state.givens[state.selected] &&
    state.values[state.selected] !== state.solution[state.selected]
  ) {
    target = state.selected
  }

  // 2. Otherwise pick an empty cell deterministically using the engine's RNG.
  let nextRngState = state.rngState
  if (target === null) {
    const empties: number[] = []
    for (let i = 0; i < CELL_COUNT; i++) {
      if (state.values[i] === 0) empties.push(i)
    }
    if (empties.length > 0) {
      const rng = createRng(state.rngState)
      target = rng.pick(empties)
      nextRngState = rng.state()
    }
  }

  // 3. Fallback: if every cell is filled but some entry is incorrect, correct one.
  if (target === null) {
    for (let i = 0; i < CELL_COUNT; i++) {
      if (!state.givens[i] && state.values[i] !== state.solution[i]) {
        target = i
        break
      }
    }
  }

  if (target === null) return state

  const digit = state.solution[target]!
  const nextValues = state.values.slice()
  const nextNotes = cloneNotes(state.notes)
  nextValues[target] = digit
  nextNotes[target] = []
  prunePeerNotes(nextNotes, target, digit)

  const solved = isSolvedValues(nextValues)

  return {
    ...state,
    rngState: nextRngState,
    values: nextValues,
    notes: solved ? emptyNotes() : nextNotes,
    selected: target,
    undoStack: pushUndo(state),
    moves: state.moves + 1,
    hintsUsed: state.hintsUsed + 1,
    solved,
  }
}

export function restartPuzzle(state: NineState): NineState {
  const values = state.solution.map((d, i) => (state.givens[i] ? d : 0))
  return {
    ...state,
    values,
    notes: emptyNotes(),
    selected: null,
    notesMode: false,
    undoStack: [],
    moves: 0,
    hintsUsed: 0,
    solved: false,
  }
}

export function nextPuzzle(state: NineState, calm: number, difficulty = state.difficulty): NineState {
  const rng = createRng(state.rngState)
  const nextSeed = (Math.floor(rng.next() * 0xffffffff) ^ (state.puzzleNumber * 0x9e3779b9)) >>> 0
  return createNine({
    seed: nextSeed === 0 ? 1 : nextSeed,
    calm,
    ...(difficulty ? { difficulty } : {}),
    puzzleNumber: state.puzzleNumber + 1,
  })
}
