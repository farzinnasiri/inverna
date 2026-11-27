import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { Lightbulb, Shuffle, Undo2 } from 'lucide-react-native'
import { createDim, hint, litCount, nextPuzzle, press, restartPuzzle, type DimState } from '@/core/games/dim/engine'
import { radius } from '@/design/tokens'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Completion, GameActionButton, GameControlBar, GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { GlassSurface } from '@/ui/rn/Glass'
import { useCalm, useFeedback, useGameSave, useKeys, useReducedMotion } from '@/ui/rn/hooks'

interface DimSave {
  version: 1
  state: DimState
  completed: number
  undoStack?: number[][]
}

const BOARD_INSET = 8
const STONE_RADIUS = radius.lg - BOARD_INSET - 1
const COMPLETION_DELAY_MS = 520
const MAX_UNDO = 32
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)

function isValidSave(value: unknown): value is DimSave {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<DimSave>
  if (v.version !== 1 || typeof v.completed !== 'number' || !v.state) return false
  const s = v.state
  if (s.size !== 4 && s.size !== 5) return false
  const n = s.size * s.size
  const isLights = (a: unknown) => Array.isArray(a) && a.length === n && a.every((v) => v === 0 || v === 1)
  // Undo entries are light arrays of the same board; anything else isn't loaded.
  const undoOk = v.undoStack === undefined || (Array.isArray(v.undoStack) && v.undoStack.every(isLights))
  return (
    undoOk &&
    isLights(s.lights) &&
    isLights(s.initialLights) &&
    typeof s.par === 'number' &&
    typeof s.moves === 'number' &&
    typeof s.puzzleNumber === 'number' &&
    typeof s.solved === 'boolean' &&
    typeof s.rngState === 'number'
  )
}

/**
 * One stone. The light fades on and off; a press ripples out to the
 * neighbours a beat after the stone itself (`delay`).
 */
function DimStone({
  lit,
  delay,
  pressedAt,
  hinted,
  size,
  disabled,
  onPress,
  label,
  reduceMotion,
}: {
  lit: boolean
  delay: number
  pressedAt: number
  hinted: boolean
  size: number
  disabled: boolean
  onPress: () => void
  label: string
  reduceMotion: boolean
}) {
  const { color } = useTokenColors()
  const glow = useSharedValue(lit ? 1 : 0)
  const squeeze = useSharedValue(1)
  const ring = useSharedValue(0)

  useEffect(() => {
    if (reduceMotion) {
      glow.set(lit ? 1 : 0)
      return
    }
    glow.set(
      withDelay(delay, withTiming(lit ? 1 : 0, { duration: lit ? 240 : 320, easing: EASE_OUT, reduceMotion: ReduceMotion.System })),
    )
  }, [lit, delay, glow, reduceMotion])

  useEffect(() => {
    if (!pressedAt || reduceMotion) return
    squeeze.set(
      withSequence(
        withTiming(0.92, { duration: 70, easing: EASE_OUT }),
        withTiming(1, { duration: 220, easing: EASE_OUT }),
      ),
    )
  }, [pressedAt, squeeze, reduceMotion])

  useEffect(() => {
    // Rests behind Pause too, not only when the hint is gone (ISS-17).
    if (!hinted || disabled) {
      cancelAnimation(ring)
      ring.set(withTiming(0, { duration: 160 }))
      return
    }
    if (reduceMotion) {
      ring.set(1)
      return
    }
    ring.set(withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true))
    return () => cancelAnimation(ring)
  }, [hinted, disabled, ring, reduceMotion])

  const lightStyle = useAnimatedStyle(() => ({ opacity: glow.get() }))
  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ scale: squeeze.get() }] }))
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.35 + ring.get() * 0.65 * (hinted ? 1 : 0) }))

  const core = Math.round(size * 0.34)

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: size, height: size }}
    >
      <Animated.View
        style={[
          styles.stone,
          { backgroundColor: color.surface2, borderColor: color.line, borderCurve: 'continuous' },
          bodyStyle,
        ]}
      >
        <View style={[styles.pin, { backgroundColor: color.ink4 }]} />
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.light,
            { backgroundColor: color.accentWash, borderColor: color.accent, borderCurve: 'continuous' },
            lightStyle,
          ]}
        >
          <View
            style={[
              styles.core,
              { width: core * 1.9, height: core * 1.9, borderRadius: core, backgroundColor: color.accent, opacity: 0.16 },
            ]}
          />
          <View style={[styles.core, { width: core, height: core, borderRadius: core / 2, backgroundColor: color.accent }]} />
        </Animated.View>
        {hinted ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.ring, { borderColor: color.ink, borderCurve: 'continuous' }, ringStyle]}
          />
        ) : null}
      </Animated.View>
    </Pressable>
  )
}

export function DimScreen({ onExit }: GameScreenProps) {
  const { color } = useTokenColors()
  const calm = useCalm('dim')
  const { cue, haptic } = useFeedback()
  const reduceMotion = useReducedMotion()

  const [fallback] = useState<DimSave>(() => ({
    version: 1,
    state: createDim({ seed: Date.now() >>> 0, calm }),
    completed: 0,
    undoStack: [],
  }))
  const [save, setSave] = useGameSave('dim', fallback, isValidSave)
  const state = save.state
  const undoStack = useMemo(() => save.undoStack ?? [], [save.undoStack])

  const [paused, setPaused] = useState(false)
  const [showCompletion, setShowCompletion] = useState(state.solved)
  const [boardSize, setBoardSize] = useState(0)
  const [hintIndex, setHintIndex] = useState<number | null>(null)
  const [lastPress, setLastPress] = useState<{ index: number; at: number } | null>(null)

  const stateRef = useRef(state)
  stateRef.current = state
  const undoRef = useRef(undoStack)
  undoRef.current = undoStack
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const calmRef = useRef(calm)
  calmRef.current = calm
  const completionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(completionTimer.current), [])

  const commit = useCallback(
    (next: DimState, nextUndo: number[][], countSolve: boolean) => {
      stateRef.current = next
      undoRef.current = nextUndo
      setSave((cur) => {
        const valid = isValidSave(cur) ? cur : fallback
        return { version: 1, state: next, completed: valid.completed + (countSolve ? 1 : 0), undoStack: nextUndo }
      })
    },
    [setSave, fallback],
  )

  const doPress = useCallback(
    (index: number) => {
      if (pausedRef.current) return
      const prev = stateRef.current
      const next = press(prev, index)
      if (next === prev) return
      commit(next, [...undoRef.current.slice(-(MAX_UNDO - 1)), prev.lights.slice()], next.solved)
      setHintIndex(null)
      setLastPress({ index, at: Date.now() })
      if (next.solved) {
        cue('chime', 0.95)
        haptic('complete')
        clearTimeout(completionTimer.current)
        completionTimer.current = setTimeout(() => setShowCompletion(true), COMPLETION_DELAY_MS)
      } else if (litCount(next.lights) < litCount(prev.lights)) {
        cue('place', 0.6)
        haptic('settle')
      } else {
        cue('tap', 0.5)
        haptic('tick')
      }
    },
    [commit, cue, haptic],
  )

  const doUndo = useCallback(() => {
    const s = stateRef.current
    if (pausedRef.current || s.solved || undoRef.current.length === 0) return
    const stack = undoRef.current
    const lights = stack[stack.length - 1]!
    commit({ ...s, lights: lights.slice(), moves: Math.max(0, s.moves - 1), solved: false }, stack.slice(0, -1), false)
    setHintIndex(null)
    setLastPress(null)
    cue('undo', 0.6)
  }, [commit, cue, haptic])

  const doHint = useCallback(() => {
    if (pausedRef.current || stateRef.current.solved) return
    setHintIndex(hint(stateRef.current))
    cue('tap', 0.4)
    haptic('tick')
  }, [cue, haptic])

  const startBoard = useCallback(
    (next: DimState) => {
      clearTimeout(completionTimer.current)
      setShowCompletion(false)
      setHintIndex(null)
      setLastPress(null)
      commit(next, [], false)
    },
    [commit],
  )

  const doRestart = useCallback(() => startBoard(restartPuzzle(stateRef.current)), [startBoard])
  const doNewBoard = useCallback(() => {
    startBoard(createDim({ seed: Date.now() >>> 0, calm: calmRef.current, puzzleNumber: stateRef.current.puzzleNumber }))
    cue('tap', 0.5)
  }, [startBoard, cue])
  const doNext = useCallback(() => startBoard(nextPuzzle(stateRef.current, calmRef.current)), [startBoard])

  useKeys(
    { z: doUndo, Z: doUndo, Backspace: doUndo, h: doHint, H: doHint, Escape: () => setPaused(true), p: () => setPaused(true) },
    !paused && !showCompletion,
    false,
  )

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setBoardSize(Math.floor(Math.min(width, height)))
  }, [])

  const n = state.size
  const track = boardSize - 2 * (BOARD_INSET + 1)
  const gap = Math.max(6, Math.min(9, Math.round(track * 0.022)))
  const cell = (track - gap * (n - 1)) / n
  const lit = litCount(state.lights)

  // Ripple: the pressed stone answers first, its neighbours a beat later.
  const delayFor = (i: number) => {
    if (!lastPress || reduceMotion) return 0
    return i === lastPress.index ? 0 : 70
  }


  return (
    <GameShell
      gameId="dim"
      score={save.completed}
      commitScore={state.solved}
      stats={[
        { label: 'Lit', value: lit },
        { label: 'Moves', value: state.moves },
        { label: 'Target', value: state.par },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={doRestart}
      onNewGame={doNewBoard}
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
            icon={<Lightbulb size={16} strokeWidth={1.6} color={hintIndex !== null ? color.accent : color.ink2} />}
            label="Hint"
            active={hintIndex !== null}
            disabled={paused || state.solved}
            onPress={doHint}
          />
          <GameActionButton
            icon={<Shuffle size={16} strokeWidth={1.6} color={color.ink2} />}
            label="New"
            disabled={paused}
            onPress={doNewBoard}
          />
        </GameControlBar>
      }
    >
      <View style={styles.stage} onLayout={onLayout}>
        {cell > 0 && (
          <GlassSurface variant="card" radius={radius.lg} accent={state.solved} style={styles.chassis}>
            <View
              accessibilityLabel={`Dim ${n} by ${n}, ${lit} lights on, ${state.moves} moves`}
              style={[styles.grid, { width: track, height: track, gap }]}
            >
              {state.lights.map((v, i) => (
                <DimStone
                  key={`${n}-${i}`}
                  lit={v === 1}
                  delay={delayFor(i)}
                  pressedAt={lastPress?.index === i ? lastPress.at : 0}
                  hinted={hintIndex === i}
                  size={cell}
                  disabled={paused || state.solved}
                  onPress={() => doPress(i)}
                  label={`Stone row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}, ${v ? 'lit' : 'dark'}`}
                  reduceMotion={reduceMotion}
                />
              ))}
            </View>
          </GlassSurface>
        )}
      </View>

      <Completion
        open={showCompletion}
        gameId="dim"
        title="All dark"
        line={state.moves <= state.par ? `Done in ${state.moves} taps. Shortest possible.` : `Done in ${state.moves} taps`}
        actionLabel="Next"
        onAction={doNext}
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  stone: {
    flex: 1,
    borderRadius: STONE_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pin: {
    width: 3,
    height: 3,
    borderRadius: 2,
    opacity: 0.55,
  },
  light: {
    borderRadius: STONE_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: {
    position: 'absolute',
  },
  // In the light ink, inset from the edge: on a lit tile the old gold ring
  // vanished into the tile's own gold border (NAT-07).
  ring: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: STONE_RADIUS - 4,
    borderWidth: 2,
  },
})
