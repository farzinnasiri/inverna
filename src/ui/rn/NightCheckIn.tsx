import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { CloudMoon, Feather, Sparkles, Sun, Target, Wind } from 'lucide-react-native'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useNav } from '@/ui/state/nav'
import { useSettings, type DayFeeling, type NightIntent } from '@/ui/state/settings'
import { Button, FRAME_MAX_WIDTH } from './controls'
import { GlassSurface } from './Glass'
import { Layer } from './Layer'

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)

export function todayNightKey(now = new Date()): string {
  // Evening window rolls over at 06:00 AM so 12:30 AM still belongs to "tonight".
  const shifted = new Date(now.getTime() - 6 * 3600_000)
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}`
}

const DAY_OPTIONS: readonly {
  id: DayFeeling
  title: string
  hint: string
  icon: 'heavy' | 'restless' | 'steady' | 'bright'
}[] = [
  { id: 'heavy', title: 'Heavy', hint: 'Carry less tonight', icon: 'heavy' },
  { id: 'restless', title: 'Restless', hint: 'Quiet the static', icon: 'restless' },
  { id: 'steady', title: 'Steady', hint: 'Keep an even pace', icon: 'steady' },
  { id: 'bright', title: 'Bright', hint: 'End on a high note', icon: 'bright' },
]

const INTENT_OPTIONS: readonly {
  id: NightIntent
  title: string
  hint: string
  recommendedSound: string
  icon: 'melt' | 'focus' | 'light'
}[] = [
  {
    id: 'melt',
    title: 'Melt away',
    hint: 'Pond, Hue, Lanterns · Theta rain',
    recommendedSound: 'theta-rain',
    icon: 'melt',
  },
  {
    id: 'focus',
    title: 'Quiet focus',
    hint: 'Nine, Weave, Thread · Still horizon',
    recommendedSound: 'still-horizon',
    icon: 'focus',
  },
  {
    id: 'light',
    title: 'End on a light note',
    hint: 'Settle, Ember, Cascade · Hearth & drift',
    recommendedSound: 'hearth',
    icon: 'light',
  },
]

function DayGlyph({ kind, color }: { kind: 'heavy' | 'restless' | 'steady' | 'bright'; color: string }) {
  if (kind === 'heavy') return <CloudMoon size={18} strokeWidth={1.65} color={color} />
  if (kind === 'restless') return <Wind size={18} strokeWidth={1.65} color={color} />
  if (kind === 'steady') return <Feather size={18} strokeWidth={1.65} color={color} />
  return <Sun size={18} strokeWidth={1.65} color={color} />
}

function IntentGlyph({ kind, color }: { kind: 'melt' | 'focus' | 'light'; color: string }) {
  if (kind === 'melt') return <Feather size={18} strokeWidth={1.65} color={color} />
  if (kind === 'focus') return <Target size={18} strokeWidth={1.65} color={color} />
  return <Sparkles size={18} strokeWidth={1.65} color={color} />
}

/**
 * Two-question Nightly Check-in modal ("How did today feel?" -> "How do you want to end tonight?").
 * Completing it updates tonight's mood preferences and triggers the Reanimated morphing
 * reorganization of the Home bento tiles so the best games expand and glide to the top.
 */
export function NightCheckIn() {
  const { color } = useTokenColors()
  const open = useNav((s) => s.checkInOpen)
  const setOpen = useNav((s) => s.setCheckInOpen)
  const hapticsOn = useSettings((s) => s.haptics)
  const savedDay = useSettings((s) => s.tonightDay)
  const savedIntent = useSettings((s) => s.tonightIntent)
  const setSettings = useSettings((s) => s.set)

  const [step, setStep] = useState<0 | 1>(0)
  const [day, setDay] = useState<DayFeeling | null>(savedDay)
  const [intent, setIntent] = useState<NightIntent | null>(savedIntent)

  const cardOpacity = useSharedValue(0)
  const cardScale = useSharedValue(0.95)

  useEffect(() => {
    if (open) {
      setStep(0)
      setDay(savedDay)
      setIntent(savedIntent)
      cardOpacity.set(0)
      cardScale.set(0.95)
      cardOpacity.set(withTiming(1, { duration: 220, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
      cardScale.set(withTiming(1, { duration: 260, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
    }
  }, [open, savedDay, savedIntent, cardOpacity, cardScale])

  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.get(),
    transform: [{ scale: cardScale.get() }],
  }))

  const dismiss = () => {
    setSettings({ lastCheckInDate: todayNightKey() })
    setOpen(false)
  }

  const pickDay = (d: DayFeeling) => {
    if (hapticsOn) haptics.play('light')
    setDay(d)
    setStep(1)
  }

  const pickIntent = (i: NightIntent, recommendedSound: string) => {
    if (hapticsOn) haptics.play('medium')
    setIntent(i)
    setSettings({
      tonightDay: day ?? 'steady',
      tonightIntent: i,
      sessionPreset: recommendedSound,
      lastCheckInDate: todayNightKey(),
    })
    setOpen(false)
  }

  return (
    <Layer visible={open} onRequestClose={dismiss} label="Tonight check-in">
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Dismiss check-in" />

        <Animated.View style={[styles.wrap, cardAnimStyle]}>
          <GlassSurface variant="elevated" radius={28} style={styles.card}>
            <View style={styles.stepDots}>
              {[0, 1].map((idx) => (
                <View
                  key={idx}
                  style={[
                    styles.dot,
                    {
                      width: idx === step ? 20 : 6,
                      backgroundColor: idx === step ? color.accent : 'rgba(255,255,255,0.20)',
                    },
                  ]}
                />
              ))}
            </View>

            {step === 0 ? (
              <Animated.View
                key="checkin-step-0"
                entering={FadeIn.duration(180)}
                style={styles.stepBody}
              >
                <Text style={[styles.heading, { color: color.ink }]}>How did today feel?</Text>
                <Text style={[styles.sub, { color: color.ink2 }]}>
                  Lull will arrange tonight&apos;s games and sound to match your pace.
                </Text>

                <View style={styles.grid}>
                  {DAY_OPTIONS.map((opt) => {
                    const active = day === opt.id
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => pickDay(opt.id)}
                        style={({ pressed }) => [
                          styles.gridItem,
                          {
                            opacity: pressed ? 0.85 : 1,
                            transform: [{ scale: pressed ? 0.97 : 1 }],
                          },
                        ]}
                      >
                        <GlassSurface variant="card" radius={18} accent={active} interactive style={styles.optCard}>
                          <DayGlyph kind={opt.icon} color={active ? color.accent : color.ink2} />
                          <Text style={[styles.optTitle, { color: color.ink }]}>{opt.title}</Text>
                          <Text style={[styles.optHint, { color: color.ink3 }]} numberOfLines={2}>
                            {opt.hint}
                          </Text>
                        </GlassSurface>
                      </Pressable>
                    )
                  })}
                </View>
              </Animated.View>
            ) : (
              <Animated.View
                key="checkin-step-1"
                entering={FadeIn.duration(180)}
                style={styles.stepBody}
              >
                <Text style={[styles.heading, { color: color.ink }]}>How do you want to end tonight?</Text>
                <Text style={[styles.sub, { color: color.ink2 }]}>
                  We&apos;ll bring the right games forward and keep everything else one tap below.
                </Text>

                <View style={styles.stack}>
                  {INTENT_OPTIONS.map((opt) => {
                    const active = intent === opt.id
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => pickIntent(opt.id, opt.recommendedSound)}
                        style={({ pressed }) => [
                          {
                            opacity: pressed ? 0.85 : 1,
                            transform: [{ scale: pressed ? 0.98 : 1 }],
                          },
                        ]}
                      >
                        <GlassSurface variant="card" radius={18} accent={active} interactive style={styles.intentRow}>
                          <View
                            style={[
                              styles.intentIcon,
                              { backgroundColor: active ? color.accentWash : 'rgba(255,255,255,0.06)' },
                            ]}
                          >
                            <IntentGlyph kind={opt.icon} color={active ? color.accent : color.ink2} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.optTitle, { color: color.ink }]}>{opt.title}</Text>
                            <Text style={[styles.optHint, { color: color.ink3 }]} numberOfLines={1}>
                              {opt.hint}
                            </Text>
                          </View>
                        </GlassSurface>
                      </Pressable>
                    )
                  })}
                </View>
              </Animated.View>
            )}

            <View style={styles.footer}>
              {step === 1 ? (
                <Button variant="ghost" size="sm" onPress={() => setStep(0)}>
                  Back
                </Button>
              ) : (
                <View />
              )}
              <Button variant="ghost" size="sm" onPress={dismiss}>
                Just browse
              </Button>
            </View>
          </GlassSurface>
        </Animated.View>
      </View>
    </Layer>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.76)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  wrap: {
    width: '100%',
    maxWidth: Math.min(FRAME_MAX_WIDTH - 28, 376),
  },
  card: {
    padding: 22,
    gap: 14,
  },
  stepDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    height: 5,
    borderRadius: 2.5,
  },
  stepBody: {
    gap: 12,
  },
  heading: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  sub: {
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    width: '48%',
    flexGrow: 1,
  },
  optCard: {
    padding: 14,
    gap: 6,
    minHeight: 92,
    justifyContent: 'center',
  },
  stack: {
    gap: 9,
  },
  intentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  intentIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  optHint: {
    fontSize: 12,
    marginTop: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
})
