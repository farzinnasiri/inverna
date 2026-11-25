import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, { LinearTransition, ReduceMotion } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { Award, Moon, Pause, Play } from 'lucide-react-native'
import { arrangeGames } from '@/core/games/arrange'
import { gameMeta, type GameId } from '@/core/games/catalog'
import { profileIntent } from '@/core/profile'
import { bestFor, formatBestCompact } from '@/core/highscores'
import { eveningState, windowProgress, type EveningState } from '@/core/evening'
import { formatBedtime12h, formatHHMM, nightKey, overrideActive } from '@/core/night'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { greeting, play as copy } from '@/ui/copy'
import { ContinuePreview } from '@/ui/rn/ContinuePreview'
import { FRAME_MAX_WIDTH } from '@/ui/rn/controls'
import { GameGlyph } from '@/ui/rn/GameGlyph'
import { SoundGlyph } from '@/ui/rn/SoundGlyph'
import { GlassGroup, GlassSurface } from '@/ui/rn/Glass'
import { Horizon } from '@/ui/rn/Horizon'
import { tabBarClearance, useReducedMotion, useResponsiveLayout } from '@/ui/rn/hooks'
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
const HERO_MIN = 132

export default function HomeScreen() {
  const router = useRouter()
  const { height, insets, isCompact, isLarge, sideMargin } = useResponsiveLayout()
  const { color } = useTokenColors()
  const reduced = useReducedMotion()

  const onboarded = useSettings((s) => s.onboarded)
  const name = useSettings((s) => s.userName)
  const lastGame = useSettings((s) => s.lastGame)
  const hapticsOn = useSettings((s) => s.haptics)
  const lastCheckInDate = useSettings((s) => s.lastCheckInDate)
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
  const [tonightOpen, setTonightOpen] = useState(false)
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
  useEffect(() => {
    if (!onboarded || !nearBedtime || checkInOpen) return
    if (lastCheckInDate === nightKey(now)) return
    const timer = setTimeout(() => setCheckIn('tonight'), 600)
    return () => clearTimeout(timer)
  }, [onboarded, nearBedtime, lastCheckInDate, now, checkInOpen, setCheckIn])

  // Tonight's check-in leads for one night; favourites (from what they play)
  // take the wide tiles; onboarding's answers set the order underneath.
  const profile = useSettings((s) => s.profile)
  const plays = useSettings((s) => s.plays)
  const tonightPlan = lastCheckInDate === nightKey(now) ? tonightIntent : null
  const { ordered, wideIds } = useMemo(() => {
    const { order, wide } = arrangeGames({ tonight: tonightPlan, usual: profile ? profileIntent(profile) : null, plays })
    return { ordered: order.map(gameMeta), wideIds: new Set<GameId>(wide) }
  }, [tonightPlan, profile, plays])

  const launchGame = (id: GameId) => {
    if (hapticsOn) haptics.play('light')
    const st = useSettings.getState()
    setSettings({ lastGame: id, plays: { ...st.plays, [id]: (st.plays[id] ?? 0) + 1 } })
    router.push(`/game/${id}`)
  }

  const toggleWindDown = () => {
    if (hapticsOn) haptics.play('light')
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
  const preferredTile = isCompact ? 80 : isLarge ? 94 : 88
  const fitTile = Math.floor(
    (height - insets.top - HERO_MIN - sectionGap * 2 - DOCK_H - bottomReserve - tileGap * (GRID_ROWS - 1)) / GRID_ROWS,
  )
  const tileHeight = clamp(fitTile, 64, preferredTile)
  const colW = gridW > 0 ? Math.floor((gridW - tileGap * 2) / 3) : 104
  const wideW = colW * 2 + tileGap
  const bigSize = isCompact ? 44 : 54

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
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
                if (hapticsOn) haptics.play('light')
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
                    <GlassSurface variant="pill" radius={20} accent style={styles.choicePill}>
                      <Text style={[styles.choiceText, { color: color.accent }]}>{copy.pastWindDown}</Text>
                    </GlassSurface>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (hapticsOn) haptics.play('light')
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
              ) : null}
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
              const isLastPlayed = lastGame === game.id
              const best = game.id !== 'pond' ? bestFor(highScores, game.id) : null
              const compactBest = game.id !== 'pond' ? formatBestCompact(game.id, best) : null
              const hasPreview = isLead && ['kindle', 'hue', 'cascade', 'thread'].includes(game.id)
              const roomy = tileHeight >= 80

              return (
                <Animated.View key={game.id} layout={TILE_MORPH} style={{ width: wide ? wideW : colW }}>
                  <Pressable
                    onPress={() => launchGame(game.id)}
                    accessibilityRole="button"
                    accessibilityLabel={compactBest ? `${game.name}, best ${compactBest}` : game.name}
                    style={({ pressed }) => [{ opacity: pressed ? 0.86 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                  >
                    <GlassSurface variant="card" radius={20} accent={isLead} style={[styles.tile, { height: tileHeight }]}>
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
                        ) : wide ? (
                          <Text style={[styles.tileTag, { color: color.ink3 }]} numberOfLines={1}>
                            {game.classic}
                          </Text>
                        ) : null}
                      </View>

                      <View style={styles.tileBottom}>
                        <Text style={[styles.tileName, { color: color.ink }]} numberOfLines={1}>
                          {game.name}
                        </Text>
                        {wide && (compactBest || isLastPlayed) ? (
                          <Text style={[styles.tileTag, { color: color.ink3 }]} numberOfLines={1}>
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
              <GlassSurface variant="pill" radius={DOCK_H / 2} accent style={styles.dockPill}>
                <Moon size={17} strokeWidth={1.7} color={color.accent} />
                <Text style={[styles.dockLabel, { color: session ? color.accent : color.ink }]} numberOfLines={1}>
                  {session ? copy.endWindDown : copy.windDown}
                </Text>
              </GlassSurface>
            </Pressable>

            <Pressable
              onPress={() => {
                if (hapticsOn) haptics.play('light')
                ambient.toggle()
              }}
              onLongPress={() => {
                if (hapticsOn) haptics.play('medium')
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
    height: 44,
    justifyContent: 'flex-end',
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
  tileBottom: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 6,
  },
  tileTag: {
    fontSize: 11.5,
    fontWeight: '400',
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
