import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import {
  RotateCcw as _RotateCcw,
  Shuffle as _Shuffle,
  Sparkles as _Sparkles,
} from 'lucide-react-native'

type LucideSvgIcon = ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
const RotateCcw = _RotateCcw as unknown as LucideSvgIcon
const Shuffle = _Shuffle as unknown as LucideSvgIcon
const Sparkles = _Sparkles as unknown as LucideSvgIcon
import {
  createHue,
  findHintPair,
  hexToOklab,
  nextPuzzle,
  restartPuzzle,
  swapTiles,
  type HueState,
} from '@/core/games/hue/engine'
import { radius } from '@/design/tokens'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Completion, GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { Button, IconButton } from '@/ui/rn/controls'
import { useCalm, useFeedback, useGameSave, useKeys, useReducedMotion } from '@/ui/rn/hooks'

interface HueSave {
  version: 1
  state: HueState
  completed: number
}

interface DragRender {
  fromIdx: number
  dx: number
  dy: number
  hoverIdx: number | null
}

interface DragSession {
  fromIdx: number
  startX: number
  startY: number
  dx: number
  dy: number
  dragging: boolean
  hoverIdx: number | null
}

const DRAG_THRESHOLD_PX = 7
const HINT_DURATION_MS = 2250
const TILE_GAP = 2
const BEZEL_PADDING = 4
const BEZEL_BORDER = 1
const MAX_BOARD_WIDTH = 388

const HOW_TO = [
  'Tap two tiles — or drag one onto another — to swap them until the gradient flows smoothly.',
  'Tiles with a small dot are anchored in place and show where each corner belongs.',
] as const

function isValidSave(value: unknown): value is HueSave {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<HueSave>
  return (
    v.version === 1 &&
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
  const calm = useCalm()
  const reducedMotion = useReducedMotion()
  const { cue, haptic } = useFeedback()

  const [fallback] = useState<HueSave>(() => ({
    version: 1,
    state: createHue({ seed: Date.now() >>> 0, calm }),
    completed: 0,
  }))
  const [rawSave, setSave] = useGameSave<HueSave>('hue', fallback)
  const save = isValidSave(rawSave) ? rawSave : fallback
  const state = save.state

  const [paused, setPaused] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [hintIndices, setHintIndices] = useState<[number, number] | null>(null)
  const [showCompletion, setShowCompletion] = useState(state.solved)
  const [dragRender, setDragRender] = useState<DragRender | null>(null)
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 340, h: 440 })

  const hintPulse = useRef(new Animated.Value(0)).current
  const hintAnimRef = useRef<Animated.CompositeAnimation | null>(null)
  const dragRef = useRef<DragSession | null>(null)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stateRef = useRef(state)
  stateRef.current = state
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const selectedRef = useRef(selectedIndex)
  selectedRef.current = selectedIndex

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
      hintAnimRef.current?.stop()
    }
  }, [])

  // Precompute dark pinned tiles so anchor dots maintain crisp contrast.
  const darkTileIds = useMemo(() => {
    const dark = new Set<number>()
    for (const tile of state.tiles) {
      if (tile.pinned && hexToOklab(tile.color).L < 0.58) {
        dark.add(tile.id)
      }
    }
    return dark
  }, [state.tiles])

  // Compute responsive square cell sizing that fits inside the stage without overflow.
  const metrics = useMemo(() => {
    const inset = (BEZEL_PADDING + BEZEL_BORDER) * 2
    const availW = Math.max(120, Math.min(stageSize.w, MAX_BOARD_WIDTH) - inset)
    const availH = Math.max(120, stageSize.h - inset)
    const cellFromW = (availW - TILE_GAP * (state.cols - 1)) / state.cols
    const cellFromH = (availH - TILE_GAP * (state.rows - 1)) / state.rows
    const cellSize = Math.max(24, Math.floor(Math.min(cellFromW, cellFromH)))
    const pitch = cellSize + TILE_GAP
    const gridW = cellSize * state.cols + TILE_GAP * (state.cols - 1)
    const gridH = cellSize * state.rows + TILE_GAP * (state.rows - 1)
    return { cellSize, pitch, gridW, gridH }
  }, [stageSize.w, stageSize.h, state.cols, state.rows])

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
      if (!tileA || !tileB || tileA.pinned || tileB.pinned || indexA === indexB) return

      const next = swapTiles(cur, indexA, indexB)
      if (next === cur) return

      clearHint()
      setSelectedIndex(null)

      setSave((prev) => ({
        version: 1,
        state: next,
        completed: (isValidSave(prev) ? prev.completed : 0) + (next.solved ? 1 : 0),
      }))

      if (next.solved) {
        cue('chime', 0.9)
        haptic('success')
        const delayMs = reducedMotion ? 180 : 620
        if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
        completionTimerRef.current = setTimeout(() => {
          setShowCompletion(true)
        }, delayMs)
      } else {
        cue('place', 0.85)
        haptic('light')
      }
    },
    [clearHint, setSave, cue, haptic, reducedMotion],
  )

  const handleTileSelect = useCallback(
    (index: number) => {
      const cur = stateRef.current
      if (cur.solved || pausedRef.current) return
      const tile = cur.tiles[index]
      if (!tile || tile.pinned) return

      const prevSel = selectedRef.current
      if (prevSel === null) {
        setSelectedIndex(index)
        cue('tap', 0.65)
        haptic('light')
      } else if (prevSel === index) {
        setSelectedIndex(null)
        cue('tap', 0.4)
      } else {
        performSwap(prevSel, index)
      }
    },
    [performSwap, cue, haptic],
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
    setSelectedIndex(null)
    setShowCompletion(false)
    setSave((prev) => ({
      version: 1,
      state: restartPuzzle(isValidSave(prev) ? prev.state : stateRef.current),
      completed: isValidSave(prev) ? prev.completed : 0,
    }))
    cue('undo', 0.7)
    haptic('light')
  }, [clearHint, setSave, cue, haptic])

  const handleNextPalette = useCallback(() => {
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }
    clearHint()
    setSelectedIndex(null)
    setFocusedIndex(null)
    setShowCompletion(false)
    setSave((prev) => ({
      version: 1,
      state: nextPuzzle(isValidSave(prev) ? prev.state : stateRef.current, calm),
      completed: isValidSave(prev) ? prev.completed : 0,
    }))
    cue('tap', 0.6)
    haptic('light')
  }, [clearHint, setSave, calm, cue, haptic])

  /* --- Touch hit-testing & drag-to-swap via PanResponder ------------------ */

  const slotFromLocal = (x: number, y: number): number | null => {
    const { gridW, gridH, pitch } = metricsRef.current
    const { cols, rows } = stateRef.current
    if (x < 0 || x > gridW || y < 0 || y > gridH) return null
    const col = Math.min(cols - 1, Math.max(0, Math.floor(x / pitch)))
    const row = Math.min(rows - 1, Math.max(0, Math.floor(y / pitch)))
    return row * cols + col
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !pausedRef.current && !stateRef.current.solved,
      onMoveShouldSetPanResponder: () => !pausedRef.current && !stateRef.current.solved,
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
        dragRef.current = {
          fromIdx: idx,
          startX,
          startY,
          dx: 0,
          dy: 0,
          dragging: false,
          hoverIdx: null,
        }
      },
      onPanResponderMove: (_, g) => {
        const session = dragRef.current
        if (!session) return

        const dx = g.dx
        const dy = g.dy
        session.dx = dx
        session.dy = dy

        if (!session.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
          session.dragging = true
          setSelectedIndex(null)
          cueRef.current('tap', 0.6)
          hapticRef.current('light')
        }

        if (session.dragging) {
          const over = slotFromLocal(session.startX + dx, session.startY + dy)
          const hoverIdx =
            over !== null && over !== session.fromIdx && !stateRef.current.tiles[over]?.pinned
              ? over
              : null
          session.hoverIdx = hoverIdx
          setDragRender({ fromIdx: session.fromIdx, dx, dy, hoverIdx })
        }
      },
      onPanResponderRelease: () => {
        const session = dragRef.current
        if (!session) return
        dragRef.current = null
        setDragRender(null)

        if (session.dragging) {
          if (session.hoverIdx !== null && session.hoverIdx !== session.fromIdx) {
            performSwapRef.current(session.fromIdx, session.hoverIdx)
          }
        } else {
          handleTileSelectRef.current(session.fromIdx)
        }
      },
      onPanResponderTerminate: () => {
        dragRef.current = null
        setDragRender(null)
      },
    }),
  ).current

  /* --- Desktop Web keyboard navigation ------------------------------------ */

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
      Escape: () => setSelectedIndex(null),
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

  const handleStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width > 0 && height > 0) {
      setStageSize((prev) =>
        Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1
          ? prev
          : { w: width, h: height },
      )
    }
  }, [])

  const outerCornerRadius = radius.lg - BEZEL_PADDING - BEZEL_BORDER

  return (
    <GameShell
      gameId="hue"
      score={state.moves}
      commitScore={state.solved}
      stats={[
        { label: 'Palette', value: state.puzzleNumber },
        { label: 'Moves', value: state.moves },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={handleRestart}
      onExit={onExit}
      howTo={HOW_TO}
      controls={
        <View style={styles.bar}>
          <Text style={[styles.barTitle, { color: color.ink }]} numberOfLines={1}>
            {state.paletteTitle}
          </Text>
          <View style={styles.barActions}>
            <Button
              variant="quiet"
              size="sm"
              onPress={handleHint}
              disabled={state.solved}
              accessibilityLabel="Hint"
            >
              <Sparkles size={15} strokeWidth={1.5} color={color.ink} />
              <Text style={[styles.hintLabel, { color: color.ink }]}>Hint</Text>
            </Button>
            <IconButton
              label="Reset palette"
              onPress={handleRestart}
              disabled={state.moves === 0 && !state.solved}
            >
              <RotateCcw size={18} strokeWidth={1.5} color={color.ink2} />
            </IconButton>
            <IconButton label="New palette" onPress={handleNextPalette}>
              <Shuffle size={18} strokeWidth={1.5} color={color.ink2} />
            </IconButton>
          </View>
        </View>
      }
    >
      <View style={styles.stage} onLayout={handleStageLayout}>
        <View
          style={[
            styles.board,
            {
              backgroundColor: color.bg,
              borderColor: color.line,
            },
          ]}
        >
          <View
            {...panResponder.panHandlers}
            accessibilityLabel={`${state.paletteTitle} colour gradient`}
            style={[
              styles.grid,
              {
                width: metrics.gridW,
                height: metrics.gridH,
                backgroundColor: color.bg,
              },
            ]}
          >
            {state.tiles.map((tile, idx) => {
              const col = idx % state.cols
              const row = Math.floor(idx / state.cols)
              const isDragging = dragRender?.fromIdx === idx
              const isDropTarget = dragRender?.hoverIdx === idx
              const isSelected = selectedIndex === idx
              const isFocused = focusedIndex === idx
              const isHinted = hintSet?.has(idx) ?? false

              const topLeftR = row === 0 && col === 0 ? outerCornerRadius : 3
              const topRightR = row === 0 && col === state.cols - 1 ? outerCornerRadius : 3
              const bottomLeftR = row === state.rows - 1 && col === 0 ? outerCornerRadius : 3
              const bottomRightR =
                row === state.rows - 1 && col === state.cols - 1 ? outerCornerRadius : 3

              const transform = isDragging && dragRender
                ? [
                    { translateX: dragRender.dx },
                    { translateY: dragRender.dy },
                    { scale: reducedMotion ? 1 : 1.05 },
                  ]
                : isSelected && !reducedMotion
                  ? [{ scale: 1.04 }]
                  : isDropTarget && !reducedMotion
                    ? [{ scale: 0.94 }]
                    : undefined

              const zIndex = isDragging
                ? 12
                : isSelected
                  ? 6
                  : isFocused
                    ? 4
                    : isDropTarget
                      ? 3
                      : 1

              const showRing = isDragging || isSelected || isDropTarget || isFocused
              const ringColor = isDragging || isSelected ? color.ink : color.ink2

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
                      zIndex,
                      transform,
                    },
                  ]}
                >
                  {tile.pinned && (
                    <View
                      style={[
                        styles.anchorDot,
                        {
                          backgroundColor: darkTileIds.has(tile.id)
                            ? color.ink
                            : color.accentInk,
                        },
                      ]}
                    />
                  )}
                  {isHinted && (
                    <Animated.View
                      style={[
                        styles.hintRing,
                        {
                          borderColor: color.ink,
                          borderTopLeftRadius: Math.max(2, topLeftR - 3),
                          borderTopRightRadius: Math.max(2, topRightR - 3),
                          borderBottomLeftRadius: Math.max(2, bottomLeftR - 3),
                          borderBottomRightRadius: Math.max(2, bottomRightR - 3),
                          opacity: hintPulse,
                        },
                      ]}
                    />
                  )}
                </View>
              )
            })}
          </View>
        </View>
      </View>

      <Completion
        open={showCompletion}
        gameId="hue"
        title="Solved"
        line={`In harmony · ${state.paletteTitle}`}
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
    borderRadius: radius.lg,
    borderWidth: BEZEL_BORDER,
  },
  grid: {
    position: 'relative',
  },
  tile: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  anchorDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.85,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    width: '100%',
    maxWidth: MAX_BOARD_WIDTH,
    alignSelf: 'center',
  },
  barTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  barActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  hintLabel: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
})
