import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { nightKey } from '@/core/night'
import { presetById } from '@/core/sound/catalog'
import { DAY_ANSWERS, NOW_ANSWERS, planTonight, type DayAnswer, type NowAnswer } from '@/core/tonight'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { checkIn as copy, soundsHelp } from '@/ui/copy'
import { useNav } from '@/ui/state/nav'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { Button, Sheet } from './controls'
import { GlassSurface } from './Glass'
import { useReducedMotion } from './hooks'
import { SoundGlyph } from './SoundGlyph'

/** The evening this moment belongs to (rolls over at 06:00). */
export function todayNightKey(now = new Date()): string {
  return nightKey(now)
}

type Step = 'day' | 'now' | 'result'

/**
 * Two plain questions near bedtime: how was your day, how do you feel now.
 * Lull decides the rest (which games lead, which sound) and shows two sounds
 * to try. Opened automatically on Play near bedtime, from a reminder, or from
 * "Not sure what to listen to?" on Sounds.
 */
export function NightCheckIn() {
  const { color } = useTokenColors()
  const reduced = useReducedMotion()
  const mode = useNav((s) => s.checkIn)
  const setMode = useNav((s) => s.setCheckIn)
  const name = useSettings((s) => s.userName)
  const hapticsOn = useSettings((s) => s.haptics)
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

  const tap = (kind: 'selection' | 'light' = 'selection') => {
    if (hapticsOn) haptics.play(kind)
  }

  const close = () => {
    // Asked once a night, answered or not.
    if (mode === 'tonight') set({ lastCheckInDate: todayNightKey() })
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
      lastCheckInDate: todayNightKey(),
      // Tonight's sound, unless one is already playing.
      ...(useSound.getState().playing ? null : { sessionPreset: plan.sounds[0] }),
    })
    setSuggested(plan.sounds)
    setStep('result')
  }

  const toggleSound = (id: string) => {
    tap('light')
    if (playing && presetId === id) {
      stopSound(0.6)
      return
    }
    set({ sessionPreset: id })
    playPreset(id)
  }

  const options =
    step === 'day'
      ? DAY_ANSWERS.map((id) => ({ id, label: copy.day[id].label, onPress: () => pickDay(id) }))
      : NOW_ANSWERS.map((id) => ({ id, label: copy.now[id].label, onPress: () => pickNow(id) }))
  // Lull answers what you said before asking the next thing.
  const kicker =
    step === 'day' ? copy.intro(name) : step === 'now' ? (day ? copy.day[day].followUp : '') : now ? copy.now[now].followUp : ''

  return (
    <Sheet open={mode !== null} onClose={close} label="Check-in">
      <Text style={[styles.kicker, { color: color.ink3 }]} numberOfLines={2}>
        {kicker}
      </Text>

      <Animated.View key={step} entering={reduced ? undefined : FadeIn.duration(200)}>
        {step !== 'result' ? (
          <>
            <Text style={[styles.title, { color: color.ink }]}>
              {step === 'day' ? copy.dayQuestion : copy.nowQuestion}
            </Text>
            <Text style={[styles.sub, { color: color.ink2 }]}>{step === 'day' ? copy.daySub : copy.nowSub}</Text>
            <View style={styles.options}>
              {options.map((o) => (
                <Pressable
                  key={o.id}
                  onPress={o.onPress}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.option, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                >
                  <GlassSurface variant="pill" radius={22} interactive style={styles.optionPill}>
                    <Text style={[styles.optionText, { color: color.ink }]}>{o.label}</Text>
                  </GlassSurface>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: color.ink }]}>{soundsHelp.heading}</Text>
            <Text style={[styles.sub, { color: color.ink2 }]}>
              {mode === 'tonight' ? `${copy.gamesReady} ${soundsHelp.sub}` : soundsHelp.sub}
            </Text>
            <View style={styles.sounds}>
              {suggested.map((id) => {
                const p = presetById(id)
                if (!p) return null
                const live = playing && presetId === id
                return (
                  <Pressable
                    key={id}
                    onPress={() => toggleSound(id)}
                    accessibilityRole="button"
                    accessibilityLabel={live ? `Stop ${p.name}` : `Play ${p.name}`}
                    style={({ pressed }) => [styles.soundCell, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                  >
                    <GlassSurface variant="card" radius={18} accent={live} interactive style={styles.soundTile}>
                      <SoundGlyph icon={p.icon} size={22} color={live ? color.accent : color.ink2} />
                      <Text style={[styles.soundName, { color: color.ink }]} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={[styles.soundHint, { color: color.ink3 }]} numberOfLines={1}>
                        {live ? 'Playing' : p.hint}
                      </Text>
                    </GlassSurface>
                  </Pressable>
                )
              })}
            </View>
          </>
        )}
      </Animated.View>

      <View style={styles.footer}>
        {step === 'now' ? (
          <Button variant="ghost" size="sm" onPress={() => setStep('day')}>
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
          <Button variant="ghost" size="sm" onPress={close}>
            {copy.skip}
          </Button>
        )}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: 14,
    lineHeight: 19,
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  sub: {
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  option: {
    flexGrow: 1,
    minWidth: '30%',
  },
  optionPill: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
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
})
