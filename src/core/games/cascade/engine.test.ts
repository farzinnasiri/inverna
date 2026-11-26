import { describe, expect, it } from 'vitest'
import {
  ALL_COLORS,
  CALM_COLORS,
  MAX_RIPPLE_DELAY_MS,
  MAX_UNDO,
  WOBBLE_DURATION_MS,
  createCascade,
  findCluster,
  gridConfigForCalm,
  hasPlayableCluster,
  nextBoard,
  releaseRemaining,
  remainingTiles,
  restartBoard,
  stripEphemeralForSave,
  tapCell,
  tickCascade,
  undoCascade,
  type CascadeColor,
  type CascadeState,
  type StandingTile,
} from './engine'

/** Helper to construct a deterministic custom board for targeted rule & physics tests. */
function makeCustomState(grid: (CascadeColor | null)[][], seed = 42): CascadeState {
  const rows = grid.length
  const cols = grid[0]!.length
  let id = 1
  const board: (StandingTile | null)[][] = grid.map((r, ri) =>
    r.map((color, ci) =>
      color
        ? {
            id: id++,
            color,
            row: ri,
            col: ci,
            x: ci,
            y: ri,
            vx: 0,
            vy: 0,
          }
        : null,
    ),
  )

  return {
    rows,
    cols,
    colors: [...ALL_COLORS],
    board,
    falling: [],
    score: 0,
    cleared: 0,
    clustersCleared: 0,
    boardsCleared: 0,
    boardComplete: false,
    wobble: null,
    undo: [],
    initialGrid: grid.map((r) => r.slice()),
    rngState: seed,
    nextId: id,
    lastTapCount: 0,
    lastTapEventId: 0,
    lastAutoReleaseCount: 0,
    lastCompleteEventId: 0,
  }
}

describe('Cascade engine', () => {
  describe('grid & calm sizing', () => {
    it('scales board size and colour count smoothly with calm', () => {
      const low = gridConfigForCalm(0)
      expect(low).toEqual({ cols: 9, rows: 11, colors: [...ALL_COLORS] })

      const mid = gridConfigForCalm(0.45)
      expect(mid).toEqual({ cols: 8, rows: 10, colors: [...CALM_COLORS] })

      const high = gridConfigForCalm(0.8)
      expect(high).toEqual({ cols: 7, rows: 9, colors: [...CALM_COLORS] })

      const sLow = createCascade({ seed: 101, calm: 0.1 })
      const sMid = createCascade({ seed: 101, calm: 0.6 })
      const sHigh = createCascade({ seed: 101, calm: 0.9 })

      expect(sLow.cols).toBe(9)
      expect(sLow.rows).toBe(11)
      expect(sLow.colors.length).toBe(5)

      expect(sMid.cols).toBe(8)
      expect(sMid.rows).toBe(10)
      expect(sMid.colors.length).toBe(4)

      expect(sHigh.cols).toBe(7)
      expect(sHigh.rows).toBe(9)
      expect(sHigh.colors.length).toBe(4)
    })

    it('guarantees playable clusters on creation across many seeds', () => {
      for (let seed = 1; seed <= 25; seed++) {
        for (const calm of [0, 0.5, 0.9]) {
          const state = createCascade({ seed: seed * 7919, calm })
          expect(hasPlayableCluster(state)).toBe(true)
          expect(remainingTiles(state)).toBe(state.rows * state.cols)
        }
      }
    })

    it('is deterministic for identical seed and calm', () => {
      const a = createCascade({ seed: 12345, calm: 0.2 })
      const b = createCascade({ seed: 12345, calm: 0.2 })
      expect(a).toEqual(b)
    })
  })

  describe('flood-fill cluster detection', () => {
    it('finds orthogonally connected matching tiles only, ignoring diagonals and empty cells', () => {
      const state = makeCustomState([
        ['clay', 'clay', null, 'clay'],
        ['ochre', 'clay', 'ochre', 'ochre'],
        ['clay', 'ochre', 'clay', 'bone'],
      ])

      const cluster = findCluster(state, 0, 0)
      expect(cluster).toHaveLength(3)
      expect(cluster).toEqual(
        expect.arrayContaining([
          { row: 0, col: 0 },
          { row: 0, col: 1 },
          { row: 1, col: 1 },
        ]),
      )

      // Diagonal clay tiles at (2,0), (2,2), and across gap (0,3) must NOT be included.
      expect(cluster).not.toEqual(expect.arrayContaining([{ row: 2, col: 0 }]))
      expect(cluster).not.toEqual(expect.arrayContaining([{ row: 2, col: 2 }]))
      expect(cluster).not.toEqual(expect.arrayContaining([{ row: 0, col: 3 }]))

      // Empty cell & out-of-bounds return [].
      expect(findCluster(state, 0, 2)).toEqual([])
      expect(findCluster(state, -1, 0)).toEqual([])
      expect(findCluster(state, 99, 99)).toEqual([])
    })
  })

  describe('tapping clusters, collapse & compaction', () => {
    it('removes cluster >= 2, spawns staggered falling tiles, collapses vertically and compacts columns horizontally', () => {
      // Column 1 is entirely 'clay' so tapping it clears col 1 completely and compacts col 2 left into col 1!
      // Row 0 col 0 has 'ochre' above a 'clay' at (1,0) so (0,0) drops vertically to (1,0).
      const state = makeCustomState([
        ['ochre', 'clay', 'straw', 'bone'],
        ['clay', 'clay', 'bone', 'bone'],
        ['sage', 'clay', 'straw', 'ochre'],
      ])

      const next = tapCell(state, 1, 1)

      // Cluster has 4 tiles: (0,1), (1,1), (2,1), (1,0)
      expect(next.falling).toHaveLength(4)
      expect(next.score).toBe(4 * 3)
      expect(next.cleared).toBe(4)
      expect(next.clustersCleared).toBe(1)
      expect(next.undo).toHaveLength(1)
      expect(next.boardComplete).toBe(false)

      // Tapped tile (1,1) has delayMs === 0; Manhattan distance 1 neighbours have delayMs === 28.
      const delays = next.falling.map((f) => f.delayMs).sort((a, b) => a - b)
      expect(delays[0]).toBe(0)
      expect(delays[1]).toBe(28)
      expect(delays.every((d) => d <= MAX_RIPPLE_DELAY_MS)).toBe(true)

      // Column 0: 'ochre' dropped from row 0 to row 1, sitting above 'sage' at row 2.
      expect(next.board[0]![0]).toBeNull()
      expect(next.board[1]![0]?.color).toBe('ochre')
      expect(next.board[1]![0]?.row).toBe(1)
      expect(next.board[1]![0]?.y).toBe(0) // Visual y starts at previous row so tick settles it!
      expect(next.board[2]![0]?.color).toBe('sage')

      // Column 1 was emptied, so old col 2 compacted left into col 1 and old col 3 compacted into col 2!
      expect(next.board[0]![1]?.color).toBe('straw')
      expect(next.board[1]![1]?.color).toBe('bone')
      expect(next.board[2]![1]?.color).toBe('straw')
      expect(next.board[0]![1]?.x).toBe(2) // Starts at old col 2 for smooth horizontal slide.
      expect(next.board[0]![1]?.col).toBe(1)

      expect(next.board[0]![2]?.color).toBe('bone')
      expect(next.board[1]![2]?.color).toBe('bone')
      expect(next.board[2]![2]?.color).toBe('ochre')

      // Column 3 is now completely empty.
      expect(next.board[0]![3]).toBeNull()
      expect(next.board[1]![3]).toBeNull()
      expect(next.board[2]![3]).toBeNull()
    })

    it('records micro-shudder wobble without removing when tapping a lone tile while other moves exist', () => {
      const state = makeCustomState([
        ['clay', 'ochre', 'ochre'],
        ['straw', 'bone', 'sage'],
      ])

      const loneId = state.board[0]![0]!.id
      const next = tapCell(state, 0, 0)

      expect(next.board[0]![0]?.id).toBe(loneId)
      expect(next.falling).toHaveLength(0)
      expect(next.score).toBe(0)
      expect(next.undo).toHaveLength(0)
      expect(next.wobble).toEqual({ id: loneId, ageMs: 0 })

      // Wobble ages and clears after WOBBLE_DURATION_MS (stepping within the 100ms frame clamp).
      const mid = tickCascade(next, 100, 0)
      expect(mid.wobble).toEqual({ id: loneId, ageMs: 100 })
      let cur = mid
      for (let elapsed = 100; elapsed < WOBBLE_DURATION_MS; elapsed += 80) {
        cur = tickCascade(cur, 80, 0)
      }
      expect(cur.wobble).toBeNull()
    })
  })

  describe('physics simulation & settling', () => {
    it('advances falling tiles under gravity and rotation, then prunes them off-screen', () => {
      const state = makeCustomState([
        ['clay', 'clay', 'ochre', 'ochre'],
        ['straw', 'bone', 'sage', 'clay'],
      ])

      let cur = tapCell(state, 0, 0)
      expect(cur.falling).toHaveLength(2)

      // Initial upward kick on immediate tile (delayMs === 0).
      const immediate = cur.falling.find((f) => f.delayMs === 0)!
      expect(immediate.vy).toBeLessThan(0)
      expect(Math.abs(immediate.omega)).toBeGreaterThanOrEqual(1.4)

      // Step a couple of frames: angle changes and tile launches then accelerates downward.
      cur = tickCascade(cur, 32, 0)
      const afterLaunch = cur.falling.find((f) => f.id === immediate.id)!
      expect(afterLaunch.angle).not.toBe(0)
      expect(afterLaunch.y).toBeLessThan(0) // Popped upward first!

      // Run 2.5 seconds of simulation so tiles fall well below rows + 2.5 and get pruned.
      for (let i = 0; i < 150; i++) {
        cur = tickCascade(cur, 20, 0)
      }
      expect(cur.falling).toHaveLength(0)

      // At rest, tickCascade returns exact same state reference.
      const idle = tickCascade(cur, 16, 0)
      expect(idle).toBe(cur)
    })

    it('settles displaced standing tiles cleanly to their exact target (row, col)', () => {
      const state = makeCustomState([
        ['ochre', 'clay', 'straw'],
        ['clay', 'clay', 'bone'],
        ['sage', 'clay', 'bone'],
      ])

      let cur = tapCell(state, 1, 1)
      expect(cur.boardComplete).toBe(false)
      // Tile (1,0) started at y=0, tile (0,1) started at x=2.
      expect(cur.board[1]![0]!.y).toBe(0)
      expect(cur.board[0]![1]!.x).toBe(2)

      for (let i = 0; i < 60; i++) {
        cur = tickCascade(cur, 16, 0.2)
      }

      for (let r = 0; r < cur.rows; r++) {
        for (let c = 0; c < cur.cols; c++) {
          const t = cur.board[r]![c]
          if (!t) continue
          expect(t.x).toBe(t.col)
          expect(t.y).toBe(t.row)
          expect(t.vx).toBe(0)
          expect(t.vy).toBe(0)
        }
      }
    })
  })

  describe('board finish & straggler waterfall', () => {
    it('automatically releases remaining isolated stragglers when no playable clusters remain', () => {
      // Only one playable pair: (0,0) and (0,1) are 'clay'; remaining 2 tiles are isolated stragglers.
      const state = makeCustomState([
        ['clay', 'clay', 'ochre'],
        ['straw', null, null],
      ])

      const next = tapCell(state, 0, 0)
      expect(next.boardComplete).toBe(true)
      expect(next.boardsCleared).toBe(1)
      expect(remainingTiles(next)).toBe(0)
      // 2 tapped tiles + 2 auto-released stragglers = 4 falling tiles!
      expect(next.falling).toHaveLength(4)
      expect(next.lastAutoReleaseCount).toBe(2)
      expect(next.cleared).toBe(4)
      expect(next.score).toBe(2) // 2 * (2 - 1)
    })

    it('supports explicit releaseRemaining on a dead board', () => {
      const dead = makeCustomState([
        ['clay', 'ochre'],
        ['straw', 'bone'],
      ])
      expect(hasPlayableCluster(dead)).toBe(false)
      const released = releaseRemaining(dead)
      expect(released.boardComplete).toBe(true)
      expect(released.boardsCleared).toBe(1)
      expect(released.falling).toHaveLength(4)
      expect(remainingTiles(released)).toBe(0)
    })
  })

  describe('undo, restart, nextBoard & JSON serialization', () => {
    it('restores board cleanly up to 12 undo steps', () => {
      let state = createCascade({ seed: 777, calm: 0 })
      const snapshots: { score: number; tiles: number }[] = []

      // Perform up to 14 valid taps to test the 12-step cap.
      let moves = 0
      while (moves < 14 && !state.boardComplete) {
        let tapped = false
        for (let r = 0; r < state.rows && !tapped; r++) {
          for (let c = 0; c < state.cols && !tapped; c++) {
            if (findCluster(state, r, c).length >= 2) {
              snapshots.push({ score: state.score, tiles: remainingTiles(state) })
              state = tapCell(state, r, c)
              moves++
              tapped = true
            }
          }
        }
        if (!tapped) break
      }

      expect(moves).toBeGreaterThanOrEqual(12)
      expect(state.undo.length).toBe(MAX_UNDO)

      // Undo all 12 stored steps and verify score & remaining tiles match saved snapshots.
      for (let i = 0; i < MAX_UNDO; i++) {
        const expected = snapshots[snapshots.length - 1 - i]!
        state = undoCascade(state)
        expect(state.score).toBe(expected.score)
        expect(remainingTiles(state)).toBe(expected.tiles)
        expect(state.falling).toHaveLength(0)
      }

      // Further undo is a no-op.
      const unchanged = undoCascade(state)
      expect(unchanged).toBe(state)
    })

    it('restarts the exact same board and advances cleanly with nextBoard', () => {
      const initial = createCascade({ seed: 555, calm: 0.3 })
      let played = initial
      for (let r = 0; r < played.rows; r++) {
        for (let c = 0; c < played.cols; c++) {
          if (findCluster(played, r, c).length >= 2) {
            played = tapCell(played, r, c)
            break
          }
        }
        if (played !== initial) break
      }
      expect(played.score).toBeGreaterThan(0)

      const restarted = restartBoard(played)
      expect(restarted.score).toBe(0)
      expect(restarted.cleared).toBe(0)
      expect(restarted.undo).toHaveLength(0)
      expect(remainingTiles(restarted)).toBe(initial.rows * initial.cols)
      // Colors match initial board cell-for-cell.
      for (let r = 0; r < initial.rows; r++) {
        for (let c = 0; c < initial.cols; c++) {
          expect(restarted.board[r]![c]?.color).toBe(initial.board[r]![c]?.color)
        }
      }

      const fresh = nextBoard({ ...played, boardsCleared: 3 }, 0.8)
      expect(fresh.boardsCleared).toBe(3)
      expect(fresh.cols).toBe(7)
      expect(fresh.rows).toBe(9)
      expect(hasPlayableCluster(fresh)).toBe(true)
    })

    it('round-trips cleanly through JSON.stringify / JSON.parse', () => {
      let state = createCascade({ seed: 909, calm: 0.5 })
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          if (findCluster(state, r, c).length >= 2) {
            state = tapCell(state, r, c)
            break
          }
        }
        if (state.cleared > 0) break
      }

      const stripped = stripEphemeralForSave(state)
      expect(stripped.falling).toHaveLength(0)
      expect(stripped.wobble).toBeNull()

      const roundTripped = JSON.parse(JSON.stringify(stripped)) as CascadeState
      expect(roundTripped).toEqual(stripped)
      expect(hasPlayableCluster(roundTripped) || roundTripped.boardComplete).toBe(true)
    })
  })
})

describe('cascade taps after a clear', () => {
  // ISS-10: taps were blocked for ~1.6 s until every cleared tile had tumbled away.
  it('the board takes taps again once its tiles have landed, while debris still falls', async () => {
    const { boardSettling, createCascade, findCluster, tapCell, tickCascade } = await import('./engine')
    let s = createCascade({ seed: 7, calm: 0.7 })
    let tapped = false
    for (let r = s.rows - 1; r >= 0 && !tapped; r--) {
      for (let c = 0; c < s.cols && !tapped; c++) {
        if (findCluster(s, r, c).length >= 2) {
          s = tapCell(s, r, c)
          tapped = true
        }
      }
    }
    expect(tapped).toBe(true)
    let t = 0
    while (boardSettling(s) && t < 2000) {
      s = tickCascade(s, 16, 0.7)
      t += 16
    }
    expect(boardSettling(s)).toBe(false)
    expect(t).toBeLessThan(800)
    expect(s.falling.length).toBeGreaterThan(0)
  })
})
