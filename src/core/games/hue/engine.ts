import { createRng } from '../../rng'

/* ==========================================================================
   Hue — classic colour-harmony gradient tile puzzle (pure engine)

   Zero DOM, zero React, zero Math.random. Plain JSON-serialisable state in,
   plain state out. Gradients are interpolated in perceptual OKLab space so
   mid-tones stay luminous and never turn muddy.
   ========================================================================== */

export interface Oklab {
  L: number
  a: number
  b: number
}

export interface PaletteCorners {
  tl: string
  tr: string
  bl: string
  br: string
}

export interface HuePalette {
  id: string
  title: string
  corners: PaletteCorners
}

export interface HueTile {
  /** Solved slot index (0 .. cols * rows - 1). Stable identity for animations. */
  id: number
  /** Lowercase 6-digit hex colour (e.g. '#e88234'). */
  color: string
  /** Anchor tiles are fixed to their solved slot and cannot be moved. */
  pinned: boolean
}

export interface HueState {
  /** 1-based puzzle counter ("Palette 1", "Palette 2", ...). */
  puzzleNumber: number
  /** Index into PALETTES. */
  paletteIndex: number
  paletteId: string
  paletteTitle: string
  corners: PaletteCorners
  cols: number
  rows: number
  /** Row-major grid of current tiles (length = cols * rows). */
  tiles: HueTile[]
  /** Row-major solved hex colour at every slot (length = cols * rows). */
  targetColors: string[]
  /** Initial shuffled tile ids so restartPuzzle restores this exact board. */
  initialOrder: number[]
  moves: number
  solved: boolean
  /** Calm snapshot (0..1) used when building this puzzle. */
  calm: number
  /** Mulberry32 internal state for deterministic subsequent puzzles. */
  rngState: number
}

export type HueAction =
  | { type: 'swap'; indexA: number; indexB: number }
  | { type: 'restart' }
  | { type: 'next'; calm: number }

export interface CreateHueOptions {
  seed?: number
  calm?: number
  puzzleNumber?: number
  paletteIndex?: number
}

export interface BoardLayout {
  cols: number
  rows: number
  pinnedIndices: number[]
}

/**
 * Curated warm, low-blue palettes inspired by dusk, candle-light, clay,
 * terracotta, saffron, honey, dried moss, rosewood, tea, ochre, smoked plum,
 * and coal. Each palette separates its two axes across lightness and warm
 * red↔gold/moss chroma so every board remains distinguishable even under a
 * deep orange night filter.
 */
export const PALETTES: readonly HuePalette[] = [
  {
    id: 'late-sun',
    title: 'Late Sun',
    corners: { tl: '#f6dea6', tr: '#e57435', bl: '#7a743b', br: '#3b1714' },
  },
  {
    id: 'kiln',
    title: 'Kiln',
    corners: { tl: '#f1e1c1', tr: '#d9693a', bl: '#8e6c3f', br: '#321411' },
  },
  {
    id: 'amber-tea',
    title: 'Amber Tea',
    corners: { tl: '#f4e39c', tr: '#d87b29', bl: '#6c7c40', br: '#361f14' },
  },
  {
    id: 'dry-moss',
    title: 'Dry Moss',
    corners: { tl: '#ece3b4', tr: '#c45c36', bl: '#768846', br: '#3a1b16' },
  },
  {
    id: 'hearth-ash',
    title: 'Hearth Ash',
    corners: { tl: '#ebd8bc', tr: '#cf685c', bl: '#786649', br: '#241513' },
  },
  {
    id: 'cinnamon-dusk',
    title: 'Cinnamon Dusk',
    corners: { tl: '#f5cc8c', tr: '#c85038', bl: '#8a6c3c', br: '#35151d' },
  },
  {
    id: 'saffron-loom',
    title: 'Saffron Loom',
    corners: { tl: '#f7e599', tr: '#dc5b2c', bl: '#988136', br: '#3f1814' },
  },
  {
    id: 'rosewood',
    title: 'Rosewood',
    corners: { tl: '#f0d2b6', tr: '#c4534e', bl: '#88723d', br: '#391819' },
  },
  {
    id: 'honeycomb',
    title: 'Honeycomb',
    corners: { tl: '#f8e9b8', tr: '#de8331', bl: '#8f7d3a', br: '#421e14' },
  },
  {
    id: 'terracotta',
    title: 'Terracotta',
    corners: { tl: '#f0dfbe', tr: '#d45a3a', bl: '#7c8244', br: '#421c15' },
  },
  {
    id: 'smoked-plum',
    title: 'Smoked Plum',
    corners: { tl: '#f1c79c', tr: '#b9444c', bl: '#846d42', br: '#29121a' },
  },
  {
    id: 'ochre-field',
    title: 'Ochre Field',
    corners: { tl: '#f3e39a', tr: '#cf742e', bl: '#6c8044', br: '#3b2115' },
  },
  {
    id: 'candlewick',
    title: 'Candlewick',
    corners: { tl: '#fce4ac', tr: '#e5612c', bl: '#8c6936', br: '#2c1211' },
  },
  {
    id: 'cedar-clay',
    title: 'Cedar & Clay',
    corners: { tl: '#f0dab2', tr: '#c95c3c', bl: '#7c7b40', br: '#351c14' },
  },
] as const

/** Two tiles closer than this OKLab Euclidean distance are treated as matching. */
export const SOLVED_COLOR_EPSILON = 0.0015

const MIN_DISPLACED_RATIO = 0.6

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/* -------------------------------------------------------------------------- */
/*  OKLab colour math (Björn Ottosson, pure TS)                               */
/* -------------------------------------------------------------------------- */

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, '')
  const full =
    clean.length === 3
      ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
      : clean
  const n = Number.parseInt(full, 16)
  if (!Number.isFinite(n) || full.length !== 6) {
    throw new Error(`Invalid hex colour: ${hex}`)
  }
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toByte = (c: number) =>
    Math.round(clamp01(c) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`
}

export function srgbToLinear(c: number): number {
  const v = clamp01(c)
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

export function linearToSrgb(c: number): number {
  const v = clamp01(c)
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

export function linearSrgbToOklab(r: number, g: number, b: number): Oklab {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  }
}

export function oklabToLinearSrgb(lab: Oklab): [number, number, number] {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b
  const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

export function hexToOklab(hex: string): Oklab {
  const [r, g, b] = hexToRgb(hex)
  return linearSrgbToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b))
}

export function oklabToHex(lab: Oklab): string {
  const [lr, lg, lb] = oklabToLinearSrgb(lab)
  return rgbToHex(linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb))
}

export function lerpOklab(c0: Oklab, c1: Oklab, t: number): Oklab {
  return {
    L: c0.L + (c1.L - c0.L) * t,
    a: c0.a + (c1.a - c0.a) * t,
    b: c0.b + (c1.b - c0.b) * t,
  }
}

/** Bilinearly interpolate four corner OKLab colours at (u, v) in [0, 1] × [0, 1]. */
export function bilinearOklab(tl: Oklab, tr: Oklab, bl: Oklab, br: Oklab, u: number, v: number): Oklab {
  const top = lerpOklab(tl, tr, u)
  const bottom = lerpOklab(bl, br, u)
  return lerpOklab(top, bottom, v)
}

/** Generate a row-major `cols × rows` hex grid via bilinear OKLab interpolation. */
export function generateGradientGrid(corners: PaletteCorners, cols: number, rows: number): string[] {
  const tl = hexToOklab(corners.tl)
  const tr = hexToOklab(corners.tr)
  const bl = hexToOklab(corners.bl)
  const br = hexToOklab(corners.br)

  const grid: string[] = []
  for (let r = 0; r < rows; r++) {
    const v = rows === 1 ? 0 : r / (rows - 1)
    for (let c = 0; c < cols; c++) {
      const u = cols === 1 ? 0 : c / (cols - 1)
      grid.push(oklabToHex(bilinearOklab(tl, tr, bl, br, u, v)))
    }
  }
  return grid
}

export function oklabDistance(c0: Oklab, c1: Oklab): number {
  const dL = c0.L - c1.L
  const da = c0.a - c1.a
  const db = c0.b - c1.b
  return Math.sqrt(dL * dL + da * da + db * db)
}

export function hexDistance(hexA: string, hexB: string): number {
  if (hexA.toLowerCase() === hexB.toLowerCase()) return 0
  return oklabDistance(hexToOklab(hexA), hexToOklab(hexB))
}

/* -------------------------------------------------------------------------- */
/*  Calm-aware board sizing & anchor layout                                   */
/* -------------------------------------------------------------------------- */

/**
 * Determine grid dimensions and pinned anchor indices for a puzzle.
 * - calm < 0.45: standard 5×6 (or 5×5 as calm approaches 0.45) with 4 pinned
 *   corners plus occasional center/edge anchors for gentle variety.
 * - calm >= 0.45: steps smoothly down to 4×5 and then 4×4 with pinned corners
 *   and top/bottom edge anchors so the mind settles as bedtime nears.
 */
export function layoutForPuzzle(puzzleNumber: number, calm: number): BoardLayout {
  const c = clamp01(calm)

  if (c >= 0.72) {
    // Deep wind-down: 4×4 with full top and bottom edge anchors (8 pinned, 8 movable).
    const cols = 4
    const rows = 4
    const pinned: number[] = []
    for (let col = 0; col < cols; col++) {
      pinned.push(col)
      pinned.push((rows - 1) * cols + col)
    }
    return { cols, rows, pinnedIndices: pinned }
  }

  if (c >= 0.45) {
    // Mid wind-down: 4×5 with full top and bottom edge anchors (8 pinned, 12 movable).
    const cols = 4
    const rows = 5
    const pinned: number[] = []
    for (let col = 0; col < cols; col++) {
      pinned.push(col)
      pinned.push((rows - 1) * cols + col)
    }
    return { cols, rows, pinnedIndices: pinned }
  }

  if (c >= 0.28) {
    // Early wind-down: 5×5 with 4 corners + center (or 4 corners on alternating puzzles).
    const cols = 5
    const rows = 5
    const pinned = [0, cols - 1, (rows - 1) * cols, rows * cols - 1]
    if (puzzleNumber % 2 === 1) {
      pinned.push(Math.floor((rows * cols) / 2))
    }
    pinned.sort((a, b) => a - b)
    return { cols, rows, pinnedIndices: pinned }
  }

  // Standard evening play: 5×6 (or 5×5 every third puzzle) with varied anchor accents.
  const variant = ((puzzleNumber - 1) % 3 + 3) % 3
  const cols = 5
  const rows = variant === 2 ? 5 : 6
  const pinned = [0, cols - 1, (rows - 1) * cols, rows * cols - 1]

  if (variant === 1) {
    // Corners + top-center and bottom-center anchors (6 pinned, 24 movable).
    const midCol = Math.floor(cols / 2)
    pinned.push(midCol, (rows - 1) * cols + midCol)
  } else if (variant === 2) {
    // 5×5 with 4 corners + exact center anchor (5 pinned, 20 movable).
    pinned.push(Math.floor((rows * cols) / 2))
  }

  pinned.sort((a, b) => a - b)
  return { cols, rows, pinnedIndices: pinned }
}

/* -------------------------------------------------------------------------- */
/*  Solved detection & shuffling                                              */
/* -------------------------------------------------------------------------- */

function tileMatchesSlot(tile: HueTile, slotIndex: number, targetColors: readonly string[]): boolean {
  if (tile.id === slotIndex) return true
  const target = targetColors[slotIndex]
  if (!target) return false
  return hexDistance(tile.color, target) < SOLVED_COLOR_EPSILON
}

export function isBoardSolved(tiles: readonly HueTile[], targetColors: readonly string[]): boolean {
  if (tiles.length !== targetColors.length) return false
  for (let i = 0; i < tiles.length; i++) {
    if (!tileMatchesSlot(tiles[i]!, i, targetColors)) return false
  }
  return true
}

export function isSolved(state: HueState): boolean {
  return isBoardSolved(state.tiles, state.targetColors)
}

/**
 * Shuffle movable tiles deterministically with a guarantee that at least 60%
 * of movable tiles are displaced from their solved slots (and never solved).
 */
function shuffleMovableTiles(
  solvedTiles: readonly HueTile[],
  targetColors: readonly string[],
  rng: ReturnType<typeof createRng>,
): HueTile[] {
  const movableIndices: number[] = []
  for (let i = 0; i < solvedTiles.length; i++) {
    if (!solvedTiles[i]!.pinned) movableIndices.push(i)
  }

  const count = movableIndices.length
  if (count < 2) return solvedTiles.slice()

  const minDisplaced = Math.min(count, Math.max(2, Math.ceil(count * MIN_DISPLACED_RATIO)))

  const buildBoard = (perm: readonly number[]): HueTile[] => {
    const out = solvedTiles.slice()
    for (let k = 0; k < movableIndices.length; k++) {
      out[movableIndices[k]!] = solvedTiles[perm[k]!]!
    }
    return out
  }

  const countDisplaced = (board: readonly HueTile[]): number => {
    let displaced = 0
    for (const idx of movableIndices) {
      if (!tileMatchesSlot(board[idx]!, idx, targetColors)) displaced++
    }
    return displaced
  }

  // Try natural Fisher-Yates shuffles first so permutations stay unbiased.
  let bestPerm = movableIndices.slice()
  for (let attempt = 0; attempt < 24; attempt++) {
    const perm = rng.shuffle(movableIndices)
    const candidate = buildBoard(perm)
    if (countDisplaced(candidate) >= minDisplaced && !isBoardSolved(candidate, targetColors)) {
      return candidate
    }
    bestPerm = perm
  }

  // Deterministic repair: displace remaining fixed points until threshold is met.
  const perm = bestPerm.slice()
  let board = buildBoard(perm)
  for (let k = 0; k < count && countDisplaced(board) < minDisplaced; k++) {
    const slot = movableIndices[k]!
    if (tileMatchesSlot(board[slot]!, slot, targetColors)) {
      const nextK = (k + 1) % count
      ;[perm[k], perm[nextK]] = [perm[nextK]!, perm[k]!]
      board = buildBoard(perm)
    }
  }

  return board
}

/* -------------------------------------------------------------------------- */
/*  State constructors & pure actions                                         */
/* -------------------------------------------------------------------------- */

function buildPuzzle(
  paletteIndex: number,
  puzzleNumber: number,
  calm: number,
  seed: number,
): HueState {
  const rng = createRng(seed)
  const normalizedCalm = clamp01(calm)
  const safePaletteIndex = ((paletteIndex % PALETTES.length) + PALETTES.length) % PALETTES.length
  const palette = PALETTES[safePaletteIndex]!
  const { cols, rows, pinnedIndices } = layoutForPuzzle(puzzleNumber, normalizedCalm)
  const pinnedSet = new Set(pinnedIndices)

  const targetColors = generateGradientGrid(palette.corners, cols, rows)
  const solvedTiles: HueTile[] = targetColors.map((color, idx) => ({
    id: idx,
    color,
    pinned: pinnedSet.has(idx),
  }))

  const shuffledTiles = shuffleMovableTiles(solvedTiles, targetColors, rng)

  return {
    puzzleNumber,
    paletteIndex: safePaletteIndex,
    paletteId: palette.id,
    paletteTitle: palette.title,
    corners: { ...palette.corners },
    cols,
    rows,
    tiles: shuffledTiles,
    targetColors,
    initialOrder: shuffledTiles.map((t) => t.id),
    moves: 0,
    solved: false,
    calm: normalizedCalm,
    rngState: rng.state(),
  }
}

export function createHue(opts: CreateHueOptions = {}): HueState {
  const seed = opts.seed ?? 1
  const calm = opts.calm ?? 0
  const puzzleNumber = opts.puzzleNumber ?? 1
  const rng = createRng(seed)
  const paletteIndex =
    opts.paletteIndex !== undefined
      ? ((opts.paletteIndex % PALETTES.length) + PALETTES.length) % PALETTES.length
      : rng.int(0, PALETTES.length - 1)

  return buildPuzzle(paletteIndex, puzzleNumber, calm, rng.state())
}

/**
 * Swap two movable tiles on the board.
 * Ignores out-of-bounds, non-integer, identical, pinned, or already-solved states.
 */
export function swapTiles(state: HueState, indexA: number, indexB: number): HueState {
  if (state.solved) return state
  if (indexA === indexB) return state
  if (!Number.isInteger(indexA) || !Number.isInteger(indexB)) return state
  if (indexA < 0 || indexA >= state.tiles.length) return state
  if (indexB < 0 || indexB >= state.tiles.length) return state

  const tileA = state.tiles[indexA]!
  const tileB = state.tiles[indexB]!
  if (tileA.pinned || tileB.pinned) return state

  const nextTiles = state.tiles.slice()
  nextTiles[indexA] = tileB
  nextTiles[indexB] = tileA

  const solved = isBoardSolved(nextTiles, state.targetColors)

  return {
    ...state,
    tiles: nextTiles,
    moves: state.moves + 1,
    solved,
  }
}

/** Restart the current puzzle back to its original shuffled state with 0 moves. */
export function restartPuzzle(state: HueState): HueState {
  const tileById = new Map<number, HueTile>()
  for (const tile of state.tiles) {
    tileById.set(tile.id, tile)
  }

  const restored = state.initialOrder.map((id) => tileById.get(id)!)
  return {
    ...state,
    tiles: restored,
    moves: 0,
    solved: isBoardSolved(restored, state.targetColors),
  }
}

/** Advance to the next curated palette, adapting board size to current `calm`. */
export function nextPuzzle(state: HueState, calm: number): HueState {
  const nextPaletteIndex = (state.paletteIndex + 1) % PALETTES.length
  return buildPuzzle(nextPaletteIndex, state.puzzleNumber + 1, calm, state.rngState)
}

/**
 * Find two misplaced movable tile indices to gently highlight as a hint.
 * Prefers a direct 2-cycle (swapping resolves both tiles at once); otherwise
 * pairs a misplaced tile with its home slot.
 */
export function findHintPair(state: HueState): [number, number] | null {
  if (state.solved) return null

  const misplaced: number[] = []
  for (let i = 0; i < state.tiles.length; i++) {
    const tile = state.tiles[i]!
    if (!tile.pinned && !tileMatchesSlot(tile, i, state.targetColors)) {
      misplaced.push(i)
    }
  }

  if (misplaced.length < 2) return null

  // Prefer a clean 2-cycle where a single swap settles two tiles at once.
  for (const a of misplaced) {
    const b = state.tiles[a]!.id
    if (b !== a && state.tiles[b] && !state.tiles[b]!.pinned && state.tiles[b]!.id === a) {
      return a < b ? [a, b] : [b, a]
    }
  }

  // Otherwise pair the first misplaced tile with its home slot.
  const a = misplaced[0]!
  const home = state.tiles[a]!.id
  if (home !== a && state.tiles[home] && !state.tiles[home]!.pinned) {
    return [a, home]
  }

  return [misplaced[0]!, misplaced[1]!]
}

export function hueReducer(state: HueState, action: HueAction): HueState {
  switch (action.type) {
    case 'swap':
      return swapTiles(state, action.indexA, action.indexB)
    case 'restart':
      return restartPuzzle(state)
    case 'next':
      return nextPuzzle(state, action.calm)
  }
}
