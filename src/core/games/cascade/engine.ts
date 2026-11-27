/**
 * Cascade — classic SameGame / Cluster Collapse with 2D rigid-body tumbling tiles.
 *
 * Pure TypeScript, zero DOM/React, deterministic via createRng.
 * Coordinates are normalised in grid-cell units (col = 0..cols-1, row = 0..rows-1)
 * so physics are completely resolution-independent and Expo/Skia-ready.
 */
import { createRng, type Rng } from '../../rng'

export type CascadeColor = 'clay' | 'ochre' | 'straw' | 'sage' | 'bone'

export const ALL_COLORS: readonly CascadeColor[] = ['clay', 'ochre', 'straw', 'sage', 'bone']
export const CALM_COLORS: readonly CascadeColor[] = ['clay', 'ochre', 'straw', 'bone']

export const MAX_UNDO = 12
export const WOBBLE_DURATION_MS = 260
export const MAX_RIPPLE_DELAY_MS = 260
export const RIPPLE_STEP_MS = 28

export interface CellCoord {
  row: number
  col: number
}

export interface StandingTile {
  id: number
  color: CascadeColor
  row: number
  col: number
  /** Visual horizontal position in grid-cell units. */
  x: number
  /** Visual vertical position in grid-cell units. */
  y: number
  vx: number
  vy: number
}

export interface FallingTile {
  id: number
  color: CascadeColor
  /** Top-left visual position in grid-cell units. */
  x: number
  y: number
  vx: number
  vy: number
  /** Rotation in radians around tile center. */
  angle: number
  /** Angular velocity in rad/s. */
  omega: number
  /** Remaining ripple stagger delay in ms before launching. */
  delayMs: number
  /** Visual scale (subtly lifts on launch). */
  scale: number
  /** Opacity 0..1 (fades gracefully below bottom edge). */
  alpha: number
}

export interface WobbleState {
  id: number
  ageMs: number
}

export interface CascadeSnapshot {
  grid: (CascadeColor | null)[][]
  score: number
  cleared: number
  clustersCleared: number
}

export interface CascadeState {
  rows: number
  cols: number
  colors: CascadeColor[]
  board: (StandingTile | null)[][]
  falling: FallingTile[]
  score: number
  cleared: number
  clustersCleared: number
  boardsCleared: number
  boardComplete: boolean
  wobble: WobbleState | null
  undo: CascadeSnapshot[]
  initialGrid: (CascadeColor | null)[][]
  rngState: number
  nextId: number
  lastTapCount: number
  lastTapEventId: number
  lastAutoReleaseCount: number
  lastCompleteEventId: number
}

export interface CascadeConfig {
  cols: number
  rows: number
  colors: CascadeColor[]
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/** Board dimensions and palette size soften smoothly as bedtime calm rises. */
export function gridConfigForCalm(calm: number): CascadeConfig {
  const c = clamp01(calm)
  if (c >= 0.75) {
    return { cols: 7, rows: 9, colors: [...CALM_COLORS] }
  }
  if (c >= 0.45) {
    return { cols: 8, rows: 10, colors: [...CALM_COLORS] }
  }
  return { cols: 9, rows: 11, colors: [...ALL_COLORS] }
}

/** Extract a plain serialisable color grid from a board of StandingTiles. */
function boardToColorGrid(board: readonly (readonly (StandingTile | null)[])[]): (CascadeColor | null)[][] {
  return board.map((row) => row.map((cell) => (cell ? cell.color : null)))
}

/** Build settled StandingTiles from a plain color grid. */
function colorGridToBoard(
  grid: readonly (readonly (CascadeColor | null)[])[],
  startId: number,
): { board: (StandingTile | null)[][]; nextId: number } {
  let id = startId
  const board: (StandingTile | null)[][] = grid.map((row, r) =>
    row.map((color, c) =>
      color
        ? {
            id: id++,
            color,
            row: r,
            col: c,
            x: c,
            y: r,
            vx: 0,
            vy: 0,
          }
        : null,
    ),
  )
  return { board, nextId: id }
}

function countPlayableClustersInGrid(grid: readonly (readonly (CascadeColor | null)[])[]): number {
  const rows = grid.length
  const cols = rows > 0 ? grid[0]!.length : 0
  const visited: boolean[][] = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false))
  let clusters = 0

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (visited[r]![c]) continue
      const color = grid[r]![c]
      if (!color) continue
      const stack: CellCoord[] = [{ row: r, col: c }]
      visited[r]![c] = true
      let size = 0

      while (stack.length > 0) {
        const cur = stack.pop()!
        size++
        const dirs = [
          [cur.row - 1, cur.col],
          [cur.row + 1, cur.col],
          [cur.row, cur.col - 1],
          [cur.row, cur.col + 1],
        ]
        for (const [nr, nc] of dirs) {
          if (nr! < 0 || nr! >= rows || nc! < 0 || nc! >= cols) continue
          if (visited[nr!]![nc!]) continue
          if (grid[nr!]![nc!] === color) {
            visited[nr!]![nc!] = true
            stack.push({ row: nr!, col: nc! })
          }
        }
      }
      if (size >= 2) clusters++
    }
  }
  return clusters
}

function generateGrid(rows: number, cols: number, colors: readonly CascadeColor[], rng: Rng, calm: number): CascadeColor[][] {
  const minClusters = Math.max(4, Math.floor((rows * cols) / 14))
  // Gentle neighbour affinity that rises slightly with calm so clusters feel organic and inviting.
  const affinity = 0.06 + clamp01(calm) * 0.12

  for (let attempt = 0; attempt < 24; attempt++) {
    const grid: CascadeColor[][] = Array.from({ length: rows }, () => new Array<CascadeColor>(cols))
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const neighbours: CascadeColor[] = []
        if (r > 0) neighbours.push(grid[r - 1]![c]!)
        if (c > 0) neighbours.push(grid[r]![c - 1]!)
        if (neighbours.length > 0 && rng.next() < affinity) {
          grid[r]![c] = rng.pick(neighbours)
        } else {
          grid[r]![c] = rng.pick(colors)
        }
      }
    }

    if (countPlayableClustersInGrid(grid) >= minClusters) {
      return grid
    }
  }

  // Deterministic fallback: seed several clean 2-3 tile clusters so the board is never dead.
  const fallback: CascadeColor[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => rng.pick(colors)),
  )
  for (let r = 0; r < rows - 1; r += 2) {
    for (let c = 0; c < cols - 1; c += 3) {
      const tone = fallback[r]![c]!
      fallback[r]![c + 1] = tone
      if (r + 1 < rows) fallback[r + 1]![c] = tone
    }
  }
  return fallback
}

/** Create a brand-new Cascade board for the given deterministic seed and calm level. */
export function createCascade(opts: { seed: number; calm: number; boardsCleared?: number }): CascadeState {
  const { cols, rows, colors } = gridConfigForCalm(opts.calm)
  const rng = createRng(opts.seed)
  const initialColors = generateGrid(rows, cols, colors, rng, opts.calm)
  const initialGrid: (CascadeColor | null)[][] = initialColors.map((row) => row.slice())
  const { board, nextId } = colorGridToBoard(initialGrid, 1)

  return {
    rows,
    cols,
    colors,
    board,
    falling: [],
    score: 0,
    cleared: 0,
    clustersCleared: 0,
    boardsCleared: opts.boardsCleared ?? 0,
    boardComplete: false,
    wobble: null,
    undo: [],
    initialGrid,
    rngState: rng.state(),
    nextId,
    lastTapCount: 0,
    lastTapEventId: 0,
    lastAutoReleaseCount: 0,
    lastCompleteEventId: 0,
  }
}

/** Count remaining standing tiles on the board. */
export function remainingTiles(state: CascadeState): number {
  let count = 0
  for (let r = 0; r < state.rows; r++) {
    const row = state.board[r]!
    for (let c = 0; c < state.cols; c++) {
      if (row[c] !== null) count++
    }
  }
  return count
}

/**
 * Flood-fill orthogonally connected same-colour tiles starting at (row, col).
 * Ignores diagonals and empty cells.
 */
export function findCluster(state: CascadeState, row: number, col: number): CellCoord[] {
  if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return []
  const origin = state.board[row]?.[col]
  if (!origin) return []

  const targetColor = origin.color
  const visited: boolean[][] = Array.from({ length: state.rows }, () => Array<boolean>(state.cols).fill(false))
  const queue: CellCoord[] = [{ row, col }]
  const cluster: CellCoord[] = []
  visited[row]![col] = true

  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]!
    cluster.push(cur)

    const neighbours: readonly [number, number][] = [
      [cur.row - 1, cur.col],
      [cur.row + 1, cur.col],
      [cur.row, cur.col - 1],
      [cur.row, cur.col + 1],
    ]
    for (const [nr, nc] of neighbours) {
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue
      if (visited[nr]![nc]) continue
      const tile = state.board[nr]![nc]
      if (tile && tile.color === targetColor) {
        visited[nr]![nc] = true
        queue.push({ row: nr, col: nc })
      }
    }
  }

  return cluster
}

/** Returns true if at least one orthogonally adjacent same-colour pair remains. */
export function hasPlayableCluster(state: CascadeState): boolean {
  for (let r = 0; r < state.rows; r++) {
    const row = state.board[r]!
    const nextRow = r + 1 < state.rows ? state.board[r + 1]! : null
    for (let c = 0; c < state.cols; c++) {
      const tile = row[c]
      if (!tile) continue
      if (c + 1 < state.cols) {
        const right = row[c + 1]
        if (right && right.color === tile.color) return true
      }
      if (nextRow) {
        const down = nextRow[c]
        if (down && down.color === tile.color) return true
      }
    }
  }
  return false
}

function createFallingTile(
  tile: StandingTile,
  tapCenterX: number,
  delayMs: number,
  rng: Rng,
): FallingTile {
  const dx = tile.x - tapCenterX
  // Tactile outward-upward pop with gentle horizontal kick away from tap centre + variance.
  const vy = -(2.2 + rng.next() * 2.0)
  const vx = dx * 0.55 + (rng.next() - 0.5) * 1.9
  const omegaDir = dx > 0.05 ? 1 : dx < -0.05 ? -1 : rng.next() < 0.5 ? -1 : 1
  const omega = omegaDir * (1.4 + rng.next() * 2.4)

  return {
    id: tile.id,
    color: tile.color,
    x: tile.x,
    y: tile.y,
    vx,
    vy,
    angle: 0,
    omega,
    delayMs: Math.min(MAX_RIPPLE_DELAY_MS, Math.max(0, delayMs)),
    scale: 1,
    alpha: 1,
  }
}

/**
 * Collapse each column downward to fill vertical gaps, then compact all
 * non-empty columns smoothly toward the left so no empty columns remain between them.
 */
function collapseBoard(
  board: (StandingTile | null)[][],
  rows: number,
  cols: number,
): (StandingTile | null)[][] {
  // 1. Vertical drop within each column.
  const nonEmptyCols: (StandingTile | null)[][] = []
  for (let c = 0; c < cols; c++) {
    const tilesInCol: StandingTile[] = []
    for (let r = rows - 1; r >= 0; r--) {
      const tile = board[r]![c]
      if (tile) tilesInCol.push(tile)
    }
    if (tilesInCol.length > 0) {
      const colArr = new Array<StandingTile | null>(rows).fill(null)
      for (let i = 0; i < tilesInCol.length; i++) {
        const targetRow = rows - 1 - i
        const t = tilesInCol[i]!
        colArr[targetRow] = { ...t, row: targetRow }
      }
      nonEmptyCols.push(colArr)
    }
  }

  // 2. Horizontal compaction left into columns 0 .. nonEmptyCols.length - 1.
  const nextBoard: (StandingTile | null)[][] = Array.from({ length: rows }, () =>
    new Array<StandingTile | null>(cols).fill(null),
  )

  for (let newCol = 0; newCol < nonEmptyCols.length; newCol++) {
    const colArr = nonEmptyCols[newCol]!
    for (let r = 0; r < rows; r++) {
      const t = colArr[r]
      if (t) {
        nextBoard[r]![newCol] = { ...t, row: r, col: newCol }
      }
    }
  }

  return nextBoard
}

/**
 * Release all remaining isolated stragglers together in one staggered waterfall tumble,
 * leaving pure obsidian void and marking the board complete.
 */
export function releaseRemaining(state: CascadeState, baseDelayMs = 0): CascadeState {
  if (state.boardComplete) return state

  const rng = createRng(state.rngState)
  const stragglers: StandingTile[] = []
  for (let r = state.rows - 1; r >= 0; r--) {
    for (let c = 0; c < state.cols; c++) {
      const tile = state.board[r]![c]
      if (tile) stragglers.push(tile)
    }
  }

  const centerCol = (state.cols - 1) / 2
  const addedFalling: FallingTile[] = stragglers.map((tile, idx) => {
    const waveDelay = baseDelayMs + Math.min(220, idx * 24)
    return createFallingTile(tile, centerCol, waveDelay, rng)
  })

  const emptyBoard: (StandingTile | null)[][] = Array.from({ length: state.rows }, () =>
    new Array<StandingTile | null>(state.cols).fill(null),
  )

  return {
    ...state,
    board: emptyBoard,
    falling: [...state.falling, ...addedFalling],
    cleared: state.cleared + stragglers.length,
    boardsCleared: state.boardsCleared + 1,
    boardComplete: true,
    wobble: null,
    rngState: rng.state(),
    lastAutoReleaseCount: stragglers.length,
    lastCompleteEventId: state.lastCompleteEventId + 1,
  }
}

/**
 * Tap a cell on the mosaic.
 * - Cluster >= 2: pushes undo snapshot, detaches cluster into staggered falling tiles,
 *   collapses columns vertically and horizontally, scores n*(n-1), and auto-releases
 *   stragglers if no playable clusters remain.
 * - Cluster === 1: triggers non-punitive micro-shudder wobble (or releases stragglers
 *   if somehow no playable moves remain).
 */
/**
 * True while standing tiles are still sliding into their places: the board
 * on screen isn't where the rules say yet. Tumbling debris doesn't count.
 */
export function boardSettling(state: CascadeState): boolean {
  for (const row of state.board) {
    for (const t of row) {
      if (t && (Math.abs(t.row - t.y) > 0.05 || Math.abs(t.col - t.x) > 0.05)) return true
    }
  }
  return false
}

export function tapCell(state: CascadeState, row: number, col: number): CascadeState {
  if (state.boardComplete) return state
  if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return state
  const tapped = state.board[row]![col]
  if (!tapped) return state

  const cluster = findCluster(state, row, col)
  if (cluster.length === 0) return state

  if (cluster.length === 1) {
    if (!hasPlayableCluster(state)) {
      return releaseRemaining(state, 0)
    }
    return {
      ...state,
      wobble: { id: tapped.id, ageMs: 0 },
    }
  }

  // Push plain snapshot onto 12-step undo stack.
  const snapshot: CascadeSnapshot = {
    grid: boardToColorGrid(state.board),
    score: state.score,
    cleared: state.cleared,
    clustersCleared: state.clustersCleared,
  }
  const nextUndo = [...state.undo, snapshot].slice(-MAX_UNDO)

  const rng = createRng(state.rngState)
  const workingBoard: (StandingTile | null)[][] = state.board.map((r) => r.slice())

  // Compute horizontal centre of the tapped cluster (weighted toward tap point) for crisp outward scatter.
  let sumX = 0
  for (const cell of cluster) {
    sumX += workingBoard[cell.row]![cell.col]!.x
  }
  const clusterCenterX = sumX / cluster.length
  const tapCenterX = (tapped.x + clusterCenterX) * 0.5

  const detached: FallingTile[] = []
  for (const cell of cluster) {
    const tile = workingBoard[cell.row]![cell.col]!
    const manhattan = Math.abs(cell.row - row) + Math.abs(cell.col - col)
    const delayMs = Math.min(MAX_RIPPLE_DELAY_MS, manhattan * RIPPLE_STEP_MS)
    detached.push(createFallingTile(tile, tapCenterX, delayMs, rng))
    workingBoard[cell.row]![cell.col] = null
  }

  const collapsedBoard = collapseBoard(workingBoard, state.rows, state.cols)
  const n = cluster.length
  const points = n * (n - 1)

  const afterTap: CascadeState = {
    ...state,
    board: collapsedBoard,
    falling: [...state.falling, ...detached],
    score: state.score + points,
    cleared: state.cleared + n,
    clustersCleared: state.clustersCleared + 1,
    wobble: null,
    undo: nextUndo,
    rngState: rng.state(),
    lastTapCount: n,
    lastTapEventId: state.lastTapEventId + 1,
  }

  if (!hasPlayableCluster(afterTap)) {
    const leftover = remainingTiles(afterTap)
    if (leftover > 0) {
      return releaseRemaining(afterTap, 80)
    }
    return {
      ...afterTap,
      boardsCleared: afterTap.boardsCleared + 1,
      boardComplete: true,
      lastAutoReleaseCount: 0,
      lastCompleteEventId: afterTap.lastCompleteEventId + 1,
    }
  }

  return afterTap
}

/** Step back one move from the 12-step undo stack. */
export function undoCascade(state: CascadeState): CascadeState {
  if (state.undo.length === 0) return state
  const snapshot = state.undo[state.undo.length - 1]!
  const nextUndo = state.undo.slice(0, -1)
  const { board, nextId } = colorGridToBoard(snapshot.grid, state.nextId)

  return {
    ...state,
    board,
    falling: [],
    score: snapshot.score,
    cleared: snapshot.cleared,
    clustersCleared: snapshot.clustersCleared,
    boardsCleared: state.boardComplete ? Math.max(0, state.boardsCleared - 1) : state.boardsCleared,
    boardComplete: false,
    wobble: null,
    undo: nextUndo,
    nextId,
  }
}

/** Restart the current board from move zero. */
export function restartBoard(state: CascadeState): CascadeState {
  const { board, nextId } = colorGridToBoard(state.initialGrid, state.nextId)
  return {
    ...state,
    board,
    falling: [],
    score: 0,
    cleared: 0,
    clustersCleared: 0,
    boardComplete: false,
    wobble: null,
    undo: [],
    nextId,
    lastTapCount: 0,
    lastAutoReleaseCount: 0,
  }
}

/** Advance to a freshly generated board at the current calm level. */
export function nextBoard(state: CascadeState, calm: number): CascadeState {
  // Advance RNG slightly so repeated nextBoard calls always diverge cleanly.
  const rng = createRng(state.rngState ^ 0x9e3779b9)
  const nextSeed = (rng.state() + Math.floor(rng.next() * 0xffffffff)) >>> 0
  return createCascade({
    seed: nextSeed,
    calm,
    boardsCleared: state.boardsCleared,
  })
}

/**
 * Strip ephemeral physics particles & snap standing tiles to exact settled positions
 * before writing to persistent storage.
 */
export function stripEphemeralForSave(state: CascadeState): CascadeState {
  const settledBoard: (StandingTile | null)[][] = state.board.map((row, r) =>
    row.map((tile, c) =>
      tile
        ? {
            ...tile,
            row: r,
            col: c,
            x: c,
            y: r,
            vx: 0,
            vy: 0,
          }
        : null,
    ),
  )

  return {
    ...state,
    board: settledBoard,
    falling: [],
    wobble: null,
  }
}

/**
 * Advance rigid-body tumbling physics, standing tile settling, and micro-wobble.
 * Returns the same state reference when completely at rest.
 */
export function tickCascade(state: CascadeState, dtMs: number, calm: number): CascadeState {
  if (dtMs <= 0) return state
  const clampedMs = Math.min(100, dtMs)
  const dt = clampedMs / 1000
  const c = clamp01(calm)

  // Gentle tumbling gravity: 19.5 cells/s² at calm=0 -> 15.0 cells/s² at calm=1.
  const fallGravity = 19.5 - c * 4.5
  // Crisp settling gravity for standing tiles dropping into gaps (zero bouncing).
  const settleGravity = 34 - c * 8
  // Smooth horizontal compaction rate.
  const slideRate = 14 - c * 3

  let changed = false

  // 1. Update standing tiles settling into their target (row, col).
  let nextBoard: (StandingTile | null)[][] | null = null
  for (let r = 0; r < state.rows; r++) {
    const row = state.board[r]!
    for (let col = 0; col < state.cols; col++) {
      const tile = row[col]
      if (!tile) continue

      const dy = tile.row - tile.y
      const dx = tile.col - tile.x
      const movingY = Math.abs(dy) > 0.001 || Math.abs(tile.vy) > 0.001
      const movingX = Math.abs(dx) > 0.001 || Math.abs(tile.vx) > 0.001
      if (!movingY && !movingX) continue

      let ny = tile.y
      let nvy = tile.vy
      if (movingY) {
        if (dy > 0) {
          nvy = Math.min(28, tile.vy + settleGravity * dt)
          ny = tile.y + nvy * dt
          if (ny >= tile.row) {
            ny = tile.row
            nvy = 0
          }
        } else {
          // Ease smoothly if ever above/below target.
          const factor = 1 - Math.exp(-slideRate * dt)
          ny = tile.y + dy * factor
          nvy = 0
          if (Math.abs(tile.row - ny) < 0.004) ny = tile.row
        }
      }

      let nx = tile.x
      let nvx = tile.vx
      if (movingX) {
        const factor = 1 - Math.exp(-slideRate * dt)
        nx = tile.x + dx * factor
        nvx = (nx - tile.x) / Math.max(dt, 1e-4)
        if (Math.abs(tile.col - nx) < 0.004) {
          nx = tile.col
          nvx = 0
        }
      }

      // Copy only the rows that move: the board's other rows stay shared (ISS-10).
      if (!nextBoard) nextBoard = state.board.slice()
      if (nextBoard[r] === state.board[r]) nextBoard[r] = state.board[r]!.slice()
      nextBoard[r]![col] = {
        ...tile,
        x: nx,
        y: ny,
        vx: nvx,
        vy: nvy,
      }
      changed = true
    }
  }

  // 2. Update tumbling detached tiles.
  let nextFalling = state.falling
  if (state.falling.length > 0) {
    changed = true
    const fadeStart = state.rows + 0.6
    const fadeEnd = state.rows + 2.5
    const pruneY = state.rows + 2.65
    const alive: FallingTile[] = []

    for (const f of state.falling) {
      let delayMs = f.delayMs
      let stepDt = dt
      let scale = f.scale

      if (delayMs > 0) {
        if (delayMs > clampedMs) {
          alive.push({ ...f, delayMs: delayMs - clampedMs })
          continue
        }
        // Delay elapsed mid-frame: launch with remaining dt and subtle tactile lift.
        stepDt = (clampedMs - delayMs) / 1000
        delayMs = 0
        scale = 1.045
      }

      const vy = f.vy + fallGravity * stepDt
      const x = f.x + f.vx * stepDt
      const y = f.y + vy * stepDt
      const angle = f.angle + f.omega * stepDt
      scale = 1 + (scale - 1) * Math.exp(-5 * stepDt)

      let alpha = f.alpha
      if (y > fadeStart) {
        alpha = Math.max(0, 1 - (y - fadeStart) / (fadeEnd - fadeStart))
      }

      if (y <= pruneY && alpha > 0.005) {
        alive.push({
          ...f,
          x,
          y,
          vy,
          angle,
          delayMs,
          scale,
          alpha,
        })
      }
    }
    nextFalling = alive
  }

  // 3. Update single-tile micro-shudder wobble.
  let nextWobble = state.wobble
  if (state.wobble) {
    changed = true
    const ageMs = state.wobble.ageMs + clampedMs
    nextWobble = ageMs >= WOBBLE_DURATION_MS ? null : { ...state.wobble, ageMs }
  }

  if (!changed) return state

  return {
    ...state,
    board: nextBoard ?? state.board,
    falling: nextFalling,
    wobble: nextWobble,
  }
}
