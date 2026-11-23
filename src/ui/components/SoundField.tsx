import { useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { normalizeBand, type LayerId, type Mix } from '@/core/sound/catalog'
import { duration, type ResolvedTokens } from '@/design/tokens'
import { useTokenColors } from '../hooks/useTokenColors'

export interface SoundFieldProps {
  mix: Mix
  playing: boolean
  label: string
  size?: number
  onTogglePlay: () => void
  onSwipe?: (dir: -1 | 1) => void
}

const MAX_RAIN = 70
const MAX_FIRE = 10
const MAX_WIND = 9
const MAX_BROWN = 28
const MAX_PINK = 48
const MAX_WHITE = 84
const FRAME_MS = 1000 / 30

interface RainDrop {
  x: number
  y0: number
  len: number
  speed: number
  tier: number
}

interface FireMote {
  x0: number
  y0: number
  r: number
  speed: number
  swayAmp: number
  swayFreq: number
  flickerFreq: number
  phase: number
}

interface WindArc {
  x0: number
  y: number
  len: number
  amp: number
  speed: number
  phase: number
}

interface GrainDot {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  phase: number
}

interface VisualGains {
  rain: number
  waves: number
  fire: number
  wind: number
  brown: number
  pink: number
  white: number
  band: number
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function createPools() {
  const rand = mulberry32(0x1011a5)

  const rain: RainDrop[] = Array.from({ length: MAX_RAIN }, () => ({
    x: rand(),
    y0: rand(),
    len: 7 + rand() * 10,
    speed: 0.28 + rand() * 0.24,
    tier: rand(),
  }))

  const fire: FireMote[] = Array.from({ length: MAX_FIRE }, () => ({
    x0: 0.22 + rand() * 0.56,
    y0: rand(),
    r: 1.5 + rand() * 1.7,
    speed: 0.055 + rand() * 0.05,
    swayAmp: 0.02 + rand() * 0.035,
    swayFreq: 0.5 + rand() * 0.7,
    flickerFreq: 1.1 + rand() * 1.4,
    phase: rand() * Math.PI * 2,
  }))

  const wind: WindArc[] = Array.from({ length: MAX_WIND }, () => ({
    x0: rand(),
    y: 0.18 + rand() * 0.64,
    len: 0.36 + rand() * 0.34,
    amp: 4 + rand() * 8,
    speed: 0.045 + rand() * 0.04,
    phase: rand() * Math.PI * 2,
  }))

  const makeGrain = (count: number, minR: number, maxR: number, speedScale: number): GrainDot[] =>
    Array.from({ length: count }, () => ({
      x: rand(),
      y: rand(),
      r: minR + rand() * (maxR - minR),
      vx: (rand() - 0.5) * 0.014 * speedScale,
      vy: (0.004 + rand() * 0.01) * speedScale,
      phase: rand() * Math.PI * 2,
    }))

  return {
    rain,
    fire,
    wind,
    brown: makeGrain(MAX_BROWN, 2.0, 3.6, 0.55),
    pink: makeGrain(MAX_PINK, 1.1, 2.0, 0.85),
    white: makeGrain(MAX_WHITE, 0.65, 1.15, 1.15),
  }
}

const POOLS = createPools()

function mixToGains(mix: Mix): VisualGains {
  const g = (id: LayerId) => Math.max(0, Math.min(1, mix.layers[id] ?? 0))
  const band = normalizeBand(mix.band) ? Math.max(0.25, Math.min(1, mix.bandGain || 0.35)) : 0
  return {
    rain: g('rain'),
    waves: g('waves'),
    fire: g('fire'),
    wind: g('wind'),
    brown: g('brown'),
    pink: g('pink'),
    white: g('white'),
    band,
  }
}

function wrap01(v: number): number {
  const m = v % 1
  return m < 0 ? m + 1 : m
}

function drawField(
  ctx: CanvasRenderingContext2D,
  size: number,
  t: number,
  gains: VisualGains,
  tokens: ResolvedTokens,
) {
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2

  ctx.save()
  ctx.clearRect(0, 0, size, size)

  // Clip everything to the circular orb
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.clip()

  // Base orb surface
  ctx.fillStyle = tokens.color.surface1
  ctx.fillRect(0, 0, size, size)

  // Subtle radial vignette inside the generative visual
  const vig = ctx.createRadialGradient(cx, cy * 0.92, radius * 0.25, cx, cy, radius)
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)')
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.42)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, size, size)

  const { ink3, ink4, accent } = tokens.color
  const { bone } = tokens.pieces

  // 1. Noise grain layers (brown = larger/sparser, pink = medium, white = finer/denser)
  if (gains.brown > 0.01) {
    const count = Math.max(3, Math.round(gains.brown * MAX_BROWN))
    ctx.fillStyle = ink4
    for (let i = 0; i < count; i++) {
      const d = POOLS.brown[i]!
      const x = wrap01(d.x + d.vx * t + Math.sin(t * 0.25 + d.phase) * 0.012) * size
      const y = wrap01(d.y + d.vy * t) * size
      const pulse = 0.72 + 0.28 * Math.sin(t * 0.4 + d.phase)
      ctx.globalAlpha = gains.brown * 0.24 * pulse
      ctx.beginPath()
      ctx.arc(x, y, d.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  if (gains.pink > 0.01) {
    const count = Math.max(5, Math.round(gains.pink * MAX_PINK))
    ctx.fillStyle = ink3
    for (let i = 0; i < count; i++) {
      const d = POOLS.pink[i]!
      const x = wrap01(d.x + d.vx * t) * size
      const y = wrap01(d.y + d.vy * t) * size
      const pulse = 0.7 + 0.3 * Math.sin(t * 0.65 + d.phase)
      ctx.globalAlpha = gains.pink * 0.22 * pulse
      ctx.beginPath()
      ctx.arc(x, y, d.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  if (gains.white > 0.01) {
    const count = Math.max(8, Math.round(gains.white * MAX_WHITE))
    ctx.fillStyle = bone
    for (let i = 0; i < count; i++) {
      const d = POOLS.white[i]!
      const x = wrap01(d.x + d.vx * t) * size
      const y = wrap01(d.y + d.vy * t) * size
      const pulse = 0.6 + 0.4 * Math.sin(t * 1.1 + d.phase)
      ctx.globalAlpha = gains.white * 0.19 * pulse
      ctx.beginPath()
      ctx.arc(x, y, d.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 2. Binaural band: one soft concentric ring breathing on the 10s breath cycle
  if (gains.band > 0.01) {
    const breathSec = duration.breath / 1000 // 10s
    const breath = 0.5 - 0.5 * Math.cos((t / breathSec) * Math.PI * 2) // 0..1 smooth
    const ringR = size * (0.22 + breath * 0.075)
    ctx.strokeStyle = bone
    ctx.lineWidth = 1.25
    ctx.globalAlpha = (0.14 + breath * 0.18) * gains.band
    ctx.beginPath()
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
    ctx.stroke()

    ctx.strokeStyle = ink3
    ctx.lineWidth = 1
    ctx.globalAlpha = (0.08 + (1 - breath) * 0.1) * gains.band
    ctx.beginPath()
    ctx.arc(cx, cy, ringR * 0.66, 0, Math.PI * 2)
    ctx.stroke()
  }

  // 3. Wind: long thin horizontal drift arcs
  if (gains.wind > 0.01) {
    const count = Math.max(2, Math.round(gains.wind * MAX_WIND))
    ctx.lineWidth = 1
    ctx.lineCap = 'round'
    for (let i = 0; i < count; i++) {
      const a = POOLS.wind[i]!
      const progress = wrap01(a.x0 + t * a.speed)
      const fade = Math.sin(progress * Math.PI) // soft fade at left/right edges
      const span = a.len * size
      const startX = -span * 0.4 + progress * (size + span * 0.8) - span * 0.5
      const baseY = a.y * size + Math.sin(t * 0.35 + a.phase) * 4
      const midX = startX + span * 0.5
      const ctrlY = baseY - a.amp * Math.cos(t * 0.3 + a.phase)

      ctx.strokeStyle = i % 2 === 0 ? ink3 : ink4
      ctx.globalAlpha = gains.wind * fade * (i % 2 === 0 ? 0.36 : 0.28)
      ctx.beginPath()
      ctx.moveTo(startX, baseY)
      ctx.quadraticCurveTo(midX, ctrlY, startX + span, baseY)
      ctx.stroke()
    }
  }

  // 4. Waves: 2–3 slow sine wave ribbons across the lower third (period 8–12s)
  if (gains.waves > 0.01) {
    const ribbons = [
      { baseY: 0.64, amp: 8.5, period: 11.8, freq: 1.4, phase: 0.4, color: ink4, alpha: 0.32, fill: 0.035 },
      { baseY: 0.73, amp: 10, period: 9.8, freq: 1.7, phase: 2.1, color: ink3, alpha: 0.42, fill: 0.045 },
      { baseY: 0.82, amp: 7.5, period: 8.4, freq: 2.0, phase: 4.0, color: bone, alpha: 0.28, fill: 0.04 },
    ]
    const count = gains.waves > 0.35 ? 3 : 2
    for (let i = 0; i < count; i++) {
      const rb = ribbons[i]!
      const phaseShift = (t / rb.period) * Math.PI * 2 + rb.phase
      const yBase = rb.baseY * size
      const amp = rb.amp * (0.45 + 0.55 * gains.waves)

      ctx.beginPath()
      const steps = 44
      for (let s = 0; s <= steps; s++) {
        const u = s / steps
        const x = u * size
        const y =
          yBase +
          Math.sin(u * Math.PI * 2 * rb.freq + phaseShift) * amp +
          Math.sin(u * Math.PI * 2 * (rb.freq * 0.55) - phaseShift * 0.65) * (amp * 0.35)
        if (s === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }

      ctx.strokeStyle = rb.color
      ctx.lineWidth = 1.2
      ctx.globalAlpha = rb.alpha * gains.waves
      ctx.stroke()

      // Soft ribbon depth below the crest
      ctx.lineTo(size, size)
      ctx.lineTo(0, size)
      ctx.closePath()
      ctx.fillStyle = rb.color
      ctx.globalAlpha = rb.fill * gains.waves
      ctx.fill()
    }
  }

  // 5. Rain: short 1px vertical falling strokes (up to 70)
  if (gains.rain > 0.01) {
    const count = Math.max(4, Math.round(gains.rain * MAX_RAIN))
    ctx.lineWidth = 1
    ctx.lineCap = 'round'
    for (let i = 0; i < count; i++) {
      const d = POOLS.rain[i]!
      const x = d.x * size
      const y = wrap01(d.y0 + t * d.speed) * (size + d.len) - d.len
      ctx.strokeStyle = d.tier > 0.72 ? bone : d.tier > 0.3 ? ink3 : ink4
      ctx.globalAlpha = gains.rain * (d.tier > 0.72 ? 0.34 : d.tier > 0.3 ? 0.3 : 0.22)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x, y + d.len)
      ctx.stroke()
    }
  }

  // 6. Fire: soft rising warm motes in accent with gentle flicker (up to 10)
  if (gains.fire > 0.01) {
    const count = Math.max(2, Math.round(gains.fire * MAX_FIRE))
    ctx.fillStyle = accent
    for (let i = 0; i < count; i++) {
      const m = POOLS.fire[i]!
      const life = wrap01(m.y0 + t * m.speed) // 0 at bottom -> 1 near top
      const fade = Math.sin(life * Math.PI)
      const flicker = 0.62 + 0.38 * Math.sin(t * m.flickerFreq * Math.PI + m.phase)
      const y = size * (0.9 - life * 0.66)
      const x = (m.x0 + Math.sin(t * m.swayFreq + m.phase) * m.swayAmp) * size
      const alpha = gains.fire * fade * flicker

      // Soft outer mote halo
      ctx.globalAlpha = alpha * 0.18
      ctx.beginPath()
      ctx.arc(x, y, m.r * 2.5, 0, Math.PI * 2)
      ctx.fill()

      // Warm core
      ctx.globalAlpha = alpha * 0.76
      ctx.beginPath()
      ctx.arc(x, y, m.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Quiet stillness ring when completely silent
  const totalEnergy =
    gains.rain + gains.waves + gains.fire + gains.wind + gains.brown + gains.pink + gains.white + gains.band
  if (totalEnergy < 0.01) {
    ctx.strokeStyle = ink4
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.32
    ctx.beginPath()
    ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.restore()
}

export function SoundField({ mix, playing, label, size = 260, onTogglePlay, onSwipe }: SoundFieldProps) {
  const tokens = useTokenColors()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tokensRef = useRef(tokens)
  const targetGainsRef = useRef<VisualGains>(mixToGains(mix))
  const currentGainsRef = useRef<VisualGains>(mixToGains(mix))
  const simTimeRef = useRef(4.2)

  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )

  const [dragX, setDragX] = useState(0)
  const gestureRef = useRef<{
    pointerId: number | null
    startX: number
    startY: number
    dragging: boolean
    suppressClick: boolean
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    dragging: false,
    suppressClick: false,
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReducedMotion(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const targetGains = useMemo(() => mixToGains(mix), [mix])
  tokensRef.current = tokens
  targetGainsRef.current = targetGains

  // Size backing store (DPR capped at 2) and run ~30fps loop while playing
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pixelSize = Math.round(size * dpr)
    if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
      canvas.width = pixelSize
      canvas.height = pixelSize
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (!playing || reducedMotion) return

    let rafId = 0
    let lastDraw = performance.now()
    let hidden = typeof document !== 'undefined' && document.hidden

    const step = (now: number) => {
      if (hidden) return
      rafId = window.requestAnimationFrame(step)

      const elapsed = now - lastDraw
      if (elapsed < FRAME_MS) return
      const dt = Math.min(0.1, elapsed / 1000)
      lastDraw = now
      simTimeRef.current += dt

      // Smooth visual crossfade toward target mix gains
      const k = 1 - Math.exp(-dt * 4.5)
      const cur = currentGainsRef.current
      const tgt = targetGainsRef.current
      cur.rain += (tgt.rain - cur.rain) * k
      cur.waves += (tgt.waves - cur.waves) * k
      cur.fire += (tgt.fire - cur.fire) * k
      cur.wind += (tgt.wind - cur.wind) * k
      cur.brown += (tgt.brown - cur.brown) * k
      cur.pink += (tgt.pink - cur.pink) * k
      cur.white += (tgt.white - cur.white) * k
      cur.band += (tgt.band - cur.band) * k

      drawField(ctx, size, simTimeRef.current, cur, tokensRef.current)
    }

    const onVisibility = () => {
      hidden = document.hidden
      if (hidden) {
        window.cancelAnimationFrame(rafId)
      } else {
        lastDraw = performance.now()
        rafId = window.requestAnimationFrame(step)
      }
    }

    drawField(ctx, size, simTimeRef.current, currentGainsRef.current, tokensRef.current)
    if (!hidden) rafId = window.requestAnimationFrame(step)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.cancelAnimationFrame(rafId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [playing, reducedMotion, size])

  // Render static frozen frame when stopped or when reduced motion is active
  useEffect(() => {
    if (playing && !reducedMotion) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    currentGainsRef.current = { ...targetGains }
    drawField(ctx, size, simTimeRef.current, currentGainsRef.current, tokens)
  }, [playing, reducedMotion, size, targetGains, tokens])

  return (
    <div className="sound-orb-stage">
      <button
        type="button"
        className="sound-orb"
        style={{
          width: size,
          height: size,
          transform: dragX !== 0 ? `translateX(${dragX}px)` : undefined,
        }}
        data-playing={playing}
        data-dragging={dragX !== 0}
        aria-label={playing ? `Stop ${label}` : `Play ${label}`}
        aria-pressed={playing}
        onPointerDown={(e) => {
          gestureRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            dragging: false,
            suppressClick: false,
          }
        }}
        onPointerMove={(e) => {
          const g = gestureRef.current
          if (g.pointerId !== e.pointerId) return
          const dx = e.clientX - g.startX
          const dy = e.clientY - g.startY
          if (!g.dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
            g.dragging = true
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {
              // ignore if synthetic pointer
            }
          }
          if (g.dragging) {
            const clamped = Math.max(-16, Math.min(16, dx * 0.25))
            setDragX(clamped)
          }
        }}
        onPointerUp={(e) => {
          const g = gestureRef.current
          if (g.pointerId !== e.pointerId) return
          const dx = e.clientX - g.startX
          const dy = e.clientY - g.startY
          const wasSwipe = Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy) * 1.2
          g.pointerId = null
          g.dragging = false
          setDragX(0)
          if (wasSwipe) {
            g.suppressClick = true
            onSwipe?.(dx < 0 ? 1 : -1)
          }
        }}
        onPointerCancel={() => {
          gestureRef.current.pointerId = null
          gestureRef.current.dragging = false
          setDragX(0)
        }}
        onClick={() => {
          if (gestureRef.current.suppressClick) {
            gestureRef.current.suppressClick = false
            return
          }
          onTogglePlay()
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            onSwipe?.(1)
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault()
            onSwipe?.(-1)
          }
        }}
      >
        <canvas ref={canvasRef} className="sound-orb__canvas" width={size} height={size} aria-hidden />
        <span className="sound-orb__play" aria-hidden>
          <Play size={24} strokeWidth={1.5} />
        </span>
      </button>
    </div>
  )
}
