import { useRef, useState, type ComponentRef } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { ChevronRight, SlidersHorizontal, Timer, Volume2 } from 'lucide-react-native'
import {
  BANDS,
  DEFAULT_PRESET_ID,
  PRESET_PAGES,
  PRESETS,
  presetById,
  SILENT_MIX,
} from '@/core/sound/catalog'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { AmbientBackdrop } from '@/ui/rn/AmbientBackdrop'
import { FRAME_MAX_WIDTH, PopoverMenu, Slider } from '@/ui/rn/controls'
import { GlassSurface } from '@/ui/rn/Glass'
import { useResponsiveLayout } from '@/ui/rn/hooks'
import { MixSheet, type StudioTab } from '@/ui/rn/MixSheet'
import { SoundField } from '@/ui/rn/SoundField'
import { SoundGlyph } from '@/ui/rn/SoundGlyph'
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

/**
 * Sound Sanctuary:
 * - Clean Watchmaker header + quiet tappable rhythm pill (opens unified Mix studio -> Rhythm tab).
 * - Breathing 0.1 Hz Dial.
 * - 12 authored soundscapes across 2 horizontally swipeable pages of 6 (Night | Reverie)
 *   with consistent sensory subtitles (zero truncation, zero jargon).
 * - Volume bar + Fade timer + Mix button (opens unified Mix studio -> Layers tab).
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
  const [studioTab, setStudioTab] = useState<StudioTab>('layers')
  const [timerOpen, setTimerOpen] = useState(false)
  const [pageIdx, setPageIdx] = useState<0 | 1>(() => presetById(activePresetId ?? savedPreset)?.page ?? 0)
  const [pagerWidth, setPagerWidth] = useState(0)
  const pagerRef = useRef<ComponentRef<typeof ScrollView>>(null)

  const currentId = activePresetId ?? selectedId
  const currentPreset = currentId === 'custom' ? null : (presetById(currentId) ?? PRESETS[0]!)
  const currentName = currentPreset ? currentPreset.name : 'Custom mix'
  const displayMix = playing && activeMix ? activeMix : (currentPreset?.mix ?? customMix)

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

  const goToPage = (nextPage: 0 | 1) => {
    if (hapticsOn) haptics.play('light')
    setPageIdx(nextPage)
    if (pagerWidth > 0) {
      pagerRef.current?.scrollTo({ x: nextPage * pagerWidth, animated: true })
    }
  }

  const onPagerScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pagerWidth <= 0) return
    const idx = Math.round(e.nativeEvent.contentOffset.x / pagerWidth) === 1 ? 1 : 0
    if (idx !== pageIdx) setPageIdx(idx)
  }

  const bandMeta = BANDS.find((b) => b.id === displayMix.band)
  const rhythmPillText =
    descent.depth === 'off'
      ? `${descent.phaseLabel} · Tune`
      : `${bandMeta?.greek ?? 'θ'} ${descent.bandLabel} · ${descent.modHz.toFixed(1)} Hz`

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
            paddingTop: insets.top + (isCompact ? 8 : 14),
            paddingBottom: Platform.OS === 'ios' ? 18 : Math.max(insets.bottom, 16) + 88,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.frame, { gap: isCompact ? 11 : 14 }]}>
          {/* Header + quiet rhythm pill (taps into unified Mix -> Rhythm) */}
          <View style={styles.head}>
            <Text style={[styles.heading, { color: color.ink, fontSize: isCompact ? 25 : 29 }]}>
              {currentName}
            </Text>
            <Pressable
              onPress={() => openStudio('rhythm')}
              accessibilityRole="button"
              accessibilityLabel="Tune rhythm and bedtime descent"
              style={({ pressed }) => [{ opacity: pressed ? 0.78 : 1, marginTop: 3 }]}
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

          {/* Breathing 0.1 Hz Acoustic Dial */}
          <View style={styles.dialWrap}>
            <SoundField
              mix={displayMix}
              playing={playing}
              label={currentName}
              breathHz={descent.breathHz}
              onToggle={togglePlayback}
              onSwipe={swipePreset}
            />
          </View>

          {/* Page switcher header (Night 6 | Reverie 6 + optional Custom pill) */}
          <View style={styles.pageHeader}>
            <View style={styles.pageTabs}>
              {PRESET_PAGES.map((pg) => {
                const active = pageIdx === pg.id
                return (
                  <Pressable
                    key={pg.id}
                    onPress={() => goToPage(pg.id)}
                    style={[
                      styles.pageTab,
                      active
                        ? {
                            backgroundColor: color.accentWash,
                            borderColor: color.accentDim,
                          }
                        : {
                            backgroundColor: 'transparent',
                            borderColor: 'transparent',
                          },
                    ]}
                  >
                    <Text style={[styles.pageTabText, { color: active ? color.accent : color.ink3 }]}>
                      {pg.label}
                    </Text>
                  </Pressable>
                )
              })}
              {hasCustomMix ? (
                <Pressable
                  onPress={() => selectPreset('custom', true)}
                  style={[
                    styles.pageTab,
                    currentId === 'custom'
                      ? { backgroundColor: color.accentWash, borderColor: color.accentDim }
                      : { backgroundColor: 'transparent', borderColor: 'transparent' },
                  ]}
                >
                  <Text
                    style={[
                      styles.pageTabText,
                      { color: currentId === 'custom' ? color.accent : color.ink3 },
                    ]}
                  >
                    Custom
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.pageDots}>
              {[0, 1].map((idx) => (
                <View
                  key={idx}
                  style={[
                    styles.pageDot,
                    {
                      width: pageIdx === idx ? 14 : 5,
                      backgroundColor: pageIdx === idx ? color.accent : 'rgba(255,255,255,0.22)',
                    },
                  ]}
                />
              ))}
            </View>
          </View>

          {/* Horizontally swipeable 2-page x 6-card soundscape browser */}
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
                const pageItems = PRESETS.filter((p) => p.page === pg.id)
                return (
                  <View
                    key={pg.id}
                    style={[styles.gridPage, { width: pagerWidth || '100%', gap: isCompact ? 8 : 9 }]}
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
                            radius={17}
                            accent={live || selected}
                            interactive
                            style={[styles.presetCard, { minHeight: isCompact ? 58 : 63 }]}
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
                              {live ? (
                                <View style={[styles.liveDot, { backgroundColor: color.accent }]} />
                              ) : null}
                            </View>
                            <Text numberOfLines={1} style={[styles.presetHint, { color: color.ink3 }]}>
                              {item.hint}
                            </Text>
                          </GlassSurface>
                        </Pressable>
                      )
                    })}
                  </View>
                )
              })}
            </ScrollView>
          </View>

          {/* Volume bar */}
          <GlassSurface variant="card" radius={20} style={styles.volumeBar}>
            <Volume2 size={16} strokeWidth={1.65} color={color.ink2} />
            <View style={{ flex: 1 }}>
              <Slider value={volume} onChange={setVolume} label="Soundscape volume" />
            </View>
            <Text style={[styles.volPct, { color: color.accent }]}>{Math.round(volume * 100)}%</Text>
          </GlassSurface>

          {/* Timer + Unified Mix studio controls */}
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
              onPress={() => openStudio('layers')}
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
    height: 29,
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
  pageHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -4,
  },
  pageTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pageTab: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  pageTabText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  pageDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingRight: 2,
  },
  pageDot: {
    height: 5,
    borderRadius: 2.5,
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
    paddingHorizontal: 13,
    paddingVertical: 10,
    gap: 3,
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
    fontSize: 11.5,
  },
  volumeBar: {
    width: '100%',
    height: 50,
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
