import { useEffect, useRef, useState } from 'react'
import { PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import type { Mix } from '@/core/sound/catalog'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { GlassSurface } from './Glass'
import { useReducedMotion } from './hooks'

export function SoundField({
  mix,
  playing,
  label,
  breathHz = 0.1,
  onToggle,
  onSwipe,
}: {
  mix: Mix
  playing: boolean
  label: string
  /** Live cardiorespiratory swell frequency in Hz (~0.10 Hz = 10s cycle). */
  breathHz?: number
  onToggle: () => void
  onSwipe?: (dir: -1 | 1) => void
}) {
  const { color } = useTokenColors()
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState(0)
  const onSwipeRef = useRef(onSwipe)
  onSwipeRef.current = onSwipe
  const onToggleRef = useRef(onToggle)
  onToggleRef.current = onToggle

  useEffect(() => {
    if (reduced) return
    const stepRad = Math.PI * 2 * Math.max(0.06, breathHz) * 0.045
    const id = setInterval(() => {
      setPhase((p) => p + (playing ? stepRad : 0.012))
    }, 45)
    return () => clearInterval(id)
  }, [playing, reduced, breathHz])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > 36 && onSwipeRef.current) {
          onSwipeRef.current(g.dx < 0 ? 1 : -1)
        }
      },
    }),
  ).current

  const { width, height } = useWindowDimensions()
  const size = Math.min(176, Math.max(142, Math.round(Math.min(width - 154, height * 0.21))))
  const vb = 248
  const c = vb / 2
  const l = mix.layers
  const activeEnergy =
    (l.rain ?? 0) +
    (l.waves ?? 0) +
    (l.fire ?? 0) +
    (l.wind ?? 0) +
    (l.brown ?? 0) +
    (l.pink ?? 0) +
    (l.white ?? 0) +
    (mix.padGain ?? 0) * 0.8 +
    (mix.band ? mix.bandGain : 0)
  const norm = Math.min(1, activeEnergy / 2.4)
  const breathWave = Math.sin(phase)

  // Generate 3 organic watchmaker acoustic rings breathing in sync with the 0.1 Hz resonance swell
  const rings = [0, 1, 2].map((idx) => {
    const baseR = 45 + idx * 24 + (playing ? Math.sin(phase - idx * 0.65) * 4.2 : 0)
    const pts: string[] = []
    const steps = 48
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2
      const wobble =
        Math.sin(a * (3 + idx) + phase * (1.5 + idx * 0.3)) * (2.6 + norm * 5.2) * (playing ? 1 : 0.32) +
        Math.cos(a * 5 - phase * 0.9) * (1.4 + (l.waves ?? 0) * 3.8 + (mix.padGain ?? 0) * 1.6)
      const r = baseR + wobble
      const x = c + Math.cos(a) * r
      const y = c + Math.sin(a) * r
      pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    }
    pts.push('Z')
    return pts.join(' ')
  })

  // Radial bezel ticks like a watch dial
  const bezelTicks = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2
    const major = i % 3 === 0
    const r1 = 114
    const r2 = major ? 120 : 117
    return {
      x1: c + Math.cos(a) * r1,
      y1: c + Math.sin(a) * r1,
      x2: c + Math.cos(a) * r2,
      y2: c + Math.sin(a) * r2,
      major,
    }
  })

  return (
    <View {...panResponder.panHandlers} style={styles.wrap}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={playing ? `Stop ${label}` : `Play ${label}`}
        style={({ pressed }) => [
          { transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
      >
        <GlassSurface
          variant="elevated"
          radius={size / 2}
          accent={playing}
          style={[styles.orb, { width: size, height: size }]}
        >
          <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`}>
            {bezelTicks.map((tk, i) => (
              <Line
                key={i}
                x1={tk.x1}
                y1={tk.y1}
                x2={tk.x2}
                y2={tk.y2}
                stroke={playing && tk.major ? color.accentDim : color.ink4}
                strokeWidth={tk.major ? 1.2 : 0.8}
                strokeOpacity={playing ? 0.85 : 0.45}
              />
            ))}

            {rings.map((d, i) => (
              <Path
                key={i}
                d={d}
                fill="none"
                stroke={i === 1 ? color.accent : color.ink2}
                strokeWidth={i === 1 ? 1.45 : 1}
                strokeOpacity={playing ? 0.68 - i * 0.14 : 0.25 - i * 0.05}
              />
            ))}

            <Circle
              cx={c}
              cy={c}
              r={playing ? 11.5 + breathWave * 2.2 : 9}
              fill={playing ? color.accent : color.surface3}
              fillOpacity={playing ? 0.92 : 1}
            />
          </Svg>

          <View pointerEvents="none" style={styles.caption}>
            <Text style={[styles.stateText, { color: playing ? color.accent : color.ink2 }]}>
              {playing ? 'Playing' : 'Tap to play'}
            </Text>
          </View>
        </GlassSurface>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  caption: {
    position: 'absolute',
    bottom: 14,
    alignItems: 'center',
  },
  stateText: {
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
})
