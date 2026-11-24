import { useEffect } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import { DEFAULT_PRESET_ID, presetById, type Mix, type SoundSceneId } from '@/core/sound/catalog'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { useReducedMotion } from './hooks'

type Scene = SoundSceneId

function dominantScene(mix: Mix | null, presetId: string | null): Scene {
  const matched = presetById(presetId)
  if (matched) return matched.scene
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
  return entries[0]![1] > 0.05 ? entries[0]![0] : 'rain'
}

const SCENE_PALETTES: Record<
  Scene,
  { primary: string; secondary: string; glow: string; accent: string }
> = {
  rain: {
    primary: '#264A7A',   // Deep storm sapphire
    secondary: '#4B78B0', // Moonlit silver-blue mist
    glow: '#3B6EA8',
    accent: '#9EC5F2',
  },
  waves: {
    primary: '#195E66',   // Deep lunar ocean teal
    secondary: '#2E8082', // Bioluminescent tide glow
    glow: '#3D9699',
    accent: '#8DD4D2',
  },
  fire: {
    primary: '#A84B1B',   // Deep hearth ember
    secondary: '#E07A2B', // Warm flame glow
    glow: '#C45B20',
    accent: '#F5B864',
  },
  wind: {
    primary: '#324468',   // Twilight alpine slate
    secondary: '#6B7E9E', // Silver air current
    glow: '#4C6288',
    accent: '#B6C5DC',
  },
  binaural: {
    primary: '#493882',   // Deep cosmic violet-indigo
    secondary: '#7B5CC2', // Aurora ribbon violet
    glow: '#624BA3',
    accent: '#C4B3F5',
  },
}

/* --- Bespoke UI-thread Reanimated scene detail layers -------------------- */

const EMBER_SPECS = [
  { x: 0.14, size: 3.4, phase: 0.02, drift: -14, bright: true },
  { x: 0.24, size: 2.2, phase: 0.28, drift: 10, bright: false },
  { x: 0.35, size: 3.8, phase: 0.56, drift: -18, bright: true },
  { x: 0.44, size: 2.5, phase: 0.14, drift: 16, bright: false },
  { x: 0.52, size: 4.2, phase: 0.72, drift: -12, bright: true },
  { x: 0.61, size: 2.4, phase: 0.39, drift: 14, bright: false },
  { x: 0.70, size: 3.5, phase: 0.85, drift: -10, bright: true },
  { x: 0.80, size: 2.6, phase: 0.21, drift: 12, bright: false },
  { x: 0.88, size: 3.0, phase: 0.63, drift: -16, bright: true },
  { x: 0.30, size: 2.0, phase: 0.91, drift: 11, bright: false },
  { x: 0.57, size: 2.8, phase: 0.48, drift: -9, bright: true },
  { x: 0.75, size: 2.1, phase: 0.09, drift: 15, bright: false },
] as const

function RisingEmber({
  spec,
  width,
  height,
  clock,
  intensity,
}: {
  spec: (typeof EMBER_SPECS)[number]
  width: number
  height: number
  clock: SharedValue<number>
  intensity: number
}) {
  const style = useAnimatedStyle(() => {
    const p = (clock.get() + spec.phase) % 1
    const y = height * 0.96 - p * height * 0.72
    const x = spec.x * width + Math.sin(p * Math.PI * 2.5) * spec.drift
    const fadeIn = Math.min(1, p * 5)
    const fadeOut = Math.max(0, 1 - Math.max(0, (p - 0.55) / 0.45))
    const scale = 0.75 + (1 - p) * 0.45
    return {
      opacity: fadeIn * fadeOut * (spec.bright ? 0.78 : 0.46) * intensity,
      transform: [{ translateX: x }, { translateY: y }, { scale }],
    }
  })

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: spec.size * 2,
          height: spec.size * 2,
          borderRadius: spec.size,
          backgroundColor: spec.bright ? '#F8C471' : '#E07A2B',
          shadowColor: '#F59E3F',
          shadowOpacity: 0.9,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    />
  )
}

const RAIN_SPECS = [
  { x: 0.08, len: 54, phase: 0.05, speed: 1.0, op: 0.24 },
  { x: 0.16, len: 42, phase: 0.42, speed: 1.3, op: 0.18 },
  { x: 0.24, len: 64, phase: 0.78, speed: 0.9, op: 0.28 },
  { x: 0.33, len: 38, phase: 0.19, speed: 1.2, op: 0.16 },
  { x: 0.42, len: 58, phase: 0.61, speed: 1.0, op: 0.25 },
  { x: 0.51, len: 46, phase: 0.31, speed: 1.15, op: 0.20 },
  { x: 0.60, len: 68, phase: 0.87, speed: 0.95, op: 0.27 },
  { x: 0.69, len: 40, phase: 0.14, speed: 1.25, op: 0.17 },
  { x: 0.78, len: 56, phase: 0.53, speed: 1.05, op: 0.24 },
  { x: 0.87, len: 48, phase: 0.24, speed: 1.1, op: 0.21 },
  { x: 0.94, len: 60, phase: 0.69, speed: 0.92, op: 0.22 },
  { x: 0.28, len: 44, phase: 0.93, speed: 1.18, op: 0.16 },
  { x: 0.56, len: 52, phase: 0.08, speed: 1.08, op: 0.20 },
  { x: 0.82, len: 36, phase: 0.76, speed: 1.28, op: 0.15 },
] as const

function RainStreak({
  spec,
  width,
  height,
  clock,
  intensity,
}: {
  spec: (typeof RAIN_SPECS)[number]
  width: number
  height: number
  clock: SharedValue<number>
  intensity: number
}) {
  const style = useAnimatedStyle(() => {
    const p = (clock.get() * spec.speed + spec.phase) % 1
    const y = -80 + p * (height * 0.92 + 120)
    const x = spec.x * width - p * 44
    const edgeFade = Math.min(1, p * 4) * Math.max(0, 1 - Math.max(0, (p - 0.7) / 0.3))
    return {
      opacity: spec.op * edgeFade * intensity,
      transform: [{ translateX: x }, { translateY: y }, { rotate: '12deg' }],
    }
  })

  return (
    <Animated.View
      style={[
        styles.rainLine,
        {
          height: spec.len,
          backgroundColor: '#A8CEF8',
        },
        style,
      ]}
    />
  )
}

const STAR_SPECS = [
  { x: 0.14, y: 0.12, r: 1.7, phase: 0.1 },
  { x: 0.31, y: 0.09, r: 1.3, phase: 0.45 },
  { x: 0.52, y: 0.16, r: 2.0, phase: 0.72 },
  { x: 0.74, y: 0.11, r: 1.5, phase: 0.28 },
  { x: 0.88, y: 0.20, r: 1.8, phase: 0.86 },
  { x: 0.20, y: 0.29, r: 1.4, phase: 0.62 },
  { x: 0.64, y: 0.27, r: 1.6, phase: 0.19 },
  { x: 0.41, y: 0.34, r: 1.2, phase: 0.91 },
  { x: 0.82, y: 0.38, r: 1.5, phase: 0.37 },
  { x: 0.12, y: 0.46, r: 1.3, phase: 0.54 },
] as const

function StarMote({
  spec,
  width,
  height,
  breath,
  intensity,
}: {
  spec: (typeof STAR_SPECS)[number]
  width: number
  height: number
  breath: SharedValue<number>
  intensity: number
}) {
  const style = useAnimatedStyle(() => {
    const wave = 0.5 + 0.5 * Math.sin((breath.get() + spec.phase) * Math.PI * 2)
    return {
      opacity: (0.18 + wave * 0.55) * intensity,
      transform: [{ scale: 0.8 + wave * 0.4 }],
    }
  })

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: spec.x * width,
          top: spec.y * height,
          width: spec.r * 2,
          height: spec.r * 2,
          borderRadius: spec.r,
          backgroundColor: '#DDD2FF',
        },
        style,
      ]}
    />
  )
}

/**
 * Rich, bespoke sound-reactive nocturnal atmosphere on the UI thread (Reanimated).
 *
 * Each soundscape renders its own living nocturnal world behind Liquid Glass:
 * - Hearth (`fire`): radiant low hearth glow + flickering warm canopy + rising glowing embers
 * - Rainfall / Theta rain (`rain`): midnight storm sapphire mist + drifting silver rain streaks
 * - Low tide (`waves`): deep lunar ocean horizon + slow rolling tidal swells & moon shimmer
 * - Deep drift (`binaural`): velvety cosmic indigo-violet aurora ribbons + breathing starlight
 * - Wind (`wind`): sweeping silver twilight air currents
 */
export function AmbientBackdrop() {
  const { width, height } = useWindowDimensions()
  const playing = useSound((s) => s.playing)
  const soundMix = useSound((s) => s.mix)
  const soundPreset = useSound((s) => s.presetId)
  const savedPreset = useSettings((s) => s.sessionPreset)
  const reduced = useReducedMotion()

  const activePresetId = soundPreset ?? savedPreset ?? DEFAULT_PRESET_ID
  const activeMix = soundMix ?? presetById(activePresetId)?.mix ?? null
  const scene = dominantScene(activeMix, playing ? soundPreset : activePresetId)
  const pal = SCENE_PALETTES[scene]

  const driftA = useSharedValue(0)
  const driftB = useSharedValue(0)
  const breath = useSharedValue(0)
  const rainClock = useSharedValue(0)
  const emberClock = useSharedValue(0)
  const waveClock = useSharedValue(0)

  useEffect(() => {
    if (reduced) {
      driftA.set(0.5)
      driftB.set(0.5)
      breath.set(0.5)
      return
    }
    driftA.set(
      withRepeat(
        withTiming(1, { duration: 13000, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }),
        -1,
        true,
      ),
    )
    driftB.set(
      withRepeat(
        withTiming(1, { duration: 17000, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }),
        -1,
        true,
      ),
    )
    breath.set(
      withRepeat(
        withTiming(1, { duration: 7600, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }),
        -1,
        true,
      ),
    )
    rainClock.set(
      withRepeat(
        withTiming(1, { duration: 3600, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
        -1,
        false,
      ),
    )
    emberClock.set(
      withRepeat(
        withTiming(1, { duration: 9200, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
        -1,
        false,
      ),
    )
    waveClock.set(
      withRepeat(
        withTiming(1, { duration: 11000, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }),
        -1,
        true,
      ),
    )
  }, [reduced, driftA, driftB, breath, rainClock, emberClock, waveClock])

  const orbSize = Math.max(width, 390) * 1.24
  const intensity = playing ? 1 : 0.68

  const topOrbStyle = useAnimatedStyle(() => ({
    opacity: (0.58 + breath.get() * 0.24) * intensity,
    transform: [
      { translateX: (driftA.get() - 0.5) * 56 },
      { translateY: (driftB.get() - 0.5) * 38 },
      { scale: 0.96 + breath.get() * 0.1 },
    ],
  }))

  const midOrbStyle = useAnimatedStyle(() => ({
    opacity: (0.44 + (1 - breath.get()) * 0.22) * intensity,
    transform: [
      { translateX: (0.5 - driftB.get()) * 64 },
      { translateY: (driftA.get() - 0.5) * 48 },
      { scale: 1.04 - breath.get() * 0.08 },
    ],
  }))

  const hearthBaseStyle = useAnimatedStyle(() => ({
    opacity: (0.64 + breath.get() * 0.28) * intensity,
    transform: [
      { scaleX: 0.96 + breath.get() * 0.09 },
      { scaleY: 0.92 + breath.get() * 0.14 },
    ],
  }))

  const waveBandA = useAnimatedStyle(() => ({
    opacity: (0.36 + breath.get() * 0.18) * intensity,
    transform: [
      { translateX: (waveClock.get() - 0.5) * 54 },
      { translateY: Math.sin(waveClock.get() * Math.PI) * 14 },
    ],
  }))

  const waveBandB = useAnimatedStyle(() => ({
    opacity: (0.28 + (1 - breath.get()) * 0.18) * intensity,
    transform: [
      { translateX: (0.5 - waveClock.get()) * 68 },
      { translateY: -Math.sin(waveClock.get() * Math.PI) * 12 },
    ],
  }))

  const auroraRibbonStyle = useAnimatedStyle(() => ({
    opacity: (0.45 + breath.get() * 0.24) * intensity,
    transform: [
      { translateX: (driftA.get() - 0.5) * 44 },
      { translateY: (driftB.get() - 0.5) * 28 },
      { rotate: `${-12 + (driftA.get() - 0.5) * 10}deg` },
    ],
  }))

  const gradSuffix = scene

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap]}>
      {/* Upper nocturnal atmospheric canopy */}
      <Animated.View
        style={[
          styles.orb,
          {
            width: orbSize,
            height: orbSize,
            top: scene === 'fire' ? -orbSize * 0.42 : -orbSize * 0.30,
            left: (width - orbSize) / 2 - width * 0.08,
          },
          topOrbStyle,
        ]}
      >
        <Svg width={orbSize} height={orbSize}>
          <Defs>
            <RadialGradient id={`lullTop-${gradSuffix}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={pal.primary} stopOpacity="0.82" />
              <Stop offset="48%" stopColor={pal.glow} stopOpacity="0.34" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={orbSize} height={orbSize} fill={`url(#lullTop-${gradSuffix})`} />
        </Svg>
      </Animated.View>

      {/* Mid-screen living secondary bloom */}
      <Animated.View
        style={[
          styles.orb,
          {
            width: orbSize * 0.98,
            height: orbSize * 0.98,
            top: height * 0.20,
            left: (width - orbSize * 0.98) / 2 + width * 0.14,
          },
          midOrbStyle,
        ]}
      >
        <Svg width={orbSize * 0.98} height={orbSize * 0.98}>
          <Defs>
            <RadialGradient id={`lullMid-${gradSuffix}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={pal.secondary} stopOpacity="0.46" />
              <Stop offset="52%" stopColor={pal.primary} stopOpacity="0.16" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={orbSize * 0.98} height={orbSize * 0.98} fill={`url(#lullMid-${gradSuffix})`} />
        </Svg>
      </Animated.View>

      {/* HEARTH / FIRE: Warm radiant hearth firebed at bottom + rising glowing embers */}
      {scene === 'fire' && (
        <>
          <Animated.View
            style={[
              styles.orb,
              {
                width: orbSize * 1.12,
                height: orbSize * 0.85,
                bottom: -orbSize * 0.34,
                left: (width - orbSize * 1.12) / 2,
              },
              hearthBaseStyle,
            ]}
          >
            <Svg width={orbSize * 1.12} height={orbSize * 0.85}>
              <Defs>
                <RadialGradient id="lullFireBed" cx="50%" cy="62%" r="54%">
                  <Stop offset="0%" stopColor="#F5A442" stopOpacity="0.62" />
                  <Stop offset="34%" stopColor="#CC551C" stopOpacity="0.42" />
                  <Stop offset="68%" stopColor="#7A280C" stopOpacity="0.18" />
                  <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Rect x={0} y={0} width={orbSize * 1.12} height={orbSize * 0.85} fill="url(#lullFireBed)" />
            </Svg>
          </Animated.View>
          {!reduced &&
            EMBER_SPECS.map((spec, idx) => (
              <RisingEmber
                key={idx}
                spec={spec}
                width={width}
                height={height}
                clock={emberClock}
                intensity={intensity}
              />
            ))}
        </>
      )}

      {/* RAINFALL / THETA RAIN: Drifting silver rain streaks + moonlight ripple rings */}
      {scene === 'rain' && (
        <>
          {!reduced &&
            RAIN_SPECS.map((spec, idx) => (
              <RainStreak
                key={idx}
                spec={spec}
                width={width}
                height={height}
                clock={rainClock}
                intensity={intensity}
              />
            ))}
          <Animated.View
            style={[
              styles.orb,
              {
                width: width,
                height: 220,
                bottom: 40,
                left: 0,
              },
              waveBandA,
            ]}
          >
            <Svg width={width} height={220}>
              <Circle
                cx={width * 0.28}
                cy={120}
                r={58}
                fill="none"
                stroke={pal.accent}
                strokeOpacity={0.14}
                strokeWidth={1}
              />
              <Circle
                cx={width * 0.72}
                cy={88}
                r={76}
                fill="none"
                stroke={pal.accent}
                strokeOpacity={0.1}
                strokeWidth={1}
              />
            </Svg>
          </Animated.View>
        </>
      )}

      {/* LOW TIDE / WAVES: Rolling oceanic horizon swells + moonlit water shimmer */}
      {scene === 'waves' && (
        <>
          <Animated.View
            style={[
              styles.orb,
              { width: width + 140, height: 260, bottom: 20, left: -70 },
              waveBandA,
            ]}
          >
            <Svg width={width + 140} height={260} viewBox="0 0 560 260" preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="lullWaveA" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={pal.accent} stopOpacity="0.28" />
                  <Stop offset="45%" stopColor={pal.primary} stopOpacity="0.22" />
                  <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Path
                d="M0 90 Q140 34 280 90 T560 90 L560 260 L0 260 Z"
                fill="url(#lullWaveA)"
              />
              <Path
                d="M0 90 Q140 34 280 90 T560 90"
                fill="none"
                stroke={pal.accent}
                strokeOpacity={0.28}
                strokeWidth={1.3}
              />
            </Svg>
          </Animated.View>

          <Animated.View
            style={[
              styles.orb,
              { width: width + 140, height: 220, bottom: -10, left: -70 },
              waveBandB,
            ]}
          >
            <Svg width={width + 140} height={220} viewBox="0 0 560 220" preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="lullWaveB" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={pal.secondary} stopOpacity="0.30" />
                  <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Path
                d="M0 80 Q140 130 280 80 T560 80 L560 220 L0 220 Z"
                fill="url(#lullWaveB)"
              />
              <Path
                d="M0 80 Q140 130 280 80 T560 80"
                fill="none"
                stroke={pal.accent}
                strokeOpacity={0.20}
                strokeWidth={1}
              />
            </Svg>
          </Animated.View>
        </>
      )}

      {/* DEEP DRIFT / BINAURAL: Cosmic aurora ribbon + breathing starlight dust */}
      {scene === 'binaural' && (
        <>
          <Animated.View
            style={[
              styles.orb,
              {
                width: width * 1.4,
                height: 240,
                top: height * 0.14,
                left: -width * 0.2,
              },
              auroraRibbonStyle,
            ]}
          >
            <Svg width={width * 1.4} height={240} viewBox="0 0 560 240" preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="lullAurora" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%" stopColor="#6E52C4" stopOpacity="0" />
                  <Stop offset="35%" stopColor="#8E6EE6" stopOpacity="0.34" />
                  <Stop offset="68%" stopColor="#4672B8" stopOpacity="0.26" />
                  <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Path
                d="M0 140 C150 40, 320 210, 560 80 L560 170 C340 250, 160 110, 0 210 Z"
                fill="url(#lullAurora)"
              />
            </Svg>
          </Animated.View>
          {STAR_SPECS.map((spec, idx) => (
            <StarMote
              key={idx}
              spec={spec}
              width={width}
              height={height}
              breath={breath}
              intensity={intensity}
            />
          ))}
        </>
      )}

      {/* WIND: Sweeping silver twilight air currents */}
      {scene === 'wind' && (
        <Animated.View
          style={[
            styles.orb,
            { width: width + 120, height: 280, top: height * 0.24, left: -60 },
            waveBandA,
          ]}
        >
          <Svg width={width + 120} height={280} viewBox="0 0 540 280" preserveAspectRatio="none">
            <Path
              d="M0 70 C140 30, 310 110, 540 55"
              fill="none"
              stroke={pal.accent}
              strokeOpacity={0.22}
              strokeWidth={1.4}
            />
            <Path
              d="M0 150 C180 190, 340 110, 540 160"
              fill="none"
              stroke={pal.accent}
              strokeOpacity={0.16}
              strokeWidth={1.1}
            />
            <Path
              d="M0 225 C150 185, 360 250, 540 205"
              fill="none"
              stroke={pal.accent}
              strokeOpacity={0.12}
              strokeWidth={1}
            />
          </Svg>
        </Animated.View>
      )}
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
  particle: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  rainLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1.25,
    borderRadius: 1,
  },
})
