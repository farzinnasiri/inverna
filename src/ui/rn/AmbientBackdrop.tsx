import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import { DEFAULT_PRESET_ID, presetById, type Mix, type SoundSceneId } from '@/core/sound/catalog'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { useReducedMotion } from './hooks'

function resolveScene(mix: Mix | null, presetId: string | null): SoundSceneId {
  const matched = presetById(presetId)
  if (matched) return matched.scene
  if (!mix) return 'rain'
  if (mix.classicalMotif === 'reverie') return 'reverie'
  if (mix.classicalMotif) return 'classical'
  const l = mix.layers
  const entries: [SoundSceneId, number][] = [
    ['rain', l.rain ?? 0],
    ['waves', l.waves ?? 0],
    ['fire', l.fire ?? 0],
    ['wind', l.wind ?? 0],
    ['delta', (l.brown ?? 0) + (l.pink ?? 0) * 0.6 + (mix.band === 'delta' ? 0.5 : 0)],
  ]
  entries.sort((a, b) => b[1] - a[1])
  return entries[0]![1] > 0.05 ? entries[0]![0] : 'rain'
}

interface AtmosphericPalette {
  /** Upper architectural light canopy */
  canopy: string
  /** Mid-field volumetric bloom */
  mid: string
  /** Lower refractive horizon wash */
  horizon: string
  /** Delicate specular caustic arc stroke */
  caustic: string
}

/**
 * Abstract volumetric light fields inspired by James Turrell installations
 * and Watchmaker refraction — zero clipart rainlines or flat particle dots.
 */
const SCENE_PALETTES: Record<SoundSceneId, AtmosphericPalette> = {
  rain: {
    canopy: '#1E3F6E',
    mid: '#356099',
    horizon: '#182D4F',
    caustic: '#8AB8EA',
  },
  classical: {
    canopy: '#3C2854',
    mid: '#78507D',
    horizon: '#523426',
    caustic: '#DEC090',
  },
  fire: {
    canopy: '#632912',
    mid: '#C45A1E',
    horizon: '#9E3E12',
    caustic: '#F4B86A',
  },
  waves: {
    canopy: '#114A54',
    mid: '#23757C',
    horizon: '#144452',
    caustic: '#7ED4D2',
  },
  delta: {
    canopy: '#2A1F5C',
    mid: '#4C3694',
    horizon: '#191438',
    caustic: '#B3A0F0',
  },
  wind: {
    canopy: '#253852',
    mid: '#4C6484',
    horizon: '#1E2C42',
    caustic: '#B2C6DE',
  },
  reverie: {
    canopy: '#47311E',
    mid: '#7D5B34',
    horizon: '#2C263B',
    caustic: '#E4C58D',
  },
}

/**
 * Single-tree, zero-remount volumetric nocturnal backdrop:
 * - Pauses updates on unfocused tabs (`useIsFocused`) so NativeTabs never renders 3x backdrops.
 * - Never unmounts/remounts particle arrays on preset switch — smooth, locked 120fps switching.
 */
export function AmbientBackdrop() {
  const [isFocused, setIsFocused] = useState(true)
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true)
      return () => setIsFocused(false)
    }, []),
  )
  const { width, height } = useWindowDimensions()
  const playing = useSound((s) => s.playing)
  const soundMix = useSound((s) => s.mix)
  const soundPreset = useSound((s) => s.presetId)
  const savedPreset = useSettings((s) => s.sessionPreset)
  const reduced = useReducedMotion()

  const activePresetId = soundPreset ?? savedPreset ?? DEFAULT_PRESET_ID
  const activeMix = soundMix ?? presetById(activePresetId)?.mix ?? null
  const scene = resolveScene(activeMix, playing ? soundPreset : activePresetId)
  const pal = SCENE_PALETTES[scene]

  const driftA = useSharedValue(0)
  const driftB = useSharedValue(0)
  const breath = useSharedValue(0)
  const causticSpin = useSharedValue(0)
  const intensitySV = useSharedValue(playing ? 1 : 0.65)

  useEffect(() => {
    intensitySV.set(
      withTiming(playing ? 1 : 0.65, {
        duration: 650,
        easing: Easing.inOut(Easing.sin),
        reduceMotion: ReduceMotion.System,
      }),
    )
  }, [playing, intensitySV])

  useEffect(() => {
    if (reduced || !isFocused) {
      return
    }
    driftA.set(
      withRepeat(
        withTiming(1, { duration: 15000, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }),
        -1,
        true,
      ),
    )
    driftB.set(
      withRepeat(
        withTiming(1, { duration: 19000, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }),
        -1,
        true,
      ),
    )
    // 10-second asymmetric-feel cardiorespiratory breath glow
    breath.set(
      withRepeat(
        withTiming(1, { duration: 10000, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }),
        -1,
        true,
      ),
    )
    causticSpin.set(
      withRepeat(
        withTiming(1, { duration: 42000, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
        -1,
        false,
      ),
    )
  }, [reduced, isFocused, driftA, driftB, breath, causticSpin])

  const orbW = Math.max(width, 390) * 1.28
  const orbH = Math.max(height * 0.56, 440)

  const canopyStyle = useAnimatedStyle(() => ({
    opacity: (0.64 + breath.get() * 0.24) * intensitySV.get(),
    transform: [
      { translateX: (driftA.get() - 0.5) * 48 },
      { translateY: (driftB.get() - 0.5) * 32 },
      { scale: 0.98 + breath.get() * 0.08 },
    ],
  }))

  const midStyle = useAnimatedStyle(() => ({
    opacity: (0.44 + (1 - breath.get()) * 0.24) * intensitySV.get(),
    transform: [
      { translateX: (0.5 - driftB.get()) * 58 },
      { translateY: (driftA.get() - 0.5) * 44 },
      { scale: 1.04 - breath.get() * 0.07 },
    ],
  }))

  const horizonStyle = useAnimatedStyle(() => ({
    opacity: (0.48 + breath.get() * 0.22) * intensitySV.get(),
    transform: [
      { translateX: (driftA.get() - 0.5) * 34 },
      { scaleX: 1.02 + breath.get() * 0.08 },
    ],
  }))

  const causticStyle = useAnimatedStyle(() => ({
    opacity: (0.24 + breath.get() * 0.16) * intensitySV.get(),
    transform: [
      { rotate: `${causticSpin.get() * 360}deg` },
      { scale: 0.96 + breath.get() * 0.07 },
    ],
  }))

  if (!isFocused) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap]} />
  }

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap]}>
      {/* Layer 1: Upper volumetric light canopy */}
      <Animated.View
        style={[
          styles.layer,
          {
            width: orbW,
            height: orbH,
            top: -orbH * 0.34,
            left: (width - orbW) / 2 - width * 0.06,
          },
          canopyStyle,
        ]}
      >
        <Svg width={orbW} height={orbH}>
          <Defs>
            <RadialGradient id="lullVolCanopy" cx="48%" cy="46%" r="52%">
              <Stop offset="0%" stopColor={pal.canopy} stopOpacity="0.92" />
              <Stop offset="48%" stopColor={pal.mid} stopOpacity="0.34" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={orbW} height={orbH} fill="url(#lullVolCanopy)" />
        </Svg>
      </Animated.View>

      {/* Layer 2: Asymmetric counter-drifting mid-screen bokeh veil */}
      <Animated.View
        style={[
          styles.layer,
          {
            width: orbW * 0.96,
            height: orbH * 0.96,
            top: height * 0.16,
            left: (width - orbW * 0.96) / 2 + width * 0.15,
          },
          midStyle,
        ]}
      >
        <Svg width={orbW * 0.96} height={orbH * 0.96}>
          <Defs>
            <RadialGradient id="lullVolMid" cx="52%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={pal.mid} stopOpacity="0.54" />
              <Stop offset="44%" stopColor={pal.canopy} stopOpacity="0.18" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={orbW * 0.96} height={orbH * 0.96} fill="url(#lullVolMid)" />
        </Svg>
      </Animated.View>

      {/* Layer 3: Subtle lower horizon refractive warmth */}
      <Animated.View
        style={[
          styles.layer,
          {
            width: orbW * 1.1,
            height: orbH * 0.85,
            bottom: -orbH * 0.36,
            left: (width - orbW * 1.1) / 2,
          },
          horizonStyle,
        ]}
      >
        <Svg width={orbW * 1.1} height={orbH * 0.85}>
          <Defs>
            <RadialGradient id="lullVolHorizon" cx="50%" cy="62%" r="54%">
              <Stop offset="0%" stopColor={pal.caustic} stopOpacity="0.28" />
              <Stop offset="36%" stopColor={pal.horizon} stopOpacity="0.48" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={orbW * 1.1} height={orbH * 0.85} fill="url(#lullVolHorizon)" />
        </Svg>
      </Animated.View>

      {/* Layer 4: Delicate Watchmaker optical caustic filaments (abstract lens refraction) */}
      <Animated.View
        style={[
          styles.layer,
          {
            width: width * 1.25,
            height: width * 1.25,
            top: height * 0.04,
            left: -width * 0.125,
          },
          causticStyle,
        ]}
      >
        <Svg width={width * 1.25} height={width * 1.25} viewBox="0 0 480 480">
          <Ellipse
            cx={240}
            cy={240}
            rx={196}
            ry={148}
            transform="rotate(-18 240 240)"
            fill="none"
            stroke={pal.caustic}
            strokeOpacity={0.22}
            strokeWidth={0.9}
          />
          <Ellipse
            cx={240}
            cy={240}
            rx={162}
            ry={208}
            transform="rotate(24 240 240)"
            fill="none"
            stroke={pal.caustic}
            strokeOpacity={0.14}
            strokeWidth={0.8}
          />
          <Path
            d="M84 260 C140 160, 320 132, 404 220"
            fill="none"
            stroke={pal.caustic}
            strokeOpacity={0.24}
            strokeWidth={1.1}
            strokeLinecap="round"
          />
          <Circle
            cx={240}
            cy={240}
            r={126}
            fill="none"
            stroke={pal.caustic}
            strokeOpacity={0.12}
            strokeWidth={0.75}
            strokeDasharray="2 10"
          />
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
  layer: {
    position: 'absolute',
  },
})
