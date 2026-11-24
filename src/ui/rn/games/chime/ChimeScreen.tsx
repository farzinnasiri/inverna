import { useCallback, useMemo, useRef, useState } from 'react'
import { PanResponder, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg'
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
import { useCalm, useFeedback, useGameLoop, useGameSave, useKeys, useReducedMotion, useResponsiveLayout } from '@/ui/rn/hooks'

interface ChimeSave {
  version: 1
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

const DEFAULT_SAVE: ChimeSave = {
  version: 1,
  state: null,
  bestScore: 0,
  boardsCleared: 0,
  plays: 1,
}

const HOW_TO = [
  'Tap anywhere or press Space to release the brass ball from the paddle.',
  'Drag across the court or along the rail below it to guide the ball back up. Missing the ball gently returns it to your paddle.',
] as const

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

export function ChimeScreen({ onExit }: GameScreenProps) {
  const { isCompact } = useResponsiveLayout()
  const calm = useCalm()
  const { cue, haptic } = useFeedback()
  const reduceMotion = useReducedMotion()
  const tokens = useTokenColors()
  const { color, pieces } = tokens
  const [saved, setSaved] = useGameSave<ChimeSave>('chime', DEFAULT_SAVE)

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
  const [courtSize, setCourtSize] = useState({ w: 0, h: 0 })
  const [, setTick] = useState(0)

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

  const redraw = useCallback(() => {
    setTick((n) => (n + 1) % 1_000_000)
  }, [])

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
      const stripped = stripEphemeralForSave(nextState)
      setSaved((prev) => ({
        version: 1,
        state: stripped,
        bestScore: Math.max(prev.bestScore, stripped.score),
        boardsCleared: Math.max(prev.boardsCleared, stripped.boardsCleared),
        plays: incrementPlays ? prev.plays + 1 : prev.plays,
      }))
    },
    [setSaved],
  )

  // 60fps simulation & SVG render loop
  useGameLoop(
    useCallback(
      (dtMs: number) => {
        if (!playingRef.current) return
        const prev = stateRef.current
        const next = tickChime(prev, dtMs, calmRef.current)
        if (next === prev) return
        stateRef.current = next

        if (next.clearEventId > prev.clearEventId) {
          cue('chime', 0.85)
          haptic('success')
          syncUiMeta(next)
          persist(next)
        } else if (next.breakEventId > prev.breakEventId) {
          cue('clear', 0.65)
          haptic('light')
          syncUiMeta(next)
          persist(next)
        } else if (next.crackEventId > prev.crackEventId) {
          cue('tap', 0.55)
          haptic('light')
          syncUiMeta(next)
        } else if (next.paddleEventId > prev.paddleEventId) {
          cue('place', 0.6)
          haptic('light')
        } else if (next.wallEventId > prev.wallEventId) {
          cue('tap', 0.35)
        }

        redraw()
      },
      [cue, haptic, persist, redraw, syncUiMeta],
    ),
    playing,
  )

  const handleLaunch = useCallback(() => {
    if (!playingRef.current) return
    const prev = stateRef.current
    if (!prev.ball.attached || prev.solved) return
    const next = launchBall(prev, calmRef.current)
    if (next !== prev) {
      stateRef.current = next
      cue('place', 0.45)
      haptic('light')
      redraw()
    }
  }, [cue, haptic, redraw])

  const handleNextLevel = useCallback(() => {
    const next = nextLevel(stateRef.current, calmRef.current)
    stateRef.current = next
    gestureRef.current = null
    syncUiMeta(next)
    redraw()
    cue('tap', 0.5)
    haptic('light')
    persist(next, true)
  }, [cue, haptic, persist, redraw, syncUiMeta])

  const handleRestart = useCallback(() => {
    playingRef.current = false
    setStarted(false)
    const next = restartLevel(stateRef.current, calmRef.current)
    stateRef.current = next
    gestureRef.current = null
    syncUiMeta(next)
    redraw()
    cue('undo', 0.5)
    haptic('light')
    persist(next, true)
  }, [cue, haptic, persist, redraw, syncUiMeta])

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

  const touchRef = useRef({ handleLaunch, redraw })
  touchRef.current = { handleLaunch, redraw }

  // Each responder owns an empty hit surface, so its grant coordinates are local to that surface.
  const { courtResponder, railResponder } = useMemo(() => {
    const canSteer = () => playingRef.current && !stateRef.current.solved
    const steerTo = (x: number, width: number) => {
      const target = Math.max(0, Math.min(1, x / width))
      const next = setPaddleX(stateRef.current, target)
      if (next !== stateRef.current) {
        stateRef.current = next
        touchRef.current.redraw()
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
        redraw()
      }
    },
    [redraw],
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
  const brickRadius = Math.max(2, Math.min(4, unit * 0.008))

  const ballPxX = s.ball.x * w
  const ballPxY = s.ball.y * h
  const ballR = Math.max(4, s.ball.radius * unit)

  const aimLen = unit * 0.22
  const aimEndX = ballPxX + Math.sin(s.ball.aimAngle) * aimLen
  const aimEndY = ballPxY - Math.cos(s.ball.aimAngle) * aimLen

  const pw = s.paddleWidth * w
  const ph = Math.max(8, s.paddleHeight * h)
  const px = s.paddleX * w - pw * 0.5
  const py = s.paddleY * h - ph * 0.5
  const paddleR = ph * 0.5
  const centerNotchW = Math.max(10, Math.min(22, pw * 0.18))
  const centerNotchH = Math.max(2, ph * 0.32)

  const railMarkerX = Math.max(0, Math.min(railWidth - 24, s.paddleX * railWidth - 12))

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
      readyHint="Tap the court to launch, then use the rail below it to steer your paddle."
      onReady={() => setStarted(true)}
      paused={paused}
      onPauseChange={handlePauseChange}
      onRestart={handleRestart}
      onExit={handleExit}
      howTo={HOW_TO}
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

                {/* 2. Expanding hairline pulse rings on brick hits / breaks */}
                {s.rings.map((ring) => {
                  const t = Math.max(0, Math.min(1, ring.ageMs / ring.durationMs))
                  const eased = 1 - Math.pow(1 - t, 2.2)
                  const alpha = Math.pow(1 - t, 1.55) * 0.52
                  if (alpha <= 0.008) return null
                  const radius = (ring.startRadius + (ring.maxRadius - ring.startRadius) * eased) * unit
                  return (
                    <Circle
                      key={`ring-${ring.id}`}
                      cx={ring.x * w}
                      cy={ring.y * h}
                      r={radius}
                      fill="none"
                      stroke={pieces[ring.color]}
                      strokeOpacity={alpha}
                      strokeWidth={1}
                    />
                  )
                })}

                {/* 3. Watchmaker architectural matte bricks */}
                {s.bricks.map((brick) => {
                  const bx = brick.x * w
                  const by = brick.y * h
                  const bw = brick.w * w
                  const bh = brick.h * h
                  const accentTone = brick.color === 'ochre' ? pieces.bone : color.accent
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
                        fill={pieces[brick.color]}
                      />
                      <Rect
                        x={bx + 0.5}
                        y={by + 0.5}
                        width={Math.max(1, bw - 1)}
                        height={Math.max(1, bh - 1)}
                        rx={Math.max(1, brickRadius - 0.5)}
                        fill="none"
                        stroke="#FFFFFF"
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

                {/* 4. Tumbling Watchmaker micro-shards */}
                {s.shards.map((shard) => {
                  const t = Math.max(0, Math.min(1, shard.ageMs / shard.durationMs))
                  const alpha = Math.pow(1 - t, 1.35)
                  if (alpha <= 0.01) return null
                  const sx = shard.x * w
                  const sy = shard.y * h
                  const sw = Math.max(3, shard.w * w)
                  const sh = Math.max(3, shard.h * h)
                  const deg = (reduceMotion ? shard.angle * 0.2 : shard.angle) * (180 / Math.PI)

                  return (
                    <G
                      key={`sh-${shard.id}`}
                      transform={`translate(${sx.toFixed(2)}, ${sy.toFixed(2)}) rotate(${deg.toFixed(2)})`}
                      opacity={alpha}
                    >
                      <Rect
                        x={-sw * 0.5}
                        y={-sh * 0.5}
                        width={sw}
                        height={sh}
                        rx={1.5}
                        fill={pieces[shard.color]}
                        stroke="#FFFFFF"
                        strokeOpacity={0.11}
                        strokeWidth={0.85}
                      />
                    </G>
                  )
                })}

                {/* 5. Quiet dashed aim line when attached to paddle */}
                {s.ball.attached && !s.solved ? (
                  <G>
                    <Line
                      x1={ballPxX}
                      y1={ballPxY - ballR * 1.4}
                      x2={aimEndX}
                      y2={aimEndY}
                      stroke={color.ink3}
                      strokeOpacity={0.45}
                      strokeWidth={1}
                      strokeDasharray="4 6"
                      strokeLinecap="round"
                    />
                    <Circle cx={aimEndX} cy={aimEndY} r={1.75} fill={color.accent} fillOpacity={0.55} />
                  </G>
                ) : null}

                {/* 6. Antique Brass 6-dot ball trail */}
                {!s.ball.attached && !s.solved && !reduceMotion
                  ? s.ball.trail.map((pt, i) => {
                      const frac = (i + 1) / (s.ball.trail.length + 1)
                      const dotR = Math.max(1.2, ballR * (0.28 + frac * 0.42))
                      const alpha = 0.08 + frac * 0.3
                      return (
                        <Circle
                          key={`tr-${i}`}
                          cx={pt.x * w}
                          cy={pt.y * h}
                          r={dotR}
                          fill={color.accent}
                          fillOpacity={alpha}
                        />
                      )
                    })
                  : null}

                {/* 7. Moon Ivory paddle with Antique Brass center notch */}
                <Rect x={px} y={py} width={pw} height={ph} rx={paddleR} fill={pieces.bone} />
                <Rect
                  x={px + 0.5}
                  y={py + 0.5}
                  width={Math.max(1, pw - 1)}
                  height={Math.max(1, ph - 1)}
                  rx={Math.max(1, paddleR - 0.5)}
                  fill="none"
                  stroke="#FFFFFF"
                  strokeOpacity={0.16}
                  strokeWidth={1}
                />
                <Rect
                  x={s.paddleX * w - centerNotchW * 0.5}
                  y={s.paddleY * h - centerNotchH * 0.5}
                  width={centerNotchW}
                  height={centerNotchH}
                  rx={centerNotchH * 0.5}
                  fill={color.accent}
                />

                {/* 8. Antique Brass ball with flat brass aura ring & ivory pin */}
                {!s.solved ? (
                  <G>
                    <Circle cx={ballPxX} cy={ballPxY} r={ballR * 1.45} fill={color.accent} fillOpacity={0.16} />
                    <Circle cx={ballPxX} cy={ballPxY} r={ballR} fill={color.accent} />
                    <Circle
                      cx={ballPxX}
                      cy={ballPxY}
                      r={Math.max(1.2, ballR * 0.28)}
                      fill={pieces.bone}
                      fillOpacity={0.55}
                    />
                  </G>
                ) : null}
              </Svg>
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
            <View
              pointerEvents="none"
              style={[
                styles.railMarker,
                { backgroundColor: color.accent, transform: [{ translateX: railMarkerX }] },
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
        open={started && uiMeta.solved}
        gameId="chime"
        title={`Cleared · ${uiMeta.patternName}`}
        line={`Score ${uiMeta.score}`}
        actionLabel="Next wall"
        onAction={handleNextLevel}
      />
    </GameShell>
  )
}

const styles = StyleSheet.create({
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
