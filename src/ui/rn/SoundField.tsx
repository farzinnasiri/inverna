import { useState } from 'react'
import { PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useIsFocused } from 'expo-router'
import { Play } from 'lucide-react-native'
import { paletteFamily, resolveBackdrop, SCENE_PALETTES } from '@/core/backdrop/scenes'
import type { Mix, SoundIconId } from '@/core/sound/catalog'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { GlassLens } from './Glass'
import { useCovered } from './ambientClock'
import { useAppActive, useReducedMotion } from './hooks'
import { LensLight } from './sound/LensLight'
import { SoundGlyph } from './SoundGlyph'

/** A stable small number per sound, so each one draws its own rings. */
function shapeFor(key: string): number {
  let h = 7
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h
}

/**
 * The sound orb: a lens of real glass with the sound's light inside it.
 *
 * - The glass (GlassLens) is clear native Liquid Glass: it bends the living
 *   scene behind it rather than showing a disc of its own.
 * - The light (LensLight, Skia) is three closed rings drawn as glowing
 *   harmonographs, a rim lit in the scene's colours, and light pooling low
 *   inside. Each sound draws its own rings; they breathe with the sound.
 * - Playing shows itself: the rings move and glow, with the sound's icon at
 *   the centre. Paused, they settle into still, dim circles around a play
 *   sign. No caption.
 *
 * Tap to play or pause; swipe sideways to move to the next sound.
 */
export function SoundField({
  mix,
  presetId,
  playing,
  label,
  icon,
  breathHz = 0.1,
  onToggle,
  onSwipe,
  size: sizeProp,
}: {
  /** Diameter; the screen sizes it to fit. Defaults to a size from the window. */
  size?: number
  mix: Mix
  /** The preset playing or shown, for its scene colours and its own ring pattern. */
  presetId: string | null
  playing: boolean
  label: string
  icon: SoundIconId
  breathHz?: number
  onToggle: () => void
  onSwipe?: (dir: -1 | 1) => void
}) {
  const { color } = useTokenColors()
  const reduced = useReducedMotion()
  const focused = useIsFocused()
  const appActive = useAppActive()
  const covered = useCovered()
  const onSwipeRef = useSharedRef(onSwipe)

  const [panResponder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > 36 && onSwipeRef.current) {
          onSwipeRef.current(g.dx < 0 ? 1 : -1)
        }
      },
    }),
  )

  const { width, height } = useWindowDimensions()
  const size = sizeProp ?? Math.min(232, Math.max(184, Math.round(Math.min(width - 120, height * 0.27))))

  // How much the sound moves: its layers, its pad, its pulse.
  const l = mix.layers
  const energy =
    (l.rain ?? 0) +
    (l.waves ?? 0) +
    (l.fire ?? 0) +
    (l.wind ?? 0) +
    (l.brown ?? 0) +
    (l.pink ?? 0) +
    (l.white ?? 0) +
    (mix.padGain ?? 0) * 0.8 +
    (mix.band ? mix.bandGain : 0)
  const motion = Math.min(1, energy / 2.4)

  // The glass takes its light from the scene behind it.
  const palette = SCENE_PALETTES[paletteFamily(resolveBackdrop(presetId, mix))]
  const iconSize = Math.round(size * 0.17)

  return (
    <View {...panResponder.panHandlers} style={styles.wrap}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={playing ? `Pause ${label}` : `Play ${label}`}
        style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.97 : 1 }] }]}
      >
        <GlassLens size={size} rim={false} interactive>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <LensLight
              size={size}
              playing={playing}
              animate={focused && appActive && !reduced && !covered}
              motion={motion}
              shape={shapeFor(presetId ?? label)}
              breathHz={breathHz}
              light={palette.detail}
              bounce={palette.caustic}
              accent={color.accent}
            />
          </View>
          <View pointerEvents="none" style={styles.center}>
            {playing ? (
              <SoundGlyph icon={icon} size={iconSize} color={color.accent} />
            ) : (
              <Play size={Math.round(iconSize * 0.9)} strokeWidth={1.6} color={color.ink} fill={color.ink} style={styles.play} />
            )}
          </View>
        </GlassLens>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A play triangle's weight sits left of its box; nudge it to look centred.
  play: {
    marginLeft: 4,
  },
})

/** Latest value in a ref without re-creating handlers. */
function useSharedRef<T>(value: T): { current: T } {
  const [ref] = useState(() => ({ current: value }))
  ref.current = value
  return ref
}
