import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { LayoutGrid, SlidersHorizontal, Waves } from 'lucide-react'
import { sessionProgress } from '@/core/session'
import { presetById } from '@/core/sound/catalog'
import { useNav } from '../state/nav'
import { useSession } from '../state/session'
import { useSound } from '../state/sound'

/**
 * Centered floating iOS pill tab island (Play | Sounds) + detached circular
 * Night controls button on the right (SlidersHorizontal — never reads as a
 * light/dark theme toggle).
 */
export function TabIsland() {
  const tab = useNav((s) => s.tab)
  const setTab = useNav((s) => s.setTab)
  const nightOpen = useNav((s) => s.nightOpen)
  const setNightOpen = useNav((s) => s.setNightOpen)

  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const session = useSession((s) => s.session)

  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!session) {
      setProgress(0)
      return
    }
    const tick = () => setProgress(sessionProgress(session, Date.now()))
    tick()
    const id = window.setInterval(tick, 3000)
    return () => window.clearInterval(id)
  }, [session])

  const preset = presetById(presetId)
  const soundLabel = playing ? (preset?.name ?? 'Custom') : 'Sounds'

  const r = 24.5
  const circumference = 2 * Math.PI * r

  return (
    <div className="dock">
      <div className="dock__spacer" aria-hidden />

      <nav className="island" aria-label="Main navigation">
        <button
          type="button"
          className="island__tab"
          aria-current={tab === 'play' ? 'page' : undefined}
          onClick={() => setTab('play')}
        >
          {tab === 'play' && (
            <motion.span
              layoutId="island-active"
              className="island__pill"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            />
          )}
          <span className="island__content">
            <LayoutGrid size={18} strokeWidth={1.5} aria-hidden />
            <span className="island__label">Play</span>
          </span>
        </button>

        <button
          type="button"
          className="island__tab"
          aria-current={tab === 'sounds' ? 'page' : undefined}
          onClick={() => setTab('sounds')}
        >
          {tab === 'sounds' && (
            <motion.span
              layoutId="island-active"
              className="island__pill"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            />
          )}
          <span className="island__content">
            {playing ? (
              <span className="island__bars" aria-hidden>
                <span />
                <span />
                <span />
              </span>
            ) : (
              <Waves size={18} strokeWidth={1.5} aria-hidden />
            )}
            <span className="island__label">{soundLabel}</span>
          </span>
        </button>
      </nav>

      <div className="dock__right">
        <button
          type="button"
          className="night-fab"
          aria-label="Evening settings"
          aria-expanded={nightOpen}
          onClick={() => setNightOpen(true)}
        >
          {session && (
            <svg className="night-fab__arc" viewBox="0 0 52 52" aria-hidden>
              <circle
                cx="26"
                cy="26"
                r={r}
                fill="none"
                stroke="var(--c-accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - Math.max(0.04, progress))}
              />
            </svg>
          )}
          <SlidersHorizontal size={19} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
