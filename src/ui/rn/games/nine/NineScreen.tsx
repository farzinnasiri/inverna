import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { Eraser, Pencil, Sparkles, Undo2 } from 'lucide-react-native'
import {
  BOARD_SIZE,
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
import { radius } from '@/design/tokens'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Completion, GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { useCalm, useFeedback, useGameSave, useKeys } from '@/ui/rn/hooks'

interface NineSave {
  version: 1
  state: NineState
  completed: number
}

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const ROWS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const
const COLS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const
const NOTE_ROWS = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
] as const

const HOW_TO = [
  'Fill every row, column, and 3×3 box with the digits one through nine.',
  'Toggle Notes to jot candidates in pencil; matching notes clear automatically when you place a digit.',
] as const

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

function Icon({
  as,
  size,
  strokeWidth = 1.6,
  color,
}: {
  as: object
  size: number
  strokeWidth?: number
  color: string
}) {
  const Comp = as as ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
  return <Comp size={size} strokeWidth={strokeWidth} color={color} />
}

export function NineScreen({ onExit }: GameScreenProps) {
  const { color, pieces } = useTokenColors()
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
  const [cellSize, setCellSize] = useState(36)

  const stateRef = useRef<NineState>(state)
  stateRef.current = state
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    }
  }, [])

  const conflicts = useMemo(() => getConflicts(state), [state])
  const digitCounts = useMemo(() => getDigitCounts(state.values), [state.values])
  const remaining = useMemo(() => getRemainingCount(state), [state])

  const selectedValue = state.selected !== null ? state.values[state.selected]! : 0

  const scheduleSolvedFeedback = useCallback(() => {
    cue('chime', 0.9)
    haptic('success')
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    completionTimerRef.current = setTimeout(() => {
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
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
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
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
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

  const handleStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    const avail = Math.min(width, height, 388)
    const nextCell = Math.floor((avail - 2) / BOARD_SIZE)
    if (nextCell >= 24) setCellSize(nextCell)
  }, [])

  const innerSize = cellSize * BOARD_SIZE
  const digitFontSize = Math.max(15, Math.min(21, Math.round(cellSize * 0.52)))
  const noteFontSize = Math.max(8, Math.min(10, Math.round(cellSize * 0.24)))

  const canErase =
    state.selected !== null &&
    !state.givens[state.selected] &&
    (state.values[state.selected] !== 0 || state.notes[state.selected]!.length > 0)

  return (
    <GameShell
      gameId="nine"
      score={save.completed}
      stats={[
        { label: 'Puzzle', value: state.puzzleNumber },
        { label: 'Left', value: remaining },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={handleRestart}
      onExit={onExit}
      howTo={HOW_TO}
      controls={
        <View style={styles.controlsWrap}>
          <View style={styles.digitsRow}>
            {DIGITS.map((d) => {
              const done = digitCounts[d]! >= 9
              const disabled = state.solved
              return (
                <Pressable
                  key={d}
                  disabled={disabled}
                  onPress={() => handleDigit(d)}
                  accessibilityRole="button"
                  accessibilityLabel={state.notesMode ? `Note ${d}` : `Place ${d}`}
                  style={({ pressed }) => [
                    styles.digitBtn,
                    {
                      backgroundColor: done
                        ? color.surface1
                        : pressed
                          ? color.surface3
                          : color.surface2,
                      borderColor: color.line,
                      opacity: disabled ? 0.35 : done ? 0.55 : 1,
                      transform: [{ scale: pressed && !disabled ? 0.94 : 1 }],
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.digitBtnText,
                      {
                        fontSize: state.notesMode ? 14 : 18,
                        color: done ? color.ink4 : state.notesMode ? color.ink2 : color.ink,
                      },
                    ]}
                  >
                    {d}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              disabled={state.solved || state.undoStack.length === 0}
              onPress={handleUndo}
              accessibilityRole="button"
              accessibilityLabel="Undo"
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: pressed ? color.surface3 : color.surface2,
                  borderColor: color.line,
                  opacity: state.solved || state.undoStack.length === 0 ? 0.32 : 1,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}
            >
              <Icon as={Undo2} size={15} color={color.ink2} />
              <Text style={[styles.actionBtnText, { color: color.ink2 }]}>Undo</Text>
            </Pressable>

            <Pressable
              disabled={state.solved || !canErase}
              onPress={handleErase}
              accessibilityRole="button"
              accessibilityLabel="Erase"
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: pressed ? color.surface3 : color.surface2,
                  borderColor: color.line,
                  opacity: state.solved || !canErase ? 0.32 : 1,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}
            >
              <Icon as={Eraser} size={15} color={color.ink2} />
              <Text style={[styles.actionBtnText, { color: color.ink2 }]}>Erase</Text>
            </Pressable>

            <Pressable
              disabled={state.solved}
              onPress={handleToggleNotes}
              accessibilityRole="button"
              accessibilityLabel="Notes"
              accessibilityState={{ selected: state.notesMode }}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: state.notesMode
                    ? color.accentWash
                    : pressed
                      ? color.surface3
                      : color.surface2,
                  borderColor: state.notesMode ? color.accent : color.line,
                  opacity: state.solved ? 0.32 : 1,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}
            >
              <Icon
                as={Pencil}
                size={15}
                color={state.notesMode ? color.accent : color.ink2}
              />
              <Text
                style={[
                  styles.actionBtnText,
                  { color: state.notesMode ? color.accent : color.ink2 },
                ]}
              >
                Notes
              </Text>
            </Pressable>

            <Pressable
              disabled={state.solved}
              onPress={handleHint}
              accessibilityRole="button"
              accessibilityLabel="Hint"
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: pressed ? color.surface3 : color.surface2,
                  borderColor: color.line,
                  opacity: state.solved ? 0.32 : 1,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}
            >
              <Icon as={Sparkles} size={15} color={color.ink2} />
              <Text style={[styles.actionBtnText, { color: color.ink2 }]}>Hint</Text>
            </Pressable>
          </View>
        </View>
      }
    >
      <View style={styles.stage} onLayout={handleStageLayout}>
        <View
          style={[
            styles.board,
            {
              width: innerSize + 2,
              height: innerSize + 2,
              backgroundColor: color.bg,
              borderColor: state.solved ? color.accentDim : color.lineStrong,
            },
          ]}
        >
          {ROWS.map((row) => (
            <View key={row} style={styles.gridRow}>
              {COLS.map((col) => {
                const idx = row * BOARD_SIZE + col
                const val = state.values[idx]!
                const isGiven = state.givens[idx]!
                const isSelected = state.selected === idx
                const isPeerCell = state.selected !== null && isPeer(state.selected, idx)
                const isMatchingDigit =
                  !isSelected && selectedValue !== 0 && val === selectedValue
                const hasConflict = conflicts.has(idx)
                const cellNotes = state.notes[idx]!

                const isBoxRight = col === 2 || col === 5
                const isBoxBottom = row === 2 || row === 5

                const cellBg = isSelected
                  ? color.surface3
                  : isMatchingDigit
                    ? color.accentWash
                    : isPeerCell
                      ? color.surface1
                      : color.bg

                return (
                  <Pressable
                    key={idx}
                    onPress={() => handleSelect(idx)}
                    accessibilityRole="button"
                    accessibilityLabel={`Row ${row + 1}, column ${col + 1}${
                      val ? `, ${val}${isGiven ? ' given' : ''}` : ', empty'
                    }${hasConflict ? ', conflict' : ''}`}
                    accessibilityState={{ selected: isSelected }}
                    style={[
                      styles.cell,
                      {
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: cellBg,
                        borderRightWidth: col === 8 ? 0 : isBoxRight ? 1.5 : 1,
                        borderBottomWidth: row === 8 ? 0 : isBoxBottom ? 1.5 : 1,
                        borderRightColor: isBoxRight ? color.lineStrong : color.line,
                        borderBottomColor: isBoxBottom ? color.lineStrong : color.line,
                      },
                    ]}
                  >
                    {val !== 0 ? (
                      <Text
                        style={[
                          styles.cellDigit,
                          {
                            fontSize: digitFontSize,
                            fontWeight: isGiven ? '600' : '400',
                            color: isGiven ? color.ink : color.accent,
                          },
                        ]}
                      >
                        {val}
                      </Text>
                    ) : cellNotes.length > 0 ? (
                      <View pointerEvents="none" style={styles.notesGrid}>
                        {NOTE_ROWS.map((noteRow, nr) => (
                          <View key={nr} style={styles.notesRow}>
                            {noteRow.map((n) => {
                              const present = cellNotes.includes(n)
                              const match = present && selectedValue === n
                              return (
                                <View key={n} style={styles.noteSlot}>
                                  {present ? (
                                    <Text
                                      style={[
                                        styles.noteText,
                                        {
                                          fontSize: noteFontSize,
                                          color: match ? color.accent : color.ink3,
                                          fontWeight: match ? '600' : '500',
                                        },
                                      ]}
                                    >
                                      {n}
                                    </Text>
                                  ) : null}
                                </View>
                              )
                            })}
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {hasConflict ? (
                      <View
                        pointerEvents="none"
                        style={[styles.conflictDot, { backgroundColor: pieces.sage }]}
                      />
                    ) : null}

                    {isSelected ? (
                      <View
                        pointerEvents="none"
                        style={[styles.selectedRing, { borderColor: color.accent }]}
                      />
                    ) : null}
                  </Pressable>
                )
              })}
            </View>
          ))}
        </View>
      </View>

      <Completion
        open={showCompletion}
        gameId="nine"
        title="Solved"
        line={`Puzzle ${state.puzzleNumber} complete`}
        actionLabel="Next puzzle"
        onAction={handleNext}
      />
    </GameShell>
  )
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  board: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  gridRow: {
    flexDirection: 'row',
  },
  cell: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellDigit: {
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  notesGrid: {
    width: '100%',
    height: '100%',
    padding: 2,
  },
  notesRow: {
    flex: 1,
    flexDirection: 'row',
  },
  noteSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteText: {
    lineHeight: 11,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  conflictDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  selectedRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 1.5,
  },
  controlsWrap: {
    width: '100%',
    maxWidth: 388,
    alignSelf: 'center',
    gap: 8,
  },
  digitsRow: {
    flexDirection: 'row',
    gap: 5,
  },
  digitBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitBtnText: {
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    flex: 1,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
})
