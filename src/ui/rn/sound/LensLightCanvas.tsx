/**
 * The light inside and on the sound orb's glass, drawn in Skia. The glass
 * itself is native (GlassLens); this layer is only light:
 *
 * - three closed rings, each a small harmonograph (a circle with two slow
 *   turning patterns on it). Every sound has its own pair of patterns
 *   (`shape`), its layers set how far the rings swing (`motion`), and the
 *   breath rate sets their pace. Paused, they relax toward plain circles and
 *   dim, which is how the orb shows it isn't playing.
 * - the rim, lit where the scene's light falls (top right) with a thin
 *   reflection just inside it, and a bounce of the scene's colour opposite;
 * - light pooling low inside the glass, in the scene's colour, and the glass
 *   darkening toward its edge.
 *
 * Each ring is drawn twice: a soft blurred pass for the glow and a fine line
 * on top, so it reads as light rather than ink.
 *
 * Default export so the web build can load it after CanvasKit is ready.
 */
import { useEffect } from 'react'
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Path,
  RadialGradient,
  SweepGradient,
  vec,
  usePathValue,
  type SkPathBuilder,
} from '@shopify/react-native-skia'
import {
  Easing,
  ReduceMotion,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useAmbientTime } from '../ambientClock'

export interface LensLightProps {
  size: number
  playing: boolean
  /** Whether it may animate at all (on screen, app active, motion allowed). */
  animate: boolean
  /** 0..1: how much the sound moves (its layers); sets the rings' swing. */
  motion: number
  /** Which pattern pair this sound draws (any integer). */
  shape: number
  /** Breath rate of the sound, Hz (about 0.1). */
  breathHz: number
  /** Scene colours (hex): the light on the rim, and the scene's own colour. */
  light: string
  bounce: string
  accent: string
}

/** Per sound: for each ring, the two pattern counts. Chosen to look calm and distinct. */
const SHAPES: readonly (readonly [number, number])[][] = [
  [[3, 5], [4, 6], [5, 7]],
  [[2, 5], [3, 4], [5, 6]],
  [[3, 4], [5, 3], [4, 7]],
  [[4, 5], [2, 6], [6, 5]],
  [[3, 6], [4, 3], [5, 4]],
  [[2, 3], [4, 5], [6, 4]],
]
const RADIUS = [0.18, 0.28, 0.38] as const
const SPIN = [0.5, -0.36, 0.24] as const
const STEPS = 120

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

function buildRing(
  b: SkPathBuilder,
  k: number,
  size: number,
  phase: number,
  level: number,
  motion: number,
  n: number,
  m: number,
): void {
  'worklet'
  const c = size / 2
  const base = RADIUS[k]! * size
  // Swing relative to the ring's own size, so small rings don't pinch into dents.
  const swing = 0.018 + (0.03 + 0.035 * motion) * level
  const ph = phase * SPIN[k]!
  const breathe = 1 + 0.018 * Math.sin(phase * 0.5 - k * 0.7) * level
  for (let i = 0; i <= STEPS; i++) {
    const th = (i / STEPS) * Math.PI * 2
    // Two slow turning harmonics on the radius: always a smooth closed curve.
    const r = base * breathe * (1 + swing * Math.sin(n * th + ph) + swing * 0.5 * Math.sin(m * th - ph * 1.3 + k))
    const px = c + Math.cos(th) * r
    const py = c + Math.sin(th) * r
    if (i === 0) b.moveTo(px, py)
    else b.lineTo(px, py)
  }
  b.close()
}

export default function LensLightCanvas({ size, playing, animate, motion, shape, breathHz, light, bounce, accent }: LensLightProps) {
  const c = size / 2
  const pair = SHAPES[((shape % SHAPES.length) + SHAPES.length) % SHAPES.length]!

  // The clock only runs while playing and visible; paused, everything rests.
  // Steps on the shared ambient clock (30 fps), only while playing and visible.
  const phase = useSharedValue(0)
  const rate = useSharedValue(0)
  useEffect(() => {
    rate.set(Math.PI * 2 * Math.max(0.06, breathHz) * 1.6)
  }, [breathHz, rate])
  const time = useAmbientTime(animate && playing)
  useAnimatedReaction(
    () => time.get(),
    (t, prev) => {
      if (prev !== null) phase.set(phase.get() + (t - prev) * rate.get())
    },
  )

  const level = useSharedValue(playing ? 1 : 0)
  useEffect(() => {
    level.set(withTiming(playing ? 1 : 0, { duration: 1100, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }))
  }, [playing, level])

  const ring0 = usePathValue((b) => {
    'worklet'
    buildRing(b, 0, size, phase.get(), level.get(), motion, pair[0]![0], pair[0]![1])
  })
  const ring1 = usePathValue((b) => {
    'worklet'
    buildRing(b, 1, size, phase.get(), level.get(), motion, pair[1]![0], pair[1]![1])
  })
  const ring2 = usePathValue((b) => {
    'worklet'
    buildRing(b, 2, size, phase.get(), level.get(), motion, pair[2]![0], pair[2]![1])
  })

  const glow = useDerivedValue(() => 0.16 + 0.34 * level.get())
  const line = useDerivedValue(() => 0.32 + 0.6 * level.get())
  const pool = useDerivedValue(() => 0.35 + 0.65 * level.get())
  const keyLight = useDerivedValue(() => 0.88 + 0.12 * Math.sin(phase.get() * 0.5))

  // The outer ring is the farthest and softest; brass in the middle is the focus.
  const rings = [
    { path: ring2, color: rgba(light, 0.5), glowColor: rgba(light, 0.4), width: 1, blur: 8 },
    { path: ring1, color: rgba(accent, 0.95), glowColor: rgba(accent, 0.65), width: 1.5, blur: 5 },
    { path: ring0, color: rgba(light, 0.62), glowColor: rgba(light, 0.45), width: 1, blur: 4 },
  ]

  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      {/* Thick glass darkens toward its edge: under the light, so the rings stay clear. */}
      <Circle cx={c} cy={c} r={c}>
        <RadialGradient
          c={vec(c, c)}
          r={c}
          positions={[0, 0.7, 0.9, 1]}
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.26)', 'rgba(0,0,0,0.46)']}
        />
      </Circle>

      {/* Light gathered on the lower-left inner wall, in the scene's colour; a little warmth at the heart. */}
      <Group opacity={pool}>
        <Circle cx={c} cy={c} r={c - 1}>
          <RadialGradient c={vec(size * 0.3, size * 0.76)} r={size * 0.3} colors={[rgba(bounce, 0.2), rgba(bounce, 0)]} />
        </Circle>
        <Circle cx={c} cy={c} r={size * 0.13}>
          <RadialGradient c={vec(c, c)} r={size * 0.13} colors={[rgba(accent, 0.18), rgba(accent, 0)]} />
        </Circle>
      </Group>

      {/* The rings, as light: a soft additive glow, then a fine line. */}
      {rings.map((r, i) => (
        <Group key={i}>
          <Path path={r.path} style="stroke" strokeWidth={r.width * 4} color={r.glowColor} opacity={glow} blendMode="plus">
            <BlurMask blur={r.blur} style="normal" />
          </Path>
          <Path path={r.path} style="stroke" strokeWidth={r.width} color={r.color} opacity={line} strokeJoin="round" />
        </Group>
      ))}

      {/* The rim: no line all round. Light catches it at half past one, softly
          blooming, with a wider faint reflection just inside; the scene's
          colour catches the opposite edge. */}
      <Group opacity={keyLight}>
        <Circle cx={c} cy={c} r={c - 1.2} style="stroke" strokeWidth={4.5} blendMode="plus">
          <SweepGradient
            c={vec(c, c)}
            positions={[0, 0.06, 0.74, 0.87, 0.96, 1]}
            colors={[rgba(light, 0.12), rgba(light, 0), rgba(light, 0), rgba(light, 0.4), rgba(light, 0.16), rgba(light, 0.12)]}
          />
          <BlurMask blur={4} style="normal" />
        </Circle>
        <Circle cx={c} cy={c} r={c - 0.9} style="stroke" strokeWidth={1}>
          <SweepGradient
            c={vec(c, c)}
            positions={[0, 0.06, 0.74, 0.87, 0.96, 1]}
            colors={[rgba(light, 0.3), rgba(light, 0), rgba(light, 0), rgba(light, 0.95), rgba(light, 0.45), rgba(light, 0.3)]}
          />
        </Circle>
        <Circle cx={c} cy={c} r={c - size * 0.034} style="stroke" strokeWidth={3.2}>
          <SweepGradient
            c={vec(c, c)}
            positions={[0, 0.76, 0.87, 0.97, 1]}
            colors={[rgba(light, 0), rgba(light, 0), rgba(light, 0.18), rgba(light, 0), rgba(light, 0)]}
          />
          <BlurMask blur={3.5} style="normal" />
        </Circle>
      </Group>
      <Circle cx={c} cy={c} r={c - 1.5} style="stroke" strokeWidth={2.4} opacity={pool}>
        <SweepGradient
          c={vec(c, c)}
          positions={[0, 0.26, 0.37, 0.48, 1]}
          colors={[rgba(bounce, 0), rgba(bounce, 0), rgba(bounce, 0.45), rgba(bounce, 0), rgba(bounce, 0)]}
        />
        <BlurMask blur={2} style="normal" />
      </Circle>
    </Canvas>
  )
}
