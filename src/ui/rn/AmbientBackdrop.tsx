import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import { presetById, type Mix } from '@/core/sound/catalog'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { useReducedMotion } from './hooks'

type Scene = 'rain' | 'waves' | 'fire' | 'wind' | 'binaural'

function dominantScene(mix: Mix | null, presetId: string | null): Scene {
  if (presetId === 'rainfall' || presetId === 'theta-rain') return 'rain'
  if (presetId === 'low-tide') return 'waves'
  if (presetId === 'hearth') return 'fire'
  if (presetId === 'deep-drift') return 'binaural'
  if (!mix) return 'rain'
  const l = mix.layers
  const entries: [Scene, number][] = [
    ['rain', l.rain ?? 0],
    ['waves', l.waves ?? 0],
    ['fire', l.fire ?? 0],
    ['wind', l.wind ?? 0],
    ['binaural', (l.brown ?? 0) + (l.pink ?? 0) + (l.white ?? 0) * 0.5 + (mix.band ? mix.bandGain * 1.4 : 0)],
  ]
  entries.sort((a, b) => b[1] - a[1])
  return entries[0][1] > 0.05 ? entries[0][0] : 'rain'
}

/**
 * Full-screen quiet nocturnal atmosphere driven by the active or selected sound.
 * Uses pure react-native-svg so it renders identically on iOS, Android, and Web
 * without needing native Skia or HTML5 canvas.
 */
export function AmbientBackdrop() {
  const { width, height } = useWindowDimensions()
  const { color } = useTokenColors()
  const playing = useSound((s) => s.playing)
  const soundMix = useSound((s) => s.mix)
  const soundPreset = useSound((s) => s.presetId)
  const savedPreset = useSettings((s) => s.sessionPreset)
  const reduced = useReducedMotion()

  const activePresetId = soundPreset ?? savedPreset ?? 'rainfall'
  const activeMix = soundMix ?? presetById(activePresetId)?.mix ?? null
  const scene = dominantScene(activeMix, playing ? soundPreset : activePresetId)
  const intensity = playing ? 1 : 0.42

  const [t, setT] = useState(0)

  useEffect(() => {
    if (reduced) return
    let mounted = true
    const id = setInterval(() => {
      if (mounted) setT((prev) => prev + 0.04)
    }, 45)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [reduced])

  const rainSeeds = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        x: ((i * 37.3 + 11) % 100) / 100,
        phase: (i * 0.193) % 1,
        speed: 0.24 + (i % 5) * 0.06,
        len: 14 + (i % 4) * 7,
        alpha: 0.1 + (i % 4) * 0.045,
      })),
    [],
  )

  const embers = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        x: 0.14 + ((i * 29.7) % 72) / 100,
        phase: (i * 0.217) % 1,
        speed: 0.045 + (i % 5) * 0.014,
        r: 1.2 + (i % 3) * 0.75,
        sway: 10 + (i % 4) * 7,
        warm: i % 3 !== 0,
      })),
    [],
  )

  const windSeeds = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        y: 0.16 + i * 0.11,
        phase: i * 1.1,
        amp: 10 + (i % 3) * 7,
      })),
    [],
  )

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap]}>
      <Svg width={width} height={height}>
        {scene === 'rain' &&
          rainSeeds.map((d, i) => {
            const p = (d.phase + t * d.speed) % 1
            const x1 = d.x * width - p * 18
            const y1 = p * (height + 40) - 20
            const x2 = x1 - 2.6
            const y2 = y1 + d.len
            const opacity = d.alpha * intensity
            return (
              <Line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={i % 6 === 0 ? color.accent : color.ink2}
                strokeWidth={1}
                strokeOpacity={opacity}
                strokeLinecap="round"
              />
            )
          })}

        {scene === 'waves' &&
          Array.from({ length: 5 }, (_, i) => {
            const baseY = height * (0.62 + i * 0.075)
            const amp = 7 + i * 2.5
            const phase = t * (0.45 + i * 0.08) + i * 1.3
            const pts: string[] = []
            for (let s = 0; s <= 12; s++) {
              const x = (s / 12) * width
              const y = baseY + Math.sin(s * 0.65 + phase) * amp + Math.cos(s * 0.35 - phase * 0.6) * (amp * 0.45)
              pts.push(`${s === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
            }
            return (
              <Path
                key={i}
                d={pts.join(' ')}
                fill="none"
                stroke={i === 2 ? color.accent : color.ink2}
                strokeWidth={1.1}
                strokeOpacity={(0.12 - i * 0.015) * intensity}
              />
            )
          })}

        {scene === 'fire' &&
          embers.map((e, i) => {
            const p = (e.phase + t * e.speed) % 1
            const y = height - p * (height * 0.72)
            const x = e.x * width + Math.sin(t * 1.4 + i) * e.sway
            const fade = Math.sin(p * Math.PI)
            return (
              <Circle
                key={i}
                cx={x}
                cy={y}
                r={e.r}
                fill={e.warm ? color.accent : color.ink2}
                fillOpacity={fade * 0.28 * intensity}
              />
            )
          })}

        {scene === 'wind' &&
          windSeeds.map((w, i) => {
            const baseY = height * w.y
            const drift = ((t * 28 + i * 95) % (width + 240)) - 120
            const d = `M ${drift - 90} ${baseY} Q ${drift} ${baseY - w.amp * Math.sin(t + w.phase)} ${drift + 110} ${baseY + 4}`
            return (
              <Path
                key={i}
                d={d}
                fill="none"
                stroke={i % 2 === 0 ? color.ink2 : color.accent}
                strokeWidth={1}
                strokeOpacity={0.14 * intensity}
                strokeLinecap="round"
              />
            )
          })}

        {scene === 'binaural' &&
          Array.from({ length: 5 }, (_, i) => {
            const cx = width * 0.5
            const cy = height * 0.42
            const breath = Math.sin(t * 0.55 - i * 0.7) * 8
            const r = 68 + i * 44 + breath
            return (
              <Circle
                key={i}
                cx={cx}
                cy={cy}
                r={Math.max(10, r)}
                fill="none"
                stroke={i % 2 === 0 ? color.accent : color.ink3}
                strokeWidth={1}
                strokeOpacity={(0.14 - i * 0.02) * intensity}
              />
            )
          })}
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 0,
    overflow: 'hidden',
  },
})
