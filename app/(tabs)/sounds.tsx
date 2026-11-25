import { useMemo, useRef, useState, type ComponentRef } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { ChevronRight, Compass, SlidersHorizontal, Timer, Volume2 } from 'lucide-react-native'
import { soundsHelp } from '@/ui/copy'
import { soundOrder } from '@/core/profile'
import {
  BANDS,
  DEFAULT_PRESET_ID,
  PRESET_PAGES,
  PRESETS,
  presetById,
  SILENT_MIX,
  type SoundIconId,
} from '@/core/sound/catalog'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { FRAME_MAX_WIDTH, PopoverMenu, Slider } from '@/ui/rn/controls'
import { GlassGroup, GlassSurface } from '@/ui/rn/Glass'
import { scrollEndClearance, useResponsiveLayout } from '@/ui/rn/hooks'
import { MixSheet, type StudioTab } from '@/ui/rn/MixSheet'
import { SoundField } from '@/ui/rn/SoundField'
import { SoundGlyph } from '@/ui/rn/SoundGlyph'
import { useNav } from '@/ui/state/nav'
import { useSettings } from '@/ui/state/settings'
import { UNTIL_LIGHTS_OUT, useSound } from '@/ui/state/sound'

const TIMER_OPTIONS = [
  { value: UNTIL_LIGHTS_OUT, label: 'Until bedtime' },
  { value: 0, label: 'Keep playing' },
  { value: 15, label: 'Fade out in 15 min' },
  { value: 30, label: 'Fade out in 30 min' },
  { value: 45, label: 'Fade out in 45 min' },
  { value: 60, label: 'Fade out in 60 min' },
] as const

function inferIcon(mix: typeof SILENT_MIX): SoundIconId {
  if (mix.classicalMotif === 'reverie') return 'feather'
  if (mix.classicalMotif === 'adagio') return 'disc'
  if (mix.classicalMotif === 'nocturne') return 'piano'
  const l = mix.layers
  const ranked: [SoundIconId, number][] = [
    ['rain', l.rain ?? 0],
    ['waves', l.waves ?? 0],
    ['fire', l.fire ?? 0],
    ['wind', l.wind ?? 0],
    ['moon', (l.brown ?? 0) + (l.pink ?? 0) * 0.5],
  ]
  ranked.sort((a, b) => b[1] - a[1])
  return ranked[0]![1] > 0.05 ? ranked[0]![0] : 'rain'
}

/**
 * Balanced Sound Sanctuary:
 * - Top bar holds Timer chip, centered Soundscape Title, and Mix button (zero dead top void, spacious bottom!).
 * - Enlarged Hero Watchmaker Dial with the playing soundscape's exact icon in the center.
 * - Quiet rhythm pill (`θ Theta · 5.0 Hz`) sits directly beneath the dial.
 * - Swipeable 2-page x 6-card soundscape browser with clean minimal page dots only.
 * - Spacious Volume slider above the native Liquid Glass tab bar.
 */
export default function SoundsScreen() {
  const { insets, isCompact, sideMargin } = useResponsiveLayout()
  const { color } = useTokenColors()

  const playing = useSound((s) => s.playing)
  const activePresetId = useSound((s) => s.presetId)
  const activeMix = useSound((s) => s.mix)
  const descent = useSound((s) => s.descent)
  const volume = useSound((s) => s.volume)
  const setVolume = useSound((s) => s.setVolume)
  const playPreset = useSound((s) => s.playPreset)
  const playMix = useSound((s) => s.playMix)
  const updateMix = useSound((s) => s.updateMix)
  const stopSound = useSound((s) => s.stop)
  const setSoundTimer = useSound((s) => s.setTimer)

  const customMix = useSettings((s) => s.mix)
  const savedPreset = useSettings((s) => s.sessionPreset)
  const sleepTimer = useSettings((s) => s.sleepTimer)
  const hapticsOn = useSettings((s) => s.haptics)
  const setSettings = useSettings((s) => s.set)

  const mixOpen = useNav((s) => s.mixOpen)
  const setMixOpen = useNav((s) => s.setMixOpen)

  const [selectedId, setSelectedId] = useState<string>(
    () => activePresetId ?? presetById(savedPreset)?.id ?? DEFAULT_PRESET_ID,
  )
  const [studioTab, setStudioTab] = useState<StudioTab>('layers')
  const [timerOpen, setTimerOpen] = useState(false)
  const [pageIdx, setPageIdx] = useState<0 | 1>(() => presetById(activePresetId ?? savedPreset)?.page ?? 0)
  const [pagerWidth, setPagerWidth] = useState(0)
  const pagerRef = useRef<ComponentRef<typeof ScrollView>>(null)

  const currentId = activePresetId ?? selectedId
  // What they liked in onboarding comes first on each page.
  const profile = useSettings((s) => s.profile)
  const orderedPresets = useMemo(
    () => (profile ? soundOrder(profile).map((id) => presetById(id)!).filter(Boolean) : PRESETS),
    [profile],
  )
  const currentPreset = currentId === 'custom' ? null : (presetById(currentId) ?? PRESETS[0]!)
  const currentName = currentPreset ? currentPreset.name : 'Your mix'
  const displayMix = playing && activeMix ? activeMix : (currentPreset?.mix ?? customMix)
  const currentIcon: SoundIconId = currentPreset?.icon ?? inferIcon(displayMix)

  const openStudio = (tab: StudioTab) => {
    if (hapticsOn) haptics.play('light')
    setStudioTab(tab)
    setMixOpen(true)
  }

  const selectPreset = (id: string, autoPlay = true) => {
    if (hapticsOn) haptics.play('light')
    if (playing && id === currentId) {
      stopSound(0.9)
      return
    }
    setSelectedId(id)
    setSettings({ sessionPreset: id })
    if (autoPlay) {
      playPreset(id, sleepTimer)
    }
  }

  const togglePlayback = () => {
    if (hapticsOn) haptics.play('medium')
    if (playing) {
      stopSound(1.0)
    } else if (currentId === 'custom') {
      playMix(customMix, sleepTimer)
    } else {
      playPreset(currentPreset?.id ?? DEFAULT_PRESET_ID, sleepTimer)
    }
  }

  const swipePreset = (dir: -1 | 1) => {
    const idx = PRESETS.findIndex((p) => p.id === (currentPreset?.id ?? DEFAULT_PRESET_ID))
    const next = PRESETS[(idx + dir + PRESETS.length) % PRESETS.length]!
    if (next.page !== pageIdx && pagerWidth > 0) {
      setPageIdx(next.page)
      pagerRef.current?.scrollTo({ x: next.page * pagerWidth, animated: true })
    }
    selectPreset(next.id, playing)
  }

  const onPagerScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pagerWidth <= 0) return
    const idx = Math.round(e.nativeEvent.contentOffset.x / pagerWidth) === 1 ? 1 : 0
    if (idx !== pageIdx) setPageIdx(idx)
  }

  const bandMeta = BANDS.find((b) => b.id === displayMix.band)
  const rhythmPillText =
    descent.depth === 'off'
      ? `Tune rhythm`
      : `${bandMeta?.greek ?? 'θ'} ${descent.bandLabel} · ${descent.modHz.toFixed(1)} Hz`

  const compactTimer = sleepTimer === UNTIL_LIGHTS_OUT ? 'Bedtime' : sleepTimer > 0 ? `${sleepTimer}m` : 'Off'

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        // Insets are counted once, here, so the last row clears the floating tab bar.
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustsScrollIndicatorInsets={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: sideMargin,
            paddingTop: insets.top + (isCompact ? 8 : 12),
            paddingBottom: scrollEndClearance(insets.bottom),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.frame, { gap: isCompact ? 12 : 14 }]}>
          {/* Top Watchmaker utility bar: Timer | Title | Mix */}
          <View style={styles.topBar}>
            <Pressable
              onPress={() => {
                if (hapticsOn) haptics.play('light')
                setTimerOpen(true)
              }}
              accessibilityRole="button"
              accessibilityLabel="Sleep timer"
              style={({ pressed }) => [{ opacity: pressed ? 0.78 : 1 }]}
            >
              <GlassSurface variant="pill" radius={999} interactive style={styles.topChip}>
                <Timer size={14} strokeWidth={1.7} color={sleepTimer !== 0 ? color.accent : color.ink3} />
                <Text style={[styles.topChipText, { color: sleepTimer !== 0 ? color.ink : color.ink3 }]}>
                  {compactTimer}
                </Text>
              </GlassSurface>
            </Pressable>

            <Text style={[styles.heading, { color: color.ink, fontSize: isCompact ? 22 : 25 }]} numberOfLines={1}>
              {currentName}
            </Text>

            <Pressable
              onPress={() => openStudio('layers')}
              accessibilityRole="button"
              accessibilityLabel="Open mix studio"
              style={({ pressed }) => [{ opacity: pressed ? 0.78 : 1 }]}
            >
              <GlassSurface variant="pill" radius={999} interactive style={styles.topChip}>
                <SlidersHorizontal size={14} strokeWidth={1.7} color={color.ink2} />
                <Text style={[styles.topChipText, { color: color.ink }]}>Mix</Text>
              </GlassSurface>
            </Pressable>
          </View>

          {/* Enlarged Hero Watchmaker Dial with active soundscape icon + Rhythm pill directly below */}
          <View style={styles.heroCenter}>
            <SoundField
              mix={displayMix}
              playing={playing}
              label={currentName}
              icon={currentIcon}
              breathHz={descent.breathHz}
              onToggle={togglePlayback}
              onSwipe={swipePreset}
            />

            <Pressable
              onPress={() => openStudio('rhythm')}
              accessibilityRole="button"
              accessibilityLabel="Tune wave rhythm and bedtime descent"
              style={({ pressed }) => [{ opacity: pressed ? 0.78 : 1 }]}
            >
              <GlassSurface variant="pill" radius={999} accent={playing} style={styles.telemetryPill}>
                <View style={[styles.pulseDot, { backgroundColor: playing ? color.accent : color.ink3 }]} />
                <Text style={[styles.telemetryText, { color: playing ? color.ink : color.ink2 }]} numberOfLines={1}>
                  {rhythmPillText}
                </Text>
                <ChevronRight size={13} strokeWidth={1.7} color={color.ink3} />
              </GlassSurface>
            </Pressable>
          </View>

          {/* Swipeable 2-page x 6-card soundscape browser + minimal page dots */}
          <View style={styles.browserBlock}>
            <View
              style={styles.pagerWrap}
              onLayout={(e: LayoutChangeEvent) => {
                const w = Math.floor(e.nativeEvent.layout.width)
                if (w > 0 && w !== pagerWidth) setPagerWidth(w)
              }}
            >
              <ScrollView
                ref={pagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onPagerScrollEnd}
                scrollEventThrottle={32}
              >
                {PRESET_PAGES.map((pg) => {
                  const pageItems = orderedPresets.filter((p) => p.page === pg.id)
                  return (
                    <GlassGroup
                      key={pg.id}
                      spacing={0}
                      style={[styles.gridPage, { width: pagerWidth || '100%', gap: isCompact ? 9 : 10 }]}
                    >
                      {pageItems.map((item) => {
                        const selected = item.id === currentId
                        const live = playing && selected
                        return (
                          <Pressable
                            key={item.id}
                            onPress={() => selectPreset(item.id, true)}
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
                              style={[styles.presetCard, { minHeight: isCompact ? 62 : 68 }]}
                            >
                              <View style={styles.presetTop}>
                                <View style={styles.presetTitleRow}>
                                  <SoundGlyph
                                    icon={item.icon}
                                    size={15}
                                    color={live || selected ? color.accent : color.ink2}
                                  />
                                  <Text
                                    numberOfLines={1}
                                    style={[styles.presetName, { color: live || selected ? color.ink : color.ink2 }]}
                                  >
                                    {item.name}
                                  </Text>
                                </View>
                                {live ? <View style={[styles.liveDot, { backgroundColor: color.accent }]} /> : null}
                              </View>
                              <Text numberOfLines={1} style={[styles.presetHint, { color: color.ink3 }]}>
                                {item.hint}
                              </Text>
                            </GlassSurface>
                          </Pressable>
                        )
                      })}
                    </GlassGroup>
                  )
                })}
              </ScrollView>
            </View>

            <View style={styles.pageDots}>
              {PRESET_PAGES.map((pg) => (
                <Pressable
                  key={pg.id}
                  onPress={() => {
                    if (hapticsOn) haptics.play('light')
                    setPageIdx(pg.id)
                    if (pagerWidth > 0) pagerRef.current?.scrollTo({ x: pg.id * pagerWidth, animated: true })
                  }}
                  hitSlop={10}
                >
                  <View
                    style={[
                      styles.pageDot,
                      {
                        width: pageIdx === pg.id ? 18 : 6,
                        backgroundColor: pageIdx === pg.id ? color.accent : 'rgba(255,255,255,0.22)',
                      },
                    ]}
                  />
                </Pressable>
              ))}
            </View>
          </View>

          {/* Spacious Volume bar */}
          <GlassSurface variant="card" radius={20} style={styles.volumeBar}>
            <Volume2 size={16} strokeWidth={1.65} color={color.ink2} />
            <View style={{ flex: 1 }}>
              <Slider value={volume} onChange={setVolume} label="Soundscape volume" />
            </View>
            <Text style={[styles.volPct, { color: color.accent }]}>{Math.round(volume * 100)}%</Text>
          </GlassSurface>

          {/* Two questions, then two sounds to try. */}
          <Pressable
            onPress={() => useNav.getState().setCheckIn('sound')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.helpCell, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          >
            <GlassSurface variant="card" radius={20} interactive style={styles.helpRow}>
              <Compass size={17} strokeWidth={1.7} color={color.accent} />
              <Text style={[styles.helpText, { color: color.ink }]}>{soundsHelp.link}</Text>
              <ChevronRight size={16} strokeWidth={1.7} color={color.ink3} />
            </GlassSurface>
          </Pressable>
        </View>
      </ScrollView>

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
        initialTab={studioTab}
        onClose={() => setMixOpen(false)}
        mix={displayMix}
        preset={currentPreset}
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
    // The backdrop is drawn once behind all tabs (app/(tabs)/_layout.tsx).
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  frame: {
    width: '100%',
    maxWidth: FRAME_MAX_WIDTH,
    alignItems: 'center',
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  topChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 13,
  },
  topChipText: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  heading: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '400',
    letterSpacing: -0.5,
  },
  heroCenter: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  telemetryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 31,
    paddingHorizontal: 14,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  telemetryText: {
    fontSize: 12.5,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  browserBlock: {
    width: '100%',
    gap: 12,
  },
  pagerWrap: {
    width: '100%',
  },
  gridPage: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cardWrap: {
    width: '48.4%',
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
    gap: 7,
    flex: 1,
  },
  presetName: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  presetHint: {
    fontSize: 12,
  },
  pageDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pageDot: {
    height: 5,
    borderRadius: 2.5,
  },
  volumeBar: {
    width: '100%',
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  helpCell: {
    width: '100%',
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 52,
    paddingHorizontal: 16,
  },
  helpText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  volPct: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'right',
  },
})
