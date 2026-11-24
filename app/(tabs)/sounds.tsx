import { useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  ChevronRight,
  CloudRain,
  Flame,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Volume2,
  Waves,
  Wind,
} from 'lucide-react-native'
import { DEFAULT_PRESET_ID, PRESETS, presetById, SILENT_MIX } from '@/core/sound/catalog'
import { harmonicKeyMeta } from '@/core/sound/harmonics'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { AcousticEngineSheet } from '@/ui/rn/AcousticEngineSheet'
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
  if (id === 'theta-rain' || id === 'rainfall') return <CloudRain size={16} strokeWidth={1.65} color={color} />
  if (id === 'low-tide') return <Waves size={16} strokeWidth={1.65} color={color} />
  if (id === 'hearth') return <Flame size={16} strokeWidth={1.65} color={color} />
  if (id === 'deep-drift') return <Sparkles size={16} strokeWidth={1.65} color={color} />
  return <Wind size={16} strokeWidth={1.65} color={color} />
}

/**
 * Neuroacoustic Sound Sanctuary:
 * - Serene Watchmaker surface by default (Header, quiet telemetry pill, breathing 0.1 Hz Dial,
 *   1 full-width flagship Theta Rain card + balanced 2x2 authored compositions, Volume, Timer, Mix).
 * - Tapping the quiet telemetry pill opens the optional Acoustic Engine inspector sheet.
 */
export default function SoundsScreen() {
  const { insets, isCompact, sideMargin } = useResponsiveLayout()
  const { color } = useTokenColors()

  const playing = useSound((s) => s.playing)
  const activePresetId = useSound((s) => s.presetId)
  const activeMix = useSound((s) => s.mix)
  const harmonicKey = useSound((s) => s.harmonicKey)
  const descent = useSound((s) => s.descent)
  const volume = useSound((s) => s.volume)
  const setVolume = useSound((s) => s.setVolume)
  const playPreset = useSound((s) => s.playPreset)
  const playMix = useSound((s) => s.playMix)
  const updateMix = useSound((s) => s.updateMix)
  const stopSound = useSound((s) => s.stop)
  const setSoundTimer = useSound((s) => s.setTimer)

  const customMix = useSettings((s) => s.mix)
  const hasCustomMix = useSettings((s) => s.hasCustomMix)
  const savedPreset = useSettings((s) => s.sessionPreset)
  const sleepTimer = useSettings((s) => s.sleepTimer)
  const hapticsOn = useSettings((s) => s.haptics)
  const setSettings = useSettings((s) => s.set)

  const mixOpen = useNav((s) => s.mixOpen)
  const setMixOpen = useNav((s) => s.setMixOpen)

  const [selectedId, setSelectedId] = useState<string>(
    () => activePresetId ?? presetById(savedPreset)?.id ?? DEFAULT_PRESET_ID,
  )
  const [timerOpen, setTimerOpen] = useState(false)
  const [engineOpen, setEngineOpen] = useState(false)

  const items = [
    ...PRESETS.map((p) => ({
      id: p.id,
      name: p.name,
      hint: p.hint,
      mix: p.mix,
      badge: p.badge,
      keyLabel: harmonicKeyMeta(p.harmonicKey).label,
    })),
    ...(hasCustomMix
      ? [
          {
            id: 'custom',
            name: 'Custom',
            hint: 'Your layered composition',
            mix: customMix,
            badge: undefined,
            keyLabel: harmonicKeyMeta(customMix.harmonicKey ?? harmonicKey).label,
          },
        ]
      : []),
  ]

  const currentId = activePresetId ?? selectedId
  const currentItem = items.find((i) => i.id === currentId) ?? items[0]!
  const currentPreset = presetById(currentItem.id)
  const displayMix = playing && activeMix ? activeMix : currentItem.mix
  const activeKeyId = displayMix.harmonicKey ?? currentPreset?.harmonicKey ?? harmonicKey
  const keyMeta = harmonicKeyMeta(activeKeyId)

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
    const next = items[(idx + dir + items.length) % items.length]!
    selectItem(next.id, playing)
  }

  const timerLabel = sleepTimer > 0 ? `Fades in ${sleepTimer}m` : 'No fade timer'
  const telemetryLabel =
    descent.depth === 'off'
      ? `${keyMeta.label} · ${descent.phaseLabel} phase`
      : `${descent.bandLabel} · ${descent.modHz.toFixed(1)} Hz · ${keyMeta.label}`

  return (
    <View style={styles.root}>
      <AmbientBackdrop />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: sideMargin,
            paddingTop: insets.top + (isCompact ? 10 : 16),
            paddingBottom: Platform.OS === 'ios' ? 20 : Math.max(insets.bottom, 16) + 88,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.frame, { gap: isCompact ? 13 : 16 }]}>
          {/* Header + quiet tappable neuroacoustic telemetry pill */}
          <View style={styles.head}>
            <Text style={[styles.heading, { color: color.ink, fontSize: isCompact ? 26 : 30 }]}>
              {currentItem.name}
            </Text>
            <Pressable
              onPress={() => {
                if (hapticsOn) haptics.play('light')
                setEngineOpen(true)
              }}
              accessibilityRole="button"
              accessibilityLabel="Open acoustic engine details"
              style={({ pressed }) => [{ opacity: pressed ? 0.78 : 1, marginTop: 4 }]}
            >
              <GlassSurface variant="pill" radius={999} accent={playing} style={styles.telemetryPill}>
                <View
                  style={[
                    styles.pulseDot,
                    { backgroundColor: playing ? color.accent : color.ink3 },
                  ]}
                />
                <Text style={[styles.telemetryText, { color: playing ? color.ink : color.ink2 }]} numberOfLines={1}>
                  {telemetryLabel}
                </Text>
                <ChevronRight size={13} strokeWidth={1.7} color={color.ink3} />
              </GlassSurface>
            </Pressable>
          </View>

          {/* Breathing 0.1 Hz Acoustic Dial */}
          <View style={styles.dialWrap}>
            <SoundField
              mix={displayMix}
              playing={playing}
              label={currentItem.name}
              breathHz={descent.breathHz}
              onToggle={togglePlayback}
              onSwipe={swipePreset}
            />
          </View>

          {/* Architectural grid: Flagship Theta Rain full-width lead + balanced 2x2 compositions */}
          <View style={[styles.grid, { gap: isCompact ? 8 : 10 }]}>
            {items.map((item, idx) => {
              const selected = item.id === currentItem.id
              const live = playing && selected
              const isFlagship = idx === 0 && items.length % 2 === 1
              return (
                <Pressable
                  key={item.id}
                  onPress={() => selectItem(item.id, true)}
                  style={({ pressed }) => [
                    isFlagship ? styles.cardWrapFull : styles.cardWrap,
                    {
                      opacity: pressed ? 0.85 : 1,
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    },
                  ]}
                >
                  <GlassSurface
                    variant="card"
                    radius={18}
                    accent={live || selected}
                    interactive
                    style={[styles.presetCard, { minHeight: isCompact ? 62 : 68 }]}
                  >
                    <View style={styles.presetTop}>
                      <View style={styles.presetTitleRow}>
                        <SoundGlyph id={item.id} color={live || selected ? color.accent : color.ink2} />
                        <Text
                          numberOfLines={1}
                          style={[styles.presetName, { color: live || selected ? color.ink : color.ink2 }]}
                        >
                          {item.name}
                        </Text>
                      </View>
                      {isFlagship ? (
                        <Text style={[styles.keyBadge, { color: live || selected ? color.accent : color.ink3 }]}>
                          {item.keyLabel}
                        </Text>
                      ) : null}
                    </View>
                    <Text numberOfLines={1} style={[styles.presetHint, { color: color.ink3 }]}>
                      {live ? `Playing · ${descent.phaseLabel.toLowerCase()} phase` : item.hint}
                    </Text>
                  </GlassSurface>
                </Pressable>
              )
            })}
          </View>

          {/* Volume bar */}
          <GlassSurface variant="card" radius={20} style={styles.volumeBar}>
            <Volume2 size={16} strokeWidth={1.65} color={color.ink2} />
            <View style={{ flex: 1 }}>
              <Slider value={volume} onChange={setVolume} label="Soundscape volume" />
            </View>
            <Text style={[styles.volPct, { color: color.accent }]}>{Math.round(volume * 100)}%</Text>
          </GlassSurface>

          {/* Timer + Mix controls */}
          <View style={styles.pillRow}>
            <Pressable
              onPress={() => {
                if (hapticsOn) haptics.play('light')
                setTimerOpen(true)
              }}
              style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.85 : 1 }]}
            >
              <GlassSurface variant="pill" radius={22} interactive style={styles.pillBtn}>
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
              <GlassSurface variant="pill" radius={22} interactive style={[styles.pillBtn, { paddingHorizontal: 22 }]}>
                <SlidersHorizontal size={15} strokeWidth={1.65} color={color.ink2} />
                <Text style={[styles.pillText, { color: color.ink }]}>Mix</Text>
              </GlassSurface>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <AcousticEngineSheet
        open={engineOpen}
        onClose={() => setEngineOpen(false)}
        preset={currentPreset}
        harmonicKey={activeKeyId}
      />

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
          const fallback = presetById(DEFAULT_PRESET_ID)?.mix ?? SILENT_MIX
          setSettings({ mix: SILENT_MIX, hasCustomMix: false })
          setSelectedId(DEFAULT_PRESET_ID)
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
    justifyContent: 'center',
  },
  frame: {
    width: '100%',
    maxWidth: FRAME_MAX_WIDTH,
    alignItems: 'center',
  },
  head: {
    alignItems: 'center',
    gap: 2,
  },
  heading: {
    fontWeight: '400',
    letterSpacing: -0.6,
  },
  telemetryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 30,
    paddingHorizontal: 12,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  telemetryText: {
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  dialWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cardWrapFull: {
    width: '100%',
  },
  cardWrap: {
    width: '48.5%',
    flexGrow: 1,
  },
  presetCard: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 4,
    justifyContent: 'center',
  },
  presetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  presetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  presetName: {
    fontSize: 14.5,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  keyBadge: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  presetHint: {
    fontSize: 12,
  },
  volumeBar: {
    width: '100%',
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  volPct: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'right',
  },
  pillRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
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
    fontSize: 13.5,
    fontWeight: '500',
  },
})
