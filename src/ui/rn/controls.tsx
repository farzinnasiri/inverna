import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Animated,
  Easing,
  PanResponder,
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
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, Moon, Sun } from 'lucide-react-native'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useSettings } from '@/ui/state/settings'
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
  // Primary is brass ink on obsidian with a brass hairline, never a solid brass
  // slab: it leads without shouting at night.
  const bg =
    variant === 'primary'
      ? 'rgba(194, 161, 95, 0.10)'
      : variant === 'quiet'
        ? 'rgba(22, 24, 31, 0.72)'
        : 'transparent'
  const fg = variant === 'primary' ? color.accent : variant === 'quiet' ? color.ink : color.ink2
  const borderColor =
    variant === 'primary' ? 'rgba(194, 161, 95, 0.55)' : variant === 'quiet' ? 'rgba(255, 255, 255, 0.14)' : 'transparent'

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.btn,
        {
          height: isSm ? 40 : 50,
          paddingHorizontal: isSm ? 16 : 22,
          borderRadius: isSm ? 20 : 16,
          borderCurve: 'continuous',
          backgroundColor: bg,
          borderWidth: variant === 'ghost' ? 0 : 1,
          borderColor,
          width: block ? '100%' : undefined,
          opacity: disabled ? 0.35 : pressed ? 0.86 : 1,
          transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {typeof children === 'string' ? (
        <Text style={[styles.btnText, { color: fg, fontSize: isSm ? 15 : 16 }]}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  )
}

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

/* --- Continuous 120fps Reanimated LightSlider ---------------------------- */

function lightMoodLabel(light: number): string {
  if (light < 0.2) return 'Clear'
  if (light < 0.5) return 'Soft warm'
  if (light < 0.78) return 'Candlelight'
  return 'Deep ember'
}

const LIGHT_THUMB_W = 24
const LIGHT_PAD = 6

/** The night light, on the shared pill slider: left is dim and warm, right is bright. */
export function LightSlider({
  value,
  onChange,
  label = 'Night light',
  title = 'Night light',
}: {
  value: number
  onChange: (nextLight: number) => void
  label?: string
  title?: string
}) {
  const { color } = useTokenColors()
  return (
    <PillSlider
      value={1 - value}
      onChange={(b) => onChange(Math.round((1 - b) * 100) / 100)}
      title={title}
      label={label}
      valueLabel={(b) => lightMoodLabel(1 - b)}
      left={<Moon size={16} strokeWidth={1.65} color={color.ink3} />}
      right={<Sun size={17} strokeWidth={1.65} color={color.accent} />}
    />
  )
}

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
}: {
  value: number
  onChange: (position: number) => void
  title: string
  valueLabel: (position: number) => string
  left?: ReactNode
  right?: ReactNode
  label?: string
}) {
  const { color } = useTokenColors()
  const hapticsOn = useSettings((s) => s.haptics)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const hapticsRef = useRef(hapticsOn)
  hapticsRef.current = hapticsOn
  const lastEmitMsRef = useRef(0)
  /** When the finger last moved the slider; props arriving soon after are our own echoes. */
  const lastTouchMsRef = useRef(0)
  const lastHapticTickRef = useRef(Math.round(value * 10))

  const brightnessSV = useSharedValue(Math.min(1, Math.max(0, value)))
  const trackWidthSV = useSharedValue(300)
  const draggingSV = useSharedValue(0)
  const [liveBrightness, setLiveBrightness] = useState(() => Math.min(1, Math.max(0, value)))

  // Follow outside changes only. While dragging, and for a moment after, the
  // incoming value is a delayed echo of an earlier emit: applying it would pull
  // the thumb back and then forward again.
  useEffect(() => {
    if (draggingSV.get() !== 0 || Date.now() - lastTouchMsRef.current < 700) return
    const nextB = Math.min(1, Math.max(0, value))
    brightnessSV.set(nextB)
    setLiveBrightness(nextB)
  }, [value, brightnessSV, draggingSV])

  const emitChange = (nextB: number, force: boolean) => {
    const now = Date.now()
    lastTouchMsRef.current = now
    const clampedB = Math.min(1, Math.max(0, nextB))
    const tick10 = Math.round(clampedB * 10)
    if (tick10 !== lastHapticTickRef.current) {
      lastHapticTickRef.current = tick10
      if (hapticsRef.current) haptics.play('light')
    }
    // Each change re-tints the whole app, so ~11 Hz while dragging; the thumb
    // itself follows the finger on the UI thread at full frame rate.
    if (!force && now - lastEmitMsRef.current < 90) return
    lastEmitMsRef.current = now
    setLiveBrightness(clampedB)
    onChangeRef.current(Math.round(clampedB * 100) / 100)
  }

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
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
    [brightnessSV, draggingSV, trackWidthSV],
  )

  const fillStyle = useAnimatedStyle(() => {
    const usable = Math.max(1, trackWidthSV.get() - LIGHT_PAD * 2 - LIGHT_THUMB_W)
    const x = LIGHT_PAD + brightnessSV.get() * usable
    return {
      width: Math.max(LIGHT_THUMB_W + LIGHT_PAD * 2, x + LIGHT_THUMB_W + LIGHT_PAD),
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
    <View style={styles.lightOuter}>
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
          accessibilityRole="adjustable"
          accessibilityLabel={`${label ?? title}, ${valueLabel(liveBrightness)}`}
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
              {
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                borderCurve: 'continuous',
              },
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

  // Outside changes only: right after a drag the incoming value is our own late echo.
  useEffect(() => {
    if (draggingSV.get() !== 0 || Date.now() - lastTouchMsRef.current < 700) return
    valSV.set(Math.min(1, Math.max(0, value)))
  }, [value, valSV, draggingSV])

  const emitVal = (next: number, force: boolean) => {
    const now = Date.now()
    lastTouchMsRef.current = now
    if (!force && now - lastEmitMsRef.current < 60) return
    lastEmitMsRef.current = now
    onChangeRef.current(Math.round(Math.min(1, Math.max(0, next)) * 100) / 100)
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
        accessibilityRole="adjustable"
        accessibilityLabel={label}
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
            onPress={() => onChange(o.value)}
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
      onPress={() => onChange(!checked)}
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

/* --- PopoverMenu (sheet-hosted picker for native reliability) ------------ */

export function PopoverMenu<T extends string | number | null>({
  open,
  onClose,
  options,
  value,
  onSelect,
  label,
}: {
  open: boolean
  onClose: () => void
  options: readonly { value: T; label: string }[]
  value: T
  onSelect: (v: T) => void
  label: string
}) {
  const { color } = useTokenColors()
  return (
    <Sheet open={open} onClose={onClose} label={label}>
      <Text style={[styles.menuTitle, { color: color.ink }]}>{label}</Text>
      <View style={styles.menuList}>
        {options.map((o) => {
          const selected = o.value === value
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => {
                onSelect(o.value)
                onClose()
              }}
              style={({ pressed }) => [
                styles.menuRow,
                {
                  backgroundColor: selected ? color.surface3 : pressed ? color.surface2 : 'transparent',
                },
              ]}
            >
              <Text style={[styles.menuLabel, { color: selected ? color.ink : color.ink2 }]}>{o.label}</Text>
              {selected && <Check size={17} strokeWidth={1.75} color={color.accent} />}
            </Pressable>
          )
        })}
      </View>
    </Sheet>
  )
}

/* --- Sheet (uniform continuous border — zero iOS corner clip notch) ------ */

const SHEET_RESIZE = LinearTransition.duration(260).easing(REasing.bezier(0.32, 0.72, 0, 1)).reduceMotion(ReduceMotion.System)

export function Sheet({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  label: string
}) {
  const insets = useSafeAreaInsets()
  const translateY = useRef(new Animated.Value(360)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current
  // Stays mounted through the exit so closing slides down instead of vanishing.
  const [mounted, setMounted] = useState(open)
  const sheetHeight = useRef(360)

  useEffect(() => {
    if (!open) {
      if (!mounted) return
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, {
          toValue: sheetHeight.current + 24,
          duration: 220,
          easing: Easing.bezier(0.32, 0.72, 0, 1),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false)
      })
      return
    }
    setMounted(true)
    {
      translateY.setValue(360)
      backdropOpacity.setValue(0)
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          easing: Easing.bezier(0.32, 0.72, 0, 1),
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [open, translateY, backdropOpacity])

  const dismissResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 14 && Math.abs(g.dy) > Math.abs(g.dx) * 1.3,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy)
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.6) {
          onClose()
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start()
        }
      },
    }),
  ).current

  return (
    <Layer visible={mounted} onRequestClose={onClose} label={label}>
      <View style={styles.sheetRoot} pointerEvents={open ? 'auto' : 'none'}>
        <Animated.View style={[styles.sheetBackdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sheet" />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheetWrap,
            {
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Height changes (a check-in step, a longer page) animate instead of jumping. */}
          <Reanimated.View
            layout={SHEET_RESIZE}
            onLayout={(e: LayoutChangeEvent) => {
              sheetHeight.current = e.nativeEvent.layout.height
            }}
            style={[
              styles.sheetCard,
              {
                paddingBottom: Math.max(insets.bottom, 16) + 12,
              },
            ]}
          >
            {/* Swipe-to-dismiss lives ONLY on the top grab area so vertical faders/sliders never drag the sheet */}
            <View {...dismissResponder.panHandlers} style={styles.sheetGrabArea}>
              <View style={[styles.sheetGrab, { backgroundColor: 'rgba(255, 255, 255, 0.28)' }]} />
            </View>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          </Reanimated.View>
        </Animated.View>
      </View>
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
  sheetGrabArea: {
    width: '100%',
    paddingTop: 10,
    paddingBottom: 14,
    alignItems: 'center',
  },
  sheetGrab: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
})
