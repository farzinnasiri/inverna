import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path } from 'react-native-svg'
import {
  createPond,
  setTarget,
  SPINE_SEGMENTS,
  SPINE_SPACING,
  tapPond,
  tickPond,
  type PondState,
  type Vec2,
} from '@/core/games/pond/engine'
import { radius } from '@/design/tokens'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { useCalm, useFeedback, useGameLoop, useGameSave, useKeys, useReducedMotion } from '@/ui/rn/hooks'

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

/** Organic half-width profile along the 10-segment koi spine (normalised to pond min-dim). */
const BODY_WIDTHS = [0.0155, 0.0235, 0.0245, 0.022, 0.018, 0.0138, 0.01, 0.0068, 0.0046, 0.003] as const

const RAD_TO_DEG = 180 / Math.PI
const KOI_CLIP_ID = 'pond-koi-body-clip'

const HOW_TO = [
  'Touch or drag across the dark water to guide the koi toward the light motes.',
  'Lift your finger and watch it glide on its own. There is no timer and no rush.',
  'During a wind-down session, the pond slows gradually as bedtime approaches.',
] as const

const f = (n: number): string => n.toFixed(2)

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
 * Project the normalised spine into pixel space while keeping every segment
 * at a uniform pixel length so the koi never stretches across aspect ratios.
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

function buildBodyPathD(pts: readonly Vec2[], normals: readonly Vec2[], unit: number): string {
  const n = pts.length
  const left: Vec2[] = new Array(n)
  const right: Vec2[] = new Array(n)

  for (let i = 0; i < n; i++) {
    const p = pts[i]!
    const nm = normals[i]!
    const hw = (BODY_WIDTHS[i] ?? 0.003) * unit
    left[i] = { x: p.x + nm.x * hw, y: p.y + nm.y * hw }
    right[i] = { x: p.x - nm.x * hw, y: p.y - nm.y * hw }
  }

  const head = pts[0]!
  const neck = pts[1]!
  const fx = head.x - neck.x
  const fy = head.y - neck.y
  const fl = Math.hypot(fx, fy) || 1
  const dirX = fx / fl
  const dirY = fy / fl
  const snoutLen = BODY_WIDTHS[0]! * unit * 1.38
  const snoutTipX = head.x + dirX * snoutLen
  const snoutTipY = head.y + dirY * snoutLen

  const parts: string[] = [`M ${f(left[0]!.x)} ${f(left[0]!.y)}`]

  // Left flank from head to tail
  for (let i = 1; i < n - 1; i++) {
    const curr = left[i]!
    const next = left[i + 1]!
    parts.push(`Q ${f(curr.x)} ${f(curr.y)} ${f((curr.x + next.x) * 0.5)} ${f((curr.y + next.y) * 0.5)}`)
  }
  parts.push(`L ${f(left[n - 1]!.x)} ${f(left[n - 1]!.y)}`)

  // Tail peduncle cap
  const tail = pts[n - 1]!
  parts.push(`Q ${f(tail.x)} ${f(tail.y)} ${f(right[n - 1]!.x)} ${f(right[n - 1]!.y)}`)

  // Right flank from tail back to head
  for (let i = n - 2; i >= 1; i--) {
    const curr = right[i]!
    const prev = right[i - 1]!
    parts.push(`Q ${f(curr.x)} ${f(curr.y)} ${f((curr.x + prev.x) * 0.5)} ${f((curr.y + prev.y) * 0.5)}`)
  }
  parts.push(`L ${f(right[0]!.x)} ${f(right[0]!.y)}`)

  // Rounded koi snout
  const snoutCtrlRX = right[0]!.x + dirX * snoutLen * 0.72
  const snoutCtrlRY = right[0]!.y + dirY * snoutLen * 0.72
  const snoutCtrlLX = left[0]!.x + dirX * snoutLen * 0.72
  const snoutCtrlLY = left[0]!.y + dirY * snoutLen * 0.72
  parts.push(`Q ${f(snoutCtrlRX)} ${f(snoutCtrlRY)} ${f(snoutTipX)} ${f(snoutTipY)}`)
  parts.push(`Q ${f(snoutCtrlLX)} ${f(snoutCtrlLY)} ${f(left[0]!.x)} ${f(left[0]!.y)} Z`)

  return parts.join(' ')
}

function buildFinPaths(scale: number, side: 1 | -1): { body: string; rays: string } {
  const s = side * scale
  const body = [
    'M 0 0',
    `C ${f(scale * 0.34)} ${f(s * 0.52)} ${f(-scale * 0.25)} ${f(s * 1.05)} ${f(-scale * 0.92)} ${f(s * 0.62)}`,
    `Q ${f(-scale * 0.58)} ${f(s * 0.14)} ${f(-scale * 0.22)} 0 Z`,
  ].join(' ')

  const rayParts: string[] = []
  for (let r = 0; r < 3; r++) {
    const t = 0.25 + r * 0.26
    rayParts.push(
      `M ${f(-scale * 0.06)} ${f(s * 0.04)} Q ${f(-scale * (0.12 + t * 0.2))} ${f(s * (0.45 + t * 0.15))} ${f(-scale * (0.35 + t * 0.45))} ${f(s * (0.72 - t * 0.14))}`,
    )
  }

  return { body, rays: rayParts.join(' ') }
}

function buildTailPaths(unit: number, sway: number): { body: string; rays: string } {
  const len = unit * 0.072
  const spread = unit * 0.036
  const swayOffset = sway * unit * 0.018

  const body = [
    `M 0 ${f(-unit * 0.0028)}`,
    `C ${f(len * 0.35)} ${f(-spread * 0.55 + swayOffset * 0.35)} ${f(len * 0.78)} ${f(-spread * 1.15 + swayOffset * 0.85)} ${f(len * 1.05)} ${f(-spread * 0.78 + swayOffset)}`,
    `Q ${f(len * 0.62)} ${f(swayOffset * 0.55)} ${f(len * 0.46)} ${f(swayOffset * 0.42)}`,
    `Q ${f(len * 0.62)} ${f(swayOffset * 0.55)} ${f(len * 1.05)} ${f(spread * 0.78 + swayOffset)}`,
    `C ${f(len * 0.78)} ${f(spread * 1.15 + swayOffset * 0.85)} ${f(len * 0.35)} ${f(spread * 0.55 + swayOffset * 0.35)} 0 ${f(unit * 0.0028)} Z`,
  ].join(' ')

  const rays = [
    `M 0 0 Q ${f(len * 0.48)} ${f(-spread * 0.38 + swayOffset * 0.45)} ${f(len * 0.9)} ${f(-spread * 0.64 + swayOffset * 0.9)}`,
    `M 0 0 Q ${f(len * 0.48)} ${f(spread * 0.38 + swayOffset * 0.45)} ${f(len * 0.9)} ${f(spread * 0.64 + swayOffset * 0.9)}`,
  ].join(' ')

  return { body, rays }
}

function buildLeafPaths(lr: number, notch: number): { body: string; veins: string } {
  const a0 = notch
  const a1 = Math.PI * 2 - notch
  const x0 = Math.cos(a0) * lr
  const y0 = Math.sin(a0) * lr
  const x1 = Math.cos(a1) * lr
  const y1 = Math.sin(a1) * lr
  const body = `M 0 0 L ${f(x0)} ${f(y0)} A ${f(lr)} ${f(lr)} 0 1 1 ${f(x1)} ${f(y1)} Z`

  const veinParts: string[] = []
  for (let v = 0; v < 5; v++) {
    const va = notch + 0.55 + (v / 4) * (Math.PI * 2 - notch * 2 - 1.1)
    veinParts.push(`M 0 0 L ${f(Math.cos(va) * lr * 0.78)} ${f(Math.sin(va) * lr * 0.78)}`)
  }

  return { body, veins: veinParts.join(' ') }
}

export function PondScreen({ onExit }: GameScreenProps) {
  const tokens = useTokenColors()
  const { color, pieces } = tokens
  const calm = useCalm()
  const reducedMotion = useReducedMotion()
  const { cue, haptic } = useFeedback()
  const [saved, setSaved] = useGameSave<PondSave>('pond', DEFAULT_SAVE)

  const initialStateRef = useRef<PondState | null>(null)
  if (initialStateRef.current === null) {
    initialStateRef.current = isValidPondState(saved.state)
      ? saved.state
      : createPond({ seed: Date.now() >>> 0, calm })
  }

  const stateRef = useRef<PondState>(initialStateRef.current)
  const [pondState, setPondState] = useState<PondState>(initialStateRef.current)
  const [paused, setPaused] = useState(false)
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 320, h: 420 })

  const sizeRef = useRef(stageSize)
  sizeRef.current = stageSize
  const touchOriginRef = useRef<Vec2 | null>(null)
  const pointerPosRef = useRef<Vec2 | null>(null)
  const lastDragRippleMsRef = useRef<number>(0)
  const prevGatherIdRef = useRef<number>(stateRef.current.gatherEventId)
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion

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

  const persistRef = useRef(persist)
  persistRef.current = persist
  const cueRef = useRef(cue)
  cueRef.current = cue
  const hapticRef = useRef(haptic)
  hapticRef.current = haptic

  // Persist quietly on unmount
  useEffect(() => {
    return () => {
      persistRef.current(stateRef.current)
    }
  }, [])

  // 60fps simulation & SVG render loop
  useGameLoop(
    useCallback(
      (dtMs: number) => {
        const effectiveDt = reducedMotionRef.current ? dtMs * 0.6 : dtMs
        const next = tickPond(stateRef.current, effectiveDt, calm)
        stateRef.current = next

        if (next.gatherEventId > prevGatherIdRef.current) {
          prevGatherIdRef.current = next.gatherEventId
          if (next.gathered % 5 === 0) {
            cue('chime', 0.65)
          } else {
            cue('clear', 0.55)
          }
          haptic('light')
          persist(next)
        }

        setPondState(next)
      },
      [calm, cue, haptic, persist],
    ),
    !paused,
  )

  const handlePauseChange = useCallback(
    (nextPaused: boolean) => {
      if (nextPaused) {
        touchOriginRef.current = null
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
    touchOriginRef.current = null
    pointerPosRef.current = null
    setPondState(fresh)
    persist(fresh, true)
  }, [calm, persist])

  const handleExit = useCallback(() => {
    persist(stateRef.current)
    onExit()
  }, [persist, onExit])

  /* --- Touch ripple & gentle koi attraction via PanResponder -------------- */

  const toNorm = (x: number, y: number): Vec2 => {
    const { w, h } = sizeRef.current
    return {
      x: Math.max(0.04, Math.min(0.96, x / Math.max(1, w))),
      y: Math.max(0.04, Math.min(0.96, y / Math.max(1, h))),
    }
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !pausedRef.current,
      onMoveShouldSetPanResponder: () => !pausedRef.current,
      onPanResponderGrant: (e) => {
        if (pausedRef.current) return
        const lx = e.nativeEvent.locationX
        const ly = e.nativeEvent.locationY
        touchOriginRef.current = { x: lx, y: ly }
        const pt = toNorm(lx, ly)
        pointerPosRef.current = pt
        lastDragRippleMsRef.current = Date.now()
        stateRef.current = tapPond(stateRef.current, pt.x, pt.y)
        setPondState(stateRef.current)
        cueRef.current('tap', 0.35)
        hapticRef.current('light')
      },
      onPanResponderMove: (_, g) => {
        if (pausedRef.current || !touchOriginRef.current) return
        const pt = toNorm(touchOriginRef.current.x + g.dx, touchOriginRef.current.y + g.dy)
        const prevPt = pointerPosRef.current
        pointerPosRef.current = pt
        const now = Date.now()
        const movedFar = prevPt ? Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y) > 0.08 : false
        if (movedFar && now - lastDragRippleMsRef.current > 360) {
          lastDragRippleMsRef.current = now
          stateRef.current = tapPond(stateRef.current, pt.x, pt.y)
        } else {
          stateRef.current = setTarget(stateRef.current, pt.x, pt.y)
        }
      },
      onPanResponderRelease: () => {
        touchOriginRef.current = null
        pointerPosRef.current = null
      },
      onPanResponderTerminate: () => {
        touchOriginRef.current = null
        pointerPosRef.current = null
      },
    }),
  ).current

  /* --- Desktop Web keyboard nudging --------------------------------------- */

  const nudgeTarget = useCallback((dx: number, dy: number) => {
    if (pausedRef.current) return
    const s = stateRef.current
    const base = s.target ?? s.koi.spine[0]!
    const nx = Math.max(0.06, Math.min(0.94, base.x + dx))
    const ny = Math.max(0.06, Math.min(0.94, base.y + dy))
    stateRef.current = setTarget(s, nx, ny)
  }, [])

  const keyboardRipple = useCallback(() => {
    if (pausedRef.current) return
    const s = stateRef.current
    const pt = s.target ?? s.koi.spine[0]!
    stateRef.current = tapPond(s, pt.x, pt.y)
    setPondState(stateRef.current)
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

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width > 0 && height > 0) {
      setStageSize((prev) =>
        Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1
          ? prev
          : { w: Math.round(width), h: Math.round(height) },
      )
    }
  }, [])

  /* --- Compute SVG geometry for current frame ----------------------------- */

  const { w, h } = stageSize
  const unit = Math.min(w, h)
  const motionAmp = reducedMotion ? 0.45 : 1

  const pts = projectSpineToPixels(pondState.koi.spine, w, h, unit)
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
  const pelvAngle = Math.atan2(pts[4]!.y - pts[6]!.y, pts[4]!.x - pts[6]!.x)
  const tailAngle = Math.atan2(pts[n - 1]!.y - pts[n - 3]!.y, pts[n - 1]!.x - pts[n - 3]!.x)
  const tailSway = Math.sin(pondState.koi.tailPhase - 3.6) * motionAmp
  const finFlutter = Math.sin(pondState.koi.tailPhase * 0.55) * motionAmp
  const turnBank = Math.max(-0.45, Math.min(0.45, pondState.koi.turnRate * 0.22))

  // Wake paths behind the koi
  const wakeAlpha = Math.min(0.22, pondState.koi.speed * 0.72)
  const wakePaths: string[] = []
  if (wakeAlpha > 0.015) {
    for (const side of [-1, 1] as const) {
      const segs: string[] = []
      for (let i = 2; i < n; i++) {
        const p = pts[i]!
        const nm = normals[i]!
        const spread = (BODY_WIDTHS[i]! * 1.45 + (i - 2) * 0.0045) * unit
        const wx = p.x + nm.x * spread * side
        const wy = p.y + nm.y * spread * side
        segs.push(`${i === 2 ? 'M' : 'L'} ${f(wx)} ${f(wy)}`)
      }
      wakePaths.push(segs.join(' '))
    }
  }

  // Fin anchors & paths
  const pecL = {
    x: pts[2]!.x + normals[2]!.x * BODY_WIDTHS[2]! * unit * 0.58,
    y: pts[2]!.y + normals[2]!.y * BODY_WIDTHS[2]! * unit * 0.58,
    deg: (shoulderAngle + (0.68 + (finFlutter - turnBank) * 0.12)) * RAD_TO_DEG,
  }
  const pecR = {
    x: pts[2]!.x - normals[2]!.x * BODY_WIDTHS[2]! * unit * 0.58,
    y: pts[2]!.y - normals[2]!.y * BODY_WIDTHS[2]! * unit * 0.58,
    deg: (shoulderAngle - (0.68 + (-finFlutter + turnBank) * 0.12)) * RAD_TO_DEG,
  }
  const pecScale = unit * 0.045
  const pecPathsL = buildFinPaths(pecScale, 1)
  const pecPathsR = buildFinPaths(pecScale, -1)

  const pelvL = {
    x: pts[5]!.x + normals[5]!.x * BODY_WIDTHS[5]! * unit * 0.6,
    y: pts[5]!.y + normals[5]!.y * BODY_WIDTHS[5]! * unit * 0.6,
    deg: (pelvAngle + (0.68 + finFlutter * 0.6 * 0.12)) * RAD_TO_DEG,
  }
  const pelvR = {
    x: pts[5]!.x - normals[5]!.x * BODY_WIDTHS[5]! * unit * 0.6,
    y: pts[5]!.y - normals[5]!.y * BODY_WIDTHS[5]! * unit * 0.6,
    deg: (pelvAngle - (0.68 - finFlutter * 0.6 * 0.12)) * RAD_TO_DEG,
  }
  const pelvScale = unit * 0.024
  const pelvPathsL = buildFinPaths(pelvScale, 1)
  const pelvPathsR = buildFinPaths(pelvScale, -1)

  const tailAnchor = pts[n - 1]!
  const tailPaths = buildTailPaths(unit, tailSway)

  // Koi body silhouette & Showa/Kohaku markings
  const bodyD = buildBodyPathD(pts, normals, unit)
  const patches = [
    { idx: 1, offsetN: -0.2, rx: 0.022, ry: 0.015, fill: pieces.ochre },
    { idx: 2, offsetN: 0.34, rx: 0.019, ry: 0.013, fill: pieces.clay },
    { idx: 3, offsetN: -0.14, rx: 0.027, ry: 0.016, fill: pieces.ochre },
    { idx: 5, offsetN: 0.24, rx: 0.018, ry: 0.011, fill: pieces.clay },
    { idx: 6, offsetN: -0.12, rx: 0.016, ry: 0.0095, fill: pieces.ochre },
  ] as const

  // Dorsal ridge along joints 2..6
  const dorsalWave = Math.sin(pondState.koi.tailPhase - 1.4) * unit * 0.0045 * motionAmp
  const dorsalSegs = [`M ${f(pts[2]!.x)} ${f(pts[2]!.y)}`]
  for (let i = 3; i <= 6; i++) {
    const p = pts[i]!
    const nm = normals[i]!
    const off = (dorsalWave + turnBank * unit * 0.007) * ((i - 2) / 4)
    dorsalSegs.push(`L ${f(p.x + nm.x * off)} ${f(p.y + nm.y * off)}`)
  }
  const dorsalD = dorsalSegs.join(' ')

  // Obsidian eyes near snout sides
  const head = pts[0]!
  const neck = pts[1]!
  const hx = head.x - neck.x
  const hy = head.y - neck.y
  const hl = Math.hypot(hx, hy) || 1
  const hdx = hx / hl
  const hdy = hy / hl
  const eyeR = Math.max(1.2, unit * 0.0028)
  const eyes = ([-1, 1] as const).map((side) => ({
    side,
    cx: head.x + hdx * unit * 0.003 + normals[0]!.x * BODY_WIDTHS[0]! * unit * 0.72 * side,
    cy: head.y + hdy * unit * 0.003 + normals[0]!.y * BODY_WIDTHS[0]! * unit * 0.72 * side,
  }))

  const pointerPos = pointerPosRef.current

  return (
    <GameShell
      gameId="pond"
      score={pondState.gathered}
      stats={[{ label: 'Gathered', value: pondState.gathered }]}
      paused={paused}
      onPauseChange={handlePauseChange}
      onRestart={handleRestart}
      onExit={handleExit}
      howTo={HOW_TO}
      controls={
        <Text style={[styles.caption, { color: color.ink3 }]}>Touch to guide</Text>
      }
    >
      <View
        {...panResponder.panHandlers}
        onLayout={handleLayout}
        accessibilityLabel="Koi pond — touch or drag to guide the fish"
        style={[
          styles.frame,
          {
            backgroundColor: color.bg,
            borderColor: color.line,
          },
        ]}
      >
        <Svg pointerEvents="none" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Defs>
            <ClipPath id={KOI_CLIP_ID}>
              <Path d={bodyD} />
            </ClipPath>
          </Defs>

          {/* 1. Quiet nocturnal wake lines behind the koi */}
          {wakePaths.map((d, i) => (
            <Path
              key={`wake-${i}`}
              d={d}
              fill="none"
              stroke={pieces.clay}
              strokeOpacity={wakeAlpha}
              strokeWidth={Math.max(0.8, unit * 0.002)}
              strokeLinecap="round"
            />
          ))}

          {/* 2. Translucent Moon Ivory pectoral & pelvic fins */}
          <G x={pecL.x} y={pecL.y} rotation={pecL.deg}>
            <Path d={pecPathsL.body} fill={pieces.bone} fillOpacity={0.24} />
            <Path
              d={pecPathsL.rays}
              fill="none"
              stroke={pieces.bone}
              strokeOpacity={0.14}
              strokeWidth={Math.max(0.6, pecScale * 0.024)}
            />
          </G>
          <G x={pecR.x} y={pecR.y} rotation={pecR.deg}>
            <Path d={pecPathsR.body} fill={pieces.bone} fillOpacity={0.24} />
            <Path
              d={pecPathsR.rays}
              fill="none"
              stroke={pieces.bone}
              strokeOpacity={0.14}
              strokeWidth={Math.max(0.6, pecScale * 0.024)}
            />
          </G>
          <G x={pelvL.x} y={pelvL.y} rotation={pelvL.deg}>
            <Path d={pelvPathsL.body} fill={pieces.bone} fillOpacity={0.24} />
            <Path
              d={pelvPathsL.rays}
              fill="none"
              stroke={pieces.bone}
              strokeOpacity={0.14}
              strokeWidth={Math.max(0.6, pelvScale * 0.024)}
            />
          </G>
          <G x={pelvR.x} y={pelvR.y} rotation={pelvR.deg}>
            <Path d={pelvPathsR.body} fill={pieces.bone} fillOpacity={0.24} />
            <Path
              d={pelvPathsR.rays}
              fill="none"
              stroke={pieces.bone}
              strokeOpacity={0.14}
              strokeWidth={Math.max(0.6, pelvScale * 0.024)}
            />
          </G>

          {/* 3. Forked flowing tail fin */}
          <G x={tailAnchor.x} y={tailAnchor.y} rotation={tailAngle * RAD_TO_DEG}>
            <Path d={tailPaths.body} fill={pieces.bone} fillOpacity={0.32} />
            <Path
              d={tailPaths.rays}
              fill="none"
              stroke={pieces.bone}
              strokeOpacity={0.15}
              strokeWidth={Math.max(0.6, unit * 0.0016)}
            />
          </G>

          {/* 4. Moon Ivory koi body with Antique Brass & Deep Navy Slate markings */}
          <Path d={bodyD} fill={pieces.bone} />
          <G clipPath={`url(#${KOI_CLIP_ID})`}>
            {patches.map((patch, i) => {
              const p = pts[patch.idx]!
              const prev = pts[Math.max(0, patch.idx - 1)]!
              const nm = normals[patch.idx]!
              const deg = Math.atan2(prev.y - p.y, prev.x - p.x) * RAD_TO_DEG
              const cx = p.x + nm.x * BODY_WIDTHS[patch.idx]! * unit * patch.offsetN
              const cy = p.y + nm.y * BODY_WIDTHS[patch.idx]! * unit * patch.offsetN
              return (
                <G key={`patch-${i}`} x={cx} y={cy} rotation={deg}>
                  <Ellipse cx={0} cy={0} rx={patch.rx * unit} ry={patch.ry * unit} fill={patch.fill} />
                </G>
              )
            })}
          </G>

          {/* Quiet hairline contour along the body silhouette */}
          <Path
            d={bodyD}
            fill="none"
            stroke={color.ink}
            strokeOpacity={0.08}
            strokeWidth={Math.max(1, unit * 0.0028)}
          />

          {/* Subtle dorsal ridge */}
          <Path
            d={dorsalD}
            fill="none"
            stroke={pieces.stone}
            strokeOpacity={0.36}
            strokeWidth={Math.max(1.1, unit * 0.003)}
            strokeLinecap="round"
          />

          {/* Crisp obsidian eyes */}
          {eyes.map((eye) => (
            <Circle key={`eye-${eye.side}`} cx={eye.cx} cy={eye.cy} r={eyeR} fill={color.surface1} />
          ))}

          {/* 5. Concentric hairline ripples */}
          {pondState.ripples.map((r) => {
            const t = Math.max(0, Math.min(1, r.ageMs / r.durationMs))
            const ease = 1 - Math.pow(1 - t, 2.2)
            const fadeIn = Math.min(1, t / 0.09)
            const fadeOut = Math.pow(1 - t, 1.7)
            const baseAlpha = fadeIn * fadeOut * (r.kind === 'gather' ? 0.56 : r.kind === 'tap' ? 0.44 : 0.2)
            if (baseAlpha <= 0.005) return null

            const rx = r.x * w
            const ry = r.y * h
            const outerRadius = (r.startRadius + (r.maxRadius - r.startRadius) * ease) * unit
            const ringCount = r.kind === 'tail' ? 1 : r.kind === 'gather' ? 3 : 2

            const rings = []
            for (let ring = 0; ring < ringCount; ring++) {
              const ringRadius = outerRadius * (1 - ring * 0.26)
              if (ringRadius <= 1) continue
              const ringAlpha = baseAlpha * (1 - ring * 0.28)
              const ringHex =
                r.kind === 'gather'
                  ? ring === 0
                    ? pieces.clay
                    : color.accentDim
                  : r.kind === 'tap'
                    ? pieces.clay
                    : color.ink3
              rings.push(
                <Circle
                  key={`${r.id}-${ring}`}
                  cx={rx}
                  cy={ry}
                  r={ringRadius}
                  fill="none"
                  stroke={ringHex}
                  strokeOpacity={ringAlpha}
                  strokeWidth={Math.max(0.75, (r.kind === 'gather' ? 1.15 : 0.9) - ring * 0.18)}
                />,
              )
            }
            return rings
          })}

          {/* 6. Floating lantern motes in Antique Brass & Moon Ivory */}
          {pondState.motes.map((m) => {
            if (m.fadeIn <= 0.01) return null
            const mx = m.x * w
            const my = m.y * h
            const pulse = 0.5 + 0.5 * Math.sin(m.phase * 1.55) * motionAmp
            const coreAlpha = m.fadeIn * (0.42 + 0.22 * pulse)
            const coreR = m.radius * unit * (0.92 + 0.08 * pulse)
            const isIvoryLantern = m.id % 3 === 0

            return (
              <G key={`mote-${m.id}`}>
                <Circle
                  cx={mx}
                  cy={my}
                  r={coreR * 1.95}
                  fill="none"
                  stroke={isIvoryLantern ? pieces.clay : color.accentDim}
                  strokeOpacity={0.34 * m.fadeIn}
                  strokeWidth={0.85}
                />
                <Circle
                  cx={mx}
                  cy={my}
                  r={coreR}
                  fill={isIvoryLantern ? pieces.bone : color.accent}
                  fillOpacity={coreAlpha}
                />
                <Circle
                  cx={mx}
                  cy={my}
                  r={coreR * 0.38}
                  fill={isIvoryLantern ? color.accent : pieces.bone}
                  fillOpacity={m.fadeIn * 0.62}
                />
              </G>
            )
          })}

          {/* 7. Dark slate floating stepping leaves at the margins */}
          {pondState.leaves.map((leaf) => {
            const lx = leaf.x * w
            const ly = leaf.y * h
            const lr = leaf.radius * unit
            const leafPaths = buildLeafPaths(lr, leaf.notch)
            return (
              <G key={`leaf-${leaf.id}`} x={lx} y={ly} rotation={leaf.angle * RAD_TO_DEG}>
                <Path
                  d={leafPaths.body}
                  fill={color.surface3}
                  stroke={color.line}
                  strokeWidth={0.9}
                />
                <Path
                  d={leafPaths.veins}
                  fill="none"
                  stroke={color.line}
                  strokeWidth={0.7}
                />
              </G>
            )
          })}

          {/* 8. Quiet touch beacon while finger is held on the water */}
          {pointerPos && (
            <G>
              <Circle
                cx={pointerPos.x * w}
                cy={pointerPos.y * h}
                r={unit * 0.02}
                fill="none"
                stroke={pieces.clay}
                strokeOpacity={0.45}
                strokeWidth={1}
              />
              <Circle
                cx={pointerPos.x * w}
                cy={pointerPos.y * h}
                r={unit * 0.02 * 0.28}
                fill={color.accent}
                fillOpacity={0.5}
              />
            </G>
          )}
        </Svg>
      </View>
    </GameShell>
  )
}

export default PondScreen

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    width: '100%',
    minHeight: 260,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  caption: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
})
