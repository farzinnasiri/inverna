import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { router } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { eveningState } from '@/core/evening'
import { formatBedtime12h, RIBBON_SPAN_MIN, ribbonBedtime, ribbonOffset } from '@/core/night'
import { DEFAULT_PRESET_ID, PRESETS } from '@/core/sound/catalog'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { onboarding as copy } from '@/ui/copy'
import { currentSchedule, useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { AmbientBackdrop } from './AmbientBackdrop'
import { Button, FRAME_MAX_WIDTH, Toggle } from './controls'
import { GlassSurface } from './Glass'
import { useReducedMotion, useResponsiveLayout } from './hooks'
import { LullMark } from './LullMark'
import { NightRibbon } from './NightRibbon'
import { SoundGlyph } from './SoundGlyph'
import { planRemindersNow } from './reminders'

type Page = 'intro' | 'bedtime' | 'sound' | 'name'
const PAGES: readonly Page[] = ['intro', 'bedtime', 'sound', 'name']

/** Each page shows off a different scene; the sound page shows the sound you pick. */
const PAGE_SCENE: Record<Exclude<Page, 'sound'>, string> = {
  intro: 'starfield',
  bedtime: 'nocturne',
  name: 'hearth',
}

const NIGHT_SOUNDS = PRESETS.filter((p) => p.page === 0)

/**
 * First run: Lull introduces itself, then asks three things and fits itself
 * around the answers (bedtime and reminder, sound, first name).
 *
 * Every page has the same frame so the thumb never hunts: progress at the top,
 * the question at the same height, and Skip + the main button in the same
 * place at the bottom. The live backdrop changes scene from page to page.
 */
export function Onboarding() {
  const { color } = useTokenColors()
  const { height, insets, sideMargin } = useResponsiveLayout()
  const reduced = useReducedMotion()

  const schedule = useSettings((s) => s.schedule)
  const reminders = useSettings((s) => s.reminders)
  const sessionPreset = useSettings((s) => s.sessionPreset)
  const savedName = useSettings((s) => s.userName)
  const hapticsOn = useSettings((s) => s.haptics)
  const set = useSettings((s) => s.set)
  const setSchedule = useSettings((s) => s.setSchedule)

  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const playPreset = useSound((s) => s.playPreset)
  const stopSound = useSound((s) => s.stop)

  const [index, setIndex] = useState(0)
  const [name, setName] = useState(savedName)
  const page = PAGES[index]!

  const tap = (kind: 'light' | 'selection' | 'medium' = 'light') => {
    if (hapticsOn) haptics.play(kind)
  }

  const finish = () => {
    tap('medium')
    // A sound picked here keeps playing only if it's time for bed anyway.
    const kind = eveningState(currentSchedule(), new Date()).kind
    if (useSound.getState().playing && kind !== 'winding' && kind !== 'past') stopSound(1.2)
    set({ onboarded: true, userName: name.trim() })
    if (useSettings.getState().reminders) void planRemindersNow({ ask: true })
    router.replace('/')
  }

  const next = () => {
    if (index === PAGES.length - 1) return finish()
    tap()
    setIndex(index + 1)
  }

  const back = () => {
    tap()
    setIndex(Math.max(0, index - 1))
  }

  // Bedtime ribbon covers 8 PM to 3 AM; Settings has the full wheel.
  const offset = Math.max(0, Math.min(RIBBON_SPAN_MIN, ribbonOffset(schedule.bedtime)))
  const setBedtime = (o: number) => {
    tap('selection')
    setSchedule({ bedtime: ribbonBedtime(o), enabled: true })
  }

  const chosenSound = playing && presetId ? presetId : (sessionPreset ?? DEFAULT_PRESET_ID)
  const pickSound = (id: string) => {
    tap('selection')
    if (playing && presetId === id) {
      stopSound(0.6)
      return
    }
    set({ sessionPreset: id })
    playPreset(id)
  }

  const scene = page === 'sound' ? chosenSound : PAGE_SCENE[page]
  const pageCopy = copy[page]
  const button = pageCopy.button
  // The question sits at the same height on every page.
  const questionTop = Math.round(height * 0.12)

  return (
    <View style={styles.root}>
      <AmbientBackdrop presetId={scene} />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={[
            styles.frame,
            { paddingTop: insets.top + 6, paddingBottom: Math.max(insets.bottom, 16) + 8, paddingHorizontal: sideMargin + 4 },
          ]}
        >
          <View style={styles.top}>
            <Pressable
              onPress={back}
              disabled={index === 0}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={copy.back}
              style={[styles.backBtn, { opacity: index === 0 ? 0 : 1 }]}
            >
              <ChevronLeft size={22} strokeWidth={1.8} color={color.ink2} />
            </Pressable>
            <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${PAGES.length}`}>
              {PAGES.map((p, i) => (
                <View
                  key={p}
                  style={[
                    styles.dot,
                    { width: i === index ? 18 : 6, backgroundColor: i === index ? color.accent : 'rgba(255,255,255,0.26)' },
                  ]}
                />
              ))}
            </View>
            <View style={styles.backBtn} />
          </View>

          <Animated.View
            key={page}
            entering={reduced ? undefined : FadeIn.duration(360).delay(80)}
            exiting={reduced ? undefined : FadeOut.duration(160)}
            style={[styles.body, { paddingTop: questionTop }]}
          >
            {page === 'intro' ? (
              <View style={styles.markWrap}>
                <LullMark size={132} draw={!reduced} delay={250} />
              </View>
            ) : null}

            <Text style={[styles.title, { color: color.ink }]}>{pageCopy.title}</Text>
            <Text style={[styles.text, { color: color.ink2 }]}>{pageCopy.body}</Text>

            {page === 'bedtime' ? (
              <View style={styles.block}>
                <Text style={[styles.time, { color: color.ink }]} accessibilityLiveRegion="polite">
                  {formatBedtime12h(schedule.bedtime)}
                </Text>
                <NightRibbon offset={offset} spanFrom={offset - schedule.leadMinutes} onChange={setBedtime} />
                <GlassSurface variant="card" radius={18} style={styles.reminderRow}>
                  <View style={styles.fill}>
                    <Text style={[styles.reminderText, { color: color.ink }]}>{copy.bedtime.reminder}</Text>
                    <Text style={[styles.note, { color: color.ink3 }]}>{copy.bedtime.reminderNote}</Text>
                  </View>
                  <Toggle label={copy.bedtime.reminder} checked={reminders} onChange={(v) => set({ reminders: v })} />
                </GlassSurface>
              </View>
            ) : null}

            {page === 'sound' ? (
              <View style={[styles.block, styles.grid]}>
                {NIGHT_SOUNDS.map((p) => {
                  const on = chosenSound === p.id
                  const live = playing && presetId === p.id
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => pickSound(p.id)}
                      accessibilityRole="button"
                      accessibilityLabel={live ? `Stop ${p.name}` : `Listen to ${p.name}`}
                      style={({ pressed }) => [styles.cell, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                    >
                      <GlassSurface variant="card" radius={18} accent={on} interactive style={styles.soundTile}>
                        <SoundGlyph icon={p.icon} size={22} color={on ? color.accent : color.ink2} />
                        <Text style={[styles.soundName, { color: on ? color.ink : color.ink2 }]} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={[styles.soundHint, { color: color.ink3 }]} numberOfLines={1}>
                          {live ? copy.sound.playing : p.hint}
                        </Text>
                      </GlassSurface>
                    </Pressable>
                  )
                })}
              </View>
            ) : null}

            {page === 'name' ? (
              <View style={styles.block}>
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
                <Text style={[styles.note, styles.nameNote, { color: color.ink3 }]}>{copy.name.note}</Text>
              </View>
            ) : null}
          </Animated.View>

          {/* Same place on every page: skip on the left, the main action on the right. */}
          <View style={styles.footer}>
            <Button variant="ghost" onPress={finish} style={styles.skip}>
              {copy.skip}
            </Button>
            <View style={styles.fill}>
              <Button variant="primary" block onPress={next}>
                {button}
              </Button>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
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
  body: {
    flex: 1,
  },
  markWrap: {
    marginBottom: 12,
    marginLeft: -16,
  },
  title: {
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: -0.6,
    lineHeight: 36,
  },
  text: {
    fontSize: 17,
    lineHeight: 24,
    marginTop: 10,
  },
  block: {
    marginTop: 28,
  },
  time: {
    fontSize: 48,
    fontWeight: '200',
    letterSpacing: -1.4,
    fontVariant: ['tabular-nums'],
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 14,
  },
  reminderText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  note: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  nameNote: {
    marginTop: 10,
    marginLeft: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cell: {
    width: '47%',
    flexGrow: 1,
  },
  soundTile: {
    padding: 14,
    gap: 4,
    height: 96,
    justifyContent: 'center',
  },
  soundName: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 6,
  },
  soundHint: {
    fontSize: 12.5,
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
