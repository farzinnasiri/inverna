import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { combineFilters, lightToFilter, scheduledLight } from '@/core/night'
import { sessionLevels } from '@/core/session'
import { applyTokens } from '@/design/tokens'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'

/**
 * Computes the current effective dim opacity & warmth from user light + bedtime schedule + session.
 * Also keeps global OKLab tokens updated in sync.
 */
export function useNightFilterMetrics(): { warmth: number; dimOpacity: number } {
  const light = useSettings((s) => s.light)
  const followBedtime = useSettings((s) => s.followBedtime)
  const schedule = useSettings((s) => s.schedule)
  const session = useSession((s) => s.session)
  const [now, setNow] = useState(() => Date.now())

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

  // Real perceptible dimming across the full slider range (0%..58% black veil) + warm amber wash.
  const dimOpacity = Math.min(0.62, Math.max(0, combined.dim * 0.88))
  return { warmth: combined.warmth, dimOpacity }
}

/**
 * Pure black dim curtain + subtle candlelight warmth veil + OKLab token updater.
 * Rendered inside root AND inside Layer portals so dragging the Light slider inside
 * Onboarding or NightSheet IMMEDIATELY dims and warms the entire visible interface live!
 */
export function NightFilterOverlay() {
  const { warmth, dimOpacity } = useNightFilterMetrics()
  const warmVeilOpacity = Math.min(0.14, Math.max(0, warmth * 0.12))

  if (dimOpacity <= 0.005 && warmVeilOpacity <= 0.005) return null

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.curtain]}>
      {warmVeilOpacity > 0.005 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: '#5C330A', opacity: warmVeilOpacity },
          ]}
        />
      ) : null}
      {dimOpacity > 0.005 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: '#000000', opacity: dimOpacity },
          ]}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  curtain: {
    zIndex: 999,
  },
})
