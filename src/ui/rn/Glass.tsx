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
 * is compiled into the current native binary AND supported by the OS.
 */
export function getNativeGlassBinding(): NativeGlassBinding | null {
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
    // Native module absent or unavailable; fall back cleanly.
  }
  cachedBinding = null
  return null
}

/**
 * Pure obsidian-silver Liquid Glass surfaces — zero muddy yellow/brown tint.
 * Antique brass accent lives cleanly on crisp borders, icons, and typography only.
 */
const VARIANT_CONFIG: Record<
  GlassVariant,
  {
    iosIntensity: number
    iosBg: string
    webBg: string
    nativeTint: string
    nativeStyle: 'clear' | 'regular'
    border: string
  }
> = {
  chrome: {
    iosIntensity: 48,
    iosBg: 'rgba(18, 20, 26, 0.44)',
    webBg: 'rgba(16, 18, 24, 0.74)',
    nativeTint: 'rgba(18, 20, 26, 0.24)',
    nativeStyle: 'regular',
    border: 'rgba(255, 255, 255, 0.14)',
  },
  card: {
    iosIntensity: 26,
    iosBg: 'rgba(15, 17, 23, 0.54)',
    webBg: 'rgba(14, 16, 22, 0.70)',
    nativeTint: 'rgba(16, 18, 24, 0.34)',
    nativeStyle: 'clear',
    border: 'rgba(255, 255, 255, 0.10)',
  },
  elevated: {
    iosIntensity: 58,
    iosBg: 'rgba(18, 20, 26, 0.76)',
    webBg: 'rgba(16, 18, 24, 0.90)',
    nativeTint: 'rgba(18, 20, 26, 0.52)',
    nativeStyle: 'regular',
    border: 'rgba(255, 255, 255, 0.15)',
  },
  pill: {
    iosIntensity: 38,
    iosBg: 'rgba(20, 22, 29, 0.48)',
    webBg: 'rgba(18, 20, 27, 0.76)',
    nativeTint: 'rgba(20, 22, 29, 0.30)',
    nativeStyle: 'regular',
    border: 'rgba(255, 255, 255, 0.13)',
  },
}

const ACCENT_BORDER = 'rgba(194, 161, 95, 0.46)'

const WEB_GLASS_STYLE =
  Platform.OS === 'web'
    ? ({ backdropFilter: 'blur(22px) saturate(140%)', WebkitBackdropFilter: 'blur(22px) saturate(140%)' } as unknown as ViewStyle)
    : null

/**
 * Groups glass surfaces into one native container (iOS 26), which renders
 * them together in one pass instead of one glass view each. Use it around any
 * set of repeated glass cards. Keep `spacing` below the gap between cards, or
 * neighbouring cards start to melt into each other.
 */
export function GlassGroup({
  spacing = 12,
  style,
  children,
  pointerEvents,
  onLayout,
}: {
  spacing?: number
  style?: StyleProp<ViewStyle>
  children: ReactNode
  pointerEvents?: ViewProps['pointerEvents']
  onLayout?: ViewProps['onLayout']
}) {
  const native = getNativeGlassBinding()
  if (native) {
    const NativeContainer = native.GlassContainer
    return (
      <NativeContainer spacing={spacing} pointerEvents={pointerEvents} style={style} onLayout={onLayout}>
        {children}
      </NativeContainer>
    )
  }
  return (
    <View pointerEvents={pointerEvents} style={style} onLayout={onLayout}>
      {children}
    </View>
  )
}

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
        tintColor={cfg.nativeTint}
        style={[
          styles.nativeBase,
          {
            borderRadius: radius,
            borderCurve: 'continuous',
            borderWidth: accent ? 1 : StyleSheet.hairlineWidth,
            borderColor: accent ? ACCENT_BORDER : 'rgba(255, 255, 255, 0.12)',
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
        WEB_GLASS_STYLE,
        {
          borderRadius: radius,
          borderCurve: 'continuous',
          backgroundColor: Platform.OS === 'ios' ? cfg.iosBg : cfg.webBg,
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
