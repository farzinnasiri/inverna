import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Sparkles } from 'lucide-react'
import {
  createHue,
  findHintPair,
  hexToOklab,
  nextPuzzle,
  restartPuzzle,
  swapTiles,
  type HueState,
} from '@/core/games/hue/engine'
import { Completion, GameShell, type GameScreenProps } from '@/ui/components/GameShell'
import { Button } from '@/ui/components/controls'
import { useCalm, useFeedback, useGameSave, useKeys } from '@/ui/hooks/game'
import './hue.css'

interface HueSave {
  version: 1
  state: HueState
  completed: number
}

interface DragRender {
  fromIdx: number
  dx: number
  dy: number
  hoverIdx: number | null
}

interface DragSession {
  pointerId: number
  fromIdx: number
  startX: number
  startY: number
  dx: number
  dy: number
  dragging: boolean
  hoverIdx: number | null
}

interface FlipEntry {
  dx: number
  dy: number
  phase: 'start' | 'active'
}

const DRAG_THRESHOLD_PX = 7
const FLIP_DURATION_MS = 230
const HINT_DURATION_MS = 2250

function isValidSave(value: unknown): value is HueSave {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<HueSave>
  return (
    v.version === 1 &&
    !!v.state &&
    typeof v.state.cols === 'number' &&
    typeof v.state.rows === 'number' &&
    Array.isArray(v.state.tiles) &&
    v.state.tiles.length === v.state.cols * v.state.rows &&
    Array.isArray(v.state.targetColors) &&
    Array.isArray(v.state.initialOrder)
  )
}

export default function HueScreen({ onExit }: GameScreenProps) {
  const calm = useCalm()
  const { cue, haptic } = useFeedback()

  const [fallback] = useState<HueSave>(() => ({
    version: 1,
    state: createHue({ seed: Date.now() >>> 0, calm }),
    completed: 0,
  }))
  const [rawSave, setSave] = useGameSave<HueSave>('hue', fallback)
  const save = isValidSave(rawSave) ? rawSave : fallback
  const state = save.state

  const [paused, setPaused] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [hintIndices, setHintIndices] = useState<[number, number] | null>(null)
  const [hintTick, setHintTick] = useState(0)
  const [showCompletion, setShowCompletion] = useState(state.solved)
  const [dragRender, setDragRender] = useState<DragRender | null>(null)
  const [flips, setFlips] = useState<Record<number, FlipEntry>>({})

  const gridRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragSession | null>(null)
  const hintTimerRef = useRef<number | undefined>(undefined)
  const flipTimerRef = useRef<number | undefined>(undefined)
  const completionTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => {
      window.clearTimeout(hintTimerRef.current)
      window.clearTimeout(flipTimerRef.current)
      window.clearTimeout(completionTimerRef.current)
    }
  }, [])

  // Precompute whether each tile is dark so anchor dots always contrast crisply.
  const darkTileIds = useMemo(() => {
    const dark = new Set<number>()
    for (const tile of state.tiles) {
      if (tile.pinned && hexToOklab(tile.color).L < 0.54) {
        dark.add(tile.id)
      }
    }
    return dark
  }, [state.tiles])

  const clearHint = useCallback(() => {
    window.clearTimeout(hintTimerRef.current)
    setHintIndices(null)
  }, [])

  const triggerSwapFlip = useCallback(
    (
      indexA: number,
      indexB: number,
      tileIdA: number,
      tileIdB: number,
      dragOffset?: { dx: number; dy: number },
    ) => {
      const grid = gridRef.current
      if (!grid) return
      const rect = grid.getBoundingClientRect()
      const gap = 2
      const cellW = (rect.width - gap * (state.cols - 1)) / state.cols
      const cellH = (rect.height - gap * (state.rows - 1)) / state.rows
      const pitchX = cellW + gap
      const pitchY = cellH + gap

      const colA = indexA % state.cols
      const rowA = Math.floor(indexA / state.cols)
      const colB = indexB % state.cols
      const rowB = Math.floor(indexB / state.cols)

      const dxAB = (colA - colB) * pitchX
      const dyAB = (rowA - rowB) * pitchY

      // After swapping: tileIdA sits at indexB; tileIdB sits at indexA.
      const startA = dragOffset
        ? { dx: dxAB + dragOffset.dx, dy: dyAB + dragOffset.dy }
        : { dx: dxAB, dy: dyAB }
      const startB = { dx: -dxAB, dy: -dyAB }

      window.clearTimeout(flipTimerRef.current)
      setFlips({
        [tileIdA]: { ...startA, phase: 'start' },
        [tileIdB]: { ...startB, phase: 'start' },
      })

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setFlips({
            [tileIdA]: { dx: 0, dy: 0, phase: 'active' },
            [tileIdB]: { dx: 0, dy: 0, phase: 'active' },
          })
          flipTimerRef.current = window.setTimeout(() => setFlips({}), FLIP_DURATION_MS)
        })
      })
    },
    [state.cols, state.rows],
  )

  const performSwap = useCallback(
    (indexA: number, indexB: number, dragOffset?: { dx: number; dy: number }) => {
      const tileA = state.tiles[indexA]
      const tileB = state.tiles[indexB]
      if (!tileA || !tileB || tileA.pinned || tileB.pinned || indexA === indexB) return

      const next = swapTiles(state, indexA, indexB)
      if (next === state) return

      clearHint()
      setSelectedIndex(null)
      triggerSwapFlip(indexA, indexB, tileA.id, tileB.id, dragOffset)

      setSave((prev) => ({
        version: 1,
        state: next,
        completed: (isValidSave(prev) ? prev.completed : 0) + (next.solved ? 1 : 0),
      }))

      if (next.solved) {
        cue('chime', 0.9)
        haptic('success')
        const diagonalSteps = next.cols + next.rows - 2
        const waveMs = Math.min(1050, diagonalSteps * 55 + 480)
        window.clearTimeout(completionTimerRef.current)
        completionTimerRef.current = window.setTimeout(() => {
          setShowCompletion(true)
        }, waveMs)
      } else {
        cue('place', 0.85)
        haptic('light')
      }
    },
    [state, clearHint, triggerSwapFlip, setSave, cue, haptic],
  )

  const handleTileSelect = useCallback(
    (index: number) => {
      if (state.solved || paused) return
      const tile = state.tiles[index]
      if (!tile || tile.pinned) return

      if (selectedIndex === null) {
        setSelectedIndex(index)
        cue('tap', 0.65)
        haptic('light')
      } else if (selectedIndex === index) {
        setSelectedIndex(null)
        cue('tap', 0.4)
      } else {
        performSwap(selectedIndex, index)
      }
    },
    [state.solved, state.tiles, paused, selectedIndex, performSwap, cue, haptic],
  )

  const handleHint = useCallback(() => {
    if (state.solved || paused) return
    const pair = findHintPair(state)
    if (!pair) return
    clearHint()
    setHintIndices(pair)
    setHintTick((t) => t + 1)
    cue('tap', 0.45)
    hintTimerRef.current = window.setTimeout(() => setHintIndices(null), HINT_DURATION_MS)
  }, [state, paused, clearHint, cue])

  const handleRestart = useCallback(() => {
    window.clearTimeout(completionTimerRef.current)
    clearHint()
    setSelectedIndex(null)
    setShowCompletion(false)
    setFlips({})
    setSave((prev) => ({
      version: 1,
      state: restartPuzzle(isValidSave(prev) ? prev.state : state),
      completed: isValidSave(prev) ? prev.completed : 0,
    }))
    cue('undo', 0.7)
  }, [clearHint, setSave, state, cue])

  const handleNextPalette = useCallback(() => {
    window.clearTimeout(completionTimerRef.current)
    clearHint()
    setSelectedIndex(null)
    setFocusedIndex(null)
    setShowCompletion(false)
    setFlips({})
    setSave((prev) => ({
      version: 1,
      state: nextPuzzle(isValidSave(prev) ? prev.state : state, calm),
      completed: isValidSave(prev) ? prev.completed : 0,
    }))
    cue('tap', 0.6)
  }, [clearHint, setSave, state, calm, cue])

  /* --- Pointer hit-testing & drag-to-swap --------------------------------- */

  const slotFromPoint = useCallback(
    (clientX: number, clientY: number): number | null => {
      const grid = gridRef.current
      if (!grid) return null
      const rect = grid.getBoundingClientRect()
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return null
      }
      const col = Math.min(
        state.cols - 1,
        Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * state.cols)),
      )
      const row = Math.min(
        state.rows - 1,
        Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * state.rows)),
      )
      return row * state.cols + col
    },
    [state.cols, state.rows],
  )

  const onGridPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (paused || state.solved) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (dragRef.current) return

    const idx = slotFromPoint(e.clientX, e.clientY)
    if (idx === null) return
    const tile = state.tiles[idx]
    if (!tile || tile.pinned) return

    setFocusedIndex(null)
    dragRef.current = {
      pointerId: e.pointerId,
      fromIdx: idx,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      dragging: false,
      hoverIdx: null,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onGridPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const session = dragRef.current
    if (!session || session.pointerId !== e.pointerId) return

    const dx = e.clientX - session.startX
    const dy = e.clientY - session.startY
    session.dx = dx
    session.dy = dy

    if (!session.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      session.dragging = true
      setSelectedIndex(null)
      cue('tap', 0.6)
      haptic('light')
    }

    if (session.dragging) {
      const over = slotFromPoint(e.clientX, e.clientY)
      const hoverIdx =
        over !== null && over !== session.fromIdx && !state.tiles[over]?.pinned ? over : null
      session.hoverIdx = hoverIdx
      setDragRender({ fromIdx: session.fromIdx, dx, dy, hoverIdx })
    }
  }

  const finishPointer = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const session = dragRef.current
    if (!session || session.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragRender(null)

    if (cancelled) return

    if (session.dragging) {
      if (session.hoverIdx !== null && session.hoverIdx !== session.fromIdx) {
        performSwap(session.fromIdx, session.hoverIdx, { dx: session.dx, dy: session.dy })
      }
    } else {
      handleTileSelect(session.fromIdx)
    }
  }

  /* --- Keyboard navigation ------------------------------------------------ */

  const moveFocus = useCallback(
    (dCol: number, dRow: number) => {
      setFocusedIndex((prev) => {
        if (prev === null) {
          const firstMovable = state.tiles.findIndex((t) => !t.pinned)
          return firstMovable >= 0 ? firstMovable : 0
        }
        const col = Math.min(state.cols - 1, Math.max(0, (prev % state.cols) + dCol))
        const row = Math.min(state.rows - 1, Math.max(0, Math.floor(prev / state.cols) + dRow))
        return row * state.cols + col
      })
    },
    [state.cols, state.rows, state.tiles],
  )

  useKeys(
    {
      ArrowLeft: () => moveFocus(-1, 0),
      ArrowRight: () => moveFocus(1, 0),
      ArrowUp: () => moveFocus(0, -1),
      ArrowDown: () => moveFocus(0, 1),
      Enter: () => focusedIndex !== null && handleTileSelect(focusedIndex),
      ' ': () => focusedIndex !== null && handleTileSelect(focusedIndex),
      Escape: () => setSelectedIndex(null),
      h: handleHint,
      H: handleHint,
    },
    !paused && !state.solved,
    false,
  )

  const gridStyle = {
    '--cols': state.cols,
    '--rows': state.rows,
  } as CSSProperties

  const hintSet = useMemo(
    () => (hintIndices ? new Set<number>(hintIndices) : null),
    [hintIndices],
  )

  return (
    <GameShell
      gameId="hue"
      stats={[
        { label: 'Palette', value: state.puzzleNumber },
        { label: 'Moves', value: state.moves },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={handleRestart}
      onExit={onExit}
      howTo={
        <>
          <p>Tap two tiles — or drag one onto another — to swap them until the gradient flows smoothly.</p>
          <p>Tiles with a small dot are anchored in place and show where each corner belongs.</p>
        </>
      }
      controls={
        <div className="hue-bar">
          <span className="hue-bar__title t-headline">{state.paletteTitle}</span>
          <Button
            variant="quiet"
            size="sm"
            onClick={handleHint}
            disabled={state.solved}
            aria-label="Hint"
          >
            <Sparkles size={16} strokeWidth={1.5} aria-hidden />
            Hint
          </Button>
        </div>
      }
    >
      <div className="hue-stage">
        <div className="hue-board" style={gridStyle}>
          <div
            ref={gridRef}
            className="hue-grid"
            role="grid"
            aria-label={`${state.paletteTitle} colour gradient`}
            data-solved={state.solved}
            onPointerDown={onGridPointerDown}
            onPointerMove={onGridPointerMove}
            onPointerUp={(e) => finishPointer(e, false)}
            onPointerCancel={(e) => finishPointer(e, true)}
          >
            {state.tiles.map((tile, idx) => {
              const col = idx % state.cols
              const row = Math.floor(idx / state.cols)
              const corner =
                row === 0 && col === 0
                  ? 'tl'
                  : row === 0 && col === state.cols - 1
                    ? 'tr'
                    : row === state.rows - 1 && col === 0
                      ? 'bl'
                      : row === state.rows - 1 && col === state.cols - 1
                        ? 'br'
                        : undefined

              const isDragging = dragRender?.fromIdx === idx
              const isDropTarget = dragRender?.hoverIdx === idx
              const isSelected = selectedIndex === idx
              const isFocused = focusedIndex === idx
              const isHinted = hintSet?.has(idx) ?? false
              const flip = flips[tile.id]

              const tileStyle: CSSProperties = {
                ['--tile-color' as string]: tile.color,
                ['--wave-delay' as string]: `${(col + row) * 55}ms`,
              }

              if (isDragging && dragRender) {
                tileStyle.transform = `translate3d(${dragRender.dx}px, ${dragRender.dy}px, 0) scale(1.05)`
              } else if (flip) {
                tileStyle.transform = `translate3d(${flip.dx}px, ${flip.dy}px, 0)`
              }

              return (
                <div
                  key={tile.id}
                  className="hue-tile"
                  role="gridcell"
                  aria-label={
                    tile.pinned
                      ? `Row ${row + 1}, column ${col + 1}, anchored`
                      : `Row ${row + 1}, column ${col + 1}${isSelected ? ', selected' : ''}`
                  }
                  aria-selected={isSelected || undefined}
                  data-corner={corner}
                  data-pinned={tile.pinned}
                  data-dark={tile.pinned && darkTileIds.has(tile.id) ? 'true' : undefined}
                  data-selected={isSelected || undefined}
                  data-focused={isFocused || undefined}
                  data-dragging={isDragging || undefined}
                  data-drop-target={isDropTarget || undefined}
                  data-flip-start={flip?.phase === 'start' ? 'true' : undefined}
                  data-flip-active={flip?.phase === 'active' ? 'true' : undefined}
                  style={tileStyle}
                >
                  {tile.pinned && <span className="hue-tile__anchor" aria-hidden />}
                  {isHinted && <span key={hintTick} className="hue-tile__hint" aria-hidden />}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <Completion
        open={showCompletion}
        title="Solved"
        line={`In harmony · ${state.paletteTitle}`}
        actionLabel="Next palette"
        onAction={handleNextPalette}
      />
    </GameShell>
  )
}
