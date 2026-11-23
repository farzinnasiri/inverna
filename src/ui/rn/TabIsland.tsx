import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle } from 'react-native-svg'
import { LayoutGrid, SlidersHorizontal, Waves } from 'lucide-react-native'
import { sessionProgress } from '@/core/session'
import { presetById } from '@/core/sound/catalog'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useNav, type Tab } from '@/ui/state/nav'
import { useSession } from '@/ui/state/session'
import { useSound } from '@/ui/state/sound'
import { FRAME_MAX_WIDTH } from './controls'

function LiveBars({ color }: { color: string }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 12), 240)
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
  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const session = useSession((s) => s.session)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!session) return
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [session])

  const preset = presetId ? presetById(presetId) : null
  const sessProgress = session ? sessionProgress(session, Date.now()) : 0
  const soundsLabel = playing && activeTab === 'play' ? (preset?.name ?? 'Custom') : 'Sounds'

  const pillSurfaceStyle = {
    backgroundColor: Platform.OS === 'ios' ? 'rgba(18, 20, 25, 0.58)' : 'rgba(20, 22, 26, 0.94)',
    borderColor: color.lineStrong,
    borderTopColor: 'rgba(220, 224, 230, 0.14)',
  }

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.outer,
        {
          bottom: Math.max(insets.bottom, 12) + 6,
        },
      ]}
    >
      <View pointerEvents="box-none" style={styles.inner}>
        {/* Dead-centered Play | Sounds pill */}
        <View style={[styles.pillWrap, pillSurfaceStyle]}>
          {Platform.OS === 'ios' && <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />}
          <Pressable
            onPress={() => onSelectTab('play')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'play' }}
            style={[
              styles.segBtn,
              activeTab === 'play' ? { backgroundColor: color.surface3 } : null,
            ]}
          >
            <LayoutGrid
              size={17}
              strokeWidth={1.6}
              color={activeTab === 'play' ? color.ink : color.ink3}
            />
            <Text style={[styles.segLabel, { color: activeTab === 'play' ? color.ink : color.ink3 }]}>
              Play
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onSelectTab('sounds')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'sounds' }}
            style={[
              styles.segBtn,
              activeTab === 'sounds' ? { backgroundColor: color.surface3 } : null,
            ]}
          >
            {playing ? (
              <LiveBars color={activeTab === 'sounds' ? color.ink : color.accent} />
            ) : (
              <Waves
                size={17}
                strokeWidth={1.6}
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
          </Pressable>
        </View>

        {/* Right Night / Controls circular button */}
        <Pressable
          onPress={() => setNightOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Night controls"
          style={({ pressed }) => [
            styles.nightBtn,
            pillSurfaceStyle,
            pressed ? { transform: [{ scale: 0.94 }] } : null,
          ]}
        >
          {Platform.OS === 'ios' && <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />}
          {session && (
            <Svg width={48} height={48} viewBox="0 0 48 48" style={StyleSheet.absoluteFill}>
              <Circle
                cx={24}
                cy={24}
                r={22}
                fill="none"
                stroke={color.accent}
                strokeWidth={1.75}
                strokeDasharray={2 * Math.PI * 22}
                strokeDashoffset={2 * Math.PI * 22 * (1 - sessProgress)}
                transform="rotate(-90 24 24)"
              />
            </Svg>
          )}
          <SlidersHorizontal size={18} strokeWidth={1.5} color={session ? color.accent : color.ink2} />
        </Pressable>
      </View>
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
  inner: {
    width: '100%',
    maxWidth: FRAME_MAX_WIDTH,
    paddingHorizontal: 18,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
    gap: 2,
  },
  segBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 999,
    maxWidth: 136,
  },
  segLabel: {
    fontSize: 13.5,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  nightBtn: {
    position: 'absolute',
    right: 18,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
