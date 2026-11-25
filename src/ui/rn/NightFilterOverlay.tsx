import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { combineFilters, lightToFilter, scheduledLight } from '@/core/night'
import { sessionLevels } from '@/core/session'
import { applyTokens } from '@/design/tokens'
import { useSession } from '@/ui/state/session'
import { useCurrentSchedule, useSettings } from '@/ui/state/settings'

/**
 * Computes the current effective dim opacity & warmth from user light + bedtime schedule + session.
 * Also keeps global OKLab tokens updated in sync.
 */
export function useNightFilterMetrics(): { warmth: number; dimOpacity: number } {
  const light = useSettings((s) => s.light)
  const followBedtime = useSettings((s) => s.followBedtime)
  const session = useSession((s) => s.session)
  const [now, setNow] = useState(() => Date.now())
  const schedule = useCurrentSchedule(new Date(now))

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), session ? 2000 : 30_000)
    return () => clearInterval(id)
  }, [session])

  const effectiveLight = scheduledLight(light, followBedtime, schedule, new Date(now))
  const baseFilter = lightToFilter(effectiveLight)
  const sessLevels = session ? sessionLevels(session, now) : null
  const sessFilter = sessLevels ? { warmth: sessLevels.warmth, dim: sessLevels.dim } : { warmth: 0, dim: 0 }
  const combined = combineFilters(baseFilter, sessFilter)

  useEffect(() => {
    applyTokens({ warmth: combined.warmth })
  }, [combined.warmth])

  // Pure black dim veil (0..58%): darkens cleanly without muddy yellow/brown tint.
  const dimOpacity = Math.min(0.60, Math.max(0, combined.dim * 0.85))
  return { warmth: combined.warmth, dimOpacity }
}

/**
 * Pure black OLED dim curtain + OKLab token warmth updater.
 * Ground and Liquid Glass stay pure obsidian (never stained yellow-brown),
 * while dragging the Night Light slider visibly dims the entire interface live.
 */
export function NightFilterOverlay() {
  const { dimOpacity } = useNightFilterMetrics()
  if (dimOpacity <= 0.005) return null

  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.curtain,
        { backgroundColor: '#000000', opacity: dimOpacity },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  curtain: {
    zIndex: 999,
  },
})
