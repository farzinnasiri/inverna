import { useEffect } from 'react'
import Animated, { Easing, ReduceMotion, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useTokenColors } from '@/ui/hooks/useTokenColors'

const AnimatedPath = Animated.createAnimatedComponent(Path)

/**
 * The Lull Line: one wave that rises, falls and settles flat, the way a
 * restless mind quiets down. Centre line of design/logo-concepts/03-lull-line,
 * drawn as a stroke so it can draw itself in.
 */
const LINE = 'M13 57C22 57 25 35.5 35.5 35.5C46 35.5 45.5 62 55.5 62C64 62 64 52 73.5 52H87.5'
/** A little longer than the path, so the dash covers all of it. */
const LENGTH = 132

export function LullMark({
  size = 96,
  draw = false,
  delay = 0,
  duration = 1400,
  color,
}: {
  size?: number
  /** Draw the line in from the left when mounted. */
  draw?: boolean
  delay?: number
  duration?: number
  color?: string
}) {
  const { color: tokens } = useTokenColors()
  const progress = useSharedValue(draw ? 0 : 1)

  useEffect(() => {
    if (!draw) return
    progress.set(0)
    progress.set(
      withDelay(
        delay,
        withTiming(1, { duration, easing: Easing.bezier(0.45, 0, 0.2, 1), reduceMotion: ReduceMotion.System }),
      ),
    )
  }, [draw, delay, duration, progress])

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: LENGTH * (1 - progress.get()),
  }))

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Lull">
      <AnimatedPath
        d={LINE}
        fill="none"
        stroke={color ?? tokens.accent}
        strokeWidth={6.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${LENGTH} ${LENGTH}`}
        animatedProps={animatedProps}
      />
    </Svg>
  )
}
