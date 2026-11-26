import { describe, expect, it } from 'vitest'
import {
  BASE_GRAVITY_MS,
  BOARD_COLS,
  BOARD_ROWS,
  CLEAR_DURATION_MS,
  createEmptyBoard,
  createSettle,
  DISSOLVE_DURATION_MS,
  DISSOLVE_ROWS,
  getGhostY,
  getPieceCells,
  gravityIntervalMs,
  hardDrop,
  hold,
  LOCK_DELAY_MS,
  MAX_CALM_GRAVITY_MS,
  MAX_LOCK_RESETS,
  moveLeft,
  moveRight,
  PIECE_COLORS,
  restart,
  rotateCCW,
  rotateCW,
  settleReducer,
  softDrop,
  TETROMINO_TYPES,
  tickSettle,
  type SettleState,
  type TetrominoType,
} from './engine'

function stateWithActive(
  type: TetrominoType,
  overrides: Partial<SettleState> = {},
  pos?: { x: number; y: number; rotation?: 0 | 1 | 2 | 3 },
): SettleState {
  const base = createSettle({ seed: 42 })
  const active = {
    type,
    x: pos?.x ?? (type === 'O' ? 4 : 3),
    y: pos?.y ?? (type === 'I' ? -1 : 0),
    rotation: pos?.rotation ?? 0,
  }
  return {
    ...base,
    active,
    lowestY: active.y,
    ...overrides,
  }
}

describe('settle lock delay', () => {
  // ISS-17: with every reset used, stepping off a ledge zeroed the lock delay,
  // so moving between ledges at one height never locked.
  it('keeps the lock delay while airborne once every reset is used', () => {
    const lifted = stateWithActive('T', { lockResets: MAX_LOCK_RESETS, lockTimerMs: 400 }, { x: 3, y: 5 })
    const next = tickSettle({ ...lifted, lowestY: 5 }, 1, 0)
    expect(next.lockTimerMs).toBe(400)
  })

  it('a new lowest row still starts the delay over', () => {
    const lifted = stateWithActive('T', { lockResets: MAX_LOCK_RESETS, lockTimerMs: 400, gravityTimerMs: BASE_GRAVITY_MS * 4 }, { x: 3, y: 5 })
    const next = tickSettle({ ...lifted, lowestY: 5 }, 1, 0)
    expect(next.active!.y).toBeGreaterThan(5)
    expect(next.lockTimerMs).toBe(0)
  })
})

describe('settle engine', () => {
  it('uses a fair 7-bag randomizer with all 7 distinct pieces per bag', () => {
    let state = createSettle({ seed: 1337 })
    const drawn: TetrominoType[] = []

    for (let i = 0; i < 21; i++) {
      expect(state.active).not.toBeNull()
      expect(state.queue.length).toBeGreaterThanOrEqual(3)
      drawn.push(state.active!.type)
      state = hardDrop(state)
      // Complete any clear animation if rows happen to fill
      if (state.clearingRows.length > 0) {
        state = tickSettle(state, CLEAR_DURATION_MS + 10, 0)
      }
    }

    for (let bag = 0; bag < 3; bag++) {
      const slice = drawn.slice(bag * 7, bag * 7 + 7)
      expect(new Set(slice)).toEqual(new Set(TETROMINO_TYPES))
    }

    // All 7 tetrominoes map to 7 distinct Inverna piece colors
    expect(new Set(Object.values(PIECE_COLORS)).size).toBe(7)
  })

  it('supports SRS rotation and wall kicks for JLSTZ and I pieces', () => {
    // T piece flush against right wall in rot 3 (cells at cols 8,9) kicks left on CW to rot 0
    const tRight = stateWithActive('T', {}, { x: 8, y: 5, rotation: 3 })
    const tRotated = rotateCW(tRight)
    expect(tRotated.active?.rotation).toBe(0)
    expect(tRotated.active?.x).toBe(7)
    for (const [cx] of getPieceCells(tRotated.active!)) {
      expect(cx).toBeGreaterThanOrEqual(0)
      expect(cx).toBeLessThan(BOARD_COLS)
    }

    // I piece vertical against left wall (rot 3 has cells at x+1, so x=-1 puts it in col 0)
    // Rotating CW (3 -> 0) needs space on the right and kicks via I_KICKS
    const iLeft = stateWithActive('I', {}, { x: -1, y: 6, rotation: 3 })
    const iRotated = rotateCW(iLeft)
    expect(iRotated.active?.rotation).toBe(0)
    expect(iRotated.active?.x).toBe(0)

    // CCW rotation round-trips cleanly in open space
    const openJ = stateWithActive('J', {}, { x: 4, y: 6, rotation: 0 })
    const ccw = rotateCCW(openJ)
    expect(ccw.active?.rotation).toBe(3)
    expect(rotateCW(ccw).active?.rotation).toBe(0)
  })

  it('computes accurate ghost Y above empty floor and existing stacks', () => {
    // O piece (2 rows tall) on empty 20-row board lands at y = 18
    const empty = stateWithActive('O', {}, { x: 4, y: 0, rotation: 0 })
    expect(getGhostY(empty)).toBe(BOARD_ROWS - 2)

    // Place a block at row 15, col 4 -> O piece stops at y = 13 (occupies rows 13, 14)
    const board = createEmptyBoard()
    board[15]![4] = 'ember'
    const stacked = stateWithActive('O', { board }, { x: 4, y: 0, rotation: 0 })
    expect(getGhostY(stacked)).toBe(13)
  })

  it('blooms cleared lines for ~260ms before collapsing rows and counting lines', () => {
    const board = createEmptyBoard()
    // Fill bottom row except cols 3..6 so horizontal I piece completes it
    for (let c = 0; c < BOARD_COLS; c++) {
      if (c < 3 || c > 6) board[19]![c] = 'clay'
    }
    // Put a marker block on row 18 col 0 to verify collapse shifts rows down
    board[18]![0] = 'rose'

    let state = stateWithActive('I', { board }, { x: 3, y: 0, rotation: 0 })
    state = hardDrop(state)

    // Entering clear bloom phase
    expect(state.clearingRows).toEqual([19])
    expect(state.clearTimerMs).toBe(CLEAR_DURATION_MS)
    expect(state.active).toBeNull()
    expect(state.pieces).toBe(1)
    expect(state.clearEventId).toBe(1)
    expect(state.lastClearCount).toBe(1)

    // Halfway through bloom: still blooming
    state = tickSettle(state, CLEAR_DURATION_MS / 2, 0)
    expect(state.clearingRows).toEqual([19])
    expect(state.lines).toBe(0)

    // Past bloom: row collapses, marker shifts from row 18 to row 19, next piece spawns
    state = tickSettle(state, CLEAR_DURATION_MS, 0)
    expect(state.clearingRows).toEqual([])
    expect(state.lines).toBe(1)
    expect(state.board[19]![0]).toBe('rose')
    expect(state.board[18]![0]).toBeNull()
    expect(state.active).not.toBeNull()
  })

  it('enforces hold swap once per drop and resets availability on lock', () => {
    let state = createSettle({ seed: 99 })
    const first = state.active!.type
    const second = state.queue[0]!

    state = hold(state)
    expect(state.hold).toBe(first)
    expect(state.active?.type).toBe(second)
    expect(state.canHold).toBe(false)

    // Second hold before locking is ignored
    const afterSecondHold = hold(state)
    expect(afterSecondHold).toBe(state)

    // After locking, hold is available again and swaps with held piece
    state = hardDrop(state)
    expect(state.canHold).toBe(true)
    const third = state.active!.type
    state = hold(state)
    expect(state.active?.type).toBe(first)
    expect(state.hold).toBe(third)
    expect(state.canHold).toBe(false)
  })

  it('slows gravity smoothly with calm and never speeds up with lines cleared', () => {
    expect(gravityIntervalMs(0)).toBe(BASE_GRAVITY_MS)
    expect(gravityIntervalMs(1)).toBe(MAX_CALM_GRAVITY_MS)
    expect(gravityIntervalMs(0.5)).toBeGreaterThan(gravityIntervalMs(0))
    expect(gravityIntervalMs(1)).toBeGreaterThan(gravityIntervalMs(0.5))

    // Even after 100 lines cleared, gravity at calm = 0 stays BASE_GRAVITY_MS
    const highLines = stateWithActive('T', { lines: 100 }, { x: 3, y: 0, rotation: 0 })
    const justBefore = tickSettle(highLines, BASE_GRAVITY_MS - 10, 0)
    expect(justBefore.active?.y).toBe(0)
    const justAfter = tickSettle(highLines, BASE_GRAVITY_MS, 0)
    expect(justAfter.active?.y).toBe(1)

    // At calm = 1, BASE_GRAVITY_MS is NOT enough to drop a row; MAX_CALM_GRAVITY_MS is
    const calmState = stateWithActive('T', {}, { x: 3, y: 0, rotation: 0 })
    expect(tickSettle(calmState, BASE_GRAVITY_MS, 1).active?.y).toBe(0)
    expect(tickSettle(calmState, MAX_CALM_GRAVITY_MS, 1).active?.y).toBe(1)
  })

  it('caps lock delay resets so pieces settle naturally', () => {
    let state = stateWithActive('O', {}, { x: 4, y: BOARD_ROWS - 2, rotation: 0 })

    // Move left/right up to MAX_LOCK_RESETS while grounded
    for (let i = 0; i < MAX_LOCK_RESETS; i++) {
      state = tickSettle(state, LOCK_DELAY_MS - 50, 0)
      expect(state.pieces).toBe(0)
      state = i % 2 === 0 ? moveLeft(state) : moveRight(state)
      expect(state.lockTimerMs).toBe(0)
    }

    // Once cap is reached, another move does NOT reset lockTimerMs
    state = tickSettle(state, LOCK_DELAY_MS - 50, 0)
    state = moveLeft(state)
    expect(state.lockTimerMs).toBe(LOCK_DELAY_MS - 50)
    state = tickSettle(state, 60, 0)
    expect(state.pieces).toBe(1)
  })

  it('dissolves bottom 4 rows on top-out instead of game over', () => {
    const board = createEmptyBoard()
    // Build a tall stack with a 2-column gap on cols 0..1 on rows 1..14 so no row fills
    for (let r = 1; r < BOARD_ROWS; r++) {
      for (let c = 2; c < BOARD_COLS - 1; c++) {
        board[r]![c] = r >= BOARD_ROWS - DISSOLVE_ROWS ? 'ember' : 'sand'
      }
    }
    // Marker at row 15 col 0 (just above bottom 4 rows 16..19)
    board[15]![0] = 'honey'

    // Block spawn zone at row 0 cols 3..6 so next piece cannot spawn without dissolving
    board[0]![3] = 'clay'
    board[0]![4] = 'clay'
    board[0]![5] = 'clay'
    board[0]![6] = 'clay'

    // Support block under O at row 2 cols 8..9 so O locks cleanly at rows 0..1 without filling any row
    board[2]![8] = 'moss'
    board[2]![9] = 'moss'
    let state = stateWithActive('O', { board }, { x: 8, y: 0, rotation: 0 })

    state = hardDrop(state)

    // Never game over: active piece spawned cleanly, bottom 4 rows dissolved
    expect(state.clearingRows).toEqual([])
    expect(state.active).not.toBeNull()
    expect(state.dissolveCount).toBe(1)
    expect(state.dissolving).not.toBeNull()
    expect(state.dissolving?.rows).toHaveLength(DISSOLVE_ROWS)
    expect(state.dissolving?.remainingMs).toBe(DISSOLVE_DURATION_MS)
    // Marker that was at row 15 shifted down by DISSOLVE_ROWS to row 19
    expect(state.board[19]![0]).toBe('honey')

    // Dissolve notice fades cleanly to null after DISSOLVE_DURATION_MS
    state = tickSettle(state, DISSOLVE_DURATION_MS + 10, 0)
    expect(state.dissolving).toBeNull()
  })

  it('ends Classic when the next piece cannot spawn and preserves the stack', () => {
    const board = createEmptyBoard()
    for (let col = 3; col <= 6; col++) board[0]![col] = 'clay'
    board[BOARD_ROWS - 1]![0] = 'honey'
    const state = stateWithActive('O', { board, mode: 'classic' }, { x: 8, y: 0, rotation: 0 })
    const toppedOut = hardDrop(state)

    expect(toppedOut.gameOver).toBe(true)
    expect(toppedOut.active).toBeNull()
    expect(toppedOut.dissolveCount).toBe(0)
    expect(toppedOut.board[0]![3]).toBe('clay')
    expect(toppedOut.board[BOARD_ROWS - 1]![0]).toBe('honey')
    expect(tickSettle(toppedOut, 10_000, 0)).toBe(toppedOut)
    expect(restart(toppedOut, 123)).toMatchObject({ mode: 'classic', gameOver: false })
  })

  it('also ends Classic when a piece brought in from Hold cannot spawn', () => {
    const board = createEmptyBoard()
    for (let col = 3; col <= 6; col++) board[0]![col] = 'clay'
    const state = stateWithActive('O', { board, mode: 'classic', hold: 'I' }, { x: 8, y: 0 })
    const toppedOut = hold(state)

    expect(toppedOut.gameOver).toBe(true)
    expect(toppedOut.active).toBeNull()
    expect(toppedOut.board).toEqual(board)
    expect(toppedOut.dissolving).toBeNull()
  })

  it('handles 4-line clears accurately and reports lastClearCount = 4', () => {
    const board = createEmptyBoard()
    for (let r = 16; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS - 1; c++) {
        board[r]![c] = 'saffron'
      }
    }
    // Vertical I piece (rot 1 occupies col x+2) at x = 7 drops straight into col 9
    let state = stateWithActive('I', { board }, { x: 7, y: 0, rotation: 1 })
    state = hardDrop(state)

    expect(state.clearingRows).toEqual([16, 17, 18, 19])
    expect(state.lastClearCount).toBe(4)
    state = tickSettle(state, CLEAR_DURATION_MS + 5, 0)
    expect(state.lines).toBe(4)
    expect(state.board.every((row) => row.every((cell) => cell === null))).toBe(true)
  })

  it('supports reducer actions, softDrop, restart, and JSON round-trip deterministically', () => {
    let state = createSettle({ seed: 2026 })
    state = settleReducer(state, { type: 'moveLeft' })
    state = settleReducer(state, { type: 'softDrop' })
    state = settleReducer(state, { type: 'rotateCW' })
    state = settleReducer(state, { type: 'hold' })
    state = settleReducer(state, { type: 'hardDrop' })

    const serialized = JSON.stringify(state)
    const restored: SettleState = JSON.parse(serialized)
    expect(restored).toEqual(state)

    // Stepping both original and restored produces identical future state
    const a = hardDrop(softDrop(tickSettle(state, 900, 0.3)))
    const b = hardDrop(softDrop(tickSettle(restored, 900, 0.3)))
    expect(b).toEqual(a)

    // Restart resets cleanly
    const fresh = restart(state, 7)
    expect(fresh.lines).toBe(0)
    expect(fresh.pieces).toBe(0)
    expect(fresh.hold).toBeNull()
    expect(fresh.dissolveCount).toBe(0)
  })
})
