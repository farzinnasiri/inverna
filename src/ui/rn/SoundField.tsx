import { useEffect, useRef, useState } from 'react'
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import type { Mix } from '@/core/sound/catalog'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useReducedMotion } from './hooks'

export function SoundField({
  mix,
  playing,
  label,
  onToggle,
  onSwipe,
}: {
  mix: Mix
  playing: boolean
  label: string
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
    const id = setInterval(() => {
      setPhase((p) => p + (playing ? 0.055 : 0.015))
    }, 45)
    return () => clearInterval(id)
  }, [playing, reduced])

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

  const size = 248
  const c = size / 2
  const l = mix.layers
  const activeEnergy =
    (l.rain ?? 0) +
    (l.waves ?? 0) +
    (l.fire ?? 0) +
    (l.wind ?? 0) +
    (l.brown ?? 0) +
    (l.pink ?? 0) +
    (l.white ?? 0) +
    (mix.band ? mix.bandGain : 0)
  const norm = Math.min(1, activeEnergy / 2.2)

  // Generate 3 organic watchmaker wave rings inside the circular field
  const rings = [0, 1, 2].map((idx) => {
    const baseR = 46 + idx * 24 + (playing ? Math.sin(phase * 0.9 - idx) * 3.5 : 0)
    const pts: string[] = []
    const steps = 48
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2
      const wobble =
        Math.sin(a * (3 + idx) + phase * (1.1 + idx * 0.25)) * (3 + norm * 5.5) * (playing ? 1 : 0.35) +
        Math.cos(a * 5 - phase * 0.7) * (1.6 + (l.waves ?? 0) * 4)
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
          styles.orb,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color.surface1,
            borderColor: playing ? color.accentDim : color.lineStrong,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          },
        ]}
      >
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
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
              strokeWidth={i === 1 ? 1.4 : 1}
              strokeOpacity={playing ? 0.65 - i * 0.14 : 0.25 - i * 0.05}
            />
          ))}

          <Circle
            cx={c}
            cy={c}
            r={playing ? 12 + Math.sin(phase * 1.4) * 1.8 : 9}
            fill={playing ? color.accent : color.surface3}
            fillOpacity={playing ? 0.9 : 1}
          />
        </Svg>

        <View pointerEvents="none" style={styles.caption}>
          <Text style={[styles.stateText, { color: playing ? color.accent : color.ink3 }]}>
            {playing ? 'Playing' : 'Tap to play'}
          </Text>
        </View>
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
    bottom: 28,
    alignItems: 'center',
  },
  stateText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
})
