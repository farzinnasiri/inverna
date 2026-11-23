import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Award, Moon } from 'lucide-react-native'
import { GAMES, type GameId, type GameMeta } from '@/core/games/catalog'
import { bestFor, formatBestCompact } from '@/core/highscores'
import { formatBedtimeShort, minutesUntilBedtime, parseHHMM } from '@/core/night'
import { sessionElapsed, sessionProgress } from '@/core/session'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { ContinuePreview } from '@/ui/rn/ContinuePreview'
import { FRAME_MAX_WIDTH } from '@/ui/rn/controls'
import { GameGlyph } from '@/ui/rn/GameGlyph'
import { Horizon } from '@/ui/rn/Horizon'
import { useHighScores } from '@/ui/state/highscores'
import { useNav } from '@/ui/state/nav'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'

function splitCountdown(mins: number): { num: string; unit: string } {
  if (mins < 60) return { num: String(mins), unit: 'min' }
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? { num: String(h), unit: 'hr' } : { num: `${h}:${String(m).padStart(2, '0')}`, unit: 'hr' }
}

function horizonProgress(minsUntil: number | null, windowHours = 3): number {
  if (minsUntil === null) return 0.5
  const total = windowHours * 60
  if (minsUntil > total) return 0.08
  if (minsUntil <= 0) return 0.96
  return Math.min(0.96, Math.max(0.08, 1 - minsUntil / total))
}

function horizonStartLabel(bedtime: string, windowHours = 3): string {
  const { h, m } = parseHHMM(bedtime)
  const startH = (h - windowHours + 24) % 24
  return formatBedtimeShort(`${startH}:${String(m).padStart(2, '0')}`)
}

export default function HomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { color } = useTokenColors()

  const schedule = useSettings((s) => s.schedule)
  const lastGame = useSettings((s) => s.lastGame)
  const setSettings = useSettings((s) => s.set)
  const setWindDownOpen = useNav((s) => s.setWindDownOpen)
  const session = useSession((s) => s.session)
  const dismissSession = useSession((s) => s.dismiss)
  const stopSound = useSound((s) => s.stop)
  const highScores = useHighScores((s) => s.table)

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), session ? 10_000 : 30_000)
    return () => clearInterval(id)
  }, [session])

  const minsUntil = minutesUntilBedtime(schedule, now)
  const sessProgress = session ? sessionProgress(session, now.getTime()) : null
  const sessRemainingMs = session
    ? Math.max(0, session.minutes * 60_000 - sessionElapsed(session, now.getTime()) * 1000)
    : null

  const hero =
    sessRemainingMs !== null
      ? { num: String(Math.max(1, Math.ceil(sessRemainingMs / 60_000))), unit: 'min' }
      : minsUntil !== null
        ? splitCountdown(minsUntil)
        : { num: formatBedtimeShort(schedule.bedtime), unit: '' }

  const heroSub = session
    ? 'winding down'
    : schedule.enabled
      ? `until ${formatBedtimeShort(schedule.bedtime)}`
      : 'bedtime'

  // Order games: featured Continue tile first, remaining 12 in catalog order.
  const featuredId: GameId = lastGame && GAMES.some((g) => g.id === lastGame) ? lastGame : 'settle'
  const featured = GAMES.find((g) => g.id === featuredId) ?? GAMES[0]
  const rest = GAMES.filter((g) => g.id !== featured.id)

  // Balanced 5-row asymmetrical bento grid (13 games total, 3 columns per row):
  // Row 1: [Featured (2)] [rest[0] (1)]
  // Row 2: [rest[1] (1)] [rest[2] (1)] [rest[3] (1)]
  // Row 3: [rest[4] (1)] [rest[5] (2)]
  // Row 4: [rest[6] (1)] [rest[7] (1)] [rest[8] (1)]
  // Row 5: [rest[9] (1)] [rest[10] (1)] [rest[11] (1)]
  const rows: { game: GameMeta; span: 1 | 2; isContinue?: boolean }[][] = [
    [
      { game: featured, span: 2 as const, isContinue: true },
      ...(rest[0] ? [{ game: rest[0], span: 1 as const }] : []),
    ],
    rest.slice(1, 4).map((g) => ({ game: g, span: 1 as const })),
    [
      ...(rest[4] ? [{ game: rest[4], span: 1 as const }] : []),
      ...(rest[5] ? [{ game: rest[5], span: 2 as const }] : []),
    ],
    rest.slice(6, 9).map((g) => ({ game: g, span: 1 as const })),
    rest.slice(9, 12).map((g) => ({ game: g, span: 1 as const })),
  ].filter((r) => r.length > 0)

  const launchGame = (id: GameId) => {
    setSettings({ lastGame: id })
    router.push(`/game/${id}`)
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 14,
          paddingBottom: Math.max(insets.bottom, 16) + 92,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.frame}>
        <View style={styles.hero}>
          <View style={styles.clockRow}>
            <Text style={[styles.clockNum, { color: color.ink }]}>{hero.num}</Text>
            {hero.unit ? (
              <Text style={[styles.clockUnit, { color: color.ink3 }]}>{hero.unit}</Text>
            ) : null}
          </View>
          <Text style={[styles.sub, { color: color.ink3 }]}>{heroSub}</Text>

          <Horizon
            progress={sessProgress !== null ? sessProgress : horizonProgress(minsUntil)}
            startLabel={session ? 'now' : horizonStartLabel(schedule.bedtime)}
            endLabel={session ? `${session.minutes}m` : formatBedtimeShort(schedule.bedtime)}
          />

          <View style={styles.actionRow}>
            {session ? (
              <Pressable
                onPress={() => {
                  dismissSession()
                  stopSound(1.2)
                }}
                style={({ pressed }) => [
                  styles.windBtn,
                  {
                    backgroundColor: color.surface2,
                    borderColor: color.accentDim,
                    borderTopColor: color.accent,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={[styles.windLabel, { color: color.accent }]}>End wind down</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setWindDownOpen(true)}
                style={({ pressed }) => [
                  styles.windBtn,
                  {
                    backgroundColor: color.surface1,
                    borderColor: color.lineStrong,
                    borderTopColor: 'rgba(220, 224, 230, 0.14)',
                    opacity: pressed ? 0.85 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
              >
                <Moon size={15} strokeWidth={1.6} color={color.accent} />
                <Text style={[styles.windLabel, { color: color.ink }]}>Wind down</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.bento}>
          {rows.map((row, rowIdx) => (
            <View key={rowIdx} style={styles.bentoRow}>
              {row.map(({ game, span, isContinue }) => {
                const wide = span === 2
                const best = bestFor(highScores, game.id)
                const compactBest = formatBestCompact(game.id, best)
                const hasPreview =
                  isContinue && ['kindle', 'hue', 'cascade', 'thread'].includes(game.id)

                return (
                  <Pressable
                    key={game.id}
                    onPress={() => launchGame(game.id)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      compactBest ? `${game.name}, best ${compactBest}` : game.name
                    }
                    style={({ pressed }) => [
                      styles.tile,
                      {
                        flex: span,
                        backgroundColor: pressed ? color.surface2 : color.surface1,
                        borderColor: isContinue ? color.lineStrong : color.line,
                        borderTopColor: isContinue
                          ? color.accentDim
                          : 'rgba(220, 224, 230, 0.11)',
                        transform: [{ scale: pressed ? 0.975 : 1 }],
                      },
                    ]}
                  >
                    <View style={styles.tileTop}>
                      <View style={styles.tileArt}>
                        {hasPreview ? <ContinuePreview id={game.id} size={40} /> : null}
                        {!hasPreview && <GameGlyph id={game.id} size={wide ? 28 : 26} />}
                      </View>

                      {compactBest ? (
                        <View
                          style={[
                            styles.bestTag,
                            { backgroundColor: color.surface2, borderColor: color.line },
                          ]}
                        >
                          <Award size={10} strokeWidth={1.8} color={color.accent} />
                          <Text style={[styles.bestTagText, { color: color.ink2 }]}>
                            {compactBest}
                          </Text>
                        </View>
                      ) : wide ? (
                        <Text style={[styles.tileTag, { color: color.ink3 }]} numberOfLines={1}>
                          {isContinue && lastGame ? 'Continue' : game.classic}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.tileBottom}>
                      <Text style={[styles.tileName, { color: color.ink }]} numberOfLines={1}>
                        {game.name}
                      </Text>
                      {wide && compactBest && (
                        <Text style={[styles.tileTag, { color: color.ink3 }]} numberOfLines={1}>
                          {isContinue && lastGame ? 'Continue' : game.classic}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                )
              })}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  frame: {
    width: '100%',
    maxWidth: FRAME_MAX_WIDTH,
    gap: 24,
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
    fontSize: 56,
    fontWeight: '200',
    letterSpacing: -2.2,
    fontVariant: ['tabular-nums'],
  },
  clockUnit: {
    fontSize: 20,
    fontWeight: '300',
    letterSpacing: -0.4,
  },
  sub: {
    fontSize: 13.5,
    fontWeight: '400',
    marginTop: 2,
  },
  actionRow: {
    marginTop: 16,
  },
  windBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
  },
  windLabel: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  bento: {
    gap: 10,
  },
  bentoRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tile: {
    height: 86,
    borderRadius: 20,
    borderWidth: 1,
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
    borderWidth: 1,
  },
  bestTagText: {
    fontSize: 10.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
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
