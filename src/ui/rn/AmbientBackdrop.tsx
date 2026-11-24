import { useEffect } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { presetById, type Mix } from '@/core/sound/catalog'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { useReducedMotion } from './hooks'

type Scene = 'rain' | 'waves' | 'fire' | 'wind' | 'binaural'

function dominantScene(mix: Mix | null, presetId: string | null): Scene {
  if (presetId === 'rainfall' || presetId === 'theta-rain') return 'rain'
  if (presetId === 'low-tide') return 'waves'
  if (presetId === 'hearth') return 'fire'
  if (presetId === 'deep-drift') return 'binaural'
  if (!mix) return 'rain'
  const l = mix.layers
  const entries: [Scene, number][] = [
    ['rain', l.rain ?? 0],
    ['waves', l.waves ?? 0],
    ['fire', l.fire ?? 0],
    ['wind', l.wind ?? 0],
    ['binaural', (l.brown ?? 0) + (l.pink ?? 0) + (l.white ?? 0) * 0.5 + (mix.band ? mix.bandGain * 1.4 : 0)],
  ]
  entries.sort((a, b) => b[1] - a[1])
  return entries[0][1] > 0.05 ? entries[0][0] : 'rain'
}

const SCENE_PALETTES: Record<
  Scene,
  { primary: string; secondary: string; glow: string }
> = {
  rain: {
    primary: '#2A4366',   // Midnight sapphire mist
    secondary: '#B89450', // Warm antique brass
    glow: '#3B567D',
  },
  waves: {
    primary: '#254C52',   // Deep lunar tide teal
    secondary: '#9E8550', // Soft gold moonlight
    glow: '#35666E',
  },
  fire: {
    primary: '#7D4822',   // Warm hearth ember
    secondary: '#C29A4E', // Candlelight brass
    glow: '#9E5E2D',
  },
  wind: {
    primary: '#354059',   // Cool nocturnal slate
    secondary: '#B49558', // Warm ivory brass
    glow: '#495878',
  },
  binaural: {
    primary: '#3F3866',   // Velvety deep indigo
    secondary: '#BA944E', // Brass corona
    glow: '#544B85',
  },
}

/**
 * Luminous, UI-thread Reanimated nocturnal aurora & moonlight backdrop.
 *
 * Designed specifically for Liquid Glass: rich soft radial light blooms drift
 * silently behind frosted glass cards & TabIsland so users actually see subtle
 * warm gold and midnight sapphire refraction through glass chrome while keeping
 * true #000000 OLED deep margins. Zero JS-thread intervals; 60/120fps on UI thread.
 */
export function AmbientBackdrop() {
  const { width, height } = useWindowDimensions()
  const playing = useSound((s) => s.playing)
  const soundMix = useSound((s) => s.mix)
  const soundPreset = useSound((s) => s.presetId)
  const savedPreset = useSettings((s) => s.sessionPreset)
  const reduced = useReducedMotion()

  const activePresetId = soundPreset ?? savedPreset ?? 'rainfall'
  const activeMix = soundMix ?? presetById(activePresetId)?.mix ?? null
  const scene = dominantScene(activeMix, playing ? soundPreset : activePresetId)
  const pal = SCENE_PALETTES[scene]

  const driftA = useSharedValue(0)
  const driftB = useSharedValue(0)
  const breath = useSharedValue(0)

  useEffect(() => {
    if (reduced) {
      driftA.set(0)
      driftB.set(0)
      breath.set(0.5)
      return
    }
    driftA.set(
      withRepeat(
        withTiming(1, {
          duration: 14000,
          easing: Easing.inOut(Easing.sin),
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        true,
      ),
    )
    driftB.set(
      withRepeat(
        withTiming(1, {
          duration: 19000,
          easing: Easing.inOut(Easing.sin),
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        true,
      ),
    )
    breath.set(
      withRepeat(
        withTiming(1, {
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        true,
      ),
    )
  }, [reduced, driftA, driftB, breath])

  const orbSize = Math.max(width, 390) * 1.15
  const baseOpacity = playing ? 0.95 : 0.72

  const topOrbStyle = useAnimatedStyle(() => ({
    opacity: (0.46 + breath.get() * 0.22) * baseOpacity,
    transform: [
      { translateX: (driftA.get() - 0.5) * 48 },
      { translateY: (driftB.get() - 0.5) * 34 },
      { scale: 0.96 + breath.get() * 0.08 },
    ],
  }))

  const midOrbStyle = useAnimatedStyle(() => ({
    opacity: (0.34 + (1 - breath.get()) * 0.2) * baseOpacity,
    transform: [
      { translateX: (0.5 - driftB.get()) * 56 },
      { translateY: (driftA.get() - 0.5) * 44 },
      { scale: 1.02 - breath.get() * 0.07 },
    ],
  }))

  const bottomOrbStyle = useAnimatedStyle(() => ({
    opacity: (0.28 + breath.get() * 0.16) * baseOpacity,
    transform: [
      { translateX: (driftA.get() - 0.5) * 36 },
      { translateY: (0.5 - driftB.get()) * 24 },
    ],
  }))

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap]}>
      {/* Upper nocturnal mist bloom */}
      <Animated.View
        style={[
          styles.orb,
          {
            width: orbSize,
            height: orbSize,
            top: -orbSize * 0.34,
            left: (width - orbSize) / 2 - width * 0.12,
          },
          topOrbStyle,
        ]}
      >
        <Svg width={orbSize} height={orbSize}>
          <Defs>
            <RadialGradient id="lullOrbTop" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={pal.primary} stopOpacity="0.62" />
              <Stop offset="48%" stopColor={pal.glow} stopOpacity="0.22" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={orbSize} height={orbSize} fill="url(#lullOrbTop)" />
        </Svg>
      </Animated.View>

      {/* Mid-screen warm antique brass bloom — refracts subtly behind Liquid Glass bento tiles */}
      <Animated.View
        style={[
          styles.orb,
          {
            width: orbSize * 0.95,
            height: orbSize * 0.95,
            top: height * 0.22,
            left: (width - orbSize * 0.95) / 2 + width * 0.16,
          },
          midOrbStyle,
        ]}
      >
        <Svg width={orbSize * 0.95} height={orbSize * 0.95}>
          <Defs>
            <RadialGradient id="lullOrbMid" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={pal.secondary} stopOpacity="0.34" />
              <Stop offset="52%" stopColor={pal.secondary} stopOpacity="0.10" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={orbSize * 0.95} height={orbSize * 0.95} fill="url(#lullOrbMid)" />
        </Svg>
      </Animated.View>

      {/* Lower dock bloom — gives TabIsland real translucent depth */}
      <Animated.View
        style={[
          styles.orb,
          {
            width: orbSize * 0.9,
            height: orbSize * 0.9,
            top: height * 0.62,
            left: (width - orbSize * 0.9) / 2 - width * 0.14,
          },
          bottomOrbStyle,
        ]}
      >
        <Svg width={orbSize * 0.9} height={orbSize * 0.9}>
          <Defs>
            <RadialGradient id="lullOrbBot" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={pal.primary} stopOpacity="0.44" />
              <Stop offset="55%" stopColor={pal.secondary} stopOpacity="0.12" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={orbSize * 0.9} height={orbSize * 0.9} fill="url(#lullOrbBot)" />
        </Svg>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 0,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  orb: {
    position: 'absolute',
  },
})
