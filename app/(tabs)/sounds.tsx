import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SlidersHorizontal, Timer } from 'lucide-react-native'
import { PRESETS, presetById, SILENT_MIX } from '@/core/sound/catalog'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { AmbientBackdrop } from '@/ui/rn/AmbientBackdrop'
import { FRAME_MAX_WIDTH, PopoverMenu } from '@/ui/rn/controls'
import { GlassSurface } from '@/ui/rn/Glass'
import { useResponsiveLayout } from '@/ui/rn/hooks'
import { MixSheet } from '@/ui/rn/MixSheet'
import { SoundField } from '@/ui/rn/SoundField'
import { useNav } from '@/ui/state/nav'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'

const TIMER_OPTIONS = [
  { value: 0, label: 'Until stopped' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
] as const

export default function SoundsScreen() {
  const { insets, isCompact, sideMargin } = useResponsiveLayout()
  const { color } = useTokenColors()

  const playing = useSound((s) => s.playing)
  const activePresetId = useSound((s) => s.presetId)
  const activeMix = useSound((s) => s.mix)
  const playPreset = useSound((s) => s.playPreset)
  const playMix = useSound((s) => s.playMix)
  const updateMix = useSound((s) => s.updateMix)
  const stopSound = useSound((s) => s.stop)
  const setSoundTimer = useSound((s) => s.setTimer)

  const customMix = useSettings((s) => s.mix)
  const hasCustomMix = useSettings((s) => s.hasCustomMix)
  const sleepTimer = useSettings((s) => s.sleepTimer)
  const hapticsOn = useSettings((s) => s.haptics)
  const setSettings = useSettings((s) => s.set)

  const mixOpen = useNav((s) => s.mixOpen)
  const setMixOpen = useNav((s) => s.setMixOpen)

  const [selectedId, setSelectedId] = useState<string>(() => activePresetId ?? PRESETS[0].id)
  const [timerOpen, setTimerOpen] = useState(false)

  const items = [
    ...PRESETS.map((p) => ({ id: p.id, name: p.name, mix: p.mix })),
    ...(hasCustomMix ? [{ id: 'custom', name: 'Custom', mix: customMix }] : []),
  ]

  const currentId = activePresetId ?? selectedId
  const currentItem = items.find((i) => i.id === currentId) ?? items[0]
  const displayMix = playing && activeMix ? activeMix : currentItem.mix

  const selectItem = (id: string, autoPlay = playing) => {
    if (hapticsOn) haptics.play('light')
    setSelectedId(id)
    if (autoPlay) {
      if (id === 'custom') {
        playMix(customMix, sleepTimer)
      } else {
        playPreset(id, sleepTimer)
      }
    }
  }

  const togglePlayback = () => {
    if (hapticsOn) haptics.play('medium')
    if (playing) {
      stopSound(1.2)
    } else if (currentItem.id === 'custom') {
      playMix(customMix, sleepTimer)
    } else {
      playPreset(currentItem.id, sleepTimer)
    }
  }

  const swipePreset = (dir: -1 | 1) => {
    const idx = items.findIndex((i) => i.id === currentItem.id)
    const next = items[(idx + dir + items.length) % items.length]
    selectItem(next.id, playing)
  }

  const timerLabel = sleepTimer > 0 ? `${sleepTimer}m` : 'Timer'

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + (isCompact ? 12 : 20),
          paddingBottom: Math.max(insets.bottom, 16) + 92,
        },
      ]}
    >
      <AmbientBackdrop />
      <View style={[styles.frame, { paddingHorizontal: sideMargin }]}>
        <Text style={[styles.heading, { color: color.ink, fontSize: isCompact ? 26 : 32 }]}>
          {currentItem.name}
        </Text>

        <View style={styles.center}>
          <SoundField
            mix={displayMix}
            playing={playing}
            label={currentItem.name}
            onToggle={togglePlayback}
            onSwipe={swipePreset}
          />
        </View>

        <View style={styles.controlsArea}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.stripScroll}
            contentContainerStyle={styles.strip}
          >
            {items.map((item) => {
              const selected = item.id === currentItem.id
              return (
                <Pressable key={item.id} onPress={() => selectItem(item.id, true)}>
                  <GlassSurface
                    variant="pill"
                    radius={18}
                    accent={selected}
                    interactive
                    style={[
                      styles.modeChip,
                      !selected ? { backgroundColor: 'transparent', borderColor: 'transparent' } : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.modeText,
                        { color: selected ? color.ink : color.ink3 },
                      ]}
                    >
                      {item.name}
                    </Text>
                  </GlassSurface>
                </Pressable>
              )
            })}
          </ScrollView>

          <View style={styles.pillRow}>
            <Pressable
              onPress={() => {
                if (hapticsOn) haptics.play('light')
                setTimerOpen(true)
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <GlassSurface variant="pill" radius={21} interactive style={styles.pillBtn}>
                <Timer size={15} strokeWidth={1.65} color={color.accent} />
                <Text style={[styles.pillText, { color: color.ink }]}>{timerLabel}</Text>
              </GlassSurface>
            </Pressable>

            <Pressable
              onPress={() => {
                if (hapticsOn) haptics.play('light')
                setMixOpen(true)
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <GlassSurface variant="pill" radius={21} interactive style={styles.pillBtn}>
                <SlidersHorizontal size={15} strokeWidth={1.65} color={color.ink2} />
                <Text style={[styles.pillText, { color: color.ink }]}>Mix</Text>
              </GlassSurface>
            </Pressable>
          </View>
        </View>
      </View>

      <PopoverMenu
        open={timerOpen}
        onClose={() => setTimerOpen(false)}
        label="Sleep timer"
        options={TIMER_OPTIONS}
        value={sleepTimer}
        onSelect={(m) => {
          setSettings({ sleepTimer: m })
          setSoundTimer(m)
        }}
      />

      <MixSheet
        open={mixOpen}
        onClose={() => setMixOpen(false)}
        mix={displayMix}
        onChange={(next) => {
          setSettings({ mix: next, hasCustomMix: true })
          setSelectedId('custom')
          if (playing) {
            updateMix(next)
          } else {
            playMix(next, sleepTimer)
          }
        }}
        onReset={() => {
          const fallback = presetById('rainfall')?.mix ?? SILENT_MIX
          setSettings({ mix: SILENT_MIX, hasCustomMix: false })
          setSelectedId('rainfall')
          if (playing) updateMix(fallback)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: FRAME_MAX_WIDTH,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    fontWeight: '300',
    letterSpacing: -0.9,
    marginTop: 6,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsArea: {
    width: '100%',
    gap: 16,
    alignItems: 'center',
  },
  stripScroll: {
    width: '100%',
    flexGrow: 0,
  },
  strip: {
    gap: 6,
    paddingHorizontal: 8,
    flexGrow: 1,
    justifyContent: 'center',
  },
  modeChip: {
    paddingHorizontal: 14,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeText: {
    fontSize: 13.5,
    fontWeight: '500',
  },
  pillRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 42,
    paddingHorizontal: 18,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
  },
})
