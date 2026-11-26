import { describe, expect, it } from 'vitest'
import {
  PIECE_COLORS,
  PUZZLES,
  boardFillPercent,
  cancelActivePath,
  clearBoard,
  countConnectedPairs,
  countFilledCells,
  createThread,
  endPath,
  extendPath,
  isAllPairsConnected,
  isInBounds,
  isOrthogonallyAdjacent,
  nextPuzzle,
  sameCell,
  sizeForCalm,
  startPath,
  threadReducer,
  undo,
  type ThreadPuzzle,
  type ThreadState,
} from './engine'

function playSolution(state: ThreadState, puzzle: ThreadPuzzle): ThreadState {
  let s = state
  for (const pair of puzzle.pairs) {
    s = startPath(s, pair.solution[0]!)
    for (let i = 1; i < pair.solution.length; i++) {
      s = extendPath(s, pair.solution[i]!)
    }
    s = endPath(s)
  }
  return s
}

describe('Thread curated puzzle library', () => {
  it('contains at least 18 puzzles spanning 5×5, 6×6, and 7×7', () => {
    expect(PUZZLES.length).toBeGreaterThanOrEqual(18)
    const by5 = PUZZLES.filter((p) => p.size === 5)
    const by6 = PUZZLES.filter((p) => p.size === 6)
    const by7 = PUZZLES.filter((p) => p.size === 7)
    expect(by5.length).toBeGreaterThanOrEqual(5)
    expect(by6.length).toBeGreaterThanOrEqual(5)
    expect(by7.length).toBeGreaterThanOrEqual(5)

    // Unique puzzle IDs
    const ids = new Set(PUZZLES.map((p) => p.id))
    expect(ids.size).toBe(PUZZLES.length)
  })

  it.each(PUZZLES.map((p) => [p.id, p] as const))(
    'puzzle %s has valid bounds, unique colours, non-overlapping paths covering 100%% of grid',
    (_id, puzzle) => {
      const { size, pairs } = puzzle
      const colorSet = new Set<string>()
      const endpointKeys = new Set<string>()
      const cellKeys = new Set<string>()

      if (size === 5) expect(pairs.length).toBeGreaterThanOrEqual(4)
      if (size === 6) expect(pairs.length).toBeGreaterThanOrEqual(5)
      if (size === 7) expect(pairs.length).toBeGreaterThanOrEqual(5)
      expect(pairs.length).toBeLessThanOrEqual(PIECE_COLORS.length)

      for (const pair of pairs) {
        expect(PIECE_COLORS).toContain(pair.color)
        expect(colorSet.has(pair.color)).toBe(false)
        colorSet.add(pair.color)

        // Solution path length >= 3 so endpoints are never trivially adjacent.
        expect(pair.solution.length).toBeGreaterThanOrEqual(3)
        expect(sameCell(pair.a, pair.solution[0]!)).toBe(true)
        expect(sameCell(pair.b, pair.solution[pair.solution.length - 1]!)).toBe(true)
        expect(sameCell(pair.a, pair.b)).toBe(false)

        const keyA = `${pair.a.row},${pair.a.col}`
        const keyB = `${pair.b.row},${pair.b.col}`
        expect(endpointKeys.has(keyA)).toBe(false)
        expect(endpointKeys.has(keyB)).toBe(false)
        endpointKeys.add(keyA)
        endpointKeys.add(keyB)

        for (let i = 0; i < pair.solution.length; i++) {
          const cell = pair.solution[i]!
          expect(isInBounds(size, cell)).toBe(true)
          if (i > 0) {
            expect(isOrthogonallyAdjacent(pair.solution[i - 1]!, cell)).toBe(true)
          }
          const key = `${cell.row},${cell.col}`
          expect(cellKeys.has(key)).toBe(false)
          cellKeys.add(key)
        }
      }

      // 100% grid coverage
      expect(cellKeys.size).toBe(size * size)
    },
  )

  it('solves every curated puzzle when playing its verified solution through the engine', () => {
    for (const puzzle of PUZZLES) {
      const initial = createThread({ seed: 42, puzzleId: puzzle.id })
      expect(initial.solved).toBe(false)
      expect(boardFillPercent(initial)).toBe(0)

      const solved = playSolution(initial, puzzle)
      expect(solved.solved).toBe(true)
      expect(countConnectedPairs(solved)).toBe(puzzle.pairs.length)
      expect(countFilledCells(solved)).toBe(puzzle.size * puzzle.size)
      expect(boardFillPercent(solved)).toBe(100)
    }
  })
})

describe('Thread path editing state machine', () => {
  it('draws a path from an endpoint, backtracks smoothly, and stops at matching endpoint', () => {
    const puzzle = PUZZLES.find((p) => p.id === '5x5-1')!
    let s = createThread({ seed: 7, puzzleId: puzzle.id })
    const ember = puzzle.pairs.find((p) => p.color === 'ember')!
    // ember solution: (0,0)-(0,1)-(0,2)-(0,3)-(1,3)-(2,3)

    s = startPath(s, ember.a)
    expect(s.activeColor).toBe('ember')
    expect(s.paths.ember).toEqual([{ row: 0, col: 0 }])

    s = extendPath(s, { row: 0, col: 1 })
    s = extendPath(s, { row: 0, col: 2 })
    expect(s.paths.ember?.length).toBe(3)

    // Backtrack onto (0, 1)
    s = extendPath(s, { row: 0, col: 1 })
    expect(s.paths.ember).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ])

    // Continue all the way to matching endpoint (2, 3)
    s = extendPath(s, { row: 0, col: 2 })
    s = extendPath(s, { row: 0, col: 3 })
    s = extendPath(s, { row: 1, col: 3 })
    s = extendPath(s, { row: 2, col: 3 })
    expect(s.paths.ember?.length).toBe(6)

    // Cannot extend past target endpoint (e.g. to (3, 3))
    const afterOvershoot = extendPath(s, { row: 3, col: 3 })
    expect(afterOvershoot.paths.ember?.length).toBe(6)

    // Can still backtrack from target endpoint while active
    const afterPullBack = extendPath(s, { row: 1, col: 3 })
    expect(afterPullBack.paths.ember?.length).toBe(5)

    // Complete stroke
    s = endPath(s)
    expect(s.activeColor).toBeNull()
    expect(s.moves).toBe(1)
    expect(countConnectedPairs(s)).toBe(1)
  })

  it('interpolates straight-line fast pointer jumps of 2+ orthogonal cells', () => {
    const puzzle = PUZZLES.find((p) => p.id === '5x5-1')!
    let s = createThread({ seed: 7, puzzleId: puzzle.id })
    // ember starts at (0,0) and runs across row 0 to (0,3)
    s = startPath(s, { row: 0, col: 0 })
    s = extendPath(s, { row: 0, col: 3 }) // 3-cell straight jump
    expect(s.paths.ember).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ])
    // Diagonal jumps are ignored cleanly
    const afterDiag = extendPath(s, { row: 1, col: 2 })
    expect(afterDiag).toBe(s)
  })

  it('prevents entering another colour endpoint dot', () => {
    const puzzle = PUZZLES.find((p) => p.id === '5x5-1')!
    let s = createThread({ seed: 7, puzzleId: puzzle.id })
    // ember starts at (0,0); honey endpoint is at (1,0)
    s = startPath(s, { row: 0, col: 0 })
    const blocked = extendPath(s, { row: 1, col: 0 })
    expect(blocked.paths.ember).toEqual([{ row: 0, col: 0 }])
  })

  it('cleanly cuts another colour path right before the intersection cell', () => {
    const puzzle = PUZZLES.find((p) => p.id === '5x5-1')!
    let s = createThread({ seed: 7, puzzleId: puzzle.id })
    // Draw ember along (0,0)-(0,1)-(0,2)-(0,3)-(1,3)-(2,3)
    s = startPath(s, { row: 0, col: 0 })
    s = extendPath(s, { row: 0, col: 3 })
    s = extendPath(s, { row: 2, col: 3 })
    s = endPath(s)
    expect(s.paths.ember?.length).toBe(6)

    // Draw moss from (1,2) up to (0,2), intersecting ember at index 2
    s = startPath(s, { row: 1, col: 2 })
    s = extendPath(s, { row: 0, col: 2 })
    s = endPath(s)

    expect(s.paths.moss).toEqual([
      { row: 1, col: 2 },
      { row: 0, col: 2 },
    ])
    // Ember was cleanly cut right before (0,2) -> [(0,0), (0,1)]
    expect(s.paths.ember).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ])
    expect(countConnectedPairs(s)).toBe(0)
  })

  it('resumes drawing from the middle of an existing path and trims the tail', () => {
    const puzzle = PUZZLES.find((p) => p.id === '5x5-1')!
    let s = createThread({ seed: 7, puzzleId: puzzle.id })
    s = startPath(s, { row: 0, col: 0 })
    s = extendPath(s, { row: 0, col: 3 })
    s = endPath(s)
    expect(s.paths.ember?.length).toBe(4)

    // Start from (0,1) on ember's path -> trims to [(0,0), (0,1)]
    s = startPath(s, { row: 0, col: 1 })
    expect(s.activeColor).toBe('ember')
    expect(s.paths.ember).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ])
  })

  it('requires both all pairs connected AND 100% board fill to solve', () => {
    const p64 = PUZZLES.find((x) => x.id === '6x6-4')!
    let s64 = createThread({ seed: 1, puzzleId: p64.id })

    // Connect ember, honey, rose along their canonical paths
    for (const color of ['ember', 'honey', 'rose'] as const) {
      const pair = p64.pairs.find((x) => x.color === color)!
      s64 = startPath(s64, pair.solution[0]!)
      for (let i = 1; i < pair.solution.length; i++) s64 = extendPath(s64, pair.solution[i]!)
      s64 = endPath(s64)
    }

    // Connect saffron and moss via shorter detours that leave corner cells empty
    s64 = startPath(s64, { row: 2, col: 3 })
    s64 = extendPath(s64, { row: 4, col: 3 })
    s64 = extendPath(s64, { row: 4, col: 4 })
    s64 = endPath(s64)

    s64 = startPath(s64, { row: 1, col: 4 })
    s64 = extendPath(s64, { row: 1, col: 5 })
    s64 = extendPath(s64, { row: 5, col: 5 })
    s64 = endPath(s64)

    expect(isAllPairsConnected(s64)).toBe(true)
    expect(countFilledCells(s64)).toBeLessThan(s64.size * s64.size)
    expect(s64.solved).toBe(false)
  })

  it('supports undo, cancelActivePath, clearBoard, and threadReducer', () => {
    const puzzle = PUZZLES.find((p) => p.id === '5x5-1')!
    let s = createThread({ seed: 11, puzzleId: puzzle.id })

    // Draw stroke 1 via reducer
    s = threadReducer(s, { type: 'start', cell: { row: 0, col: 0 } })
    s = threadReducer(s, { type: 'extend', cell: { row: 0, col: 3 } })
    s = threadReducer(s, { type: 'end' })
    expect(s.history.length).toBe(1)
    expect(s.paths.ember?.length).toBe(4)

    // Start stroke 2 then cancel it
    s = startPath(s, { row: 1, col: 0 })
    s = extendPath(s, { row: 3, col: 0 })
    expect(s.paths.honey?.length).toBe(3)
    s = cancelActivePath(s)
    expect(s.activeColor).toBeNull()
    expect(s.paths.honey).toBeUndefined()
    expect(s.history.length).toBe(1)

    // Clear board (undoable!)
    s = clearBoard(s)
    expect(countFilledCells(s)).toBe(0)
    expect(s.history.length).toBe(2)

    // Undo restores cleared board
    s = undo(s)
    expect(s.paths.ember?.length).toBe(4)
    expect(s.history.length).toBe(1)

    // Undo again restores empty board
    s = undo(s)
    expect(s.paths.ember).toBeUndefined()
    expect(s.history.length).toBe(0)
  })
})

describe('Calm progression & serialisation', () => {
  // Hard (calm 0) and Medium (0.3) used to land on the same 7×7/6×6 pool.
  it('progresses from 7×7/6×6 for Hard to 6×6 for Medium and 5×5 for Easy', () => {
    expect(sizeForCalm(0, 1)).toBe(7)
    expect(sizeForCalm(0.1, 2)).toBe(6)
    expect(sizeForCalm(0.14, 3)).toBe(7)

    expect(sizeForCalm(0.3, 1)).toBe(6)
    expect(sizeForCalm(0.35, 1)).toBe(6)
    expect(sizeForCalm(0.5, 2)).toBe(6)
    expect(sizeForCalm(0.64, 3)).toBe(6)

    expect(sizeForCalm(0.65, 1)).toBe(5)
    expect(sizeForCalm(0.85, 2)).toBe(5)
    expect(sizeForCalm(1.0, 3)).toBe(5)

    let s = createThread({ seed: 101, calm: 0.0 })
    expect([6, 7]).toContain(s.size)

    s = nextPuzzle(s, 0.5)
    expect(s.size).toBe(6)
    expect(s.puzzleNumber).toBe(2)

    s = nextPuzzle(s, 0.8)
    expect(s.size).toBe(5)
    expect(s.puzzleNumber).toBe(3)
  })

  it('cycles through distinct puzzles in a tier without immediate repeats', () => {
    let s = createThread({ seed: 99, calm: 0.8 })
    const seen = new Set<string>([s.puzzleId])
    for (let i = 0; i < 6; i++) {
      const prevId = s.puzzleId
      s = nextPuzzle(s, 0.8)
      expect(s.size).toBe(5)
      expect(s.puzzleId).not.toBe(prevId)
      seen.add(s.puzzleId)
    }
    expect(seen.size).toBe(7)
  })

  it('round-trips cleanly through JSON.stringify / JSON.parse', () => {
    const puzzle = PUZZLES.find((p) => p.id === '6x6-1')!
    let s = createThread({ seed: 55, calm: 0.4, puzzleId: puzzle.id })
    s = startPath(s, puzzle.pairs[0]!.solution[0]!)
    s = extendPath(s, puzzle.pairs[0]!.solution[1]!)
    s = extendPath(s, puzzle.pairs[0]!.solution[2]!)
    s = endPath(s)

    const roundTripped = JSON.parse(JSON.stringify(s)) as ThreadState
    expect(roundTripped).toEqual(s)

    // Continuing play on deserialised state works seamlessly
    const solved = playSolution(roundTripped, puzzle)
    expect(solved.solved).toBe(true)
  })
})
