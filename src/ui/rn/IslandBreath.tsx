/**
 * One breath, out of the Dynamic Island.
 *
 * Pull Play down past its top and you breathe in: a light gathers under the
 * island and the scene's matter drifts toward it. Pull to the mark and hold:
 * a count of four, the light still filling. Let go and you breathe out: a wave
 * of the scene's own light leaves the island and crosses the screen, every
 * scene answering it its own way (strings strum outward, ink falls, the delta
 * pulses, surf surges, grass bends, embers and stars scatter), the tiles lift
 * as it passes them, and a slow chord rolls up in the key that's playing.
 * Letting go before the count is done lets out a smaller breath; letting go
 * before the mark lets the light fade.
 *
 * The light and the wave are drawn by the scene behind the tabs (the field
 * shader and the particles, src/core/backdrop/sim.ts); this file is the
 * gesture, the words under the island, the sound and the haptics.
 *
 * Nothing is drawn over the island itself, so its size, which differs between
 * iPhones, never matters: everything starts just under it, found from the safe
 * area alone (`breathOrigin`). Notched and home-button iPhones get it under the
 * notch or the status bar. One breath at a time: pulling again while the wave
 * is out does nothing until the finger has let go. Android doesn't pull past
 * the top, so it never starts there. With Reduce Motion the scene stays still
 * and the words, sound and haptics remain.
 */
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Platform, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { WAVE_SECONDS, waveReach } from '@/core/backdrop/sim'
import { sound } from '@/platform'
import { breath as copy } from '@/ui/copy'
import { feel } from '@/ui/feel'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { breathFrames, breathSignal, breathWave, breathWaveU, useWaveLift } from '@/ui/rn/backdrop/breath'
import { useResponsiveLayout } from '@/ui/rn/hooks'
import { useSettings } from '@/ui/state/settings'

/** How far past the top (pt of scroll) is a full in-breath: about 150 pt of finger, with iOS's rubber band. */
export const BREATH_AT = 72
/** The hold, counted down under the island. */
export const HOLD_SECONDS = 4

/** idle, breathing in, holding, ready to let go, breathing out, waiting for the finger to lift. */
const IDLE = 0
const IN = 1
const HOLD = 2
const READY = 3
const OUT = 4
const WAIT = 5

type Stage = 'in' | 'hold' | 'ready' | 'out' | null

/**
 * Where the breath starts, from the safe area's top alone. On every iPhone
 * with a Dynamic Island its lower edge sits about 11 pt above the safe area's
 * top (59 -> 48, 62 -> 51); notches end about 14 pt above it; home-button
 * iPhones, Android and the web start just under the status bar.
 */
export function breathOrigin(safeTop: number, ios: boolean): number {
  if (ios && safeTop >= 51) return safeTop - 11
  if (ios && safeTop >= 44) return safeTop - 14
  return Math.max(8, safeTop - 2)
}

export interface IslandBreathHandle {
  onScroll: ReturnType<typeof useAnimatedScrollHandler>
  pull: SharedValue<number>
  phase: SharedValue<number>
  outFade: SharedValue<number>
  stage: Stage
  count: number
  originY: number
  /** Where the page's content starts (its top padding). */
  pageTop: number
}

export function useIslandBreath(pageTop: number): IslandBreathHandle {
  const { insets, width, height } = useResponsiveLayout()
  const originY = breathOrigin(insets.top, Platform.OS === 'ios')
  const pull = useSharedValue(0)
  const dragging = useSharedValue(false)
  const phase = useSharedValue(IDLE)
  const hold = useSharedValue(0)
  const outFade = useSharedValue(0)
  const [stage, setStage] = useState<Stage>(null)
  const [count, setCount] = useState(HOLD_SECONDS)
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const stopTicker = () => {
    if (ticker.current) clearInterval(ticker.current)
    ticker.current = null
  }
  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms))
  }
  useEffect(
    () => () => {
      stopTicker()
      clearTimers()
      breathFrames.set(false)
    },
    [],
  )

  // Where it gathers, for the scene.
  useEffect(() => {
    breathSignal.set({ ...breathSignal.get(), x: width / 2, y: originY })
  }, [width, originY])

  // --- What the finger does, on the JS side: words, haptics, sound. ---------

  const began = () => {
    clearTimers()
    setStage('in')
    feel('tick')
  }
  const held = () => {
    setStage('hold')
    setCount(HOLD_SECONDS)
    feel('settle')
    stopTicker()
    let n = HOLD_SECONDS
    ticker.current = setInterval(() => {
      n -= 1
      if (n < 1) return stopTicker()
      setCount(n)
      feel('tick')
    }, 1000)
  }
  const ready = () => {
    stopTicker()
    setStage('ready')
    feel('reward')
  }
  const lost = () => {
    stopTicker()
    setStage('in')
  }
  const faded = () => {
    stopTicker()
    setStage(null)
    // The light takes a moment to go; the scene keeps its full rate until then.
    later(1500, () => {
      if (phase.get() === IDLE) breathFrames.set(false)
    })
  }
  const exhaled = (strength: number) => {
    stopTicker()
    clearTimers()
    setStage('out')
    if (useSettings.getState().sfx) sound.cue('exhale', 0.55 + 0.45 * strength)
    feel(strength > 0.8 ? 'complete' : 'settle')
    later(WAVE_SECONDS * 1000 + 250, () => {
      breathWaveU.set(-1)
      breathFrames.set(false)
      setStage(null)
      phase.set(dragging.get() ? WAIT : IDLE)
    })
  }

  // --- The gesture, on the UI thread. ---------------------------------------

  // How full the breath is: the pull up to the mark, then the hold fills the rest.
  useAnimatedReaction(
    () => {
      const ph = phase.get()
      if (ph === IN) return 0.7 * Math.min(1, pull.get() / BREATH_AT)
      if (ph === HOLD) return 0.7 + 0.3 * hold.get()
      if (ph === READY) return 1
      return 0
    },
    (charge, prev) => {
      if (prev !== null && Math.abs(charge - prev) < 0.001) return
      breathSignal.set({ ...breathSignal.get(), charge })
    },
  )

  useAnimatedReaction(
    () => ({ p: pull.get(), d: dragging.get() }),
    (cur) => {
      const ph = phase.get()
      if (ph === IDLE && cur.d && cur.p > 6) {
        phase.set(IN)
        breathFrames.set(true)
        scheduleOnRN(began)
      } else if (ph === IN && cur.d && cur.p >= BREATH_AT) {
        phase.set(HOLD)
        hold.set(0)
        hold.set(
          withTiming(1, { duration: HOLD_SECONDS * 1000, easing: Easing.linear }, (done) => {
            if (done && phase.get() === HOLD) {
              phase.set(READY)
              scheduleOnRN(ready)
            }
          }),
        )
        scheduleOnRN(held)
      } else if (ph === HOLD && cur.p < BREATH_AT * 0.55) {
        cancelAnimation(hold)
        hold.set(0)
        phase.set(IN)
        scheduleOnRN(lost)
      } else if (ph === IN && !cur.d && cur.p < 1) {
        phase.set(IDLE)
        scheduleOnRN(faded)
      }
    },
  )

  const letGo = () => {
    'worklet'
    dragging.set(false)
    const ph = phase.get()
    if (ph === WAIT) {
      phase.set(IDLE)
      return
    }
    if (ph !== HOLD && ph !== READY) return
    // A full held breath is the whole wave; letting go early, a smaller one.
    const strength = ph === READY ? 1 : 0.3 + 0.4 * hold.get()
    cancelAnimation(hold)
    phase.set(OUT)
    const sig = breathSignal.get()
    breathSignal.set({ ...sig, charge: 0, outId: sig.outId + 1, strength })
    breathWave.set({ strength, x: sig.x, y: sig.y, reach: waveReach(width, height, sig.x, sig.y), width })
    breathWaveU.set(0)
    breathWaveU.set(withTiming(1, { duration: WAVE_SECONDS * 1000, easing: Easing.linear }))
    outFade.set(1)
    outFade.set(withTiming(0, { duration: 1300, easing: Easing.in(Easing.quad) }))
    scheduleOnRN(exhaled, strength)
  }

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      pull.set(Math.max(0, -e.contentOffset.y))
    },
    onBeginDrag: () => {
      dragging.set(true)
    },
    onEndDrag: () => {
      letGo()
    },
  })

  // A way to rehearse it in the web build, where nothing pulls past the top.
  const letGoRef = useRef(letGo)
  letGoRef.current = letGo
  useEffect(() => {
    if (!__DEV__ || Platform.OS !== 'web') return
    const g = globalThis as { __invernaBreath?: unknown }
    g.__invernaBreath = {
      pull: (p: number) => {
        dragging.set(true)
        pull.set(p)
      },
      /** Where it gathers (window y): the web has no island, and its tab bar sits on top. */
      at: (y: number) => breathSignal.set({ ...breathSignal.get(), y }),
      letGo: () => {
        letGoRef.current()
        pull.set(withTiming(0, { duration: 420 }))
      },
    }
    return () => {
      delete g.__invernaBreath
    }
  }, [dragging, pull])

  return { onScroll, pull, phase, outFade, stage, count, originY, pageTop }
}

/** The words under the island: what to do now, and the count while holding. */
export function IslandBreath({ breath }: { breath: IslandBreathHandle }) {
  const { color } = useTokenColors()
  const { pull, phase, outFade, stage, count, originY, pageTop } = breath

  const style = useAnimatedStyle(() => {
    const ph = phase.get()
    const p = pull.get()
    // In the gap the pull opens between the island and the page, a little below its middle.
    const gapEnd = pageTop + p
    const y = ph === OUT || ph === WAIT ? originY + 18 : originY + 0.42 * Math.max(0, gapEnd - originY)
    const opacity =
      ph === IN ? Math.min(1, Math.max(0, (p - 14) / 36)) : ph === HOLD || ph === READY ? 1 : ph === OUT ? outFade.get() : 0
    return { opacity, transform: [{ translateY: y }] }
  })

  const caption = stage === 'in' ? copy.in : stage === 'hold' ? copy.hold : stage === 'ready' ? copy.letGo : stage === 'out' ? copy.out : ''
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.words, style]}
    >
      <Text style={[styles.caption, { color: stage === 'ready' ? color.accent : color.ink2 }]}>{caption}</Text>
      {stage === 'hold' ? <Text style={[styles.count, { color: color.ink }]}>{count}</Text> : null}
    </Animated.View>
  )
}

/** A view that lifts as the breath's wave passes it. `baseX/baseY`: its parent's place on the page. */
export function WaveLift({
  baseX,
  baseY,
  style,
  layout,
  amount = 1,
  children,
}: {
  baseX: number
  baseY: number
  /** How much it lifts: 1 for a tile, less for something big. */
  amount?: number
  style?: StyleProp<ViewStyle>
  layout?: ComponentProps<typeof Animated.View>['layout']
  children?: ReactNode
}) {
  const lift = useWaveLift(baseX, baseY, amount)
  return (
    <Animated.View layout={layout} onLayout={lift.onLayout} style={[style, lift.style]}>
      {children}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  words: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  caption: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  count: {
    marginTop: 2,
    fontSize: 30,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
  },
})
