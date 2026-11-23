import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Award, ChevronLeft, CircleHelp, Pause, Volume2, VolumeX } from 'lucide-react-native'
import { gameMeta, type GameId } from '@/core/games/catalog'
import { formatScoreValue, HIGH_SCORE_SPECS } from '@/core/highscores'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useHighScores } from '@/ui/state/highscores'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { GameAudioSheet } from './GameAudioSheet'
import { Button, FRAME_MAX_WIDTH, IconButton, Sheet } from './controls'
import { useBackgroundPause, useHighScore } from './hooks'

export interface GameScreenProps {
  onExit: () => void
}

export interface Stat {
  label: string
  value: string | number
}

/**
 * Shared Watchmaker frame for all 13 games.
 * Guarantees 100% consistent muscle memory across every game:
 * - Top left capsule: Back + ? (How to play & personal best)
 * - Top center: Game title
 * - Top right capsule: Sound (Audio mixer + SFX/Haptics) + Pause
 * - Telemetry rail: Live stats on left + Personal Best badge on right
 */
export function GameShell({
  gameId,
  stats,
  score,
  commitScore = true,
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
  /** Live or final score candidate to automatically persist in the per-game high score table. */
  score?: number | null
  /** Set false for lower-is-better games until the round is actually solved. */
  commitScore?: boolean
  paused: boolean
  onPauseChange: (paused: boolean) => void
  onRestart?: () => void
  onExit: () => void
  howTo: readonly string[]
  controls?: ReactNode
  children: ReactNode
}) {
  const { color } = useTokenColors()
  const insets = useSafeAreaInsets()
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

  useEffect(() => {
    if (!isNewBest) return
    setPulseBest(true)
    const t = setTimeout(() => setPulseBest(false), 3200)
    return () => clearTimeout(t)
  }, [isNewBest, best])

  useBackgroundPause(() => onPauseChange(true))

  const capsuleStyle = {
    backgroundColor: Platform.OS === 'ios' ? 'rgba(18, 20, 25, 0.56)' : color.surface1,
    borderColor: color.line,
    borderTopColor: 'rgba(220, 224, 230, 0.12)',
  }

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + 4,
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
    >
      <View style={styles.frame}>
        {/* Consistent Floating Watchmaker Top Chrome */}
        <View style={styles.top}>
          <View style={[styles.capsule, capsuleStyle]}>
            {Platform.OS === 'ios' && <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />}
            <IconButton label="Back" onPress={onExit} style={styles.capBtn}>
              <ChevronLeft size={21} strokeWidth={1.6} color={color.ink} />
            </IconButton>
            <View style={[styles.capDiv, { backgroundColor: color.line }]} />
            <IconButton label="How to play" onPress={() => setHelpOpen(true)} style={styles.capBtn}>
              <CircleHelp size={18} strokeWidth={1.6} color={color.ink2} />
            </IconButton>
          </View>

          <Text style={[styles.title, { color: color.ink }]} numberOfLines={1}>
            {meta.name}
          </Text>

          <View style={[styles.capsule, capsuleStyle]}>
            {Platform.OS === 'ios' && <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />}
            <IconButton label="Sound" onPress={() => setAudioOpen(true)} lit={ambientPlaying} style={styles.capBtn}>
              {allMuted ? (
                <VolumeX size={18} strokeWidth={1.6} color={color.ink3} />
              ) : (
                <Volume2 size={18} strokeWidth={1.6} color={ambientPlaying ? color.accent : color.ink2} />
              )}
            </IconButton>
            <View style={[styles.capDiv, { backgroundColor: color.line }]} />
            <IconButton label="Pause" onPress={() => onPauseChange(true)} style={styles.capBtn}>
              <Pause size={18} strokeWidth={1.6} color={color.ink2} />
            </IconButton>
          </View>
        </View>

        {/* Consistent Telemetry & Personal Best Rail */}
        {(formattedBest !== null || (stats && stats.length > 0)) && (
          <View
            style={[
              styles.telemetry,
              {
                backgroundColor: color.surface1,
                borderColor: color.line,
                borderTopColor: 'rgba(220, 224, 230, 0.08)',
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
                  backgroundColor: pulseBest ? color.accentWash : color.surface2,
                  borderColor: pulseBest ? color.accent : color.line,
                },
              ]}
            >
              <Award size={13} strokeWidth={1.8} color={formattedBest ? color.accent : color.ink4} />
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
          </View>
        )}

        <View style={styles.stage}>{children}</View>

        {controls ? <View style={styles.controls}>{controls}</View> : null}
      </View>

      {/* Identical Audio Sheet across all 13 games */}
      <GameAudioSheet open={audioOpen} onClose={() => setAudioOpen(false)} />

      {/* Identical How-to-Play Tooltip / Guide Sheet across all 13 games */}
      <Sheet open={helpOpen} onClose={() => setHelpOpen(false)} label={`How to play ${meta.name}`}>
        <View style={styles.guideHeader}>
          <View>
            <Text style={[styles.sheetTitle, { color: color.ink }]}>{meta.name}</Text>
            <Text style={[styles.sheetSub, { color: color.ink3 }]}>{meta.classic}</Text>
          </View>
          <View
            style={[
              styles.guideBestBox,
              {
                backgroundColor: color.surface2,
                borderColor: formattedBest ? color.accentDim : color.line,
              },
            ]}
          >
            <Text style={[styles.guideBestLabel, { color: color.ink3 }]}>{spec.label}</Text>
            <Text style={[styles.guideBestVal, { color: formattedBest ? color.accent : color.ink4 }]}>
              {formattedBest ?? 'None yet'}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.howtoBox,
            {
              backgroundColor: color.surface2,
              borderColor: color.line,
              borderTopColor: 'rgba(220, 224, 230, 0.1)',
            },
          ]}
        >
          {howTo.map((line, i) => (
            <View key={i} style={styles.howtoRow}>
              <Text style={[styles.howtoNum, { color: color.accent }]}>{i + 1}</Text>
              <Text style={[styles.howtoText, { color: color.ink2 }]}>{line}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.guideNote, { color: color.ink3 }]}>
          Sound, this guide, and pause stay in the top bar on every game.
        </Text>

        <View style={styles.sheetActions}>
          <Button variant="primary" block onPress={() => setHelpOpen(false)}>
            Got it
          </Button>
          {formattedBest && (
            <Button
              variant="ghost"
              size="sm"
              block
              onPress={() => clearGameBest(gameId)}
            >
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
            <View
              style={[
                styles.guideBestBox,
                { backgroundColor: color.surface2, borderColor: color.line },
              ]}
            >
              <Text style={[styles.guideBestLabel, { color: color.ink3 }]}>{spec.label}</Text>
              <Text style={[styles.guideBestVal, { color: color.accent }]}>{formattedBest}</Text>
            </View>
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
 * Shared uniform bottom action dock for puzzle/tabletop games so Undo, Hint,
 * Mode toggles, and New board feel identical on every game page.
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
        styles.actionBtn,
        {
          backgroundColor: active ? color.surface3 : color.surface1,
          borderColor: active ? color.accentDim : color.line,
          borderTopColor: active ? color.accent : 'rgba(220, 224, 230, 0.1)',
          opacity: disabled ? 0.35 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed && !disabled ? 0.96 : 1 }],
        },
      ]}
    >
      {icon}
      <Text style={[styles.actionBtnText, { color: active ? color.accent : color.ink2 }]}>{label}</Text>
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
      <View
        style={[
          styles.completionCard,
          {
            backgroundColor: color.surface1,
            borderColor: color.lineStrong,
            borderTopColor: 'rgba(220, 224, 230, 0.14)',
          },
        ]}
      >
        <Text style={[styles.completionTitle, { color: color.ink }]}>{title}</Text>
        {line ? <Text style={[styles.completionLine, { color: color.ink2 }]}>{line}</Text> : null}

        {bestText && (
          <View
            style={[
              styles.completionBest,
              {
                backgroundColor: isNewBest ? color.accentWash : color.surface2,
                borderColor: isNewBest ? color.accent : color.line,
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
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'transparent',
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
    height: 52,
    paddingHorizontal: 16,
    gap: 10,
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
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
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingLeft: 14,
    paddingRight: 8,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
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
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  controls: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
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
    borderRadius: 14,
    borderWidth: 1,
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
    borderRadius: 12,
    borderWidth: 1,
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
    borderRadius: 16,
    borderWidth: 1,
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
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  completionCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 24,
    borderWidth: 1,
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
