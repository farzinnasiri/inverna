import { useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, { LinearTransition, ReduceMotion } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { Award, Moon, Sparkles } from 'lucide-react-native'
import { GAMES, type GameId, type GameMeta } from '@/core/games/catalog'
import { bestFor, formatBestCompact } from '@/core/highscores'
import { formatBedtime12h, minutesUntilBedtime, parseHHMM } from '@/core/night'
import { sessionElapsed, sessionProgress } from '@/core/session'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { AmbientBackdrop } from '@/ui/rn/AmbientBackdrop'
import { ContinuePreview } from '@/ui/rn/ContinuePreview'
import { FRAME_MAX_WIDTH } from '@/ui/rn/controls'
import { GameGlyph } from '@/ui/rn/GameGlyph'
import { GlassSurface } from '@/ui/rn/Glass'
import { Horizon } from '@/ui/rn/Horizon'
import { useResponsiveLayout } from '@/ui/rn/hooks'
import { todayNightKey } from '@/ui/rn/NightCheckIn'
import { useHighScores } from '@/ui/state/highscores'
import { useNav } from '@/ui/state/nav'
import { useSession } from '@/ui/state/session'
import { useSettings, type DayFeeling, type NightIntent } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'

const TILE_MORPH = LinearTransition.springify()
  .damping(22)
  .stiffness(185)
  .mass(0.9)
  .reduceMotion(ReduceMotion.System)

function formatDurationHero(mins: number): { num: string; unit: string } {
  if (mins < 60) return { num: String(Math.max(1, mins)), unit: 'min' }
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (m === 0) return { num: `${h}h`, unit: '' }
  return { num: `${h}h ${m}m`, unit: '' }
}

function horizonProgress(minsUntil: number | null, windowHours = 3): number {
  if (minsUntil === null) return 0.5
  const total = windowHours * 60
  if (minsUntil > total) return 0.04
  if (minsUntil <= 0) return 0.98
  return Math.min(0.98, Math.max(0.04, 1 - minsUntil / total))
}

function horizonStartLabel(bedtime: string, windowHours = 3): string {
  const { h, m } = parseHHMM(bedtime)
  const startH = (h - windowHours + 24) % 24
  return formatBedtime12h(`${startH}:${String(m).padStart(2, '0')}`)
}

const ORDER_BY_INTENT: Record<NightIntent, readonly GameId[]> = {
  melt: ['pond', 'hue', 'lanterns', 'drift', 'patience', 'thread', 'weave', 'nine', 'kindle', 'cascade', 'settle', 'chime', 'rally'],
  focus: ['nine', 'weave', 'thread', 'drift', 'kindle', 'patience', 'hue', 'pond', 'lanterns', 'settle', 'cascade', 'chime', 'rally'],
  light: ['settle', 'kindle', 'cascade', 'chime', 'rally', 'thread', 'patience', 'drift', 'hue', 'pond', 'nine', 'weave', 'lanterns'],
}

function curateGames(
  intent: NightIntent | null,
  day: DayFeeling | null,
  lastGame: GameId | null,
): { ordered: GameMeta[]; wideIds: Set<GameId> } {
  const effectiveIntent: NightIntent =
    intent ?? (day === 'heavy' ? 'melt' : day === 'restless' ? 'focus' : day === 'bright' ? 'light' : 'melt')
  const order = ORDER_BY_INTENT[effectiveIntent]
  const byId = new Map(GAMES.map((g) => [g.id, g]))
  const base = order.map((id) => byId.get(id)!).filter(Boolean)

  // If the user explicitly picked a mood intent, lead with its #1 match; otherwise highlight their last game if set.
  let leadId: GameId = base[0]!.id
  if (!intent && lastGame && byId.has(lastGame)) {
    leadId = lastGame
  }
  const ordered = [byId.get(leadId)!, ...base.filter((g) => g.id !== leadId)]
  // 1st item (row 1 wide) and 7th item (row 3 wide) form a pixel-aligned 3-column bento:
  // Row 1: [2-col, 1-col] | Row 2: [1, 1, 1] | Row 3: [1-col, 2-col] | Row 4: [1, 1, 1] | Row 5: [1, 1, 1]
  const wideIds = new Set<GameId>([ordered[0]!.id, ordered[6]!.id])
  return { ordered, wideIds }
}

function moodSummary(day: DayFeeling | null, intent: NightIntent | null): string | null {
  if (!intent && !day) return null
  if (intent === 'melt') return 'Curated to melt away'
  if (intent === 'focus') return 'Curated for quiet focus'
  if (intent === 'light') return 'Curated for a light note'
  return 'Tonight check-in'
}

export default function HomeScreen() {
  const router = useRouter()
  const { insets, isCompact, isLarge, sideMargin } = useResponsiveLayout()
  const { color } = useTokenColors()

  const onboarded = useSettings((s) => s.onboarded)
  const schedule = useSettings((s) => s.schedule)
  const lastGame = useSettings((s) => s.lastGame)
  const hapticsOn = useSettings((s) => s.haptics)
  const lastCheckInDate = useSettings((s) => s.lastCheckInDate)
  const tonightDay = useSettings((s) => s.tonightDay)
  const tonightIntent = useSettings((s) => s.tonightIntent)
  const lastLightsOut = useSettings((s) => s.lastLightsOut)
  const setSettings = useSettings((s) => s.set)

  const setWindDownOpen = useNav((s) => s.setWindDownOpen)
  const setCheckInOpen = useNav((s) => s.setCheckInOpen)
  const session = useSession((s) => s.session)
  const dismissSession = useSession((s) => s.dismiss)
  const stopSound = useSound((s) => s.stop)
  const highScores = useHighScores((s) => s.table)

  const [now, setNow] = useState(() => new Date())
  const [gridW, setGridW] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), session ? 10_000 : 30_000)
    return () => clearInterval(id)
  }, [session])

  // Gently prompt Nightly Check-in once per evening (19:00..04:59) after onboarding.
  useEffect(() => {
    if (!onboarded) return
    const hr = now.getHours()
    const isNightWindow = hr >= 19 || hr < 5
    if (isNightWindow && lastCheckInDate !== todayNightKey(now)) {
      const timer = setTimeout(() => setCheckInOpen(true), 450)
      return () => clearTimeout(timer)
    }
  }, [onboarded, lastCheckInDate, now, setCheckInOpen])

  const minsUntil = minutesUntilBedtime(schedule, now)
  const inEveningWindow = minsUntil !== null && minsUntil <= 180
  const sessProgress = session ? sessionProgress(session, now.getTime()) : null
  const sessRemainingMs = session
    ? Math.max(0, session.minutes * 60_000 - sessionElapsed(session, now.getTime()) * 1000)
    : null

  const hero =
    sessRemainingMs !== null
      ? { num: String(Math.max(1, Math.ceil(sessRemainingMs / 60_000))), unit: 'min' }
      : minsUntil !== null
        ? formatDurationHero(minsUntil)
        : { num: formatBedtime12h(schedule.bedtime), unit: '' }

  const heroSub = session
    ? 'winding down'
    : inEveningWindow
      ? `to lights out · ${formatBedtime12h(schedule.bedtime)}`
      : schedule.enabled
        ? `until ${formatBedtime12h(schedule.bedtime)}`
        : 'bedtime'

  const { ordered, wideIds } = useMemo(
    () => curateGames(tonightIntent, tonightDay, lastGame),
    [tonightIntent, tonightDay, lastGame],
  )

  const launchGame = (id: GameId) => {
    if (hapticsOn) haptics.play('light')
    setSettings({ lastGame: id })
    router.push(`/game/${id}`)
  }

  const tileHeight = isCompact ? 80 : isLarge ? 94 : 88
  const tileGap = isCompact ? 8 : 10
  // Exact 3-column mathematical widths so wide (2-col) and single (1-col) tiles align to the pixel!
  const colW = gridW > 0 ? Math.floor((gridW - tileGap * 2) / 3) : 104
  const wideW = colW * 2 + tileGap
  const moodText = moodSummary(tonightDay, tonightIntent)

  return (
    <View style={styles.root}>
      <AmbientBackdrop />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: sideMargin,
            paddingTop: insets.top + (isCompact ? 10 : 18),
            paddingBottom: Platform.OS === 'ios' ? 24 : Math.max(insets.bottom, 16) + 88,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.frame, { gap: isCompact ? 16 : 22 }]}>
          <View style={styles.hero}>
            <View style={styles.clockRow}>
              <Text style={[styles.clockNum, { color: color.ink, fontSize: isCompact ? 42 : 52 }]}>
                {hero.num}
              </Text>
              {hero.unit ? (
                <Text style={[styles.clockUnit, { color: color.ink2, fontSize: isCompact ? 17 : 20 }]}>
                  {hero.unit}
                </Text>
              ) : null}
            </View>
            <Text style={[styles.sub, { color: color.ink2 }]}>{heroSub}</Text>

            {session || inEveningWindow ? (
              <Horizon
                progress={sessProgress !== null ? sessProgress : horizonProgress(minsUntil)}
                startLabel={session ? 'Now' : horizonStartLabel(schedule.bedtime)}
                endLabel={session ? `${session.minutes}m` : formatBedtime12h(schedule.bedtime)}
              />
            ) : lastLightsOut ? (
              <Text style={[styles.quietNote, { color: color.ink3 }]}>
                Lights out {lastLightsOut} last night
              </Text>
            ) : null}

            <View style={styles.actionRow}>
              {session ? (
                <Pressable
                  onPress={() => {
                    if (hapticsOn) haptics.play('light')
                    dismissSession()
                    stopSound(1.2)
                  }}
                  style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
                >
                  <GlassSurface variant="pill" radius={21} accent interactive style={styles.windBtn}>
                    <Text style={[styles.windLabel, { color: color.accent }]}>End wind down</Text>
                  </GlassSurface>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => {
                    if (hapticsOn) haptics.play('light')
                    setWindDownOpen(true)
                  }}
                  style={({ pressed }) => [
                    {
                      opacity: pressed ? 0.86 : 1,
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    },
                  ]}
                >
                  <GlassSurface variant="pill" radius={21} accent interactive style={styles.windBtn}>
                    <Moon size={15} strokeWidth={1.7} color={color.accent} />
                    <Text style={[styles.windLabel, { color: color.ink }]}>Wind down</Text>
                  </GlassSurface>
                </Pressable>
              )}

              <Pressable
                onPress={() => {
                  if (hapticsOn) haptics.play('light')
                  setCheckInOpen(true)
                }}
                accessibilityRole="button"
                accessibilityLabel="Tonight mood check-in"
                style={({ pressed }) => [
                  {
                    opacity: pressed ? 0.86 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
              >
                <GlassSurface variant="pill" radius={21} interactive style={styles.moodBtn}>
                  <Sparkles size={14} strokeWidth={1.65} color={moodText ? color.accent : color.ink2} />
                  <Text style={[styles.moodLabel, { color: color.ink2 }]} numberOfLines={1}>
                    {moodText ?? "Tonight's mood"}
                  </Text>
                </GlassSurface>
              </Pressable>
            </View>
          </View>

          {/* Pixel-aligned 3-column bento that smoothly morphs & reorders via Reanimated */}
          <View
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
              const showScore = game.id !== 'pond'
              const best = showScore ? bestFor(highScores, game.id) : null
              const compactBest = showScore ? formatBestCompact(game.id, best) : null
              const hasPreview =
                isLead && ['kindle', 'hue', 'cascade', 'thread'].includes(game.id)

              return (
                <Animated.View
                  key={game.id}
                  layout={TILE_MORPH}
                  style={{ width: wide ? wideW : colW }}
                >
                  <Pressable
                    onPress={() => launchGame(game.id)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      compactBest ? `${game.name}, best ${compactBest}` : game.name
                    }
                    style={({ pressed }) => [
                      {
                        opacity: pressed ? 0.86 : 1,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      },
                    ]}
                  >
                    <GlassSurface
                      variant="card"
                      radius={20}
                      accent={isLead}
                      interactive
                      style={[styles.tile, { height: tileHeight }]}
                    >
                      <View style={styles.tileTop}>
                        <View style={styles.tileArt}>
                          {hasPreview ? <ContinuePreview id={game.id} size={isCompact ? 34 : 38} /> : null}
                          {!hasPreview && <GameGlyph id={game.id} size={wide ? 30 : 28} />}
                        </View>

                        {compactBest ? (
                          <View style={styles.bestTag}>
                            <Award size={10} strokeWidth={1.8} color={color.accent} />
                            <Text style={[styles.bestTagText, { color: color.ink2 }]}>
                              {compactBest}
                            </Text>
                          </View>
                        ) : isLastPlayed ? (
                          <View style={styles.continueTag}>
                            <Text style={[styles.continueText, { color: color.accent }]}>Resume</Text>
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
          </View>
        </View>
      </ScrollView>
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
  },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  clockNum: {
    fontWeight: '200',
    letterSpacing: -1.8,
    fontVariant: ['tabular-nums'],
  },
  clockUnit: {
    fontWeight: '300',
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 14,
    fontWeight: '400',
    marginTop: 2,
  },
  quietNote: {
    fontSize: 12.5,
    fontWeight: '400',
    marginTop: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  windBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 42,
    paddingHorizontal: 18,
  },
  windLabel: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  moodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: 14,
  },
  moodLabel: {
    fontSize: 13.5,
    fontWeight: '500',
  },
  bentoWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  tile: {
    paddingHorizontal: 13,
    paddingVertical: 11,
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
})
