/**
 * Backdrop simulation: the moving matter of every scene, as plain data.
 *
 * One shared pool of particles serves all 12 scenes. A particle belongs to a
 * scene (`owner`), which decides how it moves (`flow*`) and how it looks
 * (`look*`). When the sound changes, a soft circular front grows out from the
 * dial (`frontEdge`). As it passes a particle, the particle is handed to the new
 * scene where it stands: a star becomes an ember and starts to rise, a drop on
 * the window becomes a grain of sand and slides to the nearest nodal line. Its
 * look blends from a snapshot of the old look to the new one over
 * `MORPH_SECONDS`. Structures (strings, grass, pines) grow in or retract behind
 * the same front, and the field shader dissolves along it too.
 *
 * Everything here is a Reanimated worklet so it can run on the UI thread, but
 * it is plain TypeScript: no React, no DOM, no Math.random (seeded mulberry32
 * state lives in the Sim). Time always comes in as an argument.
 */
import { SCENE_RGB } from './scenes'

export const MAX_PARTICLES = 260
export const LOOK_STRIDE = 10
export const STRING_COUNT = 13
export const INK_SLOTS = 4
export const GRASS_BLADES = 120
export const PINE_COUNT = 15
export const TRANSITION_SECONDS = 3.2
export const MORPH_SECONDS = 1.3
export const FRONT_WIDTH = 0.22
/** The transition front and the delta pulse start here (fractions of W, H): the dial. */
export const ORIGIN_X = 0.5
export const ORIGIN_Y = 0.3
/** Seconds without a motif cue before scenes fall back to their own rhythm. */
const CUE_SILENCE = 12

// Scene indices (mirrors SCENE in ./scenes; repeated as literals for worklets).
const S_RAIN = 0
const S_NOCTURNE = 1
const S_HEARTH = 2
const S_TIDE = 3
const S_DELTA = 4
const S_HORIZON = 5
const S_INK = 6
const S_ADAGIO = 7
const S_STARFIELD = 8
const S_AMBER = 9
const S_MIST = 10
const S_COVE = 11

/** Particles per scene. Index >= count means the particle sleeps in that scene. */
export const SCENE_PARTICLES: readonly number[] = [90, 26, 70, 130, 150, 34, 22, 260, 220, 130, 60, 110]

/** Chladni (n, m) mode pairs for Adagio, walked through slowly. */
const CHLADNI_MODES: readonly number[] = [1, 4, 2, 5, 1, 6, 3, 5, 2, 7, 3, 7, 1, 8, 4, 7]
const CHLADNI_COUNT = 8

const NEVER = 1e9
const TIDE_HORIZON = 0.43
const COVE_TOP = 0.56
const COVE_SHORE = 1.03
const COVE_PERIOD = 9

export interface SimEnv {
  /** Scene-time speed. 1 while playing, slower when idle and as the night deepens. */
  timeScale: number
  /** 0..1 brightness multiplier. */
  intensity: number
  /** Breath swell rate from the descent arc (~0.1 Hz). Paces the Deep delta pulse. */
  breathHz: number
}

export type MotifKind = 'nocturne' | 'adagio' | 'reverie'

/** One phrase of the classical motif, as the audio engine scheduled it. */
export interface MotifCue {
  id: number
  kind: MotifKind
  /** Flat [delaySeconds, voice, gain, decaySeconds] per note. Voice 0 is the bass, 1 + scale degree otherwise. */
  notes: number[]
}

export interface Sim {
  W: number
  H: number
  /** Scene time (scaled). */
  t: number
  /** Real seconds since creation. */
  clock: number
  rng: number
  sceneA: number
  sceneB: number
  /** 0..1 progress of the A -> B front; 1 when settled. */
  prog: number
  intensity: number
  breathHz: number

  alive: number[]
  owner: number[]
  morph: number[]
  x: number[]
  y: number[]
  vx: number[]
  vy: number[]
  age: number[]
  life: number[]
  dieAt: number[]
  size: number[]
  a0: number[]
  a1: number[]
  /** Permanent per-slot random in [0,1). */
  seed: number[]
  /** Look captured at conversion, blended away over MORPH_SECONDS. */
  snap: number[]

  // Nocturne strings
  strAmp: number[]
  strBorn: number[]
  strDecay: number[]
  /** Pending plucks, flat [atClock, string, amp, decay]. */
  plucks: number[]
  pluckAuto: number

  // Ink reverie drops, flat [x/W, y/W, bornT, radius/W]
  ink: number[]
  inkAuto: number

  // Adagio Chladni modes
  chA: number
  chB: number
  chMix: number
  chAuto: number
  adagioPhrases: number

  /** Deep delta pulse phase 0..1. */
  pulse: number
  /** Midnight cove crest phase 0..1. */
  crest: number

  cueId: number
  cueClock: number
}

/* Worklets below are ordered so each is defined after everything it calls:
 * the worklet compiler captures dependencies at definition time, so function
 * hoisting does not apply. Keep new helpers above their first caller. */

export function rand(s: Sim): number {
  'worklet'
  s.rng = (s.rng + 0x6d2b79f5) >>> 0
  let t = s.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function hash2(ix: number, iy: number): number {
  'worklet'
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Smooth value noise in [0,1]. */
export function vnoise(x: number, y: number): number {
  'worklet'
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy)
  const b = hash2(ix + 1, iy)
  const c = hash2(ix, iy + 1)
  const d = hash2(ix + 1, iy + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

export function smoothstep(e0: number, e1: number, x: number): number {
  'worklet'
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

function approach(v: number, target: number, dt: number, tau: number): number {
  'worklet'
  return v + (target - v) * (1 - Math.exp(-dt / tau))
}

function gauss(s: Sim): number {
  'worklet'
  return (rand(s) + rand(s) + rand(s) - 1.5) * 1.15
}

function rgb(scene: number, k: number, ch: number): number {
  'worklet'
  return SCENE_RGB[scene * 12 + k * 3 + ch]!
}

function maxCornerDist(s: Sim): number {
  'worklet'
  const asp = s.H / s.W
  const dx = Math.max(ORIGIN_X, 1 - ORIGIN_X)
  const dy = Math.max(ORIGIN_Y, 1 - ORIGIN_Y) * asp
  return Math.sqrt(dx * dx + dy * dy)
}

/** Radius of the A -> B front in width units (the shader uses the same formula). */
export function frontEdge(s: Sim): number {
  'worklet'
  if (s.prog >= 1) return 1e3
  const e = 0.5 - 0.5 * Math.cos(Math.PI * s.prog)
  return -FRONT_WIDTH + (maxCornerDist(s) + 2 * FRONT_WIDTH) * e
}

/** How much of B is showing at a point: 0 = still A, 1 = B. */
export function coverAt(s: Sim, x: number, y: number, warp: number): number {
  'worklet'
  if (s.prog >= 1) return 1
  const dx = x / s.W - ORIGIN_X
  const dy = (y - ORIGIN_Y * s.H) / s.W
  const d = Math.sqrt(dx * dx + dy * dy) + warp
  const e = frontEdge(s)
  return 1 - smoothstep(e - FRONT_WIDTH, e + FRONT_WIDTH, d)
}

/** Presence of a scene's structures (strings, grass, pines) at a point. */
export function presence(s: Sim, scene: number, x: number, y: number): number {
  'worklet'
  const warp = (vnoise(x * 0.012, y * 0.012) - 0.5) * 0.25
  if (scene === s.sceneB) return coverAt(s, x, y, warp)
  if (scene === s.sceneA && s.prog < 1) return 1 - coverAt(s, x, y, warp)
  return 0
}

export function sceneActive(s: Sim, scene: number): boolean {
  'worklet'
  return s.sceneB === scene || (s.prog < 1 && s.sceneA === scene)
}

function rainWobble(seed: number, y: number): number {
  'worklet'
  return (vnoise(seed * 91.7, y * 0.02) - 0.5) * 22
}

export function isRunner(i: number): boolean {
  'worklet'
  return i % 20 === 0
}

/** x of a rain runner's path at height y. */
export function runnerX(s: Sim, i: number, y: number): number {
  'worklet'
  return s.a0[i]! + rainWobble(s.seed[i]!, y)
}

export function tideHorizon(s: Sim): number {
  'worklet'
  return s.H * TIDE_HORIZON
}

export function tideMoonX(s: Sim): number {
  'worklet'
  return s.W * 0.66
}

export function coveCrestY(s: Sim): number {
  'worklet'
  return s.H * (COVE_TOP + (COVE_SHORE - COVE_TOP) * s.crest)
}

function coveBreaking(s: Sim, y: number): number {
  'worklet'
  return smoothstep(0.25, 0.5, (y / s.H - COVE_TOP) / (COVE_SHORE - COVE_TOP))
}

/** Gust strength 0..1 travelling left to right across the screen. */
export function gustAt(s: Sim, x: number): number {
  'worklet'
  let g = 0
  for (let k = 0; k < 2; k++) {
    const phase = (s.t * 0.05 + k * 0.5) % 1
    const pos = (phase * 1.8 - 0.4) * s.W
    const d = (x - pos) / (0.2 * s.W)
    g += Math.exp(-d * d)
  }
  return Math.min(1, g)
}

/** Lamp cone for Amber study, in width units (mirrored in the shader). */
export function lampBeam(s: Sim, x: number, y: number): number {
  'worklet'
  const px = x / s.W + 0.06
  const py = y / s.W + 0.1
  const dirX = 0.527
  const dirY = 0.85
  const along = px * dirX + py * dirY
  if (along <= 0) return 0
  const perp = Math.abs(px * dirY - py * dirX)
  return smoothstep(0.36, 0.2, perp / along) * Math.exp(-along * 0.45)
}

function chladniMode(n: number, m: number, u: number, v: number): number {
  'worklet'
  const P = Math.PI
  return Math.cos(n * P * u) * Math.cos(m * P * v) - Math.cos(m * P * u) * Math.cos(n * P * v)
}

/** Chladni plate value (blended between modes) at a point; nodal lines are f = 0. */
export function chladniAt(s: Sim, x: number, y: number): number {
  'worklet'
  const u = x / s.W
  const v = y / s.H
  const fa = chladniMode(CHLADNI_MODES[s.chA * 2]!, CHLADNI_MODES[s.chA * 2 + 1]!, u, v)
  if (s.chMix >= 1) return chladniMode(CHLADNI_MODES[s.chB * 2]!, CHLADNI_MODES[s.chB * 2 + 1]!, u, v)
  const fb = chladniMode(CHLADNI_MODES[s.chB * 2]!, CHLADNI_MODES[s.chB * 2 + 1]!, u, v)
  const m = smoothstep(0, 1, s.chMix)
  return fa + (fb - fa) * m
}

/** Plate value and its gradient (per point) at x, y: [f, df/dx, df/dy]. */
export function chladniGrad(s: Sim, x: number, y: number): [number, number, number] {
  'worklet'
  const u = x / s.W
  const v = y / s.H
  const P = Math.PI
  const m = s.chMix >= 1 ? 1 : smoothstep(0, 1, s.chMix)
  let f = 0
  let fu = 0
  let fv = 0
  for (let side = 0; side < 2; side++) {
    const w = side === 0 ? 1 - m : m
    if (w <= 0) continue
    const idx = side === 0 ? s.chA : s.chB
    const n = CHLADNI_MODES[idx * 2]! * P
    const k = CHLADNI_MODES[idx * 2 + 1]! * P
    const cnu = Math.cos(n * u)
    const snu = Math.sin(n * u)
    const ckv = Math.cos(k * v)
    const skv = Math.sin(k * v)
    const cku = Math.cos(k * u)
    const sku = Math.sin(k * u)
    const cnv = Math.cos(n * v)
    const snv = Math.sin(n * v)
    f += w * (cnu * ckv - cku * cnv)
    fu += w * (-n * snu * ckv + k * sku * cnv)
    fv += w * (-k * cnu * skv + n * cku * snv)
  }
  return [f, fu / s.W, fv / s.H]
}

export function chladniModes(s: Sim): [number, number, number, number, number] {
  'worklet'
  return [
    CHLADNI_MODES[s.chA * 2]!,
    CHLADNI_MODES[s.chA * 2 + 1]!,
    CHLADNI_MODES[s.chB * 2]!,
    CHLADNI_MODES[s.chB * 2 + 1]!,
    s.chMix >= 1 ? 1 : smoothstep(0, 1, s.chMix),
  ]
}

/** Current vibration energy of a Nocturne string, 0..1. */
export function stringEnergy(s: Sim, k: number): number {
  'worklet'
  const amp = s.strAmp[k]!
  if (amp <= 0) return 0
  return amp * Math.exp(-(s.t - s.strBorn[k]!) / s.strDecay[k]!)
}

/** Nocturne string k: x at the top and bottom of the screen. */
export function stringEnds(s: Sim, k: number): [number, number] {
  'worklet'
  const bottom = s.W * (0.06 + (0.88 * k) / (STRING_COUNT - 1))
  const top = s.W * 0.5 + (bottom - s.W * 0.5) * 0.62
  return [top, bottom]
}

/** Sideways displacement of string k at fraction f (0 top .. 1 bottom). */
export function stringDisplacement(s: Sim, k: number, f: number, energy: number): number {
  'worklet'
  if (energy < 0.002) return 0
  const w = 2 * Math.PI * (1.4 + 0.08 * k)
  return (
    energy *
    7 *
    (Math.sin(Math.PI * f) * Math.sin(w * s.t + k) + 0.3 * Math.sin(2 * Math.PI * f) * Math.sin(2.1 * w * s.t + k * 1.7))
  )
}

/** Grass blade j: [baseX, baseY, ctrlX, ctrlY, tipX, tipY] before presence scaling. */
export function grassBlade(s: Sim, j: number, out: number[]): void {
  'worklet'
  const hx = hash2(j, 7)
  const hh = hash2(j, 13)
  const x = (s.W * (j + 0.5 + (hx - 0.5) * 0.9)) / GRASS_BLADES
  const edge = Math.abs(x / s.W - 0.5) * 2
  const h = s.H * (0.03 + 0.055 * hh) * (1 + 0.7 * edge * edge)
  const g = gustAt(s, x)
  const lean = (0.12 + 0.75 * g) * 0.6 + 0.07 * Math.sin(s.t * 1.3 + j * 0.9)
  const base = s.H + 2
  out[0] = x
  out[1] = base
  out[2] = x + Math.sin(lean * 0.5) * h * 0.5
  out[3] = base - Math.cos(lean * 0.5) * h * 0.55
  out[4] = x + Math.sin(lean * 1.5) * h
  out[5] = base - Math.cos(lean * 1.5) * h
}

/** Pine k on the near ridge: [x, baseY, height, width]. */
export function pineTree(s: Sim, k: number, out: number[]): void {
  'worklet'
  const hx = hash2(k, 31)
  const hh = hash2(k, 37)
  const x = (s.W * (k + 0.5 + (hx - 0.5) * 0.7)) / PINE_COUNT
  const edge = Math.abs(x / s.W - 0.5) * 2
  out[0] = x
  out[1] = s.H * (0.985 - 0.02 * Math.sin(x * 0.011 + 1.3))
  out[2] = s.H * (0.07 + 0.07 * hh) * (0.8 + 0.6 * edge)
  out[3] = out[2]! * (0.36 + 0.08 * hx)
}

function addInk(s: Sim, bornT: number): void {
  'worklet'
  let slot = 0
  for (let k = 1; k < INK_SLOTS; k++) if (s.ink[k * 4 + 2]! < s.ink[slot * 4 + 2]!) slot = k
  const left = rand(s) < 0.5
  const asp = s.H / s.W
  s.ink[slot * 4] = left ? 0.06 + rand(s) * 0.3 : 0.64 + rand(s) * 0.3
  s.ink[slot * 4 + 1] = (0.06 + rand(s) * 0.8) * asp
  s.ink[slot * 4 + 2] = bornT
  s.ink[slot * 4 + 3] = 0.16 + rand(s) * 0.14
}

function spawn(s: Sim, i: number, scene: number, scatter: boolean): void {
  'worklet'
  const W = s.W
  const H = s.H
  s.alive[i] = 1
  s.owner[i] = scene
  s.morph[i] = 1
  s.age[i] = 0
  s.dieAt[i] = NEVER
  s.vx[i] = 0
  s.vy[i] = 0
  s.a0[i] = 0
  s.a1[i] = 0
  let life = NEVER
  switch (scene) {
    case S_RAIN: {
      if (isRunner(i)) {
        const x = rand(s) * W
        const y0 = rand(s) * H * 0.6
        s.y[i] = y0
        s.a1[i] = y0
        s.a0[i] = x - rainWobble(s.seed[i]!, y0)
        s.x[i] = x
        s.size[i] = 2.4 + rand(s) * 1.6
        // Runners wait a while before they start sliding.
        s.age[i] = -(scatter ? rand(s) * 8 : 2 + rand(s) * 7)
      } else {
        s.x[i] = rand(s) * W
        s.y[i] = rand(s) * H
        s.size[i] = 0.9 + Math.pow(rand(s), 2.2) * 3.4
        life = 16 + rand(s) * 28
      }
      break
    }
    case S_NOCTURNE:
      s.x[i] = rand(s) * W
      s.y[i] = rand(s) * H
      s.size[i] = 0.7 + rand(s) * 0.8
      life = 18 + rand(s) * 22
      break
    case S_HEARTH:
      s.x[i] = W * (0.5 + gauss(s) * 0.36)
      s.y[i] = scatter ? H * (0.25 + rand(s) * 0.8) : H + 8 + rand(s) * 25
      s.vy[i] = -(30 + rand(s) * 30)
      s.size[i] = 1 + Math.pow(rand(s), 2) * 2
      s.a0[i] = rand(s)
      life = 4.5 + rand(s) * 5
      break
    case S_TIDE: {
      const z = Math.pow(rand(s), 0.7)
      const yh = tideHorizon(s)
      s.y[i] = yh + 6 + z * (H - yh)
      s.x[i] = tideMoonX(s) + gauss(s) * W * (0.02 + 0.22 * z)
      s.size[i] = 0.5 + z * 1.6
      s.a0[i] = z
      life = 0.9 + rand(s) * 1.7
      break
    }
    case S_DELTA:
      s.x[i] = rand(s) * W
      s.y[i] = rand(s) * H
      s.size[i] = 0.5 + rand(s) * 0.9
      s.a0[i] = rand(s)
      break
    case S_HORIZON:
      s.x[i] = scatter ? rand(s) * W : -10 - rand(s) * 50
      s.y[i] = H * (0.1 + rand(s) * 0.78)
      s.size[i] = 0.7 + rand(s) * 0.9
      break
    case S_INK:
      s.x[i] = rand(s) * W
      s.y[i] = rand(s) * H
      s.size[i] = 0.6 + rand(s) * 0.7
      life = 25 + rand(s) * 25
      break
    case S_ADAGIO:
      s.x[i] = rand(s) * W
      s.y[i] = rand(s) * H
      s.size[i] = 0.55 + rand(s) * 0.5
      s.a0[i] = rand(s)
      break
    case S_STARFIELD: {
      const r0 = rand(s)
      const layer = r0 < 0.5 ? 0 : r0 < 0.82 ? 1 : 2
      const ox = W * ORIGIN_X
      const oy = H * ORIGIN_Y
      const rMax = Math.sqrt(Math.max(ox, W - ox) ** 2 + Math.max(oy, H - oy) ** 2) + 20
      const r = Math.sqrt(rand(s)) * rMax
      const a = rand(s) * Math.PI * 2
      s.x[i] = ox + Math.cos(a) * r
      s.y[i] = oy + Math.sin(a) * r
      s.a0[i] = layer
      s.a1[i] = rand(s)
      s.size[i] = layer === 0 ? 0.55 + rand(s) * 0.4 : layer === 1 ? 0.8 + rand(s) * 0.5 : 1.15 + rand(s) * 0.8
      break
    }
    case S_AMBER:
      s.x[i] = rand(s) * W
      s.y[i] = rand(s) * H
      s.size[i] = 0.5 + rand(s) * 0.9
      life = 30 + rand(s) * 30
      break
    case S_MIST: {
      const z = rand(s)
      s.a0[i] = z
      s.x[i] = rand(s) * W * 1.1 - W * 0.05
      s.y[i] = scatter ? rand(s) * H : -10 - rand(s) * 60
      s.size[i] = 0.35 + 0.5 * z
      s.vy[i] = 40 + 80 * z
      break
    }
    case S_COVE: {
      const y = coveCrestY(s) + (rand(s) - 0.5) * 10
      const x = rand(s) * W
      const patch = vnoise(x * 0.02, s.t * 0.1) > 0.45 ? 1 : 0.3
      s.x[i] = x
      s.y[i] = y
      s.a0[i] = coveBreaking(s, y) * patch * (0.5 + rand(s) * 0.5)
      s.size[i] = 0.6 + rand(s) * 1.1
      life = 1.2 + rand(s) * 2.4
      break
    }
  }
  s.life[i] = life
  if (scatter && life < NEVER) s.age[i] = Math.max(s.age[i]!, rand(s) * life * 0.85)
}

export function createSim(W: number, H: number, scene: number, seed: number): Sim {
  'worklet'
  const N = MAX_PARTICLES
  const zeros = (n: number) => {
    const a: number[] = []
    for (let i = 0; i < n; i++) a.push(0)
    return a
  }
  const s: Sim = {
    W,
    H,
    t: 0,
    clock: 0,
    rng: seed >>> 0,
    sceneA: scene,
    sceneB: scene,
    prog: 1,
    intensity: 1,
    breathHz: 0.1,
    alive: zeros(N),
    owner: zeros(N),
    morph: zeros(N),
    x: zeros(N),
    y: zeros(N),
    vx: zeros(N),
    vy: zeros(N),
    age: zeros(N),
    life: zeros(N),
    dieAt: zeros(N),
    size: zeros(N),
    a0: zeros(N),
    a1: zeros(N),
    seed: zeros(N),
    snap: zeros(N * LOOK_STRIDE),
    strAmp: zeros(STRING_COUNT),
    strBorn: zeros(STRING_COUNT),
    strDecay: zeros(STRING_COUNT).map(() => 3),
    plucks: [],
    pluckAuto: 0,
    ink: zeros(INK_SLOTS * 4),
    inkAuto: 0,
    chA: 0,
    chB: 0,
    chMix: 1,
    chAuto: 14,
    adagioPhrases: 0,
    pulse: 0.35,
    crest: 0.45,
    cueId: -1,
    cueClock: -CUE_SILENCE,
  }
  for (let i = 0; i < N; i++) {
    s.seed[i] = rand(s)
    s.owner[i] = scene
    s.morph[i] = 1
    if (i < SCENE_PARTICLES[scene]!) spawn(s, i, scene, true)
  }
  for (let k = 0; k < INK_SLOTS; k++) s.ink[k * 4 + 2] = -1e4
  s.chB = Math.floor(rand(s) * CHLADNI_COUNT)
  s.chA = s.chB
  addInk(s, -9)
  addInk(s, -3)
  return s
}

function beginTransition(s: Sim, target: number): void {
  'worklet'
  if (s.prog < 1 && s.prog < 0.5) {
    // Interrupted early: the old scene is still mostly on screen, keep it as A.
  } else {
    s.sceneA = s.sceneB
  }
  s.sceneB = target
  s.prog = s.sceneA === s.sceneB ? 1 : 0
}

function nextChladni(s: Sim): void {
  'worklet'
  s.chA = s.chB
  s.chB = (s.chB + 1 + Math.floor(rand(s) * 2)) % CHLADNI_COUNT
  s.chMix = 0
}

function ingestCue(s: Sim, cue: MotifCue): void {
  'worklet'
  s.cueId = cue.id
  s.cueClock = s.clock
  if (cue.kind === 'nocturne') {
    for (let n = 0; n + 3 < cue.notes.length; n += 4) {
      const voice = cue.notes[n + 1]!
      const k = voice <= 0 ? 0 : Math.min(STRING_COUNT - 1, 2 + 2 * ((voice - 1) % 6))
      const amp = Math.min(1, Math.max(0.3, cue.notes[n + 2]! / 0.06))
      if (s.plucks.length < 96) s.plucks.push(s.clock + cue.notes[n]!, k, amp, cue.notes[n + 3]! * 1.4)
    }
  } else if (cue.kind === 'reverie') {
    addInk(s, s.t)
  } else {
    s.adagioPhrases += 1
    if (s.adagioPhrases % 2 === 0) nextChladni(s)
  }
}

function pluck(s: Sim, k: number, amp: number, decay: number): void {
  'worklet'
  const now = stringEnergy(s, k)
  s.strAmp[k] = Math.max(amp, now)
  s.strBorn[k] = s.t
  s.strDecay[k] = Math.max(0.5, decay)
  // Sympathetic resonance in the neighbouring strings.
  for (let d = -1; d <= 1; d += 2) {
    const j = k + d
    if (j < 0 || j >= STRING_COUNT) continue
    const e = stringEnergy(s, j)
    if (e < amp * 0.18) {
      s.strAmp[j] = amp * 0.18
      s.strBorn[j] = s.t
      s.strDecay[j] = Math.max(0.5, decay * 0.8)
    }
  }
}

function stepSceneState(s: Sim, dt: number): void {
  'worklet'
  const quiet = s.clock - s.cueClock > CUE_SILENCE

  // Pending plucks scheduled by the audio phrase.
  if (s.plucks.length > 0) {
    const keep: number[] = []
    for (let n = 0; n < s.plucks.length; n += 4) {
      if (s.plucks[n]! <= s.clock) pluck(s, s.plucks[n + 1]!, s.plucks[n + 2]!, s.plucks[n + 3]!)
      else keep.push(s.plucks[n]!, s.plucks[n + 1]!, s.plucks[n + 2]!, s.plucks[n + 3]!)
    }
    s.plucks = keep
  }
  if (quiet && sceneActive(s, S_NOCTURNE) && s.clock >= s.pluckAuto) {
    pluck(s, 2 * Math.floor(rand(s) * 7), 0.45 + rand(s) * 0.45, 2.4 + rand(s) * 1.4)
    s.pluckAuto = s.clock + 1.6 + rand(s) * 2.8
  }
  if (quiet && sceneActive(s, S_INK) && s.clock >= s.inkAuto) {
    addInk(s, s.t)
    s.inkAuto = s.clock + 5.5 + rand(s) * 3
  }
  if (s.chMix < 1) s.chMix = Math.min(1, s.chMix + dt / 4)
  if (quiet && sceneActive(s, S_ADAGIO) && s.clock >= s.chAuto) {
    nextChladni(s)
    s.chAuto = s.clock + 13 + rand(s) * 5
  }

  const period = Math.max(8, 1 / s.breathHz)
  s.pulse = (s.pulse + dt / period) % 1
  s.crest = (s.crest + dt / COVE_PERIOD) % 1
}

/** Runner drops on the window collect the beads in their path. */
function wipeRain(s: Sim): void {
  'worklet'
  for (let r = 0; r < MAX_PARTICLES; r += 20) {
    if (!s.alive[r] || s.owner[r] !== S_RAIN) continue
    const top = s.a1[r]!
    const bottom = s.y[r]!
    if (bottom - top < 4) continue
    const reach = s.size[r]! * 1.2
    for (let i = 0; i < SCENE_PARTICLES[S_RAIN]!; i++) {
      if (isRunner(i) || !s.alive[i] || s.owner[i] !== S_RAIN) continue
      const y = s.y[i]!
      if (y < top || y > bottom) continue
      if (s.dieAt[i]! < s.age[i]! + 0.8) continue
      if (Math.abs(s.x[i]! - runnerX(s, r, y)) < reach + s.size[i]!) s.dieAt[i] = s.age[i]! + 0.6
    }
  }
}

function fadeIn(t: number, d: number): number {
  'worklet'
  return smoothstep(0, d, t)
}

function envelope(age: number, life: number, fin: number, fout: number): number {
  'worklet'
  return smoothstep(0, fin, age) * smoothstep(0, fout, life - age)
}

function setLook(
  out: number[],
  o: number,
  r: number,
  g: number,
  b: number,
  a: number,
  size: number,
  glow: number,
  core: number,
  lens: number,
  streak: number,
  angle: number,
): void {
  'worklet'
  out[o] = r
  out[o + 1] = g
  out[o + 2] = b
  out[o + 3] = a
  out[o + 4] = size
  out[o + 5] = glow
  out[o + 6] = core
  out[o + 7] = lens
  out[o + 8] = streak
  out[o + 9] = angle
}

/**
 * The look of particle i as a member of `scene`, written to out[o..o+9]:
 * r, g, b, alpha, size (pt), glow, core, lens, streak weights, streak angle.
 */
export function rawLook(s: Sim, i: number, scene: number, out: number[], o: number): void {
  'worklet'
  const age = s.age[i]!
  const life = s.life[i]!
  const size = s.size[i]!
  const sd = s.seed[i]!
  const t = s.t
  const dr = rgb(scene, 1, 0)
  const dg = rgb(scene, 1, 1)
  const db = rgb(scene, 1, 2)
  const cr = rgb(scene, 0, 0)
  const cg = rgb(scene, 0, 1)
  const cb = rgb(scene, 0, 2)
  switch (scene) {
    case S_RAIN: {
      if (isRunner(i)) {
        const a = age < 0 ? 0.55 : 0.75
        setLook(out, o, dr, dg, db, a * fadeIn(age + 9, 1.5), size, 0.2, 0, 1, 0, 0)
      } else {
        setLook(out, o, dr, dg, db, 0.5 * envelope(age, life, 2.5, 3), size, 0.12, 0, 1, 0, 0)
      }
      return
    }
    case S_NOCTURNE:
      setLook(out, o, dr, dg, db, 0.42 * envelope(age, life, 3, 3), size, 0.55, 0.9, 0, 0, 0)
      return
    case S_HEARTH: {
      const u = Math.min(1, Math.max(0, (age - s.a1[i]!) / Math.max(0.1, life - s.a1[i]!)))
      const T = 1 - u
      // Cooling ramp: white-gold -> orange -> deep red -> ash.
      let r = 0.45
      let g = 0.08
      let b = 0.04
      if (T > 0.8) {
        const k = (T - 0.8) / 0.2
        r = 1
        g = 0.62 + 0.3 * k
        b = 0.22 + 0.48 * k
      } else if (T > 0.45) {
        const k = (T - 0.45) / 0.35
        r = 0.85 + 0.15 * k
        g = 0.26 + 0.36 * k
        b = 0.08 + 0.14 * k
      } else {
        const k = T / 0.45
        r = 0.45 + 0.4 * k
        g = 0.08 + 0.18 * k
        b = 0.04 + 0.04 * k
      }
      const flicker = 0.8 + 0.2 * Math.sin(t * 6.5 + s.a0[i]! * 40)
      const a = fadeIn(age - s.a1[i]!, 0.25) * (0.35 + 0.65 * Math.pow(T, 1.2)) * flicker
      setLook(out, o, r, g, b, a, size * (1 - 0.3 * u), 1.5, 1, 0, 0, 0)
      return
    }
    case S_TIDE: {
      const u = Math.min(1, Math.max(0, (age - s.a1[i]!) / Math.max(0.1, life - s.a1[i]!)))
      const env = Math.pow(Math.sin(Math.PI * u), 2)
      const z = s.a0[i]!
      setLook(out, o, dr * 0.8 + cr * 0.2, dg * 0.8 + cg * 0.2, db * 0.8 + cb * 0.2, env * (0.35 + 0.55 * z), size, 0.15, 0.25, 0, 1, 0)
      return
    }
    case S_DELTA: {
      const R = s.pulse * 1.9 * s.W
      const dx = s.x[i]! - s.W * ORIGIN_X
      const dy = s.y[i]! - s.H * ORIGIN_Y
      const d = Math.sqrt(dx * dx + dy * dy)
      const k = (d - R) / (s.W * (0.05 + 0.1 * s.pulse))
      const ring = Math.exp(-k * k) * Math.pow(1 - s.pulse, 1.2)
      const m = s.a0[i]!
      const a = (0.06 + 0.12 * m + 0.75 * ring) * fadeIn(age, 2)
      setLook(out, o, dr + (cr - dr) * m, dg + (cg - dg) * m, db + (cb - db) * m, a, size, 0.25 + 0.9 * ring, 1, 0, 0, 0)
      return
    }
    case S_HORIZON:
      setLook(out, o, dr, dg, db, 0.32 * fadeIn(age, 2), size, 0.8, 0.7, 0, 0, 0)
      return
    case S_INK:
      setLook(out, o, (dr + cr) / 2, (dg + cg) / 2, (db + cb) / 2, 0.38 * envelope(age, life, 4, 4), size, 0.7, 0.8, 0, 0, 0)
      return
    case S_ADAGIO: {
      const m = s.a0[i]!
      const settled = Math.exp(-Math.abs(chladniAt(s, s.x[i]!, s.y[i]!)) * 6)
      const a = (0.42 + 0.25 * m) * (0.55 + 0.45 * settled) * fadeIn(age, 1.5)
      setLook(out, o, dr + (cr - dr) * m, dg + (cg - dg) * m, db + (cb - db) * m, a, size, 0.08, 1, 0, 0, 0)
      return
    }
    case S_STARFIELD: {
      const L = s.a0[i]!
      const tw = s.a1[i]!
      const a = (0.42 + 0.2 * L) * (0.82 + 0.18 * Math.sin(t * (0.6 + tw) + tw * 40)) * fadeIn(age, 2)
      if (sd > 0.86) setLook(out, o, 1, 0.86, 0.72, a, size, 0.3 + 0.25 * L, 1, 0, 0, 0)
      else setLook(out, o, dr + (cr - dr) * tw, dg + (cg - dg) * tw, db + (cb - db) * tw, a, size, 0.3 + 0.25 * L, 1, 0, 0, 0)
      return
    }
    case S_AMBER: {
      const beam = lampBeam(s, s.x[i]!, s.y[i]!)
      setLook(out, o, dr, dg, db, (0.03 + 0.8 * beam) * envelope(age, life, 3, 3), size, 0.5 + 0.4 * beam, 1, 0, 0, 0)
      return
    }
    case S_MIST: {
      const z = s.a0[i]!
      setLook(out, o, dr, dg, db, (0.1 + 0.16 * z) * fadeIn(age, 0.5), 0.35 + 0.5 * z, 0, 0, 0, 1, Math.PI / 2 - 0.08)
      return
    }
    case S_COVE: {
      const u = Math.min(1, Math.max(0, (age - s.a1[i]!) / Math.max(0.1, life - s.a1[i]!)))
      const env = Math.min(1, u * 8) * Math.pow(1 - u, 1.5)
      setLook(out, o, 0.42 * 0.75 + dr * 0.25, 0.75 + dg * 0.25, 0.9 * 0.75 + db * 0.25, s.a0[i]! * env, size, 1.2, 1, 0, 0, 0)
      return
    }
  }
  setLook(out, o, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
}

/** Hand a particle to another scene where it stands, keeping its look as a snapshot. */
function convert(s: Sim, i: number, to: number): void {
  'worklet'
  rawLook(s, i, s.owner[i]!, s.snap, i * LOOK_STRIDE)
  s.owner[i] = to
  s.morph[i] = 0
  if (i >= SCENE_PARTICLES[to]!) {
    // Surplus for the new scene: keep the old look (morph stays < 0) and fade out.
    s.morph[i] = -10
    s.dieAt[i] = s.age[i]! + 1.0
    return
  }
  const age = s.age[i]!
  s.dieAt[i] = NEVER
  s.a0[i] = 0
  s.a1[i] = 0
  switch (to) {
    case S_RAIN:
      if (isRunner(i)) {
        s.a1[i] = s.y[i]!
        s.a0[i] = s.x[i]! - rainWobble(s.seed[i]!, s.y[i]!)
        s.size[i] = 2.4 + rand(s) * 1.6
        s.life[i] = NEVER
      } else {
        s.size[i] = 0.9 + Math.pow(rand(s), 2.2) * 3.4
        s.life[i] = age + 10 + rand(s) * 15
      }
      break
    case S_NOCTURNE:
      s.life[i] = age + 8 + rand(s) * 6
      break
    case S_HEARTH:
      s.a0[i] = rand(s)
      s.a1[i] = age
      s.life[i] = age + 3 + rand(s) * 3
      break
    case S_TIDE: {
      const yh = tideHorizon(s)
      s.a0[i] = Math.min(1, Math.max(0, (s.y[i]! - yh) / (s.H - yh)))
      s.a1[i] = age
      s.life[i] = age + 1 + rand(s) * 0.8
      break
    }
    case S_DELTA:
      s.a0[i] = rand(s)
      s.life[i] = NEVER
      break
    case S_HORIZON:
      s.life[i] = NEVER
      break
    case S_INK:
      s.life[i] = age + 10 + rand(s) * 10
      break
    case S_ADAGIO:
      s.a0[i] = rand(s)
      s.life[i] = NEVER
      break
    case S_STARFIELD: {
      const r0 = s.seed[i]!
      s.a0[i] = r0 < 0.5 ? 0 : r0 < 0.82 ? 1 : 2
      s.a1[i] = rand(s)
      s.life[i] = NEVER
      break
    }
    case S_AMBER:
      s.life[i] = age + 20 + rand(s) * 20
      break
    case S_MIST:
      s.a0[i] = rand(s)
      s.life[i] = NEVER
      break
    case S_COVE:
      s.a0[i] = 0.3 + rand(s) * 0.3
      s.a1[i] = age
      s.life[i] = age + 1 + rand(s)
      break
  }
}

function flow(s: Sim, i: number, dt: number): void {
  'worklet'
  if (dt <= 0) return
  const sd = s.seed[i]!
  const t = s.t
  let tx = 0
  let ty = 0
  let tau = 1
  switch (s.owner[i]) {
    case S_RAIN: {
      if (isRunner(i)) {
        if (s.age[i]! < 0) {
          s.vy[i] = 0
          return
        }
        const moving = vnoise(sd * 50, t * 0.6) > 0.42
        const vt = moving ? 40 + 70 * vnoise(sd * 13, t * 0.3) : 2
        s.vy[i] = approach(s.vy[i]!, vt, dt, 0.35)
        s.y[i] = s.y[i]! + s.vy[i]! * dt
        s.x[i] = runnerX(s, i, s.y[i]!)
        if (s.y[i]! > s.H + 20) s.age[i] = NEVER
        return
      }
      tau = 0.3
      break
    }
    case S_NOCTURNE:
      tx = (vnoise(sd * 17, t * 0.07) - 0.5) * 7
      ty = -2.5 + (vnoise(sd * 23, t * 0.07) - 0.5) * 5
      tau = 1.2
      break
    case S_HEARTH: {
      const u = (s.age[i]! - s.a1[i]!) / Math.max(0.1, s.life[i]! - s.a1[i]!)
      ty = -(22 + 36 * (1 - u)) / (0.6 + s.size[i]! * 0.4)
      tx = (vnoise(s.x[i]! * 0.012, s.y[i]! * 0.012 - t * 0.25) - 0.5) * 70
      tau = 0.5
      break
    }
    case S_TIDE:
      ty = 2 + 6 * s.a0[i]!
      tau = 0.4
      break
    case S_DELTA:
      tx = (vnoise(sd * 13, t * 0.05) - 0.5) * 5
      ty = (vnoise(sd * 29, t * 0.05) - 0.5) * 5
      tau = 1.5
      break
    case S_HORIZON:
      tx = 16 + 55 * gustAt(s, s.x[i]!)
      ty = Math.sin(t * 0.5 + sd * 20) * 7
      tau = 0.9
      break
    case S_INK:
      tx = Math.sin(s.y[i]! * 0.004 + t * 0.05) * 5
      ty = Math.cos(s.x[i]! * 0.004 + t * 0.04) * 4
      tau = 2
      break
    case S_ADAGIO: {
      const g = chladniGrad(s, s.x[i]!, s.y[i]!)
      const f = g[0]
      const gx = g[1]
      const gy = g[2]
      const g2 = gx * gx + gy * gy + 1e-6
      // Newton step toward the nodal line, plus agitation where the plate moves.
      let vx = (-f * gx) / g2
      let vy = (-f * gy) / g2
      const sp = Math.sqrt(vx * vx + vy * vy)
      const maxSp = 45
      if (sp > maxSp) {
        vx *= maxSp / sp
        vy *= maxSp / sp
      }
      const shake = Math.min(1, Math.abs(f)) * 26
      tx = vx * 1.2 + (vnoise(sd * 31, t * 3) - 0.5) * shake
      ty = vy * 1.2 + (vnoise(sd * 47, t * 3) - 0.5) * shake
      tau = 0.25
      break
    }
    case S_STARFIELD: {
      const w = s.a0[i]! === 0 ? 0.006 : s.a0[i]! === 1 ? 0.01 : 0.016
      tx = -w * (s.y[i]! - s.H * ORIGIN_Y)
      ty = w * (s.x[i]! - s.W * ORIGIN_X)
      tau = 1
      break
    }
    case S_AMBER:
      tx = (vnoise(sd * 19, t * 0.08) - 0.5) * 6
      ty = -1.5 + (vnoise(sd * 41, t * 0.08) - 0.5) * 5
      tau = 1.5
      break
    case S_MIST: {
      const v = 40 + 80 * s.a0[i]!
      tx = v * 0.08
      ty = v
      tau = 0.25
      break
    }
    case S_COVE:
      tx = (vnoise(sd * 11, t * 0.2) - 0.5) * 4
      ty = 3
      tau = 1
      break
  }
  s.vx[i] = approach(s.vx[i]!, tx, dt, tau)
  s.vy[i] = approach(s.vy[i]!, ty, dt, tau)
  s.x[i] = s.x[i]! + s.vx[i]! * dt
  s.y[i] = s.y[i]! + s.vy[i]! * dt
  if (s.owner[i] === S_ADAGIO) {
    s.x[i] = Math.min(s.W, Math.max(0, s.x[i]!))
    s.y[i] = Math.min(s.H, Math.max(0, s.y[i]!))
  }
}

/** Advance everything by dt real seconds. */
export function simStep(s: Sim, dtReal: number, env: SimEnv, target: number, cue: MotifCue | null): void {
  'worklet'
  const dt = dtReal * env.timeScale
  s.clock += dtReal
  s.t += dt
  s.intensity = env.intensity
  s.breathHz = env.breathHz > 0 ? env.breathHz : 0.1

  if (target !== s.sceneB) beginTransition(s, target)
  if (cue && cue.id !== s.cueId) ingestCue(s, cue)

  if (s.prog < 1) {
    s.prog = Math.min(1, s.prog + dtReal / TRANSITION_SECONDS)
    if (s.prog >= 1) s.sceneA = s.sceneB
  }

  stepSceneState(s, dt)

  const morphRate = dtReal / MORPH_SECONDS
  const countB = SCENE_PARTICLES[s.sceneB]!
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (!s.alive[i]) {
      if (i < countB) {
        s.owner[i] = s.sceneB
        spawn(s, i, s.sceneB, false)
      }
      continue
    }
    if (s.owner[i] !== s.sceneB) {
      const warp = (s.seed[i]! - 0.5) * 0.2
      if (coverAt(s, s.x[i]!, s.y[i]!, warp) > 0.5) convert(s, i, s.sceneB)
    }
    if (s.morph[i]! < 1) s.morph[i] = Math.min(1, s.morph[i]! + morphRate)
    s.age[i] = s.age[i]! + dt
    flow(s, i, dt)
    const x = s.x[i]!
    const y = s.y[i]!
    const own = s.owner[i]!
    const out =
      own !== S_STARFIELD && (x < -s.W * 0.4 || x > s.W + 80 || y < -120 || y > s.H + 80)
    if (out || s.age[i]! >= s.life[i]! || s.age[i]! >= s.dieAt[i]!) {
      if (i < SCENE_PARTICLES[own]!) spawn(s, i, own, false)
      else s.alive[i] = 0
    }
  }

  if (sceneActive(s, S_RAIN)) wipeRain(s)
}

/** Run the simulation forward so a freshly mounted scene starts settled. */
export function prewarm(s: Sim, seconds: number): void {
  'worklet'
  const env: SimEnv = { timeScale: 1, intensity: s.intensity, breathHz: s.breathHz }
  const steps = Math.ceil(seconds * 15)
  for (let k = 0; k < steps; k++) simStep(s, 1 / 15, env, s.sceneB, null)
}

/** Jump straight to a scene (reduced motion): fresh population, no front. */
export function simSnap(s: Sim, scene: number): void {
  'worklet'
  s.sceneA = scene
  s.sceneB = scene
  s.prog = 1
  for (let i = 0; i < MAX_PARTICLES; i++) {
    s.owner[i] = scene
    s.morph[i] = 1
    s.alive[i] = 0
    if (i < SCENE_PARTICLES[scene]!) spawn(s, i, scene, true)
  }
}

/**
 * Final look of particle i for drawing: blends from the conversion snapshot,
 * fades on exit, hides new particles until the front reaches them, and applies
 * the global intensity. Returns false when there is nothing to draw.
 */
export function particleLook(s: Sim, i: number, out: number[], o: number): boolean {
  'worklet'
  if (!s.alive[i]) return false
  const own = s.owner[i]!
  rawLook(s, i, own, out, o)
  const m = s.morph[i]!
  if (m < 1) {
    const k = smoothstep(0, 1, m)
    const so = i * LOOK_STRIDE
    for (let f = 0; f < LOOK_STRIDE; f++) out[o + f] = s.snap[so + f]! + (out[o + f]! - s.snap[so + f]!) * k
  }
  let a = out[o + 3]! * s.intensity
  const dieAt = s.dieAt[i]!
  if (dieAt < NEVER) a *= Math.min(1, Math.max(0, (dieAt - s.age[i]!) / 0.8))
  if (s.prog < 1 && own === s.sceneB && m >= 1) a *= coverAt(s, s.x[i]!, s.y[i]!, (s.seed[i]! - 0.5) * 0.2)
  out[o + 3] = a
  return a > 0.004
}
