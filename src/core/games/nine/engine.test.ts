import { describe, expect, it } from 'vitest'
import {
  BASE_SOLUTIONS,
  CELL_COUNT,
  MAX_UNDO,
  boxOf,
  colOf,
  countSolutions,
  createNine,
  eraseCell,
  getConflicts,
  getDigitCounts,
  getPeers,
  hintNine,
  inputDigit,
  isValidSolution,
  nextPuzzle,
  restartPuzzle,
  rowOf,
  selectCell,
  toggleNotesMode,
  undoNine,
  type NineState,
} from './engine'

describe('Nine (Sudoku) pure engine', () => {
  it('verifies all canonical base grids satisfy every row, column, and 3×3 box', () => {
    for (const base of BASE_SOLUTIONS) {
      expect(base).toHaveLength(CELL_COUNT)
      expect(isValidSolution(base)).toBe(true)
    }
  })

  it('generates mathematically valid, uniquely-solvable puzzles whose givens match solution', () => {
    for (let seed = 1; seed <= 18; seed++) {
      const calm = seed % 3 === 0 ? 0.1 : seed % 3 === 1 ? 0.55 : 0.9
      const state = createNine({ seed, calm })

      expect(state.solution).toHaveLength(CELL_COUNT)
      expect(state.values).toHaveLength(CELL_COUNT)
      expect(state.givens).toHaveLength(CELL_COUNT)
      expect(isValidSolution(state.solution)).toBe(true)
      expect(getConflicts(state).size).toBe(0)
      expect(state.solved).toBe(false)

      for (let i = 0; i < CELL_COUNT; i++) {
        if (state.givens[i]) {
          expect(state.values[i]).toBe(state.solution[i])
        } else {
          expect(state.values[i]).toBe(0)
        }
      }

      // Every generated puzzle has a strictly unique completion.
      expect(countSolutions(state.values, 2)).toBe(1)
    }
  })

  it('scales given counts smoothly along the calm difficulty curve', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const engaging = createNine({ seed, calm: 0.1 })
      const gentle = createNine({ seed, calm: 0.55 })
      const soothing = createNine({ seed, calm: 0.85 })

      const countGivens = (s: NineState) => s.givens.filter(Boolean).length

      expect(countGivens(engaging)).toBeGreaterThanOrEqual(36)
      expect(countGivens(engaging)).toBeLessThanOrEqual(38)

      expect(countGivens(gentle)).toBeGreaterThanOrEqual(42)
      expect(countGivens(gentle)).toBeLessThanOrEqual(44)

      expect(countGivens(soothing)).toBeGreaterThanOrEqual(48)
      expect(countGivens(soothing)).toBeLessThanOrEqual(50)
    }
  })

  it('prevents overwriting, erasing, or noting given cells', () => {
    const initial = createNine({ seed: 12, calm: 0.5 })
    const givenIdx = initial.givens.findIndex(Boolean)
    expect(givenIdx).toBeGreaterThanOrEqual(0)

    const selected = selectCell(initial, givenIdx)
    expect(selected.selected).toBe(givenIdx)

    const altDigit = (initial.values[givenIdx]! % 9) + 1
    expect(inputDigit(selected, altDigit)).toBe(selected)
    expect(eraseCell(selected)).toBe(selected)

    const inNotes = toggleNotesMode(selected)
    expect(inputDigit(inNotes, altDigit)).toBe(inNotes)
  })

  it('toggles pencil notes and automatically prunes matching peer notes on placement', () => {
    let state = createNine({ seed: 7, calm: 0.2 })
    // Find an empty cell and an empty peer (same row, col, or box).
    const targetIdx = state.givens.findIndex((g) => !g)
    expect(targetIdx).toBeGreaterThanOrEqual(0)
    const peerIdx = getPeers(targetIdx).find((p) => !state.givens[p])!
    expect(peerIdx).toBeDefined()

    const digit = state.solution[targetIdx]!
    const otherDigit = (digit % 9) + 1

    // Add notes to the peer cell (both `digit` and `otherDigit`).
    state = toggleNotesMode(selectCell(state, peerIdx))
    state = inputDigit(state, otherDigit)
    state = inputDigit(state, digit)
    expect(state.notes[peerIdx]).toEqual([digit, otherDigit].sort((a, b) => a - b))

    // Toggling an existing note removes it.
    state = inputDigit(state, otherDigit)
    expect(state.notes[peerIdx]).toEqual([digit])
    state = inputDigit(state, otherDigit)
    expect(state.notes[peerIdx]).toEqual([digit, otherDigit].sort((a, b) => a - b))

    // Place `digit` in `targetIdx` — `digit` must auto-prune from `peerIdx`, keeping `otherDigit`.
    state = toggleNotesMode(state)
    state = selectCell(state, targetIdx)
    state = inputDigit(state, digit)

    expect(state.values[targetIdx]).toBe(digit)
    expect(state.notes[targetIdx]).toEqual([])
    expect(state.notes[peerIdx]).toEqual([otherDigit])
  })

  it('detects row, column, and 3×3 box conflicts without blocking input', () => {
    let state = createNine({ seed: 23, calm: 0.4 })
    const emptyIdx = state.givens.findIndex((g) => !g)
    const r = rowOf(emptyIdx)
    const c = colOf(emptyIdx)
    const b = boxOf(emptyIdx)

    // Find a given in the same row, same col, or same box.
    const sameRowGiven = state.givens.findIndex((g, i) => g && i !== emptyIdx && rowOf(i) === r)
    const sameColGiven = state.givens.findIndex((g, i) => g && i !== emptyIdx && colOf(i) === c)
    const sameBoxGiven = state.givens.findIndex((g, i) => g && i !== emptyIdx && boxOf(i) === b)

    for (const conflictPeer of [sameRowGiven, sameColGiven, sameBoxGiven]) {
      if (conflictPeer < 0) continue
      const dupDigit = state.values[conflictPeer]!
      const placed = inputDigit(selectCell(state, emptyIdx), dupDigit)
      const conflicts = getConflicts(placed)
      expect(conflicts.has(emptyIdx)).toBe(true)
      expect(conflicts.has(conflictPeer)).toBe(true)
    }
  })

  it('supports undo up to MAX_UNDO (15) steps and eraseCell', () => {
    let state = createNine({ seed: 31, calm: 0.2 })
    const empties = state.givens
      .map((g, i) => (g ? -1 : i))
      .filter((i) => i >= 0)
    expect(empties.length).toBeGreaterThan(MAX_UNDO + 3)

    // Perform 18 placements — undo stack should cap at 15.
    for (let k = 0; k < MAX_UNDO + 3; k++) {
      const idx = empties[k]!
      state = inputDigit(selectCell(state, idx), state.solution[idx]!)
    }
    expect(state.undoStack).toHaveLength(MAX_UNDO)

    const lastIdx = empties[MAX_UNDO + 2]!
    expect(state.values[lastIdx]).toBe(state.solution[lastIdx])

    // Erase the last cell and undo the erase.
    state = eraseCell(selectCell(state, lastIdx))
    expect(state.values[lastIdx]).toBe(0)
    state = undoNine(state)
    expect(state.values[lastIdx]).toBe(state.solution[lastIdx])

    // Undo all 15 remaining snapshots cleanly.
    for (let k = 0; k < MAX_UNDO; k++) {
      state = undoNine(state)
    }
    expect(state.undoStack).toHaveLength(0)
    expect(undoNine(state)).toBe(state)
  })

  it('gently fills cells via hintNine until solved and tracks digit counts', () => {
    let state = createNine({ seed: 44, calm: 0.9 })
    const firstEmpty = state.givens.findIndex((g) => !g)
    state = selectCell(state, firstEmpty)

    // Hint prefers selected empty cell.
    state = hintNine(state)
    expect(state.values[firstEmpty]).toBe(state.solution[firstEmpty])
    expect(state.hintsUsed).toBe(1)

    // Repeated hints solve the entire board cleanly.
    let guard = 0
    while (!state.solved && guard < 50) {
      state = hintNine(state)
      guard++
    }
    expect(state.solved).toBe(true)
    expect(getConflicts(state).size).toBe(0)

    const counts = getDigitCounts(state.values)
    for (let d = 1; d <= 9; d++) {
      expect(counts[d]).toBe(9)
    }

    // Restart returns to givens only; nextPuzzle advances puzzleNumber.
    const restarted = restartPuzzle(state)
    expect(restarted.solved).toBe(false)
    expect(restarted.moves).toBe(0)
    expect(restarted.hintsUsed).toBe(0)
    expect(restarted.values[firstEmpty]).toBe(0)

    const next = nextPuzzle(state, 0.2)
    expect(next.puzzleNumber).toBe(state.puzzleNumber + 1)
    expect(next.solved).toBe(false)
    expect(isValidSolution(next.solution)).toBe(true)
  })

  it('round-trips cleanly through JSON serialisation with deterministic continuation', () => {
    let state = createNine({ seed: 909, calm: 0.3 })
    const idx = state.givens.findIndex((g) => !g)
    state = toggleNotesMode(selectCell(state, idx))
    state = inputDigit(state, 3)
    state = inputDigit(state, 7)

    const revived = JSON.parse(JSON.stringify(state)) as NineState
    expect(revived).toEqual(state)

    expect(hintNine(revived)).toEqual(hintNine(state))
    expect(nextPuzzle(revived, 0.8)).toEqual(nextPuzzle(state, 0.8))
  })
})
