import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import {
  createPond,
  setTarget,
  SPINE_SEGMENTS,
  SPINE_SPACING,
  tapPond,
  tickPond,
  type MoteColor,
  type PondState,
  type Vec2,
} from '@/core/games/pond/engine'
import { color } from '@/design/tokens'
import { GameShell, type GameScreenProps } from '@/ui/components/GameShell'
import { useCalm, useFeedback, useGameLoop, useGameSave, useKeys } from '@/ui/hooks/game'
import './pond.css'

interface PondSave {
  state: PondState | null
  totalGathered: number
  plays: number
}

const DEFAULT_SAVE: PondSave = {
  state: null,
  totalGathered: 0,
  plays: 1,
}

const MOTE_RGB: Record<MoteColor, [number, number, number]> = {
  candle: [255, 217, 160], // color.candle #FFD9A0
  glow: [255, 180, 94], // color.glow #FFB45E
  ember: [232, 90, 54], // pieces.ember #E85A36
  honey: [233, 196, 106], // pieces.honey #E9C46A
  rose: [217, 122, 108], // pieces.rose #D97A6C
}

/** Organic half-width profile along the 10-segment koi spine (normalised to pond min-dim). */
const BODY_WIDTHS = [0.0155, 0.0235, 0.0245, 0.022, 0.018, 0.0138, 0.01, 0.0068, 0.0046, 0.003] as const

function rgba(rgb: readonly [number, number, number], a: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a.toFixed(3)})`
}

function isValidPondState(v: unknown): v is PondState {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<PondState>
  return (
    Boolean(s.koi) &&
    Array.isArray(s.koi?.spine) &&
    s.koi.spine.length === SPINE_SEGMENTS &&
    Array.isArray(s.motes) &&
    Array.isArray(s.ripples) &&
    Array.isArray(s.leaves) &&
    typeof s.gathered === 'number' &&
    typeof s.gatherEventId === 'number' &&
    typeof s.rngState === 'number'
  )
}

/**
 * Project the normalised spine into canvas pixel space while keeping every
 * segment at a uniform pixel length so the koi never stretches on portrait or
 * landscape screens, while its head stays pinned to exact normalised coords.
 */
function projectSpineToPixels(spine: readonly Vec2[], w: number, h: number, unit: number): Vec2[] {
  const segPx = SPINE_SPACING * unit
  const head = spine[0]!
  const pts: Vec2[] = [{ x: head.x * w, y: head.y * h }]
  for (let i = 1; i < spine.length; i++) {
    const prevNorm = spine[i - 1]!
    const currNorm = spine[i]!
    const dx = (currNorm.x - prevNorm.x) * w
    const dy = (currNorm.y - prevNorm.y) * h
    const len = Math.hypot(dx, dy)
    const prevPx = pts[i - 1]!
    if (len > 1e-5) {
      pts.push({
        x: prevPx.x + (dx / len) * segPx,
        y: prevPx.y + (dy / len) * segPx,
      })
    } else {
      pts.push({ x: prevPx.x - segPx, y: prevPx.y })
    }
  }
  return pts
}

function buildBodyPath(
  ctx: CanvasRenderingContext2D,
  pts: readonly Vec2[],
  normals: readonly Vec2[],
  unit: number,
  offsetX = 0,
  offsetY = 0,
): void {
  const n = pts.length
  const left: Vec2[] = new Array(n)
  const right: Vec2[] = new Array(n)

  for (let i = 0; i < n; i++) {
    const p = pts[i]!
    const nm = normals[i]!
    const hw = (BODY_WIDTHS[i] ?? 0.003) * unit
    left[i] = { x: p.x + nm.x * hw + offsetX, y: p.y + nm.y * hw + offsetY }
    right[i] = { x: p.x - nm.x * hw + offsetX, y: p.y - nm.y * hw + offsetY }
  }

  // Forward direction at snout for a smooth rounded nose
  const head = pts[0]!
  const neck = pts[1]!
  const fx = head.x - neck.x
  const fy = head.y - neck.y
  const fl = Math.hypot(fx, fy) || 1
  const dirX = fx / fl
  const dirY = fy / fl
  const snoutLen = BODY_WIDTHS[0]! * unit * 1.38
  const snoutTipX = head.x + dirX * snoutLen + offsetX
  const snoutTipY = head.y + dirY * snoutLen + offsetY

  ctx.beginPath()
  ctx.moveTo(left[0]!.x, left[0]!.y)

  // Left flank from head to tail
  for (let i = 1; i < n - 1; i++) {
    const curr = left[i]!
    const next = left[i + 1]!
    ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) * 0.5, (curr.y + next.y) * 0.5)
  }
  ctx.lineTo(left[n - 1]!.x, left[n - 1]!.y)

  // Tail peduncle cap
  const tail = pts[n - 1]!
  ctx.quadraticCurveTo(tail.x + offsetX, tail.y + offsetY, right[n - 1]!.x, right[n - 1]!.y)

  // Right flank from tail back to head
  for (let i = n - 2; i >= 1; i--) {
    const curr = right[i]!
    const prev = right[i - 1]!
    ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + prev.x) * 0.5, (curr.y + prev.y) * 0.5)
  }
  ctx.lineTo(right[0]!.x, right[0]!.y)

  // Rounded koi snout
  const snoutCtrlR = {
    x: right[0]!.x + dirX * snoutLen * 0.72,
    y: right[0]!.y + dirY * snoutLen * 0.72,
  }
  const snoutCtrlL = {
    x: left[0]!.x + dirX * snoutLen * 0.72,
    y: left[0]!.y + dirY * snoutLen * 0.72,
  }
  ctx.quadraticCurveTo(snoutCtrlR.x, snoutCtrlR.y, snoutTipX, snoutTipY)
  ctx.quadraticCurveTo(snoutCtrlL.x, snoutCtrlL.y, left[0]!.x, left[0]!.y)
  ctx.closePath()
}

function drawPectoralFin(
  ctx: CanvasRenderingContext2D,
  anchor: Vec2,
  forwardAngle: number,
  side: 1 | -1,
  scale: number,
  flutter: number,
  shadowOnly: boolean,
): void {
  ctx.save()
  ctx.translate(anchor.x, anchor.y)
  ctx.rotate(forwardAngle + side * (0.68 + flutter * 0.12))

  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(
    scale * 0.34,
    side * scale * 0.52,
    -scale * 0.25,
    side * scale * 1.05,
    -scale * 0.92,
    side * scale * 0.62,
  )
  ctx.quadraticCurveTo(-scale * 0.58, side * scale * 0.14, -scale * 0.22, 0)
  ctx.closePath()

  if (shadowOnly) {
    ctx.fillStyle = 'rgba(4, 2, 1, 0.38)'
    ctx.fill()
    ctx.restore()
    return
  }

  const grad = ctx.createLinearGradient(0, 0, -scale * 0.75, side * scale * 0.85)
  grad.addColorStop(0, 'rgba(255, 217, 160, 0.44)')
  grad.addColorStop(0.55, 'rgba(255, 180, 94, 0.2)')
  grad.addColorStop(1, 'rgba(232, 90, 54, 0.03)')
  ctx.fillStyle = grad
  ctx.fill()

  // Delicate fin rays
  ctx.strokeStyle = 'rgba(255, 217, 160, 0.16)'
  ctx.lineWidth = Math.max(0.6, scale * 0.025)
  for (let r = 0; r < 3; r++) {
    const t = 0.25 + r * 0.26
    ctx.beginPath()
    ctx.moveTo(-scale * 0.06, side * scale * 0.04)
    ctx.quadraticCurveTo(
      -scale * (0.12 + t * 0.2),
      side * scale * (0.45 + t * 0.15),
      -scale * (0.35 + t * 0.45),
      side * scale * (0.72 - t * 0.14),
    )
    ctx.stroke()
  }

  ctx.restore()
}

function drawForkedTail(
  ctx: CanvasRenderingContext2D,
  tailAnchor: Vec2,
  tailAngle: number,
  unit: number,
  sway: number,
  shadowOnly: boolean,
): void {
  const len = unit * 0.072
  const spread = unit * 0.036

  ctx.save()
  ctx.translate(tailAnchor.x, tailAnchor.y)
  ctx.rotate(tailAngle)

  const swayOffset = sway * unit * 0.018

  ctx.beginPath()
  ctx.moveTo(0, -unit * 0.0028)
  // Upper lobe
  ctx.bezierCurveTo(
    len * 0.35,
    -spread * 0.55 + swayOffset * 0.35,
    len * 0.78,
    -spread * 1.15 + swayOffset * 0.85,
    len * 1.05,
    -spread * 0.78 + swayOffset,
  )
  // Flowing fork cleft
  ctx.quadraticCurveTo(len * 0.62, swayOffset * 0.55, len * 0.46, swayOffset * 0.42)
  // Lower lobe
  ctx.quadraticCurveTo(len * 0.62, swayOffset * 0.55, len * 1.05, spread * 0.78 + swayOffset)
  ctx.bezierCurveTo(
    len * 0.78,
    spread * 1.15 + swayOffset * 0.85,
    len * 0.35,
    spread * 0.55 + swayOffset * 0.35,
    0,
    unit * 0.0028,
  )
  ctx.closePath()

  if (shadowOnly) {
    ctx.fillStyle = 'rgba(4, 2, 1, 0.35)'
    ctx.fill()
    ctx.restore()
    return
  }

  const grad = ctx.createLinearGradient(0, 0, len, swayOffset)
  grad.addColorStop(0, 'rgba(255, 217, 160, 0.56)')
  grad.addColorStop(0.5, 'rgba(255, 180, 94, 0.28)')
  grad.addColorStop(1, 'rgba(232, 90, 54, 0.05)')
  ctx.fillStyle = grad
  ctx.fill()

  ctx.strokeStyle = 'rgba(255, 217, 160, 0.16)'
  ctx.lineWidth = Math.max(0.6, unit * 0.0016)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(len * 0.48, -spread * 0.38 + swayOffset * 0.45, len * 0.9, -spread * 0.64 + swayOffset * 0.9)
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(len * 0.48, spread * 0.38 + swayOffset * 0.45, len * 0.9, spread * 0.64 + swayOffset * 0.9)
  ctx.stroke()

  ctx.restore()
}

function drawPond(
  ctx: CanvasRenderingContext2D,
  state: PondState,
  w: number,
  h: number,
  pointerPos: Vec2 | null,
  reducedMotion: boolean,
): void {
  const unit = Math.min(w, h)
  const motionAmp = reducedMotion ? 0.45 : 1

  // 1. Deep warm ink-black water ground (strictly Ember palette, zero blue)
  const bg = ctx.createRadialGradient(w * 0.5, h * 0.46, unit * 0.06, w * 0.5, h * 0.5, Math.max(w, h) * 0.78)
  bg.addColorStop(0, '#160D09')
  bg.addColorStop(0.58, color.night1)
  bg.addColorStop(1, color.night0)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Very subtle drifting warm under-depth glow pools
  const driftT = state.timeMs * 0.00018 * motionAmp
  for (let i = 0; i < 2; i++) {
    const cx = w * (0.32 + i * 0.38 + Math.cos(driftT + i * 2.1) * 0.06)
    const cy = h * (0.36 + i * 0.28 + Math.sin(driftT * 0.8 + i * 1.5) * 0.06)
    const pool = ctx.createRadialGradient(cx, cy, 0, cx, cy, unit * 0.46)
    pool.addColorStop(0, 'rgba(92, 42, 22, 0.075)')
    pool.addColorStop(1, 'rgba(92, 42, 22, 0)')
    ctx.fillStyle = pool
    ctx.fillRect(0, 0, w, h)
  }

  // 2. Project koi spine and normals
  const pts = projectSpineToPixels(state.koi.spine, w, h, unit)
  const n = pts.length
  const normals: Vec2[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)]!
    const next = pts[Math.min(n - 1, i + 1)]!
    const tx = prev.x - next.x
    const ty = prev.y - next.y
    const tl = Math.hypot(tx, ty) || 1
    normals[i] = { x: -ty / tl, y: tx / tl }
  }

  const shoulderAngle = Math.atan2(pts[1]!.y - pts[3]!.y, pts[1]!.x - pts[3]!.x)
  const tailAngle = Math.atan2(pts[n - 1]!.y - pts[n - 3]!.y, pts[n - 1]!.x - pts[n - 3]!.x)
  const tailSway = Math.sin(state.koi.tailPhase - 3.6) * motionAmp
  const finFlutter = Math.sin(state.koi.tailPhase * 0.55) * motionAmp
  const turnBank = Math.max(-0.45, Math.min(0.45, state.koi.turnRate * 0.22))

  // 3. Subtle wake shimmer behind the koi
  const wakeAlpha = Math.min(0.08, state.koi.speed * 0.34)
  if (wakeAlpha > 0.01) {
    ctx.save()
    ctx.lineCap = 'round'
    for (const side of [-1, 1] as const) {
      ctx.beginPath()
      for (let i = 2; i < n; i++) {
        const p = pts[i]!
        const nm = normals[i]!
        const spread = (BODY_WIDTHS[i]! * 1.45 + (i - 2) * 0.0045) * unit
        const wx = p.x + nm.x * spread * side
        const wy = p.y + nm.y * spread * side
        if (i === 2) ctx.moveTo(wx, wy)
        else ctx.lineTo(wx, wy)
      }
      ctx.strokeStyle = `rgba(255, 217, 160, ${wakeAlpha.toFixed(3)})`
      ctx.lineWidth = Math.max(0.8, unit * 0.0022)
      ctx.stroke()
    }
    ctx.restore()
  }

  // 4. Soft dark offset shadow underneath the koi (water depth)
  const shadowOffX = unit * 0.014
  const shadowOffY = unit * 0.022
  ctx.save()
  ctx.filter = 'blur(5px)'
  const pecLShadow = {
    x: pts[2]!.x + normals[2]!.x * BODY_WIDTHS[2]! * unit * 0.62 + shadowOffX,
    y: pts[2]!.y + normals[2]!.y * BODY_WIDTHS[2]! * unit * 0.62 + shadowOffY,
  }
  const pecRShadow = {
    x: pts[2]!.x - normals[2]!.x * BODY_WIDTHS[2]! * unit * 0.62 + shadowOffX,
    y: pts[2]!.y - normals[2]!.y * BODY_WIDTHS[2]! * unit * 0.62 + shadowOffY,
  }
  drawPectoralFin(ctx, pecLShadow, shoulderAngle, 1, unit * 0.044, finFlutter - turnBank, true)
  drawPectoralFin(ctx, pecRShadow, shoulderAngle, -1, unit * 0.044, -finFlutter + turnBank, true)
  drawForkedTail(
    ctx,
    { x: pts[n - 1]!.x + shadowOffX, y: pts[n - 1]!.y + shadowOffY },
    tailAngle,
    unit,
    tailSway,
    true,
  )
  buildBodyPath(ctx, pts, normals, unit, shadowOffX, shadowOffY)
  ctx.fillStyle = 'rgba(4, 2, 1, 0.56)'
  ctx.fill()
  ctx.restore()

  // 5. Koi fins (under the body edge)
  const pecL = {
    x: pts[2]!.x + normals[2]!.x * BODY_WIDTHS[2]! * unit * 0.58,
    y: pts[2]!.y + normals[2]!.y * BODY_WIDTHS[2]! * unit * 0.58,
  }
  const pecR = {
    x: pts[2]!.x - normals[2]!.x * BODY_WIDTHS[2]! * unit * 0.58,
    y: pts[2]!.y - normals[2]!.y * BODY_WIDTHS[2]! * unit * 0.58,
  }
  drawPectoralFin(ctx, pecL, shoulderAngle, 1, unit * 0.045, finFlutter - turnBank, false)
  drawPectoralFin(ctx, pecR, shoulderAngle, -1, unit * 0.045, -finFlutter + turnBank, false)

  // Smaller pelvic fins
  const pelvAngle = Math.atan2(pts[4]!.y - pts[6]!.y, pts[4]!.x - pts[6]!.x)
  const pelvL = {
    x: pts[5]!.x + normals[5]!.x * BODY_WIDTHS[5]! * unit * 0.6,
    y: pts[5]!.y + normals[5]!.y * BODY_WIDTHS[5]! * unit * 0.6,
  }
  const pelvR = {
    x: pts[5]!.x - normals[5]!.x * BODY_WIDTHS[5]! * unit * 0.6,
    y: pts[5]!.y - normals[5]!.y * BODY_WIDTHS[5]! * unit * 0.6,
  }
  drawPectoralFin(ctx, pelvL, pelvAngle, 1, unit * 0.024, finFlutter * 0.6, false)
  drawPectoralFin(ctx, pelvR, pelvAngle, -1, unit * 0.024, -finFlutter * 0.6, false)

  // Forked flowing tail fin
  drawForkedTail(ctx, pts[n - 1]!, tailAngle, unit, tailSway, false)

  // 6. Koi organic tapered body with cream-candlelight & ember-saffron markings
  ctx.save()
  buildBodyPath(ctx, pts, normals, unit)
  const bodyGrad = ctx.createLinearGradient(pts[0]!.x, pts[0]!.y, pts[n - 1]!.x, pts[n - 1]!.y)
  bodyGrad.addColorStop(0, color.candle)
  bodyGrad.addColorStop(0.35, color.ink)
  bodyGrad.addColorStop(0.75, '#E4BA8C')
  bodyGrad.addColorStop(1, '#C98A5C')
  ctx.fillStyle = bodyGrad
  ctx.fill()

  // Clip markings cleanly to the koi silhouette
  ctx.clip()

  // Warm saffron-gold crown & shoulder glow
  const crown = ctx.createRadialGradient(
    pts[1]!.x,
    pts[1]!.y,
    unit * 0.002,
    pts[1]!.x,
    pts[1]!.y,
    unit * 0.036,
  )
  crown.addColorStop(0, 'rgba(255, 180, 94, 0.85)')
  crown.addColorStop(0.6, 'rgba(240, 151, 58, 0.45)')
  crown.addColorStop(1, 'rgba(240, 151, 58, 0)')
  ctx.fillStyle = crown
  ctx.beginPath()
  ctx.arc(pts[1]!.x, pts[1]!.y, unit * 0.036, 0, Math.PI * 2)
  ctx.fill()

  // Classic Kohaku ember-vermilion markings along spine
  const patches: readonly { idx: number; offsetN: number; rx: number; ry: number; fill: string }[] = [
    { idx: 1, offsetN: -0.25, rx: 0.022, ry: 0.015, fill: 'rgba(232, 90, 54, 0.82)' },
    { idx: 3, offsetN: 0.28, rx: 0.028, ry: 0.017, fill: 'rgba(232, 90, 54, 0.86)' },
    { idx: 5, offsetN: -0.18, rx: 0.02, ry: 0.012, fill: 'rgba(255, 180, 94, 0.72)' },
    { idx: 6, offsetN: 0.15, rx: 0.018, ry: 0.01, fill: 'rgba(232, 90, 54, 0.78)' },
  ]
  for (const patch of patches) {
    const p = pts[patch.idx]!
    const prev = pts[Math.max(0, patch.idx - 1)]!
    const nm = normals[patch.idx]!
    const angle = Math.atan2(prev.y - p.y, prev.x - p.x)
    const cx = p.x + nm.x * BODY_WIDTHS[patch.idx]! * unit * patch.offsetN
    const cy = p.y + nm.y * BODY_WIDTHS[patch.idx]! * unit * patch.offsetN
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.fillStyle = patch.fill
    ctx.beginPath()
    ctx.ellipse(0, 0, patch.rx * unit, patch.ry * unit, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // Subtle internal top-light sheen along the dorsal center
  ctx.beginPath()
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 1; i < n - 2; i++) {
    ctx.lineTo(pts[i]!.x, pts[i]!.y)
  }
  ctx.strokeStyle = 'rgba(255, 236, 204, 0.34)'
  ctx.lineWidth = unit * 0.0085
  ctx.lineCap = 'round'
  ctx.stroke()

  // Soft dark inner shadow at body edges for rounded 3D form
  buildBodyPath(ctx, pts, normals, unit)
  ctx.strokeStyle = 'rgba(42, 18, 8, 0.38)'
  ctx.lineWidth = Math.max(1.2, unit * 0.004)
  ctx.stroke()
  ctx.restore()

  // Translucent dorsal ridge fin flowing along joints 2..6
  ctx.save()
  ctx.beginPath()
  const dorsalWave = Math.sin(state.koi.tailPhase - 1.4) * unit * 0.0045 * motionAmp
  ctx.moveTo(pts[2]!.x, pts[2]!.y)
  for (let i = 3; i <= 6; i++) {
    const p = pts[i]!
    const nm = normals[i]!
    const off = (dorsalWave + turnBank * unit * 0.007) * ((i - 2) / 4)
    ctx.lineTo(p.x + nm.x * off, p.y + nm.y * off)
  }
  ctx.strokeStyle = 'rgba(255, 217, 160, 0.36)'
  ctx.lineWidth = Math.max(1.2, unit * 0.0038)
  ctx.lineCap = 'round'
  ctx.stroke()

  // Subtle eyes near snout sides
  const head = pts[0]!
  const neck = pts[1]!
  const hx = head.x - neck.x
  const hy = head.y - neck.y
  const hl = Math.hypot(hx, hy) || 1
  const hdx = hx / hl
  const hdy = hy / hl
  const eyeR = Math.max(1.2, unit * 0.0029)
  for (const side of [-1, 1] as const) {
    const ex = head.x + hdx * unit * 0.003 + normals[0]!.x * BODY_WIDTHS[0]! * unit * 0.72 * side
    const ey = head.y + hdy * unit * 0.003 + normals[0]!.y * BODY_WIDTHS[0]! * unit * 0.72 * side
    ctx.fillStyle = color.night2
    ctx.beginPath()
    ctx.arc(ex, ey, eyeR, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 217, 160, 0.55)'
    ctx.beginPath()
    ctx.arc(ex + hdx * eyeR * 0.25, ey + hdy * eyeR * 0.25, eyeR * 0.36, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // 7. Concentric water ripples on the surface
  for (const r of state.ripples) {
    const t = Math.max(0, Math.min(1, r.ageMs / r.durationMs))
    const ease = 1 - Math.pow(1 - t, 2.2)
    const fadeIn = Math.min(1, t / 0.09)
    const fadeOut = Math.pow(1 - t, 1.7)
    const baseAlpha = fadeIn * fadeOut * (r.kind === 'gather' ? 0.52 : r.kind === 'tap' ? 0.4 : 0.16)
    if (baseAlpha <= 0.005) continue

    const rx = r.x * w
    const ry = r.y * h
    const outerRadius = (r.startRadius + (r.maxRadius - r.startRadius) * ease) * unit
    const rgb = MOTE_RGB[r.color]

    // Soft warm bloom on gather ripples
    if (r.kind === 'gather' && t < 0.65) {
      const bloomAlpha = (1 - t / 0.65) * 0.2
      const bloom = ctx.createRadialGradient(rx, ry, 0, rx, ry, outerRadius * 0.75)
      bloom.addColorStop(0, rgba(rgb, bloomAlpha))
      bloom.addColorStop(1, rgba(rgb, 0))
      ctx.fillStyle = bloom
      ctx.beginPath()
      ctx.arc(rx, ry, outerRadius * 0.75, 0, Math.PI * 2)
      ctx.fill()
    }

    // Layered concentric hairline rings
    const rings = r.kind === 'tail' ? 1 : r.kind === 'gather' ? 3 : 2
    for (let ring = 0; ring < rings; ring++) {
      const ringRadius = outerRadius * (1 - ring * 0.26)
      if (ringRadius <= 1) continue
      const ringAlpha = baseAlpha * (1 - ring * 0.3)
      ctx.beginPath()
      ctx.arc(rx, ry, ringRadius, 0, Math.PI * 2)
      ctx.strokeStyle = rgba(rgb, ringAlpha)
      ctx.lineWidth = Math.max(0.75, (r.kind === 'gather' ? 1.45 : 1.05) - ring * 0.25)
      ctx.stroke()
    }
  }

  // 8. Glowing lantern-motes drifting on the water
  for (const m of state.motes) {
    if (m.fadeIn <= 0.01) continue
    const mx = m.x * w
    const my = m.y * h
    const pulse = 0.88 + 0.12 * Math.sin(m.phase * 1.55) * motionAmp
    const alpha = m.fadeIn * pulse
    const coreR = m.radius * unit * (0.9 + 0.1 * pulse)
    const glowR = coreR * 4.8
    const rgb = MOTE_RGB[m.color]

    // Soft radial candlelight glow
    const halo = ctx.createRadialGradient(mx, my, coreR * 0.2, mx, my, glowR)
    halo.addColorStop(0, rgba(MOTE_RGB.candle, 0.36 * alpha))
    halo.addColorStop(0.32, rgba(rgb, 0.22 * alpha))
    halo.addColorStop(0.7, rgba(rgb, 0.06 * alpha))
    halo.addColorStop(1, rgba(rgb, 0))
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(mx, my, glowR, 0, Math.PI * 2)
    ctx.fill()

    // Subtle surface meniscus ring
    ctx.beginPath()
    ctx.arc(mx, my, coreR * 1.65, 0, Math.PI * 2)
    ctx.strokeStyle = rgba(rgb, 0.18 * alpha)
    ctx.lineWidth = 0.8
    ctx.stroke()

    // Lit ember core
    const coreGrad = ctx.createRadialGradient(mx - coreR * 0.2, my - coreR * 0.25, 0, mx, my, coreR)
    coreGrad.addColorStop(0, rgba(MOTE_RGB.candle, 0.96 * alpha))
    coreGrad.addColorStop(0.55, rgba(rgb, 0.92 * alpha))
    coreGrad.addColorStop(1, rgba(rgb, 0.35 * alpha))
    ctx.fillStyle = coreGrad
    ctx.beginPath()
    ctx.arc(mx, my, coreR, 0, Math.PI * 2)
    ctx.fill()
  }

  // 9. Quiet dark-umber floating lily / ember leaves at the pond margins
  for (const leaf of state.leaves) {
    const lx = leaf.x * w
    const ly = leaf.y * h
    const lr = leaf.radius * unit

    ctx.save()
    ctx.translate(lx, ly)
    ctx.rotate(leaf.angle)

    // Soft water depth shadow beneath leaf
    ctx.save()
    ctx.translate(unit * 0.008, unit * 0.012)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, lr, leaf.notch, Math.PI * 2 - leaf.notch)
    ctx.closePath()
    ctx.fillStyle = 'rgba(4, 2, 1, 0.5)'
    ctx.fill()
    ctx.restore()

    // Dark-umber / warm-peat leaf body
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, lr, leaf.notch, Math.PI * 2 - leaf.notch)
    ctx.closePath()
    const leafGrad = ctx.createRadialGradient(-lr * 0.18, -lr * 0.2, lr * 0.08, 0, 0, lr)
    leafGrad.addColorStop(0, '#2A1B13')
    leafGrad.addColorStop(0.65, '#1D120C')
    leafGrad.addColorStop(1, '#140B07')
    ctx.fillStyle = leafGrad
    ctx.fill()

    // Whisper-soft top rim & radial veins
    ctx.strokeStyle = 'rgba(138, 110, 91, 0.18)'
    ctx.lineWidth = 0.9
    ctx.stroke()

    ctx.strokeStyle = 'rgba(188, 155, 129, 0.075)'
    ctx.lineWidth = 0.7
    for (let v = 0; v < 5; v++) {
      const va = leaf.notch + 0.55 + (v / 4) * (Math.PI * 2 - leaf.notch * 2 - 1.1)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(va) * lr * 0.78, Math.sin(va) * lr * 0.78)
      ctx.stroke()
    }
    ctx.restore()
  }

  // 10. Whisper-quiet touch beacon while pointer is held on the water
  if (pointerPos) {
    const px = pointerPos.x * w
    const py = pointerPos.y * h
    const beaconR = unit * 0.022
    ctx.save()
    ctx.beginPath()
    ctx.arc(px, py, beaconR, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 217, 160, 0.24)'
    ctx.lineWidth = 1
    ctx.stroke()

    const dot = ctx.createRadialGradient(px, py, 0, px, py, beaconR * 0.65)
    dot.addColorStop(0, 'rgba(255, 217, 160, 0.3)')
    dot.addColorStop(1, 'rgba(255, 180, 94, 0)')
    ctx.fillStyle = dot
    ctx.beginPath()
    ctx.arc(px, py, beaconR * 0.65, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

export default function PondScreen({ onExit }: GameScreenProps) {
  const calm = useCalm()
  const { cue, haptic } = useFeedback()
  const reduceMotion = useReducedMotion() ?? false
  const [saved, setSaved] = useGameSave<PondSave>('pond', DEFAULT_SAVE)

  const initialStateRef = useRef<PondState | null>(null)
  if (initialStateRef.current === null) {
    initialStateRef.current = isValidPondState(saved.state)
      ? saved.state
      : createPond({ seed: Date.now() >>> 0, calm })
  }

  const stateRef = useRef<PondState>(initialStateRef.current)
  const [gathered, setGathered] = useState<number>(() => initialStateRef.current!.gathered)
  const [paused, setPaused] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 320, h: 420, dpr: 1 })
  const activePointerIdRef = useRef<number | null>(null)
  const pointerPosRef = useRef<Vec2 | null>(null)
  const lastDragRippleMsRef = useRef<number>(0)
  const prevGatherIdRef = useRef<number>(stateRef.current.gatherEventId)
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const reducedMotionRef = useRef(reduceMotion)
  reducedMotionRef.current = reduceMotion

  const persist = useCallback(
    (nextState: PondState, incrementPlays = false) => {
      setSaved((prev) => ({
        state: nextState,
        totalGathered: Math.max(prev.totalGathered, nextState.gathered),
        plays: incrementPlays ? prev.plays + 1 : prev.plays,
      }))
    },
    [setSaved],
  )

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w, h, dpr } = sizeRef.current
    if (w <= 0 || h <= 0) return
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawPond(ctx, stateRef.current, w, h, pointerPosRef.current, reducedMotionRef.current)
    ctx.restore()
  }, [])

  // Keep canvas crisp at native DPR whenever the stage resizes
  useEffect(() => {
    const container = frameRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect.width))
      const h = Math.max(1, Math.round(rect.height))
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
      sizeRef.current = { w, h, dpr }
      const targetW = Math.round(w * dpr)
      const targetH = Math.round(h * dpr)
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW
        canvas.height = targetH
      }
      renderCanvas()
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    return () => ro.disconnect()
  }, [renderCanvas])

  // Real-time simulation & canvas render loop
  useGameLoop(
    useCallback(
      (dtMs: number) => {
        const effectiveDt = reducedMotionRef.current ? dtMs * 0.6 : dtMs
        const next = tickPond(stateRef.current, effectiveDt, calm)
        stateRef.current = next

        if (next.gatherEventId > prevGatherIdRef.current) {
          prevGatherIdRef.current = next.gatherEventId
          setGathered(next.gathered)
          if (next.gathered % 5 === 0) {
            cue('chime', 0.65)
          } else {
            cue('clear', 0.55)
          }
          haptic('light')
          persist(next)
        }

        renderCanvas()
      },
      [calm, cue, haptic, persist, renderCanvas],
    ),
    !paused,
  )

  // Save quietly when pausing or unmounting
  const handlePauseChange = useCallback(
    (nextPaused: boolean) => {
      if (nextPaused) {
        activePointerIdRef.current = null
        pointerPosRef.current = null
        persist(stateRef.current)
      }
      setPaused(nextPaused)
    },
    [persist],
  )

  const handleRestart = useCallback(() => {
    const fresh = createPond({ seed: Date.now() >>> 0, calm })
    stateRef.current = fresh
    prevGatherIdRef.current = 0
    pointerPosRef.current = null
    setGathered(0)
    persist(fresh, true)
    renderCanvas()
  }, [calm, persist, renderCanvas])

  const handleExit = useCallback(() => {
    persist(stateRef.current)
    onExit()
  }, [persist, onExit])

  // Map client pointer coordinates into normalised 0..1 pond coordinates
  const toNorm = useCallback((clientX: number, clientY: number): Vec2 => {
    const el = frameRef.current
    if (!el) return { x: 0.5, y: 0.5 }
    const r = el.getBoundingClientRect()
    const x = Math.max(0.04, Math.min(0.96, (clientX - r.left) / Math.max(1, r.width)))
    const y = Math.max(0.04, Math.min(0.96, (clientY - r.top) / Math.max(1, r.height)))
    return { x, y }
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (pausedRef.current || activePointerIdRef.current !== null) return
      activePointerIdRef.current = e.pointerId
      e.currentTarget.setPointerCapture(e.pointerId)
      const pt = toNorm(e.clientX, e.clientY)
      pointerPosRef.current = pt
      lastDragRippleMsRef.current = performance.now()
      stateRef.current = tapPond(stateRef.current, pt.x, pt.y)
      cue('tap', 0.35)
      renderCanvas()
    },
    [cue, renderCanvas, toNorm],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (pausedRef.current || e.pointerId !== activePointerIdRef.current) return
      const pt = toNorm(e.clientX, e.clientY)
      const prevPt = pointerPosRef.current
      pointerPosRef.current = pt
      const now = performance.now()
      const movedFar = prevPt ? Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y) > 0.08 : false
      if (movedFar && now - lastDragRippleMsRef.current > 360) {
        lastDragRippleMsRef.current = now
        stateRef.current = tapPond(stateRef.current, pt.x, pt.y)
      } else {
        stateRef.current = setTarget(stateRef.current, pt.x, pt.y)
      }
    },
    [toNorm],
  )

  const endPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== activePointerIdRef.current) return
    activePointerIdRef.current = null
    pointerPosRef.current = null
  }, [])

  // Desktop keyboard nudging (Arrow / WASD moves target smoothly)
  const nudgeTarget = useCallback(
    (dx: number, dy: number) => {
      if (pausedRef.current) return
      const s = stateRef.current
      const base = s.target ?? s.koi.spine[0]!
      const nx = Math.max(0.06, Math.min(0.94, base.x + dx))
      const ny = Math.max(0.06, Math.min(0.94, base.y + dy))
      stateRef.current = setTarget(s, nx, ny)
    },
    [],
  )

  const keyboardRipple = useCallback(() => {
    if (pausedRef.current) return
    const s = stateRef.current
    const pt = s.target ?? s.koi.spine[0]!
    stateRef.current = tapPond(s, pt.x, pt.y)
    cue('tap', 0.35)
  }, [cue])

  useKeys(
    {
      ArrowLeft: () => nudgeTarget(-0.075, 0),
      a: () => nudgeTarget(-0.075, 0),
      A: () => nudgeTarget(-0.075, 0),
      ArrowRight: () => nudgeTarget(0.075, 0),
      d: () => nudgeTarget(0.075, 0),
      D: () => nudgeTarget(0.075, 0),
      ArrowUp: () => nudgeTarget(0, -0.075),
      w: () => nudgeTarget(0, -0.075),
      W: () => nudgeTarget(0, -0.075),
      ArrowDown: () => nudgeTarget(0, 0.075),
      s: () => nudgeTarget(0, 0.075),
      S: () => nudgeTarget(0, 0.075),
    },
    !paused,
    true,
  )

  useKeys(
    {
      Space: keyboardRipple,
      ' ': keyboardRipple,
      Enter: keyboardRipple,
      p: () => handlePauseChange(true),
      P: () => handlePauseChange(true),
      Escape: () => handlePauseChange(true),
    },
    !paused,
    false,
  )

  useKeys(
    {
      p: () => handlePauseChange(false),
      P: () => handlePauseChange(false),
    },
    paused,
    false,
  )

  return (
    <GameShell
      gameId="pond"
      stats={[{ label: 'Gathered', value: gathered }]}
      paused={paused}
      onPauseChange={handlePauseChange}
      onRestart={handleRestart}
      onExit={handleExit}
      howTo={
        <>
          <p>Touch or drag across the dark water to guide the koi toward the warm lantern-motes.</p>
          <p>Lift your finger and watch it glide on its own. There is no timer and no rush.</p>
          <p>During a wind-down session, the pond slows gradually with the sunset.</p>
        </>
      }
      controls={<p className="pond-caption t-caption">Touch the water to guide the koi</p>}
    >
      <div ref={frameRef} className="pond-frame">
        <canvas
          ref={canvasRef}
          className="pond-canvas"
          role="application"
          aria-label="Koi pond — touch or drag to guide the fish"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        />
        <div className="pond-vignette" aria-hidden />
      </div>
    </GameShell>
  )
}
