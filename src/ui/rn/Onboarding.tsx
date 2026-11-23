import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Minus, Plus } from 'lucide-react-native'
import { formatBedtimeShort, formatHHMM, parseHHMM } from '@/core/night'
import { PRESETS } from '@/core/sound/catalog'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useNav } from '@/ui/state/nav'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { ContinuePreview } from './ContinuePreview'
import { Button, FRAME_MAX_WIDTH, IconButton, LightSlider } from './controls'
import { Layer } from './Layer'

const SAMPLE_PRESETS = PRESETS.slice(0, 6)

/**
 * 3-step native onboarding: Bedtime → Light (with live board preview) → Sound (2×3 live preview grid).
 * Skippable from every step.
 */
export function Onboarding() {
  const { color } = useTokenColors()
  const insets = useSafeAreaInsets()
  const onboarded = useSettings((s) => s.onboarded)
  const replay = useNav((s) => s.onboardingReplay)
  const setReplay = useNav((s) => s.setOnboardingReplay)

  const schedule = useSettings((s) => s.schedule)
  const light = useSettings((s) => s.light)
  const set = useSettings((s) => s.set)
  const setSchedule = useSettings((s) => s.setSchedule)

  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const playPreset = useSound((s) => s.playPreset)
  const stopSound = useSound((s) => s.stop)

  const [step, setStep] = useState<0 | 1 | 2>(0)
  const visible = !onboarded || replay

  const finish = () => {
    set({ onboarded: true })
    setReplay(false)
    setStep(0)
  }

  const nudgeBedtime = (deltaMinutes: number) => {
    const { h, m } = parseHHMM(schedule.bedtime)
    const total = (h * 60 + m + deltaMinutes + 1440) % 1440
    setSchedule({ bedtime: formatHHMM(Math.floor(total / 60), total % 60) })
  }

  return (
    <Layer visible={visible} onRequestClose={finish} label="Setup Lull">
      <View
        style={[
          styles.root,
          {
            backgroundColor: color.bg,
            paddingTop: insets.top + 12,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
          },
        ]}
      >
        <View style={styles.frame}>
          <View style={styles.top}>
            <View style={styles.dots}>
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: i === step ? color.accent : color.ink4,
                      width: i === step ? 18 : 6,
                    },
                  ]}
                />
              ))}
            </View>
            <Button variant="ghost" size="sm" onPress={finish}>
              Skip
            </Button>
          </View>

          <View style={styles.center}>
            {step === 0 && (
              <View style={styles.stepWrap}>
                <Text style={[styles.heading, { color: color.ink }]}>When do you sleep?</Text>
                <View style={[styles.timeBox, { backgroundColor: color.surface1, borderColor: color.line }]}>
                  <IconButton label="Earlier 15 minutes" onPress={() => nudgeBedtime(-15)}>
                    <Minus size={22} color={color.ink2} />
                  </IconButton>
                  <Text style={[styles.bigTime, { color: color.ink }]}>
                    {formatBedtimeShort(schedule.bedtime)}
                  </Text>
                  <IconButton label="Later 15 minutes" onPress={() => nudgeBedtime(15)}>
                    <Plus size={22} color={color.ink2} />
                  </IconButton>
                </View>
                <View style={styles.quickRow}>
                  {['22:00', '23:00', '23:30', '00:30'].map((t) => {
                    const active = schedule.bedtime === t
                    return (
                      <Pressable
                        key={t}
                        onPress={() => setSchedule({ bedtime: t })}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: active ? color.surface3 : color.surface1,
                            borderColor: active ? color.accentDim : color.line,
                          },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: active ? color.ink : color.ink3 }]}>
                          {formatBedtimeShort(t)}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            )}

            {step === 1 && (
              <View style={styles.stepWrap}>
                <Text style={[styles.heading, { color: color.ink }]}>Set tonight&apos;s light</Text>
                <View style={[styles.previewCard, { backgroundColor: color.surface1, borderColor: color.line }]}>
                  <ContinuePreview id="kindle" demo size={116} />
                </View>
                <View style={{ width: '100%', marginTop: 8 }}>
                  <LightSlider value={light} onChange={(v) => set({ light: v })} />
                </View>
              </View>
            )}

            {step === 2 && (
              <View style={styles.stepWrap}>
                <Text style={[styles.heading, { color: color.ink }]}>Pick a night sound</Text>
                <View style={styles.soundGrid}>
                  {SAMPLE_PRESETS.map((p) => {
                    const active = playing && presetId === p.id
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => {
                          if (active) {
                            stopSound(0.6)
                          } else {
                            set({ sessionPreset: p.id })
                            playPreset(p.id, 30)
                          }
                        }}
                        style={[
                          styles.soundTile,
                          {
                            backgroundColor: active ? color.surface2 : color.surface1,
                            borderColor: active ? color.accent : color.line,
                          },
                        ]}
                      >
                        <Text style={[styles.soundName, { color: active ? color.ink : color.ink2 }]}>
                          {p.name}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            )}
          </View>

          <View style={styles.footer}>
            {step < 2 ? (
              <Button variant="primary" block onPress={() => setStep((s) => (s + 1) as 1 | 2)}>
                Continue
              </Button>
            ) : (
              <Button variant="primary" block onPress={finish}>
                Done
              </Button>
            )}
          </View>
        </View>
      </View>
    </Layer>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
  },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: FRAME_MAX_WIDTH,
    paddingHorizontal: 22,
    justifyContent: 'space-between',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  stepWrap: {
    alignItems: 'center',
    gap: 24,
  },
  heading: {
    fontSize: 26,
    fontWeight: '400',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  timeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 18,
    height: 82,
    borderRadius: 20,
    borderWidth: 1,
  },
  bigTime: {
    fontSize: 42,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13.5,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  previewCard: {
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
  },
  soundGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  soundTile: {
    width: '48%',
    height: 62,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundName: {
    fontSize: 15,
    fontWeight: '500',
  },
  footer: {
    paddingTop: 12,
  },
})
