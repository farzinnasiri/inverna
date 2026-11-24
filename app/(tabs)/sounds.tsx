import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  CloudRain,
  Flame,
  Headphones,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Volume2,
  Waves,
  Wind,
} from 'lucide-react-native'
import { PRESETS, presetById, SILENT_MIX } from '@/core/sound/catalog'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { AmbientBackdrop } from '@/ui/rn/AmbientBackdrop'
import { FRAME_MAX_WIDTH, PopoverMenu, Slider } from '@/ui/rn/controls'
import { GlassSurface } from '@/ui/rn/Glass'
import { useResponsiveLayout } from '@/ui/rn/hooks'
import { MixSheet } from '@/ui/rn/MixSheet'
import { SoundField } from '@/ui/rn/SoundField'
import { useNav } from '@/ui/state/nav'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'

const TIMER_OPTIONS = [
  { value: 0, label: 'Until stopped' },
  { value: 15, label: 'Fade out in 15 min' },
  { value: 30, label: 'Fade out in 30 min' },
  { value: 45, label: 'Fade out in 45 min' },
  { value: 60, label: 'Fade out in 60 min' },
] as const

function SoundGlyph({ id, color }: { id: string; color: string }) {
  if (id === 'rainfall' || id === 'theta-rain') return <CloudRain size={17} strokeWidth={1.65} color={color} />
  if (id === 'low-tide') return <Waves size={17} strokeWidth={1.65} color={color} />
  if (id === 'hearth') return <Flame size={17} strokeWidth={1.65} color={color} />
  if (id === 'deep-drift') return <Sparkles size={17} strokeWidth={1.65} color={color} />
  return <Wind size={17} strokeWidth={1.65} color={color} />
}

/**
 * All-in-one Sound Sanctuary:
 * - Zero horizontal clipping strip: all 5 soundscapes (+ Custom when created) are visible at once.
 * - Live breathing SoundField orb for play/pause.
 * - Always-visible Master Volume slider + clear fade-out timer + Mix studio.
 */
export default function SoundsScreen() {
  const { insets, isCompact, sideMargin } = useResponsiveLayout()
  const { color } = useTokenColors()

  const playing = useSound((s) => s.playing)
  const activePresetId = useSound((s) => s.presetId)
  const activeMix = useSound((s) => s.mix)
  const volume = useSound((s) => s.volume)
  const setVolume = useSound((s) => s.setVolume)
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
    ...PRESETS.map((p) => ({
      id: p.id,
      name: p.name,
      hint: p.hint,
      mix: p.mix,
      binaural: Boolean(p.mix.band),
    })),
    ...(hasCustomMix
      ? [{ id: 'custom', name: 'Custom', hint: 'Your layered mix', mix: customMix, binaural: Boolean(customMix.band) }]
      : []),
  ]

  const currentId = activePresetId ?? selectedId
  const currentItem = items.find((i) => i.id === currentId) ?? items[0]
  const displayMix = playing && activeMix ? activeMix : currentItem.mix

  const selectItem = (id: string, autoPlay = true) => {
    if (hapticsOn) haptics.play('light')
    if (playing && id === currentItem.id) {
      stopSound(1.0)
      return
    }
    setSelectedId(id)
    if (id !== 'custom') setSettings({ sessionPreset: id })
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

  const timerLabel = sleepTimer > 0 ? `Fades in ${sleepTimer}m` : 'No fade timer'

  return (
    <View style={styles.root}>
      <AmbientBackdrop />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: sideMargin,
            paddingTop: insets.top + (isCompact ? 8 : 16),
            paddingBottom: Math.max(insets.bottom, 16) + 104,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.frame, { gap: isCompact ? 14 : 18 }]}>
          {/* Header */}
          <View style={styles.head}>
            <Text style={[styles.heading, { color: color.ink, fontSize: isCompact ? 24 : 28 }]}>
              {currentItem.name}
            </Text>
            <Text style={[styles.sub, { color: color.ink2 }]}>
              {playing
                ? sleepTimer > 0
                  ? `Playing · fades out in ${sleepTimer}m`
                  : 'Playing · continues in background'
                : currentItem.hint}
            </Text>
          </View>

          {/* Compact tactile breathing dial */}
          <View style={styles.dialWrap}>
            <SoundField
              mix={displayMix}
              playing={playing}
              label={currentItem.name}
              onToggle={togglePlayback}
              onSwipe={swipePreset}
            />
          </View>

          {/* All soundscapes visible together — zero horizontal clipping */}
          <View style={styles.grid}>
            {items.map((item) => {
              const selected = item.id === currentItem.id
              const live = playing && selected
              return (
                <Pressable
                  key={item.id}
                  onPress={() => selectItem(item.id, true)}
                  style={({ pressed }) => [
                    styles.cardWrap,
                    {
                      opacity: pressed ? 0.85 : 1,
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    },
                  ]}
                >
                  <GlassSurface
                    variant="card"
                    radius={18}
                    accent={live || selected}
                    interactive
                    style={styles.presetCard}
                  >
                    <View style={styles.presetTop}>
                      <SoundGlyph id={item.id} color={live || selected ? color.accent : color.ink2} />
                      {item.binaural ? (
                        <Headphones size={13} strokeWidth={1.65} color={live ? color.accent : color.ink3} />
                      ) : null}
                    </View>
                    <View>
                      <Text
                        numberOfLines={1}
                        style={[styles.presetName, { color: live || selected ? color.ink : color.ink2 }]}
                      >
                        {item.name}
                      </Text>
                      <Text numberOfLines={2} style={[styles.presetHint, { color: color.ink3 }]}>
                        {live ? 'Playing' : item.hint}
                      </Text>
                    </View>
                  </GlassSurface>
                </Pressable>
              )
            })}
          </View>

          {/* Always-visible Volume slider + Timer & Mix controls */}
          <GlassSurface variant="card" radius={20} style={styles.volumeCard}>
            <View style={styles.volHead}>
              <View style={styles.volTitleRow}>
                <Volume2 size={15} strokeWidth={1.65} color={color.ink2} />
                <Text style={[styles.volLabel, { color: color.ink2 }]}>Volume</Text>
              </View>
              <Text style={[styles.volPct, { color: color.accent }]}>{Math.round(volume * 100)}%</Text>
            </View>
            <Slider value={volume} onChange={setVolume} label="Soundscape volume" />
          </GlassSurface>

          <View style={styles.pillRow}>
            <Pressable
              onPress={() => {
                if (hapticsOn) haptics.play('light')
                setTimerOpen(true)
              }}
              style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.85 : 1 }]}
            >
              <GlassSurface variant="pill" radius={21} interactive style={styles.pillBtn}>
                <Timer size={15} strokeWidth={1.65} color={color.accent} />
                <Text style={[styles.pillText, { color: color.ink }]} numberOfLines={1}>
                  {timerLabel}
                </Text>
              </GlassSurface>
            </Pressable>

            <Pressable
              onPress={() => {
                if (hapticsOn) haptics.play('light')
                setMixOpen(true)
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <GlassSurface variant="pill" radius={21} interactive style={[styles.pillBtn, { paddingHorizontal: 20 }]}>
                <SlidersHorizontal size={15} strokeWidth={1.65} color={color.ink2} />
                <Text style={[styles.pillText, { color: color.ink }]}>Mix</Text>
              </GlassSurface>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <PopoverMenu
        open={timerOpen}
        onClose={() => setTimerOpen(false)}
        label="Sleep fade-out timer"
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
    backgroundColor: '#000000',
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
  },
  frame: {
    width: '100%',
    maxWidth: FRAME_MAX_WIDTH,
    alignItems: 'center',
  },
  head: {
    alignItems: 'center',
    gap: 3,
  },
  heading: {
    fontWeight: '400',
    letterSpacing: -0.7,
  },
  sub: {
    fontSize: 13.5,
  },
  dialWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  grid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  cardWrap: {
    width: '48.5%',
    flexGrow: 1,
  },
  presetCard: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 8,
    minHeight: 74,
    justifyContent: 'space-between',
  },
  presetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  presetName: {
    fontSize: 14.5,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  presetHint: {
    fontSize: 11.5,
    marginTop: 1,
  },
  volumeCard: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 2,
  },
  volHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  volTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  volLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  volPct: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  pillRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 9,
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 44,
    paddingHorizontal: 16,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
  },
})
