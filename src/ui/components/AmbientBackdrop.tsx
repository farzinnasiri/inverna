import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { isSilent, normalizeBand, presetById, type Mix } from '@/core/sound/catalog'
import { useTokenColors } from '../hooks/useTokenColors'
import { useSettings } from '../state/settings'
import { useSound } from '../state/sound'

/**
 * Full-screen reactive nocturnal atmosphere behind the entire app.
 * Reacts live to the currently playing sound (full calm presence) AND softly
 * previews the user's chosen sleep soundscape when paused (pure #000 if Silence).
 * - Rain: crisp falling rain streaks + gentle bottom-edge surface ripples
 * - Waves: graceful layered undulating ocean wave lines across the lower screen
 * - Hearth: warm antique-brass embers rising slowly with gentle sway
 * - Wind: long sweeping horizontal breeze ribbons
 * - Binaural / noise: slow 10s breathing atmospheric rings
 */
export function AmbientBackdrop() {
  const playing = useSound((s) => s.playing)
  const activeMix = useSound((s) => s.mix)
  const sessionPreset = useSettings((s) => s.sessionPreset)
  const savedMix = useSettings((s) => s.mix)
  const tokens = useTokenColors()
  const reduceMotion = useReducedMotion() ?? false

  const displayMix: Mix | null = playing
    ? activeMix
    : sessionPreset
      ? (presetById(sessionPreset)?.mix ?? null)
      : !isSilent(savedMix)
        ? savedMix
        : null

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mixRef = useRef<Mix | null>(displayMix)
  mixRef.current = displayMix
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

    const rainDrops = Array.from({ length: 82 }, (_, i) => ({
      x: ((i * 73.13 + 11) % 100) / 100,
      y: ((i * 37.91 + 7) % 100) / 100,
      len: 14 + (i % 6) * 5,
      speed: 0.34 + (i % 7) * 0.06,
      alpha: 0.22 + (i % 4) * 0.08,
    }))

    const splashRings = Array.from({ length: 7 }, (_, i) => ({
      x: 0.12 + ((i * 31.7) % 76) / 100,
      y: 0.78 + ((i * 19.3) % 18) / 100,
      phase: (i / 7) * Math.PI * 2,
    }))

    const embers = Array.from({ length: 24 }, (_, i) => ({
      x: 0.08 + ((i * 41.7) % 84) / 100,
      y: ((i * 61.3) % 100) / 100,
      r: 1.3 + (i % 3) * 0.7,
      speed: 0.025 + (i % 5) * 0.008,
      phase: i * 1.4,
    }))

    const windArcs = Array.from({ length: 10 }, (_, i) => ({
      x: ((i * 29.3) % 100) / 100,
      y: 0.1 + (i / 10) * 0.8,
      len: 110 + (i % 3) * 65,
      speed: 0.045 + (i % 4) * 0.015,
      amp: 8 + (i % 3) * 5,
    }))

    let raf = 0
    let last = performance.now()
    let accum = 0
    let t = 0
    let intensity = 0

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (document.hidden) {
        last = now
        return
      }
      const dt = Math.min(100, now - last)
      last = now
      accum += dt
      if (accum < 32) return
      const stepSec = accum / 1000
      accum = 0

      // Full presence when playing; soft subtle presence for the chosen preset when idle
      const targetIntensity = mixRef.current ? (playingRef.current ? 1 : 0.48) : 0
      intensity += (targetIntensity - intensity) * Math.min(1, stepSec * 2.5)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      if (intensity < 0.01 || !mixRef.current) return

      const m = mixRef.current
      const tk = tokensRef.current
      const motionMul = reduceMotion ? 0 : playingRef.current ? 1 : 0.6
      t += stepSec * motionMul

      const rain = m.layers.rain ?? 0
      const waves = m.layers.waves ?? 0
      const fire = m.layers.fire ?? 0
      const wind = m.layers.wind ?? 0
      const noise = Math.max(m.layers.brown ?? 0, m.layers.pink ?? 0, m.layers.white ?? 0)
      const band = normalizeBand(m.band)

      // 1. Rain — crisp angled rain streaks + faint splash rings near bottom
      if (rain > 0.02) {
        const count = Math.ceil(rain * rainDrops.length)
        ctx.strokeStyle = tk.color.ink2
        ctx.lineWidth = 1
        ctx.lineCap = 'round'
        for (let i = 0; i < count; i++) {
          const d = rainDrops[i]!
          d.y = (d.y + d.speed * stepSec * motionMul) % 1.08
          const x = d.x * w
          const y = (d.y - 0.04) * h
          ctx.globalAlpha = d.alpha * rain * intensity
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x - 2, y + d.len)
          ctx.stroke()
        }

        ctx.strokeStyle = tk.pieces.clay
        ctx.lineWidth = 1
        for (const sp of splashRings) {
          const p = ((t * 0.42 + sp.phase) % 1 + 1) % 1
          ctx.globalAlpha = (1 - p) * 0.22 * rain * intensity
          ctx.beginPath()
          ctx.ellipse(sp.x * w, sp.y * h, 4 + p * 22, 1.5 + p * 7, 0, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // 2. Waves — graceful layered slow-breathing ocean wave ribbons
      if (waves > 0.02) {
        ctx.lineWidth = 1.25
        for (let wIdx = 0; wIdx < 4; wIdx++) {
          ctx.strokeStyle = wIdx % 2 === 0 ? tk.pieces.clay : tk.color.ink3
          const baseY = h * (0.68 + wIdx * 0.075)
          const amp = (12 + wIdx * 5) * waves
          const freq = 0.0042 + wIdx * 0.0011
          const phase = t * (0.38 + wIdx * 0.08) + wIdx * 1.9
          ctx.globalAlpha = (0.34 - wIdx * 0.06) * waves * intensity
          ctx.beginPath()
          for (let x = 0; x <= w; x += 20) {
            const y = baseY + Math.sin(x * freq + phase) * amp
            if (x === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
        }
      }

      // 3. Hearth — antique-brass embers rising smoothly across the room
      if (fire > 0.02) {
        const count = Math.ceil(fire * embers.length)
        ctx.fillStyle = tk.color.accent
        for (let i = 0; i < count; i++) {
          const e = embers[i]!
          e.y -= e.speed * stepSec * motionMul
          if (e.y < -0.05) e.y = 1.05
          const sway = Math.sin(t * 0.75 + e.phase) * 18
          const flicker = 0.55 + 0.45 * Math.sin(t * 2.1 + e.phase * 2)
          const fadeVert = Math.sin(Math.min(1, Math.max(0, e.y)) * Math.PI)
          ctx.globalAlpha = 0.45 * fire * flicker * fadeVert * intensity
          ctx.beginPath()
          ctx.arc(e.x * w + sway, e.y * h, e.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // 4. Wind — long sweeping horizontal air currents
      if (wind > 0.02) {
        ctx.strokeStyle = tk.color.ink3
        ctx.lineWidth = 1.1
        for (let i = 0; i < windArcs.length; i++) {
          const a = windArcs[i]!
          a.x = (a.x + a.speed * stepSec * motionMul) % 1.35
          const sx = (a.x - 0.18) * w
          const sy = a.y * h
          ctx.globalAlpha = 0.28 * wind * intensity
          ctx.beginPath()
          ctx.moveTo(sx, sy)
          ctx.quadraticCurveTo(sx + a.len * 0.5, sy - a.amp, sx + a.len, sy)
          ctx.stroke()
        }
      }

      // 5. Binaural / Deep Noise — slow 10s breathing concentric rings
      if (band || noise > 0.05) {
        const breath = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 10)
        const baseR = Math.min(w, h) * (0.28 + breath * 0.09)
        ctx.strokeStyle = band ? tk.color.accentDim : tk.color.ink4
        ctx.lineWidth = 1.1
        ctx.globalAlpha = (band ? 0.26 : 0.16 * noise) * intensity
        ctx.beginPath()
        ctx.arc(w * 0.5, h * 0.45, baseR, 0, Math.PI * 2)
        ctx.stroke()

        if (band) {
          ctx.globalAlpha = 0.12 * intensity
          ctx.beginPath()
          ctx.arc(w * 0.5, h * 0.45, baseR * 1.34, 0, Math.PI * 2)
          ctx.stroke()
        }
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
