import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowDownToLine, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RotateCw } from 'lucide-react'
import {
  BOARD_COLS,
  BOARD_ROWS,
  createSettle,
  getGhostY,
  getPieceCells,
  getShapeCells,
  hardDrop,
  hold,
  moveLeft,
  moveRight,
  PIECE_COLORS,
  restart,
  rotateCCW,
  rotateCW,
  softDrop,
  tickSettle,
  type PieceColor,
  type SettleState,
  type TetrominoType,
} from '@/core/games/settle/engine'
import { easeArray } from '@/design/tokens'
import { GameShell, type GameScreenProps } from '@/ui/components/GameShell'
import { useCalm, useFeedback, useGameLoop, useGameSave, useGestures, useKeys } from '@/ui/hooks/game'
import './settle.css'

interface SettleSave {
  state: SettleState | null
  bestLines: number
  plays: number
}

const DEFAULT_SAVE: SettleSave = {
  state: null,
  bestLines: 0,
  plays: 1,
}

function isValidSettleState(v: unknown): v is SettleState {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<SettleState>
  return (
    Array.isArray(s.board) &&
    s.board.length === BOARD_ROWS &&
    Array.isArray(s.queue) &&
    s.queue.length >= 3 &&
    typeof s.rngState === 'number' &&
    typeof s.lines === 'number' &&
    typeof s.pieces === 'number' &&
    Array.isArray(s.clearingRows)
  )
}

function MiniPiece({ type }: { type: TetrominoType }) {
  const cells = getShapeCells(type, 0)
  const xs = cells.map(([x]) => x)
  const ys = cells.map(([, y]) => y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const cols = maxX - minX + 1
  const rows = maxY - minY + 1
  const color = PIECE_COLORS[type]

  return (
    <div
      className="settle-mini"
      style={{
        gridTemplateColumns: `repeat(${cols}, var(--mini-cell))`,
        gridTemplateRows: `repeat(${rows}, var(--mini-cell))`,
      }}
      aria-hidden
    >
      {cells.map(([cx, cy], idx) => (
        <span
          key={idx}
          className="settle-mini__cell"
          data-color={color}
          style={{ gridColumn: cx - minX + 1, gridRow: cy - minY + 1 }}
        />
      ))}
    </div>
  )
}

/** Tactile handheld button with optional DAS/ARR press-and-hold repeat. */
function PadButton({
  label,
  className,
  repeat = false,
  disabled = false,
  onTrigger,
  children,
}: {
  label: string
  className: string
  repeat?: boolean
  disabled?: boolean
  onTrigger: () => void
  children: ReactNode
}) {
  const [pressed, setPressed] = useState(false)
  const triggerRef = useRef(onTrigger)
  triggerRef.current = onTrigger
  const delayRef = useRef<number | undefined>(undefined)
  const intervalRef = useRef<number | undefined>(undefined)

  const stop = useCallback(() => {
    setPressed(false)
    if (delayRef.current !== undefined) {
      window.clearTimeout(delayRef.current)
      delayRef.current = undefined
    }
    if (intervalRef.current !== undefined) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = undefined
    }
  }, [])

  useEffect(() => {
    if (disabled) stop()
    return stop
  }, [disabled, stop])

  const start = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return
    e.preventDefault()
    setPressed(true)
    triggerRef.current()
    if (repeat) {
      delayRef.current = window.setTimeout(() => {
        intervalRef.current = window.setInterval(() => {
          triggerRef.current()
        }, 68)
      }, 170)
    }
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      data-pressed={pressed}
      className={className}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        // Keyboard activation (Enter / Space) has detail === 0; pointer was handled onPointerDown.
        if (e.detail === 0 && !disabled) triggerRef.current()
      }}
    >
      {children}
    </button>
  )
}

export default function SettleScreen({ onExit }: GameScreenProps) {
  const calm = useCalm()
  const { cue, haptic } = useFeedback()
  const reduceMotion = useReducedMotion()
  const [saved, setSaved] = useGameSave<SettleSave>('settle', DEFAULT_SAVE)

  const [state, setState] = useState<SettleState>(() => {
    if (isValidSettleState(saved.state)) {
      return saved.state
    }
    return createSettle({ seed: Date.now() >>> 0, calm })
  })
  const [paused, setPaused] = useState(false)

  const stateRef = useRef(state)
  stateRef.current = state
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  // Track monotonic engine event counters for cues, haptics & auto-save.
  const prevPiecesRef = useRef(state.pieces)
  const prevLinesRef = useRef(state.lines)
  const prevClearIdRef = useRef(state.clearEventId)
  const prevDissolveRef = useRef(state.dissolveCount)

  const persistState = useCallback(
    (nextState: SettleState, incrementPlays = false) => {
      setSaved((prev) => ({
        state: nextState,
        bestLines: Math.max(prev.bestLines, nextState.lines),
        plays: incrementPlays ? prev.plays + 1 : prev.plays,
      }))
    },
    [setSaved],
  )

  // Feedback cues & auto-save on piece lock / line clear / dissolve.
  useEffect(() => {
    const clearChanged = state.clearEventId > prevClearIdRef.current
    const piecesChanged = state.pieces > prevPiecesRef.current
    const linesChanged = state.lines > prevLinesRef.current
    const dissolveChanged = state.dissolveCount > prevDissolveRef.current

    if (clearChanged) {
      if (state.lastClearCount >= 4) {
        cue('chime', 0.95)
        haptic('success')
      } else {
        cue('clear', 0.85)
        haptic('medium')
      }
    } else if (piecesChanged) {
      cue('place', 0.85)
      haptic('light')
    }

    if (dissolveChanged) {
      cue('undo', 0.55)
      haptic('light')
    }

    if (piecesChanged || linesChanged || dissolveChanged) {
      persistState(state)
    }

    prevPiecesRef.current = state.pieces
    prevLinesRef.current = state.lines
    prevClearIdRef.current = state.clearEventId
    prevDissolveRef.current = state.dissolveCount
  }, [
    state,
    state.pieces,
    state.lines,
    state.clearEventId,
    state.lastClearCount,
    state.dissolveCount,
    cue,
    haptic,
    persistState,
  ])

  // Real-time simulation loop (paused automatically when sheet opens or tab hides).
  useGameLoop(
    useCallback(
      (dtMs: number) => {
        const prev = stateRef.current
        const next = tickSettle(prev, dtMs, calm)
        if (next !== prev) {
          stateRef.current = next
          setState(next)
        }
      },
      [calm],
    ),
    !paused,
  )

  const applyInteractive = useCallback(
    (fn: (s: SettleState) => SettleState, feedback: 'tap' | 'undo' | 'none') => {
      if (pausedRef.current) return
      const prev = stateRef.current
      const next = fn(prev)
      if (next === prev) return
      stateRef.current = next
      setState(next)
      if (feedback === 'tap') {
        cue('tap', 0.55)
        haptic('light')
      } else if (feedback === 'undo') {
        cue('undo', 0.7)
        haptic('light')
      }
    },
    [cue, haptic],
  )

  const doLeft = useCallback(() => applyInteractive(moveLeft, 'tap'), [applyInteractive])
  const doRight = useCallback(() => applyInteractive(moveRight, 'tap'), [applyInteractive])
  const doSoftDrop = useCallback(() => applyInteractive(softDrop, 'tap'), [applyInteractive])
  const doHardDrop = useCallback(() => applyInteractive(hardDrop, 'none'), [applyInteractive])
  const doRotateCW = useCallback(() => applyInteractive(rotateCW, 'tap'), [applyInteractive])
  const doRotateCCW = useCallback(() => applyInteractive(rotateCCW, 'tap'), [applyInteractive])
  const doHold = useCallback(() => applyInteractive(hold, 'undo'), [applyInteractive])

  const handleRestart = useCallback(() => {
    const fresh = restart(stateRef.current, Date.now() >>> 0)
    prevPiecesRef.current = 0
    prevLinesRef.current = 0
    prevClearIdRef.current = 0
    prevDissolveRef.current = 0
    stateRef.current = fresh
    setState(fresh)
    persistState(fresh, true)
  }, [persistState])

  const handleExit = useCallback(() => {
    persistState(stateRef.current)
    onExit()
  }, [persistState, onExit])

  // Desktop keyboard controls: repeating movement + single-shot rotations/drop/hold/pause.
  useKeys(
    {
      ArrowLeft: doLeft,
      a: doLeft,
      A: doLeft,
      ArrowRight: doRight,
      d: doRight,
      D: doRight,
      ArrowDown: doSoftDrop,
      s: doSoftDrop,
      S: doSoftDrop,
    },
    !paused,
    true,
  )

  useKeys(
    {
      ArrowUp: doRotateCW,
      w: doRotateCW,
      W: doRotateCW,
      x: doRotateCW,
      X: doRotateCW,
      z: doRotateCCW,
      Z: doRotateCCW,
      Space: doHardDrop,
      ' ': doHardDrop,
      c: doHold,
      C: doHold,
      Shift: doHold,
      p: () => setPaused(true),
      P: () => setPaused(true),
      Escape: () => setPaused(true),
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

  // Board touch gestures: tap -> rotate CW, horizontal drag -> step left/right,
  // swipe down -> hard drop, swipe up -> hold.
  const dragAxisRef = useRef<'none' | 'h' | 'v'>('none')
  const dragStepsRef = useRef(0)

  const boardRef = useGestures<HTMLDivElement>({
    onTap: () => {
      doRotateCW()
    },
    onDrag: (dx, dy, phase) => {
      if (pausedRef.current) return
      if (phase === 'start') {
        dragAxisRef.current = 'none'
        dragStepsRef.current = 0
        return
      }
      if (phase === 'end') return

      if (dragAxisRef.current === 'none' && Math.hypot(dx, dy) > 10) {
        dragAxisRef.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v'
      }

      if (dragAxisRef.current === 'h') {
        const el = boardRef.current
        const cellPx = el ? Math.max(20, Math.min(32, el.clientWidth / BOARD_COLS)) : 24
        const targetSteps = Math.trunc(dx / cellPx)
        while (dragStepsRef.current < targetSteps) {
          doRight()
          dragStepsRef.current += 1
        }
        while (dragStepsRef.current > targetSteps) {
          doLeft()
          dragStepsRef.current -= 1
        }
      }
    },
    onSwipe: (dir) => {
      if (pausedRef.current) return
      const axis = dragAxisRef.current
      dragAxisRef.current = 'none'
      dragStepsRef.current = 0

      if (axis === 'h') return
      if (dir === 'down') {
        doHardDrop()
      } else if (dir === 'up') {
        doHold()
      } else if (dir === 'left') {
        doLeft()
      } else if (dir === 'right') {
        doRight()
      }
    },
  })

  // Compute rendered cells (board + ghost + active piece).
  const cells = useMemo(() => {
    const activeMap = new Map<number, PieceColor>()
    const ghostMap = new Map<number, PieceColor>()
    const clearSet = new Set(state.clearingRows)

    if (state.active) {
      const color = PIECE_COLORS[state.active.type]
      const ghostY = getGhostY(state)
      if (ghostY !== null && ghostY !== state.active.y) {
        for (const [cx, cy] of getPieceCells({ ...state.active, y: ghostY })) {
          if (cy >= 0 && cy < BOARD_ROWS && cx >= 0 && cx < BOARD_COLS) {
            ghostMap.set(cy * BOARD_COLS + cx, color)
          }
        }
      }
      for (const [cx, cy] of getPieceCells(state.active)) {
        if (cy >= 0 && cy < BOARD_ROWS && cx >= 0 && cx < BOARD_COLS) {
          activeMap.set(cy * BOARD_COLS + cx, color)
        }
      }
    }

    const out: { key: number; kind: 'empty' | 'locked' | 'active' | 'ghost'; color?: PieceColor; clearing: boolean }[] =
      new Array(BOARD_ROWS * BOARD_COLS)

    for (let r = 0; r < BOARD_ROWS; r++) {
      const row = state.board[r]!
      const clearing = clearSet.has(r)
      for (let c = 0; c < BOARD_COLS; c++) {
        const idx = r * BOARD_COLS + c
        const activeColor = activeMap.get(idx)
        if (activeColor) {
          out[idx] = { key: idx, kind: 'active', color: activeColor, clearing: false }
          continue
        }
        const lockedColor = row[c]
        if (lockedColor) {
          out[idx] = { key: idx, kind: 'locked', color: lockedColor, clearing }
          continue
        }
        const ghostColor = ghostMap.get(idx)
        if (ghostColor) {
          out[idx] = { key: idx, kind: 'ghost', color: ghostColor, clearing: false }
          continue
        }
        out[idx] = { key: idx, kind: 'empty', clearing: false }
      }
    }
    return out
  }, [state])

  const nextThree = state.queue.slice(0, 3)

  return (
    <GameShell
      gameId="settle"
      stats={[
        { label: 'Lines', value: state.lines },
        { label: 'Pieces', value: state.pieces },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={handleRestart}
      onExit={handleExit}
      howTo={
        <>
          <p>Fit falling stones into full rows. The pace stays steady and slows gently during a wind-down.</p>
          <p>Use the D-pad and buttons, or tap the board to turn, drag to slide, swipe down to drop, and swipe up to hold.</p>
          <p>If the stack reaches the top, the bottom rows fade away to make room.</p>
        </>
      }
      controls={
        <div className="settle-deck" role="group" aria-label="Piece controls">
          <div className="settle-dpad" role="group" aria-label="Directional pad">
            <PadButton
              className="settle-dpad__arm settle-dpad__arm--up"
              label="Hard drop"
              disabled={paused}
              onTrigger={doHardDrop}
            >
              <ChevronUp size={20} strokeWidth={1.5} aria-hidden />
            </PadButton>
            <PadButton
              className="settle-dpad__arm settle-dpad__arm--left"
              label="Move left"
              repeat
              disabled={paused}
              onTrigger={doLeft}
            >
              <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
            </PadButton>
            <div className="settle-dpad__hub" aria-hidden>
              <span className="settle-dpad__dimple" />
            </div>
            <PadButton
              className="settle-dpad__arm settle-dpad__arm--right"
              label="Move right"
              repeat
              disabled={paused}
              onTrigger={doRight}
            >
              <ChevronRight size={20} strokeWidth={1.5} aria-hidden />
            </PadButton>
            <PadButton
              className="settle-dpad__arm settle-dpad__arm--down"
              label="Soft drop"
              repeat
              disabled={paused}
              onTrigger={doSoftDrop}
            >
              <ChevronDown size={20} strokeWidth={1.5} aria-hidden />
            </PadButton>
          </div>

          <PadButton
            className="settle-hold-pill t-label"
            label="Hold piece"
            disabled={paused || !state.canHold}
            onTrigger={doHold}
          >
            Hold
          </PadButton>

          <div className="settle-ab" role="group" aria-label="Action buttons">
            <PadButton
              className="settle-ab__btn settle-ab__btn--b"
              label="Hard drop"
              disabled={paused}
              onTrigger={doHardDrop}
            >
              <ArrowDownToLine size={20} strokeWidth={1.5} aria-hidden />
            </PadButton>
            <PadButton
              className="settle-ab__btn settle-ab__btn--a"
              label="Rotate clockwise"
              disabled={paused}
              onTrigger={doRotateCW}
            >
              <RotateCw size={22} strokeWidth={1.5} aria-hidden />
            </PadButton>
          </div>
        </div>
      }
    >
      <div className="settle-arena">
        <div
          ref={boardRef}
          className="settle-well"
          role="application"
          aria-label="Settle board"
        >
          <div className="settle-grid">
            {cells.map((cell) => {
              let cls = 'settle-cell'
              if (cell.kind === 'locked') {
                cls += ' settle-cell--filled'
                if (cell.clearing) cls += ' settle-cell--clearing'
              } else if (cell.kind === 'active') {
                cls += ' settle-cell--filled settle-cell--active'
              } else if (cell.kind === 'ghost') {
                cls += ' settle-cell--ghost'
              }
              return <div key={cell.key} className={cls} data-color={cell.color} />
            })}
          </div>

          {state.dissolving && (
            <div key={state.dissolving.id} className="settle-dissolve-layer" aria-hidden>
              {state.dissolving.rows.flatMap((row, rIdx) =>
                row.map((cell, cIdx) => (
                  <div
                    key={`${rIdx}-${cIdx}`}
                    className={cell ? 'settle-dissolve-cell' : undefined}
                    data-color={cell ?? undefined}
                  />
                )),
              )}
            </div>
          )}

          <AnimatePresence>
            {state.dissolving && (
              <motion.div
                key={`notice-${state.dissolving.id}`}
                className="settle-notice t-label"
                role="status"
                aria-live="polite"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: 0.24, ease: easeArray.out }}
              >
                Making room
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <aside className="settle-rail" aria-label="Held and upcoming pieces">
          <button
            type="button"
            className="settle-panel settle-panel--hold"
            data-locked={!state.canHold}
            disabled={paused || !state.canHold}
            onClick={doHold}
            aria-label={state.hold ? `Hold piece (${state.hold})` : 'Hold piece'}
          >
            <span className="t-label">Hold</span>
            <div className="settle-panel__slot">
              {state.hold ? <MiniPiece type={state.hold} /> : <span className="settle-panel__empty" aria-hidden />}
            </div>
          </button>

          <div className="settle-panel">
            <span className="t-label">Next</span>
            <div className="settle-next-list">
              {nextThree.map((type, idx) => (
                <div key={`${idx}-${type}`} className="settle-next-item" data-rank={idx}>
                  <MiniPiece type={type} />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </GameShell>
  )
}
