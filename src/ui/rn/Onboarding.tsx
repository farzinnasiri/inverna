import { useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { CloudRain, Flame, Headphones, Sparkles, Waves, Wind } from 'lucide-react-native'
import { PRESETS } from '@/core/sound/catalog'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useNav } from '@/ui/state/nav'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { AmbientBackdrop } from './AmbientBackdrop'
import { BedtimeWheel } from './BedtimeWheel'
import { ContinuePreview } from './ContinuePreview'
import { Button, FRAME_MAX_WIDTH, LightSlider, Slider } from './controls'
import { GlassSurface } from './Glass'
import { useResponsiveLayout } from './hooks'
import { Layer } from './Layer'

const HERO_ART = require('../../../assets/images/onboarding-hero.png')
const SOUND_ART = require('../../../assets/images/sound-sanctuary.png')

function lightStageLabel(light: number): string {
  if (light < 0.2) return 'Clear night'
  if (light < 0.5) return 'Soft warm'
  if (light < 0.78) return 'Candlelight'
  return 'Deep ember'
}

function PresetGlyph({ id, color }: { id: string; color: string }) {
  if (id === 'rainfall' || id === 'theta-rain') return <CloudRain size={18} strokeWidth={1.65} color={color} />
  if (id === 'low-tide') return <Waves size={18} strokeWidth={1.65} color={color} />
  if (id === 'hearth') return <Flame size={18} strokeWidth={1.65} color={color} />
  if (id === 'deep-drift') return <Sparkles size={18} strokeWidth={1.65} color={color} />
  return <Wind size={18} strokeWidth={1.65} color={color} />
}

/**
 * 4-step Liquid Glass onboarding:
 * 0: Ritual Welcome (bespoke obsidian/brass hero artwork)
 * 1: Bedtime (real tactile scroll-snap BedtimeWheel drum picker + quick chips)
 * 2: Night Light (live game preview + Liquid Glass LightSlider + warmth readout)
 * 3: Soundscape (bespoke acoustic sculpture + live audio preset cards + volume)
 */
export function Onboarding() {
  const { color } = useTokenColors()
  const { insets, isCompact, sideMargin } = useResponsiveLayout()
  const onboarded = useSettings((s) => s.onboarded)
  const replay = useNav((s) => s.onboardingReplay)
  const setReplay = useNav((s) => s.setOnboardingReplay)

  const schedule = useSettings((s) => s.schedule)
  const light = useSettings((s) => s.light)
  const hapticsOn = useSettings((s) => s.haptics)
  const set = useSettings((s) => s.set)
  const setSchedule = useSettings((s) => s.setSchedule)

  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const volume = useSound((s) => s.volume)
  const setVolume = useSound((s) => s.setVolume)
  const playPreset = useSound((s) => s.playPreset)
  const stopSound = useSound((s) => s.stop)

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0)
  const visible = !onboarded || replay

  const finish = () => {
    if (hapticsOn) haptics.play('medium')
    set({ onboarded: true })
    setReplay(false)
    setStep(0)
  }

  const nextStep = () => {
    if (hapticsOn) haptics.play('light')
    setStep((s) => Math.min(3, s + 1) as 0 | 1 | 2 | 3)
  }

  const prevStep = () => {
    if (hapticsOn) haptics.play('light')
    setStep((s) => Math.max(0, s - 1) as 0 | 1 | 2 | 3)
  }

  const artSize = isCompact ? 168 : 216

  return (
    <Layer visible={visible} onRequestClose={finish} label="Setup Lull">
      <View
        style={[
          styles.root,
          {
            backgroundColor: '#000000',
            paddingTop: insets.top + (isCompact ? 6 : 12),
            paddingBottom: Math.max(insets.bottom, 16) + 12,
          },
        ]}
      >
        <AmbientBackdrop />
        <View style={[styles.frame, { paddingHorizontal: sideMargin + 2 }]}>
          <View style={styles.top}>
            <View style={styles.dots}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: i === step ? color.accent : 'rgba(255,255,255,0.18)',
                      width: i === step ? 22 : 6,
                    },
                  ]}
                />
              ))}
            </View>
            <Button variant="ghost" size="sm" onPress={finish}>
              Skip
            </Button>
          </View>

          <ScrollView
            style={styles.centerScroll}
            contentContainerStyle={styles.center}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {step === 0 && (
              <View style={styles.stepWrap}>
                <Image
                  source={HERO_ART}
                  style={{ width: artSize, height: artSize, borderRadius: artSize / 2 }}
                  resizeMode="contain"
                />
                <View style={styles.copyStack}>
                  <Text style={[styles.heading, { color: color.ink, fontSize: isCompact ? 28 : 34 }]}>
                    Quiet nights start here
                  </Text>
                  <Text style={[styles.subtitle, { color: color.ink2 }]}>
                    Thirteen calm classic games, nocturnal soundscapes, and a low-blue light designed to replace late-night scrolling.
                  </Text>
                </View>
              </View>
            )}

            {step === 1 && (
              <View style={styles.stepWrap}>
                <View style={styles.copyStack}>
                  <Text style={[styles.heading, { color: color.ink, fontSize: isCompact ? 25 : 30 }]}>
                    When do you turn in?
                  </Text>
                  <Text style={[styles.subtitle, { color: color.ink3 }]}>
                    Lull warms its palette and slows game pace 45 minutes before bed.
                  </Text>
                </View>

                <BedtimeWheel
                  compact={isCompact}
                  value={schedule.bedtime}
                  onChange={(bedtime) => setSchedule({ bedtime })}
                />

                <View style={styles.quickRow}>
                  {[
                    { val: '22:00', label: '10:00 PM' },
                    { val: '23:00', label: '11:00 PM' },
                    { val: '23:30', label: '11:30 PM' },
                    { val: '00:30', label: '12:30 AM' },
                  ].map((t) => {
                    const active = schedule.bedtime === t.val
                    return (
                      <Pressable
                        key={t.val}
                        style={styles.chipPress}
                        onPress={() => {
                          if (hapticsOn) haptics.play('light')
                          setSchedule({ bedtime: t.val })
                        }}
                      >
                        <GlassSurface variant="pill" radius={18} accent={active} interactive style={styles.chip}>
                          <Text
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.82}
                            style={[styles.chipText, { color: active ? color.accent : color.ink2 }]}
                          >
                            {t.label}
                          </Text>
                        </GlassSurface>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            )}

            {step === 2 && (
              <View style={styles.stepWrap}>
                <View style={styles.copyStack}>
                  <Text style={[styles.heading, { color: color.ink, fontSize: isCompact ? 25 : 30 }]}>
                    Tune tonight&apos;s light
                  </Text>
                  <Text style={[styles.subtitle, { color: color.ink3 }]}>
                    True OLED black stays pitch dark while inks warm gently.
                  </Text>
                </View>

                <GlassSurface variant="card" radius={26} style={styles.lightPreviewCard}>
                  <ContinuePreview id="kindle" demo size={isCompact ? 96 : 114} />
                  <View style={styles.lightMeta}>
                    <Text style={[styles.lightStage, { color: color.ink }]}>{lightStageLabel(light)}</Text>
                    <Text style={[styles.lightPct, { color: color.accent }]}>
                      {Math.round((1 - light) * 100)}% in-app light
                    </Text>
                  </View>
                </GlassSurface>

                <View style={{ width: '100%' }}>
                  <LightSlider value={light} onChange={(v) => set({ light: v })} />
                </View>
              </View>
            )}

            {step === 3 && (
              <View style={styles.stepWrap}>
                <Image
                  source={SOUND_ART}
                  style={{ width: isCompact ? 96 : 124, height: isCompact ? 96 : 124, borderRadius: 62 }}
                  resizeMode="contain"
                />
                <View style={styles.copyStack}>
                  <Text style={[styles.heading, { color: color.ink, fontSize: isCompact ? 24 : 28 }]}>
                    Choose a night sound
                  </Text>
                  <Text style={[styles.subtitle, { color: color.ink3 }]}>
                    Tap any soundscape to preview it live.
                  </Text>
                </View>

                <View style={styles.soundList}>
                  {PRESETS.map((p) => {
                    const active = playing && presetId === p.id
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => {
                          if (hapticsOn) haptics.play('light')
                          if (active) {
                            stopSound(0.6)
                          } else {
                            set({ sessionPreset: p.id })
                            playPreset(p.id, 30)
                          }
                        }}
                      >
                        <GlassSurface variant="card" radius={18} accent={active} style={styles.soundRow}>
                          <View style={styles.soundRowLeft}>
                            <View
                              style={[
                                styles.soundIconWrap,
                                {
                                  backgroundColor: active
                                    ? color.accentWash
                                    : 'rgba(255,255,255,0.05)',
                                },
                              ]}
                            >
                              <PresetGlyph id={p.id} color={active ? color.accent : color.ink2} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.soundName, { color: active ? color.ink : color.ink2 }]}>
                                {p.name}
                              </Text>
                              <Text style={[styles.soundHint, { color: color.ink3 }]} numberOfLines={1}>
                                {p.hint}
                              </Text>
                            </View>
                          </View>
                          {p.mix.band ? (
                            <Headphones size={15} strokeWidth={1.6} color={active ? color.accent : color.ink4} />
                          ) : null}
                        </GlassSurface>
                      </Pressable>
                    )
                  })}
                </View>

                {playing && (
                  <View style={styles.volRow}>
                    <Text style={[styles.volLabel, { color: color.ink3 }]}>Volume</Text>
                    <View style={{ flex: 1 }}>
                      <Slider value={volume} onChange={setVolume} label="Preview volume" />
                    </View>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            {step > 0 && (
              <Button variant="quiet" onPress={prevStep} style={{ minWidth: 88 }}>
                Back
              </Button>
            )}
            <View style={{ flex: 1 }}>
              {step === 0 ? (
                <Button variant="primary" block onPress={nextStep}>
                  Set up my night
                </Button>
              ) : step < 3 ? (
                <Button variant="primary" block onPress={nextStep}>
                  Continue
                </Button>
              ) : (
                <Button variant="primary" block onPress={finish}>
                  Enter Lull
                </Button>
              )}
            </View>
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
  centerScroll: {
    flex: 1,
  },
  center: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  stepWrap: {
    alignItems: 'center',
    gap: 20,
    width: '100%',
  },
  copyStack: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  heading: {
    fontWeight: '400',
    letterSpacing: -0.7,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  quickRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    gap: 7,
  },
  chipPress: {
    flex: 1,
  },
  chip: {
    paddingHorizontal: 6,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  lightPreviewCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    padding: 18,
  },
  lightMeta: {
    flex: 1,
    gap: 4,
  },
  lightStage: {
    fontSize: 19,
    fontWeight: '500',
    letterSpacing: -0.3,
  },
  lightPct: {
    fontSize: 13.5,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  soundList: {
    width: '100%',
    gap: 8,
  },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  soundRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  soundIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundName: {
    fontSize: 15,
    fontWeight: '500',
  },
  soundHint: {
    fontSize: 12.5,
    marginTop: 1,
  },
  volRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
  },
  volLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
  },
})
