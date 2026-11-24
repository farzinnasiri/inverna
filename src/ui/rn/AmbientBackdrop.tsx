import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
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
    detail: '#D6EBFF',
  },
  classical: {
    canopy: '#442C5E',
    mid: '#845988',
    horizon: '#5E3D2A',
    caustic: '#ECD09E',
    detail: '#FBEBC9',
  },
  fire: {
    canopy: '#6C2B10',
    mid: '#D46422',
    horizon: '#B84B14',
    caustic: '#F7C278',
    detail: '#FFE5B4',
  },
  waves: {
    canopy: '#10505C',
    mid: '#23828A',
    horizon: '#165260',
    caustic: '#94E4E2',
    detail: '#D0F7F5',
  },
  delta: {
    canopy: '#30236B',
    mid: '#5840A8',
    horizon: '#221A4C',
    caustic: '#C7B6FA',
    detail: '#EFE8FF',
  },
  wind: {
    canopy: '#283E5C',
    mid: '#526E92',
    horizon: '#24354F',
    caustic: '#C4D6EB',
    detail: '#E6F1FC',
  },
  reverie: {
    canopy: '#4E351F',
    mid: '#8C6639',
    horizon: '#352B4A',
    caustic: '#EDD09A',
    detail: '#FDF0BF',
  },
}

/**
 * Single scene layer: volumetric canopy/mid/horizon + pared-back Watchmaker caustics (-25% lines)
 * + genuinely visible, handcrafted per-scene nocturnal details framed around the dial & edges.
 * Rendered inside a dual-slot crossfade container so switching sounds smoothly glides colors
 * over 1.6s instead of snapping!
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
  detailDriftStyle,
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
  detailDriftStyle: object
}) {
  const pal = SCENE_PALETTES[scene]
  const idCanopy = `${idPrefix}Canopy`
  const idMid = `${idPrefix}Mid`
  const idHorizon = `${idPrefix}Horizon`
  const idRain = `${idPrefix}Rain`
  const idWind = `${idPrefix}Wind`
  const idWave = `${idPrefix}Wave`
  const idGlow = `${idPrefix}Glow`

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

      {/* 6. Handcrafted, clearly visible per-scene motifs framed around the open viewport zones */}
      <Animated.View style={[StyleSheet.absoluteFill, detailDriftStyle]}>
        <Svg width={width} height={height} viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <LinearGradient id={idRain} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={pal.detail} stopOpacity="0" />
              <Stop offset="45%" stopColor={pal.detail} stopOpacity="0.78" />
              <Stop offset="100%" stopColor={pal.caustic} stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id={idWind} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor={pal.detail} stopOpacity="0" />
              <Stop offset="50%" stopColor={pal.detail} stopOpacity="0.58" />
              <Stop offset="100%" stopColor={pal.detail} stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id={idWave} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={pal.detail} stopOpacity="0.34" />
              <Stop offset="100%" stopColor={pal.horizon} stopOpacity="0" />
            </LinearGradient>
            <RadialGradient id={idGlow} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={pal.detail} stopOpacity="0.88" />
              <Stop offset="42%" stopColor={pal.caustic} stopOpacity="0.28" />
              <Stop offset="100%" stopColor={pal.caustic} stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* RAIN: Crisp angled silk rain streaks + translucent glass condensation ripples */}
          {scene === 'rain' && (
            <>
              {[
                { x: 42, y: 78, h: 128, w: 1.5 },
                { x: 96, y: 175, h: 155, w: 1.15 },
                { x: 312, y: 84, h: 142, w: 1.45 },
                { x: 362, y: 196, h: 162, w: 1.2 },
                { x: 54, y: 310, h: 138, w: 1.3 },
                { x: 342, y: 348, h: 145, w: 1.35 },
                { x: 138, y: 112, h: 98, w: 1.0 },
                { x: 268, y: 148, h: 108, w: 1.05 },
                { x: 74, y: 505, h: 135, w: 1.25 },
                { x: 326, y: 528, h: 148, w: 1.25 },
                { x: 192, y: 455, h: 116, w: 1.0 },
              ].map((s, i) => (
                <Path
                  key={i}
                  d={`M${s.x} ${s.y} L${s.x - 18} ${s.y + s.h}`}
                  stroke={`url(#${idRain})`}
                  strokeWidth={s.w}
                  strokeLinecap="round"
                />
              ))}
              {/* Subtle glass water-drop ripples along visible flanks */}
              <Circle cx={64} cy={262} r={22} fill="none" stroke={pal.detail} strokeOpacity={0.32} strokeWidth={1.0} />
              <Circle cx={64} cy={262} r={38} fill="none" stroke={pal.caustic} strokeOpacity={0.16} strokeWidth={0.8} />
              <Circle cx={336} cy={306} r={26} fill="none" stroke={pal.detail} strokeOpacity={0.28} strokeWidth={0.95} />
              <Circle cx={336} cy={306} r={44} fill="none" stroke={pal.caustic} strokeOpacity={0.14} strokeWidth={0.75} />
            </>
          )}

          {/* DEEP DELTA: Luminous sculpted Watchmaker crescent moon + diamond starlight constellation */}
          {scene === 'delta' && (
            <>
              {/* Soft moonbeam aura + sculpted crescent in upper-right sky */}
              <Circle cx={322} cy={138} r={62} fill={`url(#${idGlow})`} fillOpacity={0.34} />
              <Path
                d="M326 106 A30 30 0 1 0 348 158 A23 23 0 0 1 326 106 Z"
                fill={pal.detail}
                fillOpacity={0.78}
              />
              {/* 4-point starlight glints + pinpoint twilight stars across visible sky */}
              {[
                { x: 56, y: 128, s: 5.5, op: 0.85 },
                { x: 118, y: 96, s: 3.5, op: 0.65 },
                { x: 256, y: 116, s: 4.0, op: 0.72 },
                { x: 46, y: 292, s: 4.5, op: 0.74 },
                { x: 356, y: 284, s: 5.0, op: 0.80 },
                { x: 84, y: 416, s: 3.8, op: 0.64 },
                { x: 328, y: 432, s: 4.2, op: 0.68 },
              ].map((st, i) => (
                <Path
                  key={`glint-${i}`}
                  d={`M${st.x} ${st.y - st.s} Q${st.x} ${st.y} ${st.x + st.s} ${st.y} Q${st.x} ${st.y} ${st.x} ${st.y + st.s} Q${st.x} ${st.y} ${st.x - st.s} ${st.y} Q${st.x} ${st.y} ${st.x} ${st.y - st.s} Z`}
                  fill={pal.detail}
                  fillOpacity={st.op}
                />
              ))}
              {[
                { x: 78, y: 196, r: 1.8, op: 0.72 },
                { x: 162, y: 146, r: 1.5, op: 0.62 },
                { x: 288, y: 214, r: 1.7, op: 0.68 },
                { x: 36, y: 382, r: 1.6, op: 0.58 },
                { x: 368, y: 368, r: 1.9, op: 0.72 },
                { x: 112, y: 540, r: 1.6, op: 0.54 },
                { x: 294, y: 576, r: 1.8, op: 0.58 },
              ].map((dot, i) => (
                <Circle key={`star-${i}`} cx={dot.x} cy={dot.y} r={dot.r} fill={pal.detail} fillOpacity={dot.op} />
              ))}
            </>
          )}

          {/* WAVES: Flowing moonlit tidal wave lines + subtle silver foam-glint dashes */}
          {scene === 'waves' && (
            <>
              <Path
                d="M-30 470 Q95 426 200 470 T430 470 L430 860 L-30 860 Z"
                fill={`url(#${idWave})`}
                fillOpacity={0.34}
              />
              <Path
                d="M-30 370 Q100 338 205 370 T430 370"
                fill="none"
                stroke={`url(#${idWind})`}
                strokeWidth={1.35}
              />
              <Path
                d="M-30 470 Q95 426 200 470 T430 470"
                fill="none"
                stroke={pal.detail}
                strokeOpacity={0.48}
                strokeWidth={1.45}
              />
              <Path
                d="M-30 562 Q105 604 210 562 T430 562"
                fill="none"
                stroke={pal.caustic}
                strokeOpacity={0.36}
                strokeWidth={1.2}
              />
              <Path
                d="M-30 660 Q110 628 220 660 T430 660"
                fill="none"
                stroke={pal.detail}
                strokeOpacity={0.28}
                strokeWidth={1.0}
              />
              {/* Moonlit water shimmer dashes */}
              {[
                { x: 54, y: 204, w: 34, op: 0.44 },
                { x: 302, y: 236, w: 42, op: 0.48 },
                { x: 26, y: 318, w: 38, op: 0.42 },
                { x: 326, y: 332, w: 32, op: 0.44 },
              ].map((d, i) => (
                <Path
                  key={i}
                  d={`M${d.x} ${d.y} Q${d.x + d.w / 2} ${d.y - 4} ${d.x + d.w} ${d.y}`}
                  fill="none"
                  stroke={pal.detail}
                  strokeOpacity={d.op}
                  strokeWidth={1.3}
                  strokeLinecap="round"
                />
              ))}
            </>
          )}

          {/* FIRE: Luminous rising ember sparks with warm halos + gossamer hearth heat-shimmer wisps */}
          {scene === 'fire' && (
            <>
              <Path
                d="M58 640 C78 510, 32 410, 84 260"
                fill="none"
                stroke={`url(#${idRain})`}
                strokeWidth={1.5}
              />
              <Path
                d="M344 650 C318 505, 368 400, 316 245"
                fill="none"
                stroke={`url(#${idRain})`}
                strokeWidth={1.45}
              />
              {[
                { x: 58, y: 174, r: 2.2, halo: 11, op: 0.86 },
                { x: 108, y: 248, r: 1.8, halo: 9, op: 0.74 },
                { x: 342, y: 162, r: 2.5, halo: 13, op: 0.88 },
                { x: 304, y: 224, r: 1.7, halo: 8, op: 0.70 },
                { x: 42, y: 356, r: 2.6, halo: 14, op: 0.88 },
                { x: 360, y: 338, r: 2.4, halo: 12, op: 0.84 },
                { x: 86, y: 448, r: 2.8, halo: 15, op: 0.86 },
                { x: 318, y: 454, r: 2.5, halo: 13, op: 0.82 },
                { x: 154, y: 132, r: 1.5, halo: 7, op: 0.64 },
                { x: 254, y: 144, r: 1.6, halo: 8, op: 0.66 },
                { x: 70, y: 580, r: 2.3, halo: 12, op: 0.72 },
                { x: 334, y: 598, r: 2.2, halo: 11, op: 0.70 },
              ].map((e, i) => (
                <React.Fragment key={i}>
                  <Circle cx={e.x} cy={e.y} r={e.halo} fill={`url(#${idGlow})`} fillOpacity={e.op * 0.62} />
                  <Circle cx={e.x} cy={e.y} r={e.r} fill={pal.detail} fillOpacity={e.op} />
                </React.Fragment>
              ))}
            </>
          )}

          {/* WIND: Flowing tapered silk air currents + drifting twilight mist motes */}
          {scene === 'wind' && (
            <>
              <Path d="M-24 148 C96 98, 256 196, 424 132" fill="none" stroke={`url(#${idWind})`} strokeWidth={1.65} />
              <Path d="M-24 276 C112 318, 276 232, 424 282" fill="none" stroke={`url(#${idWind})`} strokeWidth={1.45} />
              <Path d="M-24 414 C94 374, 286 458, 424 402" fill="none" stroke={`url(#${idWind})`} strokeWidth={1.35} />
              <Path d="M-24 590 C118 548, 288 638, 424 584" fill="none" stroke={`url(#${idWind})`} strokeWidth={1.2} />
              {[
                { x: 74, y: 142, r: 2.0, op: 0.65 },
                { x: 326, y: 162, r: 2.2, op: 0.70 },
                { x: 52, y: 292, r: 1.8, op: 0.60 },
                { x: 348, y: 266, r: 2.0, op: 0.64 },
                { x: 88, y: 406, r: 1.7, op: 0.56 },
                { x: 314, y: 422, r: 1.9, op: 0.58 },
              ].map((m, i) => (
                <Circle key={i} cx={m.x} cy={m.y} r={m.r} fill={pal.detail} fillOpacity={m.op} />
              ))}
            </>
          )}

          {/* CLASSICAL: Gilded concert-hall harmonic arcs & warm illuminated dust motes */}
          {scene === 'classical' && (
            <>
              <Path d="M-20 184 Q200 108 420 184" fill="none" stroke={`url(#${idWind})`} strokeWidth={1.45} />
              <Path d="M-20 398 Q200 472 420 398" fill="none" stroke={`url(#${idWind})`} strokeWidth={1.3} />
              {[
                { x: 64, y: 146, r: 2.2, halo: 11, op: 0.80 },
                { x: 334, y: 158, r: 2.0, halo: 10, op: 0.76 },
                { x: 48, y: 318, r: 2.4, halo: 12, op: 0.78 },
                { x: 352, y: 304, r: 2.1, halo: 10, op: 0.74 },
                { x: 96, y: 442, r: 1.9, halo: 9, op: 0.66 },
                { x: 312, y: 454, r: 2.2, halo: 11, op: 0.68 },
              ].map((m, i) => (
                <React.Fragment key={i}>
                  <Circle cx={m.x} cy={m.y} r={m.halo} fill={`url(#${idGlow})`} fillOpacity={m.op * 0.45} />
                  <Circle cx={m.x} cy={m.y} r={m.r} fill={pal.detail} fillOpacity={m.op} />
                </React.Fragment>
              ))}
            </>
          )}

          {/* REVERIE: Ink-in-water blooming sepia/gold concentric rings & floating motes */}
          {scene === 'reverie' && (
            <>
              <Circle cx={68} cy={176} r={54} fill="none" stroke={pal.detail} strokeOpacity={0.34} strokeWidth={1.1} />
              <Circle cx={68} cy={176} r={88} fill="none" stroke={pal.caustic} strokeOpacity={0.18} strokeWidth={0.85} />
              <Circle cx={336} cy={342} r={62} fill="none" stroke={pal.detail} strokeOpacity={0.32} strokeWidth={1.1} />
              <Circle cx={336} cy={342} r={98} fill="none" stroke={pal.caustic} strokeOpacity={0.16} strokeWidth={0.8} />
              {[
                { x: 112, y: 144, r: 2.0, op: 0.72 },
                { x: 314, y: 184, r: 2.2, op: 0.76 },
                { x: 54, y: 368, r: 1.9, op: 0.68 },
                { x: 348, y: 438, r: 2.0, op: 0.66 },
              ].map((m, i) => (
                <Circle key={i} cx={m.x} cy={m.y} r={m.r} fill={pal.detail} fillOpacity={m.op} />
              ))}
            </>
          )}
        </Svg>
      </Animated.View>
    </View>
  )
})

/**
 * Handcrafted full-viewport nocturnal backdrop with smooth 1.6s twilight crossfades:
 * - When the user moves across soundscapes, the outgoing atmosphere slowly dissolves
 *   into the incoming palette & motif over 1.6s (zero abrupt color snap!).
 * - Pared-back optical caustic lines (~25% calmer) + clearly visible per-scene details.
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

  // Smooth slow crossfade between outgoing & incoming scenes
  const [scenePair, setScenePair] = useState<{ prev: SoundSceneId | null; curr: SoundSceneId }>({
    prev: null,
    curr: scene,
  })
  const lastSceneRef = useRef<SoundSceneId>(scene)
  const fadeProgress = useSharedValue(1)

  useEffect(() => {
    if (scene === lastSceneRef.current) return
    const outgoing = lastSceneRef.current
    lastSceneRef.current = scene
    setScenePair({ prev: outgoing, curr: scene })
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
      setScenePair((p) => (p.curr === scene ? { prev: null, curr: scene } : p))
    }, 1700)
    return () => clearTimeout(t)
  }, [scene, reduced, fadeProgress])

  const driftA = useSharedValue(0)
  const driftB = useSharedValue(0)
  const breath = useSharedValue(0)
  const causticSpin = useSharedValue(0)
  const detailFlow = useSharedValue(0)
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
        withTiming(1, { duration: 48000, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
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

  const detailDriftStyle = useAnimatedStyle(() => ({
    opacity: (0.76 + breath.get() * 0.20) * intensitySV.get(),
    transform: [
      {
        translateY:
          scene === 'rain'
            ? (detailFlow.get() - 0.5) * 30
            : scene === 'fire'
              ? -(detailFlow.get() - 0.5) * 26
              : (detailFlow.get() - 0.5) * 14,
      },
      {
        translateX:
          scene === 'wind' || scene === 'waves'
            ? (detailFlow.get() - 0.5) * 28
            : (driftA.get() - 0.5) * 12,
      },
    ],
  }))

  const prevCrossfadeStyle = useAnimatedStyle(() => ({
    opacity: 1 - fadeProgress.get(),
  }))

  const currCrossfadeStyle = useAnimatedStyle(() => ({
    opacity: fadeProgress.get(),
  }))

  if (!isFocused) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap]} />
  }

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap]}>
      {scenePair.prev && (
        <Animated.View style={[StyleSheet.absoluteFill, prevCrossfadeStyle]}>
          <SceneAtmosphere
            scene={scenePair.prev}
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
            detailDriftStyle={detailDriftStyle}
          />
        </Animated.View>
      )}
      <Animated.View style={[StyleSheet.absoluteFill, currCrossfadeStyle]}>
        <SceneAtmosphere
          scene={scenePair.curr}
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
          detailDriftStyle={detailDriftStyle}
        />
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
