import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, Pause } from 'lucide-react'
import { gameMeta, type GameId } from '@/core/games/catalog'
import { sessionProgress } from '@/core/session'
import { easeArray } from '@/design/tokens'
import { useSession } from '../state/session'
import { Button, IconButton, Sheet } from './controls'

/** Props every game screen receives from the app. */
export interface GameScreenProps {
  onExit: () => void
}

export interface Stat {
  label: string
  value: ReactNode
}

/**
 * The frame every game sits in. Games own their board and controls;
 * the shell owns the top bar, stats, pause sheet and how-to text, so all
 * ten games feel like one place.
 *
 *   <GameShell gameId="settle" stats={[…]} paused={p} onPauseChange={setP}
 *              onRestart={restart} howTo={<p>…</p>} controls={<…/>}>
 *     <Board/>
 *   </GameShell>
 *
 * The shell pauses automatically when the tab is hidden.
 */
export function GameShell({
  gameId,
  stats,
  paused,
  onPauseChange,
  onRestart,
  onExit,
  howTo,
  controls,
  children,
}: {
  gameId: GameId
  stats?: Stat[]
  paused: boolean
  onPauseChange: (paused: boolean) => void
  onRestart?: () => void
  onExit: () => void
  howTo: ReactNode
  controls?: ReactNode
  children: ReactNode
}) {
  const meta = gameMeta(gameId)
  const [showHow, setShowHow] = useState(false)

  useEffect(() => {
    const onVis = () => document.hidden && onPauseChange(true)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [onPauseChange])

  useEffect(() => {
    if (!paused) setShowHow(false)
  }, [paused])

  return (
    <motion.div
      className="game"
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.32, ease: easeArray.out }}
    >
      <header className="game__top">
        <IconButton label="Back" onClick={onExit}>
          <ChevronLeft size={24} strokeWidth={1.75} />
        </IconButton>
        <h1 className="game__title t-serif">
          {meta.name}
          <MiniSun />
        </h1>
        <IconButton label="Pause" onClick={() => onPauseChange(true)}>
          <Pause size={20} strokeWidth={1.75} />
        </IconButton>
      </header>

      {stats && stats.length > 0 && (
        <div className="game__stats">
          {stats.map((s) => (
            <div className="stat" key={s.label}>
              <span className="stat__value num">{s.value}</span>
              <span className="stat__label">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      <main className="game__stage">{children}</main>

      {controls && <footer className="game__controls">{controls}</footer>}

      <Sheet open={paused} onClose={() => onPauseChange(false)} label="Paused">
        <h2 className="t-title sheet__title">Paused</h2>
        <p className="t-small">
          {meta.name} · {meta.classic}
        </p>
        <AnimatePresence initial={false}>
          {showHow && (
            <motion.div
              className="howto"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: easeArray.out }}
            >
              {howTo}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="sheet__actions">
          <Button variant="primary" block onClick={() => onPauseChange(false)}>
            Resume
          </Button>
          {!showHow && (
            <Button block onClick={() => setShowHow(true)}>
              How to play
            </Button>
          )}
          {onRestart && (
            <Button
              block
              onClick={() => {
                onRestart()
                onPauseChange(false)
              }}
            >
              Start over
            </Button>
          )}
          <Button variant="ghost" block onClick={onExit}>
            Leave game
          </Button>
        </div>
      </Sheet>
    </motion.div>
  )
}

/**
 * A quiet completion moment ("Solved"). Not a victory screen: no score
 * fanfare, one line and one way forward.
 */
export function Completion({
  open,
  title = 'Solved',
  line,
  actionLabel = 'Next',
  onAction,
}: {
  open: boolean
  title?: string
  line?: ReactNode
  actionLabel?: string
  onAction: () => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="completion"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: easeArray.out }}
        >
          <motion.div
            className="completion__inner"
            initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.8, delay: 0.25, ease: easeArray.out }}
          >
            <h2 className="t-display">{title}</h2>
            {line && <p className="t-body">{line}</p>}
            <Button variant="primary" onClick={onAction}>
              {actionLabel}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** A tiny sun on the horizon that sets as the wind-down session runs. */
export function MiniSun() {
  const session = useSession((s) => s.session)
  const [p, setP] = useState(0)
  useEffect(() => {
    if (!session) return
    const tick = () => setP(sessionProgress(session, Date.now()))
    tick()
    const id = window.setInterval(tick, 4000)
    return () => window.clearInterval(id)
  }, [session])
  if (!session) return null
  return <span className="mini-sun" style={{ ['--set' as string]: p }} aria-label="Wind-down in progress" role="img" />
}
