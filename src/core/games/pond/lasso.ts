/**
 * Lasso beautification, like a shape-recognition pen: whatever loop you
 * draw comes back as an elegant closed curve. Close to an ellipse, it snaps
 * to that ellipse; otherwise it becomes a smooth closed spline with the same
 * character and roughly the same area.
 *
 * Method: find the loop (the largest one, if the path crosses itself, or
 * close the gap if it nearly meets), resample it evenly by arc length, take
 * its Fourier series, and keep only the low harmonics. Harmonics ±1 alone are
 * exactly an ellipse, so "how elliptical" is just how much energy sits beyond
 * them. Pure and deterministic.
 */
import type { Vec2 } from './engine'

const RESAMPLE = 128
const OUTPUT = 128
/**
 * Harmonics kept for a free lasso. Enough to keep the shape you meant (a
 * hook round a sleeping bud, a kidney, a long thin loop), with the taper
 * still removing the jitter of a finger.
 */
const KEEP = 12
/**
 * How elliptical a loop is, judged on harmonics 2..SHAPE_HARMONICS only:
 * those are its shape; the higher ones are mostly a finger's jitter.
 */
const SHAPE_HARMONICS = 4
/** Below this share of shape energy beyond ±1, the loop was drawn as an ellipse: snap it. */
const SNAP_ELLIPSE = 0.009
/** Between SNAP_ELLIPSE and this, it eases toward the ellipse. */
const LEAN_ELLIPSE = 0.022

export interface Lasso {
  /** Closed curve: last point connects back to the first. */
  points: Vec2[]
  /** True when the drawn path was a loop (closed, crossed, or nearly met). */
  closed: boolean
  /** True when it was snapped to an ellipse. */
  ellipse: boolean
  area: number
  length: number
}

function len(path: readonly Vec2[], closed = false): number {
  let L = 0
  for (let i = 1; i < path.length; i++) L += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y)
  if (closed && path.length > 1) L += Math.hypot(path[0]!.x - path[path.length - 1]!.x, path[0]!.y - path[path.length - 1]!.y)
  return L
}

export function signedArea(poly: readonly Vec2[]): number {
  let s = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j]!.x + poly[i]!.x) * (poly[j]!.y - poly[i]!.y)
  return s / 2
}

/** Evenly spaced points along a path (closed: wraps back to the start). */
export function resample(path: readonly Vec2[], n: number, closed: boolean): Vec2[] {
  const pts = closed ? [...path, path[0]!] : path.slice()
  const total = len(pts)
  if (total <= 0 || pts.length < 2) return Array.from({ length: n }, () => ({ ...path[0]! }))
  const step = total / (closed ? n : n - 1)
  const out: Vec2[] = [{ ...pts[0]! }]
  let acc = 0
  let i = 1
  let prev = pts[0]!
  while (out.length < n && i < pts.length) {
    const cur = pts[i]!
    const d = Math.hypot(cur.x - prev.x, cur.y - prev.y)
    if (acc + d >= step && d > 0) {
      const t = (step - acc) / d
      const p = { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t }
      out.push(p)
      prev = p
      acc = 0
    } else {
      acc += d
      prev = cur
      i++
    }
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1]! })
  return out
}

function hit(a: Vec2, b: Vec2, c: Vec2, d: Vec2): { u: number; v: number } | null {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const sx = d.x - c.x
  const sy = d.y - c.y
  const den = rx * sy - ry * sx
  if (Math.abs(den) < 1e-12) return null
  const u = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den
  const v = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v } : null
}

/**
 * The loop in a drawn path. If the path crosses itself, the crossing that
 * encloses the most area wins (a stray kink doesn't steal the lasso). If it
 * nearly meets itself, the gap closes. Otherwise it's an open stroke.
 */
export function findLoop(path: readonly Vec2[], closure = 1): { loop: Vec2[]; closed: boolean } {
  if (path.length < 3) return { loop: path.slice(), closed: false }
  const pts = resample(path, Math.min(160, Math.max(24, Math.round(len(path) / 0.01))), false)
  let best: Vec2[] | null = null
  let bestArea = 0
  for (let j = 3; j < pts.length - 1; j++) {
    for (let i = 0; i < j - 2; i++) {
      const h = hit(pts[i]!, pts[i + 1]!, pts[j]!, pts[j + 1]!)
      if (!h) continue
      const at = { x: pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * h.u, y: pts[i]!.y + (pts[i + 1]!.y - pts[i]!.y) * h.u }
      const loop = [at, ...pts.slice(i + 1, j + 1)]
      const a = Math.abs(signedArea(loop))
      if (a > bestArea) {
        bestArea = a
        best = loop
      }
    }
  }
  const L = len(pts)
  const gap = Math.hypot(pts[0]!.x - pts[pts.length - 1]!.x, pts[0]!.y - pts[pts.length - 1]!.y)
  const nearlyMet = gap <= Math.max(0.12, 0.3 * L) * closure
  const whole = Math.abs(signedArea(pts))
  // A crossing loop wins unless closing the whole path gives clearly more.
  if (best && !(nearlyMet && whole > bestArea * 1.4)) return { loop: best, closed: true }
  if (nearlyMet && L > 0.15) return { loop: pts, closed: true }
  return { loop: pts, closed: false }
}

interface Coef {
  re: number
  im: number
}

function dft(pts: readonly Vec2[], k: number): Coef {
  const n = pts.length
  let re = 0
  let im = 0
  for (let j = 0; j < n; j++) {
    const a = (-2 * Math.PI * k * j) / n
    const c = Math.cos(a)
    const s = Math.sin(a)
    re += pts[j]!.x * c - pts[j]!.y * s
    im += pts[j]!.x * s + pts[j]!.y * c
  }
  return { re: re / n, im: im / n }
}

/**
 * Smooth a drawn loop into an elegant closed curve. Returns null for paths
 * too short or too flat to be a lasso.
 */
export function beautify(path: readonly Vec2[], opts: { closure?: number } = {}): Lasso | null {
  if (path.length < 3 || len(path) < 0.08) return null
  const { loop, closed } = findLoop(path, opts.closure ?? 1)
  if (!closed) return null
  const originalArea = Math.abs(signedArea(loop))
  if (originalArea < 0.004) return null
  const pts = resample(loop, RESAMPLE, true)

  const coefs = new Map<number, Coef>()
  for (let k = -KEEP; k <= KEEP; k++) coefs.set(k, dft(pts, k))
  const energy = (k: number) => {
    const c = coefs.get(k)!
    return c.re * c.re + c.im * c.im
  }
  const base = energy(1) + energy(-1)
  let beyond = 0
  for (let k = 2; k <= SHAPE_HARMONICS; k++) beyond += energy(k) + energy(-k)
  const share = beyond / Math.max(1e-12, base + beyond)
  // 0 keeps every harmonic up to KEEP; 1 keeps only the ellipse.
  const toEllipse = share <= SNAP_ELLIPSE ? 1 : share >= LEAN_ELLIPSE ? 0 : 1 - (share - SNAP_ELLIPSE) / (LEAN_ELLIPSE - SNAP_ELLIPSE)

  const out: Vec2[] = []
  for (let j = 0; j < OUTPUT; j++) {
    let x = 0
    let y = 0
    for (let k = -KEEP; k <= KEEP; k++) {
      const c = coefs.get(k)!
      const ak = Math.abs(k)
      // Lanczos taper keeps the curve smooth without ringing.
      const sigma = ak === 0 ? 1 : Math.sin((Math.PI * ak) / (KEEP + 1)) / ((Math.PI * ak) / (KEEP + 1))
      const w = ak <= 1 ? 1 : sigma * (1 - toEllipse)
      if (w === 0) continue
      const a = (2 * Math.PI * k * j) / OUTPUT
      const cs = Math.cos(a)
      const sn = Math.sin(a)
      x += w * (c.re * cs - c.im * sn)
      y += w * (c.re * sn + c.im * cs)
    }
    out.push({ x, y })
  }

  // Smoothing shrinks a lasso a little; give its area back.
  const a = Math.abs(signedArea(out))
  if (a > 1e-9) {
    const f = Math.min(1.25, Math.max(0.8, Math.sqrt(originalArea / a)))
    const c0 = coefs.get(0)!
    for (const p of out) {
      p.x = c0.re + (p.x - c0.re) * f
      p.y = c0.im + (p.y - c0.im) * f
    }
  }
  return { points: out, closed: true, ellipse: toEllipse >= 1, area: Math.abs(signedArea(out)), length: len(out, true) }
}
