import { useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Defs, LinearGradient, Line, Path, Rect, Stop } from 'react-native-svg'
import { Brain, ExternalLink, Moon, Waves } from 'lucide-react-native'
import {
  onboarding as onboardingCopy,
  scienceSheet as copy,
  type SciencePillarKey,
  type ScienceSource,
  type WaveBandKey,
} from '@/ui/copy'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Button, Sheet } from './controls'
import { GlassSurface } from './Glass'
import { swing, useAmbientTime } from './ambientClock'
import { useFeedback, useReducedMotion } from './hooks'

const AnimatedPath = Animated.createAnimatedComponent(Path)

/**
 * A single wave that begins restless and tight on the left (alert beta)
 * and gradually stretches into a broad, calm line on the right (alpha, theta, delta).
 */
const WAVE_PATH =
  'M 8 34 ' +
  'C 16 12, 22 56, 30 34 ' +
  'C 38 14, 46 54, 56 34 ' +
  'C 68 18, 82 50, 98 34 ' +
  'C 118 22, 140 46, 166 36 ' +
  'C 196 28, 226 42, 260 39 ' +
  'C 284 37, 298 40, 312 40'

const WAVE_LENGTH = 440

/** Visual parameters for each neural oscillation band in the live wave oscilloscope. */
const BAND_VISUALS: Record<
  WaveBandKey,
  { cycles: number; amplitude: number; durationMs: number; secondaryCycles: number }
> = {
  beta: { cycles: 9, amplitude: 14, durationMs: 1350, secondaryCycles: 13 },
  alpha: { cycles: 5, amplitude: 16, durationMs: 2600, secondaryCycles: 7 },
  theta: { cycles: 3, amplitude: 17, durationMs: 4200, secondaryCycles: 4 },
  delta: { cycles: 1, amplitude: 18, durationMs: 6800, secondaryCycles: 2 },
}

const OSC_WIDTH = 280
const OSC_HEIGHT = 64

/** Builds a seamless 2x-wide sine wave SVG path so translating by -OSC_WIDTH loops cleanly. */
function buildPeriodicWave(width: number, height: number, cycles: number, amplitude: number, phase = 0): string {
  const totalWidth = width * 2
  const midY = height / 2
  const steps = Math.max(64, cycles * 24)
  let d = ''
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * totalWidth
    const theta = (x / width) * Math.PI * 2 * cycles + phase
    const y = midY + Math.sin(theta) * amplitude
    d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return d
}

export function PillarIcon({
  pillar,
  size = 18,
  color,
}: {
  pillar: SciencePillarKey
  size?: number
  color: string
}) {
  if (pillar === 'attention') return <Brain size={size} strokeWidth={1.65} color={color} />
  if (pillar === 'sound') return <Waves size={size} strokeWidth={1.65} color={color} />
  return <Moon size={size} strokeWidth={1.65} color={color} />
}

/** Visual centerpiece for onboarding page 2: a restless signal settling across the evening. */
export function DescentCurve({ draw = true, delay = 220 }: { draw?: boolean; delay?: number }) {
  const { color } = useTokenColors()
  const progress = useSharedValue(draw ? 0 : 1)

  useEffect(() => {
    if (!draw) {
      progress.set(1)
      return
    }
    progress.set(0)
    progress.set(
      withDelay(
        delay,
        withTiming(1, { duration: 1500, easing: Easing.bezier(0.35, 0, 0.2, 1), reduceMotion: ReduceMotion.System }),
      ),
    )
  }, [draw, delay, progress])

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: WAVE_LENGTH * (1 - progress.get()),
  }))

  return (
    <GlassSurface variant="card" radius={20} style={styles.curveCard}>
      <View style={styles.curveHeader}>
        <Text style={[styles.curveEndpoint, { color: color.ink3 }]}>{onboardingCopy.science.curveStart}</Text>
        <Text style={[styles.curveEndpoint, { color: color.accent }]}>{onboardingCopy.science.curveEnd}</Text>
      </View>

      <View style={styles.svgWrap}>
        <Svg width="100%" height={64} viewBox="0 0 320 68" accessibilityLabel="Wave slowing from beta to delta">
          <Defs>
            <LinearGradient id="descentStroke" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={color.ink3} stopOpacity={0.7} />
              <Stop offset="0.45" stopColor={color.accent} stopOpacity={0.95} />
              <Stop offset="1" stopColor={color.accent} stopOpacity={0.55} />
            </LinearGradient>
          </Defs>

          <Line x1="8" y1="40" x2="312" y2="40" stroke={color.line} strokeWidth={1} strokeDasharray="3 5" />
          <Line x1="84" y1="14" x2="84" y2="56" stroke={color.line} strokeWidth={1} />
          <Line x1="160" y1="14" x2="160" y2="56" stroke={color.line} strokeWidth={1} />
          <Line x1="236" y1="14" x2="236" y2="56" stroke={color.line} strokeWidth={1} />

          <AnimatedPath
            d={WAVE_PATH}
            fill="none"
            stroke="url(#descentStroke)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${WAVE_LENGTH} ${WAVE_LENGTH}`}
            animatedProps={animatedProps}
          />
        </Svg>
      </View>

      <View style={styles.bandsRow}>
        {onboardingCopy.science.bands.map((band, i) => (
          <Text
            key={band}
            style={[
              styles.bandLabel,
              { color: i === onboardingCopy.science.bands.length - 1 ? color.accent : color.ink3 },
            ]}
          >
            {band}
          </Text>
        ))}
      </View>
    </GlassSurface>
  )
}

/** Animated comparison inside Pillar 1: restless rumination vs. steady visuospatial groove. */
function AttentionVisual({ active }: { active: boolean }) {
  const { color } = useTokenColors()
  const reduced = useReducedMotion()
  const time = useAmbientTime(active && !reduced)
  // Restless: a quick, uneven back and forth. Steady: one slow glide.
  const jitter = useDerivedValue(() => {
    if (reduced || !active) return 0
    const t = time.get()
    return 0.6 * Math.sin(t * 4.3) + 0.4 * Math.sin(t * 7.1 + 1.3)
  })
  const glide = useDerivedValue(() => (reduced || !active ? 0.35 : swing(time.get(), 9.2)))

  const jitterDotA = useAnimatedStyle(() => ({
    transform: [{ translateX: jitter.get() * 26 }],
  }))
  const jitterDotB = useAnimatedStyle(() => ({
    transform: [{ translateX: -jitter.get() * 20 }],
  }))
  const glideDot = useAnimatedStyle(() => ({
    transform: [{ translateX: (glide.get() - 0.5) * 140 }],
  }))

  return (
    <View style={[styles.visualWell, { borderColor: color.line }]}>
      <View style={styles.compareRow}>
        <View style={styles.compareHead}>
          <Text style={[styles.visualLabel, { color: color.ink3 }]}>{copy.attention.compare.emptyLabel}</Text>
          <Text style={[styles.visualTag, { color: color.ink3 }]}>{copy.attention.compare.emptyTag}</Text>
        </View>
        <View style={styles.trackBox}>
          <View style={[styles.trackLine, { backgroundColor: color.line }]} />
          <Animated.View style={[styles.pulseDot, { backgroundColor: color.ink3, opacity: 0.75 }, jitterDotA]} />
          <Animated.View style={[styles.pulseDotSmall, { backgroundColor: color.ink3, opacity: 0.45 }, jitterDotB]} />
        </View>
      </View>

      <View style={[styles.visualDivider, { backgroundColor: color.line }]} />

      <View style={styles.compareRow}>
        <View style={styles.compareHead}>
          <Text style={[styles.visualLabel, { color: color.ink }]}>{copy.attention.compare.playLabel}</Text>
          <Text style={[styles.visualTag, { color: color.accent }]}>{copy.attention.compare.playTag}</Text>
        </View>
        <View style={styles.trackBox}>
          <View style={[styles.trackLine, { backgroundColor: color.accentWash }]} />
          <Animated.View style={[styles.pulseGlow, { backgroundColor: color.accentWash }, glideDot]}>
            <View style={[styles.pulseDot, { backgroundColor: color.accent }]} />
          </Animated.View>
        </View>
      </View>
    </View>
  )
}

/** Interactive Greek brainwave oscilloscope inside Pillar 2 (β / α / θ / δ). */
function BrainwaveVisualizer({ active }: { active: boolean }) {
  const { color } = useTokenColors()
  const reduced = useReducedMotion()
  const { haptic } = useFeedback()
  const [selected, setSelected] = useState<WaveBandKey>('alpha')
  const [trackWidth, setTrackWidth] = useState(OSC_WIDTH)

  const band = useMemo(
    () => copy.sound.bands.find((b) => b.key === selected) ?? copy.sound.bands[1]!,
    [selected],
  )
  const spec = BAND_VISUALS[selected]

  const primaryPath = useMemo(
    () => buildPeriodicWave(OSC_WIDTH, OSC_HEIGHT, spec.cycles, spec.amplitude, 0),
    [spec.cycles, spec.amplitude],
  )
  const ghostPath = useMemo(
    () => buildPeriodicWave(OSC_WIDTH, OSC_HEIGHT, spec.secondaryCycles, spec.amplitude * 0.45, Math.PI / 3),
    [spec.secondaryCycles, spec.amplitude],
  )

  const time = useAmbientTime(active && !reduced)
  // The wave scrolls one track width per cycle of its band.
  const offset = useDerivedValue(() =>
    reduced || !active ? 0 : -trackWidth * (((time.get() * 1000) / spec.durationMs) % 1),
  )

  const waveStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() }],
  }))

  const selectBand = (key: WaveBandKey) => {
    if (key === selected) return
    haptic('tick')
    setSelected(key)
  }

  return (
    <View style={[styles.visualWell, { borderColor: color.line }]}>
      <View style={styles.bandTabs} accessibilityRole="tablist">
        {copy.sound.bands.map((item) => {
          const isSelected = item.key === selected
          return (
            <Pressable
              key={item.key}
              onPress={() => selectBand(item.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              style={[
                styles.bandTab,
                {
                  backgroundColor: isSelected ? 'rgba(194, 161, 95, 0.2)' : 'transparent',
                  borderColor: isSelected ? 'rgba(255, 236, 200, 0.2)' : color.line,
                },
              ]}
            >
              <Text style={[styles.bandSymbol, { color: isSelected ? color.accent : color.ink3 }]}>{item.symbol}</Text>
              <Text style={[styles.bandTabName, { color: isSelected ? color.ink : color.ink3 }]}>{item.name}</Text>
            </Pressable>
          )
        })}
      </View>

      <View
        style={styles.oscWindow}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width)
          if (w > 40 && w !== trackWidth) setTrackWidth(w)
        }}
      >
        {/* Static center reference line */}
        <View style={[styles.oscAxis, { backgroundColor: color.line }]} />

        <Animated.View style={[{ width: trackWidth * 2, height: OSC_HEIGHT }, waveStyle]}>
          <Svg
            width={trackWidth * 2}
            height={OSC_HEIGHT}
            viewBox={`0 0 ${OSC_WIDTH * 2} ${OSC_HEIGHT}`}
            preserveAspectRatio="none"
            accessibilityLabel={`${band.name} wave at ${band.hz}`}
          >
            <Path
              d={ghostPath}
              fill="none"
              stroke={color.ink3}
              strokeOpacity={0.22}
              strokeWidth={1.25}
            />
            <Path
              d={primaryPath}
              fill="none"
              stroke={color.accent}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Animated.View>
      </View>

      <View style={styles.bandMeta}>
        <View style={styles.bandMetaHead}>
          <Text style={[styles.bandMetaTitle, { color: color.ink }]}>
            {band.symbol} {band.name}
          </Text>
          <View style={[styles.hzPill, { backgroundColor: color.accentWash }]}>
            <Text style={[styles.hzText, { color: color.accent }]}>{band.hz}</Text>
          </View>
        </View>
        <Text style={[styles.bandMetaState, { color: color.ink2 }]}>{band.state}</Text>
        <Text style={[styles.bandMetaRole, { color: color.ink3 }]}>{band.role}</Text>
      </View>
    </View>
  )
}

/** Visible light spectrum inside Pillar 3 highlighting the 460-480 nm melanopsin zone. */
function SpectrumVisual({ active }: { active: boolean }) {
  const { color } = useTokenColors()
  const reduced = useReducedMotion()
  const time = useAmbientTime(active && !reduced)
  const pulse = useDerivedValue(() => (reduced || !active ? 0.75 : 0.45 + 0.55 * swing(time.get(), 4.4)))

  const markerStyle = useAnimatedStyle(() => ({
    opacity: pulse.get(),
  }))

  return (
    <View style={[styles.visualWell, { borderColor: color.line }]}>
      <View style={styles.compareHead}>
        <Text style={[styles.visualLabel, { color: color.ink3 }]}>{copy.light.spectrum.peakLabel}</Text>
        <Text style={[styles.visualTag, { color: color.ink3 }]}>{copy.light.spectrum.peakBadge}</Text>
      </View>

      <View style={styles.spectrumWrap}>
        <Svg width="100%" height={34} viewBox="0 0 300 34" accessibilityLabel="Visible light spectrum from 400 to 700 nanometers">
          <Defs>
            <LinearGradient id="visibleSpectrum" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#4F46E5" stopOpacity={0.32} />
              <Stop offset="0.24" stopColor="#38BDF8" stopOpacity={0.45} />
              <Stop offset="0.45" stopColor="#34D399" stopOpacity={0.28} />
              <Stop offset="0.68" stopColor="#D9A86C" stopOpacity={0.85} />
              <Stop offset="1" stopColor="#9A4B2E" stopOpacity={0.9} />
            </LinearGradient>
          </Defs>

          <Rect x="0" y="10" width="300" height="14" rx="7" fill="url(#visibleSpectrum)" />
          {/* Attenuated blue-cyan melanopsin sensitivity zone (460-480 nm) */}
          <Rect
            x="52"
            y="6"
            width="36"
            height="22"
            rx="5"
            fill="none"
            stroke={color.ink3}
            strokeWidth={1.1}
            strokeDasharray="3 3"
          />
          <Line x1="56" y1="24" x2="84" y2="10" stroke={color.ink3} strokeWidth={1.1} strokeOpacity={0.75} />

          {/* Warm amber night marker */}
          <Circle cx="238" cy="17" r="4.5" fill={color.accent} />
        </Svg>
        <Animated.View pointerEvents="none" style={[styles.spectrumGlow, { backgroundColor: color.accentWash }, markerStyle]} />
      </View>

      <View style={styles.compareHead}>
        <Text style={[styles.spectrumNm, { color: color.ink3 }]}>{copy.light.spectrum.startNm}</Text>
        <Text style={[styles.spectrumSafe, { color: color.accent }]}>{copy.light.spectrum.safeBadge}</Text>
        <Text style={[styles.spectrumNm, { color: color.ink3 }]}>{copy.light.spectrum.endNm}</Text>
      </View>
    </View>
  )
}

/** Compact tappable source links (Wikipedia / references). */
function SourceChips({ sources }: { sources: readonly ScienceSource[] }) {
  const { color } = useTokenColors()

  const openSource = (url: string) => {
    void Linking.openURL(url).catch(() => {})
  }

  return (
    <View style={styles.sourceRow}>
      {sources.map((src) => (
        <Pressable
          key={src.url}
          onPress={() => openSource(src.url)}
          accessibilityRole="link"
          accessibilityLabel={`Read about ${src.label} on Wikipedia`}
          style={({ pressed }) => [
            styles.sourceChip,
            {
              borderColor: color.line,
              backgroundColor: pressed ? color.accentWash : 'transparent',
            },
          ]}
        >
          <Text style={[styles.sourceText, { color: color.ink2 }]}>{src.label}</Text>
          <ExternalLink size={11} strokeWidth={1.8} color={color.accent} />
        </Pressable>
      ))}
    </View>
  )
}

function MechanismPoints({ points }: { points: readonly { label: string; text: string }[] }) {
  const { color } = useTokenColors()
  return (
    <View style={styles.pointsList}>
      {points.map((pt) => (
        <Text key={pt.label} style={[styles.pointLine, { color: color.ink2 }]}>
          <Text style={[styles.pointLabel, { color: color.ink }]}>{pt.label}: </Text>
          {pt.text}
        </Text>
      ))}
    </View>
  )
}

/** Shared bottom sheet explaining the three-pillar system (used in Onboarding and Settings). */
export function ScienceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { color } = useTokenColors()

  return (
    <Sheet open={open} onClose={onClose} label={copy.title}>
      <Text style={[styles.sheetTitle, { color: color.ink }]}>{copy.title}</Text>
      <Text style={[styles.sheetIntro, { color: color.ink2 }]}>{copy.intro}</Text>

      <View style={styles.sectionList}>
        {/* Pillar 1: Attention & Cognitive Psychology */}
        <GlassSurface variant="card" radius={18} style={styles.sectionCard}>
          <View style={styles.sectionHead}>
            <View style={[styles.iconBadge, { backgroundColor: color.accentWash }]}>
              <PillarIcon pillar="attention" size={16} color={color.accent} />
            </View>
            <View style={styles.sectionTitles}>
              <Text style={[styles.sectionKicker, { color: color.accent }]}>{copy.attention.kicker}</Text>
              <Text style={[styles.sectionTitle, { color: color.ink }]}>{copy.attention.title}</Text>
            </View>
          </View>
          <AttentionVisual active={open} />
          <MechanismPoints points={copy.attention.points} />
          <SourceChips sources={copy.attention.sources} />
        </GlassSurface>

        {/* Pillar 2: Sound, Greek Wave Bands & Neuroacoustics */}
        <GlassSurface variant="card" radius={18} style={styles.sectionCard}>
          <View style={styles.sectionHead}>
            <View style={[styles.iconBadge, { backgroundColor: color.accentWash }]}>
              <PillarIcon pillar="sound" size={16} color={color.accent} />
            </View>
            <View style={styles.sectionTitles}>
              <Text style={[styles.sectionKicker, { color: color.accent }]}>{copy.sound.kicker}</Text>
              <Text style={[styles.sectionTitle, { color: color.ink }]}>{copy.sound.title}</Text>
            </View>
          </View>
          <Text style={[styles.sectionLead, { color: color.ink2 }]}>{copy.sound.lead}</Text>
          <BrainwaveVisualizer active={open} />
          <MechanismPoints points={copy.sound.points} />
          <SourceChips sources={copy.sound.sources} />
        </GlassSurface>

        {/* Pillar 3: Light & Circadian Optics */}
        <GlassSurface variant="card" radius={18} style={styles.sectionCard}>
          <View style={styles.sectionHead}>
            <View style={[styles.iconBadge, { backgroundColor: color.accentWash }]}>
              <PillarIcon pillar="light" size={16} color={color.accent} />
            </View>
            <View style={styles.sectionTitles}>
              <Text style={[styles.sectionKicker, { color: color.accent }]}>{copy.light.kicker}</Text>
              <Text style={[styles.sectionTitle, { color: color.ink }]}>{copy.light.title}</Text>
            </View>
          </View>
          <SpectrumVisual active={open} />
          <MechanismPoints points={copy.light.points} />
          <SourceChips sources={copy.light.sources} />
        </GlassSurface>
      </View>

      <Text style={[styles.footnote, { color: color.ink3 }]}>{copy.footnote}</Text>

      <View style={styles.sheetFooter}>
        <Button variant="primary" block onPress={onClose}>
          {copy.close}
        </Button>
      </View>
    </Sheet>
  )
}

/** Subtle link pill used on Onboarding page 2 to open the science sheet. */
export function ScienceLink({ onPress, label }: { onPress: () => void; label: string }) {
  const { color } = useTokenColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.moreBtn, { opacity: pressed ? 0.65 : 1 }]}
    >
      <Text style={[styles.moreText, { color: color.accent }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  curveCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  curveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  curveEndpoint: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  svgWrap: {
    width: '100%',
    height: 64,
    justifyContent: 'center',
  },
  bandsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  bandLabel: {
    fontSize: 11.5,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  sheetTitle: {
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  sheetIntro: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  sectionList: {
    gap: 14,
    marginTop: 18,
  },
  sectionCard: {
    padding: 16,
    gap: 12,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitles: {
    flex: 1,
    gap: 1,
  },
  sectionKicker: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  sectionTitle: {
    fontSize: 16.5,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  sectionLead: {
    fontSize: 14,
    lineHeight: 20,
  },
  visualWell: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.24)',
  },
  compareRow: {
    gap: 8,
  },
  compareHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  visualLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  visualTag: {
    fontSize: 11,
    fontWeight: '500',
  },
  trackBox: {
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  trackLine: {
    position: 'absolute',
    left: 6,
    right: 6,
    height: 1.5,
    borderRadius: 1,
  },
  pulseGlow: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pulseDotSmall: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  visualDivider: {
    height: StyleSheet.hairlineWidth,
  },
  bandTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  bandTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bandSymbol: {
    fontSize: 14,
    fontWeight: '700',
  },
  bandTabName: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  oscWindow: {
    height: OSC_HEIGHT,
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  oscAxis: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: OSC_HEIGHT / 2,
    height: StyleSheet.hairlineWidth,
  },
  bandMeta: {
    gap: 4,
  },
  bandMetaHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  bandMetaTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  hzPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  hzText: {
    fontSize: 11.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  bandMetaState: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  bandMetaRole: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  spectrumWrap: {
    height: 34,
    justifyContent: 'center',
  },
  spectrumGlow: {
    position: 'absolute',
    right: '17%',
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  spectrumNm: {
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  spectrumSafe: {
    fontSize: 11,
    fontWeight: '600',
  },
  pointsList: {
    gap: 8,
  },
  pointLine: {
    fontSize: 14,
    lineHeight: 20.5,
  },
  pointLabel: {
    fontWeight: '600',
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 2,
  },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sourceText: {
    fontSize: 12,
    fontWeight: '500',
  },
  footnote: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 8,
  },
  sheetFooter: {
    marginTop: 16,
    marginBottom: 4,
  },
  moreBtn: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  moreText: {
    fontSize: 14,
    fontWeight: '500',
  },
})
