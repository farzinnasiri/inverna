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
import { Shuffle, Undo2 } from 'lucide-react-native'
import {
  canSlideTile,
  createDrift,
  inPlaceCount,
  isSolved,
  moveDirection,
  nextPuzzle,
  restartPuzzle,
  slideTile,
  type Direction,
  type DriftState,
} from '@/core/games/drift/engine'
import { radius } from '@/design/tokens'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Completion, GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { Button } from '@/ui/rn/controls'
import { useCalm, useFeedback, useGameSave, useKeys, useReducedMotion } from '@/ui/rn/hooks'

interface DriftUndoEntry {
  tiles: number[]
  moves: number
}

interface DriftSave {
  version: 1
  state: DriftState
  completed: number
  undoStack?: DriftUndoEntry[]
}

interface PositionedTile {
  value: number
  index: number
  row: number
  col: number
  home: boolean
  movable: boolean
}

const COMPLETION_DELAY_MS = 460
const MAX_UNDO = 24
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)

function isValidSave(value: unknown): value is DriftSave {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<DriftSave>
  if (v.version !== 1 || typeof v.completed !== 'number' || !v.state) return false
  const s = v.state
  const sizeValid = s.size === 3 || s.size === 4
  if (!sizeValid) return false
  const len = s.size * s.size
  return (
    Array.isArray(s.tiles) &&
    s.tiles.length === len &&
    Array.isArray(s.initialTiles) &&
    s.initialTiles.length === len &&
    typeof s.moves === 'number' &&
    typeof s.puzzleNumber === 'number' &&
    typeof s.solved === 'boolean' &&
    typeof s.rngState === 'number'
  )
}

function DriftPlateView({
  tile,
  size,
  cellSize,
  gap,
  reduceMotion,
}: {
  tile: PositionedTile
  size: 3 | 4
  cellSize: number
  gap: number
  reduceMotion: boolean
}) {
  const { color } = useTokenColors()
  const targetX = tile.col * (cellSize + gap)
  const targetY = tile.row * (cellSize + gap)

  const posX = useRef(new Animated.Value(targetX)).current
  const posY = useRef(new Animated.Value(targetY)).current
  const prevMetricRef = useRef({ cellSize, gap, size })
  const prevCoordRef = useRef({ row: tile.row, col: tile.col })

  useEffect(() => {
    const metricChanged =
      prevMetricRef.current.cellSize !== cellSize ||
      prevMetricRef.current.gap !== gap ||
      prevMetricRef.current.size !== size
    const coordChanged =
      prevCoordRef.current.row !== tile.row || prevCoordRef.current.col !== tile.col

    prevMetricRef.current = { cellSize, gap, size }
    prevCoordRef.current = { row: tile.row, col: tile.col }

    if (metricChanged || reduceMotion || !coordChanged) {
      posX.setValue(targetX)
      posY.setValue(targetY)
      return
    }

    Animated.parallel([
      Animated.timing(posX, {
        toValue: targetX,
        duration: 160,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(posY, {
        toValue: targetY,
        duration: 160,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start()
  }, [targetX, targetY, cellSize, gap, size, tile.row, tile.col, reduceMotion, posX, posY])

  const fontSize =
    size === 3
      ? Math.max(24, Math.min(40, Math.round(cellSize * 0.38)))
      : Math.max(20, Math.min(32, Math.round(cellSize * 0.37)))

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.tileWrap,
        {
          width: cellSize,
          height: cellSize,
          transform: [{ translateX: posX }, { translateY: posY }],
        },
      ]}
    >
      <View
        style={[
          styles.plate,
          {
            backgroundColor: color.surface2,
            borderColor: tile.home ? color.accentDim : color.line,
          },
        ]}
      >
        {tile.home ? (
          <View style={[styles.homeDot, { backgroundColor: color.accent }]} />
        ) : null}
        <Text style={[styles.plateNum, { color: color.ink, fontSize }]}>{tile.value}</Text>
      </View>
    </Animated.View>
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

export function DriftScreen({ onExit }: GameScreenProps) {
  const { color } = useTokenColors()
  const calm = useCalm()
  const { cue, haptic } = useFeedback()
  const reduceMotion = useReducedMotion()

  const [fallback] = useState<DriftSave>(() => ({
    version: 1,
    state: createDrift({ seed: Date.now() >>> 0, calm }),
    completed: 0,
    undoStack: [],
  }))
  const [rawSave, setSave] = useGameSave<DriftSave>('drift', fallback)
  const save = isValidSave(rawSave) ? rawSave : fallback
  const state = save.state
  const undoStack = useMemo(() => save.undoStack ?? [], [save.undoStack])

  const [paused, setPaused] = useState(false)
  const [showCompletion, setShowCompletion] = useState(state.solved)
  const [boardSize, setBoardSize] = useState(320)

  const stateRef = useRef(state)
  stateRef.current = state
  const undoStackRef = useRef(undoStack)
  undoStackRef.current = undoStack
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const calmRef = useRef(calm)
  calmRef.current = calm
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    }
  }, [])

  const applyTransition = useCallback(
    (next: DriftState) => {
      const prev = stateRef.current
      if (next === prev) return

      const prevPlaced = inPlaceCount(prev.tiles)
      const nextPlaced = inPlaceCount(next.tiles)

      const nextUndo: DriftUndoEntry[] = [
        ...undoStackRef.current.slice(-(MAX_UNDO - 1)),
        { tiles: prev.tiles.slice(), moves: prev.moves },
      ]

      stateRef.current = next
      undoStackRef.current = nextUndo
      setSave((cur) => {
        const valid = isValidSave(cur) ? cur : fallback
        return {
          version: 1,
          state: next,
          completed: next.solved && !prev.solved ? valid.completed + 1 : valid.completed,
          undoStack: nextUndo,
        }
      })

      if (next.solved) {
        cue('chime', 0.95)
        haptic('success')
        if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
        completionTimerRef.current = setTimeout(() => {
          setShowCompletion(true)
        }, COMPLETION_DELAY_MS)
      } else if (nextPlaced > prevPlaced) {
        cue('place', 0.72)
        haptic('light')
      } else {
        cue('tap', 0.55)
        haptic('light')
      }
    },
    [cue, haptic, setSave, fallback],
  )

  const doSlideIndex = useCallback(
    (index: number) => {
      if (pausedRef.current) return
      applyTransition(slideTile(stateRef.current, index))
    },
    [applyTransition],
  )

  const doMoveDir = useCallback(
    (dir: Direction) => {
      if (pausedRef.current) return
      applyTransition(moveDirection(stateRef.current, dir))
    },
    [applyTransition],
  )

  const doUndo = useCallback(() => {
    if (pausedRef.current || stateRef.current.solved) return
    const stack = undoStackRef.current
    if (stack.length === 0) return

    const last = stack[stack.length - 1]!
    const remaining = stack.slice(0, -1)
    const prev = stateRef.current
    const restored: DriftState = {
      ...prev,
      tiles: last.tiles.slice(),
      moves: last.moves,
      solved: isSolved(last.tiles),
    }

    stateRef.current = restored
    undoStackRef.current = remaining
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: restored,
        completed: valid.completed,
        undoStack: remaining,
      }
    })
    cue('undo', 0.65)
    haptic('light')
  }, [cue, haptic, setSave, fallback])

  const doRestartCurrent = useCallback(() => {
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    setShowCompletion(false)
    const restarted = restartPuzzle(stateRef.current)
    stateRef.current = restarted
    undoStackRef.current = []
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: restarted,
        completed: valid.completed,
        undoStack: [],
      }
    })
    cue('undo', 0.65)
    haptic('light')
  }, [cue, haptic, setSave, fallback])

  const doShuffle = useCallback(() => {
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    setShowCompletion(false)
    const fresh = createDrift({
      seed: Date.now() >>> 0,
      calm: calmRef.current,
      puzzleNumber: stateRef.current.puzzleNumber,
    })
    stateRef.current = fresh
    undoStackRef.current = []
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: fresh,
        completed: valid.completed,
        undoStack: [],
      }
    })
    cue('tap', 0.55)
    haptic('light')
  }, [cue, haptic, setSave, fallback])

  const doNextPuzzle = useCallback(() => {
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    setShowCompletion(false)
    const next = nextPuzzle(stateRef.current, calmRef.current)
    stateRef.current = next
    undoStackRef.current = []
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: next,
        completed: valid.completed,
        undoStack: [],
      }
    })
    cue('tap', 0.55)
    haptic('light')
  }, [cue, haptic, setSave, fallback])

  const handleStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    const next = Math.floor(Math.min(width, height, 392))
    if (next > 80) setBoardSize(next)
  }, [])

  const pad = Math.max(8, Math.min(10, Math.round(boardSize * 0.025)))
  const gap = Math.max(6, Math.min(8, Math.round(boardSize * 0.02)))
  const trackSize = Math.max(60, boardSize - pad * 2 - 2)
  const cellSize = (trackSize - gap * (state.size - 1)) / state.size

  const trackSizeRef = useRef(trackSize)
  trackSizeRef.current = trackSize
  const doSlideIndexRef = useRef(doSlideIndex)
  doSlideIndexRef.current = doSlideIndex
  const doMoveDirRef = useRef(doMoveDir)
  doMoveDirRef.current = doMoveDir

  const gestureStartRef = useRef({ x: 0, y: 0, swiped: false })

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        gestureStartRef.current = {
          x: e.nativeEvent.locationX,
          y: e.nativeEvent.locationY,
          swiped: false,
        }
      },
      onPanResponderMove: (_, g) => {
        if (gestureStartRef.current.swiped) return
        const ax = Math.abs(g.dx)
        const ay = Math.abs(g.dy)
        if (Math.max(ax, ay) >= 26) {
          gestureStartRef.current.swiped = true
          const dir: Direction =
            ax > ay ? (g.dx > 0 ? 'right' : 'left') : g.dy > 0 ? 'down' : 'up'
          doMoveDirRef.current(dir)
        }
      },
      onPanResponderRelease: (_, g) => {
        if (gestureStartRef.current.swiped) return
        const ax = Math.abs(g.dx)
        const ay = Math.abs(g.dy)
        if (Math.max(ax, ay) >= 18) {
          const dir: Direction =
            ax > ay ? (g.dx > 0 ? 'right' : 'left') : g.dy > 0 ? 'down' : 'up'
          doMoveDirRef.current(dir)
          return
        }
        const ts = trackSizeRef.current
        if (ts <= 0) return
        const size = stateRef.current.size
        const col = Math.min(size - 1, Math.max(0, Math.floor((gestureStartRef.current.x / ts) * size)))
        const row = Math.min(size - 1, Math.max(0, Math.floor((gestureStartRef.current.y / ts) * size)))
        doSlideIndexRef.current(row * size + col)
      },
    }),
  ).current

  useKeys(
    {
      ArrowUp: () => doMoveDir('up'),
      w: () => doMoveDir('up'),
      W: () => doMoveDir('up'),
      ArrowDown: () => doMoveDir('down'),
      s: () => doMoveDir('down'),
      S: () => doMoveDir('down'),
      ArrowLeft: () => doMoveDir('left'),
      a: () => doMoveDir('left'),
      A: () => doMoveDir('left'),
      ArrowRight: () => doMoveDir('right'),
      d: () => doMoveDir('right'),
      D: () => doMoveDir('right'),
      z: doUndo,
      Z: doUndo,
      Backspace: doUndo,
      Escape: () => setPaused(true),
      p: () => setPaused(true),
      P: () => setPaused(true),
    },
    !paused && !showCompletion,
    false,
  )

  useKeys(
    {
      p: () => setPaused(false),
      P: () => setPaused(false),
    },
    paused,
    false,
  )

  const totalTiles = state.size * state.size - 1
  const placed = useMemo(() => inPlaceCount(state.tiles), [state.tiles])

  const slots = useMemo(
    () => Array.from({ length: state.size * state.size }, (_, i) => i),
    [state.size],
  )

  const positionedTiles = useMemo<PositionedTile[]>(() => {
    const out: PositionedTile[] = []
    for (let index = 0; index < state.tiles.length; index++) {
      const value = state.tiles[index]!
      if (value === 0) continue
      out.push({
        value,
        index,
        row: Math.floor(index / state.size),
        col: index % state.size,
        home: value === index + 1,
        movable: canSlideTile(state, index),
      })
    }
    out.sort((a, b) => a.value - b.value)
    return out
  }, [state])

  const howTo = useMemo(
    () => [
      'Tap any tile in the same row or column as the open space to slide the line smoothly toward it.',
      'You can also swipe anywhere on the board or use arrow keys and WASD.',
      `Order the numbered plates from 1 to ${totalTiles}. A quiet brass dot lights when a plate rests at home.`,
    ],
    [totalTiles],
  )

  return (
    <GameShell
      gameId="drift"
      score={state.moves}
      commitScore={state.solved}
      stats={[
        { label: 'Moves', value: state.moves },
        { label: 'Placed', value: `${placed}/${totalTiles}` },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={doRestartCurrent}
      onExit={onExit}
      howTo={howTo}
      controls={
        <View style={styles.controlsRow}>
          <Button
            variant="quiet"
            size="sm"
            onPress={doUndo}
            disabled={undoStack.length === 0 || state.solved}
            accessibilityLabel="Undo"
          >
            <Icon as={Undo2} size={15} color={color.ink} />
            <Text style={[styles.ctrlLabel, { color: color.ink }]}>Undo</Text>
          </Button>
          <Button
            variant="quiet"
            size="sm"
            onPress={doShuffle}
            accessibilityLabel="Shuffle"
          >
            <Icon as={Shuffle} size={15} color={color.ink} />
            <Text style={[styles.ctrlLabel, { color: color.ink }]}>Shuffle</Text>
          </Button>
        </View>
      }
    >
      <View style={styles.stage} onLayout={handleStageLayout}>
        <View
          style={[
            styles.board,
            {
              width: boardSize,
              height: boardSize,
              padding: pad,
              backgroundColor: color.surface1,
              borderColor: state.solved ? color.accentDim : color.line,
            },
          ]}
        >
          <View
            {...panResponder.panHandlers}
            accessible
            accessibilityLabel={`Drift ${state.size} by ${state.size} sliding puzzle, ${placed} of ${totalTiles} tiles in place, ${state.moves} moves`}
            style={[styles.track, { width: trackSize, height: trackSize }]}
          >
            {slots.map((slot) => {
              const r = Math.floor(slot / state.size)
              const c = slot % state.size
              const isTerminal = slot === slots.length - 1
              return (
                <View
                  key={slot}
                  pointerEvents="none"
                  style={[
                    styles.slot,
                    {
                      width: cellSize,
                      height: cellSize,
                      left: c * (cellSize + gap),
                      top: r * (cellSize + gap),
                      backgroundColor: color.bg,
                      borderColor: color.line,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.slotPin,
                      {
                        backgroundColor: state.solved && isTerminal ? color.accent : color.ink4,
                        opacity: state.solved && isTerminal ? 1 : 0.55,
                      },
                    ]}
                  />
                </View>
              )
            })}

            {positionedTiles.map((tile) => (
              <DriftPlateView
                key={`${state.size}-${tile.value}`}
                tile={tile}
                size={state.size}
                cellSize={cellSize}
                gap={gap}
                reduceMotion={reduceMotion}
              />
            ))}
          </View>
        </View>
      </View>

      <Completion
        open={showCompletion}
        gameId="drift"
        title="In place"
        line={`${state.moves} ${state.moves === 1 ? 'move' : 'moves'}`}
        actionLabel="Next"
        onAction={doNextPuzzle}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    position: 'relative',
  },
  slot: {
    position: 'absolute',
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotPin: {
    width: 3,
    height: 3,
    borderRadius: 2,
  },
  tileWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 2,
  },
  plate: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  plateNum: {
    fontWeight: '500',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 44,
  },
  ctrlLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
})
