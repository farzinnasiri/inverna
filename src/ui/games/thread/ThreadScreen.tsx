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
import { Button } from '@/ui/components/controls'
import { useCalm, useFeedback, useGameSave, useKeys } from '@/ui/hooks/game'
import './thread.css'

interface ThreadSave {
  version: 1
  state: ThreadState
  completed: number
}

const COMPLETION_DELAY_MS = 680

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

  // Map each cell index -> occupying colour for soft ember cell tinting.
  const cellTint = useMemo(() => {
    const map = new Array<PieceColor | null>(totalCells).fill(null)
    for (const color of PIECE_COLORS) {
      const path = state.paths[color]
      if (!path) continue
      const isActive = state.activeColor === color
      if (path.length < 2 && !isActive) continue
      for (const cell of path) {
        map[cell.row * state.size + cell.col] = color
      }
    }
    return map
  }, [state.paths, state.activeColor, state.size, totalCells])

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
          <p>Drag from any glowing dot to connect it to its matching colour.</p>
          <p>Fill every cell on the board. Crossing another thread trims it cleanly so you can reroute anytime.</p>
        </>
      }
      controls={
        <div className="thread-bar">
          <div className="thread-bar__meta">
            <span className="thread-bar__title t-serif">Puzzle {state.puzzleNumber}</span>
            <span className="thread-bar__sub num">
              {state.size} × {state.size}
            </span>
          </div>
          <div className="thread-bar__actions">
            <Button
              variant="quiet"
              size="sm"
              onClick={handleUndo}
              disabled={state.history.length === 0 || state.solved}
              aria-label="Undo"
            >
              <Undo2 size={15} strokeWidth={1.75} aria-hidden />
              Undo
            </Button>
            <Button
              variant="quiet"
              size="sm"
              onClick={handleClear}
              disabled={!hasDrawnPaths || state.solved}
              aria-label="Clear board"
            >
              <RotateCcw size={15} strokeWidth={1.75} aria-hidden />
              Clear
            </Button>
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
              {/* Layer 1: Hairline cells with soft tinted ember fills */}
              <div className="thread-cells" aria-hidden="true">
                {cellTint.map((color, idx) => {
                  const row = Math.floor(idx / state.size)
                  const col = idx % state.size
                  const isMissed = allPairsConnected && !state.solved && color === null
                  return (
                    <div
                      key={idx}
                      className="thread-cell"
                      data-color={color ?? undefined}
                      data-connected={color && connectedColors.has(color) ? 'true' : undefined}
                      data-last-col={col === state.size - 1 ? 'true' : undefined}
                      data-last-row={row === state.size - 1 ? 'true' : undefined}
                      data-missed={isMissed ? 'true' : undefined}
                    />
                  )
                })}
              </div>

              {/* Layer 2 & 3: Continuous silky rounded SVG threads + lit glass endpoint beads */}
              <svg
                className="thread-svg"
                viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
                aria-hidden="true"
              >
                <defs>
                  <radialGradient id="thread-bead-shade" cx="34%" cy="26%" r="74%">
                    <stop offset="0%" stopColor="rgb(255 248 232 / 0.42)" />
                    <stop offset="44%" stopColor="rgb(255 236 206 / 0.06)" />
                    <stop offset="100%" stopColor="rgb(10 6 5 / 0.36)" />
                  </radialGradient>
                </defs>

                {/* Silky continuous paths */}
                <g className="thread-paths">
                  {state.pairs.map((pair) => {
                    const path = state.paths[pair.color]
                    if (!path || path.length < 2) return null
                    const d = buildSvgPathD(path)
                    const connected = connectedColors.has(pair.color)
                    const active = state.activeColor === pair.color
                    return (
                      <g
                        key={pair.color}
                        className="thread-path"
                        data-connected={connected || undefined}
                        data-active={active || undefined}
                      >
                        <path
                          className="thread-path__shadow"
                          d={d}
                          transform="translate(0 3)"
                        />
                        <path
                          className="thread-path__stroke"
                          d={d}
                          style={{ stroke: `var(--p-${pair.color})` }}
                        />
                        <path
                          className="thread-path__sheen"
                          d={d}
                          transform="translate(0 -2)"
                        />
                      </g>
                    )
                  })}
                </g>

                {/* Active drag tip pulse */}
                {activeTip && state.activeColor && (
                  <circle
                    className="thread-tip"
                    cx={activeTip.col * 100 + 50}
                    cy={activeTip.row * 100 + 50}
                    r={25}
                    style={{ stroke: `var(--p-${state.activeColor})` }}
                  />
                )}

                {/* Lit glass / ember endpoint beads */}
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
                          <circle
                            className="thread-bead__halo"
                            cx={cx}
                            cy={cy}
                            r={38}
                            style={{
                              stroke: `var(--p-${pair.color})`,
                              transformOrigin: `${cx}px ${cy}px`,
                            }}
                          />
                          <circle
                            cx={cx}
                            cy={cy + 3}
                            r={29}
                            fill="rgb(10 6 5 / 0.56)"
                          />
                          <circle
                            cx={cx}
                            cy={cy}
                            r={28.5}
                            fill={`var(--p-${pair.color})`}
                          />
                          <circle
                            cx={cx}
                            cy={cy}
                            r={28.5}
                            fill="url(#thread-bead-shade)"
                          />
                          <circle
                            cx={cx}
                            cy={cy}
                            r={27.5}
                            fill="none"
                            stroke="rgb(255 244 224 / 0.24)"
                            strokeWidth={1.6}
                          />
                          <circle
                            className="thread-bead__spec"
                            cx={cx - 8}
                            cy={cy - 9}
                            r={5.2}
                            fill="rgb(255 248 232 / 0.52)"
                          />
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
            className="thread-note t-caption"
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
        line={`Puzzle ${state.puzzleNumber} · ${state.size} × ${state.size}`}
        actionLabel="Next puzzle"
        onAction={handleNextPuzzle}
      />
    </GameShell>
  )
}
