import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  Animated,
  Easing,
  PanResponder,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import Reanimated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import {
  RotateCcw as _RotateCcw,
  Shuffle as _Shuffle,
  Lightbulb as _Lightbulb,
} from 'lucide-react-native'
import {
  createHue,
  findHintPair,
  nextPuzzle,
  restartPuzzle,
  swapTiles,
  type HueState,
} from '@/core/games/hue/engine'
import { radius } from '@/design/tokens'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Completion, GameActionButton, GameControlBar, GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { GlassSurface } from '@/ui/rn/Glass'
import { useCalm, useFeedback, useGameSave, useKeys, useReducedMotion } from '@/ui/rn/hooks'

type LucideSvgIcon = ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
const RotateCcw = _RotateCcw as unknown as LucideSvgIcon
const Shuffle = _Shuffle as unknown as LucideSvgIcon
const Lightbulb = _Lightbulb as unknown as LucideSvgIcon

type HueDifficulty = 'cozy' | 'medium' | 'classic'

const DIFFICULTY_CALM: Record<HueDifficulty, number> = {
  cozy: 0.85,    // 4×4 with top & bottom rows anchored (8 movable tiles)
  medium: 0.55,  // 4×5 with top & bottom rows anchored (12 movable tiles)
  classic: 0.1,  // 5×6 full mosaic
}

/** Highest calm each difficulty may soften to while keeping its board family (see layoutForPuzzle). */
const DIFFICULTY_CALM_MAX: Record<HueDifficulty, number> = {
  cozy: 1,
  medium: 0.71,
  classic: 0.44,
}

/**
 * Your difficulty picks the board; wind-down calm only softens it within that
 * tier (Classic can ease from 5×6 to 5×5 but never turns into Cozy).
 */
function tierCalm(difficulty: HueDifficulty, sessionCalm: number): number {
  const lo = DIFFICULTY_CALM[difficulty]
  const hi = DIFFICULTY_CALM_MAX[difficulty]
  return lo + (hi - lo) * Math.min(1, Math.max(0, sessionCalm))
}

const DIFFICULTY_OPTIONS: readonly { value: HueDifficulty; label: string }[] = [
  { value: 'cozy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'classic', label: 'Hard' },
]

interface HueSave {
  version: 2
  difficulty: HueDifficulty
  state: HueState
  completed: number
}

interface DragRender {
  fromIdx: number
  hoverIdx: number | null
}

interface DragSession {
  fromIdx: number
  startX: number
  startY: number
  dragging: boolean
  hoverIdx: number | null
}

const DRAG_THRESHOLD_PX = 7
const HINT_DURATION_MS = 2250
const TILE_GAP = 3
const BEZEL_PADDING = 5
const BEZEL_BORDER = 1
const BEZEL_INSET = BEZEL_PADDING + BEZEL_BORDER


function isValidSave(value: unknown): value is HueSave {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<HueSave>
  return (
    v.version === 2 &&
    (v.difficulty === 'cozy' || v.difficulty === 'medium' || v.difficulty === 'classic') &&
    !!v.state &&
    typeof v.state.cols === 'number' &&
    typeof v.state.rows === 'number' &&
    Array.isArray(v.state.tiles) &&
    v.state.tiles.length === v.state.cols * v.state.rows &&
    Array.isArray(v.state.targetColors) &&
    Array.isArray(v.state.initialOrder)
  )
}

export function HueScreen({ onExit }: GameScreenProps) {
  const { color } = useTokenColors()
  const reducedMotion = useReducedMotion()
  const { cue, haptic } = useFeedback()

  const [fallback] = useState<HueSave>(() => ({
    version: 2,
    difficulty: 'cozy',
    state: createHue({ seed: Date.now() >>> 0, calm: DIFFICULTY_CALM.cozy }),
    completed: 0,
  }))
  const [rawSave, setSave] = useGameSave<HueSave>('hue', fallback)
  const save = isValidSave(rawSave) ? rawSave : fallback
  const state = save.state
  const difficulty = save.difficulty

  const [paused, setPaused] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [hintIndices, setHintIndices] = useState<[number, number] | null>(null)
  const [showCompletion, setShowCompletion] = useState(state.solved)
  const [dragRender, setDragRender] = useState<DragRender | null>(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const stageSizeRef = useRef(stageSize)

  const hintPulse = useRef(new Animated.Value(0)).current
  const hintAnimRef = useRef<Animated.CompositeAnimation | null>(null)
  const dragRef = useRef<DragSession | null>(null)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // UI-thread Reanimated drag offset (zero ghosting / stale offset trace)
  const dragX = useSharedValue(0)
  const dragY = useSharedValue(0)
  const liftedAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.get() },
      { translateY: dragY.get() },
      { scale: reducedMotion ? 1 : 1.07 },
    ],
  }))

  const stateRef = useRef(state)
  stateRef.current = state
  const difficultyRef = useRef(difficulty)
  const sessionCalm = useCalm()
  const sessionCalmRef = useRef(sessionCalm)
  sessionCalmRef.current = sessionCalm
  difficultyRef.current = difficulty
  const pausedRef = useRef(paused)
  const selectedRef = useRef(selectedIndex)

  const selectTile = useCallback((index: number | null) => {
    selectedRef.current = index
    setSelectedIndex(index)
  }, [])

  const cancelDrag = useCallback(() => {
    dragRef.current = null
    dragX.set(0)
    dragY.set(0)
    setDragRender(null)
  }, [dragX, dragY])

  const handlePauseChange = useCallback(
    (nextPaused: boolean) => {
      pausedRef.current = nextPaused
      if (nextPaused) cancelDrag()
      setPaused(nextPaused)
    },
    [cancelDrag],
  )

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
      hintAnimRef.current?.stop()
    }
  }, [])

  const metrics = useMemo(() => {
    const availW = stageSize.width - BEZEL_INSET * 2
    const availH = stageSize.height - BEZEL_INSET * 2
    const cellFromW = (availW - TILE_GAP * (state.cols - 1)) / state.cols
    const cellFromH = (availH - TILE_GAP * (state.rows - 1)) / state.rows
    const scale = PixelRatio.get()
    const cellSize = Math.max(0, Math.floor(Math.min(cellFromW, cellFromH) * scale) / scale)
    const pitch = cellSize + TILE_GAP
    const gridW = cellSize * state.cols + TILE_GAP * (state.cols - 1)
    const gridH = cellSize * state.rows + TILE_GAP * (state.rows - 1)
    return { cellSize, pitch, gridW, gridH }
  }, [stageSize, state.cols, state.rows])

  const metricsRef = useRef(metrics)
  metricsRef.current = metrics

  const clearHint = useCallback(() => {
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current)
      hintTimerRef.current = null
    }
    hintAnimRef.current?.stop()
    setHintIndices(null)
  }, [])

  const performSwap = useCallback(
    (indexA: number, indexB: number) => {
      const cur = stateRef.current
      const tileA = cur.tiles[indexA]
      const tileB = cur.tiles[indexB]
      if (pausedRef.current || !tileA || !tileB || tileA.pinned || tileB.pinned || indexA === indexB) return

      const next = swapTiles(cur, indexA, indexB)
      if (next === cur) return

      clearHint()
      selectTile(null)
      stateRef.current = next

      setSave((prev) => ({
        version: 2,
        difficulty: difficultyRef.current,
        state: next,
        completed: (isValidSave(prev) ? prev.completed : 0) + (next.solved ? 1 : 0),
      }))

      if (next.solved) {
        cue('chime', 0.9)
        haptic('success')
        const delayMs = reducedMotion ? 180 : 520
        if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
        completionTimerRef.current = setTimeout(() => {
          setShowCompletion(true)
        }, delayMs)
      } else {
        cue('place', 0.85)
        haptic('light')
      }
    },
    [clearHint, selectTile, setSave, cue, haptic, reducedMotion],
  )

  const handleTileSelect = useCallback(
    (index: number) => {
      const cur = stateRef.current
      if (cur.solved || pausedRef.current) return
      const tile = cur.tiles[index]
      if (!tile || tile.pinned) return

      const prevSel = selectedRef.current
      if (prevSel === null) {
        selectTile(index)
        cue('tap', 0.65)
        haptic('light')
      } else if (prevSel === index) {
        selectTile(null)
        cue('tap', 0.4)
      } else {
        performSwap(prevSel, index)
      }
    },
    [performSwap, cue, haptic, selectTile],
  )

  const performSwapRef = useRef(performSwap)
  performSwapRef.current = performSwap
  const handleTileSelectRef = useRef(handleTileSelect)
  handleTileSelectRef.current = handleTileSelect
  const cueRef = useRef(cue)
  cueRef.current = cue
  const hapticRef = useRef(haptic)
  hapticRef.current = haptic

  const handleHint = useCallback(() => {
    if (state.solved || paused) return
    const pair = findHintPair(state)
    if (!pair) return
    clearHint()
    setHintIndices(pair)
    cue('tap', 0.45)
    haptic('light')

    if (reducedMotion) {
      hintPulse.setValue(0.9)
    } else {
      hintPulse.setValue(0)
      const onePulse = Animated.sequence([
        Animated.timing(hintPulse, {
          toValue: 0.92,
          duration: 440,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(hintPulse, {
          toValue: 0.15,
          duration: 660,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
      hintAnimRef.current = Animated.sequence([onePulse, onePulse])
      hintAnimRef.current.start()
    }

    hintTimerRef.current = setTimeout(() => {
      setHintIndices(null)
      hintTimerRef.current = null
    }, HINT_DURATION_MS)
  }, [state, paused, clearHint, cue, haptic, reducedMotion, hintPulse])

  const handleRestart = useCallback(() => {
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }
    clearHint()
    cancelDrag()
    selectTile(null)
    setShowCompletion(false)
    const next = restartPuzzle(stateRef.current)
    stateRef.current = next
    setSave((prev) => ({
      version: 2,
      difficulty: difficultyRef.current,
      state: next,
      completed: isValidSave(prev) ? prev.completed : 0,
    }))
    cue('undo', 0.7)
    haptic('light')
  }, [cancelDrag, clearHint, selectTile, setSave, cue, haptic])

  const handleNextPalette = useCallback(() => {
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }
    clearHint()
    cancelDrag()
    selectTile(null)
    setFocusedIndex(null)
    setShowCompletion(false)
    const next = nextPuzzle(stateRef.current, tierCalm(difficultyRef.current, sessionCalmRef.current))
    stateRef.current = next
    setSave((prev) => ({
      version: 2,
      difficulty: difficultyRef.current,
      state: next,
      completed: isValidSave(prev) ? prev.completed : 0,
    }))
    cue('tap', 0.6)
    haptic('light')
  }, [cancelDrag, clearHint, selectTile, setSave, cue, haptic])

  const changeDifficulty = useCallback(
    (nextDiff: HueDifficulty) => {
      if (nextDiff === difficultyRef.current) return
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current)
        completionTimerRef.current = null
      }
      clearHint()
      cancelDrag()
      selectTile(null)
      setFocusedIndex(null)
      setShowCompletion(false)
      difficultyRef.current = nextDiff
      const next = createHue({
        seed: Date.now() >>> 0,
        calm: tierCalm(nextDiff, sessionCalmRef.current),
        puzzleNumber: stateRef.current.puzzleNumber,
        paletteIndex: stateRef.current.paletteIndex,
      })
      stateRef.current = next
      setSave((prev) => ({
        version: 2,
        difficulty: nextDiff,
        state: next,
        completed: isValidSave(prev) ? prev.completed : 0,
      }))
      cue('tap', 0.55)
      haptic('light')
    },
    [cancelDrag, clearHint, selectTile, setSave, cue, haptic],
  )

  const slotFromLocal = (x: number, y: number): number | null => {
    const { gridW, gridH, pitch, cellSize } = metricsRef.current
    if (x < 0 || x >= gridW || y < 0 || y >= gridH) return null
    const col = Math.floor(x / pitch)
    const row = Math.floor(y / pitch)
    if (x - col * pitch >= cellSize || y - row * pitch >= cellSize) return null
    return row * stateRef.current.cols + col
  }

  const dropTarget = (session: DragSession, dx: number, dy: number): number | null => {
    const over = slotFromLocal(session.startX + dx, session.startY + dy)
    return over !== null && over !== session.fromIdx && !stateRef.current.tiles[over]?.pinned
      ? over
      : null
  }

  const [panResponder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !pausedRef.current && !stateRef.current.solved,
      onPanResponderGrant: (e) => {
        if (pausedRef.current || stateRef.current.solved) return
        const startX = e.nativeEvent.locationX
        const startY = e.nativeEvent.locationY
        const idx = slotFromLocal(startX, startY)
        if (idx === null) {
          dragRef.current = null
          return
        }
        const tile = stateRef.current.tiles[idx]
        if (!tile || tile.pinned) {
          dragRef.current = null
          return
        }

        setFocusedIndex(null)
        dragX.set(0)
        dragY.set(0)
        dragRef.current = {
          fromIdx: idx,
          startX,
          startY,
          dragging: false,
          hoverIdx: null,
        }
      },
      onPanResponderStart: (_, g) => {
        if (g.numberActiveTouches > 1) cancelDrag()
      },
      onPanResponderMove: (_, { dx, dy }) => {
        const session = dragRef.current
        if (!session || pausedRef.current) return
        if (!session.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return

        dragX.set(dx)
        dragY.set(dy)
        const hoverIdx = dropTarget(session, dx, dy)
        if (!session.dragging) {
          session.dragging = true
          selectTile(null)
          cueRef.current('tap', 0.6)
          hapticRef.current('light')
          setDragRender({ fromIdx: session.fromIdx, hoverIdx })
        } else if (session.hoverIdx !== hoverIdx) {
          setDragRender({ fromIdx: session.fromIdx, hoverIdx })
        }
        session.hoverIdx = hoverIdx
      },
      onPanResponderRelease: (_, { dx, dy }) => {
        const session = dragRef.current
        if (!session) return
        cancelDrag()

        if (session.dragging) {
          const target = dropTarget(session, dx, dy)
          if (target !== null) performSwapRef.current(session.fromIdx, target)
        } else {
          handleTileSelectRef.current(session.fromIdx)
        }
      },
      onPanResponderTerminate: cancelDrag,
    }),
  )

  const moveFocus = useCallback(
    (dCol: number, dRow: number) => {
      setFocusedIndex((prev) => {
        if (prev === null) {
          const firstMovable = state.tiles.findIndex((t) => !t.pinned)
          return firstMovable >= 0 ? firstMovable : 0
        }
        const col = Math.min(state.cols - 1, Math.max(0, (prev % state.cols) + dCol))
        const row = Math.min(state.rows - 1, Math.max(0, Math.floor(prev / state.cols) + dRow))
        return row * state.cols + col
      })
    },
    [state.cols, state.rows, state.tiles],
  )

  useKeys(
    {
      ArrowLeft: () => moveFocus(-1, 0),
      ArrowRight: () => moveFocus(1, 0),
      ArrowUp: () => moveFocus(0, -1),
      ArrowDown: () => moveFocus(0, 1),
      Enter: () => focusedIndex !== null && handleTileSelect(focusedIndex),
      ' ': () => focusedIndex !== null && handleTileSelect(focusedIndex),
      Escape: () => {
        cancelDrag()
        selectTile(null)
      },
      h: handleHint,
      H: handleHint,
    },
    !paused && !state.solved,
    false,
  )

  const hintSet = useMemo(
    () => (hintIndices ? new Set<number>(hintIndices) : null),
    [hintIndices],
  )

  const settledStats = useMemo(() => {
    let movable = 0
    let settled = 0
    for (let i = 0; i < state.tiles.length; i++) {
      const t = state.tiles[i]!
      if (!t.pinned) {
        movable++
        if (t.id === i) settled++
      }
    }
    return { settled, movable }
  }, [state.tiles])

  const handleStageLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout
      const prev = stageSizeRef.current
      if (width === prev.width && height === prev.height) return
      stageSizeRef.current = { width, height }
      cancelDrag()
      setStageSize(stageSizeRef.current)
    },
    [cancelDrag],
  )

  const outerCornerRadius = radius.lg - BEZEL_INSET
  const liftedTile = dragRender ? state.tiles[dragRender.fromIdx] : null

  return (
    <GameShell
      gameId="hue"
      score={state.moves}
      commitScore={state.solved}
      stats={[
        { label: 'In place', value: `${settledStats.settled}/${settledStats.movable}` },
        { label: 'Moves', value: state.moves },
      ]}
      paused={paused}
      onPauseChange={handlePauseChange}
      onRestart={handleRestart}
      onExit={onExit}
      controls={
        <View style={styles.bar}>
          <View style={styles.diffRow}>
            {DIFFICULTY_OPTIONS.map((opt) => {
              const active = opt.value === difficulty
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => changeDifficulty(opt.value)}
                  style={[
                    styles.diffChip,
                    {
                      backgroundColor: active ? color.accentWash : 'rgba(255,255,255,0.04)',
                      borderColor: active ? color.accent : color.line,
                    },
                  ]}
                >
                  <Text style={[styles.diffLabel, { color: active ? color.accent : color.ink3 }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <GameControlBar>
            <GameActionButton
              label="Hint"
              icon={<Lightbulb size={16} strokeWidth={1.5} color={hintIndices ? color.accent : color.ink2} />}
              active={hintIndices !== null}
              onPress={handleHint}
              disabled={state.solved}
            />
            <GameActionButton
              label="Reset"
              icon={<RotateCcw size={16} strokeWidth={1.5} color={color.ink2} />}
              onPress={handleRestart}
              disabled={state.moves === 0 && !state.solved && selectedIndex === null && hintIndices === null}
            />
            <GameActionButton
              label="New"
              icon={<Shuffle size={16} strokeWidth={1.5} color={color.ink2} />}
              onPress={handleNextPalette}
            />
          </GameControlBar>
        </View>
      }
    >
      <View style={styles.stage} onLayout={handleStageLayout}>
        {metrics.cellSize > 0 && (
          <View>
            <GlassSurface variant="card" radius={radius.lg} style={styles.board}>
              <View
                style={{
                  width: metrics.gridW,
                  height: metrics.gridH,
                  borderRadius: outerCornerRadius,
                  backgroundColor: color.bg,
                  overflow: 'hidden',
                }}
              >
                {state.tiles.map((tile, idx) => {
                  const col = idx % state.cols
                  const row = Math.floor(idx / state.cols)
                  const isDragging = dragRender?.fromIdx === idx
                  const isDropTarget = dragRender?.hoverIdx === idx
                  const isSelected = selectedIndex === idx
                  const isFocused = focusedIndex === idx
                  const isHinted = hintSet?.has(idx) ?? false

                  const topLeftR = row === 0 && col === 0 ? outerCornerRadius : 6
                  const topRightR = row === 0 && col === state.cols - 1 ? outerCornerRadius : 6
                  const bottomLeftR = row === state.rows - 1 && col === 0 ? outerCornerRadius : 6
                  const bottomRightR =
                    row === state.rows - 1 && col === state.cols - 1 ? outerCornerRadius : 6

                  const showRing = isSelected || isDropTarget || isFocused
                  const ringColor = isSelected || isDropTarget ? color.accent : color.ink2

                  return (
                    <View
                      key={tile.id}
                      pointerEvents="none"
                      style={[
                        styles.tile,
                        {
                          left: col * metrics.pitch,
                          top: row * metrics.pitch,
                          width: metrics.cellSize,
                          height: metrics.cellSize,
                          backgroundColor: tile.color,
                          borderTopLeftRadius: topLeftR,
                          borderTopRightRadius: topRightR,
                          borderBottomLeftRadius: bottomLeftR,
                          borderBottomRightRadius: bottomRightR,
                          borderWidth: showRing ? 2 : 0,
                          borderColor: showRing ? ringColor : 'transparent',
                          opacity: isDragging ? 0.22 : 1,
                        },
                      ]}
                    >
                      {tile.pinned && (
                        <View
                          pointerEvents="none"
                          style={[
                            styles.anchorClasp,
                            { backgroundColor: color.accent, borderColor: color.accentInk },
                          ]}
                        />
                      )}
                      {isHinted && (
                        <Animated.View
                          style={[
                            styles.hintRing,
                            {
                              borderColor: color.ink,
                              borderTopLeftRadius: Math.max(3, topLeftR - 3),
                              borderTopRightRadius: Math.max(3, topRightR - 3),
                              borderBottomLeftRadius: Math.max(3, bottomLeftR - 3),
                              borderBottomRightRadius: Math.max(3, bottomRightR - 3),
                              opacity: hintPulse,
                            },
                          ]}
                        />
                      )}
                    </View>
                  )
                })}
                <View
                  {...panResponder.panHandlers}
                  collapsable={false}
                  accessibilityLabel={`${state.paletteTitle} colour gradient`}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            </GlassSurface>
            {dragRender && liftedTile && (
              <Reanimated.View
                pointerEvents="none"
                style={[
                  styles.liftedTile,
                  {
                    left: BEZEL_INSET + (dragRender.fromIdx % state.cols) * metrics.pitch,
                    top: BEZEL_INSET + Math.floor(dragRender.fromIdx / state.cols) * metrics.pitch,
                    width: metrics.cellSize,
                    height: metrics.cellSize,
                    backgroundColor: liftedTile.color,
                    borderColor: color.accent,
                  },
                  liftedAnimStyle,
                ]}
              />
            )}
          </View>
        )}
      </View>

      <Completion
        open={showCompletion}
        gameId="hue"
        title="Solved"
        line={`${state.paletteTitle} complete`}
        actionLabel="Next palette"
        onAction={handleNextPalette}
      />
    </GameShell>
  )
}

export default HueScreen

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  board: {
    padding: BEZEL_PADDING,
  },
  tile: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liftedTile: {
    position: 'absolute',
    zIndex: 1,
    borderRadius: radius.sm,
    borderWidth: 2,
  },
  anchorClasp: {
    width: 9,
    height: 9,
    borderWidth: 1,
    borderRadius: 2,
    borderCurve: 'continuous',
    transform: [{ rotate: '45deg' }],
  },
  hintRing: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderWidth: 2,
  },
  bar: {
    alignItems: 'center',
    gap: 8,
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  diffChip: {
    height: 28,
    paddingHorizontal: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diffLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
})
