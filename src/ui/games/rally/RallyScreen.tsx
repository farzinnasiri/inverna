import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
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
import { font, hexToRgb, type ResolvedTokens } from '@/design/tokens'
import { Segmented } from '@/ui/components/controls'
import { GameShell, type GameScreenProps } from '@/ui/components/GameShell'
import { useCalm, useFeedback, useGameLoop, useGameSave, useKeys } from '@/ui/hooks/game'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import './rally.css'

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

function hexAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha.toFixed(3)})`
}

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

function fillPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const r = Math.min(w, h) * 0.5
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2)
  ctx.lineTo(x + r, y + h)
  ctx.arc(x + r, y + r, r, Math.PI / 2, (Math.PI * 3) / 2)
  ctx.closePath()
}

function drawCourt(
  ctx: CanvasRenderingContext2D,
  state: RallyState,
  w: number,
  h: number,
  dragging: boolean,
  reducedMotion: boolean,
  tokens: ResolvedTokens,
): void {
  const unit = Math.min(w, h)
  const midY = h * 0.5
  const midX = w * 0.5

  // 1. Flat true-black obsidian court ground (#000000)
  ctx.fillStyle = tokens.color.bg
  ctx.fillRect(0, 0, w, h)

  // 2. Subtle dashed hairline centre line + small centre circle (tokens.color.ink4)
  const circleR = Math.max(18, unit * 0.085)
  ctx.save()
  ctx.strokeStyle = hexAlpha(tokens.color.ink4, 0.52)
  ctx.lineWidth = 1
  ctx.setLineDash([5, 6])

  // Left half of centre line
  ctx.beginPath()
  ctx.moveTo(14, midY)
  ctx.lineTo(Math.max(14, midX - circleR - 6), midY)
  ctx.stroke()

  // Right half of centre line
  ctx.beginPath()
  ctx.moveTo(Math.min(w - 14, midX + circleR + 6), midY)
  ctx.lineTo(w - 14, midY)
  ctx.stroke()

  // Solid hairline centre circle + pinpoint centre dot
  ctx.setLineDash([])
  ctx.strokeStyle = hexAlpha(tokens.color.ink4, 0.45)
  ctx.beginPath()
  ctx.arc(midX, midY, circleR, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = hexAlpha(tokens.color.ink4, 0.6)
  ctx.beginPath()
  ctx.arc(midX, midY, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 3. Large ultra-subtle watermarked scores in upper & lower halves
  const scoreSize = Math.round(Math.min(w * 0.28, h * 0.165))
  ctx.save()
  ctx.font = `200 ${scoreSize}px ${font.ui}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = hexAlpha(tokens.color.ink4, 0.18)
  ctx.fillText(String(state.aiScore), midX, h * 0.285)
  ctx.fillText(String(state.playerScore), midX, h * 0.715)
  ctx.restore()

  // 4. Subtle bottom touch-rail guide so finger never blocks the player paddle
  const railY = h * 0.968
  const railLeft = w * 0.08
  const railRight = w * 0.92
  ctx.save()
  ctx.strokeStyle = hexAlpha(tokens.color.ink4, dragging ? 0.45 : 0.26)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(railLeft, railY)
  ctx.lineTo(railRight, railY)
  // Quiet watchmaker end ticks
  ctx.moveTo(railLeft, railY - 3)
  ctx.lineTo(railLeft, railY + 3)
  ctx.moveTo(railRight, railY - 3)
  ctx.lineTo(railRight, railY + 3)
  ctx.stroke()

  const railKnobW = Math.max(18, state.paddleWidth * w * 0.28)
  const railKnobX = Math.max(railLeft, Math.min(railRight - railKnobW, state.playerX * w - railKnobW * 0.5))
  fillPill(ctx, railKnobX, railY - 1.5, railKnobW, 3)
  ctx.fillStyle = hexAlpha(dragging ? tokens.color.accent : tokens.pieces.bone, dragging ? 0.55 : 0.22)
  ctx.fill()
  ctx.restore()

  // 5. Expanding hairline impact rings on paddle, wall, and score events
  if (state.ripples.length > 0) {
    const rippleScale = reducedMotion ? 0.55 : 1
    ctx.save()
    for (const r of state.ripples) {
      const t = Math.max(0, Math.min(1, r.ageMs / r.durationMs))
      const ease = 1 - Math.pow(1 - t, 2.4)
      const alpha = (1 - t) * (1 - t) * (r.kind === 'paddle' ? 0.62 : r.kind === 'wall' ? 0.42 : 0.5) * rippleScale
      if (alpha <= 0.01) continue

      const radius = Math.max(3, (0.012 + r.maxRadius * ease) * unit)
      const strokeHex =
        r.kind === 'paddle' || r.kind === 'scorePlayer'
          ? tokens.color.accent
          : r.kind === 'scoreAi'
            ? tokens.pieces.clay
            : tokens.color.ink3

      ctx.beginPath()
      ctx.arc(r.x * w, r.y * h, radius, 0, Math.PI * 2)
      ctx.strokeStyle = hexAlpha(strokeHex, alpha)
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.restore()
  }

  // 6. Paddles — crisp rounded pills
  const paddleW = state.paddleWidth * w
  const paddleH = Math.max(9, PADDLE_HALF_HEIGHT * 2 * h)

  // AI paddle (top) — Deep Navy Slate (tokens.pieces.clay)
  const aiLeft = state.aiX * w - paddleW * 0.5
  const aiTop = AI_Y * h - paddleH * 0.5
  ctx.save()
  fillPill(ctx, aiLeft, aiTop, paddleW, paddleH)
  ctx.fillStyle = tokens.pieces.clay
  ctx.fill()
  ctx.strokeStyle = tokens.color.line
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()

  // Player paddle (bottom) — Moon Ivory (tokens.pieces.bone) with centred Antique Brass notch
  const playerLeft = state.playerX * w - paddleW * 0.5
  const playerTop = PLAYER_Y * h - paddleH * 0.5
  ctx.save()
  fillPill(ctx, playerLeft, playerTop, paddleW, paddleH)
  ctx.fillStyle = tokens.pieces.bone
  ctx.fill()

  // Subtle centred Antique Brass index notch
  const notchW = Math.max(10, paddleW * 0.16)
  const notchH = Math.max(2.5, paddleH * 0.28)
  fillPill(ctx, state.playerX * w - notchW * 0.5, PLAYER_Y * h - notchH * 0.5, notchW, notchH)
  ctx.fillStyle = tokens.color.accent
  ctx.fill()
  ctx.restore()

  // 7. Ball & whisper-subtle tapering 7-dot trail in Antique Brass (tokens.color.accent)
  const ballR = Math.max(5.5, BALL_RADIUS * w)

  if (!reducedMotion && state.trail.length > 0 && state.serveDelayMs <= 0) {
    ctx.save()
    const count = state.trail.length
    for (let i = 0; i < count; i++) {
      const pt = state.trail[i]!
      const frac = (i + 1) / (count + 1)
      const dotR = ballR * (0.24 + frac * 0.48)
      const dotAlpha = frac * frac * 0.34
      ctx.beginPath()
      ctx.arc(pt.x * w, pt.y * h, dotR, 0, Math.PI * 2)
      ctx.fillStyle = hexAlpha(tokens.color.accent, dotAlpha)
      ctx.fill()
    }
    ctx.restore()
  }

  const bx = state.ball.x * w
  const by = state.ball.y * h

  // Quiet hairline serve ring during brief serve pause
  if (state.serveDelayMs > 0) {
    const progress = Math.max(0, Math.min(1, state.serveDelayMs / SERVE_DELAY_MS))
    const ringR = ballR * (1.5 + progress * 1.4)
    ctx.save()
    ctx.beginPath()
    ctx.arc(bx, by, ringR, 0, Math.PI * 2)
    ctx.strokeStyle = hexAlpha(tokens.color.accentDim, 0.45 * (1 - progress * 0.4))
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }

  // Brass ball
  ctx.save()
  ctx.beginPath()
  ctx.arc(bx, by, ballR, 0, Math.PI * 2)
  ctx.fillStyle = tokens.color.accent
  ctx.fill()
  ctx.restore()
}

export default function RallyScreen({ onExit }: GameScreenProps) {
  const calm = useCalm()
  const { cue, haptic } = useFeedback()
  const reduceMotion = useReducedMotion() ?? false
  const tokens = useTokenColors()
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

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 340, h: 520, dpr: 1 })
  const activePointerIdRef = useRef<number | null>(null)
  const prevEventIdRef = useRef<number>(stateRef.current.eventId)
  const keysHeldRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false })

  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const calmRef = useRef(calm)
  calmRef.current = calm
  const reducedMotionRef = useRef(reduceMotion)
  reducedMotionRef.current = reduceMotion
  const tokensRef = useRef<ResolvedTokens>(tokens)
  tokensRef.current = tokens

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

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w, h, dpr } = sizeRef.current
    if (w <= 0 || h <= 0) return
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawCourt(
      ctx,
      stateRef.current,
      w,
      h,
      activePointerIdRef.current !== null,
      reducedMotionRef.current,
      tokensRef.current,
    )
    ctx.restore()
  }, [])

  // Redraw immediately when live warmth tokens change
  useEffect(() => {
    renderCanvas()
  }, [tokens, renderCanvas])

  // Keep canvas crisp at native DPR whenever the court container resizes
  useEffect(() => {
    const container = frameRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect.width))
      const h = Math.max(1, Math.round(rect.height))
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
      sizeRef.current = { w, h, dpr }
      const targetW = Math.round(w * dpr)
      const targetH = Math.round(h * dpr)
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW
        canvas.height = targetH
      }
      renderCanvas()
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    return () => ro.disconnect()
  }, [renderCanvas])

  // 60fps simulation & canvas render loop
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

        renderCanvas()
      },
      [cue, haptic, persist, renderCanvas, syncStats],
    ),
    !paused,
  )

  // Clear held keyboard velocity on keyup or window blur
  useEffect(() => {
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
        activePointerIdRef.current = null
        keysHeldRef.current = { left: false, right: false }
        stateRef.current = setPlayerVelocity(stateRef.current, 0)
        persist(stateRef.current)
      }
      setPaused(nextPaused)
    },
    [persist],
  )

  const handleRestart = useCallback(() => {
    const fresh = createRally({ seed: Date.now() >>> 0, difficulty: stateRef.current.difficulty, calm: calmRef.current })
    stateRef.current = fresh
    prevEventIdRef.current = 0
    syncStats(fresh)
    persist(fresh)
    renderCanvas()
  }, [persist, renderCanvas, syncStats])

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
      renderCanvas()
    },
    [cue, haptic, persist, renderCanvas],
  )

  const handleServeNow = useCallback(() => {
    if (pausedRef.current) return
    if (stateRef.current.serveDelayMs <= 0) return
    stateRef.current = serveNow(stateRef.current, calmRef.current)
    cue('tap', 0.4)
    renderCanvas()
  }, [cue, renderCanvas])

  // Map pointer X directly to normalised court X
  const toNormX = useCallback((clientX: number): number => {
    const el = frameRef.current
    if (!el) return 0.5
    const r = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)))
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (pausedRef.current || activePointerIdRef.current !== null) return
      activePointerIdRef.current = e.pointerId
      e.currentTarget.setPointerCapture(e.pointerId)
      const nx = toNormX(e.clientX)
      stateRef.current = setPlayerX(stateRef.current, nx)
      if (stateRef.current.serveDelayMs > 0) {
        stateRef.current = serveNow(stateRef.current, calmRef.current)
        cue('tap', 0.4)
      }
      renderCanvas()
    },
    [cue, renderCanvas, toNormX],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (pausedRef.current || e.pointerId !== activePointerIdRef.current) return
      const nx = toNormX(e.clientX)
      stateRef.current = setPlayerX(stateRef.current, nx)
    },
    [toNormX],
  )

  const endPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== activePointerIdRef.current) return
    activePointerIdRef.current = null
    renderCanvas()
  }, [renderCanvas])

  // Keyboard controls via useKeys (ArrowLeft/ArrowRight/A/D + Space to serve)
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

  return (
    <GameShell
      gameId="rally"
      stats={[
        { label: 'You', value: stats.playerScore },
        { label: 'AI', value: stats.aiScore },
        { label: 'Rally', value: stats.rally },
      ]}
      paused={paused}
      onPauseChange={handlePauseChange}
      onRestart={handleRestart}
      onExit={handleExit}
      howTo={
        <>
          <p>Drag anywhere across the court or along the bottom rail to glide your ivory paddle.</p>
          <p>Strike the brass ball off-center to angle your return, or tap to serve immediately.</p>
          <p>Switch between Easy, Medium, and Hard below at any time.</p>
        </>
      }
      controls={
        <div className="rally-controls">
          <Segmented
            label="Difficulty"
            options={DIFFICULTY_OPTIONS}
            value={difficulty}
            onChange={handleDifficultyChange}
          />
        </div>
      }
    >
      <div className="rally-frame" ref={frameRef}>
        <canvas
          ref={canvasRef}
          className="rally-canvas"
          role="application"
          aria-label="Rally court"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        />
      </div>
    </GameShell>
  )
}
