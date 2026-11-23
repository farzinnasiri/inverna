import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { normalizeBand, type Mix } from '@/core/sound/catalog'
import { useTokenColors } from '../hooks/useTokenColors'
import { useSound } from '../state/sound'

/**
 * Full-screen reactive nocturnal atmosphere behind the entire app.
 * Changes gently based on the active sound mix:
 * - Rain: whisper-thin raindrops drifting across the full screen
 * - Waves: slow undulating tide lines near the bottom
 * - Hearth: sparse dim brass motes drifting upward
 * - Wind: long faint horizontal air currents
 * - Binaural / noise: subtle breathing horizon rings
 * Purely ambient (low alpha, pointer-events: none, paused when hidden or silent).
 */
export function AmbientBackdrop() {
  const playing = useSound((s) => s.playing)
  const mix = useSound((s) => s.mix)
  const tokens = useTokenColors()
  const reduceMotion = useReducedMotion() ?? false

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mixRef = useRef<Mix | null>(mix)
  mixRef.current = mix
  const playingRef = useRef(playing)
  playingRef.current = playing
  const tokensRef = useRef(tokens)
  tokensRef.current = tokens

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = window.innerWidth
    let h = window.innerHeight
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5)

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    // Deterministic particles
    const rainDrops = Array.from({ length: 64 }, (_, i) => ({
      x: ((i * 73.13) % 100) / 100,
      y: ((i * 37.91) % 100) / 100,
      len: 10 + (i % 5) * 4,
      speed: 0.24 + (i % 7) * 0.045,
      alpha: 0.08 + (i % 4) * 0.035,
    }))

    const embers = Array.from({ length: 18 }, (_, i) => ({
      x: 0.1 + ((i * 41.7) % 80) / 100,
      y: ((i * 61.3) % 100) / 100,
      r: 1.1 + (i % 3) * 0.55,
      speed: 0.018 + (i % 5) * 0.006,
      phase: i * 1.4,
    }))

    const windArcs = Array.from({ length: 8 }, (_, i) => ({
      x: ((i * 29.3) % 100) / 100,
      y: 0.14 + (i / 8) * 0.72,
      len: 90 + (i % 3) * 55,
      speed: 0.035 + (i % 4) * 0.012,
      amp: 6 + (i % 3) * 4,
    }))

    let raf = 0
    let last = performance.now()
    let accum = 0
    let t = 0
    let visibleAlpha = 0

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (document.hidden) {
        last = now
        return
      }
      const dt = Math.min(100, now - last)
      last = now
      accum += dt
      if (accum < 33) return // ~30fps cap
      const stepSec = accum / 1000
      accum = 0

      const targetAlpha = playingRef.current ? 1 : 0
      visibleAlpha += (targetAlpha - visibleAlpha) * Math.min(1, stepSec * 2.2)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      if (visibleAlpha < 0.01 || !mixRef.current) return

      const m = mixRef.current
      const tk = tokensRef.current
      const speedMul = reduceMotion ? 0 : 1
      t += stepSec * speedMul

      const rain = m.layers.rain ?? 0
      const waves = m.layers.waves ?? 0
      const fire = m.layers.fire ?? 0
      const wind = m.layers.wind ?? 0
      const noise = Math.max(m.layers.brown ?? 0, m.layers.pink ?? 0, m.layers.white ?? 0)
      const band = normalizeBand(m.band)

      // 1. Rain — whisper-thin angled rain streaks across the night
      if (rain > 0.02) {
        const count = Math.ceil(rain * rainDrops.length)
        ctx.strokeStyle = tk.color.ink2
        ctx.lineWidth = 1
        ctx.lineCap = 'round'
        for (let i = 0; i < count; i++) {
          const d = rainDrops[i]!
          d.y = (d.y + d.speed * stepSec * speedMul) % 1.06
          const x = d.x * w
          const y = (d.y - 0.03) * h
          ctx.globalAlpha = d.alpha * rain * visibleAlpha * 1.15
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x - 1.5, y + d.len)
          ctx.stroke()
        }
      }

      // 2. Waves — slow breathing tide ribbons in lower third
      if (waves > 0.02) {
        ctx.strokeStyle = tk.pieces.clay
        ctx.lineWidth = 1.2
        for (let wIdx = 0; wIdx < 3; wIdx++) {
          const baseY = h * (0.74 + wIdx * 0.075)
          const amp = (10 + wIdx * 5) * waves
          const freq = 0.0045 + wIdx * 0.0012
          const phase = t * (0.36 + wIdx * 0.09) + wIdx * 2.1
          ctx.globalAlpha = (0.16 - wIdx * 0.035) * waves * visibleAlpha
          ctx.beginPath()
          for (let x = 0; x <= w; x += 24) {
            const y = baseY + Math.sin(x * freq + phase) * amp
            if (x === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
        }
      }

      // 3. Hearth — sparse dim antique-brass embers rising slowly
      if (fire > 0.02) {
        const count = Math.ceil(fire * embers.length)
        ctx.fillStyle = tk.color.accent
        for (let i = 0; i < count; i++) {
          const e = embers[i]!
          e.y -= e.speed * stepSec * speedMul
          if (e.y < -0.05) e.y = 1.05
          const sway = Math.sin(t * 0.7 + e.phase) * 14
          const flicker = 0.55 + 0.45 * Math.sin(t * 1.8 + e.phase * 2)
          const fadeVert = Math.sin(Math.min(1, Math.max(0, e.y)) * Math.PI)
          ctx.globalAlpha = 0.24 * fire * flicker * fadeVert * visibleAlpha
          ctx.beginPath()
          ctx.arc(e.x * w + sway, e.y * h, e.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // 4. Wind — faint sweeping horizontal air currents
      if (wind > 0.02) {
        ctx.strokeStyle = tk.color.ink3
        ctx.lineWidth = 1
        for (let i = 0; i < windArcs.length; i++) {
          const a = windArcs[i]!
          a.x = (a.x + a.speed * stepSec * speedMul) % 1.3
          const sx = (a.x - 0.15) * w
          const sy = a.y * h
          ctx.globalAlpha = 0.16 * wind * visibleAlpha
          ctx.beginPath()
          ctx.moveTo(sx, sy)
          ctx.quadraticCurveTo(sx + a.len * 0.5, sy - a.amp, sx + a.len, sy)
          ctx.stroke()
        }
      }

      // 5. Binaural / Deep Noise — quiet breathing atmospheric contour
      if (band || noise > 0.05) {
        const breath = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 10)
        const baseR = Math.min(w, h) * (0.28 + breath * 0.08)
        ctx.strokeStyle = band ? tk.color.accentDim : tk.color.ink4
        ctx.lineWidth = 1
        ctx.globalAlpha = (band ? 0.14 : 0.08 * noise) * visibleAlpha
        ctx.beginPath()
        ctx.arc(w * 0.5, h * 0.44, baseR, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.globalAlpha = 1
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [reduceMotion])

  return <canvas ref={canvasRef} className="ambient-backdrop" aria-hidden />
}
