import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Reanimated, {
  Easing as REasing,
  interpolateColor,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { haptics } from '@/platform'
import { feel } from '@/ui/feel'
import { useCoverScreen } from './ambientClock'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useSettings } from '@/ui/state/settings'
import { GLASS_TINT, GlassSurface } from './Glass'
import { Layer } from './Layer'

export const FRAME_MAX_WIDTH = 440

/* --- Buttons ------------------------------------------------------------- */

type BtnVariant = 'primary' | 'quiet' | 'ghost'

export function Button({
  variant = 'quiet',
  size,
  block,
  disabled,
  onPress,
  children,
  style,
  accessibilityLabel,
}: {
  variant?: BtnVariant
  size?: 'sm'
  block?: boolean
  disabled?: boolean
  onPress?: () => void
  children: ReactNode
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}) {
  const { color } = useTokenColors()
  const isSm = size === 'sm'
  const fg = variant === 'primary' ? color.accent : color.ink
  const height = isSm ? 40 : 50
  const radius = isSm ? 20 : 16
  const label =
    typeof children === 'string' ? (
      <Text style={[styles.btnText, { color: fg, fontSize: isSm ? 15 : 16 }, variant === 'primary' ? styles.btnTextPrimary : null]}>
        {children}
      </Text>
    ) : (
      children
    )

  // Primary and quiet buttons are glass: primary is the glass tinted warm (the
  // app's one treatment for "this is the one"), quiet is plain glass. Ghost
  // buttons are just text.
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        {
          width: block ? '100%' : undefined,
          opacity: disabled ? 0.35 : pressed ? 0.86 : 1,
          transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
        },
        variant === 'ghost' ? [styles.btn, { height, paddingHorizontal: isSm ? 16 : 22 }, style] : null,
      ]}
    >
      {variant === 'ghost' ? (
        label
      ) : (
        <GlassSurface
          variant="pill"
          radius={radius}
          tint={variant === 'primary' ? GLASS_TINT.primary : undefined}
          interactive
          style={[styles.btn, { height, paddingHorizontal: isSm ? 16 : 22 }, style]}
        >
          {label}
        </GlassSurface>
      )}
    </Pressable>
  )
}

/* --- HoldButton (1.6s deliberate destructive confirm) ------------------- */

export function IconButton({
  label,
  disabled,
  lit,
  onPress,
  children,
  style,
}: {
  label: string
  disabled?: boolean
  lit?: boolean
  onPress?: () => void
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const { color } = useTokenColors()
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconBtn,
        {
          opacity: disabled ? 0.3 : 1,
          backgroundColor: pressed ? color.surface2 : 'transparent',
          transform: [{ scale: pressed && !disabled ? 0.94 : 1 }],
        },
        lit ? { opacity: 1 } : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  )
}

/* --- HoldButton (1.6s deliberate destructive confirm) ------------------- */

export function HoldButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const { color } = useTokenColors()
  const progress = useRef(new Animated.Value(0)).current
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animRef = useRef<Animated.CompositeAnimation | null>(null)

  const start = () => {
    animRef.current?.stop()
    progress.setValue(0)
    animRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: 1600,
      easing: Easing.linear,
      useNativeDriver: false,
    })
    animRef.current.start()
    timerRef.current = setTimeout(() => {
      onConfirm()
    }, 1600)
  }

  const cancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    animRef.current?.stop()
    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start()
  }

  useEffect(() => () => cancel(), [])

  const fillWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.holdBtn,
        { backgroundColor: color.surface2, borderColor: color.line },
      ]}
    >
      <Animated.View style={[styles.holdFill, { backgroundColor: color.accentWash, width: fillWidth }]} />
      <Text style={[styles.btnText, { color: color.ink2, fontSize: 15 }]}>{label}</Text>
    </Pressable>
  )
}

/* --- Pill slider ----------------------------------------------------------- */

const LIGHT_THUMB_W = 24
const LIGHT_PAD = 6

/**
 * The app's big pill slider (night light, onboarding scales): a title on the
 * left, the live answer in brass on the right, icons at both ends. `value` and
 * `onChange` are the thumb position, 0 (left) to 1 (right).
 */
export function PillSlider({
  value,
  onChange,
  title,
  valueLabel,
  left,
  right,
  label,
  disabled = false,
  fillColors,
}: {
  value: number
  onChange: (position: number) => void
  title: string
  valueLabel: (position: number) => string
  left?: ReactNode
  right?: ReactNode
  label?: string
  /** Shows the value but can't be moved (something else sets it); outside changes glide in. */
  disabled?: boolean
  /** The fill's colour at the left and right ends; it blends between them as the thumb moves. */
  fillColors?: readonly [string, string]
}) {
  const { color } = useTokenColors()
  const hapticsOn = useSettings((s) => s.haptics)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const hapticsRef = useRef(hapticsOn)
  hapticsRef.current = hapticsOn
  const lastEmitMsRef = useRef(0)
  /** When the finger last moved the slider. */
  const lastTouchMsRef = useRef(0)
  /** The last value sent out: when it comes back as `value`, it isn't news. */
  const lastEmittedRef = useRef<number | null>(null)
  const lastHapticTickRef = useRef(Math.round(value * 10))

  const brightnessSV = useSharedValue(Math.min(1, Math.max(0, value)))
  const trackWidthSV = useSharedValue(300)
  const draggingSV = useSharedValue(0)
  const [liveBrightness, setLiveBrightness] = useState(() => Math.min(1, Math.max(0, value)))

  // Follow outside changes only. While dragging, and for a moment after, the
  // incoming value is a delayed echo of an earlier emit: applying it would pull
  // the thumb back and then forward again.
  useEffect(() => {
    // Our own value coming back is skipped; anything else is an outside change (ISS-19).
    if (draggingSV.get() !== 0 || value === lastEmittedRef.current) return
    const nextB = Math.min(1, Math.max(0, value))
    brightnessSV.set(disabled ? withTiming(nextB, { duration: 600, reduceMotion: ReduceMotion.System }) : nextB)
    setLiveBrightness(nextB)
  }, [value, brightnessSV, draggingSV, disabled])

  const emitChange = (nextB: number, force: boolean) => {
    const now = Date.now()
    lastTouchMsRef.current = now
    const clampedB = Math.min(1, Math.max(0, nextB))
    const tick10 = Math.round(clampedB * 10)
    if (tick10 !== lastHapticTickRef.current) {
      lastHapticTickRef.current = tick10
      if (hapticsRef.current) haptics.play('tick')
    }
    // Each change re-tints the whole app, so ~11 Hz while dragging; the thumb
    // itself follows the finger on the UI thread at full frame rate.
    if (!force && now - lastEmitMsRef.current < 90) return
    lastEmitMsRef.current = now
    setLiveBrightness(clampedB)
    const emitted = Math.round(clampedB * 100) / 100
    lastEmittedRef.current = emitted
    onChangeRef.current(emitted)
  }

  /** VoiceOver's swipe up and down: a tenth at a time. */
  const stepBy = (delta: number) => {
    if (disabled) return
    const nextB = Math.min(1, Math.max(0, Math.round((brightnessSV.get() + delta) * 10) / 10))
    brightnessSV.set(nextB)
    emitChange(nextB, true)
  }

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled)
        .minDistance(0)
        .onBegin((e) => {
          'worklet'
          draggingSV.set(1)
          const usable = Math.max(1, trackWidthSV.get() - LIGHT_PAD * 2 - LIGHT_THUMB_W)
          const nextB = Math.min(1, Math.max(0, (e.x - LIGHT_PAD - LIGHT_THUMB_W * 0.5) / usable))
          brightnessSV.set(nextB)
          scheduleOnRN(emitChange, nextB, true)
        })
        .onUpdate((e) => {
          'worklet'
          const usable = Math.max(1, trackWidthSV.get() - LIGHT_PAD * 2 - LIGHT_THUMB_W)
          const nextB = Math.min(1, Math.max(0, (e.x - LIGHT_PAD - LIGHT_THUMB_W * 0.5) / usable))
          brightnessSV.set(nextB)
          scheduleOnRN(emitChange, nextB, false)
        })
        .onFinalize(() => {
          'worklet'
          const finalB = brightnessSV.get()
          draggingSV.set(0)
          scheduleOnRN(emitChange, finalB, true)
        }),
    [brightnessSV, draggingSV, trackWidthSV, disabled],
  )

  const fillFrom = fillColors?.[0] ?? 'rgba(255, 255, 255, 0.12)'
  const fillTo = fillColors?.[1] ?? 'rgba(255, 255, 255, 0.12)'
  const fillStyle = useAnimatedStyle(() => {
    const usable = Math.max(1, trackWidthSV.get() - LIGHT_PAD * 2 - LIGHT_THUMB_W)
    const x = LIGHT_PAD + brightnessSV.get() * usable
    return {
      width: Math.max(LIGHT_THUMB_W + LIGHT_PAD * 2, x + LIGHT_THUMB_W + LIGHT_PAD),
      backgroundColor: interpolateColor(brightnessSV.get(), [0, 1], [fillFrom, fillTo]),
    }
  })

  const thumbStyle = useAnimatedStyle(() => {
    const usable = Math.max(1, trackWidthSV.get() - LIGHT_PAD * 2 - LIGHT_THUMB_W)
    const x = LIGHT_PAD + brightnessSV.get() * usable
    const active = draggingSV.get() === 1
    return {
      transform: [
        { translateX: x },
        {
          scale: withSpring(active ? 1.08 : 1, {
            duration: 180,
            dampingRatio: 0.8,
            reduceMotion: ReduceMotion.System,
          }),
        },
      ],
    }
  })


  return (
    <View style={[styles.lightOuter, disabled ? styles.lightLocked : null]}>
      {/* One row above the slider: what it is, and where it's set now. */}
      <View style={styles.lightMetaRow}>
        <Text style={[styles.lightMetaTitle, { color: color.ink3 }]}>{title}</Text>
        <Text style={[styles.lightMetaStage, { color: color.accent }]}>{valueLabel(liveBrightness)}</Text>
      </View>
      <GestureDetector gesture={panGesture}>
        <View
          onLayout={(e: LayoutChangeEvent) => {
            trackWidthSV.set(Math.max(1, e.nativeEvent.layout.width))
          }}
          accessible
          accessibilityRole="adjustable"
          accessibilityState={{ disabled }}
          accessibilityLabel={label ?? title}
          accessibilityValue={{ text: valueLabel(liveBrightness) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => stepBy(e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)}
          style={[
            styles.lightSlider,
            {
              backgroundColor: 'rgba(16, 18, 24, 0.88)',
              borderColor: 'rgba(255, 255, 255, 0.14)',
              borderCurve: 'continuous',
            },
          ]}
        >
          {/* Smooth UI-thread luminous fill */}
          <Reanimated.View
            pointerEvents="none"
            style={[
              styles.lightSliderFill,
              { borderCurve: 'continuous' },
              fillStyle,
            ]}
          />

          <View pointerEvents="none" style={styles.lightEndLeft}>
            {left}
          </View>
          <View pointerEvents="none" style={[styles.lightEndRight, { opacity: 0.4 + liveBrightness * 0.6 }]}>
            {right}
          </View>

          {/* Smooth 120fps UI-thread physical thumb */}
          <Reanimated.View
            pointerEvents="none"
            style={[
              styles.lightThumb,
              {
                backgroundColor: color.ink,
                borderColor: 'rgba(255, 255, 255, 0.45)',
                borderCurve: 'continuous',
              },
              thumbStyle,
            ]}
          >
            <View style={styles.lightThumbGrip} />
          </Reanimated.View>
        </View>
      </GestureDetector>
    </View>
  )
}

/* --- Continuous 120fps Reanimated Horizontal Slider ---------------------- */

const SLIDER_THUMB = 20

export function Slider({
  value,
  onChange,
  label,
  dimmed,
}: {
  value: number
  onChange: (v: number) => void
  label: string
  dimmed?: boolean
}) {
  const { color } = useTokenColors()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const lastEmitMsRef = useRef(0)
  const lastTouchMsRef = useRef(0)

  const valSV = useSharedValue(Math.min(1, Math.max(0, value)))
  const widthSV = useSharedValue(240)
  const draggingSV = useSharedValue(0)

  const lastEmittedRef = useRef<number | null>(null)
  const [liveVal, setLiveVal] = useState(() => Math.min(1, Math.max(0, value)))

  // Outside changes only: our own value coming back is skipped (ISS-19).
  useEffect(() => {
    if (draggingSV.get() !== 0 || value === lastEmittedRef.current) return
    valSV.set(Math.min(1, Math.max(0, value)))
    setLiveVal(Math.min(1, Math.max(0, value)))
  }, [value, valSV, draggingSV])

  const emitVal = (next: number, force: boolean) => {
    const now = Date.now()
    lastTouchMsRef.current = now
    if (!force && now - lastEmitMsRef.current < 60) return
    lastEmitMsRef.current = now
    const emitted = Math.round(Math.min(1, Math.max(0, next)) * 100) / 100
    lastEmittedRef.current = emitted
    setLiveVal(emitted)
    onChangeRef.current(emitted)
  }

  /** VoiceOver's swipe up and down: a tenth at a time. */
  const stepBy = (delta: number) => {
    const next = Math.min(1, Math.max(0, Math.round((valSV.get() + delta) * 10) / 10))
    valSV.set(next)
    emitVal(next, true)
  }

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => {
          'worklet'
          draggingSV.set(1)
          const usable = Math.max(1, widthSV.get() - SLIDER_THUMB)
          const next = Math.min(1, Math.max(0, (e.x - SLIDER_THUMB * 0.5) / usable))
          valSV.set(next)
          scheduleOnRN(emitVal, next, true)
        })
        .onUpdate((e) => {
          'worklet'
          const usable = Math.max(1, widthSV.get() - SLIDER_THUMB)
          const next = Math.min(1, Math.max(0, (e.x - SLIDER_THUMB * 0.5) / usable))
          valSV.set(next)
          scheduleOnRN(emitVal, next, false)
        })
        .onFinalize(() => {
          'worklet'
          const finalV = valSV.get()
          draggingSV.set(0)
          scheduleOnRN(emitVal, finalV, true)
        }),
    [valSV, widthSV, draggingSV],
  )

  const fillStyle = useAnimatedStyle(() => ({
    width: Math.max(0, valSV.get() * widthSV.get()),
  }))

  const thumbStyle = useAnimatedStyle(() => {
    const usable = Math.max(0, widthSV.get() - SLIDER_THUMB)
    const active = draggingSV.get() === 1
    return {
      transform: [
        { translateX: valSV.get() * usable },
        {
          scale: withSpring(active ? 1.15 : 1, {
            duration: 160,
            dampingRatio: 0.78,
            reduceMotion: ReduceMotion.System,
          }),
        },
      ],
    }
  })

  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={(e) => {
          widthSV.set(Math.max(1, e.nativeEvent.layout.width))
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(liveVal * 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => stepBy(e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)}
        style={styles.sliderWrap}
      >
        <View pointerEvents="none" style={[styles.sliderTrack, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
          <Reanimated.View
            style={[
              styles.sliderFill,
              {
                backgroundColor: color.accent,
                opacity: dimmed ? 0.3 : 1,
              },
              fillStyle,
            ]}
          />
        </View>
        <Reanimated.View
          pointerEvents="none"
          style={[
            styles.sliderThumb,
            {
              backgroundColor: color.ink,
              borderColor: 'rgba(0,0,0,0.28)',
            },
            thumbStyle,
          ]}
        />
      </View>
    </GestureDetector>
  )
}

/* --- Segmented ----------------------------------------------------------- */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  const { color } = useTokenColors()
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[
        styles.seg,
        {
          backgroundColor: 'rgba(10, 12, 16, 0.85)',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          borderCurve: 'continuous',
        },
      ]}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => {
              if (o.value === value) return
              feel('tick')
              onChange(o.value)
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            style={[
              styles.segOpt,
              active
                ? {
                    backgroundColor: 'rgba(255, 255, 255, 0.12)',
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: 'rgba(255, 255, 255, 0.22)',
                    borderCurve: 'continuous',
                  }
                : null,
            ]}
          >
            <Text style={[styles.segText, { color: active ? color.ink : color.ink3 }]}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/* --- Toggle -------------------------------------------------------------- */

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  const { color } = useTokenColors()
  return (
    <Pressable
      onPress={() => {
        feel('tick')
        onChange(!checked)
      }}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      style={[
        styles.toggle,
        { backgroundColor: checked ? color.accent : 'rgba(255, 255, 255, 0.14)' },
      ]}
    >
      <View
        style={[
          styles.toggleKnob,
          {
            backgroundColor: checked ? color.accentInk : color.ink2,
            transform: [{ translateX: checked ? 20 : 0 }],
          },
        ]}
      />
    </Pressable>
  )
}

/* --- Sheet (uniform continuous border — zero iOS corner clip notch) ------ */

const SHEET_RESIZE = LinearTransition.duration(260).easing(REasing.bezier(0.32, 0.72, 0, 1)).reduceMotion(ReduceMotion.System)

/**
 * Lets a control inside a sheet stop the sheet scrolling while a finger is on
 * it (a vertical fader would otherwise move the sheet too).
 */
const SheetScrollLock = createContext<(locked: boolean) => void>(() => {})
export const useSheetScrollLock = () => useContext(SheetScrollLock)

export function Sheet({
  open,
  onClose,
  children,
  label,
  footer,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  label: string
  /** Pinned under the content (a "Got it" button): always in reach, the content scrolls behind it. */
  footer?: ReactNode
}) {
  const insets = useSafeAreaInsets()
  // While open, the moving scene behind it rests (it's dimmed under the sheet anyway).
  useCoverScreen(open)
  const [scrollLocked, setScrollLocked] = useState(false)
  // Reanimated, like the rest of the app (RN's Animated warned "onAnimatedValueUpdate with no listeners").
  const translateY = useSharedValue(360)
  const backdropOpacity = useSharedValue(0)
  // Stays mounted through the exit so closing slides down instead of vanishing.
  const [mounted, setMounted] = useState(open)
  const sheetHeight = useRef(360)

  useEffect(() => {
    const ease = REasing.bezier(0.32, 0.72, 0, 1)
    if (!open) {
      if (!mounted) return
      backdropOpacity.set(withTiming(0, { duration: 200 }))
      translateY.set(
        withTiming(sheetHeight.current + 24, { duration: 220, easing: ease }, (finished) => {
          if (finished) scheduleOnRN(setMounted, false)
        }),
      )
      return
    }
    setMounted(true)
    translateY.set(360)
    backdropOpacity.set(0)
    backdropOpacity.set(withTiming(1, { duration: 200 }))
    translateY.set(withTiming(0, { duration: 300, easing: ease }))
  }, [open, translateY, backdropOpacity])

  // Dragging it down runs exactly what tapping outside runs: the latest
  // onClose, not the one from the first render (ISS-15.2).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const dismissResponder = useRef(
    PanResponder.create({
      // The grab area is only for dragging, so it takes the touch at once
      // and doesn't give it up (NAT-06: on device the drag never started).
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        translateY.set(Math.max(0, g.dy))
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.6) {
          onCloseRef.current()
        } else {
          translateY.set(withSpring(0, { duration: 260, dampingRatio: 1 }))
        }
      },
      onPanResponderTerminate: () => {
        translateY.set(withSpring(0, { duration: 260, dampingRatio: 1 }))
      },
    }),
  ).current

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.get() }))
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.get() }] }))

  return (
    <Layer visible={mounted} onRequestClose={onClose} label={label}>
      {/* Rises with the keyboard, so a field in the sheet is never hidden under it. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetRoot}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <Reanimated.View style={[styles.sheetBackdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sheet" />
        </Reanimated.View>

        <Reanimated.View style={[styles.sheetWrap, sheetStyle]}>
          {/* Height changes (a check-in step, a longer page) animate instead of jumping. */}
          <Reanimated.View
            layout={SHEET_RESIZE}
            onLayout={(e: LayoutChangeEvent) => {
              sheetHeight.current = e.nativeEvent.layout.height
            }}
            style={styles.sheetCard}
          >
            {/* Swipe-to-dismiss lives ONLY on the top grab area so vertical faders/sliders never drag the sheet */}
            <View {...dismissResponder.panHandlers} style={styles.sheetGrabArea}>
              <View style={[styles.sheetGrab, { backgroundColor: 'rgba(255, 255, 255, 0.28)' }]} />
            </View>
            {/* The home-indicator space is inside the scroll, so long sheets run to the bottom edge. */}
            {/* The bottom inset is counted once, here: "never" stops iOS adding the
                home-indicator inset to the scroll a second time (an empty band under every sheet). */}
            <ScrollView
              bounces={false}
              contentInsetAdjustmentBehavior="never"
              automaticallyAdjustsScrollIndicatorInsets={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              scrollEnabled={!scrollLocked}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: footer ? 16 : Math.max(insets.bottom, 12) + 4 }}
            >
              <SheetScrollLock.Provider value={setScrollLocked}>{children}</SheetScrollLock.Provider>
            </ScrollView>
            {footer ? <View style={[styles.sheetFooter, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>{footer}</View> : null}
          </Reanimated.View>
        </Reanimated.View>
      </KeyboardAvoidingView>
    </Layer>
  )
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnText: {
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  btnTextPrimary: {
    fontWeight: '600',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdBtn: {
    width: '100%',
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  lightOuter: {
    width: '100%',
    gap: 8,
  },
  lightLocked: {
    opacity: 0.62,
  },
  lightSlider: {
    height: 52,
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  lightSliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 16,
  },
  lightEndLeft: {
    position: 'absolute',
    left: 14,
  },
  lightEndRight: {
    position: 'absolute',
    right: 14,
  },
  lightThumb: {
    position: 'absolute',
    left: 0,
    width: LIGHT_THUMB_W,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightThumbGrip: {
    width: 2.5,
    height: 14,
    borderRadius: 2,
    backgroundColor: 'rgba(18, 16, 11, 0.45)',
  },
  lightMetaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  lightMetaStage: {
    fontSize: 13,
    fontWeight: '500',
  },
  lightMetaTitle: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  sliderWrap: {
    height: 32,
    width: '100%',
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 4,
    width: '100%',
    borderRadius: 99,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
  },
  sliderThumb: {
    position: 'absolute',
    left: 0,
    width: SLIDER_THUMB,
    height: SLIDER_THUMB,
    borderRadius: SLIDER_THUMB / 2,
    borderWidth: 1,
  },
  seg: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    gap: 3,
  },
  segOpt: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    padding: 3,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  menuList: {
    gap: 4,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.70)',
  },
  sheetWrap: {
    width: '100%',
    maxWidth: FRAME_MAX_WIDTH + 40,
    maxHeight: '86%',
  },
  sheetCard: {
    width: '100%',
    // Shrinks to the 86% cap so long sheets scroll inside instead of running off screen.
    flexShrink: 1,
    backgroundColor: '#0E1016',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderCurve: 'continuous',
    borderTopWidth: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingTop: 2,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  sheetFooter: {
    paddingTop: 10,
    backgroundColor: '#0E1016',
  },
  sheetGrabArea: {
    width: '100%',
    // A strip to drag from, not just the 4pt bar.
    paddingTop: 12,
    paddingBottom: 16,
    alignItems: 'center',
  },
  sheetGrab: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
})
