import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle } from 'react-native-svg'
import { LayoutGrid, Moon, Waves } from 'lucide-react-native'
import { sessionProgress } from '@/core/session'
import { presetById } from '@/core/sound/catalog'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useNav, type Tab } from '@/ui/state/nav'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { GlassGroup, GlassSurface } from './Glass'

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
 * Centered floating iOS 26 Liquid Glass navigation dock.
 * - Optically centered `Play | Sounds` pill + `Moon` Night Control orb grouped together.
 * - Distinct icons (`Moon` = Night settings; `SlidersHorizontal` is reserved exclusively for Sound Mix).
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

  useEffect(() => {
    if (!session) return
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [session])

  const preset = presetId ? presetById(presetId) : null
  const sessProgress = session ? sessionProgress(session, Date.now()) : 0
  const soundsLabel = playing && activeTab === 'play' ? (preset?.name ?? 'Custom') : 'Sounds'

  const handleTab = (tab: Tab) => {
    if (tab !== activeTab && hapticsOn) haptics.play('light')
    onSelectTab(tab)
  }

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
        <GlassSurface variant="chrome" radius={28} style={styles.pillWrap}>
          <Pressable
            onPress={() => handleTab('play')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'play' }}
            style={({ pressed }) => [
              styles.segBtn,
              activeTab === 'play' ? styles.segActive : null,
              pressed ? { opacity: 0.84 } : null,
            ]}
          >
            <LayoutGrid
              size={17}
              strokeWidth={1.65}
              color={activeTab === 'play' ? color.ink : color.ink3}
            />
            <Text style={[styles.segLabel, { color: activeTab === 'play' ? color.ink : color.ink3 }]}>
              Play
            </Text>
          </Pressable>

          <Pressable
            onPress={() => handleTab('sounds')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'sounds' }}
            style={({ pressed }) => [
              styles.segBtn,
              activeTab === 'sounds' ? styles.segActive : null,
              pressed ? { opacity: 0.84 } : null,
            ]}
          >
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
          </Pressable>
        </GlassSurface>

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
            accent={Boolean(session)}
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
            <Moon
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
  pillWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    padding: 5,
    gap: 4,
  },
  segBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    maxWidth: 138,
  },
  segActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.20)',
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
