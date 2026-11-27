import { useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, { LinearTransition, ReduceMotion } from 'react-native-reanimated'
import { useIsFocused, useRouter } from 'expo-router'
import { Award, Moon, Pause, Play } from 'lucide-react-native'
import { arrangeGames, tonightPicks } from '@/core/games/arrange'
import { feel } from '@/ui/feel'
import { GAMES, gameMeta, type GameId } from '@/core/games/catalog'
import { profileIntent } from '@/core/profile'
import { latestBest, formatBestCompact } from '@/core/highscores'
import { eveningState, windowProgress, type EveningState } from '@/core/evening'
import { formatBedtime12h, formatHHMM, nightKey, overrideActive } from '@/core/night'
import { openWhenQuiet } from '@/ui/rn/promptGate'
import { reminderOfferDue } from '@/core/reminderOffer'
import { useShallow } from 'zustand/react/shallow'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { greeting, play as copy } from '@/ui/copy'
import { ContinuePreview } from '@/ui/rn/ContinuePreview'
import { Button, FRAME_MAX_WIDTH, Sheet } from '@/ui/rn/controls'
import { GameGlyph } from '@/ui/rn/GameGlyph'
import { SoundGlyph } from '@/ui/rn/SoundGlyph'
import { useCovered } from '@/ui/rn/ambientClock'
import { GLASS_TINT, GlassGroup, GlassSurface } from '@/ui/rn/Glass'
import { Horizon } from '@/ui/rn/Horizon'
import { tabBarClearance, useAppActive, useReducedMotion, useResponsiveLayout } from '@/ui/rn/hooks'
import { SoundRibbon } from '@/ui/rn/sound/SoundRibbon'
import { paletteFamily, resolveBackdrop, SCENE_PALETTES } from '@/core/backdrop/scenes'
import { presetById } from '@/core/sound/catalog'
import { Rise } from '@/ui/rn/motion'
import { useHighScores } from '@/ui/state/highscores'
import { useNav } from '@/ui/state/nav'
import { useSession } from '@/ui/state/session'
import { useCurrentSchedule, useSettings } from '@/ui/state/settings'
import { useAmbientToggle, useSound } from '@/ui/state/sound'
import { TonightSheet } from '@/ui/rn/TonightSheet'

const TILE_MORPH = LinearTransition.springify()
  .damping(22)
  .stiffness(185)
  .mass(0.9)
  .reduceMotion(ReduceMotion.System)

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const clock12 = (d: Date) => formatBedtime12h(formatHHMM(d.getHours(), d.getMinutes()))

/** Within 90 minutes of wind down starting, or winding down: the countdown shows and the check-in asks. */
function nearBedtimeFor(evening: EveningState, now: Date): boolean {
  if (evening.kind === 'winding' || evening.kind === 'asleepRange') return true
  return evening.kind === 'evening' && evening.windowStart !== null && evening.windowStart.getTime() - now.getTime() <= 90 * 60_000
}

/** "43" (minutes, said in the line below), or "2h 10m". */
function countdown(mins: number): { num: string; unit: string } {
  if (mins < 60) return { num: String(Math.max(1, mins)), unit: 'min' }
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return { num: m === 0 ? `${h}h` : `${h}h ${m}m`, unit: '' }
}

// Play arrives in three beats (after onboarding, or on launch as the splash lifts).
const ARRIVE = { distance: 8, duration: 360 } as const

/** Rows in the bento above (13 games, two of them wide). */
const GRID_ROWS = 5
const DOCK_H = 56
/** Least height the hero needs: the big line, one line under it, and the accessory slot. */
const HERO_MIN = 144

export default function HomeScreen() {
  const router = useRouter()
  const { height, width, insets, isCompact, isLarge, sideMargin } = useResponsiveLayout()
  const { color } = useTokenColors()
  const reduced = useReducedMotion()

  const onboarded = useSettings((s) => s.onboarded)
  const name = useSettings((s) => s.userName)
  const lastGame = useSettings((s) => s.lastGame)
  const checkInAskedNight = useSettings((s) => s.checkInAskedNight)
  const checkInAnsweredNight = useSettings((s) => s.checkInAnsweredNight)
  const tonightIntent = useSettings((s) => s.tonightIntent)
  const lastLightsOutNight = useSettings((s) => s.lastLightsOutNight)
  const tonightBedtime = useSettings((s) => s.tonightBedtime)
  const setSettings = useSettings((s) => s.set)

  const setWindDownOpen = useNav((s) => s.setWindDownOpen)
  const checkInOpen = useNav((s) => s.checkIn !== null)
  const setCheckIn = useNav((s) => s.setCheckIn)
  const session = useSession((s) => s.session)
  const dismissSession = useSession((s) => s.dismiss)
  const stopSound = useSound((s) => s.stop)
  const highScores = useHighScores((s) => s.table)

  const [now, setNow] = useState(() => new Date())
  const [gridW, setGridW] = useState(0)
  const [viewportH, setViewportH] = useState(0)
  const [tonightOpen, setTonightOpen] = useState(false)
  /** The game being peeked at (press and hold a tile). */
  const [peek, setPeek] = useState<GameId | null>(null)
  const peekMeta = peek ? gameMeta(peek) : null
  const schedule = useCurrentSchedule(now)
  const ambient = useAmbientToggle()

  // Re-read the clock the moment a wind down starts or ends, not at the next tick.
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), session ? 10_000 : 30_000)
    return () => clearInterval(id)
  }, [session])

  // Bedtime is the pivot: what Play says depends on where tonight stands.
  const evening = eveningState(schedule, now, session?.startedAt ?? null)
  const bedLabel = evening.bedtime ? clock12(evening.bedtime) : ''
  const sleptTonight = lastLightsOutNight === nightKey(now)
  const askingPastBedtime = evening.kind === 'past' && !sleptTonight
  const winding = evening.kind === 'winding' && evening.windowStart !== null

  // One idea per state: the big line, and one short line under it.
  type Hero = { big: string; unit?: string; phrase?: boolean; sub: string }
  const movedTonight = overrideActive(tonightBedtime, now) && !session
  let hero: Hero
  if (evening.kind === 'asleepRange') {
    // Inside their usual range: a normal night, so no countdown and no nagging.
    hero = sleptTonight
      ? { big: copy.restBig(name), phrase: true, sub: copy.restSub }
      : { big: copy.rangeBig(name), phrase: true, sub: copy.rangeSub(evening.rangeEnd ? clock12(evening.rangeEnd) : bedLabel) }
  } else if (evening.kind === 'past') {
    hero = sleptTonight
      ? { big: copy.restBig(name), phrase: true, sub: copy.restSub }
      : { big: copy.pastBig(name), phrase: true, sub: copy.pastSub(bedLabel) }
  } else if (evening.kind === 'morning') {
    hero = { big: greeting(now.getHours(), name), phrase: true, sub: copy.morningSub }
  } else if (evening.kind === 'none') {
    hero = { big: copy.noBedtimeBig, phrase: true, sub: copy.noBedtimeSub }
  } else if (evening.kind === 'day' || (evening.kind === 'evening' && !nearBedtimeFor(evening, now))) {
    hero = {
      big: evening.kind === 'day' ? copy.daytimeBig(name) : greeting(now.getHours(), name),
      phrase: true,
      sub: movedTonight ? copy.tonightBedtimeIs(bedLabel) : copy.bedtimeIs(bedLabel),
    }
  } else {
    // Close to bed: a countdown, and what the number means.
    const mins = evening.minutesToBedtime ?? 0
    const d = countdown(mins)
    hero = { big: d.num, unit: d.unit, sub: d.unit ? copy.minutesUntilBed(mins) : copy.untilBed }
  }

  // Near bedtime, ask the two check-in questions once a night (opening Play
  // in the 90 minutes before wind down, or during it).
  const nearBedtime = nearBedtimeFor(evening, now)
  // Not over another sheet (Wind down, the Composer, the reminder offer: ISS-16.4).
  const otherSheetOpen = useNav((s) => s.windDownOpen || s.mixOpen || s.reminderOffer)
  useEffect(() => {
    if (!onboarded || !nearBedtime || checkInOpen || otherSheetOpen) return
    if (checkInAskedNight === nightKey(now)) return
    // Not on top of a permission dialog or the end of onboarding (NAT-05).
    return openWhenQuiet(() => setCheckIn('tonight'), 600)
  }, [onboarded, nearBedtime, checkInAskedNight, now, checkInOpen, otherSheetOpen, setCheckIn])

  // Now and then, while reminders are off, offer one (core/reminderOffer).
  // Tonight's check-in comes first, and nothing else may be open.
  const playFocused = useIsFocused()
  const anySheetOpen = useNav((s) => s.checkIn !== null || s.windDownOpen || s.mixOpen || s.reminderOffer)
  const reminderOfferState = useSettings(
    useShallow((s) => ({
      reminders: s.reminders,
      onboarded: s.onboarded,
      onboardedNight: s.onboardedNight,
      lastOfferAt: s.reminderOfferAt,
      declines: s.reminderOfferDeclines,
    })),
  )
  const checkInPending = nearBedtime && checkInAskedNight !== nightKey(now)
  const offerDue = Platform.OS !== 'web' && reminderOfferDue(reminderOfferState, now)
  useEffect(() => {
    if (!playFocused || anySheetOpen || checkInPending || !offerDue) return
    return openWhenQuiet(() => {
      useSettings.getState().set({ reminderOfferAt: Date.now() })
      useNav.getState().setReminderOffer(true)
    }, 1500)
  }, [playFocused, anySheetOpen, checkInPending, offerDue])

  // The layout is set once a night, so tiles never move while someone is
  // using Play (a game opened counts as a play, which changes favourites).
  // Tonight's check-in marks its games in place instead of reordering.
  const profile = useSettings((s) => s.profile)
  const plays = useSettings((s) => s.plays)
  const playLayout = useSettings((s) => s.playLayout)
  const usual = profile ? profileIntent(profile) : null
  const night = nightKey(now)
  const layoutFresh =
    playLayout !== null &&
    playLayout.night === night &&
    playLayout.usual === usual &&
    playLayout.order.length === GAMES.length &&
    Array.isArray(playLayout.picks)
  const layout = useMemo(() => {
    if (layoutFresh) return playLayout
    const { order, wide } = arrangeGames({ usual, plays })
    return { night, usual, order, wide, picks: tonightPicks({ tonight: null, usual, plays }) }
    // A fresh layout ignores later plays on purpose: that's what keeps it still.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutFresh, playLayout, night, usual])
  useEffect(() => {
    if (!layoutFresh && onboarded) setSettings({ playLayout: layout })
  }, [layoutFresh, layout, onboarded, setSettings])
  const tonightPlan = checkInAnsweredNight === night ? tonightIntent : null
  const ordered = useMemo(() => layout.order.map(gameMeta), [layout])
  const wideIds = useMemo(() => new Set<GameId>(layout.wide), [layout])
  const picks = useMemo(
    () => new Set<GameId>(tonightPlan ? tonightPicks({ tonight: tonightPlan, usual, plays: {} }) : layout.picks),
    [tonightPlan, usual, layout],
  )

  const launchGame = (id: GameId) => {
    const st = useSettings.getState()
    setSettings({ lastGame: id, plays: { ...st.plays, [id]: (st.plays[id] ?? 0) + 1 } })
    router.push(`/game/${id}`)
  }

  const toggleWindDown = () => {
    feel('commit')
    if (session) {
      dismissSession()
      stopSound(1.2)
      // Stopping early returns tonight to the usual bedtime.
      setSettings({ tonightBedtime: null })
    } else {
      setWindDownOpen(true)
    }
  }

  // Sized to fit one screen: tiles keep their size, the dock sits above the
  // tab bar, and the hero takes whatever height is left (its content is
  // centred in it, so changing text never moves the tiles). It still scrolls
  // with a little give, like the other tabs, and on screens too short for
  // everything (iPhone SE) the last row or two scroll into view.
  const sectionGap = isCompact ? 10 : 14
  const tileGap = isCompact ? 8 : 10
  const bottomReserve = tabBarClearance(insets.bottom)
  // Tiles take the spare height (up to these), not the hero: the space is worth more as bigger targets.
  const preferredTile = isCompact ? 82 : isLarge ? 110 : 102
  // From the scroll view's real height once it's measured, so the tiles fill
  // what's actually there (an estimate from the window left ~50pt unused on
  // some phones). The scroll view's height doesn't depend on its content, so
  // this can't feed back on itself the way measuring the frame would.
  const frameAvail = (viewportH > 0 ? viewportH : height) - insets.top - bottomReserve
  const fitTile = Math.floor((frameAvail - HERO_MIN - sectionGap * 2 - DOCK_H - tileGap * (GRID_ROWS - 1)) / GRID_ROWS)
  const tileHeight = clamp(fitTile, 64, preferredTile)
  const colW = gridW > 0 ? Math.floor((gridW - tileGap * 2) / 3) : 104
  const wideW = colW * 2 + tileGap
  const bigSize = isCompact ? 44 : 54

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        onLayout={(e: LayoutChangeEvent) => {
          const h = Math.round(e.nativeEvent.layout.height)
          if (h > 0 && Math.abs(h - viewportH) > 1) setViewportH(h)
        }}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustsScrollIndicatorInsets={false}
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingHorizontal: sideMargin, paddingTop: insets.top, paddingBottom: bottomReserve }]}
      >
        <View style={[styles.frame, { gap: sectionGap }]}>
          {/* Hero: fills the space above the tiles; content centred, so the tiles never move. */}
          <Rise {...ARRIVE} delay={0} reduced={reduced} style={[styles.hero, { minHeight: HERO_MIN }]}>
            <Pressable
              onPress={() => {
                if (session) return
                setTonightOpen(true)
              }}
              disabled={Boolean(session)}
              accessibilityRole="button"
              accessibilityLabel={`${hero.big} ${hero.sub}`}
              accessibilityHint="Change tonight's bedtime"
              style={({ pressed }) => [styles.heroTap, { opacity: pressed ? 0.78 : 1 }]}
            >
              <Text
                style={[
                  hero.phrase ? styles.phrase : styles.big,
                  { color: color.ink, fontSize: hero.phrase ? (isCompact ? 28 : 32) : bigSize },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {hero.big}
              </Text>
              <Text style={[styles.sub, { color: color.ink2 }]} numberOfLines={1}>
                {hero.sub}
              </Text>
            </Pressable>

            {/* Accessory slot: the wind-down timeline, or the two choices past bedtime. */}
            <View style={styles.accessory}>
              {winding && evening.windowStart ? (
                <Horizon progress={windowProgress(evening, now)} startLabel={clock12(evening.windowStart)} endLabel={bedLabel} />
              ) : askingPastBedtime ? (
                <View style={styles.choices}>
                  <Pressable onPress={toggleWindDown} accessibilityRole="button" style={styles.choice}>
                    <GlassSurface variant="pill" radius={20} tint={GLASS_TINT.suggested} style={styles.choicePill}>
                      <Text style={[styles.choiceText, { color: color.accent }]}>{copy.pastWindDown}</Text>
                    </GlassSurface>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setTonightOpen(true)
                    }}
                    accessibilityRole="button"
                    style={styles.choice}
                  >
                    <GlassSurface variant="pill" radius={20} style={styles.choicePill}>
                      <Text style={[styles.choiceText, { color: color.ink }]}>{copy.pastChange}</Text>
                    </GlassSurface>
                  </Pressable>
                </View>
              ) : (
                // Nothing to show here tonight: the sound, as a ribbon of light.
                <View style={[styles.ribbon, { marginHorizontal: -sideMargin }]} pointerEvents="none">
                  <PlayRibbon width={width} />
                </View>
              )}
            </View>
          </Rise>

          {/* Tiles size themselves to the space left, so the grid ends above the dock. */}
          <Rise {...ARRIVE} delay={90} reduced={reduced}>
          <GlassGroup
            spacing={0}
            style={[styles.bentoWrap, { gap: tileGap }]}
            onLayout={(e: LayoutChangeEvent) => {
              const w = Math.floor(e.nativeEvent.layout.width)
              if (w > 0 && w !== gridW) setGridW(w)
            }}
          >
            {ordered.map((game, idx) => {
              const wide = wideIds.has(game.id)
              const isLead = idx === 0
              const isPick = picks.has(game.id)
              const isLastPlayed = lastGame === game.id
              const best = game.id !== 'pond' ? latestBest(highScores, game.id) : null
              const compactBest = game.id !== 'pond' ? formatBestCompact(game.id, best) : null
              const hasPreview = isLead && ['kindle', 'hue', 'cascade', 'thread'].includes(game.id)
              const roomy = tileHeight >= 80

              return (
                <Animated.View key={game.id} layout={TILE_MORPH} style={{ width: wide ? wideW : colW }}>
                  <Pressable
                    onPress={() => launchGame(game.id)}
                    onLongPress={() => {
                      feel('settle')
                      setPeek(game.id)
                    }}
                    delayLongPress={350}
                    accessibilityHint={copy.peekHint}
                    accessibilityRole="button"
                    accessibilityLabel={`${game.name}${compactBest ? `, best ${compactBest}` : ''}${isPick ? `, ${copy.pickLabel}` : ''}`}
                    style={({ pressed }) => [{ opacity: pressed ? 0.86 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                  >
                    <GlassSurface
                      variant="card"
                      radius={20}
                      tint={isPick ? GLASS_TINT.suggested : undefined}
                      style={[styles.tile, { height: tileHeight }]}
                    >
                      <View style={styles.tileTop}>
                        <View style={styles.tileArt}>
                          {hasPreview ? <ContinuePreview id={game.id} size={roomy ? 36 : 30} /> : null}
                          {!hasPreview && <GameGlyph id={game.id} size={roomy ? (wide ? 30 : 28) : 24} />}
                        </View>
                        {compactBest ? (
                          <View style={styles.bestTag}>
                            <Award size={10} strokeWidth={1.8} color={color.accent} />
                            <Text style={[styles.bestTagText, { color: color.ink2 }]}>{compactBest}</Text>
                          </View>
                        ) : isLastPlayed ? (
                          <View style={styles.continueTag}>
                            <Text style={[styles.continueText, { color: color.accent }]}>Continue</Text>
                          </View>
                        ) : null}
                      </View>

                      {/* The name, and the kind of game everyone knows, so it's easy to find again. */}
                      <View style={styles.tileBottom}>
                        <Text style={[styles.tileName, { color: color.ink }]} numberOfLines={1}>
                          {game.name}
                        </Text>
                        {/* Short screens (iPhone SE) keep one line; press and hold still says what it is. */}
                        {tileHeight >= 76 ? (
                          <Text style={[styles.tileKind, { color: color.ink3 }]} numberOfLines={1}>
                            {game.classic}
                          </Text>
                        ) : null}
                      </View>
                    </GlassSurface>
                  </Pressable>
                </Animated.View>
              )
            })}
          </GlassGroup>
          </Rise>

          {/* Dock, in thumb reach: wind down on the left, tonight's sound on the right. */}
          <Rise {...ARRIVE} delay={180} reduced={reduced}>
          <GlassGroup spacing={0} style={styles.dock}>
            <Pressable
              onPress={toggleWindDown}
              accessibilityRole="button"
              accessibilityLabel={session ? copy.endWindDown : copy.windDown}
              style={({ pressed }) => [styles.dockSlot, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
            >
              {/* Warm only while a wind-down is running: on Play, a warm pill means something is on. */}
              <GlassSurface variant="pill" radius={DOCK_H / 2} accent={Boolean(session)} style={styles.dockPill}>
                <Moon size={17} strokeWidth={1.7} color={session ? color.accent : color.ink2} />
                <Text style={[styles.dockLabel, { color: session ? color.accent : color.ink }]} numberOfLines={1}>
                  {session ? copy.endWindDown : copy.windDown}
                </Text>
              </GlassSurface>
            </Pressable>

            <Pressable
              onPress={() => {
                ambient.toggle()
              }}
              onLongPress={() => {
                feel('settle')
                router.push('/sounds')
              }}
              accessibilityRole="button"
              accessibilityLabel={ambient.playing ? `Pause ${ambient.name}` : `Play ${ambient.name}`}
              accessibilityHint="Long press to choose another sound"
              style={({ pressed }) => [styles.dockSlot, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
            >
              <GlassSurface variant="pill" radius={DOCK_H / 2} accent={ambient.playing} style={[styles.dockPill, styles.soundPill]}>
                <View style={[styles.soundIcon, { backgroundColor: ambient.playing ? color.accentWash : 'rgba(255,255,255,0.06)' }]}>
                  <SoundGlyph icon={ambient.icon} size={17} color={ambient.playing ? color.accent : color.ink2} />
                </View>
                <Text
                  style={[styles.dockLabel, styles.soundName, { color: color.ink }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                >
                  {ambient.name}
                </Text>
                {ambient.playing ? (
                  <Pause size={16} strokeWidth={2} color={color.accent} fill={color.accent} />
                ) : (
                  <Play size={16} strokeWidth={2} color={color.ink2} fill={color.ink2} />
                )}
              </GlassSurface>
            </Pressable>
          </GlassGroup>
          </Rise>
        </View>
      </ScrollView>
      <TonightSheet open={tonightOpen} onClose={() => setTonightOpen(false)} />

      {/* Press and hold a tile: what the game is, how it feels, how you've done, and a way in. */}
      <Sheet open={peek !== null} onClose={() => setPeek(null)} label={peekMeta?.name ?? ''}>
        {peekMeta ? <GamePeek id={peekMeta.id} pick={picks.has(peekMeta.id)} onPlay={() => {
          const id = peekMeta.id
          setPeek(null)
          launchGame(id)
        }} /> : null}
      </Sheet>
    </View>
  )
}

/** Room above and below the ribbon's waves for their glow to fade out (it overflows its slot). */
const RIBBON_PAD = 22

/** The ribbon on Play follows whatever sound is playing (or would play), in its scene's colour. */
function PlayRibbon({ width }: { width: number }) {
  const { color } = useTokenColors()
  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const liveMix = useSound((s) => s.mix)
  const breathHz = useSound((s) => s.descent.breathHz)
  const sessionPreset = useSettings((s) => s.sessionPreset)
  const focused = useIsFocused()
  const appActive = useAppActive()
  const covered = useCovered()
  const reduced = useReducedMotion()
  const id = presetId ?? sessionPreset
  const mix = (playing ? liveMix : null) ?? presetById(id ?? '')?.mix ?? null
  const palette = SCENE_PALETTES[paletteFamily(resolveBackdrop(id, mix))]
  const l = mix?.layers ?? {}
  const energy = (l.rain ?? 0) + (l.waves ?? 0) + (l.fire ?? 0) + (l.wind ?? 0) + (l.brown ?? 0) + (l.pink ?? 0) + (mix?.padGain ?? 0) * 0.8
  return (
    <SoundRibbon
      width={width}
      height={56 + RIBBON_PAD * 2}
      pad={RIBBON_PAD}
      playing={playing}
      animate={focused && appActive && !reduced && !covered}
      motion={Math.min(1, energy / 2.4)}
      breathHz={breathHz}
      tint={palette.caustic}
      accent={color.accent}
    />
  )
}

/**
 * The peek card: the game's board picture large on glass, what kind of game it
 * is and what it asks of you, the two lines that explain it, and what you've
 * done in it. One way in (Play); swipe down or tap outside to leave.
 */
function GamePeek({ id, pick, onPlay }: { id: GameId; pick: boolean; onPlay: () => void }) {
  const { color } = useTokenColors()
  const meta = gameMeta(id)
  const plays = useSettings((s) => s.plays[id] ?? 0)
  const table = useHighScores((s) => s.table)
  const best = id !== 'pond' ? formatBestCompact(id, latestBest(table, id)) : null
  const facts = [
    pick ? copy.pickChip : null,
    best ? copy.peekBest(best) : null,
    plays > 0 ? copy.peekPlays(plays) : copy.peekNew,
  ].filter((f): f is string => Boolean(f))

  return (
    <View style={styles.peek}>
      <View style={styles.peekHead}>
        <GlassSurface variant="card" radius={22} style={styles.peekArt}>
          <GameGlyph id={id} size={52} />
        </GlassSurface>
        <View style={styles.peekTitles}>
          <Text style={[styles.peekKind, { color: color.accent }]}>{meta.classic}</Text>
          <Text style={[styles.peekName, { color: color.ink }]}>{meta.name}</Text>
          <Text style={[styles.peekEffect, { color: color.ink3 }]}>{meta.effect}</Text>
        </View>
      </View>

      <Text style={[styles.peekGoal, { color: color.ink }]}>{meta.rules.goal}</Text>
      <Text style={[styles.peekLine, { color: color.ink2 }]}>{meta.rules.play}</Text>

      <View style={styles.peekFacts}>
        {facts.map((f) => (
          <View key={f} style={[styles.peekFact, { borderColor: color.line }]}>
            <Text style={[styles.peekFactText, { color: color.ink2 }]}>{f}</Text>
          </View>
        ))}
      </View>

      <Button variant="primary" block onPress={onPlay}>
        <Play size={15} strokeWidth={2} color={color.accent} fill={color.accent} />
        <Text style={[styles.peekPlay, { color: color.accent }]}>{copy.peekPlay}</Text>
      </Button>
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
  },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: FRAME_MAX_WIDTH,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  heroTap: {
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 12,
  },
  kicker: {
    fontSize: 15,
    fontWeight: '500',
    height: 20,
  },
  big: {
    fontWeight: '200',
    letterSpacing: -1.6,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  phrase: {
    fontWeight: '300',
    letterSpacing: -0.6,
    textAlign: 'center',
    marginVertical: 8,
  },
  unit: {
    fontWeight: '300',
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 15,
    height: 20,
  },
  accessory: {
    alignSelf: 'stretch',
    height: 56,
    justifyContent: 'flex-end',
  },
  ribbon: {
    height: 56,
    // The canvas is taller than the slot so the glow can fade out; it overlaps
    // the space around it without taking any.
    justifyContent: 'center',
    overflow: 'visible',
  },
  choices: {
    flexDirection: 'row',
    gap: 10,
  },
  choice: {
    flex: 1,
  },
  choicePill: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: {
    fontSize: 14,
    fontWeight: '600',
  },
  bentoWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  tile: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    justifyContent: 'space-between',
  },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
  },
  tileArt: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bestTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  bestTagText: {
    fontSize: 10.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  continueTag: {
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 7,
    backgroundColor: 'rgba(194, 161, 95, 0.14)',
    justifyContent: 'center',
  },
  continueText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  tileBottom: {},
  tileTag: {
    fontSize: 11.5,
    fontWeight: '400',
  },
  tileKind: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 1,
  },
  peek: {
    gap: 12,
    paddingTop: 2,
  },
  peekHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 4,
  },
  peekArt: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peekTitles: {
    flex: 1,
    gap: 1,
  },
  peekKind: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  peekName: {
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: -0.7,
  },
  peekEffect: {
    fontSize: 14,
    fontWeight: '500',
  },
  peekGoal: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '500',
  },
  peekLine: {
    fontSize: 15,
    lineHeight: 22,
  },
  peekFacts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
    marginBottom: 8,
  },
  peekFact: {
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  peekFactText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  peekPlay: {
    fontSize: 16,
    fontWeight: '600',
  },
  tileName: {
    fontSize: 14.5,
    fontWeight: '500',
    letterSpacing: -0.15,
  },
  dock: {
    flexDirection: 'row',
    gap: 10,
    height: DOCK_H,
  },
  dockSlot: {
    flex: 1,
  },
  dockPill: {
    height: DOCK_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
  },
  soundPill: {
    justifyContent: 'flex-start',
    gap: 8,
    paddingLeft: 10,
    paddingRight: 16,
  },
  soundIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockLabel: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  soundName: {
    flex: 1,
  },
})
