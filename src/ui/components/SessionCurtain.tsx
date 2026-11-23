import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { sessionDone, sessionLevels } from '@/core/session'
import { easeArray } from '@/design/tokens'
import { sound } from '@/platform'
import { useNav } from '../state/nav'
import { useSession } from '../state/session'
import { useSound } from '../state/sound'

/**
 * Runs the active wind-down session clock and the final fade to black.
 * No victory screen, no "play again" — a natural stopping point.
 */
export function SessionCurtain() {
  const session = useSession((s) => s.session)
  const ended = useSession((s) => s.ended)
  const finish = useSession((s) => s.finish)
  const dismiss = useSession((s) => s.dismiss)
  const stopSound = useSound((s) => s.stop)
  const closeGame = useNav((s) => s.closeGame)
  const [fade, setFade] = useState(0)

  useEffect(() => {
    if (!session) {
      setFade(0)
      return
    }
    const tick = () => {
      const now = Date.now()
      const levels = sessionLevels(session, now)
      setFade(levels.fade)
      if (sound.isRunning) sound.setMaster(levels.volume * (1 - levels.fade), 1.5)
      if (sessionDone(session, now) && !ended) {
        finish()
        stopSound(4)
        closeGame()
      }
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [session, ended, finish, stopSound, closeGame])

  // Also honour standalone sleep timer on Sounds screen
  const stopAt = useSound((s) => s.stopAt)
  useEffect(() => {
    if (!stopAt) return
    const ms = Math.max(0, stopAt - Date.now())
    const id = window.setTimeout(() => stopSound(6), ms)
    return () => window.clearTimeout(id)
  }, [stopAt, stopSound])

  if (!session && !ended) return null
  if (fade <= 0.005 && !ended) return null

  return (
    <div
      className="curtain"
      style={{
        opacity: ended ? 1 : fade,
        pointerEvents: ended ? 'auto' : 'none',
        transition: 'opacity 1s linear',
      }}
      role={ended ? 'dialog' : undefined}
      aria-modal={ended || undefined}
      aria-label={ended ? 'Session complete' : undefined}
    >
      {ended && (
        <motion.div
          className="curtain__inner"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.4, delay: 0.4, ease: easeArray.out }}
        >
          <p className="t-title" style={{ color: 'var(--c-ink-2)' }}>
            Goodnight.
          </p>
          <p className="t-small" style={{ color: 'var(--c-ink-3)' }}>
            Put the phone down whenever you are ready.
          </p>
          <button type="button" className="curtain__wake" onClick={dismiss}>
            Still awake
          </button>
        </motion.div>
      )}
    </div>
  )
}
