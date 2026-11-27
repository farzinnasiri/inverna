import { describe, expect, it } from 'vitest'
import {
  GRID_SIZE,
  MAX_UNDO,
  createKindle,
  fourSpawnProbability,
  isStuck,
  kindleReducer,
  makeRoom,
  move,
  undoKindle,
  type KindleState,
  type Tile,
} from './engine'

/** Build a controlled board state from a 4×4 matrix of tile values (0 = empty). */
function stateFromMatrix(
  rows: number[][],
  overrides: Partial<KindleState> = {},
): KindleState {
  const tiles: Tile[] = []
  let nextId = 1
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const val = rows[r]![c]!
      if (val > 0) {
        tiles.push({ id: nextId++, value: val, row: r, col: c })
      }
    }
  }
  const bestTile = tiles.reduce((m, t) => Math.max(m, t.value), 0)
  return {
    tiles,
    score: 0,
    bestTile,
    moves: 0,
    reached2048: bestTile >= 2048,
    stuck: isStuck(tiles),
    moveSeq: 0,
    lastMergeMax: 0,
    justReached2048: false,
    nextId,
    rngState: 123456,
    history: [],
    ...overrides,
  }
}

/** Convert state tiles back to a 4×4 matrix (excluding newly spawned tile if requested). */
function toMatrix(tiles: readonly Tile[], excludeNew = false): number[][] {
  const m = Array.from({ length: GRID_SIZE }, () => Array<number>(GRID_SIZE).fill(0))
  for (const t of tiles) {
    if (excludeNew && t.isNew) continue
    m[t.row]![t.col] = t.value
  }
  return m
}

describe('Kindle engine — initialisation', () => {
  it('opens a 4×4 board with 2 distinct tiles', () => {
    const a = createKindle({ seed: 42, calm: 0 })
    expect(a.tiles).toHaveLength(2)
    expect(a.tiles[0]!.id).not.toBe(a.tiles[1]!.id)
    expect(
      a.tiles[0]!.row !== a.tiles[1]!.row || a.tiles[0]!.col !== a.tiles[1]!.col,
    ).toBe(true)
    expect(a.tiles.every((t) => (t.value === 2 || t.value === 4) && t.isNew)).toBe(true)
    expect(a.score).toBe(0)
    expect(a.moves).toBe(0)
    expect(a.stuck).toBe(false)
    expect(a.reached2048).toBe(false)
    expect(a.history).toEqual([])
  })
})

describe('Kindle engine — all 4 slide directions & merge rules', () => {
  it('slides left and merges toward the left edge', () => {
    const s = stateFromMatrix([
      [0, 2, 0, 2],
      [4, 0, 0, 0],
      [0, 0, 8, 8],
      [0, 0, 0, 0],
    ])
    const next = move(s, 'left', 0)
    expect(toMatrix(next.tiles, true)).toEqual([
      [4, 0, 0, 0],
      [4, 0, 0, 0],
      [16, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    expect(next.score).toBe(20)
    expect(next.bestTile).toBe(16)
    expect(next.lastMergeMax).toBe(16)
    expect(next.moves).toBe(1)
    expect(next.tiles.filter((t) => t.isNew)).toHaveLength(1)
  })

  it('slides right and merges toward the right edge', () => {
    const s = stateFromMatrix([
      [2, 2, 2, 0],
      [0, 4, 4, 0],
      [0, 0, 0, 0],
      [8, 0, 0, 0],
    ])
    const next = move(s, 'right', 0)
    expect(toMatrix(next.tiles, true)).toEqual([
      [0, 0, 2, 4],
      [0, 0, 0, 8],
      [0, 0, 0, 0],
      [0, 0, 0, 8],
    ])
    expect(next.score).toBe(12)
  })

  it('slides up and merges toward the top edge', () => {
    const s = stateFromMatrix([
      [2, 0, 4, 0],
      [2, 8, 0, 0],
      [2, 8, 4, 0],
      [0, 0, 0, 0],
    ])
    const next = move(s, 'up', 0)
    expect(toMatrix(next.tiles, true)).toEqual([
      [4, 16, 8, 0],
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    expect(next.score).toBe(28)
  })

  it('slides down and merges toward the bottom edge', () => {
    const s = stateFromMatrix([
      [2, 0, 0, 4],
      [2, 0, 0, 0],
      [2, 0, 0, 4],
      [0, 0, 0, 0],
    ])
    const next = move(s, 'down', 0)
    expect(toMatrix(next.tiles, true)).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [2, 0, 0, 0],
      [4, 0, 0, 8],
    ])
    expect(next.score).toBe(12)
  })

  it('enforces single-merge-per-turn edge cases: [2,2,4,0], [2,2,2,2], [4,2,2,0]', () => {
    const s = stateFromMatrix([
      [2, 2, 4, 0],
      [2, 2, 2, 2],
      [4, 2, 2, 0],
      [0, 0, 0, 0],
    ])
    const next = move(s, 'left', 0)
    expect(toMatrix(next.tiles, true)).toEqual([
      [4, 4, 0, 0],
      [4, 4, 0, 0],
      [4, 4, 0, 0],
      [0, 0, 0, 0],
    ])
    expect(next.score).toBe(4 + 4 + 4 + 4)
  })

  it('returns the exact same state reference on a no-op move', () => {
    const s = stateFromMatrix([
      [2, 4, 8, 16],
      [32, 0, 0, 0],
      [64, 0, 0, 0],
      [128, 0, 0, 0],
    ])
    const afterLeft = move(s, 'left', 0)
    expect(afterLeft).toBe(s)

    const afterUp = move(s, 'up', 0)
    expect(afterUp).toBe(s)
  })
})

describe('Kindle engine — stable tile IDs, mergedFrom & 2048 milestone', () => {
  it('preserves IDs on unmerged tiles and records mergedFrom provenance on merges', () => {
    const s = stateFromMatrix([
      [2, 0, 0, 2],
      [0, 0, 8, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const [tA, tB, tC] = s.tiles
    expect(tA).toMatchObject({ value: 2, row: 0, col: 0 })
    expect(tB).toMatchObject({ value: 2, row: 0, col: 3 })
    expect(tC).toMatchObject({ value: 8, row: 1, col: 2 })

    const next = move(s, 'left', 0)
    const movedEight = next.tiles.find((t) => t.value === 8)
    expect(movedEight).toBeDefined()
    expect(movedEight!.id).toBe(tC!.id)
    expect(movedEight!.row).toBe(1)
    expect(movedEight!.col).toBe(0)
    expect(movedEight!.mergedFrom).toBeUndefined()

    const mergedFour = next.tiles.find((t) => t.value === 4 && !t.isNew)
    expect(mergedFour).toBeDefined()
    expect(mergedFour!.id).not.toBe(tA!.id)
    expect(mergedFour!.id).not.toBe(tB!.id)
    expect(mergedFour!.row).toBe(0)
    expect(mergedFour!.col).toBe(0)
    expect(mergedFour!.mergedFrom).toEqual([
      { id: tA!.id, value: 2, row: 0, col: 0 },
      { id: tB!.id, value: 2, row: 0, col: 3 },
    ])

    // Subsequent move clears mergedFrom on older tiles (no recursive nesting).
    const next2 = move(next, 'down', 0)
    for (const tile of next2.tiles) {
      if (tile.mergedFrom) {
        expect(tile.mergedFrom[0].mergedFrom).toBeUndefined()
        expect(tile.mergedFrom[1].mergedFrom).toBeUndefined()
      }
    }
  })

  it('tracks reached2048 and justReached2048 while allowing seamless play past 2048', () => {
    const s = stateFromMatrix([
      [1024, 1024, 0, 0],
      [2048, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ], { reached2048: false, bestTile: 1024 })

    const hit = move(s, 'left', 0)
    expect(hit.reached2048).toBe(true)
    expect(hit.justReached2048).toBe(true)
    expect(hit.bestTile).toBe(2048)

    // Keep playing past 2048 -> merge 2048 + 2048 into 4096.
    const beyond = move(hit, 'up', 0)
    expect(beyond.reached2048).toBe(true)
    expect(beyond.justReached2048).toBe(false)
    expect(beyond.bestTile).toBe(4096)
  })
})

describe('Kindle engine — undo stack', () => {
  it('restores previous boards step-by-step and caps stack at MAX_UNDO', () => {
    let s = createKindle({ seed: 77, calm: 0.2 })
    const dirs = ['left', 'up', 'right', 'down'] as const
    const savedBoards: Array<{ score: number; moves: number; matrix: number[][] }> = []

    let steps = 0
    for (let i = 0; i < 60 && steps < MAX_UNDO + 4; i++) {
      const next = move(s, dirs[i % 4]!, 0.2)
      if (next !== s) {
        savedBoards.push({ score: s.score, moves: s.moves, matrix: toMatrix(s.tiles) })
        s = next
        steps += 1
      }
    }

    expect(steps).toBeGreaterThanOrEqual(MAX_UNDO + 2)
    expect(s.history).toHaveLength(MAX_UNDO)

    // Unwind all MAX_UNDO snapshots and verify exact restoration.
    for (let k = 0; k < MAX_UNDO; k++) {
      const expected = savedBoards[savedBoards.length - 1 - k]!
      s = undoKindle(s)
      expect(s.score).toBe(expected.score)
      expect(s.moves).toBe(expected.moves)
      expect(toMatrix(s.tiles)).toEqual(expected.matrix)
    }

    expect(s.history).toHaveLength(0)
    // Undo on empty history is a no-op returning the same reference.
    expect(undoKindle(s)).toBe(s)
  })
})

describe('Kindle engine — stuck detection & makeRoom recovery', () => {
  const STUCK_MATRIX = [
    [2, 4, 8, 16],
    [32, 64, 128, 256],
    [512, 1024, 4, 2],
    [8, 16, 32, 64],
  ]

  it('detects stuck boards accurately and distinguishes mergeable full boards', () => {
    const stuckState = stateFromMatrix(STUCK_MATRIX)
    expect(stuckState.stuck).toBe(true)
    expect(move(stuckState, 'left', 0)).toBe(stuckState)
    expect(move(stuckState, 'right', 0)).toBe(stuckState)
    expect(move(stuckState, 'up', 0)).toBe(stuckState)
    expect(move(stuckState, 'down', 0)).toBe(stuckState)

    // Adjacent equal pair in bottom-right makes the full board NOT stuck.
    const mergeableFull = stateFromMatrix([
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [512, 1024, 4, 2],
      [8, 16, 32, 2],
    ])
    expect(mergeableFull.stuck).toBe(false)
  })

  it('gently extinguishes the 2 lowest-value tiles via makeRoom so play continues', () => {
    const stuckState = stateFromMatrix(STUCK_MATRIX, { score: 9400, moves: 85 })
    const unstuck = makeRoom(stuckState)

    expect(unstuck).not.toBe(stuckState)
    expect(unstuck.stuck).toBe(false)
    expect(unstuck.tiles).toHaveLength(14)
    expect(unstuck.extinguished).toHaveLength(2)
    expect(unstuck.extinguished!.map((t) => t.value)).toEqual([2, 2])
    expect(unstuck.score).toBe(9400)
    expect(unstuck.moves).toBe(85)

    // Player can move again immediately.
    const afterMove = move(unstuck, 'left', 0.5)
    expect(afterMove).not.toBe(unstuck)

    // makeRoom itself can be undone cleanly.
    const undone = undoKindle(unstuck)
    expect(undone.stuck).toBe(true)
    expect(undone.tiles).toHaveLength(16)

    // Calling makeRoom when not stuck is a no-op.
    expect(makeRoom(unstuck)).toBe(unstuck)
  })
})

describe('Kindle engine — calm spawn probability', () => {
  it('spawns fewer 4-tiles as calm rises, and stays within its range outside 0..1', () => {
    expect(fourSpawnProbability(0.5)).toBeLessThan(fourSpawnProbability(0))
    expect(fourSpawnProbability(1)).toBeLessThan(fourSpawnProbability(0.5))
    expect(fourSpawnProbability(1)).toBeGreaterThan(0)
    expect(fourSpawnProbability(-5)).toBe(fourSpawnProbability(0))
    expect(fourSpawnProbability(5)).toBe(fourSpawnProbability(1))

    const sampleFourRate = (calm: number) => {
      let fours = 0
      const samples = 4000
      for (let i = 0; i < samples; i++) {
        const board = createKindle({ seed: 10_000 + i, calm })
        for (const t of board.tiles) {
          if (t.value === 4) fours += 1
        }
      }
      return fours / (samples * 2)
    }

    const rateCalm0 = sampleFourRate(0)
    const rateCalm1 = sampleFourRate(1)
    expect(rateCalm0).toBeGreaterThan(0.085)
    expect(rateCalm0).toBeLessThan(0.115)
    expect(rateCalm1).toBeGreaterThan(0.02)
    expect(rateCalm1).toBeLessThan(0.042)
    expect(rateCalm1).toBeLessThan(rateCalm0)
  })
})

describe('Kindle engine — reducer & JSON serialisation round-trip', () => {
  it('round-trips full state through JSON.stringify/parse with deterministic continuation', () => {
    let s = createKindle({ seed: 9001, calm: 0.4 })
    s = kindleReducer(s, { type: 'move', dir: 'left', calm: 0.4 })
    s = kindleReducer(s, { type: 'move', dir: 'down', calm: 0.4 })
    s = kindleReducer(s, { type: 'move', dir: 'right', calm: 0.4 })

    const restored: KindleState = JSON.parse(JSON.stringify(s))
    expect(restored).toEqual(s)

    const nextOriginal = move(s, 'up', 0.4)
    const nextRestored = move(restored, 'up', 0.4)
    expect(nextRestored).toEqual(nextOriginal)

    const undoneOriginal = undoKindle(nextOriginal)
    const undoneRestored = undoKindle(nextRestored)
    expect(undoneRestored).toEqual(undoneOriginal)
  })
})
