import { memo, useEffect, useRef, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { useIsFocused } from 'expo-router'
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import { SCENE_PALETTES, paletteFamily, resolveBackdrop } from '@/core/backdrop/scenes'
import { DEFAULT_PRESET_ID, presetById, type SoundSceneId } from '@/core/sound/catalog'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { SkiaBackdrop } from './backdrop/SkiaBackdrop'
import { useAppActive, useReducedMotion } from './hooks'

/**
 * Colour layer of one palette family: volumetric canopy / mid / horizon glows and
 * the slow caustic rings. Two of these crossfade when the colour family changes.
 * The moving scene itself (drops, embers, strings...) is the Skia layer on top.
 */
const SceneAtmosphere = memo(function SceneAtmosphere({
  scene,
  idPrefix,
  width,
  height,
  orbW,
  orbH,
  canopyStyle,
  midStyle,
  horizonStyle,
  causticUpperStyle,
  causticLowerStyle,
}: {
  scene: SoundSceneId
  idPrefix: string
  width: number
  height: number
  orbW: number
  orbH: number
  canopyStyle: object
  midStyle: object
  horizonStyle: object
  causticUpperStyle: object
  causticLowerStyle: object
}) {
  const pal = SCENE_PALETTES[scene]
  const idCanopy = `${idPrefix}Canopy`
  const idMid = `${idPrefix}Mid`
  const idHorizon = `${idPrefix}Horizon`

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
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
            <RadialGradient id={idCanopy} cx="48%" cy="46%" r="54%">
              <Stop offset="0%" stopColor={pal.canopy} stopOpacity="0.92" />
              <Stop offset="48%" stopColor={pal.mid} stopOpacity="0.36" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={orbW} height={orbH} fill={`url(#${idCanopy})`} />
        </Svg>
      </Animated.View>

      {/* 2. Rich mid-viewport volumetric veil */}
      <Animated.View
        style={[
          styles.layer,
          { width: orbW * 1.05, height: orbH * 1.05, top: height * 0.22, left: (width - orbW * 1.05) / 2 + width * 0.08 },
          midStyle,
        ]}
      >
        <Svg width={orbW * 1.05} height={orbH * 1.05}>
          <Defs>
            <RadialGradient id={idMid} cx="50%" cy="50%" r="52%">
              <Stop offset="0%" stopColor={pal.mid} stopOpacity="0.54" />
              <Stop offset="48%" stopColor={pal.canopy} stopOpacity="0.20" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={orbW * 1.05} height={orbH * 1.05} fill={`url(#${idMid})`} />
        </Svg>
      </Animated.View>

      {/* 3. Lower refractive horizon glow */}
      <Animated.View
        style={[
          styles.layer,
          { width: orbW * 1.16, height: orbH * 0.92, bottom: -orbH * 0.28, left: (width - orbW * 1.16) / 2 },
          horizonStyle,
        ]}
      >
        <Svg width={orbW * 1.16} height={orbH * 0.92}>
          <Defs>
            <RadialGradient id={idHorizon} cx="50%" cy="58%" r="54%">
              <Stop offset="0%" stopColor={pal.caustic} stopOpacity="0.30" />
              <Stop offset="36%" stopColor={pal.horizon} stopOpacity="0.56" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={orbW * 1.16} height={orbH * 0.92} fill={`url(#${idHorizon})`} />
        </Svg>
      </Animated.View>

      {/* 4. Pared-back Watchmaker optical caustic strings (~25% calmer & cleaner) */}
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
            strokeOpacity={0.25}
            strokeWidth={0.95}
          />
          <Path
            d="M72 264 C138 152, 324 126, 412 222"
            fill="none"
            stroke={pal.detail}
            strokeOpacity={0.28}
            strokeWidth={1.05}
            strokeLinecap="round"
          />
          <Circle
            cx={240}
            cy={240}
            r={132}
            fill="none"
            stroke={pal.caustic}
            strokeOpacity={0.14}
            strokeWidth={0.75}
            strokeDasharray="2 12"
          />
        </Svg>
      </Animated.View>

      {/* 5. Secondary counter-rotating lower caustic arc */}
      <Animated.View
        style={[
          styles.layer,
          { width: width * 1.24, height: width * 1.24, bottom: -width * 0.14, left: -width * 0.12 },
          causticLowerStyle,
        ]}
      >
        <Svg width={width * 1.24} height={width * 1.24} viewBox="0 0 480 480">
          <Path
            d="M62 222 C160 322, 330 332, 420 244"
            fill="none"
            stroke={pal.detail}
            strokeOpacity={0.24}
            strokeWidth={1.0}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

    </View>
  )
})

/**
 * Full-screen night backdrop, shown behind the Play, Sounds and Settings tabs.
 *
 * Two layers:
 * - Colour: the palette family's glows and caustic rings (SceneAtmosphere),
 *   crossfading over 1.6s when the family changes.
 * - Scene: one living Skia scene per sound (SkiaBackdrop). On a sound change it
 *   morphs: a soft front grows out of the dial and the shapes behind it turn
 *   into the new scene's shapes.
 * Out of focus (another tab, or a game on top) it stays mounted but still:
 * repeats are cancelled and the scene clock stops, so coming back is instant
 * with nothing rebuilt. All tabs share one scene simulation.
 */
export function AmbientBackdrop({
  presetId,
  still = false,
  dim = 1,
}: {
  /** Show this sound's scene instead of the one playing or saved (onboarding pages). */
  presetId?: string
  /** Colour only: no particles and no drifting, so it costs next to nothing (behind games). */
  still?: boolean
  /** 0..1 overall strength. */
  dim?: number
} = {}) {
  const isFocused = useIsFocused()
  const appActive = useAppActive()
  const { width, height } = useWindowDimensions()
  const playing = useSound((s) => s.playing)
  const soundMix = useSound((s) => s.mix)
  const soundPreset = useSound((s) => s.presetId)
  const breathHz = useSound((s) => s.descent.breathHz)
  const descent = useSound((s) => s.descent.progress)
  const savedPreset = useSettings((s) => s.sessionPreset)
  const reduced = useReducedMotion()

  const activePresetId = presetId ?? soundPreset ?? savedPreset ?? DEFAULT_PRESET_ID
  const activeMix = presetId ? (presetById(presetId)?.mix ?? null) : (soundMix ?? presetById(activePresetId)?.mix ?? null)
  const backdrop = resolveBackdrop(presetId ?? (playing ? soundPreset : activePresetId), activeMix)
  const family = paletteFamily(backdrop)

  // Slow crossfade between the outgoing and incoming colour family.
  const [familyPair, setFamilyPair] = useState<{ prev: SoundSceneId | null; curr: SoundSceneId }>({
    prev: null,
    curr: family,
  })
  const lastFamilyRef = useRef<SoundSceneId>(family)
  const fadeProgress = useSharedValue(1)

  useEffect(() => {
    if (family === lastFamilyRef.current) return
    const outgoing = lastFamilyRef.current
    lastFamilyRef.current = family
    setFamilyPair({ prev: outgoing, curr: family })
    if (reduced) {
      fadeProgress.set(1)
      return
    }
    fadeProgress.set(0)
    fadeProgress.set(
      withTiming(1, {
        duration: 1600,
        easing: Easing.inOut(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }),
    )
    const t = setTimeout(() => {
      setFamilyPair((p) => (p.curr === family ? { prev: null, curr: family } : p))
    }, 1700)
    return () => clearTimeout(t)
  }, [family, reduced, fadeProgress])

  const driftA = useSharedValue(0)
  const driftB = useSharedValue(0)
  const breath = useSharedValue(0)
  const causticSpin = useSharedValue(0)
  const intensitySV = useSharedValue(playing ? 1 : 0.72)

  useEffect(() => {
    intensitySV.set(
      withTiming(playing ? 1 : 0.72, {
        duration: 750,
        easing: Easing.inOut(Easing.sin),
        reduceMotion: ReduceMotion.System,
      }),
    )
  }, [playing, intensitySV])

  useEffect(() => {
    const all = [driftA, driftB, breath, causticSpin]
    if (reduced || still || !isFocused) {
      all.forEach((v) => cancelAnimation(v))
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
    breath.set(
      withRepeat(
        withTiming(1, { duration: 10000, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }),
        -1,
        true,
      ),
    )
    causticSpin.set(
      withRepeat(
        withTiming(1, { duration: 48000, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
        -1,
        false,
      ),
    )
    return () => all.forEach((v) => cancelAnimation(v))
  }, [reduced, still, isFocused, driftA, driftB, breath, causticSpin])

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
    opacity: (0.56 + (1 - breath.get()) * 0.24) * intensitySV.get(),
    transform: [
      { translateX: (0.5 - driftB.get()) * 62 },
      { translateY: (driftA.get() - 0.5) * 44 },
      { scale: 1.04 - breath.get() * 0.08 },
    ],
  }))

  const horizonStyle = useAnimatedStyle(() => ({
    opacity: (0.60 + breath.get() * 0.24) * intensitySV.get(),
    transform: [
      { translateX: (driftA.get() - 0.5) * 38 },
      { scaleX: 1.02 + breath.get() * 0.09 },
    ],
  }))

  const causticUpperStyle = useAnimatedStyle(() => ({
    opacity: (0.34 + breath.get() * 0.16) * intensitySV.get(),
    transform: [
      { rotate: `${causticSpin.get() * 360}deg` },
      { scale: 0.97 + breath.get() * 0.06 },
    ],
  }))

  const causticLowerStyle = useAnimatedStyle(() => ({
    opacity: (0.26 + (1 - breath.get()) * 0.14) * intensitySV.get(),
    transform: [
      { rotate: `${-causticSpin.get() * 360}deg` },
      { scale: 1.02 - breath.get() * 0.05 },
    ],
  }))

  const prevCrossfadeStyle = useAnimatedStyle(() => ({
    opacity: 1 - fadeProgress.get(),
  }))

  const currCrossfadeStyle = useAnimatedStyle(() => ({
    opacity: fadeProgress.get(),
  }))

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap]}>
      <View style={[StyleSheet.absoluteFill, dim < 1 ? { opacity: dim } : null]}>
      {familyPair.prev && (
        <Animated.View style={[StyleSheet.absoluteFill, prevCrossfadeStyle]}>
          <SceneAtmosphere
            scene={familyPair.prev}
            idPrefix="lullPrev"
            width={width}
            height={height}
            orbW={orbW}
            orbH={orbH}
            canopyStyle={canopyStyle}
            midStyle={midStyle}
            horizonStyle={horizonStyle}
            causticUpperStyle={causticUpperStyle}
            causticLowerStyle={causticLowerStyle}
          />
        </Animated.View>
      )}
      <Animated.View style={[StyleSheet.absoluteFill, currCrossfadeStyle]}>
        <SceneAtmosphere
          scene={familyPair.curr}
          idPrefix="lullCurr"
          width={width}
          height={height}
          orbW={orbW}
          orbH={orbH}
          canopyStyle={canopyStyle}
          midStyle={midStyle}
          horizonStyle={horizonStyle}
          causticUpperStyle={causticUpperStyle}
          causticLowerStyle={causticLowerStyle}
        />
      </Animated.View>
      {still ? null : (
        <SkiaBackdrop
          backdrop={backdrop}
          playing={playing}
          breathHz={breathHz}
          descent={descent}
          reduced={reduced}
          active={isFocused && appActive}
        />
      )}
      </View>
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
