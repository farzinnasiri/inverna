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
import Svg, { Rect } from 'react-native-svg'
import {
  ArrowDownToLine as _ArrowDownToLine,
  ChevronDown as _ChevronDown,
  ChevronLeft as _ChevronLeft,
  ChevronRight as _ChevronRight,
  ChevronUp as _ChevronUp,
  RotateCw as _RotateCw,
} from 'lucide-react-native'

type LucideSvgIcon = ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
const ArrowDownToLine = _ArrowDownToLine as unknown as LucideSvgIcon
const ChevronDown = _ChevronDown as unknown as LucideSvgIcon
const ChevronLeft = _ChevronLeft as unknown as LucideSvgIcon
const ChevronRight = _ChevronRight as unknown as LucideSvgIcon
const ChevronUp = _ChevronUp as unknown as LucideSvgIcon
const RotateCw = _RotateCw as unknown as LucideSvgIcon
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
  type TetrominoType,
} from '@/core/games/settle/engine'
import { legacyPieceMap, type ResolvedTokens } from '@/design/tokens'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { useCalm, useFeedback, useGameLoop, useGameSave, useKeys, useReducedMotion } from '@/ui/rn/hooks'

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

const HOW_TO = [
  'Fit falling stones into full rows. The pace stays steady and slows gently during a wind-down.',
  'Use the D-pad and buttons, or tap the board to turn, drag to slide, swipe down to drop, and swipe up to hold.',
  'If the stack reaches the top, the bottom rows fade away to make room.',
] as const

const CELL_PITCH = 20
const CELL_GAP = 2
const CELL_SIZE = CELL_PITCH - CELL_GAP
const VB_W = BOARD_COLS * CELL_PITCH
const VB_H = BOARD_ROWS * CELL_PITCH

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

/** Tactile handheld button with optional DAS/ARR press-and-hold auto-repeat. */
function PadButton({
  label,
  repeat = false,
  disabled = false,
  onTrigger,
  style,
  pressedStyle,
  children,
}: {
  label: string
  repeat?: boolean
  disabled?: boolean
  onTrigger: () => void
  style?: StyleProp<ViewStyle>
  pressedStyle?: StyleProp<ViewStyle>
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
    if (repeat) {
      delayRef.current = setTimeout(() => {
        intervalRef.current = setInterval(() => {
          triggerRef.current()
        }, 68)
      }, 170)
    }
  }, [disabled, repeat, stop])

  return (
    <Pressable
      disabled={disabled}
      onPressIn={start}
      onPressOut={stop}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        style,
        pressed && !disabled ? pressedStyle : null,
        disabled ? styles.disabled : null,
      ]}
    >
      {children}
    </Pressable>
  )
}

export function SettleScreen({ onExit }: GameScreenProps) {
  const calm = useCalm()
  const { cue, haptic } = useFeedback()
  const reduceMotion = useReducedMotion()
  const tokens = useTokenColors()
  const { color } = tokens
  const [saved, setSaved] = useGameSave<SettleSave>('settle', DEFAULT_SAVE)

  const [state, setState] = useState<SettleState>(() => {
    if (isValidSettleState(saved.state)) {
      return saved.state
    }
    return createSettle({ seed: Date.now() >>> 0, calm })
  })
  const [paused, setPaused] = useState(false)
  const [arenaSize, setArenaSize] = useState({ w: 340, h: 460 })

  const stateRef = useRef(state)
  stateRef.current = state
  const pausedRef = useRef(paused)
  pausedRef.current = paused

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

  const actionsRef = useRef({ doLeft, doRight, doHardDrop, doRotateCW, doHold })
  actionsRef.current = { doLeft, doRight, doHardDrop, doRotateCW, doHold }

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

  // Compute responsive well & rail geometry
  const railW = Math.min(86, Math.max(68, Math.round(arenaSize.w * 0.22)))
  const maxWellW = Math.max(120, arenaSize.w - railW - 14)
  const wellH = Math.max(200, Math.floor(Math.min(arenaSize.h, 560, maxWellW * 2)))
  const wellW = Math.floor(wellH / 2)
  const svgW = Math.max(80, wellW - 8)
  const svgH = Math.max(160, wellH - 8)

  const wellWidthRef = useRef(wellW)
  wellWidthRef.current = wellW

  // Board touch gestures via PanResponder: tap -> rotate CW, drag -> slide, swipe down -> drop, swipe up -> hold
  const dragAxisRef = useRef<'none' | 'h' | 'v'>('none')
  const dragStepsRef = useRef(0)

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !pausedRef.current,
      onMoveShouldSetPanResponder: () => !pausedRef.current,
      onPanResponderGrant: () => {
        dragAxisRef.current = 'none'
        dragStepsRef.current = 0
      },
      onPanResponderMove: (_, g) => {
        if (pausedRef.current) return
        if (dragAxisRef.current === 'none' && Math.hypot(g.dx, g.dy) > 10) {
          dragAxisRef.current = Math.abs(g.dx) >= Math.abs(g.dy) ? 'h' : 'v'
        }
        if (dragAxisRef.current === 'h') {
          const cellPx = Math.max(18, Math.min(32, wellWidthRef.current / BOARD_COLS))
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
        if (pausedRef.current) return
        const axis = dragAxisRef.current
        const steps = dragStepsRef.current
        dragAxisRef.current = 'none'
        dragStepsRef.current = 0

        if (axis === 'none' && Math.hypot(g.dx, g.dy) < 12) {
          actionsRef.current.doRotateCW()
          return
        }
        if (axis === 'v') {
          if (g.dy > 32) {
            actionsRef.current.doHardDrop()
          } else if (g.dy < -32) {
            actionsRef.current.doHold()
          }
        } else if (axis === 'h' && steps === 0) {
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
    if (width > 0 && height > 0) {
      setArenaSize((prev) =>
        Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1 ? prev : { w: width, h: height },
      )
    }
  }, [])

  return (
    <GameShell
      gameId="settle"
      score={state.lines}
      stats={[
        { label: 'Lines', value: state.lines },
        { label: 'Pieces', value: state.pieces },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={handleRestart}
      onExit={handleExit}
      howTo={HOW_TO}
      controls={
        <View style={styles.deck}>
          {/* Left thumb: Cross D-Pad */}
          <View style={styles.dpad}>
            <View style={styles.dpadRow}>
              <View style={styles.dpadSpacer} />
              <PadButton
                label="Hard drop"
                disabled={paused}
                onTrigger={doHardDrop}
                style={[
                  styles.dpadArm,
                  styles.dpadUp,
                  { backgroundColor: color.surface2, borderColor: color.line },
                ]}
                pressedStyle={[styles.padPressed, { backgroundColor: color.surface3 }]}
              >
                <ChevronUp size={18} strokeWidth={1.75} color={color.ink2} />
              </PadButton>
              <View style={styles.dpadSpacer} />
            </View>

            <View style={styles.dpadRow}>
              <PadButton
                label="Move left"
                repeat
                disabled={paused}
                onTrigger={doLeft}
                style={[
                  styles.dpadArm,
                  styles.dpadLeft,
                  { backgroundColor: color.surface2, borderColor: color.line },
                ]}
                pressedStyle={[styles.padPressed, { backgroundColor: color.surface3 }]}
              >
                <ChevronLeft size={18} strokeWidth={1.75} color={color.ink2} />
              </PadButton>

              <View style={[styles.dpadHub, { backgroundColor: color.surface2 }]}>
                <View style={[styles.dpadDimple, { backgroundColor: color.surface1, borderColor: color.lineStrong }]} />
              </View>

              <PadButton
                label="Move right"
                repeat
                disabled={paused}
                onTrigger={doRight}
                style={[
                  styles.dpadArm,
                  styles.dpadRight,
                  { backgroundColor: color.surface2, borderColor: color.line },
                ]}
                pressedStyle={[styles.padPressed, { backgroundColor: color.surface3 }]}
              >
                <ChevronRight size={18} strokeWidth={1.75} color={color.ink2} />
              </PadButton>
            </View>

            <View style={styles.dpadRow}>
              <View style={styles.dpadSpacer} />
              <PadButton
                label="Soft drop"
                repeat
                disabled={paused}
                onTrigger={doSoftDrop}
                style={[
                  styles.dpadArm,
                  styles.dpadDown,
                  { backgroundColor: color.surface2, borderColor: color.line },
                ]}
                pressedStyle={[styles.padPressed, { backgroundColor: color.surface3 }]}
              >
                <ChevronDown size={18} strokeWidth={1.75} color={color.ink2} />
              </PadButton>
              <View style={styles.dpadSpacer} />
            </View>
          </View>

          {/* Center-bottom: Quiet Hold pill */}
          <PadButton
            label="Hold piece"
            disabled={paused || !state.canHold}
            onTrigger={doHold}
            style={[
              styles.holdPill,
              { backgroundColor: color.surface1, borderColor: color.line },
            ]}
            pressedStyle={[styles.padPressed, { backgroundColor: color.surface2 }]}
          >
            <Text style={[styles.labelText, { color: color.ink3 }]}>HOLD</Text>
          </PadButton>

          {/* Right thumb: Diagonally staggered Game Boy B (Drop) & A (Rotate) */}
          <View style={styles.abCluster}>
            <PadButton
              label="Hard drop"
              disabled={paused}
              onTrigger={doHardDrop}
              style={[
                styles.abBtn,
                styles.abBtnB,
                { backgroundColor: color.surface2, borderColor: color.line },
              ]}
              pressedStyle={[styles.padPressed, { backgroundColor: color.surface3 }]}
            >
              <View pointerEvents="none" style={[styles.abGroove, { borderColor: color.line }]} />
              <ArrowDownToLine size={20} strokeWidth={1.5} color={color.ink2} />
            </PadButton>

            <PadButton
              label="Rotate clockwise"
              disabled={paused}
              onTrigger={doRotateCW}
              style={[
                styles.abBtn,
                styles.abBtnA,
                { backgroundColor: color.surface2, borderColor: color.lineStrong },
              ]}
              pressedStyle={[styles.padPressed, { backgroundColor: color.surface3 }]}
            >
              <View pointerEvents="none" style={[styles.abGroove, { borderColor: color.line }]} />
              <RotateCw size={22} strokeWidth={1.5} color={color.ink} />
            </PadButton>
          </View>
        </View>
      }
    >
      <View style={styles.arena} onLayout={handleArenaLayout}>
        {/* 10x20 Watchmaker Well */}
        <View
          {...panResponder.panHandlers}
          style={[
            styles.well,
            {
              width: wellW,
              height: wellH,
              backgroundColor: color.bg,
              borderColor: color.line,
            },
          ]}
        >
          <Svg width={svgW} height={svgH} viewBox={`0 0 ${VB_W} ${VB_H}`} pointerEvents="none">
            <Rect x={0} y={0} width={VB_W} height={VB_H} fill={color.bg} />

            {cells.map((cell) => {
              const x = cell.col * CELL_PITCH + CELL_GAP * 0.5
              const y = cell.row * CELL_PITCH + CELL_GAP * 0.5

              if (cell.kind === 'empty') {
                return (
                  <Rect
                    key={cell.key}
                    x={x}
                    y={y}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    rx={3.2}
                    fill={color.surface1}
                  />
                )
              }

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
              <Text style={[styles.labelText, { color: color.ink2 }]}>MAKING ROOM</Text>
            </View>
          ) : null}
        </View>

        {/* Compact Hold + Next-3 side strip */}
        <View style={[styles.rail, { width: railW, height: wellH }]}>
          <Pressable
            disabled={paused || !state.canHold}
            onPress={doHold}
            accessibilityRole="button"
            accessibilityLabel={state.hold ? `Hold piece (${state.hold})` : 'Hold piece'}
            style={({ pressed }) => [
              styles.panel,
              {
                backgroundColor: pressed ? color.surface2 : color.surface1,
                borderColor: color.line,
                opacity: !state.canHold ? 0.45 : 1,
                transform: [{ scale: pressed && state.canHold ? 0.96 : 1 }],
              },
            ]}
          >
            <Text style={[styles.labelText, { color: color.ink3 }]}>HOLD</Text>
            <View style={styles.panelSlot}>
              {state.hold ? (
                <MiniPiece type={state.hold} tokens={tokens} />
              ) : (
                <View style={[styles.emptyDash, { backgroundColor: color.ink4 }]} />
              )}
            </View>
          </Pressable>

          <View style={[styles.panel, { backgroundColor: color.surface1, borderColor: color.line }]}>
            <Text style={[styles.labelText, { color: color.ink3 }]}>NEXT</Text>
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
          </View>
        </View>
      </View>
    </GameShell>
  )
}

const ARM = 42

const styles = StyleSheet.create({
  arena: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  well: {
    padding: 3,
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
    gap: 8,
  },
  panel: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
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
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 0.9,
  },
  deck: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
    maxWidth: 392,
    alignSelf: 'center',
  },
  dpad: {
    width: ARM * 3,
    height: ARM * 3,
  },
  dpadRow: {
    flexDirection: 'row',
    width: ARM * 3,
    height: ARM,
  },
  dpadSpacer: {
    width: ARM,
    height: ARM,
  },
  dpadArm: {
    width: ARM,
    height: ARM,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadUp: {
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomWidth: 0,
  },
  dpadLeft: {
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    borderRightWidth: 0,
  },
  dpadRight: {
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    borderLeftWidth: 0,
  },
  dpadDown: {
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderTopWidth: 0,
  },
  dpadHub: {
    width: ARM,
    height: ARM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadDimple: {
    width: 13,
    height: 13,
    borderRadius: 99,
    borderWidth: 1,
  },
  holdPill: {
    alignSelf: 'flex-end',
    marginBottom: 10,
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  abCluster: {
    position: 'relative',
    width: 124,
    height: 112,
  },
  abBtn: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  abGroove: {
    position: 'absolute',
    top: 4,
    right: 4,
    bottom: 4,
    left: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  abBtnA: {
    top: 4,
    right: 0,
    width: 58,
    height: 58,
  },
  abBtnB: {
    bottom: 6,
    left: 0,
    width: 54,
    height: 54,
  },
  padPressed: {
    transform: [{ scale: 0.96 }],
  },
  disabled: {
    opacity: 0.35,
  },
})
