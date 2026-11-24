import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanResponder, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg'
import {
  AI_Y,
  BALL_RADIUS,
  createRally,
  PADDLE_HALF_HEIGHT,
  PLAYER_Y,
  SERVE_DELAY_MS,
  serveNow,
  setDifficulty,
  setPlayerVelocity,
  setPlayerX,
  tickRally,
  type RallyDifficulty,
  type RallyState,
} from '@/core/games/rally/engine'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { Segmented } from '@/ui/rn/controls'
import { GlassSurface } from '@/ui/rn/Glass'
import { useCalm, useFeedback, useGameLoop, useGameSave, useKeys, useReducedMotion, useResponsiveLayout } from '@/ui/rn/hooks'

interface RallySave {
  state: RallyState | null
  difficulty: RallyDifficulty
  bestRally: number
}

const DEFAULT_SAVE: RallySave = {
  state: null,
  difficulty: 'medium',
  bestRally: 0,
}

const DIFFICULTY_OPTIONS: readonly { value: RallyDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

const HOW_TO = [
  'Drag anywhere across the court or along the bottom rail to glide your ivory paddle.',
  'Strike the brass ball off-center to angle your return, or tap to serve immediately.',
  'Switch between Easy, Medium, and Hard below at any time.',
] as const

function isDifficulty(v: unknown): v is RallyDifficulty {
  return v === 'easy' || v === 'medium' || v === 'hard'
}

function isValidRallyState(v: unknown): v is RallyState {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<RallyState>
  return (
    isDifficulty(s.difficulty) &&
    typeof s.playerX === 'number' &&
    typeof s.aiX === 'number' &&
    typeof s.paddleWidth === 'number' &&
    Boolean(s.ball) &&
    typeof s.ball?.x === 'number' &&
    typeof s.ball?.y === 'number' &&
    typeof s.playerScore === 'number' &&
    typeof s.aiScore === 'number' &&
    typeof s.rally === 'number' &&
    typeof s.eventId === 'number' &&
    Array.isArray(s.trail) &&
    Array.isArray(s.ripples) &&
    typeof s.rngState === 'number'
  )
}

export function RallyScreen({ onExit }: GameScreenProps) {
  const { isCompact } = useResponsiveLayout()
  const calm = useCalm()
  const { cue, haptic } = useFeedback()
  const reduceMotion = useReducedMotion()
  const tokens = useTokenColors()
  const { color, pieces } = tokens
  const [saved, setSaved] = useGameSave<RallySave>('rally', DEFAULT_SAVE)

  const initialStateRef = useRef<RallyState | null>(null)
  if (initialStateRef.current === null) {
    const savedDifficulty = isDifficulty(saved.difficulty) ? saved.difficulty : 'medium'
    initialStateRef.current = isValidRallyState(saved.state)
      ? {
          ...saved.state,
          playerDir: 0,
          playerTargetX: null,
          playerVel: 0,
        }
      : createRally({ seed: Date.now() >>> 0, difficulty: savedDifficulty, calm })
  }

  const stateRef = useRef<RallyState>(initialStateRef.current)
  const [difficulty, setDifficultyState] = useState<RallyDifficulty>(() => initialStateRef.current!.difficulty)
  const [stats, setStats] = useState(() => ({
    playerScore: initialStateRef.current!.playerScore,
    aiScore: initialStateRef.current!.aiScore,
    rally: initialStateRef.current!.rally,
  }))
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
  } | null>(null)
  const prevEventIdRef = useRef(stateRef.current.eventId)
  const keysHeldRef = useRef({ left: false, right: false })

  const playingRef = useRef(playing)
  playingRef.current = playing
  const calmRef = useRef(calm)
  calmRef.current = calm

  const redraw = useCallback(() => {
    setTick((n) => (n + 1) % 1_000_000)
  }, [])

  const persist = useCallback(
    (next: RallyState) => {
      setSaved((prev) => ({
        state: next,
        difficulty: next.difficulty,
        bestRally: Math.max(prev.bestRally ?? 0, next.bestRally),
      }))
    },
    [setSaved],
  )

  const syncStats = useCallback((next: RallyState) => {
    setStats((prev) =>
      prev.playerScore === next.playerScore &&
      prev.aiScore === next.aiScore &&
      prev.rally === next.rally
        ? prev
        : { playerScore: next.playerScore, aiScore: next.aiScore, rally: next.rally },
    )
  }, [])

  // 60fps simulation & SVG render loop
  useGameLoop(
    useCallback(
      (dtMs: number) => {
        if (!playingRef.current) return
        const next = tickRally(stateRef.current, dtMs, calmRef.current)
        stateRef.current = next

        if (next.eventId > prevEventIdRef.current && next.event) {
          prevEventIdRef.current = next.eventId
          syncStats(next)

          if (next.event === 'wall') {
            cue('tap', 0.42)
            haptic('light')
          } else if (next.event === 'paddle') {
            cue('place', 0.72)
            haptic('light')
          } else if (next.event === 'scorePlayer') {
            cue('clear', 0.85)
            haptic('success')
            persist(next)
          } else if (next.event === 'scoreAi') {
            cue('undo', 0.52)
            haptic('medium')
            persist(next)
          }
        }

        redraw()
      },
      [cue, haptic, persist, redraw, syncStats],
    ),
    playing,
  )

  // Clear held keyboard velocity on keyup or window blur (Web only)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return

    const syncKeyDir = () => {
      const { left, right } = keysHeldRef.current
      const dir = right && !left ? 1 : left && !right ? -1 : 0
      stateRef.current = setPlayerVelocity(stateRef.current, dir)
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keysHeldRef.current.left = false
        syncKeyDir()
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keysHeldRef.current.right = false
        syncKeyDir()
      }
    }

    const onBlur = () => {
      keysHeldRef.current.left = false
      keysHeldRef.current.right = false
      stateRef.current = setPlayerVelocity(stateRef.current, 0)
    }

    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const handlePauseChange = useCallback(
    (nextPaused: boolean) => {
      if (nextPaused) {
        playingRef.current = false
        gestureRef.current = null
        keysHeldRef.current = { left: false, right: false }
        stateRef.current = setPlayerVelocity(stateRef.current, 0)
        persist(stateRef.current)
      }
      setPaused(nextPaused)
    },
    [persist],
  )

  const handleRestart = useCallback(() => {
    playingRef.current = false
    setStarted(false)
    const fresh = createRally({
      seed: Date.now() >>> 0,
      difficulty: stateRef.current.difficulty,
      calm: calmRef.current,
    })
    gestureRef.current = null
    stateRef.current = fresh
    prevEventIdRef.current = 0
    syncStats(fresh)
    persist(fresh)
    redraw()
  }, [persist, redraw, syncStats])

  const handleExit = useCallback(() => {
    persist(stateRef.current)
    onExit()
  }, [persist, onExit])

  const handleDifficultyChange = useCallback(
    (nextDiff: RallyDifficulty) => {
      if (nextDiff === stateRef.current.difficulty) return
      const updated = setDifficulty(stateRef.current, nextDiff, calmRef.current)
      stateRef.current = updated
      setDifficultyState(nextDiff)
      cue('tap', 0.45)
      haptic('light')
      persist(updated)
      redraw()
    },
    [cue, haptic, persist, redraw],
  )

  const handleServeNow = useCallback(() => {
    if (!playingRef.current) return
    if (stateRef.current.serveDelayMs <= 0) return
    stateRef.current = serveNow(stateRef.current, calmRef.current)
    cue('tap', 0.4)
    redraw()
  }, [cue, redraw])

  const touchRef = useRef({ handleServeNow })
  touchRef.current = { handleServeNow }

  // Each responder owns an empty hit surface, so its grant coordinates are local to that surface.
  const { courtResponder, railResponder } = useMemo(() => {
    const steerTo = (x: number, width: number) => {
      const target = Math.max(0, Math.min(1, x / width))
      stateRef.current = setPlayerX(stateRef.current, target)
    }
    const makeResponder = (widthRef: { current: number }) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => playingRef.current && widthRef.current > 0,
        onPanResponderGrant: ({ nativeEvent: { locationX } }) => {
          const width = widthRef.current
          if (!playingRef.current || width <= 0 || !Number.isFinite(locationX)) return
          gestureRef.current = { width, startX: locationX }
          steerTo(locationX, width)
          touchRef.current.handleServeNow()
        },
        onPanResponderMove: (_, { dx }) => {
          const gesture = gestureRef.current
          if (!playingRef.current || !gesture) return
          steerTo(gesture.startX + dx, gesture.width)
        },
        onPanResponderRelease: () => {
          gestureRef.current = null
        },
        onPanResponderTerminate: () => {
          gestureRef.current = null
        },
      })
    return {
      courtResponder: makeResponder(courtWidthRef),
      railResponder: makeResponder(railWidthRef),
    }
  }, [])

  const holdLeft = useCallback(() => {
    keysHeldRef.current.left = true
    stateRef.current = setPlayerVelocity(stateRef.current, -1)
  }, [])

  const holdRight = useCallback(() => {
    keysHeldRef.current.right = true
    stateRef.current = setPlayerVelocity(stateRef.current, 1)
  }, [])

  useKeys(
    {
      ArrowLeft: holdLeft,
      a: holdLeft,
      A: holdLeft,
      ArrowRight: holdRight,
      d: holdRight,
      D: holdRight,
      Space: handleServeNow,
      ' ': handleServeNow,
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
  const midX = w * 0.5
  const midY = h * 0.5
  const circleR = Math.max(18, unit * 0.085)
  const scoreSize = Math.round(Math.min(w * 0.28, h * 0.165))

  const paddleW = s.paddleWidth * w
  const paddleH = Math.max(9, PADDLE_HALF_HEIGHT * 2 * h)
  const paddleR = paddleH * 0.5
  const aiLeft = s.aiX * w - paddleW * 0.5
  const aiTop = AI_Y * h - paddleH * 0.5
  const playerLeft = s.playerX * w - paddleW * 0.5
  const playerTop = PLAYER_Y * h - paddleH * 0.5
  const notchW = Math.max(10, paddleW * 0.16)
  const notchH = Math.max(2.5, paddleH * 0.28)

  const ballR = Math.max(5.5, BALL_RADIUS * w)
  const bx = s.ball.x * w
  const by = s.ball.y * h

  const serveProgress = s.serveDelayMs > 0 ? Math.max(0, Math.min(1, s.serveDelayMs / SERVE_DELAY_MS)) : 0

  const railMarkerX = Math.max(0, Math.min(railWidth - 24, s.playerX * railWidth - 12))

  return (
    <GameShell
      gameId="rally"
      score={stats.rally}
      stats={[
        { label: 'You', value: stats.playerScore },
        { label: 'AI', value: stats.aiScore },
        { label: 'Rally', value: stats.rally },
      ]}
      commitScore={started}
      ready={started}
      readyHint="Drag on the rail below the court to steer your paddle."
      onReady={() => setStarted(true)}
      paused={paused}
      onPauseChange={handlePauseChange}
      onRestart={handleRestart}
      onExit={handleExit}
      howTo={HOW_TO}
      controls={
        <View style={styles.controlsWrap}>
          <Segmented
            label="Difficulty"
            options={DIFFICULTY_OPTIONS}
            value={difficulty}
            onChange={handleDifficultyChange}
          />
        </View>
      }
    >
      <View style={[styles.playArea, { gap: isCompact ? 8 : 12 }]}>
        <GlassSurface variant="card" radius={18} style={styles.courtFrame}>
          <View style={styles.court}>
            {w > 0 && h > 0 && (
              <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} pointerEvents="none" style={styles.art}>
                {/* 1. True-black obsidian court ground */}
                <Rect x={0} y={0} width={w} height={h} fill={color.bg} />

                {/* 2. Dashed hairline center line + center circle + pinpoint center dot */}
                <Line
                  x1={14}
                  y1={midY}
                  x2={Math.max(14, midX - circleR - 6)}
                  y2={midY}
                  stroke={color.ink4}
                  strokeOpacity={0.52}
                  strokeWidth={1}
                  strokeDasharray="5 6"
                />
                <Line
                  x1={Math.min(w - 14, midX + circleR + 6)}
                  y1={midY}
                  x2={w - 14}
                  y2={midY}
                  stroke={color.ink4}
                  strokeOpacity={0.52}
                  strokeWidth={1}
                  strokeDasharray="5 6"
                />
                <Circle
                  cx={midX}
                  cy={midY}
                  r={circleR}
                  fill="none"
                  stroke={color.ink4}
                  strokeOpacity={0.45}
                  strokeWidth={1}
                />
                <Circle cx={midX} cy={midY} r={2} fill={color.ink4} fillOpacity={0.6} />

                {/* 3. Ultra-subtle watermarked scores */}
                <SvgText
                  x={midX}
                  y={h * 0.285}
                  fill={color.ink4}
                  fillOpacity={0.18}
                  fontSize={scoreSize}
                  fontWeight="200"
                  textAnchor="middle"
                  alignmentBaseline="central"
                >
                  {String(s.aiScore)}
                </SvgText>
                <SvgText
                  x={midX}
                  y={h * 0.715}
                  fill={color.ink4}
                  fillOpacity={0.18}
                  fontSize={scoreSize}
                  fontWeight="200"
                  textAnchor="middle"
                  alignmentBaseline="central"
                >
                  {String(s.playerScore)}
                </SvgText>

                {/* 5. Expanding hairline impact rings */}
                {s.ripples.map((r) => {
                  const t = Math.max(0, Math.min(1, r.ageMs / r.durationMs))
                  const ease = 1 - Math.pow(1 - t, 2.4)
                  const rippleScale = reduceMotion ? 0.55 : 1
                  const alpha =
                    (1 - t) *
                    (1 - t) *
                    (r.kind === 'paddle' ? 0.62 : r.kind === 'wall' ? 0.42 : 0.5) *
                    rippleScale
                  if (alpha <= 0.01) return null

                  const radius = Math.max(3, (0.012 + r.maxRadius * ease) * unit)
                  const strokeHex =
                    r.kind === 'paddle' || r.kind === 'scorePlayer'
                      ? color.accent
                      : r.kind === 'scoreAi'
                        ? pieces.clay
                        : color.ink3

                  return (
                    <Circle
                      key={`rip-${r.id}`}
                      cx={r.x * w}
                      cy={r.y * h}
                      r={radius}
                      fill="none"
                      stroke={strokeHex}
                      strokeOpacity={alpha}
                      strokeWidth={1}
                    />
                  )
                })}

                {/* 6. AI top paddle (Deep Navy Slate) */}
                <Rect
                  x={aiLeft}
                  y={aiTop}
                  width={paddleW}
                  height={paddleH}
                  rx={paddleR}
                  fill={pieces.clay}
                  stroke={color.line}
                  strokeWidth={1}
                />

                {/* 7. Player bottom paddle (Moon Ivory + Antique Brass index notch) */}
                <Rect
                  x={playerLeft}
                  y={playerTop}
                  width={paddleW}
                  height={paddleH}
                  rx={paddleR}
                  fill={pieces.bone}
                />
                <Rect
                  x={s.playerX * w - notchW * 0.5}
                  y={PLAYER_Y * h - notchH * 0.5}
                  width={notchW}
                  height={notchH}
                  rx={notchH * 0.5}
                  fill={color.accent}
                />

                {/* 8. Tapering 7-dot brass ball trail */}
                {!reduceMotion && s.serveDelayMs <= 0
                  ? s.trail.map((pt, i) => {
                      const frac = (i + 1) / (s.trail.length + 1)
                      const dotR = ballR * (0.24 + frac * 0.48)
                      const dotAlpha = frac * frac * 0.34
                      return (
                        <Circle
                          key={`tr-${i}`}
                          cx={pt.x * w}
                          cy={pt.y * h}
                          r={dotR}
                          fill={color.accent}
                          fillOpacity={dotAlpha}
                        />
                      )
                    })
                  : null}

                {/* Quiet hairline serve ring during brief serve pause */}
                {s.serveDelayMs > 0 ? (
                  <Circle
                    cx={bx}
                    cy={by}
                    r={ballR * (1.5 + serveProgress * 1.4)}
                    fill="none"
                    stroke={color.accentDim}
                    strokeOpacity={0.45 * (1 - serveProgress * 0.4)}
                    strokeWidth={1}
                  />
                ) : null}

                {/* Brass ball */}
                <Circle cx={bx} cy={by} r={ballR} fill={color.accent} />
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
  controlsWrap: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
  },
})
