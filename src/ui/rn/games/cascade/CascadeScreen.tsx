import { useCallback, useRef, useState, type ComponentType } from 'react'
import { PanResponder, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { RefreshCw as _RefreshCw, Undo2 as _Undo2 } from 'lucide-react-native'
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
import { Completion, GameActionButton, GameControlBar, GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { GlassSurface } from '@/ui/rn/Glass'
import { useCalm, useFeedback, useGameLoop, useGameSave, useKeys, useReducedMotion, useResponsiveLayout } from '@/ui/rn/hooks'

type LucideSvgIcon = ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
const RefreshCw = _RefreshCw as unknown as LucideSvgIcon
const Undo2 = _Undo2 as unknown as LucideSvgIcon

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
  cellW: number
  cellH: number
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
const BEZEL_RADIUS = 18
const TILE_GAP = 3
const TILE_RADIUS = 7

interface JewelStop {
  top: string
  bottom: string
  rim: string
  sheen: string
}

const JEWEL_STONES: Record<string, JewelStop> = {
  clay: { top: '#5B8EC0', bottom: '#2B4C70', rim: '#8BB8E6', sheen: 'rgba(205, 232, 255, 0.34)' },     // Sapphire
  ochre: { top: '#E0BA6E', bottom: '#96712E', rim: '#F2D69A', sheen: 'rgba(255, 245, 212, 0.38)' },    // Burnished Gold
  straw: { top: '#5CA586', bottom: '#2B5F4B', rim: '#8CD1B4', sheen: 'rgba(210, 250, 232, 0.32)' },    // Emerald
  sage: { top: '#C45E6A', bottom: '#782F39', rim: '#E38D97', sheen: 'rgba(255, 215, 220, 0.30)' },     // Garnet
  rosewood: { top: '#8B7EC2', bottom: '#4D4278', rim: '#B4A9E6', sheen: 'rgba(228, 222, 255, 0.32)' }, // Amethyst
  stone: { top: '#6D93A3', bottom: '#3B5866', rim: '#9BBCCB', sheen: 'rgba(215, 240, 250, 0.30)' },    // Moon Teal
  bone: { top: '#CFD7E3', bottom: '#8792A3', rim: '#EDF2FA', sheen: 'rgba(255, 255, 255, 0.42)' },     // Pearl Silver
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

function computeBoardLayout(stageW: number, stageH: number, rows: number, cols: number, bezelPad: number): BoardLayout {
  const innerW = stageW - bezelPad * 2
  const innerH = stageH - bezelPad * 2
  // Crisp square jewel stones so tiles never look stretched or low-quality.
  const cell = Math.max(0, Math.floor(Math.min(innerW / cols, innerH / rows)))
  const boardW = cell * cols
  const boardH = cell * rows
  const boardX = Math.round((stageW - boardW) * 0.5)
  const boardY = Math.round((stageH - boardH) * 0.5)
  return { boardX, boardY, boardW, boardH, cellW: cell, cellH: cell }
}

function buildPerimeterPath(
  state: CascadeState,
  layout: BoardLayout,
  previewKeys: ReadonlySet<number>,
): string {
  if (previewKeys.size < 2) return ''
  const { boardX, boardY, cellW, cellH } = layout
  const inset = TILE_GAP * 0.5
  const tileW = Math.max(4, cellW - TILE_GAP)
  const tileH = Math.max(4, cellH - TILE_GAP)
  const segs: string[] = []

  for (const key of previewKeys) {
    const r = Math.floor(key / state.cols)
    const c = key % state.cols
    const tile = state.board[r]?.[c]
    if (!tile) continue

    const left = boardX + tile.x * cellW + inset + 0.75
    const top = boardY + tile.y * cellH + inset + 0.75
    const right = left + tileW - 1.5
    const bottom = top + tileH - 1.5

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
  const { isCompact } = useResponsiveLayout()
  const bezelPad = isCompact ? 4 : 5
  const calm = useCalm('cascade')
  const { cue, haptic } = useFeedback()
  const reduceMotion = useReducedMotion()
  const tokens = useTokenColors()
  const { color } = tokens
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
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 })
  const [, setTick] = useState(0)

  const boardSizeRef = useRef({ w: 0, h: 0 })
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
  const layout = computeBoardLayout(stageSize.w, stageSize.h, cur.rows, cur.cols, bezelPad)

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

  // The tumbling loop runs only while tiles or effects are moving; a still
  // board costs nothing. Anything that changes the board wakes it.
  const [animating, setAnimating] = useState(true)
  const wake = useCallback(() => setAnimating(true), [])

  // 60fps rigid-body tumbling & settling loop
  useGameLoop(
    useCallback(
      (dtMs: number) => {
        const prev = stateRef.current
        const effectiveDt = reducedMotionRef.current ? dtMs * 1.35 : dtMs
        const next = tickCascade(prev, effectiveDt, calmRef.current)
        if (next === prev) {
          setAnimating(false)
          return
        }
        {
          stateRef.current = next
          if (prev.falling.length > 0 && next.falling.length === 0) {
            syncUiMeta(next)
          }
          redraw()
        }
      },
      [redraw, syncUiMeta],
    ),
    !paused && animating,
  )

  const cellFromLocalPoint = useCallback((x: number, y: number): CellCoord | null => {
    const { w, h } = boardSizeRef.current
    if (!(x >= 0 && x < w && y >= 0 && y < h)) return null
    const { cols, rows } = stateRef.current
    return { row: Math.floor(y / h * rows), col: Math.floor(x / w * cols) }
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
      // While tiles are still tumbling, what you see isn't where they are yet: wait for them to land.
      if (prev.falling.length > 0) return
      const next = tapCell(prev, row, col)
      if (next === prev) return

      stateRef.current = next
      wake()
      previewKeysRef.current = new Set()
      syncUiMeta(next)
      redraw()

      if (next.lastCompleteEventId > prev.lastCompleteEventId) {
        cue('chime', 0.85)
        haptic('complete')
        persist(next)
        return
      }

      if (next.lastTapEventId > prev.lastTapEventId) {
        const count = next.lastTapCount
        if (count >= 10) {
          cue('clear', 0.9)
          haptic('reward')
        } else if (count >= 5) {
          cue('place', 0.8)
          haptic('settle')
        } else {
          cue('tap', 0.65)
          haptic('tick')
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
      onPanResponderGrant: (e) => {
        if (pausedRef.current || stateRef.current.boardComplete) return
        const { locationX: lx, locationY: ly } = e.nativeEvent
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
    wake()
    previewKeysRef.current = new Set()
    pressedRef.current = null
    syncUiMeta(next)
    redraw()
    cue('undo', 0.65)
    persist(next)
  }, [cue, haptic, persist, redraw, syncUiMeta])

  const handleRestart = useCallback(() => {
    const next = restartBoard(stateRef.current)
    stateRef.current = next
    wake()
    previewKeysRef.current = new Set()
    pressedRef.current = null
    syncUiMeta(next)
    redraw()
    cue('undo', 0.55)
    persist(next, true)
  }, [cue, haptic, persist, redraw, syncUiMeta])

  const handleNextBoard = useCallback(() => {
    const next = nextBoard(stateRef.current, calmRef.current)
    stateRef.current = next
    wake()
    previewKeysRef.current = new Set()
    pressedRef.current = null
    syncUiMeta(next)
    redraw()
    cue('tap', 0.55)
    haptic('tick')
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
    setStageSize((prev) => prev.w === width && prev.h === height ? prev : { w: width, h: height })
  }, [])

  const handleBoardLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    boardSizeRef.current = { w: width, h: height }
    if (pressedRef.current) {
      pressedRef.current = null
      previewKeysRef.current = new Set()
      redraw()
    }
  }, [redraw])

  const { boardX, boardY, boardW, boardH, cellW, cellH } = layout
  const bezelX = boardX - bezelPad
  const bezelY = boardY - bezelPad
  const bezelW = boardW + bezelPad * 2
  const bezelH = boardH + bezelPad * 2
  const inset = TILE_GAP * 0.5
  const tileW = Math.max(4, cellW - TILE_GAP)
  const tileH = Math.max(4, cellH - TILE_GAP)
  const halfW = tileW * 0.5
  const halfH = tileH * 0.5
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
      onNewGame={handleNextBoard}
      onExit={handleExit}
      controls={
        <GameControlBar>
          <GameActionButton
            label="Undo"
            icon={<Undo2 size={18} strokeWidth={1.5} color={color.ink2} />}
            onPress={handleUndo}
            disabled={paused || uiMeta.undoCount === 0}
          />
          <GameActionButton
            label="New board"
            icon={<RefreshCw size={18} strokeWidth={1.5} color={color.ink2} />}
            onPress={handleNextBoard}
            disabled={paused}
          />
        </GameControlBar>
      }
    >
      <View style={styles.stage} onLayout={handleStageLayout}>
        {cellW > 0 && (
          <>
            <View pointerEvents="none" style={[styles.bezel, { left: bezelX, top: bezelY, width: bezelW, height: bezelH }]}>
              <GlassSurface variant="card" radius={BEZEL_RADIUS} style={styles.bezelSurface}>
                <View style={[styles.boardGround, { backgroundColor: color.bg }]} />
              </GlassSurface>
            </View>

            <View pointerEvents="none" style={styles.svg}>
              <Svg width={stageSize.w} height={svgH} viewBox={`0 0 ${stageSize.w} ${svgH}`}>
                <Defs>
                  <ClipPath id="cascade-board-clip">
                    <Rect
                      x={boardX - 1}
                      y={boardY - 1}
                      width={boardW + 2}
                      height={boardH + 2}
                      rx={Math.max(6, BEZEL_RADIUS - bezelPad)}
                    />
                  </ClipPath>
                  {Object.entries(JEWEL_STONES).map(([k, j]) => (
                    <LinearGradient key={k} id={`jewel-${k}`} x1="0.15" y1="0" x2="0.85" y2="1">
                      <Stop offset="0%" stopColor={j.top} />
                      <Stop offset="100%" stopColor={j.bottom} />
                    </LinearGradient>
                  ))}
                  <LinearGradient id="jewel-sheen" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.30" />
                    <Stop offset="48%" stopColor="#FFFFFF" stopOpacity="0.06" />
                    <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                  </LinearGradient>
                </Defs>

                  {/* Layer 2: Subtle carved grid dots + luminous faceted jewel stones */}
                  <G clipPath="url(#cascade-board-clip)">
                    {cur.board.map((row, r) =>
                      row.map((cell, c) => {
                        if (cell !== null) return null
                        return (
                          <Circle
                            key={`dot-${r}-${c}`}
                            cx={boardX + (c + 0.5) * cellW}
                            cy={boardY + (r + 0.5) * cellH}
                            r={1}
                            fill={color.ink4}
                            fillOpacity={0.18}
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
                        const tx = boardX + tile.x * cellW + inset + wobbleOffsetX
                        const ty = boardY + tile.y * cellH + inset
                        const key = r * cur.cols + c
                        const inPreview = previewKeys.has(key)
                        const jewel = JEWEL_STONES[tile.color] ?? JEWEL_STONES.clay

                        return (
                          <G key={tile.id}>
                            {/* Jewel body gradient */}
                            <Rect
                              x={tx}
                              y={ty}
                              width={tileW}
                              height={tileH}
                              rx={TILE_RADIUS}
                              fill={`url(#jewel-${tile.color})`}
                            />
                            {/* Soft glass top specular sheen */}
                            <Rect
                              x={tx + 1.5}
                              y={ty + 1.2}
                              width={Math.max(2, tileW - 3)}
                              height={Math.max(2, tileH * 0.44)}
                              rx={Math.max(2, TILE_RADIUS - 1.5)}
                              fill="url(#jewel-sheen)"
                            />
                            {/* Crisp subtle inner rim */}
                            <Rect
                              x={tx + 0.6}
                              y={ty + 0.6}
                              width={Math.max(1, tileW - 1.2)}
                              height={Math.max(1, tileH - 1.2)}
                              rx={Math.max(2, TILE_RADIUS - 0.6)}
                              fill="none"
                              stroke={jewel.rim}
                              strokeOpacity={inPreview ? 0.85 : 0.34}
                              strokeWidth={inPreview ? 1.3 : 0.85}
                            />
                            {inPreview ? (
                              <Rect
                                x={tx}
                                y={ty}
                                width={tileW}
                                height={tileH}
                                rx={TILE_RADIUS}
                                fill="#FFFFFF"
                                fillOpacity={0.14}
                              />
                            ) : null}
                          </G>
                        )
                      }),
                    )}

                    {/* Exterior perimeter contour around pressed cluster (>= 2 tiles) */}
                    {perimeterPath.length > 0 ? (
                      <Path
                        d={perimeterPath}
                        fill="none"
                        stroke={color.accent}
                        strokeOpacity={0.9}
                        strokeWidth={1.8}
                        strokeLinecap="round"
                      />
                    ) : null}
                  </G>

                  {/* Layer 3: Tumbling 2D rigid-body detached jewel tiles */}
                  {cur.falling.map((f) => {
                    if (f.alpha <= 0.005) return null
                    const cx = boardX + (f.x + 0.5) * cellW
                    const cy = boardY + (f.y + 0.5) * cellH
                    const drawAngleRad = reduceMotion ? f.angle * 0.2 : f.angle
                    const drawDeg = drawAngleRad * (180 / Math.PI)
                    const drawScale = reduceMotion ? 1 : f.scale
                    const drawAlpha = reduceMotion
                      ? Math.max(0, f.alpha - Math.max(0, (f.y - cur.rows * 0.2) * 0.06))
                      : f.alpha
                    if (drawAlpha <= 0.005) return null
                    const jewel = JEWEL_STONES[f.color] ?? JEWEL_STONES.clay

                    return (
                      <G
                        key={`fall-${f.id}`}
                        transform={`translate(${cx.toFixed(2)}, ${cy.toFixed(2)}) rotate(${drawDeg.toFixed(2)}) scale(${drawScale.toFixed(3)})`}
                        opacity={drawAlpha}
                      >
                        <Rect
                          x={-halfW}
                          y={-halfH}
                          width={tileW}
                          height={tileH}
                          rx={TILE_RADIUS}
                          fill={`url(#jewel-${f.color})`}
                        />
                        <Rect
                          x={-halfW + 1.5}
                          y={-halfH + 1.2}
                          width={Math.max(2, tileW - 3)}
                          height={Math.max(2, tileH * 0.44)}
                          rx={Math.max(2, TILE_RADIUS - 1.5)}
                          fill="url(#jewel-sheen)"
                        />
                        <Rect
                          x={-halfW + 0.6}
                          y={-halfH + 0.6}
                          width={Math.max(1, tileW - 1.2)}
                          height={Math.max(1, tileH - 1.2)}
                          rx={Math.max(2, TILE_RADIUS - 0.6)}
                          fill="none"
                          stroke={jewel.rim}
                          strokeOpacity={0.45}
                          strokeWidth={0.9}
                        />
                      </G>
                    )
                  })}
              </Svg>
            </View>

            <View
              {...panResponder.panHandlers}
              collapsable={false}
              onLayout={handleBoardLayout}
              style={[styles.hitSurface, { left: boardX, top: boardY, width: boardW, height: boardH }]}
            />
          </>
        )}
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
  bezel: {
    position: 'absolute',
  },
  bezelSurface: {
    flex: 1,
  },
  boardGround: {
    ...StyleSheet.absoluteFill,
    margin: 3,
    borderRadius: BEZEL_RADIUS - 4,
  },
  hitSurface: {
    position: 'absolute',
    ...Platform.select({ web: { touchAction: 'none' } }),
  },
})
