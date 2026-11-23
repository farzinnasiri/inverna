import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { combineFilters, lightToFilter, scheduledLight } from '@/core/night'
import { sessionLevels } from '@/core/session'
import { applyTokens } from '@/design/tokens'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'

/**
 * Pure black dim curtain + OKLab token warmth updater.
 * Ground stays #000000 OLED black at every light level (zero rusty-brown tint).
 */
export function NightFilterOverlay() {
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

  const dimOpacity = Math.min(0.72, Math.max(0, combined.dim * 0.7))
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
    zIndex: 90,
  },
})
