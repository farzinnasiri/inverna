import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, Pause } from 'lucide-react'
import { gameMeta, type GameId } from '@/core/games/catalog'
import { easeArray } from '@/design/tokens'
import { Button, IconButton, Sheet } from './controls'

export interface GameScreenProps {
  onExit: () => void
}

export interface Stat {
  label: string
  value: ReactNode
}

/**
 * Quiet frame for every game.
 * Top bar: back · 17/600 game name · pause.
 * Stats: one centred t-label line (e.g. "8 · best 120").
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
      transition={{ duration: 0.28, ease: easeArray.out }}
    >
      <header className="game__top">
        <IconButton label="Back" onClick={onExit}>
          <ChevronLeft size={22} strokeWidth={1.5} />
        </IconButton>
        <h1 className="game__title">{meta.name}</h1>
        <IconButton label="Pause" onClick={() => onPauseChange(true)}>
          <Pause size={20} strokeWidth={1.5} />
        </IconButton>
      </header>

      {stats && stats.length > 0 && (
        <div className="game__stats num">
          {stats.map((s, i) => (
            <Fragment key={s.label}>
              {i > 0 && <span className="game__stat-sep" aria-hidden>·</span>}
              <span>
                {s.label.toLowerCase()} {s.value}
              </span>
            </Fragment>
          ))}
        </div>
      )}

      <main className="game__stage">{children}</main>

      {controls && <footer className="game__controls">{controls}</footer>}

      <Sheet open={paused} onClose={() => onPauseChange(false)} label="Paused">
        <h2 className="t-title">{meta.name}</h2>
        <p className="t-label" style={{ marginTop: 4 }}>
          {meta.classic}
        </p>
        <AnimatePresence initial={false}>
          {showHow && (
            <motion.div
              className="howto"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: easeArray.out }}
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
            Leave
          </Button>
        </div>
      </Sheet>
    </motion.div>
  )
}

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
          transition={{ duration: 0.5, ease: easeArray.out }}
        >
          <motion.div
            className="completion__inner"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18, ease: easeArray.out }}
          >
            <h2 className="t-title">{title}</h2>
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
