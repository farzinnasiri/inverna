import { useCallback, useRef, useState, type ComponentType } from 'react'
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg'
import { RefreshCw as _RefreshCw, Undo2 as _Undo2 } from 'lucide-react-native'

type LucideSvgIcon = ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
const RefreshCw = _RefreshCw as unknown as LucideSvgIcon
const Undo2 = _Undo2 as unknown as LucideSvgIcon
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
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Completion, GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { IconButton } from '@/ui/rn/controls'
import { useCalm, useFeedback, useGameLoop, useGameSave, useKeys, useReducedMotion } from '@/ui/rn/hooks'

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

const HOW_TO = [
  'Tap any group of two or more matching tiles to release them from the mosaic.',
  'Larger clusters score more. When no pairs remain, the final tiles tumble away into black.',
] as const

const CANVAS_BOTTOM_OVERFLOW = 96
const BEZEL_PAD = 6
const BEZEL_RADIUS = 16
const TILE_GAP = 1.5
const TILE_RADIUS = 3

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

function buildPerimeterPath(
  state: CascadeState,
  layout: BoardLayout,
  previewKeys: ReadonlySet<number>,
): string {
  if (previewKeys.size < 2) return ''
  const { boardX, boardY, cellSize } = layout
  const inset = TILE_GAP * 0.5
  const tileSize = Math.max(4, cellSize - TILE_GAP)
  const segs: string[] = []

  for (const key of previewKeys) {
    const r = Math.floor(key / state.cols)
    const c = key % state.cols
    const tile = state.board[r]?.[c]
    if (!tile) continue

    const left = boardX + tile.x * cellSize + inset + 0.75
    const top = boardY + tile.y * cellSize + inset + 0.75
    const right = left + tileSize - 1.5
    const bottom = top + tileSize - 1.5

    if (r === 0 || !previewKeys.has((r - 1) * state.cols + c)) {
      segs.push(`M${left.toFixed(1)} ${top.toFixed(1)}L${right.toFixed(1)} ${top.toFixed(1)}`)
    }
    if (r === state.rows - 1 || !previewKeys.has((r + 1) * state.cols + c)) {
      segs.push(`M${left.toFixed(1)} ${bottom.toFixed(1)}L${right.toFixed(1)} ${bottom.toFixed(1)}`)
    }
    if (c === 0 || !previewKeys.has(r * state.cols + (c - 1))) {
      segs.push(`M${left.toFixed(1)} ${top.toFixed(1)}L${left.toFixed(1)} ${bottom.toFixed(1)}`)
    }
    if (c === state.cols - 1 || !previewKeys.has(r * state.cols + (c + 1))) {
      segs.push(`M${right.toFixed(1)} ${top.toFixed(1)}L${right.toFixed(1)} ${bottom.toFixed(1)}`)
    }
  }
  return segs.join('')
}

export function CascadeScreen({ onExit }: GameScreenProps) {
  const calm = useCalm()
  const { cue, haptic } = useFeedback()
  const reduceMotion = useReducedMotion()
  const tokens = useTokenColors()
  const { color, pieces } = tokens
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
  const [stageSize, setStageSize] = useState({ w: 320, h: 420 })
  const [, setTick] = useState(0)

  const previewKeysRef = useRef<Set<number>>(new Set())
  const pressedRef = useRef<{
    origin: CellCoord
    keys: Set<number>
    startLocalX: number
    startLocalY: number
  } | null>(null)

  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const calmRef = useRef(calm)
  calmRef.current = calm
  const reducedMotionRef = useRef(reduceMotion)
  reducedMotionRef.current = reduceMotion

  const cur = stateRef.current
  const layout = computeBoardLayout(stageSize.w, stageSize.h, cur.rows, cur.cols)
  const layoutRef = useRef<BoardLayout>(layout)
  layoutRef.current = layout

  const redraw = useCallback(() => {
    setTick((n) => (n + 1) % 1_000_000)
  }, [])

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

  // 60fps rigid-body tumbling & settling loop
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
          redraw()
        }
      },
      [redraw, syncUiMeta],
    ),
    !paused,
  )

  const cellFromLocalPoint = useCallback((x: number, y: number): CellCoord | null => {
    const { boardX, boardY, boardW, boardH, cellSize } = layoutRef.current
    if (x < boardX || x >= boardX + boardW || y < boardY || y >= boardY + boardH) return null
    const st = stateRef.current
    const col = Math.floor((x - boardX) / cellSize)
    const row = Math.floor((y - boardY) / cellSize)
    if (row < 0 || row >= st.rows || col < 0 || col >= st.cols) return null
    return { row, col }
  }, [])

  const clusterKeySet = useCallback((cell: CellCoord | null): Set<number> => {
    const out = new Set<number>()
    if (!cell) return out
    const st = stateRef.current
    if (st.boardComplete) return out
    const cluster = findCluster(st, cell.row, cell.col)
    if (cluster.length < 2) return out
    for (const pt of cluster) {
      out.add(pt.row * st.cols + pt.col)
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
      redraw()

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

      // Single-tile non-punitive wobble
      if (next.wobble && next.wobble !== prev.wobble) {
        cue('tap', 0.22)
      }
    },
    [cue, haptic, persist, redraw, syncUiMeta],
  )

  const interactionRef = useRef({ cellFromLocalPoint, clusterKeySet, applyTap, redraw })
  interactionRef.current = { cellFromLocalPoint, clusterKeySet, applyTap, redraw }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !pausedRef.current && !stateRef.current.boardComplete,
      onMoveShouldSetPanResponder: () => !pausedRef.current && !stateRef.current.boardComplete,
      onPanResponderGrant: (e) => {
        if (pausedRef.current || stateRef.current.boardComplete) return
        const lx = e.nativeEvent.locationX
        const ly = e.nativeEvent.locationY
        const cell = interactionRef.current.cellFromLocalPoint(lx, ly)
        if (!cell) return
        if (!stateRef.current.board[cell.row]?.[cell.col]) return

        const keys = interactionRef.current.clusterKeySet(cell)
        pressedRef.current = { origin: cell, keys, startLocalX: lx, startLocalY: ly }
        previewKeysRef.current = keys
        interactionRef.current.redraw()
      },
      onPanResponderMove: (_, g) => {
        const pressed = pressedRef.current
        if (!pressed || pausedRef.current || stateRef.current.boardComplete) return
        const cell = interactionRef.current.cellFromLocalPoint(
          pressed.startLocalX + g.dx,
          pressed.startLocalY + g.dy,
        )
        const cols = stateRef.current.cols
        const insidePressed =
          cell !== null &&
          (pressed.keys.size >= 2
            ? pressed.keys.has(cell.row * cols + cell.col)
            : cell.row === pressed.origin.row && cell.col === pressed.origin.col)
        const nextPreview = insidePressed ? pressed.keys : new Set<number>()
        if (nextPreview.size !== previewKeysRef.current.size) {
          previewKeysRef.current = nextPreview
          interactionRef.current.redraw()
        }
      },
      onPanResponderRelease: (_, g) => {
        const pressed = pressedRef.current
        if (!pressed) return
        pressedRef.current = null

        const cell = interactionRef.current.cellFromLocalPoint(
          pressed.startLocalX + g.dx,
          pressed.startLocalY + g.dy,
        )
        const cols = stateRef.current.cols
        if (cell) {
          if (pressed.keys.size >= 2 && pressed.keys.has(cell.row * cols + cell.col)) {
            interactionRef.current.applyTap(cell.row, cell.col)
            return
          }
          if (pressed.keys.size === 0 && cell.row === pressed.origin.row && cell.col === pressed.origin.col) {
            interactionRef.current.applyTap(cell.row, cell.col)
            return
          }
        }

        previewKeysRef.current = new Set()
        interactionRef.current.redraw()
      },
      onPanResponderTerminate: () => {
        pressedRef.current = null
        if (previewKeysRef.current.size > 0) {
          previewKeysRef.current = new Set()
          interactionRef.current.redraw()
        }
      },
    }),
  ).current

  const handleUndo = useCallback(() => {
    if (pausedRef.current) return
    const prev = stateRef.current
    const next = undoCascade(prev)
    if (next === prev) return

    stateRef.current = next
    previewKeysRef.current = new Set()
    pressedRef.current = null
    syncUiMeta(next)
    redraw()
    cue('undo', 0.65)
    haptic('light')
    persist(next)
  }, [cue, haptic, persist, redraw, syncUiMeta])

  const handleRestart = useCallback(() => {
    const next = restartBoard(stateRef.current)
    stateRef.current = next
    previewKeysRef.current = new Set()
    pressedRef.current = null
    syncUiMeta(next)
    redraw()
    cue('undo', 0.55)
    haptic('light')
    persist(next, true)
  }, [cue, haptic, persist, redraw, syncUiMeta])

  const handleNextBoard = useCallback(() => {
    const next = nextBoard(stateRef.current, calmRef.current)
    stateRef.current = next
    previewKeysRef.current = new Set()
    pressedRef.current = null
    syncUiMeta(next)
    redraw()
    cue('tap', 0.55)
    haptic('light')
    persist(next, true)
  }, [cue, haptic, persist, redraw, syncUiMeta])

  const handlePauseChange = useCallback(
    (nextPaused: boolean) => {
      if (nextPaused) {
        previewKeysRef.current = new Set()
        pressedRef.current = null
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

  // Web keyboard shortcuts: Z / Backspace undo, R restart, P / Escape pause
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

  const handleStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width > 0 && height > 0) {
      setStageSize((prev) =>
        Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1
          ? prev
          : { w: Math.round(width), h: Math.round(height) },
      )
    }
  }, [])

  const { boardX, boardY, boardW, boardH, cellSize, bezelPad } = layout
  const bezelX = boardX - bezelPad
  const bezelY = boardY - bezelPad
  const bezelW = boardW + bezelPad * 2
  const bezelH = boardH + bezelPad * 2
  const inset = TILE_GAP * 0.5
  const tileSize = Math.max(4, cellSize - TILE_GAP)
  const half = tileSize * 0.5
  const svgH = stageSize.h + CANVAS_BOTTOM_OVERFLOW
  const previewKeys = previewKeysRef.current
  const perimeterPath = buildPerimeterPath(cur, layout, previewKeys)
  const showCompletion = uiMeta.boardComplete && uiMeta.fallingEmpty

  return (
    <GameShell
      gameId="cascade"
      score={uiMeta.score}
      stats={[
        { label: 'Score', value: uiMeta.score },
        { label: 'Tiles', value: uiMeta.tiles },
      ]}
      paused={paused}
      onPauseChange={handlePauseChange}
      onRestart={handleRestart}
      onExit={handleExit}
      howTo={HOW_TO}
      controls={
        <View style={styles.controlsRow}>
          <View style={styles.undoWrap}>
            <IconButton label="Undo" onPress={handleUndo} disabled={paused || uiMeta.undoCount === 0}>
              <Undo2 size={19} strokeWidth={1.5} color={color.ink2} />
            </IconButton>
            <Text style={[styles.undoCount, { color: color.ink3 }]}>
              {uiMeta.undoCount > 0 ? uiMeta.undoCount : ''}
            </Text>
          </View>

          <IconButton label="New board" onPress={handleNextBoard} disabled={paused}>
            <RefreshCw size={18} strokeWidth={1.5} color={color.ink2} />
          </IconButton>
        </View>
      }
    >
      <View
        {...panResponder.panHandlers}
        style={styles.stage}
        onLayout={handleStageLayout}
      >
        <View pointerEvents="none" style={styles.svg}>
          <Svg
            width={stageSize.w}
            height={svgH}
            viewBox={`0 0 ${stageSize.w} ${svgH}`}
          >
          <Defs>
            <ClipPath id="cascade-board-clip">
              <Rect
                x={boardX - 1}
                y={boardY - 1}
                width={boardW + 2}
                height={boardH + 2}
                rx={Math.max(4, BEZEL_RADIUS - bezelPad)}
              />
            </ClipPath>
          </Defs>

          {/* Layer 1: Pure #000000 void inside crisp hairline bezel */}
          <Rect
            x={bezelX}
            y={bezelY}
            width={bezelW}
            height={bezelH}
            rx={BEZEL_RADIUS}
            fill={color.bg}
            stroke={color.line}
            strokeWidth={1}
          />

          {/* Layer 2: Carved-out grid dots + standing Watchmaker mosaic */}
          <G clipPath="url(#cascade-board-clip)">
            {cur.board.map((row, r) =>
              row.map((cell, c) => {
                if (cell !== null) return null
                return (
                  <Circle
                    key={`dot-${r}-${c}`}
                    cx={boardX + (c + 0.5) * cellSize}
                    cy={boardY + (r + 0.5) * cellSize}
                    r={0.9}
                    fill={color.ink4}
                    fillOpacity={0.16}
                  />
                )
              }),
            )}

            {cur.board.map((row, r) =>
              row.map((tile, c) => {
                if (!tile) return null
                let wobbleOffsetX = 0
                if (cur.wobble && cur.wobble.id === tile.id) {
                  const progress = Math.min(1, cur.wobble.ageMs / WOBBLE_DURATION_MS)
                  const amp = reduceMotion ? 1.4 : 3.2
                  wobbleOffsetX = Math.sin(progress * Math.PI * 5) * (1 - progress) * amp
                }
                const tx = boardX + tile.x * cellSize + inset + wobbleOffsetX
                const ty = boardY + tile.y * cellSize + inset
                const key = r * cur.cols + c
                const inPreview = previewKeys.has(key)

                return (
                  <G key={tile.id}>
                    <Rect
                      x={tx}
                      y={ty}
                      width={tileSize}
                      height={tileSize}
                      rx={TILE_RADIUS}
                      fill={pieces[tile.color]}
                    />
                    {inPreview ? (
                      <Rect
                        x={tx}
                        y={ty}
                        width={tileSize}
                        height={tileSize}
                        rx={TILE_RADIUS}
                        fill="#FFFFFF"
                        fillOpacity={0.085}
                      />
                    ) : null}
                    <Rect
                      x={tx + 0.5}
                      y={ty + 0.5}
                      width={Math.max(1, tileSize - 1)}
                      height={Math.max(1, tileSize - 1)}
                      rx={Math.max(1, TILE_RADIUS - 0.5)}
                      fill="none"
                      stroke="#FFFFFF"
                      strokeOpacity={0.08}
                      strokeWidth={1}
                    />
                  </G>
                )
              }),
            )}

            {/* Exterior perimeter contour around pressed cluster (>= 2 tiles) */}
            {perimeterPath.length > 0 ? (
              <Path
                d={perimeterPath}
                fill="none"
                stroke={color.ink}
                strokeOpacity={0.58}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            ) : null}
          </G>

          {/* Layer 3: Tumbling 2D rigid-body detached tiles (unclipped past bottom bezel) */}
          {cur.falling.map((f) => {
            if (f.alpha <= 0.005) return null
            const cx = boardX + (f.x + 0.5) * cellSize
            const cy = boardY + (f.y + 0.5) * cellSize
            const drawAngleRad = reduceMotion ? f.angle * 0.2 : f.angle
            const drawDeg = drawAngleRad * (180 / Math.PI)
            const drawScale = reduceMotion ? 1 : f.scale
            const drawAlpha = reduceMotion
              ? Math.max(0, f.alpha - Math.max(0, (f.y - cur.rows * 0.2) * 0.06))
              : f.alpha
            if (drawAlpha <= 0.005) return null

            return (
              <G
                key={`fall-${f.id}`}
                transform={`translate(${cx.toFixed(2)}, ${cy.toFixed(2)}) rotate(${drawDeg.toFixed(2)}) scale(${drawScale.toFixed(3)})`}
                opacity={drawAlpha}
              >
                <Rect
                  x={-half}
                  y={-half}
                  width={tileSize}
                  height={tileSize}
                  rx={TILE_RADIUS}
                  fill={pieces[f.color]}
                />
                <Rect
                  x={-half + 0.5}
                  y={-half + 0.5}
                  width={Math.max(1, tileSize - 1)}
                  height={Math.max(1, tileSize - 1)}
                  rx={Math.max(1, TILE_RADIUS - 0.5)}
                  fill="none"
                  stroke="#FFFFFF"
                  strokeOpacity={0.08}
                  strokeWidth={1}
                />
                <Rect
                  x={-half - 0.5}
                  y={-half - 0.5}
                  width={tileSize + 1}
                  height={tileSize + 1}
                  rx={TILE_RADIUS + 0.5}
                  fill="none"
                  stroke="#000000"
                  strokeWidth={1.15}
                />
              </G>
            )
          })}
          </Svg>
        </View>
      </View>

      <Completion
        open={showCompletion}
        gameId="cascade"
        title="Cleared"
        line={`Score ${uiMeta.score}`}
        actionLabel="Next board"
        onAction={handleNextBoard}
      />
    </GameShell>
  )
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    width: '100%',
    overflow: 'visible',
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  undoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  undoCount: {
    minWidth: 16,
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
})
