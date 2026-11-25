import { useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, { LinearTransition, ReduceMotion } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { Award, Moon, Pause, Play } from 'lucide-react-native'
import { GAMES, GAMES_BY_INTENT, type GameId, type GameMeta, type NightIntent } from '@/core/games/catalog'
import { bestFor, formatBestCompact } from '@/core/highscores'
import { eveningState, windowProgress, type EveningState } from '@/core/evening'
import { formatBedtime12h, formatHHMM, nightKey, overrideActive } from '@/core/night'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { greeting, play as copy } from '@/ui/copy'
import { AmbientBackdrop } from '@/ui/rn/AmbientBackdrop'
import { ContinuePreview } from '@/ui/rn/ContinuePreview'
import { FRAME_MAX_WIDTH } from '@/ui/rn/controls'
import { GameGlyph } from '@/ui/rn/GameGlyph'
import { SoundGlyph } from '@/ui/rn/SoundGlyph'
import { GlassGroup, GlassSurface } from '@/ui/rn/Glass'
import { Horizon } from '@/ui/rn/Horizon'
import { useResponsiveLayout } from '@/ui/rn/hooks'
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
  if (evening.kind === 'winding') return true
  return evening.kind === 'evening' && evening.windowStart !== null && evening.windowStart.getTime() - now.getTime() <= 90 * 60_000
}

/** "43" (minutes, said in the line below), or "2h 10m". */
function countdown(mins: number): { num: string; unit: string } {
  if (mins < 60) return { num: String(Math.max(1, mins)), unit: 'min' }
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return { num: m === 0 ? `${h}h` : `${h}h ${m}m`, unit: '' }
}

/** Tonight's games: the check-in's pick leads; otherwise the last game played, then slow games. */
function curateGames(intent: NightIntent | null, lastGame: GameId | null): { ordered: GameMeta[]; wideIds: Set<GameId> } {
  const byId = new Map(GAMES.map((g) => [g.id, g]))
  const base = GAMES_BY_INTENT[intent ?? 'melt'].map((id) => byId.get(id)!).filter(Boolean)
  const leadId: GameId = !intent && lastGame && byId.has(lastGame) ? lastGame : base[0]!.id
  const ordered = [byId.get(leadId)!, ...base.filter((g) => g.id !== leadId)]
  // Rows: [2, 1] | [1, 1, 1] | [1, 2] | [1, 1, 1] | [1, 1, 1]
  return { ordered, wideIds: new Set<GameId>([ordered[0]!.id, ordered[6]!.id]) }
}

/** Rows in the bento above (13 games, two of them wide). */
const GRID_ROWS = 5
/** The floating native tab bar. */
const TAB_BAR_H = 62
const DOCK_H = 56

export default function HomeScreen() {
  const router = useRouter()
  const { height, insets, isCompact, isLarge, sideMargin } = useResponsiveLayout()
  const { color } = useTokenColors()

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
  if (evening.kind === 'past') {
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

  const { ordered, wideIds } = useMemo(() => curateGames(tonightIntent, lastGame), [tonightIntent, lastGame])

  const launchGame = (id: GameId) => {
    if (hapticsOn) haptics.play('light')
    setSettings({ lastGame: id })
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

  // Every region gets a fixed share of the screen, so nothing moves when the
  // hero's text changes: hero, then the grid, then the dock above the tab bar.
  const heroH = Math.round(clamp(height * 0.2, 150, 190))
  const sectionGap = isCompact ? 10 : 14
  const tileGap = isCompact ? 8 : 10
  const bottomReserve = Math.max(insets.bottom, 12) + (Platform.OS === 'web' ? 12 : TAB_BAR_H + 10)
  const gridAvail = height - insets.top - 8 - heroH - sectionGap * 2 - DOCK_H - bottomReserve
  const tileHeight = Math.floor(clamp((gridAvail - tileGap * (GRID_ROWS - 1)) / GRID_ROWS, 66, isLarge ? 100 : 92))
  const colW = gridW > 0 ? Math.floor((gridW - tileGap * 2) / 3) : 104
  const wideW = colW * 2 + tileGap
  const bigSize = isCompact ? 44 : 54

  return (
    <View style={styles.root}>
      <AmbientBackdrop />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: sideMargin, paddingTop: insets.top + 8, paddingBottom: bottomReserve },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.frame, { gap: sectionGap }]}>
          {/* Hero: a fixed-height region. Its content changes; its size never does. */}
          <View style={[styles.hero, { height: heroH }]}>
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
          </View>

          {/* Tiles size themselves to the space left, so the grid ends above the dock. */}
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

          {/* Dock, in thumb reach: wind down on the left, tonight's sound on the right. */}
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
        </View>
      </ScrollView>
      <TonightSheet open={tonightOpen} onClose={() => setTonightOpen(false)} />
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
    backgroundColor: 'transparent',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
  },
  frame: {
    width: '100%',
    maxWidth: FRAME_MAX_WIDTH,
  },
  hero: {
    alignItems: 'center',
    justifyContent: 'space-between',
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
