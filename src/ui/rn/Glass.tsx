import type { ComponentType, ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { requireOptionalNativeModule } from 'expo'
import { haptics } from '@/platform'
import { useSettings } from '@/ui/state/settings'

export type GlassVariant = 'chrome' | 'card' | 'elevated' | 'pill'

type NativeGlassViewProps = ViewProps & {
  glassEffectStyle?: 'clear' | 'regular' | 'none'
  tintColor?: string
  isInteractive?: boolean
  colorScheme?: 'auto' | 'light' | 'dark'
}

type NativeGlassContainerProps = ViewProps & {
  spacing?: number
}

interface NativeGlassBinding {
  GlassView: ComponentType<NativeGlassViewProps>
  GlassContainer: ComponentType<NativeGlassContainerProps>
}

let cachedBinding: NativeGlassBinding | null | undefined

/**
 * Safely detects whether Apple's native iOS 26 Liquid Glass module (`expo-glass-effect`)
 * is both compiled into the current native binary AND supported by the OS.
 * Returns null on Web, Android, older iOS versions, or dev-client builds made before
 * `expo-glass-effect` was linked — preventing runtime crashes during Fast Refresh.
 */
function getNativeGlassBinding(): NativeGlassBinding | null {
  if (cachedBinding !== undefined) return cachedBinding
  if (Platform.OS !== 'ios') {
    cachedBinding = null
    return null
  }
  try {
    const mod = requireOptionalNativeModule<{ isLiquidGlassAvailable?: boolean }>('ExpoGlassEffect')
    if (!mod?.isLiquidGlassAvailable) {
      cachedBinding = null
      return null
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('expo-glass-effect') as {
      GlassView?: ComponentType<NativeGlassViewProps>
      GlassContainer?: ComponentType<NativeGlassContainerProps>
    }
    if (pkg.GlassView && pkg.GlassContainer) {
      cachedBinding = {
        GlassView: pkg.GlassView,
        GlassContainer: pkg.GlassContainer,
      }
      return cachedBinding
    }
  } catch {
    // Native module absent or unavailable; use clean BlurView glass fallback.
  }
  cachedBinding = null
  return null
}

const VARIANT_CONFIG: Record<
  GlassVariant,
  {
    iosIntensity: number
    iosBg: string
    fallbackBg: string
    nativeTint: string
    nativeStyle: 'clear' | 'regular'
    border: string
  }
> = {
  chrome: {
    iosIntensity: 52,
    iosBg: 'rgba(24, 26, 32, 0.54)',
    fallbackBg: 'rgba(20, 22, 28, 0.90)',
    nativeTint: 'rgba(24, 26, 32, 0.34)',
    nativeStyle: 'regular',
    border: 'rgba(255, 255, 255, 0.14)',
  },
  card: {
    iosIntensity: 28,
    iosBg: 'rgba(18, 20, 26, 0.68)',
    fallbackBg: 'rgba(14, 16, 20, 0.92)',
    nativeTint: 'rgba(18, 20, 26, 0.46)',
    nativeStyle: 'clear',
    border: 'rgba(255, 255, 255, 0.10)',
  },
  elevated: {
    iosIntensity: 64,
    iosBg: 'rgba(26, 28, 36, 0.72)',
    fallbackBg: 'rgba(22, 24, 30, 0.96)',
    nativeTint: 'rgba(26, 28, 36, 0.50)',
    nativeStyle: 'regular',
    border: 'rgba(255, 255, 255, 0.16)',
  },
  pill: {
    iosIntensity: 42,
    iosBg: 'rgba(24, 26, 34, 0.60)',
    fallbackBg: 'rgba(22, 24, 30, 0.92)',
    nativeTint: 'rgba(24, 26, 34, 0.38)',
    nativeStyle: 'regular',
    border: 'rgba(255, 255, 255, 0.13)',
  },
}

const ACCENT_BORDER = 'rgba(194, 161, 95, 0.58)'
const ACCENT_TINT = 'rgba(194, 161, 95, 0.16)'
const ACCENT_BG = 'rgba(34, 29, 20, 0.76)'

/**
 * Container that lets adjacent native iOS 26 Liquid Glass surfaces merge and morph
 * seamlessly (`GlassContainer`), falling back to a plain `View` elsewhere.
 */
export function GlassGroup({
  spacing = 12,
  style,
  children,
  pointerEvents,
}: {
  spacing?: number
  style?: StyleProp<ViewStyle>
  children: ReactNode
  pointerEvents?: ViewProps['pointerEvents']
}) {
  const native = getNativeGlassBinding()
  if (native) {
    const NativeContainer = native.GlassContainer
    return (
      <NativeContainer spacing={spacing} pointerEvents={pointerEvents} style={style}>
        {children}
      </NativeContainer>
    )
  }
  return (
    <View pointerEvents={pointerEvents} style={style}>
      {children}
    </View>
  )
}

/**
 * Unified Liquid Glass surface primitive used across TabIsland, GameShell,
 * Sheets, Home cards, and Onboarding.
 *
 * Uses Apple's native `expo-glass-effect` (`GlassView`) when running on an iOS 26+
 * native build, and a clean single-border continuous-corner `BlurView` fallback on
 * Web, Android, and earlier builds (never mixing per-side border colors on rounded
 * views, which causes Core Animation corner clipping artifacts on iOS).
 */
export function GlassSurface({
  variant = 'card',
  radius = 20,
  accent,
  interactive = false,
  style,
  children,
}: {
  variant?: GlassVariant
  radius?: number
  accent?: boolean
  interactive?: boolean
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const cfg = VARIANT_CONFIG[variant]
  const native = getNativeGlassBinding()

  if (native) {
    const NativeGlassView = native.GlassView
    return (
      <NativeGlassView
        glassEffectStyle={cfg.nativeStyle}
        colorScheme="dark"
        isInteractive={interactive}
        tintColor={accent ? ACCENT_TINT : cfg.nativeTint}
        style={[
          styles.nativeBase,
          {
            borderRadius: radius,
            borderCurve: 'continuous',
            borderWidth: accent ? 1 : StyleSheet.hairlineWidth,
            borderColor: accent ? ACCENT_BORDER : 'rgba(255, 255, 255, 0.10)',
          },
          style,
        ]}
      >
        {children}
      </NativeGlassView>
    )
  }

  return (
    <View
      style={[
        styles.base,
        {
          borderRadius: radius,
          borderCurve: 'continuous',
          backgroundColor: accent ? ACCENT_BG : Platform.OS === 'ios' ? cfg.iosBg : cfg.fallbackBg,
          borderColor: accent ? ACCENT_BORDER : cfg.border,
        },
        style,
      ]}
    >
      {Platform.OS === 'ios' && (
        <BlurView
          intensity={cfg.iosIntensity}
          tint="systemChromeMaterialDark"
          style={StyleSheet.absoluteFill}
        />
      )}
      {children}
    </View>
  )
}

/**
 * Interactive Liquid Glass pressable with uniform tactile scale + optional haptic feedback.
 */
export function GlassPressable({
  variant = 'pill',
  radius = 22,
  accent,
  disabled,
  hapticFeedback = true,
  onPress,
  accessibilityLabel,
  accessibilityRole = 'button',
  style,
  children,
}: {
  variant?: GlassVariant
  radius?: number
  accent?: boolean
  disabled?: boolean
  hapticFeedback?: boolean
  onPress?: () => void
  accessibilityLabel?: string
  accessibilityRole?: 'button' | 'tab'
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const hapticsOn = useSettings((s) => s.haptics)

  const handlePress = () => {
    if (disabled) return
    if (hapticFeedback && hapticsOn) {
      haptics.play('light')
    }
    onPress?.()
  }

  return (
    <Pressable
      disabled={disabled}
      onPress={handlePress}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        {
          opacity: disabled ? 0.36 : pressed ? 0.88 : 1,
          transform: [{ scale: pressed && !disabled ? 0.965 : 1 }],
        },
      ]}
    >
      <GlassSurface variant={variant} radius={radius} accent={accent} interactive style={style}>
        {children}
      </GlassSurface>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  nativeBase: {
    overflow: 'hidden',
  },
})
