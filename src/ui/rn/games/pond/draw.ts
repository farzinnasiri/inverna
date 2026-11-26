/**
 * Draws Pond with Skia. Three layers sit over the water shader:
 *
 * - under: the koi and its wake, beneath the surface
 * - flora (static, recorded once per pond): lily pads, stones, reeds, leaves
 * - over: buds and blossoms, the picture's strokes, lasso ink, touch rings,
 *   and the end painting
 *
 * Performance: no blur filters. Soft light is a radial-gradient paint made
 * once per colour and stamped with a transform; blossoms are pictures
 * recorded once per family and drawn scaled; lines are single filled ribbon
 * paths. Everything here is a worklet and takes the Skia API as an argument,
 * so it runs on the UI thread, on web, and headless in Node for previews.
 */
import type { SkCanvas, SkPaint, SkPathBuilder, SkPathEffect, SkPicture } from '@shopify/react-native-skia'

type SkiaApi = typeof import('@shopify/react-native-skia').Skia

export interface PondGfxEnums {
  stroke: number
  fill: number
  roundCap: number
  roundJoin: number
  clipIntersect: number
  clamp: number
}

export type RGB = readonly [number, number, number]

export interface PondGfx {
  Skia: SkiaApi
  key: number
  stroke: SkPaint
  fill: SkPaint
  /** Soft round light per colour: brass, ivory, then the five family tints. */
  glows: SkPaint[]
  /** One blossom per family, recorded at unit size. */
  blooms: SkPicture[]
  pb: SkPathBuilder
  dash: SkPathEffect
  color: Float32Array
  clip: number
  /** TileMode.Clamp, for gradients made while recording the still life. */
  clamp: number
}

/** Everything that moves, for one frame, in pixels. Built on the JS thread. */
export interface PondFrame {
  w: number
  h: number
  /** Pixels per pond unit (the pond is one unit wide). */
  u: number
  t: number
  dim: number
  /** 0..1 swell at 0.1 Hz, shared by everything that glows. */
  breath: number
  reduced: boolean
  colorKey: number
  brass: RGB
  ivory: RGB
  /** Five family tints, flattened rgb. */
  tints: number[]
  koi: number[]
  koiPhase: number
  koiTurn: number
  koiAlpha: number
  /** The koi's wake, oldest first, flattened. */
  trail: number[]
  /** Stride 6: x, y, open (-1 closed, else 0..1), phase, family, lit (first-play glow). */
  buds: number[]
  /** Strokes being drawn or drawn: bud positions in order, closed, progress 0..1, family. */
  strokes: { pts: number[]; closed: boolean; p: number; family: number }[]
  /** The lasso under the finger, and how much breath it has used (0..1). */
  drawing: number[]
  drawUsed: number
  /** Loops the koi is swimming or just closed. */
  /** k: buds opened, or -1 when the loop muddied (two families or a sleeper inside). */
  inks: { pts: number[]; traced: number; closedAge: number; k: number }[]
  /** Sleeping buds, flat [x, y, phase]: dim, closed, never open. */
  sleepers: number[]
  /** What spoiled the last muddied loop, flat [x, y, age 0..1]: a short pulse. */
  culprits: number[]
  /** Touch feedback rings, stride 4: x, y, age 0..1, size px. */
  rings: number[]
  /** Glide target: x, y, alpha — or empty. */
  target: number[]
  /** First-play ghost lasso, flattened — or empty. */
  ghost: number[]
  /** Painting: darkness of the veil 0..1, and the reveal glow 0..1. */
  veil: number
  reveal: number
  rest: number
  /** Water shader inputs in pond units. */
  moon: [number, number]
  /** Stride 4: x, y, age (s), strength. */
  ripples: number[]
  koiWater: [number, number, number, number]
}

/** The pond's still life, recorded once. */
export interface FloraFrame {
  w: number
  h: number
  u: number
  dim: number
  brass: RGB
  ivory: RGB
  /** Stride 5: x, y, r, rotation, notch width. */
  pads: number[]
  /** Stride 4: x, y, r, rotation. */
  stones: number[]
  /** Stride 4: x, base y, height, lean. */
  reeds: number[]
  /** Stride 4: x, y, size, rotation. */
  leaves: number[]
}

const TAU = Math.PI * 2
/** The koi's colours: vermilion and orange with cream. Fixed, not tokens: it's a fish. */
const KOI_ORANGE: RGB = [0.93, 0.5, 0.22]
const KOI_RED: RGB = [0.82, 0.22, 0.12]
const KOI_CREAM: RGB = [0.96, 0.9, 0.8]
const WATER: RGB = [0.02, 0.05, 0.06]

/* -------------------------------------------------------------- set-up */

function rgba(c: RGB, a: number): Float32Array {
  'worklet'
  return new Float32Array([c[0], c[1], c[2], a])
}

/**
 * Declared before anything that uses it: the worklet compiler turns function
 * declarations into constants, so a worklet can't call one defined below it.
 */
function mixRGB(a: RGB, b: RGB, t: number): RGB {
  'worklet'
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function tintOf(f: { tints: number[] }, i: number): RGB {
  'worklet'
  const k = (((i % 5) + 5) % 5) * 3
  return [f.tints[k]!, f.tints[k + 1]!, f.tints[k + 2]!]
}

function recordBloom(Skia: SkiaApi, e: PondGfxEnums, tint: RGB, ivory: RGB, brass: RGB, family: number): SkPicture {
  'worklet'
  const rec = Skia.PictureRecorder()
  const c = rec.beginRecording(Skia.XYWHRect(-20, -20, 40, 40))
  const p = Skia.Paint()
  p.setAntiAlias(true)
  p.setStyle(e.fill)
  const outer = 7 + (family % 2)
  const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  const petal = mix(ivory, tint, 0.35)
  const heart = mix(brass, tint, 0.5)
  for (let k = 0; k < outer; k++) {
    c.save()
    c.rotate((k * 360) / outer, 0, 0)
    p.setColor(rgba(petal, 0.62))
    c.drawOval(Skia.XYWHRect(-4.2, -15, 8.4, 11.5), p)
    c.restore()
  }
  for (let k = 0; k < 5; k++) {
    c.save()
    c.rotate(k * 72 + 18, 0, 0)
    p.setColor(rgba(heart, 0.82))
    c.drawOval(Skia.XYWHRect(-2.8, -9, 5.6, 7.5), p)
    c.restore()
  }
  p.setColor(rgba(ivory, 0.95))
  c.drawCircle(0, 0, 1.9, p)
  return rec.finishRecordingAsPicture()
}

export function makePondGfx(Skia: SkiaApi, e: PondGfxEnums, f: { colorKey: number; brass: RGB; ivory: RGB; tints: number[] }): PondGfx {
  'worklet'
  const stroke = Skia.Paint()
  stroke.setStyle(e.stroke)
  stroke.setAntiAlias(true)
  stroke.setStrokeCap(e.roundCap)
  stroke.setStrokeJoin(e.roundJoin)
  const fill = Skia.Paint()
  fill.setStyle(e.fill)
  fill.setAntiAlias(true)
  const glowColors: RGB[] = [f.brass, f.ivory]
  for (let i = 0; i < 5; i++) glowColors.push(tintOf(f, i))
  const glows = glowColors.map((c) => {
    const p = Skia.Paint()
    p.setAntiAlias(true)
    p.setShader(Skia.Shader.MakeRadialGradient({ x: 0, y: 0 }, 1, [rgba(c, 1), rgba(c, 0.35), rgba(c, 0)], [0, 0.35, 1], e.clamp))
    return p
  })
  const blooms: SkPicture[] = []
  for (let i = 0; i < 5; i++) blooms.push(recordBloom(Skia, e, tintOf(f, i), f.ivory, f.brass, i))
  return {
    Skia,
    key: f.colorKey,
    stroke,
    fill,
    glows,
    blooms,
    pb: Skia.PathBuilder.Make(),
    dash: Skia.PathEffect.MakeDash([3, 7], 0),
    color: new Float32Array(4),
    clip: e.clipIntersect,
    clamp: e.clamp,
  }
}

/* ------------------------------------------------------------- helpers */

function paint(g: PondGfx, p: SkPaint, c: RGB, a: number): SkPaint {
  'worklet'
  g.color[0] = c[0]
  g.color[1] = c[1]
  g.color[2] = c[2]
  g.color[3] = a < 0 ? 0 : a > 1 ? 1 : a
  p.setColor(g.color)
  return p
}

function glow(canvas: SkCanvas, g: PondGfx, idx: number, x: number, y: number, r: number, a: number): void {
  'worklet'
  if (a <= 0.004 || r <= 0.5) return
  const p = g.glows[idx]!
  p.setAlphaf(a > 1 ? 1 : a)
  canvas.save()
  canvas.translate(x, y)
  canvas.scale(r, r)
  canvas.drawCircle(0, 0, 1, p)
  canvas.restore()
}

function ease(t: number): number {
  'worklet'
  const c = t < 0 ? 0 : t > 1 ? 1 : t
  return 1 - (1 - c) * (1 - c) * (1 - c)
}

/**
 * Chaikin corner cutting: each pass replaces every corner with two points a
 * quarter of the way along its sides. Two passes turn a jittery finger or a
 * sharp turn of the koi into a curve before Catmull-Rom (which passes through
 * every point, so it keeps corners) draws it. The ends stay where they are.
 */
export function soften(pts: number[], passes: number): number[] {
  'worklet'
  let cur = pts
  for (let k = 0; k < passes; k++) {
    const n = cur.length / 2
    if (n < 3) return cur
    const out: number[] = [cur[0]!, cur[1]!]
    for (let i = 0; i < n - 1; i++) {
      const ax = cur[i * 2]!
      const ay = cur[i * 2 + 1]!
      const bx = cur[i * 2 + 2]!
      const by = cur[i * 2 + 3]!
      out.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25, ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75)
    }
    out.push(cur[cur.length - 2]!, cur[cur.length - 1]!)
    cur = out
  }
  return cur
}

/** Catmull-Rom through the points, `sub` steps per segment. */
export function smooth(pts: number[], closed: boolean, sub: number): number[] {
  'worklet'
  const n = pts.length / 2
  if (n < 3) return pts.slice()
  const idx = (i: number) => (closed ? ((i % n) + n) % n : i < 0 ? 0 : i >= n ? n - 1 : i)
  const out: number[] = []
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const a = idx(i - 1) * 2
    const b = idx(i) * 2
    const c = idx(i + 1) * 2
    const d = idx(i + 2) * 2
    for (let k = 0; k < sub; k++) {
      const t = k / sub
      const t2 = t * t
      const t3 = t2 * t
      for (let o = 0; o < 2; o++) {
        const p0 = pts[a + o]!
        const p1 = pts[b + o]!
        const p2 = pts[c + o]!
        const p3 = pts[d + o]!
        out.push(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
      }
    }
  }
  if (closed) out.push(out[0]!, out[1]!)
  else out.push(pts[pts.length - 2]!, pts[pts.length - 1]!)
  return out
}

/** The first `frac` of a polyline, by length. */
function partial(pts: number[], frac: number): number[] {
  'worklet'
  if (frac >= 1) return pts
  const n = pts.length / 2
  let total = 0
  for (let i = 1; i < n; i++) total += Math.hypot(pts[i * 2]! - pts[i * 2 - 2]!, pts[i * 2 + 1]! - pts[i * 2 - 1]!)
  const want = total * Math.max(0, frac)
  const out: number[] = [pts[0]!, pts[1]!]
  let acc = 0
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(pts[i * 2]! - pts[i * 2 - 2]!, pts[i * 2 + 1]! - pts[i * 2 - 1]!)
    if (acc + d >= want) {
      const t = d > 0 ? (want - acc) / d : 0
      out.push(pts[i * 2 - 2]! + (pts[i * 2]! - pts[i * 2 - 2]!) * t, pts[i * 2 - 1]! + (pts[i * 2 + 1]! - pts[i * 2 - 1]!) * t)
      return out
    }
    acc += d
    out.push(pts[i * 2]!, pts[i * 2 + 1]!)
  }
  return out
}

/**
 * A continuous tapered ribbon of light along a polyline: one filled path.
 * `shape` 0 tapers from nothing to full (a wake), 1 swells and thins like a
 * brush stroke.
 */
function ribbon(canvas: SkCanvas, g: PondGfx, pts: number[], width: number, shape: 0 | 1, p: SkPaint): void {
  'worklet'
  const n = pts.length / 2
  if (n < 2) return
  const lx: number[] = []
  const ly: number[] = []
  const rx: number[] = []
  const ry: number[] = []
  for (let i = 0; i < n; i++) {
    const i0 = i > 0 ? i - 1 : 0
    const i1 = i < n - 1 ? i + 1 : n - 1
    let tx = pts[i1 * 2]! - pts[i0 * 2]!
    let ty = pts[i1 * 2 + 1]! - pts[i0 * 2 + 1]!
    const tl = Math.hypot(tx, ty) || 1
    tx /= tl
    ty /= tl
    const f = n > 1 ? i / (n - 1) : 1
    const w = (shape === 0 ? width * Math.pow(f, 0.8) : width * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, f * 0.92 + 0.06)))) / 2
    lx.push(pts[i * 2]! - ty * w)
    ly.push(pts[i * 2 + 1]! + tx * w)
    rx.push(pts[i * 2]! + ty * w)
    ry.push(pts[i * 2 + 1]! - tx * w)
  }
  const pb = g.pb
  pb.moveTo(lx[0]!, ly[0]!)
  for (let i = 1; i < n; i++) pb.lineTo(lx[i]!, ly[i]!)
  for (let i = n - 1; i >= 0; i--) pb.lineTo(rx[i]!, ry[i]!)
  pb.close()
  canvas.drawPath(pb.detach(), p)
}

function polyline(g: PondGfx, pts: number[], closed: boolean) {
  'worklet'
  const pb = g.pb
  pb.moveTo(pts[0]!, pts[1]!)
  for (let i = 2; i < pts.length; i += 2) pb.lineTo(pts[i]!, pts[i + 1]!)
  if (closed) pb.close()
  return pb.detach()
}

/* --------------------------------------------------------------- flora */

export function drawFlora(canvas: SkCanvas, f: FloraFrame, g: PondGfx): void {
  'worklet'
  const Skia = g.Skia
  const s = f.u / 390
  const d = f.dim
  const lit = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k]
  const radial = (x: number, y: number, r: number, cols: RGB[], alphas: number[], stops: number[]) => {
    const p = Skia.Paint()
    p.setAntiAlias(true)
    p.setShader(Skia.Shader.MakeRadialGradient({ x, y }, r, cols.map((c, i) => rgba(c, alphas[i]! * d)), stops, g.clamp))
    return p
  }

  // Stones: soft shadow, a dark body darker underneath, a crescent of moonlight.
  for (let i = 0; i < f.stones.length; i += 4) {
    const x = f.stones[i]!
    const y = f.stones[i + 1]!
    const r = f.stones[i + 2]!
    canvas.save()
    canvas.translate(x, y)
    canvas.rotate((f.stones[i + 3]! * 180) / Math.PI, 0, 0)
    const oval = Skia.XYWHRect(-r, -r * 0.72, r * 2, r * 1.44)
    canvas.drawOval(Skia.XYWHRect(-r * 1.15, -r * 0.6, r * 2.4, r * 1.6), radial(r * 0.15, r * 0.25, r * 1.3, [[0, 0, 0], [0, 0, 0]], [0.55, 0], [0.55, 1]))
    canvas.drawOval(oval, radial(-r * 0.25, -r * 0.3, r * 1.3, [[0.13, 0.125, 0.115], [0.045, 0.043, 0.04]], [1, 1], [0, 1]))
    const pb = g.pb
    pb.addArc(oval, 205, 100)
    g.stroke.setStrokeWidth(1.3 * s)
    paint(g, g.stroke, f.ivory, 0.3 * d)
    canvas.drawPath(pb.detach(), g.stroke)
    canvas.restore()
  }

  // Lily pads: a shadow on the water, a darker heart, curved veins, a notch,
  // and moonlight along the upper-right rim. Every third has a dew glint.
  for (let i = 0; i < f.pads.length; i += 5) {
    const x = f.pads[i]!
    const y = f.pads[i + 1]!
    const r = f.pads[i + 2]!
    const rot = f.pads[i + 3]!
    const notch = f.pads[i + 4]!
    const n = i / 5
    const shade = 0.85 + 0.3 * ((n * 0.37) % 1)
    const padPath = (rr: number) => {
      const pb = g.pb
      pb.moveTo(0, 0)
      pb.arcToOval(Skia.XYWHRect(-rr, -rr, rr * 2, rr * 2), notch / 2, 360 - notch, false)
      pb.close()
      return pb.detach()
    }
    canvas.save()
    canvas.translate(x + 2.5 * s, y + 3.5 * s)
    canvas.rotate((rot * 180) / Math.PI, 0, 0)
    paint(g, g.fill, [0, 0, 0], 0.45)
    canvas.drawPath(padPath(r * 1.04), g.fill)
    canvas.restore()

    canvas.save()
    canvas.translate(x, y)
    canvas.rotate((rot * 180) / Math.PI, 0, 0)
    const pad = padPath(r)
    canvas.drawPath(pad, radial(0, 0, r, [lit([0.03, 0.06, 0.04], shade), lit([0.06, 0.11, 0.07], shade), lit([0.09, 0.15, 0.1], shade)], [1, 1, 1], [0, 0.7, 1]))
    // Veins: curved, finer toward the edge.
    g.stroke.setStrokeWidth(0.7 * s)
    paint(g, g.stroke, [0.36, 0.48, 0.34], 0.16 * d)
    for (let k = 1; k < 10; k++) {
      const a = ((notch / 2 + ((360 - notch) * k) / 10) * Math.PI) / 180
      const vb = g.pb
      vb.moveTo(0, 0)
      vb.quadTo(Math.cos(a + 0.12) * r * 0.45, Math.sin(a + 0.12) * r * 0.45, Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9)
      canvas.drawPath(vb.detach(), g.stroke)
    }
    // The pad's edge, slightly turned up: a fine darker line all round.
    g.stroke.setStrokeWidth(1 * s)
    paint(g, g.stroke, [0.01, 0.02, 0.015], 0.7 * d)
    canvas.drawPath(pad, g.stroke)
    canvas.restore()
    const rim = g.pb
    rim.addArc(Skia.XYWHRect(x - r + 0.6 * s, y - r + 0.6 * s, (r - 0.6 * s) * 2, (r - 0.6 * s) * 2), 220, 100)
    g.stroke.setStrokeWidth(1.2 * s)
    paint(g, g.stroke, f.ivory, 0.3 * d)
    canvas.drawPath(rim.detach(), g.stroke)
    if (n % 3 === 1) {
      const gx = x - r * 0.25
      const gy = y - r * 0.2
      canvas.drawCircle(gx, gy, 5 * s, radial(gx, gy, 5 * s, [f.ivory, f.ivory], [0.35, 0], [0, 1]))
      paint(g, g.fill, f.ivory, 0.7 * d)
      canvas.drawCircle(gx, gy, 1.1 * s, g.fill)
    }
  }

  // Fallen leaves, half maple, half ginkgo, in muted autumn colours, each with
  // its own small shadow on the water.
  for (let i = 0; i < f.leaves.length; i += 4) {
    const x = f.leaves[i]!
    const y = f.leaves[i + 1]!
    const z = f.leaves[i + 2]! * 1.6
    const n = i / 4
    const maple = n % 2 === 0
    const leafPath = () => {
      const pb = g.pb
      if (maple) {
        // Five pointed lobes.
        for (let k = 0; k <= 60; k++) {
          const a = (k / 60) * TAU - Math.PI / 2
          const lobe = Math.pow(Math.abs(Math.cos(2.5 * (a + Math.PI / 2))), 0.7)
          const rr = z * (0.42 + 0.58 * lobe) * (a > 0.6 && a < 2.5 ? 0.75 : 1)
          const px = Math.cos(a) * rr
          const py = Math.sin(a) * rr
          if (k === 0) pb.moveTo(px, py)
          else pb.lineTo(px, py)
        }
      } else {
        // A ginkgo fan on its stem.
        pb.moveTo(0, z * 0.55)
        pb.quadTo(-z * 1.05, -z * 0.1, -z * 0.7, -z * 0.7)
        pb.quadTo(-z * 0.1, -z * 0.55, 0, -z * 0.78)
        pb.quadTo(z * 0.1, -z * 0.55, z * 0.7, -z * 0.7)
        pb.quadTo(z * 1.05, -z * 0.1, 0, z * 0.55)
      }
      pb.close()
      return pb.detach()
    }
    const col: RGB = maple ? [0.58, 0.17, 0.11] : [0.72, 0.53, 0.18]
    canvas.save()
    canvas.translate(x + 2 * s, y + 3 * s)
    canvas.rotate((f.leaves[i + 3]! * 180) / Math.PI, 0, 0)
    paint(g, g.fill, [0, 0, 0], 0.4)
    canvas.drawPath(leafPath(), g.fill)
    canvas.restore()
    canvas.save()
    canvas.translate(x, y)
    canvas.rotate((f.leaves[i + 3]! * 180) / Math.PI, 0, 0)
    canvas.drawPath(leafPath(), radial(-z * 0.2, -z * 0.3, z * 1.2, [mixRGB(col, f.ivory, 0.2), lit(col, 0.6)], [0.7, 0.62], [0, 1]))
    g.stroke.setStrokeWidth(0.6 * s)
    paint(g, g.stroke, mixRGB(col, f.ivory, 0.5), 0.35 * d)
    const vb = g.pb
    if (maple) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU - Math.PI / 2
        vb.moveTo(0, z * 0.1)
        vb.lineTo(Math.cos(a) * z * 0.75, Math.sin(a) * z * 0.75)
      }
      vb.moveTo(0, z * 0.1)
      vb.lineTo(0, z * 0.85)
    } else {
      for (let k = -2; k <= 2; k++) {
        vb.moveTo(0, z * 0.5)
        vb.lineTo(k * z * 0.28, -z * 0.6)
      }
    }
    canvas.drawPath(vb.detach(), g.stroke)
    canvas.restore()
  }

  // Reeds in clumps at the bottom corners: tapered blades, a lit edge on the
  // moon's side, and brown seed heads.
  for (let i = 0; i < f.reeds.length; i += 4) {
    const x = f.reeds[i]!
    const base = f.reeds[i + 1]!
    const tall = f.reeds[i + 2]!
    const lean = f.reeds[i + 3]!
    const n = i / 4
    for (let b = 0; b < 2; b++) {
      const bx = x + (b === 0 ? 0 : 3.5 * s)
      const bt = tall * (b === 0 ? 1 : 0.68)
      const bl = lean * (b === 0 ? 1 : 1.5)
      const w = (b === 0 ? 2.4 : 1.6) * s
      const tipX = bx + bl
      const tipY = base - bt
      const cx = bx + bl * 0.2
      const cy = base - bt * 0.55
      const pb = g.pb
      pb.moveTo(bx - w, base)
      pb.quadTo(cx - w * 0.6, cy, tipX, tipY)
      pb.quadTo(cx + w * 0.6, cy, bx + w, base)
      pb.close()
      paint(g, g.fill, [0.13, 0.15, 0.09], 0.9 * d)
      canvas.drawPath(pb.detach(), g.fill)
      const edge = g.pb
      edge.moveTo(bx + w * 0.6, base)
      edge.quadTo(cx + w * 0.4, cy, tipX, tipY)
      g.stroke.setStrokeWidth(0.7 * s)
      paint(g, g.stroke, f.ivory, 0.18 * d)
      canvas.drawPath(edge.detach(), g.stroke)
    }
    if (n % 2 === 0) {
      canvas.save()
      canvas.translate(x + lean * 0.86, base - tall * 0.86)
      canvas.rotate((Math.atan2(-tall * 0.45, lean * 0.8) * 180) / Math.PI + 90, 0, 0)
      const head = Skia.XYWHRect(-2.4 * s, -13 * s, 4.8 * s, 15 * s)
      paint(g, g.fill, [0.3, 0.19, 0.11], 0.95 * d)
      canvas.drawRRect(Skia.RRectXY(head, 2.4 * s, 2.4 * s), g.fill)
      paint(g, g.fill, f.ivory, 0.18 * d)
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(0.6 * s, -12 * s, 1.4 * s, 13 * s), 0.7 * s, 0.7 * s), g.fill)
      canvas.restore()
    }
  }
}

/* ----------------------------------------------------------- under: koi */

const BODY = [5.4, 8.0, 8.6, 8.0, 6.8, 5.4, 4.2, 3.1, 2.3, 1.6, 1.0]

/**
 * The koi's wake: a soft band of light in the water, widest and brightest
 * just behind the tail and thinning to nothing. Softened first, so a sharp
 * turn or an uneven frame never shows as a kink.
 */
function drawTrail(canvas: SkCanvas, f: PondFrame, g: PondGfx): void {
  'worklet'
  if (f.trail.length < 6) return
  const s = f.u / 390
  const pts = smooth(soften(f.trail, 2), false, 2)
  const a = f.dim * f.koiAlpha
  ribbon(canvas, g, pts, 18 * s, 0, paint(g, g.fill, f.ivory, 0.035 * a))
  ribbon(canvas, g, pts, 7 * s, 0, paint(g, g.fill, f.brass, 0.1 * a))
  ribbon(canvas, g, pts, 2.2 * s, 0, paint(g, g.fill, mixRGB(f.brass, f.ivory, 0.45), 0.55 * a))
}


function drawKoi(canvas: SkCanvas, f: PondFrame, g: PondGfx): void {
  'worklet'
  const sp = f.koi
  const n = sp.length / 2
  if (n < 3 || f.koiAlpha <= 0.01) return
  const s = (f.u / 390) * 1.08
  const a = f.koiAlpha * (0.55 + 0.45 * f.dim)
  const amp = f.reduced ? 0.45 : 1
  const px: number[] = []
  const py: number[] = []
  for (let i = 0; i < n; i++) {
    let x = sp[i * 2]!
    let y = sp[i * 2 + 1]!
    if (i > 0) {
      const ang = Math.atan2(y - sp[(i - 1) * 2 + 1]!, x - sp[(i - 1) * 2]!) + Math.PI / 2
      const fr = i / (n - 1)
      const wave = Math.sin(f.koiPhase - i * 0.6) * (0.6 + 3.4 * fr * fr) * s * amp
      x += Math.cos(ang) * wave
      y += Math.sin(ang) * wave
    }
    px.push(x)
    py.push(y)
  }
  const lx: number[] = []
  const ly: number[] = []
  const rx: number[] = []
  const ry: number[] = []
  for (let i = 0; i < n; i++) {
    const i0 = i > 0 ? i - 1 : 0
    const i1 = i < n - 1 ? i + 1 : n - 1
    const ang = Math.atan2(py[i1]! - py[i0]!, px[i1]! - px[i0]!) + Math.PI / 2
    const bw = (BODY[i] ?? 1) * s
    lx.push(px[i]! + Math.cos(ang) * bw)
    ly.push(py[i]! + Math.sin(ang) * bw)
    rx.push(px[i]! - Math.cos(ang) * bw)
    ry.push(py[i]! - Math.sin(ang) * bw)
  }
  const hx = px[0]!
  const hy = py[0]!
  const ha = Math.atan2(hy - py[1]!, hx - px[1]!)

  // Translucent fins, under the body.
  const tx = px[n - 1]!
  const ty = py[n - 1]!
  const ta = Math.atan2(ty - py[n - 2]!, tx - px[n - 2]!)
  const sw = Math.sin(f.koiPhase - 6.5) * 0.55 * amp
  const tail = g.pb
  tail.moveTo(tx, ty)
  tail.quadTo(tx + Math.cos(ta + 0.75 + sw) * 11 * s, ty + Math.sin(ta + 0.75 + sw) * 11 * s, tx + Math.cos(ta + 0.45 + sw) * 18 * s, ty + Math.sin(ta + 0.45 + sw) * 18 * s)
  tail.quadTo(tx + Math.cos(ta + sw) * 9 * s, ty + Math.sin(ta + sw) * 9 * s, tx + Math.cos(ta - 0.45 + sw) * 18 * s, ty + Math.sin(ta - 0.45 + sw) * 18 * s)
  tail.quadTo(tx + Math.cos(ta - 0.75 + sw) * 11 * s, ty + Math.sin(ta - 0.75 + sw) * 11 * s, tx, ty)
  tail.close()
  paint(g, g.fill, KOI_ORANGE, 0.42 * a)
  canvas.drawPath(tail.detach(), g.fill)
  const fa = Math.atan2(py[2]! - py[1]!, px[2]! - px[1]!)
  const bank = Math.max(-0.45, Math.min(0.45, f.koiTurn * 0.2))
  const flutter = Math.sin(f.koiPhase * 0.7) * 0.22 * amp
  for (let side = -1; side <= 1; side += 2) {
    canvas.save()
    canvas.translate(px[2]!, py[2]!)
    canvas.rotate(((fa + side * (1.05 + flutter - side * bank * 0.4)) * 180) / Math.PI, 0, 0)
    paint(g, g.fill, KOI_CREAM, 0.32 * a)
    canvas.drawOval(g.Skia.XYWHRect(0, -3.6 * s, 17 * s, 7.2 * s), g.fill)
    canvas.restore()
  }

  // The body: orange, with vermilion saddles and a cream head.
  const body = g.pb
  body.moveTo(lx[0]!, ly[0]!)
  for (let i = 1; i < n - 1; i++) body.quadTo(lx[i]!, ly[i]!, (lx[i]! + lx[i + 1]!) / 2, (ly[i]! + ly[i + 1]!) / 2)
  body.lineTo(lx[n - 1]!, ly[n - 1]!)
  body.quadTo(px[n - 1]!, py[n - 1]!, rx[n - 1]!, ry[n - 1]!)
  for (let i = n - 2; i >= 1; i--) body.quadTo(rx[i]!, ry[i]!, (rx[i]! + rx[i - 1]!) / 2, (ry[i]! + ry[i - 1]!) / 2)
  body.lineTo(rx[0]!, ry[0]!)
  const snout = 7.6 * s
  body.quadTo(rx[0]! + Math.cos(ha) * snout * 0.75, ry[0]! + Math.sin(ha) * snout * 0.75, hx + Math.cos(ha) * snout, hy + Math.sin(ha) * snout)
  body.quadTo(lx[0]! + Math.cos(ha) * snout * 0.75, ly[0]! + Math.sin(ha) * snout * 0.75, lx[0]!, ly[0]!)
  body.close()
  const bodyPath = body.detach()
  paint(g, g.fill, KOI_ORANGE, 0.96 * a)
  canvas.drawPath(bodyPath, g.fill)

  canvas.save()
  canvas.clipPath(bodyPath, g.clip, true)
  const patch = (i: number, off: number, rw: number, rh: number, c: RGB, pa: number) => {
    'worklet'
    const ang = Math.atan2(py[i + 1]! - py[i]!, px[i + 1]! - px[i]!)
    canvas.save()
    canvas.translate(px[i]! - Math.sin(ang) * off * s, py[i]! + Math.cos(ang) * off * s)
    canvas.rotate((ang * 180) / Math.PI, 0, 0)
    paint(g, g.fill, c, pa * a)
    canvas.drawOval(g.Skia.XYWHRect(-rw * s, -rh * s, rw * 2 * s, rh * 2 * s), g.fill)
    canvas.restore()
  }
  patch(0, 0, 7.5, 6, KOI_CREAM, 0.95)
  patch(2, 1.5, 9, 7.5, KOI_RED, 0.92)
  patch(4, -1.5, 9, 6.5, KOI_RED, 0.9)
  patch(6, 1, 6, 3.6, KOI_RED, 0.85)
  patch(8, 0, 4, 2.4, KOI_CREAM, 0.7)
  // Seen through the water: a cool veil over the whole fish.
  paint(g, g.fill, WATER, 0.26)
  canvas.drawRect(g.Skia.XYWHRect(hx - 60 * s, hy - 60 * s, 120 * s, 120 * s), g.fill)
  canvas.restore()

  // A wet sheen along the back, and the eyes.
  const back = g.pb
  back.moveTo(px[1]!, py[1]!)
  for (let i = 2; i <= 6; i++) back.lineTo(px[i]!, py[i]!)
  g.stroke.setStrokeWidth(1.2 * s)
  g.stroke.setPathEffect(null)
  paint(g, g.stroke, KOI_CREAM, 0.22 * a)
  canvas.drawPath(back.detach(), g.stroke)
  for (let side = -1; side <= 1; side += 2) {
    const ex = hx + Math.cos(ha) * 2.6 * s + Math.cos(ha + Math.PI / 2) * side * 3.8 * s
    const ey = hy + Math.sin(ha) * 2.6 * s + Math.sin(ha + Math.PI / 2) * side * 3.8 * s
    paint(g, g.fill, [0.06, 0.04, 0.04], 0.9 * a)
    canvas.drawCircle(ex, ey, 1.2 * s, g.fill)
  }
}

export function drawUnder(canvas: SkCanvas, f: PondFrame, g: PondGfx): void {
  'worklet'
  drawTrail(canvas, f, g)
  drawKoi(canvas, f, g)
}

/* -------------------------------------------------------- over: picture */

function drawBudShape(canvas: SkCanvas, g: PondGfx, x: number, y: number, s: number, family: number, c: RGB, a: number): void {
  'worklet'
  paint(g, g.fill, c, a)
  const pb = g.pb
  switch (family % 5) {
    case 0:
      pb.moveTo(x, y - 5.6 * s)
      pb.quadTo(x + 4 * s, y + 0.6 * s, x, y + 3.6 * s)
      pb.quadTo(x - 4 * s, y + 0.6 * s, x, y - 5.6 * s)
      pb.close()
      canvas.drawPath(pb.detach(), g.fill)
      break
    case 1:
      canvas.drawCircle(x, y, 3.6 * s, g.fill)
      break
    case 2:
      canvas.drawOval(g.Skia.XYWHRect(x - 2.2 * s, y - 6 * s, 4.4 * s, 11 * s), g.fill)
      break
    case 3:
      canvas.drawCircle(x - 2.4 * s, y, 2.6 * s, g.fill)
      canvas.drawCircle(x + 2.4 * s, y, 2.6 * s, g.fill)
      break
    default:
      pb.moveTo(x, y - 5 * s)
      pb.lineTo(x + 3.6 * s, y)
      pb.lineTo(x, y + 5 * s)
      pb.lineTo(x - 3.6 * s, y)
      pb.close()
      canvas.drawPath(pb.detach(), g.fill)
  }
}

/**
 * Sleepers: a small dark pad with a closed bud on it, cool and grey, with no
 * glow and no breath. Clearly asleep, clearly not part of the picture.
 */
function drawSleepers(canvas: SkCanvas, f: PondFrame, g: PondGfx): void {
  'worklet'
  const s = f.u / 390
  for (let i = 0; i < f.sleepers.length; i += 3) {
    const x = f.sleepers[i]!
    const y = f.sleepers[i + 1]!
    const ph = f.sleepers[i + 2]!
    paint(g, g.fill, [0, 0, 0], 0.4 * f.dim)
    canvas.drawCircle(x + 1.5 * s, y + 2 * s, 10 * s, g.fill)
    paint(g, g.fill, [0.035, 0.05, 0.045], 0.95 * f.dim)
    canvas.drawCircle(x, y, 10 * s, g.fill)
    canvas.save()
    canvas.translate(x, y)
    canvas.rotate(((ph * 0.3) * 180) / Math.PI, 0, 0)
    const pb = g.pb
    pb.moveTo(0, -6.5 * s)
    pb.quadTo(4.2 * s, -1 * s, 0, 5 * s)
    pb.quadTo(-4.2 * s, -1 * s, 0, -6.5 * s)
    pb.close()
    paint(g, g.fill, [0.36, 0.38, 0.44], 0.55 * f.dim)
    canvas.drawPath(pb.detach(), g.fill)
    canvas.restore()
    g.stroke.setStrokeWidth(0.8 * s)
    g.stroke.setPathEffect(null)
    paint(g, g.stroke, [0.5, 0.54, 0.6], 0.22 * f.dim)
    canvas.drawCircle(x, y, 10 * s, g.stroke)
  }
}

/** Two soft pulses round whatever spoiled a loop, so you see why nothing opened. */
function drawCulprits(canvas: SkCanvas, f: PondFrame, g: PondGfx): void {
  'worklet'
  const s = f.u / 390
  g.stroke.setPathEffect(null)
  for (let i = 0; i < f.culprits.length; i += 3) {
    const age = f.culprits[i + 2]!
    if (age >= 1) continue
    const pulse = 0.5 + 0.5 * Math.cos(age * Math.PI * 4)
    const k = (1 - age) * f.dim
    g.stroke.setStrokeWidth(1.4 * s)
    paint(g, g.stroke, [0.86, 0.5, 0.46], (0.25 + 0.45 * pulse) * k)
    canvas.drawCircle(f.culprits[i]!, f.culprits[i + 1]!, (13 + 4 * pulse) * s, g.stroke)
  }
}

function drawBuds(canvas: SkCanvas, f: PondFrame, g: PondGfx): void {
  'worklet'
  const s = f.u / 390
  for (let i = 0; i < f.buds.length; i += 6) {
    const x = f.buds[i]!
    const y = f.buds[i + 1]!
    const open = f.buds[i + 2]!
    const ph = f.buds[i + 3]!
    const fam = f.buds[i + 4]!
    const lit = f.buds[i + 5]!
    const br = 0.5 + 0.5 * Math.sin(f.breath * TAU + ph * 0.3)
    const tint = tintOf(f, fam)
    if (open < 0) {
      const boost = lit * (0.5 + 0.5 * Math.sin(f.t * 0.004))
      glow(canvas, g, 2 + (fam % 5), x, y, (15 + 6 * boost) * s, (0.28 + 0.12 * br + 0.35 * boost) * f.dim)
      g.stroke.setStrokeWidth(1.1 * s)
      g.stroke.setPathEffect(null)
      paint(g, g.stroke, tint, (0.42 + 0.2 * br + 0.3 * boost) * f.dim)
      canvas.drawCircle(x, y, 9 * s, g.stroke)
      drawBudShape(canvas, g, x, y, s, fam, tint, 0.95 * f.dim)
      continue
    }
    const o = ease(open)
    glow(canvas, g, 2 + (fam % 5), x, y, (16 + 16 * (1 - o) + 6 * f.reveal) * s, (0.5 * (1 - o) + 0.2 + 0.08 * br + 0.25 * f.reveal) * f.dim)
    canvas.save()
    canvas.translate(x, y)
    canvas.rotate((ph * 180) / Math.PI, 0, 0)
    const k = s * (0.45 + 0.55 * o) * (1 + 0.08 * f.reveal)
    canvas.scale(k, k)
    canvas.drawPicture(g.blooms[fam % 5]!)
    canvas.restore()
  }
}

function drawStrokes(canvas: SkCanvas, f: PondFrame, g: PondGfx): void {
  'worklet'
  const s = f.u / 390
  for (const st of f.strokes) {
    if (st.p <= 0 || st.pts.length < 4) continue
    const tint = tintOf(f, st.family)
    const curve = partial(smooth(st.pts, st.closed, 8), ease(st.p))
    const mix: RGB = [(tint[0] + f.brass[0]) / 2, (tint[1] + f.brass[1]) / 2, (tint[2] + f.brass[2]) / 2]
    const wide = 1 + 0.5 * f.reveal
    ribbon(canvas, g, curve, 12 * s * wide, 1, paint(g, g.fill, mix, (0.08 + 0.1 * f.reveal) * f.dim))
    ribbon(canvas, g, curve, 3.6 * s * wide, 1, paint(g, g.fill, mix, (0.82 + 0.18 * f.reveal) * f.dim))
    if (st.p < 1) {
      // The brush tip, travelling.
      const tip = curve.length - 2
      glow(canvas, g, 1, curve[tip]!, curve[tip + 1]!, 10 * s, 0.6 * f.dim)
    }
  }
}

function drawInks(canvas: SkCanvas, f: PondFrame, g: PondGfx): void {
  'worklet'
  const s = f.u / 390
  g.stroke.setPathEffect(null)
  for (const ink of f.inks) {
    if (ink.pts.length < 6) continue
    const closedPts = ink.pts.concat([ink.pts[0]!, ink.pts[1]!])
    if (ink.closedAge < 0) {
      // The shape you drew, faint; brightening where the koi has swum.
      g.stroke.setStrokeWidth(1.6 * s)
      paint(g, g.stroke, f.brass, 0.36 * f.dim)
      canvas.drawPath(polyline(g, ink.pts, true), g.stroke)
      const done = partial(closedPts, ink.traced)
      if (done.length >= 4) {
        ribbon(canvas, g, done, 9 * s, 0, paint(g, g.fill, f.brass, 0.1 * f.dim))
        ribbon(canvas, g, done, 3 * s, 0, paint(g, g.fill, f.brass, 0.7 * f.dim))
      }
      continue
    }
    if (ink.k < 0) {
      // Muddied: the loop goes grey and sinks away quickly.
      const m = Math.max(0, 1 - ink.closedAge / 1400)
      if (m <= 0) continue
      g.stroke.setStrokeWidth(1.4 * s)
      paint(g, g.stroke, [0.55, 0.58, 0.62], 0.4 * m * f.dim)
      canvas.drawPath(polyline(g, ink.pts, true), g.stroke)
      continue
    }
    const k = Math.max(0, 1 - ink.closedAge / 3200)
    if (k <= 0) continue
    const path = polyline(g, ink.pts, true)
    if (ink.k > 0) {
      paint(g, g.fill, f.brass, 0.07 * k * f.dim)
      canvas.drawPath(path, g.fill)
    }
    g.stroke.setStrokeWidth((1.2 + 1.6 * k) * s)
    paint(g, g.stroke, f.brass, (ink.k > 0 ? 0.62 : 0.24) * k * f.dim)
    canvas.drawPath(path, g.stroke)
  }
}

/**
 * The line your finger is drawing: a thread of light in the water with a
 * soft halo, finest where it began and fullest at your fingertip, which
 * carries a small light. It thins as the breath runs out.
 */
function drawDrawing(canvas: SkCanvas, f: PondFrame, g: PondGfx): void {
  'worklet'
  if (f.drawing.length < 4) return
  const s = f.u / 390
  const pts = smooth(soften(f.drawing, 2), false, 2)
  const left = 1 - 0.55 * f.drawUsed
  ribbon(canvas, g, pts, 20 * s, 0, paint(g, g.fill, f.ivory, 0.04 * f.dim))
  ribbon(canvas, g, pts, 8 * s * left, 0, paint(g, g.fill, f.brass, 0.13 * f.dim))
  ribbon(canvas, g, pts, 2.4 * s * left, 0, paint(g, g.fill, mixRGB(f.brass, f.ivory, 0.5), (0.92 - 0.3 * f.drawUsed) * f.dim))
  const tip = pts.length - 2
  glow(canvas, g, 1, pts[tip]!, pts[tip + 1]!, 16 * s, 0.4 * left * f.dim)
  glow(canvas, g, 0, pts[tip]!, pts[tip + 1]!, 6 * s, 0.7 * left * f.dim)
}

function drawRings(canvas: SkCanvas, f: PondFrame, g: PondGfx): void {
  'worklet'
  const s = f.u / 390
  g.stroke.setPathEffect(null)
  for (let i = 0; i < f.rings.length; i += 4) {
    const age = f.rings[i + 2]!
    if (age >= 1) continue
    // Most of a ripple is in the water itself (the shader); this is only the
    // faint crest catching light, so it reads as water, not a drawn circle.
    const r = (6 + ease(age) * f.rings[i + 3]!) * s
    const k = (1 - age) * (1 - age) * f.dim
    g.stroke.setStrokeWidth(6 * s)
    paint(g, g.stroke, f.ivory, 0.035 * k)
    canvas.drawCircle(f.rings[i]!, f.rings[i + 1]!, r, g.stroke)
    g.stroke.setStrokeWidth(0.7 * s)
    paint(g, g.stroke, f.ivory, 0.13 * k)
    canvas.drawCircle(f.rings[i]!, f.rings[i + 1]!, r, g.stroke)
  }
  if (f.target.length === 3 && f.target[2]! > 0.01) {
    glow(canvas, g, 0, f.target[0]!, f.target[1]!, 9 * s, 0.5 * f.target[2]! * f.dim)
  }
}

function drawGhost(canvas: SkCanvas, f: PondFrame, g: PondGfx): void {
  'worklet'
  if (f.ghost.length < 6) return
  const s = f.u / 390
  const a = 0.26 + 0.16 * f.breath
  g.stroke.setPathEffect(g.dash)
  g.stroke.setStrokeWidth(1.3 * s)
  paint(g, g.stroke, f.brass, a * f.dim)
  canvas.drawPath(polyline(g, f.ghost, true), g.stroke)
  g.stroke.setPathEffect(null)
  // A small light tracing the lasso, as a finger would.
  const closedPts = f.ghost.concat([f.ghost[0]!, f.ghost[1]!])
  const ph = (f.t % 3600) / 3600
  const trail = partial(closedPts, ph)
  const keep = Math.max(4, Math.floor(closedPts.length * 0.16) & ~1)
  const seg = trail.slice(Math.max(0, trail.length - keep))
  if (seg.length >= 4) ribbon(canvas, g, seg, 4 * s, 0, paint(g, g.fill, f.brass, 0.7 * f.dim))
  const tip = trail.length - 2
  glow(canvas, g, 0, trail[tip]!, trail[tip + 1]!, 12 * s, 0.6 * f.dim)
}

export function drawOver(canvas: SkCanvas, f: PondFrame, g: PondGfx): void {
  'worklet'
  if (f.veil > 0) {
    // The painting: the water, koi and flora sink back; the picture stays lit.
    paint(g, g.fill, [0, 0, 0], 0.78 * f.veil)
    canvas.drawRect(g.Skia.XYWHRect(0, 0, f.w, f.h), g.fill)
  }
  drawInks(canvas, f, g)
  drawGhost(canvas, f, g)
  drawStrokes(canvas, f, g)
  drawSleepers(canvas, f, g)
  drawBuds(canvas, f, g)
  drawCulprits(canvas, f, g)
  drawDrawing(canvas, f, g)
  drawRings(canvas, f, g)
  if (f.rest > 0) {
    paint(g, g.fill, [0, 0, 0], Math.min(1, f.rest * 1.1))
    canvas.drawRect(g.Skia.XYWHRect(0, 0, f.w, f.h), g.fill)
  }
}

/* --------------------------------------------------------------- water */

/** Uniforms for WATER_SKSL, in its declaration order. */
export function waterUniforms(f: PondFrame, fieldW: number, fieldH: number) {
  'worklet'
  const rip: number[][] = []
  for (let i = 0; i < 8; i++) {
    const k = i * 4
    rip.push(k + 3 < f.ripples.length ? [f.ripples[k]!, f.ripples[k + 1]!, f.ripples[k + 2]!, f.ripples[k + 3]!] : [0, 0, 0, 0])
  }
  return {
    res: [fieldW, fieldH],
    t: f.t / 1000,
    dim: f.dim,
    veil: f.veil,
    rest: f.rest,
    moon: [f.moon[0], f.moon[1]],
    light: [f.ivory[0], f.ivory[1], f.ivory[2]],
    koi: [f.koiWater[0], f.koiWater[1], f.koiWater[2], f.koiWater[3]],
    rip,
  }
}

/* -------------------------------------------------------------- painting */

/** Where the end overlay puts the picture's name: just below the picture. */
export function paintingLabelY(f: { buds: number[] }): number {
  'worklet'
  let max = 0
  for (let i = 1; i < f.buds.length; i += 6) max = Math.max(max, f.buds[i]!)
  return max
}
