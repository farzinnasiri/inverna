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
  isPairConnected,
  nextPuzzle,
  startPath,
  undo,
  type Cell,
  type PieceColor,
  type ThreadState,
} from '@/core/games/thread/engine'
import { legacyPieceMap, radius, type ResolvedTokens } from '@/design/tokens'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Completion, GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { IconButton } from '@/ui/rn/controls'
import { useCalm, useFeedback, useGameSave, useKeys, useReducedMotion } from '@/ui/rn/hooks'

interface ThreadSave {
  version: 1
  state: ThreadState
  completed: number
}

const COMPLETION_DELAY_MS = 680
const BEZEL_PADDING = 4
const BEZEL_BORDER = 1
const MAX_BOARD_SIZE = 396

const HOW_TO = [
  'Drag from any shape to connect it to its matching pair.',
  'Fill every cell on the board. Crossing another path trims it cleanly so you can reroute anytime.',
] as const

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

/**
 * Step a fast diagonal touch drag smoothly around a 90° corner via two
 * orthogonal `extendPath` calls so finger turns feel effortless on mobile.
 */
function extendWithCornerAssist(state: ThreadState, target: Cell): ThreadState {
  const direct = extendPath(state, target)
  if (direct !== state || !state.activeColor) return direct

  const activePath = state.paths[state.activeColor]
  if (!activePath || activePath.length === 0) return state
  const tip = activePath[activePath.length - 1]!
  const dr = target.row - tip.row
  const dc = target.col - tip.col

  if (Math.abs(dr) !== 1 || Math.abs(dc) !== 1) return state

  const candA: Cell = { row: tip.row, col: target.col }
  const candB: Cell = { row: target.row, col: tip.col }

  const isFree = (c: Cell) => !getEndpointAt(state, c) && !getPathOwnerAt(state, c)
  const ordered = isFree(candA) && !isFree(candB) ? [candA, candB] : [candB, candA]

  for (const mid of ordered) {
    const step1 = extendPath(state, mid)
    if (step1 === state) continue
    if (step1.solved || !step1.activeColor) return step1
    const step2 = extendPath(step1, target)
    if (step2 !== step1) return step2
  }

  return state
}

export function ThreadScreen({ onExit }: GameScreenProps) {
  const tokens = useTokenColors()
  const { color } = tokens
  const calm = useCalm()
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
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 340, h: 420 })

  const stateRef = useRef<ThreadState>(state)
  stateRef.current = state
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const touchOriginRef = useRef<{ x: number; y: number } | null>(null)
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const gridSize = useMemo(() => {
    const inset = (BEZEL_PADDING + BEZEL_BORDER) * 2
    const avail = Math.min(stageSize.w, Math.max(180, stageSize.h - 32), MAX_BOARD_SIZE)
    return Math.max(180, Math.floor(avail - inset))
  }, [stageSize.w, stageSize.h])

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

  const cellFromLocal = (x: number, y: number, clampToBoard: boolean): Cell | null => {
    const side = gridSizeRef.current
    if (side <= 0) return null
    if (!clampToBoard && (x < 0 || x > side || y < 0 || y > side)) return null
    const size = stateRef.current.size
    const col = Math.min(size - 1, Math.max(0, Math.floor((x / side) * size)))
    const row = Math.min(size - 1, Math.max(0, Math.floor((y / side) * size)))
    return { row, col }
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !pausedRef.current && !stateRef.current.solved,
      onMoveShouldSetPanResponder: () => !pausedRef.current && !stateRef.current.solved,
      onPanResponderGrant: (e) => {
        if (pausedRef.current || stateRef.current.solved) return
        const x = e.nativeEvent.locationX
        const y = e.nativeEvent.locationY
        const cell = cellFromLocal(x, y, false)
        if (!cell) return

        const prev = stateRef.current
        const next = startPath(prev, cell)
        if (next === prev || !next.activeColor) return

        touchOriginRef.current = { x, y }
        stateRef.current = next
        setState(next)
        cueRef.current('tap', 0.55)
        hapticRef.current('light')
      },
      onPanResponderMove: (_, g) => {
        const origin = touchOriginRef.current
        const prev = stateRef.current
        if (!origin || !prev.activeColor || prev.solved) return

        const cell = cellFromLocal(origin.x + g.dx, origin.y + g.dy, true)
        if (!cell) return

        const next = extendWithCornerAssist(prev, cell)
        if (next === prev) return

        const prevColor = prev.activeColor
        const prevLen = prev.paths[prevColor]?.length ?? 0
        const nextLen = next.paths[prevColor]?.length ?? 0
        const pair = prev.pairs.find((p) => p.color === prevColor)
        const wasConnected = pair ? isPairConnected(pair, prev.paths[prevColor]) : false
        const nowConnected = pair ? isPairConnected(pair, next.paths[prevColor]) : false

        stateRef.current = next
        setState(next)

        if (next.solved) {
          touchOriginRef.current = null
          persistRef.current(next, true)
          cueRef.current('chime', 0.9)
          hapticRef.current('success')
          scheduleCompletionRef.current()
        } else if (!wasConnected && nowConnected) {
          cueRef.current('place', 0.85)
          hapticRef.current('medium')
        } else if (nextLen !== prevLen) {
          cueRef.current('tap', 0.42)
          hapticRef.current('light')
        }
      },
      onPanResponderRelease: () => {
        if (!touchOriginRef.current) return
        touchOriginRef.current = null

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
      onPanResponderTerminate: () => {
        touchOriginRef.current = null
        const prev = stateRef.current
        if (!prev.activeColor) return
        const next = cancelActivePath(prev)
        stateRef.current = next
        setState(next)
      },
    }),
  ).current

  /* --- Board actions ------------------------------------------------------ */

  const handleUndo = useCallback(() => {
    if (paused || stateRef.current.solved) return
    const prev = stateRef.current
    if (prev.history.length === 0) return
    touchOriginRef.current = null
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
    touchOriginRef.current = null
    setShowCompletion(false)
    stateRef.current = next
    setState(next)
    persistState(next)
    cue('undo', 0.7)
    haptic('light')
  }, [persistState, cue, haptic])

  const handleCancelActive = useCallback(() => {
    const prev = stateRef.current
    if (!prev.activeColor) return
    touchOriginRef.current = null
    const next = cancelActivePath(prev)
    stateRef.current = next
    setState(next)
    cue('tap', 0.4)
  }, [cue])

  const handleNextPuzzle = useCallback(() => {
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }
    touchOriginRef.current = null
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
  const innerRadius = radius.lg - BEZEL_PADDING - BEZEL_BORDER

  const handleStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width > 0 && height > 0) {
      setStageSize((prev) =>
        Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1
          ? prev
          : { w: width, h: height },
      )
    }
  }, [])

  return (
    <GameShell
      gameId="thread"
      score={initialSave.completed}
      stats={[
        { label: 'Pairs', value: `${connectedCount}/${state.pairs.length}` },
        { label: 'Board', value: `${fillPercent}%` },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={handleClear}
      onExit={onExit}
      howTo={HOW_TO}
      controls={
        <View style={styles.bar}>
          <Text style={[styles.barTitle, { color: color.ink }]}>
            Puzzle {state.puzzleNumber}
          </Text>
          <View style={styles.barActions}>
            <IconButton
              label="Undo"
              onPress={handleUndo}
              disabled={state.history.length === 0 || state.solved}
            >
              <Undo2 size={20} strokeWidth={1.5} color={color.ink2} />
            </IconButton>
            <IconButton
              label="Reset board"
              onPress={handleClear}
              disabled={!hasDrawnPaths || state.solved}
            >
              <RotateCcw size={20} strokeWidth={1.5} color={color.ink2} />
            </IconButton>
          </View>
        </View>
      }
    >
      <View style={styles.stage} onLayout={handleStageLayout}>
        <View style={styles.frame}>
          <View
            style={[
              styles.board,
              {
                backgroundColor: color.bg,
                borderColor: color.line,
              },
            ]}
          >
            <View
              {...panResponder.panHandlers}
              accessibilityLabel={`Thread ${state.size} by ${state.size} board, ${connectedCount} of ${state.pairs.length} pairs connected, ${fillPercent} percent filled`}
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
            </View>
          </View>

          <Text
            style={[
              styles.note,
              {
                color: color.ink2,
                opacity: allPairsConnected && !state.solved ? 1 : 0,
              },
            ]}
          >
            {allPairsConnected && !state.solved
              ? `Fill the remaining ${remainingCells} ${remainingCells === 1 ? 'cell' : 'cells'}`
              : ' '}
          </Text>
        </View>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    alignItems: 'center',
    gap: 10,
  },
  board: {
    padding: BEZEL_PADDING,
    borderRadius: radius.lg,
    borderWidth: BEZEL_BORDER,
  },
  grid: {
    overflow: 'hidden',
  },
  note: {
    height: 18,
    lineHeight: 18,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    width: '100%',
    maxWidth: MAX_BOARD_SIZE,
    alignSelf: 'center',
  },
  barTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  barActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
})
