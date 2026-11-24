import { useEffect, useRef, useState } from 'react'
import { PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Defs, Line, Path, RadialGradient, Stop } from 'react-native-svg'
import type { Mix, SoundIconId } from '@/core/sound/catalog'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { GlassSurface } from './Glass'
import { useReducedMotion } from './hooks'
import { SoundGlyph } from './SoundGlyph'

/**
 * Watchmaker Acoustic Dial:
 * - Precision watch bezel ticks + 3 breathing 0.1 Hz harmonic wave rings
 * - Clean floating center icon (no heavy medallion circle) directly inside the acoustic field
 * - Swipe left/right to glide between soundscapes, tap to play/pause
 */
export function SoundField({
  mix,
  playing,
  label,
  icon,
  breathHz = 0.1,
  onToggle,
  onSwipe,
}: {
  mix: Mix
  playing: boolean
  label: string
  icon: SoundIconId
  breathHz?: number
  onToggle: () => void
  onSwipe?: (dir: -1 | 1) => void
}) {
  const { color } = useTokenColors()
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState(0)
  const onSwipeRef = useRef(onSwipe)
  onSwipeRef.current = onSwipe

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
  const size = Math.min(212, Math.max(174, Math.round(Math.min(width - 134, height * 0.245))))
  const vb = 260
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

  // 3 organic watchmaker acoustic rings breathing in sync with the 0.1 Hz resonance swell
  const rings = [0, 1, 2].map((idx) => {
    const baseR = 48 + idx * 26 + (playing ? Math.sin(phase - idx * 0.65) * 4.5 : 0)
    const pts: string[] = []
    const steps = 48
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2
      const wobble =
        Math.sin(a * (3 + idx) + phase * (1.45 + idx * 0.28)) * (2.6 + norm * 5.2) * (playing ? 1 : 0.28) +
        Math.cos(a * 5 - phase * 0.85) * (1.3 + (l.waves ?? 0) * 3.5 + (mix.padGain ?? 0) * 1.5)
      const r = baseR + wobble
      const x = c + Math.cos(a) * r
      const y = c + Math.sin(a) * r
      pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    }
    pts.push('Z')
    return pts.join(' ')
  })

  // Precision watchmaker bezel ticks
  const bezelTicks = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2
    const major = i % 4 === 0
    const r1 = 118
    const r2 = major ? 126 : 122
    return {
      x1: c + Math.cos(a) * r1,
      y1: c + Math.sin(a) * r1,
      x2: c + Math.cos(a) * r2,
      y2: c + Math.sin(a) * r2,
      major,
    }
  })

  const iconSize = Math.round(size * 0.19)

  return (
    <View {...panResponder.panHandlers} style={styles.wrap}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={playing ? `Pause ${label}` : `Play ${label}`}
        style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.975 : 1 }] }]}
      >
        <GlassSurface
          variant="elevated"
          radius={size / 2}
          accent={playing}
          style={[styles.orb, { width: size, height: size }]}
        >
          <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`}>
            <Defs>
              <RadialGradient id="dialCoreHalo" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={color.accent} stopOpacity={playing ? 0.26 : 0.08} />
                <Stop offset="52%" stopColor={color.accent} stopOpacity={playing ? 0.07 : 0.02} />
                <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </RadialGradient>
            </Defs>

            <Circle cx={c} cy={c} r={playing ? 86 + breathWave * 8 : 74} fill="url(#dialCoreHalo)" />

            {bezelTicks.map((tk, i) => (
              <Line
                key={i}
                x1={tk.x1}
                y1={tk.y1}
                x2={tk.x2}
                y2={tk.y2}
                stroke={playing && tk.major ? color.accent : color.ink4}
                strokeWidth={tk.major ? 1.35 : 0.8}
                strokeOpacity={playing ? (tk.major ? 0.78 : 0.42) : 0.32}
              />
            ))}

            {rings.map((d, i) => (
              <Path
                key={i}
                d={d}
                fill="none"
                stroke={i === 1 ? color.accent : color.ink2}
                strokeWidth={i === 1 ? 1.55 : 1}
                strokeOpacity={playing ? 0.72 - i * 0.14 : 0.24 - i * 0.05}
              />
            ))}
          </Svg>

          {/* Clean floating soundscape icon at the center — no inner disc or heavy border */}
          <View pointerEvents="none" style={styles.centerIcon}>
            <SoundGlyph icon={icon} size={iconSize} color={playing ? color.accent : color.ink} />
          </View>

          <View pointerEvents="none" style={styles.caption}>
            <Text style={[styles.stateText, { color: playing ? color.accent : color.ink3 }]}>
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
  centerIcon: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    position: 'absolute',
    bottom: 16,
    alignItems: 'center',
  },
  stateText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
})
