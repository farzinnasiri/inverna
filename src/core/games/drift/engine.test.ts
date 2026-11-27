import { describe, expect, it } from 'vitest'
import {
  boardSizeForCalm,
  canSlideTile,
  countInversions,
  createDrift,
  inPlaceCount,
  isSolvable,
  isSolved,
  moveDirection,
  nextPuzzle,
  restartPuzzle,
  slideTile,
  solvedTiles,
  type DriftState,
} from './engine'

function makeState(size: 3 | 4, tiles: number[], overrides: Partial<DriftState> = {}): DriftState {
  return {
    size,
    tiles: tiles.slice(),
    initialTiles: tiles.slice(),
    moves: 0,
    puzzleNumber: 1,
    solved: isSolved(tiles),
    rngState: 987654,
    ...overrides,
  }
}

describe('Drift engine — initialisation & solvability parity invariant', () => {
  it('guarantees solvability and non-solved start across 40 generated 4×4 boards', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = createDrift({ seed: seed * 7919, calm: 0 })
      expect(state.size).toBe(4)
      expect(state.tiles).toHaveLength(16)
      expect(state.solved).toBe(false)
      expect(isSolved(state.tiles)).toBe(false)
      expect(isSolvable(state.tiles, 4)).toBe(true)

      // Exact permutation of 0..15
      const sorted = state.tiles.slice().sort((a, b) => a - b)
      expect(sorted).toEqual(Array.from({ length: 16 }, (_, i) => i))
    }
  })

  it('guarantees solvability and non-solved start across 40 generated 3×3 calm boards', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = createDrift({ seed: seed * 104729, calm: 0.7 })
      expect(state.size).toBe(3)
      expect(state.tiles).toHaveLength(9)
      expect(state.solved).toBe(false)
      expect(isSolved(state.tiles)).toBe(false)
      expect(isSolvable(state.tiles, 3)).toBe(true)
      expect(countInversions(state.tiles) % 2).toBe(0)

      const sorted = state.tiles.slice().sort((a, b) => a - b)
      expect(sorted).toEqual(Array.from({ length: 9 }, (_, i) => i))
    }
  })

  it('rejects unsolvable parity states on both 3×3 and 4×4', () => {
    // Classic unsolvable 15-puzzle (14 and 15 swapped)
    expect(
      isSolvable([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 14, 0], 4),
    ).toBe(false)
    // Solved 4×4 is solvable
    expect(isSolvable(solvedTiles(4), 4)).toBe(true)
    // Classic unsolvable 8-puzzle (7 and 8 swapped)
    expect(isSolvable([1, 2, 3, 4, 5, 6, 8, 7, 0], 3)).toBe(false)
    // Solved 3×3 is solvable
    expect(isSolvable(solvedTiles(3), 3)).toBe(true)
  })
})

describe('Drift engine — calm sizing (4×4 → 3×3)', () => {
  it('selects 4×4 when calm < 0.55 and 3×3 when calm >= 0.55', () => {
    expect(boardSizeForCalm(0)).toBe(4)
    expect(boardSizeForCalm(0.54)).toBe(4)
    expect(boardSizeForCalm(0.55)).toBe(3)
    expect(boardSizeForCalm(1)).toBe(3)
  })

  it('adapts board size smoothly on nextPuzzle when calm rises', () => {
    const first = createDrift({ seed: 101, calm: 0.2 })
    expect(first.size).toBe(4)
    expect(first.puzzleNumber).toBe(1)

    const second = nextPuzzle(first, 0.65)
    expect(second.size).toBe(3)
    expect(second.puzzleNumber).toBe(2)
    expect(isSolvable(second.tiles, 3)).toBe(true)
  })
})

describe('Drift engine — single & multi-tile slides', () => {
  it('slides a single adjacent tile into the blank space', () => {
    const s = makeState(4, [
      1, 2, 3, 4,
      5, 6, 7, 8,
      9, 10, 11, 12,
      13, 14, 0, 15,
    ])
    expect(canSlideTile(s, 15)).toBe(true)
    expect(canSlideTile(s, 14)).toBe(false) // blank itself
    expect(canSlideTile(s, 0)).toBe(false) // neither same row nor same col

    const next = slideTile(s, 15)
    expect(next.tiles).toEqual(solvedTiles(4))
    expect(next.moves).toBe(1)
    expect(next.solved).toBe(true)
  })

  it('slides an entire row segment toward the blank in one move (left & right)', () => {
    // Blank at (3, 3), tap (3, 0) -> tiles 13, 14, 15 slide right
    const s = makeState(4, [
      1, 2, 3, 4,
      5, 6, 7, 8,
      9, 10, 11, 12,
      13, 14, 15, 0,
    ], { solved: false })
    const slidRight = slideTile(s, 12)
    expect(slidRight.tiles.slice(12, 16)).toEqual([0, 13, 14, 15])
    expect(slidRight.moves).toBe(1)

    // Now blank at (3, 0), tap (3, 2) -> tiles 13, 14 slide left
    const slidLeft = slideTile(slidRight, 14)
    expect(slidLeft.tiles.slice(12, 16)).toEqual([13, 14, 0, 15])
    expect(slidLeft.moves).toBe(2)
  })

  it('slides an entire column segment toward the blank in one move (up & down)', () => {
    // Blank at (0, 2), tap (3, 2) -> tiles at rows 1, 2, 3 slide up
    const s = makeState(4, [
      1, 2, 0, 4,
      5, 6, 3, 8,
      9, 10, 7, 12,
      13, 14, 11, 15,
    ])
    const slidUp = slideTile(s, 14) // (3, 2) = 11
    expect([slidUp.tiles[2], slidUp.tiles[6], slidUp.tiles[10], slidUp.tiles[14]]).toEqual([
      3, 7, 11, 0,
    ])
    expect(slidUp.moves).toBe(1)

    // Slide back down from (0, 2)
    const slidDown = slideTile(slidUp, 2)
    expect([slidDown.tiles[2], slidDown.tiles[6], slidDown.tiles[10], slidDown.tiles[14]]).toEqual([
      0, 3, 7, 11,
    ])
    expect(slidDown.moves).toBe(2)
  })

  it('returns the exact same reference on invalid tile taps or after solved', () => {
    const s = makeState(3, [1, 2, 3, 4, 5, 6, 7, 0, 8])
    expect(slideTile(s, 0)).toBe(s)
    expect(slideTile(s, 7)).toBe(s)
    expect(slideTile(s, -1)).toBe(s)
    expect(slideTile(s, 99)).toBe(s)

    const solved = slideTile(s, 8)
    expect(solved.solved).toBe(true)
    expect(slideTile(solved, 7)).toBe(solved)
  })
})

describe('Drift engine — directional moves, inPlaceCount, restart & JSON round-trip', () => {
  it('supports all 4 directional moves with intuitive swipe semantics', () => {
    // Blank in center (1, 1) of 3×3
    const s = makeState(3, [
      1, 2, 3,
      4, 0, 5,
      6, 7, 8,
    ])

    // Swipe left -> tile to right (5) slides left into blank
    const left = moveDirection(s, 'left')
    expect(left.tiles).toEqual([1, 2, 3, 4, 5, 0, 6, 7, 8])
    // Blank now on right edge -> swiping left again is a no-op
    expect(moveDirection(left, 'left')).toBe(left)

    // Swipe right from center -> tile to left (4) slides right
    const right = moveDirection(s, 'right')
    expect(right.tiles).toEqual([1, 2, 3, 0, 4, 5, 6, 7, 8])

    // Swipe up from center -> tile below (7) slides up
    const up = moveDirection(s, 'up')
    expect(up.tiles).toEqual([1, 2, 3, 4, 7, 5, 6, 0, 8])

    // Swipe down from center -> tile above (2) slides down
    const down = moveDirection(s, 'down')
    expect(down.tiles).toEqual([1, 0, 3, 4, 2, 5, 6, 7, 8])
  })

  it('counts tiles sitting in their solved home position accurately', () => {
    expect(inPlaceCount(solvedTiles(4))).toBe(15)
    expect(inPlaceCount(solvedTiles(3))).toBe(8)
    expect(inPlaceCount([1, 2, 3, 4, 5, 6, 7, 0, 8])).toBe(7)
    expect(inPlaceCount([2, 1, 4, 3, 6, 5, 8, 7, 0])).toBe(0)
  })

  it('restarts to the initial board layout with 0 moves', () => {
    const start = createDrift({ seed: 777, calm: 0 })
    const movableIdx = start.tiles.findIndex((_, i) => canSlideTile(start, i))
    const moved = slideTile(start, movableIdx)
    expect(moved.moves).toBe(1)
    expect(moved.tiles).not.toEqual(start.tiles)

    const restarted = restartPuzzle(moved)
    expect(restarted.tiles).toEqual(start.initialTiles)
    expect(restarted.moves).toBe(0)
    expect(restarted.solved).toBe(false)
  })

  it('survives JSON round-trip identically and stays playable', () => {
    const start = createDrift({ seed: 555, calm: 0.2 })
    const idx = start.tiles.findIndex((_, i) => canSlideTile(start, i))
    const moved = slideTile(start, idx)

    const parsed = JSON.parse(JSON.stringify(moved)) as DriftState
    expect(parsed).toEqual(moved)
    expect(isSolvable(parsed.tiles, parsed.size)).toBe(true)

    const nextIdx = parsed.tiles.findIndex((_, i) => canSlideTile(parsed, i))
    const after = slideTile(parsed, nextIdx)
    expect(after.moves).toBe(2)
  })
})
