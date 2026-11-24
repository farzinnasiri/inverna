import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg'
import { Activity, Music2, Sparkles, Waves } from 'lucide-react-native'
import { sampleDescentCurve, type DescentSnapshot, type ModulationDepth } from '@/core/sound/arc'
import type { Preset } from '@/core/sound/catalog'
import { harmonicKeyMeta, type HarmonicKeyId } from '@/core/sound/harmonics'
import { haptics, sound } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { Segmented, Sheet, Toggle } from './controls'
import { GlassSurface } from './Glass'

const DEPTH_OPTIONS: { value: ModulationDepth; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'deep', label: 'Deep' },
]

function formatCutoff(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`
}

function DescentCurveChart({
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
  const h = 92
  const padX = 12
  const padTop = 14
  const padBot = 20
  const innerW = w - padX * 2
  const innerH = h - padTop - padBot

  const pts = sampleDescentCurve(preset, 28)
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
    <View style={styles.chartWrap}>
      <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="descentFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <Stop offset="100%" stopColor={accent} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Phase guide dividers (Unwind | Drift | Still) */}
        <Line x1={toX(0.42)} y1={padTop} x2={toX(0.42)} y2={h - padBot} stroke={line} strokeDasharray="3 4" strokeWidth={1} />
        <Line x1={toX(0.76)} y1={padTop} x2={toX(0.76)} y2={h - padBot} stroke={line} strokeDasharray="3 4" strokeWidth={1} />
        <Line x1={padX} y1={h - padBot} x2={w - padX} y2={h - padBot} stroke={line} strokeWidth={1} />

        <Path d={areaPath} fill="url(#descentFill)" />
        <Path d={linePath} fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" />

        {/* Live position beacon */}
        <Circle cx={dotX} cy={dotY} r={8} fill={accent} fillOpacity={0.22} />
        <Circle cx={dotX} cy={dotY} r={4} fill={accent} />
      </Svg>

      <View style={styles.chartAxis}>
        <Text style={[styles.axisText, { color: descent.phase === 'unwind' ? accent : ink3 }]}>T-60m Unwind</Text>
        <Text style={[styles.axisText, { color: descent.phase === 'drift' ? accent : ink3 }]}>T-30m Drift</Text>
        <Text style={[styles.axisText, { color: descent.phase === 'still' ? accent : ink3 }]}>Bedtime Still</Text>
      </View>
    </View>
  )
}

/**
 * Quiet, opt-in inspector sheet opened only when tapping the neuroacoustic
 * telemetry pill on the Sounds screen. Surfaces Lull's on-device psychoacoustic
 * sophistication without cluttering the serene main surface.
 */
export function AcousticEngineSheet({
  open,
  onClose,
  preset,
  harmonicKey,
}: {
  open: boolean
  onClose: () => void
  preset: Preset | null | undefined
  harmonicKey: HarmonicKeyId
}) {
  const { color } = useTokenColors()
  const descent = useSound((s) => s.descent)
  const syncDescent = useSound((s) => s.syncDescent)

  const modulationDepth = useSettings((s) => s.modulationDepth)
  const autoDescent = useSettings((s) => s.autoDescent)
  const hapticsOn = useSettings((s) => s.haptics)
  const setSettings = useSettings((s) => s.set)

  const keyMeta = harmonicKeyMeta(harmonicKey)
  const breathSec = (1 / Math.max(0.05, descent.breathHz)).toFixed(1)

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

  const previewHarmonicNote = () => {
    if (hapticsOn) haptics.play('light')
    void sound.unlock()
    sound.setHarmonicKey?.(harmonicKey)
    sound.cue('chime', 0.85)
  }

  return (
    <Sheet open={open} onClose={onClose} label="Acoustic engine">
      <View style={styles.body}>
        <View style={styles.head}>
          <View style={styles.headRow}>
            <Text style={[styles.title, { color: color.ink }]}>Acoustic Engine</Text>
            <View style={[styles.phaseTag, { borderColor: color.accentDim, backgroundColor: color.accentWash }]}>
              <Text style={[styles.phaseTagText, { color: color.accent }]}>
                {descent.phaseLabel} · {descent.bandLabel}
              </Text>
            </View>
          </View>
          <Text style={[styles.subtitle, { color: color.ink2 }]}>
            100% real-time on-device synthesis. Smoothly steps frequency and warmth down across the hour before bed.
          </Text>
        </View>

        {/* Live 60-minute Iso-descent curve + telemetry */}
        <GlassSurface variant="card" radius={20} style={styles.card}>
          <DescentCurveChart
            preset={preset}
            descent={descent}
            accent={color.accent}
            ink3={color.ink3}
            line={color.line}
          />
          <View style={[styles.metricsRow, { borderTopColor: color.line }]}>
            <View style={styles.metric}>
              <Text style={[styles.metricVal, { color: color.ink }]}>
                {modulationDepth === 'off' ? 'Off' : `${descent.modHz.toFixed(1)} Hz`}
              </Text>
              <Text style={[styles.metricLab, { color: color.ink3 }]}>Phase AM</Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricVal, { color: color.ink }]}>{breathSec}s</Text>
              <Text style={[styles.metricLab, { color: color.ink3 }]}>Breath swell</Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricVal, { color: color.ink }]}>{formatCutoff(descent.masterCutoffHz)}</Text>
              <Text style={[styles.metricLab, { color: color.ink3 }]}>Warmth cap</Text>
            </View>
          </View>
        </GlassSurface>

        {/* Neural modulation intensity */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionLabel, { color: color.ink3 }]}>Modulation depth</Text>
            <Text style={[styles.sectionHint, { color: color.ink4 }]}>Works on speakers &amp; headphones</Text>
          </View>
          <Segmented
            label="Modulation depth"
            options={DEPTH_OPTIONS}
            value={modulationDepth}
            onChange={handleDepth}
          />
        </View>

        {/* Bedtime descent toggle + harmonic game key preview */}
        <GlassSurface variant="card" radius={20} style={styles.listCard}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: color.ink }]}>60m bedtime descent</Text>
              <Text style={[styles.rowHint, { color: color.ink3 }]}>
                Automatically glides from Alpha toward Delta before lights out
              </Text>
            </View>
            <Toggle label="60 minute bedtime descent" checked={autoDescent} onChange={handleAutoDescent} />
          </View>

          <View style={[styles.row, styles.rowDiv, { borderTopColor: color.line }]}>
            <View style={styles.keyLeft}>
              <Music2 size={16} strokeWidth={1.65} color={color.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: color.ink }]}>Game cues · {keyMeta.label}</Text>
                <Text style={[styles.rowHint, { color: color.ink3 }]}>
                  Every puzzle move plays in key with tonight&apos;s soundscape
                </Text>
              </View>
            </View>
            <Pressable
              onPress={previewHarmonicNote}
              style={({ pressed }) => [
                styles.previewBtn,
                {
                  borderColor: color.accentDim,
                  backgroundColor: color.accentWash,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <Text style={[styles.previewText, { color: color.accent }]}>Hear</Text>
            </Pressable>
          </View>
        </GlassSurface>

        {/* Concise psychoacoustic foundation */}
        <View style={styles.pillars}>
          <View style={styles.pillar}>
            <Activity size={13} strokeWidth={1.7} color={color.accent} />
            <Text style={[styles.pillarText, { color: color.ink3 }]}>
              Amplitude modulation drives cortical phase-locking without harsh sine buzz.
            </Text>
          </View>
          <View style={styles.pillar}>
            <Waves size={13} strokeWidth={1.7} color={color.accent} />
            <Text style={[styles.pillarText, { color: color.ink3 }]}>
              0.1 Hz swells mirror calm 6-breath/min baroreflex resonance over a 1/f noise floor.
            </Text>
          </View>
          <View style={styles.pillar}>
            <Sparkles size={13} strokeWidth={1.7} color={color.accent} />
            <Text style={[styles.pillarText, { color: color.ink3 }]}>
              Synthesized live on your device in native C++ audio. Zero files, zero cloud.
            </Text>
          </View>
        </View>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 14,
  },
  head: {
    gap: 5,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    fontSize: 21,
    fontWeight: '600',
    letterSpacing: -0.35,
  },
  phaseTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  phaseTagText: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18.5,
  },
  card: {
    paddingTop: 8,
    overflow: 'hidden',
  },
  chartWrap: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  chartAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginTop: -4,
  },
  axisText: {
    fontSize: 10.5,
    fontWeight: '500',
  },
  metricsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 11,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricVal: {
    fontSize: 14.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  metricLab: {
    fontSize: 11,
  },
  section: {
    gap: 8,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  sectionHint: {
    fontSize: 11.5,
  },
  listCard: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  rowDiv: {
    borderTopWidth: 1,
  },
  keyLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowTitle: {
    fontSize: 14.5,
    fontWeight: '500',
  },
  rowHint: {
    fontSize: 12,
    lineHeight: 16.5,
    marginTop: 2,
  },
  previewBtn: {
    height: 32,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  pillars: {
    gap: 7,
    paddingHorizontal: 2,
  },
  pillar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  pillarText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
  },
})
