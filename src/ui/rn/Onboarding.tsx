import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Defs, Line, Path, RadialGradient, Stop } from 'react-native-svg'
import {
  CloudRain,
  Flame,
  Gamepad2,
  Moon,
  Sparkles,
  Volume2,
  Waves,
  Wind,
} from 'lucide-react-native'
import { PRESETS } from '@/core/sound/catalog'
import { haptics, sound } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useNav } from '@/ui/state/nav'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { AmbientBackdrop } from './AmbientBackdrop'
import { BedtimeWheel } from './BedtimeWheel'
import { ContinuePreview } from './ContinuePreview'
import { Button, FRAME_MAX_WIDTH, LightSlider, Slider } from './controls'
import { GlassSurface } from './Glass'
import { useReducedMotion, useResponsiveLayout } from './hooks'
import { Layer } from './Layer'

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)

function lightStageLabel(light: number): string {
  if (light < 0.2) return 'Clear night'
  if (light < 0.5) return 'Soft warm'
  if (light < 0.78) return 'Candlelight'
  return 'Deep ember'
}

function PresetGlyph({ id, color }: { id: string; color: string }) {
  if (id === 'theta-rain' || id === 'rainfall') return <CloudRain size={17} strokeWidth={1.65} color={color} />
  if (id === 'low-tide') return <Waves size={17} strokeWidth={1.65} color={color} />
  if (id === 'hearth') return <Flame size={17} strokeWidth={1.65} color={color} />
  if (id === 'deep-drift') return <Sparkles size={17} strokeWidth={1.65} color={color} />
  return <Wind size={17} strokeWidth={1.65} color={color} />
}

/**
 * Minimal Watchmaker crescent-and-horizon emblem drawn cleanly in vector SVG
 * so Onboarding Step 1 shares Lull's exact nocturnal obsidian & brass language.
 */
function WatchmakerEmblem({ size, reduced }: { size: number; reduced: boolean }) {
  const { color } = useTokenColors()
  const breathe = useSharedValue(0)

  useEffect(() => {
    if (reduced) return
    breathe.set(
      withRepeat(
        withTiming(1, {
          duration: 5400,
          easing: Easing.inOut(Easing.sin),
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        true,
      ),
    )
  }, [reduced, breathe])

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.72 + breathe.get() * 0.28,
    transform: [{ scale: 0.97 + breathe.get() * 0.05 }],
  }))

  return (
    <View style={[styles.emblemWrap, { width: size, height: size }]}>
      <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
        <Svg width={size} height={size} viewBox="0 0 160 160">
          <Defs>
            <RadialGradient id="lullEmblemGlow" cx="50%" cy="46%" r="50%">
              <Stop offset="0%" stopColor={color.accent} stopOpacity="0.28" />
              <Stop offset="55%" stopColor="#264A7A" stopOpacity="0.12" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={80} cy={80} r={76} fill="url(#lullEmblemGlow)" />
        </Svg>
      </Animated.View>

      <GlassSurface variant="elevated" radius={size * 0.32} style={[styles.emblemTile, { width: size * 0.72, height: size * 0.72 }]}>
        <Svg width={size * 0.54} height={size * 0.54} viewBox="0 0 96 96">
          {/* Fine outer watchmaker bezel */}
          <Circle cx={48} cy={48} r={41} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
          <Circle
            cx={48}
            cy={48}
            r={34}
            fill="none"
            stroke={color.accent}
            strokeOpacity={0.34}
            strokeWidth={0.9}
            strokeDasharray="3 6"
          />
          {/* Clean crescent moon */}
          <Path
            d="M55.5 29.5A20 20 0 1 0 67.5 60.5 15.5 15.5 0 0 1 55.5 29.5Z"
            fill={color.accent}
            fillOpacity={0.92}
          />
          {/* Quiet horizon line */}
          <Line
            x1={24}
            y1={68}
            x2={72}
            y2={68}
            stroke="rgba(255,255,255,0.22)"
            strokeWidth={1.1}
            strokeLinecap="round"
          />
        </Svg>
      </GlassSurface>
    </View>
  )
}

function StepDot({ active, accentColor }: { active: boolean; accentColor: string }) {
  const w = useSharedValue(active ? 22 : 6)
  useEffect(() => {
    w.set(withSpring(active ? 22 : 6, { duration: 260, dampingRatio: 0.82, reduceMotion: ReduceMotion.System }))
  }, [active, w])

  const style = useAnimatedStyle(() => ({ width: w.get() }))
  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: active ? accentColor : 'rgba(255,255,255,0.18)' },
        style,
      ]}
    />
  )
}

/**
 * Cohesive 4-step Onboarding matching Lull's Watchmaker Ink & Brass aesthetic:
 * - Zero unprompted auto-play audio; sound only starts when explicitly tapped on Step 4.
 * - Fixed-height volume bar slot on Step 4 so choosing a sound NEVER shifts the layout.
 */
export function Onboarding() {
  const { color } = useTokenColors()
  const { insets, isCompact, sideMargin } = useResponsiveLayout()
  const reduced = useReducedMotion()
  const onboarded = useSettings((s) => s.onboarded)
  const replay = useNav((s) => s.onboardingReplay)
  const setReplay = useNav((s) => s.setOnboardingReplay)

  const schedule = useSettings((s) => s.schedule)
  const light = useSettings((s) => s.light)
  const hapticsOn = useSettings((s) => s.haptics)
  const sfxOn = useSettings((s) => s.sfx)
  const set = useSettings((s) => s.set)
  const setSchedule = useSettings((s) => s.setSchedule)

  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const volume = useSound((s) => s.volume)
  const setVolume = useSound((s) => s.setVolume)
  const playPreset = useSound((s) => s.playPreset)
  const stopSound = useSound((s) => s.stop)

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const visible = !onboarded || replay

  const stepX = useSharedValue(0)
  const stepOpacity = useSharedValue(1)

  useEffect(() => {
    if (!visible) return
    if (reduced) {
      stepX.set(0)
      stepOpacity.set(1)
      return
    }
    stepX.set(dir * 22)
    stepOpacity.set(0)
    stepX.set(withTiming(0, { duration: 260, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
    stepOpacity.set(withTiming(1, { duration: 220, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
  }, [step, dir, visible, reduced, stepX, stepOpacity])

  const stepAnimStyle = useAnimatedStyle(() => ({
    opacity: stepOpacity.get(),
    transform: [{ translateX: stepX.get() }],
  }))

  const playCue = (name: 'tap' | 'place' | 'chime', vol = 0.35) => {
    if (!sfxOn) return
    void sound.unlock()
    sound.cue(name, vol)
  }

  const finish = () => {
    if (hapticsOn) haptics.play('medium')
    playCue('chime', 0.45)
    set({ onboarded: true })
    setReplay(false)
    setStep(0)
  }

  const nextStep = () => {
    if (hapticsOn) haptics.play('light')
    playCue('tap', 0.3)
    setDir(1)
    setStep((s) => Math.min(3, s + 1) as 0 | 1 | 2 | 3)
  }

  const prevStep = () => {
    if (hapticsOn) haptics.play('light')
    playCue('tap', 0.25)
    setDir(-1)
    setStep((s) => Math.max(0, s - 1) as 0 | 1 | 2 | 3)
  }

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
                <StepDot key={i} active={i === step} accentColor={color.accent} />
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
            <Animated.View style={[styles.stepHost, stepAnimStyle]}>
              {step === 0 && (
                <View style={styles.stepWrap}>
                  <WatchmakerEmblem size={isCompact ? 132 : 156} reduced={reduced} />

                  <View style={styles.copyStack}>
                    <Text style={[styles.eyebrow, { color: color.accent }]}>LULL</Text>
                    <Text style={[styles.heading, { color: color.ink, fontSize: isCompact ? 30 : 36 }]}>
                      Put down the feed
                    </Text>
                    <Text style={[styles.subtitle, { color: color.ink2 }]}>
                      Quiet classic puzzles, nocturnal soundscapes, and a gentle light built for the last hour of your night.
                    </Text>
                  </View>

                  <View style={styles.pillars}>
                    {[
                      { icon: Gamepad2, title: '13 quiet games', note: 'In-key audio, zero timers or streaks' },
                      { icon: Waves, title: 'Neuroacoustic sound', note: 'On-device Theta & Delta descent before bed' },
                      { icon: Moon, title: 'True OLED night', note: 'Pure black ground that warms before bed' },
                    ].map(({ icon: Icon, title, note }) => (
                      <GlassSurface key={title} variant="card" radius={18} style={styles.pillarRow}>
                        <View style={styles.pillarIcon}>
                          <Icon size={17} strokeWidth={1.65} color={color.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pillarTitle, { color: color.ink }]}>{title}</Text>
                          <Text style={[styles.pillarNote, { color: color.ink3 }]}>{note}</Text>
                        </View>
                      </GlassSurface>
                    ))}
                  </View>
                </View>
              )}

              {step === 1 && (
                <View style={styles.stepWrap}>
                  <View style={styles.copyStack}>
                    <Text style={[styles.heading, { color: color.ink, fontSize: isCompact ? 26 : 31 }]}>
                      When do you turn in?
                    </Text>
                    <Text style={[styles.subtitle, { color: color.ink2 }]}>
                      Lull warms its palette and slows game pace 45 minutes before bed. You can adjust this anytime.
                    </Text>
                  </View>

                  <BedtimeWheel
                    compact={isCompact}
                    value={schedule.bedtime}
                    onChange={(bedtime) => {
                      playCue('tap', 0.22)
                      setSchedule({ bedtime })
                    }}
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
                            playCue('place', 0.3)
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
                    <Text style={[styles.heading, { color: color.ink, fontSize: isCompact ? 26 : 31 }]}>
                      Tune tonight&apos;s light
                    </Text>
                    <Text style={[styles.subtitle, { color: color.ink2 }]}>
                      Slide below to dim and warm Lull&apos;s in-app palette live while keeping true OLED black.
                    </Text>
                  </View>

                  <GlassSurface variant="card" radius={24} style={styles.lightPreviewCard}>
                    <ContinuePreview id="kindle" demo size={isCompact ? 88 : 104} />
                    <View style={styles.lightMeta}>
                      <Text style={[styles.lightStage, { color: color.ink }]}>{lightStageLabel(light)}</Text>
                      <Text style={[styles.lightSub, { color: color.ink3 }]}>
                        Adjusts Lull&apos;s own inks &amp; glow
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
                  <View style={styles.copyStack}>
                    <Text style={[styles.heading, { color: color.ink, fontSize: isCompact ? 26 : 30 }]}>
                      Choose a night sound
                    </Text>
                    <Text style={[styles.subtitle, { color: color.ink2 }]}>
                      Tap any soundscape to preview live. Nothing plays until you ask.
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
                          <GlassSurface variant="card" radius={18} accent={active} interactive style={styles.soundRow}>
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
                                  {active ? 'Playing live' : p.hint}
                                </Text>
                              </View>
                            </View>
                            {p.badge ? (
                              <View
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 3,
                                  borderRadius: 999,
                                  borderWidth: 1,
                                  borderColor: active ? color.accentDim : 'rgba(255,255,255,0.12)',
                                  backgroundColor: active ? color.accentWash : 'rgba(255,255,255,0.04)',
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 10.5,
                                    fontWeight: '600',
                                    color: active ? color.accent : color.ink3,
                                  }}
                                >
                                  Default
                                </Text>
                              </View>
                            ) : null}
                          </GlassSurface>
                        </Pressable>
                      )
                    })}
                  </View>

                  {/* Fixed-slot volume bar — always occupies its exact height so selecting a sound NEVER jumps the layout */}
                  <GlassSurface
                    variant="card"
                    radius={18}
                    style={[styles.volBar, { opacity: playing ? 1 : 0.34 }]}
                  >
                    <Volume2 size={15} strokeWidth={1.65} color={playing ? color.accent : color.ink3} />
                    <View style={{ flex: 1 }} pointerEvents={playing ? 'auto' : 'none'}>
                      <Slider value={volume} onChange={setVolume} label="Preview volume" />
                    </View>
                    <Text style={[styles.volPct, { color: playing ? color.accent : color.ink3 }]}>
                      {Math.round(volume * 100)}%
                    </Text>
                  </GlassSurface>
                </View>
              )}
            </Animated.View>
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
  stepHost: {
    width: '100%',
  },
  stepWrap: {
    alignItems: 'center',
    gap: 20,
    width: '100%',
  },
  emblemWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblemTile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 3.2,
    marginBottom: 2,
  },
  copyStack: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  heading: {
    fontWeight: '300',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  pillars: {
    width: '100%',
    gap: 9,
  },
  pillarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  pillarIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(194, 161, 95, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillarTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  pillarNote: {
    fontSize: 12.5,
    marginTop: 2,
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
  lightSub: {
    fontSize: 13,
    lineHeight: 18,
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
    fontSize: 14.5,
    fontWeight: '600',
  },
  soundHint: {
    fontSize: 12,
    marginTop: 1,
  },
  volBar: {
    width: '100%',
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    gap: 12,
  },
  volPct: {
    fontSize: 12.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 34,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
  },
})
