import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Animated,
  Easing,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
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
  const bg =
    variant === 'primary'
      ? color.accent
      : variant === 'quiet'
        ? 'rgba(22, 24, 31, 0.72)'
        : 'transparent'
  const fg = variant === 'primary' ? color.accentInk : variant === 'quiet' ? color.ink : color.ink2
  const borderColor = variant === 'quiet' ? 'rgba(255, 255, 255, 0.14)' : 'transparent'

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
          borderWidth: variant === 'quiet' ? 1 : 0,
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

/* --- Tactile Liquid Glass LightSlider (with physical thumb & readout) --- */

function lightMoodLabel(light: number): string {
  if (light < 0.2) return 'Clear'
  if (light < 0.5) return 'Soft warm'
  if (light < 0.78) return 'Candlelight'
  return 'Deep ember'
}

export function LightSlider({
  value,
  onChange,
  label = 'In-app night light',
}: {
  value: number
  onChange: (nextLight: number) => void
  label?: string
}) {
  const { color } = useTokenColors()
  const hapticsOn = useSettings((s) => s.haptics)
  const [trackW, setTrackW] = useState(300)
  const widthRef = useRef(300)
  const lastStepRef = useRef(Math.round((1 - value) * 10))
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const hapticsRef = useRef(hapticsOn)
  hapticsRef.current = hapticsOn

  const brightness = Math.min(1, Math.max(0, 1 - value))
  const pct = Math.round(brightness * 100)
  const thumbW = 24
  const pad = 6
  const usableW = Math.max(1, trackW - pad * 2 - thumbW)
  const thumbX = pad + brightness * usableW

  const updateFromX = (x: number) => {
    const w = Math.max(1, widthRef.current - pad * 2)
    const b = Math.min(1, Math.max(0, (x - pad) / w))
    const nextLight = Math.round((1 - b) * 50) / 50
    const step10 = Math.round(b * 10)
    if (step10 !== lastStepRef.current) {
      lastStepRef.current = step10
      if (hapticsRef.current) haptics.play('light')
    }
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
    <View style={styles.lightOuter}>
      <View
        {...panResponder.panHandlers}
        onLayout={(e: LayoutChangeEvent) => {
          widthRef.current = e.nativeEvent.layout.width
          setTrackW(e.nativeEvent.layout.width)
        }}
        accessibilityRole="adjustable"
        accessibilityLabel={`${label}, ${pct} percent`}
        style={[
          styles.lightSlider,
          {
            backgroundColor: 'rgba(18, 20, 26, 0.86)',
            borderColor: 'rgba(255, 255, 255, 0.14)',
            borderCurve: 'continuous',
          },
        ]}
      >
        {/* Warm golden-brass luminous fill */}
        <View
          pointerEvents="none"
          style={[
            styles.lightSliderFill,
            {
              width: Math.max(thumbW + pad * 2, thumbX + thumbW + pad),
              backgroundColor: 'rgba(194, 161, 95, 0.24)',
              borderCurve: 'continuous',
            },
          ]}
        />

        {/* End icons */}
        <View pointerEvents="none" style={styles.lightEndLeft}>
          <Moon size={16} strokeWidth={1.65} color={color.ink3} />
        </View>
        <View pointerEvents="none" style={styles.lightEndRight}>
          <Sun size={17} strokeWidth={1.65} color={color.accent} style={{ opacity: 0.45 + brightness * 0.55 }} />
        </View>

        {/* Tactile brass-rimmed thumb */}
        <View
          pointerEvents="none"
          style={[
            styles.lightThumb,
            {
              left: thumbX,
              backgroundColor: color.accent,
              borderColor: 'rgba(255, 245, 224, 0.45)',
              borderCurve: 'continuous',
            },
          ]}
        >
          <View style={styles.lightThumbGrip} />
        </View>
      </View>

      <View style={styles.lightMetaRow}>
        <Text style={[styles.lightMetaStage, { color: color.ink2 }]}>{lightMoodLabel(value)}</Text>
        <Text style={[styles.lightMetaPct, { color: color.accent }]}>{pct}% in-app light</Text>
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
      <View pointerEvents="none" style={[styles.sliderTrack, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
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
            borderColor: 'rgba(0,0,0,0.28)',
            transform: [{ translateX: Math.max(0, Math.min(trackW - 22, clamped * (trackW - 22))) }],
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
                    backgroundColor: 'rgba(194, 161, 95, 0.18)',
                    borderWidth: 1,
                    borderColor: 'rgba(194, 161, 95, 0.45)',
                    borderCurve: 'continuous',
                  }
                : null,
            ]}
          >
            <Text style={[styles.segText, { color: active ? color.accent : color.ink3 }]}>{o.label}</Text>
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

  useEffect(() => {
    if (open) {
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
              backgroundColor: Platform.OS === 'ios' ? 'rgba(18, 20, 26, 0.76)' : 'rgba(16, 18, 24, 0.96)',
              borderColor: 'rgba(255, 255, 255, 0.14)',
              borderCurve: 'continuous',
              paddingBottom: Math.max(insets.bottom, 16) + 14,
              transform: [{ translateY }],
            },
          ]}
        >
          {Platform.OS === 'ios' && (
            <BlurView intensity={60} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFill} />
          )}
          <View style={[styles.sheetGrab, { backgroundColor: 'rgba(255, 255, 255, 0.24)' }]} />
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
    width: 24,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  lightMetaStage: {
    fontSize: 13,
    fontWeight: '500',
  },
  lightMetaPct: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  sliderWrap: {
    height: 36,
    width: '100%',
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 5,
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
    width: 22,
    height: 22,
    borderRadius: 11,
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
  sheetCard: {
    width: '100%',
    maxWidth: FRAME_MAX_WIDTH,
    maxHeight: '86%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    marginBottom: -1,
    overflow: 'hidden',
    paddingTop: 10,
    paddingHorizontal: 22,
  },
  sheetGrab: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
})
