import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { RefreshCw, Undo2 } from 'lucide-react'
import {
  WOBBLE_DURATION_MS,
  createCascade,
  findCluster,
  nextBoard,
  remainingTiles,
  restartBoard,
  stripEphemeralForSave,
  tapCell,
  tickCascade,
  undoCascade,
  type CascadeState,
  type CellCoord,
} from '@/core/games/cascade/engine'
import { hexToRgb, type ResolvedTokens } from '@/design/tokens'
import { Completion, GameShell, type GameScreenProps } from '@/ui/components/GameShell'
import { IconButton } from '@/ui/components/controls'
import { useCalm, useFeedback, useGameLoop, useGameSave, useKeys } from '@/ui/hooks/game'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import './cascade.css'

interface CascadeSave {
  version: 1
  state: CascadeState | null
  bestScore: number
  boardsCleared: number
  plays: number
}

interface BoardLayout {
  boardX: number
  boardY: number
  boardW: number
  boardH: number
  cellSize: number
  bezelPad: number
}

interface UiMeta {
  score: number
  tiles: number
  undoCount: number
  boardComplete: boolean
  fallingEmpty: boolean
}

const DEFAULT_SAVE: CascadeSave = {
  version: 1,
  state: null,
  bestScore: 0,
  boardsCleared: 0,
  plays: 1,
}

const CANVAS_BOTTOM_OVERFLOW = 96
const BEZEL_PAD = 6
const BEZEL_RADIUS = 16
const TILE_GAP = 1.5
const TILE_RADIUS = 3

function hexAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha.toFixed(3)})`
}

function isValidCascadeState(v: unknown): v is CascadeState {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<CascadeState>
  return (
    typeof s.rows === 'number' &&
    s.rows >= 5 &&
    s.rows <= 16 &&
    typeof s.cols === 'number' &&
    s.cols >= 5 &&
    s.cols <= 16 &&
    Array.isArray(s.board) &&
    s.board.length === s.rows &&
    Array.isArray(s.falling) &&
    Array.isArray(s.undo) &&
    Array.isArray(s.initialGrid) &&
    typeof s.score === 'number' &&
    typeof s.cleared === 'number' &&
    typeof s.boardsCleared === 'number' &&
    typeof s.boardComplete === 'boolean' &&
    typeof s.rngState === 'number' &&
    typeof s.nextId === 'number'
  )
}

function extractMeta(state: CascadeState): UiMeta {
  return {
    score: state.score,
    tiles: remainingTiles(state),
    undoCount: state.undo.length,
    boardComplete: state.boardComplete,
    fallingEmpty: state.falling.length === 0,
  }
}

function computeBoardLayout(stageW: number, stageH: number, rows: number, cols: number): BoardLayout {
  const innerW = Math.max(40, stageW - BEZEL_PAD * 2 - 4)
  const innerH = Math.max(40, stageH - BEZEL_PAD * 2 - 4)
  const cellSize = Math.max(12, Math.floor(Math.min(innerW / cols, innerH / rows)))
  const boardW = cellSize * cols
  const boardH = cellSize * rows
  const boardX = Math.round((stageW - boardW) * 0.5)
  const boardY = Math.round((stageH - boardH) * 0.5)
  return { boardX, boardY, boardW, boardH, cellSize, bezelPad: BEZEL_PAD }
}

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w * 0.5, h * 0.5)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

function drawCascade(
  ctx: CanvasRenderingContext2D,
  state: CascadeState,
  canvasW: number,
  canvasH: number,
  layout: BoardLayout,
  previewKeys: ReadonlySet<number>,
  reducedMotion: boolean,
  tokens: ResolvedTokens,
): void {
  const { boardX, boardY, boardW, boardH, cellSize, bezelPad } = layout

  // Clear entire canvas transparently so the Watchmaker obsidian stage breathes behind it.
  ctx.clearRect(0, 0, canvasW, canvasH)

  const bezelX = boardX - bezelPad
  const bezelY = boardY - bezelPad
  const bezelW = boardW + bezelPad * 2
  const bezelH = boardH + bezelPad * 2

  // --- Layer 1: Pure #000000 void inside crisp hairline bezel + carved-out grid dots ---
  traceRoundedRect(ctx, bezelX, bezelY, bezelW, bezelH, BEZEL_RADIUS)
  ctx.fillStyle = tokens.color.bg
  ctx.fill()
  ctx.strokeStyle = tokens.color.line
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.save()
  traceRoundedRect(ctx, boardX - 1, boardY - 1, boardW + 2, boardH + 2, Math.max(4, BEZEL_RADIUS - bezelPad))
  ctx.clip()

  const dotColor = hexAlpha(tokens.color.ink4, 0.16)
  ctx.fillStyle = dotColor
  for (let r = 0; r < state.rows; r++) {
    const row = state.board[r]!
    const cy = boardY + (r + 0.5) * cellSize
    for (let c = 0; c < state.cols; c++) {
      if (row[c] !== null) continue
      const cx = boardX + (c + 0.5) * cellSize
      ctx.beginPath()
      ctx.arc(cx, cy, 0.9, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // --- Layer 2: Standing Watchmaker Mosaic ---
  const inset = TILE_GAP * 0.5
  const tileSize = Math.max(4, cellSize - TILE_GAP)
  const innerStroke = 'rgba(255, 255, 255, 0.08)'
  const hoverLift = 'rgba(255, 255, 255, 0.085)'

  for (let r = 0; r < state.rows; r++) {
    const row = state.board[r]!
    for (let c = 0; c < state.cols; c++) {
      const tile = row[c]
      if (!tile) continue

      let wobbleOffsetX = 0
      if (state.wobble && state.wobble.id === tile.id) {
        const progress = Math.min(1, state.wobble.ageMs / WOBBLE_DURATION_MS)
        const amp = reducedMotion ? 1.4 : 3.2
        wobbleOffsetX = Math.sin(progress * Math.PI * 5) * (1 - progress) * amp
      }

      const tx = boardX + tile.x * cellSize + inset + wobbleOffsetX
      const ty = boardY + tile.y * cellSize + inset

      traceRoundedRect(ctx, tx, ty, tileSize, tileSize, TILE_RADIUS)
      ctx.fillStyle = tokens.pieces[tile.color]
      ctx.fill()

      // Highlight entire connected cluster gently when hovered or pressed.
      const key = r * state.cols + c
      if (previewKeys.has(key)) {
        ctx.fillStyle = hoverLift
        ctx.fill()
      }

      // Crisp 1px inner edge highlight so architectural plates read cleanly.
      traceRoundedRect(ctx, tx + 0.5, ty + 0.5, tileSize - 1, tileSize - 1, Math.max(1, TILE_RADIUS - 0.5))
      ctx.strokeStyle = innerStroke
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  // Crisp 1.5px exterior perimeter contour around hovered/pressed cluster (>= 2 tiles).
  if (previewKeys.size >= 2) {
    ctx.strokeStyle = hexAlpha(tokens.color.ink, 0.58)
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.beginPath()

    for (const key of previewKeys) {
      const r = Math.floor(key / state.cols)
      const c = key % state.cols
      const tile = state.board[r]?.[c]
      if (!tile) continue

      const left = boardX + tile.x * cellSize + inset + 0.75
      const top = boardY + tile.y * cellSize + inset + 0.75
      const right = left + tileSize - 1.5
      const bottom = top + tileSize - 1.5

      // Top edge
      if (r === 0 || !previewKeys.has((r - 1) * state.cols + c)) {
        ctx.moveTo(left, top)
        ctx.lineTo(right, top)
      }
      // Bottom edge
      if (r === state.rows - 1 || !previewKeys.has((r + 1) * state.cols + c)) {
        ctx.moveTo(left, bottom)
        ctx.lineTo(right, bottom)
      }
      // Left edge
      if (c === 0 || !previewKeys.has(r * state.cols + (c - 1))) {
        ctx.moveTo(left, top)
        ctx.lineTo(left, bottom)
      }
      // Right edge
      if (c === state.cols - 1 || !previewKeys.has(r * state.cols + (c + 1))) {
        ctx.moveTo(right, top)
        ctx.lineTo(right, bottom)
      }
    }
    ctx.stroke()
  }

  ctx.restore()

  // --- Layer 3: Tumbling Detached Tiles (drawn ON TOP, unclipped past bottom edge!) ---
  if (state.falling.length > 0) {
    const half = tileSize * 0.5
    for (const f of state.falling) {
      if (f.alpha <= 0.005) continue
      const cx = boardX + (f.x + 0.5) * cellSize
      const cy = boardY + (f.y + 0.5) * cellSize
      const drawAngle = reducedMotion ? f.angle * 0.2 : f.angle
      const drawScale = reducedMotion ? 1 : f.scale
      const drawAlpha = reducedMotion ? Math.max(0, f.alpha - Math.max(0, (f.y - state.rows * 0.2) * 0.06)) : f.alpha
      if (drawAlpha <= 0.005) continue

      ctx.save()
      ctx.globalAlpha = drawAlpha
      ctx.translate(cx, cy)
      ctx.rotate(drawAngle)
      ctx.scale(drawScale, drawScale)

      traceRoundedRect(ctx, -half, -half, tileSize, tileSize, TILE_RADIUS)
      ctx.fillStyle = tokens.pieces[f.color]
      ctx.fill()

      // Subtle inner light edge
      traceRoundedRect(ctx, -half + 0.5, -half + 0.5, tileSize - 1, tileSize - 1, Math.max(1, TILE_RADIUS - 0.5))
      ctx.strokeStyle = innerStroke
      ctx.lineWidth = 1
      ctx.stroke()

      // Crisp obsidian outline so tumbling tiles pop cleanly in front of the remaining mosaic
      traceRoundedRect(ctx, -half - 0.5, -half - 0.5, tileSize + 1, tileSize + 1, TILE_RADIUS + 0.5)
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 1.15
      ctx.stroke()

      ctx.restore()
    }
  }
}

export default function CascadeScreen({ onExit }: GameScreenProps) {
  const calm = useCalm()
  const { cue, haptic } = useFeedback()
  const reduceMotion = useReducedMotion() ?? false
  const tokens = useTokenColors()
  const [saved, setSaved] = useGameSave<CascadeSave>('cascade', DEFAULT_SAVE)

  const initialStateRef = useRef<CascadeState | null>(null)
  if (initialStateRef.current === null) {
    initialStateRef.current = isValidCascadeState(saved.state)
      ? stripEphemeralForSave(saved.state)
      : createCascade({ seed: Date.now() >>> 0, calm, boardsCleared: saved.boardsCleared })
  }

  const stateRef = useRef<CascadeState>(initialStateRef.current)
  const [uiMeta, setUiMeta] = useState<UiMeta>(() => extractMeta(initialStateRef.current!))
  const [paused, setPaused] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef<{ stageW: number; stageH: number; canvasH: number; dpr: number }>({
    stageW: 320,
    stageH: 420,
    canvasH: 516,
    dpr: 1,
  })
  const layoutRef = useRef<BoardLayout>(
    computeBoardLayout(320, 420, stateRef.current.rows, stateRef.current.cols),
  )

  const previewKeysRef = useRef<Set<number>>(new Set())
  const pressedClusterRef = useRef<{ pointerId: number; origin: CellCoord; keys: Set<number> } | null>(null)

  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const calmRef = useRef(calm)
  calmRef.current = calm
  const reducedMotionRef = useRef(reduceMotion)
  reducedMotionRef.current = reduceMotion
  const tokensRef = useRef<ResolvedTokens>(tokens)
  tokensRef.current = tokens

  const syncUiMeta = useCallback((next: CascadeState) => {
    const m = extractMeta(next)
    setUiMeta((prev) =>
      prev.score === m.score &&
      prev.tiles === m.tiles &&
      prev.undoCount === m.undoCount &&
      prev.boardComplete === m.boardComplete &&
      prev.fallingEmpty === m.fallingEmpty
        ? prev
        : m,
    )
  }, [])

  const persist = useCallback(
    (nextState: CascadeState, incrementPlays = false) => {
      const stripped = stripEphemeralForSave(nextState)
      setSaved((prev) => ({
        version: 1,
        state: stripped,
        bestScore: Math.max(prev.bestScore, stripped.score),
        boardsCleared: Math.max(prev.boardsCleared, stripped.boardsCleared),
        plays: incrementPlays ? prev.plays + 1 : prev.plays,
      }))
    },
    [setSaved],
  )

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { stageW, stageH, canvasH, dpr } = sizeRef.current
    if (stageW <= 0 || stageH <= 0) return

    const cur = stateRef.current
    const layout = computeBoardLayout(stageW, stageH, cur.rows, cur.cols)
    layoutRef.current = layout

    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawCascade(ctx, cur, stageW, canvasH, layout, previewKeysRef.current, reducedMotionRef.current, tokensRef.current)
    ctx.restore()
  }, [])

  // Redraw immediately when live token warmth changes (even while paused).
  useEffect(() => {
    renderCanvas()
  }, [tokens, renderCanvas])

  // Keep DPR-scaled canvas matched to the stage dimensions + bottom tumbling runway.
  useEffect(() => {
    const container = stageRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const stageW = Math.max(1, Math.round(rect.width))
      const stageH = Math.max(1, Math.round(rect.height))
      const canvasH = stageH + CANVAS_BOTTOM_OVERFLOW
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
      sizeRef.current = { stageW, stageH, canvasH, dpr }

      const targetW = Math.round(stageW * dpr)
      const targetH = Math.round(canvasH * dpr)
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW
        canvas.height = targetH
      }
      renderCanvas()
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    return () => ro.disconnect()
  }, [renderCanvas])

  // 60fps physics & settling loop.
  useGameLoop(
    useCallback(
      (dtMs: number) => {
        const prev = stateRef.current
        const effectiveDt = reducedMotionRef.current ? dtMs * 1.35 : dtMs
        const next = tickCascade(prev, effectiveDt, calmRef.current)
        if (next !== prev) {
          stateRef.current = next
          if (prev.falling.length > 0 && next.falling.length === 0) {
            syncUiMeta(next)
          }
          renderCanvas()
        }
      },
      [renderCanvas, syncUiMeta],
    ),
    !paused,
  )

  const cellFromPoint = useCallback((clientX: number, clientY: number): CellCoord | null => {
    const el = stageRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const { boardX, boardY, boardW, boardH, cellSize } = layoutRef.current
    if (x < boardX || x >= boardX + boardW || y < boardY || y >= boardY + boardH) return null

    const cur = stateRef.current
    const col = Math.floor((x - boardX) / cellSize)
    const row = Math.floor((y - boardY) / cellSize)
    if (row < 0 || row >= cur.rows || col < 0 || col >= cur.cols) return null
    return { row, col }
  }, [])

  const clusterKeySet = useCallback((cell: CellCoord | null): Set<number> => {
    const out = new Set<number>()
    if (!cell) return out
    const cur = stateRef.current
    if (cur.boardComplete) return out
    const cluster = findCluster(cur, cell.row, cell.col)
    if (cluster.length < 2) return out
    for (const pt of cluster) {
      out.add(pt.row * cur.cols + pt.col)
    }
    return out
  }, [])

  const applyTap = useCallback(
    (row: number, col: number) => {
      if (pausedRef.current) return
      const prev = stateRef.current
      const next = tapCell(prev, row, col)
      if (next === prev) return

      stateRef.current = next
      previewKeysRef.current = new Set()
      syncUiMeta(next)
      renderCanvas()

      if (next.lastCompleteEventId > prev.lastCompleteEventId) {
        cue('chime', 0.85)
        haptic('success')
        persist(next)
        return
      }

      if (next.lastTapEventId > prev.lastTapEventId) {
        const count = next.lastTapCount
        if (count >= 10) {
          cue('clear', 0.9)
          haptic('medium')
        } else if (count >= 5) {
          cue('place', 0.8)
          haptic('medium')
        } else {
          cue('tap', 0.65)
          haptic('light')
        }
        persist(next)
        return
      }

      // Single-tile non-punitive wobble.
      if (next.wobble && next.wobble !== prev.wobble) {
        cue('tap', 0.22)
      }
    },
    [cue, haptic, persist, renderCanvas, syncUiMeta],
  )

  const handleUndo = useCallback(() => {
    if (pausedRef.current) return
    const prev = stateRef.current
    const next = undoCascade(prev)
    if (next === prev) return

    stateRef.current = next
    previewKeysRef.current = new Set()
    pressedClusterRef.current = null
    syncUiMeta(next)
    renderCanvas()
    cue('undo', 0.65)
    haptic('light')
    persist(next)
  }, [cue, haptic, persist, renderCanvas, syncUiMeta])

  const handleRestart = useCallback(() => {
    const next = restartBoard(stateRef.current)
    stateRef.current = next
    previewKeysRef.current = new Set()
    pressedClusterRef.current = null
    syncUiMeta(next)
    renderCanvas()
    cue('undo', 0.55)
    haptic('light')
    persist(next, true)
  }, [cue, haptic, persist, renderCanvas, syncUiMeta])

  const handleNextBoard = useCallback(() => {
    const next = nextBoard(stateRef.current, calmRef.current)
    stateRef.current = next
    previewKeysRef.current = new Set()
    pressedClusterRef.current = null
    syncUiMeta(next)
    renderCanvas()
    cue('tap', 0.55)
    haptic('light')
    persist(next, true)
  }, [cue, haptic, persist, renderCanvas, syncUiMeta])

  const handlePauseChange = useCallback(
    (nextPaused: boolean) => {
      if (nextPaused) {
        previewKeysRef.current = new Set()
        pressedClusterRef.current = null
        persist(stateRef.current)
      }
      setPaused(nextPaused)
    },
    [persist],
  )

  const handleExit = useCallback(() => {
    persist(stateRef.current)
    onExit()
  }, [persist, onExit])

  // Pointer handlers on the stage: hover preview (fine pointer), press preview, release-to-pop.
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pausedRef.current || stateRef.current.boardComplete) return
      if (pressedClusterRef.current !== null) return

      const cell = cellFromPoint(e.clientX, e.clientY)
      if (!cell) return
      if (!stateRef.current.board[cell.row]?.[cell.col]) return

      e.currentTarget.setPointerCapture(e.pointerId)
      const keys = clusterKeySet(cell)
      pressedClusterRef.current = { pointerId: e.pointerId, origin: cell, keys }
      previewKeysRef.current = keys
      renderCanvas()
    },
    [cellFromPoint, clusterKeySet, renderCanvas],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pausedRef.current || stateRef.current.boardComplete) return

      const pressed = pressedClusterRef.current
      if (pressed && pressed.pointerId === e.pointerId) {
        const cell = cellFromPoint(e.clientX, e.clientY)
        const cols = stateRef.current.cols
        const insidePressed =
          cell !== null &&
          (pressed.keys.size >= 2
            ? pressed.keys.has(cell.row * cols + cell.col)
            : cell.row === pressed.origin.row && cell.col === pressed.origin.col)
        const nextPreview = insidePressed ? pressed.keys : new Set<number>()
        if (nextPreview.size !== previewKeysRef.current.size) {
          previewKeysRef.current = nextPreview
          renderCanvas()
        }
        return
      }

      // Hover preview for fine pointers (mouse / trackpad / stylus).
      if (e.pointerType !== 'touch') {
        const cell = cellFromPoint(e.clientX, e.clientY)
        const nextKeys = clusterKeySet(cell)
        let same = nextKeys.size === previewKeysRef.current.size
        if (same) {
          for (const k of nextKeys) {
            if (!previewKeysRef.current.has(k)) {
              same = false
              break
            }
          }
        }
        if (!same) {
          previewKeysRef.current = nextKeys
          renderCanvas()
        }
      }
    },
    [cellFromPoint, clusterKeySet, renderCanvas],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const pressed = pressedClusterRef.current
      if (!pressed || pressed.pointerId !== e.pointerId) return
      pressedClusterRef.current = null

      const cell = cellFromPoint(e.clientX, e.clientY)
      const cols = stateRef.current.cols
      if (cell) {
        if (pressed.keys.size >= 2 && pressed.keys.has(cell.row * cols + cell.col)) {
          applyTap(cell.row, cell.col)
          return
        }
        if (pressed.keys.size === 0 && cell.row === pressed.origin.row && cell.col === pressed.origin.col) {
          applyTap(cell.row, cell.col)
          return
        }
      }

      previewKeysRef.current = new Set()
      renderCanvas()
    },
    [applyTap, cellFromPoint, renderCanvas],
  )

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pressedClusterRef.current?.pointerId === e.pointerId) {
        pressedClusterRef.current = null
      }
      if (previewKeysRef.current.size > 0) {
        previewKeysRef.current = new Set()
        renderCanvas()
      }
    },
    [renderCanvas],
  )

  const onPointerLeave = useCallback(() => {
    if (pressedClusterRef.current !== null) return
    if (previewKeysRef.current.size > 0) {
      previewKeysRef.current = new Set()
      renderCanvas()
    }
  }, [renderCanvas])

  // Keyboard shortcuts: Z / Backspace undo, R restart, P / Escape pause.
  useKeys(
    {
      z: handleUndo,
      Z: handleUndo,
      Backspace: handleUndo,
      r: handleRestart,
      R: handleRestart,
      p: () => handlePauseChange(true),
      P: () => handlePauseChange(true),
      Escape: () => handlePauseChange(true),
    },
    !paused,
    false,
  )

  useKeys(
    {
      p: () => handlePauseChange(false),
      P: () => handlePauseChange(false),
    },
    paused,
    false,
  )

  const showCompletion = uiMeta.boardComplete && uiMeta.fallingEmpty

  return (
    <GameShell
      gameId="cascade"
      stats={[
        { label: 'Score', value: uiMeta.score },
        { label: 'Tiles', value: uiMeta.tiles },
      ]}
      paused={paused}
      onPauseChange={handlePauseChange}
      onRestart={handleRestart}
      onExit={handleExit}
      howTo={
        <>
          <p>Tap any group of two or more matching tiles to release them from the mosaic.</p>
          <p>Larger clusters score more. When no pairs remain, the final tiles tumble away into black.</p>
        </>
      }
      controls={
        <div className="cascade-controls">
          <div className="cascade-undo">
            <IconButton label="Undo" onClick={handleUndo} disabled={paused || uiMeta.undoCount === 0}>
              <Undo2 size={19} strokeWidth={1.5} />
            </IconButton>
            <span className="t-label num cascade-undo__count" aria-hidden>
              {uiMeta.undoCount > 0 ? uiMeta.undoCount : ''}
            </span>
          </div>

          <IconButton label="New board" onClick={handleNextBoard} disabled={paused}>
            <RefreshCw size={18} strokeWidth={1.5} />
          </IconButton>
        </div>
      }
    >
      <div
        ref={stageRef}
        className="cascade-stage"
        role="application"
        aria-label="Cascade tile mosaic"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
      >
        <canvas ref={canvasRef} className="cascade-canvas" aria-hidden />
      </div>

      <Completion
        open={showCompletion}
        title="Cleared"
        line={`Score ${uiMeta.score}`}
        actionLabel="Next board"
        onAction={handleNextBoard}
      />
    </GameShell>
  )
}
