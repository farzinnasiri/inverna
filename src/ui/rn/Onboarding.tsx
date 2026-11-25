import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { router } from 'expo-router'
import { Check, ChevronLeft, Lock, Moon, Pause, Play, ThumbsDown, ThumbsUp, Volume2, Waves } from 'lucide-react-native'
import { eveningState } from '@/core/evening'
import type { GameId } from '@/core/games/catalog'
import { formatBedtime12h, RIBBON_SPAN_MIN, ribbonBedtime, ribbonOffset } from '@/core/night'
import {
  EMPTY_PROFILE,
  GAME_STYLES,
  LISTEN_SAMPLES,
  profileDifficulty,
  profileSound,
  profileWindDownMinutes,
  SLEEP_FACTORS,
  type GameStyle,
  type SleepFactor,
  type SleepProfile,
  type SoundFamily,
} from '@/core/profile'
import { presetById } from '@/core/sound/catalog'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { onboarding as copy } from '@/ui/copy'
import { currentSchedule, useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { AmbientBackdrop } from './AmbientBackdrop'
import { Button, FRAME_MAX_WIDTH, PillSlider, Slider, Toggle } from './controls'
import { GameGlyph } from './GameGlyph'
import { GlassSurface } from './Glass'
import { useReducedMotion, useResponsiveLayout } from './hooks'
import { LullMark } from './LullMark'
import { AnswerLayer, EASE_OUT, HandoffTitle, itemDelay, Rise } from './motion'
import { NightRibbon } from './NightRibbon'
import { planRemindersNow } from './reminders'
import { DescentCurve, PillarIcon, ScienceLink, ScienceSheet } from './ScienceSheet'
import { SoundGlyph } from './SoundGlyph'

type Page = 'intro' | 'science' | 'bedtime' | 'keeps' | 'mind' | 'games' | 'listen' | 'name'
const PAGES: readonly Page[] = ['intro', 'science', 'bedtime', 'keeps', 'mind', 'games', 'listen', 'name']
/** Setup questions begin on page 3 (bedtime). Intro and science are the welcome. */
const SETUP_START = 2
const SETUP_PAGES: readonly Page[] = PAGES.slice(SETUP_START)

/** Each page shows a different scene; the listening page shows the sound playing. */
const PAGE_SCENE: Record<Page, string> = {
  intro: 'starfield',
  science: 'nocturne',
  bedtime: 'lunar-tide',
  keeps: 'still-horizon',
  mind: 'deep-drift',
  games: 'ink-reverie',
  listen: 'theta-rain',
  name: 'hearth',
}

const FAMILIES: readonly SoundFamily[] = ['steady', 'music', 'nature']
const STYLE_GAMES: Record<GameStyle, readonly GameId[]> = {
  soothing: ['pond', 'hue', 'lanterns'],
  puzzle: ['nine', 'weave', 'thread'],
  quick: ['settle', 'chime', 'cascade'],
}

/** Title box: two lines of the title style, so one- and two-line questions sit alike. */
const TITLE_BOX = 76

/**
 * First run. Lull introduces itself, then learns enough to set itself up:
 * bedtime (and a reminder), what makes falling asleep hard, how busy their mind
 * is, how they like to switch off with a game, which sounds they like and how
 * loud, and a first name. The answers set the starting point
 * (core/profile.ts); Play keeps learning from what they actually play.
 *
 * Every page has the same frame: the question in a fixed box at eye level, the
 * answers centred below it toward the thumb, and Skip + the main button at the
 * bottom. Titles hand over in place (old words lift away, new ones rise) and
 * answers swap in place, so nothing on screen jumps between pages.
 */
export function Onboarding() {
  const { color } = useTokenColors()
  const { height, insets, sideMargin } = useResponsiveLayout()
  const reduced = useReducedMotion()

  const schedule = useSettings((s) => s.schedule)
  const reminders = useSettings((s) => s.reminders)
  const savedName = useSettings((s) => s.userName)
  const savedProfile = useSettings((s) => s.profile)
  const hapticsOn = useSettings((s) => s.haptics)
  const set = useSettings((s) => s.set)
  const setSchedule = useSettings((s) => s.setSchedule)

  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const volume = useSound((s) => s.volume)
  const playPreset = useSound((s) => s.playPreset)
  const stopSound = useSound((s) => s.stop)
  const setVolume = useSound((s) => s.setVolume)

  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  /** The page whose answers are fading out under the new ones. */
  const [leaving, setLeaving] = useState<Page | null>(null)
  const [name, setName] = useState(savedName)
  const [profile, setProfile] = useState<SleepProfile>(savedProfile ?? { ...EMPTY_PROFILE, volume })
  const [answered, setAnswered] = useState(Boolean(savedProfile))
  const [scienceOpen, setScienceOpen] = useState(false)
  const page = PAGES[index]!
  const inSetup = index >= SETUP_START

  // Leaving: the page fades out over the scene before Play takes over.
  const frameOpacity = useSharedValue(1)
  const frameStyle = useAnimatedStyle(() => ({ opacity: frameOpacity.get() }))

  const tap = (kind: 'light' | 'selection' | 'medium' = 'light') => {
    if (hapticsOn) haptics.play(kind)
  }
  const update = (patch: Partial<SleepProfile>) => {
    setAnswered(true)
    setProfile((p) => ({ ...p, ...patch }))
  }

  const finish = () => {
    tap('medium')
    // A sound picked here keeps playing only if it's time for bed anyway.
    const kind = eveningState(currentSchedule(), new Date()).kind
    if (useSound.getState().playing && kind !== 'winding' && kind !== 'past') stopSound(1.2)
    const final = { ...profile, volume: useSound.getState().volume }
    set({
      onboarded: true,
      userName: name.trim(),
      // Answers set the starting point: games, difficulty, sounds, wind-down length.
      ...(answered
        ? {
            profile: final,
            defaultDifficulty: profileDifficulty(final),
            sessionMinutes: profileWindDownMinutes(final),
            sessionPreset: profileSound(final),
          }
        : null),
    })
    if (useSettings.getState().reminders) void planRemindersNow({ ask: true })
    if (reduced) {
      router.replace('/')
      return
    }
    frameOpacity.set(withTiming(0, { duration: 260, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
    setTimeout(() => router.replace('/'), 240)
  }

  const go = (to: number) => {
    tap()
    const target = Math.max(0, Math.min(PAGES.length - 1, to))
    if (target === index) return
    setDir(to > index ? 1 : -1)
    if (!reduced) setLeaving(page)
    setIndex(target)
  }
  const next = () => (index === PAGES.length - 1 ? finish() : go(index + 1))
  const skip = () => (inSetup ? finish() : go(SETUP_START))

  // Bedtime ribbon covers 8 PM to 3 AM; Settings has the full wheel.
  const offset = Math.max(0, Math.min(RIBBON_SPAN_MIN, ribbonOffset(schedule.bedtime)))
  const setBedtime = (o: number) => {
    tap('selection')
    setSchedule({ bedtime: ribbonBedtime(o), enabled: true })
  }

  const toggleFactor = (f: SleepFactor) => {
    tap('selection')
    update({ factors: profile.factors.includes(f) ? profile.factors.filter((x) => x !== f) : [...profile.factors, f] })
  }
  const toggleStyle = (st: GameStyle) => {
    tap('selection')
    update({ styles: profile.styles.includes(st) ? profile.styles.filter((x) => x !== st) : [...profile.styles, st] })
  }

  const sampleLive = (f: SoundFamily) => playing && presetId === LISTEN_SAMPLES[f]
  const toggleSample = (f: SoundFamily) => {
    tap('selection')
    if (sampleLive(f)) stopSound(0.6)
    else playPreset(LISTEN_SAMPLES[f], 0)
  }
  const rate = (f: SoundFamily, v: 1 | -1) => {
    tap('selection')
    const liked = { ...profile.liked }
    if (liked[f] === v) delete liked[f]
    else liked[f] = v
    update({ liked })
  }

  const mindStage = (p: number) => copy.mind.stages[Math.min(copy.mind.stages.length - 1, Math.floor(p * copy.mind.stages.length))]!
  const listening = FAMILIES.find(sampleLive)
  const scene = page === 'listen' && listening ? LISTEN_SAMPLES[listening] : PAGE_SCENE[page]
  const button =
    page === 'intro'
      ? copy.intro.button
      : page === 'science'
        ? copy.science.button
        : page === 'name'
          ? copy.name.button
          : copy.continue
  // The question sits at eye level, the same height on every page.
  const titleTop = Math.round(height * 0.09)

  /** One page's answers. Rendered for the page arriving, and for the one fading out under it. */
  const renderAnswers = (pg: Page) => (
    <>
              {pg === 'intro' ? (
                <View style={styles.introWrap}>
                  <Rise delay={itemDelay(0)} reduced={reduced} style={styles.center}>
                    <LullMark size={136} draw={!reduced} delay={280} duration={1500} />
                  </Rise>
                  <Rise delay={itemDelay(1)} reduced={reduced} style={styles.introCopy}>
                    <Text style={[styles.brandName, { color: color.accent }]}>{copy.intro.name}</Text>
                    <Text style={[styles.subline, { color: color.ink2 }]}>{copy.intro.subline}</Text>
                  </Rise>
                </View>
              ) : null}

              {pg === 'science' ? (
                <View style={styles.scienceStack}>
                  <Rise delay={itemDelay(0)} reduced={reduced}>
                    <DescentCurve draw={!reduced} />
                  </Rise>
                  {copy.science.pillars.map((pillar, i) => (
                    <Rise key={pillar.key} delay={itemDelay(i + 1)} reduced={reduced}>
                      <GlassSurface variant="card" radius={18} style={styles.pillarCard}>
                        <View style={[styles.pillarBadge, { backgroundColor: color.accentWash }]}>
                          <PillarIcon pillar={pillar.key} size={16} color={color.accent} />
                        </View>
                        <View style={styles.fill}>
                          <Text style={[styles.pillarTitle, { color: color.ink }]}>{pillar.title}</Text>
                          <Text style={[styles.pillarBody, { color: color.ink2 }]}>{pillar.body}</Text>
                        </View>
                      </GlassSurface>
                    </Rise>
                  ))}
                  <Rise delay={itemDelay(copy.science.pillars.length + 1)} reduced={reduced}>
                    <ScienceLink
                      label={`${copy.science.more} ›`}
                      onPress={() => {
                        tap('light')
                        setScienceOpen(true)
                      }}
                    />
                  </Rise>
                </View>
              ) : null}

              {pg === 'bedtime' ? (
                <View style={styles.stack}>
                  <Rise delay={itemDelay(0)} reduced={reduced}>
                  <Text
                    style={[styles.time, { color: color.ink }]}
                    accessibilityLiveRegion="polite"
                  >
                    {formatBedtime12h(schedule.bedtime)}
                  </Text>
                  </Rise>
                  <Rise delay={itemDelay(1)} reduced={reduced}>
                    <NightRibbon offset={offset} spanFrom={offset - schedule.leadMinutes} onChange={setBedtime} />
                  </Rise>
                  <Rise delay={itemDelay(2)} reduced={reduced}>
                    <GlassSurface variant="card" radius={18} style={styles.row}>
                      <Text style={[styles.rowText, { color: color.ink }]}>{copy.bedtime.reminder}</Text>
                      <Toggle label={copy.bedtime.reminder} checked={reminders} onChange={(v) => set({ reminders: v })} />
                    </GlassSurface>
                  </Rise>
                </View>
              ) : null}

              {pg === 'keeps' ? (
                <View style={styles.stack}>
                  <View style={styles.chips}>
                    {SLEEP_FACTORS.map((f, i) => {
                      const on = profile.factors.includes(f)
                      return (
                        <Rise key={f} delay={itemDelay(i)} reduced={reduced}>
                          <Pressable
                            onPress={() => toggleFactor(f)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}
                            style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                          >
                            <GlassSurface variant="pill" radius={21} accent={on} interactive style={styles.chip}>
                              <Text style={[styles.chipText, { color: on ? color.accent : color.ink }]}>
                                {copy.keeps.factors[f]}
                              </Text>
                            </GlassSurface>
                          </Pressable>
                        </Rise>
                      )
                    })}
                  </View>
                  <Rise delay={itemDelay(SLEEP_FACTORS.length)} reduced={reduced} style={styles.privacy}>
                    <Lock size={13} strokeWidth={1.8} color={color.ink3} />
                    <Text style={[styles.privacyText, { color: color.ink3 }]}>{copy.keeps.private}</Text>
                  </Rise>
                </View>
              ) : null}

              {pg === 'mind' ? (
                <Rise delay={itemDelay(0)} reduced={reduced} style={styles.stack}>
                  <PillSlider
                    value={profile.mind}
                    onChange={(v) => update({ mind: v })}
                    title={copy.mind.label}
                    valueLabel={mindStage}
                    left={<Moon size={16} strokeWidth={1.65} color={color.ink3} />}
                    right={<Waves size={17} strokeWidth={1.65} color={color.accent} />}
                  />
                </Rise>
              ) : null}

              {pg === 'games' ? (
                <View style={styles.stack}>
                  {GAME_STYLES.map((st, i) => {
                    const on = profile.styles.includes(st)
                    return (
                      <Rise key={st} delay={itemDelay(i)} reduced={reduced}>
                        <Pressable
                          onPress={() => toggleStyle(st)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]}
                        >
                          <GlassSurface variant="card" radius={20} accent={on} interactive style={styles.styleCard}>
                            <View style={styles.glyphs}>
                              {STYLE_GAMES[st].map((id) => (
                                <GameGlyph key={id} id={id} size={24} />
                              ))}
                            </View>
                            <View style={styles.fill}>
                              <Text style={[styles.styleTitle, { color: color.ink }]}>{copy.games.styles[st].title}</Text>
                              <Text style={[styles.styleGames, { color: color.ink3 }]}>{copy.games.styles[st].games}</Text>
                            </View>
                            <View style={[styles.check, { borderColor: on ? color.accent : color.line, backgroundColor: on ? color.accent : 'transparent' }]}>
                              {on ? <Check size={13} strokeWidth={2.6} color={color.accentInk} /> : null}
                            </View>
                          </GlassSurface>
                        </Pressable>
                      </Rise>
                    )
                  })}
                </View>
              ) : null}

              {pg === 'listen' ? (
                <View style={styles.stack}>
                  {FAMILIES.map((f, i) => {
                    const live = sampleLive(f)
                    const preset = presetById(LISTEN_SAMPLES[f])
                    const rating = profile.liked[f]
                    return (
                      <Rise key={f} delay={itemDelay(i)} reduced={reduced}>
                        <GlassSurface variant="card" radius={20} accent={live} style={styles.sample}>
                          <Pressable
                            onPress={() => toggleSample(f)}
                            accessibilityRole="button"
                            accessibilityLabel={live ? `Stop ${copy.listen.samples[f]}` : `Play ${copy.listen.samples[f]}`}
                            style={styles.sampleMain}
                          >
                            <View style={[styles.playDisc, { backgroundColor: live ? color.accent : 'rgba(255,255,255,0.08)' }]}>
                              {live ? (
                                <Pause size={16} strokeWidth={2} color={color.accentInk} fill={color.accentInk} />
                              ) : (
                                <Play size={16} strokeWidth={2} color={color.ink} fill={color.ink} style={{ marginLeft: 2 }} />
                              )}
                            </View>
                            {preset ? <SoundGlyph icon={preset.icon} size={18} color={live ? color.accent : color.ink3} /> : null}
                            <Text style={[styles.sampleName, { color: color.ink }]}>{copy.listen.samples[f]}</Text>
                          </Pressable>
                          <Thumb up active={rating === 1} onPress={() => rate(f, 1)} label={`I like ${copy.listen.samples[f]}`} />
                          <Thumb active={rating === -1} onPress={() => rate(f, -1)} label={`Not for me: ${copy.listen.samples[f]}`} />
                        </GlassSurface>
                      </Rise>
                    )
                  })}
                  <Rise delay={itemDelay(FAMILIES.length)} reduced={reduced} style={styles.volume}>
                    <Volume2 size={16} strokeWidth={1.7} color={color.ink3} />
                    <View style={styles.fill}>
                      <Slider value={volume} onChange={setVolume} label={copy.listen.volume} />
                    </View>
                  </Rise>
                </View>
              ) : null}

              {pg === 'name' ? (
                <Rise delay={itemDelay(0)} reduced={reduced} style={styles.stack}>
                  <GlassSurface variant="card" radius={18} style={styles.inputWrap}>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      placeholder={copy.name.placeholder}
                      placeholderTextColor={color.ink3}
                      autoCapitalize="words"
                      autoCorrect={false}
                      autoComplete="given-name"
                      textContentType="givenName"
                      returnKeyType="done"
                      maxLength={24}
                      onSubmitEditing={finish}
                      style={[styles.input, { color: color.ink }]}
                      accessibilityLabel={copy.name.placeholder}
                    />
                  </GlassSurface>
                  <Text style={[styles.note, { color: color.ink3 }]}>{copy.name.note}</Text>
                </Rise>
              ) : null}
    </>
  )

  return (
    <View style={styles.root}>
      <AmbientBackdrop presetId={scene} />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View
          style={[
            styles.frame,
            { paddingTop: insets.top + 6, paddingBottom: Math.max(insets.bottom, 16) + 8, paddingHorizontal: sideMargin + 4 },
            frameStyle,
          ]}
        >
          <View style={styles.top}>
            <Pressable
              onPress={() => go(index - 1)}
              disabled={index === 0}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={copy.back}
              style={[styles.backBtn, { opacity: index === 0 ? 0 : 1 }]}
            >
              <ChevronLeft size={22} strokeWidth={1.8} color={color.ink2} />
            </Pressable>
            {inSetup ? (
              <View style={styles.dots} accessibilityLabel={`Step ${index - SETUP_START + 1} of ${SETUP_PAGES.length}`}>
                {SETUP_PAGES.map((p, i) => (
                  <StepDot key={p} active={i === index - SETUP_START} accent={color.accent} reduced={reduced} />
                ))}
              </View>
            ) : (
              <View style={styles.dots} />
            )}
            <View style={styles.backBtn} />
          </View>

          <HandoffTitle
            text={copy[page].title}
            dir={dir}
            reduced={reduced}
            style={[styles.titleBox, { marginTop: titleTop }]}
            textStyle={[styles.title, { color: color.ink }]}
          />

          {/* Answers: centred in the space below the question, swapped in place. */}
          <View style={styles.answers}>
            {/* The page you left keeps its elements while it fades, so nothing replays. */}
            {(leaving && leaving !== page ? [leaving, page] : [page]).map((pg) => (
              <AnswerLayer
                key={pg}
                leaving={pg !== page}
                onGone={() => setLeaving((l) => (l === pg ? null : l))}
                style={styles.answerLayer}
              >
                {renderAnswers(pg)}
              </AnswerLayer>
            ))}
          </View>
          {/* Same place on every page: skip on the left, the main action on the right. */}
          <View style={styles.footer}>
            <Button variant="ghost" onPress={skip} style={styles.skip}>
              {copy.skip}
            </Button>
            <View style={styles.fill}>
              <Button variant="primary" block onPress={next}>
                {button}
              </Button>
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
      <ScienceSheet open={scienceOpen} onClose={() => setScienceOpen(false)} />
    </View>
  )
}

/** Progress: the active dot is a pill that slides between steps. */
function StepDot({ active, accent, reduced }: { active: boolean; accent: string; reduced: boolean }) {
  const w = useSharedValue(active ? 18 : 6)
  useEffect(() => {
    w.set(reduced ? (active ? 18 : 6) : withTiming(active ? 18 : 6, { duration: 260, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
  }, [active, reduced, w])
  const style = useAnimatedStyle(() => ({ width: w.get() }))
  return <Animated.View style={[styles.dot, { backgroundColor: active ? accent : 'rgba(255,255,255,0.26)' }, style]} />
}

function Thumb({ up, active, onPress, label }: { up?: boolean; active: boolean; onPress: () => void; label: string }) {
  const { color } = useTokenColors()
  const Icon = up ? ThumbsUp : ThumbsDown
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.thumb,
        { backgroundColor: active ? color.accentWash : 'transparent', transform: [{ scale: pressed ? 0.92 : 1 }] },
      ]}
    >
      <Icon size={18} strokeWidth={1.8} color={active ? color.accent : color.ink3} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fill: {
    flex: 1,
  },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: FRAME_MAX_WIDTH,
    alignSelf: 'center',
  },
  top: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    height: 5,
    borderRadius: 2.5,
  },
  titleBox: {
    height: TITLE_BOX,
  },
  title: {
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: -0.6,
    lineHeight: 36,
  },
  answers: {
    flex: 1,
  },
  answerLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
  },
  introWrap: {
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 8,
  },
  introCopy: {
    alignItems: 'center',
    gap: 8,
  },
  brandName: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  subline: {
    fontSize: 16.5,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 310,
  },
  scienceStack: {
    gap: 10,
  },
  pillarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  pillarBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillarTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  pillarBody: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 1,
  },
  stack: {
    gap: 14,
  },
  time: {
    fontSize: 48,
    fontWeight: '200',
    letterSpacing: -1.4,
    fontVariant: ['tabular-nums'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowText: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '500',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    height: 42,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 15,
    fontWeight: '500',
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  privacyText: {
    fontSize: 13,
  },
  styleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  glyphs: {
    flexDirection: 'row',
    gap: 4,
  },
  styleTitle: {
    fontSize: 15.5,
    fontWeight: '600',
  },
  styleGames: {
    fontSize: 12.5,
    marginTop: 2,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sample: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 8,
    height: 64,
    gap: 4,
  },
  sampleMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: '100%',
  },
  playDisc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sampleName: {
    fontSize: 17,
    fontWeight: '600',
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  volume: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  inputWrap: {
    paddingHorizontal: 18,
    height: 58,
    justifyContent: 'center',
  },
  input: {
    fontSize: 19,
    fontWeight: '500',
  },
  note: {
    fontSize: 13,
    marginLeft: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
  },
  skip: {
    minWidth: 96,
  },
})
