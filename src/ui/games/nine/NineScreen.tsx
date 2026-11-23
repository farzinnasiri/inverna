import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eraser, Pencil, Sparkles, Undo2 } from 'lucide-react'
import {
  CELL_COUNT,
  colOf,
  createNine,
  eraseCell,
  getConflicts,
  getDigitCounts,
  getRemainingCount,
  hintNine,
  inputDigit,
  isPeer,
  nextPuzzle,
  restartPuzzle,
  rowOf,
  selectCell,
  toggleNotesMode,
  undoNine,
  type NineState,
} from '@/core/games/nine/engine'
import { Completion, GameShell, type GameScreenProps } from '@/ui/components/GameShell'
import { useCalm, useFeedback, useGameSave, useKeys } from '@/ui/hooks/game'
import './nine.css'

interface NineSave {
  version: 1
  state: NineState
  completed: number
}

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

function isValidSave(value: unknown): value is NineSave {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<NineSave>
  return (
    v.version === 1 &&
    !!v.state &&
    Array.isArray(v.state.solution) &&
    v.state.solution.length === CELL_COUNT &&
    Array.isArray(v.state.givens) &&
    v.state.givens.length === CELL_COUNT &&
    Array.isArray(v.state.values) &&
    v.state.values.length === CELL_COUNT &&
    Array.isArray(v.state.notes) &&
    v.state.notes.length === CELL_COUNT &&
    Array.isArray(v.state.undoStack)
  )
}

export default function NineScreen({ onExit }: GameScreenProps) {
  const calm = useCalm()
  const { cue, haptic } = useFeedback()

  const [fallback] = useState<NineSave>(() => ({
    version: 1,
    state: createNine({ seed: Date.now() >>> 0, calm }),
    completed: 0,
  }))
  const [rawSave, setSave] = useGameSave<NineSave>('nine', fallback)
  const save = isValidSave(rawSave) ? rawSave : fallback
  const state = save.state

  const [paused, setPaused] = useState(false)
  const [showCompletion, setShowCompletion] = useState(state.solved)
  const stateRef = useRef<NineState>(state)
  stateRef.current = state
  const completionTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => window.clearTimeout(completionTimerRef.current)
  }, [])

  const conflicts = useMemo(() => getConflicts(state), [state])
  const digitCounts = useMemo(() => getDigitCounts(state.values), [state.values])
  const remaining = useMemo(() => getRemainingCount(state), [state])

  const selectedValue = state.selected !== null ? state.values[state.selected]! : 0

  const scheduleSolvedFeedback = useCallback(() => {
    cue('chime', 0.9)
    haptic('success')
    window.clearTimeout(completionTimerRef.current)
    completionTimerRef.current = window.setTimeout(() => {
      setShowCompletion(true)
    }, 440)
  }, [cue, haptic])

  const applyEdit = useCallback(
    (updater: (curr: NineState) => NineState, feedback: 'place' | 'tap' | 'undo') => {
      const curr = stateRef.current
      const next = updater(curr)
      if (next === curr) return

      const didSolve = !curr.solved && next.solved
      stateRef.current = next
      setSave((prev) => {
        const prevCompleted = isValidSave(prev) ? prev.completed : 0
        return {
          version: 1,
          state: next,
          completed: prevCompleted + (didSolve ? 1 : 0),
        }
      })

      if (didSolve) {
        scheduleSolvedFeedback()
      } else if (feedback === 'place') {
        cue('place', 0.8)
        haptic('light')
      } else if (feedback === 'undo') {
        cue('undo', 0.65)
        haptic('light')
      } else {
        cue('tap', 0.5)
        haptic('light')
      }
    },
    [setSave, scheduleSolvedFeedback, cue, haptic],
  )

  const handleSelect = useCallback(
    (idx: number | null) => {
      if (paused || stateRef.current.solved) return
      const curr = stateRef.current
      const next = selectCell(curr, idx)
      if (next === curr) return
      stateRef.current = next
      setSave((prev) => ({
        version: 1,
        state: next,
        completed: isValidSave(prev) ? prev.completed : 0,
      }))
      if (idx !== null) cue('tap', 0.35)
    },
    [paused, setSave, cue],
  )

  const handleDigit = useCallback(
    (digit: number) => {
      if (paused || stateRef.current.solved) return
      applyEdit((curr) => inputDigit(curr, digit), stateRef.current.notesMode ? 'tap' : 'place')
    },
    [paused, applyEdit],
  )

  const handleErase = useCallback(() => {
    if (paused || stateRef.current.solved) return
    applyEdit(eraseCell, 'undo')
  }, [paused, applyEdit])

  const handleToggleNotes = useCallback(() => {
    if (paused || stateRef.current.solved) return
    const next = toggleNotesMode(stateRef.current)
    stateRef.current = next
    setSave((prev) => ({
      version: 1,
      state: next,
      completed: isValidSave(prev) ? prev.completed : 0,
    }))
    cue('tap', 0.5)
    haptic('light')
  }, [paused, setSave, cue, haptic])

  const handleUndo = useCallback(() => {
    if (paused || stateRef.current.solved) return
    applyEdit(undoNine, 'undo')
  }, [paused, applyEdit])

  const handleHint = useCallback(() => {
    if (paused || stateRef.current.solved) return
    applyEdit(hintNine, 'place')
  }, [paused, applyEdit])

  const handleRestart = useCallback(() => {
    window.clearTimeout(completionTimerRef.current)
    setShowCompletion(false)
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
    setShowCompletion(false)
    const next = nextPuzzle(stateRef.current, calm)
    stateRef.current = next
    setSave((prev) => ({
      version: 1,
      state: next,
      completed: isValidSave(prev) ? prev.completed : 0,
    }))
    cue('tap', 0.6)
  }, [setSave, calm, cue])

  const moveSelection = useCallback(
    (dRow: number, dCol: number) => {
      const curr = stateRef.current
      const idx =
        curr.selected === null
          ? (() => {
              const firstEmpty = curr.givens.findIndex((g) => !g)
              return firstEmpty >= 0 ? firstEmpty : 40
            })()
          : ((rowOf(curr.selected) + dRow + 9) % 9) * 9 + ((colOf(curr.selected) + dCol + 9) % 9)
      const next = selectCell(curr, idx)
      if (next === curr) return
      stateRef.current = next
      setSave((prev) => ({
        version: 1,
        state: next,
        completed: isValidSave(prev) ? prev.completed : 0,
      }))
    },
    [setSave],
  )

  useKeys(
    {
      ArrowUp: () => moveSelection(-1, 0),
      ArrowDown: () => moveSelection(1, 0),
      ArrowLeft: () => moveSelection(0, -1),
      ArrowRight: () => moveSelection(0, 1),
      '1': () => handleDigit(1),
      '2': () => handleDigit(2),
      '3': () => handleDigit(3),
      '4': () => handleDigit(4),
      '5': () => handleDigit(5),
      '6': () => handleDigit(6),
      '7': () => handleDigit(7),
      '8': () => handleDigit(8),
      '9': () => handleDigit(9),
      Backspace: handleErase,
      Delete: handleErase,
      '0': handleErase,
      n: handleToggleNotes,
      N: handleToggleNotes,
      z: handleUndo,
      Z: handleUndo,
      h: handleHint,
      H: handleHint,
      Escape: () => handleSelect(null),
    },
    !paused && !state.solved,
    false,
  )

  const canErase =
    state.selected !== null &&
    !state.givens[state.selected] &&
    (state.values[state.selected] !== 0 || state.notes[state.selected]!.length > 0)

  return (
    <GameShell
      gameId="nine"
      stats={[
        { label: 'Puzzle', value: state.puzzleNumber },
        { label: 'Left', value: remaining },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={handleRestart}
      onExit={onExit}
      howTo={
        <>
          <p>Fill every row, column, and 3×3 box with the digits one through nine.</p>
          <p>Toggle Notes to jot candidates in pencil; matching notes clear automatically when you place a digit.</p>
        </>
      }
      controls={
        <div className="nine-controls">
          <div className="nine-digits" role="group" aria-label="Digits">
            {DIGITS.map((d) => {
              const done = digitCounts[d]! >= 9
              return (
                <button
                  key={d}
                  type="button"
                  className="nine-digit num"
                  data-done={done || undefined}
                  data-notes={state.notesMode || undefined}
                  disabled={state.solved}
                  aria-label={state.notesMode ? `Note ${d}` : `Place ${d}`}
                  onClick={() => handleDigit(d)}
                >
                  {d}
                </button>
              )
            })}
          </div>

          <div className="nine-actions" role="group" aria-label="Actions">
            <button
              type="button"
              className="nine-action"
              onClick={handleUndo}
              disabled={state.solved || state.undoStack.length === 0}
            >
              <Undo2 size={15} strokeWidth={1.6} aria-hidden />
              <span>Undo</span>
            </button>
            <button
              type="button"
              className="nine-action"
              onClick={handleErase}
              disabled={state.solved || !canErase}
            >
              <Eraser size={15} strokeWidth={1.6} aria-hidden />
              <span>Erase</span>
            </button>
            <button
              type="button"
              className="nine-action"
              aria-pressed={state.notesMode}
              onClick={handleToggleNotes}
              disabled={state.solved}
            >
              <Pencil size={15} strokeWidth={1.6} aria-hidden />
              <span>Notes</span>
            </button>
            <button
              type="button"
              className="nine-action"
              onClick={handleHint}
              disabled={state.solved}
            >
              <Sparkles size={15} strokeWidth={1.6} aria-hidden />
              <span>Hint</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="nine-stage">
        <div className="nine-board" data-solved={state.solved || undefined}>
          <div className="nine-grid" role="grid" aria-label="Nine Sudoku board">
            {state.values.map((val, idx) => {
              const row = rowOf(idx)
              const col = colOf(idx)
              const isGiven = state.givens[idx]!
              const isSelected = state.selected === idx
              const isPeerCell = state.selected !== null && isPeer(state.selected, idx)
              const isMatchingDigit =
                !isSelected && selectedValue !== 0 && val === selectedValue
              const hasConflict = conflicts.has(idx)
              const cellNotes = state.notes[idx]!

              return (
                <button
                  key={idx}
                  type="button"
                  role="gridcell"
                  className="nine-cell"
                  aria-label={`Row ${row + 1}, column ${col + 1}${
                    val ? `, ${val}${isGiven ? ' given' : ''}` : ', empty'
                  }${hasConflict ? ', conflict' : ''}`}
                  aria-selected={isSelected || undefined}
                  data-given={isGiven || undefined}
                  data-selected={isSelected || undefined}
                  data-peer={isPeerCell || undefined}
                  data-match={isMatchingDigit || undefined}
                  data-conflict={hasConflict || undefined}
                  data-box-right={col === 2 || col === 5 ? 'true' : undefined}
                  data-box-bottom={row === 2 || row === 5 ? 'true' : undefined}
                  data-last-col={col === 8 ? 'true' : undefined}
                  data-last-row={row === 8 ? 'true' : undefined}
                  onClick={() => handleSelect(idx)}
                >
                  {val !== 0 ? (
                    <span className="nine-cell__digit num">{val}</span>
                  ) : cellNotes.length > 0 ? (
                    <span className="nine-notes num" aria-hidden>
                      {DIGITS.map((n) => {
                        const present = cellNotes.includes(n)
                        return (
                          <span
                            key={n}
                            className="nine-notes__n"
                            data-match={present && selectedValue === n ? 'true' : undefined}
                          >
                            {present ? n : ''}
                          </span>
                        )
                      })}
                    </span>
                  ) : null}
                  {hasConflict && <span className="nine-cell__conflict" aria-hidden />}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <Completion
        open={showCompletion}
        title="Solved"
        line={`Puzzle ${state.puzzleNumber} complete`}
        actionLabel="Next puzzle"
        onAction={handleNext}
      />
    </GameShell>
  )
}
