import { describe, expect, it } from 'vitest'
import { createRng } from '../../rng'
import type { Vec2 } from './engine'
import { beautify, findLoop, signedArea } from './lasso'

/** A hand-drawn loop: a shape made of a few harmonics, with wobble and jitter. */
function drawn(seed: number, kind: 'circle' | 'ellipse' | 'blob' | 'star', overshoot = 0.12): Vec2[] {
  const rng = createRng(seed)
  const cx = 0.5 + (rng.next() - 0.5) * 0.2
  const cy = 0.9 + (rng.next() - 0.5) * 0.2
  const rx = 0.14 + rng.next() * 0.12
  const ry = kind === 'circle' ? rx : rx * (0.45 + rng.next() * 0.4)
  const rot = rng.next() * Math.PI
  const n = 90
  const pts: Vec2[] = []
  const a0 = rng.next() * Math.PI * 2
  for (let i = 0; i <= n * (1 + overshoot); i++) {
    const t = a0 + (i / n) * Math.PI * 2
    let r = 1
    if (kind === 'blob') r = 1 + 0.25 * Math.sin(2 * t + 1) + 0.15 * Math.sin(3 * t + 2)
    if (kind === 'star') r = 1 + 0.35 * Math.sin(5 * t)
    r *= 1 + (rng.next() - 0.5) * 0.06
    const x = Math.cos(t) * rx * r
    const y = Math.sin(t) * ry * r
    pts.push({ x: cx + x * Math.cos(rot) - y * Math.sin(rot) + (rng.next() - 0.5) * 0.006, y: cy + x * Math.sin(rot) + y * Math.cos(rot) + (rng.next() - 0.5) * 0.006 })
  }
  return pts
}

function turning(pts: Vec2[]): number {
  let max = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n]!
    const b = pts[i]!
    const c = pts[(i + 1) % n]!
    let d = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x)
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    max = Math.max(max, Math.abs(d))
  }
  return (max * 180) / Math.PI
}

function spacingRatio(pts: Vec2[]): number {
  const n = pts.length
  const d = pts.map((p, i) => Math.hypot(pts[(i + 1) % n]!.x - p.x, pts[(i + 1) % n]!.y - p.y))
  return Math.max(...d) / Math.max(1e-9, Math.min(...d))
}

describe('lasso beautification', () => {
  const kinds = ['circle', 'ellipse', 'blob', 'star'] as const

  it('always returns a closed, smooth curve with roughly the drawn area', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const kind of kinds) {
        const raw = drawn(seed, kind)
        const out = beautify(raw)
        expect(out, `${kind} ${seed}`).not.toBeNull()
        const pts = out!.points
        expect(out!.closed).toBe(true)
        // Closed: the last point flows into the first like every other step.
        expect(spacingRatio(pts)).toBeLessThan(3.5)
        // Smooth: no corners.
        expect(turning(pts), `${kind} ${seed}`).toBeLessThan(kind === 'star' ? 40 : 25)
        // Area preserved within 20% of the loop that was drawn.
        const drawnArea = Math.abs(signedArea(findLoop(raw).loop))
        expect(out!.area / drawnArea).toBeGreaterThan(0.8)
        expect(out!.area / drawnArea).toBeLessThan(1.2)
      }
    }
  })

  it('snaps near-ellipses to a true ellipse, and leaves real shapes their character', () => {
    let snapped = 0
    let starSnapped = 0
    for (let seed = 1; seed <= 40; seed++) {
      if (beautify(drawn(seed, 'ellipse'))!.ellipse) snapped++
      if (beautify(drawn(seed, 'star'))!.ellipse) starSnapped++
      // An ellipse stays an ellipse when smoothed again.
      const once = beautify(drawn(seed, 'circle'))!
      if (once.ellipse) expect(beautify(once.points)!.ellipse).toBe(true)
    }
    expect(snapped).toBeGreaterThanOrEqual(36)
    expect(starSnapped).toBe(0)
  })

  it('closes a loop that nearly meets, and leaves an open stroke open', () => {
    const gap = drawn(3, 'circle', -0.12)
    expect(beautify(gap)).not.toBeNull()
    const arc = drawn(4, 'circle', -0.55)
    expect(beautify(arc)).toBeNull()
    expect(beautify([{ x: 0.1, y: 0.1 }, { x: 0.12, y: 0.1 }])).toBeNull()
  })

  it('takes the big loop when the path crosses itself, not a stray kink', () => {
    const raw = drawn(9, 'circle', 0.2)
    // A small kink near the start.
    const k = raw[5]!
    const kink = [k, { x: k.x + 0.02, y: k.y + 0.02 }, { x: k.x + 0.03, y: k.y }, { x: k.x - 0.005, y: k.y + 0.015 }]
    const path = [...raw.slice(0, 5), ...kink, ...raw.slice(6)]
    const out = beautify(path)!
    expect(out.area).toBeGreaterThan(Math.abs(signedArea(raw.slice(0, 90))) * 0.8)
  })

  it('keeps the shape you meant: a loop that curls round a point leaves it outside', () => {
    // A C-shaped lasso: round the outside, then back in to hook around a notch at (0.5, 0.5).
    const pts: { x: number; y: number }[] = []
    for (let k = 0; k <= 40; k++) {
      const a = (-0.85 + (k / 40) * 1.7) * Math.PI
      pts.push({ x: 0.5 + Math.cos(a) * 0.22, y: 0.5 + Math.sin(a) * 0.22 })
    }
    for (let k = 0; k <= 20; k++) {
      const a = (0.85 - (k / 20) * 1.7) * Math.PI
      pts.push({ x: 0.5 + Math.cos(a) * 0.09 + 0.02, y: 0.5 + Math.sin(a) * 0.09 })
    }
    const out = beautify(pts)!
    expect(out).not.toBeNull()
    expect(out.ellipse).toBe(false)
    const inside = (p: { x: number; y: number }, poly: { x: number; y: number }[]) => {
      let c = false
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!
        const b = poly[j]!
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
      }
      return c
    }
    expect(inside({ x: 0.5, y: 0.5 }, out.points)).toBe(false)
    expect(inside({ x: 0.5, y: 0.31 }, out.points)).toBe(true)
  })
})

