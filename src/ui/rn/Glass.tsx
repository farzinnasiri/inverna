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
    // Native module absent or unavailable; fall back cleanly.
  }
  cachedBinding = null
  return null
}

/**
 * Calibrated translucent obsidian glass values so luminous AmbientBackdrop blooms
 * subtly refract through cards & floating chrome instead of reading as muddy opaque gray.
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
    webBg: 'rgba(16, 18, 24, 0.72)',
    nativeTint: 'rgba(18, 20, 26, 0.28)',
    nativeStyle: 'regular',
    border: 'rgba(255, 255, 255, 0.14)',
  },
  card: {
    iosIntensity: 26,
    iosBg: 'rgba(15, 17, 23, 0.52)',
    webBg: 'rgba(14, 16, 22, 0.68)',
    nativeTint: 'rgba(16, 18, 24, 0.36)',
    nativeStyle: 'clear',
    border: 'rgba(255, 255, 255, 0.10)',
  },
  elevated: {
    iosIntensity: 58,
    iosBg: 'rgba(20, 22, 29, 0.68)',
    webBg: 'rgba(18, 20, 27, 0.88)',
    nativeTint: 'rgba(22, 24, 32, 0.48)',
    nativeStyle: 'regular',
    border: 'rgba(255, 255, 255, 0.16)',
  },
  pill: {
    iosIntensity: 38,
    iosBg: 'rgba(20, 22, 29, 0.48)',
    webBg: 'rgba(18, 20, 27, 0.74)',
    nativeTint: 'rgba(20, 22, 29, 0.32)',
    nativeStyle: 'regular',
    border: 'rgba(255, 255, 255, 0.13)',
  },
}

const ACCENT_BORDER = 'rgba(194, 161, 95, 0.56)'
const ACCENT_TINT = 'rgba(194, 161, 95, 0.16)'
const ACCENT_BG_IOS = 'rgba(34, 28, 18, 0.58)'
const ACCENT_BG_WEB = 'rgba(32, 26, 17, 0.74)'

const WEB_GLASS_STYLE =
  Platform.OS === 'web'
    ? ({ backdropFilter: 'blur(22px) saturate(140%)', WebkitBackdropFilter: 'blur(22px) saturate(140%)' } as unknown as ViewStyle)
    : null

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
          backgroundColor: accent
            ? Platform.OS === 'ios'
              ? ACCENT_BG_IOS
              : ACCENT_BG_WEB
            : Platform.OS === 'ios'
              ? cfg.iosBg
              : cfg.webBg,
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
