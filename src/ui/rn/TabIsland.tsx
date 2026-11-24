import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle } from 'react-native-svg'
import { LayoutGrid, Settings, Waves } from 'lucide-react-native'
import { sessionProgress } from '@/core/session'
import { presetById } from '@/core/sound/catalog'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useNav, type Tab } from '@/ui/state/nav'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { getNativeGlassBinding, GlassGroup, GlassSurface } from './Glass'

const PILL_PAD = 5
const SEG_W = 112
const SEG_H = 44
const PILL_W = SEG_W * 2 + PILL_PAD * 2
const PILL_H = SEG_H + PILL_PAD * 2

function LiveBars({ color }: { color: string }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 12), 260)
    return () => clearInterval(id)
  }, [])
  const h1 = 6 + ((tick * 3) % 9)
  const h2 = 8 + (((tick + 4) * 5) % 8)
  const h3 = 5 + (((tick + 8) * 3) % 9)
  return (
    <View style={styles.bars}>
      <View style={[styles.bar, { height: h1, backgroundColor: color }]} />
      <View style={[styles.bar, { height: h2, backgroundColor: color }]} />
      <View style={[styles.bar, { height: h3, backgroundColor: color }]} />
    </View>
  )
}

/**
 * Apple iOS 26 Liquid Glass floating Tab Dock with interactive magnifying-lens droplet:
 * - Touching & holding anywhere on the Play | Sounds pill swells the glass lens into a
 *   luminous magnifying droplet (`scaleX: 1.14, scaleY: 1.24`) that follows your finger
 *   across segments at 120fps on the UI thread with velocity stretch, edge rubber-banding,
 *   live icon/label magnification underneath, and a haptic tick on crossing tabs.
 * - Pure obsidian Liquid Glass (zero yellow tint).
 */
export function TabIsland({
  activeTab,
  onSelectTab,
}: {
  activeTab: Tab
  onSelectTab: (tab: Tab) => void
}) {
  const { color } = useTokenColors()
  const insets = useSafeAreaInsets()
  const setNightOpen = useNav((s) => s.setNightOpen)
  const hapticsOn = useSettings((s) => s.haptics)
  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const session = useSession((s) => s.session)
  const [, setTick] = useState(0)

  const onSelectTabRef = useRef(onSelectTab)
  onSelectTabRef.current = onSelectTab
  const hapticsRef = useRef(hapticsOn)
  hapticsRef.current = hapticsOn

  const activeIdx = activeTab === 'sounds' ? 1 : 0
  const lensX = useSharedValue(activeIdx * SEG_W)
  const lensLifted = useSharedValue(0)
  const dragVelocity = useSharedValue(0)
  const hoveredIdxSV = useSharedValue(activeIdx)
  const isInteractingSV = useSharedValue(0)

  useEffect(() => {
    if (isInteractingSV.get() === 0) {
      lensX.set(
        withSpring(activeIdx * SEG_W, {
          duration: 320,
          dampingRatio: 0.82,
          reduceMotion: ReduceMotion.System,
        }),
      )
      hoveredIdxSV.set(activeIdx)
    }
  }, [activeIdx, lensX, hoveredIdxSV, isInteractingSV])

  useEffect(() => {
    if (!session) return
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [session])

  const fireTickHaptic = () => {
    if (hapticsRef.current) haptics.play('light')
  }

  const commitTab = (idx: number) => {
    const next: Tab = idx === 1 ? 'sounds' : 'play'
    onSelectTabRef.current(next)
  }

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => {
          'worklet'
          isInteractingSV.set(1)
          const rawX = e.x - PILL_PAD - SEG_W * 0.5
          const clampedX = Math.max(-10, Math.min(SEG_W + 10, rawX))
          const idx = e.x >= PILL_W * 0.5 ? 1 : 0

          lensLifted.set(
            withSpring(1, {
              duration: 220,
              dampingRatio: 0.72,
              reduceMotion: ReduceMotion.System,
            }),
          )
          lensX.set(
            withSpring(Math.max(0, Math.min(SEG_W, clampedX)), {
              duration: 220,
              dampingRatio: 0.78,
              reduceMotion: ReduceMotion.System,
            }),
          )

          if (idx !== hoveredIdxSV.get()) {
            hoveredIdxSV.set(idx)
            scheduleOnRN(fireTickHaptic)
          }
        })
        .onUpdate((e) => {
          'worklet'
          const rawX = e.x - PILL_PAD - SEG_W * 0.5
          // Smooth rubber-band past the left/right boundaries
          let x = rawX
          if (rawX < 0) x = rawX * 0.24
          else if (rawX > SEG_W) x = SEG_W + (rawX - SEG_W) * 0.24

          lensX.set(x)
          dragVelocity.set(e.velocityX)

          const idx = x >= SEG_W * 0.5 ? 1 : 0
          if (idx !== hoveredIdxSV.get()) {
            hoveredIdxSV.set(idx)
            scheduleOnRN(fireTickHaptic)
          }
        })
        .onEnd((e) => {
          'worklet'
          // Support quick flick velocity as well as position
          let targetIdx = lensX.get() >= SEG_W * 0.5 ? 1 : 0
          if (e.velocityX > 360) targetIdx = 1
          else if (e.velocityX < -360) targetIdx = 0

          hoveredIdxSV.set(targetIdx)
          lensX.set(
            withSpring(targetIdx * SEG_W, {
              duration: 300,
              dampingRatio: 0.80,
              velocity: e.velocityX * 0.35,
              reduceMotion: ReduceMotion.System,
            }),
          )
          scheduleOnRN(commitTab, targetIdx)
        })
        .onFinalize(() => {
          'worklet'
          isInteractingSV.set(0)
          dragVelocity.set(0)
          lensLifted.set(
            withSpring(0, {
              duration: 280,
              dampingRatio: 0.78,
              reduceMotion: ReduceMotion.System,
            }),
          )
          lensX.set(
            withSpring(hoveredIdxSV.get() * SEG_W, {
              duration: 300,
              dampingRatio: 0.82,
              reduceMotion: ReduceMotion.System,
            }),
          )
        }),
    [lensX, lensLifted, dragVelocity, hoveredIdxSV, isInteractingSV],
  )

  const lensAnimStyle = useAnimatedStyle(() => {
    const lifted = lensLifted.get()
    const velStretch = Math.min(0.08, Math.abs(dragVelocity.get()) / 5000) * lifted
    const scaleX = interpolate(lifted, [0, 1], [1, 1.14]) + velStretch
    const scaleY = interpolate(lifted, [0, 1], [1, 1.24]) - velStretch * 0.5
    return {
      transform: [{ translateX: lensX.get() }, { scaleX }, { scaleY }],
    }
  })

  const playZoomStyle = useAnimatedStyle(() => {
    const proximity = Math.max(0, 1 - Math.abs(lensX.get()) / SEG_W)
    const zoom = 1 + proximity * lensLifted.get() * 0.11
    return {
      transform: [{ scale: zoom }],
    }
  })

  const soundsZoomStyle = useAnimatedStyle(() => {
    const proximity = Math.max(0, 1 - Math.abs(lensX.get() - SEG_W) / SEG_W)
    const zoom = 1 + proximity * lensLifted.get() * 0.11
    return {
      transform: [{ scale: zoom }],
    }
  })

  const preset = presetId ? presetById(presetId) : null
  const sessProgress = session ? sessionProgress(session, Date.now()) : 0
  const soundsLabel = playing && activeTab === 'play' ? (preset?.name ?? 'Custom') : 'Sounds'
  const nativeGlass = getNativeGlassBinding()
  const NativeGlassView = nativeGlass?.GlassView ?? null

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.outer,
        {
          bottom: Math.max(insets.bottom, 10) + 6,
        },
      ]}
    >
      <GlassGroup spacing={10} pointerEvents="box-none" style={styles.row}>
        {/* Outer wrapper allows the enlarged magnifying glass lens to swell smoothly above the pill rim */}
        <GestureDetector gesture={panGesture}>
          <View
            accessible
            accessibilityRole="tablist"
            accessibilityLabel="Navigation tabs. Hold and drag to switch between Play and Sounds."
            style={styles.pillHost}
          >
            {/* Base Liquid Glass capsule */}
            <GlassSurface variant="chrome" radius={28} style={[StyleSheet.absoluteFill, styles.pillSurface]}>
              <View />
            </GlassSurface>

            {/* Interactive Magnifying Glass Droplet Lens */}
            <Animated.View pointerEvents="none" style={[styles.lensWrap, lensAnimStyle]}>
              {NativeGlassView ? (
                <NativeGlassView
                  glassEffectStyle="regular"
                  colorScheme="dark"
                  isInteractive
                  tintColor="rgba(255, 255, 255, 0.12)"
                  style={styles.lensNative}
                />
              ) : (
                <View style={styles.lensFallback} />
              )}
            </Animated.View>

            {/* Tab segments with live optical magnification under the lens */}
            <View pointerEvents="none" style={styles.segRow}>
              <Animated.View style={[styles.segBtn, playZoomStyle]}>
                <LayoutGrid
                  size={17}
                  strokeWidth={1.65}
                  color={activeTab === 'play' ? color.ink : color.ink3}
                />
                <Text style={[styles.segLabel, { color: activeTab === 'play' ? color.ink : color.ink3 }]}>
                  Play
                </Text>
              </Animated.View>

              <Animated.View style={[styles.segBtn, soundsZoomStyle]}>
                {playing ? (
                  <LiveBars color={activeTab === 'sounds' ? color.ink : color.accent} />
                ) : (
                  <Waves
                    size={17}
                    strokeWidth={1.65}
                    color={activeTab === 'sounds' ? color.ink : color.ink3}
                  />
                )}
                <Text
                  numberOfLines={1}
                  style={[
                    styles.segLabel,
                    {
                      color: activeTab === 'sounds' ? color.ink : playing ? color.ink2 : color.ink3,
                    },
                  ]}
                >
                  {soundsLabel}
                </Text>
              </Animated.View>
            </View>
          </View>
        </GestureDetector>

        {/* Night Control Orb — pure obsidian glass (zero yellow background fill) */}
        <Pressable
          onPress={() => {
            if (hapticsOn) haptics.play('light')
            setNightOpen(true)
          }}
          accessibilityRole="button"
          accessibilityLabel="Night controls"
          style={({ pressed }) => [
            styles.nightPress,
            pressed ? { transform: [{ scale: 0.94 }], opacity: 0.88 } : null,
          ]}
        >
          <GlassSurface
            variant="chrome"
            radius={28}
            interactive
            style={styles.nightOrb}
          >
            {session && (
              <Svg width={56} height={56} viewBox="0 0 56 56" style={StyleSheet.absoluteFill}>
                <Circle
                  cx={28}
                  cy={28}
                  r={25.5}
                  fill="none"
                  stroke={color.accent}
                  strokeWidth={2}
                  strokeDasharray={2 * Math.PI * 25.5}
                  strokeDashoffset={2 * Math.PI * 25.5 * (1 - sessProgress)}
                  transform="rotate(-90 28 28)"
                />
              </Svg>
            )}
            <Settings
              size={19}
              strokeWidth={1.65}
              color={session ? color.accent : color.ink2}
            />
          </GlassSurface>
        </Pressable>
      </GlassGroup>
    </View>
  )
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  pillHost: {
    width: PILL_W,
    height: PILL_H,
    justifyContent: 'center',
    overflow: 'visible',
  },
  pillSurface: {
    borderRadius: 28,
  },
  lensWrap: {
    position: 'absolute',
    top: PILL_PAD,
    left: PILL_PAD,
    width: SEG_W,
    height: SEG_H,
    borderRadius: SEG_H / 2,
    overflow: 'hidden',
  },
  lensNative: {
    flex: 1,
    borderRadius: SEG_H / 2,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  lensFallback: {
    flex: 1,
    borderRadius: SEG_H / 2,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.26)',
  },
  segRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PILL_PAD,
    height: PILL_H,
  },
  segBtn: {
    width: SEG_W,
    height: SEG_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  segLabel: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.15,
  },
  nightPress: {
    width: 56,
    height: 56,
  },
  nightOrb: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bars: {
    width: 15,
    height: 15,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingVertical: 1,
  },
  bar: {
    width: 2.2,
    borderRadius: 1,
  },
})
