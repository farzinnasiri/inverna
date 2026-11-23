import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
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
import { hexToRgb, type ResolvedTokens } from '@/design/tokens'
import { Completion, GameShell, type GameScreenProps } from '@/ui/components/GameShell'
import { useCalm, useFeedback, useGameLoop, useGameSave, useKeys } from '@/ui/hooks/game'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import './chime.css'

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

const KEY_NUDGE_STEP = 0.055
const TAP_DRAG_THRESHOLD_PX = 6

function hexAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha.toFixed(3)})`
}

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

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w * 0.5, h * 0.5)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

function drawChime(
  ctx: CanvasRenderingContext2D,
  state: ChimeState,
  w: number,
  h: number,
  reducedMotion: boolean,
  tokens: ResolvedTokens,
): void {
  const unit = Math.min(w, h)

  // 1. True #000000 obsidian ground
  ctx.fillStyle = tokens.color.bg
  ctx.fillRect(0, 0, w, h)

  // Subtle architectural tick marks along court walls (quiet Watchmaker calibration)
  ctx.fillStyle = hexAlpha(tokens.color.ink4, 0.35)
  const tickCount = 5
  for (let i = 1; i <= tickCount; i++) {
    const ty = (i / (tickCount + 1)) * h
    ctx.fillRect(4, ty, 3, 1)
    ctx.fillRect(w - 7, ty, 3, 1)
  }

  // 2. Expanding hairline pulse rings on brick hits / breaks
  for (const ring of state.rings) {
    const t = Math.max(0, Math.min(1, ring.ageMs / ring.durationMs))
    const eased = 1 - Math.pow(1 - t, 2.2)
    const alpha = Math.pow(1 - t, 1.55) * 0.52
    if (alpha <= 0.008) continue

    const rx = ring.x * w
    const ry = ring.y * h
    const radius = (ring.startRadius + (ring.maxRadius - ring.startRadius) * eased) * unit

    ctx.beginPath()
    ctx.arc(rx, ry, radius, 0, Math.PI * 2)
    ctx.strokeStyle = hexAlpha(tokens.pieces[ring.color], alpha)
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // 3. Watchmaker matte bricks
  const brickRadius = Math.max(2, Math.min(4, unit * 0.008))
  const brickStroke = 'rgba(255, 255, 255, 0.11)'

  for (const brick of state.bricks) {
    const bx = brick.x * w
    const by = brick.y * h
    const bw = brick.w * w
    const bh = brick.h * h

    traceRoundedRect(ctx, bx, by, bw, bh, brickRadius)
    ctx.fillStyle = tokens.pieces[brick.color]
    ctx.fill()

    // Crisp 1px matte micro-border
    traceRoundedRect(ctx, bx + 0.5, by + 0.5, Math.max(1, bw - 1), Math.max(1, bh - 1), Math.max(1, brickRadius - 0.5))
    ctx.strokeStyle = brickStroke
    ctx.lineWidth = 1
    ctx.stroke()

    // Reinforced hp:2 inner brass notch/bar (vanishes cleanly on hit 1)
    if (brick.hp === 2) {
      const notchW = Math.max(8, bw * 0.38)
      const notchH = Math.max(2, Math.min(3, bh * 0.16))
      const nx = bx + (bw - notchW) * 0.5
      const ny = by + (bh - notchH) * 0.5
      const notchColor = brick.color === 'ochre' ? tokens.pieces.bone : tokens.color.accent
      traceRoundedRect(ctx, nx, ny, notchW, notchH, notchH * 0.5)
      ctx.fillStyle = hexAlpha(notchColor, 0.78)
      ctx.fill()
    } else if (brick.cracked) {
      // Crisp hairline fracture mark after first hit
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(bx + bw * 0.34, by + 1.5)
      ctx.lineTo(bx + bw * 0.49, by + bh * 0.52)
      ctx.lineTo(bx + bw * 0.42, by + bh * 0.58)
      ctx.lineTo(bx + bw * 0.62, by + bh - 1.5)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.68)'
      ctx.lineWidth = 1.25
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
      ctx.restore()
    }
  }

  // 4. Tumbling Watchmaker micro-shards
  for (const shard of state.shards) {
    const t = Math.max(0, Math.min(1, shard.ageMs / shard.durationMs))
    const alpha = Math.pow(1 - t, 1.35)
    if (alpha <= 0.01) continue

    const sx = shard.x * w
    const sy = shard.y * h
    const sw = Math.max(3, shard.w * w)
    const sh = Math.max(3, shard.h * h)

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(sx, sy)
    ctx.rotate(reducedMotion ? shard.angle * 0.2 : shard.angle)

    traceRoundedRect(ctx, -sw * 0.5, -sh * 0.5, sw, sh, 1.5)
    ctx.fillStyle = tokens.pieces[shard.color]
    ctx.fill()
    ctx.strokeStyle = brickStroke
    ctx.lineWidth = 0.85
    ctx.stroke()
    ctx.restore()
  }

  // 5. Whisper-quiet dashed aim line when attached to paddle
  const ballPxX = state.ball.x * w
  const ballPxY = state.ball.y * h
  const ballR = Math.max(4, state.ball.radius * unit)

  if (state.ball.attached && !state.solved) {
    const aimLen = unit * 0.22
    const endX = ballPxX + Math.sin(state.ball.aimAngle) * aimLen
    const endY = ballPxY - Math.cos(state.ball.aimAngle) * aimLen

    ctx.save()
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    ctx.moveTo(ballPxX, ballPxY - ballR * 1.4)
    ctx.lineTo(endX, endY)
    ctx.strokeStyle = hexAlpha(tokens.color.ink3, 0.45)
    ctx.lineWidth = 1
    ctx.lineCap = 'round'
    ctx.stroke()
    ctx.setLineDash([])

    // Quiet pinpoint sight bead at aim tip
    ctx.beginPath()
    ctx.arc(endX, endY, 1.75, 0, Math.PI * 2)
    ctx.fillStyle = hexAlpha(tokens.color.accent, 0.55)
    ctx.fill()
    ctx.restore()
  }

  // 6. Antique Brass 6-dot ball trail
  if (!state.ball.attached && !state.solved && state.ball.trail.length > 0 && !reducedMotion) {
    const count = state.ball.trail.length
    for (let i = 0; i < count; i++) {
      const pt = state.ball.trail[i]!
      const frac = (i + 1) / (count + 1)
      const dotR = Math.max(1.2, ballR * (0.28 + frac * 0.42))
      const alpha = 0.08 + frac * 0.3
      ctx.beginPath()
      ctx.arc(pt.x * w, pt.y * h, dotR, 0, Math.PI * 2)
      ctx.fillStyle = hexAlpha(tokens.color.accent, alpha)
      ctx.fill()
    }
  }

  // 7. Moon Ivory paddle with Antique Brass centre notch
  const pw = state.paddleWidth * w
  const ph = Math.max(8, state.paddleHeight * h)
  const px = state.paddleX * w - pw * 0.5
  const py = state.paddleY * h - ph * 0.5
  const paddleR = ph * 0.5

  traceRoundedRect(ctx, px, py, pw, ph, paddleR)
  ctx.fillStyle = tokens.pieces.bone
  ctx.fill()

  traceRoundedRect(ctx, px + 0.5, py + 0.5, Math.max(1, pw - 1), Math.max(1, ph - 1), Math.max(1, paddleR - 0.5))
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Antique Brass centre notch
  const centerNotchW = Math.max(10, Math.min(22, pw * 0.18))
  const centerNotchH = Math.max(2, ph * 0.32)
  traceRoundedRect(
    ctx,
    state.paddleX * w - centerNotchW * 0.5,
    state.paddleY * h - centerNotchH * 0.5,
    centerNotchW,
    centerNotchH,
    centerNotchH * 0.5,
  )
  ctx.fillStyle = tokens.color.accent
  ctx.fill()

  // 8. Antique Brass ball
  if (!state.solved) {
    ctx.beginPath()
    ctx.arc(ballPxX, ballPxY, ballR, 0, Math.PI * 2)
    ctx.fillStyle = tokens.color.accent
    ctx.fill()

    // Crisp hairline specular pin in Moon Ivory (flat matte, zero glow)
    ctx.beginPath()
    ctx.arc(ballPxX, ballPxY, Math.max(1.2, ballR * 0.28), 0, Math.PI * 2)
    ctx.fillStyle = hexAlpha(tokens.pieces.bone, 0.55)
    ctx.fill()
  }
}

export default function ChimeScreen({ onExit }: GameScreenProps) {
  const calm = useCalm()
  const { cue, haptic } = useFeedback()
  const reduceMotion = useReducedMotion() ?? false
  const tokens = useTokenColors()
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

  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 320, h: 460, dpr: 1 })

  const pointerRef = useRef<{
    id: number
    startX: number
    startY: number
    moved: boolean
    wasAttached: boolean
  } | null>(null)

  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const calmRef = useRef(calm)
  calmRef.current = calm
  const reducedMotionRef = useRef(reduceMotion)
  reducedMotionRef.current = reduceMotion
  const tokensRef = useRef<ResolvedTokens>(tokens)
  tokensRef.current = tokens

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

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w, h, dpr } = sizeRef.current
    if (w <= 0 || h <= 0) return

    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawChime(ctx, stateRef.current, w, h, reducedMotionRef.current, tokensRef.current)
    ctx.restore()
  }, [])

  // Redraw immediately whenever global warmth tokens update (even while paused)
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

  // 60fps simulation & render loop
  useGameLoop(
    useCallback(
      (dtMs: number) => {
        const prev = stateRef.current
        const next = tickChime(prev, dtMs, calmRef.current)
        if (next === prev) return
        stateRef.current = next

        if (next.clearEventId > prev.clearEventId) {
          cue('chime', 0.85)
          haptic('success')
          syncUiMeta(next)
          persist(next)
        } else {
          if (next.breakEventId > prev.breakEventId) {
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
        }

        renderCanvas()
      },
      [cue, haptic, persist, renderCanvas, syncUiMeta],
    ),
    !paused,
  )

  const handleLaunch = useCallback(() => {
    if (pausedRef.current) return
    const prev = stateRef.current
    if (!prev.ball.attached || prev.solved) return
    const next = launchBall(prev, calmRef.current)
    if (next !== prev) {
      stateRef.current = next
      cue('place', 0.45)
      haptic('light')
      renderCanvas()
    }
  }, [cue, haptic, renderCanvas])

  const handleNextLevel = useCallback(() => {
    const next = nextLevel(stateRef.current, calmRef.current)
    stateRef.current = next
    pointerRef.current = null
    syncUiMeta(next)
    renderCanvas()
    cue('tap', 0.5)
    haptic('light')
    persist(next, true)
  }, [cue, haptic, persist, renderCanvas, syncUiMeta])

  const handleRestart = useCallback(() => {
    const next = restartLevel(stateRef.current, calmRef.current)
    stateRef.current = next
    pointerRef.current = null
    syncUiMeta(next)
    renderCanvas()
    cue('undo', 0.5)
    haptic('light')
    persist(next, true)
  }, [cue, haptic, persist, renderCanvas, syncUiMeta])

  const handlePauseChange = useCallback(
    (nextPaused: boolean) => {
      if (nextPaused) {
        pointerRef.current = null
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

  const toNormX = useCallback((clientX: number): number => {
    const el = frameRef.current
    if (!el) return 0.5
    const r = el.getBoundingClientRect()
    return (clientX - r.left) / Math.max(1, r.width)
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (pausedRef.current || stateRef.current.solved) return
      if (pointerRef.current !== null) return

      e.currentTarget.setPointerCapture(e.pointerId)
      const wasAttached = stateRef.current.ball.attached
      pointerRef.current = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        wasAttached,
      }

      // While ball is in flight, jump paddle smoothly to touch X immediately.
      if (!wasAttached) {
        const next = setPaddleX(stateRef.current, toNormX(e.clientX))
        if (next !== stateRef.current) {
          stateRef.current = next
          renderCanvas()
        }
      }
    },
    [renderCanvas, toNormX],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const active = pointerRef.current
      if (pausedRef.current || !active || active.id !== e.pointerId) return

      if (!active.moved) {
        const dist = Math.hypot(e.clientX - active.startX, e.clientY - active.startY)
        if (dist >= TAP_DRAG_THRESHOLD_PX) {
          active.moved = true
        }
      }

      if (active.moved || !active.wasAttached) {
        const next = setPaddleX(stateRef.current, toNormX(e.clientX))
        if (next !== stateRef.current) {
          stateRef.current = next
          renderCanvas()
        }
      }
    },
    [renderCanvas, toNormX],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const active = pointerRef.current
      if (!active || active.id !== e.pointerId) return
      pointerRef.current = null

      if (!pausedRef.current && active.wasAttached && !active.moved && stateRef.current.ball.attached) {
        handleLaunch()
      }
    },
    [handleLaunch],
  )

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current?.id === e.pointerId) {
      pointerRef.current = null
    }
  }, [])

  const steerBy = useCallback(
    (dx: number) => {
      if (pausedRef.current || stateRef.current.solved) return
      const next = nudgePaddle(stateRef.current, dx)
      if (next !== stateRef.current) {
        stateRef.current = next
        renderCanvas()
      }
    },
    [renderCanvas],
  )

  // Keyboard steering (ArrowLeft / ArrowRight / A / D)
  useKeys(
    {
      ArrowLeft: () => steerBy(-KEY_NUDGE_STEP),
      a: () => steerBy(-KEY_NUDGE_STEP),
      A: () => steerBy(-KEY_NUDGE_STEP),
      ArrowRight: () => steerBy(KEY_NUDGE_STEP),
      d: () => steerBy(KEY_NUDGE_STEP),
      D: () => steerBy(KEY_NUDGE_STEP),
    },
    !paused,
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
      gameId="chime"
      stats={[
        { label: 'Level', value: uiMeta.levelNumber },
        { label: 'Blocks', value: uiMeta.blocksRemaining },
        { label: 'Score', value: uiMeta.score },
      ]}
      paused={paused}
      onPauseChange={handlePauseChange}
      onRestart={handleRestart}
      onExit={handleExit}
      howTo={
        <>
          <p>Tap anywhere or press Space to release the brass ball from the paddle.</p>
          <p>Drag across the court to guide it back up. Missing the ball gently returns it to your paddle.</p>
        </>
      }
    >
      <div ref={frameRef} className="chime-frame">
        <canvas
          ref={canvasRef}
          className="chime-canvas"
          role="application"
          aria-label="Chime breakout court"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        />
      </div>

      <Completion
        open={uiMeta.solved}
        title={`Cleared · ${uiMeta.patternName}`}
        line={`Score ${uiMeta.score}`}
        actionLabel="Next wall"
        onAction={handleNextLevel}
      />
    </GameShell>
  )
}
