import { useRef } from 'react'
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { LAYERS, normalizeBand, type LayerId, type Mix, type SleepBandId } from '@/core/sound/catalog'
import { DEFAULT_HARMONIC_KEY, HARMONIC_KEYS, type HarmonicKeyId } from '@/core/sound/harmonics'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Button, Segmented, Sheet, Slider } from './controls'

const KEY_CHIPS: { id: HarmonicKeyId; short: string }[] = [
  { id: 'd-dorian', short: 'D Dor' },
  { id: 'f-lydian', short: 'F Lyd' },
  { id: 'c-maj9', short: 'C Maj9' },
  { id: 'g-min9', short: 'G Min9' },
  { id: 'a-min9', short: 'A Min9' },
]

const TONE_OPTIONS: { value: SleepBandId | 'off'; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'delta', label: 'Delta' },
  { value: 'theta', label: 'Theta' },
  { value: 'alpha', label: 'Alpha' },
]

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
  const heightRef = useRef(126)
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
            backgroundColor: color.surface2,
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

export function MixSheet({
  open,
  onClose,
  mix,
  onChange,
  onReset,
}: {
  open: boolean
  onClose: () => void
  mix: Mix
  onChange: (next: Mix) => void
  onReset: () => void
}) {
  const { color } = useTokenColors()
  const activeBand = normalizeBand(mix.band)
  const toneValue: SleepBandId | 'off' = activeBand && mix.bandGain > 0.02 ? activeBand : 'off'
  const padGain = mix.padGain ?? 0
  const activeKey: HarmonicKeyId = mix.harmonicKey ?? DEFAULT_HARMONIC_KEY

  const setLayer = (id: LayerId, v: number) => {
    onChange({ ...mix, layers: { ...mix.layers, [id]: v } })
  }

  const setPad = (v: number) => {
    onChange({ ...mix, padGain: v })
  }

  const setKey = (keyId: HarmonicKeyId) => {
    onChange({
      ...mix,
      harmonicKey: keyId,
      carrier: HARMONIC_KEYS[keyId].rootHz,
      padGain: padGain > 0.02 ? padGain : 0.48,
    })
  }

  const setTone = (next: SleepBandId | 'off') => {
    if (next === 'off') {
      onChange({ ...mix, band: null })
    } else {
      onChange({ ...mix, band: next, bandGain: mix.bandGain > 0.02 ? mix.bandGain : 0.42 })
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Mix layers">
      <View style={styles.head}>
        <Text style={[styles.title, { color: color.ink }]}>Mix</Text>
        <Button size="sm" variant="ghost" onPress={onReset}>
          Reset
        </Button>
      </View>

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

      <View style={styles.padSection}>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionLabel, { color: color.ink3 }]}>Harmonic pad</Text>
          <Text style={[styles.pctText, { color: padGain > 0.02 ? color.accent : color.ink4 }]}>
            {Math.round(padGain * 100)}%
          </Text>
        </View>
        <Slider value={padGain} onChange={setPad} label="Harmonic pad level" />
      </View>

      <View style={styles.toneSection}>
        <Text style={[styles.sectionLabel, { color: color.ink3 }]}>Harmonic key</Text>
        <View style={styles.keyRow}>
          {KEY_CHIPS.map((k) => {
            const active = activeKey === k.id
            return (
              <Pressable
                key={k.id}
                onPress={() => setKey(k.id)}
                style={[
                  styles.keyChip,
                  {
                    backgroundColor: active ? color.accentWash : color.surface2,
                    borderColor: active ? color.accentDim : color.line,
                  },
                ]}
              >
                <Text style={[styles.keyText, { color: active ? color.accent : color.ink2 }]}>
                  {k.short}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={styles.toneSection}>
        <Text style={[styles.sectionLabel, { color: color.ink3 }]}>Neural modulation band</Text>
        <Segmented
          label="Neural modulation band"
          options={TONE_OPTIONS}
          value={toneValue}
          onChange={setTone}
        />
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  faders: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  faderCol: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  faderTrack: {
    width: '100%',
    height: 126,
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
  padSection: {
    marginTop: 18,
    gap: 4,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pctText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  toneSection: {
    marginTop: 14,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  keyRow: {
    flexDirection: 'row',
    gap: 6,
  },
  keyChip: {
    flex: 1,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
})
