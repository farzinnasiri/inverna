import { describe, expect, it } from 'vitest'
import {
  WEAVE_PUZZLES,
  clearWeave,
  computeClues,
  computeLineClue,
  countFilledCells,
  createWeave,
  getColumnLine,
  isLineSatisfied,
  isWeaveSolved,
  nextPuzzle,
  parsePattern,
  restartPuzzle,
  setCell,
  toggleCell,
  undoWeave,
  type WeaveState,
} from './engine'

describe('Weave (Nonogram) pure engine', () => {
  it('curates at least 18 unique silhouettes with valid dimensions and non-empty row/col clues', () => {
    expect(WEAVE_PUZZLES.length).toBeGreaterThanOrEqual(18)

    const ids = new Set(WEAVE_PUZZLES.map((p) => p.id))
    const titles = new Set(WEAVE_PUZZLES.map((p) => p.title))
    expect(ids.size).toBe(WEAVE_PUZZLES.length)
    expect(titles.size).toBe(WEAVE_PUZZLES.length)

    const sizes = new Set(WEAVE_PUZZLES.map((p) => p.size))
    expect(sizes.has(5)).toBe(true)
    expect(sizes.has(7)).toBe(true)
    expect(sizes.has(8)).toBe(true)

    for (const def of WEAVE_PUZZLES) {
      expect(def.pattern).toHaveLength(def.size)
      for (const rowStr of def.pattern) {
        expect(rowStr).toHaveLength(def.size)
        expect(rowStr).toMatch(/^[#.]+$/)
      }

      const sol = parsePattern(def.pattern)
      const { rowClues, colClues } = computeClues(sol)
      expect(rowClues).toHaveLength(def.size)
      expect(colClues).toHaveLength(def.size)

      for (const clue of [...rowClues, ...colClues]) {
        expect(clue.length).toBeGreaterThan(0)
        expect(clue[0]).toBeGreaterThan(0)
      }
    }
  })

  it('computes run-length clues accurately for empty, single, and multi-run lines', () => {
    expect(computeLineClue([0, 0, 0, 0, 0])).toEqual([0])
    expect(computeLineClue([2, 0, 2, 0, 2])).toEqual([0])
    expect(computeLineClue([1, 1, 1, 1, 1])).toEqual([5])
    expect(computeLineClue([1, 0, 1, 1, 0, 1])).toEqual([1, 2, 1])
    expect(computeLineClue([0, 1, 1, 2, 1, 0])).toEqual([2, 1])

    const sample = [
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 0],
    ]
    const { rowClues, colClues } = computeClues(sample)
    expect(rowClues).toEqual([[1, 1], [3], [1]])
    expect(colClues).toEqual([[2], [2], [2]])
  })

  it('supports drag fill/mark via setCell, toggleCell, undo, and clear', () => {
    let state = createWeave({ seed: 10, calm: 0.8, puzzleId: 'heart' })
    expect(state.rows).toBe(5)
    expect(state.cols).toBe(5)
    expect(state.solved).toBe(false)

    // Toggle fill on (0, 1) -> 1, then toggle again -> 0.
    state = toggleCell(state, 0, 1, 'fill')
    expect(state.grid[0]![1]).toBe(1)
    expect(state.undoStack).toHaveLength(1)

    state = toggleCell(state, 0, 1, 'fill')
    expect(state.grid[0]![1]).toBe(0)
    expect(state.undoStack).toHaveLength(2)

    // Toggle mark on (0, 0) -> 2 (cross).
    state = toggleCell(state, 0, 0, 'mark')
    expect(state.grid[0]![0]).toBe(2)

    // Simulate a multi-cell drag stroke with a single undo snapshot.
    state = setCell(state, 1, 0, 1, { recordUndo: true })
    state = setCell(state, 1, 1, 1, { recordUndo: false })
    state = setCell(state, 1, 2, 1, { recordUndo: false })
    expect(state.grid[1]!.slice(0, 3)).toEqual([1, 1, 1])

    // Undo reverts the entire drag stroke at once.
    state = undoWeave(state)
    expect(state.grid[1]!.slice(0, 3)).toEqual([0, 0, 0])

    // Clear resets marks and fills, and can itself be undone.
    state = setCell(state, 2, 2, 1)
    state = clearWeave(state)
    expect(countFilledCells(state).filled).toBe(0)
    expect(state.grid[0]![0]).toBe(0)

    state = undoWeave(state)
    expect(state.grid[2]![2]).toBe(1)
    expect(state.grid[0]![0]).toBe(2)
  })

  it('checks line satisfaction and detects completion by clue equivalence (even with marks)', () => {
    let state = createWeave({ seed: 5, calm: 0.8, puzzleId: 'hourglass' })

    // Fill row 0 completely (clue is [5]) — row 0 becomes satisfied.
    for (let c = 0; c < state.cols; c++) {
      state = setCell(state, 0, c, 1)
    }
    expect(isLineSatisfied(state.grid[0]!, state.rowClues[0]!)).toBe(true)
    expect(state.solved).toBe(false)

    // Fill all remaining solution cells, and place cross marks on empty cells.
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        if (state.solved) break
        const val = state.solution[r]![c] === 1 ? 1 : 2
        state = setCell(state, r, c, val)
      }
    }

    expect(state.solved).toBe(true)
    for (let r = 0; r < state.rows; r++) {
      expect(isLineSatisfied(state.grid[r]!, state.rowClues[r]!)).toBe(true)
    }
    for (let c = 0; c < state.cols; c++) {
      expect(isLineSatisfied(getColumnLine(state.grid, c), state.colClues[c]!)).toBe(true)
    }

    // Alternate valid pattern with identical clues also satisfies isWeaveSolved.
    const altClues = computeClues([
      [1, 0],
      [0, 1],
    ])
    expect(
      isWeaveSolved(
        [
          [0, 1],
          [1, 0],
        ],
        altClues.rowClues,
        altClues.colClues,
      ),
    ).toBe(true)

    const restarted = restartPuzzle(state)
    expect(restarted.solved).toBe(false)
    expect(restarted.moves).toBe(0)
    expect(countFilledCells(restarted).filled).toBe(0)
  })

  it('progresses grid sizes smoothly by calm level and avoids repeating on nextPuzzle', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const lowCalm = createWeave({ seed, calm: 0.1 })
      expect([7, 8]).toContain(lowCalm.rows)

      const midCalm = createWeave({ seed, calm: 0.5 })
      expect([5, 7]).toContain(midCalm.rows)

      const highCalm = createWeave({ seed, calm: 0.8 })
      expect(highCalm.rows).toBe(5)
      expect(highCalm.cols).toBe(5)

      const nxt = nextPuzzle(highCalm, 0.8)
      expect(nxt.puzzleNumber).toBe(highCalm.puzzleNumber + 1)
      expect(nxt.puzzleId).not.toBe(highCalm.puzzleId)
      expect(nxt.rows).toBe(5)
    }
  })

  it('round-trips cleanly through JSON serialisation', () => {
    let state = createWeave({ seed: 77, calm: 0.4 })
    state = toggleCell(state, 0, 0, 'fill')
    state = toggleCell(state, 0, 1, 'mark')

    const revived = JSON.parse(JSON.stringify(state)) as WeaveState
    expect(revived).toEqual(state)
    expect(nextPuzzle(revived, 0.7)).toEqual(nextPuzzle(state, 0.7))
  })
})
