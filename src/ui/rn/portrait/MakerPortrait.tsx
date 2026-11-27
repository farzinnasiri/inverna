import { useEffect } from 'react'
import type { ImageStyle, StyleProp } from 'react-native'
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useTokenColors } from '@/ui/hooks/useTokenColors'

/**
 * Farzin's dot portrait, beside the note in the About sheet.
 *
 * A picture, made once from a photo: white dots whose size and opacity follow
 * the light on his face, tinted with the ink colour so it follows the night
 * palette like the text does. Drawn at the screen's own pixel size (@2x/@3x),
 * so it's still and sharp, and costs nothing once shown.
 */
const SOURCE = require('../../../../assets/images/maker-portrait.png')

/** The picture's size in points; the files are drawn for exactly this. */
export const MAKER_PORTRAIT_SIZE = 156

export function MakerPortrait({ style }: { style?: StyleProp<ImageStyle> }) {
  const { color } = useTokenColors()
  const shown = useSharedValue(0)
  useEffect(() => {
    shown.set(withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }))
  }, [shown])
  const fade = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ scale: 0.97 + 0.03 * shown.get() }],
  }))
  return (
    <Animated.Image
      source={SOURCE}
      accessibilityRole="image"
      accessibilityLabel="A portrait of Farzin, drawn in small dots"
      style={[{ width: MAKER_PORTRAIT_SIZE, height: MAKER_PORTRAIT_SIZE, tintColor: color.ink }, fade, style]}
    />
  )
}
