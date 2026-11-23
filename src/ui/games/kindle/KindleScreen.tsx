import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { RotateCcw, Undo2 } from 'lucide-react'
import {
  GRID_SIZE,
  createKindle,
  makeRoom,
  move,
  undoKindle,
  type Direction,
  type KindleState,
  type Tile,
} from '@/core/games/kindle/engine'
import { easeArray } from '@/design/tokens'
import { GameShell, type GameScreenProps } from '@/ui/components/GameShell'
import { Button, IconButton } from '@/ui/components/controls'
import { useCalm, useFeedback, useGameSave, useGestures, useKeys } from '@/ui/hooks/game'
import './kindle.css'

interface KindleSave {
  version: 1
  state: KindleState
  bestScore: number
  plays: number
}

interface RenderTile {
  key: number
  value: number
  row: number
  col: number
  kind: 'normal' | 'new' | 'merged' | 'source' | 'extinguished'
}

const SLOTS = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => i)
const MILESTONE_DURATION_MS = 3200

function isValidTile(v: unknown): v is Tile {
  if (!v || typeof v !== 'object') return false
  const t = v as Partial<Tile>
  return (
    typeof t.id === 'number' &&
    typeof t.value === 'number' &&
    typeof t.row === 'number' &&
    typeof t.col === 'number' &&
    t.row >= 0 &&
    t.row < GRID_SIZE &&
    t.col >= 0 &&
    t.col < GRID_SIZE
  )
}

function isValidSave(v: unknown): v is KindleSave {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<KindleSave>
  return (
    s.version === 1 &&
    typeof s.bestScore === 'number' &&
    typeof s.plays === 'number' &&
    !!s.state &&
    Array.isArray(s.state.tiles) &&
    s.state.tiles.every(isValidTile) &&
    typeof s.state.score === 'number' &&
    typeof s.state.bestTile === 'number' &&
    typeof s.state.moves === 'number' &&
    typeof s.state.rngState === 'number' &&
    typeof s.state.nextId === 'number' &&
    Array.isArray(s.state.history)
  )
}

function tileTier(value: number): string {
  if (value >= 4096) return '4096'
  return String(value)
}

function digitCount(value: number): string {
  const len = String(value).length
  return len >= 5 ? '5' : String(len)
}

export default function KindleScreen({ onExit }: GameScreenProps) {
  const calm = useCalm()
  const { cue, haptic } = useFeedback()
  const reduceMotion = useReducedMotion()

  const [fallback] = useState<KindleSave>(() => ({
    version: 1,
    state: createKindle({ seed: Date.now() >>> 0, calm }),
    bestScore: 0,
    plays: 1,
  }))
  const [rawSave, setSave] = useGameSave<KindleSave>('kindle', fallback)
  const save = isValidSave(rawSave) ? rawSave : fallback
  const state = save.state

  const [paused, setPaused] = useState(false)
  const [milestoneNotice, setMilestoneNotice] = useState(false)
  const milestoneTimerRef = useRef<number | undefined>(undefined)

  const stateRef = useRef(state)
  stateRef.current = state
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const calmRef = useRef(calm)
  calmRef.current = calm

  useEffect(() => {
    return () => window.clearTimeout(milestoneTimerRef.current)
  }, [])

  const showMilestone = useCallback(() => {
    setMilestoneNotice(true)
    window.clearTimeout(milestoneTimerRef.current)
    milestoneTimerRef.current = window.setTimeout(() => {
      setMilestoneNotice(false)
    }, MILESTONE_DURATION_MS)
  }, [])

  const doMove = useCallback(
    (dir: Direction) => {
      if (pausedRef.current) return
      const prev = stateRef.current
      const next = move(prev, dir, calmRef.current)
      if (next === prev) return

      stateRef.current = next
      setSave((cur) => {
        const valid = isValidSave(cur) ? cur : fallback
        return {
          version: 1,
          state: next,
          bestScore: Math.max(valid.bestScore, next.score),
          plays: valid.plays,
        }
      })

      if (next.justReached2048) {
        cue('chime', 0.95)
        haptic('success')
        showMilestone()
      } else if (next.lastMergeMax >= 128) {
        cue('clear', 0.85)
        haptic('medium')
      } else if (next.lastMergeMax > 0) {
        cue('place', 0.8)
        haptic('light')
      } else {
        cue('tap', 0.55)
        haptic('light')
      }
    },
    [cue, haptic, setSave, fallback, showMilestone],
  )

  const doUndo = useCallback(() => {
    if (pausedRef.current) return
    const prev = stateRef.current
    const next = undoKindle(prev)
    if (next === prev) return

    stateRef.current = next
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: next,
        bestScore: valid.bestScore,
        plays: valid.plays,
      }
    })
    cue('undo', 0.7)
    haptic('light')
  }, [cue, haptic, setSave, fallback])

  const doMakeRoom = useCallback(() => {
    if (pausedRef.current) return
    const prev = stateRef.current
    const next = makeRoom(prev)
    if (next === prev) return

    stateRef.current = next
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: next,
        bestScore: valid.bestScore,
        plays: valid.plays,
      }
    })
    cue('undo', 0.55)
    haptic('light')
  }, [cue, haptic, setSave, fallback])

  const doRestart = useCallback(() => {
    window.clearTimeout(milestoneTimerRef.current)
    setMilestoneNotice(false)
    const fresh = createKindle({ seed: Date.now() >>> 0, calm: calmRef.current })
    stateRef.current = fresh
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: fresh,
        bestScore: Math.max(valid.bestScore, prevScore(valid.state)),
        plays: valid.plays + 1,
      }
    })
    cue('tap', 0.55)
  }, [cue, setSave, fallback])

  const boardRef = useGestures<HTMLDivElement>({
    onSwipe: (dir) => {
      doMove(dir)
    },
  })

  useKeys(
    {
      ArrowUp: () => doMove('up'),
      w: () => doMove('up'),
      W: () => doMove('up'),
      ArrowDown: () => doMove('down'),
      s: () => doMove('down'),
      S: () => doMove('down'),
      ArrowLeft: () => doMove('left'),
      a: () => doMove('left'),
      A: () => doMove('left'),
      ArrowRight: () => doMove('right'),
      d: () => doMove('right'),
      D: () => doMove('right'),
      z: doUndo,
      Z: doUndo,
      Backspace: doUndo,
      Escape: () => setPaused(true),
      p: () => setPaused(true),
      P: () => setPaused(true),
    },
    !paused,
    false,
  )

  useKeys(
    {
      p: () => setPaused(false),
      P: () => setPaused(false),
    },
    paused,
    false,
  )

  // Flat list keyed by stable tile.id so moving & merging source tiles keep their
  // exact DOM nodes and glide cleanly across the grid via CSS transform transitions.
  const renderTiles = useMemo<RenderTile[]>(() => {
    const items: RenderTile[] = []

    if (state.extinguished) {
      for (const ext of state.extinguished) {
        items.push({
          key: ext.id,
          value: ext.value,
          row: ext.row,
          col: ext.col,
          kind: 'extinguished',
        })
      }
    }

    for (const tile of state.tiles) {
      if (tile.mergedFrom) {
        for (const src of tile.mergedFrom) {
          items.push({
            key: src.id,
            value: src.value,
            row: tile.row,
            col: tile.col,
            kind: 'source',
          })
        }
        items.push({
          key: tile.id,
          value: tile.value,
          row: tile.row,
          col: tile.col,
          kind: 'merged',
        })
      } else {
        items.push({
          key: tile.id,
          value: tile.value,
          row: tile.row,
          col: tile.col,
          kind: tile.isNew ? 'new' : 'normal',
        })
      }
    }

    items.sort((a, b) => a.key - b.key)
    return items
  }, [state.tiles, state.extinguished])

  const undoCount = state.history.length
  const bestScore = Math.max(save.bestScore, state.score)

  return (
    <GameShell
      gameId="kindle"
      stats={[
        { label: 'Score', value: state.score.toLocaleString() },
        ...(bestScore > 0 ? [{ label: 'Best', value: bestScore.toLocaleString() }] : []),
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={doRestart}
      onExit={onExit}
      howTo={
        <>
          <p>Swipe in any direction — or use arrow keys or WASD — to slide every tile across the board.</p>
          <p>Matching tiles combine into a brighter tile. Reach 2048 and keep going as long as you like.</p>
          <p>If the board fills up, undo a few steps or tap Make room to clear the two lowest tiles.</p>
        </>
      }
      controls={
        <div className="kindle-controls">
          {state.stuck ? (
            <div className="kindle-stuck-bar" role="status" aria-live="polite">
              <div className="kindle-stuck-bar__row">
                <span className="t-label">No moves left</span>
                <div className="kindle-stuck-bar__actions">
                  <Button variant="primary" size="sm" onClick={doMakeRoom}>
                    Make room
                  </Button>
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={doUndo}
                    disabled={undoCount === 0}
                    aria-label={undoCount > 0 ? `Undo (${undoCount} available)` : 'Undo'}
                  >
                    <Undo2 size={16} strokeWidth={1.5} aria-hidden />
                    Undo
                  </Button>
                  <Button variant="ghost" size="sm" onClick={doRestart}>
                    <RotateCcw size={15} strokeWidth={1.5} aria-hidden />
                    New board
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="kindle-bar">
              <div className="kindle-undo">
                <IconButton
                  label={undoCount > 0 ? `Undo (${undoCount} available)` : 'Undo'}
                  onClick={doUndo}
                  disabled={undoCount === 0}
                >
                  <Undo2 size={20} strokeWidth={1.5} />
                </IconButton>
                {undoCount > 0 && <span className="t-label num kindle-undo__count">{undoCount}</span>}
              </div>
            </div>
          )}
        </div>
      }
    >
      <div className="kindle-stage">
        <div
          ref={boardRef}
          className="kindle-board"
          role="application"
          aria-label={`Kindle 4 by 4 board, score ${state.score}, highest tile ${state.bestTile}`}
          data-stuck={state.stuck || undefined}
        >
          <div className="kindle-grid" aria-hidden>
            {SLOTS.map((slot) => (
              <div key={slot} className="kindle-slot" />
            ))}
          </div>

          <div className="kindle-tiles">
            {renderTiles.map((tile) => {
              const style = {
                ['--row' as string]: tile.row,
                ['--col' as string]: tile.col,
              } as CSSProperties

              return (
                <div
                  key={tile.key}
                  className={`kindle-tile kindle-tile--${tile.kind}`}
                  style={style}
                  aria-hidden={tile.kind === 'source' || tile.kind === 'extinguished' || undefined}
                >
                  <div
                    className="kindle-tile__inner num"
                    data-tier={tileTier(tile.value)}
                    data-digits={digitCount(tile.value)}
                    data-milestone={tile.value >= 128 ? 'true' : undefined}
                  >
                    {tile.value}
                  </div>
                </div>
              )
            })}
          </div>

          <AnimatePresence>
            {milestoneNotice && (
              <motion.div
                key="milestone-2048"
                className="kindle-notice t-label"
                role="status"
                aria-live="polite"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: 0.26, ease: easeArray.out }}
              >
                2048 · keep going
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </GameShell>
  )
}

function prevScore(state: KindleState | undefined): number {
  return state ? state.score : 0
}
