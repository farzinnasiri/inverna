/**
 * Turns engine state into the flat, pixel-space snapshots the renderer
 * draws (draw.ts): one per frame for everything that moves, and one per pond
 * for the still life (flora). Runs on the JS thread. Everything animated is
 * derived from the engine clock, so the whole pond has one clock.
 */
import { createRng } from '@/core/rng'
import { BLOOM_MS, CULPRIT_MS, pondParams, STROKE_DRAW_MS, type PondState, type PondTuning } from '@/core/games/pond/engine'
import type { FloraFrame, PondFrame, RGB } from './draw'

/** Painting timeline after the last loop closes. */
export const VEIL_DELAY_MS = 2_000
export const VEIL_MS = 1_400
export const REVEAL_MS = 1_200
/** When the name, seal and season appear; the choices follow. */
export const PAINTING_READY_MS = 3_000
/** Lights out after Rest. */
export const REST_FADE_MS = 5_200
const RING_MS = 1_300

export interface PondColors {
  brass: RGB
  ivory: RGB
  /** Five family tints, flattened rgb. */
  tints: number[]
  key: number
}

/**
 * A finished stroke's points never move, so they're worked out once per
 * stroke and screen width instead of every frame (ISS-18).
 */
const strokeCache = new WeakMap<object, { u: number; pts: number[] }>()
function finishedStroke(family: object, u: number, make: () => number[]): number[] {
  const hit = strokeCache.get(family)
  if (hit && hit.u === u) return hit.pts
  const pts = make()
  strokeCache.set(family, { u, pts })
  return pts
}

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})/i.exec(hex.trim())
  if (!m) return [1, 1, 1]
  const n = parseInt(m[1]!, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/**
 * Family tints from the app's tokens, lifted toward ivory so they read on
 * black: gold, rose (oxblood), jade (verdigris), silver, amber.
 */
export function pondColors(t: { accent: string; ink: string; sage: string; straw: string; bone: string; ochre: string }): PondColors {
  const brass = hexToRgb(t.accent)
  const ivory = hexToRgb(t.ink)
  const tints = [mix(brass, ivory, 0.2), mix(hexToRgb(t.sage), ivory, 0.38), mix(hexToRgb(t.straw), ivory, 0.42), mix(hexToRgb(t.bone), ivory, 0.25), mix(hexToRgb(t.ochre), ivory, 0.2)].flat()
  let key = 0
  for (const v of [...brass, ...ivory, ...tints]) key = (key * 31 + Math.round(v * 255)) >>> 0
  return { brass, ivory, tints, key }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** When the painting is ready to name and sign. */
export function paintingReadyAt(s: PondState): number | null {
  return s.completedAt === null ? null : s.completedAt + PAINTING_READY_MS
}

export function buildFrame(
  s: PondState,
  size: { w: number; h: number },
  calm: number,
  colors: PondColors,
  reduced: boolean,
  tuning?: PondTuning,
): PondFrame {
  const u = size.w
  const t = s.timeMs
  const flat = (pts: readonly { x: number; y: number }[]) => {
    const out: number[] = new Array(pts.length * 2)
    for (let i = 0; i < pts.length; i++) {
      out[i * 2] = pts[i]!.x * u
      out[i * 2 + 1] = pts[i]!.y * u
    }
    return out
  }

  const ghostFamily = s.ghost ? s.ghost.family : -1
  const buds: number[] = []
  for (const b of s.buds) {
    const open = b.openAt === null || t < b.openAt ? -1 : Math.min(1, (t - b.openAt) / BLOOM_MS)
    buds.push(b.x * u, b.y * u, open, b.phase, b.family, b.family === ghostFamily ? 1 : 0)
  }

  const strokes = s.families
    .filter((f) => f.doneAt !== null && t >= f.doneAt)
    .map((f) => ({
      // Keyed by the family's bud list: the state is copied each step, that array isn't.
      pts: finishedStroke(f.buds, u, () => flat(f.buds.map((id) => s.buds.find((b) => b.id === id)!))),
      closed: f.closed,
      p: clamp01((t - f.doneAt!) / STROKE_DRAW_MS),
      family: f.id,
    }))

  const breath = pondParams(calm, tuning).breath
  const rings: number[] = []
  const ripples: number[] = []
  for (let i = s.ripples.length - 1; i >= 0; i--) {
    const r = s.ripples[i]!
    if (t < r.at) continue
    if (ripples.length < 32) ripples.push(r.x, r.y, (t - r.at) / 1000, r.amp)
    if ((r.kind === 'touch' || r.kind === 'finger' || r.kind === 'tap') && t - r.at < RING_MS) {
      rings.push(r.x * u, r.y * u, (t - r.at) / RING_MS, r.kind === 'finger' ? 14 : r.kind === 'touch' ? 24 : 30)
    }
  }

  let target: number[] = []
  if (s.route && s.route.plan.kind === 'glide') {
    const total = s.route.dist[s.route.dist.length - 1]!
    target = [s.route.plan.to.x * u, s.route.plan.to.y * u, 1 - clamp01(s.route.s / Math.max(1e-6, total))]
  }

  const since = s.completedAt === null ? -1 : t - s.completedAt
  const veil = since < 0 ? 0 : clamp01((since - VEIL_DELAY_MS) / VEIL_MS)
  const reveal = since < 0 ? 0 : Math.sin(Math.PI * clamp01((since - VEIL_DELAY_MS) / (VEIL_MS + REVEAL_MS))) * 0.6 + 0.4 * clamp01((since - VEIL_DELAY_MS) / VEIL_MS)
  const rest = s.restedAt === null ? 0 : clamp01((t - s.restedAt) / REST_FADE_MS)

  return {
    w: size.w,
    h: size.h,
    u,
    t,
    dim: 1 - 0.36 * clamp01(calm),
    breath: 0.5 + 0.5 * Math.sin((2 * Math.PI * 0.1 * t) / 1000),
    reduced,
    colorKey: colors.key,
    brass: colors.brass,
    ivory: colors.ivory,
    tints: colors.tints,
    koi: flat(s.koi.spine),
    koiPhase: s.koi.phase,
    koiTurn: s.koi.turnRate,
    koiAlpha: s.restedAt === null ? 1 : 1 - clamp01((t - s.restedAt) / 6000),
    trail: flat(s.trail),
    buds,
    sleepers: s.sleepers.flatMap((sl) => [sl.x * u, sl.y * u, sl.phase]),
    culprits: s.culprits.flatMap((c) => [c.x * u, c.y * u, Math.min(1, (t - c.at) / CULPRIT_MS)]),
    strokes,
    drawing: s.stroke ? flat(s.stroke.points) : [],
    drawUsed: s.stroke ? clamp01(s.stroke.length / breath) : 0,
    inks: s.inks.map((i) => ({ pts: flat(i.points), traced: i.traced, closedAge: i.closedAt === null ? -1 : t - i.closedAt, k: i.k })),
    rings,
    target,
    ghost: s.ghost ? flat(s.ghost.points) : [],
    veil,
    reveal,
    rest,
    moon: [0.76, s.top + 0.06],
    ripples,
    koiWater: [s.koi.x, s.koi.y, s.koi.heading, reduced ? s.koi.speed * 0.5 : s.koi.speed],
  }
}

/**
 * The pond's still life, placed round the picture from the pond's seed:
 * lily pads and stones at the margins, reeds in the bottom corners, a few
 * fallen leaves. Never over a bud.
 */
export function buildFlora(s: PondState, size: { w: number; h: number }, calm: number, colors: PondColors): FloraFrame {
  const rng = createRng((s.seed ^ 0x5bd1e995) >>> 0)
  const u = size.w
  const xs = s.buds.map((b) => b.x)
  const ys = s.buds.map((b) => b.y)
  const box = { x0: Math.min(...xs) - 0.07, x1: Math.max(...xs) + 0.07, y0: Math.min(...ys) - 0.07, y1: Math.max(...ys) + 0.07 }
  const placed: { x: number; y: number; r: number }[] = []
  const clear = (x: number, y: number, r: number) =>
    !(x + r > box.x0 && x - r < box.x1 && y + r > box.y0 && y - r < box.y1) &&
    s.buds.every((b) => Math.hypot(b.x - x, b.y - y) > r + 0.06) &&
    Math.hypot(s.koi.x - x, s.koi.y - y) > r + 0.1 &&
    placed.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + r + 0.03) &&
    y - r > s.top - 0.02 &&
    y + r < s.aspect + 0.02
  const spot = (r: number, tries = 80) => {
    for (let k = 0; k < tries; k++) {
      const edge = rng.next()
      const x = edge < 0.5 ? (rng.next() < 0.5 ? -0.02 + rng.next() * 0.2 : 0.82 + rng.next() * 0.2) : 0.05 + rng.next() * 0.9
      const y = s.top + 0.04 + rng.next() * (s.aspect - s.top - 0.08)
      if (clear(x, y, r)) {
        placed.push({ x, y, r })
        return { x, y }
      }
    }
    return null
  }

  const pads: number[] = []
  for (let i = 0; i < 6; i++) {
    const r = 0.045 + rng.next() * 0.04
    const p = spot(r)
    if (p) pads.push(p.x * u, p.y * u, r * u, rng.next() * Math.PI * 2, 24 + rng.next() * 20)
  }
  const stones: number[] = []
  for (let i = 0; i < 2; i++) {
    const r = 0.04 + rng.next() * 0.03
    const p = spot(r)
    if (p) stones.push(p.x * u, p.y * u, r * u, rng.next() * Math.PI)
  }
  const leaves: number[] = []
  for (let i = 0; i < 3; i++) {
    const r = 0.014 + rng.next() * 0.008
    const p = spot(r, 40)
    if (p) leaves.push(p.x * u, p.y * u, r * u, rng.next() * Math.PI * 2)
  }
  const reeds: number[] = []
  const base = size.h + 4
  for (let i = 0; i < 8; i++) reeds.push((0.012 + i * 0.019 + rng.next() * 0.01) * u, base, (0.16 + rng.next() * 0.16) * u, (0.02 + rng.next() * 0.04) * u)
  for (let i = 0; i < 5; i++) reeds.push((0.985 - i * 0.02 - rng.next() * 0.01) * u, base, (0.1 + rng.next() * 0.12) * u, -(0.015 + rng.next() * 0.03) * u)

  return { w: size.w, h: size.h, u, dim: 1 - 0.36 * clamp01(calm), brass: colors.brass, ivory: colors.ivory, pads, stones, reeds, leaves }
}
