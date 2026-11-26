/**
 * The Mix studio's picture of the sound: one row per sound in the mix, all
 * drawn the same way, like tracks in a mixer.
 *
 * - Each row is one sound, in its fader's colour.
 * - How tall the line swings is how loud it is.
 * - How fast it wiggles is how low or high it sounds: brown noise rolls
 *   slowly, white noise is a fine fast shimmer, rain is quick and busy,
 *   waves swell. Brown, pink and white sit on one scale, slow to fast.
 * - Chords are a smooth brass line (four notes beating gently together).
 * - The pulse row is the brain rhythm it aims for, at its real rate relative
 *   to the others (slowed down to watch). Every other row swells with it a
 *   little: the pulse is woven into the whole sound.
 *
 * Steps on the shared ambient clock (30 fps) while open. Rows appear and
 * disappear with the mix; loudness changes glide.
 *
 * Default export so the web build can load it after CanvasKit is ready.
 */
import { useEffect } from 'react'
import { Canvas, Path, usePathValue, type SkPathBuilder } from '@shopify/react-native-skia'
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated'
import { useAmbientTime } from '../ambientClock'

/** Row kinds, in LAYERS order, then chords and pulse. */
export const ROW_CHORDS = 7
export const ROW_PULSE = 8
export const ROW_COUNT = 9
export const ROW_H = 30

export interface StudioScopeProps {
  width: number
  /** Which row each kind sits in (index into the visible rows), or -1 if not shown. */
  rowOf: readonly number[]
  /** Loudness per kind, 0..1 (pulse: its strength). */
  levels: readonly number[]
  /** Colour per kind (hex). */
  colors: readonly string[]
  /** Pulse rate in Hz, 0 = off. */
  pulseHz: number
  /** Playing: full light; stopped: the same picture, dimmer and still. */
  playing: boolean
  animate: boolean
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** The line's shape for one kind at x (0..1), -1..1. Slow wiggles are low sounds, fast ones high. */
function shape(k: number, u: number, t: number, pulseHz: number): number {
  'worklet'
  const TAU = Math.PI * 2
  if (k === 0) {
    // Rain: high and busy.
    return 0.6 * Math.sin(TAU * (u * 13 - t * 1.6)) + 0.4 * Math.sin(TAU * (u * 21 + t * 1.1) + 1.3)
  }
  if (k === 1) {
    // Waves: a slow swell rolling through, low inside.
    const swell = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(TAU * (u * 0.9 - t * 0.09)), 2)
    return swell * Math.sin(TAU * (u * 3.2 - t * 0.5))
  }
  if (k === 2) {
    // Fire: middling, flickering, with crackles.
    const base = 0.75 * Math.sin(TAU * (u * 6 - t * 0.9)) * (0.8 + 0.2 * Math.sin(TAU * (t * 0.7 + u * 2)))
    const crackle = Math.pow(Math.max(0, Math.sin(TAU * (u * 2.3 + t * 0.37)) * Math.sin(TAU * (u * 5.1 - t * 0.53))), 6)
    return base + 0.9 * crackle * Math.sin(TAU * u * 22)
  }
  if (k === 3) {
    // Wind: low and wandering.
    return Math.sin(TAU * (u * 1.6 - t * 0.12) + 0.8 * Math.sin(TAU * t * 0.05))
  }
  if (k === 4) return Math.sin(TAU * (u * 2 - t * 0.18)) // brown: slow, deep
  if (k === 5) return 0.7 * Math.sin(TAU * (u * 6 - t * 0.35)) + 0.3 * Math.sin(TAU * (u * 2 + t * 0.2)) // pink: even
  if (k === 6) return 0.55 * Math.sin(TAU * (u * 17 - t * 1.2)) + 0.45 * Math.sin(TAU * (u * 24 + t * 0.9)) // white: fine, fast
  if (k === ROW_CHORDS) {
    // Four close notes: smooth, gently beating.
    return 0.3 * (Math.sin(TAU * (u * 3 - t * 0.2)) + Math.sin(TAU * (u * 3.6 - t * 0.23)) + Math.sin(TAU * (u * 4.5 - t * 0.17)) + Math.sin(TAU * (u * 5.4 - t * 0.26)))
  }
  // The pulse: δ ~2 waves across, θ ~5, α ~9.
  return Math.sin(TAU * (u * Math.max(1, pulseHz * 1.1) - t * 0.45))
}

function buildRow(
  b: SkPathBuilder,
  k: number,
  row: number,
  level: number,
  width: number,
  t: number,
  pulseHz: number,
  sway: number,
): void {
  'worklet'
  if (row < 0) return
  const mid = (row + 0.5) * ROW_H
  // Loudness is height: a quiet sound is a small ripple, a loud one fills its row.
  const amp = (ROW_H / 2 - 2) * (k === ROW_PULSE ? (level > 0 ? 0.45 + 0.4 * level : 0) : Math.pow(level, 0.75) * sway)
  for (let x = 0; x <= width + 2; x += 2) {
    const u = x / width
    // Calm at the ends, so rows read as lines, not boxes.
    const env = Math.min(1, Math.sin(Math.PI * Math.min(1, Math.max(0, u))) * 3)
    const y = mid + shape(k, u, t, pulseHz) * amp * env
    if (x === 0) b.moveTo(x, y)
    else b.lineTo(x, y)
  }
}

export default function StudioScopeCanvas({ width, rowOf, levels, colors, pulseHz, playing, animate }: StudioScopeProps) {
  const time = useAmbientTime(animate && playing)
  const target = useSharedValue<number[]>([...levels])
  const cur = useSharedValue<number[]>([...levels])
  const pulse = useSharedValue(pulseHz)
  const pulsePhase = useSharedValue(0)

  useEffect(() => {
    target.set([...levels])
    // Stopped or still: no clock, so show the new mix at once.
    if (!(animate && playing)) cur.set([...levels])
  }, [levels, animate, playing, target, cur])
  useEffect(() => {
    pulse.set(pulseHz)
  }, [pulseHz, pulse])

  useAnimatedReaction(
    () => time.get(),
    (t, prev) => {
      if (prev === null) return
      const dt = Math.max(0, t - prev)
      const k = Math.min(1, dt * 7)
      const goal = target.get()
      const now = cur.get()
      const next: number[] = []
      for (let i = 0; i < goal.length; i++) {
        const a = now[i] ?? 0
        next.push(a + ((goal[i] ?? 0) - a) * k)
      }
      cur.set(next)
      // Shown about ten times slower than it really beats.
      pulsePhase.set(pulsePhase.get() + dt * Math.PI * 2 * pulse.get() * 0.1)
    },
  )

  // Everything swells a little with the pulse.
  const swayOf = () => {
    'worklet'
    const strength = cur.get()[ROW_PULSE] ?? 0
    return pulse.get() > 0 ? 1 - 0.22 * strength * (0.5 + 0.5 * Math.sin(pulsePhase.get())) : 1
  }

  const r0 = usePathValue((b) => {
    'worklet'
    buildRow(b, 0, rowOf[0] ?? -1, cur.get()[0] ?? 0, width, time.get(), pulse.get(), swayOf())
  })
  const r1 = usePathValue((b) => {
    'worklet'
    buildRow(b, 1, rowOf[1] ?? -1, cur.get()[1] ?? 0, width, time.get(), pulse.get(), swayOf())
  })
  const r2 = usePathValue((b) => {
    'worklet'
    buildRow(b, 2, rowOf[2] ?? -1, cur.get()[2] ?? 0, width, time.get(), pulse.get(), swayOf())
  })
  const r3 = usePathValue((b) => {
    'worklet'
    buildRow(b, 3, rowOf[3] ?? -1, cur.get()[3] ?? 0, width, time.get(), pulse.get(), swayOf())
  })
  const r4 = usePathValue((b) => {
    'worklet'
    buildRow(b, 4, rowOf[4] ?? -1, cur.get()[4] ?? 0, width, time.get(), pulse.get(), swayOf())
  })
  const r5 = usePathValue((b) => {
    'worklet'
    buildRow(b, 5, rowOf[5] ?? -1, cur.get()[5] ?? 0, width, time.get(), pulse.get(), swayOf())
  })
  const r6 = usePathValue((b) => {
    'worklet'
    buildRow(b, 6, rowOf[6] ?? -1, cur.get()[6] ?? 0, width, time.get(), pulse.get(), swayOf())
  })
  const r7 = usePathValue((b) => {
    'worklet'
    buildRow(b, ROW_CHORDS, rowOf[ROW_CHORDS] ?? -1, cur.get()[ROW_CHORDS] ?? 0, width, time.get(), pulse.get(), swayOf())
  })
  const r8 = usePathValue((b) => {
    'worklet'
    buildRow(b, ROW_PULSE, rowOf[ROW_PULSE] ?? -1, cur.get()[ROW_PULSE] ?? 0, width, time.get(), pulse.get(), 1)
  })

  const rows = [r0, r1, r2, r3, r4, r5, r6, r7, r8]
  const visible = rowOf.filter((r) => r >= 0).length
  const height = Math.max(1, visible) * ROW_H
  const alpha = playing ? 0.95 : 0.55

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      {rows.map((p, k) =>
        (rowOf[k] ?? -1) < 0 ? null : (
          <Path
            key={k}
            path={p}
            style="stroke"
            strokeWidth={k >= ROW_CHORDS ? 1.8 : 1.5}
            strokeJoin="round"
            strokeCap="round"
            color={rgba(colors[k] ?? '#ffffff', alpha)}
          />
        ),
      )}
    </Canvas>
  )
}
