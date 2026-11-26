import { memo, useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { PanResponder, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import Svg, { G, Path, Rect } from 'react-native-svg'
import {
  createChime,
  launchBall,
  nextLevel,
  nudgePaddle,
  restartLevel,
  setPaddleX,
  stripEphemeralForSave,
  tickChime,
  type ChimeState,
} from '@/core/games/chime/engine'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Completion, GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { GlassSurface } from '@/ui/rn/Glass'
import { Segmented } from '@/ui/rn/controls'
import { gameDoor } from '@/ui/copy'
import { isNumber, isOneOf, isRecord } from '@/core/decode'
import { useCalm, useFeedback, useGameLoop, useGameSave, useKeys, useResponsiveLayout } from '@/ui/rn/hooks'

type ChimeMode = 'endless' | 'classic'
const MODE_OPTIONS: readonly { value: ChimeMode; label: string }[] = [
  { value: 'endless', label: gameDoor.endless },
  { value: 'classic', label: gameDoor.classic },
]

interface ChimeSave {
  version: 1
  /** Endless flows straight into the next wall; Classic stops to show each cleared wall. */
  mode?: ChimeMode
  state: ChimeState | null
  bestScore: number
  boardsCleared: number
  plays: number
}

interface UiMeta {
  levelNumber: number
  patternName: string
  blocksRemaining: number
  score: number
  solved: boolean
}

/** The save around the wall; the wall itself is checked on load (isValidChimeState). */
function isValidSave(v: unknown): v is ChimeSave {
  return (
    isRecord(v) &&
    v.version === 1 &&
    isNumber(v.bestScore) &&
    isNumber(v.boardsCleared) &&
    isNumber(v.plays) &&
    (v.mode === undefined || isOneOf(['endless', 'classic'])(v.mode))
  )
}

const DEFAULT_SAVE: ChimeSave = {
  version: 1,
  state: null,
  bestScore: 0,
  boardsCleared: 0,
  plays: 1,
}


const KEY_NUDGE_STEP = 0.055
const TAP_DRAG_THRESHOLD_PX = 6

function isValidChimeState(v: unknown): v is ChimeState {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<ChimeState>
  return (
    typeof s.levelIndex === 'number' &&
    typeof s.levelNumber === 'number' &&
    typeof s.patternName === 'string' &&
    Array.isArray(s.bricks) &&
    typeof s.paddleX === 'number' &&
    typeof s.paddleWidth === 'number' &&
    typeof s.paddleY === 'number' &&
    typeof s.paddleHeight === 'number' &&
    Boolean(s.ball) &&
    typeof s.ball?.x === 'number' &&
    typeof s.ball?.y === 'number' &&
    typeof s.ball?.radius === 'number' &&
    typeof s.ball?.attached === 'boolean' &&
    Array.isArray(s.shards) &&
    Array.isArray(s.rings) &&
    typeof s.score === 'number' &&
    typeof s.bricksBroken === 'number' &&
    typeof s.boardsCleared === 'number' &&
    typeof s.solved === 'boolean' &&
    typeof s.rngState === 'number' &&
    typeof s.nextId === 'number'
  )
}

function extractMeta(state: ChimeState): UiMeta {
  return {
    levelNumber: state.levelNumber,
    patternName: state.patternName,
    blocksRemaining: state.bricks.length,
    score: state.score,
    solved: state.solved,
  }
}

const BRICK_COLORS = {
  ochre: '#8b7148',
  clay: '#815849',
  stone: '#53616f',
  sage: '#50695e',
  rosewood: '#685468',
  bone: '#797770',
  straw: '#77745f',
}

const BrickWall = memo(function BrickWall({ bricks, w, h, accent }: {
  bricks: ChimeState['bricks']
  version: number
  w: number
  h: number
  accent: string
}) {
  const brickRadius = Math.max(2, Math.min(4, Math.min(w, h) * 0.008))
  return (
    <Svg width={w} height={h} style={styles.art}>
      {bricks.map((brick) => {
        const bx = brick.x * w
        const by = brick.y * h
        const bw = brick.w * w
        const bh = brick.h * h
        const accentTone = brick.color === 'ochre' ? '#b39b73' : accent
        const notchW = Math.max(8, bw * 0.38)
        const notchH = Math.max(2, Math.min(3, bh * 0.16))

        return (
          <G key={`b-${brick.id}`}>
            <Rect
              x={bx}
              y={by}
              width={bw}
              height={bh}
              rx={brickRadius}
              fill={BRICK_COLORS[brick.color]}
            />
            <Rect
              x={bx + 0.5}
              y={by + 0.5}
              width={Math.max(1, bw - 1)}
              height={Math.max(1, bh - 1)}
              rx={Math.max(1, brickRadius - 0.5)}
              fill="none"
              stroke="#c9b596"
              strokeOpacity={0.11}
              strokeWidth={1}
            />

            {/* Reinforced hp:2 brass double-border + center bar */}
            {brick.hp === 2 ? (
              <>
                <Rect
                  x={bx + 2.25}
                  y={by + 2.25}
                  width={Math.max(1, bw - 4.5)}
                  height={Math.max(1, bh - 4.5)}
                  rx={Math.max(1, brickRadius - 1.5)}
                  fill="none"
                  stroke={accentTone}
                  strokeOpacity={0.62}
                  strokeWidth={1}
                />
                <Rect
                  x={bx + (bw - notchW) * 0.5}
                  y={by + (bh - notchH) * 0.5}
                  width={notchW}
                  height={notchH}
                  rx={notchH * 0.5}
                  fill={accentTone}
                  fillOpacity={0.82}
                />
              </>
            ) : brick.cracked ? (
              /* Crisp hairline fracture line after first hit */
              <Path
                d={`M${(bx + bw * 0.34).toFixed(1)} ${(by + 1.5).toFixed(1)}L${(bx + bw * 0.49).toFixed(1)} ${(by + bh * 0.52).toFixed(1)}L${(bx + bw * 0.42).toFixed(1)} ${(by + bh * 0.58).toFixed(1)}L${(bx + bw * 0.62).toFixed(1)} ${(by + bh - 1.5).toFixed(1)}`}
                fill="none"
                stroke="#000000"
                strokeOpacity={0.72}
                strokeWidth={1.3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </G>
        )
      })}
    </Svg>
  )
}, (prev, next) => (
  prev.version === next.version && prev.w === next.w && prev.h === next.h && prev.accent === next.accent
))

function motionFrame(state: ChimeState) {
  return {
    x: state.ball.x, y: state.ball.y, paddle: state.paddleX,
    angle: state.ball.aimAngle, attached: state.ball.attached, solved: state.solved,
  }
}

export function ChimeScreen({ onExit }: GameScreenProps) {
  const { isCompact } = useResponsiveLayout()
  const calm = useCalm('chime')
  const { cue, haptic } = useFeedback()
  const tokens = useTokenColors()
  const { color, pieces } = tokens
  const [saved, setSaved] = useGameSave('chime', DEFAULT_SAVE, isValidSave)

  const initialStateRef = useRef<ChimeState | null>(null)
  if (initialStateRef.current === null) {
    initialStateRef.current = isValidChimeState(saved.state)
      ? stripEphemeralForSave(saved.state)
      : createChime({
          seed: Date.now() >>> 0,
          calm,
          boardsCleared: saved.boardsCleared,
        })
  }

  const stateRef = useRef<ChimeState>(initialStateRef.current)
  const [uiMeta, setUiMeta] = useState<UiMeta>(() => extractMeta(initialStateRef.current!))
  const [paused, setPaused] = useState(false)
  const [started, setStarted] = useState(false)
  const playing = started && !paused
  // After a wall clears and its debris has fallen, stop the frame loop and the
  // save timer until the next wall starts.
  // A save of a cleared wall loads settled, or the loop would wait for debris that's gone (ISS-09).
  const [settled, setSettled] = useState(() => initialStateRef.current!.solved)
  const mode: ChimeMode = saved.mode ?? 'endless'
  const running = playing && !settled
  const [courtSize, setCourtSize] = useState({ w: 0, h: 0 })
  const [wallVersion, setWallVersion] = useState(0)
  const frame = useSharedValue(motionFrame(initialStateRef.current))
  const saveDirty = useRef(false)

  const courtWidthRef = useRef(0)
  const railWidthRef = useRef(0)
  const [railWidth, setRailWidth] = useState(0)
  const gestureRef = useRef<{
    width: number
    startX: number
    moved: boolean
    wasAttached: boolean
  } | null>(null)

  const playingRef = useRef(playing)
  playingRef.current = playing
  const calmRef = useRef(calm)
  calmRef.current = calm

  const updateMotion = useCallback(() => {
    frame.value = motionFrame(stateRef.current)
  }, [frame])

  const syncUiMeta = useCallback((next: ChimeState) => {
    const m = extractMeta(next)
    setUiMeta((prev) =>
      prev.levelNumber === m.levelNumber &&
      prev.patternName === m.patternName &&
      prev.blocksRemaining === m.blocksRemaining &&
      prev.score === m.score &&
      prev.solved === m.solved
        ? prev
        : m,
    )
  }, [])

  const persist = useCallback(
    (nextState: ChimeState, incrementPlays = false) => {
      saveDirty.current = false
      const stripped = stripEphemeralForSave(nextState)
      setSaved((prev) => ({
        ...prev,
        version: 1,
        state: stripped,
        bestScore: Math.max(prev.bestScore, stripped.score),
        boardsCleared: Math.max(prev.boardsCleared, stripped.boardsCleared),
        plays: incrementPlays ? prev.plays + 1 : prev.plays,
      }))
    },
    [setSaved],
  )

  useEffect(() => {
    if (uiMeta.solved && saveDirty.current) persist(stateRef.current)
  }, [uiMeta.solved, persist])

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      if (saveDirty.current) persist(stateRef.current)
    }, 2000)
    return () => clearInterval(timer)
  }, [running, persist])

  // Simulate on JS and send only the moving pieces to Reanimated.
  useGameLoop(
    useCallback(
      (dtMs: number) => {
        if (!playingRef.current) return
        const prev = stateRef.current
        const next = tickChime(prev, dtMs, calmRef.current)
        if (next === prev) return
        stateRef.current = next
        if (next.bricks !== prev.bricks) {
          saveDirty.current = true
          setWallVersion((version) => version + 1)
        }

        if (next.clearEventId > prev.clearEventId) {
          cue('chime', 0.85)
          haptic('complete')
          syncUiMeta(next)
        } else if (next.breakEventId > prev.breakEventId) {
          // Bricks break on their own: heard, not felt (only your paddle and a cleared wall are).
          cue('clear', 0.65)
          syncUiMeta(next)
        } else if (next.crackEventId > prev.crackEventId) {
          cue('tap', 0.55)
          syncUiMeta(next)
        } else if (next.paddleEventId > prev.paddleEventId) {
          cue('place', 0.6)
          haptic('settle')
        } else if (next.wallEventId > prev.wallEventId) {
          cue('tap', 0.35)
        }

        updateMotion()
        if (next.solved && next.shards.length === 0 && next.rings.length === 0) {
          if (saveDirty.current) persist(next)
          setSettled(true)
        }
      },
      [cue, haptic, updateMotion, syncUiMeta, persist],
    ),
    running,
  )

  const handleLaunch = useCallback(() => {
    if (!playingRef.current) return
    const prev = stateRef.current
    if (!prev.ball.attached || prev.solved) return
    const next = launchBall(prev, calmRef.current)
    if (next !== prev) {
      stateRef.current = next
      cue('place', 0.45)
      haptic('settle')
      updateMotion()
    }
  }, [cue, haptic, updateMotion])

  const handleNextLevel = useCallback(() => {
    const next = nextLevel(stateRef.current, calmRef.current)
    stateRef.current = next
    setSettled(false)
    gestureRef.current = null
    setWallVersion((version) => version + 1)
    syncUiMeta(next)
    updateMotion()
    cue('tap', 0.5)
    persist(next, true)
  }, [cue, haptic, persist, updateMotion, syncUiMeta])

  // Endless: a cleared wall gives way to the next one after a breath.
  useEffect(() => {
    if (mode !== 'endless' || !started || paused || !settled || !uiMeta.solved) return
    const t = setTimeout(handleNextLevel, 900)
    return () => clearTimeout(t)
  }, [mode, started, paused, settled, uiMeta.solved, handleNextLevel])

  const handleRestart = useCallback(() => {
    playingRef.current = false
    setStarted(false)
    const next = restartLevel(stateRef.current, calmRef.current)
    setSettled(false)
    stateRef.current = next
    gestureRef.current = null
    setWallVersion((version) => version + 1)
    syncUiMeta(next)
    updateMotion()
    cue('undo', 0.5)
    persist(next, true)
  }, [cue, haptic, persist, updateMotion, syncUiMeta])

  const handlePauseChange = useCallback(
    (nextPaused: boolean) => {
      if (nextPaused) {
        playingRef.current = false
        gestureRef.current = null
        persist(stateRef.current)
      }
      setPaused(nextPaused)
    },
    [persist],
  )

  const handleExit = useCallback(() => {
    persist(stateRef.current)
    onExit()
  }, [persist, onExit])

  const touchRef = useRef({ handleLaunch, updateMotion })
  touchRef.current = { handleLaunch, updateMotion }

  // Each responder owns an empty hit surface, so its grant coordinates are local to that surface.
  const { courtResponder, railResponder } = useMemo(() => {
    const canSteer = () => playingRef.current && !stateRef.current.solved
    const steerTo = (x: number, width: number) => {
      const target = Math.max(0, Math.min(1, x / width))
      const next = setPaddleX(stateRef.current, target)
      if (next !== stateRef.current) {
        stateRef.current = next
        touchRef.current.updateMotion()
      }
    }
    const makeResponder = (widthRef: { current: number }, isRail: boolean) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => canSteer() && widthRef.current > 0,
        onPanResponderGrant: ({ nativeEvent: { locationX } }) => {
          const width = widthRef.current
          if (!canSteer() || width <= 0 || !Number.isFinite(locationX)) return
          const wasAttached = stateRef.current.ball.attached
          gestureRef.current = { width, startX: locationX, moved: false, wasAttached }
          // Preserve tap-to-launch on the court. The rail also sets aim on touch-down.
          if (isRail || !wasAttached) steerTo(locationX, width)
        },
        onPanResponderMove: (_, { dx, dy }) => {
          const gesture = gestureRef.current
          if (!canSteer() || !gesture) return
          gesture.moved ||= Math.hypot(dx, dy) >= TAP_DRAG_THRESHOLD_PX
          if (isRail || gesture.moved || !gesture.wasAttached) {
            steerTo(gesture.startX + dx, gesture.width)
          }
        },
        onPanResponderRelease: () => {
          const gesture = gestureRef.current
          gestureRef.current = null
          if (canSteer() && gesture?.wasAttached) touchRef.current.handleLaunch()
        },
        onPanResponderTerminate: () => {
          gestureRef.current = null
        },
      })
    return {
      courtResponder: makeResponder(courtWidthRef, false),
      railResponder: makeResponder(railWidthRef, true),
    }
  }, [])

  const steerBy = useCallback(
    (dx: number) => {
      if (!playingRef.current || stateRef.current.solved) return
      const next = nudgePaddle(stateRef.current, dx)
      if (next !== stateRef.current) {
        stateRef.current = next
        updateMotion()
      }
    },
    [updateMotion],
  )

  // Web keyboard steering
  useKeys(
    {
      ArrowLeft: () => steerBy(-KEY_NUDGE_STEP),
      a: () => steerBy(-KEY_NUDGE_STEP),
      A: () => steerBy(-KEY_NUDGE_STEP),
      ArrowRight: () => steerBy(KEY_NUDGE_STEP),
      d: () => steerBy(KEY_NUDGE_STEP),
      D: () => steerBy(KEY_NUDGE_STEP),
    },
    playing,
    true,
  )

  // Launch & pause keys
  useKeys(
    {
      Space: handleLaunch,
      ' ': handleLaunch,
      Enter: handleLaunch,
      p: () => handlePauseChange(true),
      P: () => handlePauseChange(true),
      Escape: () => handlePauseChange(true),
    },
    playing,
    false,
  )

  useKeys(
    {
      p: () => handlePauseChange(false),
      P: () => handlePauseChange(false),
    },
    paused,
    false,
  )

  const handleCourtLayout = useCallback(({ nativeEvent: { layout: { width, height } } }: LayoutChangeEvent) => {
    if (courtWidthRef.current !== width) gestureRef.current = null
    courtWidthRef.current = width
    setCourtSize((prev) => prev.w === width && prev.h === height ? prev : { w: width, h: height })
  }, [])

  const handleRailLayout = useCallback(({ nativeEvent: { layout: { width } } }: LayoutChangeEvent) => {
    if (railWidthRef.current !== width) gestureRef.current = null
    railWidthRef.current = width
    setRailWidth(width)
  }, [])

  const s = stateRef.current
  const { w, h } = courtSize
  const unit = Math.min(w, h)
  const ballR = Math.max(4, s.ball.radius * unit)
  const aimLen = unit * 0.22
  const pw = s.paddleWidth * w
  const ph = Math.max(8, s.paddleHeight * h)
  const py = s.paddleY * h - ph * 0.5
  const centerNotchW = Math.max(10, Math.min(22, pw * 0.18))
  const centerNotchH = Math.max(2, ph * 0.32)

  const ballStyle = useAnimatedStyle(() => ({
    opacity: frame.value.solved ? 0 : 1,
    transform: [{ translateX: frame.value.x * w - ballR }, { translateY: frame.value.y * h - ballR }],
  }))
  const aimStyle = useAnimatedStyle(() => ({
    opacity: frame.value.attached && !frame.value.solved ? 0.45 : 0,
    transform: [
      { translateX: frame.value.x * w },
      { translateY: frame.value.y * h },
      { rotate: `${frame.value.angle - Math.PI / 2}rad` },
    ],
  }))
  const paddleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: frame.value.paddle * w - pw / 2 }],
  }))
  const railStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(0, Math.min(railWidth - 24, frame.value.paddle * railWidth - 12)) }],
  }))

  return (
    <GameShell
      gameId="chime"
      score={uiMeta.score}
      stats={[
        { label: 'Stage', value: uiMeta.levelNumber },
        { label: 'Blocks', value: uiMeta.blocksRemaining },
        { label: 'Score', value: uiMeta.score },
      ]}
      commitScore={started}
      ready={started}
      readyExtra={
        <Segmented label="Mode" options={MODE_OPTIONS} value={mode} onChange={(m) => setSaved((prev) => ({ ...prev, mode: m }))} />
      }
      onReady={() => setStarted(true)}
      paused={paused}
      onPauseChange={handlePauseChange}
      onRestart={handleRestart}
      onExit={handleExit}
    >
      <View style={[styles.playArea, { gap: isCompact ? 8 : 12 }]}>
        <GlassSurface variant="card" radius={18} style={styles.courtFrame}>
          <View style={styles.court}>
            {w > 0 && h > 0 && (
              <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} pointerEvents="none" style={styles.art}>
                {/* 1. True #000000 obsidian ground */}
                <Rect x={0} y={0} width={w} height={h} fill={color.bg} />

                {/* Architectural calibration tick marks along side walls */}
                {[1, 2, 3, 4, 5].map((i) => {
                  const ty = (i / 6) * h
                  return (
                    <G key={`tk-${i}`}>
                      <Rect x={4} y={ty} width={3} height={1} fill={color.ink4} fillOpacity={0.35} />
                      <Rect x={w - 7} y={ty} width={3} height={1} fill={color.ink4} fillOpacity={0.35} />
                    </G>
                  )
                })}
              </Svg>
            )}
            {w > 0 && h > 0 && (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <BrickWall version={wallVersion} bricks={s.bricks} w={w} h={h} accent={color.accent} />
                <Animated.View style={[styles.moving, {
                  width: aimLen, height: 1, transformOrigin: 'left center',
                  borderTopWidth: 1, borderStyle: 'dashed', borderColor: color.ink3,
                }, aimStyle]} />
                <Animated.View style={[styles.moving, {
                  width: pw, height: ph, borderRadius: ph / 2, top: py,
                  backgroundColor: pieces.bone, alignItems: 'center', justifyContent: 'center',
                }, paddleStyle]}>
                  <View style={{ width: centerNotchW, height: centerNotchH, borderRadius: centerNotchH / 2, backgroundColor: color.accent }} />
                </Animated.View>
                <Animated.View style={[styles.moving, {
                  width: ballR * 2, height: ballR * 2, borderRadius: ballR, backgroundColor: color.accent,
                }, ballStyle]} />
              </View>
            )}
            <View
              {...courtResponder.panHandlers}
              collapsable={false}
              onLayout={handleCourtLayout}
              style={styles.hitSurface}
            />
          </View>
        </GlassSurface>

        <GlassSurface variant="chrome" radius={20} style={styles.rail}>
          <View
            pointerEvents="none"
            style={[styles.railTrack, { backgroundColor: color.lineStrong }]}
          />
          {railWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.railMarker,
                { backgroundColor: color.accent },
                railStyle,
              ]}
            />
          )}
          <View
            {...railResponder.panHandlers}
            collapsable={false}
            onLayout={handleRailLayout}
            style={styles.hitSurface}
          />
        </GlassSurface>
      </View>

      <Completion
        open={started && uiMeta.solved && mode === 'classic'}
        gameId="chime"
        title={`Wall cleared`}
        line={`Score ${uiMeta.score}`}
        actionLabel="Next wall"
        onAction={handleNextLevel}
      />
    </GameShell>
  )
}

const styles = StyleSheet.create({
  moving: { position: 'absolute', left: 0, top: 0 },
  playArea: {
    flex: 1,
    width: '100%',
    maxWidth: 404,
  },
  courtFrame: {
    flex: 1,
    padding: 3,
  },
  court: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  art: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  hitSurface: {
    ...StyleSheet.absoluteFill,
    ...Platform.select({ web: { touchAction: 'none' } }),
  },
  rail: {
    height: 56,
    justifyContent: 'center',
  },
  railTrack: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 1,
  },
  railMarker: {
    position: 'absolute',
    left: 0,
    width: 24,
    height: 4,
    borderRadius: 2,
    opacity: 0.7,
  },
})
