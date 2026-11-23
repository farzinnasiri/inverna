import { describe, expect, it } from 'vitest'
import {
  PALETTES,
  createHue,
  findHintPair,
  generateGradientGrid,
  hexDistance,
  hexToOklab,
  hexToRgb,
  hueReducer,
  isSolved,
  nextPuzzle,
  oklabToHex,
  restartPuzzle,
  swapTiles,
  type HueState,
} from './engine'

describe('Hue OKLab colour math & palettes', () => {
  it('round-trips hex ↔ OKLab bit-exact for every curated palette corner', () => {
    for (const p of PALETTES) {
      for (const hex of [p.corners.tl, p.corners.tr, p.corners.bl, p.corners.br]) {
        const roundTrip = oklabToHex(hexToOklab(hex))
        expect(roundTrip).toBe(hex.toLowerCase())
      }
    }
  })

  it('produces exact corner colours on bilinear OKLab interpolation', () => {
    for (const p of PALETTES) {
      const cols = 5
      const rows = 6
      const grid = generateGradientGrid(p.corners, cols, rows)

      expect(grid).toHaveLength(cols * rows)
      expect(grid[0]).toBe(p.corners.tl.toLowerCase())
      expect(grid[cols - 1]).toBe(p.corners.tr.toLowerCase())
      expect(grid[(rows - 1) * cols]).toBe(p.corners.bl.toLowerCase())
      expect(grid[rows * cols - 1]).toBe(p.corners.br.toLowerCase())
    }
  })

  it('curates at least 12 distinct, warm low-blue palettes with clear tile separation', () => {
    expect(PALETTES.length).toBeGreaterThanOrEqual(12)

    const ids = new Set(PALETTES.map((p) => p.id))
    const titles = new Set(PALETTES.map((p) => p.title))
    expect(ids.size).toBe(PALETTES.length)
    expect(titles.size).toBe(PALETTES.length)

    for (const p of PALETTES) {
      // Every corner must be warm / low-blue (blue never dominates red).
      for (const hex of [p.corners.tl, p.corners.tr, p.corners.bl, p.corners.br]) {
        const [r, , b] = hexToRgb(hex)
        expect(r).toBeGreaterThan(b)
      }

      // Adjacent tiles on a 5×6 grid should be perceptually distinct,
      // both normally and under a warm orange night filter (#ff5a14 multiply).
      const cols = 5
      const rows = 6
      const grid = generateGradientGrid(p.corners, cols, rows)
      const applyWarmFilter = (hex: string) => {
        const [r, g, b] = hexToRgb(hex)
        // Blend 85% multiply with #ff5a14 (1.0, 0.353, 0.078)
        const fr = r * (0.15 + 0.85 * 1.0)
        const fg = g * (0.15 + 0.85 * (0x5a / 255))
        const fb = b * (0.15 + 0.85 * (0x14 / 255))
        const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, '0')
        return `#${toHex(fr)}${toHex(fg)}${toHex(fb)}`
      }
      const filteredGrid = grid.map(applyWarmFilter)
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col
          if (col + 1 < cols) {
            expect(hexDistance(grid[i]!, grid[i + 1]!)).toBeGreaterThan(0.02)
            expect(hexDistance(filteredGrid[i]!, filteredGrid[i + 1]!)).toBeGreaterThan(0.01)
          }
          if (row + 1 < rows) {
            expect(hexDistance(grid[i]!, grid[i + cols]!)).toBeGreaterThan(0.02)
            expect(hexDistance(filteredGrid[i]!, filteredGrid[i + cols]!)).toBeGreaterThan(0.01)
          }
        }
      }
    }
  })
})

describe('Hue puzzle engine', () => {
  it('creates a shuffled, non-solved puzzle with at least 60% movable tiles displaced', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const state = createHue({ seed, calm: 0 })
      expect(state.solved).toBe(false)
      expect(isSolved(state)).toBe(false)
      expect(state.moves).toBe(0)

      const movable = state.tiles
        .map((tile, idx) => ({ tile, idx }))
        .filter(({ tile }) => !tile.pinned)

      const displaced = movable.filter(({ tile, idx }) => tile.id !== idx).length
      expect(displaced / movable.length).toBeGreaterThanOrEqual(0.6)

      // Pinned tiles sit in their solved slots.
      for (let i = 0; i < state.tiles.length; i++) {
        if (state.tiles[i]!.pinned) {
          expect(state.tiles[i]!.id).toBe(i)
          expect(state.tiles[i]!.color).toBe(state.targetColors[i])
        }
      }
    }
  })

  it('keeps pinned anchor tiles immutable on swap', () => {
    const state = createHue({ seed: 42, calm: 0 })
    const pinnedIdx = state.tiles.findIndex((t) => t.pinned)
    const movableIdx = state.tiles.findIndex((t) => !t.pinned)

    expect(pinnedIdx).toBeGreaterThanOrEqual(0)
    expect(movableIdx).toBeGreaterThanOrEqual(0)

    const afterA = swapTiles(state, pinnedIdx, movableIdx)
    const afterB = swapTiles(state, movableIdx, pinnedIdx)

    expect(afterA).toBe(state)
    expect(afterB).toBe(state)
    expect(afterA.moves).toBe(0)
  })

  it('ignores out-of-bounds, non-integer, and self swaps', () => {
    const state = createHue({ seed: 11, calm: 0 })
    const movableIdx = state.tiles.findIndex((t) => !t.pinned)

    expect(swapTiles(state, movableIdx, movableIdx)).toBe(state)
    expect(swapTiles(state, -1, movableIdx)).toBe(state)
    expect(swapTiles(state, movableIdx, state.tiles.length)).toBe(state)
    expect(swapTiles(state, 1.5, movableIdx)).toBe(state)
  })

  it('swaps movable tiles, increments moves, and detects solved completion', () => {
    let state = createHue({ seed: 7, calm: 0.8 })
    expect(state.solved).toBe(false)

    // Solve the board step-by-step using valid movable swaps.
    let guard = 0
    while (!state.solved && guard < 100) {
      const wrongIdx = state.tiles.findIndex((t, i) => !t.pinned && t.id !== i)
      expect(wrongIdx).toBeGreaterThanOrEqual(0)
      const destIdx = state.tiles[wrongIdx]!.id
      const prevMoves = state.moves
      const tileAtWrong = state.tiles[wrongIdx]!
      const tileAtDest = state.tiles[destIdx]!

      state = swapTiles(state, wrongIdx, destIdx)

      expect(state.moves).toBe(prevMoves + 1)
      expect(state.tiles[destIdx]).toEqual(tileAtWrong)
      expect(state.tiles[wrongIdx]).toEqual(tileAtDest)
      guard++
    }

    expect(state.solved).toBe(true)
    expect(isSolved(state)).toBe(true)
    expect(state.moves).toBeGreaterThan(0)

    // Further swaps on a solved board are ignored.
    const movable = state.tiles.map((t, i) => (t.pinned ? -1 : i)).filter((i) => i >= 0)
    expect(swapTiles(state, movable[0]!, movable[1]!)).toBe(state)
  })

  it('detects solved state by colour distance when two tiles share identical colour', () => {
    const base = createHue({ seed: 3, calm: 0.85 })
    const identicalColor = '#d98e45'
    const customTarget = base.targetColors.map(() => identicalColor)
    const tiles = base.tiles.map((t, idx) => ({ ...t, color: identicalColor, id: idx }))
    // Swap two movable tile ids even though colours match.
    const movable = tiles.map((t, i) => (t.pinned ? -1 : i)).filter((i) => i >= 0)
    const a = movable[0]!
    const b = movable[1]!
    const almostSolved: HueState = {
      ...base,
      targetColors: customTarget,
      tiles: tiles.map((t, idx) => (idx === a ? { ...t, id: b } : idx === b ? { ...t, id: a } : t)),
      solved: false,
    }
    expect(isSolved(almostSolved)).toBe(true)
  })

  it('produces simpler, smaller boards as calm increases on nextPuzzle', () => {
    const active = createHue({ seed: 99, calm: 0 })
    expect(active.cols).toBe(5)
    expect(active.rows).toBe(6)

    const midCalm = nextPuzzle(active, 0.55)
    expect(midCalm.puzzleNumber).toBe(active.puzzleNumber + 1)
    expect(midCalm.paletteId).not.toBe(active.paletteId)
    expect(midCalm.cols).toBe(4)
    expect(midCalm.rows).toBe(5)
    expect(midCalm.tiles.length).toBeLessThan(active.tiles.length)

    // Top and bottom edges are pinned on calmer boards.
    for (let col = 0; col < midCalm.cols; col++) {
      expect(midCalm.tiles[col]!.pinned).toBe(true)
      expect(midCalm.tiles[(midCalm.rows - 1) * midCalm.cols + col]!.pinned).toBe(true)
    }

    const deepCalm = nextPuzzle(midCalm, 0.85)
    expect(deepCalm.cols).toBe(4)
    expect(deepCalm.rows).toBe(4)
    expect(deepCalm.tiles.length).toBeLessThan(midCalm.tiles.length)
    const activeMovable = active.tiles.filter((t) => !t.pinned).length
    const deepMovable = deepCalm.tiles.filter((t) => !t.pinned).length
    expect(deepMovable).toBeLessThan(activeMovable)
  })

  it('restarts the current puzzle cleanly to its original shuffle', () => {
    const initial = createHue({ seed: 55, calm: 0 })
    const movable = initial.tiles.map((t, i) => (t.pinned ? -1 : i)).filter((i) => i >= 0)
    const moved = hueReducer(initial, { type: 'swap', indexA: movable[0]!, indexB: movable[1]! })
    expect(moved.moves).toBe(1)

    const restarted = restartPuzzle(moved)
    expect(restarted.moves).toBe(0)
    expect(restarted.solved).toBe(false)
    expect(restarted.paletteId).toBe(initial.paletteId)
    expect(restarted.tiles.map((t) => t.id)).toEqual(initial.tiles.map((t) => t.id))
  })

  it('finds a valid hint pair of misplaced movable tiles until solved', () => {
    let state = createHue({ seed: 21, calm: 0.8 })
    const hint = findHintPair(state)
    expect(hint).not.toBeNull()
    const [a, b] = hint!
    expect(state.tiles[a]!.pinned).toBe(false)
    expect(state.tiles[b]!.pinned).toBe(false)
    expect(a).not.toBe(b)

    // Repeatedly applying hint swaps always solves the puzzle cleanly.
    let steps = 0
    while (!state.solved && steps < 50) {
      const pair = findHintPair(state)
      expect(pair).not.toBeNull()
      state = swapTiles(state, pair![0], pair![1])
      steps++
    }
    expect(state.solved).toBe(true)
    expect(findHintPair(state)).toBeNull()
  })

  it('round-trips cleanly through JSON serialisation', () => {
    const original = createHue({ seed: 1234, calm: 0.2 })
    const movable = original.tiles.map((t, i) => (t.pinned ? -1 : i)).filter((i) => i >= 0)
    const afterSwap = swapTiles(original, movable[0]!, movable[1]!)

    const revived = JSON.parse(JSON.stringify(afterSwap)) as HueState
    expect(revived).toEqual(afterSwap)

    // Engine actions continue deterministically on the revived state.
    const nextFromOrig = nextPuzzle(afterSwap, 0.5)
    const nextFromRevived = nextPuzzle(revived, 0.5)
    expect(nextFromRevived).toEqual(nextFromOrig)
  })
})
