/**
 * Draws one frame of the backdrop simulation onto a Skia canvas: each scene's
 * upper-half light (./upper.ts), its structures (rain trails, strings, grass,
 * pines), and every particle in a single drawAtlas call.
 *
 * Takes the Skia API and enum values as arguments and imports nothing from
 * React Native, so the same code runs in the app (as a UI-thread worklet), on
 * web (CanvasKit) and headless in Node for rendering previews.
 *
 * Allocation: transforms, colours and paints are made once (makeGfx) and reused;
 * a frame only allocates its paths and the small arrays handed to drawAtlas.
 */
import type { SkCanvas, SkImage, SkPaint, SkPathBuilder, SkRect, SkRSXform, Uniforms } from '@shopify/react-native-skia'
import { SCENE, SCENE_RGB } from '@/core/backdrop/scenes'
import { drawUpper } from './upper'
import {
  GRASS_BLADES,
  LOOK_STRIDE,
  MAX_PARTICLES,
  PINE_COUNT,
  SCENE_PARTICLES,
  STRING_COUNT,
  chladniModes,
  grassBlade,
  isRunner,
  particleLook,
  pineTree,
  presence,
  runnerX,
  stringDisplacement,
  stringEnds,
  stringEnergy,
  beckonAmp,
  echoAmp,
  waveAmp,
  waveProgress,
  type Sim,
} from '@/core/backdrop/sim'

type SkiaApi = typeof import('@shopify/react-native-skia').Skia

/** Enum values the drawing code needs, passed in so this file stays platform free. */
export interface GfxEnums {
  plus: number
  modulate: number
  linear: number
  mipLinear: number
  stroke: number
  fill: number
  roundCap: number
  roundJoin: number
  rgba8888: number
  premul: number
}

export interface Gfx {
  Skia: SkiaApi
  atlas: SkImage
  rects: SkRect[]
  anchors: number[]
  xf: SkRSXform[]
  cols: Float32Array[]
  atlasPaint: SkPaint
  stroke: SkPaint
  fill: SkPaint
  /** Reusable path builders; detach() hands over the path and resets them. */
  pb: SkPathBuilder
  pb2: SkPathBuilder
  color: Float32Array
  look: number[]
  geo: number[]
  modulate: number
  sampling: { filter: number; mipmap: number }
}

const ATLAS_W = 160
const ATLAS_H = 32

/** Sprite sheet: soft glow, round core, backlit water drop, horizontal streak. White, premultiplied. */
function atlasPixels(): Uint8Array {
  'worklet'
  const px = new Uint8Array(ATLAS_W * ATLAS_H * 4)
  const sstep = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
  }
  for (let y = 0; y < ATLAS_H; y++) {
    for (let x = 0; x < ATLAS_W; x++) {
      const cx = x + 0.5
      const cy = y + 0.5
      let a = 0
      if (x < 32) {
        const r = Math.hypot(cx - 16, cy - 16) / 16
        a = Math.exp(-r * r * 4.5) * (1 - sstep(0.85, 1, r))
      } else if (x < 64) {
        const r = Math.hypot(cx - 48, cy - 16) / 13
        a = 1 - sstep(0.7, 1, r)
      } else if (x < 96) {
        const nx = (cx - 80) / 14
        const ny = (cy - 16) / 14
        const r = Math.hypot(nx, ny)
        const inside = 1 - sstep(0.9, 1, r)
        const crescent = sstep(0.55, 0.95, r) * sstep(-0.2, 0.7, ny) * 0.85
        const hx = nx + 0.32
        const hy = ny + 0.38
        const highlight = Math.exp(-(hx * hx + hy * hy) / 0.02)
        const rim = sstep(0.8, 0.97, r) * 0.25
        a = inside * Math.min(1, 0.1 + crescent + highlight + rim)
      } else if (y >= 8 && y < 24) {
        const u = (cx - 128) / 32
        const v = (cy - 16) / 6
        const k = Math.max(0, 1 - u * u)
        a = Math.exp(-v * v * 2.2) * k * k
      }
      const b = Math.round(Math.min(1, Math.max(0, a)) * 255)
      const o = (y * ATLAS_W + x) * 4
      px[o] = b
      px[o + 1] = b
      px[o + 2] = b
      px[o + 3] = b
    }
  }
  return px
}

export function makeGfx(Skia: SkiaApi, e: GfxEnums): Gfx | null {
  'worklet'
  const data = Skia.Data.fromBytes(atlasPixels())
  const atlas = Skia.Image.MakeImage(
    { width: ATLAS_W, height: ATLAS_H, colorType: e.rgba8888, alphaType: e.premul },
    data,
    ATLAS_W * 4,
  )
  if (!atlas) return null
  const xf: SkRSXform[] = []
  const cols: Float32Array[] = []
  for (let n = 0; n < MAX_PARTICLES * 4; n++) {
    xf.push(Skia.RSXform(1, 0, 0, 0))
    cols.push(new Float32Array(4))
  }
  const atlasPaint = Skia.Paint()
  atlasPaint.setBlendMode(e.plus)
  atlasPaint.setAntiAlias(true)
  const stroke = Skia.Paint()
  stroke.setStyle(e.stroke)
  stroke.setAntiAlias(true)
  stroke.setStrokeCap(e.roundCap)
  stroke.setStrokeJoin(e.roundJoin)
  const fill = Skia.Paint()
  fill.setStyle(e.fill)
  fill.setAntiAlias(true)
  return {
    Skia,
    atlas,
    rects: [
      Skia.XYWHRect(0, 0, 32, 32),
      Skia.XYWHRect(32, 0, 32, 32),
      Skia.XYWHRect(64, 0, 32, 32),
      Skia.XYWHRect(96, 8, 64, 16),
    ],
    anchors: [16, 16, 16, 16, 16, 16, 32, 8],
    xf,
    cols,
    atlasPaint,
    stroke,
    fill,
    pb: Skia.PathBuilder.Make(),
    pb2: Skia.PathBuilder.Make(),
    color: new Float32Array(4),
    look: new Array(LOOK_STRIDE).fill(0),
    geo: [0, 0, 0, 0, 0, 0],
    modulate: e.modulate,
    sampling: { filter: e.linear, mipmap: e.mipLinear },
  }
}

function paintColor(g: Gfx, paint: SkPaint, r: number, gr: number, b: number, a: number): void {
  'worklet'
  g.color[0] = r
  g.color[1] = gr
  g.color[2] = b
  g.color[3] = Math.min(1, Math.max(0, a))
  paint.setColor(g.color)
}

function detail(scene: number, ch: number): number {
  'worklet'
  return SCENE_RGB[scene * 12 + 3 + ch]!
}

function mid(scene: number, ch: number): number {
  'worklet'
  return SCENE_RGB[scene * 12 + 6 + ch]!
}

/* -------------------------------------------------------------- structures */

function drawRainTrails(canvas: SkCanvas, s: Sim, g: Gfx): void {
  'worklet'
  const S = SCENE.rain
  for (let i = 0; i < SCENE_PARTICLES[S]!; i += 20) {
    if (!isRunner(i) || !s.alive[i] || s.owner[i] !== S || s.age[i]! < 0) continue
    const y = s.y[i]!
    const top = Math.max(s.a1[i]!, y - 260)
    if (y - top < 6) continue
    const pr = presence(s, S, s.x[i]!, y)
    if (pr < 0.02) continue
    const midY = (top + y) / 2
    g.stroke.setStrokeWidth(s.size[i]! * 0.45)
    for (let half = 0; half < 2; half++) {
      const y0 = half === 0 ? top : midY
      const y1 = half === 0 ? midY : y
      const path = g.pb
      path.moveTo(runnerX(s, i, y0), y0)
      for (let yy = y0 + 6; yy < y1; yy += 6) path.lineTo(runnerX(s, i, yy), yy)
      path.lineTo(runnerX(s, i, y1), y1)
      paintColor(g, g.stroke, detail(S, 0), detail(S, 1), detail(S, 2), (half === 0 ? 0.05 : 0.12) * pr * s.intensity)
      canvas.drawPath(path.detach(), g.stroke)
    }
  }
}

function drawStrings(canvas: SkCanvas, s: Sim, g: Gfx): void {
  'worklet'
  const S = SCENE.nocturne
  const SEG = 24
  const settled = s.prog >= 1
  for (let k = 0; k < STRING_COUNT; k++) {
    const e = stringEnergy(s, k)
    const ends = stringEnds(s, k)
    const a = (0.045 + 0.55 * e) * s.intensity
    g.stroke.setStrokeWidth(0.7 + 0.6 * e)
    const y0 = -0.02 * s.H
    const span = 1.04 * s.H
    if (settled) {
      const path = g.pb
      for (let j = 0; j <= SEG; j++) {
        const f = j / SEG
        const x = ends[0] + (ends[1] - ends[0]) * f + stringDisplacement(s, k, f, e)
        if (j === 0) path.moveTo(x, y0 + f * span)
        else path.lineTo(x, y0 + f * span)
      }
      paintColor(g, g.stroke, detail(S, 0), detail(S, 1), detail(S, 2), a)
      canvas.drawPath(path.detach(), g.stroke)
      continue
    }
    let px = ends[0] + stringDisplacement(s, k, 0, e)
    let py = y0
    for (let j = 1; j <= SEG; j++) {
      const f = j / SEG
      const x = ends[0] + (ends[1] - ends[0]) * f + stringDisplacement(s, k, f, e)
      const y = y0 + f * span
      const pr = presence(s, S, (x + px) / 2, (y + py) / 2)
      if (pr > 0.02) {
        paintColor(g, g.stroke, detail(S, 0), detail(S, 1), detail(S, 2), a * pr)
        canvas.drawLine(px, py, x, y, g.stroke)
      }
      px = x
      py = y
    }
  }
}

function drawGrass(canvas: SkCanvas, s: Sim, g: Gfx): void {
  'worklet'
  const S = SCENE.horizon
  const dark = g.pb
  const tips = g.pb2
  const b = g.geo
  let any = false
  for (let j = 0; j < GRASS_BLADES; j++) {
    grassBlade(s, j, b)
    const pr = presence(s, S, b[0]!, s.H * 0.95)
    if (pr < 0.02) continue
    any = true
    const cx = b[0]! + (b[2]! - b[0]!) * pr
    const cy = b[1]! + (b[3]! - b[1]!) * pr
    const tx = b[0]! + (b[4]! - b[0]!) * pr
    const ty = b[1]! + (b[5]! - b[1]!) * pr
    dark.moveTo(b[0]!, b[1]!)
    dark.quadTo(cx, cy, tx, ty)
    tips.moveTo((cx + tx) / 2, (cy + ty) / 2)
    tips.lineTo(tx, ty)
  }
  const darkPath = dark.detach()
  const tipPath = tips.detach()
  if (!any) return
  g.stroke.setStrokeWidth(1.5)
  paintColor(g, g.stroke, 0.01, 0.015, 0.03, 0.72 * s.intensity)
  canvas.drawPath(darkPath, g.stroke)
  g.stroke.setStrokeWidth(0.9)
  paintColor(g, g.stroke, detail(S, 0), detail(S, 1), detail(S, 2), 0.16 * s.intensity)
  canvas.drawPath(tipPath, g.stroke)
}

function drawPines(canvas: SkCanvas, s: Sim, g: Gfx): void {
  'worklet'
  const S = SCENE.mist
  const W = s.W
  const H = s.H
  const path = g.pb
  let any = false
  path.moveTo(0, H + 10)
  for (let q = 0; q <= 12; q++) {
    const x = (q / 12) * W
    const pr = presence(s, S, x, H * 0.97)
    if (pr > 0.02) any = true
    path.lineTo(x, H * (0.985 - 0.02 * Math.sin(x * 0.011 + 1.3)) + (1 - pr) * 0.06 * H)
  }
  path.lineTo(W, H + 10)
  path.close()
  const t = g.geo
  for (let k = 0; k < PINE_COUNT; k++) {
    pineTree(s, k, t)
    const x = t[0]!
    const base = t[1]!
    const pr = presence(s, S, x, base)
    if (pr < 0.02) continue
    any = true
    const h = t[2]! * pr
    const w = t[3]! * (0.6 + 0.4 * pr)
    path.moveTo(x - w * 0.06, base + 4)
    for (let tier = 0; tier < 4; tier++) {
      const ty = base - h * (0.08 + 0.22 * tier)
      const tw = (w * (1 - tier * 0.22)) / 2
      path.lineTo(x - tw, ty)
      path.lineTo(x - tw * 0.38, ty - h * 0.17)
    }
    path.lineTo(x, base - h)
    for (let tier = 3; tier >= 0; tier--) {
      const ty = base - h * (0.08 + 0.22 * tier)
      const tw = (w * (1 - tier * 0.22)) / 2
      path.lineTo(x + tw * 0.38, ty - h * 0.17)
      path.lineTo(x + tw, ty)
    }
    path.lineTo(x + w * 0.06, base + 4)
    path.close()
  }
  const pines = path.detach()
  if (!any) return
  paintColor(g, g.fill, mid(S, 0) * 0.08, mid(S, 1) * 0.08, mid(S, 2) * 0.08, 0.92 * s.intensity)
  canvas.drawPath(pines, g.fill)
}

function drawStructures(canvas: SkCanvas, s: Sim, scene: number, g: Gfx): void {
  'worklet'
  if (scene === SCENE.rain) drawRainTrails(canvas, s, g)
  else if (scene === SCENE.nocturne) drawStrings(canvas, s, g)
  else if (scene === SCENE.horizon) drawGrass(canvas, s, g)
  else if (scene === SCENE.mist) drawPines(canvas, s, g)
}

/* --------------------------------------------------------------- particles */

function drawParticles(canvas: SkCanvas, s: Sim, g: Gfx): void {
  'worklet'
  const rects: SkRect[] = []
  const xfs: SkRSXform[] = []
  const cols: Float32Array[] = []
  const L = g.look
  let n = 0
  const emit = (k: number, x: number, y: number, a: number, scale: number, angle: number) => {
    if (a < 0.004) return
    const c = Math.cos(angle) * scale
    const sn = Math.sin(angle) * scale
    const ax = g.anchors[k * 2]!
    const ay = g.anchors[k * 2 + 1]!
    const xf = g.xf[n]!
    xf.set(c, sn, x - (c * ax - sn * ay), y - (sn * ax + c * ay))
    const col = g.cols[n]!
    col[0] = L[0]!
    col[1] = L[1]!
    col[2] = L[2]!
    col[3] = Math.min(1, a)
    rects.push(g.rects[k]!)
    xfs.push(xf)
    cols.push(col)
    n++
  }
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (!particleLook(s, i, L, 0)) continue
    const x = s.x[i]!
    const y = s.y[i]!
    const a = L[3]!
    const size = L[4]!
    emit(0, x, y, a * L[5]! * 0.5, (size * 4.5) / 16, 0)
    emit(1, x, y, a * L[6]!, size / 13, 0)
    emit(2, x, y, a * L[7]!, size / 14, 0)
    emit(3, x, y, a * L[8]!, size / 5, L[9]!)
  }
  if (n > 0) canvas.drawAtlas(g.atlas, rects, xfs, g.atlasPaint, g.modulate, cols, g.sampling)
}

/** Draw a whole frame: structures of the outgoing and incoming scene, then particles. */
export function drawFrame(canvas: SkCanvas, s: Sim, g: Gfx): void {
  'worklet'
  if (s.prog < 1 && s.sceneA !== s.sceneB) {
    drawUpper(canvas, s, s.sceneA, g)
    drawStructures(canvas, s, s.sceneA, g)
  }
  drawUpper(canvas, s, s.sceneB, g)
  drawStructures(canvas, s, s.sceneB, g)
  drawParticles(canvas, s, g)
}

/** Uniforms for FIELD_SKSL. */
export function fieldUniforms(s: Sim, fieldW: number, fieldH: number, edge: number): Uniforms {
  'worklet'
  const pal: number[][] = []
  for (let side = 0; side < 2; side++) {
    const sc = side === 0 ? s.sceneA : s.sceneB
    for (let k = 0; k < 4; k++) {
      const o = sc * 12 + k * 3
      pal.push([SCENE_RGB[o]!, SCENE_RGB[o + 1]!, SCENE_RGB[o + 2]!, 1])
    }
  }
  const strings: number[][] = []
  for (let j = 0; j < 4; j++) {
    const row: number[] = []
    for (let c = 0; c < 4; c++) {
      const k = j * 4 + c
      row.push(k < STRING_COUNT ? stringEnergy(s, k) : 0)
    }
    strings.push(row)
  }
  const ink: number[][] = []
  for (let k = 0; k < 4; k++) ink.push([s.ink[k * 4]!, s.ink[k * 4 + 1]!, s.ink[k * 4 + 2]!, s.ink[k * 4 + 3]!])
  const ch = chladniModes(s)
  return {
    res: [fieldW, fieldH],
    t: s.t,
    sa: s.sceneA,
    sb: s.sceneB,
    edge,
    settled: s.prog >= 1 ? 1 : 0,
    intensity: s.intensity,
    pal,
    pulse: s.pulse,
    crest: s.crest,
    strings,
    ink,
    chl: [ch[0], ch[1], ch[2], ch[3]],
    chlMix: ch[4],
    breath: [s.breathX / s.W, s.breathY / s.W, s.charge, Math.max(s.beat, s.glint)],
    wave: [Math.max(0, s.waveR) / s.W, waveAmp(s), Math.max(0, waveProgress(s)), 0],
    wave2: [Math.max(0, s.echoR) / s.W, echoAmp(s), 0, 0],
    beckon: [Math.max(0, s.beckonR) / s.W, beckonAmp(s), 0, 0],
  }
}
