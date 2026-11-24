import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { Award, ChevronLeft, CircleHelp, Pause, Play, Volume2, VolumeX } from 'lucide-react-native'
import { gameMeta, type GameId } from '@/core/games/catalog'
import { formatScoreValue, HIGH_SCORE_SPECS } from '@/core/highscores'
import { presetById } from '@/core/sound/catalog'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useHighScores } from '@/ui/state/highscores'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { GameAudioSheet } from './GameAudioSheet'
import { Button, FRAME_MAX_WIDTH, IconButton, Sheet } from './controls'
import { GlassSurface } from './Glass'
import { useBackgroundPause, useHighScore, useReducedMotion, useResponsiveLayout } from './hooks'

export interface GameScreenProps {
  onExit: () => void
}

export interface Stat {
  label: string
  value: string | number
}

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)

/**
 * Shared slimmed Liquid Glass Watchmaker frame for all 13 games.
 * - Clean OLED #000000 stage (zero background rain noise behind boards)
 * - Compact floating Liquid Glass top bar with live audio indicator
 * - Inline minimal telemetry bar that hides "Best" until a record exists (or when hideBest is set)
 * - Forgiving Ready Gate with optional mode/difficulty picker (`readyExtra`)
 */
export function GameShell({
  gameId,
  stats,
  score,
  commitScore = true,
  hideBest = false,
  ready = true,
  readyHint,
  readyExtra,
  onReady,
  paused,
  onPauseChange,
  onRestart,
  onExit,
  howTo,
  controls,
  children,
}: {
  gameId: GameId
  stats?: Stat[]
  score?: number | null
  commitScore?: boolean
  /** Hide personal-best pill/records (e.g. calm non-competitive Pond). */
  hideBest?: boolean
  /** Set false on games that show a forgiving pre-game start/difficulty card. */
  ready?: boolean
  readyHint?: string
  /** Optional selector rendered inside the Ready card (e.g. difficulty or Classic/Endless). */
  readyExtra?: ReactNode
  onReady?: () => void
  paused: boolean
  onPauseChange: (paused: boolean) => void
  onRestart?: () => void
  onExit: () => void
  howTo: readonly string[]
  controls?: ReactNode
  children: ReactNode
}) {
  const { color } = useTokenColors()
  const { insets, isCompact, sideMargin } = useResponsiveLayout()
  const reducedMotion = useReducedMotion()
  const meta = gameMeta(gameId)
  const spec = HIGH_SCORE_SPECS[gameId]
  const [helpOpen, setHelpOpen] = useState(false)
  const [audioOpen, setAudioOpen] = useState(false)

  const ambientPlaying = useSound((s) => s.playing)
  const activePresetId = useSound((s) => s.presetId)
  const session = useSession((s) => s.session)
  const sfx = useSettings((s) => s.sfx)
  const allMuted = !ambientPlaying && !sfx

  const activeSoundName = ambientPlaying
    ? (activePresetId ? presetById(activePresetId)?.name : 'Custom mix') ?? 'Playing'
    : null

  const { best, formattedBest, isNewBest } = useHighScore(
    gameId,
    hideBest ? null : score,
    !hideBest && commitScore,
  )
  const clearGameBest = useHighScores((s) => s.clearGame)
  const [pulseBest, setPulseBest] = useState(false)

  // UI-thread Reanimated arrival (scale 0.97 -> 1, opacity 0 -> 1, 220ms EASE_OUT).
  const entryOpacity = useSharedValue(reducedMotion ? 1 : 0)
  const entryScale = useSharedValue(reducedMotion ? 1 : 0.97)

  useEffect(() => {
    if (reducedMotion) {
      entryOpacity.set(1)
      entryScale.set(1)
      return
    }
    entryOpacity.set(withTiming(1, { duration: 200, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
    entryScale.set(withTiming(1, { duration: 240, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
  }, [entryOpacity, entryScale, reducedMotion])

  const frameAnimStyle = useAnimatedStyle(() => ({
    opacity: entryOpacity.get(),
    transform: [{ scale: entryScale.get() }],
  }))

  useEffect(() => {
    if (!isNewBest || hideBest) return
    setPulseBest(true)
    const t = setTimeout(() => setPulseBest(false), 3200)
    return () => clearTimeout(t)
  }, [isNewBest, best, hideBest])

  useBackgroundPause(() => onPauseChange(true))

  const showBestPill = !hideBest && Boolean(formattedBest)
  const hasStats = Boolean(stats && stats.length > 0)
  const showTelemetryRow = hasStats || showBestPill || Boolean(activeSoundName)

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + (isCompact ? 2 : 6),
          paddingBottom: Math.max(insets.bottom, isCompact ? 6 : 10),
        },
      ]}
    >
      <Animated.View style={[styles.frame, frameAnimStyle]}>
        {/* Slim Liquid Glass Top Bar */}
        <View style={[styles.top, { paddingHorizontal: sideMargin }]}>
          <GlassSurface variant="chrome" radius={21} style={styles.capsule}>
            <IconButton label="Back" onPress={onExit} style={styles.capBtn}>
              <ChevronLeft size={20} strokeWidth={1.65} color={color.ink} />
            </IconButton>
            <View style={styles.capDiv} />
            <IconButton label="How to play" onPress={() => setHelpOpen(true)} style={styles.capBtn}>
              <CircleHelp size={17} strokeWidth={1.65} color={color.ink2} />
            </IconButton>
          </GlassSurface>

          <View style={styles.titleStack}>
            <Text style={[styles.title, { color: color.ink }]} numberOfLines={1}>
              {meta.name}
            </Text>
            {session ? (
              <Text style={[styles.sessionMini, { color: color.accent }]} numberOfLines={1}>
                winding down
              </Text>
            ) : null}
          </View>

          <GlassSurface variant="chrome" radius={21} style={styles.capsule}>
            <IconButton label="Sound" onPress={() => setAudioOpen(true)} lit={ambientPlaying} style={styles.capBtn}>
              <View style={styles.soundIconWrap}>
                {allMuted ? (
                  <VolumeX size={17} strokeWidth={1.65} color={color.ink3} />
                ) : (
                  <Volume2 size={17} strokeWidth={1.65} color={ambientPlaying ? color.accent : color.ink2} />
                )}
                {ambientPlaying ? (
                  <View style={[styles.liveDot, { backgroundColor: color.accent }]} />
                ) : null}
              </View>
            </IconButton>
            <View style={styles.capDiv} />
            <IconButton label="Pause" onPress={() => onPauseChange(true)} style={styles.capBtn}>
              <Pause size={17} strokeWidth={1.65} color={color.ink2} />
            </IconButton>
          </GlassSurface>
        </View>

        {/* Ultra-slim inline telemetry strip (never adds bulky card chrome; hides "No best") */}
        {showTelemetryRow && (
          <View
            style={[
              styles.telemetry,
              {
                paddingHorizontal: sideMargin + 4,
                marginTop: isCompact ? 4 : 6,
              },
            ]}
          >
            <View style={styles.statsGroup}>
              {stats?.map((s, i) => (
                <Fragment key={s.label}>
                  {i > 0 && <View style={[styles.statDot, { backgroundColor: color.ink4 }]} />}
                  <View style={styles.statPair}>
                    <Text style={[styles.statLabel, { color: color.ink3 }]}>{s.label.toLowerCase()}</Text>
                    <Text style={[styles.statValue, { color: color.ink }]}>{s.value}</Text>
                  </View>
                </Fragment>
              ))}
            </View>

            <View style={styles.telemetryRight}>
              {activeSoundName ? (
                <Pressable
                  onPress={() => setAudioOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Now playing ${activeSoundName}`}
                  style={[styles.nowPlayingPill, { borderColor: 'rgba(194, 161, 95, 0.28)' }]}
                >
                  <View style={[styles.nowDot, { backgroundColor: color.accent }]} />
                  <Text style={[styles.nowText, { color: color.ink2 }]} numberOfLines={1}>
                    {activeSoundName}
                  </Text>
                </Pressable>
              ) : null}

              {showBestPill ? (
                <View
                  style={[
                    styles.bestPill,
                    {
                      backgroundColor: pulseBest ? color.accentWash : 'rgba(255,255,255,0.05)',
                      borderColor: pulseBest ? color.accent : 'rgba(255,255,255,0.10)',
                    },
                  ]}
                >
                  <Award size={12} strokeWidth={1.7} color={color.accent} />
                  <Text
                    style={[
                      styles.bestText,
                      { color: pulseBest ? color.accent : color.ink2 },
                    ]}
                    numberOfLines={1}
                  >
                    {pulseBest ? `New ${formattedBest}` : `Best ${formattedBest}`}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        <View style={[styles.stage, { paddingHorizontal: sideMargin }]}>
          {children}

          {/* Forgiving Ready Gate for games with start/mode/difficulty choice */}
          {!ready && onReady && (
            <View style={styles.readyOverlay}>
              <Pressable
                onPress={onReady}
                accessibilityRole="button"
                accessibilityLabel={`Begin ${meta.name}`}
                style={StyleSheet.absoluteFill}
              />
              <GlassSurface variant="elevated" radius={26} accent style={styles.readyCard}>
                <Text style={[styles.readyTitle, { color: color.ink }]}>{meta.name}</Text>
                <Text style={[styles.readySub, { color: color.ink2 }]}>
                  {readyHint ?? howTo[0] ?? meta.classic}
                </Text>
                {readyExtra ? <View style={styles.readyExtraWrap}>{readyExtra}</View> : null}
                <View style={styles.readyActions}>
                  <Button variant="primary" block onPress={onReady}>
                    <Play size={15} strokeWidth={2} color={color.accentInk} />
                    <Text style={[styles.readyBtnText, { color: color.accentInk }]}>Begin</Text>
                  </Button>
                  <Button variant="ghost" size="sm" onPress={() => setHelpOpen(true)}>
                    How to play
                  </Button>
                </View>
              </GlassSurface>
            </View>
          )}
        </View>

        {controls ? (
          <View
            style={[
              styles.controls,
              {
                paddingHorizontal: sideMargin,
                paddingTop: isCompact ? 4 : 6,
                paddingBottom: isCompact ? 4 : 10,
              },
            ]}
          >
            {controls}
          </View>
        ) : null}
      </Animated.View>

      {/* Identical Audio Sheet across all 13 games */}
      <GameAudioSheet open={audioOpen} onClose={() => setAudioOpen(false)} />

      {/* Identical How-to-Play Guide Sheet across all 13 games */}
      <Sheet open={helpOpen} onClose={() => setHelpOpen(false)} label={`How to play ${meta.name}`}>
        <View style={styles.guideHeader}>
          <View>
            <Text style={[styles.sheetTitle, { color: color.ink }]}>{meta.name}</Text>
            <Text style={[styles.sheetSub, { color: color.ink3 }]}>{meta.classic}</Text>
          </View>
          {showBestPill ? (
            <GlassSurface variant="card" radius={14} accent style={styles.guideBestBox}>
              <Text style={[styles.guideBestLabel, { color: color.ink3 }]}>{spec.label}</Text>
              <Text style={[styles.guideBestVal, { color: color.accent }]}>{formattedBest}</Text>
            </GlassSurface>
          ) : null}
        </View>

        <GlassSurface variant="card" radius={18} style={styles.howtoBox}>
          {howTo.map((line, i) => (
            <View key={i} style={styles.howtoRow}>
              <Text style={[styles.howtoNum, { color: color.accent }]}>{i + 1}</Text>
              <Text style={[styles.howtoText, { color: color.ink2 }]}>{line}</Text>
            </View>
          ))}
        </GlassSurface>

        <View style={styles.sheetActions}>
          <Button variant="primary" block onPress={() => setHelpOpen(false)}>
            Got it
          </Button>
          {showBestPill && (
            <Button variant="ghost" size="sm" block onPress={() => clearGameBest(gameId)}>
              Reset personal best
            </Button>
          )}
        </View>
      </Sheet>

      {/* Identical Pause Sheet across all 13 games */}
      <Sheet open={paused} onClose={() => onPauseChange(false)} label="Paused">
        <View style={styles.guideHeader}>
          <View>
            <Text style={[styles.sheetTitle, { color: color.ink }]}>{meta.name}</Text>
            <Text style={[styles.sheetSub, { color: color.ink3 }]}>{meta.classic}</Text>
          </View>
          {showBestPill ? (
            <GlassSurface variant="card" radius={14} style={styles.guideBestBox}>
              <Text style={[styles.guideBestLabel, { color: color.ink3 }]}>{spec.label}</Text>
              <Text style={[styles.guideBestVal, { color: color.accent }]}>{formattedBest}</Text>
            </GlassSurface>
          ) : null}
        </View>

        <View style={styles.sheetActions}>
          <Button variant="primary" block onPress={() => onPauseChange(false)}>
            Resume
          </Button>
          <Button
            block
            onPress={() => {
              onPauseChange(false)
              setAudioOpen(true)
            }}
          >
            {activeSoundName ? `Sound (${activeSoundName})` : 'Sound'}
          </Button>
          <Button
            block
            onPress={() => {
              onPauseChange(false)
              setHelpOpen(true)
            }}
          >
            How to play
          </Button>
          {onRestart && (
            <Button
              block
              onPress={() => {
                onRestart()
                onPauseChange(false)
              }}
            >
              Start over
            </Button>
          )}
          <Button variant="ghost" block onPress={onExit}>
            Leave
          </Button>
        </View>
      </Sheet>
    </View>
  )
}

/**
 * Uniform Liquid Glass bottom action dock for puzzle/tabletop games.
 */
export function GameControlBar({ children }: { children: ReactNode }) {
  return <View style={styles.controlBar}>{children}</View>
}

export function GameActionButton({
  icon,
  label,
  active,
  disabled,
  onPress,
}: {
  icon?: ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  const { color } = useTokenColors()
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          opacity: disabled ? 0.35 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed && !disabled ? 0.96 : 1 }],
        },
      ]}
    >
      <GlassSurface variant="pill" radius={16} accent={active} interactive style={styles.actionBtn}>
        {icon}
        <Text style={[styles.actionBtnText, { color: active ? color.accent : color.ink }]}>{label}</Text>
      </GlassSurface>
    </Pressable>
  )
}

export function Completion({
  open,
  gameId,
  title = 'Solved',
  line,
  isNewBest,
  actionLabel = 'Next',
  onAction,
}: {
  open: boolean
  gameId?: GameId
  title?: string
  line?: string
  isNewBest?: boolean
  actionLabel?: string
  onAction: () => void
}) {
  const { color } = useTokenColors()
  const best = useHighScores((s) => (gameId ? s.bestOf(gameId) : null))
  if (!open) return null
  const bestText = gameId && best !== null ? formatScoreValue(gameId, best) : null

  return (
    <View style={styles.completion}>
      <GlassSurface variant="elevated" radius={28} accent={isNewBest} style={styles.completionCard}>
        <Text style={[styles.completionTitle, { color: color.ink }]}>{title}</Text>
        {line ? <Text style={[styles.completionLine, { color: color.ink2 }]}>{line}</Text> : null}

        {bestText && (
          <View
            style={[
              styles.completionBest,
              {
                backgroundColor: isNewBest ? color.accentWash : 'rgba(255,255,255,0.06)',
                borderColor: isNewBest ? color.accent : 'rgba(255,255,255,0.1)',
              },
            ]}
          >
            <Award size={15} strokeWidth={1.7} color={color.accent} />
            <Text style={[styles.completionBestText, { color: isNewBest ? color.accent : color.ink2 }]}>
              {isNewBest ? `New personal best: ${bestText}` : `Personal best: ${bestText}`}
            </Text>
          </View>
        )}

        <Button variant="primary" block onPress={onAction} style={{ marginTop: 8 }}>
          {actionLabel}
        </Button>
      </GlassSurface>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: FRAME_MAX_WIDTH,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 46,
    gap: 10,
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
  },
  capBtn: {
    width: 42,
    height: 42,
    borderRadius: 0,
  },
  capDiv: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  titleStack: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  sessionMini: {
    fontSize: 10.5,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginTop: 1,
  },
  soundIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    position: 'absolute',
    top: -3,
    right: -4,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  telemetry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 26,
    gap: 8,
  },
  statsGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    overflow: 'hidden',
  },
  statPair: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '400',
  },
  statValue: {
    fontSize: 13.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  statDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  telemetryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nowPlayingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    borderWidth: 1,
    backgroundColor: 'rgba(194, 161, 95, 0.08)',
    maxWidth: 110,
  },
  nowDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  nowText: {
    fontSize: 11,
    fontWeight: '500',
  },
  bestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  bestText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  readyOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  readyCard: {
    width: '100%',
    maxWidth: 320,
    padding: 22,
    alignItems: 'center',
    gap: 10,
  },
  readyTitle: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.35,
  },
  readySub: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  readyExtraWrap: {
    width: '100%',
    marginTop: 2,
    marginBottom: 4,
  },
  readyActions: {
    width: '100%',
    gap: 6,
    alignItems: 'center',
    marginTop: 4,
  },
  readyBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  controls: {
    width: '100%',
  },
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 16,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  guideBestBox: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'flex-end',
  },
  guideBestLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  guideBestVal: {
    fontSize: 14.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.35,
  },
  sheetSub: {
    fontSize: 13.5,
    fontWeight: '400',
    marginTop: 2,
  },
  howtoBox: {
    marginTop: 16,
    padding: 16,
    gap: 10,
  },
  howtoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  howtoNum: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
    width: 14,
  },
  howtoText: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 21,
  },
  sheetActions: {
    gap: 8,
    marginTop: 18,
  },
  completion: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 30,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  completionCard: {
    width: '100%',
    maxWidth: 320,
    padding: 22,
    alignItems: 'center',
    gap: 10,
  },
  completionTitle: {
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  completionLine: {
    fontSize: 15,
    textAlign: 'center',
  },
  completionBest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 2,
  },
  completionBestText: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
})
