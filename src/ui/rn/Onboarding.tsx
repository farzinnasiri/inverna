import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, useWindowDimensions, type StyleProp, type ViewStyle, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { router } from 'expo-router'
import {
  BookOpen,
  Check,
  ChevronLeft,
  Ellipsis,
  Film,
  Gamepad2,
  Headphones,
  Lock,
  Moon,
  Newspaper,
  Pause,
  Play,
  ThumbsDown,
  ThumbsUp,
  Users,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react-native'
import { fallbackFreePreset } from '@/core/access'
import { nightKey } from '@/core/night'
import { canPreviewFreeTier } from '@/platform'
import { feel } from '@/ui/feel'
import type { SciencePillarKey } from '@/ui/copy'
import {
  EMPTY_PROFILE,
  LISTEN_SAMPLES,
  PHONE_HABITS,
  profileDifficulty,
  profileSound,
  profileWindDownMinutes,
  SLEEP_FACTORS,
  type PhoneHabit,
  type SleepFactor,
  type SleepProfile,
  type SoundFamily,
} from '@/core/profile'
import { presetById } from '@/core/sound/catalog'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { onboarding as copy, paywall as paywallCopy } from '@/ui/copy'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { isAppUnlocked, useIsUnlocked, useUnlock } from '@/ui/state/unlock'
import { AmbientBackdrop } from './AmbientBackdrop'
import { swing, useAmbientTime, useCovered } from './ambientClock'
import { Button, FRAME_MAX_WIDTH, PillSlider, Slider, Toggle } from './controls'
import { GlassLens, GlassSurface } from './Glass'
import { useReducedMotion, useResponsiveLayout } from './hooks'
import { InvernaMark } from './InvernaMark'
import { AnswerLayer, EASE_OUT, EdgeSwipeBack, HandoffTitle, itemDelay, Rise, TITLE_MAX_SCALE } from './motion'
import { MindTangle } from './MindTangle'
import { TrustPillGrid, UnlockFeatureStack, UPGRADE_INK } from './Paywall'
import { SleepAround } from './SleepAround'
import { PRIVACY_URL } from '@/ui/links'
import { holdPrompts } from './promptGate'
import { startEvent } from '@/ui/log'
import { planRemindersNow } from './reminders'
import { DescentCurve, PillarIcon, ScienceLink, ScienceSheet } from './ScienceSheet'
import { SoundGlyph } from './SoundGlyph'

type Page = 'intro' | 'science' | 'bedtime' | 'keeps' | 'mind' | 'habits' | 'listen' | 'name' | 'ready'
const BASE_PAGES: readonly Page[] = ['intro', 'science', 'bedtime', 'keeps', 'mind', 'habits', 'listen', 'name']
/** Setup questions begin on page 3 (bedtime). Intro and science are the welcome. */
const SETUP_START = 2

/**
 * Each page shows a different scene and plays it softly behind the question:
 * twilight indigo & dusk plum lead the welcome, fire warms the busy-mind page,
 * and once they pick a sound on Listen it carries seamlessly into the app.
 */
const PAGE_SCENE: Record<Page, string> = {
  intro: 'deep-drift',
  science: 'nocturne',
  bedtime: 'low-tide',
  keeps: 'still-horizon',
  mind: 'hearth',
  habits: 'mist-pine',
  listen: 'theta-rain',
  name: 'starfield',
  ready: 'deep-drift',
}

const FAMILIES: readonly SoundFamily[] = ['steady', 'music', 'nature']
const HABIT_ICON: Record<PhoneHabit, typeof Film> = {
  short_video: Film,
  x_news: Newspaper,
  reading: BookOpen,
  audio: Headphones,
  games: Gamepad2,
  other: Ellipsis,
}

/** The busy-mind slider's fill runs from the calm thread colour to the busy one. */
const MIND_CALM_FILL = 'rgba(143, 176, 255, 0.20)'
const MIND_BUSY_FILL = 'rgba(242, 148, 74, 0.46)'

/** Title box: two lines of the title style, so one- and two-line questions sit alike. */
const TITLE_BOX = 76

/**
 * First run. Inverna introduces itself, then learns enough to set itself up:
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
  const { fontScale } = useWindowDimensions()
  const reduced = useReducedMotion()
  const unlocked = useIsUnlocked()
  const unlockPrice = useUnlock((s) => s.price)
  const unlockLoading = useUnlock((s) => s.loadingProduct)
  const unlockBusy = useUnlock((s) => s.busy)
  const unlockFamily = useUnlock((s) => s.familyShareable)
  const unlockUnreachable = useUnlock((s) => s.unreachable)
  const devPreviewFree = useUnlock((s) => s.devPreviewFree)

  const schedule = useSettings((s) => s.schedule)
  const reminders = useSettings((s) => s.reminders)
  const savedName = useSettings((s) => s.userName)
  const savedProfile = useSettings((s) => s.profile)
  const set = useSettings((s) => s.set)
  const setSchedule = useSettings((s) => s.setSchedule)

  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const volume = useSound((s) => s.volume)
  const playPreset = useSound((s) => s.playPreset)
  const stopSound = useSound((s) => s.stop)
  const setVolume = useSound((s) => s.setVolume)

  const pages: readonly Page[] = unlocked ? BASE_PAGES : [...BASE_PAGES, 'ready']
  const setupPages: readonly Page[] = pages.slice(SETUP_START)

  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  /** The page whose answers are fading out under the new ones. */
  const [leaving, setLeaving] = useState<Page | null>(null)
  const [name, setName] = useState(savedName)
  const [profile, setProfile] = useState<SleepProfile>(savedProfile ?? { ...EMPTY_PROFILE, volume })
  const [answered, setAnswered] = useState(Boolean(savedProfile))
  const [scienceOpen, setScienceOpen] = useState(false)
  /** Onboarding's own mute: only the tour sounds; samples on the listening page still play. */
  const [muted, setMuted] = useState(false)
  /** The sample chosen on the listening page, carried seamlessly into Play & Sounds. */
  const [pickedSample, setPickedSample] = useState<string | null>(null)
  const [unlockNote, setUnlockNote] = useState<string | null>(null)
  const finishingRef = useRef(false)
  const safeIndex = Math.min(index, pages.length - 1)
  const page = pages[safeIndex]!
  const inSetup = safeIndex >= SETUP_START

  // Refresh StoreKit price once they reach the final tier-explainer step.
  useEffect(() => {
    if (page !== 'ready') return
    setUnlockNote(null)
    void useUnlock.getState().check()
  }, [page])

  // If an out-of-band approval (Ask to Buy / foreground sync) unlocks while on
  // the final tier-explainer step, enter the app instead of stepping back to `name`.
  const wasOnReadyRef = useRef(false)
  useEffect(() => {
    if (page === 'ready') {
      wasOnReadyRef.current = true
      return
    }
    if (wasOnReadyRef.current && unlocked && !finishingRef.current) {
      wasOnReadyRef.current = false
      finish()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, unlocked])

  // The page's sound fades in as the page arrives and crossfades to the next.
  useEffect(() => {
    if (finishingRef.current) return
    const st = useSound.getState()
    if (page === 'listen') {
      // Quiet, so the samples they try are heard on their own.
      if (st.playing && !(Object.values(LISTEN_SAMPLES) as string[]).includes(st.presetId ?? '')) st.stop(1.2)
      return
    }
    // Keep the sound they picked on Listen playing through the final steps into the app.
    if ((page === 'name' || page === 'ready') && pickedSample) {
      if (!muted && (!st.playing || st.presetId !== pickedSample)) st.playPreset(pickedSample, 0)
      return
    }
    if (muted) return
    const id = fallbackFreePreset(PAGE_SCENE[page], unlocked)
    if (!st.playing || st.presetId !== id) st.playPreset(id, 0)
  }, [page, muted, unlocked, pickedSample])

  const toggleMuted = () => {
    tap()
    // Unmuting plays the page's sound again through the effect above.
    if (!muted && page !== 'listen') stopSound(0.8)
    setMuted(!muted)
  }

  // Leaving: the page fades & settles gently before Play cascades in.
  const frameOpacity = useSharedValue(1)
  const frameScale = useSharedValue(1)
  const frameStyle = useAnimatedStyle(() => ({
    opacity: frameOpacity.get(),
    transform: [{ scale: frameScale.get() }],
  }))

  /** Answers and page turns tick; finishing onboarding is the one commit. */
  const tap = (kind: 'tick' | 'commit' = 'tick') => feel(kind)
  const update = (patch: Partial<SleepProfile>) => {
    setAnswered(true)
    setProfile((p) => ({ ...p, ...patch }))
  }

  const finish = () => {
    if (finishingRef.current) return
    finishingRef.current = true
    tap('commit')
    const st = useSound.getState()
    const chosenPlaying = pickedSample !== null && st.playing && st.presetId === pickedSample
    if (chosenPlaying) {
      // Carry the sound they picked straight into Play & Sounds with their sleep timer.
      st.setTimer(useSettings.getState().sleepTimer)
    } else if (st.playing) {
      // Fade out onboarding's background tour sound cleanly when no sample was kept.
      stopSound(0.35)
    }
    const final = { ...profile, volume: useSound.getState().volume }
    // Play's first prompts wait until the change of screen has settled.
    holdPrompts(2500)
    // How far they went and what they turned on; never their answers or name.
    startEvent('onboarding', { page: safeIndex, answered, reminders: useSettings.getState().reminders, named: name.trim().length > 0 }).end()
    const nextPreset = chosenPlaying
      ? pickedSample
      : answered
        ? fallbackFreePreset(profileSound(final), isAppUnlocked())
        : undefined
    set({
      onboarded: true,
      onboardedNight: nightKey(new Date()),
      userName: name.trim(),
      ...(nextPreset ? { sessionPreset: nextPreset } : null),
      // Answers set the starting point: games, difficulty, sounds, wind-down length.
      ...(answered
        ? {
            profile: final,
            defaultDifficulty: profileDifficulty(final),
            sessionMinutes: profileWindDownMinutes(final),
          }
        : null),
    })
    // Only asks iOS if they turned the reminder on themselves (Skip never asks).
    if (useSettings.getState().reminders) void planRemindersNow({ ask: true })
    if (reduced) {
      router.replace('/')
      return
    }
    frameOpacity.set(withTiming(0, { duration: 280, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
    frameScale.set(withTiming(0.97, { duration: 280, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
    setTimeout(() => router.replace('/'), 260)
  }

  const buyFromOnboarding = async () => {
    if (unlockBusy) return
    tap('commit')
    setUnlockNote(null)
    const res = await useUnlock.getState().buy()
    if (res === 'bought') {
      finish()
      return
    }
    if (res === 'pending') setUnlockNote(paywallCopy.pending)
    else if (res === 'failed') setUnlockNote(useUnlock.getState().unreachable ? paywallCopy.unreachable : paywallCopy.failed)
  }

  const restoreFromOnboarding = async () => {
    if (unlockBusy) return
    setUnlockNote(null)
    const owned = await useUnlock.getState().restore()
    if (owned === true) {
      finish()
      return
    }
    if (owned === null) setUnlockNote(paywallCopy.unreachable)
    else setUnlockNote(paywallCopy.nothingToRestore)
  }

  const go = (to: number) => {
    tap()
    const target = Math.max(0, Math.min(pages.length - 1, to))
    if (target === safeIndex) return
    setDir(to > safeIndex ? 1 : -1)
    if (!reduced) setLeaving(page)
    setIndex(target)
  }
  const next = () => (safeIndex === pages.length - 1 ? finish() : go(safeIndex + 1))
  const skip = () => (inSetup ? finish() : go(SETUP_START))


  const toggleFactor = (f: SleepFactor) => {
    tap()
    update({ factors: profile.factors.includes(f) ? profile.factors.filter((x) => x !== f) : [...profile.factors, f] })
  }
  const toggleHabit = (h: PhoneHabit) => {
    tap()
    update({ habits: profile.habits.includes(h) ? profile.habits.filter((x) => x !== h) : [...profile.habits, h] })
  }

  const sampleLive = (f: SoundFamily) => playing && presetId === LISTEN_SAMPLES[f]
  const toggleSample = (f: SoundFamily) => {
    tap()
    if (sampleLive(f)) {
      setPickedSample(null)
      stopSound(0.6)
    } else {
      const id = LISTEN_SAMPLES[f]
      setPickedSample(id)
      playPreset(id, 0)
    }
  }
  const rate = (f: SoundFamily, v: 1 | -1) => {
    tap()
    const liked = { ...profile.liked }
    if (liked[f] === v) delete liked[f]
    else liked[f] = v
    update({ liked })
  }

  const mindStage = (p: number) => copy.mind.stages[Math.min(copy.mind.stages.length - 1, Math.floor(p * copy.mind.stages.length))]!
  const listening = FAMILIES.find(sampleLive)
  const scene =
    page === 'listen' && listening
      ? LISTEN_SAMPLES[listening]
      : (page === 'name' || page === 'ready') && pickedSample
        ? pickedSample
        : PAGE_SCENE[page]
  const button =
    page === 'intro'
      ? copy.intro.button
      : page === 'science'
        ? copy.science.button
        : page === 'name'
          ? unlocked
            ? copy.name.button
            : copy.continue
          : copy.continue
  const inDevPreview = canPreviewFreeTier && devPreviewFree
  // The question sits at the same height on every page, a little below the
  // dots; the answers follow right under it (the intro is the one centred page).
  const titleTop = Math.round(height * 0.045)

  /** One page's answers. Rendered for the page arriving, and for the one fading out under it. */
  const renderAnswers = (pg: Page) => (
    <>
              {pg === 'intro' ? (
                <View style={styles.introWrap}>
                  <Rise delay={itemDelay(0)} reduced={reduced} style={styles.center}>
                    <FloatingLens reduced={reduced} />
                  </Rise>
                  <Rise delay={itemDelay(2)} reduced={reduced} style={styles.introCopy}>
                    <Text style={[styles.brandName, { color: color.ink }]} accessibilityRole="header">
                      {copy.intro.name}
                    </Text>
                    <Text style={[styles.tagline, { color: color.ink }]}>{copy.intro.tagline}</Text>
                    <Text style={[styles.subline, { color: color.ink2 }]}>{copy.intro.subline}</Text>
                    {unlocked ? null : <Text style={[styles.note, styles.oneTime, { color: color.ink3 }]}>{copy.intro.oneTime}</Text>}
                  </Rise>
                </View>
              ) : null}

              {pg === 'science' ? (
                <View style={styles.scienceStack}>
                  <Rise delay={itemDelay(0)} reduced={reduced}>
                    <DescentCurve draw={!reduced} />
                  </Rise>
                  {copy.science.pillars.map((pillar, i) => {
                    const tint = PILLAR_TINT[pillar.key]
                    return (
                      <Rise key={pillar.key} delay={itemDelay(i + 1)} reduced={reduced}>
                        <View>
                          <PillarGlow id={pillar.key} tint={tint.glow} delay={i * 900} reduced={reduced} />
                          <GlassSurface variant="card" radius={18} style={styles.pillarCard}>
                            <View style={[styles.pillarBadge, { backgroundColor: tint.wash, borderColor: tint.edge }]}>
                              <PillarIcon pillar={pillar.key} size={17} color={tint.ink} />
                            </View>
                            <View style={styles.fill}>
                              <Text style={[styles.pillarTitle, { color: tint.ink }]}>{pillar.title}</Text>
                              <Text style={[styles.pillarBody, { color: color.ink }]}>{pillar.body}</Text>
                            </View>
                          </GlassSurface>
                        </View>
                      </Rise>
                    )
                  })}
                  <Rise delay={itemDelay(copy.science.pillars.length + 1)} reduced={reduced}>
                    <ScienceLink
                      label={`${copy.science.more} ›`}
                      onPress={() => {
                        setScienceOpen(true)
                      }}
                    />
                  </Rise>
                </View>
              ) : null}

              {pg === 'bedtime' ? (
                <View style={styles.stack}>
                  <Rise delay={itemDelay(0)} reduced={reduced}>
                    <SleepAround
                      schedule={schedule}
                      onChange={(patch) => setSchedule({ ...patch, enabled: true })}
                    />
                  </Rise>
                  <Rise delay={itemDelay(1)} reduced={reduced} style={styles.reminder}>
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
                  <View style={{ marginHorizontal: -(sideMargin + 4) }}>
                    <MindTangle busy={profile.mind} reduced={reduced} height={Math.round(Math.min(190, Math.max(120, height * 0.19)))} />
                  </View>
                  <PillSlider
                    fillColors={[MIND_CALM_FILL, MIND_BUSY_FILL]}
                    value={profile.mind}
                    onChange={(v) => update({ mind: v })}
                    title={copy.mind.label}
                    valueLabel={mindStage}
                    left={<Moon size={16} strokeWidth={1.65} color={color.ink3} />}
                    right={<Waves size={17} strokeWidth={1.65} color={color.accent} />}
                  />
                </Rise>
              ) : null}

              {pg === 'habits' ? (
                <View style={styles.habitList}>
                  {PHONE_HABITS.map((h, i) => {
                    const on = profile.habits.includes(h)
                    const Icon = HABIT_ICON[h]
                    return (
                      <Rise key={h} delay={itemDelay(i)} reduced={reduced}>
                        <Pressable
                          onPress={() => toggleHabit(h)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]}
                        >
                          <GlassSurface variant="card" radius={16} accent={on} interactive style={styles.habitRow}>
                            <Icon size={18} strokeWidth={1.7} color={on ? color.accent : color.ink2} />
                            <Text style={[styles.habitText, { color: on ? color.ink : color.ink2 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                              {copy.habits.habits[h]}
                            </Text>
                            <View style={[styles.check, { borderColor: on ? color.accent : color.line, backgroundColor: on ? color.accent : 'transparent' }]}>
                              {on ? <Check size={13} strokeWidth={2.6} color={color.accentInk} /> : null}
                            </View>
                          </GlassSurface>
                        </Pressable>
                      </Rise>
                    )
                  })}
                  <Rise delay={itemDelay(PHONE_HABITS.length)} reduced={reduced} style={styles.privacy}>
                    <Lock size={13} strokeWidth={1.8} color={color.ink3} />
                    <Text style={[styles.privacyText, { color: color.ink3 }]}>{copy.habits.note}</Text>
                  </Rise>
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
                      onSubmitEditing={next}
                      style={[styles.input, { color: color.ink }]}
                      accessibilityLabel={copy.name.placeholder}
                    />
                  </GlassSurface>
                  <Text style={[styles.note, { color: color.ink3 }]}>{copy.name.note}</Text>
                  <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_URL)} hitSlop={10}>
                    <Text style={[styles.note, styles.link, { color: color.ink2 }]}>{copy.name.privacy}</Text>
                  </Pressable>
                </Rise>
              ) : null}

              {pg === 'ready' ? (
                <View style={styles.readyStack}>
                  <Rise delay={itemDelay(0)} reduced={reduced}>
                    <GlassSurface variant="card" radius={18} style={styles.freeCard}>
                      <View style={styles.freeHead}>
                        <View style={styles.freeCheck}>
                          <Check size={12} strokeWidth={2.6} color="#7CE0B0" />
                        </View>
                        <Text style={[styles.freeHeading, { color: color.ink }]}>{copy.ready.freeHeading}</Text>
                      </View>
                      <Text style={[styles.freeSummary, { color: color.ink2 }]}>{copy.ready.freeSummary}</Text>
                    </GlassSurface>
                  </Rise>
                  <Rise delay={itemDelay(1)} reduced={reduced} style={styles.readySection}>
                    <Text style={[styles.readyKicker, { color: UPGRADE_INK }]}>{copy.ready.unlockHeading}</Text>
                    <UnlockFeatureStack compact />
                  </Rise>
                  <Rise delay={itemDelay(2)} reduced={reduced}>
                    <TrustPillGrid />
                  </Rise>
                  {unlockFamily ? (
                    <View style={styles.readyFamily}>
                      <Users size={13} strokeWidth={1.8} color={UPGRADE_INK} />
                      <Text style={[styles.readySubNote, { color: color.ink3 }]}>{paywallCopy.familySharing}</Text>
                    </View>
                  ) : null}
                  {inDevPreview ? (
                    <Text style={[styles.readySubNote, styles.readyCenter, { color: UPGRADE_INK }]}>
                      {paywallCopy.devPreviewNote}
                    </Text>
                  ) : null}
                  {unlockNote || (unlockUnreachable && !unlockPrice && !unlockLoading && !inDevPreview) ? (
                    <View style={styles.readyStatusWrap}>
                      <Text accessibilityLiveRegion="polite" style={[styles.readySubNote, styles.readyCenter, { color: color.ink2 }]}>
                        {unlockNote ?? paywallCopy.unreachable}
                      </Text>
                      {unlockUnreachable && !unlockPrice && !unlockLoading && !inDevPreview ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            setUnlockNote(null)
                            void useUnlock.getState().check()
                          }}
                          hitSlop={8}
                        >
                          <Text style={[styles.readyRetry, { color: UPGRADE_INK }]}>{paywallCopy.retry}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}
    </>
  )

  return (
    <View style={styles.root}>
      <AmbientBackdrop presetId={scene} />
      <EdgeSwipeBack onBack={() => go(safeIndex - 1)} enabled={safeIndex > 0}>
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
              onPress={() => go(safeIndex - 1)}
              disabled={safeIndex === 0}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={copy.back}
              style={[styles.backBtn, { opacity: safeIndex === 0 ? 0 : 1 }]}
            >
              <ChevronLeft size={22} strokeWidth={1.8} color={color.ink2} />
            </Pressable>
            {inSetup ? (
              <View style={styles.dots} accessibilityLabel={`Step ${safeIndex - SETUP_START + 1} of ${setupPages.length}`}>
                {setupPages.map((p, i) => (
                  <StepDot key={p} active={i === safeIndex - SETUP_START} accent={color.accent} reduced={reduced} />
                ))}
              </View>
            ) : (
              <View style={styles.dots} />
            )}
            <Pressable
              onPress={toggleMuted}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={muted ? copy.unmute : copy.mute}
              style={[styles.backBtn, styles.muteBtn]}
            >
              {muted ? (
                <VolumeX size={20} strokeWidth={1.7} color={color.ink3} />
              ) : (
                <Volume2 size={20} strokeWidth={1.7} color={color.ink2} />
              )}
            </Pressable>
          </View>

          <HandoffTitle
            text={copy[page].title}
            dir={dir}
            reduced={reduced}
            style={[styles.titleBox, { marginTop: titleTop, height: TITLE_BOX * Math.min(TITLE_MAX_SCALE, Math.max(1, fontScale)) }]}
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
                {/* Scrolls when large text or a short window (iPad Split View) needs more room. */}
                <FitScroll
                  bleed={pg === 'mind'}
                  contentContainerStyle={[styles.answerScroll, pg === 'intro' ? styles.answerCentred : null]}
                >
                  {renderAnswers(pg)}
                </FitScroll>
              </AnswerLayer>
            ))}
          </View>
          {/* Same place on every page; the final tier-explainer gives two equal, honest choices. */}
          {page === 'ready' ? (
            <View style={styles.readyFooter}>
              <Button
                variant="upgrade"
                block
                disabled={unlockBusy !== null || unlockLoading || !unlockPrice}
                onPress={() => void buyFromOnboarding()}
              >
                {unlockBusy === 'buy' || (unlockLoading && !unlockPrice) ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  paywallCopy.cta(unlockPrice)
                )}
              </Button>
              <Button variant="quiet" block onPress={finish}>
                {copy.ready.startFree}
              </Button>
              <Pressable
                accessibilityRole="button"
                disabled={unlockBusy !== null}
                onPress={() => void restoreFromOnboarding()}
                hitSlop={8}
                style={styles.restoreLink}
              >
                <Text style={[styles.restoreLinkText, { color: color.ink3 }]}>
                  {unlockBusy === 'restore' ? '…' : paywallCopy.restore}
                </Text>
              </Pressable>
            </View>
          ) : (
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
          )}
        </Animated.View>
      </KeyboardAvoidingView>
      </EdgeSwipeBack>
      <ScienceSheet open={scienceOpen} onClose={() => setScienceOpen(false)} />
    </View>
  )
}

/**
 * Scrolls only when its content doesn't fit, so the bedtime wheel and the
 * sliders keep their own gestures on a normal screen.
 */
function FitScroll({
  bleed = false,
  contentContainerStyle,
  children,
}: {
  bleed?: boolean
  contentContainerStyle: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const [box, setBox] = useState(0)
  const [content, setContent] = useState(0)
  return (
    <ScrollView
      bounces={false}
      scrollEnabled={content > box + 1}
      showsVerticalScrollIndicator={content > box + 1}
      keyboardShouldPersistTaps="handled"
      style={bleed ? { overflow: 'visible' } : undefined}
      onLayout={(e) => setBox(e.nativeEvent.layout.height)}
      onContentSizeChange={(_, h) => setContent(h)}
      contentContainerStyle={contentContainerStyle}
    >
      {children}
    </ScrollView>
  )
}

/** The intro's mark in a glass lens over twilight indigo, drifting gently. */
function FloatingLens({ reduced }: { reduced: boolean }) {
  const covered = useCovered()
  const time = useAmbientTime(!reduced && !covered)
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -4 + 8 * swing(time.get(), 8.4) }] }))
  return (
    <Animated.View style={style}>
      <GlassLens size={164} bounce="#9D8DF7" light="#F2DFB6">
        <InvernaMark size={104} draw={!reduced} delay={280} duration={1500} />
      </GlassLens>
    </Animated.View>
  )
}

/**
 * Each pillar has its own colour, glowing behind its glass card: violet for
 * attention, sea blue for sound, ember for light. The glows breathe slowly,
 * out of step with each other, so the page feels alive without moving much.
 */
const PILLAR_TINT: Record<SciencePillarKey, { glow: string; wash: string; edge: string; ink: string }> = {
  attention: { glow: '#8E7CFF', wash: 'rgba(142, 124, 255, 0.20)', edge: 'rgba(142, 124, 255, 0.45)', ink: '#C7BDFF' },
  sound: { glow: '#3FB8C9', wash: 'rgba(63, 184, 201, 0.18)', edge: 'rgba(63, 184, 201, 0.45)', ink: '#9EE3EC' },
  light: { glow: '#F09A45', wash: 'rgba(240, 154, 69, 0.20)', edge: 'rgba(240, 154, 69, 0.45)', ink: '#FFC98F' },
}

function PillarGlow({ id, tint, delay, reduced }: { id: string; tint: string; delay: number; reduced: boolean }) {
  const covered = useCovered()
  const time = useAmbientTime(!reduced && !covered)
  const style = useAnimatedStyle(() => {
    const breath = reduced ? 0.6 : swing(time.get(), 6.4, -delay / 1000)
    return { opacity: 0.5 + 0.5 * breath, transform: [{ scaleX: 0.97 + 0.05 * breath }] }
  })
  return (
    <Animated.View pointerEvents="none" style={[styles.pillarGlow, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={`glow-${id}`} cx="18%" cy="50%" rx="62%" ry="85%">
            <Stop offset="0" stopColor={tint} stopOpacity="0.62" />
            <Stop offset="0.55" stopColor={tint} stopOpacity="0.16" />
            <Stop offset="1" stopColor={tint} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#glow-${id})`} />
      </Svg>
    </Animated.View>
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
  muteBtn: {
    alignItems: 'flex-end',
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
  },
  answerScroll: {
    flexGrow: 1,
    paddingTop: 28,
    paddingBottom: 12,
    justifyContent: 'flex-start',
  },
  answerCentred: {
    paddingTop: 0,
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
  },
  introWrap: {
    alignItems: 'center',
    gap: 30,
    paddingHorizontal: 8,
  },
  introCopy: {
    alignItems: 'center',
    gap: 10,
  },
  brandName: {
    fontSize: 40,
    fontWeight: '600',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 20,
    fontWeight: '500',
    letterSpacing: -0.3,
    textAlign: 'center',
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
  // Inside the card's rounded shape: the gradient's edge used to show as a
  // hard rectangle running out past the card (NAT-01).
  pillarGlow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  pillarBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillarTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  pillarBody: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 1,
  },
  stack: {
    gap: 14,
  },
  reminder: {
    marginTop: 10,
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
  habitList: {
    gap: 8,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    height: 50,
  },
  habitText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
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
  link: {
    textDecorationLine: 'underline',
  },
  oneTime: {
    marginLeft: 0,
    marginTop: 6,
    textAlign: 'center',
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
  readyStack: {
    gap: 12,
  },
  freeCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  freeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  freeCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(82, 204, 146, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(82, 204, 146, 0.36)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  freeHeading: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  freeSummary: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  readySection: {
    gap: 8,
  },
  readyKicker: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 2,
  },
  readyFamily: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  readySubNote: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  readyCenter: {
    textAlign: 'center',
  },
  readyStatusWrap: {
    alignItems: 'center',
    gap: 4,
  },
  readyRetry: {
    fontSize: 13,
    fontWeight: '600',
  },
  readyFooter: {
    gap: 8,
    paddingTop: 10,
  },
  restoreLink: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
  restoreLinkText: {
    fontSize: 13,
  },
})
