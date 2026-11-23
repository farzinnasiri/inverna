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
  clearWeave,
  countFilledCells,
  createWeave,
  getColumnLine,
  isLineSatisfied,
  nextPuzzle,
  restartPuzzle,
  setCell,
  toggleCell,
  undoWeave,
  type WeaveCell,
  type WeaveState,
  type WeaveTool,
} from '@/core/games/weave/engine'
import { Completion, GameShell, type GameScreenProps } from '@/ui/components/GameShell'
import { IconButton, Segmented } from '@/ui/components/controls'
import { useCalm, useFeedback, useGameSave, useKeys } from '@/ui/hooks/game'
import './weave.css'

interface WeaveSave {
  version: 1
  state: WeaveState
  completed: number
}

interface DragStroke {
  pointerId: number
  strokeValue: WeaveCell
  startValue: WeaveCell
  lastRow: number
  lastCol: number
}

const TOOL_OPTIONS = [
  { value: 'fill' as const, label: 'Fill' },
  { value: 'mark' as const, label: 'Mark ×' },
]

function isValidSave(value: unknown): value is WeaveSave {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<WeaveSave>
  return (
    v.version === 1 &&
    !!v.state &&
    typeof v.state.rows === 'number' &&
    typeof v.state.cols === 'number' &&
    v.state.rows > 0 &&
    v.state.cols > 0 &&
    Array.isArray(v.state.grid) &&
    v.state.grid.length === v.state.rows &&
    Array.isArray(v.state.rowClues) &&
    v.state.rowClues.length === v.state.rows &&
    Array.isArray(v.state.colClues) &&
    v.state.colClues.length === v.state.cols &&
    Array.isArray(v.state.solution) &&
    Array.isArray(v.state.undoStack)
  )
}

export default function WeaveScreen({ onExit }: GameScreenProps) {
  const calm = useCalm()
  const { cue, haptic } = useFeedback()

  const [fallback] = useState<WeaveSave>(() => ({
    version: 1,
    state: createWeave({ seed: Date.now() >>> 0, calm }),
    completed: 0,
  }))
  const [rawSave, setSave] = useGameSave<WeaveSave>('weave', fallback)
  const save = isValidSave(rawSave) ? rawSave : fallback
  const state = save.state

  const [paused, setPaused] = useState(false)
  const [tool, setTool] = useState<WeaveTool>('fill')
  const [cursor, setCursor] = useState<{ row: number; col: number } | null>(null)
  const [showCompletion, setShowCompletion] = useState(state.solved)

  const gridRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragStroke | null>(null)
  const stateRef = useRef<WeaveState>(state)
  stateRef.current = state
  const completionTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => window.clearTimeout(completionTimerRef.current)
  }, [])

  const rowSatisfied = useMemo(
    () => state.rowClues.map((clue, r) => isLineSatisfied(state.grid[r]!, clue)),
    [state.grid, state.rowClues],
  )

  const colSatisfied = useMemo(
    () => state.colClues.map((clue, c) => isLineSatisfied(getColumnLine(state.grid, c), clue)),
    [state.grid, state.colClues],
  )

  const maxRowClueLen = useMemo(
    () => Math.max(1, ...state.rowClues.map((c) => c.length)),
    [state.rowClues],
  )
  const maxColClueLen = useMemo(
    () => Math.max(1, ...state.colClues.map((c) => c.length)),
    [state.colClues],
  )

  const progress = useMemo(() => countFilledCells(state), [state])
  const hasAnyMarkOrFill = useMemo(
    () => state.grid.some((row) => row.some((c) => c !== 0)),
    [state.grid],
  )

  const triggerSolved = useCallback(() => {
    dragRef.current = null
    cue('chime', 0.9)
    haptic('success')
    window.clearTimeout(completionTimerRef.current)
    completionTimerRef.current = window.setTimeout(() => {
      setShowCompletion(true)
    }, 520)
  }, [cue, haptic])

  const paintCell = useCallback(
    (row: number, col: number, value: WeaveCell, recordUndo: boolean) => {
      const curr = stateRef.current
      const next = setCell(curr, row, col, value, { recordUndo })
      if (next === curr) return

      const didSolve = !curr.solved && next.solved
      stateRef.current = next
      setSave((prev) => ({
        version: 1,
        state: next,
        completed: (isValidSave(prev) ? prev.completed : 0) + (didSolve ? 1 : 0),
      }))

      if (didSolve) {
        triggerSolved()
      } else if (value === 1) {
        cue('place', 0.72)
        haptic('light')
      } else {
        cue('tap', 0.45)
        haptic('light')
      }
    },
    [setSave, triggerSolved, cue, haptic],
  )

  const handleToggleAt = useCallback(
    (row: number, col: number, activeTool: WeaveTool) => {
      if (paused || stateRef.current.solved) return
      const curr = stateRef.current
      const next = toggleCell(curr, row, col, activeTool)
      if (next === curr) return

      const didSolve = !curr.solved && next.solved
      const nextVal = next.grid[row]![col]!
      stateRef.current = next
      setSave((prev) => ({
        version: 1,
        state: next,
        completed: (isValidSave(prev) ? prev.completed : 0) + (didSolve ? 1 : 0),
      }))

      if (didSolve) {
        triggerSolved()
      } else if (nextVal === 1) {
        cue('place', 0.72)
        haptic('light')
      } else {
        cue('tap', 0.45)
        haptic('light')
      }
    },
    [paused, setSave, triggerSolved, cue, haptic],
  )

  const handleUndo = useCallback(() => {
    if (paused || stateRef.current.solved) return
    const curr = stateRef.current
    const next = undoWeave(curr)
    if (next === curr) return
    stateRef.current = next
    setSave((prev) => ({
      version: 1,
      state: next,
      completed: isValidSave(prev) ? prev.completed : 0,
    }))
    cue('undo', 0.65)
    haptic('light')
  }, [paused, setSave, cue, haptic])

  const handleClear = useCallback(() => {
    if (paused || stateRef.current.solved) return
    const curr = stateRef.current
    const next = clearWeave(curr)
    if (next === curr) return
    stateRef.current = next
    setSave((prev) => ({
      version: 1,
      state: next,
      completed: isValidSave(prev) ? prev.completed : 0,
    }))
    cue('undo', 0.7)
    haptic('light')
  }, [paused, setSave, cue, haptic])

  const handleRestart = useCallback(() => {
    window.clearTimeout(completionTimerRef.current)
    dragRef.current = null
    setShowCompletion(false)
    setCursor(null)
    const next = restartPuzzle(stateRef.current)
    stateRef.current = next
    setSave((prev) => ({
      version: 1,
      state: next,
      completed: isValidSave(prev) ? prev.completed : 0,
    }))
    cue('undo', 0.7)
  }, [setSave, cue])

  const handleNext = useCallback(() => {
    window.clearTimeout(completionTimerRef.current)
    dragRef.current = null
    setShowCompletion(false)
    setCursor(null)
    const next = nextPuzzle(stateRef.current, calm)
    stateRef.current = next
    setSave((prev) => ({
      version: 1,
      state: next,
      completed: isValidSave(prev) ? prev.completed : 0,
    }))
    cue('tap', 0.6)
  }, [setSave, calm, cue])

  /* --- Smooth pointer drag-painting -------------------------------------- */

  const cellFromPoint = useCallback((clientX: number, clientY: number): { row: number; col: number } | null => {
    const el = gridRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return null
    }
    const curr = stateRef.current
    const col = Math.min(curr.cols - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * curr.cols)))
    const row = Math.min(curr.rows - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * curr.rows)))
    return { row, col }
  }, [])

  const onGridPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (paused || stateRef.current.solved) return
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return
    if (dragRef.current) return

    const hit = cellFromPoint(e.clientX, e.clientY)
    if (!hit) return

    setCursor(null)
    const effectiveTool: WeaveTool = e.button === 2 ? 'mark' : tool
    const startValue = stateRef.current.grid[hit.row]![hit.col]!
    const strokeValue: WeaveCell =
      effectiveTool === 'fill' ? (startValue === 1 ? 0 : 1) : startValue === 2 ? 0 : 2

    dragRef.current = {
      pointerId: e.pointerId,
      strokeValue,
      startValue,
      lastRow: hit.row,
      lastCol: hit.col,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    paintCell(hit.row, hit.col, strokeValue, true)
  }

  const onGridPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const stroke = dragRef.current
    if (!stroke || stroke.pointerId !== e.pointerId) return
    if (stateRef.current.solved) {
      dragRef.current = null
      return
    }

    const hit = cellFromPoint(e.clientX, e.clientY)
    if (!hit) return
    if (hit.row === stroke.lastRow && hit.col === stroke.lastCol) return

    stroke.lastRow = hit.row
    stroke.lastCol = hit.col

    const currentVal = stateRef.current.grid[hit.row]![hit.col]!
    // Protective drag rules: painting fill respects existing × marks; marking respects filled cells;
    // erasing only clears cells matching what the stroke started on.
    if (stroke.strokeValue === 1 && currentVal === 2) return
    if (stroke.strokeValue === 2 && currentVal === 1) return
    if (stroke.strokeValue === 0 && currentVal !== stroke.startValue) return
    if (currentVal === stroke.strokeValue) return

    paintCell(hit.row, hit.col, stroke.strokeValue, false)
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null
    }
  }

  /* --- Keyboard controls ------------------------------------------------- */

  const moveCursor = useCallback((dRow: number, dCol: number) => {
    const curr = stateRef.current
    setCursor((prev) => {
      if (!prev) return { row: 0, col: 0 }
      return {
        row: (prev.row + dRow + curr.rows) % curr.rows,
        col: (prev.col + dCol + curr.cols) % curr.cols,
      }
    })
  }, [])

  useKeys(
    {
      ArrowUp: () => moveCursor(-1, 0),
      ArrowDown: () => moveCursor(1, 0),
      ArrowLeft: () => moveCursor(0, -1),
      ArrowRight: () => moveCursor(0, 1),
      ' ': () => cursor && handleToggleAt(cursor.row, cursor.col, tool),
      Enter: () => cursor && handleToggleAt(cursor.row, cursor.col, tool),
      f: () => setTool('fill'),
      F: () => setTool('fill'),
      x: () => setTool('mark'),
      X: () => setTool('mark'),
      m: () => setTool('mark'),
      M: () => setTool('mark'),
      z: handleUndo,
      Z: handleUndo,
      c: handleClear,
      C: handleClear,
      Escape: () => setCursor(null),
    },
    !paused && !state.solved,
    false,
  )

  const frameStyle = {
    '--rows': state.rows,
    '--cols': state.cols,
    '--max-row-clue': maxRowClueLen,
    '--max-col-clue': maxColClueLen,
  } as CSSProperties

  const guideIndex = state.rows === 8 ? 3 : -1

  return (
    <GameShell
      gameId="weave"
      stats={[
        { label: 'Pattern', value: state.puzzleNumber },
        { label: 'Woven', value: `${progress.filled}/${progress.total}` },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={handleRestart}
      onExit={onExit}
      howTo={
        <>
          <p>Each number shows a consecutive run of filled cells in that row or column.</p>
          <p>Drag across cells to weave smoothly. Switch to Mark × to rule out empty cells.</p>
        </>
      }
      controls={
        <div className="weave-controls">
          <div className="weave-controls__seg">
            <Segmented
              label="Tool"
              options={TOOL_OPTIONS}
              value={tool}
              onChange={(nextTool) => {
                setTool(nextTool)
                cue('tap', 0.45)
                haptic('light')
              }}
            />
          </div>
          <div className="weave-controls__icons">
            <IconButton
              label="Undo"
              onClick={handleUndo}
              disabled={state.solved || state.undoStack.length === 0}
            >
              <Undo2 size={18} strokeWidth={1.6} />
            </IconButton>
            <IconButton
              label="Clear"
              onClick={handleClear}
              disabled={state.solved || !hasAnyMarkOrFill}
            >
              <RotateCcw size={17} strokeWidth={1.6} />
            </IconButton>
          </div>
        </div>
      }
    >
      <div className="weave-stage">
        <div
          className="weave-frame"
          style={frameStyle}
          data-solved={state.solved || undefined}
        >
          <div className="weave-corner num" aria-hidden>
            {state.rows}×{state.cols}
          </div>

          <div className="weave-col-clues" aria-hidden>
            {state.colClues.map((clue, c) => (
              <div
                key={c}
                className="weave-col-clue num"
                data-satisfied={colSatisfied[c] || undefined}
                data-active={cursor?.col === c ? 'true' : undefined}
              >
                {clue.map((n, i) => (
                  <span key={i}>{n}</span>
                ))}
              </div>
            ))}
          </div>

          <div className="weave-row-clues" aria-hidden>
            {state.rowClues.map((clue, r) => (
              <div
                key={r}
                className="weave-row-clue num"
                data-satisfied={rowSatisfied[r] || undefined}
                data-active={cursor?.row === r ? 'true' : undefined}
              >
                {clue.map((n, i) => (
                  <span key={i}>{n}</span>
                ))}
              </div>
            ))}
          </div>

          <div
            ref={gridRef}
            className="weave-grid"
            role="grid"
            aria-label={`Weave ${state.rows} by ${state.cols} nonogram`}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={onGridPointerDown}
            onPointerMove={onGridPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {state.grid.map((rowArr, r) =>
              rowArr.map((cell, c) => {
                const isCursor = cursor?.row === r && cursor?.col === c
                return (
                  <div
                    key={`${r}-${c}`}
                    role="gridcell"
                    className="weave-cell"
                    aria-label={`Row ${r + 1}, column ${c + 1}, ${
                      cell === 1 ? 'filled' : cell === 2 ? 'marked' : 'empty'
                    }`}
                    data-val={cell}
                    data-cursor={isCursor || undefined}
                    data-guide-right={c === guideIndex ? 'true' : undefined}
                    data-guide-bottom={r === guideIndex ? 'true' : undefined}
                    data-last-col={c === state.cols - 1 ? 'true' : undefined}
                    data-last-row={r === state.rows - 1 ? 'true' : undefined}
                    style={{ ['--reveal-delay' as string]: `${(r + c) * 28}ms` }}
                  >
                    {cell === 1 && <span className="weave-cell__fill" aria-hidden />}
                    {cell === 2 && !state.solved && (
                      <svg className="weave-cell__mark" viewBox="0 0 16 16" aria-hidden>
                        <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" />
                      </svg>
                    )}
                  </div>
                )
              }),
            )}
          </div>
        </div>
      </div>

      <Completion
        open={showCompletion}
        title={state.title}
        line={`${state.rows}×${state.cols} woven`}
        actionLabel="Next pattern"
        onAction={handleNext}
      />
    </GameShell>
  )
}
