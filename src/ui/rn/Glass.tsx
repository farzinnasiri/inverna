import type { ComponentType, ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg'
import { requireOptionalNativeModule } from 'expo'
import { haptics } from '@/platform'
import { useSettings } from '@/ui/state/settings'

export type GlassVariant = 'chrome' | 'card' | 'elevated' | 'pill' | 'lens'

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
  /** Clear glass with no colour of its own: it shows (and bends) what's behind. */
  lens: {
    iosIntensity: 12,
    iosBg: 'rgba(8, 10, 14, 0.16)',
    webBg: 'rgba(10, 12, 16, 0.28)',
    nativeTint: 'rgba(0, 0, 0, 0.06)',
    nativeStyle: 'clear',
    border: 'rgba(255, 255, 255, 0.08)',
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

/**
 * Selected, chosen, the obvious next step: the glass itself turns warm (iOS's
 * own way to make glass stand out), with the same thin edge as everything
 * else. Never an outline drawn round the glass: that stops it reading as
 * glass. Shades can differ (`tint`), the treatment doesn't.
 */
export const GLASS_TINT = {
  /** Selected or chosen. */
  selected: 'rgba(194, 161, 95, 0.22)',
  /** The main action. */
  primary: 'rgba(194, 161, 95, 0.26)',
  /** Tonight's suggestion on Play: a touch quieter than a selection. */
  suggested: 'rgba(194, 161, 95, 0.2)',
} as const
const SELECTED_WEB_BG = 'rgba(70, 58, 34, 0.62)'

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
  tint,
  interactive = false,
  style,
  children,
}: {
  variant?: GlassVariant
  radius?: number
  accent?: boolean
  /**
   * Colour the glass itself (iOS's own way to make glass stand out), instead
   * of drawing on top of it. Replaces the variant's tint.
   */
  tint?: string
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
        tintColor={tint ?? (accent ? GLASS_TINT.selected : cfg.nativeTint)}
        style={[
          styles.nativeBase,
          {
            borderRadius: radius,
            borderCurve: 'continuous',
            // One thin edge in every state, selected or not, so nothing re-wraps.
            // The lens draws its own edge light; a uniform hairline would flatten it.
            borderWidth: variant === 'lens' ? 0 : StyleSheet.hairlineWidth,
            borderColor: accent ? 'rgba(255, 236, 200, 0.2)' : 'rgba(255, 255, 255, 0.12)',
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
          backgroundColor: tint ?? (accent ? SELECTED_WEB_BG : Platform.OS === 'ios' ? cfg.iosBg : cfg.webBg),
          borderColor: accent ? 'rgba(255, 236, 200, 0.2)' : cfg.border,
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
  hapticFeedback = false,
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
      haptics.play('tick')
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

/**
 * A round lens of liquid glass, made to behave like glass rather than look
 * like it:
 * - the body is real iOS 26 clear glass with no tint, so it bends whatever is
 *   behind it (the living backdrop) instead of showing a grey disc;
 * - there is no painted shine. Light shows only where real glass shows it:
 *   along the rim, brightest where the scene's light falls (top right), with
 *   a thin reflection just inside it, and a faint bounce of the scene's own
 *   colour on the opposite edge (`bounce`).
 *
 * `rim={false}` leaves the light to the caller (the sound orb draws its own,
 * animated, in Skia). Used for the intro mark and the sound orb.
 */
export function GlassLens({
  size,
  bounce = '#C2A15F',
  light = '#EAF4F2',
  rim = true,
  interactive = false,
  style,
  children,
}: {
  size: number
  /** The scene's colour, caught on the lower-left edge. */
  bounce?: string
  /** The light falling on the top-right edge. */
  light?: string
  rim?: boolean
  interactive?: boolean
  style?: StyleProp<ViewStyle>
  children?: ReactNode
}) {
  const id = `lens-${Math.round(size)}`
  const c = size / 2
  const r = c - 0.75
  /** A point on the rim at an angle (degrees, 0 = right, clockwise). */
  const at = (deg: number, rad = r) => {
    const a = (deg * Math.PI) / 180
    return `${(c + Math.cos(a) * rad).toFixed(2)} ${(c + Math.sin(a) * rad).toFixed(2)}`
  }
  const arc = (from: number, to: number, rad = r) => `M ${at(from, rad)} A ${rad} ${rad} 0 0 1 ${at(to, rad)}`
  return (
    <View style={[{ width: size, height: size }, style]}>
      <GlassSurface variant="lens" radius={size / 2} interactive={interactive} style={StyleSheet.absoluteFill}>
        <View />
      </GlassSurface>
      {rim ? (
        <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id={`${id}-key`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={light} stopOpacity="0" />
              <Stop offset="0.5" stopColor={light} stopOpacity="0.85" />
              <Stop offset="1" stopColor={light} stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id={`${id}-bounce`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={bounce} stopOpacity="0" />
              <Stop offset="0.5" stopColor={bounce} stopOpacity="0.55" />
              <Stop offset="1" stopColor={bounce} stopOpacity="0" />
            </LinearGradient>
            <RadialGradient id={`${id}-depth`} cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0.72" stopColor="#000000" stopOpacity="0" />
              <Stop offset="1" stopColor="#000000" stopOpacity="0.28" />
            </RadialGradient>
          </Defs>
          {/* Thick glass darkens toward its edge. */}
          <Circle cx={c} cy={c} r={r} fill={`url(#${id}-depth)`} />
          {/* A hairline so the edge reads even where no light falls on it. */}
          <Circle cx={c} cy={c} r={r} fill="none" stroke={light} strokeOpacity={0.1} strokeWidth={1} />
          <Path d={arc(-110, 10)} fill="none" stroke={`url(#${id}-key)`} strokeWidth={1.6} strokeLinecap="round" />
          <Path d={arc(-95, -20, r - size * 0.035)} fill="none" stroke={light} strokeOpacity={0.16} strokeWidth={1.2} strokeLinecap="round" />
          <Path d={arc(95, 175)} fill="none" stroke={`url(#${id}-bounce)`} strokeWidth={1.3} strokeLinecap="round" />
        </Svg>
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.lensContent]} pointerEvents="box-none">
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  lensContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  base: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  nativeBase: {
    overflow: 'hidden',
  },
})
