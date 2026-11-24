import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import { Award, ChevronLeft, CircleHelp, Pause, Play, Volume2, VolumeX } from 'lucide-react-native'
import { gameMeta, type GameId } from '@/core/games/catalog'
import { formatScoreValue, HIGH_SCORE_SPECS } from '@/core/highscores'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useHighScores } from '@/ui/state/highscores'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { AmbientBackdrop } from './AmbientBackdrop'
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

/**
 * Shared Liquid Glass Watchmaker frame for all 13 games.
 * - Identical floating Liquid Glass top capsules (Back + ? | Title | Sound + Pause)
 * - Identical Telemetry & Personal Best rail
 * - Smooth calm entry transition (never jarring)
 * - Optional forgiving `ready` gate so kinetic games wait until the player is ready
 */
export function GameShell({
  gameId,
  stats,
  score,
  commitScore = true,
  ready = true,
  readyHint,
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
  /** Set false on kinetic games so pieces/balls wait calmly until the player taps in. */
  ready?: boolean
  readyHint?: string
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
  const sfx = useSettings((s) => s.sfx)
  const allMuted = !ambientPlaying && !sfx

  const { best, formattedBest, isNewBest } = useHighScore(gameId, score, commitScore)
  const clearGameBest = useHighScores((s) => s.clearGame)
  const [pulseBest, setPulseBest] = useState(false)

  // Calm fade + gentle scale arrival so picking a game never feels abrupt.
  const entryOpacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current
  const entryScale = useRef(new Animated.Value(reducedMotion ? 1 : 0.975)).current

  useEffect(() => {
    if (reducedMotion) return
    Animated.parallel([
      Animated.timing(entryOpacity, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(entryScale, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }, [entryOpacity, entryScale, reducedMotion])

  useEffect(() => {
    if (!isNewBest) return
    setPulseBest(true)
    const t = setTimeout(() => setPulseBest(false), 3200)
    return () => clearTimeout(t)
  }, [isNewBest, best])

  useBackgroundPause(() => onPauseChange(true))

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + (isCompact ? 2 : 6),
          paddingBottom: Math.max(insets.bottom, isCompact ? 8 : 12),
        },
      ]}
    >
      <AmbientBackdrop />
      <Animated.View
        style={[
          styles.frame,
          {
            opacity: entryOpacity,
            transform: [{ scale: entryScale }],
          },
        ]}
      >
        {/* Identical Liquid Glass Top Chrome across all 13 games */}
        <View style={[styles.top, { paddingHorizontal: sideMargin }]}>
          <GlassSurface variant="chrome" radius={22} style={styles.capsule}>
            <IconButton label="Back" onPress={onExit} style={styles.capBtn}>
              <ChevronLeft size={21} strokeWidth={1.65} color={color.ink} />
            </IconButton>
            <View style={[styles.capDiv, { backgroundColor: 'rgba(255,255,255,0.10)' }]} />
            <IconButton label="How to play" onPress={() => setHelpOpen(true)} style={styles.capBtn}>
              <CircleHelp size={18} strokeWidth={1.65} color={color.ink2} />
            </IconButton>
          </GlassSurface>

          <Text style={[styles.title, { color: color.ink }]} numberOfLines={1}>
            {meta.name}
          </Text>

          <GlassSurface variant="chrome" radius={22} style={styles.capsule}>
            <IconButton label="Sound" onPress={() => setAudioOpen(true)} lit={ambientPlaying} style={styles.capBtn}>
              {allMuted ? (
                <VolumeX size={18} strokeWidth={1.65} color={color.ink3} />
              ) : (
                <Volume2 size={18} strokeWidth={1.65} color={ambientPlaying ? color.accent : color.ink2} />
              )}
            </IconButton>
            <View style={[styles.capDiv, { backgroundColor: 'rgba(255,255,255,0.10)' }]} />
            <IconButton label="Pause" onPress={() => onPauseChange(true)} style={styles.capBtn}>
              <Pause size={18} strokeWidth={1.65} color={color.ink2} />
            </IconButton>
          </GlassSurface>
        </View>

        {/* Identical Liquid Glass Telemetry & Personal Best Rail */}
        {(formattedBest !== null || (stats && stats.length > 0)) && (
          <GlassSurface
            variant="card"
            radius={14}
            style={[
              styles.telemetry,
              {
                marginHorizontal: sideMargin,
                marginTop: isCompact ? 6 : 10,
                height: isCompact ? 34 : 38,
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

            <View
              style={[
                styles.bestPill,
                {
                  backgroundColor: pulseBest ? color.accentWash : 'rgba(255,255,255,0.05)',
                  borderColor: pulseBest ? color.accent : 'rgba(255,255,255,0.09)',
                },
              ]}
            >
              <Award size={13} strokeWidth={1.7} color={formattedBest ? color.accent : color.ink4} />
              <Text
                style={[
                  styles.bestText,
                  { color: pulseBest ? color.accent : formattedBest ? color.ink2 : color.ink4 },
                ]}
                numberOfLines={1}
              >
                {pulseBest
                  ? `New ${formattedBest}`
                  : formattedBest
                    ? `Best ${formattedBest}`
                    : 'No best'}
              </Text>
            </View>
          </GlassSurface>
        )}

        <View style={[styles.stage, { paddingHorizontal: sideMargin }]}>
          {children}

          {/* Forgiving Ready Gate for kinetic games so nothing ambushes on tap */}
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
                paddingTop: isCompact ? 4 : 8,
                paddingBottom: isCompact ? 6 : 12,
              },
            ]}
          >
            {controls}
          </View>
        ) : null}
      </Animated.View>

      {/* Identical Audio Sheet across all 13 games */}
      <GameAudioSheet open={audioOpen} onClose={() => setAudioOpen(false)} />

      {/* Identical How-to-Play Tooltip / Guide Sheet across all 13 games */}
      <Sheet open={helpOpen} onClose={() => setHelpOpen(false)} label={`How to play ${meta.name}`}>
        <View style={styles.guideHeader}>
          <View>
            <Text style={[styles.sheetTitle, { color: color.ink }]}>{meta.name}</Text>
            <Text style={[styles.sheetSub, { color: color.ink3 }]}>{meta.classic}</Text>
          </View>
          <GlassSurface variant="card" radius={14} accent={Boolean(formattedBest)} style={styles.guideBestBox}>
            <Text style={[styles.guideBestLabel, { color: color.ink3 }]}>{spec.label}</Text>
            <Text style={[styles.guideBestVal, { color: formattedBest ? color.accent : color.ink4 }]}>
              {formattedBest ?? 'None yet'}
            </Text>
          </GlassSurface>
        </View>

        <GlassSurface variant="card" radius={18} style={styles.howtoBox}>
          {howTo.map((line, i) => (
            <View key={i} style={styles.howtoRow}>
              <Text style={[styles.howtoNum, { color: color.accent }]}>{i + 1}</Text>
              <Text style={[styles.howtoText, { color: color.ink2 }]}>{line}</Text>
            </View>
          ))}
        </GlassSurface>

        <Text style={[styles.guideNote, { color: color.ink3 }]}>
          Sound, this guide, and pause stay in the top bar on every game.
        </Text>

        <View style={styles.sheetActions}>
          <Button variant="primary" block onPress={() => setHelpOpen(false)}>
            Got it
          </Button>
          {formattedBest && (
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
          {formattedBest && (
            <GlassSurface variant="card" radius={14} style={styles.guideBestBox}>
              <Text style={[styles.guideBestLabel, { color: color.ink3 }]}>{spec.label}</Text>
              <Text style={[styles.guideBestVal, { color: color.accent }]}>{formattedBest}</Text>
            </GlassSurface>
          )}
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
            Sound
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
      <GlassSurface variant="pill" radius={16} accent={active} style={styles.actionBtn}>
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
    height: 50,
    gap: 10,
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
  },
  capBtn: {
    width: 44,
    height: 44,
    borderRadius: 0,
  },
  capDiv: {
    width: 1,
    height: 18,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  telemetry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingLeft: 14,
    paddingRight: 8,
    gap: 8,
  },
  statsGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  bestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  bestText: {
    fontSize: 11.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  readyOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.56)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  readyCard: {
    width: '100%',
    maxWidth: 300,
    padding: 22,
    alignItems: 'center',
    gap: 8,
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
    marginBottom: 8,
  },
  readyActions: {
    width: '100%',
    gap: 6,
    alignItems: 'center',
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
  guideNote: {
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 12,
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
