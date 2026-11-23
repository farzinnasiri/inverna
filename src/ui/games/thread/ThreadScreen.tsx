import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { RotateCcw, Undo2 } from 'lucide-react'
import {
  PIECE_COLORS,
  boardFillPercent,
  cancelActivePath,
  clearBoard,
  countConnectedPairs,
  countFilledCells,
  createThread,
  endPath,
  extendPath,
  isAllPairsConnected,
  isPairConnected,
  nextPuzzle,
  startPath,
  undo,
  type Cell,
  type PieceColor,
  type ThreadState,
} from '@/core/games/thread/engine'
import { Completion, GameShell, type GameScreenProps } from '@/ui/components/GameShell'
import { IconButton } from '@/ui/components/controls'
import { useCalm, useFeedback, useGameSave, useKeys } from '@/ui/hooks/game'
import './thread.css'

interface ThreadSave {
  version: 1
  state: ThreadState
  completed: number
}

const COMPLETION_DELAY_MS = 680

/** Explicit mapping from engine PieceColor keys onto the 7 flat Dusk Stones. */
const STONE_VAR: Record<PieceColor, string> = {
  ember: 'var(--p-clay)',
  saffron: 'var(--p-ochre)',
  honey: 'var(--p-straw)',
  moss: 'var(--p-sage)',
  clay: 'var(--p-rosewood)',
  rose: 'var(--p-stone)',
  sand: 'var(--p-bone)',
}

function isValidSave(value: unknown): value is ThreadSave {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<ThreadSave>
  const s = v.state
  return (
    v.version === 1 &&
    !!s &&
    (s.size === 5 || s.size === 6 || s.size === 7) &&
    Array.isArray(s.pairs) &&
    s.pairs.length >= 4 &&
    !!s.paths &&
    typeof s.paths === 'object' &&
    Array.isArray(s.history) &&
    typeof s.puzzleNumber === 'number'
  )
}

function sanitizeLoadedState(s: ThreadState): ThreadState {
  // Never resume mid-pointer-drag if the tab closed while a finger was down.
  if (s.activeColor === null && s.strokeSnapshot === null) return s
  return endPath(s)
}

function buildSvgPathD(path: readonly Cell[]): string {
  if (path.length < 2) return ''
  let d = `M ${path[0]!.col * 100 + 50} ${path[0]!.row * 100 + 50}`
  for (let i = 1; i < path.length; i++) {
    d += ` L ${path[i]!.col * 100 + 50} ${path[i]!.row * 100 + 50}`
  }
  return d
}

/**
 * Distinct flat geometric endpoint shape (~60% of a 100×100 cell) for each
 * of the 7 pairs so colour-blind players can solve every board effortlessly.
 * Connected endpoints show a crisp inner circuit-pin highlight dot.
 */
function EndpointShape({
  color,
  cx,
  cy,
  connected,
}: {
  color: PieceColor
  cx: number
  cy: number
  connected: boolean
}) {
  const fill = STONE_VAR[color]

  switch (color) {
    // Pair 0 (ember / Deep Navy Slate): filled disc
    case 'ember':
      return (
        <>
          <circle cx={cx} cy={cy} r={29} fill={fill} />
          {connected && <circle className="thread-bead__pin" cx={cx} cy={cy} r={6.5} fill="var(--c-ink)" />}
        </>
      )

    // Pair 1 (saffron / Antique Brass): thick ring (hollow circle)
    case 'saffron':
      return (
        <>
          <circle cx={cx} cy={cy} r={24} fill="var(--c-surface-1)" />
          <circle cx={cx} cy={cy} r={24} fill="none" stroke={fill} strokeWidth={10} />
          {connected && <circle className="thread-bead__pin" cx={cx} cy={cy} r={7.5} fill={fill} />}
        </>
      )

    // Pair 2 (honey / Pine Verdigris): rounded square
    case 'honey':
      return (
        <>
          <rect x={cx - 26} y={cy - 26} width={52} height={52} rx={9} fill={fill} />
          {connected && <circle className="thread-bead__pin" cx={cx} cy={cy} r={6.5} fill="var(--c-ink)" />}
        </>
      )

    // Pair 3 (moss / Oxblood): diamond
    case 'moss':
      return (
        <>
          <polygon
            points={`${cx},${cy - 31} ${cx + 31},${cy} ${cx},${cy + 31} ${cx - 31},${cy}`}
            fill={fill}
            strokeLinejoin="round"
          />
          {connected && <circle className="thread-bead__pin" cx={cx} cy={cy} r={6.5} fill="var(--c-ink)" />}
        </>
      )

    // Pair 4 (clay / Smoky Indigo): triangle
    case 'clay':
      return (
        <>
          <polygon
            points={`${cx},${cy - 29} ${cx + 29},${cy + 22} ${cx - 29},${cy + 22}`}
            fill={fill}
            strokeLinejoin="round"
          />
          {connected && <circle className="thread-bead__pin" cx={cx} cy={cy + 5} r={6} fill="var(--c-ink)" />}
        </>
      )

    // Pair 5 (rose / Titanium Pewter): hollow square
    case 'rose':
      return (
        <>
          <rect x={cx - 22} y={cy - 22} width={44} height={44} rx={5} fill="var(--c-surface-1)" />
          <rect
            x={cx - 22}
            y={cy - 22}
            width={44}
            height={44}
            rx={5}
            fill="none"
            stroke={fill}
            strokeWidth={10}
          />
          {connected && <circle className="thread-bead__pin" cx={cx} cy={cy} r={7.5} fill={fill} />}
        </>
      )

    // Pair 6 (sand / Moon Ivory): plus / cross
    case 'sand':
      return (
        <>
          <rect x={cx - 29} y={cy - 10} width={58} height={20} rx={5} fill={fill} />
          <rect x={cx - 10} y={cy - 29} width={20} height={58} rx={5} fill={fill} />
          {connected && (
            <circle className="thread-bead__pin" cx={cx} cy={cy} r={5.5} fill="var(--c-accent-ink)" />
          )}
        </>
      )
  }
}

export default function ThreadScreen({ onExit }: GameScreenProps) {
  const calm = useCalm()
  const { cue, haptic } = useFeedback()

  const [fallback] = useState<ThreadSave>(() => ({
    version: 1,
    state: createThread({ seed: Date.now() >>> 0, calm }),
    completed: 0,
  }))
  const [rawSave, setSave] = useGameSave<ThreadSave>('thread', fallback)
  const initialSave = isValidSave(rawSave) ? rawSave : fallback

  // Live board state (kept in local state during smooth drags, persisted on completed strokes/actions).
  const [state, setState] = useState<ThreadState>(() => sanitizeLoadedState(initialSave.state))
  const [paused, setPaused] = useState(false)
  const [showCompletion, setShowCompletion] = useState(() => initialSave.state.solved)

  const stateRef = useRef<ThreadState>(state)
  stateRef.current = state

  const gridRef = useRef<HTMLDivElement>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const completionTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => {
      window.clearTimeout(completionTimerRef.current)
    }
  }, [])

  const persistState = useCallback(
    (next: ThreadState, justSolved = false) => {
      setSave((prev) => ({
        version: 1,
        state: next,
        completed: (isValidSave(prev) ? prev.completed : 0) + (justSolved ? 1 : 0),
      }))
    },
    [setSave],
  )

  const scheduleCompletion = useCallback(() => {
    window.clearTimeout(completionTimerRef.current)
    completionTimerRef.current = window.setTimeout(() => {
      setShowCompletion(true)
    }, COMPLETION_DELAY_MS)
  }, [])

  /* --- Cell hit-testing --------------------------------------------------- */

  const cellFromPoint = useCallback((clientX: number, clientY: number, clampToBoard: boolean): Cell | null => {
    const grid = gridRef.current
    if (!grid) return null
    const rect = grid.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null

    if (
      !clampToBoard &&
      (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom)
    ) {
      return null
    }

    const size = stateRef.current.size
    const col = Math.min(size - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * size)))
    const row = Math.min(size - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * size)))
    return { row, col }
  }, [])

  /* --- Pointer drawing handlers ------------------------------------------- */

  const onBoardPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (paused || stateRef.current.solved) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (activePointerIdRef.current !== null) return

    const cell = cellFromPoint(e.clientX, e.clientY, false)
    if (!cell) return

    const prev = stateRef.current
    const next = startPath(prev, cell)
    if (next === prev || !next.activeColor) return

    activePointerIdRef.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    stateRef.current = next
    setState(next)
    cue('tap', 0.55)
    haptic('light')
  }

  const onBoardPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return
    const prev = stateRef.current
    if (!prev.activeColor || prev.solved) return

    const cell = cellFromPoint(e.clientX, e.clientY, true)
    if (!cell) return

    const next = extendPath(prev, cell)
    if (next === prev) return

    const prevColor = prev.activeColor
    const prevLen = prev.paths[prevColor]?.length ?? 0
    const nextLen = next.paths[prevColor]?.length ?? 0
    const pair = prev.pairs.find((p) => p.color === prevColor)
    const wasConnected = pair ? isPairConnected(pair, prev.paths[prevColor]) : false
    const nowConnected = pair ? isPairConnected(pair, next.paths[prevColor]) : false

    stateRef.current = next
    setState(next)

    if (next.solved) {
      activePointerIdRef.current = null
      persistState(next, true)
      cue('chime', 0.9)
      haptic('success')
      scheduleCompletion()
    } else if (!wasConnected && nowConnected) {
      cue('place', 0.85)
      haptic('medium')
    } else if (nextLen !== prevLen) {
      cue('tap', 0.42)
      haptic('light')
    }
  }

  const finishPointer = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (activePointerIdRef.current !== e.pointerId) return
    activePointerIdRef.current = null

    const prev = stateRef.current
    if (!prev.activeColor) return

    const next = cancelled ? cancelActivePath(prev) : endPath(prev)
    stateRef.current = next
    setState(next)

    if (!cancelled) {
      const justSolved = !prev.solved && next.solved
      persistState(next, justSolved)
      if (justSolved) {
        cue('chime', 0.9)
        haptic('success')
        scheduleCompletion()
      }
    }
  }

  /* --- Board actions ------------------------------------------------------ */

  const handleUndo = useCallback(() => {
    if (paused || stateRef.current.solved) return
    const prev = stateRef.current
    if (prev.history.length === 0) return
    const next = undo(prev)
    activePointerIdRef.current = null
    stateRef.current = next
    setState(next)
    persistState(next)
    cue('undo', 0.7)
    haptic('light')
  }, [paused, persistState, cue, haptic])

  const handleClear = useCallback(() => {
    const prev = stateRef.current
    const next = clearBoard(prev)
    if (next === prev) return
    window.clearTimeout(completionTimerRef.current)
    activePointerIdRef.current = null
    setShowCompletion(false)
    stateRef.current = next
    setState(next)
    persistState(next)
    cue('undo', 0.7)
    haptic('light')
  }, [persistState, cue, haptic])

  const handleCancelActive = useCallback(() => {
    const prev = stateRef.current
    if (!prev.activeColor) return
    activePointerIdRef.current = null
    const next = cancelActivePath(prev)
    stateRef.current = next
    setState(next)
    cue('tap', 0.4)
  }, [cue])

  const handleNextPuzzle = useCallback(() => {
    window.clearTimeout(completionTimerRef.current)
    activePointerIdRef.current = null
    setShowCompletion(false)
    const next = nextPuzzle(stateRef.current, calm)
    stateRef.current = next
    setState(next)
    persistState(next)
    cue('tap', 0.6)
  }, [calm, persistState, cue])

  useKeys(
    {
      Escape: handleCancelActive,
      z: handleUndo,
      Z: handleUndo,
      u: handleUndo,
      U: handleUndo,
    },
    !paused && !state.solved,
    false,
  )

  /* --- Derived visual state ----------------------------------------------- */

  const connectedCount = useMemo(() => countConnectedPairs(state), [state])
  const filledCells = useMemo(() => countFilledCells(state), [state])
  const totalCells = state.size * state.size
  const fillPercent = useMemo(() => boardFillPercent(state), [state])
  const allPairsConnected = useMemo(() => isAllPairsConnected(state), [state])
  const remainingCells = totalCells - filledCells

  const connectedColors = useMemo(() => {
    const set = new Set<PieceColor>()
    for (const pair of state.pairs) {
      if (isPairConnected(pair, state.paths[pair.color])) {
        set.add(pair.color)
      }
    }
    return set
  }, [state.pairs, state.paths])

  // Track cells occupied by paths or endpoints so empty grid dots hide cleanly underneath.
  const cellOccupied = useMemo(() => {
    const occupied = new Array<boolean>(totalCells).fill(false)
    for (const color of PIECE_COLORS) {
      const path = state.paths[color]
      if (!path) continue
      const isActive = state.activeColor === color
      if (path.length < 2 && !isActive) continue
      for (const cell of path) {
        occupied[cell.row * state.size + cell.col] = true
      }
    }
    return occupied
  }, [state.paths, state.activeColor, state.size, totalCells])

  const endpointCells = useMemo(() => {
    const set = new Set<number>()
    for (const pair of state.pairs) {
      set.add(pair.a.row * state.size + pair.a.col)
      set.add(pair.b.row * state.size + pair.b.col)
    }
    return set
  }, [state.pairs, state.size])

  const activeTip = useMemo(() => {
    if (!state.activeColor) return null
    const path = state.paths[state.activeColor]
    if (!path || path.length === 0) return null
    return path[path.length - 1]!
  }, [state.activeColor, state.paths])

  const boardStyle = {
    '--size': state.size,
  } as CSSProperties

  const viewBoxSize = state.size * 100
  const hasDrawnPaths = filledCells > 0 || state.activeColor !== null

  return (
    <GameShell
      gameId="thread"
      stats={[
        { label: 'Pairs', value: `${connectedCount}/${state.pairs.length}` },
        { label: 'Board', value: `${fillPercent}%` },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={handleClear}
      onExit={onExit}
      howTo={
        <>
          <p>Drag from any shape to connect it to its matching pair.</p>
          <p>Fill every cell on the board. Crossing another path trims it cleanly so you can reroute anytime.</p>
        </>
      }
      controls={
        <div className="thread-bar">
          <span className="thread-bar__title t-headline">Puzzle {state.puzzleNumber}</span>
          <div className="thread-bar__actions">
            <IconButton
              label="Undo"
              onClick={handleUndo}
              disabled={state.history.length === 0 || state.solved}
            >
              <Undo2 size={20} strokeWidth={1.5} aria-hidden />
            </IconButton>
            <IconButton
              label="Clear board"
              onClick={handleClear}
              disabled={!hasDrawnPaths || state.solved}
            >
              <RotateCcw size={20} strokeWidth={1.5} aria-hidden />
            </IconButton>
          </div>
        </div>
      }
    >
      <div className="thread-stage">
        <div className="thread-frame">
          <div
            className="thread-board"
            style={boardStyle}
            data-solved={state.solved || undefined}
          >
            <div
              ref={gridRef}
              className="thread-grid"
              role="application"
              aria-label={`Thread ${state.size} by ${state.size} board, ${connectedCount} of ${state.pairs.length} pairs connected, ${fillPercent} percent filled`}
              onPointerDown={onBoardPointerDown}
              onPointerMove={onBoardPointerMove}
              onPointerUp={(e) => finishPointer(e, false)}
              onPointerCancel={(e) => finishPointer(e, true)}
            >
              {/* Layer 1: Flat cells with subtle centred ink-4 grid dots */}
              <div className="thread-cells" aria-hidden="true">
                {cellOccupied.map((occupied, idx) => {
                  const hasDot = !occupied && !endpointCells.has(idx)
                  const isMissed = allPairsConnected && !state.solved && !occupied
                  return (
                    <div
                      key={idx}
                      className="thread-cell"
                      data-dot={hasDot ? 'true' : undefined}
                      data-missed={isMissed ? 'true' : undefined}
                    />
                  )
                })}
              </div>

              {/* Layer 2 & 3: Flat Dusk Stone paths + geometric endpoint shapes */}
              <svg
                className="thread-svg"
                viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
                aria-hidden="true"
              >
                {/* Continuous round-cap paths (40% cell width, 0.55 opacity) */}
                <g className="thread-paths">
                  {state.pairs.map((pair) => {
                    const path = state.paths[pair.color]
                    if (!path || path.length < 2) return null
                    const d = buildSvgPathD(path)
                    const connected = connectedColors.has(pair.color)
                    const active = state.activeColor === pair.color
                    return (
                      <path
                        key={pair.color}
                        className="thread-path__stroke"
                        data-connected={connected || undefined}
                        data-active={active || undefined}
                        d={d}
                        style={{ stroke: STONE_VAR[pair.color] }}
                      />
                    )
                  })}
                </g>

                {/* Subtle active drag tip ring */}
                {activeTip && state.activeColor && (
                  <circle
                    className="thread-tip"
                    cx={activeTip.col * 100 + 50}
                    cy={activeTip.row * 100 + 50}
                    r={24}
                    style={{ stroke: STONE_VAR[state.activeColor] }}
                  />
                )}

                {/* Crisp flat geometric endpoint shapes */}
                <g className="thread-beads">
                  {state.pairs.map((pair) => {
                    const connected = connectedColors.has(pair.color)
                    const active = state.activeColor === pair.color
                    return [pair.a, pair.b].map((cell, endIdx) => {
                      const cx = cell.col * 100 + 50
                      const cy = cell.row * 100 + 50
                      return (
                        <g
                          key={`${pair.color}-${endIdx}`}
                          className="thread-bead"
                          data-connected={connected || undefined}
                          data-active={active || undefined}
                          style={{ transformOrigin: `${cx}px ${cy}px` }}
                        >
                          <EndpointShape color={pair.color} cx={cx} cy={cy} connected={connected} />
                        </g>
                      )
                    })
                  })}
                </g>
              </svg>
            </div>
          </div>

          {/* Quiet hint slot (fixed height so the board never shifts) */}
          <p
            className="thread-note t-label"
            data-visible={allPairsConnected && !state.solved ? 'true' : undefined}
            aria-live="polite"
          >
            {allPairsConnected && !state.solved
              ? `Fill the remaining ${remainingCells} ${remainingCells === 1 ? 'cell' : 'cells'}`
              : '\u00A0'}
          </p>
        </div>
      </div>

      <Completion
        open={showCompletion}
        title="Connected"
        line={`Puzzle ${state.puzzleNumber}`}
        actionLabel="Next puzzle"
        onAction={handleNextPuzzle}
      />
    </GameShell>
  )
}
