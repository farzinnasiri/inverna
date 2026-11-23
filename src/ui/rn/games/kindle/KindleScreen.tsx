import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { RotateCcw, Undo2 } from 'lucide-react-native'
import {
  GRID_SIZE,
  createKindle,
  makeRoom,
  move,
  undoKindle,
  type Direction,
  type KindleState,
  type Tile,
} from '@/core/games/kindle/engine'
import { radius } from '@/design/tokens'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { Button, IconButton } from '@/ui/rn/controls'
import { useCalm, useFeedback, useGameSave, useKeys, useReducedMotion } from '@/ui/rn/hooks'

interface KindleSave {
  version: 1
  state: KindleState
  bestScore: number
  plays: number
}

interface RenderTile {
  key: number
  value: number
  row: number
  col: number
  kind: 'normal' | 'new' | 'merged' | 'source' | 'extinguished'
}

const SLOTS = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => i)
const MILESTONE_DURATION_MS = 3200
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)

const HOW_TO = [
  'Swipe in any direction — or use arrow keys or WASD — to slide every tile across the board.',
  'Matching tiles combine into a brighter tile. Reach 2048 and keep going as long as you like.',
  'If the board fills up, undo a few steps or tap Make room to clear the two lowest tiles.',
] as const

function isValidTile(v: unknown): v is Tile {
  if (!v || typeof v !== 'object') return false
  const t = v as Partial<Tile>
  return (
    typeof t.id === 'number' &&
    typeof t.value === 'number' &&
    typeof t.row === 'number' &&
    typeof t.col === 'number' &&
    t.row >= 0 &&
    t.row < GRID_SIZE &&
    t.col >= 0 &&
    t.col < GRID_SIZE
  )
}

function isValidSave(v: unknown): v is KindleSave {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<KindleSave>
  return (
    s.version === 1 &&
    typeof s.bestScore === 'number' &&
    typeof s.plays === 'number' &&
    !!s.state &&
    Array.isArray(s.state.tiles) &&
    s.state.tiles.every(isValidTile) &&
    typeof s.state.score === 'number' &&
    typeof s.state.bestTile === 'number' &&
    typeof s.state.moves === 'number' &&
    typeof s.state.rngState === 'number' &&
    typeof s.state.nextId === 'number' &&
    Array.isArray(s.state.history)
  )
}

function prevScore(state: KindleState | undefined): number {
  return state ? state.score : 0
}

/** Watchmaker Slate-Graphite -> Verdigris -> Indigo -> Oxblood -> Antique Brass -> Moon Ivory ramp. */
function tilePalette(
  value: number,
  ink: string,
  ink2: string,
  accentInk: string,
): { bg: string; fg: string; border: string } {
  const darkBorder = 'rgba(220, 226, 235, 0.08)'
  const lightBorder = 'rgba(18, 16, 11, 0.12)'
  switch (value) {
    case 2:
      return { bg: '#171A20', fg: ink2, border: darkBorder }
    case 4:
      return { bg: '#20252E', fg: ink2, border: darkBorder }
    case 8:
      return { bg: '#2A3442', fg: ink, border: darkBorder }
    case 16:
      return { bg: '#364B5E', fg: ink, border: darkBorder }
    case 32:
      return { bg: '#3E6157', fg: ink, border: darkBorder }
    case 64:
      return { bg: '#585275', fg: ink, border: darkBorder }
    case 128:
      return { bg: '#87434B', fg: ink, border: darkBorder }
    case 256:
      return { bg: '#9E7F43', fg: accentInk, border: lightBorder }
    case 512:
      return { bg: '#B89450', fg: accentInk, border: lightBorder }
    case 1024:
      return { bg: '#C9B07C', fg: accentInk, border: lightBorder }
    default:
      return { bg: '#DCE0E6', fg: accentInk, border: lightBorder }
  }
}

function tileFontSize(value: number, boardSize: number): { fontSize: number; letterSpacing: number } {
  const digits = String(value).length
  if (digits <= 1) {
    return { fontSize: Math.max(22, Math.min(38, Math.round(boardSize * 0.096))), letterSpacing: -0.4 }
  }
  if (digits === 2) {
    return { fontSize: Math.max(20, Math.min(34, Math.round(boardSize * 0.086))), letterSpacing: -0.4 }
  }
  if (digits === 3) {
    return { fontSize: Math.max(17, Math.min(28, Math.round(boardSize * 0.071))), letterSpacing: -0.5 }
  }
  if (digits === 4) {
    return { fontSize: Math.max(14, Math.min(23, Math.round(boardSize * 0.057))), letterSpacing: -0.6 }
  }
  return { fontSize: Math.max(12, Math.min(18, Math.round(boardSize * 0.046))), letterSpacing: -0.7 }
}

function KindleTileView({
  tile,
  cellSize,
  gap,
  boardSize,
  reduceMotion,
}: {
  tile: RenderTile
  cellSize: number
  gap: number
  boardSize: number
  reduceMotion: boolean
}) {
  const { color } = useTokenColors()
  const targetX = tile.col * (cellSize + gap)
  const targetY = tile.row * (cellSize + gap)

  const posX = useRef(new Animated.Value(targetX)).current
  const posY = useRef(new Animated.Value(targetY)).current
  const scale = useRef(
    new Animated.Value(
      reduceMotion
        ? 1
        : tile.kind === 'new'
          ? 0.9
          : tile.kind === 'merged'
            ? 0.96
            : 1,
    ),
  ).current
  const opacity = useRef(
    new Animated.Value(tile.kind === 'new' || tile.kind === 'merged' ? 0 : 1),
  ).current

  const prevMetricRef = useRef({ cellSize, gap })
  const prevCoordRef = useRef({ row: tile.row, col: tile.col })

  useEffect(() => {
    const metricChanged =
      prevMetricRef.current.cellSize !== cellSize || prevMetricRef.current.gap !== gap
    const coordChanged =
      prevCoordRef.current.row !== tile.row || prevCoordRef.current.col !== tile.col

    prevMetricRef.current = { cellSize, gap }
    prevCoordRef.current = { row: tile.row, col: tile.col }

    if (metricChanged || reduceMotion || !coordChanged) {
      posX.setValue(targetX)
      posY.setValue(targetY)
      return
    }

    Animated.parallel([
      Animated.timing(posX, {
        toValue: targetX,
        duration: 150,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(posY, {
        toValue: targetY,
        duration: 150,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start()
  }, [targetX, targetY, cellSize, gap, tile.row, tile.col, reduceMotion, posX, posY])

  useEffect(() => {
    if (tile.kind === 'new') {
      if (reduceMotion) {
        scale.setValue(1)
        opacity.setValue(0)
        Animated.timing(opacity, {
          toValue: 1,
          duration: 140,
          easing: EASE_OUT,
          useNativeDriver: true,
        }).start()
      } else {
        scale.setValue(0.9)
        opacity.setValue(0)
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 190,
            delay: 70,
            easing: EASE_OUT,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 190,
            delay: 70,
            easing: EASE_OUT,
            useNativeDriver: true,
          }),
        ]).start()
      }
    } else if (tile.kind === 'merged') {
      if (reduceMotion) {
        scale.setValue(1)
        opacity.setValue(0)
        Animated.timing(opacity, {
          toValue: 1,
          duration: 140,
          easing: EASE_OUT,
          useNativeDriver: true,
        }).start()
      } else {
        scale.setValue(0.96)
        opacity.setValue(0)
        Animated.sequence([
          Animated.delay(85),
          Animated.parallel([
            Animated.timing(opacity, {
              toValue: 1,
              duration: 84,
              easing: EASE_OUT,
              useNativeDriver: true,
            }),
            Animated.timing(scale, {
              toValue: 1.07,
              duration: 84,
              easing: EASE_OUT,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(scale, {
            toValue: 1,
            duration: 116,
            easing: EASE_OUT,
            useNativeDriver: true,
          }),
        ]).start()
      }
    } else if (tile.kind === 'source') {
      Animated.timing(opacity, {
        toValue: 0,
        duration: reduceMotion ? 140 : 155,
        easing: EASE_OUT,
        useNativeDriver: true,
      }).start()
    } else if (tile.kind === 'extinguished') {
      if (reduceMotion) {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 140,
          easing: EASE_OUT,
          useNativeDriver: true,
        }).start()
      } else {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 380,
            easing: EASE_OUT,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.91,
            duration: 380,
            easing: EASE_OUT,
            useNativeDriver: true,
          }),
        ]).start()
      }
    } else {
      opacity.setValue(1)
      scale.setValue(1)
    }
  }, [tile.kind, reduceMotion, opacity, scale])

  const palette = tilePalette(tile.value, color.ink, color.ink2, color.accentInk)
  const typography = tileFontSize(tile.value, boardSize)
  const zIndex =
    tile.kind === 'merged' ? 3 : tile.kind === 'source' || tile.kind === 'extinguished' ? 1 : 2

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.tileWrap,
        {
          width: cellSize,
          height: cellSize,
          zIndex,
          transform: [{ translateX: posX }, { translateY: posY }],
        },
      ]}
    >
      <Animated.View
        style={[
          styles.tileInner,
          {
            backgroundColor: palette.bg,
            borderColor: palette.border,
            opacity,
            transform: [{ scale }],
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.tileNum,
            {
              color: palette.fg,
              fontSize: typography.fontSize,
              letterSpacing: typography.letterSpacing,
            },
          ]}
        >
          {tile.value}
        </Text>
        {tile.value >= 128 ? (
          <View style={[styles.milestoneDot, { backgroundColor: palette.fg }]} />
        ) : null}
      </Animated.View>
    </Animated.View>
  )
}

function Icon({
  as,
  size,
  strokeWidth = 1.6,
  color,
}: {
  as: object
  size: number
  strokeWidth?: number
  color: string
}) {
  const Comp = as as ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
  return <Comp size={size} strokeWidth={strokeWidth} color={color} />
}

export function KindleScreen({ onExit }: GameScreenProps) {
  const { color } = useTokenColors()
  const calm = useCalm()
  const { cue, haptic } = useFeedback()
  const reduceMotion = useReducedMotion()

  const [fallback] = useState<KindleSave>(() => ({
    version: 1,
    state: createKindle({ seed: Date.now() >>> 0, calm }),
    bestScore: 0,
    plays: 1,
  }))
  const [rawSave, setSave] = useGameSave<KindleSave>('kindle', fallback)
  const save = isValidSave(rawSave) ? rawSave : fallback
  const state = save.state

  const [paused, setPaused] = useState(false)
  const [milestoneNotice, setMilestoneNotice] = useState(false)
  const [boardSize, setBoardSize] = useState(320)

  const milestoneTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const stateRef = useRef(state)
  stateRef.current = state
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const calmRef = useRef(calm)
  calmRef.current = calm

  useEffect(() => {
    return () => {
      if (milestoneTimerRef.current) clearTimeout(milestoneTimerRef.current)
    }
  }, [])

  const showMilestone = useCallback(() => {
    setMilestoneNotice(true)
    if (milestoneTimerRef.current) clearTimeout(milestoneTimerRef.current)
    milestoneTimerRef.current = setTimeout(() => {
      setMilestoneNotice(false)
    }, MILESTONE_DURATION_MS)
  }, [])

  const doMove = useCallback(
    (dir: Direction) => {
      if (pausedRef.current) return
      const prev = stateRef.current
      const next = move(prev, dir, calmRef.current)
      if (next === prev) return

      stateRef.current = next
      setSave((cur) => {
        const valid = isValidSave(cur) ? cur : fallback
        return {
          version: 1,
          state: next,
          bestScore: Math.max(valid.bestScore, next.score),
          plays: valid.plays,
        }
      })

      if (next.justReached2048) {
        cue('chime', 0.95)
        haptic('success')
        showMilestone()
      } else if (next.lastMergeMax >= 128) {
        cue('clear', 0.85)
        haptic('medium')
      } else if (next.lastMergeMax > 0) {
        cue('place', 0.8)
        haptic('light')
      } else {
        cue('tap', 0.55)
        haptic('light')
      }
    },
    [cue, haptic, setSave, fallback, showMilestone],
  )

  const doUndo = useCallback(() => {
    if (pausedRef.current) return
    const prev = stateRef.current
    const next = undoKindle(prev)
    if (next === prev) return

    stateRef.current = next
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: next,
        bestScore: valid.bestScore,
        plays: valid.plays,
      }
    })
    cue('undo', 0.7)
    haptic('light')
  }, [cue, haptic, setSave, fallback])

  const doMakeRoom = useCallback(() => {
    if (pausedRef.current) return
    const prev = stateRef.current
    const next = makeRoom(prev)
    if (next === prev) return

    stateRef.current = next
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: next,
        bestScore: valid.bestScore,
        plays: valid.plays,
      }
    })
    cue('undo', 0.55)
    haptic('light')
  }, [cue, haptic, setSave, fallback])

  const doRestart = useCallback(() => {
    if (milestoneTimerRef.current) clearTimeout(milestoneTimerRef.current)
    setMilestoneNotice(false)
    const fresh = createKindle({ seed: Date.now() >>> 0, calm: calmRef.current })
    stateRef.current = fresh
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: fresh,
        bestScore: Math.max(valid.bestScore, prevScore(valid.state)),
        plays: valid.plays + 1,
      }
    })
    cue('tap', 0.55)
  }, [cue, setSave, fallback])

  const doMoveRef = useRef(doMove)
  doMoveRef.current = doMove
  const swipedRef = useRef(false)

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8,
      onPanResponderGrant: () => {
        swipedRef.current = false
      },
      onPanResponderMove: (_, g) => {
        if (swipedRef.current) return
        const ax = Math.abs(g.dx)
        const ay = Math.abs(g.dy)
        if (Math.max(ax, ay) >= 28) {
          swipedRef.current = true
          const dir: Direction =
            ax > ay ? (g.dx > 0 ? 'right' : 'left') : g.dy > 0 ? 'down' : 'up'
          doMoveRef.current(dir)
        }
      },
      onPanResponderRelease: (_, g) => {
        if (swipedRef.current) return
        const ax = Math.abs(g.dx)
        const ay = Math.abs(g.dy)
        if (Math.max(ax, ay) >= 20) {
          const dir: Direction =
            ax > ay ? (g.dx > 0 ? 'right' : 'left') : g.dy > 0 ? 'down' : 'up'
          doMoveRef.current(dir)
        }
      },
    }),
  ).current

  useKeys(
    {
      ArrowUp: () => doMove('up'),
      w: () => doMove('up'),
      W: () => doMove('up'),
      ArrowDown: () => doMove('down'),
      s: () => doMove('down'),
      S: () => doMove('down'),
      ArrowLeft: () => doMove('left'),
      a: () => doMove('left'),
      A: () => doMove('left'),
      ArrowRight: () => doMove('right'),
      d: () => doMove('right'),
      D: () => doMove('right'),
      z: doUndo,
      Z: doUndo,
      Backspace: doUndo,
      Escape: () => setPaused(true),
      p: () => setPaused(true),
      P: () => setPaused(true),
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

  const renderTiles = useMemo<RenderTile[]>(() => {
    const items: RenderTile[] = []

    if (state.extinguished) {
      for (const ext of state.extinguished) {
        items.push({
          key: ext.id,
          value: ext.value,
          row: ext.row,
          col: ext.col,
          kind: 'extinguished',
        })
      }
    }

    for (const tile of state.tiles) {
      if (tile.mergedFrom) {
        for (const src of tile.mergedFrom) {
          items.push({
            key: src.id,
            value: src.value,
            row: tile.row,
            col: tile.col,
            kind: 'source',
          })
        }
        items.push({
          key: tile.id,
          value: tile.value,
          row: tile.row,
          col: tile.col,
          kind: 'merged',
        })
      } else {
        items.push({
          key: tile.id,
          value: tile.value,
          row: tile.row,
          col: tile.col,
          kind: tile.isNew ? 'new' : 'normal',
        })
      }
    }

    items.sort((a, b) => a.key - b.key)
    return items
  }, [state.tiles, state.extinguished])

  const handleStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    const next = Math.floor(Math.min(width, height, 392))
    if (next > 80) setBoardSize(next)
  }, [])

  const gap = Math.max(8, Math.min(10, Math.round(boardSize * 0.025)))
  const cellSize = (boardSize - gap * (GRID_SIZE - 1)) / GRID_SIZE

  const undoCount = state.history.length

  return (
    <GameShell
      gameId="kindle"
      score={state.score}
      stats={[
        { label: 'Score', value: state.score.toLocaleString() },
        { label: 'Moves', value: state.moves },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={doRestart}
      onExit={onExit}
      howTo={HOW_TO}
      controls={
        <View style={styles.controlsWrap}>
          {state.stuck ? (
            <View
              style={[
                styles.stuckBar,
                { backgroundColor: color.surface1, borderColor: color.line },
              ]}
            >
              <Text style={[styles.stuckLabel, { color: color.ink3 }]}>No moves left</Text>
              <View style={styles.stuckActions}>
                <Button variant="primary" size="sm" onPress={doMakeRoom}>
                  Make room
                </Button>
                <Button
                  variant="quiet"
                  size="sm"
                  onPress={doUndo}
                  disabled={undoCount === 0}
                  accessibilityLabel={undoCount > 0 ? `Undo (${undoCount} available)` : 'Undo'}
                >
                  <Icon as={Undo2} size={15} color={color.ink} />
                  <Text style={[styles.actionBtnText, { color: color.ink }]}>Undo</Text>
                </Button>
                <Button variant="ghost" size="sm" onPress={doRestart}>
                  <Icon as={RotateCcw} size={15} color={color.ink2} />
                  <Text style={[styles.actionBtnText, { color: color.ink2 }]}>New</Text>
                </Button>
              </View>
            </View>
          ) : (
            <View style={styles.normalBar}>
              <View style={styles.undoGroup}>
                <IconButton
                  label={undoCount > 0 ? `Undo (${undoCount} available)` : 'Undo'}
                  onPress={doUndo}
                  disabled={undoCount === 0}
                >
                  <Icon as={Undo2} size={20} strokeWidth={1.5} color={color.ink2} />
                </IconButton>
                {undoCount > 0 ? (
                  <Text style={[styles.undoCount, { color: color.ink3 }]}>{undoCount}</Text>
                ) : null}
              </View>
              <IconButton label="New board" onPress={doRestart}>
                <Icon as={RotateCcw} size={18} strokeWidth={1.5} color={color.ink2} />
              </IconButton>
            </View>
          )}
        </View>
      }
    >
      <View style={styles.stage} onLayout={handleStageLayout}>
        <View
          {...panResponder.panHandlers}
          accessible
          accessibilityLabel={`Kindle 4 by 4 board, score ${state.score}, highest tile ${state.bestTile}`}
          style={[
            styles.board,
            {
              width: boardSize,
              height: boardSize,
              backgroundColor: color.bg,
            },
          ]}
        >
          {SLOTS.map((slot) => {
            const r = Math.floor(slot / GRID_SIZE)
            const c = slot % GRID_SIZE
            return (
              <View
                key={slot}
                pointerEvents="none"
                style={[
                  styles.slot,
                  {
                    width: cellSize,
                    height: cellSize,
                    left: c * (cellSize + gap),
                    top: r * (cellSize + gap),
                    backgroundColor: color.surface1,
                    borderColor: color.line,
                  },
                ]}
              />
            )
          })}

          {renderTiles.map((tile) => (
            <KindleTileView
              key={tile.key}
              tile={tile}
              cellSize={cellSize}
              gap={gap}
              boardSize={boardSize}
              reduceMotion={reduceMotion}
            />
          ))}

          {milestoneNotice ? (
            <View
              pointerEvents="none"
              style={[
                styles.notice,
                { backgroundColor: color.surface2, borderColor: color.line },
              ]}
            >
              <Text style={[styles.noticeText, { color: color.ink }]}>2048 · keep going</Text>
            </View>
          ) : null}
        </View>
      </View>
    </GameShell>
  )
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  board: {
    position: 'relative',
  },
  slot: {
    position: 'absolute',
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  tileWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  tileInner: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileNum: {
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  milestoneDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 3,
    height: 3,
    borderRadius: 2,
    opacity: 0.48,
  },
  notice: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    zIndex: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  noticeText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  controlsWrap: {
    width: '100%',
    maxWidth: 392,
    alignSelf: 'center',
  },
  normalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    gap: 16,
  },
  undoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  undoCount: {
    minWidth: 16,
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  stuckBar: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: 10,
  },
  stuckLabel: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  stuckActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
})
