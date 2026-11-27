import { useEffect, useState } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Animated, {
  Easing,
  interpolateColor,
  ReduceMotion,
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useAmbientTime, useCovered } from './ambientClock'

const AnimatedPath = Animated.createAnimatedComponent(Path)

/** Calm is cool and blue; a busy mind runs hot. Shared with the slider's fill. */
export const MIND_CALM = '#8FB0FF'
export const MIND_BUSY = '#F2944A'

const STRANDS = [
  { opacity: 0.95, width: 2.2 },
  { opacity: 0.55, width: 1.6 },
  { opacity: 0.32, width: 1.2 },
] as const
const POINTS = 140

/**
 * One strand of thought, as a path. Quiet: a slow, even wave. Busy: the same
 * line keeps looping back on itself (a trochoid whose loops grow with
 * `busy`), tapered so both ends stay calm. `clock` runs 0..1 and every term
 * turns a whole number of times per cycle, so the loop restarts seamlessly.
 */
function strandPath(w: number, h: number, busy: number, clock: number, strand: number): string {
  'worklet'
  const TAU = Math.PI * 2
  const mid = h / 2
  let d = ''
  for (let i = 0; i <= POINTS; i++) {
    const t = i / POINTS
    const taper = Math.sin(t * Math.PI)
    const r = busy * h * 0.2 * (0.35 + 0.65 * taper)
    const turns = 5 + strand * 2
    const ang = t * TAU * turns + clock * TAU * (strand + 1) + strand * 2.1
    const wave = Math.sin(t * TAU * 1.5 + clock * TAU + strand * 1.3) * h * (0.07 + busy * 0.1)
    const x = t * w + r * Math.cos(ang) * taper
    const y = mid + wave + r * Math.sin(ang * (1 + strand * 0.5)) * taper
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return d
}

function Strand({
  index,
  w,
  h,
  busy,
  clock,
}: {
  index: number
  w: number
  h: number
  busy: SharedValue<number>
  clock: SharedValue<number>
}) {
  const spec = STRANDS[index]!
  const props = useAnimatedProps(() => ({
    d: strandPath(w, h, busy.get(), clock.get(), index),
    stroke: interpolateColor(busy.get(), [0, 1], [MIND_CALM, MIND_BUSY]),
  }))
  return (
    <AnimatedPath
      animatedProps={props}
      fill="none"
      strokeWidth={spec.width}
      strokeOpacity={spec.opacity}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

/**
 * A picture of a mind at bedtime, above the "how busy" slider: three threads
 * of thought that are an easy wave when quiet and knot themselves up as the
 * slider moves toward very busy. `busy` is the slider, 0..1.
 */
export function MindTangle({ busy, height = 150, reduced }: { busy: number; height?: number; reduced: boolean }) {
  const [w, setW] = useState(0)
  const busySV = useSharedValue(busy)
  const covered = useCovered()
  const time = useAmbientTime(!reduced && !covered)
  // 0..1 every 14 seconds, on the shared clock.
  const clock = useDerivedValue(() => (time.get() / 14) % 1)

  useEffect(() => {
    busySV.set(withTiming(busy, { duration: 260, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }))
  }, [busy, busySV])

  return (
    <View
      style={[styles.wrap, { height }]}
      onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {w > 0 ? (
        <Svg width={w} height={height}>
          {STRANDS.map((_, i) => (
            <Strand key={i} index={STRANDS.length - 1 - i} w={w} h={height} busy={busySV} clock={clock} />
          ))}
        </Svg>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
})
