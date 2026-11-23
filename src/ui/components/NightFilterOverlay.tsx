import { useEffect, useState } from 'react'
import { combineFilters, lightToFilter, scheduledLight } from '@/core/night'
import { sessionLevels } from '@/core/session'
import { applyTokens } from '@/design/tokens'
import { useSession } from '../state/session'
import { useSettings } from '../state/settings'

/**
 * Low Light night filter.
 *
 * Warmth shifts ink, accent and piece tokens in OKLab via applyTokens() so
 * #000000 stays true black at every setting. Dim is a plain black layer with
 * normal compositing (no mix-blend-mode, no orange wash).
 */
export function NightFilterOverlay() {
  const light = useSettings((s) => s.light)
  const followBedtime = useSettings((s) => s.followBedtime)
  const schedule = useSettings((s) => s.schedule)
  const session = useSession((s) => s.session)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), session ? 3000 : 30_000)
    return () => window.clearInterval(id)
  }, [session])

  const effLight = scheduledLight(light, followBedtime, schedule, new Date(now))
  const baseFilter = lightToFilter(effLight)
  const sess = session ? sessionLevels(session, now) : { warmth: 0, dim: 0 }
  const final = combineFilters(baseFilter, sess)

  useEffect(() => {
    applyTokens({ warmth: final.warmth })
  }, [final.warmth])

  return (
    <div className="night-filter" aria-hidden>
      <div className="night-filter__dim" style={{ opacity: final.dim * 0.7 }} />
    </div>
  )
}
