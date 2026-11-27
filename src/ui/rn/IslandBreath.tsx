/**
 * One breath, out of the Dynamic Island, on every tab.
 *
 * Pull a tab down past its top and you breathe in: a light gathers under the
 * island, growing brighter, whiter and shining as you pull, and the scene's
 * matter drifts toward it; light ticks mark the way to the mark. Hold at the
 * mark: a count of four, the light beating with each count. Let go and you
 * breathe out: a wave of the scene's own light leaves the island and crosses
 * the screen, every scene answering it its own way (strings strum outward,
 * ink falls, the delta pulses, surf surges, grass bends, embers and stars
 * scatter), Play's tiles lift as it passes them, and a slow chord rolls up in
 * the key that's playing. Letting go before the count is done lets out a
 * smaller breath; letting go before the mark lets the light fade.
 *
 * It can be done again as soon as the finger is off the screen: a new breath
 * gathers while the last wave is still crossing, and that wave carries on.
 *
 * Nobody looks at the top of the screen, so until they've tried it, Play now
 * and then invites them (`useBreathInvite`): a pulse of light rises from the
 * bottom of the screen into the island, which brightens, and "Pull down to
 * breathe" shows under it.
 *
 * The light and the waves are drawn by the scene behind the tabs (the field
 * shader and the particles, src/core/backdrop/sim.ts); this file is the
 * gesture, the words under the island, the sound and the haptics.
 *
 * Nothing is drawn over the island itself, so its size, which differs between
 * iPhones, never matters: everything starts just under it, found from the safe
 * area alone (`breathOrigin`). Notched and home-button iPhones get it under the
 * notch or the status bar. Android doesn't pull past the top, so it never
 * starts there. With Reduce Motion the scene stays still and the words, sound
 * and haptics remain.
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
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { BECKON_SECONDS, WAVE_SECONDS, waveReach } from '@/core/backdrop/sim'
import { sound } from '@/platform'
import { breath as copy } from '@/ui/copy'
import { feel } from '@/ui/feel'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { breathFrames, breathSignal, breathWave, breathWaveU, useWaveLift } from '@/ui/rn/backdrop/breath'
import { useCovered } from '@/ui/rn/ambientClock'
import { useResponsiveLayout } from '@/ui/rn/hooks'
import { useSettings } from '@/ui/state/settings'

/** How far past the top (pt of scroll) is a full in-breath: about 150 pt of finger, with iOS's rubber band. */
export const BREATH_AT = 72
/** The hold, counted down under the island. */
export const HOLD_SECONDS = 4
/** How many times Play invites them, at most once a launch, until they've tried it. */
const INVITES = 4
/** How long Play sits still before it invites them. */
const INVITE_AFTER_MS = 2600

/** idle, breathing in, holding, ready to let go, breathing out (a new pull can start a new breath). */
const IDLE = 0
const IN = 1
const HOLD = 2
const READY = 3
const OUT = 4

type Stage = 'in' | 'hold' | 'ready' | 'out' | 'invite' | null

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
  /** The scroll view's own offset (positive scrolled down), for anything else that follows the scroll. */
  scrollY: SharedValue<number>
  pull: SharedValue<number>
  phase: SharedValue<number>
  /** The words' opacity once the finger is off: the out-breath's and the invitation's. */
  wordsFade: SharedValue<number>
  stage: Stage
  count: number
  originY: number
  /** Where the page's content starts (its top padding). */
  pageTop: number
  /** Play's invitation: a pulse rising into the island, and the words under it. */
  invite: () => void
}

export function useIslandBreath(pageTop: number): IslandBreathHandle {
  const { insets, width, height } = useResponsiveLayout()
  const originY = breathOrigin(insets.top, Platform.OS === 'ios')
  const scrollY = useSharedValue(0)
  const pull = useSharedValue(0)
  const dragging = useSharedValue(false)
  const phase = useSharedValue(IDLE)
  const hold = useSharedValue(0)
  /** Thirds of the way to the mark already felt on this pull. */
  const steps = useSharedValue(0)
  const wordsFade = useSharedValue(0)
  const [stage, setStage] = useState<Stage>(null)
  const [count, setCount] = useState(HOLD_SECONDS)
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  /** Which breath is current, so a late timer from the last one leaves this one alone. */
  const run = useRef(0)

  const stopTicker = () => {
    if (ticker.current) clearInterval(ticker.current)
    ticker.current = null
  }
  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms))
  }
  useEffect(
    () => () => {
      stopTicker()
      timers.current.forEach(clearTimeout)
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
    run.current += 1
    stopTicker()
    setStage('in')
    feel('tick')
  }
  /** A third, then two thirds of the way to the mark. */
  const stepped = () => feel('tick')
  const held = () => {
    setStage('hold')
    setCount(HOLD_SECONDS)
    feel('reward')
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
    feel('commit')
  }
  const lost = () => {
    stopTicker()
    setStage('in')
  }
  const faded = () => {
    stopTicker()
    setStage(null)
    // The light takes a moment to go; the scene keeps its full rate until then.
    const mine = run.current
    later(1500, () => {
      if (run.current === mine && phase.get() === IDLE) breathFrames.set(false)
    })
  }
  const exhaled = (strength: number) => {
    stopTicker()
    setStage('out')
    if (useSettings.getState().sfx) sound.cue('exhale', 0.55 + 0.45 * strength)
    feel(strength > 0.8 ? 'complete' : 'settle')
    if (!useSettings.getState().breathTried) useSettings.getState().set({ breathTried: true })
    const mine = run.current
    later(WAVE_SECONDS * 1000 + 250, () => {
      // A new breath since then owns all of this.
      if (run.current !== mine) return
      breathWaveU.set(-1)
      breathFrames.set(false)
      setStage(null)
      if (phase.get() === OUT) phase.set(IDLE)
    })
  }

  // --- The gesture, on the UI thread. ---------------------------------------

  // How full the breath is: the pull up to the mark, then the hold fills the
  // rest; and the hold's heartbeat, once a count.
  useAnimatedReaction(
    () => {
      const ph = phase.get()
      if (ph === IN) return { charge: 0.7 * Math.min(1, pull.get() / BREATH_AT), beat: 0 }
      if (ph === HOLD) {
        const h = hold.get()
        return { charge: 0.7 + 0.3 * h, beat: Math.exp(-((h * HOLD_SECONDS) % 1) * 5) }
      }
      if (ph === READY) return { charge: 1, beat: 0.35 }
      return { charge: 0, beat: 0 }
    },
    (cur, prev) => {
      if (prev && Math.abs(cur.charge - prev.charge) < 0.001 && Math.abs(cur.beat - prev.beat) < 0.01) return
      breathSignal.set({ ...breathSignal.get(), charge: cur.charge, beat: cur.beat })
    },
  )

  useAnimatedReaction(
    () => ({ p: pull.get(), d: dragging.get() }),
    (cur) => {
      const ph = phase.get()
      // A new breath can start whenever a finger pulls, even while the last wave is out.
      if ((ph === IDLE || ph === OUT) && cur.d && cur.p > 6) {
        phase.set(IN)
        steps.set(0)
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
      } else if (ph === IN && cur.d) {
        const third = Math.floor((3 * cur.p) / BREATH_AT)
        if (third > steps.get() && third < 3) {
          steps.set(third)
          scheduleOnRN(stepped)
        }
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
    if (ph !== HOLD && ph !== READY) return
    // A full held breath is the whole wave; letting go early, a smaller one.
    const strength = ph === READY ? 1 : 0.3 + 0.4 * hold.get()
    cancelAnimation(hold)
    phase.set(OUT)
    const sig = breathSignal.get()
    breathSignal.set({ ...sig, charge: 0, beat: 0, outId: sig.outId + 1, strength })
    breathWave.set({ strength, x: sig.x, y: sig.y, reach: waveReach(width, height, sig.x, sig.y), width })
    breathWaveU.set(0)
    breathWaveU.set(withTiming(1, { duration: WAVE_SECONDS * 1000, easing: Easing.linear }))
    wordsFade.set(1)
    wordsFade.set(withTiming(0, { duration: 1300, easing: Easing.in(Easing.quad) }))
    scheduleOnRN(exhaled, strength)
  }

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.set(e.contentOffset.y)
      pull.set(Math.max(0, -e.contentOffset.y))
    },
    onBeginDrag: () => {
      dragging.set(true)
    },
    onEndDrag: () => {
      letGo()
    },
  })

  const invite = () => {
    if (phase.get() !== IDLE) return
    const mine = ++run.current
    const sig = breathSignal.get()
    breathSignal.set({ ...sig, beckonId: sig.beckonId + 1 })
    breathFrames.set(true)
    setStage('invite')
    // The words come as the light reaches the island, and stay a moment.
    wordsFade.set(0)
    wordsFade.set(
      withSequence(
        withDelay(BECKON_SECONDS * 1000 - 300, withTiming(1, { duration: 450 })),
        withDelay(2200, withTiming(0, { duration: 700 })),
      ),
    )
    later(BECKON_SECONDS * 1000 + 3600, () => {
      if (run.current !== mine) return
      setStage(null)
      if (phase.get() === IDLE) breathFrames.set(false)
    })
  }

  // A way to rehearse it in the web build, where nothing pulls past the top.
  const letGoRef = useRef(letGo)
  letGoRef.current = letGo
  const inviteRef = useRef(invite)
  inviteRef.current = invite
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
      invite: () => inviteRef.current(),
    }
    return () => {
      delete g.__invernaBreath
    }
  }, [dragging, pull])

  return { onScroll, scrollY, pull, phase, wordsFade, stage, count, originY, pageTop, invite }
}

/**
 * Play invites them to try the breath: once a launch, after Play has sat
 * still a moment, until they've tried it or been invited `INVITES` times.
 */
let invitedThisLaunch = false
export function useBreathInvite(breath: IslandBreathHandle, focused: boolean) {
  const tried = useSettings((s) => s.breathTried)
  const invites = useSettings((s) => s.breathInvites)
  const covered = useCovered()
  const { invite, pull } = breath
  useEffect(() => {
    if (!focused || covered || tried || invites >= INVITES || invitedThisLaunch) return
    const t = setTimeout(() => {
      // Not while they're touching the page.
      if (pull.get() > 0 || invitedThisLaunch) return
      invitedThisLaunch = true
      useSettings.getState().set({ breathInvites: useSettings.getState().breathInvites + 1 })
      invite()
    }, INVITE_AFTER_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `invite` is new each render; the timer only needs the state above
  }, [focused, covered, tried, invites])
}

/** The words under the island: what to do now, and the count while holding. */
export function IslandBreath({ breath }: { breath: IslandBreathHandle }) {
  const { color } = useTokenColors()
  const { pull, phase, wordsFade, stage, count, originY, pageTop } = breath
  const inviting = stage === 'invite'

  const style = useAnimatedStyle(() => {
    const ph = phase.get()
    const p = pull.get()
    // In the gap the pull opens between the island and the page, a little below its middle.
    const gapEnd = pageTop + p
    const pulled = ph === IN || ph === HOLD || ph === READY
    const y = pulled ? originY + 0.42 * Math.max(0, gapEnd - originY) : originY + 18
    const opacity = ph === IN ? Math.min(1, Math.max(0, (p - 14) / 36)) : pulled ? 1 : wordsFade.get()
    return { opacity, transform: [{ translateY: y }] }
  })

  const caption =
    stage === 'in'
      ? copy.in
      : stage === 'hold'
        ? copy.hold
        : stage === 'ready'
          ? copy.letGo
          : stage === 'out'
            ? copy.out
            : inviting
              ? copy.invite
              : ''
  return (
    <Animated.View
      pointerEvents="none"
      // The invitation is said aloud; the rest follows a gesture VoiceOver doesn't make.
      accessibilityElementsHidden={!inviting}
      importantForAccessibility={inviting ? 'yes' : 'no-hide-descendants'}
      accessibilityLiveRegion={inviting ? 'polite' : 'none'}
      style={[styles.words, style]}
    >
      <Text style={[styles.caption, { color: stage === 'ready' || inviting ? color.accent : color.ink2 }]}>{caption}</Text>
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
