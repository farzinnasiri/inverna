import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  Activity,
  Armchair,
  BatteryLow,
  Bed,
  Brain,
  Clock,
  CloudLightning,
  Eye,
  Frown,
  Leaf,
  Moon,
  Pause,
  Play,
  Sun,
  type LucideIcon,
} from 'lucide-react-native'
import Animated from 'react-native-reanimated'
import { nightKey } from '@/core/night'
import { feel } from '@/ui/feel'
import { presetById } from '@/core/sound/catalog'
import { DAY_ANSWERS, NOW_ANSWERS, planTonight, type DayAnswer, type NowAnswer } from '@/core/tonight'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { checkIn as copy, soundsHelp } from '@/ui/copy'
import { useNav } from '@/ui/state/nav'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { Button, Sheet } from './controls'
import { GlassSurface } from './Glass'
import { useReducedMotion } from './hooks'
import { HandoffTitle, itemDelay, Rise } from './motion'
import { SoundGlyph } from './SoundGlyph'

type Step = 'day' | 'now' | 'result'

/** Every answer gets a picture as well as a word. */
const DAY_ICON: Record<DayAnswer, LucideIcon> = {
  good: Sun,
  calm: Leaf,
  busy: Clock,
  stressful: CloudLightning,
  exhausting: BatteryLow,
  sad: Frown,
}
const NOW_ICON: Record<NowAnswer, LucideIcon> = {
  sleepy: Moon,
  relaxed: Armchair,
  worn_out: Bed,
  overthinking: Brain,
  wide_awake: Eye,
  restless: Activity,
}

/**
 * Two plain questions near bedtime: how was your day, how do you feel now.
 * Inverna decides the rest (which games lead, which sound) and shows two sounds
 * to try. Opened automatically on Play near bedtime, from a reminder, or from
 * "Help me pick a sound" on Sounds. One complete question per step, nothing
 * around it; six answers each, so the grid is even.
 */
export function NightCheckIn() {
  const { color } = useTokenColors()
  const reduced = useReducedMotion()
  const mode = useNav((s) => s.checkIn)
  const setMode = useNav((s) => s.setCheckIn)
  const set = useSettings((s) => s.set)
  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const playPreset = useSound((s) => s.playPreset)
  const stopSound = useSound((s) => s.stop)

  const [step, setStep] = useState<Step>('day')
  const [day, setDay] = useState<DayAnswer | null>(null)
  const [now, setNow] = useState<NowAnswer | null>(null)
  const [suggested, setSuggested] = useState<readonly string[]>([])

  useEffect(() => {
    if (!mode) return
    setStep('day')
    setDay(null)
    setNow(null)
    setSuggested([])
  }, [mode])

  const tap = () => feel('tick')

  const close = () => {
    // Asked once a night, answered or not.
    if (mode === 'tonight') set({ checkInAskedNight: nightKey(new Date()) })
    setMode(null)
  }

  const pickDay = (d: DayAnswer) => {
    tap()
    setDay(d)
    setStep('now')
  }

  const pickNow = (n: NowAnswer) => {
    tap()
    const plan = planTonight(day ?? 'calm', n)
    setNow(n)
    set({
      tonightDay: day ?? 'calm',
      tonightNow: n,
      tonightIntent: plan.intent,
      checkInAskedNight: nightKey(new Date()),
      checkInAnsweredNight: nightKey(new Date()),
      // Tonight's sound, unless one is already playing.
      ...(useSound.getState().playing ? null : { sessionPreset: plan.sounds[0] }),
    })
    setSuggested(plan.sounds)
    setStep('result')
  }

  const toggleSound = (id: string) => {
    tap()
    if (playing && presetId === id) {
      stopSound(0.6)
      return
    }
    set({ sessionPreset: id })
    playPreset(id)
  }

  const options =
    step === 'day'
      ? DAY_ANSWERS.map((id) => ({ id, label: copy.day[id], Icon: DAY_ICON[id], picked: day === id, onPress: () => pickDay(id) }))
      : NOW_ANSWERS.map((id) => ({ id, label: copy.now[id], Icon: NOW_ICON[id], picked: now === id, onPress: () => pickNow(id) }))

  return (
    <Sheet open={mode !== null} onClose={close} label="Check-in">
      {/* The question hands over in place: old words lift away, new ones rise. */}
      <HandoffTitle
        text={step === 'day' ? copy.dayQuestion : step === 'now' ? copy.nowQuestion : soundsHelp.heading}
        reduced={reduced}
        style={styles.titleBox}
        textStyle={[styles.title, { color: color.ink }]}
      />

      {/* Answers swap and rise in; no exit, so the old ones never sit above the new ones. */}
      <Animated.View key={step}>
        {step !== 'result' ? (
          <>
            <View style={styles.options}>
              {options.map((o, i) => (
                <Rise key={o.id} delay={itemDelay(i)} reduced={reduced} style={styles.option}>
                <Pressable
                  onPress={o.onPress}
                  accessibilityRole="button"
                  style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                >
                  <GlassSurface variant="pill" radius={20} accent={o.picked} interactive style={styles.optionPill}>
                    <o.Icon size={18} strokeWidth={1.7} color={o.picked ? color.accent : color.ink2} />
                    <Text style={[styles.optionText, { color: color.ink }]} numberOfLines={1}>
                      {o.label}
                    </Text>
                  </GlassSurface>
                </Pressable>
                </Rise>
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={styles.sounds}>
              {suggested.map((id, i) => {
                const p = presetById(id)
                if (!p) return null
                const live = playing && presetId === id
                return (
                  <Rise key={id} delay={itemDelay(i)} reduced={reduced} style={styles.soundCell}>
                  <Pressable
                    onPress={() => toggleSound(id)}
                    accessibilityRole="button"
                    accessibilityLabel={live ? `Stop ${p.name}` : `Play ${p.name}`}
                    style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                  >
                    <GlassSurface variant="card" radius={18} accent={live} interactive style={styles.soundTile}>
                      <View style={styles.soundTop}>
                        <SoundGlyph icon={p.icon} size={22} color={live ? color.accent : color.ink2} />
                        {/* Shows it plays on tap. */}
                        <View style={[styles.playDot, { borderColor: live ? color.accent : 'rgba(255,255,255,0.18)' }]}>
                          {live ? (
                            <Pause size={13} strokeWidth={2} color={color.accent} fill={color.accent} />
                          ) : (
                            <Play size={13} strokeWidth={2} color={color.ink} fill={color.ink} style={{ marginLeft: 2 }} />
                          )}
                        </View>
                      </View>
                      <Text style={[styles.soundName, { color: color.ink }]} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={[styles.soundHint, { color: color.ink3 }]} numberOfLines={1}>
                        {live ? 'Playing' : p.hint}
                      </Text>
                    </GlassSurface>
                  </Pressable>
                  </Rise>
                )
              })}
            </View>
          </>
        )}
      </Animated.View>

      <View style={styles.footer}>
        {step === 'now' ? (
          <Button variant="quiet" size="sm" onPress={() => setStep('day')}>
            {copy.back}
          </Button>
        ) : (
          <View />
        )}
        {step === 'result' ? (
          <Button variant="primary" onPress={() => setMode(null)} style={styles.done}>
            {copy.done}
          </Button>
        ) : (
          <Button variant="quiet" size="sm" onPress={close} style={styles.skip}>
            {copy.skip}
          </Button>
        )}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  titleBox: {
    height: 36,
    marginTop: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  option: {
    // Two even columns, three rows.
    width: '48%',
    flexGrow: 1,
  },
  optionPill: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  sounds: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  soundCell: {
    flex: 1,
  },
  soundTile: {
    padding: 14,
    gap: 6,
    minHeight: 108,
    justifyContent: 'center',
  },
  soundTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundName: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  soundHint: {
    fontSize: 12.5,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    minHeight: 46,
  },
  done: {
    minWidth: 120,
  },
  skip: {
    minWidth: 88,
  },
})
