import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Svg, { Line, Rect } from 'react-native-svg'
import { ChevronsDown as _ChevronsDown, RotateCw as _RotateCw } from 'lucide-react-native'
import {
  BOARD_COLS,
  BOARD_ROWS,
  CLEAR_DURATION_MS,
  createSettle,
  DISSOLVE_DURATION_MS,
  DISSOLVE_ROWS,
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
  type SettleMode,
  type TetrominoType,
} from '@/core/games/settle/engine'
import { legacyPieceMap, type ResolvedTokens } from '@/design/tokens'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Segmented } from '@/ui/rn/controls'
import { Completion, GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { GlassPressable, GlassSurface } from '@/ui/rn/Glass'
import { isNumber, isRecord } from '@/core/decode'
import { useCalm, useFeedback, useGameLoop, useGameSave, useKeys, useReducedMotion, useResponsiveLayout } from '@/ui/rn/hooks'

type LucideSvgIcon = ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
const ChevronsDown = _ChevronsDown as unknown as LucideSvgIcon
const RotateCw = _RotateCw as unknown as LucideSvgIcon

interface SettleSave {
  state: SettleState | null
  bestLines: number
  plays: number
}

/** The save around the board; the board itself is checked on load (isValidSettleState). */
function isValidSave(v: unknown): v is SettleSave {
  return isRecord(v) && isNumber(v.bestLines) && isNumber(v.plays)
}

const DEFAULT_SAVE: SettleSave = {
  state: null,
  bestLines: 0,
  plays: 1,
}


const MODE_OPTIONS: readonly { value: SettleMode; label: string }[] = [
  { value: 'endless', label: 'Endless' },
  { value: 'classic', label: 'Classic' },
]

const CELL_PITCH = 20
const CELL_GAP = 2
const CELL_SIZE = CELL_PITCH - CELL_GAP
const VB_W = BOARD_COLS * CELL_PITCH
const VB_H = BOARD_ROWS * CELL_PITCH
const WELL_INSET = 4
const ARENA_GAP = 12

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

function piecePalette(colorKey: PieceColor, tokens: ResolvedTokens): { fill: string; edge: string; pip: string } {
  const stone = legacyPieceMap[colorKey]
  const fill = tokens.pieces[stone]
  const isLight = colorKey === 'saffron' || colorKey === 'sand'
  return {
    fill,
    edge: isLight ? 'rgba(18, 16, 11, 0.16)' : 'rgba(255, 255, 255, 0.14)',
    pip: isLight ? 'rgba(18, 16, 11, 0.18)' : 'rgba(255, 255, 255, 0.18)',
  }
}

function MiniPiece({ type, tokens }: { type: TetrominoType; tokens: ResolvedTokens }) {
  const cells = getShapeCells(type, 0)
  const xs = cells.map(([x]) => x)
  const ys = cells.map(([, y]) => y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const cols = maxX - minX + 1
  const rows = maxY - minY + 1
  const cellPx = 11
  const gapPx = 1.5
  const w = cols * cellPx + Math.max(0, cols - 1) * gapPx
  const h = rows * cellPx + Math.max(0, rows - 1) * gapPx
  const pal = piecePalette(PIECE_COLORS[type], tokens)

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {cells.map(([cx, cy], idx) => {
        const x = (cx - minX) * (cellPx + gapPx)
        const y = (cy - minY) * (cellPx + gapPx)
        return (
          <Rect
            key={idx}
            x={x + 0.5}
            y={y + 0.5}
            width={cellPx - 1}
            height={cellPx - 1}
            rx={2.5}
            fill={pal.fill}
            stroke={pal.edge}
            strokeWidth={1}
          />
        )
      })}
    </Svg>
  )
}

/** Repeat movement after a short delay while the pad is held. */
function PadButton({
  label,
  disabled,
  onTrigger,
  style,
  children,
}: {
  label: string
  disabled: boolean
  onTrigger: () => void
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const [pressed, setPressed] = useState(false)
  const triggerRef = useRef(onTrigger)
  triggerRef.current = onTrigger
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    setPressed(false)
    if (delayRef.current !== null) {
      clearTimeout(delayRef.current)
      delayRef.current = null
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (disabled) stop()
    return stop
  }, [disabled, stop])

  const start = useCallback(() => {
    if (disabled) return
    stop()
    setPressed(true)
    triggerRef.current()
    delayRef.current = setTimeout(() => {
      triggerRef.current()
      intervalRef.current = setInterval(() => triggerRef.current(), 68)
    }, 170)
  }, [disabled, stop])

  return (
    <Pressable
      disabled={disabled}
      onPressIn={start}
      onPressOut={stop}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => {
        if (!disabled) triggerRef.current()
      }}
      style={[style, { opacity: disabled ? 0.36 : pressed ? 0.7 : 1 }]}
    >
      {children}
    </Pressable>
  )
}

/** True when a tick only advanced the invisible gravity/lock timers. */
function onlyTimersChanged(a: SettleState, b: SettleState): boolean {
  for (const k of Object.keys(b) as (keyof SettleState)[]) {
    if (k === 'gravityTimerMs' || k === 'lockTimerMs') continue
    if (a[k] !== b[k]) return false
  }
  return true
}

export function SettleScreen({ onExit }: GameScreenProps) {
  const { isCompact } = useResponsiveLayout()
  const calm = useCalm('settle')
  const { cue, haptic } = useFeedback()
  const reduceMotion = useReducedMotion()
  const tokens = useTokenColors()
  const { color } = tokens
  const [saved, setSaved] = useGameSave('settle', DEFAULT_SAVE, isValidSave)

  const [state, setState] = useState<SettleState>(() => {
    if (isValidSettleState(saved.state)) {
      return { ...saved.state, mode: saved.state.mode ?? 'endless', gameOver: saved.state.gameOver ?? false }
    }
    return createSettle({ seed: Date.now() >>> 0, calm })
  })
  const [paused, setPaused] = useState(false)
  const [started, setStarted] = useState(false)
  const [arenaSize, setArenaSize] = useState({ w: 0, h: 0 })
  const playing = started && !paused && !state.gameOver

  // Every setState also sets this ref; copying `state` into it on each render
  // would rewind the gravity and lock timers the loop keeps here (ISS-17).
  const stateRef = useRef(state)
  const playingRef = useRef(playing)
  playingRef.current = playing
  const changePaused = (nextPaused: boolean) => {
    if (nextPaused) {
      playingRef.current = false
      // Checkpoint on every pause (including backgrounding), not only on exit:
      // the falling piece, hold and bag survive the app being killed.
      const snapshot = stateRef.current
      setSaved((prev) => ({ ...prev, state: snapshot, bestLines: Math.max(prev.bestLines, snapshot.lines) }))
    }
    setPaused(nextPaused)
  }

  /** The next lock is the player's own (a hard drop), not gravity's. */
  const playerDropRef = useRef(false)
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

  useEffect(() => {
    const clearChanged = state.clearEventId > prevClearIdRef.current
    const piecesChanged = state.pieces > prevPiecesRef.current
    const linesChanged = state.lines > prevLinesRef.current
    const dissolveChanged = state.dissolveCount > prevDissolveRef.current

    // Felt only when the player caused it: a drop of theirs, or lines it cleared.
    const theirs = playerDropRef.current
    if (piecesChanged || clearChanged) playerDropRef.current = false
    if (clearChanged) {
      cue(state.lastClearCount >= 4 ? 'chime' : 'clear', state.lastClearCount >= 4 ? 0.95 : 0.85)
      if (theirs) haptic('reward')
    } else if (piecesChanged) {
      cue('place', 0.85)
      if (theirs) haptic('settle')
    }

    if (dissolveChanged) {
      cue('undo', 0.55)
    }

    if (piecesChanged || linesChanged || dissolveChanged || state.gameOver) {
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

  useGameLoop(
    useCallback(
      (dtMs: number) => {
        if (!playingRef.current) return
        const prev = stateRef.current
        const next = tickSettle(prev, dtMs, calm)
        if (next !== prev) {
          stateRef.current = next
          // Gravity and lock timers tick every frame but draw nothing: only
          // re-render when something on screen actually moved.
          if (!onlyTimersChanged(prev, next)) setState(next)
        }
      },
      [calm],
    ),
    playing,
  )

  const applyInteractive = useCallback(
    (fn: (s: SettleState) => SettleState, feedback: 'tap' | 'undo' | 'none') => {
      if (!playingRef.current) return
      const prev = stateRef.current
      const next = fn(prev)
      if (next === prev) return
      stateRef.current = next
      setState(next)
      if (feedback === 'tap') {
        cue('tap', 0.55)
        haptic('tick')
      } else if (feedback === 'undo') {
        cue('undo', 0.7)
      }
    },
    [cue, haptic],
  )

  const doLeft = useCallback(() => applyInteractive(moveLeft, 'tap'), [applyInteractive])
  const doRight = useCallback(() => applyInteractive(moveRight, 'tap'), [applyInteractive])
  const doSoftDrop = useCallback(() => applyInteractive(softDrop, 'tap'), [applyInteractive])
  const doHardDrop = useCallback(() => {
    const before = stateRef.current
    playerDropRef.current = true
    applyInteractive(hardDrop, 'none')
    if (stateRef.current === before) playerDropRef.current = false
  }, [applyInteractive])
  const doRotateCW = useCallback(() => applyInteractive(rotateCW, 'tap'), [applyInteractive])
  const doRotateCCW = useCallback(() => applyInteractive(rotateCCW, 'tap'), [applyInteractive])
  const doHold = useCallback(() => applyInteractive(hold, 'undo'), [applyInteractive])

  const actionsRef = useRef({ doLeft, doRight, doHardDrop, doRotateCW, doHold })
  actionsRef.current = { doLeft, doRight, doHardDrop, doRotateCW, doHold }

  const resetBoard = useCallback((fresh: SettleState, incrementPlays: boolean) => {
    playingRef.current = false
    setStarted(false)
    setPaused(false)
    prevPiecesRef.current = 0
    prevLinesRef.current = 0
    prevClearIdRef.current = 0
    prevDissolveRef.current = 0
    stateRef.current = fresh
    setState(fresh)
    persistState(fresh, incrementPlays)
  }, [persistState])

  const handleRestart = useCallback(() => {
    const mode = pendingModeRef.current
    setPendingMode(null)
    const fresh =
      mode && mode !== stateRef.current.mode
        ? createSettle({ seed: Date.now() >>> 0, mode })
        : restart(stateRef.current, Date.now() >>> 0)
    resetBoard(fresh, true)
  }, [resetBoard])

  // A mode picked on the door or New game sheet waits for a new game; Continue
  // keeps the board as it was (ISS-09). An untouched board just takes it.
  const [pendingMode, setPendingMode] = useState<SettleMode | null>(null)
  const pendingModeRef = useRef(pendingMode)
  pendingModeRef.current = pendingMode

  const handleExit = useCallback(() => {
    persistState(stateRef.current)
    onExit()
  }, [persistState, onExit])

  // Web keyboard controls: repeating movement + single-shot rotations/drop/hold/pause
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
    playing,
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
      p: () => changePaused(true),
      P: () => changePaused(true),
      Escape: () => changePaused(true),
    },
    playing,
    false,
  )

  useKeys(
    {
      p: () => changePaused(false),
      P: () => changePaused(false),
    },
    paused,
    false,
  )

  // Compute responsive well & rail geometry
  const railW = Math.min(86, Math.max(68, Math.round(arenaSize.w * 0.22)))
  const svgW = Math.floor(Math.min(
    arenaSize.w - railW - ARENA_GAP - 2 * WELL_INSET,
    (arenaSize.h - 2 * WELL_INSET) * BOARD_COLS / BOARD_ROWS,
  ))
  const svgH = svgW * BOARD_ROWS / BOARD_COLS
  const wellW = svgW + 2 * WELL_INSET
  const wellH = svgH + 2 * WELL_INSET

  const cellWidthRef = useRef(svgW / BOARD_COLS)
  cellWidthRef.current = svgW / BOARD_COLS

  // Board touch gestures via PanResponder: tap -> rotate CW, drag -> slide, swipe down -> drop, swipe up -> hold
  const dragAxisRef = useRef<'none' | 'h' | 'v'>('none')
  const dragStepsRef = useRef(0)

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => playingRef.current,
      onMoveShouldSetPanResponder: () => playingRef.current,
      onPanResponderGrant: () => {
        dragAxisRef.current = 'none'
        dragStepsRef.current = 0
      },
      onPanResponderMove: (_, g) => {
        if (!playingRef.current) return
        if (dragAxisRef.current === 'none' && Math.hypot(g.dx, g.dy) > 10) {
          dragAxisRef.current = Math.abs(g.dx) >= Math.abs(g.dy) ? 'h' : 'v'
        }
        if (dragAxisRef.current === 'h') {
          const cellPx = Math.max(1, cellWidthRef.current)
          const targetSteps = Math.trunc(g.dx / cellPx)
          while (dragStepsRef.current < targetSteps) {
            actionsRef.current.doRight()
            dragStepsRef.current += 1
          }
          while (dragStepsRef.current > targetSteps) {
            actionsRef.current.doLeft()
            dragStepsRef.current -= 1
          }
        }
      },
      onPanResponderRelease: (_, g) => {
        if (!playingRef.current) return
        const axis = dragAxisRef.current
        const steps = dragStepsRef.current
        dragAxisRef.current = 'none'
        dragStepsRef.current = 0

        if (axis === 'none' && Math.hypot(g.dx, g.dy) < 12) {
          actionsRef.current.doRotateCW()
          return
        }
        // A quick flick can end before any move set the axis: take it from the whole gesture.
        const finalAxis = axis === 'none' ? (Math.abs(g.dx) >= Math.abs(g.dy) ? 'h' : 'v') : axis
        if (finalAxis === 'v') {
          if (g.dy > 32) {
            actionsRef.current.doHardDrop()
          } else if (g.dy < -32) {
            actionsRef.current.doHold()
          }
        } else if (finalAxis === 'h' && steps === 0) {
          if (g.dx > 24) actionsRef.current.doRight()
          else if (g.dx < -24) actionsRef.current.doLeft()
        }
      },
      onPanResponderTerminate: () => {
        dragAxisRef.current = 'none'
        dragStepsRef.current = 0
      },
    }),
  ).current

  // Compute rendered cells (board + ghost + active piece)
  const cells = useMemo(() => {
    const activeMap = new Map<number, PieceColor>()
    const ghostMap = new Map<number, PieceColor>()
    const clearSet = new Set(state.clearingRows)

    if (state.active) {
      const pieceColor = PIECE_COLORS[state.active.type]
      const ghostY = getGhostY(state)
      if (ghostY !== null && ghostY !== state.active.y) {
        for (const [cx, cy] of getPieceCells({ ...state.active, y: ghostY })) {
          if (cy >= 0 && cy < BOARD_ROWS && cx >= 0 && cx < BOARD_COLS) {
            ghostMap.set(cy * BOARD_COLS + cx, pieceColor)
          }
        }
      }
      for (const [cx, cy] of getPieceCells(state.active)) {
        if (cy >= 0 && cy < BOARD_ROWS && cx >= 0 && cx < BOARD_COLS) {
          activeMap.set(cy * BOARD_COLS + cx, pieceColor)
        }
      }
    }

    const out: {
      key: number
      row: number
      col: number
      kind: 'empty' | 'locked' | 'active' | 'ghost'
      color?: PieceColor
      clearing: boolean
    }[] = new Array(BOARD_ROWS * BOARD_COLS)

    for (let r = 0; r < BOARD_ROWS; r++) {
      const row = state.board[r]!
      const clearing = clearSet.has(r)
      for (let c = 0; c < BOARD_COLS; c++) {
        const idx = r * BOARD_COLS + c
        const activeColor = activeMap.get(idx)
        if (activeColor) {
          out[idx] = { key: idx, row: r, col: c, kind: 'active', color: activeColor, clearing: false }
          continue
        }
        const lockedColor = row[c]
        if (lockedColor) {
          out[idx] = { key: idx, row: r, col: c, kind: 'locked', color: lockedColor, clearing }
          continue
        }
        const ghostColor = ghostMap.get(idx)
        if (ghostColor) {
          out[idx] = { key: idx, row: r, col: c, kind: 'ghost', color: ghostColor, clearing: false }
          continue
        }
        out[idx] = { key: idx, row: r, col: c, kind: 'empty', clearing: false }
      }
    }
    return out
  }, [state])

  const clearProgress =
    state.clearingRows.length > 0
      ? Math.min(1, Math.max(0, 1 - state.clearTimerMs / CLEAR_DURATION_MS))
      : 0

  const dissolveFadeMs = reduceMotion ? 420 : 720
  const dissolveElapsed = state.dissolving
    ? DISSOLVE_DURATION_MS - state.dissolving.remainingMs
    : dissolveFadeMs
  const dissolveOpacity =
    state.dissolving && dissolveElapsed < dissolveFadeMs
      ? Math.max(0, 0.9 * (1 - dissolveElapsed / dissolveFadeMs))
      : 0

  const nextThree = state.queue.slice(0, 3)

  const handleArenaLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setArenaSize((prev) => prev.w === width && prev.h === height ? prev : { w: width, h: height })
  }, [])

  return (
    <GameShell
      gameId="settle"
      score={state.lines}
      stats={[
        { label: 'Lines', value: state.lines },
        { label: 'Pieces', value: state.pieces },
      ]}
      commitScore={started}
      ready={started}
      readyHint="Tap to rotate, drag to move, or use the buttons below."
      readyExtra={<Segmented label="Mode" options={MODE_OPTIONS} value={pendingMode ?? state.mode} onChange={setPendingMode} />}
      onReady={() => {
        const cur = stateRef.current
        const mode = pendingModeRef.current
        setPendingMode(null)
        if (cur.gameOver) handleRestart()
        else if (mode && mode !== cur.mode && cur.pieces === 0 && cur.lines === 0) {
          resetBoard(createSettle({ seed: Date.now() >>> 0, mode }), false)
        }
        setStarted(true)
      }}
      paused={paused}
      onPauseChange={changePaused}
      onRestart={handleRestart}
      onExit={handleExit}
      controls={
        <GlassSurface variant="chrome" radius={24} style={[styles.deck, { paddingBottom: isCompact ? 6 : 14 }]}>
          <View style={styles.moveCluster}>
            <GlassSurface variant="pill" radius={28} style={styles.movePill}>
              <PadButton label="Move left" disabled={!playing} onTrigger={doLeft} style={styles.movePad}>
                <Text style={[styles.arrow, { color: color.ink }]}>◀</Text>
              </PadButton>
              <View pointerEvents="none" style={[styles.padDivider, { backgroundColor: color.lineStrong }]} />
              <PadButton label="Move right" disabled={!playing} onTrigger={doRight} style={styles.movePad}>
                <Text style={[styles.arrow, { color: color.ink }]}>▶</Text>
              </PadButton>
            </GlassSurface>
            <GlassSurface variant="pill" radius={24}>
              <PadButton label="Soft drop" disabled={!playing} onTrigger={doSoftDrop} style={styles.softDrop}>
                <Text style={[styles.arrow, { color: color.ink2 }]}>▼</Text>
              </PadButton>
            </GlassSurface>
          </View>

          <View style={styles.rotateCluster}>
            <View style={styles.dropPosition}>
              <GlassPressable
                accessibilityLabel="Rotate clockwise"
                disabled={!playing}
                hapticFeedback={false}
                onPress={doRotateCW}
                style={styles.dropButton}
              >
                <RotateCw size={22} strokeWidth={1.65} color={color.ink} />
              </GlassPressable>
            </View>
            <GlassPressable
              accessibilityLabel="Hard drop"
              disabled={!playing}
              hapticFeedback={false}
              onPress={doHardDrop}
              variant="chrome"
              accent
              style={styles.rotateButton}
            >
              <ChevronsDown size={25} strokeWidth={1.65} color={color.ink} />
            </GlassPressable>
          </View>
        </GlassSurface>
      }
    >
      <View style={styles.arena} onLayout={handleArenaLayout}>
        {svgW > 0 && (
          <View style={styles.boardGroup}>
            <View
              {...panResponder.panHandlers}
              style={[
                styles.well,
                { width: wellW, height: wellH, backgroundColor: 'rgba(10, 12, 16, 0.94)', borderColor: color.line },
              ]}
            >
              <Svg width={svgW} height={svgH} viewBox={`0 0 ${VB_W} ${VB_H}`} pointerEvents="none">
                {Array.from({ length: BOARD_COLS - 1 }, (_, index) => {
                  const x = (index + 1) * CELL_PITCH
                  return <Line key={index} x1={x} y1={0} x2={x} y2={VB_H} stroke={color.ink4} strokeOpacity={0.17} strokeWidth={0.5} />
                })}

                {cells.map((cell) => {
                  if (cell.kind === 'empty') return null
                  const x = cell.col * CELL_PITCH + CELL_GAP * 0.5
                  const y = cell.row * CELL_PITCH + CELL_GAP * 0.5

                  if (cell.kind === 'ghost') {
                    return (
                      <Rect
                        key={cell.key}
                        x={x + 0.6}
                        y={y + 0.6}
                        width={CELL_SIZE - 1.2}
                        height={CELL_SIZE - 1.2}
                        rx={3.2}
                        fill="none"
                        stroke={color.ink4}
                        strokeWidth={1.2}
                      />
                    )
                  }

                  const pal = piecePalette(cell.color!, tokens)
                  if (cell.clearing) {
                    const useBone = !reduceMotion && clearProgress >= 0.32
                    const op = reduceMotion
                      ? Math.max(0, 1 - clearProgress)
                      : clearProgress < 0.42
                        ? 1
                        : Math.max(0, 1 - (clearProgress - 0.42) / 0.58)
                    return (
                      <Rect
                        key={cell.key}
                        x={x}
                        y={y}
                        width={CELL_SIZE}
                        height={CELL_SIZE}
                        rx={3.2}
                        fill={useBone ? tokens.pieces.bone : pal.fill}
                        opacity={op}
                      />
                    )
                  }

                  return (
                    <Rect
                      key={cell.key}
                      x={x}
                      y={y}
                      width={CELL_SIZE}
                      height={CELL_SIZE}
                      rx={3.2}
                      fill={pal.fill}
                    />
                  )
                })}

                {/* Subtle machined inset chamfer + center watch-component pip for active/locked blocks */}
                {cells.map((cell) => {
                  if ((cell.kind !== 'locked' && cell.kind !== 'active') || cell.clearing || !cell.color) {
                    return null
                  }
                  const x = cell.col * CELL_PITCH + CELL_GAP * 0.5
                  const y = cell.row * CELL_PITCH + CELL_GAP * 0.5
                  const pal = piecePalette(cell.color, tokens)
                  return (
                    <Rect
                      key={`c-${cell.key}`}
                      x={x + 0.75}
                      y={y + 0.75}
                      width={CELL_SIZE - 1.5}
                      height={CELL_SIZE - 1.5}
                      rx={2.6}
                      fill="none"
                      stroke={pal.edge}
                      strokeWidth={1}
                    />
                  )
                })}

                {cells.map((cell) => {
                  if ((cell.kind !== 'locked' && cell.kind !== 'active') || cell.clearing || !cell.color) {
                    return null
                  }
                  const x = cell.col * CELL_PITCH + CELL_GAP * 0.5
                  const y = cell.row * CELL_PITCH + CELL_GAP * 0.5
                  const pal = piecePalette(cell.color, tokens)
                  const pip = 2.6
                  return (
                    <Rect
                      key={`p-${cell.key}`}
                      x={x + (CELL_SIZE - pip) * 0.5}
                      y={y + (CELL_SIZE - pip) * 0.5}
                      width={pip}
                      height={pip}
                      rx={0.8}
                      fill={pal.pip}
                    />
                  )
                })}

                {/* Top-out gentle ember dissolve layer over bottom 4 rows */}
                {state.dissolving && dissolveOpacity > 0.01
                  ? state.dissolving.rows.map((row, rIdx) =>
                      row.map((cellColor, cIdx) => {
                        if (!cellColor) return null
                        const boardRow = BOARD_ROWS - DISSOLVE_ROWS + rIdx
                        const x = cIdx * CELL_PITCH + CELL_GAP * 0.5
                        const y = boardRow * CELL_PITCH + CELL_GAP * 0.5
                        const pal = piecePalette(cellColor, tokens)
                        return (
                          <Rect
                            key={`d-${state.dissolving!.id}-${rIdx}-${cIdx}`}
                            x={x}
                            y={y}
                            width={CELL_SIZE}
                            height={CELL_SIZE}
                            rx={3.2}
                            fill={pal.fill}
                            opacity={dissolveOpacity}
                          />
                        )
                      }),
                    )
                  : null}
              </Svg>

              {state.dissolving ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.notice,
                    { backgroundColor: color.surface2, borderColor: color.line },
                  ]}
                >
                  <Text style={[styles.labelText, { color: color.ink2 }]}>Making room</Text>
                </View>
              ) : null}
            </View>

            <GlassSurface variant="card" radius={16} style={[styles.rail, { width: railW }]}>
              <GlassPressable
                accessibilityLabel={state.hold ? `Hold piece (${state.hold})` : 'Hold piece'}
                disabled={!playing || !state.canHold}
                hapticFeedback={false}
                onPress={doHold}
                style={styles.railHold}
              >
                <Text style={[styles.labelText, { color: color.ink2 }]}>Hold</Text>
                <View style={styles.panelSlot}>
                  {state.hold ? (
                    <MiniPiece type={state.hold} tokens={tokens} />
                  ) : (
                    <View style={[styles.emptyDash, { backgroundColor: color.ink4 }]} />
                  )}
                </View>
              </GlassPressable>
              <Text style={[styles.labelText, { color: color.ink3 }]}>Next</Text>
              <View style={styles.nextList}>
                {nextThree.map((type, idx) => (
                  <View
                    key={`${idx}-${type}`}
                    style={[styles.nextItem, { opacity: idx === 0 ? 1 : idx === 1 ? 0.78 : 0.54 }]}
                  >
                    <MiniPiece type={type} tokens={tokens} />
                  </View>
                ))}
              </View>
            </GlassSurface>
          </View>
        )}
      </View>
      <Completion
        open={started && state.gameOver}
        gameId="settle"
        title="Board full"
        line={`${state.lines} ${state.lines === 1 ? 'line' : 'lines'} cleared`}
        actionLabel="Play again"
        onAction={() => {
          handleRestart()
          setStarted(true)
        }}
      />
    </GameShell>
  )
}

const styles = StyleSheet.create({
  arena: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ARENA_GAP,
  },
  well: {
    padding: WELL_INSET - 1,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  notice: {
    position: 'absolute',
    top: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  rail: {
    alignItems: 'center',
    padding: 6,
    gap: 8,
  },
  railHold: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 52,
    paddingVertical: 5,
  },
  panelSlot: {
    width: '100%',
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyDash: {
    width: 14,
    height: 2,
    borderRadius: 99,
  },
  nextList: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 2,
  },
  nextItem: {
    width: '100%',
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: {
    fontSize: 12,
    fontWeight: '500',
  },
  deck: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  moveCluster: {
    alignItems: 'center',
    gap: 6,
  },
  movePill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  movePad: {
    minWidth: 58,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padDivider: {
    width: 1,
    height: 22,
  },
  arrow: {
    fontSize: 18,
  },
  softDrop: {
    minWidth: 58,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotateCluster: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  dropPosition: {
    marginBottom: 46,
  },
  dropButton: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotateButton: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
