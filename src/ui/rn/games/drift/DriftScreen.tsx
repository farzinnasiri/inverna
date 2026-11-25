import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { Shuffle, Undo2 } from 'lucide-react-native'
import {
  createDrift,
  inPlaceCount,
  isSolvable,
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
import { Completion, GameActionButton, GameControlBar, GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { GlassSurface } from '@/ui/rn/Glass'
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
  row: number
  col: number
  home: boolean
}

const BOARD_INSET = 8
const TILE_RADIUS = radius.lg - BOARD_INSET - 1
const COMPLETION_DELAY_MS = 460
const MAX_UNDO = 24
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)

/** A real tile permutation 0..n-1 that can still be solved. */
function isBoard(tiles: unknown, size: 3 | 4): tiles is number[] {
  const len = size * size
  if (!Array.isArray(tiles) || tiles.length !== len) return false
  const seen = new Set(tiles)
  if (seen.size !== len) return false
  for (let i = 0; i < len; i++) if (!seen.has(i)) return false
  return isSolvable(tiles, size)
}

function isValidSave(value: unknown): value is DriftSave {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<DriftSave>
  if (v.version !== 1 || typeof v.completed !== 'number' || !v.state) return false
  const s = v.state
  const sizeValid = s.size === 3 || s.size === 4
  if (!sizeValid) return false
  return (
    isBoard(s.tiles, s.size) &&
    isBoard(s.initialTiles, s.size) &&
    (v.undoStack === undefined || Array.isArray(v.undoStack)) &&
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
            borderCurve: 'continuous',
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

export function DriftScreen({ onExit }: GameScreenProps) {
  const { color } = useTokenColors()
  const calm = useCalm('drift')
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
  const undoStack = useMemo(
    () =>
      (save.undoStack ?? []).filter(
        (u) => u && typeof u.moves === 'number' && isBoard(u.tiles, state.size),
      ),
    [save.undoStack, state.size],
  )

  const [paused, setPaused] = useState(false)
  const [showCompletion, setShowCompletion] = useState(state.solved)
  const [boardSize, setBoardSize] = useState(0)

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
    setBoardSize(Math.floor(Math.min(width, height)))
  }, [])

  const trackSize = boardSize - 2 * (BOARD_INSET + 1)
  const gap = Math.max(6, Math.min(8, Math.round(trackSize * 0.02)))
  const cellSize = (trackSize - gap * (state.size - 1)) / state.size

  const doMoveDirRef = useRef(doMoveDir)
  doMoveDirRef.current = doMoveDir

  const [panResponder] = useState(() => {
    let direction: Direction
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => {
        const ax = Math.abs(g.dx)
        const ay = Math.abs(g.dy)
        if (pausedRef.current || stateRef.current.solved || Math.max(ax, ay) <= 14) return false

        // PanResponder zeroes dx/dy when it takes over from the tile press.
        direction = ax > ay ? (g.dx > 0 ? 'right' : 'left') : g.dy > 0 ? 'down' : 'up'
        return true
      },
      onPanResponderGrant: () => doMoveDirRef.current(direction),
    })
  })

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
        row: Math.floor(index / state.size),
        col: index % state.size,
        home: value === index + 1,
      })
    }
    out.sort((a, b) => a.value - b.value)
    return out
  }, [state])


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
      controls={
        <GameControlBar>
          <GameActionButton
            icon={<Undo2 size={16} strokeWidth={1.6} color={color.ink2} />}
            label="Undo"
            disabled={paused || state.solved || undoStack.length === 0}
            onPress={doUndo}
          />
          <GameActionButton
            icon={<Shuffle size={16} strokeWidth={1.6} color={color.ink2} />}
            label="Shuffle"
            disabled={paused || state.solved}
            onPress={doShuffle}
          />
        </GameControlBar>
      }
    >
      <View style={styles.stage} onLayout={handleStageLayout}>
        {cellSize > 0 && (
          <GlassSurface variant="card" radius={radius.lg} accent={state.solved} style={styles.chassis}>
            <View
              {...panResponder.panHandlers}
              collapsable={false}
              accessibilityLabel={`Drift ${state.size} by ${state.size} sliding puzzle, ${placed} of ${totalTiles} tiles in place, ${state.moves} moves`}
              style={[styles.track, { width: trackSize, height: trackSize }]}
            >
              {slots.map((slot) => {
                const r = Math.floor(slot / state.size)
                const c = slot % state.size
                const value = state.tiles[slot]!
                const isTerminal = slot === slots.length - 1
                return (
                  <Pressable
                    key={slot}
                    accessible={value !== 0}
                    aria-hidden={value === 0}
                    focusable={value !== 0}
                    accessibilityRole="button"
                    accessibilityLabel={`Slide tile ${value}`}
                    disabled={paused || state.solved}
                    onPress={() => doSlideIndex(slot)}
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
                      pointerEvents="none"
                      style={[
                        styles.slotPin,
                        {
                          backgroundColor: state.solved && isTerminal ? color.accent : color.ink4,
                          opacity: state.solved && isTerminal ? 1 : 0.55,
                        },
                      ]}
                    />
                  </Pressable>
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
          </GlassSurface>
        )}
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
  chassis: {
    padding: BOARD_INSET,
  },
  track: {
    position: 'relative',
  },
  slot: {
    position: 'absolute',
    borderRadius: TILE_RADIUS,
    borderCurve: 'continuous',
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
    borderRadius: TILE_RADIUS,
    borderCurve: 'continuous',
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
})
