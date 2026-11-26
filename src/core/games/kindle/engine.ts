/**
 * Kindle — classic 2048 engine.
 *
 * Pure TypeScript, zero DOM/React, deterministic via createRng.
 * Tracks stable tile IDs and merge provenance so the UI can glide every tile
 * smoothly across the 4×4 hearth.
 */
import { createRng } from '../../rng'

export const GRID_SIZE = 4
export const MAX_UNDO = 12
export const TARGET_VALUE = 2048

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface Tile {
  id: number
  value: number
  row: number
  col: number
  /** The two pre-move tiles that combined to form this tile on the latest move. */
  mergedFrom?: [Tile, Tile]
  /** True only on the turn this tile was spawned. */
  isNew?: boolean
}

export interface KindleSnapshot {
  tiles: Tile[]
  score: number
  bestTile: number
  moves: number
  reached2048: boolean
  nextId: number
  rngState: number
}

export interface KindleState {
  tiles: Tile[]
  score: number
  bestTile: number
  moves: number
  reached2048: boolean
  stuck: boolean
  /** Monotonic transition counter for UI feedback and animation keys. */
  moveSeq: number
  /** Highest merged tile value created by the latest move (0 if none). */
  lastMergeMax: number
  /** True only on the exact move that first reached 2048. */
  justReached2048: boolean
  /** Tiles gently extinguished by the most recent makeRoom action. */
  extinguished?: Tile[]
  nextId: number
  rngState: number
  history: KindleSnapshot[]
}

export interface CreateKindleOptions {
  seed?: number
  calm?: number
}

export type KindleAction =
  | { type: 'move'; dir: Direction; calm: number }
  | { type: 'undo' }
  | { type: 'makeRoom' }
  | { type: 'restart'; seed?: number; calm?: number }

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/**
 * Probability of spawning a 4 instead of a 2.
 * At calm = 0: 10% (90% 2 / 10% 4).
 * At calm = 1: 3%  (97% 2 / 3% 4) for gentler, lower-friction boards.
 */
export function fourSpawnProbability(calm: number): number {
  const c = clamp01(calm)
  return 0.1 - 0.07 * c
}

function stripTileMeta(tile: Tile): Tile {
  return {
    id: tile.id,
    value: tile.value,
    row: tile.row,
    col: tile.col,
  }
}

function maxTileValue(tiles: readonly Tile[]): number {
  let max = 0
  for (const t of tiles) {
    if (t.value > max) max = t.value
  }
  return max
}

function makeSnapshot(state: KindleState): KindleSnapshot {
  return {
    tiles: state.tiles.map(stripTileMeta),
    score: state.score,
    bestTile: state.bestTile,
    moves: state.moves,
    reached2048: state.reached2048,
    nextId: state.nextId,
    rngState: state.rngState,
  }
}

function pushHistory(history: readonly KindleSnapshot[], snap: KindleSnapshot): KindleSnapshot[] {
  const next = history.length >= MAX_UNDO ? history.slice(history.length - MAX_UNDO + 1) : history.slice()
  next.push(snap)
  return next
}

function buildGrid(tiles: readonly Tile[]): (Tile | null)[][] {
  const grid: (Tile | null)[][] = Array.from({ length: GRID_SIZE }, () =>
    Array<Tile | null>(GRID_SIZE).fill(null),
  )
  for (const tile of tiles) {
    if (tile.row >= 0 && tile.row < GRID_SIZE && tile.col >= 0 && tile.col < GRID_SIZE) {
      grid[tile.row]![tile.col] = tile
    }
  }
  return grid
}

function getEmptyCells(tiles: readonly Tile[]): Array<{ row: number; col: number }> {
  const occupied = new Uint8Array(GRID_SIZE * GRID_SIZE)
  for (const t of tiles) {
    occupied[t.row * GRID_SIZE + t.col] = 1
  }
  const empty: Array<{ row: number; col: number }> = []
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (!occupied[row * GRID_SIZE + col]) {
        empty.push({ row, col })
      }
    }
  }
  return empty
}

/** True when all 16 cells are full and no orthogonally adjacent tiles share a value. */
export function isStuck(tiles: readonly Tile[]): boolean {
  if (tiles.length < GRID_SIZE * GRID_SIZE) return false
  const grid = buildGrid(tiles)
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const cell = grid[row]![col]
      if (!cell) return false
      if (col + 1 < GRID_SIZE) {
        const right = grid[row]![col + 1]
        if (right && right.value === cell.value) return false
      }
      if (row + 1 < GRID_SIZE) {
        const down = grid[row + 1]![col]
        if (down && down.value === cell.value) return false
      }
    }
  }
  return true
}

/** Create a fresh 4×4 Kindle board with two opening ember tiles. */
export function createKindle(opts: CreateKindleOptions = {}): KindleState {
  const seed = opts.seed ?? (Date.now() >>> 0)
  const calm = clamp01(opts.calm ?? 0)
  const rng = createRng(seed)
  const fourProb = fourSpawnProbability(calm)

  const tiles: Tile[] = []
  let nextId = 1

  for (let i = 0; i < 2; i++) {
    const empty = getEmptyCells(tiles)
    const cell = rng.pick(empty)
    const value = rng.next() < fourProb ? 4 : 2
    tiles.push({
      id: nextId++,
      value,
      row: cell.row,
      col: cell.col,
      isNew: true,
    })
  }

  const bestTile = maxTileValue(tiles)

  return {
    tiles,
    score: 0,
    bestTile,
    moves: 0,
    reached2048: bestTile >= TARGET_VALUE,
    stuck: false,
    moveSeq: 0,
    lastMergeMax: 0,
    justReached2048: false,
    nextId,
    rngState: rng.state(),
    history: [],
  }
}

/**
 * Slide and merge tiles in the given direction.
 *
 * Returns the exact same state reference if no tile moved or merged.
 * Otherwise spawns one new tile on a random empty cell using createRng.
 */
export function move(state: KindleState, dir: Direction, calm = 0): KindleState {
  const grid = buildGrid(state.tiles)
  const nextTiles: Tile[] = []
  let nextId = state.nextId
  let moved = false
  let scoreGain = 0
  let lastMergeMax = 0

  for (let lineIndex = 0; lineIndex < GRID_SIZE; lineIndex++) {
    const line: Tile[] = []
    for (let step = 0; step < GRID_SIZE; step++) {
      const { row, col } = coordsFor(dir, lineIndex, step)
      const tile = grid[row]![col]
      if (tile) line.push(tile)
    }

    let slot = 0
    let i = 0
    while (i < line.length) {
      const first = line[i]!
      const second = i + 1 < line.length ? line[i + 1]! : null
      const dest = coordsFor(dir, lineIndex, slot)

      if (second && first.value === second.value) {
        const mergedValue = first.value * 2
        nextTiles.push({
          id: nextId++,
          value: mergedValue,
          row: dest.row,
          col: dest.col,
          mergedFrom: [stripTileMeta(first), stripTileMeta(second)],
        })
        scoreGain += mergedValue
        if (mergedValue > lastMergeMax) lastMergeMax = mergedValue
        moved = true
        i += 2
      } else {
        if (first.row !== dest.row || first.col !== dest.col) {
          moved = true
        }
        nextTiles.push({
          id: first.id,
          value: first.value,
          row: dest.row,
          col: dest.col,
        })
        i += 1
      }
      slot += 1
    }
  }

  if (!moved) return state

  const rng = createRng(state.rngState)
  const empty = getEmptyCells(nextTiles)
  if (empty.length > 0) {
    const cell = rng.pick(empty)
    const value = rng.next() < fourSpawnProbability(calm) ? 4 : 2
    nextTiles.push({
      id: nextId++,
      value,
      row: cell.row,
      col: cell.col,
      isNew: true,
    })
  }

  const nextBestTile = Math.max(state.bestTile, maxTileValue(nextTiles))
  const nextReached2048 = state.reached2048 || nextBestTile >= TARGET_VALUE
  const justReached2048 = !state.reached2048 && nextReached2048

  return {
    tiles: nextTiles,
    score: state.score + scoreGain,
    bestTile: nextBestTile,
    moves: state.moves + 1,
    reached2048: nextReached2048,
    stuck: isStuck(nextTiles),
    moveSeq: state.moveSeq + 1,
    lastMergeMax,
    justReached2048,
    nextId,
    rngState: rng.state(),
    history: pushHistory(state.history, makeSnapshot(state)),
  }
}

function coordsFor(dir: Direction, lineIndex: number, step: number): { row: number; col: number } {
  switch (dir) {
    case 'left':
      return { row: lineIndex, col: step }
    case 'right':
      return { row: lineIndex, col: GRID_SIZE - 1 - step }
    case 'up':
      return { row: step, col: lineIndex }
    case 'down':
      return { row: GRID_SIZE - 1 - step, col: lineIndex }
  }
}

/** Restore the previous board snapshot from the undo stack (up to 12 steps). */
export function undoKindle(state: KindleState): KindleState {
  if (state.history.length === 0) return state
  const prev = state.history[state.history.length - 1]!
  const remainingHistory = state.history.slice(0, -1)
  const restoredTiles = prev.tiles.map(stripTileMeta)

  return {
    tiles: restoredTiles,
    score: prev.score,
    bestTile: prev.bestTile,
    moves: prev.moves,
    reached2048: prev.reached2048,
    stuck: isStuck(restoredTiles),
    moveSeq: state.moveSeq + 1,
    lastMergeMax: 0,
    justReached2048: false,
    nextId: prev.nextId,
    rngState: prev.rngState,
    history: remainingHistory,
  }
}

/**
 * Sleep-friendly gentle unstick: when the board is stuck, quietly extinguishes
 * the 2 lowest-value tiles into embers so play can continue peacefully.
 * Returns the same state reference if the board is not stuck or has ≤ 2 tiles.
 */
export function makeRoom(state: KindleState): KindleState {
  if (!state.stuck || state.tiles.length <= 2) return state

  const sorted = state.tiles
    .map(stripTileMeta)
    .sort((a, b) => a.value - b.value || a.row - b.row || a.col - b.col || a.id - b.id)

  const extinguished = sorted.slice(0, 2)
  const removeIds = new Set(extinguished.map((t) => t.id))
  const remaining = state.tiles.filter((t) => !removeIds.has(t.id)).map(stripTileMeta)
  const nextBestTile = Math.max(maxTileValue(remaining), state.bestTile)

  return {
    tiles: remaining,
    score: state.score,
    bestTile: nextBestTile,
    moves: state.moves,
    reached2048: state.reached2048,
    stuck: isStuck(remaining),
    moveSeq: state.moveSeq + 1,
    lastMergeMax: 0,
    justReached2048: false,
    extinguished,
    nextId: state.nextId,
    rngState: state.rngState,
    history: pushHistory(state.history, makeSnapshot(state)),
  }
}

/** Convenience reducer matching the Inverna engine contract. */
export function kindleReducer(state: KindleState, action: KindleAction): KindleState {
  switch (action.type) {
    case 'move':
      return move(state, action.dir, action.calm)
    case 'undo':
      return undoKindle(state)
    case 'makeRoom':
      return makeRoom(state)
    case 'restart':
      return createKindle({ seed: action.seed, calm: action.calm })
  }
}
