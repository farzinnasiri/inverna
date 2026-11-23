import { useCallback, useEffect, useRef, useState } from 'react'
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
import { useCalm, useFeedback, useGameLoop, useGameSave, useKeys, useReducedMotion } from '@/ui/rn/hooks'

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
  const [courtSize, setCourtSize] = useState({ w: 340, h: 480 })
  const [, setTick] = useState(0)

  const courtWidthRef = useRef(340)
  courtWidthRef.current = courtSize.w
  const draggingRef = useRef(false)
  const grantXRef = useRef(0)
  const prevEventIdRef = useRef<number>(stateRef.current.eventId)
  const keysHeldRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false })

  const pausedRef = useRef(paused)
  pausedRef.current = paused
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
    !paused,
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
        draggingRef.current = false
        keysHeldRef.current = { left: false, right: false }
        stateRef.current = setPlayerVelocity(stateRef.current, 0)
        persist(stateRef.current)
      }
      setPaused(nextPaused)
    },
    [persist],
  )

  const handleRestart = useCallback(() => {
    const fresh = createRally({
      seed: Date.now() >>> 0,
      difficulty: stateRef.current.difficulty,
      calm: calmRef.current,
    })
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
    if (pausedRef.current) return
    if (stateRef.current.serveDelayMs <= 0) return
    stateRef.current = serveNow(stateRef.current, calmRef.current)
    cue('tap', 0.4)
    redraw()
  }, [cue, redraw])

  const touchRef = useRef({ cue, redraw })
  touchRef.current = { cue, redraw }

  // Smooth horizontal touch drag directly tracks player paddle X; tap serves immediately
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !pausedRef.current,
      onMoveShouldSetPanResponder: () => !pausedRef.current,
      onPanResponderGrant: (e) => {
        if (pausedRef.current) return
        draggingRef.current = true
        const lx = e.nativeEvent.locationX
        grantXRef.current = lx
        const nx = Math.max(0, Math.min(1, lx / Math.max(1, courtWidthRef.current)))
        stateRef.current = setPlayerX(stateRef.current, nx)
        if (stateRef.current.serveDelayMs > 0) {
          stateRef.current = serveNow(stateRef.current, calmRef.current)
          touchRef.current.cue('tap', 0.4)
        }
        touchRef.current.redraw()
      },
      onPanResponderMove: (_, g) => {
        if (pausedRef.current || !draggingRef.current) return
        const nx = Math.max(0, Math.min(1, (grantXRef.current + g.dx) / Math.max(1, courtWidthRef.current)))
        stateRef.current = setPlayerX(stateRef.current, nx)
      },
      onPanResponderRelease: () => {
        draggingRef.current = false
        touchRef.current.redraw()
      },
      onPanResponderTerminate: () => {
        draggingRef.current = false
        touchRef.current.redraw()
      },
    }),
  ).current

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
    !paused,
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

  const handleCourtLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width > 0 && height > 0) {
      setCourtSize((prev) =>
        Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1
          ? prev
          : { w: Math.round(width), h: Math.round(height) },
      )
    }
  }, [])

  const s = stateRef.current
  const { w, h } = courtSize
  const unit = Math.min(w, h)
  const midX = w * 0.5
  const midY = h * 0.5
  const circleR = Math.max(18, unit * 0.085)
  const scoreSize = Math.round(Math.min(w * 0.28, h * 0.165))

  const railY = h * 0.968
  const railLeft = w * 0.08
  const railRight = w * 0.92
  const railKnobW = Math.max(18, s.paddleWidth * w * 0.28)
  const railKnobX = Math.max(railLeft, Math.min(railRight - railKnobW, s.playerX * w - railKnobW * 0.5))

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
  const dragging = draggingRef.current

  const serveProgress = s.serveDelayMs > 0 ? Math.max(0, Math.min(1, s.serveDelayMs / SERVE_DELAY_MS)) : 0

  return (
    <GameShell
      gameId="rally"
      score={stats.rally}
      stats={[
        { label: 'You', value: stats.playerScore },
        { label: 'AI', value: stats.aiScore },
        { label: 'Rally', value: stats.rally },
      ]}
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
      <View
        {...panResponder.panHandlers}
        onLayout={handleCourtLayout}
        style={[styles.courtFrame, { backgroundColor: color.bg, borderColor: color.line }]}
      >
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} pointerEvents="none">
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

          {/* 4. Subtle bottom touch-rail guide */}
          <Line
            x1={railLeft}
            y1={railY}
            x2={railRight}
            y2={railY}
            stroke={color.ink4}
            strokeOpacity={dragging ? 0.45 : 0.26}
            strokeWidth={1}
          />
          <Line
            x1={railLeft}
            y1={railY - 3}
            x2={railLeft}
            y2={railY + 3}
            stroke={color.ink4}
            strokeOpacity={dragging ? 0.45 : 0.26}
            strokeWidth={1}
          />
          <Line
            x1={railRight}
            y1={railY - 3}
            x2={railRight}
            y2={railY + 3}
            stroke={color.ink4}
            strokeOpacity={dragging ? 0.45 : 0.26}
            strokeWidth={1}
          />
          <Rect
            x={railKnobX}
            y={railY - 1.5}
            width={railKnobW}
            height={3}
            rx={1.5}
            fill={dragging ? color.accent : pieces.bone}
            fillOpacity={dragging ? 0.55 : 0.22}
          />

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
      </View>
    </GameShell>
  )
}

const styles = StyleSheet.create({
  courtFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  controlsWrap: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
  },
})
