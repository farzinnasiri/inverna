import { useEffect, useState } from 'react'
import { combineFilters, scheduleFilter } from '@/core/night'
import { sessionLevels } from '@/core/session'
import { useSession } from '../state/session'
import { useSettings } from '../state/settings'

/**
 * Screen-wide blue-light reduction and dim layer.
 * Strongest of manual slider, bedtime schedule, and active wind-down wins.
 */
export function NightFilterOverlay() {
  const warmth = useSettings((s) => s.warmth)
  const dim = useSettings((s) => s.dim)
  const followBedtime = useSettings((s) => s.followBedtime)
  const schedule = useSettings((s) => s.schedule)
  const session = useSession((s) => s.session)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), session ? 3000 : 30_000)
    return () => window.clearInterval(id)
  }, [session])

  const manual = { warmth, dim }
  const sched = followBedtime ? scheduleFilter(schedule, new Date(now)) : { warmth: 0, dim: 0 }
  const sess = session ? sessionLevels(session, now) : { warmth: 0, dim: 0 }
  const final = combineFilters(manual, sched, sess)

  return (
    <div className="night-filter" aria-hidden>
      <div className="night-filter__warm" style={{ opacity: final.warmth * 0.72 }} />
      <div className="night-filter__dim" style={{ opacity: final.dim * 0.65 }} />
    </div>
  )
}
