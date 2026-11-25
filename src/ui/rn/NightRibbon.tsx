import { useRef, useState } from 'react'
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { Moon } from 'lucide-react-native'
import { formatBedtime12h, RIBBON_SPAN_MIN, ribbonBedtime } from '@/core/night'
import { useTokenColors } from '@/ui/hooks/useTokenColors'

const HOUR_MARKS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
  offset: i * 60,
  label: i === 4 ? '12' : String(((8 + i - 1) % 12) + 1),
}))

/** Raw ribbon position (minutes) snapped to 15 and kept on the ribbon. */
function snap(raw: number): number {
  return Math.min(RIBBON_SPAN_MIN, Math.max(0, Math.round(raw / 15) * 15))
}

/**
 * The night from 8 PM to 3 AM with midnight marked. Drag the moon to pick a
 * bedtime; it snaps to 15 minutes with a soft tick. Positions are minutes
 * after 8 PM (see `ribbonOffset` in core/night).
 *
 * - `earliest`: the moon can't go left of this (tonight can't end in the past).
 * - `spanFrom`: where the brass span starts; it runs to the moon.
 * - `nowAt`: draws a "now" line when it's on the ribbon.
 */
export function NightRibbon({
  offset,
  onChange,
  earliest = 0,
  spanFrom = 0,
  nowAt = null,
}: {
  offset: number
  onChange: (offset: number) => void
  earliest?: number
  spanFrom?: number
  nowAt?: number | null
}) {
  const { color } = useTokenColors()
  const [trackW, setTrackW] = useState(0)

  const live = useRef({ trackW, earliest, offset, onChange })
  live.current = { trackW, earliest, offset, onChange }
  const [pan] = useState(() => {
    const setFromX = (x: number) => {
      const { trackW: w, earliest: e, offset: prev, onChange: emit } = live.current
      if (w <= 0) return
      const next = Math.max(e, snap((x / w) * RIBBON_SPAN_MIN))
      if (next !== prev) emit(next)
    }
    // Anchor on where the finger landed, then follow the gesture's dx.
    let startX = 0
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        startX = e.nativeEvent.locationX
        setFromX(startX)
      },
      onPanResponderMove: (_, g) => setFromX(startX + g.dx),
    })
  })

  const nudge = (mins: number) => {
    const next = Math.max(earliest, Math.min(RIBBON_SPAN_MIN, offset + mins))
    if (next !== offset) onChange(next)
  }

  const x = (off: number) => (trackW * off) / RIBBON_SPAN_MIN
  const thumbX = x(offset)
  const spanX = x(Math.max(0, spanFrom))
  const nowOnRibbon = nowAt !== null && nowAt >= 0 && nowAt <= RIBBON_SPAN_MIN

  return (
    <View
      style={styles.wrap}
      onLayout={(e: LayoutChangeEvent) => setTrackW(Math.max(0, e.nativeEvent.layout.width))}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Bedtime"
      accessibilityValue={{ text: formatBedtime12h(ribbonBedtime(offset)) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? 15 : -15)}
      {...pan.panHandlers}
    >
      <View pointerEvents="none" style={[styles.track, { backgroundColor: color.surface2, borderColor: color.line }]}>
        {trackW > 0 && thumbX > spanX ? (
          <View
            style={[
              styles.span,
              { left: spanX, width: thumbX - spanX, backgroundColor: color.accentWash, borderColor: color.accentDim },
            ]}
          />
        ) : null}
        {trackW > 0 && earliest > 0 ? (
          <View style={[styles.past, { width: x(earliest), backgroundColor: 'rgba(0,0,0,0.45)' }]} />
        ) : null}
      </View>

      {trackW > 0 &&
        HOUR_MARKS.map((h) => (
          <View key={h.offset} pointerEvents="none" style={[styles.mark, { left: x(h.offset) }]}>
            <View style={[styles.tick, { backgroundColor: h.offset === 240 ? color.ink3 : color.ink4 }]} />
            {h.offset === 240 ? (
              <Moon size={11} strokeWidth={1.8} color={color.ink3} style={styles.midnight} />
            ) : (
              <Text style={[styles.hour, { color: color.ink4 }]}>{h.label}</Text>
            )}
          </View>
        ))}

      {trackW > 0 && nowOnRibbon ? (
        <View pointerEvents="none" style={[styles.nowMark, { left: x(nowAt) }]}>
          <View style={[styles.nowLine, { backgroundColor: color.ink2 }]} />
          <Text style={[styles.nowText, { color: color.ink2 }]}>now</Text>
        </View>
      ) : null}

      {trackW > 0 ? (
        <View pointerEvents="none" style={[styles.thumb, { left: thumbX - 17 }]}>
          <View style={[styles.thumbDisc, { backgroundColor: color.accent }]}>
            <Moon size={16} strokeWidth={2} color={color.accentInk} />
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    height: 74,
    marginTop: 18,
    // Room for the 8 and 3 labels at the ends.
    marginHorizontal: 10,
    justifyContent: 'flex-start',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 14,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  span: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  past: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  mark: {
    position: 'absolute',
    top: 40,
    width: 20,
    marginLeft: -10,
    alignItems: 'center',
  },
  tick: {
    width: 1,
    height: 5,
  },
  hour: {
    fontSize: 10.5,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  midnight: {
    marginTop: 4,
  },
  nowMark: {
    position: 'absolute',
    top: 0,
    width: 30,
    marginLeft: -15,
    alignItems: 'center',
  },
  nowText: {
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 0.4,
    position: 'absolute',
    top: -2,
  },
  nowLine: {
    width: 1.5,
    height: 22,
    marginTop: 14,
    borderRadius: 1,
  },
  thumb: {
    position: 'absolute',
    top: 8,
    width: 34,
    alignItems: 'center',
  },
  thumbDisc: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
