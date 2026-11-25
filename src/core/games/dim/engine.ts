/**
 * Dim — the classic "Lights Out" puzzle.
 *
 * A grid of lit stones. Pressing a stone flips it and its four orthogonal
 * neighbours. The board is clear when every light is out.
 *
 * Pure TypeScript, deterministic via createRng. Boards are made by pressing
 * random stones on a dark board, so every board is solvable. `solve` finds a
 * shortest set of presses with linear algebra over GF(2), which gives both the
 * hint and the par for the board.
 */
import { createRng, type Rng } from '../../rng'

export type DimSize = 4 | 5

export interface DimState {
  /** 5×5 normally, 4×4 when calm >= CALM_THRESHOLD. */
  size: DimSize
  /** Row-major, 1 = lit, 0 = dark. */
  lights: number[]
  /** The board as dealt, for restarting. */
  initialLights: number[]
  /** Fewest presses that clear the dealt board. */
  par: number
  moves: number
  /** 1-based board number. */
  puzzleNumber: number
  solved: boolean
  /** Saved RNG state so the next board is deterministic. */
  rngState: number
}

export interface CreateDimOptions {
  seed?: number
  calm?: number
  puzzleNumber?: number
}

export const CALM_THRESHOLD = 0.55

export function sizeForCalm(calm: number): DimSize {
  return calm >= CALM_THRESHOLD ? 4 : 5
}

/** Indices a press at `index` flips: the stone and its orthogonal neighbours. */
export function pressFootprint(size: number, index: number): number[] {
  const r = Math.floor(index / size)
  const c = index % size
  const out = [index]
  if (r > 0) out.push(index - size)
  if (r < size - 1) out.push(index + size)
  if (c > 0) out.push(index - 1)
  if (c < size - 1) out.push(index + 1)
  return out
}

function applyPress(lights: number[], size: number, index: number): void {
  for (const i of pressFootprint(size, index)) lights[i] = lights[i] ? 0 : 1
}

export function litCount(lights: readonly number[]): number {
  let n = 0
  for (const v of lights) if (v) n++
  return n
}

/**
 * A shortest set of presses that turns every light out, or null when the
 * board cannot be cleared (only possible for hand-made boards on 4×4/5×5).
 *
 * Solves A·x = lights over GF(2) by Gaussian elimination, then tries every
 * combination of the null space (dimension 2 on 5×5, 4 on 4×4) to keep the
 * smallest solution.
 */
export function solve(lights: readonly number[], size: number): number[] | null {
  const n = size * size
  // Augmented matrix rows as bit arrays: n columns + 1 for the right-hand side.
  const rows: number[][] = []
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(n + 1).fill(0)
    for (const j of pressFootprint(size, i)) row[j] = 1
    row[n] = lights[i] ? 1 : 0
    rows.push(row)
  }
  const pivotCol: number[] = []
  let r = 0
  for (let c = 0; c < n && r < n; c++) {
    let p = r
    while (p < n && !rows[p]![c]) p++
    if (p === n) continue
    ;[rows[r], rows[p]] = [rows[p]!, rows[r]!]
    for (let k = 0; k < n; k++) {
      if (k !== r && rows[k]![c]) {
        const a = rows[k]!
        const b = rows[r]!
        for (let j = c; j <= n; j++) a[j] = a[j]! ^ b[j]!
      }
    }
    pivotCol.push(c)
    r++
  }
  for (let k = r; k < n; k++) if (rows[k]![n]) return null

  const isPivot = new Array<boolean>(n).fill(false)
  for (const c of pivotCol) isPivot[c] = true
  const free: number[] = []
  for (let c = 0; c < n; c++) if (!isPivot[c]) free.push(c)

  let best: number[] | null = null
  for (let mask = 0; mask < 1 << free.length; mask++) {
    const x = new Array<number>(n).fill(0)
    free.forEach((c, k) => {
      x[c] = (mask >> k) & 1
    })
    for (let k = 0; k < pivotCol.length; k++) {
      const row = rows[k]!
      let v = row[n]!
      for (const c of free) if (row[c] && x[c]) v ^= 1
      x[pivotCol[k]!] = v
    }
    const presses: number[] = []
    for (let i = 0; i < n; i++) if (x[i]) presses.push(i)
    if (!best || presses.length < best.length) best = presses
  }
  return best
}

function deal(size: DimSize, rng: Rng, calm: number): { lights: number[]; par: number } {
  const n = size * size
  const c = Math.min(1, Math.max(0, calm))
  // Fewer scramble presses as calm rises: 5×5 ~9 -> 6, 4×4 ~6 -> 4.
  const presses = size === 5 ? Math.round(9 - c * 3) : Math.round(6 - c * 2)
  for (let attempt = 0; attempt < 40; attempt++) {
    const lights = new Array<number>(n).fill(0)
    const order = rng.shuffle(Array.from({ length: n }, (_, i) => i))
    for (let k = 0; k < presses; k++) applyPress(lights, size, order[k]!)
    const par = solve(lights, size)?.length ?? 0
    // Keep boards with real work in them and enough light to read.
    if (par >= Math.max(3, presses - 2) && litCount(lights) >= 5) return { lights, par }
  }
  const lights = new Array<number>(n).fill(0)
  for (const i of [0, n - 1, Math.floor(n / 2)]) applyPress(lights, size, i)
  return { lights, par: solve(lights, size)?.length ?? 3 }
}

export function createDim(opts: CreateDimOptions = {}): DimState {
  const calm = opts.calm ?? 0
  const size = sizeForCalm(calm)
  const rng = createRng(opts.seed ?? 1)
  const { lights, par } = deal(size, rng, calm)
  return {
    size,
    lights,
    initialLights: lights.slice(),
    par,
    moves: 0,
    puzzleNumber: opts.puzzleNumber ?? 1,
    solved: false,
    rngState: rng.state(),
  }
}

/** Press the stone at `index`. Returns the same reference when nothing changes. */
export function press(state: DimState, index: number): DimState {
  if (state.solved || index < 0 || index >= state.lights.length) return state
  const lights = state.lights.slice()
  applyPress(lights, state.size, index)
  return { ...state, lights, moves: state.moves + 1, solved: litCount(lights) === 0 }
}

/** A stone that belongs to a shortest way out from here, or null when solved. */
export function hint(state: DimState): number | null {
  if (state.solved) return null
  const presses = solve(state.lights, state.size)
  if (!presses || presses.length === 0) return null
  // Prefer a lit stone so the hint reads naturally.
  return presses.find((i) => state.lights[i]) ?? presses[0]!
}

export function restartPuzzle(state: DimState): DimState {
  return { ...state, lights: state.initialLights.slice(), moves: 0, solved: false }
}

export function nextPuzzle(state: DimState, calm = 0): DimState {
  return createDim({ seed: state.rngState, calm, puzzleNumber: state.puzzleNumber + 1 })
}
