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
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
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
  canopy: string
  mid: string
  horizon: string
  caustic: string
  detail: string
}

const SCENE_PALETTES: Record<SoundSceneId, AtmosphericPalette> = {
  rain: {
    canopy: '#1E467A',
    mid: '#3464A2',
    horizon: '#1B3A63',
    caustic: '#A8D0FA',
    detail: '#CBE4FF',
  },
  classical: {
    canopy: '#442C5E',
    mid: '#845988',
    horizon: '#5E3D2A',
    caustic: '#ECD09E',
    detail: '#F7E3BA',
  },
  fire: {
    canopy: '#6C2B10',
    mid: '#D46422',
    horizon: '#B84B14',
    caustic: '#F7C278',
    detail: '#FFE0A3',
  },
  waves: {
    canopy: '#10505C',
    mid: '#23828A',
    horizon: '#165260',
    caustic: '#94E4E2',
    detail: '#C2F2F0',
  },
  delta: {
    canopy: '#30236B',
    mid: '#5840A8',
    horizon: '#221A4C',
    caustic: '#C7B6FA',
    detail: '#E6DCFF',
  },
  wind: {
    canopy: '#283E5C',
    mid: '#526E92',
    horizon: '#24354F',
    caustic: '#C4D6EB',
    detail: '#E0ECFA',
  },
  reverie: {
    canopy: '#4E351F',
    mid: '#8C6639',
    horizon: '#352B4A',
    caustic: '#EDD09A',
    detail: '#FAEAAC',
  },
}

/**
 * Handcrafted full-viewport nocturnal backdrop:
 * - Full-height volumetric light distribution (canopy + middle + lower horizon) so the Play
 *   and Sounds tabs never have a dark empty band in the middle or bottom.
 * - Prominent, luminous optical Watchmaker caustic strings sweeping gently top-to-bottom.
 * - Subtle, bespoke handcrafted SVG motif per scene (tapered gradient rain & glass ripples,
 *   crescent moon & stars for Deep Delta, graceful lunar tide contours, glowing hearth shimmer,
 *   flowing twilight wind ribbons, gilded classical rays, ink-in-water reverie rings) —
 *   all inside ONE persistent GPU-animated tree so switching sounds stays 120fps instant!
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
  const detailFlow = useSharedValue(0)
  const intensitySV = useSharedValue(playing ? 1 : 0.72)

  useEffect(() => {
    intensitySV.set(
      withTiming(playing ? 1 : 0.72, {
        duration: 600,
        easing: Easing.inOut(Easing.sin),
        reduceMotion: ReduceMotion.System,
      }),
    )
  }, [playing, intensitySV])

  useEffect(() => {
    if (reduced || !isFocused) return
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
    breath.set(
      withRepeat(
        withTiming(1, { duration: 10000, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }),
        -1,
        true,
      ),
    )
    causticSpin.set(
      withRepeat(
        withTiming(1, { duration: 46000, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
        -1,
        false,
      ),
    )
    detailFlow.set(
      withRepeat(
        withTiming(1, { duration: 8500, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }),
        -1,
        true,
      ),
    )
  }, [reduced, isFocused, driftA, driftB, breath, causticSpin, detailFlow])

  const orbW = Math.max(width, 390) * 1.32
  const orbH = Math.max(height * 0.62, 480)

  const canopyStyle = useAnimatedStyle(() => ({
    opacity: (0.72 + breath.get() * 0.24) * intensitySV.get(),
    transform: [
      { translateX: (driftA.get() - 0.5) * 48 },
      { translateY: (driftB.get() - 0.5) * 32 },
      { scale: 0.98 + breath.get() * 0.08 },
    ],
  }))

  const midStyle = useAnimatedStyle(() => ({
    opacity: (0.58 + (1 - breath.get()) * 0.26) * intensitySV.get(),
    transform: [
      { translateX: (0.5 - driftB.get()) * 62 },
      { translateY: (driftA.get() - 0.5) * 44 },
      { scale: 1.04 - breath.get() * 0.08 },
    ],
  }))

  const horizonStyle = useAnimatedStyle(() => ({
    opacity: (0.62 + breath.get() * 0.24) * intensitySV.get(),
    transform: [
      { translateX: (driftA.get() - 0.5) * 38 },
      { scaleX: 1.02 + breath.get() * 0.09 },
    ],
  }))

  const causticUpperStyle = useAnimatedStyle(() => ({
    opacity: (0.44 + breath.get() * 0.22) * intensitySV.get(),
    transform: [
      { rotate: `${causticSpin.get() * 360}deg` },
      { scale: 0.97 + breath.get() * 0.06 },
    ],
  }))

  const causticLowerStyle = useAnimatedStyle(() => ({
    opacity: (0.34 + (1 - breath.get()) * 0.20) * intensitySV.get(),
    transform: [
      { rotate: `${-causticSpin.get() * 360}deg` },
      { scale: 1.02 - breath.get() * 0.05 },
    ],
  }))

  const detailDriftStyle = useAnimatedStyle(() => ({
    opacity: (0.62 + breath.get() * 0.26) * intensitySV.get(),
    transform: [
      { translateY: scene === 'rain' ? (detailFlow.get() - 0.5) * 28 : scene === 'fire' ? -(detailFlow.get() - 0.5) * 24 : (detailFlow.get() - 0.5) * 14 },
      { translateX: scene === 'wind' || scene === 'waves' ? (detailFlow.get() - 0.5) * 26 : (driftA.get() - 0.5) * 12 },
    ],
  }))

  if (!isFocused) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap]} />
  }

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap]}>
      {/* 1. Upper volumetric light canopy */}
      <Animated.View
        style={[
          styles.layer,
          { width: orbW, height: orbH, top: -orbH * 0.30, left: (width - orbW) / 2 - width * 0.06 },
          canopyStyle,
        ]}
      >
        <Svg width={orbW} height={orbH}>
          <Defs>
            <RadialGradient id="lullVolCanopy" cx="48%" cy="46%" r="54%">
              <Stop offset="0%" stopColor={pal.canopy} stopOpacity="0.94" />
              <Stop offset="48%" stopColor={pal.mid} stopOpacity="0.38" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={orbW} height={orbH} fill="url(#lullVolCanopy)" />
        </Svg>
      </Animated.View>

      {/* 2. Rich mid-viewport volumetric veil (prevents dark hole in center of Play & Sounds) */}
      <Animated.View
        style={[
          styles.layer,
          { width: orbW * 1.05, height: orbH * 1.05, top: height * 0.22, left: (width - orbW * 1.05) / 2 + width * 0.08 },
          midStyle,
        ]}
      >
        <Svg width={orbW * 1.05} height={orbH * 1.05}>
          <Defs>
            <RadialGradient id="lullVolMid" cx="50%" cy="50%" r="52%">
              <Stop offset="0%" stopColor={pal.mid} stopOpacity="0.56" />
              <Stop offset="48%" stopColor={pal.canopy} stopOpacity="0.22" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={orbW * 1.05} height={orbH * 1.05} fill="url(#lullVolMid)" />
        </Svg>
      </Animated.View>

      {/* 3. Lower refractive horizon glow (illuminates lower third & glass tab bar) */}
      <Animated.View
        style={[
          styles.layer,
          { width: orbW * 1.16, height: orbH * 0.92, bottom: -orbH * 0.28, left: (width - orbW * 1.16) / 2 },
          horizonStyle,
        ]}
      >
        <Svg width={orbW * 1.16} height={orbH * 0.92}>
          <Defs>
            <RadialGradient id="lullVolHorizon" cx="50%" cy="58%" r="54%">
              <Stop offset="0%" stopColor={pal.caustic} stopOpacity="0.34" />
              <Stop offset="36%" stopColor={pal.horizon} stopOpacity="0.58" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={orbW * 1.16} height={orbH * 0.92} fill="url(#lullVolHorizon)" />
        </Svg>
      </Animated.View>

      {/* 4. Prominent Watchmaker optical caustic strings (upper-mid sweep) */}
      <Animated.View
        style={[
          styles.layer,
          { width: width * 1.3, height: width * 1.3, top: height * 0.02, left: -width * 0.15 },
          causticUpperStyle,
        ]}
      >
        <Svg width={width * 1.3} height={width * 1.3} viewBox="0 0 480 480">
          <Ellipse
            cx={240}
            cy={240}
            rx={202}
            ry={146}
            transform="rotate(-18 240 240)"
            fill="none"
            stroke={pal.caustic}
            strokeOpacity={0.34}
            strokeWidth={1.1}
          />
          <Ellipse
            cx={240}
            cy={240}
            rx={158}
            ry={212}
            transform="rotate(24 240 240)"
            fill="none"
            stroke={pal.detail}
            strokeOpacity={0.22}
            strokeWidth={0.9}
          />
          <Path
            d="M72 264 C138 152, 324 126, 412 222"
            fill="none"
            stroke={pal.detail}
            strokeOpacity={0.38}
            strokeWidth={1.25}
            strokeLinecap="round"
          />
          <Circle
            cx={240}
            cy={240}
            r={126}
            fill="none"
            stroke={pal.caustic}
            strokeOpacity={0.20}
            strokeWidth={0.85}
            strokeDasharray="2 10"
          />
        </Svg>
      </Animated.View>

      {/* 5. Secondary counter-rotating caustic strings spanning the lower half of the screen */}
      <Animated.View
        style={[
          styles.layer,
          { width: width * 1.24, height: width * 1.24, bottom: -width * 0.14, left: -width * 0.12 },
          causticLowerStyle,
        ]}
      >
        <Svg width={width * 1.24} height={width * 1.24} viewBox="0 0 480 480">
          <Ellipse
            cx={240}
            cy={240}
            rx={192}
            ry={132}
            transform="rotate(14 240 240)"
            fill="none"
            stroke={pal.caustic}
            strokeOpacity={0.28}
            strokeWidth={1}
          />
          <Path
            d="M66 218 C160 318, 330 330, 418 242"
            fill="none"
            stroke={pal.detail}
            strokeOpacity={0.30}
            strokeWidth={1.15}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

      {/* 6. Handcrafted, nuanced per-scene atmospheric motif layer (single persistent GPU tree!) */}
      <Animated.View style={[StyleSheet.absoluteFill, detailDriftStyle]}>
        <Svg width={width} height={height} viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <LinearGradient id="rainSilk" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={pal.detail} stopOpacity="0" />
              <Stop offset="55%" stopColor={pal.detail} stopOpacity="0.48" />
              <Stop offset="100%" stopColor={pal.caustic} stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id="windSilk" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor={pal.detail} stopOpacity="0" />
              <Stop offset="50%" stopColor={pal.detail} stopOpacity="0.42" />
              <Stop offset="100%" stopColor={pal.detail} stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id="waveSilk" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={pal.detail} stopOpacity="0.32" />
              <Stop offset="100%" stopColor={pal.horizon} stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {/* RAIN: Gossamer tapered raindrop streaks + soft moonlit glass condensation rings */}
          {scene === 'rain' && (
            <>
              {[
                { x: 52, y: 90, h: 110, w: 1.1 },
                { x: 118, y: 210, h: 140, w: 0.9 },
                { x: 288, y: 120, h: 125, w: 1.15 },
                { x: 344, y: 260, h: 150, w: 0.95 },
                { x: 76, y: 460, h: 135, w: 1.05 },
                { x: 214, y: 380, h: 120, w: 0.85 },
                { x: 318, y: 540, h: 145, w: 1.0 },
                { x: 148, y: 630, h: 118, w: 0.9 },
              ].map((s, i) => (
                <Path
                  key={i}
                  d={`M${s.x} ${s.y} L${s.x - 16} ${s.y + s.h}`}
                  stroke="url(#rainSilk)"
                  strokeWidth={s.w}
                  strokeLinecap="round"
                />
              ))}
              <Circle cx={104} cy={670} r={42} fill="none" stroke={pal.caustic} strokeOpacity={0.22} strokeWidth={0.9} />
              <Circle cx={104} cy={670} r={66} fill="none" stroke={pal.caustic} strokeOpacity={0.11} strokeWidth={0.7} />
              <Circle cx={302} cy={590} r={34} fill="none" stroke={pal.detail} strokeOpacity={0.18} strokeWidth={0.8} />
            </>
          )}

          {/* DEEP DELTA: Serene Watchmaker crescent moon + curated twilight constellation */}
          {scene === 'delta' && (
            <>
              <Path
                d="M324 108 A34 34 0 1 0 344 162 A26 26 0 0 1 324 108 Z"
                fill={pal.detail}
                fillOpacity={0.36}
              />
              <Circle cx={312} cy={138} r={54} fill="none" stroke={pal.caustic} strokeOpacity={0.14} strokeWidth={0.8} />
              {[
                { x: 58, y: 124, r: 1.8, op: 0.72 },
                { x: 134, y: 92, r: 1.2, op: 0.55 },
                { x: 224, y: 142, r: 1.5, op: 0.64 },
                { x: 84, y: 320, r: 1.4, op: 0.52 },
                { x: 342, y: 368, r: 1.7, op: 0.66 },
                { x: 46, y: 540, r: 1.3, op: 0.48 },
                { x: 268, y: 590, r: 1.6, op: 0.56 },
                { x: 146, y: 710, r: 1.4, op: 0.50 },
                { x: 332, y: 740, r: 1.2, op: 0.45 },
              ].map((st, i) => (
                <Circle key={i} cx={st.x} cy={st.y} r={st.r} fill={pal.detail} fillOpacity={st.op} />
              ))}
            </>
          )}

          {/* WAVES: Graceful moonlit tidal contours sweeping across mid & lower horizon */}
          {scene === 'waves' && (
            <>
              <Path
                d="M-30 560 Q95 510 200 560 T430 560 L430 860 L-30 860 Z"
                fill="url(#waveSilk)"
                fillOpacity={0.42}
              />
              <Path
                d="M-30 560 Q95 510 200 560 T430 560"
                fill="none"
                stroke={pal.detail}
                strokeOpacity={0.34}
                strokeWidth={1.2}
              />
              <Path
                d="M-30 640 Q105 688 210 640 T430 640"
                fill="none"
                stroke={pal.caustic}
                strokeOpacity={0.26}
                strokeWidth={1.0}
              />
              <Path
                d="M-30 726 Q110 694 220 726 T430 726"
                fill="none"
                stroke={pal.detail}
                strokeOpacity={0.20}
                strokeWidth={0.9}
              />
            </>
          )}

          {/* FIRE: Delicate rising hearth shimmer ribbons & warm luminous ember sparks */}
          {scene === 'fire' && (
            <>
              <Path
                d="M110 840 C130 720, 74 630, 128 500"
                fill="none"
                stroke="url(#rainSilk)"
                strokeWidth={1.4}
              />
              <Path
                d="M278 850 C252 710, 314 610, 266 470"
                fill="none"
                stroke="url(#rainSilk)"
                strokeWidth={1.2}
              />
              {[
                { x: 96, y: 690, r: 2.2, op: 0.68 },
                { x: 164, y: 580, r: 1.6, op: 0.52 },
                { x: 248, y: 740, r: 2.4, op: 0.72 },
                { x: 312, y: 630, r: 1.8, op: 0.56 },
                { x: 204, y: 460, r: 1.4, op: 0.44 },
                { x: 132, y: 380, r: 1.3, op: 0.36 },
              ].map((e, i) => (
                <Circle key={i} cx={e.x} cy={e.y} r={e.r} fill={pal.detail} fillOpacity={e.op} />
              ))}
            </>
          )}

          {/* WIND: Flowing tapered silk air currents across upper, mid & lower viewport */}
          {scene === 'wind' && (
            <>
              <Path d="M-20 190 C90 140, 260 240, 420 170" fill="none" stroke="url(#windSilk)" strokeWidth={1.3} />
              <Path d="M-20 420 C120 470, 270 370, 420 430" fill="none" stroke="url(#windSilk)" strokeWidth={1.15} />
              <Path d="M-20 650 C100 600, 290 695, 420 635" fill="none" stroke="url(#windSilk)" strokeWidth={1.05} />
            </>
          )}

          {/* CLASSICAL: Gilded concert-hall rays & subtle harmonic suspension arcs */}
          {scene === 'classical' && (
            <>
              <Path d="M-20 260 Q200 170 420 260" fill="none" stroke="url(#windSilk)" strokeWidth={1.2} />
              <Path d="M-20 560 Q200 640 420 560" fill="none" stroke="url(#windSilk)" strokeWidth={1.1} />
              {[
                { x: 88, y: 178, r: 1.7, op: 0.58 },
                { x: 316, y: 214, r: 1.5, op: 0.52 },
                { x: 132, y: 486, r: 1.4, op: 0.44 },
                { x: 294, y: 618, r: 1.8, op: 0.56 },
                { x: 184, y: 730, r: 1.3, op: 0.44 },
              ].map((m, i) => (
                <Circle key={i} cx={m.x} cy={m.y} r={m.r} fill={pal.detail} fillOpacity={m.op} />
              ))}
            </>
          )}

          {/* REVERIE: Ink-in-water blooming sepia/gold concentric rings */}
          {scene === 'reverie' && (
            <>
              <Circle cx={88} cy={220} r={78} fill="none" stroke={pal.caustic} strokeOpacity={0.20} strokeWidth={0.9} />
              <Circle cx={88} cy={220} r={116} fill="none" stroke={pal.caustic} strokeOpacity={0.11} strokeWidth={0.7} />
              <Circle cx={322} cy={620} r={92} fill="none" stroke={pal.detail} strokeOpacity={0.22} strokeWidth={0.95} />
              <Circle cx={322} cy={620} r={138} fill="none" stroke={pal.caustic} strokeOpacity={0.12} strokeWidth={0.75} />
            </>
          )}
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
