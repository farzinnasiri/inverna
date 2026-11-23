import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, Sun } from 'lucide-react-native'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
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
  const bg = variant === 'primary' ? color.accent : variant === 'quiet' ? color.surface2 : 'transparent'
  const fg = variant === 'primary' ? color.accentInk : variant === 'quiet' ? color.ink : color.ink2
  const borderColor = variant === 'quiet' ? color.line : 'transparent'

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.btn,
        {
          height: isSm ? 40 : 48,
          paddingHorizontal: isSm ? 16 : 22,
          borderRadius: isSm ? 999 : 14,
          backgroundColor: bg,
          borderWidth: variant === 'quiet' ? 1 : 0,
          borderColor,
          width: block ? '100%' : undefined,
          opacity: disabled ? 0.35 : pressed ? 0.85 : 1,
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

/* --- Control-Center LightSlider (56px rounded track) -------------------- */

export function LightSlider({
  value,
  onChange,
  label = 'Light',
}: {
  value: number
  onChange: (nextLight: number) => void
  label?: string
}) {
  const { color } = useTokenColors()
  const widthRef = useRef(300)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const brightness = Math.min(1, Math.max(0, 1 - value))

  const updateFromX = (x: number) => {
    const w = Math.max(1, widthRef.current)
    const b = Math.min(1, Math.max(0, x / w))
    const nextLight = Math.round((1 - b) * 50) / 50
    onChangeRef.current(nextLight)
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => updateFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => updateFromX(e.nativeEvent.locationX),
    }),
  ).current

  return (
    <View
      {...panResponder.panHandlers}
      onLayout={(e: LayoutChangeEvent) => {
        widthRef.current = e.nativeEvent.layout.width
      }}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      style={[styles.lightSlider, { backgroundColor: color.surface2, borderColor: color.line }]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.lightSliderFill,
          { backgroundColor: color.surface3, width: `${Math.round(brightness * 100)}%` },
        ]}
      />
      <View pointerEvents="none" style={[styles.lightSliderIcon, { opacity: 0.35 + brightness * 0.65 }]}>
        <Sun size={20} strokeWidth={1.5} color={color.ink2} />
      </View>
    </View>
  )
}

/* --- Horizontal Slider --------------------------------------------------- */

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
  const [trackW, setTrackW] = useState(260)
  const widthRef = useRef(260)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const clamped = Math.min(1, Math.max(0, value))

  const updateFromX = (x: number) => {
    const w = Math.max(1, widthRef.current)
    const next = Math.round(Math.min(1, Math.max(0, x / w)) * 100) / 100
    onChangeRef.current(next)
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => updateFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => updateFromX(e.nativeEvent.locationX),
    }),
  ).current

  return (
    <View
      {...panResponder.panHandlers}
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width
        setTrackW(e.nativeEvent.layout.width)
      }}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      style={styles.sliderWrap}
    >
      <View pointerEvents="none" style={[styles.sliderTrack, { backgroundColor: color.surface3 }]}>
        <View
          style={[
            styles.sliderFill,
            {
              backgroundColor: color.accent,
              width: `${clamped * 100}%`,
              opacity: dimmed ? 0.3 : 1,
            },
          ]}
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.sliderThumb,
          {
            backgroundColor: color.ink,
            transform: [{ translateX: Math.max(0, Math.min(trackW - 20, clamped * (trackW - 20))) }],
          },
        ]}
      />
    </View>
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
      style={[styles.seg, { backgroundColor: color.bg, borderColor: color.line }]}
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
              active ? { backgroundColor: color.surface3 } : null,
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
        { backgroundColor: checked ? color.accent : color.surface3 },
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

/* --- Sheet --------------------------------------------------------------- */

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
  const { color } = useTokenColors()
  const insets = useSafeAreaInsets()
  const translateY = useRef(new Animated.Value(360)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (open) {
      translateY.setValue(360)
      backdropOpacity.setValue(0)
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 320,
          easing: Easing.bezier(0.32, 0.72, 0, 1),
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [open, translateY, backdropOpacity])

  const dismissResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx),
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
    <Layer visible={open} onRequestClose={onClose} label={label}>
      <View style={styles.sheetRoot}>
        <Animated.View style={[styles.sheetBackdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sheet" />
        </Animated.View>

        <Animated.View
          {...dismissResponder.panHandlers}
          style={[
            styles.sheetCard,
            {
              backgroundColor: color.surface1,
              borderColor: color.lineStrong,
              borderTopColor: 'rgba(220, 224, 230, 0.14)',
              paddingBottom: Math.max(insets.bottom, 16) + 12,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[styles.sheetGrab, { backgroundColor: color.ink4 }]} />
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
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
    height: 48,
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
  lightSlider: {
    height: 56,
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
  },
  lightSliderIcon: {
    position: 'absolute',
    right: 18,
  },
  sliderWrap: {
    height: 36,
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
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  seg: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    gap: 2,
  },
  segOpt: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segText: {
    fontSize: 14,
    fontWeight: '500',
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
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheetCard: {
    width: '100%',
    maxWidth: FRAME_MAX_WIDTH,
    maxHeight: '85%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 22,
  },
  sheetGrab: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },
})
