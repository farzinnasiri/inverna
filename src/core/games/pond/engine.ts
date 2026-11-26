/**
 * Pond: every pond hides a picture.
 *
 * The lotus buds are a hand-authored picture (a crane, Fuji, a wave...),
 * made of 2–5 strokes. Each stroke's buds are a family. Draw a lasso round a
 * whole family and the koi swims it: the family blooms together and its
 * stroke draws itself between the blossoms. A lasso round part of a family
 * blooms those buds alone; finish it later. A lasso is only as long as the
 * koi's breath, so one giant loop can't take everything: you read the
 * picture and fit a loop to each stroke. When every stroke is drawn, the
 * picture is revealed and becomes the painting.
 *
 * Units: the pond is 1 wide and `aspect` tall. `top` and `bottom` keep play
 * clear of the screen's chrome. Pure and deterministic: time comes in as
 * `dtMs`; the screen drains `events` for cues and haptics.
 */
import { createRng } from '../../rng'
import { beautify } from './lasso'
import { choosePicture, generatePicture, pictureById, PICTURE_BOX_HEIGHT, type Picture } from './pictures'

export interface Vec2 {
  x: number
  y: number
}

/* ------------------------------------------------------------- constants */

export const SPINE_POINTS = 11
export const SPINE_SPACING = 0.0195
/** Untouched this long, the koi starts finishing the picture on its own. */
export const IDLE_HANDOFF_MS = 45_000
/** After the last stroke: the picture lights up, then the painting and choices. */
export const END_SETTLE_MS = 4_200
/** Untouched this long after the choices appear, the pond rests by itself. */
export const REST_AFTER_MS = 20_000
export const BLOOM_STAGGER_MS = 150
export const BLOOM_MS = 1_600
/** A stroke takes this long to draw itself once its family is complete. */
export const STROKE_DRAW_MS = 1_400
/** A tap this close to a bud circles it. */
export const BUD_TAP_RADIUS = 0.07
/** The small circle the koi swims round a tapped bud. */
export const BUD_CIRCLE_RADIUS = 0.056
export const MAX_PLANS = 3
/** At most this many water ripples at once (they're shader uniforms). */
export const MAX_RIPPLES = 8
export const RIPPLE_MS = 3_200
/** The koi's wake, as seen: positions from the last this many ms. */
export const TRAIL_MS = 2_400
const TRAIL_STEP = 0.01
const STROKE_STEP = 0.008
const FINGER_RIPPLE_EVERY = 0.12
const MAX_SUBSTEP_MS = 34
const MARGIN = 0.035

/* ----------------------------------------------------------------- tuning */

/** Multipliers for the dev tuning panel. All 1 in shipped builds. */
export interface PondTuning {
  /** Longest lasso (the koi's breath). */
  breath: number
  /** How fast the koi swims a route. */
  speed: number
  /** How far apart a lasso's ends may be and still close. */
  closure: number
}

export const DEFAULT_TUNING: PondTuning = { breath: 1, speed: 1, closure: 1 }

export interface PondParams {
  /** Longest lasso, pond widths. */
  breath: number
  /** Swimming speed on a route, pond widths per second. */
  speed: number
  /** Idle cruising speed. */
  cruise: number
  closure: number
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

function clamp01(v: number): number {
  return clamp(v, 0, 1)
}

/** Later in the night: a longer breath, a gentler koi. */
export function pondParams(calm: number, tuning: PondTuning = DEFAULT_TUNING): PondParams {
  const c = clamp01(calm)
  return {
    breath: (2.2 + 0.6 * c) * tuning.breath,
    // About a second and a half across the pond: responsive, never darting.
    speed: (0.56 - 0.14 * c) * tuning.speed,
    cruise: 0.05 - 0.015 * c,
    closure: tuning.closure,
  }
}

/* ------------------------------------------------------------------ state */

export interface KoiState {
  x: number
  y: number
  heading: number
  /** Pond widths per second. */
  speed: number
  /** Swimming phase for the tail and fins, radians. */
  phase: number
  /** Current turn, radians per second (fins bank with it). */
  turnRate: number
  /** Head (0) to tail (SPINE_POINTS - 1), SPINE_SPACING apart. */
  spine: Vec2[]
}

export interface Bud extends Vec2 {
  id: number
  /** Which stroke of the picture it belongs to. */
  family: number
  /** When it opens (may be a moment ahead, for the chord's stagger). */
  openAt: number | null
  /** Opened by the koi on its own. */
  auto: boolean
  /** Breathing offset so buds don't glow in lockstep. */
  phase: number
}

export interface Family {
  id: number
  /** Bud ids in stroke order. */
  buds: number[]
  closed: boolean
  /** When its stroke starts drawing (all its buds open). */
  doneAt: number | null
  auto: boolean
}

/**
 * A sleeping bud: dim, closed for the night, never opens. A loop that holds
 * one opens nothing. They sit in the gaps between families, which is what
 * makes a pond a puzzle (how many there are is the difficulty).
 */
export interface Sleeper extends Vec2 {
  id: number
  phase: number
}

export type PondMode = 'pictures' | 'endless'

/** Something the koi will swim: a loop to close, or a glide or path to follow. */
export type Plan =
  | { kind: 'loop'; points: Vec2[]; auto: boolean; ellipse: boolean; family?: number }
  | { kind: 'glide'; to: Vec2 }
  | { kind: 'path'; points: Vec2[] }

export interface Route {
  /** Points the koi swims through, evenly spaced. */
  points: Vec2[]
  /** Cumulative distance at each point. */
  dist: number[]
  /** Distance swum so far. */
  s: number
  /** Where the loop part starts (distance), or -1 if there's no loop. */
  loopFrom: number
  plan: Plan
  /** Id of the ink shown for a loop. */
  inkId: number
}

/** A drawn lasso on the water, traced by the koi, flaring when it closes. */
export interface Ink {
  id: number
  points: Vec2[]
  /** When the koi closed it, or null while it's still swimming it. */
  closedAt: number | null
  /** 0..1 of the loop the koi has traced. */
  traced: number
  k: number
  auto: boolean
}

export type RippleKind = 'touch' | 'finger' | 'tap' | 'bloom' | 'close'

export interface Ripple extends Vec2 {
  id: number
  at: number
  kind: RippleKind
  /** 0..1 strength. */
  amp: number
}

export interface TrailPoint extends Vec2 {
  t: number
}

/** The lasso being drawn right now. */
export interface DrawnStroke {
  points: Vec2[]
  length: number
  /** The breath ran out: the line stops here. */
  spent: boolean
  lastRipple: number
}

/** First play: one family glows, and a ghost lasso shows the way round it. */
export interface Ghost {
  family: number
  points: Vec2[]
}

export interface PictureFrame {
  x: number
  y: number
  scale: number
}

export type PondEvent =
  | { type: 'tap' }
  | { type: 'loop'; k: number; auto: boolean; last: boolean; strokes: number; muddy: boolean }
  | { type: 'spent' }
  | { type: 'handoff' }
  | { type: 'taught'; teach: number }
  | { type: 'rest'; auto: boolean }

export interface PondState {
  version: 4
  seed: number
  picture: string
  /** A generated pattern (Endless), or null for one of the authored pictures. */
  custom: Picture | null
  mode: PondMode
  /** 0..1 how hard this pond was dealt (sleepers). */
  level: number
  sleepers: Sleeper[]
  /** Your loops this pond, and how many held mixed families or a sleeper (for Endless). */
  loopsMade: number
  muddy: number
  /** What spoiled the last muddied loop, pulsing for a moment. */
  culprits: { x: number; y: number; at: number }[]
  frame: PictureFrame
  aspect: number
  top: number
  bottom: number
  timeMs: number
  koi: KoiState
  trail: TrailPoint[]
  route: Route | null
  plans: Plan[]
  stroke: DrawnStroke | null
  inks: Ink[]
  buds: Bud[]
  families: Family[]
  ripples: Ripple[]
  ghost: Ghost | null
  /** 0: never played, 1: has completed a stroke. */
  teach: number
  lastTouchMs: number
  settling: boolean
  completedAt: number | null
  restedAt: number | null
  nextId: number
  /** Idle cruising: where the koi drifts toward. */
  wander: number
  events: PondEvent[]
}

export interface CreatePondOptions {
  seed: number
  calm: number
  /** Height / width of the water. */
  aspect: number
  top?: number
  bottom?: number
  teach?: number
  /** A specific picture; otherwise one is chosen for the hour. */
  picture?: string
  /** Pictures seen lately, to avoid repeats. */
  recent?: readonly string[]
  /** 0..1 challenge: how many sleepers lie between the families. Default 0.3. */
  level?: number
  /** Endless deals generated patterns and mirrored pictures as well. */
  mode?: PondMode
}

/* -------------------------------------------------------------- geometry */

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function normAngle(a: number): number {
  let r = a
  while (r > Math.PI) r -= Math.PI * 2
  while (r < -Math.PI) r += Math.PI * 2
  return r
}

export function pointInPolygon(pt: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Distance from a point to a closed polygon's edge. */
function edgeDistance(p: Vec2, poly: readonly Vec2[]): number {
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!
    const b = poly[i]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const L2 = dx * dx + dy * dy
    const t = L2 > 0 ? clamp01(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2) : 0
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)))
  }
  return best
}

/** How far inside a loop a point is (negative: outside), in pond widths. */
export function depthIn(p: Vec2, poly: readonly Vec2[]): number {
  const d = edgeDistance(p, poly)
  return pointInPolygon(p, poly) ? d : -d
}

/**
 * Forgiveness at a loop's edge, in pond widths (390pt wide: 0.024 is about 9pt).
 * A sleeper or another family's bud only spoils a loop when it is clearly
 * inside; your own family's buds count even when the line passes just outside.
 */
export const SLEEPER_SLACK = 0.024
export const FOREIGN_SLACK = 0.016
export const HOLD_SLACK = 0.02
/** How long a bud or sleeper that spoiled a loop pulses, so you can see why. */
export const CULPRIT_MS = 1_800

export function polygonArea(poly: readonly Vec2[]): number {
  let s = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j]!.x + poly[i]!.x) * (poly[j]!.y - poly[i]!.y)
  return Math.abs(s / 2)
}

export function pathLength(path: readonly Vec2[], closed = false): number {
  let len = 0
  for (let i = 1; i < path.length; i++) len += dist(path[i]!, path[i - 1]!)
  if (closed && path.length > 1) len += dist(path[0]!, path[path.length - 1]!)
  return len
}

function convexHull(pts: Vec2[]): Vec2[] {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y)
  if (p.length < 3) return p
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Vec2[] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: Vec2[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop()
    upper.push(q)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

/** A smooth loop hugging some buds: the hull of small circles round each. */
export function loopAround(buds: readonly Vec2[], pad = 0.06): Vec2[] {
  const ring: Vec2[] = []
  for (const b of buds) for (let k = 0; k < 16; k++) ring.push({ x: b.x + Math.cos((k / 16) * Math.PI * 2) * pad, y: b.y + Math.sin((k / 16) * Math.PI * 2) * pad })
  const hull = convexHull(ring)
  return resampleClosed(hull, 64)
}

function resampleClosed(poly: readonly Vec2[], n: number): Vec2[] {
  const pts = [...poly, poly[0]!]
  const total = pathLength(pts)
  const out: Vec2[] = []
  let seg = 0
  let segStart = 0
  for (let i = 0; i < n; i++) {
    const d = (total * i) / n
    while (seg < pts.length - 2 && segStart + dist(pts[seg]!, pts[seg + 1]!) < d) {
      segStart += dist(pts[seg]!, pts[seg + 1]!)
      seg++
    }
    const L = dist(pts[seg]!, pts[seg + 1]!) || 1
    const t = clamp01((d - segStart) / L)
    out.push({ x: pts[seg]!.x + (pts[seg + 1]!.x - pts[seg]!.x) * t, y: pts[seg]!.y + (pts[seg + 1]!.y - pts[seg]!.y) * t })
  }
  return out
}

/* --------------------------------------------------------------- creation */

function playBounds(s: Pick<PondState, 'aspect' | 'top' | 'bottom'>) {
  return { x0: 0, x1: 1, y0: s.top, y1: s.aspect - s.bottom }
}

function buildSpine(x: number, y: number, heading: number): Vec2[] {
  const spine: Vec2[] = [{ x, y }]
  for (let i = 1; i < SPINE_POINTS; i++) spine.push({ x: x - Math.cos(heading) * SPINE_SPACING * i, y: y - Math.sin(heading) * SPINE_SPACING * i })
  return spine
}

/** Where the picture sits: centred in the play area, as large as fits. */
export function pictureFrame(aspect: number, top: number, bottom: number): PictureFrame {
  const avail = aspect - top - bottom
  const scale = Math.min(0.84, (avail - 0.24) / PICTURE_BOX_HEIGHT)
  return { x: (1 - scale) / 2, y: top + (avail - PICTURE_BOX_HEIGHT * scale) / 2 - 0.02, scale }
}

/** The ghost lasso for first play, round the most compact family. */
function teachingGhost(buds: readonly Bud[], families: readonly Family[]): Ghost | null {
  let best: Ghost | null = null
  let bestLen = Infinity
  for (const f of families) {
    const pts = buds.filter((b) => b.family === f.id)
    const loop = loopAround(pts, 0.065)
    const L = pathLength(loop, true)
    if (L < bestLen) {
      bestLen = L
      best = { family: f.id, points: loop }
    }
  }
  return best
}

/** How many sleepers a pond gets at a challenge level. */
export function sleeperCount(level: number): number {
  return Math.round(clamp01(level) * 7)
}

/** Keep sleepers this far from any bud, so tapping a bud (a small circle) never catches one. */
const SLEEPER_CLEAR = 0.072

/**
 * Put sleepers where they make you think: in the gaps between neighbouring
 * families first, then in the hollows of a family's own curve (so the easy
 * round loop no longer works). Never on top of a bud.
 */
function placeSleepers(buds: readonly Bud[], count: number, rand: () => number, bounds: { x0: number; x1: number; y0: number; y1: number }): Sleeper[] {
  if (count <= 0) return []
  const cands: { p: Vec2; score: number }[] = []
  for (let i = 0; i < buds.length; i++) {
    for (let j = i + 1; j < buds.length; j++) {
      const a = buds[i]!
      const b = buds[j]!
      const d = dist(a, b)
      if (d > 0.34 || d < SLEEPER_CLEAR * 1.6) continue
      const sameFamily = a.family === b.family
      // Between two families: the strongest. Within one family: a hollow.
      const score = (sameFamily ? 0.6 : 1) / (d + 0.05) + rand() * 1.5
      cands.push({ p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, score })
    }
  }
  cands.sort((a, b) => b.score - a.score)
  const out: Sleeper[] = []
  for (const c of cands) {
    if (out.length >= count) break
    const p = c.p
    if (p.x < bounds.x0 + 0.06 || p.x > bounds.x1 - 0.06 || p.y < bounds.y0 + 0.04 || p.y > bounds.y1 - 0.06) continue
    if (buds.some((b) => dist(b, p) < SLEEPER_CLEAR)) continue
    if (out.some((q) => dist(q, p) < 0.09)) continue
    out.push({ id: 0, x: p.x, y: p.y, phase: rand() * Math.PI * 2 })
  }
  return out
}

/** Endless: a little harder after a clean pond, a little easier after a muddled one. */
export function nextLevel(level: number, pond: { loopsMade: number; muddy: number; families: number; auto: boolean }): number {
  if (pond.auto) return level
  const perFamily = pond.loopsMade / Math.max(1, pond.families)
  let next = level
  if (pond.muddy <= 1 && perFamily <= 1.6) next += 0.08
  else if (pond.muddy >= 4 || perFamily >= 3) next -= 0.1
  else next += 0.02
  return Math.min(0.95, Math.max(0.05, next))
}

function mirrored(p: Picture): Picture {
  return { ...p, families: p.families.map((f) => ({ ...f, points: f.points.map(([x, y]) => [1 - x, y] as const) })) }
}

export function createPond(opts: CreatePondOptions): PondState {
  const rng = createRng(opts.seed)
  const rand = () => rng.next()
  const aspect = Math.max(1.2, opts.aspect)
  const top = clamp(opts.top ?? 0.16, 0, aspect * 0.3)
  const bottom = clamp(opts.bottom ?? 0.1, 0, aspect * 0.3)
  const teach = clamp(Math.round(opts.teach ?? 1), 0, 1)
  const mode: PondMode = opts.mode ?? 'pictures'
  const pick = rng.next()
  let picture: Picture = (opts.picture ? pictureById(opts.picture) : undefined) ?? choosePicture(pick, opts.calm, opts.recent)
  let custom: Picture | null = null
  if (!opts.picture && mode === 'endless') {
    // Endless never runs out: about one pond in three is a new pattern, the
    // rest are the pictures, often mirrored.
    if (rng.next() < 0.36) {
      const gen = generatePicture(rand, opts.seed)
      if (gen.families.length >= 3) {
        custom = gen
        picture = gen
      }
    }
    if (!custom && rng.next() < 0.5) picture = mirrored(picture)
  }
  const frame = pictureFrame(aspect, top, bottom)

  let nextId = 1
  const buds: Bud[] = []
  const families: Family[] = picture.families.map((f, fi) => {
    const ids: number[] = []
    for (const [px, py] of f.points) {
      const id = nextId++
      ids.push(id)
      buds.push({ id, x: frame.x + px * frame.scale, y: frame.y + py * frame.scale, family: fi, openAt: null, auto: false, phase: rng.next() * Math.PI * 2 })
    }
    return { id: fi, buds: ids, closed: Boolean(f.closed), doneAt: null, auto: false }
  })
  // First play has no sleepers: one thing to learn at a time.
  const level = teach === 0 ? 0 : clamp01(opts.level ?? 0.3)
  const sleepers = placeSleepers(buds, sleeperCount(level), rand, { x0: 0, x1: 1, y0: top, y1: aspect - bottom }).map((sl) => ({ ...sl, id: nextId++ }))

  const b = { y1: aspect - bottom }
  const start = { x: 0.5, y: Math.min(b.y1 - 0.06, frame.y + PICTURE_BOX_HEIGHT * frame.scale + 0.12) }
  const heading = -Math.PI / 2
  return {
    version: 4,
    seed: opts.seed >>> 0,
    picture: picture.id,
    custom,
    mode,
    level,
    sleepers,
    loopsMade: 0,
    muddy: 0,
    culprits: [],
    frame,
    aspect,
    top,
    bottom,
    timeMs: 0,
    koi: { x: start.x, y: start.y, heading, speed: 0, phase: 0, turnRate: 0, spine: buildSpine(start.x, start.y, heading) },
    trail: [],
    route: null,
    plans: [],
    stroke: null,
    inks: [],
    buds,
    families,
    ripples: [],
    ghost: teach === 0 ? teachingGhost(buds, families) : null,
    teach,
    lastTouchMs: 0,
    settling: false,
    completedAt: null,
    restedAt: null,
    nextId,
    wander: rng.next() * Math.PI * 2,
    events: [],
  }
}

/* ---------------------------------------------------------------- helpers */

function copy(s: PondState): PondState {
  return {
    ...s,
    koi: { ...s.koi, spine: s.koi.spine.map((p) => ({ x: p.x, y: p.y })) },
    trail: s.trail.slice(),
    route: s.route ? { ...s.route } : null,
    plans: s.plans.slice(),
    stroke: s.stroke ? { ...s.stroke, points: s.stroke.points.slice() } : null,
    inks: s.inks.map((i) => ({ ...i })),
    buds: s.buds.map((b) => ({ ...b })),
    families: s.families.map((f) => ({ ...f })),
    sleepers: s.sleepers.slice(),
    culprits: s.culprits.slice(),
    ripples: s.ripples.slice(),
    events: s.events.slice(),
  }
}

function clampToPlay(s: PondState, x: number, y: number): Vec2 {
  const b = playBounds(s)
  return { x: clamp(x, b.x0 + MARGIN, b.x1 - MARGIN), y: clamp(y, b.y0 + MARGIN * 0.5, b.y1 - MARGIN) }
}

function addRipple(s: PondState, x: number, y: number, kind: RippleKind, amp: number, at = s.timeMs): void {
  s.ripples.push({ id: s.nextId++, x, y, at, kind, amp })
  if (s.ripples.length > MAX_RIPPLES) s.ripples.splice(0, s.ripples.length - MAX_RIPPLES)
}

export function closedBuds(s: PondState): Bud[] {
  return s.buds.filter((b) => b.openAt === null)
}

export function pondPhase(s: PondState): 'playing' | 'blooming' | 'painting' | 'resting' {
  if (s.restedAt !== null) return 'resting'
  if (s.completedAt === null) return 'playing'
  return s.timeMs - s.completedAt < END_SETTLE_MS ? 'blooming' : 'painting'
}

/** Taking control back: any touch ends the koi's hand-off. */
function takeBack(s: PondState): void {
  s.lastTouchMs = s.timeMs
  if (s.settling) {
    s.settling = false
    s.plans = s.plans.filter((p) => !(p.kind === 'loop' && p.auto))
    if (s.route && s.route.plan.kind === 'loop' && s.route.plan.auto) {
      s.inks = s.inks.filter((i) => i.id !== s.route!.inkId)
      s.route = null
    }
  }
}

function queue(s: PondState, plan: Plan): void {
  s.plans.push(plan)
  if (s.plans.length > MAX_PLANS) s.plans.splice(0, s.plans.length - MAX_PLANS)
}

/* ---------------------------------------------------------------- actions */

/** A finger touched the water. */
export function touchPond(state: PondState): PondState {
  const s = copy(state)
  takeBack(s)
  return s
}

/** Tap: glide there, or, on a bud, circle it (that always opens it). */
export function tapPond(state: PondState, x: number, y: number): PondState {
  const s = copy(state)
  takeBack(s)
  if (s.completedAt !== null) return s
  const q = clampToPlay(s, x, y)
  addRipple(s, q.x, q.y, 'tap', 0.9)
  s.events.push({ type: 'tap' })
  const near = closedBuds(s)
    .map((b) => ({ b, d: dist(b, q) }))
    .filter((e) => e.d < BUD_TAP_RADIUS)
    .sort((a, b) => a.d - b.d)[0]
  if (near) {
    const pts: Vec2[] = []
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2
      pts.push({ x: near.b.x + Math.cos(a) * BUD_CIRCLE_RADIUS, y: near.b.y + Math.sin(a) * BUD_CIRCLE_RADIUS })
    }
    queue(s, { kind: 'loop', points: pts, auto: false, ellipse: true })
  } else {
    queue(s, { kind: 'glide', to: q })
  }
  return s
}

/** The finger starts drawing a lasso. */
export function beginStroke(state: PondState, x: number, y: number): PondState {
  const s = copy(state)
  takeBack(s)
  if (s.completedAt !== null) return s
  const q = clampToPlay(s, x, y)
  s.stroke = { points: [q], length: 0, spent: false, lastRipple: 0 }
  addRipple(s, q.x, q.y, 'touch', 0.8)
  return s
}

/** The finger moves: the lasso grows until the breath runs out. */
export function extendStroke(state: PondState, x: number, y: number, calm: number, tuning: PondTuning = DEFAULT_TUNING): PondState {
  if (!state.stroke || state.stroke.spent) return state
  const last = state.stroke.points[state.stroke.points.length - 1]!
  if (Math.hypot(x - last.x, y - last.y) < STROKE_STEP) return state
  const s = copy(state)
  const st = s.stroke!
  s.lastTouchMs = s.timeMs
  let q = clampToPlay(s, x, y)
  const breath = pondParams(calm, tuning).breath
  const d = dist(last, q)
  if (st.length + d >= breath) {
    const t = (breath - st.length) / d
    q = { x: last.x + (q.x - last.x) * t, y: last.y + (q.y - last.y) * t }
    st.spent = true
    s.events.push({ type: 'spent' })
  }
  st.points.push(q)
  st.length = Math.min(breath, st.length + d)
  if (st.length - st.lastRipple >= FINGER_RIPPLE_EVERY) {
    st.lastRipple = st.length
    addRipple(s, q.x, q.y, 'finger', 0.55)
  }
  return s
}

/**
 * The finger lifts. A loop is beautified and queued for the koi to swim; a
 * tiny stroke is a tap; an open stroke is a path to follow.
 */
export function endStroke(state: PondState, tuning: PondTuning = DEFAULT_TUNING): PondState {
  if (!state.stroke) return state
  const s = copy(state)
  const st = s.stroke!
  s.stroke = null
  s.lastTouchMs = s.timeMs
  if (s.completedAt !== null) return s
  if (st.length < 0.04) return tapPond(s, st.points[0]!.x, st.points[0]!.y)
  const lasso = beautify(st.points, { closure: tuning.closure })
  if (lasso) {
    const pts = lasso.points.map((p) => clampToPlay(s, p.x, p.y))
    queue(s, { kind: 'loop', points: pts, auto: false, ellipse: lasso.ellipse })
  } else {
    queue(s, { kind: 'path', points: st.points.slice() })
  }
  return s
}

export function cancelStroke(state: PondState): PondState {
  if (!state.stroke) return state
  return { ...state, stroke: null }
}

/** "Rest": the pond goes dark and still; the soundscape carries on. */
export function restPond(state: PondState): PondState {
  if (state.completedAt === null || state.restedAt !== null) return state
  const s = copy(state)
  s.restedAt = s.timeMs
  s.events.push({ type: 'rest', auto: false })
  return s
}

/**
 * A touch on a resting pond: the painting and its choices come back, and the
 * pond rests again by itself after a quiet while. Nothing is lost by resting.
 */
export function wakePond(state: PondState): PondState {
  if (state.restedAt === null) return state
  const s = copy(state)
  s.restedAt = null
  s.lastTouchMs = s.timeMs
  return s
}

/** Hand the events to the screen and clear them. */
export function takeEvents(state: PondState): [PondEvent[], PondState] {
  if (!state.events.length) return [[], state]
  return [state.events, { ...state, events: [] }]
}

/* ----------------------------------------------------------------- routes */

function bezier(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  }
}

/** A graceful curve from the koi (along its heading) into `to`, arriving along `dir`. */
function approach(from: Vec2, heading: number, to: Vec2, dir: Vec2): Vec2[] {
  const d = dist(from, to)
  if (d < 0.01) return [from]
  const k = Math.max(0.04, d * 0.38)
  const dl = Math.hypot(dir.x, dir.y) || 1
  const p1 = { x: from.x + Math.cos(heading) * k, y: from.y + Math.sin(heading) * k }
  const p2 = { x: to.x - (dir.x / dl) * k, y: to.y - (dir.y / dl) * k }
  const n = Math.max(6, Math.ceil((d * 1.5) / 0.012))
  const pts: Vec2[] = []
  for (let i = 0; i <= n; i++) pts.push(bezier(from, p1, p2, to, i / n))
  return pts
}

function withDistances(points: Vec2[]): number[] {
  const out = [0]
  for (let i = 1; i < points.length; i++) out.push(out[i - 1]! + dist(points[i]!, points[i - 1]!))
  return out
}

function buildRoute(s: PondState, plan: Plan): Route {
  const k = s.koi
  let points: Vec2[]
  let loopFrom = -1
  let inkId = 0
  if (plan.kind === 'glide') {
    points = approach(k, k.heading, plan.to, { x: plan.to.x - k.x, y: plan.to.y - k.y })
  } else if (plan.kind === 'path') {
    const first = plan.points[0]!
    const second = plan.points[Math.min(plan.points.length - 1, 3)]!
    points = approach(k, k.heading, first, { x: second.x - first.x, y: second.y - first.y }).concat(plan.points.slice(1))
  } else {
    const loop = plan.points
    const n = loop.length
    // Join the loop where the way in flows into it most gracefully.
    let best = 0
    let bestScore = Infinity
    for (let i = 0; i < n; i++) {
      const p = loop[i]!
      const nx = loop[(i + 1) % n]!
      const tang = Math.atan2(nx.y - p.y, nx.x - p.x)
      const toP = Math.atan2(p.y - k.y, p.x - k.x)
      const score = dist(p, k) * (1 + 0.6 * Math.abs(normAngle(tang - toP)) / Math.PI)
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    }
    const start = loop[best]!
    const next = loop[(best + 1) % n]!
    const way = approach(k, k.heading, start, { x: next.x - start.x, y: next.y - start.y })
    loopFrom = pathLength(way)
    const lap: Vec2[] = []
    for (let i = 1; i <= n; i++) lap.push(loop[(best + i) % n]!)
    points = way.concat(lap)
    inkId = s.nextId++
    s.inks.push({ id: inkId, points: loop.slice(best).concat(loop.slice(0, best)), closedAt: null, traced: 0, k: 0, auto: plan.auto })
    if (s.inks.length > 4) s.inks.splice(0, s.inks.length - 4)
  }
  return { points, dist: withDistances(points), s: 0, loopFrom, plan, inkId }
}

function routeAt(r: Route, d: number): { p: Vec2; tangent: number } {
  const pts = r.points
  if (pts.length === 1) return { p: { ...pts[0]! }, tangent: 0 }
  let lo = 0
  let hi = r.dist.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (r.dist[mid]! <= d) lo = mid
    else hi = mid
  }
  const L = r.dist[hi]! - r.dist[lo]! || 1
  const t = clamp01((d - r.dist[lo]!) / L)
  const a = pts[lo]!
  const b = pts[hi]!
  return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, tangent: Math.atan2(b.y - a.y, b.x - a.x) }
}

/* ------------------------------------------------------------ the picture */

/**
 * The koi has closed a loop. The rule: a stroke is drawn in one breath.
 * - Only one unfinished family inside, and no sleeper: its buds inside open.
 *   If the loop holds the whole family (open buds count), its stroke draws.
 * - Buds of two unfinished families, or a sleeper: the water muddies and
 *   nothing opens.
 * Taps and partial loops open buds (and sound them) but don't draw strokes;
 * that takes a whole family in one clean loop. The koi's own loops, once
 * you've put the phone down, simply finish the family they're for.
 */
function finishLoop(s: PondState, r: Route): void {
  const plan = r.plan
  if (plan.kind !== 'loop') return
  const budById = (id: number) => s.buds.find((b) => b.id === id)!
  const live = s.families.filter((f) => f.doneAt === null)
  let target: Family | null = null
  let held: Bud[] = []
  let muddy = false
  if (plan.auto && plan.family !== undefined) {
    target = s.families.find((f) => f.id === plan.family && f.doneAt === null) ?? null
    held = target ? target.buds.map(budById) : []
  } else {
    // The family the loop is for: the one with most buds inside. Edges forgive
    // a little either way (see the *_SLACK constants).
    const depth = (p: Vec2) => depthIn(p, plan.points)
    const counts = live
      .map((f) => {
        const buds = f.buds.map(budById)
        return { f, buds, inside: buds.filter((b) => depth(b) > 0).length }
      })
      .filter((c) => c.inside > 0)
      .sort((a, b) => b.inside - a.inside)
    const lead = counts[0]
    if (lead) {
      const foreign = counts.slice(1).flatMap((c) => c.buds.filter((b) => depth(b) > FOREIGN_SLACK))
      const sleeping = s.sleepers.filter((sl) => depth(sl) > SLEEPER_SLACK)
      muddy = foreign.length > 0 || sleeping.length > 0
      if (muddy) {
        s.culprits = [...foreign, ...sleeping].map((p) => ({ x: p.x, y: p.y, at: s.timeMs }))
      } else {
        target = lead.f
        held = lead.buds.filter((b) => depth(b) > -HOLD_SLACK)
      }
    } else {
      // Only sleepers inside, no buds: nothing to open either way.
      const sleeping = s.sleepers.filter((sl) => depth(sl) > SLEEPER_SLACK)
      if (sleeping.length) {
        muddy = true
        s.culprits = sleeping.map((p) => ({ x: p.x, y: p.y, at: s.timeMs }))
      }
    }
    s.loopsMade++
    if (muddy) s.muddy++
  }

  const caught = muddy ? [] : held.filter((b) => b.openAt === null)
  const head = s.koi
  caught.sort((a, b) => dist(a, head) - dist(b, head))
  caught.forEach((b, i) => {
    b.openAt = s.timeMs + i * BLOOM_STAGGER_MS
    b.auto = plan.auto
    addRipple(s, b.x, b.y, 'bloom', 0.5, b.openAt)
  })
  const ink = s.inks.find((i) => i.id === r.inkId)
  if (ink) {
    ink.closedAt = s.timeMs
    ink.traced = 1
    ink.k = muddy ? -1 : caught.length
  }
  const cx = plan.points.reduce((a, p) => a + p.x, 0) / plan.points.length
  const cy = plan.points.reduce((a, p) => a + p.y, 0) / plan.points.length
  addRipple(s, cx, cy, 'close', muddy ? 0.25 : caught.length ? 1 : 0.35)

  // A whole family in one clean loop: its stroke draws itself, after the blooms.
  let strokes = 0
  if (target && !muddy && held.length === target.buds.length) {
    const lastBloom = s.timeMs + Math.max(0, caught.length - 1) * BLOOM_STAGGER_MS
    target.doneAt = lastBloom + 300
    target.auto = plan.auto
    strokes = 1
  }
  const last = strokes > 0 && s.families.every((f) => f.doneAt !== null)
  if (strokes > 0 && !plan.auto && s.teach < 1) {
    s.teach = 1
    s.ghost = null
    s.events.push({ type: 'taught', teach: 1 })
  }
  s.events.push({ type: 'loop', k: caught.length, auto: plan.auto, last, strokes, muddy })
  if (last) {
    s.completedAt = s.timeMs
    s.plans = []
    s.settling = false
  }
}

/** The koi's own loop for what's left: one whole family at a time. */
function handoffPlan(s: PondState): Plan | null {
  const f = s.families.find((fam) => fam.doneAt === null)
  if (!f) return null
  const pts = f.buds.map((id) => s.buds.find((b) => b.id === id)!)
  return { kind: 'loop', points: loopAround(pts, 0.055), auto: true, ellipse: false, family: f.id }
}

/* -------------------------------------------------------------- simulation */

function step(s: PondState, dtMs: number, p: PondParams): void {
  const dt = dtMs / 1000
  s.timeMs += dtMs
  const now = s.timeMs
  const k = s.koi
  const b = playBounds(s)

  if (!s.route && s.plans.length && s.restedAt === null) s.route = buildRoute(s, s.plans.shift()!)

  if (!s.route && !s.plans.length && s.completedAt === null && !s.stroke && now - s.lastTouchMs > IDLE_HANDOFF_MS) {
    // Put down: the koi finishes the picture, slowly, a few buds at a time.
    if (!s.settling) {
      s.settling = true
      s.events.push({ type: 'handoff' })
    }
    const plan = handoffPlan(s)
    if (plan) s.route = buildRoute(s, plan)
  }

  const prev = { x: k.x, y: k.y }
  if (s.route) {
    const r = s.route
    const total = r.dist[r.dist.length - 1]!
    const top = p.speed * (s.settling ? 0.55 : 1)
    // Ease in, glide, ease out at the very end.
    const remaining = total - r.s
    const ending = r.plan.kind === 'glide' || r.plan.kind === 'path'
    const target = ending ? Math.min(top, Math.sqrt(2 * 2.2 * Math.max(0, remaining)) + 0.03) : top
    k.speed += (target - k.speed) * Math.min(1, dt * 7)
    r.s = Math.min(total, r.s + k.speed * dt)
    const at = routeAt(r, r.s)
    const dh = normAngle(at.tangent - k.heading)
    k.heading = normAngle(k.heading + dh * Math.min(1, dt * 14))
    k.turnRate = clamp(dh * 6, -3, 3)
    k.x = at.p.x
    k.y = at.p.y
    if (r.loopFrom >= 0) {
      const ink = s.inks.find((i) => i.id === r.inkId)
      if (ink) ink.traced = clamp01((r.s - r.loopFrom) / Math.max(1e-6, total - r.loopFrom))
    }
    if (r.s >= total - 1e-6) {
      s.route = null
      // Carry on into the next plan, or settle to a slow cruise.
      if (!s.plans.length) k.speed = Math.min(k.speed, p.cruise * 2)
      finishLoop(s, r)
    }
  } else {
    // Idle: a slow cruise under the surface, turning gently, kept off the edges.
    s.wander += dt * 0.21
    const drift = Math.sin(s.wander) * 0.55 + Math.sin(s.wander * 0.37 + 1.3) * 0.35
    let turn = drift
    const cx = (b.x0 + b.x1) / 2
    const cy = (b.y0 + b.y1) / 2
    const edge = Math.min(k.x - b.x0, b.x1 - k.x, k.y - b.y0, b.y1 - k.y)
    if (edge < 0.14) turn += normAngle(Math.atan2(cy - k.y, cx - k.x) - k.heading) * 1.6
    k.turnRate = clamp(turn, -1.2, 1.2)
    k.heading = normAngle(k.heading + k.turnRate * dt)
    const want = s.restedAt !== null ? p.cruise * 1.6 : p.cruise
    k.speed += (want - k.speed) * Math.min(1, dt * 1.5)
    if (s.restedAt !== null) {
      // The end of the night: the koi drifts off under the reeds.
      const dh = normAngle(Math.atan2(b.y1 + 0.2 - k.y, -0.2 - k.x) - k.heading)
      k.heading = normAngle(k.heading + dh * Math.min(1, dt * 1.2))
    }
    k.x += Math.cos(k.heading) * k.speed * dt
    k.y += Math.sin(k.heading) * k.speed * dt
    if (s.restedAt === null) {
      k.x = clamp(k.x, b.x0 + MARGIN, b.x1 - MARGIN)
      k.y = clamp(k.y, b.y0, b.y1)
    }
  }

  k.phase += dt * (1.6 + k.speed * 16)
  k.spine[0] = { x: k.x, y: k.y }
  for (let i = 1; i < k.spine.length; i++) {
    const a = k.spine[i - 1]!
    const c = k.spine[i]!
    const d = dist(a, c) || 1
    k.spine[i] = { x: a.x + ((c.x - a.x) / d) * SPINE_SPACING, y: a.y + ((c.y - a.y) / d) * SPINE_SPACING }
  }

  // The wake, as seen: where the koi was in the last moments.
  const tail = s.trail[s.trail.length - 1]
  if (!tail || dist(tail, k) >= TRAIL_STEP) s.trail.push({ x: k.x, y: k.y, t: now })
  while (s.trail.length && now - s.trail[0]!.t > TRAIL_MS) s.trail.shift()
  if (dist(prev, k) > 0.2) s.trail = [{ x: k.x, y: k.y, t: now }]

  s.ripples = s.ripples.filter((r) => now - r.at < RIPPLE_MS)
  if (s.culprits.length && now - s.culprits[0]!.at > CULPRIT_MS) s.culprits = []
  s.inks = s.inks.filter((i) => i.closedAt === null || now - i.closedAt < 3200)

  if (s.completedAt !== null && s.restedAt === null) {
    const quietSince = Math.max(s.completedAt + END_SETTLE_MS, s.lastTouchMs)
    if (now - quietSince > REST_AFTER_MS) {
      s.restedAt = now
      s.events.push({ type: 'rest', auto: true })
    }
  }
}

/** Advance the pond. `calm` is the wind-down level now; `tuning` is dev-only. */
export function tickPond(state: PondState, dtMs: number, calm: number, tuning: PondTuning = DEFAULT_TUNING): PondState {
  if (dtMs <= 0) return state
  const s = copy(state)
  const p = pondParams(calm, tuning)
  let left = Math.min(dtMs, 250)
  while (left > 0) {
    const d = Math.min(MAX_SUBSTEP_MS, left)
    step(s, d, p)
    left -= d
  }
  return s
}

/** Saved state from an older version (or a broken blob) starts a fresh pond. */
export function isPondState(v: unknown): v is PondState {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<PondState>
  return (
    s.version === 4 &&
    typeof s.picture === 'string' &&
    (pictureById(s.picture) !== undefined || Boolean(s.custom)) &&
    Array.isArray(s.sleepers) &&
    Array.isArray(s.culprits) &&
    typeof s.aspect === 'number' &&
    typeof s.timeMs === 'number' &&
    Boolean(s.koi) &&
    Array.isArray(s.koi?.spine) &&
    s.koi.spine.length === SPINE_POINTS &&
    Array.isArray(s.buds) &&
    Array.isArray(s.families) &&
    Array.isArray(s.trail)
  )
}

/** The picture a pond is drawing. */
export function pondPicture(s: PondState): Picture {
  if (s.custom) return s.custom
  return pictureById(s.picture)!
}
