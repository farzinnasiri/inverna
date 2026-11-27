import { createContext, Fragment, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated'
import { Award, Bell, BellOff, ChevronLeft, CircleHelp, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react-native'
import { fallbackFreePreset } from '@/core/access'
import { feel } from '@/ui/feel'
import { gameMeta, type GameId } from '@/core/games/catalog'
import { bedtimeNudgeDue, SHELL_START, shellPause, shellReducer, type ShellEvent } from '@/core/games/shell'
import { nightKey } from '@/core/night'
import { readJSON } from '@/core/storage'
import { formatScoreValue, HIGH_SCORE_SPECS } from '@/core/highscores'
import { presetById } from '@/core/sound/catalog'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useHighScores } from '@/ui/state/highscores'
import { useSession } from '@/ui/state/session'
import { currentSchedule, useSettings, type Difficulty } from '@/ui/state/settings'
import { bedtimeNudge as nudgeCopy, gameDoor as doorCopy } from '@/ui/copy'
import { sound as soundEngine } from '@/platform'
import { useAmbientToggle, useSound } from '@/ui/state/sound'
import { isAppUnlocked } from '@/ui/state/unlock'
import { GameAudioSheet } from './GameAudioSheet'
import { AmbientBackdrop } from './AmbientBackdrop'
import { Button, FRAME_MAX_WIDTH, IconButton, Segmented, Sheet } from './controls'
import { GlassSurface } from './Glass'
import { useBackgroundPause, useHighScore, useReducedMotion, useResponsiveLayout } from './hooks'
import { EdgeSwipeBack } from './motion'
import { maybeAskForReview } from './reviewPrompt'
import { startEvent, type OpenEvent } from '@/ui/log'

export interface GameScreenProps {
  onExit: () => void
}

export interface Stat {
  label: string
  value: string | number
}

/**
 * Opt-in full-bleed play (Pond): the game draws its own water under the whole
 * screen, the top bar floats over it and can fade while you play, and there's
 * no telemetry row. Other games leave this out and are unchanged.
 */
export interface Immersive {
  /** Drawn behind the top bar, edge to edge. `chrome` is where the top bar ends and the home indicator begins (px from the top and bottom). */
  backdrop: (chrome: { top: number; bottom: number }) => ReactNode
  /** Top bar opacity, 0..1, driven by the game. */
  chromeOpacity?: SharedValue<number>
}

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
/** Height of the floating top bar (styles.top). */
const TOP_BAR_HEIGHT = 46

const DIFFICULTIES: readonly { value: Difficulty; label: string }[] = [
  { value: 'easy', label: doorCopy.easy },
  { value: 'medium', label: doorCopy.medium },
  { value: 'hard', label: doorCopy.hard },
]
/** What a game can ask of the shell around it. */
interface GameShellApi {
  /** Open the New game sheet (as the top bar's button does). */
  openNewGame: () => void
}
const GameShellContext = createContext<GameShellApi>({ openNewGame: () => {} })
/** For a game's own "New puzzle" button: the shell's New game sheet. */
export const useGameShell = () => useContext(GameShellContext)

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
  scoreVariant,
  ready = true,
  readyHint,
  readyExtra,
  onReady,
  paused,
  onPauseChange,
  onRestart,
  onNewGame,
  onExit,
  controls,
  immersive,
  children,
}: {
  gameId: GameId
  stats?: Stat[]
  score?: number | null
  commitScore?: boolean
  /** Hide personal-best pill/records (e.g. calm non-competitive Pond). */
  hideBest?: boolean
  /** Board size, for games whose sizes keep separate records (Drift, Lanterns). */
  scoreVariant?: string
  /** Set false on games that show a forgiving pre-game start/difficulty card. */
  ready?: boolean
  readyHint?: string
  /** Optional selector rendered inside the Ready card (e.g. difficulty or Classic/Endless). */
  readyExtra?: ReactNode
  onReady?: () => void
  paused: boolean
  onPauseChange: (paused: boolean) => void
  /** Start this same game again from the beginning (same puzzle, same board). */
  onRestart?: () => void
  /**
   * A fresh game at the difficulty or mode just chosen. Leave it out when
   * `onRestart` already deals a new one.
   */
  onNewGame?: () => void
  onExit: () => void
  controls?: ReactNode
  immersive?: Immersive
  children: ReactNode
}) {
  const { color } = useTokenColors()
  const { insets, isCompact, sideMargin } = useResponsiveLayout()
  const reducedMotion = useReducedMotion()
  const meta = gameMeta(gameId)
  const spec = HIGH_SCORE_SPECS[gameId]
  // One sheet at a time on top of the game, and where closing it goes back
  // to: the door, play, or Pause (core/games/shell). Play never resumes unseen.
  const [hadSave] = useState(() => readJSON<unknown>(`game:${gameId}`, null) !== null)
  const [shell, setShell] = useState(SHELL_START)
  const shellRef = useRef(shell)
  shellRef.current = shell
  const go = (event: ShellEvent) => {
    const prev = shellRef.current
    const next = shellReducer(prev, event)
    if (next === prev) return
    shellRef.current = next
    setShell(next)
    const pause = shellPause(prev, next)
    if (pause !== null && readyRef.current) onPauseChange(pause)
  }
  const sheet = shell.sheet
  const doorOpen = sheet === 'door'
  const nudgeOpen = sheet === 'nudge'
  const helpOpen = sheet === 'help'
  const audioOpen = sheet === 'audio'
  const newOpen = sheet === 'new'
  const openSheet = (kind: 'help' | 'audio' | 'new') => go({ type: 'open', sheet: kind, paused: pausedRef.current || !ready })
  const closeSheet = () => go({ type: 'close' })

  // Hold play while the door is up (games with their own start gate aren't running yet).
  useEffect(() => {
    if (ready) onPauseChange(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Difficulty chosen on the door or the New game sheet is only a choice
  // until a new game starts; Continue keeps the saved game as it was.
  const difficulty = useSettings((s) => s.difficulty[gameId] ?? s.defaultDifficulty)
  const [staged, setStaged] = useState<Difficulty | null>(null)
  const shownDifficulty = staged ?? difficulty
  // A new game is dealt on the render after the difficulty is saved, so the
  // game's own handlers see it.
  const [deal, setDeal] = useState<{ same: boolean } | null>(null)
  useEffect(() => {
    if (!deal) return
    setDeal(null)
    if (deal.same) onRestart?.()
    else newGame?.()
    onReady?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal])
  const commitDifficulty = () => {
    const changed = staged !== null && staged !== difficulty
    if (changed) {
      const st = useSettings.getState()
      st.set({ difficulty: { ...st.difficulty, [gameId]: staged } })
    }
    setStaged(null)
    return changed
  }

  const newGame = onNewGame ?? onRestart
  /** From the door: carry on, or a fresh game (also when this is the first one and the difficulty moved). */
  const enter = (fresh: boolean) => {
    const changed = fresh || !hadSave ? commitDifficulty() : (setStaged(null), false)
    go({ type: 'enter' })
    if (fresh || changed) setDeal({ same: false })
    else onReady?.()
  }
  /** From the New game sheet: deal a new one (or replay this one), then play. */
  const startOver = (same: boolean) => {
    if (!same) commitDifficulty()
    else setStaged(null)
    go({ type: 'startOver' })
    setDeal({ same })
  }

  // Bedtime arrives mid-game: ask once a night, gently, and let them choose.
  const userName = useSettings((s) => s.userName)
  const nudgedNight = useSettings((s) => s.bedtimeNudgeNight)
  useEffect(() => {
    const check = () => {
      const now = new Date()
      if (!bedtimeNudgeDue(currentSchedule(now), now, useSettings.getState().bedtimeNudgeNight)) return
      go({ type: 'open', sheet: 'nudge', paused: pausedRef.current })
    }
    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nudgedNight])
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const readyRef = useRef(ready)
  readyRef.current = ready

  const answerNudge = (choice: 'phone-down' | 'keep' | 'stop') => {
    const now = new Date()
    useSettings.getState().set({ bedtimeNudgeNight: nightKey(now) })
    if (choice === 'keep') {
      closeSheet()
      return
    }
    setShell({ sheet: null, returnTo: 'play' })
    if (choice === 'phone-down') {
      feel('commit')
      // Tonight's sound plays on and fades out by itself; the screen can sleep.
      useSession.getState().dismiss()
      const st = useSettings.getState()
      st.set({ lastLightsOutNight: nightKey(now) })
      st.recordSleep('lightsOut', now)
      useSound.getState().playPreset(fallbackFreePreset(st.sessionPreset ?? 'theta-rain', isAppUnlocked()), 45)
    }
    stepOut()
  }

  const ambientPlaying = useSound((s) => s.playing)
  const activePresetId = useSound((s) => s.presetId)
  const session = useSession((s) => s.session)
  const sfx = useSettings((s) => s.sfx)
  const setSettings = useSettings((s) => s.set)
  const ambient = useAmbientToggle()
  const toggleCues = () => {
    setSettings({ sfx: !sfx })
    soundEngine.setCuesEnabled(!sfx)
  }

  const activeSoundName = ambientPlaying
    ? (activePresetId ? presetById(activePresetId)?.name : 'Custom mix') ?? 'Playing'
    : null

  const { best, formattedBest, isNewBest } = useHighScore(
    gameId,
    hideBest ? null : score,
    !hideBest && commitScore,
    scoreVariant,
  )
  const clearGameBest = useHighScores((s) => s.clearGame)
  const [pulseBest, setPulseBest] = useState(false)

  // Stepping in: the game comes toward you out of the night (scale 1.06 -> 1)
  // as the backdrop's colour carries over; stepping out reverses it.
  const entryOpacity = useSharedValue(reducedMotion ? 1 : 0)
  const entryScale = useSharedValue(reducedMotion ? 1 : 1.06)

  useEffect(() => {
    if (reducedMotion) {
      entryOpacity.set(1)
      entryScale.set(1)
      return
    }
    entryOpacity.set(withTiming(1, { duration: 320, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
    entryScale.set(withTiming(1, { duration: 420, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
  }, [entryOpacity, entryScale, reducedMotion])

  // One event per visit to a game: how long, how it ended, the score.
  const visit = useRef<OpenEvent | null>(null)
  visit.current ??= startEvent('game', { game: gameId })
  const scoreRef = useRef(score)
  scoreRef.current = score
  useEffect(() => () => visit.current?.add({ score: scoreRef.current ?? null, difficulty: useSettings.getState().difficulty[gameId] ?? null }).end(), [gameId])

  const leaving = useRef(false)
  const stepOut = () => {
    if (leaving.current) return
    leaving.current = true
    if (reducedMotion) {
      onExit()
      return
    }
    entryOpacity.set(withTiming(0, { duration: 200, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
    entryScale.set(withTiming(1.05, { duration: 220, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
    setTimeout(onExit, 190)
  }

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
  const showTelemetryRow = !immersive && (hasStats || showBestPill || Boolean(activeSoundName))
  const fullOpacity = useSharedValue(1)
  const chromeOpacity = immersive?.chromeOpacity ?? fullOpacity
  const chromeStyle = useAnimatedStyle(() => ({ opacity: chromeOpacity.get() }))
  const padTop = insets.top + (isCompact ? 2 : 6)
  const padBottom = Math.max(insets.bottom, isCompact ? 6 : 10)

  return (
    <GameShellContext.Provider value={{ openNewGame: () => openSheet('new') }}>
    <View
      style={[
        styles.root,
        {
          paddingTop: padTop,
          paddingBottom: padBottom,
        },
      ]}
    >
      {/* The night you came from, carried in: colour only, dimmed, no motion. */}
      <AmbientBackdrop still dim={0.8} />
      {/* Swipe in from the left edge to step out, the same as the back button (it saves first). */}
      <EdgeSwipeBack onBack={stepOut} style={styles.swipe}>
      {immersive ? (
        <View style={[styles.immersive, { top: -padTop, bottom: -padBottom }]}>
          {immersive.backdrop({ top: padTop + TOP_BAR_HEIGHT, bottom: padBottom })}
        </View>
      ) : null}
      <Animated.View pointerEvents={immersive ? 'box-none' : 'auto'} style={[styles.frame, frameAnimStyle]}>
        {/* Slim Liquid Glass Top Bar */}
        <Animated.View
          pointerEvents={immersive ? 'box-none' : 'auto'}
          style={[styles.top, { paddingHorizontal: sideMargin }, chromeStyle]}
        >
          <GlassSurface variant="chrome" radius={21} style={styles.capsule}>
            <IconButton label="Back" onPress={stepOut} style={styles.capBtn}>
              <ChevronLeft size={20} strokeWidth={1.65} color={color.ink} />
            </IconButton>
            <View style={styles.capDiv} />
            <IconButton label="How to play" onPress={() => openSheet('help')} style={styles.capBtn}>
              <CircleHelp size={17} strokeWidth={1.65} color={color.ink2} />
            </IconButton>
            {newGame ? (
              <>
                <View style={styles.capDiv} />
                <IconButton label={doorCopy.newGame} onPress={() => openSheet('new')} style={styles.capBtn}>
                  <RotateCcw size={16} strokeWidth={1.65} color={color.ink2} />
                </IconButton>
              </>
            ) : null}
          </GlassSurface>

          <View style={styles.titleStack}>
            <Text style={[styles.title, { color: color.ink }]} numberOfLines={1}>
              {meta.name}
            </Text>
            {session ? (
              <Text style={[styles.sessionMini, { color: color.accent }]} numberOfLines={1}>
                Winding down
              </Text>
            ) : null}
          </View>

          <GlassSurface variant="chrome" radius={21} style={styles.capsule}>
            <IconButton
              label={ambientPlaying ? `Stop ${ambient.name}` : `Play ${ambient.name}`}
              onPress={ambient.toggle}
              lit={ambientPlaying}
              style={styles.capBtn}
            >
              {ambientPlaying ? (
                <Volume2 size={17} strokeWidth={1.65} color={color.accent} />
              ) : (
                <VolumeX size={17} strokeWidth={1.65} color={color.ink3} />
              )}
            </IconButton>
            <View style={styles.capDiv} />
            <IconButton label={sfx ? 'Mute game sounds' : 'Unmute game sounds'} onPress={toggleCues} style={styles.capBtn}>
              {sfx ? (
                <Bell size={16} strokeWidth={1.65} color={color.ink2} />
              ) : (
                <BellOff size={16} strokeWidth={1.65} color={color.ink3} />
              )}
            </IconButton>
            <View style={styles.capDiv} />
            <IconButton label="Pause" onPress={() => onPauseChange(true)} style={styles.capBtn}>
              <Pause size={17} strokeWidth={1.65} color={color.ink2} />
            </IconButton>
          </GlassSurface>
        </Animated.View>

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
                  onPress={() => openSheet('audio')}
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
                    {pulseBest ? `New best: ${formattedBest}` : `Best ${formattedBest}`}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        <View pointerEvents={immersive ? 'box-none' : 'auto'} style={[styles.stage, { paddingHorizontal: sideMargin }]}>
          {children}

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
      </EdgeSwipeBack>

      {/* Identical Audio Sheet across all 13 games */}
      <GameAudioSheet open={audioOpen} onClose={closeSheet} />

      {/* Rules: the same three lines for every game. */}
      <Sheet open={helpOpen} onClose={closeSheet} label={`How to play ${meta.name}`}>
        <Text style={[styles.kicker, { color: color.ink3 }]}>{meta.classic}</Text>
        <Text style={[styles.sheetTitle, { color: color.ink }]}>{meta.name}</Text>

        <View style={styles.rules}>
          {(
            [
              ['Goal', meta.rules.goal],
              ['Play', meta.rules.play],
              ['Tip', meta.rules.tip],
            ] as const
          ).map(([label, text], i) => (
            <View
              key={label}
              style={[styles.ruleRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line }]}
            >
              <Text style={[styles.ruleLabel, { color: label === 'Goal' ? color.accent : color.ink3 }]}>{label}</Text>
              <Text style={[styles.ruleText, { color: label === 'Goal' ? color.ink : color.ink2 }]}>{text}</Text>
            </View>
          ))}
        </View>

        {showBestPill ? (
          <Text style={[styles.bestLine, { color: color.ink3 }]}>
            {spec.label} · <Text style={{ color: color.accent }}>{formattedBest}</Text>
          </Text>
        ) : null}

        <View style={styles.sheetActions}>
          <Button variant="primary" block onPress={closeSheet}>
            Got it
          </Button>
          {showBestPill && (
            <Button variant="ghost" size="sm" block onPress={() => clearGameBest(gameId)}>
              Reset best
            </Button>
          )}
        </View>
      </Sheet>

      {/* The door: how hard, then carry on or start fresh. */}
      <Sheet open={doorOpen} onClose={() => enter(false)} label={meta.name}>
        <Text style={[styles.kicker, { color: color.ink3 }]}>{meta.classic}</Text>
        <Text style={[styles.sheetTitle, { color: color.ink }]}>{meta.name}</Text>
        <Text style={[styles.doorGoal, { color: color.ink2 }]}>{readyHint ?? meta.rules.goal}</Text>
        {meta.difficulty === 'shared' ? (
          <View style={styles.doorPicker}>
            <Segmented label={doorCopy.difficulty} options={DIFFICULTIES} value={shownDifficulty} onChange={setStaged} />
          </View>
        ) : null}
        {readyExtra ? <View style={styles.doorPicker}>{readyExtra}</View> : null}
        <View style={styles.sheetActions}>
          {hadSave ? (
            <>
              <Button variant="primary" block onPress={() => enter(false)}>
                <Play size={15} strokeWidth={2} color={color.accentInk} fill={color.accentInk} />
                <Text style={[styles.readyBtnText, { color: color.accentInk }]}>{doorCopy.continue}</Text>
              </Button>
              <Button variant="quiet" block onPress={() => enter(true)}>
                {doorCopy.newGame}
              </Button>
            </>
          ) : (
            <Button variant="primary" block onPress={() => enter(false)}>
              <Play size={15} strokeWidth={2} color={color.accentInk} fill={color.accentInk} />
              <Text style={[styles.readyBtnText, { color: color.accentInk }]}>{doorCopy.newGame}</Text>
            </Button>
          )}
          <Button variant="ghost" size="sm" block onPress={() => openSheet('help')}>
            How to play
          </Button>
        </View>
      </Sheet>

      {/* New game, from the top bar or Pause: how hard, then a fresh one (or this one again). */}
      <Sheet open={newOpen} onClose={closeSheet} label={`${doorCopy.newGame}, ${meta.name}`}>
        <Text style={[styles.kicker, { color: color.ink3 }]}>{doorCopy.newGame}</Text>
        <Text style={[styles.sheetTitle, { color: color.ink }]}>{meta.name}</Text>
        {meta.difficulty === 'shared' ? (
          <View style={styles.doorPicker}>
            <Segmented label={doorCopy.difficulty} options={DIFFICULTIES} value={shownDifficulty} onChange={setStaged} />
          </View>
        ) : null}
        {readyExtra ? <View style={styles.doorPicker}>{readyExtra}</View> : null}
        <View style={styles.sheetActions}>
          <Button variant="primary" block onPress={() => startOver(false)}>
            <Play size={15} strokeWidth={2} color={color.accentInk} fill={color.accentInk} />
            <Text style={[styles.readyBtnText, { color: color.accentInk }]}>{doorCopy.start}</Text>
          </Button>
          {onNewGame && onRestart ? (
            <Button variant="quiet" block onPress={() => startOver(true)}>
              {doorCopy.replay}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" block onPress={closeSheet}>
            {doorCopy.keepPlaying}
          </Button>
        </View>
      </Sheet>

      {/* Bedtime arrived mid-game. */}
      <Sheet open={nudgeOpen} onClose={() => answerNudge('keep')} label={nudgeCopy.title(userName)}>
        <Text style={[styles.sheetTitle, { color: color.ink }]}>{nudgeCopy.title(userName)}</Text>
        <Text style={[styles.doorGoal, { color: color.ink2 }]}>{nudgeCopy.body}</Text>
        <View style={styles.sheetActions}>
          <Button variant="primary" block onPress={() => answerNudge('phone-down')}>
            {nudgeCopy.putPhoneDown}
          </Button>
          <Text style={[styles.nudgeNote, { color: color.ink3 }]}>{nudgeCopy.putPhoneDownNote}</Text>
          <View style={styles.nudgeRow}>
            <View style={{ flex: 1 }}>
              <Button variant="quiet" block onPress={() => answerNudge('keep')}>
                {nudgeCopy.keepPlaying}
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="quiet" block onPress={() => answerNudge('stop')}>
                {nudgeCopy.stop}
              </Button>
            </View>
          </View>
        </View>
      </Sheet>

      {/* Pause: resume first, three equal side doors, a quiet way out. */}
      <Sheet open={paused && !sheet} onClose={() => onPauseChange(false)} label="Paused">
        <Text style={[styles.kicker, { color: color.ink3 }]}>Paused</Text>
        <Text style={[styles.sheetTitle, { color: color.ink }]}>{meta.name}</Text>
        {showBestPill ? (
          <Text style={[styles.bestLine, { color: color.ink3, marginTop: 4 }]}>
            {spec.label} · <Text style={{ color: color.accent }}>{formattedBest}</Text>
          </Text>
        ) : null}

        <View style={styles.sheetActions}>
          <Button variant="primary" block onPress={() => onPauseChange(false)}>
            <Play size={15} strokeWidth={2} color={color.accentInk} fill={color.accentInk} />
            <Text style={[styles.readyBtnText, { color: color.accentInk }]}>Resume</Text>
          </Button>

          <View style={styles.doorRow}>
            <PauseDoor
              label="Sound"
              icon={<Volume2 size={18} strokeWidth={1.6} color={ambientPlaying ? color.accent : color.ink2} />}
              onPress={() => openSheet('audio')}
            />
            <PauseDoor
              label="Rules"
              icon={<CircleHelp size={18} strokeWidth={1.6} color={color.ink2} />}
              onPress={() => openSheet('help')}
            />
            {newGame ? (
              <PauseDoor
                label={doorCopy.newGame}
                icon={<RotateCcw size={18} strokeWidth={1.6} color={color.ink2} />}
                onPress={() => openSheet('new')}
              />
            ) : null}
          </View>

          <Button variant="ghost" size="sm" block onPress={stepOut}>
            Back to games
          </Button>
        </View>
      </Sheet>
    </View>
    </GameShellContext.Provider>
  )
}

function PauseDoor({ label, icon, onPress }: { label: string; icon: ReactNode; onPress: () => void }) {
  const { color } = useTokenColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.door,
        { backgroundColor: color.surface2, borderColor: color.line, opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      {icon}
      <Text style={[styles.doorText, { color: color.ink2 }]}>{label}</Text>
    </Pressable>
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
      accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(active) }}
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
  // A solved round is a good moment to ask, now and then, for a rating.
  useEffect(() => {
    if (open) maybeAskForReview()
  }, [open])
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
  swipe: {
    width: '100%',
    alignItems: 'center',
  },
  immersive: {
    position: 'absolute',
    left: 0,
    right: 0,
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
  doorGoal: {
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
  },
  doorPicker: {
    marginTop: 18,
  },
  nudgeNote: {
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: -2,
  },
  nudgeRow: {
    flexDirection: 'row',
    gap: 10,
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
  kicker: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sheetTitle: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.6,
    marginTop: 2,
  },
  rules: {
    marginTop: 18,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 13,
  },
  ruleLabel: {
    width: 38,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 3,
  },
  ruleText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 23,
  },
  bestLine: {
    fontSize: 13,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  doorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  door: {
    flex: 1,
    height: 66,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  doorText: {
    fontSize: 13,
    fontWeight: '500',
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
