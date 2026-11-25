import { StyleSheet, Text, View } from 'react-native'
import { useTokenColors } from '@/ui/hooks/useTokenColors'

const TICKS = Array.from({ length: 25 }, (_, i) => i)

/**
 * Watchmaker-grade graduated Evening Timeline.
 */
export function Horizon({
  progress = 0.5,
  startLabel,
  endLabel,
}: {
  progress?: number
  startLabel: string
  endLabel: string
}) {
  const { color } = useTokenColors()
  const p = Math.min(1, Math.max(0, progress))

  return (
    <View style={styles.wrap} accessible={false}>
      <View style={styles.track}>
        <View style={[styles.bar, { backgroundColor: color.lineStrong }]} />
        <View style={styles.ticks}>
          {TICKS.map((i) => {
            const frac = i / (TICKS.length - 1)
            const major = i % 6 === 0
            const passed = frac <= p + 0.005
            return (
              <View
                key={i}
                style={[
                  styles.tick,
                  {
                    height: major ? 10 : 5,
                    backgroundColor: passed ? color.accentDim : color.ink4,
                    opacity: passed ? 0.9 : major ? 0.7 : 0.45,
                  },
                ]}
              />
            )
          })}
        </View>
        <View
          style={[
            styles.needle,
            {
              backgroundColor: color.accent,
              left: `${p * 100}%`,
            },
          ]}
        />
      </View>
      <View style={styles.anchors}>
        <Text style={[styles.anchorText, { color: color.ink3 }]}>{startLabel}</Text>
        <Text style={[styles.anchorText, { color: color.ink3 }]}>{endLabel}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    gap: 6,
  },
  track: {
    height: 18,
    justifyContent: 'center',
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  ticks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  tick: {
    width: 1,
  },
  needle: {
    position: 'absolute',
    width: 2,
    height: 16,
    marginLeft: -1,
    borderRadius: 1,
  },
  anchors: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  anchorText: {
    fontSize: 11.5,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
})
