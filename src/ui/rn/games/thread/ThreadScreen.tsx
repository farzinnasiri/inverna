import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import Svg, { Circle, G, Path, Polygon, Rect } from 'react-native-svg'
import { RotateCcw as _RotateCcw, Undo2 as _Undo2 } from 'lucide-react-native'

type LucideSvgIcon = ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
const RotateCcw = _RotateCcw as unknown as LucideSvgIcon
const Undo2 = _Undo2 as unknown as LucideSvgIcon
import {
  PIECE_COLORS,
  boardFillPercent,
  cancelActivePath,
  clearBoard,
  countConnectedPairs,
  countFilledCells,
  createThread,
  endPath,
  extendPath,
  getEndpointAt,
  getPathOwnerAt,
  isAllPairsConnected,
  isOrthogonallyAdjacent,
  isPairConnected,
  nextPuzzle,
  sameCell,
  startPath,
  undo,
  type Cell,
  type PieceColor,
  type ThreadState,
} from '@/core/games/thread/engine'
import { legacyPieceMap, radius, type ResolvedTokens } from '@/design/tokens'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Completion, GameActionButton, GameControlBar, GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { GlassSurface } from '@/ui/rn/Glass'
import { useCalm, useFeedback, useGameSave, useKeys, useReducedMotion } from '@/ui/rn/hooks'

interface ThreadSave {
  version: 1
  state: ThreadState
  completed: number
}

interface Point {
  x: number
  y: number
}

interface Stroke {
  origin: Point
  previous: Point
  previousCell: Cell | null
  pending: ThreadState | null
}

const COMPLETION_DELAY_MS = 680
const BEZEL_PADDING = 4
const BEZEL_BORDER = 1
const BEZEL_INSET = BEZEL_PADDING + BEZEL_BORDER


function isValidSave(value: unknown): value is ThreadSave {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<ThreadSave>
  const s = v.state
  return (
    v.version === 1 &&
    !!s &&
    (s.size === 5 || s.size === 6 || s.size === 7) &&
    Array.isArray(s.pairs) &&
    s.pairs.length >= 4 &&
    !!s.paths &&
    typeof s.paths === 'object' &&
    Array.isArray(s.history) &&
    typeof s.puzzleNumber === 'number'
  )
}

function sanitizeLoadedState(s: ThreadState): ThreadState {
  if (s.activeColor === null && s.strokeSnapshot === null) return s
  return endPath(s)
}

function buildSvgPathD(path: readonly Cell[]): string {
  if (path.length < 2) return ''
  let d = `M ${path[0]!.col * 100 + 50} ${path[0]!.row * 100 + 50}`
  for (let i = 1; i < path.length; i++) {
    d += ` L ${path[i]!.col * 100 + 50} ${path[i]!.row * 100 + 50}`
  }
  return d
}

/**
 * 7 distinct flat geometric endpoint shapes (~60% of a 100×100 cell)
 * mapped to Watchmaker piece tones for colour-blind accessibility.
 */
function EndpointShape({
  piece,
  cx,
  cy,
  connected,
  tokens,
}: {
  piece: PieceColor
  cx: number
  cy: number
  connected: boolean
  tokens: ResolvedTokens
}) {
  const fill = tokens.pieces[legacyPieceMap[piece]]

  switch (piece) {
    // Pair 0 (ember / Deep Navy Slate): filled circle
    case 'ember':
      return (
        <>
          <Circle cx={cx} cy={cy} r={29} fill={fill} />
          {connected && <Circle cx={cx} cy={cy} r={6.5} fill={tokens.color.ink} />}
        </>
      )

    // Pair 1 (saffron / Antique Brass): thick ring (hollow circle)
    case 'saffron':
      return (
        <>
          <Circle cx={cx} cy={cy} r={24} fill={tokens.color.surface1} />
          <Circle cx={cx} cy={cy} r={24} fill="none" stroke={fill} strokeWidth={10} />
          {connected && <Circle cx={cx} cy={cy} r={7.5} fill={fill} />}
        </>
      )

    // Pair 2 (honey / Pine Verdigris): rounded square
    case 'honey':
      return (
        <>
          <Rect x={cx - 26} y={cy - 26} width={52} height={52} rx={9} fill={fill} />
          {connected && <Circle cx={cx} cy={cy} r={6.5} fill={tokens.color.ink} />}
        </>
      )

    // Pair 3 (moss / Oxblood): diamond
    case 'moss':
      return (
        <>
          <Polygon
            points={`${cx},${cy - 31} ${cx + 31},${cy} ${cx},${cy + 31} ${cx - 31},${cy}`}
            fill={fill}
            strokeLinejoin="round"
          />
          {connected && <Circle cx={cx} cy={cy} r={6.5} fill={tokens.color.ink} />}
        </>
      )

    // Pair 4 (clay / Smoky Indigo): triangle
    case 'clay':
      return (
        <>
          <Polygon
            points={`${cx},${cy - 29} ${cx + 29},${cy + 22} ${cx - 29},${cy + 22}`}
            fill={fill}
            strokeLinejoin="round"
          />
          {connected && <Circle cx={cx} cy={cy + 5} r={6} fill={tokens.color.ink} />}
        </>
      )

    // Pair 5 (rose / Titanium Pewter): hollow square
    case 'rose':
      return (
        <>
          <Rect x={cx - 22} y={cy - 22} width={44} height={44} rx={5} fill={tokens.color.surface1} />
          <Rect
            x={cx - 22}
            y={cy - 22}
            width={44}
            height={44}
            rx={5}
            fill="none"
            stroke={fill}
            strokeWidth={10}
          />
          {connected && <Circle cx={cx} cy={cy} r={7.5} fill={fill} />}
        </>
      )

    // Pair 6 (sand / Moon Ivory): plus / cross
    case 'sand':
      return (
        <>
          <Rect x={cx - 29} y={cy - 10} width={58} height={20} rx={5} fill={fill} />
          <Rect x={cx - 10} y={cy - 29} width={20} height={58} rx={5} fill={fill} />
          {connected && <Circle cx={cx} cy={cy} r={5.5} fill={tokens.color.accentInk} />}
        </>
      )
  }
}

function cellFromPoint({ x, y }: Point, side: number, size: number): Cell | null {
  if (side <= 0 || x < 0 || x >= side || y < 0 || y >= side) return null
  return { col: Math.floor((x / side) * size), row: Math.floor((y / side) * size) }
}

function extendAtCell(state: ThreadState, from: Cell | null, target: Cell): ThreadState {
  const active = state.activeColor
  if (!active) return state
  const path = state.paths[active]
  const tip = path?.[path.length - 1]
  if (!tip) return state
  if (isOrthogonallyAdjacent(tip, target)) return extendPath(state, target)

  // At an exact grid corner, bridge diagonally with an orthogonal step.
  // Never trim another thread in a cell the finger did not enter.
  if (!from || !sameCell(from, tip)) return state
  if (Math.abs(tip.row - target.row) !== 1 || Math.abs(tip.col - target.col) !== 1) return state
  const bridges: Cell[] = [
    { row: tip.row, col: target.col },
    { row: target.row, col: tip.col },
  ]
  for (const bridge of bridges) {
    const owner = getPathOwnerAt(state, bridge)
    if (owner ? owner.color !== active : getEndpointAt(state, bridge)) continue
    const stepped = extendPath(state, bridge)
    if (stepped === state) continue
    const reached = extendPath(stepped, target)
    if (reached !== stepped) return reached
  }
  return state
}

/** Visit every cell crossed between samples, with no clamping to the board edges. */
function extendAlongSegment(state: ThreadState, stroke: Stroke, to: Point, side: number): ThreadState {
  const from = stroke.previous
  stroke.previous = to
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return state

  const crossings = [0, 1]
  for (let i = 0; i <= state.size; i++) {
    const edge = (i / state.size) * side
    const tx = (edge - from.x) / dx
    const ty = (edge - from.y) / dy
    if (tx > 0 && tx < 1) crossings.push(tx)
    if (ty > 0 && ty < 1) crossings.push(ty)
  }
  crossings.sort((a, b) => a - b)

  let next = state
  for (let i = 1; i < crossings.length && !next.solved; i++) {
    const start = crossings[i - 1]!
    const end = crossings[i]!
    // Coincident row and column crossings have no intervening cell.
    if (end - start < 1e-8) continue
    const t = (start + end) / 2
    const cell = cellFromPoint({ x: from.x + t * dx, y: from.y + t * dy }, side, state.size)
    const previousCell = stroke.previousCell
    if (cell && (!previousCell || !sameCell(previousCell, cell))) {
      next = extendAtCell(next, previousCell, cell)
    }
    stroke.previousCell = cell
  }
  return next
}

export function ThreadScreen({ onExit }: GameScreenProps) {
  const tokens = useTokenColors()
  const { color } = tokens
  const calm = useCalm('thread')
  const reducedMotion = useReducedMotion()
  const { cue, haptic } = useFeedback()

  const [fallback] = useState<ThreadSave>(() => ({
    version: 1,
    state: createThread({ seed: Date.now() >>> 0, calm }),
    completed: 0,
  }))
  const [rawSave, setSave] = useGameSave<ThreadSave>('thread', fallback)
  const initialSave = isValidSave(rawSave) ? rawSave : fallback

  const [state, setState] = useState<ThreadState>(() => sanitizeLoadedState(initialSave.state))
  const [paused, setPaused] = useState(false)
  const [showCompletion, setShowCompletion] = useState(() => initialSave.state.solved)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const stageSizeRef = useRef(stageSize)

  const stateRef = useRef<ThreadState>(state)
  const pausedRef = useRef(paused)
  const strokeRef = useRef<Stroke | null>(null)
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const gridSize = Math.max(0, Math.min(stageSize.width, stageSize.height) - BEZEL_INSET * 2)
  const gridSizeRef = useRef(gridSize)
  gridSizeRef.current = gridSize

  useEffect(() => {
    return () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    }
  }, [])

  const persistState = useCallback(
    (next: ThreadState, justSolved = false) => {
      setSave((prev) => ({
        version: 1,
        state: next,
        completed: (isValidSave(prev) ? prev.completed : 0) + (justSolved ? 1 : 0),
      }))
    },
    [setSave],
  )

  const scheduleCompletion = useCallback(() => {
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    completionTimerRef.current = setTimeout(() => {
      setShowCompletion(true)
      completionTimerRef.current = null
    }, reducedMotion ? 200 : COMPLETION_DELAY_MS)
  }, [reducedMotion])

  const persistRef = useRef(persistState)
  persistRef.current = persistState
  const scheduleCompletionRef = useRef(scheduleCompletion)
  scheduleCompletionRef.current = scheduleCompletion
  const cueRef = useRef(cue)
  cueRef.current = cue
  const hapticRef = useRef(haptic)
  hapticRef.current = haptic

  /* --- Cell hit-testing & PanResponder drawing ---------------------------- */

  const cancelStroke = useCallback(() => {
    strokeRef.current = null
    const prev = stateRef.current
    if (!prev.activeColor) return
    const next = cancelActivePath(prev)
    stateRef.current = next
    setState(next)
  }, [])

  const handlePauseChange = useCallback((nextPaused: boolean) => {
    pausedRef.current = nextPaused
    if (nextPaused) cancelStroke()
    setPaused(nextPaused)
  }, [cancelStroke])

  const [panResponder] = useState(() => {
    // Extends the active thread to the finger. Used on every move and once more
    // on release, so a fast stroke that ends in a cell is never committed one short.
    const extendTo = (g: { dx: number; dy: number }) => {
        const stroke = strokeRef.current
        if (!stroke || pausedRef.current) return
        const prev = stroke.pending ?? stateRef.current
        const active = prev.activeColor
        if (!active || prev.solved) return

        const point = { x: stroke.origin.x + g.dx, y: stroke.origin.y + g.dy }
        const next = extendAlongSegment(prev, stroke, point, gridSizeRef.current)
        if (next === prev) return

        stroke.pending = null
        stateRef.current = next
        setState(next)

        const pair = prev.pairs.find((p) => p.color === active)
        if (next.solved) {
          strokeRef.current = null
          persistRef.current(next, true)
          cueRef.current('chime', 0.9)
          hapticRef.current('success')
          scheduleCompletionRef.current()
        } else if (pair && !isPairConnected(pair, prev.paths[active]) && isPairConnected(pair, next.paths[active])) {
          cueRef.current('place', 0.85)
          hapticRef.current('medium')
        } else {
          cueRef.current('tap', 0.42)
          hapticRef.current('selection')
        }
      }

    return PanResponder.create({
      onStartShouldSetPanResponder: () => !pausedRef.current && !stateRef.current.solved,
      onPanResponderGrant: (event) => {
        const prev = stateRef.current
        if (pausedRef.current || prev.solved) return
        const origin = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }
        const cell = cellFromPoint(origin, gridSizeRef.current, prev.size)
        if (!cell) return

        const pending = startPath(prev, cell)
        if (!pending.activeColor) return

        // Touching an existing thread alone should never trim it.
        strokeRef.current = { origin, previous: origin, previousCell: cell, pending }
      },
      onPanResponderStart: (_, g) => {
        if (g.numberActiveTouches > 1) cancelStroke()
      },
      onPanResponderMove: (_, g) => extendTo(g),
      onPanResponderRelease: (_, g) => {
        if (!strokeRef.current) return
        extendTo(g)
        // Solved by that final segment: extendTo already completed the board.
        if (!strokeRef.current) return
        strokeRef.current = null

        const prev = stateRef.current
        if (!prev.activeColor) return

        const next = endPath(prev)
        stateRef.current = next
        setState(next)

        const justSolved = !prev.solved && next.solved
        persistRef.current(next, justSolved)
        if (justSolved) {
          cueRef.current('chime', 0.9)
          hapticRef.current('success')
          scheduleCompletionRef.current()
        }
      },
      onPanResponderTerminate: cancelStroke,
    })
  })

  /* --- Board actions ------------------------------------------------------ */

  const handleUndo = useCallback(() => {
    if (paused || stateRef.current.solved) return
    const prev = stateRef.current
    if (prev.history.length === 0) return
    strokeRef.current = null
    const next = undo(prev)
    stateRef.current = next
    setState(next)
    persistState(next)
    cue('undo', 0.7)
    haptic('light')
  }, [paused, persistState, cue, haptic])

  const handleClear = useCallback(() => {
    const prev = stateRef.current
    const next = clearBoard(prev)
    if (next === prev) return
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }
    strokeRef.current = null
    setShowCompletion(false)
    stateRef.current = next
    setState(next)
    persistState(next)
    cue('undo', 0.7)
    haptic('light')
  }, [persistState, cue, haptic])

  const handleCancelActive = useCallback(() => {
    if (!strokeRef.current) return
    cancelStroke()
    cue('tap', 0.4)
  }, [cancelStroke, cue])

  const handleNextPuzzle = useCallback(() => {
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }
    strokeRef.current = null
    setShowCompletion(false)
    const next = nextPuzzle(stateRef.current, calm)
    stateRef.current = next
    setState(next)
    persistState(next)
    cue('tap', 0.6)
    haptic('light')
  }, [calm, persistState, cue, haptic])

  useKeys(
    {
      Escape: handleCancelActive,
      z: handleUndo,
      Z: handleUndo,
      u: handleUndo,
      U: handleUndo,
    },
    !paused && !state.solved,
    false,
  )

  /* --- Derived visual state ----------------------------------------------- */

  const connectedCount = useMemo(() => countConnectedPairs(state), [state])
  const filledCells = useMemo(() => countFilledCells(state), [state])
  const totalCells = state.size * state.size
  const fillPercent = useMemo(() => boardFillPercent(state), [state])
  const allPairsConnected = useMemo(() => isAllPairsConnected(state), [state])
  const remainingCells = totalCells - filledCells

  const connectedColors = useMemo(() => {
    const set = new Set<PieceColor>()
    for (const pair of state.pairs) {
      if (isPairConnected(pair, state.paths[pair.color])) {
        set.add(pair.color)
      }
    }
    return set
  }, [state.pairs, state.paths])

  const cellOccupied = useMemo(() => {
    const occupied = new Array<boolean>(totalCells).fill(false)
    for (const pieceColor of PIECE_COLORS) {
      const path = state.paths[pieceColor]
      if (!path) continue
      const isActive = state.activeColor === pieceColor
      if (path.length < 2 && !isActive) continue
      for (const cell of path) {
        occupied[cell.row * state.size + cell.col] = true
      }
    }
    return occupied
  }, [state.paths, state.activeColor, state.size, totalCells])

  const endpointCells = useMemo(() => {
    const set = new Set<number>()
    for (const pair of state.pairs) {
      set.add(pair.a.row * state.size + pair.a.col)
      set.add(pair.b.row * state.size + pair.b.col)
    }
    return set
  }, [state.pairs, state.size])

  const activeTip = useMemo(() => {
    if (!state.activeColor) return null
    const path = state.paths[state.activeColor]
    if (!path || path.length === 0) return null
    return path[path.length - 1]!
  }, [state.activeColor, state.paths])

  const viewBoxSize = state.size * 100
  const hasDrawnPaths = filledCells > 0 || state.activeColor !== null
  const innerRadius = radius.lg - BEZEL_INSET

  const handleStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    const prev = stageSizeRef.current
    if (width === prev.width && height === prev.height) return
    stageSizeRef.current = { width, height }
    cancelStroke()
    setStageSize(stageSizeRef.current)
  }, [cancelStroke])

  return (
    <GameShell
      gameId="thread"
      score={initialSave.completed}
      stats={[
        { label: 'Pairs', value: `${connectedCount}/${state.pairs.length}` },
        { label: 'Board', value: `${fillPercent}%` },
        { label: 'Puzzle', value: state.puzzleNumber },
      ]}
      paused={paused}
      onPauseChange={handlePauseChange}
      onRestart={handleClear}
      onExit={onExit}
      controls={
        <GameControlBar>
          <GameActionButton
            label="Undo"
            icon={<Undo2 size={16} strokeWidth={1.5} color={color.ink2} />}
            onPress={handleUndo}
            disabled={state.history.length === 0 || state.solved}
          />
          <GameActionButton
            label="Reset"
            icon={<RotateCcw size={16} strokeWidth={1.5} color={color.ink2} />}
            onPress={handleClear}
            disabled={!hasDrawnPaths || state.solved}
          />
        </GameControlBar>
      }
    >
      <View style={styles.stage}>
        <View style={styles.boardSpace} onLayout={handleStageLayout}>
          {gridSize > 0 && (
            <GlassSurface variant="card" radius={radius.lg} style={styles.board}>
              <View
                style={[
                  styles.grid,
                  {
                    width: gridSize,
                    height: gridSize,
                    borderRadius: innerRadius,
                    backgroundColor: color.surface1,
                  },
                ]}
              >
                <Svg
                  pointerEvents="none"
                  width={gridSize}
                  height={gridSize}
                  viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
                >
                  {/* Layer 1: Subtle empty cell dots & missed-cell hints */}
                  <G>
                    {cellOccupied.map((occupied, idx) => {
                      const row = Math.floor(idx / state.size)
                      const col = idx % state.size
                      const cx = col * 100 + 50
                      const cy = row * 100 + 50
                      const hasDot = !occupied && !endpointCells.has(idx)
                      const isMissed = allPairsConnected && !state.solved && !occupied

                      if (!hasDot && !isMissed) return null
                      return (
                        <G key={idx}>
                          {hasDot && <Circle cx={cx} cy={cy} r={3.5} fill={color.ink4} />}
                          {isMissed && (
                            <Rect
                              x={col * 100 + 14}
                              y={row * 100 + 14}
                              width={72}
                              height={72}
                              rx={12}
                              fill="none"
                              stroke={color.ink3}
                              strokeWidth={2.5}
                              strokeOpacity={0.7}
                            />
                          )}
                        </G>
                      )
                    })}
                  </G>

                  {/* Layer 2: Smooth round-cap conduits */}
                  <G>
                    {state.pairs.map((pair) => {
                      const path = state.paths[pair.color]
                      if (!path || path.length < 2) return null
                      const d = buildSvgPathD(path)
                      const connected = connectedColors.has(pair.color)
                      const active = state.activeColor === pair.color
                      const strokeOpacity = connected ? 0.72 : active ? 0.68 : 0.55
                      const stroke = tokens.pieces[legacyPieceMap[pair.color]]
                      return (
                        <Path
                          key={pair.color}
                          d={d}
                          fill="none"
                          stroke={stroke}
                          strokeWidth={40}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeOpacity={strokeOpacity}
                        />
                      )
                    })}
                  </G>

                  {/* Subtle active drag tip ring */}
                  {activeTip && state.activeColor && (
                    <Circle
                      cx={activeTip.col * 100 + 50}
                      cy={activeTip.row * 100 + 50}
                      r={24}
                      fill="none"
                      stroke={tokens.pieces[legacyPieceMap[state.activeColor]]}
                      strokeWidth={3}
                      strokeOpacity={0.55}
                    />
                  )}

                  {/* Layer 3: 7 distinct geometric endpoint shapes */}
                  <G>
                    {state.pairs.map((pair) => {
                      const connected = connectedColors.has(pair.color)
                      const active = state.activeColor === pair.color
                      const scale = active && !reducedMotion ? 1.06 : 1
                      return [pair.a, pair.b].map((cell, endIdx) => {
                        const cx = cell.col * 100 + 50
                        const cy = cell.row * 100 + 50
                        return (
                          <G
                            key={`${pair.color}-${endIdx}`}
                            transform={
                              scale === 1
                                ? undefined
                                : `translate(${cx}, ${cy}) scale(${scale}) translate(${-cx}, ${-cy})`
                            }
                          >
                            <EndpointShape
                              piece={pair.color}
                              cx={cx}
                              cy={cy}
                              connected={connected}
                              tokens={tokens}
                            />
                          </G>
                        )
                      })
                    })}
                  </G>
                </Svg>
                <View
                  {...panResponder.panHandlers}
                  collapsable={false}
                  accessibilityLabel={`Thread ${state.size} by ${state.size} board, ${connectedCount} of ${state.pairs.length} pairs connected, ${fillPercent} percent filled`}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            </GlassSurface>
          )}
        </View>

        <Text style={[styles.note, { color: color.ink2 }]}>
          {allPairsConnected && !state.solved
            ? `${remainingCells} empty ${remainingCells === 1 ? 'square' : 'squares'} left to cover`
            : ' '}
        </Text>
      </View>

      <Completion
        open={showCompletion}
        gameId="thread"
        title="Connected"
        line={`Puzzle ${state.puzzleNumber}`}
        actionLabel="Next puzzle"
        onAction={handleNextPuzzle}
      />
    </GameShell>
  )
}

export default ThreadScreen

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    width: '100%',
    gap: 8,
  },
  boardSpace: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  board: {
    padding: BEZEL_PADDING,
  },
  grid: {
    overflow: 'hidden',
  },
  note: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
})
