import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, Text, useWindowDimensions, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { scheduleOnRN } from 'react-native-worklets'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

/**
 * Shared motion values and pieces. New motion should use these rather than
 * typing curves.
 * - EASE_OUT: things entering or leaving (starts fast, settles gently).
 * - EASE_DRAWER: sheets and drawers (the iOS sheet curve).
 *
 * Everything here runs on values this module drives itself (not layout
 * entering/exiting animations), so a re-render mid-animation (a chip tapped
 * while the page is still arriving) can never leave things half-faded.
 */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
export const EASE_DRAWER = Easing.bezier(0.32, 0.72, 0, 1)

/** Per-word stagger for titles that change. */
const WORD_STAGGER_MS = 30
const WORD_OUT_MS = 240
const WORD_IN_DELAY_MS = 140
const WORD_IN_MS = 320
/** Per-item stagger for answers appearing (chips, rows, cards). */
export const ITEM_STAGGER_MS = 40

/** Strong ease-out on a 0..1 progress, usable inside worklets. */
function easeOut(x: number): number {
  'worklet'
  const t = Math.min(1, Math.max(0, x))
  return 1 - (1 - t) * (1 - t) * (1 - t) * (1 - t)
}

/** Where a title layer is: it may be arriving, leaving, or both (interrupted mid-arrival). */
interface TitleLayer {
  id: number
  text: string
  /** Animate the words in on mount (false for the first title and with reduced motion). */
  arrive: boolean
  inDir: 1 | -1
  leaving: boolean
  outDir: 1 | -1
}

const SETTLED_MS = 100_000

function Word({
  word,
  index,
  inClock,
  outClock,
  inDir,
  outDir,
  textStyle,
}: {
  word: string
  index: number
  inClock: SharedValue<number>
  outClock: SharedValue<number>
  inDir: 1 | -1
  outDir: 1 | -1
  textStyle: StyleProp<TextStyle>
}) {
  const style = useAnimatedStyle(() => {
    // New words rise into place; old ones lift away one after another, like dust blown off.
    // Both run from the word's own state, so an interrupted arrival leaves from where it was.
    const pin = easeOut((inClock.get() - WORD_IN_DELAY_MS - index * WORD_STAGGER_MS) / WORD_IN_MS)
    const pout = easeOut((outClock.get() - index * WORD_STAGGER_MS) / WORD_OUT_MS)
    return {
      opacity: pin * (1 - pout),
      transform: [{ translateY: 10 * inDir * (1 - pin) - 10 * outDir * pout }],
    }
  })
  return (
    <Animated.View style={style}>
      <Text style={textStyle}>{word}</Text>
    </Animated.View>
  )
}

function TitleLayerView({ layer, textStyle }: { layer: TitleLayer; textStyle: StyleProp<TextStyle> }) {
  const words = layer.text.split(' ')
  // Initial values are right on the very first frame: no flash before the animation starts.
  const inClock = useSharedValue(layer.arrive ? 0 : SETTLED_MS)
  const outClock = useSharedValue(0)

  useEffect(() => {
    if (!layer.arrive) return
    const total = WORD_IN_DELAY_MS + words.length * WORD_STAGGER_MS + WORD_IN_MS
    inClock.set(withTiming(total, { duration: total, easing: Easing.linear, reduceMotion: ReduceMotion.System }))
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!layer.leaving) return
    const total = words.length * WORD_STAGGER_MS + WORD_OUT_MS
    outClock.set(withTiming(total, { duration: total, easing: Easing.linear, reduceMotion: ReduceMotion.System }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer.leaving])

  return (
    <View
      style={styles.layer}
      pointerEvents="none"
      accessible={!layer.leaving}
      accessibilityRole="header"
      accessibilityLabel={layer.leaving ? undefined : layer.text}
      importantForAccessibility={layer.leaving ? 'no-hide-descendants' : 'auto'}
    >
      {words.map((w, i) => (
        <Word
          key={`${i}-${w}`}
          word={i < words.length - 1 ? `${w} ` : w}
          index={i}
          inClock={inClock}
          outClock={outClock}
          inDir={layer.inDir}
          outDir={layer.outDir}
          textStyle={textStyle}
        />
      ))}
    </View>
  )
}

/**
 * A title that hands over to the next one in place. Give it a fixed-height
 * `style` box: the old and new titles sit on top of each other while they
 * swap, so nothing below moves. `dir` is -1 when going back (motion reverses).
 *
 * Each title keeps its own views for its whole life (it is never rebuilt when
 * it starts leaving), which is what keeps the swap free of flicker on iOS.
 */
export function HandoffTitle({
  text,
  dir = 1,
  reduced,
  style,
  textStyle,
}: {
  text: string
  dir?: 1 | -1
  reduced: boolean
  style?: StyleProp<ViewStyle>
  textStyle: StyleProp<TextStyle>
}) {
  const nextId = useRef(1)
  const [shownText, setShownText] = useState(text)
  const [layers, setLayers] = useState<TitleLayer[]>(() => [
    { id: 0, text, arrive: false, inDir: 1, leaving: false, outDir: 1 },
  ])

  // Adjusted during render (not in an effect), so there's no frame showing the old state.
  if (text !== shownText) {
    setShownText(text)
    const current = layers[layers.length - 1]!
    const id = nextId.current++
    setLayers(
      reduced
        ? [{ id, text, arrive: false, inDir: dir, leaving: false, outDir: dir }]
        : [
            // Only the title being replaced leaves; anything older has already faded.
            { ...current, leaving: true, outDir: dir },
            { id, text, arrive: true, inDir: dir, leaving: false, outDir: dir },
          ],
    )
  }

  return (
    <View style={style}>
      {layers.map((layer) => (
        <TitleLayerView key={layer.id} layer={layer} textStyle={textStyle} />
      ))}
    </View>
  )
}

/**
 * Something arriving: rises 6pt (or `distance`) and fades in once, after
 * `delay` ms. Later re-renders never restart it.
 */
export function Rise({
  delay = 0,
  distance = 6,
  duration = 220,
  reduced,
  style,
  children,
}: {
  delay?: number
  distance?: number
  duration?: number
  reduced: boolean
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const p = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    p.set(withDelay(delay, withTiming(1, { duration, easing: EASE_OUT, reduceMotion: ReduceMotion.System })))
    // Mount only: re-renders must not restart the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const animated = useAnimatedStyle(() => ({
    opacity: p.get(),
    transform: [{ translateY: distance * (1 - p.get()) }],
  }))
  return <Animated.View style={[style, animated]}>{children}</Animated.View>
}

/** The delay for the `index`th answer in a group: they arrive 40ms apart, after the title starts. */
export const itemDelay = (index: number) => 180 + index * ITEM_STAGGER_MS

/**
 * A block of answers that can step aside for the next page's. It stays the
 * same element while it fades (its children are never rebuilt, so their
 * entrance doesn't replay), and fades back if the person returns to it.
 */
export function AnswerLayer({
  leaving,
  onGone,
  style,
  children,
}: {
  leaving: boolean
  onGone: () => void
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const p = useSharedValue(1)
  const gone = useRef(onGone)
  gone.current = onGone
  useEffect(() => {
    if (!leaving) {
      p.set(withTiming(1, { duration: 160, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
      return
    }
    p.set(withTiming(0, { duration: 160, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
    const t = setTimeout(() => gone.current(), 200)
    return () => clearTimeout(t)
  }, [leaving, p])
  const animated = useAnimatedStyle(() => ({ opacity: p.get() }))
  return (
    <Animated.View pointerEvents={leaving ? 'none' : 'box-none'} style={[style, animated]}>
      {children}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
})

/** How far in from the left edge a back swipe can start, as on iOS. */
const EDGE_WIDTH = 28

/**
 * The iOS back swipe for screens that don't get one from the navigator
 * (onboarding pages, games): drag in from the left edge and the screen
 * follows the finger; let go past a third of the way, or flick, and `onBack`
 * runs. It only starts at the edge, so sliders and boards keep their drags.
 */
export function EdgeSwipeBack({
  onBack,
  enabled = true,
  style,
  children,
}: {
  onBack: () => void
  enabled?: boolean
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const { width } = useWindowDimensions()
  const x = useSharedValue(0)
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  const goBack = () => onBackRef.current()

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .hitSlop({ left: 0, width: EDGE_WIDTH })
        .activeOffsetX(10)
        .failOffsetY([-16, 16])
        .onUpdate((e) => {
          'worklet'
          x.set(Math.max(0, e.translationX))
        })
        .onEnd((e) => {
          'worklet'
          const go = e.translationX > width * 0.33 || (e.velocityX > 650 && e.translationX > 24)
          // Either way the screen settles back: the back step brings its own motion.
          x.set(withSpring(0, { duration: 320, dampingRatio: 0.9 }))
          if (go) scheduleOnRN(goBack)
        }),
    // goBack reads the latest onBack through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, width, x],
  )

  const follow = useAnimatedStyle(() => {
    const p = Math.min(1, x.get() / width)
    return { transform: [{ translateX: x.get() * 0.45 }], opacity: 1 - p * 0.5 }
  })

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ flex: 1 }, style, follow]}>{children}</Animated.View>
    </GestureDetector>
  )
}
