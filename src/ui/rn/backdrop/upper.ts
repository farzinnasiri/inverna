/**
 * The upper half of each scene: crisp, faint structures of light that cross
 * the space where the sound orb sits, so its glass has something real to bend
 * (straight lines and points read as refraction; soft haze doesn't). Nocturne
 * already has this in its strings. Each other scene gets its own, from its own
 * world:
 *
 * - Theta rain: long streaks of rain falling past the window, lit from afar.
 * - Hearth: threads of smoke rising from the fire and curling apart.
 * - Lunar tide: the moon itself, with thin cloud passing it.
 * - Deep delta: each slow pulse as a fine ring of light, with a fainter echo.
 * - Still horizon: the wind made visible, long gust lines sliding across.
 * - Ink reverie: ink tendrils sinking from the surface.
 * - Adagio dusk: (in the field shader) the plate's lines, clearer up high.
 * - Starfield: star trails, arcs turning slowly around the dial.
 * - Amber study: the lamp beam's edges, and steam curling up inside it.
 * - Mist & pine: the moon behind mist, with veils drifting over it.
 * - Midnight cove: a distant lighthouse beam sweeping slowly across the sky.
 *
 * Everything is a pure function of scene time, so it costs nothing in the
 * simulation and stays in step through a scene change (`presence` fades each
 * piece with the transition front). Brightest at the orb's height, fading
 * toward the top and bottom, and kept faint: it is part of the scene first.
 */
import type { SkCanvas } from '@shopify/react-native-skia'
import { SCENE, SCENE_RGB } from '@/core/backdrop/scenes'
import { ORIGIN_X, ORIGIN_Y, presence, vnoise, type Sim } from '@/core/backdrop/sim'
import type { Gfx } from './draw'

const TAU = Math.PI * 2

function h1(n: number): number {
  'worklet'
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return v - Math.floor(v)
}

function setColor(g: Gfx, fill: boolean, scene: number, slot: number, a: number, mixWhite = 0): void {
  'worklet'
  const o = scene * 12 + slot * 3
  g.color[0] = SCENE_RGB[o]! + (1 - SCENE_RGB[o]!) * mixWhite
  g.color[1] = SCENE_RGB[o + 1]! + (1 - SCENE_RGB[o + 1]!) * mixWhite
  g.color[2] = SCENE_RGB[o + 2]! + (1 - SCENE_RGB[o + 2]!) * mixWhite
  g.color[3] = Math.min(1, Math.max(0, a))
  ;(fill ? g.fill : g.stroke).setColor(g.color)
}

/** SCENE_RGB slots: 0 caustic, 1 detail, 2 mid, 3 horizon. */
const CAUSTIC = 0
const DETAIL = 1

/** Strongest at the orb's height, fading above and below it. */
function focus(s: Sim, y: number): number {
  'worklet'
  const d = (y - ORIGIN_Y * s.H) / (0.34 * s.H)
  return 0.35 + 0.65 * Math.exp(-d * d)
}

/* ------------------------------------------------------------------ rain */

function rainStreaks(canvas: SkCanvas, s: Sim, g: Gfx): void {
  'worklet'
  const S = SCENE.rain
  const W = s.W
  const H = s.H
  g.stroke.setStrokeWidth(0.8)
  for (let i = 0; i < 30; i++) {
    const speed = H * (0.3 + 0.22 * h1(i + 3))
    const len = 36 + 60 * h1(i + 11)
    const span = H * 1.25
    const y = ((s.t * speed + h1(i + 5) * span) % span) - 0.12 * H
    const x = -0.04 * W + h1(i) * W * 1.08 + y * 0.09
    const pr = presence(s, S, x, y)
    if (pr < 0.02) continue
    const a = (0.05 + 0.09 * h1(i + 17)) * focus(s, y) * pr * s.intensity
    setColor(g, false, S, DETAIL, a)
    canvas.drawLine(x, y, x - len * 0.09, y - len, g.stroke)
  }
}

/* ---------------------------------------------------------------- hearth */

function smokeThreads(canvas: SkCanvas, s: Sim, g: Gfx): void {
  'worklet'
  const S = SCENE.hearth
  const W = s.W
  const H = s.H
  const SEG = 36
  g.stroke.setStrokeWidth(1)
  for (let k = 0; k < 5; k++) {
    const x0 = W * (0.34 + 0.08 * k + 0.04 * (h1(k) - 0.5))
    const ph = h1(k + 9) * TAU
    const bottom = H * 0.78
    const pr = presence(s, S, x0, H * 0.4)
    if (pr < 0.02) continue
    // Three pieces, brightest across the middle, so the thread fades in and out.
    for (let part = 0; part < 3; part++) {
      const path = g.pb
      for (let j = 0; j <= SEG / 3; j++) {
        const f = (part * (SEG / 3) + j) / SEG
        const y = bottom - f * bottom * 1.02
        const spread = 8 + 46 * f * f
        const x =
          x0 +
          Math.sin(f * 7.0 + s.t * 0.22 + ph) * spread +
          Math.sin(f * 15.0 - s.t * 0.31 + ph * 2.0) * spread * 0.25 +
          f * W * 0.06 * Math.sin(ph)
        if (j === 0) path.moveTo(x, y)
        else path.lineTo(x, y)
      }
      const a = (part === 1 ? 0.11 : 0.05) * pr * s.intensity
      setColor(g, false, S, DETAIL, a)
      canvas.drawPath(path.detach(), g.stroke)
    }
  }
}

/* ----------------------------------------------------------------- moons */

function moon(canvas: SkCanvas, s: Sim, g: Gfx, S: number, cx: number, cy: number, r: number, bright: number): void {
  'worklet'
  const pr = presence(s, S, cx, cy)
  if (pr < 0.02) return
  const k = pr * s.intensity
  setColor(g, true, S, DETAIL, 0.035 * bright * k, 0.2)
  canvas.drawCircle(cx, cy, r * 4.2, g.fill)
  setColor(g, true, S, DETAIL, 0.06 * bright * k, 0.35)
  canvas.drawCircle(cx, cy, r * 2.1, g.fill)
  setColor(g, true, S, DETAIL, 0.75 * bright * k, 0.55)
  canvas.drawCircle(cx, cy, r, g.fill)
}

function cloudVeils(canvas: SkCanvas, s: Sim, g: Gfx, S: number, y0: number, count: number, a: number): void {
  'worklet'
  const W = s.W
  g.stroke.setStrokeWidth(1)
  for (let i = 0; i < count; i++) {
    const y = y0 + (i - (count - 1) / 2) * s.H * 0.028 + Math.sin(s.t * 0.05 + i) * 4
    const len = W * (0.35 + 0.3 * h1(i + 40))
    const x = ((s.t * W * (0.008 + 0.006 * h1(i + 2)) + h1(i + 30) * W * 1.6) % (W * 1.6)) - 0.3 * W
    const pr = presence(s, S, x + len / 2, y)
    if (pr < 0.02) continue
    const path = g.pb
    for (let j = 0; j <= 10; j++) {
      const f = j / 10
      const px = x + f * len
      const py = y + Math.sin(f * 3.0 + i) * 3
      if (j === 0) path.moveTo(px, py)
      else path.lineTo(px, py)
    }
    setColor(g, false, S, DETAIL, a * pr * s.intensity * (0.6 + 0.4 * h1(i + 8)))
    canvas.drawPath(path.detach(), g.stroke)
  }
}

function tideMoon(canvas: SkCanvas, s: Sim, g: Gfx): void {
  'worklet'
  const S = SCENE.tide
  moon(canvas, s, g, S, s.W * 0.68, s.H * 0.2, s.W * 0.035, 1)
  cloudVeils(canvas, s, g, S, s.H * 0.21, 4, 0.09)
}

function mistMoon(canvas: SkCanvas, s: Sim, g: Gfx): void {
  'worklet'
  const S = SCENE.mist
  moon(canvas, s, g, S, s.W * 0.34, s.H * 0.19, s.W * 0.04, 0.7)
  cloudVeils(canvas, s, g, S, s.H * 0.22, 6, 0.07)
  cloudVeils(canvas, s, g, S, s.H * 0.36, 4, 0.05)
}

/* ----------------------------------------------------------------- delta */

function deltaRings(canvas: SkCanvas, s: Sim, g: Gfx): void {
  'worklet'
  const S = SCENE.delta
  const cx = ORIGIN_X * s.W
  const cy = ORIGIN_Y * s.H
  const pr = presence(s, S, cx, cy)
  if (pr < 0.02) return
  for (let echo = 0; echo < 2; echo++) {
    const p = (s.pulse + 1 - echo * 0.18) % 1
    const r = p * 1.9 * s.W
    if (r < 4) continue
    const a = Math.pow(1 - p, 1.5) * (echo === 0 ? 0.28 : 0.12) * pr * s.intensity
    g.stroke.setStrokeWidth(echo === 0 ? 1.1 : 0.8)
    setColor(g, false, S, CAUSTIC, a, 0.2)
    canvas.drawCircle(cx, cy, r, g.stroke)
  }
}

/* --------------------------------------------------------------- horizon */

function windLines(canvas: SkCanvas, s: Sim, g: Gfx): void {
  'worklet'
  const S = SCENE.horizon
  const W = s.W
  const H = s.H
  g.stroke.setStrokeWidth(0.9)
  for (let i = 0; i < 9; i++) {
    const y0 = H * (0.08 + 0.46 * h1(i + 1))
    const len = W * (0.4 + 0.35 * h1(i + 4))
    const speed = W * (0.05 + 0.04 * h1(i + 6))
    const travel = W + len * 2
    const head = ((s.t * speed + h1(i + 12) * travel) % travel) - len
    const pr = presence(s, S, head + len / 2, y0)
    if (pr < 0.02) continue
    // Three pieces: the gust thickens in the middle and thins at both ends.
    for (let part = 0; part < 3; part++) {
      const path = g.pb
      for (let j = 0; j <= 8; j++) {
        const f = (part * 8 + j) / 24
        const x = head + f * len
        const y = y0 + Math.sin(x * 0.012 + s.t * 0.4 + i) * 7 + Math.sin(x * 0.031 - s.t * 0.2) * 2.5
        if (j === 0) path.moveTo(x, y)
        else path.lineTo(x, y)
      }
      const a = (part === 1 ? 0.16 : 0.06) * focus(s, y0) * pr * s.intensity
      setColor(g, false, S, DETAIL, a)
      canvas.drawPath(path.detach(), g.stroke)
    }
  }
}

/* ------------------------------------------------------------------- ink */

function inkTendrils(canvas: SkCanvas, s: Sim, g: Gfx): void {
  'worklet'
  const S = SCENE.ink
  const W = s.W
  const H = s.H
  const CYCLE = 34
  g.stroke.setStrokeWidth(1.1)
  for (let k = 0; k < 5; k++) {
    const offset = h1(k + 3) * CYCLE
    const phase = ((s.t + offset) % CYCLE) / CYCLE
    const round = Math.floor((s.t + offset) / CYCLE)
    const x0 = W * (0.12 + 0.76 * h1(k * 7 + round * 13))
    const len = H * (0.18 + 0.5 * phase)
    const fade = Math.sin(Math.PI * phase)
    const pr = presence(s, S, x0, len / 2)
    if (pr < 0.02 || fade < 0.02) continue
    const path = g.pb
    const seg = 28
    for (let j = 0; j <= seg; j++) {
      const f = j / seg
      const y = f * len
      const curl = 6 + 26 * f * f
      const x = x0 + Math.sin(f * 5.0 + k + s.t * 0.05) * curl + (vnoise(k * 3.1, f * 4.0 + s.t * 0.03) - 0.5) * 20 * f
      if (j === 0) path.moveTo(x, y)
      else path.lineTo(x, y)
    }
    setColor(g, false, S, DETAIL, 0.2 * fade * pr * s.intensity)
    canvas.drawPath(path.detach(), g.stroke)
  }
}

/* ------------------------------------------------------------- starfield */

function starTrails(canvas: SkCanvas, s: Sim, g: Gfx): void {
  'worklet'
  const S = SCENE.starfield
  const cx = ORIGIN_X * s.W
  const cy = ORIGIN_Y * s.H
  const pr = presence(s, S, cx, cy)
  if (pr < 0.02) return
  const turn = s.t * 0.004
  g.stroke.setStrokeWidth(0.8)
  for (let i = 0; i < 26; i++) {
    const r = s.W * (0.1 + 0.95 * h1(i + 50))
    const start = h1(i + 60) * TAU + turn
    const sweep = 0.25 + 0.5 * h1(i + 70)
    const path = g.pb
    for (let j = 0; j <= 16; j++) {
      const a = start + (sweep * j) / 16
      const x = cx + Math.cos(a) * r
      const y = cy + Math.sin(a) * r
      if (j === 0) path.moveTo(x, y)
      else path.lineTo(x, y)
    }
    setColor(g, false, S, DETAIL, (0.07 + 0.13 * h1(i + 80)) * focus(s, cy + Math.sin(start) * r) * pr * s.intensity)
    canvas.drawPath(path.detach(), g.stroke)
  }
}

/* ----------------------------------------------------------------- amber */

function lampBeam(canvas: SkCanvas, s: Sim, g: Gfx): void {
  'worklet'
  const S = SCENE.amber
  const W = s.W
  const sx = -0.06 * W
  const sy = -0.1 * W
  const base = Math.atan2(0.85, 0.527)
  const pr = presence(s, S, W * 0.5, s.H * 0.35)
  if (pr < 0.02) return
  const k = pr * s.intensity
  // The beam's two edges, where the light is sharpest.
  g.stroke.setStrokeWidth(0.9)
  for (const side of [-1, 1]) {
    const a = base + side * 0.27
    const len = W * 1.9
    setColor(g, false, S, DETAIL, 0.07 * k)
    canvas.drawLine(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len, g.stroke)
  }
  // Steam curling up through the beam.
  g.stroke.setStrokeWidth(1)
  for (let i = 0; i < 3; i++) {
    const x0 = W * (0.42 + 0.14 * i)
    const path = g.pb
    for (let j = 0; j <= 20; j++) {
      const f = j / 20
      const y = s.H * (0.62 - 0.55 * f)
      const x = x0 + Math.sin(f * 6.0 + s.t * 0.25 + i * 2.0) * (6 + 30 * f) + f * 20
      if (j === 0) path.moveTo(x, y)
      else path.lineTo(x, y)
    }
    setColor(g, false, S, DETAIL, 0.06 * k)
    canvas.drawPath(path.detach(), g.stroke)
  }
}

/* ------------------------------------------------------------------ cove */

function lighthouse(canvas: SkCanvas, s: Sim, g: Gfx): void {
  'worklet'
  const S = SCENE.cove
  const W = s.W
  const H = s.H
  const pr = presence(s, S, W * 0.5, H * 0.3)
  if (pr < 0.02) return
  const k = pr * s.intensity
  // A few cold stars over the sea.
  for (let i = 0; i < 18; i++) {
    const x = W * h1(i + 90)
    const y = H * 0.48 * h1(i + 91)
    const tw = 0.6 + 0.4 * Math.sin(s.t * (0.6 + h1(i + 92)) + i)
    setColor(g, true, S, DETAIL, (0.25 + 0.4 * h1(i + 93)) * tw * k, 0.5)
    canvas.drawCircle(x, y, 0.6 + 0.6 * h1(i + 94), g.fill)
  }
  // The beam: from a headland off the left edge, sweeping right and back, slowly.
  const ox = -0.04 * W
  const oy = H * 0.47
  const sweep = Math.sin(s.t * 0.09) // -1..1
  const ang = -0.62 + sweep * 0.5
  const spread = 0.045
  const len = W * 1.6
  const path = g.pb
  path.moveTo(ox, oy)
  path.lineTo(ox + Math.cos(ang - spread) * len, oy + Math.sin(ang - spread) * len)
  path.lineTo(ox + Math.cos(ang + spread) * len, oy + Math.sin(ang + spread) * len)
  path.close()
  // Brighter as it faces you (the middle of its sweep).
  const facing = 0.55 + 0.45 * (1 - Math.abs(sweep))
  setColor(g, true, S, DETAIL, 0.045 * facing * k, 0.3)
  canvas.drawPath(path.detach(), g.fill)
  g.stroke.setStrokeWidth(0.8)
  setColor(g, false, S, DETAIL, 0.08 * facing * k, 0.3)
  for (const side of [-1, 1]) {
    const a = ang + side * spread
    canvas.drawLine(ox, oy, ox + Math.cos(a) * len, oy + Math.sin(a) * len, g.stroke)
  }
}

/** The upper-half light of one scene (nothing for Nocturne, whose strings already do it). */
export function drawUpper(canvas: SkCanvas, s: Sim, scene: number, g: Gfx): void {
  'worklet'
  if (scene === SCENE.rain) rainStreaks(canvas, s, g)
  else if (scene === SCENE.hearth) smokeThreads(canvas, s, g)
  else if (scene === SCENE.tide) tideMoon(canvas, s, g)
  else if (scene === SCENE.delta) deltaRings(canvas, s, g)
  else if (scene === SCENE.horizon) windLines(canvas, s, g)
  else if (scene === SCENE.ink) inkTendrils(canvas, s, g)
  else if (scene === SCENE.starfield) starTrails(canvas, s, g)
  else if (scene === SCENE.amber) lampBeam(canvas, s, g)
  else if (scene === SCENE.mist) mistMoon(canvas, s, g)
  else if (scene === SCENE.cove) lighthouse(canvas, s, g)
}
