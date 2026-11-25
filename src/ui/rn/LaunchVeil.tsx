import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import * as SplashScreen from 'expo-splash-screen'
import { LullMark } from './LullMark'

// Hold the native splash until the first frame of the app is ready under it.
void SplashScreen.preventAutoHideAsync().catch(() => {})

/** Same size as the native splash image (app.config.ts, imageWidth). */
const MARK = 160

/**
 * Cold-start handoff: the native splash (the Lull Line on black) is swapped for
 * this identical view on the first frame, which then breathes out into the app
 * instead of cutting to it. Gone after ~1s; never shown on a warm resume.
 */
export function LaunchVeil() {
  const [gone, setGone] = useState(false)
  const veil = useSharedValue(1)
  const mark = useSharedValue(1)

  useEffect(() => {
    // The veil is on screen and identical to the native splash: swap them.
    void SplashScreen.hideAsync().catch(() => {})
    const ease = { easing: Easing.bezier(0.4, 0, 0.2, 1), reduceMotion: ReduceMotion.System }
    mark.set(withDelay(250, withTiming(0, { duration: 420, ...ease })))
    veil.set(
      withDelay(
        420,
        withTiming(0, { duration: 520, ...ease }, (done) => {
          if (done) scheduleOnRN(setGone, true)
        }),
      ),
    )
  }, [veil, mark])

  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.get() }))
  const markStyle = useAnimatedStyle(() => ({
    opacity: mark.get(),
    transform: [{ scale: 1 + (1 - mark.get()) * 0.06 }],
  }))

  if (gone) return null
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.veil, veilStyle]}>
      <View style={styles.center}>
        <Animated.View style={markStyle}>
          <LullMark size={MARK} />
        </Animated.View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  veil: {
    backgroundColor: '#000000',
    zIndex: 100,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
