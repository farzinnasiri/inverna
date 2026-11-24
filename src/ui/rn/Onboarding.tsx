import { useEffect, useRef, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'
import { CloudRain, Flame, Headphones, Sparkles, Volume2, VolumeX, Waves, Wind } from 'lucide-react-native'
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

const HERO_ART = require('../../../assets/images/onboarding-hero.png')
const SOUND_ART = require('../../../assets/images/sound-sanctuary.png')

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)

function lightStageLabel(light: number): string {
  if (light < 0.2) return 'Clear night'
  if (light < 0.5) return 'Soft warm'
  if (light < 0.78) return 'Candlelight'
  return 'Deep ember'
}

function PresetGlyph({ id, color }: { id: string; color: string }) {
  if (id === 'rainfall' || id === 'theta-rain') return <CloudRain size={17} strokeWidth={1.65} color={color} />
  if (id === 'low-tide') return <Waves size={17} strokeWidth={1.65} color={color} />
  if (id === 'hearth') return <Flame size={17} strokeWidth={1.65} color={color} />
  if (id === 'deep-drift') return <Sparkles size={17} strokeWidth={1.65} color={color} />
  return <Wind size={17} strokeWidth={1.65} color={color} />
}

/**
 * Animated Watchmaker Orbital Hero — floating obsidian-brass rings with
 * dual counter-rotating celestial arcs and soft breathing moonlight aura.
 */
function HeroSculpture({ size, reduced }: { size: number; reduced: boolean }) {
  const { color } = useTokenColors()
  const floatSV = useSharedValue(0)
  const orbitA = useSharedValue(0)
  const orbitB = useSharedValue(0)

  useEffect(() => {
    if (reduced) return
    floatSV.set(
      withRepeat(
        withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }),
        -1,
        true,
      ),
    )
    orbitA.set(
      withRepeat(
        withTiming(360, { duration: 28000, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
        -1,
        false,
      ),
    )
    orbitB.set(
      withRepeat(
        withTiming(-360, { duration: 38000, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
        -1,
        false,
      ),
    )
  }, [reduced, floatSV, orbitA, orbitB])

  const artStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (floatSV.get() - 0.5) * 10 },
      { scale: 0.98 + floatSV.get() * 0.035 },
    ],
  }))

  const ringAStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbitA.get()}deg` }],
  }))

  const ringBStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbitB.get()}deg` }],
  }))

  const auraSize = size + 72

  return (
    <View style={[styles.heroStage, { width: auraSize, height: auraSize }]}>
      {/* Soft radial nocturnal aura */}
      <Svg width={auraSize} height={auraSize} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="obHeroAura" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color.accent} stopOpacity="0.24" />
            <Stop offset="55%" stopColor="#324B73" stopOpacity="0.12" />
            <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={auraSize / 2} cy={auraSize / 2} r={auraSize / 2} fill="url(#obHeroAura)" />
      </Svg>

      {/* Outer slowly orbiting watchmaker ring */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.centerAbs, ringAStyle]}>
        <Svg width={auraSize} height={auraSize}>
          <Circle
            cx={auraSize / 2}
            cy={auraSize / 2}
            r={size / 2 + 24}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={1}
            strokeDasharray="6 10"
          />
          <Circle cx={auraSize / 2} cy={auraSize / 2 - (size / 2 + 24)} r={2.6} fill={color.accent} />
        </Svg>
      </Animated.View>

      {/* Inner counter-rotating fine brass orbital arc */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.centerAbs, ringBStyle]}>
        <Svg width={auraSize} height={auraSize}>
          <Circle
            cx={auraSize / 2}
            cy={auraSize / 2}
            r={size / 2 + 12}
            fill="none"
            stroke={color.accent}
            strokeOpacity={0.34}
            strokeWidth={1}
            strokeDasharray="52 180"
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

      <Animated.View style={artStyle}>
        <Image
          source={HERO_ART}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  )
}

/**
 * Acoustic sound-wave pulse rings around the Step 4 sound sculpture when playing live.
 */
function SoundPulseMedallion({ size, playing, reduced }: { size: number; playing: boolean; reduced: boolean }) {
  const { color } = useTokenColors()
  const pulse = useSharedValue(0)

  useEffect(() => {
    if (!playing || reduced) {
      pulse.set(withTiming(0, { duration: 300 }))
      return
    }
    pulse.set(0)
    pulse.set(
      withRepeat(
        withTiming(1, { duration: 2400, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }),
        -1,
        false,
      ),
    )
  }, [playing, reduced, pulse])

  const wave1 = useAnimatedStyle(() => ({
    opacity: playing ? (1 - pulse.get()) * 0.55 : 0,
    transform: [{ scale: 1 + pulse.get() * 0.55 }],
  }))

  const wave2 = useAnimatedStyle(() => {
    const p2 = (pulse.get() + 0.5) % 1
    return {
      opacity: playing ? (1 - p2) * 0.42 : 0,
      transform: [{ scale: 1 + p2 * 0.55 }],
    }
  })

  return (
    <View style={[styles.medallionWrap, { width: size + 40, height: size + 40 }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.waveRing,
          { width: size, height: size, borderRadius: size / 2, borderColor: color.accent },
          wave1,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.waveRing,
          { width: size, height: size, borderRadius: size / 2, borderColor: 'rgba(255,255,255,0.4)' },
          wave2,
        ]}
      />
      <Image
        source={SOUND_ART}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="contain"
      />
    </View>
  )
}

/** Animated progress indicator dot that springs into a pill when active. */
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
 * 4-step Liquid Glass Onboarding with live ambient welcome audio, delicate chime cues,
 * orbital watchmaker hero motion, directional step choreography, and live sound waves.
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
  const [introMuted, setIntroMuted] = useState(false)
  const startedIntroAudioRef = useRef(false)
  const visible = !onboarded || replay

  // Smooth directional slide + fade whenever step changes
  const stepX = useSharedValue(0)
  const stepOpacity = useSharedValue(1)

  useEffect(() => {
    if (!visible) {
      startedIntroAudioRef.current = false
      return
    }
    if (reduced) {
      stepX.set(0)
      stepOpacity.set(1)
      return
    }
    stepX.set(dir * 26)
    stepOpacity.set(0)
    stepX.set(withTiming(0, { duration: 280, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
    stepOpacity.set(withTiming(1, { duration: 240, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
  }, [step, dir, visible, reduced, stepX, stepOpacity])

  const stepAnimStyle = useAnimatedStyle(() => ({
    opacity: stepOpacity.get(),
    transform: [{ translateX: stepX.get() }],
  }))

  const playCue = (name: 'tap' | 'place' | 'chime', vol = 0.45) => {
    if (!sfxOn || introMuted) return
    void sound.unlock()
    sound.cue(name, vol)
  }

  const startWelcomeAtmosphere = () => {
    if (introMuted || startedIntroAudioRef.current || playing) return
    startedIntroAudioRef.current = true
    // Soft ambient nocturnal bed so the user feels Lull's sonic sanctuary immediately
    setVolume(0.42)
    playPreset('rainfall', 30)
  }

  const toggleIntroMute = () => {
    if (hapticsOn) haptics.play('light')
    setIntroMuted((m) => {
      const next = !m
      if (next && playing) {
        stopSound(0.5)
      } else if (!next && !playing) {
        setVolume(0.45)
        playPreset(presetId ?? 'rainfall', 30)
      }
      return next
    })
  }

  const finish = () => {
    if (hapticsOn) haptics.play('medium')
    playCue('chime', 0.65)
    set({ onboarded: true })
    setReplay(false)
    setStep(0)
  }

  const nextStep = () => {
    if (hapticsOn) haptics.play('light')
    if (step === 0) {
      startWelcomeAtmosphere()
      playCue('chime', 0.45)
    } else {
      playCue('place', 0.4)
    }
    setDir(1)
    setStep((s) => Math.min(3, s + 1) as 0 | 1 | 2 | 3)
  }

  const prevStep = () => {
    if (hapticsOn) haptics.play('light')
    playCue('tap', 0.35)
    setDir(-1)
    setStep((s) => Math.max(0, s - 1) as 0 | 1 | 2 | 3)
  }

  const artSize = isCompact ? 148 : 186

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
            <View style={styles.topRight}>
              <Pressable
                onPress={toggleIntroMute}
                accessibilityRole="button"
                accessibilityLabel={introMuted ? 'Unmute intro audio' : 'Mute intro audio'}
                style={styles.audioToggle}
              >
                {introMuted || !playing ? (
                  <VolumeX size={17} strokeWidth={1.65} color={color.ink3} />
                ) : (
                  <Volume2 size={17} strokeWidth={1.65} color={color.accent} />
                )}
              </Pressable>
              <Button variant="ghost" size="sm" onPress={finish}>
                Skip
              </Button>
            </View>
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
                  <HeroSculpture size={artSize} reduced={reduced} />
                  <Animated.View
                    entering={reduced ? undefined : FadeIn.delay(80).duration(320)}
                    style={styles.copyStack}
                  >
                    <Text style={[styles.heading, { color: color.ink, fontSize: isCompact ? 28 : 34 }]}>
                      Put down the feed
                    </Text>
                    <Text style={[styles.subtitle, { color: color.ink2 }]}>
                      Pick up something quiet. Calm tactile puzzles, nocturnal soundscapes, and a gentle wind-down curtain built for late nights.
                    </Text>
                  </Animated.View>
                </View>
              )}

              {step === 1 && (
                <View style={styles.stepWrap}>
                  <View style={styles.copyStack}>
                    <Text style={[styles.heading, { color: color.ink, fontSize: isCompact ? 25 : 30 }]}>
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
                      playCue('tap', 0.25)
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
                            playCue('place', 0.35)
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
                  {!isCompact && (
                    <SoundPulseMedallion size={86} playing={playing} reduced={reduced} />
                  )}
                  <View style={styles.copyStack}>
                    <Text style={[styles.heading, { color: color.ink, fontSize: isCompact ? 23 : 28 }]}>
                      Choose a night sound
                    </Text>
                    <Text style={[styles.subtitle, { color: color.ink2 }]}>
                      Tap to preview live. Headphones recommended for binaural waves.
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
                              setIntroMuted(false)
                              set({ sessionPreset: p.id })
                              playPreset(p.id, 30)
                              playCue('place', 0.3)
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
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  audioToggle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingVertical: 10,
  },
  stepHost: {
    width: '100%',
  },
  stepWrap: {
    alignItems: 'center',
    gap: 18,
    width: '100%',
  },
  heroStage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerAbs: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  medallionWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveRing: {
    position: 'absolute',
    borderWidth: 1,
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
  lightSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  soundList: {
    width: '100%',
    gap: 7,
  },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  soundRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  soundIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundName: {
    fontSize: 14.5,
    fontWeight: '500',
  },
  soundHint: {
    fontSize: 12,
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
