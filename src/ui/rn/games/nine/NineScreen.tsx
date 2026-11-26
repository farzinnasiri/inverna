import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { Eraser, Lightbulb, Pencil, Undo2 } from 'lucide-react-native'
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
  type NineDifficulty,
  type NineState,
} from '@/core/games/nine/engine'
import { radius } from '@/design/tokens'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Completion, GameShell, useGameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { Segmented } from '@/ui/rn/controls'
import { GlassSurface } from '@/ui/rn/Glass'
import { useCalm, useFeedback, useGameSave, useKeys, useResponsiveLayout } from '@/ui/rn/hooks'

interface NineSave {
  version: 1
  state: NineState
  completed: number
}

const KEYPAD_ROWS = [[1, 2, 3], [4, 5, 6], [7, 8, 9]] as const
const DIFFICULTIES = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'expert', label: 'Expert' },
] as const

function selectEmpty(state: NineState): NineState {
  const index = state.values.indexOf(0)
  return selectCell(state, index < 0 ? null : index)
}

const ROWS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const
const COLS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const
const NOTE_ROWS = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
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

function KeypadButton({
  label,
  minHeight,
  active,
  disabled,
  dimmed,
  onPress,
  children,
}: {
  label: string
  minHeight: number
  active?: boolean
  disabled?: boolean
  dimmed?: boolean
  onPress: () => void
  children: ReactNode
}) {
  const { color } = useTokenColors()
  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-selected={active}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        {
          opacity: disabled ? 0.36 : dimmed ? 0.5 : pressed ? 0.88 : 1,
          transform: [{ scale: pressed && !disabled ? 0.965 : 1 }],
        },
      ]}
    >
      <GlassSurface
        variant="pill"
        radius={radius.sm}
        accent={active}
        style={[styles.keySurface, { minHeight }, active && { backgroundColor: color.accentWash }]}
      >
        {children}
      </GlassSurface>
    </Pressable>
  )
}

export function NineScreen({ onExit }: GameScreenProps) {
  const { color, pieces } = useTokenColors()
  const { isCompact, contentWidth } = useResponsiveLayout()
  const calm = useCalm()
  const { cue, haptic } = useFeedback()

  const [fallback] = useState<NineSave>(() => ({
    version: 1,
    state: createNine({ seed: Date.now() >>> 0, calm, difficulty: 'medium' }),
    completed: 0,
  }))
  const [save, setSave] = useGameSave('nine', fallback, isValidSave)
  const state = save.state

  const [started, setStarted] = useState(false)
  const [difficulty, setDifficulty] = useState<NineDifficulty>(state.difficulty ?? 'medium')
  const [isPaused, setPaused] = useState(false)
  const paused = isPaused || !started
  const [showCompletion, setShowCompletion] = useState(state.solved)
  const [stageSize, setStageSize] = useState(0)

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
    haptic('complete')
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
        haptic('settle')
      } else if (feedback === 'undo') {
        cue('undo', 0.65)
      } else {
        cue('tap', 0.5)
        haptic('tick')
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
    haptic('tick')
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
    const next = selectEmpty(restartPuzzle(stateRef.current))
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
    const next = selectEmpty(nextPuzzle(stateRef.current, calm))
    stateRef.current = next
    setSave((prev) => ({
      version: 1,
      state: next,
      completed: isValidSave(prev) ? prev.completed : 0,
    }))
    cue('tap', 0.6)
  }, [setSave, calm, cue])

  const handleBegin = useCallback(() => {
    const current = stateRef.current
    // Continue keeps a game in progress; an untouched board is dealt again
    // at the difficulty chosen on the door.
    const untouched = current.undoStack.length === 0 && !current.solved
    const replace = untouched && difficulty !== (current.difficulty ?? 'medium')
    const puzzle = replace ? nextPuzzle(current, calm, difficulty) : current
    const next = selectEmpty(puzzle)
    stateRef.current = next
    setSave((prev) => ({ version: 1, state: next, completed: isValidSave(prev) ? prev.completed : 0 }))
    setShowCompletion(next.solved)
    setStarted(true)
  }, [difficulty, calm, setSave])

  /** New game sheet: a fresh puzzle at the difficulty picked there. */
  const handleNewGame = useCallback(() => {
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    setShowCompletion(false)
    const next = selectEmpty(nextPuzzle(stateRef.current, calm, difficulty))
    stateRef.current = next
    setSave((prev) => ({ version: 1, state: next, completed: isValidSave(prev) ? prev.completed : 0 }))
  }, [calm, difficulty, setSave])


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
    setStageSize(Math.min(width, height))
  }, [])

  const cellSize = Math.floor((Math.min(stageSize, contentWidth) - 2) / BOARD_SIZE)
  const innerSize = cellSize * BOARD_SIZE
  const digitFontSize = Math.min(24, Math.round(cellSize * 0.54))
  const noteFontSize = Math.min(11, Math.round(cellSize * 0.25))
  const keyHeight = isCompact ? 42 : 48

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
      ready={started}
      readyExtra={<Segmented label="Difficulty" options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} />}
      onReady={handleBegin}
      paused={isPaused}
      onPauseChange={setPaused}
      onRestart={handleRestart}
      onNewGame={handleNewGame}
      onExit={onExit}
      controls={started && (
        <View style={[styles.controlsWrap, { gap: isCompact ? 4 : 6, maxWidth: contentWidth }]}>
          <View style={styles.keyRow}>
            <KeypadButton
              label="Undo"
              minHeight={keyHeight}
              disabled={paused || state.solved || state.undoStack.length === 0}
              onPress={handleUndo}
            >
              <Undo2 size={15} strokeWidth={1.6} color={color.ink2} />
              <Text style={[styles.actionBtnText, { color: color.ink2 }]}>Undo</Text>
            </KeypadButton>
            <KeypadButton
              label="Erase"
              minHeight={keyHeight}
              disabled={paused || state.solved || !canErase}
              onPress={handleErase}
            >
              <Eraser size={15} strokeWidth={1.6} color={color.ink2} />
              <Text style={[styles.actionBtnText, { color: color.ink2 }]}>Erase</Text>
            </KeypadButton>
            <KeypadButton
              label="Notes"
              minHeight={keyHeight}
              active={state.notesMode}
              disabled={paused || state.solved}
              onPress={handleToggleNotes}
            >
              <Pencil size={15} strokeWidth={1.6} color={state.notesMode ? color.accent : color.ink2} />
              <Text style={[styles.actionBtnText, { color: state.notesMode ? color.accent : color.ink2 }]}>
                Notes
              </Text>
            </KeypadButton>
            <KeypadButton
              label="Hint"
              minHeight={keyHeight}
              disabled={paused || state.solved}
              onPress={handleHint}
            >
              <Lightbulb size={15} strokeWidth={1.6} color={color.ink2} />
              <Text style={[styles.actionBtnText, { color: color.ink2 }]}>Hint</Text>
            </KeypadButton>
          </View>

<NewPuzzleButton disabled={isPaused} color={color.ink2} />
          {KEYPAD_ROWS.map((digits) => (
            <View key={digits[0]} style={styles.keyRow}>
              {digits.map((digit) => {
                const done = digitCounts[digit]! >= 9
                return (
                  <KeypadButton
                    key={digit}
                    label={`${state.notesMode ? 'Note' : 'Place'} ${digit}, ${Math.max(0, 9 - digitCounts[digit]!)} left`}
                    minHeight={keyHeight}
                    dimmed={done}
                    disabled={paused || state.solved}
                    onPress={() => handleDigit(digit)}
                  >
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.digitBtnText,
                        { fontSize: state.notesMode ? 16 : 20, color: state.notesMode ? color.ink2 : color.ink },
                      ]}
                    >
                      {digit}
                    </Text>
                    <Text style={{ color: color.ink3, fontSize: 10 }}>
                      {Math.max(0, 9 - digitCounts[digit]!)} left
                    </Text>
                  </KeypadButton>
                )
              })}
            </View>
          ))}
        </View>
      )}
    >
      <View style={styles.stage} onLayout={handleStageLayout}>
        {cellSize > 0 && (
          <GlassSurface
            variant="card"
            radius={radius.md}
            accent={state.solved}
            style={{ width: innerSize + 2, height: innerSize + 2 }}
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
                        ? color.surface2
                        : 'rgba(12, 14, 18, 0.92)'

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
                          borderRightWidth: col === 8 ? 0 : isBoxRight ? 2 : 1,
                          borderBottomWidth: row === 8 ? 0 : isBoxBottom ? 2 : 1,
                          borderRightColor: isBoxRight
                            ? 'rgba(255, 255, 255, 0.36)'
                            : 'rgba(255, 255, 255, 0.10)',
                          borderBottomColor: isBoxBottom
                            ? 'rgba(255, 255, 255, 0.36)'
                            : 'rgba(255, 255, 255, 0.10)',
                        },
                      ]}
                    >
                      {val !== 0 ? (
                        <Text
                          allowFontScaling={false}
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
                                        allowFontScaling={false}
                                        style={[
                                          styles.noteText,
                                          {
                                            fontSize: noteFontSize,
                                            lineHeight: noteFontSize + 1,
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
          </GlassSurface>
        )}
      </View>

      <Completion
        open={started && showCompletion}
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
    alignSelf: 'center',
  },
  newPuzzle: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 5,
  },
  key: {
    flex: 1,
    minWidth: 0,
  },
  keySurface: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  digitBtnText: {
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
})

/** The same New game sheet as the top bar's button (ISS-08: this used to leave the board behind a door that never opened). */
function NewPuzzleButton({ disabled, color }: { disabled: boolean; color: string }) {
  const { openNewGame } = useGameShell()
  return (
    <Pressable accessibilityRole="button" onPress={openNewGame} disabled={disabled} style={styles.newPuzzle}>
      <Text style={[styles.actionBtnText, { color }]}>New puzzle</Text>
    </Pressable>
  )
}
