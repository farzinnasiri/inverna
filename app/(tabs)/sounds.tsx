import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
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
import { Compass, Lock, PenLine, Plus, SlidersHorizontal, Timer, Volume2 } from 'lucide-react-native'
import { FREE_CUSTOM_SOUND_LIMIT, canUseSavedSound, canCreateCustomSound, canPlayPreset, fallbackFreePreset } from '@/core/access'
import { soundsHelp, soundTimer, studioCopy } from '@/ui/copy'
import { feel } from '@/ui/feel'
import { formatBedtime12h, formatHHMM } from '@/core/night'
import { soundOrder } from '@/core/profile'
import {
  DEFAULT_PRESET_ID,
  PRESET_PAGES,
  PRESETS,
  presetById,
  SILENT_MIX,
  type CustomSound,
  type Mix,
  type SoundIconId,
} from '@/core/sound/catalog'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { FRAME_MAX_WIDTH, Slider } from '@/ui/rn/controls'
import { TimerSheet } from '@/ui/rn/TimerSheet'
import { GlassGroup, GlassSurface } from '@/ui/rn/Glass'
import { scrollEndClearance, tabBarClearance, useResponsiveLayout } from '@/ui/rn/hooks'
import { describeMix, MixSheet, type SoundMeta, type StudioTarget } from '@/ui/rn/MixSheet'
import { SoundField } from '@/ui/rn/SoundField'
import { SoundGlyph } from '@/ui/rn/SoundGlyph'
import { UPGRADE_INK } from '@/ui/rn/Paywall'
import { useNav } from '@/ui/state/nav'
import { saveCustomSound, useSettings } from '@/ui/state/settings'
import { resolveTimer, UNTIL_LIGHTS_OUT, useSound, type MixMeta } from '@/ui/state/sound'
import { isAppUnlocked, useIsUnlocked } from '@/ui/state/unlock'
import { pulseRate } from '@/core/sound/arc'

/** One tile in the sound grid: a preset, or a sound they made. */
interface SoundItem {
  id: string
  name: string
  hint: string
  icon: SoundIconId
  custom: CustomSound | null
}

const PAGE_SIZE = 6

const metaOf = (c: CustomSound): MixMeta => ({ id: c.id, title: c.name, hint: c.hint, icon: c.icon })

const clockIn = (minutes: number) => {
  const d = new Date(Date.now() + minutes * 60_000)
  return formatBedtime12h(formatHHMM(d.getHours(), d.getMinutes()))
}

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
  const { insets, isCompact, sideMargin, height } = useResponsiveLayout()
  const { color } = useTokenColors()

  const playing = useSound((s) => s.playing)
  const activePresetId = useSound((s) => s.presetId)
  const activeMix = useSound((s) => s.mix)
  const activeMeta = useSound((s) => s.mixMeta)
  const descent = useSound((s) => s.descent)
  const volume = useSound((s) => s.volume)
  const setVolume = useSound((s) => s.setVolume)
  const playPreset = useSound((s) => s.playPreset)
  const playMix = useSound((s) => s.playMix)
  const updateMix = useSound((s) => s.updateMix)
  const stopSound = useSound((s) => s.stop)
  const setSoundTimer = useSound((s) => s.setTimer)

  const customMix = useSettings((s) => s.mix)
  const savedLibrary = useSettings((s) => s.customSounds)
  const savedPreset = useSettings((s) => s.sessionPreset)
  const sleepTimer = useSettings((s) => s.sleepTimer)
  const setSettings = useSettings((s) => s.set)

  const mixOpen = useNav((s) => s.mixOpen)
  const setMixOpen = useNav((s) => s.setMixOpen)
  const unlocked = useIsUnlocked()

  const customSounds = useMemo(
    () => unlocked ? savedLibrary : savedLibrary.slice(0, FREE_CUSTOM_SOUND_LIMIT),
    [savedLibrary, unlocked],
  )
  const [selectedId, setSelectedId] = useState<string>(() =>
    fallbackFreePreset(activePresetId ?? presetById(savedPreset)?.id ?? DEFAULT_PRESET_ID, unlocked),
  )
  const [studio, setStudio] = useState<StudioTarget>({ kind: 'current' })
  // What the studio is changing; it becomes "Your mix" until it's saved.
  const [draft, setDraft] = useState<Mix | null>(null)
  useEffect(() => {
    if (studio.kind === 'saved' && !canUseSavedSound(studio.sound.id, savedLibrary, unlocked)) {
      setMixOpen(false)
      setStudio({ kind: 'current' })
      setDraft(null)
    }
  }, [studio, savedLibrary, unlocked, setMixOpen])
  const [timerOpen, setTimerOpen] = useState(false)
  const [viewportH, setViewportH] = useState(0)
  const [pageIdx, setPageIdx] = useState<number>(() => presetById(activePresetId ?? savedPreset)?.page ?? 0)
  const [pagerWidth, setPagerWidth] = useState(0)
  const pagerRef = useRef<ComponentRef<typeof ScrollView>>(null)

  // What's on screen: what's playing, or while stopped what they picked last
  // (so Play after swiping plays the one they swiped to).
  const playingId = activePresetId ?? activeMeta?.id ?? 'custom'
  useEffect(() => {
    if (playing) setSelectedId(playingId)
  }, [playing, playingId])
  // If access drops back to free tier while a locked preset was selected, fall back cleanly.
  useEffect(() => {
    if (unlocked) return
    const isCustom = selectedId === 'custom' || customSounds.some((c) => c.id === selectedId)
    if (!isCustom && !canPlayPreset(selectedId, false)) {
      setSelectedId(DEFAULT_PRESET_ID)
    }
  }, [unlocked, selectedId, customSounds])
  const currentId = playing ? playingId : selectedId
  // What they liked in onboarding comes first on each page; on the free tier,
  // playable free presets always sit first at the top of Page 1.
  const profile = useSettings((s) => s.profile)
  const orderedPresets = useMemo(() => {
    const base = profile ? soundOrder(profile).map((id) => presetById(id)!).filter(Boolean) : PRESETS
    if (unlocked) return base
    return [...base.filter((p) => canPlayPreset(p.id, false)), ...base.filter((p) => !canPlayPreset(p.id, false))]
  }, [profile, unlocked])
  // The presets' pages, then pages of their own sounds, six to a page.
  const pages = useMemo(() => {
    const out: SoundItem[][] = unlocked
      ? PRESET_PAGES.map((pg) =>
          orderedPresets
            .filter((p) => p.page === pg.id)
            .map((p) => ({ id: p.id, name: p.name, hint: p.hint, icon: p.icon, custom: null })),
        )
      : Array.from({ length: Math.ceil(orderedPresets.length / PAGE_SIZE) }, (_, i) =>
          orderedPresets
            .slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE)
            .map((p) => ({ id: p.id, name: p.name, hint: p.hint, icon: p.icon, custom: null })),
        )
    for (let i = 0; i < customSounds.length; i += PAGE_SIZE) {
      out.push(
        customSounds.slice(i, i + PAGE_SIZE).map((c) => ({
          id: c.id,
          name: c.name,
          hint: c.hint || describeMix(c.mix),
          icon: c.icon,
          custom: c,
        })),
      )
    }
    return out
  }, [orderedPresets, customSounds, unlocked])
  const pageOf = (id: string) => Math.max(0, pages.findIndex((pg) => pg.some((it) => it.id === id)))

  const currentCustom = customSounds.find((c) => c.id === currentId) ?? null
  const currentPreset = currentId === 'custom' || currentCustom ? null : (presetById(currentId) ?? PRESETS[0]!)
  const currentName = currentCustom?.name ?? currentPreset?.name ?? studioCopy.yourMix
  const displayMix = playing && activeMix ? activeMix : (currentCustom?.mix ?? currentPreset?.mix ?? customMix)
  const currentIcon: SoundIconId = currentCustom?.icon ?? currentPreset?.icon ?? inferIcon(displayMix)

  const goToPage = (idx: number) => {
    setPageIdx(idx)
    if (pagerWidth > 0) pagerRef.current?.scrollTo({ x: idx * pagerWidth, animated: true })
  }

  const openStudio = (target: StudioTarget) => {
    setStudio(target)
    setDraft(target.kind === 'saved' ? target.sound.mix : displayMix)
    // Opening one of their sounds (touch and hold) makes it the one on screen.
    if (target.kind === 'saved' && currentId !== target.sound.id) {
      setSelectedId(target.sound.id)
      if (playing) playMix(target.sound.mix, sleepTimer, metaOf(target.sound))
    }
    setMixOpen(true)
  }

  const selectSound = (id: string, autoPlay = true) => {
    const mine = customSounds.find((c) => c.id === id)
    if (!mine && !canPlayPreset(id, unlocked)) {
      feel('tick')
      useNav.getState().openPaywall('sound', presetById(id)?.name)
      return
    }
    feel('tick')
    if (playing && id === currentId) {
      stopSound(0.9)
      return
    }
    setSelectedId(id)
    if (mine) {
      if (autoPlay) playMix(mine.mix, sleepTimer, metaOf(mine))
      return
    }
    setSettings({ sessionPreset: id })
    if (autoPlay) playPreset(id, sleepTimer)
  }

  const togglePlayback = () => {
    feel('settle')
    if (playing) {
      stopSound(1.0)
    } else if (currentCustom) {
      playMix(currentCustom.mix, sleepTimer, metaOf(currentCustom))
    } else if (currentId === 'custom') {
      playMix(customMix, sleepTimer)
    } else {
      const targetId = currentPreset?.id ?? DEFAULT_PRESET_ID
      if (!canPlayPreset(targetId, unlocked)) {
        useNav.getState().openPaywall('sound', presetById(targetId)?.name)
        return
      }
      playPreset(targetId, sleepTimer)
    }
  }

  const swipePreset = (dir: -1 | 1) => {
    const all = pages.flat().filter((it) => it.custom !== null || canPlayPreset(it.id, unlocked))
    if (all.length === 0) return
    const idx = Math.max(0, all.findIndex((it) => it.id === currentId))
    const next = all[(idx + dir + all.length) % all.length]!
    const page = pageOf(next.id)
    if (page !== pageIdx) goToPage(page)
    selectSound(next.id, playing)
  }

  // The pages open where the sound on screen is, and follow it when it
  // changes from anywhere (NAT-04: they opened on page 1 with the dot elsewhere).
  // ("Your mix" isn't on a page: the pages stay where they are.)
  const shownPage = pages.findIndex((pg) => pg.some((it) => it.id === currentId))
  useEffect(() => {
    if (shownPage < 0) return
    setPageIdx(shownPage)
    if (pagerWidth > 0) pagerRef.current?.scrollTo({ x: shownPage * pagerWidth, animated: false })
    // Only when the sound on screen moves to another page, or the pager first gets its width.
  }, [shownPage, pagerWidth])

  const onPagerScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pagerWidth <= 0) return
    const idx = Math.min(pages.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / pagerWidth)))
    if (idx !== pageIdx) setPageIdx(idx)
  }

  // The studio's mix: heard as it changes, kept as "Your mix" until saved.
  const studioMeta = studio.kind === 'saved' ? metaOf(studio.sound) : null
  // "Your mix" is saved to disk once a drag pauses, not on every fader step
  // (each save rewrites all the settings).
  const mixSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingMix = useRef<Mix | null>(null)
  const saveMixNow = () => {
    if (mixSaveTimer.current) clearTimeout(mixSaveTimer.current)
    mixSaveTimer.current = null
    const mix = pendingMix.current
    pendingMix.current = null
    if (mix) useSettings.getState().set({ mix, hasCustomMix: true })
  }
  const saveMixRef = useRef(saveMixNow)
  saveMixRef.current = saveMixNow
  // Leaving Sounds saves whatever is still waiting.
  useEffect(() => () => saveMixRef.current(), [])
  const changeDraft = (next: Mix) => {
    setDraft(next)
    pendingMix.current = next
    if (mixSaveTimer.current) clearTimeout(mixSaveTimer.current)
    mixSaveTimer.current = setTimeout(saveMixNow, 400)
    // A saved sound keeps its name on screen while it's being changed.
    if (studio.kind !== 'saved') setSelectedId('custom')
    if (playing) updateMix(next, studioMeta)
    else playMix(next, sleepTimer, studioMeta)
  }

  const closeStudio = () => {
    saveMixNow()
    setMixOpen(false)
    // Changed and not saved: it carries on as "Your mix".
    if (studio.kind === 'saved' && draft && draft !== studio.sound.mix && currentId === studio.sound.id) {
      setSelectedId('custom')
      if (playing) updateMix(draft, null)
    }
  }

  const saveSound = (meta: SoundMeta, asNew: boolean) => {
    const mix = draft ?? displayMix
    const editingId = studio.kind === 'saved' && !asNew ? studio.sound.id : null
    const saved = saveCustomSound({ ...meta, mix }, editingId, isAppUnlocked())
    if (!saved) {
      setMixOpen(false)
      useNav.getState().openPaywall('custom-sound')
      return
    }
    setSelectedId(saved.id)
    if (playing) playMix(mix, sleepTimer, metaOf(saved))
    setMixOpen(false)
    feel('complete')
    // Show its tile.
    const index = useSettings.getState().customSounds.findIndex((c) => c.id === saved.id)
    const page = PRESET_PAGES.length + Math.floor(index / PAGE_SIZE)
    setTimeout(() => goToPage(page), 320)
  }

  const deleteSound = (id: string) => {
    const gone = customSounds.find((c) => c.id === id)
    const list = useSettings.getState().customSounds.filter((c) => c.id !== id)
    setSettings(gone && currentId === id ? { customSounds: list, mix: gone.mix, hasCustomMix: true } : { customSounds: list })
    if (currentId === id) {
      setSelectedId('custom')
      if (playing) updateMix(useSound.getState().mix ?? gone?.mix ?? customMix, null)
    }
    setMixOpen(false)
    const lastPage = PRESET_PAGES.length + Math.ceil(list.length / PAGE_SIZE) - 1
    if (pageIdx > lastPage) goToPage(lastPage)
  }

  // The Mix chip shows the live rhythm: the letter and rate of the band the
  // pulse is in right now (both from the descent, so they always agree).
  // The rate actually playing, as the Composer shows it (NAT-03).
  const pulseHz = pulseRate(displayMix.band, descent)
  const rhythmGreek = pulseHz === null ? '' : pulseHz >= 7.2 ? 'α' : pulseHz >= 3.6 ? 'θ' : 'δ'
  const rhythmChip = pulseHz === null ? null : `${rhythmGreek} ${pulseHz.toFixed(1)} Hz`

  // The chip says what the timer does: the clock time it stops, a length, or all night.
  const endClock = clockIn(resolveTimer(UNTIL_LIGHTS_OUT))
  const stopAt = useSound((s) => s.stopAt)
  const fadingAt = playing && stopAt ? clockIn(Math.max(0, Math.round((stopAt - Date.now()) / 60_000))) : null
  const timerSummary =
    sleepTimer === UNTIL_LIGHTS_OUT ? soundTimer.untilEnd(endClock) : sleepTimer > 0 ? soundTimer.after(sleepTimer) : soundTimer.allNight

  // Everything fits one screen on any phone: the orb takes whatever height
  // the rest of the page leaves. The page should end a fixed gap above the
  // floating tab bar. Worked out from heights only (the scroll view's, and the
  // page's without its orb), all in the page's own coordinates.
  //
  // Not from where the page sits on screen: that was measured once, and the
  // first time the tab is built (right after onboarding, before it's shown)
  // the position is wrong, the orb shrank to its smallest, and nothing
  // measured again once the tab appeared. Heights don't depend on whether
  // the tab is visible or mid-transition, and any change re-runs this.
  // Very short phones scroll a little rather than go below 160.
  const [restH, setRestH] = useState(0)
  const padTop = insets.top + (isCompact ? 6 : 10)
  const pageEnd = (viewportH > 0 ? viewportH : height) - tabBarClearance(insets.bottom) - 8
  const orbSize =
    restH > 0 ? Math.round(Math.max(160, Math.min(280, pageEnd - padTop - restH))) : isCompact ? 176 : 210
  const orbRendered = useRef(orbSize)
  orbRendered.current = orbSize
  const measureRest = (e: LayoutChangeEvent) => {
    // The frame is the orb plus everything else; everything else doesn't depend on the orb.
    const rest = Math.round(e.nativeEvent.layout.height - orbRendered.current)
    if (rest > 0 && Math.abs(rest - restH) > 1) setRestH(rest)
  }
  // Below the page: what's left of the scroll view, so it doesn't scroll for nothing.
  const padBottom = viewportH > 0 ? Math.max(12, viewportH - pageEnd) : scrollEndClearance(insets.bottom)
  const sectionGap = isCompact ? 10 : 12
  const rowH = isCompact ? 62 : 66

  return (
    <View style={styles.root}>
      <ScrollView
        onLayout={(e: LayoutChangeEvent) => {
          const h = Math.round(e.nativeEvent.layout.height)
          if (h > 0 && Math.abs(h - viewportH) > 1) setViewportH(h)
        }}
        style={styles.scroll}
        // Insets are counted once, here, so the last row clears the floating tab bar.
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustsScrollIndicatorInsets={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: sideMargin,
            paddingTop: padTop,
            paddingBottom: padBottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.frame, { gap: sectionGap }]} onLayout={measureRest}>
          {/* Top Watchmaker utility bar: Timer | Title | Mix */}
          {/* Equal sides, so the name sits in the true centre whatever each chip says. */}
          <View style={styles.topBar}>
            <View style={styles.topSide}>
            <Pressable
              onPress={() => {
                setTimerOpen(true)
              }}
              accessibilityRole="button"
              accessibilityLabel={`${soundTimer.title}, ${timerSummary}`}
              style={({ pressed }) => [{ opacity: pressed ? 0.78 : 1 }]}
            >
              <GlassSurface variant="pill" radius={999} interactive style={styles.topChip}>
                <Timer size={14} strokeWidth={1.7} color={sleepTimer !== 0 ? color.accent : color.ink3} />
                <Text style={[styles.topChipText, { color: sleepTimer !== 0 ? color.ink : color.ink3 }]}>
                  {soundTimer.chip}
                </Text>
              </GlassSurface>
            </Pressable>
            </View>

            <View style={[styles.topSide, styles.topSideEnd]}>
            <Pressable
              onPress={() => openStudio(currentCustom ? { kind: 'saved', sound: currentCustom } : { kind: 'current' })}
              accessibilityRole="button"
              accessibilityLabel={rhythmChip && pulseHz !== null ? `Composer, pulse ${pulseHz.toFixed(1)} hertz` : 'Composer'}
              style={({ pressed }) => [{ opacity: pressed ? 0.78 : 1 }]}
            >
              <GlassSurface variant="pill" radius={999} interactive style={styles.topChip}>
                <SlidersHorizontal size={14} strokeWidth={1.7} color={playing && rhythmChip ? color.accent : color.ink2} />
                <Text style={[styles.topChipText, { color: color.ink }]}>{rhythmChip ?? 'Compose'}</Text>
              </GlassSurface>
            </Pressable>
            </View>
          </View>

          {/* The orb, then what's playing: its name, what it is, and its rhythm. */}
          <View style={styles.heroCenter}>
            <SoundField
              size={orbSize}
              mix={displayMix}
              presetId={currentPreset?.id ?? null}
              playing={playing}
              label={currentName}
              icon={currentIcon}
              breathHz={descent.breathHz}
              onToggle={togglePlayback}
              onSwipe={swipePreset}
            />

            <View style={styles.nowPlaying}>
              <Text
                style={[styles.heading, { color: color.ink, fontSize: isCompact ? 24 : 27 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                accessibilityRole="header"
              >
                {currentName}
              </Text>
            </View>
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
                {pages.map((pageItems, pi) => {
                  return (
                    <GlassGroup
                      key={pi}
                      spacing={0}
                      style={[styles.gridPage, { width: pagerWidth || '100%', gap: isCompact ? 9 : 10 }]}
                    >
                      {pageItems.map((item) => {
                        const locked = !item.custom && !canPlayPreset(item.id, unlocked)
                        const selected = !locked && item.id === currentId
                        const live = !locked && playing && selected
                        return (
                          <Pressable
                            key={item.id}
                            onPress={() => selectSound(item.id, true)}
                            onLongPress={
                              item.custom
                                ? () => {
                                    feel('commit')
                                    openStudio({ kind: 'saved', sound: item.custom! })
                                  }
                                : undefined
                            }
                            accessibilityRole="button"
                            accessibilityLabel={`${item.name}${locked ? ', locked' : ''}`}
                            accessibilityHint={item.custom ? studioCopy.editHint : undefined}
                            style={({ pressed }) => [
                              styles.cardWrap,
                              // Exactly half a row, alone or not: six to a page, always.
                              pagerWidth > 0 ? { width: (pagerWidth - (isCompact ? 9 : 10)) / 2 } : null,
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
                              style={[styles.presetCard, { height: rowH }]}
                            >
                              <View style={styles.presetTop}>
                                <View style={[styles.presetTitleRow, locked ? { opacity: 0.72 } : null]}>
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
                                {locked ? (
                                  <Lock size={12} strokeWidth={1.9} color={UPGRADE_INK} />
                                ) : live ? (
                                  <View style={[styles.liveDot, { backgroundColor: color.accent }]} />
                                ) : null}
                                {/* Made by them: a small pen, quiet but there. */}
                                {item.custom ? (
                                  <PenLine size={12} strokeWidth={1.7} color={live || selected ? color.accent : color.ink3} />
                                ) : null}
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
              {pages.map((_, pi) => (
                <Pressable
                  key={pi}
                  onPress={() => {
                    feel('tick')
                    goToPage(pi)
                  }}
                  hitSlop={10}
                >
                  <View
                    style={[
                      styles.pageDot,
                      {
                        width: pageIdx === pi ? 18 : 6,
                        backgroundColor: pageIdx === pi ? color.accent : 'rgba(255,255,255,0.22)',
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

          {/* Two ways to a sound you'll like: be asked (two questions), or make your own. */}
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => useNav.getState().setCheckIn('sound')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.helpCell, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
            >
              <GlassSurface variant="card" radius={20} interactive style={styles.helpRow}>
                <Compass size={17} strokeWidth={1.7} color={color.accent} />
                <Text style={[styles.helpText, { color: color.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                  {soundsHelp.link}
                </Text>
              </GlassSurface>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!canCreateCustomSound(customSounds.length, unlocked)) {
                  feel('tick')
                  useNav.getState().openPaywall('custom-sound')
                  return
                }
                openStudio({ kind: 'new', from: currentName })
              }}
              accessibilityRole="button"
              accessibilityLabel={
                canCreateCustomSound(customSounds.length, unlocked) ? soundsHelp.create : `${soundsHelp.create}, locked`
              }
              style={({ pressed }) => [styles.createCell, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
            >
              <GlassSurface variant="card" radius={20} interactive style={[styles.helpRow, styles.createRow]}>
                {canCreateCustomSound(customSounds.length, unlocked) ? (
                  <Plus size={18} strokeWidth={2} color={color.accent} />
                ) : (
                  <Lock size={15} strokeWidth={1.9} color={color.accent} />
                )}
                <Text style={[styles.helpText, styles.createText, { color: color.ink }]} numberOfLines={1}>
                  {soundsHelp.create}
                </Text>
              </GlassSurface>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <TimerSheet
        open={timerOpen}
        onClose={() => setTimerOpen(false)}
        value={sleepTimer}
        endClock={endClock}
        fadingAt={fadingAt}
        onSelect={(m) => {
          setSettings({ sleepTimer: m })
          setSoundTimer(m)
        }}
      />

      <MixSheet
        open={mixOpen}
        target={studio}
        onClose={closeStudio}
        mix={draft ?? displayMix}
        onChange={changeDraft}
        playing={playing}
        onTogglePlay={() => {
          if (playing) stopSound(1.0)
          else playMix(draft ?? displayMix, sleepTimer, studioMeta)
        }}
        onSave={saveSound}
        onDelete={deleteSound}
        onReset={() => {
          const fallback = presetById(DEFAULT_PRESET_ID)?.mix ?? SILENT_MIX
          setSettings({ mix: SILENT_MIX, hasCustomMix: false })
          setSelectedId(DEFAULT_PRESET_ID)
          setDraft(fallback)
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
  topSide: {
    flex: 1,
    flexBasis: 0,
    alignItems: 'flex-start',
  },
  topSideEnd: {
    alignItems: 'flex-end',
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
  nowPlaying: {
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
    maxWidth: '86%',
  },
  heading: {
    textAlign: 'center',
    fontWeight: '400',
    letterSpacing: -0.5,
  },
  heroCenter: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
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
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  actionRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  helpCell: {
    flex: 1.55,
  },
  createCell: {
    flex: 1,
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    paddingHorizontal: 14,
  },
  // A short label: icon and word sit together in the middle, not pinned left.
  createRow: {
    justifyContent: 'center',
    gap: 8,
  },
  createText: {
    flex: 0,
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
