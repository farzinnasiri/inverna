import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { RotateCcw, Sparkles, Undo2 } from 'lucide-react-native'
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
import { radius } from '@/design/tokens'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Completion, GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { IconButton, Segmented } from '@/ui/rn/controls'
import { useCalm, useFeedback, useGameSave, useKeys } from '@/ui/rn/hooks'

interface WeaveSave {
  version: 1
  state: WeaveState
  completed: number
}

interface DragStroke {
  startX: number
  startY: number
  strokeValue: WeaveCell
  startValue: WeaveCell
  lastRow: number
  lastCol: number
}

const TOOL_OPTIONS = [
  { value: 'fill' as const, label: 'Fill' },
  { value: 'mark' as const, label: 'Mark ×' },
]

const HOW_TO = [
  'Each number shows a consecutive run of filled cells in that row or column.',
  'Drag across cells to weave smoothly. Switch to Mark × to rule out empty cells.',
] as const

const CLUE_GUTTER = 6

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

/** Integer grid cells along segment from (r0, c0) to (r1, c1), excluding start. */
function walkCells(
  r0: number,
  c0: number,
  r1: number,
  c1: number,
): Array<{ row: number; col: number }> {
  const out: Array<{ row: number; col: number }> = []
  let r = r0
  let c = c0
  const dr = Math.abs(r1 - r0)
  const dc = Math.abs(c1 - c0)
  const sr = r0 < r1 ? 1 : -1
  const sc = c0 < c1 ? 1 : -1
  let err = dr - dc

  while (r !== r1 || c !== c1) {
    const e2 = err * 2
    if (e2 > -dc) {
      err -= dc
      r += sr
    }
    if (e2 < dr) {
      err += dr
      c += sc
    }
    out.push({ row: r, col: c })
  }
  return out
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

export function WeaveScreen({ onExit }: GameScreenProps) {
  const { color, pieces } = useTokenColors()
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
  const [hintCell, setHintCell] = useState<{ row: number; col: number } | null>(null)
  const [showCompletion, setShowCompletion] = useState(state.solved)
  const [stageDims, setStageDims] = useState({ width: 340, height: 360 })

  const dragRef = useRef<DragStroke | null>(null)
  const stateRef = useRef<WeaveState>(state)
  stateRef.current = state
  const toolRef = useRef<WeaveTool>(tool)
  toolRef.current = tool
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    }
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
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    completionTimerRef.current = setTimeout(() => {
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
      if (pausedRef.current || stateRef.current.solved) return
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
    [setSave, triggerSolved, cue, haptic],
  )

  const handleUndo = useCallback(() => {
    if (pausedRef.current || stateRef.current.solved) return
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
  }, [setSave, cue, haptic])

  const handleHint = useCallback(() => {
    if (pausedRef.current || stateRef.current.solved) return
    const curr = stateRef.current

    // 1. Gently correct any wrongly filled cell or wrongly crossed-out solution cell.
    let target: { row: number; col: number; value: WeaveCell } | null = null
    for (let r = 0; r < curr.rows && !target; r++) {
      for (let c = 0; c < curr.cols && !target; c++) {
        const cell = curr.grid[r]![c]!
        const sol = curr.solution[r]![c]!
        if (cell === 1 && sol === 0) {
          target = { row: r, col: c, value: 2 }
        } else if (cell === 2 && sol === 1) {
          target = { row: r, col: c, value: 1 }
        }
      }
    }

    // 2. Otherwise reveal one unfilled solution cell.
    if (!target) {
      for (let r = 0; r < curr.rows && !target; r++) {
        for (let c = 0; c < curr.cols && !target; c++) {
          if (curr.grid[r]![c] === 0 && curr.solution[r]![c] === 1) {
            target = { row: r, col: c, value: 1 }
          }
        }
      }
    }

    if (!target) return

    paintCell(target.row, target.col, target.value, true)
    setHintCell({ row: target.row, col: target.col })
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    hintTimerRef.current = setTimeout(() => setHintCell(null), 900)
  }, [paintCell])

  const handleClear = useCallback(() => {
    if (pausedRef.current || stateRef.current.solved) return
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
  }, [setSave, cue, haptic])

  const handleRestart = useCallback(() => {
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    dragRef.current = null
    setShowCompletion(false)
    setCursor(null)
    setHintCell(null)
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
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    dragRef.current = null
    setShowCompletion(false)
    setCursor(null)
    setHintCell(null)
    const next = nextPuzzle(stateRef.current, calm)
    stateRef.current = next
    setSave((prev) => ({
      version: 1,
      state: next,
      completed: isValidSave(prev) ? prev.completed : 0,
    }))
    cue('tap', 0.6)
  }, [setSave, calm, cue])

  const handleStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width > 80 && height > 80) {
      setStageDims({ width, height })
    }
  }, [])

  const clueW = Math.min(72, Math.max(44, maxRowClueLen * 15 + 14))
  const clueH = Math.min(72, Math.max(42, maxColClueLen * 16 + 12))
  const availW = Math.min(stageDims.width, 388) - clueW - CLUE_GUTTER
  const availH = Math.min(stageDims.height, 388) - clueH - CLUE_GUTTER
  const cellSize = Math.max(
    22,
    Math.floor((Math.min(availW, availH) - 2) / Math.max(state.rows, state.cols)),
  )
  const gridInnerW = cellSize * state.cols
  const gridInnerH = cellSize * state.rows
  const gridOuterW = gridInnerW + 2
  const gridOuterH = gridInnerH + 2

  const gridMetricsRef = useRef({ cellSize, rows: state.rows, cols: state.cols })
  gridMetricsRef.current = { cellSize, rows: state.rows, cols: state.cols }
  const paintCellRef = useRef(paintCell)
  paintCellRef.current = paintCell

  const cellFromLocal = (lx: number, ly: number): { row: number; col: number } | null => {
    const { cellSize: cs, rows, cols } = gridMetricsRef.current
    const x = lx - 1
    const y = ly - 1
    if (x < 0 || y < 0 || x >= cols * cs || y >= rows * cs) return null
    const col = Math.min(cols - 1, Math.max(0, Math.floor(x / cs)))
    const row = Math.min(rows - 1, Math.max(0, Math.floor(y / cs)))
    return { row, col }
  }

  const applyDragCell = (stroke: DragStroke, row: number, col: number) => {
    const currentVal = stateRef.current.grid[row]![col]!
    // Protective drag rules: painting fill respects existing × marks; marking respects filled cells;
    // erasing only clears cells matching what the stroke started on.
    if (stroke.strokeValue === 1 && currentVal === 2) return
    if (stroke.strokeValue === 2 && currentVal === 1) return
    if (stroke.strokeValue === 0 && currentVal !== stroke.startValue) return
    if (currentVal === stroke.strokeValue) return
    paintCellRef.current(row, col, stroke.strokeValue, false)
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        if (pausedRef.current || stateRef.current.solved) return
        const lx = e.nativeEvent.locationX
        const ly = e.nativeEvent.locationY
        const hit = cellFromLocal(lx, ly)
        if (!hit) return

        setCursor(null)
        const startValue = stateRef.current.grid[hit.row]![hit.col]!
        const activeTool = toolRef.current
        const strokeValue: WeaveCell =
          activeTool === 'fill' ? (startValue === 1 ? 0 : 1) : startValue === 2 ? 0 : 2

        dragRef.current = {
          startX: lx,
          startY: ly,
          strokeValue,
          startValue,
          lastRow: hit.row,
          lastCol: hit.col,
        }
        paintCellRef.current(hit.row, hit.col, strokeValue, true)
      },
      onPanResponderMove: (_, g) => {
        const stroke = dragRef.current
        if (!stroke) return
        if (stateRef.current.solved) {
          dragRef.current = null
          return
        }

        const hit = cellFromLocal(stroke.startX + g.dx, stroke.startY + g.dy)
        if (!hit) return
        if (hit.row === stroke.lastRow && hit.col === stroke.lastCol) return

        const steps = walkCells(stroke.lastRow, stroke.lastCol, hit.row, hit.col)
        stroke.lastRow = hit.row
        stroke.lastCol = hit.col
        for (const step of steps) {
          if (stateRef.current.solved) {
            dragRef.current = null
            return
          }
          applyDragCell(stroke, step.row, step.col)
        }
      },
      onPanResponderRelease: () => {
        dragRef.current = null
      },
      onPanResponderTerminate: () => {
        dragRef.current = null
      },
    }),
  ).current

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
      h: handleHint,
      H: handleHint,
      z: handleUndo,
      Z: handleUndo,
      c: handleClear,
      C: handleClear,
      Escape: () => setCursor(null),
    },
    !paused && !state.solved,
    false,
  )

  // 5-cell divider on boards larger than 5×5 (7×7 and 8×8).
  const guideRowIndex = state.rows > 5 ? 4 : -1
  const guideColIndex = state.cols > 5 ? 4 : -1
  const markSize = Math.max(10, Math.round(cellSize * 0.52))

  return (
    <GameShell
      gameId="weave"
      score={save.completed}
      stats={[
        { label: 'Pattern', value: state.puzzleNumber },
        { label: 'Woven', value: `${progress.filled}/${progress.total}` },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={handleRestart}
      onExit={onExit}
      howTo={HOW_TO}
      controls={
        <View style={styles.controlsBar}>
          <View style={styles.controlsSeg}>
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
          </View>
          <View style={styles.controlsIcons}>
            <IconButton
              label="Undo"
              onPress={handleUndo}
              disabled={state.solved || state.undoStack.length === 0}
            >
              <Icon as={Undo2} size={18} color={color.ink2} />
            </IconButton>
            <IconButton
              label="Hint"
              onPress={handleHint}
              disabled={state.solved}
            >
              <Icon as={Sparkles} size={17} color={color.ink2} />
            </IconButton>
            <IconButton
              label="Reset"
              onPress={handleClear}
              disabled={state.solved || !hasAnyMarkOrFill}
            >
              <Icon as={RotateCcw} size={17} color={color.ink2} />
            </IconButton>
          </View>
        </View>
      }
    >
      <View style={styles.stage} onLayout={handleStageLayout}>
        <View style={styles.frame}>
          {/* Top row: corner badge + column clues */}
          <View style={[styles.topRow, { gap: CLUE_GUTTER }]}>
            <View style={[styles.corner, { width: clueW, height: clueH }]}>
              <Text style={[styles.cornerText, { color: color.ink4 }]}>
                {state.rows}×{state.cols}
              </Text>
            </View>

            <View
              style={[
                styles.colClues,
                { width: gridOuterW, height: clueH, paddingHorizontal: 1 },
              ]}
            >
              {state.colClues.map((clue, c) => {
                const satisfied = colSatisfied[c]
                const active = cursor?.col === c
                const clueColor = satisfied ? color.ink4 : active ? color.ink : color.ink2
                return (
                  <View key={c} style={[styles.colClue, { width: cellSize }]}>
                    {clue.map((n, i) => (
                      <Text key={i} style={[styles.clueNum, { color: clueColor }]}>
                        {n}
                      </Text>
                    ))}
                  </View>
                )
              })}
            </View>
          </View>

          {/* Bottom row: row clues + interactive grid */}
          <View style={[styles.bottomRow, { gap: CLUE_GUTTER }]}>
            <View
              style={[
                styles.rowClues,
                { width: clueW, height: gridOuterH, paddingVertical: 1 },
              ]}
            >
              {state.rowClues.map((clue, r) => {
                const satisfied = rowSatisfied[r]
                const active = cursor?.row === r
                const clueColor = satisfied ? color.ink4 : active ? color.ink : color.ink2
                return (
                  <View key={r} style={[styles.rowClue, { height: cellSize }]}>
                    {clue.map((n, i) => (
                      <Text key={i} style={[styles.clueNum, { color: clueColor }]}>
                        {n}
                      </Text>
                    ))}
                  </View>
                )
              })}
            </View>

            <View
              {...panResponder.panHandlers}
              accessible
              accessibilityLabel={`Weave ${state.rows} by ${state.cols} nonogram`}
              style={[
                styles.grid,
                {
                  width: gridOuterW,
                  height: gridOuterH,
                  backgroundColor: color.surface1,
                  borderColor: state.solved ? color.accentDim : color.lineStrong,
                },
              ]}
            >
              {state.grid.map((rowArr, r) => (
                <View key={r} pointerEvents="none" style={styles.gridRow}>
                  {rowArr.map((cell, c) => {
                    const isCursor = cursor?.row === r && cursor?.col === c
                    const isHinted = hintCell?.row === r && hintCell?.col === c
                    const isGuideRight = c === guideColIndex
                    const isGuideBottom = r === guideRowIndex

                    return (
                      <View
                        key={`${r}-${c}`}
                        pointerEvents="none"
                        style={[
                          styles.cell,
                          {
                            width: cellSize,
                            height: cellSize,
                            backgroundColor: color.surface1,
                            borderRightWidth:
                              c === state.cols - 1 ? 0 : isGuideRight ? 1.5 : 1,
                            borderBottomWidth:
                              r === state.rows - 1 ? 0 : isGuideBottom ? 1.5 : 1,
                            borderRightColor: isGuideRight ? color.lineStrong : color.line,
                            borderBottomColor: isGuideBottom ? color.lineStrong : color.line,
                          },
                        ]}
                      >
                        {cell === 1 ? (
                          <View
                            style={[
                              styles.cellFill,
                              {
                                backgroundColor: state.solved ? pieces.ochre : pieces.straw,
                              },
                            ]}
                          />
                        ) : null}

                        {cell === 2 && !state.solved ? (
                          <Svg width={markSize} height={markSize} viewBox="0 0 16 16">
                            <Path
                              d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5"
                              stroke={color.ink4}
                              strokeWidth={1.6}
                              strokeLinecap="round"
                              fill="none"
                            />
                          </Svg>
                        ) : null}

                        {isCursor || isHinted ? (
                          <View
                            pointerEvents="none"
                            style={[styles.cursorRing, { borderColor: color.accent }]}
                          />
                        ) : null}
                      </View>
                    )
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>

      <Completion
        open={showCompletion}
        gameId="weave"
        title={state.title}
        line={`${state.rows}×${state.cols} woven`}
        actionLabel="Next pattern"
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
  frame: {
    gap: CLUE_GUTTER,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  corner: {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingRight: 6,
    paddingBottom: 5,
  },
  cornerText: {
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  colClues: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  colClue: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    paddingBottom: 4,
  },
  rowClues: {
    justifyContent: 'flex-start',
  },
  rowClue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    paddingRight: 6,
  },
  clueNum: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
  },
  grid: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  gridRow: {
    flexDirection: 'row',
  },
  cell: {
    position: 'relative',
    padding: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFill: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  cursorRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 1.5,
  },
  controlsBar: {
    width: '100%',
    maxWidth: 388,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlsSeg: {
    flex: 1,
    minWidth: 0,
  },
  controlsIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
})
