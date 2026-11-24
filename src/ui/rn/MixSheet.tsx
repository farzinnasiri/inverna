import { useEffect, useRef, useState } from 'react'
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg'
import { Volume2 } from 'lucide-react-native'
import { sampleDescentCurve, type DescentSnapshot, type ModulationDepth } from '@/core/sound/arc'
import {
  BANDS,
  LAYERS,
  normalizeBand,
  type LayerId,
  type Mix,
  type Preset,
  type SleepBandId,
  type SoundIconId,
} from '@/core/sound/catalog'
import { DEFAULT_HARMONIC_KEY, HARMONIC_KEYS, type HarmonicKeyId } from '@/core/sound/harmonics'
import { haptics, sound } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { Button, Segmented, Sheet, Slider, Toggle } from './controls'
import { SoundGlyph } from './SoundGlyph'

export type StudioTab = 'layers' | 'rhythm'

const STUDIO_TABS: { value: StudioTab; label: string }[] = [
  { value: 'layers', label: 'Layers' },
  { value: 'rhythm', label: 'Rhythm' },
]

const DEPTH_OPTIONS: { value: ModulationDepth; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'deep', label: 'Deep' },
]

const MOOD_CHIPS: { id: HarmonicKeyId; label: string; icon: SoundIconId }[] = [
  { id: 'd-dorian', label: 'Rain', icon: 'rain' },
  { id: 'e-min-classical', label: 'Piano', icon: 'piano' },
  { id: 'f-lydian', label: 'Hearth', icon: 'fire' },
  { id: 'c-maj9', label: 'Tide', icon: 'waves' },
  { id: 'g-min9', label: 'Velvet', icon: 'moon' },
  { id: 'a-min9', label: 'Air', icon: 'wind' },
]

function MiniWave({ kind, color }: { kind: SleepBandId | 'off'; color: string }) {
  if (kind === 'off') {
    return (
      <Svg width={22} height={10} viewBox="0 0 22 10">
        <Line x1={2} y1={5} x2={20} y2={5} stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeOpacity={0.6} />
      </Svg>
    )
  }
  const d =
    kind === 'delta'
      ? 'M1 5 Q6 1 11 5 T21 5'
      : kind === 'theta'
        ? 'M1 5 Q3.5 1.5 6 5 T11 5 T16 5 T21 5'
        : 'M1 5 Q2.7 1.5 4.4 5 T7.8 5 T11.2 5 T14.6 5 T18 5 T21 5'
  return (
    <Svg width={22} height={10} viewBox="0 0 22 10">
      <Path d={d} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  )
}

function DescentCurve({
  preset,
  descent,
  accent,
  ink3,
  line,
}: {
  preset: Preset | null | undefined
  descent: DescentSnapshot
  accent: string
  ink3: string
  line: string
}) {
  const w = 310
  const h = 84
  const padX = 10
  const padTop = 12
  const padBot = 18
  const innerW = w - padX * 2
  const innerH = h - padTop - padBot

  const pts = sampleDescentCurve(preset, 26)
  const maxHz = Math.max(9, pts[0]?.hz ?? 8.5)
  const minHz = 1.0

  const toX = (t: number) => padX + t * innerW
  const toY = (hz: number) => {
    const norm = (hz - minHz) / Math.max(1, maxHz - minHz)
    return padTop + (1 - Math.min(1, Math.max(0, norm))) * innerH
  }

  const linePath = pts
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(pt.t).toFixed(1)} ${toY(pt.hz).toFixed(1)}`)
    .join(' ')
  const areaPath = `${linePath} L ${toX(1).toFixed(1)} ${(h - padBot).toFixed(1)} L ${toX(0).toFixed(1)} ${(h - padBot).toFixed(1)} Z`
  const dotX = toX(descent.progress)
  const dotY = toY(descent.modHz)

  return (
    <View>
      <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="studioDescentFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <Stop offset="100%" stopColor={accent} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Line x1={toX(0.42)} y1={padTop} x2={toX(0.42)} y2={h - padBot} stroke={line} strokeDasharray="3 4" strokeWidth={1} />
        <Line x1={toX(0.76)} y1={padTop} x2={toX(0.76)} y2={h - padBot} stroke={line} strokeDasharray="3 4" strokeWidth={1} />
        <Line x1={padX} y1={h - padBot} x2={w - padX} y2={h - padBot} stroke={line} strokeWidth={1} />
        <Path d={areaPath} fill="url(#studioDescentFill)" />
        <Path d={linePath} fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" />
        <Circle cx={dotX} cy={dotY} r={8} fill={accent} fillOpacity={0.22} />
        <Circle cx={dotX} cy={dotY} r={4} fill={accent} />
      </Svg>
      <View style={styles.chartAxis}>
        <Text style={[styles.axisText, { color: descent.phase === 'unwind' ? accent : ink3 }]}>Unwind</Text>
        <Text style={[styles.axisText, { color: descent.phase === 'drift' ? accent : ink3 }]}>Drift</Text>
        <Text style={[styles.axisText, { color: descent.phase === 'still' ? accent : ink3 }]}>Still</Text>
      </View>
    </View>
  )
}

function VerticalFader({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  const { color } = useTokenColors()
  const heightRef = useRef(122)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const updateFromY = (y: number) => {
    const h = Math.max(1, heightRef.current)
    const clamped = Math.min(1, Math.max(0, 1 - y / h))
    onChangeRef.current(Math.round(clamped * 50) / 50)
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => updateFromY(e.nativeEvent.locationY),
      onPanResponderMove: (e) => updateFromY(e.nativeEvent.locationY),
    }),
  ).current

  const v = Math.min(1, Math.max(0, value))

  return (
    <View style={styles.faderCol}>
      <View
        {...panResponder.panHandlers}
        onLayout={(e) => {
          heightRef.current = e.nativeEvent.layout.height
        }}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        style={[
          styles.faderTrack,
          {
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderColor: v > 0.01 ? color.accentDim : color.line,
          },
        ]}
      >
        <View
          pointerEvents="none"
          style={[
            styles.faderFill,
            {
              height: `${Math.round(v * 100)}%`,
              backgroundColor: v > 0.01 ? color.accent : color.surface3,
              opacity: v > 0.01 ? 0.72 : 0.2,
            },
          ]}
        />
      </View>
      <Text style={[styles.faderLabel, { color: v > 0.01 ? color.ink : color.ink3 }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

/**
 * Unified Sound Studio Bottom Sheet — single source of truth for Layers, Harmonic Mood,
 * Brainwave Rhythm (Greek symbols + waves), and 60-minute Bedtime Descent.
 * Uses 2 clean tabs (`Layers | Rhythm`) so everything fits comfortably without vertical scrolling.
 */
export function MixSheet({
  open,
  initialTab = 'layers',
  onClose,
  mix,
  preset,
  onChange,
  onReset,
}: {
  open: boolean
  initialTab?: StudioTab
  onClose: () => void
  mix: Mix
  preset?: Preset | null
  onChange: (next: Mix) => void
  onReset: () => void
}) {
  const { color } = useTokenColors()
  const [tab, setTab] = useState<StudioTab>(initialTab)

  const descent = useSound((s) => s.descent)
  const syncDescent = useSound((s) => s.syncDescent)
  const modulationDepth = useSettings((s) => s.modulationDepth)
  const autoDescent = useSettings((s) => s.autoDescent)
  const hapticsOn = useSettings((s) => s.haptics)
  const setSettings = useSettings((s) => s.set)

  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  const activeBand = normalizeBand(mix.band)
  const toneValue: SleepBandId | 'off' = activeBand && mix.bandGain > 0.02 ? activeBand : 'off'
  const padGain = mix.padGain ?? 0
  const activeKey: HarmonicKeyId = mix.harmonicKey ?? DEFAULT_HARMONIC_KEY
  const breathSec = (1 / Math.max(0.05, descent.breathHz)).toFixed(0)

  const setLayer = (id: LayerId, v: number) => {
    onChange({ ...mix, layers: { ...mix.layers, [id]: v } })
  }

  const setPad = (v: number) => {
    onChange({ ...mix, padGain: v })
  }

  const setMood = (keyId: HarmonicKeyId) => {
    if (hapticsOn) haptics.play('light')
    onChange({
      ...mix,
      harmonicKey: keyId,
      carrier: HARMONIC_KEYS[keyId].rootHz,
      padGain: padGain > 0.02 ? padGain : 0.52,
    })
  }

  const previewTone = () => {
    if (hapticsOn) haptics.play('light')
    void sound.unlock()
    sound.setHarmonicKey?.(activeKey)
    sound.cue('chime', 0.85)
  }

  const setBand = (next: SleepBandId | 'off') => {
    if (hapticsOn) haptics.play('light')
    if (next === 'off') {
      onChange({ ...mix, band: null })
    } else {
      onChange({ ...mix, band: next, bandGain: mix.bandGain > 0.02 ? mix.bandGain : 0.44 })
    }
  }

  const handleDepth = (next: ModulationDepth) => {
    if (hapticsOn) haptics.play('light')
    setSettings({ modulationDepth: next })
    setTimeout(() => syncDescent(new Date(), 0.6), 0)
  }

  const handleAutoDescent = (enabled: boolean) => {
    if (hapticsOn) haptics.play('light')
    setSettings({ autoDescent: enabled })
    setTimeout(() => syncDescent(new Date(), 0.8), 0)
  }

  return (
    <Sheet open={open} onClose={onClose} label="Sound studio">
      {/* Header + 2-tab progressive disclosure switcher */}
      <View style={styles.head}>
        <Text style={[styles.title, { color: color.ink }]}>Mix</Text>
        <View style={styles.tabWrap}>
          <Segmented label="Mix view" options={STUDIO_TABS} value={tab} onChange={setTab} />
        </View>
        <Button size="sm" variant="ghost" onPress={onReset} style={{ paddingHorizontal: 10 }}>
          Reset
        </Button>
      </View>

      {tab === 'layers' ? (
        <View style={styles.tabBody}>
          {/* 7 vertical tactile ambient faders */}
          <View style={styles.faders}>
            {LAYERS.map((l) => (
              <VerticalFader
                key={l.id}
                label={l.short}
                value={mix.layers[l.id] ?? 0}
                onChange={(v) => setLayer(l.id, v)}
              />
            ))}
          </View>

          {/* Harmonic warmth slider */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionLabel, { color: color.ink3 }]}>Harmonic warmth</Text>
              <Text style={[styles.pctText, { color: padGain > 0.02 ? color.accent : color.ink4 }]}>
                {Math.round(padGain * 100)}%
              </Text>
            </View>
            <Slider value={padGain} onChange={setPad} label="Harmonic warmth" />
          </View>

          {/* Visual harmonic mood icons (replaces technical key jargon) + game cue preview */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionLabel, { color: color.ink3 }]}>Tone &amp; game cues</Text>
              <Pressable onPress={previewTone} style={({ pressed }) => [styles.hearBtn, { opacity: pressed ? 0.7 : 1 }]}>
                <Volume2 size={12} strokeWidth={1.7} color={color.accent} />
                <Text style={[styles.hearText, { color: color.accent }]}>Hear</Text>
              </Pressable>
            </View>
            <View style={styles.moodGrid}>
              {MOOD_CHIPS.map((m) => {
                const active = activeKey === m.id
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setMood(m.id)}
                    style={[
                      styles.moodChip,
                      {
                        backgroundColor: active ? color.accentWash : 'rgba(255,255,255,0.04)',
                        borderColor: active ? color.accentDim : color.line,
                      },
                    ]}
                  >
                    <SoundGlyph icon={m.icon} size={14} color={active ? color.accent : color.ink3} />
                    <Text style={[styles.moodLabel, { color: active ? color.ink : color.ink2 }]}>
                      {m.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.tabBody}>
          {/* Live 60m bedtime descent curve — clean, visual, zero technical fluff */}
          <View style={[styles.curveCard, { borderColor: color.line, backgroundColor: 'rgba(255,255,255,0.03)' }]}>
            <View style={styles.curveTop}>
              <Text style={[styles.curveStatus, { color: descent.autoActive ? color.accent : color.ink3 }]}>
                {descent.autoActive
                  ? descent.minutesToBed && descent.minutesToBed > 0
                    ? `${descent.minutesToBed}m to bedtime`
                    : 'Bedtime descent live'
                  : '60m bedtime descent'}
              </Text>
              <Text style={[styles.curveMeta, { color: color.ink2 }]}>
                {modulationDepth === 'off' ? 'Modulation off' : `${descent.modHz.toFixed(1)} Hz · ${breathSec}s breath`}
              </Text>
            </View>
            <DescentCurve
              preset={preset}
              descent={descent}
              accent={color.accent}
              ink3={color.ink3}
              line={color.line}
            />
          </View>

          {/* Greek brainwave band picker with wave icons */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: color.ink3 }]}>Wave band</Text>
            <View style={styles.bandRow}>
              {[
                { id: 'off' as const, greek: '—', name: 'Off' },
                ...BANDS.map((b) => ({ id: b.id, greek: b.greek, name: b.name })),
              ].map((b) => {
                const active = toneValue === b.id
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => setBand(b.id)}
                    style={[
                      styles.bandChip,
                      {
                        backgroundColor: active ? color.accentWash : 'rgba(255,255,255,0.04)',
                        borderColor: active ? color.accentDim : color.line,
                      },
                    ]}
                  >
                    <MiniWave kind={b.id} color={active ? color.accent : color.ink3} />
                    <Text style={[styles.bandText, { color: active ? color.ink : color.ink2 }]}>
                      {b.id === 'off' ? 'Off' : `${b.greek} ${b.name}`}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          {/* Modulation depth */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: color.ink3 }]}>Pulse depth</Text>
            <Segmented label="Pulse depth" options={DEPTH_OPTIONS} value={modulationDepth} onChange={handleDepth} />
          </View>

          {/* Single clean auto-descent toggle */}
          <View style={[styles.toggleRow, { borderColor: color.line, backgroundColor: 'rgba(255,255,255,0.03)' }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleTitle, { color: color.ink }]}>Auto 60m descent</Text>
              <Text style={[styles.toggleHint, { color: color.ink3 }]}>Slows wave &amp; warmth before bed</Text>
            </View>
            <Toggle label="Auto 60 minute descent" checked={autoDescent} onChange={handleAutoDescent} />
          </View>
        </View>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  tabWrap: {
    width: 176,
  },
  tabBody: {
    gap: 14,
  },
  faders: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  faderCol: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
  },
  faderTrack: {
    width: '100%',
    height: 122,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  faderFill: {
    width: '100%',
  },
  faderLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  section: {
    gap: 7,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  pctText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  hearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(194, 161, 95, 0.14)',
  },
  hearText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  moodChip: {
    width: '31.5%',
    flexGrow: 1,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  moodLabel: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  curveCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 2,
  },
  curveTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  curveStatus: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  curveMeta: {
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
  },
  chartAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: -4,
  },
  axisText: {
    fontSize: 10.5,
    fontWeight: '500',
  },
  bandRow: {
    flexDirection: 'row',
    gap: 7,
  },
  bandChip: {
    flex: 1,
    height: 50,
    borderRadius: 13,
    borderWidth: 1,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  bandText: {
    fontSize: 12,
    fontWeight: '500',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderCurve: 'continuous',
  },
  toggleTitle: {
    fontSize: 14.5,
    fontWeight: '500',
  },
  toggleHint: {
    fontSize: 12,
    marginTop: 1,
  },
})
