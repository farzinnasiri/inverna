import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { adaptiveFilter, combineFilters, manualFilter, type NightFilter } from '@/core/night'
import { sessionLevels } from '@/core/session'
import { applyTokens } from '@/design/tokens'
import { useSession } from '@/ui/state/session'
import { useCurrentSchedule, useSettings } from '@/ui/state/settings'

/**
 * The screen's warmth and dimming now: the sliders, or Adaptive light &
 * colour when it's on, deepened further during a wind down. Also keeps the
 * colour tokens in step. `base` is the part the Settings sliders show.
 */
export function useNightFilterMetrics(): { warmth: number; dimOpacity: number; base: NightFilter } {
  const warmth = useSettings((s) => s.warmth)
  const brightness = useSettings((s) => s.brightness)
  const adaptive = useSettings((s) => s.adaptiveLight)
  const session = useSession((s) => s.session)
  const [now, setNow] = useState(() => Date.now())
  const schedule = useCurrentSchedule(new Date(now))

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), session ? 2000 : 30_000)
    return () => clearInterval(id)
  }, [session])

  const baseFilter = adaptive ? adaptiveFilter(schedule, new Date(now)) : manualFilter(warmth, brightness)
  const sessLevels = session ? sessionLevels(session, now) : null
  const sessFilter = sessLevels ? { warmth: sessLevels.warmth, dim: sessLevels.dim } : { warmth: 0, dim: 0 }
  const combined = combineFilters(baseFilter, sessFilter)

  // Re-colouring every text token re-renders most of the app, so it waits for
  // the warmth to settle (a slider being dragged); the warm layer below
  // follows the finger live, so the screen still warms as you drag.
  useEffect(() => {
    const id = setTimeout(() => applyTokens({ warmth: combined.warmth }), 240)
    return () => clearTimeout(id)
  }, [combined.warmth])

  // Pure black dim veil (0..58%): darkens cleanly without muddy yellow/brown tint.
  const dimOpacity = Math.min(0.60, Math.max(0, combined.dim * 0.85))
  return { warmth: combined.warmth, dimOpacity, base: baseFilter }
}

/** Multiply colour at full warmth: blue down to 55%, green to 77%, red untouched. */
const WARMEST = { r: 255, g: 196, b: 140 }

/** The warm layer's colour for a warmth (white multiplies to no change). */
export function warmVeilColor(warmth: number): string {
  const w = Math.min(1, Math.max(0, warmth))
  const mix = (to: number) => Math.round(255 + (to - 255) * w)
  return `rgb(${mix(WARMEST.r)}, ${mix(WARMEST.g)}, ${mix(WARMEST.b)})`
}

/**
 * The screen's night filter, over everything:
 * - warmth: a multiply layer that takes blue (and some green) out of every
 *   pixel, backdrop and glass included, the way Night Shift does. Blacks stay
 *   black, so nothing turns muddy.
 * - dimming: a black veil.
 *
 * `dimOnly` is for sheets, which sit in their own transparent window on iOS:
 * multiplying over transparent pixels would paint the whole window amber.
 * Their text still warms through the colour tokens.
 */
export function NightFilterOverlay({ dimOnly = false }: { dimOnly?: boolean }) {
  const { warmth, dimOpacity } = useNightFilterMetrics()
  return (
    <>
      {!dimOnly && warmth > 0.02 ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.layer, { backgroundColor: warmVeilColor(warmth), mixBlendMode: 'multiply' }]}
        />
      ) : null}
      {dimOpacity > 0.005 ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.layer, { backgroundColor: '#000000', opacity: dimOpacity }]} />
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  layer: {
    zIndex: 999,
  },
})
