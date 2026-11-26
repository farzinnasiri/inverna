/**
 * The sound ribbon on Play: a few strands of light across the screen that
 * move with the sound playing. A brass strand at the heart, the scene's
 * colour either side. The swell follows the sound's layers (`motion`), the
 * pace its breath rate; both fade out toward the screen's edges. With nothing
 * playing the strands lie almost flat and dim, a quiet horizon.
 *
 * Default export so the web build can load it after CanvasKit is ready.
 */
import { useEffect } from 'react'
import { BlurMask, Canvas, Group, LinearGradient, Path, vec, usePathValue, type SkPathBuilder } from '@shopify/react-native-skia'
import { Easing, ReduceMotion, useAnimatedReaction, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated'
import { useAmbientTime } from '../ambientClock'

export interface RibbonProps {
  width: number
  height: number
  playing: boolean
  animate: boolean
  /** 0..1: how much the sound moves. */
  motion: number
  breathHz: number
  /** Scene colour (hex) for the outer strands, and the brass for the heart. */
  tint: string
  accent: string
  /**
   * Empty space above and below the waves, inside the canvas, so their glow
   * fades out instead of being cut off at the canvas edge.
   */
  pad?: number
}

const STRANDS = 5
const STEP = 6

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

function buildStrand(b: SkPathBuilder, k: number, w: number, h: number, pad: number, phase: number, level: number, motion: number): void {
  'worklet'
  const mid = h / 2
  // The waves keep to the band between the pads, glow included.
  const band = h - pad * 2
  const spread = (k - (STRANDS - 1) / 2) * (1.4 + 2 * level)
  const amp = band * (0.03 + (0.12 + 0.08 * motion) * level)
  for (let x = 0; x <= w + STEP; x += STEP) {
    const u = x / w
    // Calm at the edges, fullest in the middle.
    const env = Math.sin(Math.PI * Math.min(1, Math.max(0, u)))
    const wave =
      Math.sin(u * Math.PI * 2 * 1.1 + phase + k * 0.35) +
      0.45 * Math.sin(u * Math.PI * 2 * 2.6 - phase * 0.7 + k * 0.6) +
      0.2 * Math.sin(u * Math.PI * 2 * 4.3 + phase * 1.3)
    const y = mid + spread * env + wave * amp * env
    if (x === 0) b.moveTo(x, y)
    else b.lineTo(x, y)
  }
}

export default function RibbonCanvas({ width, height, playing, animate, motion, breathHz, tint, accent, pad = 0 }: RibbonProps) {
  // Steps on the shared ambient clock (30 fps), only while playing and visible.
  const phase = useSharedValue(0)
  const rate = useSharedValue(0)
  useEffect(() => {
    rate.set(Math.PI * 2 * Math.max(0.06, breathHz) * 2.2)
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
    level.set(withTiming(playing ? 1 : 0, { duration: 1400, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }))
  }, [playing, level])

  const s0 = usePathValue((b) => {
    'worklet'
    buildStrand(b, 0, width, height, pad, phase.get(), level.get(), motion)
  })
  const s1 = usePathValue((b) => {
    'worklet'
    buildStrand(b, 1, width, height, pad, phase.get(), level.get(), motion)
  })
  const s2 = usePathValue((b) => {
    'worklet'
    buildStrand(b, 2, width, height, pad, phase.get(), level.get(), motion)
  })
  const s3 = usePathValue((b) => {
    'worklet'
    buildStrand(b, 3, width, height, pad, phase.get(), level.get(), motion)
  })
  const s4 = usePathValue((b) => {
    'worklet'
    buildStrand(b, 4, width, height, pad, phase.get(), level.get(), motion)
  })
  const glow = useDerivedValue(() => 0.12 + 0.55 * level.get())
  const line = useDerivedValue(() => 0.3 + 0.62 * level.get())

  const strands = [
    { path: s0, color: tint, width: 0.8, alpha: 0.45 },
    { path: s1, color: tint, width: 1, alpha: 0.65 },
    { path: s2, color: accent, width: 1.5, alpha: 1 },
    { path: s3, color: tint, width: 1, alpha: 0.65 },
    { path: s4, color: tint, width: 0.8, alpha: 0.45 },
  ]
  // Fades each strand out toward the screen's edges.
  const fade = (hex: string, a: number) => (
    <LinearGradient
      start={vec(0, 0)}
      end={vec(width, 0)}
      positions={[0, 0.18, 0.5, 0.82, 1]}
      colors={[rgba(hex, 0), rgba(hex, a * 0.7), rgba(hex, a), rgba(hex, a * 0.7), rgba(hex, 0)]}
    />
  )

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      {strands.map((st, i) => (
        <Group key={i}>
          <Path path={st.path} style="stroke" strokeWidth={st.width * 4} opacity={glow}>
            {fade(st.color, st.alpha * 0.8)}
            <BlurMask blur={5} style="normal" />
          </Path>
          <Path path={st.path} style="stroke" strokeWidth={st.width} opacity={line} strokeJoin="round" strokeCap="round">
            {fade(st.color, st.alpha)}
          </Path>
        </Group>
      ))}
    </Canvas>
  )
}
