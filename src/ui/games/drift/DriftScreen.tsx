import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { RotateCcw } from 'lucide-react'
import {
  canSlideTile,
  createDrift,
  inPlaceCount,
  moveDirection,
  nextPuzzle,
  restartPuzzle,
  slideTile,
  type Direction,
  type DriftState,
} from '@/core/games/drift/engine'
import { Completion, GameShell, type GameScreenProps } from '@/ui/components/GameShell'
import { IconButton } from '@/ui/components/controls'
import { useCalm, useFeedback, useGameSave, useGestures, useKeys } from '@/ui/hooks/game'
import './drift.css'

interface DriftSave {
  version: 1
  state: DriftState
  completed: number
}

interface PositionedTile {
  value: number
  index: number
  row: number
  col: number
  home: boolean
  movable: boolean
}

const COMPLETION_DELAY_MS = 460

function isValidSave(value: unknown): value is DriftSave {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<DriftSave>
  if (v.version !== 1 || typeof v.completed !== 'number' || !v.state) return false
  const s = v.state
  const sizeValid = s.size === 3 || s.size === 4
  if (!sizeValid) return false
  const len = s.size * s.size
  return (
    Array.isArray(s.tiles) &&
    s.tiles.length === len &&
    Array.isArray(s.initialTiles) &&
    s.initialTiles.length === len &&
    typeof s.moves === 'number' &&
    typeof s.puzzleNumber === 'number' &&
    typeof s.solved === 'boolean' &&
    typeof s.rngState === 'number'
  )
}

export default function DriftScreen({ onExit }: GameScreenProps) {
  const calm = useCalm()
  const { cue, haptic } = useFeedback()

  const [fallback] = useState<DriftSave>(() => ({
    version: 1,
    state: createDrift({ seed: Date.now() >>> 0, calm }),
    completed: 0,
  }))
  const [rawSave, setSave] = useGameSave<DriftSave>('drift', fallback)
  const save = isValidSave(rawSave) ? rawSave : fallback
  const state = save.state

  const [paused, setPaused] = useState(false)
  const [showCompletion, setShowCompletion] = useState(state.solved)

  const stateRef = useRef(state)
  stateRef.current = state
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const calmRef = useRef(calm)
  calmRef.current = calm
  const completionTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => window.clearTimeout(completionTimerRef.current)
  }, [])

  const applyTransition = useCallback(
    (next: DriftState) => {
      const prev = stateRef.current
      if (next === prev) return

      const prevPlaced = inPlaceCount(prev.tiles)
      const nextPlaced = inPlaceCount(next.tiles)

      stateRef.current = next
      setSave((cur) => {
        const valid = isValidSave(cur) ? cur : fallback
        return {
          version: 1,
          state: next,
          completed: next.solved && !prev.solved ? valid.completed + 1 : valid.completed,
        }
      })

      if (next.solved) {
        cue('chime', 0.95)
        haptic('success')
        window.clearTimeout(completionTimerRef.current)
        completionTimerRef.current = window.setTimeout(() => {
          setShowCompletion(true)
        }, COMPLETION_DELAY_MS)
      } else if (nextPlaced > prevPlaced) {
        cue('place', 0.72)
        haptic('light')
      } else {
        cue('tap', 0.55)
        haptic('light')
      }
    },
    [cue, haptic, setSave, fallback],
  )

  const doSlideIndex = useCallback(
    (index: number) => {
      if (pausedRef.current) return
      const prev = stateRef.current
      applyTransition(slideTile(prev, index))
    },
    [applyTransition],
  )

  const doMoveDir = useCallback(
    (dir: Direction) => {
      if (pausedRef.current) return
      const prev = stateRef.current
      applyTransition(moveDirection(prev, dir))
    },
    [applyTransition],
  )

  const doRestartCurrent = useCallback(() => {
    window.clearTimeout(completionTimerRef.current)
    setShowCompletion(false)
    const prev = stateRef.current
    const restarted = restartPuzzle(prev)
    stateRef.current = restarted
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: restarted,
        completed: valid.completed,
      }
    })
    cue('undo', 0.65)
    haptic('light')
  }, [cue, haptic, setSave, fallback])

  const doNewBoard = useCallback(() => {
    window.clearTimeout(completionTimerRef.current)
    setShowCompletion(false)
    const fresh = createDrift({
      seed: Date.now() >>> 0,
      calm: calmRef.current,
      puzzleNumber: stateRef.current.puzzleNumber,
    })
    stateRef.current = fresh
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: fresh,
        completed: valid.completed,
      }
    })
    cue('tap', 0.55)
  }, [cue, setSave, fallback])

  const doNextPuzzle = useCallback(() => {
    window.clearTimeout(completionTimerRef.current)
    setShowCompletion(false)
    const next = nextPuzzle(stateRef.current, calmRef.current)
    stateRef.current = next
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: next,
        completed: valid.completed,
      }
    })
    cue('tap', 0.55)
    haptic('light')
  }, [cue, haptic, setSave, fallback])

  const trackRef = useGestures<HTMLDivElement>({
    onTap: (x, y) => {
      const el = trackRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const size = stateRef.current.size
      const col = Math.min(size - 1, Math.max(0, Math.floor((x / rect.width) * size)))
      const row = Math.min(size - 1, Math.max(0, Math.floor((y / rect.height) * size)))
      doSlideIndex(row * size + col)
    },
    onSwipe: (dir) => {
      doMoveDir(dir)
    },
  })

  useKeys(
    {
      ArrowUp: () => doMoveDir('up'),
      w: () => doMoveDir('up'),
      W: () => doMoveDir('up'),
      ArrowDown: () => doMoveDir('down'),
      s: () => doMoveDir('down'),
      S: () => doMoveDir('down'),
      ArrowLeft: () => doMoveDir('left'),
      a: () => doMoveDir('left'),
      A: () => doMoveDir('left'),
      ArrowRight: () => doMoveDir('right'),
      d: () => doMoveDir('right'),
      D: () => doMoveDir('right'),
      Escape: () => setPaused(true),
      p: () => setPaused(true),
      P: () => setPaused(true),
    },
    !paused && !showCompletion,
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

  const totalTiles = state.size * state.size - 1
  const placed = useMemo(() => inPlaceCount(state.tiles), [state.tiles])

  const slots = useMemo(
    () => Array.from({ length: state.size * state.size }, (_, i) => i),
    [state.size],
  )

  // Stable DOM order keyed by tile value so translate3d glides smoothly across slides.
  const positionedTiles = useMemo<PositionedTile[]>(() => {
    const out: PositionedTile[] = []
    for (let index = 0; index < state.tiles.length; index++) {
      const value = state.tiles[index]!
      if (value === 0) continue
      out.push({
        value,
        index,
        row: Math.floor(index / state.size),
        col: index % state.size,
        home: value === index + 1,
        movable: canSlideTile(state, index),
      })
    }
    out.sort((a, b) => a.value - b.value)
    return out
  }, [state])

  const boardStyle = {
    ['--size' as string]: state.size,
  } as CSSProperties

  return (
    <GameShell
      gameId="drift"
      stats={[
        { label: 'Moves', value: state.moves },
        { label: 'Placed', value: `${placed}/${totalTiles}` },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={doNewBoard}
      onExit={onExit}
      howTo={
        <>
          <p>Tap any tile in the same row or column as the open space to slide the line smoothly toward it.</p>
          <p>You can also swipe anywhere on the board or use arrow keys and WASD.</p>
          <p>Order the numbered plates from 1 to {totalTiles}. A quiet brass dot lights when a plate rests at home.</p>
        </>
      }
      controls={
        <div className="drift-controls">
          <IconButton
            label="Reset"
            onClick={doRestartCurrent}
            disabled={state.moves === 0 || state.solved}
          >
            <RotateCcw size={19} strokeWidth={1.5} />
          </IconButton>
        </div>
      }
    >
      <div className="drift-stage">
        <div
          className="drift-board"
          style={boardStyle}
          data-size={state.size}
          data-solved={state.solved || undefined}
        >
          <div
            ref={trackRef}
            className="drift-track"
            role="application"
            aria-label={`Drift ${state.size} by ${state.size} sliding puzzle, ${placed} of ${totalTiles} tiles in place, ${state.moves} moves`}
          >
            <div className="drift-slots" aria-hidden>
              {slots.map((slot) => (
                <div
                  key={slot}
                  className="drift-slot"
                  data-terminal={slot === slots.length - 1 || undefined}
                >
                  <span className="drift-slot__pin" />
                </div>
              ))}
            </div>

            <div className="drift-tiles">
              {positionedTiles.map((tile) => {
                const tileStyle = {
                  ['--row' as string]: tile.row,
                  ['--col' as string]: tile.col,
                } as CSSProperties

                return (
                  <div
                    key={tile.value}
                    className="drift-tile"
                    style={tileStyle}
                    data-home={tile.home || undefined}
                    data-movable={tile.movable || undefined}
                  >
                    <div className="drift-plate num">
                      <span className="drift-plate__dot" aria-hidden />
                      <span className="drift-plate__num">{tile.value}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <Completion
        open={showCompletion}
        title="In place"
        line={
          <span className="num">
            {state.moves} {state.moves === 1 ? 'move' : 'moves'}
          </span>
        }
        actionLabel="Next"
        onAction={doNextPuzzle}
      />
    </GameShell>
  )
}
