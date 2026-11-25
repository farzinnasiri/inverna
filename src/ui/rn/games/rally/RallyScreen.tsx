import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanResponder, Platform, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import Svg, { Circle, Line, Rect } from 'react-native-svg'
import {
  AI_Y,
  BALL_RADIUS,
  createRally,
  PADDLE_HALF_HEIGHT,
  PLAYER_Y,
  serveNow,
  setDifficulty,
  setPlayerVelocity,
  setPlayerX,
  tickRally,
  type RallyDifficulty,
  type RallyState,
  AI_PADDLE_WIDTH,
} from '@/core/games/rally/engine'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { Segmented } from '@/ui/rn/controls'
import { GlassSurface } from '@/ui/rn/Glass'
import { useCalm, useFeedback, useGameLoop, useGameSave, useKeys, useResponsiveLayout } from '@/ui/rn/hooks'

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

function motionFrame(state: RallyState) {
  return { x: state.ball.x, y: state.ball.y, player: state.playerX, ai: state.aiX }
}

export function RallyScreen({ onExit }: GameScreenProps) {
  const { isCompact } = useResponsiveLayout()
  const calm = useCalm()
  const { cue, haptic } = useFeedback()
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
  const frame = useSharedValue(motionFrame(initialStateRef.current))

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

  const updateMotion = useCallback(() => {
    frame.value = motionFrame(stateRef.current)
  }, [frame])

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

  // Simulate on JS and send only the moving pieces to Reanimated.
  useGameLoop(
    useCallback(
      (dtMs: number) => {
        if (!playingRef.current) return
        const next = tickRally(stateRef.current, dtMs, calmRef.current)
        stateRef.current = next

        if (next.eventId > prevEventIdRef.current && next.event) {
          prevEventIdRef.current = next.eventId
          if (next.event !== 'wall') syncStats(next)

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

        updateMotion()
      },
      [cue, haptic, persist, updateMotion, syncStats],
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
    updateMotion()
  }, [persist, updateMotion, syncStats])

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
      updateMotion()
    },
    [cue, haptic, persist, updateMotion],
  )

  const handleServeNow = useCallback(() => {
    if (!playingRef.current) return
    if (stateRef.current.serveDelayMs <= 0) return
    stateRef.current = serveNow(stateRef.current, calmRef.current)
    cue('tap', 0.4)
    updateMotion()
  }, [cue, updateMotion])

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
  const aiTop = AI_Y * h - paddleH * 0.5
  const playerTop = PLAYER_Y * h - paddleH * 0.5
  const notchW = Math.max(10, paddleW * 0.16)
  const notchH = Math.max(2.5, paddleH * 0.28)
  const ballR = Math.max(5.5, BALL_RADIUS * w)

  const ballStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: frame.value.x * w - ballR }, { translateY: frame.value.y * h - ballR }],
  }))
  const aiPaddleW = AI_PADDLE_WIDTH * w
  const aiStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: frame.value.ai * w - aiPaddleW / 2 }],
  }))
  const playerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: frame.value.player * w - paddleW / 2 }],
  }))
  const railStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(0, Math.min(railWidth - 24, frame.value.player * railWidth - 12)) }],
  }))
  const paddleShape = { width: paddleW, height: paddleH, borderRadius: paddleH / 2 }
  const aiPaddleShape = { width: aiPaddleW, height: paddleH, borderRadius: paddleH / 2 }

  return (
    <GameShell
      gameId="rally"
      score={stats.rally}
      stats={[
        { label: 'Rally', value: stats.rally },
      ]}
      commitScore={started}
      ready={started}
      readyHint="Drag the bar below to move your paddle."
      onReady={() => setStarted(true)}
      paused={paused}
      onPauseChange={handlePauseChange}
      onRestart={handleRestart}
      onExit={handleExit}
      readyExtra={
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
              </Svg>
            )}
            {w > 0 && h > 0 && (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                {[stats.aiScore, stats.playerScore].map((score, index) => (
                  <Text key={index} style={[styles.courtScore, {
                    color: color.ink4, top: h * (index === 0 ? 0.285 : 0.715) - scoreSize / 2,
                    fontSize: scoreSize, lineHeight: scoreSize,
                  }]}>{score}</Text>
                ))}
                <Animated.View style={[styles.moving, aiPaddleShape, { top: aiTop, backgroundColor: pieces.clay }, aiStyle]} />
                <Animated.View style={[styles.moving, styles.playerPaddle, paddleShape, { top: playerTop, backgroundColor: color.ink2 }, playerStyle]}>
                  <View style={{ width: notchW, height: notchH, borderRadius: notchH / 2, backgroundColor: color.accent }} />
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
    </GameShell>
  )
}

const styles = StyleSheet.create({
  moving: { position: 'absolute', left: 0, top: 0 },
  playerPaddle: { alignItems: 'center', justifyContent: 'center' },
  courtScore: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    fontFamily: Platform.OS === 'android' ? 'sans-serif' : Platform.OS === 'web' ? 'system-ui' : 'System',
    fontWeight: '300',
    opacity: 0.4,
  },
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
