/**
 * Dev-variant only: live multipliers for the feel of the pond, and what a
 * frame costs, so it can be tuned and measured on a real phone in bed.
 * Never shown in Beta or the App Store build.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { DEFAULT_TUNING, type PondTuning } from '@/core/games/pond/engine'
import { useTokenColors } from '@/ui/hooks/useTokenColors'

export interface PondMetrics {
  /** JS thread: simulation plus snapshot, per frame. */
  jsMs: number
  /** UI thread: recording the frame's picture. */
  uiMs: number
  fps: number
}

const ROWS: readonly { key: keyof PondTuning; label: string }[] = [
  { key: 'breath', label: 'Breath (lasso length)' },
  { key: 'speed', label: 'Swim speed' },
  { key: 'closure', label: 'Loop closure' },
]

const STEP = 0.1
const MIN = 0.3
const MAX = 3

export function PondTuningPanel({
  tuning,
  metrics,
  onChange,
  onClose,
}: {
  tuning: PondTuning
  metrics: PondMetrics
  onChange: (next: PondTuning) => void
  onClose: () => void
}) {
  const { color } = useTokenColors()
  const set = (key: keyof PondTuning, delta: number) => {
    const v = Math.round(Math.min(MAX, Math.max(MIN, tuning[key] + delta)) * 10) / 10
    onChange({ ...tuning, [key]: v })
  }
  return (
    <View style={[styles.panel, { backgroundColor: color.surface1, borderColor: color.lineStrong }]}>
      <Text style={[styles.metrics, { color: color.ink3 }]}>
        {`JS ${metrics.jsMs.toFixed(1)} ms · UI ${metrics.uiMs.toFixed(1)} ms · ${Math.round(metrics.fps)} fps`}
      </Text>
      {ROWS.map((row) => (
        <View key={row.key} style={styles.row}>
          <Text style={[styles.label, { color: color.ink2 }]}>{row.label}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Less ${row.label}`} onPress={() => set(row.key, -STEP)} style={styles.btn}>
            <Text style={[styles.btnText, { color: color.ink }]}>−</Text>
          </Pressable>
          <Text style={[styles.value, { color: color.accent }]}>{`×${tuning[row.key].toFixed(1)}`}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`More ${row.label}`} onPress={() => set(row.key, STEP)} style={styles.btn}>
            <Text style={[styles.btnText, { color: color.ink }]}>+</Text>
          </Pressable>
        </View>
      ))}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => onChange(DEFAULT_TUNING)} style={styles.action}>
          <Text style={[styles.actionText, { color: color.ink3 }]}>Reset</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.action}>
          <Text style={[styles.actionText, { color: color.ink2 }]}>Done</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  metrics: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  btn: {
    width: 36,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 18,
  },
  value: {
    width: 48,
    textAlign: 'center',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 18,
    paddingTop: 6,
  },
  action: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
  },
})
