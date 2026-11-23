import { useRef } from 'react'
import { PanResponder, StyleSheet, Text, View } from 'react-native'
import { LAYERS, normalizeBand, type LayerId, type Mix, type SleepBandId } from '@/core/sound/catalog'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Button, Segmented, Sheet } from './controls'

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
  const heightRef = useRef(132)
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

  const setLayer = (id: LayerId, v: number) => {
    onChange({ ...mix, layers: { ...mix.layers, [id]: v } })
  }

  const setTone = (next: SleepBandId | 'off') => {
    if (next === 'off') {
      onChange({ ...mix, band: null })
    } else {
      onChange({ ...mix, band: next, bandGain: mix.bandGain > 0.02 ? mix.bandGain : 0.35 })
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Mix layers">
      <View style={styles.head}>
        <Text style={[styles.title, { color: color.ink }]}>Mix</Text>
        <Button size="sm" variant="ghost" onPress={onReset}>
          Clear
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

      <View style={styles.toneSection}>
        <Text style={[styles.sectionLabel, { color: color.ink3 }]}>Binaural tone</Text>
        <Segmented
          label="Binaural tone"
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
    marginBottom: 16,
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
    height: 136,
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
  toneSection: {
    marginTop: 20,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12.5,
    fontWeight: '500',
  },
})
