import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import Svg, { Circle, Ellipse, Path, Polygon } from 'react-native-svg'
import {
  createLanterns,
  flipCard,
  nextPuzzle,
  resolveMismatch,
  sigilLabel,
  type LanternCard,
  type LanternsState,
  type SigilId,
} from '@/core/games/lanterns/engine'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Completion, GameActionButton, GameControlBar, GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { useCalm, useFeedback, useGameSave, useKeys, useReducedMotion, useResponsiveLayout } from '@/ui/rn/hooks'

interface LanternsSave {
  version: 1
  state: LanternsState
  completed: number
}

const BOARD_MAX_WIDTH = 392
const MISMATCH_DELAY_MS = 850
const COMPLETION_DELAY_MS = 520


function isValidCard(v: unknown): v is LanternCard {
  if (!v || typeof v !== 'object') return false
  const c = v as Partial<LanternCard>
  return (
    typeof c.id === 'number' &&
    typeof c.sigil === 'string' &&
    typeof c.tone === 'string' &&
    typeof c.flipped === 'boolean' &&
    typeof c.matched === 'boolean'
  )
}

function isValidSave(v: unknown): v is LanternsSave {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<LanternsSave>
  if (s.version !== 1 || typeof s.completed !== 'number' || !s.state) return false
  const st = s.state
  return (
    st.cols === 4 &&
    (st.rows === 3 || st.rows === 4) &&
    Array.isArray(st.cards) &&
    st.cards.length === st.cols * st.rows &&
    st.cards.every(isValidCard) &&
    typeof st.moves === 'number' &&
    typeof st.matchedPairs === 'number' &&
    (st.totalPairs === 6 || st.totalPairs === 8) &&
    typeof st.puzzleNumber === 'number' &&
    typeof st.solved === 'boolean' &&
    typeof st.rngState === 'number' &&
    pendingValid(st)
  )
}

/** firstIndex / mismatchPair must exist (null is fine) and agree with the face-up cards. */
function pendingValid(st: Partial<LanternsSave['state']>): boolean {
  const cards = st.cards ?? []
  const inRange = (i: unknown) => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < cards.length
  const openCard = (i: number) => cards[i]!.flipped && !cards[i]!.matched
  if (st.firstIndex === undefined || st.mismatchPair === undefined) return false
  if (st.firstIndex !== null && !(inRange(st.firstIndex) && openCard(st.firstIndex))) return false
  if (st.mismatchPair !== null) {
    const p = st.mismatchPair
    if (!Array.isArray(p) || p.length !== 2 || !inRange(p[0]) || !inRange(p[1]) || p[0] === p[1]) return false
    if (!openCard(p[0]) || !openCard(p[1])) return false
  }
  return true
}

/* --- 12 Bespoke Watchmaker Astronomical SVG Sigils ----------------------- */

/**
 * Twelve bespoke astronomical / watchmaker single-weight geometric SVGs.
 * Crisp 1.5px strokes on a 40x40 viewBox — zero emoji, zero gradients.
 */
function SigilMark({
  id,
  size,
  color,
  opacity = 1,
}: {
  id: SigilId
  size: number
  color: string
  opacity?: number
}) {
  const strokeProps = {
    fill: 'none',
    stroke: color,
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" opacity={opacity}>
      {id === 'crescent' && (
        <>
          <Path d="M23.5 9.5a11 11 0 1 0 7.2 19.3 8.8 8.8 0 0 1-7.2-19.3Z" {...strokeProps} />
          <Path d="M27.5 11.5v4M25.5 13.5h4" {...strokeProps} />
        </>
      )}

      {id === 'compass' && (
        <>
          <Circle cx={20} cy={20} r={12.5} {...strokeProps} />
          <Polygon points="20,10.5 23,20 20,29.5 17,20" {...strokeProps} />
          <Circle cx={20} cy={20} r={1.4} fill={color} />
          <Path d="M20 5.5v2M20 32.5v2M5.5 20h2M32.5 20h2" {...strokeProps} />
        </>
      )}

      {id === 'astrolabe' && (
        <>
          <Circle cx={20} cy={21} r={11} {...strokeProps} />
          <Ellipse cx={20} cy={21} rx={5.5} ry={11} transform="rotate(-24 20 21)" {...strokeProps} />
          <Path d="M10.5 21h19" {...strokeProps} />
          <Circle cx={20} cy={7.5} r={2} {...strokeProps} />
          <Circle cx={20} cy={21} r={1.5} fill={color} />
        </>
      )}

      {id === 'sundial' && (
        <>
          <Path d="M8.5 26.5a11.5 11.5 0 0 1 23 0" {...strokeProps} />
          <Path d="M7 26.5h26" {...strokeProps} />
          <Path d="M20 26.5V10.5l7.5 16" {...strokeProps} />
          <Path d="M12.5 19l1.6 1.4M27.5 19l-1.6 1.4M20 15v2.2" {...strokeProps} />
        </>
      )}

      {id === 'prism' && (
        <>
          <Polygon points="20,9.5 31,28.5 9,28.5" {...strokeProps} />
          <Path d="M5.5 20h8.5" {...strokeProps} />
          <Path d="M25.2 18.5l8.8-2.5" {...strokeProps} />
          <Path d="M26.8 21.5l7.7 2.5" {...strokeProps} />
        </>
      )}

      {id === 'wave' && (
        <>
          <Path d="M7 16.5c2.6-3.2 5.4-3.2 8 0s5.4 3.2 8 0 5.4-3.2 10 0" {...strokeProps} />
          <Path d="M7 23.5c2.6-3.2 5.4-3.2 8 0s5.4 3.2 8 0 5.4-3.2 10 0" {...strokeProps} />
          <Circle cx={7} cy={16.5} r={1.2} fill={color} />
          <Circle cx={33} cy={23.5} r={1.2} fill={color} />
        </>
      )}

      {id === 'star' && (
        <>
          <Path d="M20 7v8M20 25v8M7 20h8M25 20h8" {...strokeProps} />
          <Path d="M11.5 11.5l5 5M23.5 23.5l5 5M28.5 11.5l-5 5M16.5 23.5l-5 5" {...strokeProps} />
          <Circle cx={20} cy={20} r={3} {...strokeProps} />
        </>
      )}

      {id === 'hourglass' && (
        <>
          <Path d="M12 8.5h16M12 31.5h16" {...strokeProps} />
          <Path d="M14 8.5v4.5c0 3.2 6 5.5 6 7s-6 3.8-6 7v4.5" {...strokeProps} />
          <Path d="M26 8.5v4.5c0 3.2-6 5.5-6 7s6 3.8 6 7v4.5" {...strokeProps} />
          <Circle cx={20} cy={24.5} r={1.2} fill={color} />
        </>
      )}

      {id === 'rings' && (
        <>
          <Circle cx={20} cy={20} r={6.8} {...strokeProps} />
          <Ellipse cx={20} cy={20} rx={14} ry={4.8} transform="rotate(-24 20 20)" {...strokeProps} />
        </>
      )}

      {id === 'horizon' && (
        <>
          <Path d="M12.5 22a7.5 7.5 0 0 1 15 0" {...strokeProps} />
          <Path d="M7 22h26" {...strokeProps} />
          <Path d="M11 26.5h18" {...strokeProps} />
          <Path d="M15 30.5h10" {...strokeProps} />
        </>
      )}

      {id === 'diamond' && (
        <>
          <Polygon points="20,7.5 31,20 20,32.5 9,20" {...strokeProps} />
          <Polygon points="20,13.5 25.5,20 20,26.5 14.5,20" {...strokeProps} />
          <Path d="M20 7.5v6M20 26.5v6M9 20h5.5M25.5 20H31" {...strokeProps} />
        </>
      )}

      {id === 'leaf' && (
        <>
          <Path
            d="M20 8c7.5 4.2 10 11 7 18.5-2 4.8-7 5.5-7 5.5s-5-.7-7-5.5C10 19 12.5 12.2 20 8Z"
            {...strokeProps}
          />
          <Path d="M20 11v21" {...strokeProps} />
          <Path d="M20 18l4-2.5M20 18l-4-2.5M20 24l4.5-2.5M20 24l-4.5-2.5" {...strokeProps} />
        </>
      )}
    </Svg>
  )
}

/** Subtle machined watchmaker brass/crosshair guilloché mark for tile backs. */
function CardBackMark({
  size,
  ribColor,
  brassColor,
}: {
  size: number
  ribColor: string
  brassColor: string
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Path
        d="M20 9C13 9 8 13 8 20s5 11 12 11 12-4 12-11S27 9 20 9Z"
        fill="none"
        stroke={brassColor}
        strokeWidth={1.4}
      />
      <Path
        d="M18 10c-7 5-7 15 0 20m4-20c7 5 7 15 0 20M20 11v18"
        fill="none"
        stroke={ribColor}
        strokeWidth={1.2}
      />
      <Path
        d="M17 6h6m-6 27h6m-3 0v3M4 18l2 2-2 2m32-4-2 2 2 2"
        fill="none"
        stroke={brassColor}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={20} cy={37} r={1.4} fill={brassColor} />
    </Svg>
  )
}

/* --- Animated Lantern Tile ----------------------------------------------- */

function LanternTile({
  card,
  size,
  isFlipped,
  isFocused,
  sigilColor,
  reducedMotion,
  accessibilityLabel,
  onPress,
}: {
  card: LanternCard
  size: number
  isFlipped: boolean
  isFocused: boolean
  sigilColor: string
  reducedMotion: boolean
  accessibilityLabel: string
  onPress: () => void
}) {
  const { color } = useTokenColors()
  const flipAnim = useRef(new Animated.Value(isFlipped ? 1 : 0)).current

  useEffect(() => {
    const animation = Animated.timing(flipAnim, {
      toValue: isFlipped ? 1 : 0,
      duration: reducedMotion ? 140 : 240,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    })
    animation.start()
    return () => animation.stop()
  }, [isFlipped, reducedMotion, flipAnim])

  // Keep both faces upright. The opaque back stays behind the front through the handoff.
  const scaleX = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.1, 1],
  })
  const frontOpacity = reducedMotion
    ? flipAnim
    : flipAnim.interpolate({
        inputRange: [0, 0.4, 0.6, 1],
        outputRange: [0, 0, 1, 1],
      })

  const backMarkSize = Math.round(size * 0.48)
  const sigilSize = Math.round(size * 0.58)

  return (
    <Pressable
      onPress={onPress}
      disabled={card.matched}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isFlipped, disabled: card.matched }}
      style={({ pressed }) => [
        styles.tileSlot,
        {
          width: size,
          height: size,
          borderColor: isFocused ? color.ink2 : 'transparent',
          transform: [{ scale: pressed && !reducedMotion && !isFlipped ? 0.97 : 1 }],
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, !reducedMotion && { transform: [{ scaleX }] }]}
      >
        <View
          style={[
            styles.face,
            {
              backgroundColor: color.surface2,
              borderColor: color.lineStrong,
              borderCurve: 'continuous',
            },
          ]}
        >
          <CardBackMark size={backMarkSize} ribColor={color.ink4} brassColor={color.accentDim} />
        </View>

        <Animated.View
          style={[
            styles.face,
            {
              backgroundColor: card.matched ? color.surface1 : color.surface3,
              borderColor: card.matched ? color.accentDim : color.lineStrong,
              borderCurve: 'continuous',
              opacity: frontOpacity,
            },
          ]}
        >
          {card.matched && (
            <View style={[styles.matchedTick, { borderColor: color.accentDim }]} />
          )}
          <SigilMark
            id={card.sigil}
            size={sigilSize}
            color={sigilColor}
            opacity={card.matched ? 0.42 : 1}
          />
        </Animated.View>
      </Animated.View>
    </Pressable>
  )
}

export function LanternsScreen({ onExit }: GameScreenProps) {
  const { color, pieces } = useTokenColors()
  const calm = useCalm('lanterns')
  const { cue, haptic } = useFeedback()
  const reducedMotion = useReducedMotion()
  const { frameWidth, sideMargin, usableHeight, isCompact } = useResponsiveLayout()

  const [fallback] = useState<LanternsSave>(() => ({
    version: 1,
    state: createLanterns({ seed: Date.now() >>> 0, calm }),
    completed: 0,
  }))
  const [save, setSave] = useGameSave('lanterns', fallback, isValidSave)
  const state = save.state

  const [paused, setPaused] = useState(false)
  const [showCompletion, setShowCompletion] = useState(state.solved)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [stageDims, setStageDims] = useState<{ width: number; height: number } | null>(null)

  const stateRef = useRef(state)
  stateRef.current = state
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const calmRef = useRef(calm)
  calmRef.current = calm

  const mismatchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (mismatchTimerRef.current) clearTimeout(mismatchTimerRef.current)
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    }
  }, [])

  // Auto-close a revealed mismatch after ~850ms (cancelled immediately on 3rd tap).
  useEffect(() => {
    if (mismatchTimerRef.current) clearTimeout(mismatchTimerRef.current)
    if (!state.mismatchPair || paused) return

    mismatchTimerRef.current = setTimeout(() => {
      const prev = stateRef.current
      const resolved = resolveMismatch(prev)
      if (resolved === prev) return
      stateRef.current = resolved
      setSave((cur) => {
        const valid = isValidSave(cur) ? cur : fallback
        return {
          version: 1,
          state: resolved,
          completed: valid.completed,
        }
      })
    }, MISMATCH_DELAY_MS)

    return () => {
      if (mismatchTimerRef.current) clearTimeout(mismatchTimerRef.current)
    }
  }, [state.mismatchPair, paused, setSave, fallback])

  const handleFlip = useCallback(
    (index: number) => {
      if (pausedRef.current) return
      const prev = stateRef.current
      const next = flipCard(prev, index)
      if (next === prev) return

      if (mismatchTimerRef.current) clearTimeout(mismatchTimerRef.current)
      stateRef.current = next
      setSave((cur) => {
        const valid = isValidSave(cur) ? cur : fallback
        return {
          version: 1,
          state: next,
          completed: next.solved && !prev.solved ? valid.completed + 1 : valid.completed,
        }
      })

      if (next.solved) {
        cue('chime', 0.95)
        haptic('complete')
        if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
        completionTimerRef.current = setTimeout(() => {
          setShowCompletion(true)
        }, COMPLETION_DELAY_MS)
      } else if (next.matchedPairs > prev.matchedPairs) {
        cue('clear', 0.85)
        haptic('reward')
      } else if (next.mismatchPair !== null) {
        cue('place', 0.5)
        haptic('settle')
      } else {
        cue('tap', 0.55)
        haptic('tick')
      }
    },
    [cue, haptic, setSave, fallback],
  )

  const handleRestart = useCallback(() => {
    if (mismatchTimerRef.current) clearTimeout(mismatchTimerRef.current)
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    setShowCompletion(false)
    setFocusedIndex(null)
    const fresh = createLanterns({
      seed: Date.now() >>> 0,
      calm: calmRef.current,
      puzzleNumber: stateRef.current.puzzleNumber,
    })
    stateRef.current = fresh
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: fresh,
        completed: valid.completed,
      }
    })
    cue('tap', 0.55)
    haptic('tick')
  }, [cue, haptic, setSave, fallback])

  const handleNext = useCallback(() => {
    if (mismatchTimerRef.current) clearTimeout(mismatchTimerRef.current)
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    setShowCompletion(false)
    setFocusedIndex(null)
    const next = nextPuzzle(stateRef.current, calmRef.current)
    stateRef.current = next
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: next,
        completed: valid.completed,
      }
    })
    cue('tap', 0.55)
    haptic('tick')
  }, [cue, haptic, setSave, fallback])

  const moveFocus = useCallback((dCol: number, dRow: number) => {
    setFocusedIndex((prev) => {
      const cur = stateRef.current
      if (prev === null) {
        const firstOpen = cur.cards.findIndex((c) => !c.matched)
        return firstOpen >= 0 ? firstOpen : 0
      }
      const col = Math.min(cur.cols - 1, Math.max(0, (prev % cur.cols) + dCol))
      const row = Math.min(cur.rows - 1, Math.max(0, Math.floor(prev / cur.cols) + dRow))
      return row * cur.cols + col
    })
  }, [])

  useKeys(
    {
      ArrowLeft: () => moveFocus(-1, 0),
      a: () => moveFocus(-1, 0),
      A: () => moveFocus(-1, 0),
      ArrowRight: () => moveFocus(1, 0),
      d: () => moveFocus(1, 0),
      D: () => moveFocus(1, 0),
      ArrowUp: () => moveFocus(0, -1),
      w: () => moveFocus(0, -1),
      W: () => moveFocus(0, -1),
      ArrowDown: () => moveFocus(0, 1),
      s: () => moveFocus(0, 1),
      S: () => moveFocus(0, 1),
      Enter: () => {
        if (focusedIndex !== null) handleFlip(focusedIndex)
      },
      ' ': () => {
        if (focusedIndex !== null) handleFlip(focusedIndex)
      },
      Escape: () => setPaused(true),
      p: () => setPaused(true),
      P: () => setPaused(true),
    },
    !paused && !showCompletion,
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

  const onStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width > 0 && height > 0) {
      setStageDims((prev) =>
        prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
          ? prev
          : { width, height },
      )
    }
  }, [])

  const gap = isCompact ? 8 : 10
  const stageWidth = stageDims?.width ?? frameWidth - sideMargin * 2
  const stageHeight = stageDims?.height ?? usableHeight - 166
  const tileWidth = (Math.min(stageWidth, BOARD_MAX_WIDTH) - gap * (state.cols - 1)) / state.cols
  const tileHeight = (stageHeight - gap * (state.rows - 1)) / state.rows
  const tileSize = Math.max(0, Math.floor(Math.min(tileWidth, tileHeight)))

  const rows: LanternCard[][] = []
  for (let r = 0; r < state.rows; r++) {
    rows.push(state.cards.slice(r * state.cols, (r + 1) * state.cols))
  }

  return (
    <GameShell
      gameId="lanterns"
      score={state.moves}
      commitScore={state.solved}
      stats={[
        { label: 'Pairs', value: `${state.matchedPairs}/${state.totalPairs}` },
        { label: 'Moves', value: state.moves },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={handleRestart}
      onExit={onExit}
      controls={
        <View style={styles.progressWrap}>
          <View
            style={styles.pipsRow}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {Array.from({ length: state.totalPairs }, (_, i) => {
              const filled = i < state.matchedPairs
              return (
                <View
                  key={i}
                  style={[
                    styles.pip,
                    {
                      backgroundColor: filled ? color.accent : color.surface2,
                      borderColor: filled ? color.accent : color.lineStrong,
                    },
                  ]}
                />
              )
            })}
          </View>
          <GameControlBar>
            <GameActionButton label="New board" onPress={handleNext} />
          </GameControlBar>
        </View>
      }
    >
      <View style={styles.stage} onLayout={onStageLayout}>
        <View
          key={`${state.puzzleNumber}-${state.rngState}`}
          accessibilityLabel={`Lanterns ${state.cols} by ${state.rows} memory board, ${state.matchedPairs} of ${state.totalPairs} pairs found`}
          style={[styles.board, { gap }]}
        >
          {rows.map((rowCards, rowIndex) => (
            <View key={rowIndex} style={[styles.row, { gap }]}>
              {rowCards.map((card, colIndex) => {
                const index = rowIndex * state.cols + colIndex
                const isFlipped = card.flipped || card.matched
                const isFocused = focusedIndex === index
                const ariaLabel = card.matched
                  ? `Row ${rowIndex + 1} column ${colIndex + 1}, ${sigilLabel(card.sigil)}, matched`
                  : isFlipped
                    ? `Row ${rowIndex + 1} column ${colIndex + 1}, ${sigilLabel(card.sigil)}`
                    : `Row ${rowIndex + 1} column ${colIndex + 1}, face down`

                return (
                  <LanternTile
                    key={card.id}
                    card={card}
                    size={tileSize}
                    isFlipped={isFlipped}
                    isFocused={isFocused}
                    sigilColor={pieces[card.tone]}
                    reducedMotion={reducedMotion}
                    accessibilityLabel={ariaLabel}
                    onPress={() => {
                      setFocusedIndex(null)
                      handleFlip(index)
                    }}
                  />
                )
              })}
            </View>
          ))}
        </View>
      </View>

      <Completion
        open={showCompletion}
        gameId="lanterns"
        title="All paired"
        line={`${state.moves} ${state.moves === 1 ? 'move' : 'moves'}`}
        actionLabel="Next"
        onAction={handleNext}
      />
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tileSlot: {
    position: 'relative',
    borderRadius: 11,
    borderWidth: 1.5,
  },
  face: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchedTick: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 6,
    height: 6,
    borderTopWidth: 1,
    borderRightWidth: 1,
  },
  progressWrap: {
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pip: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
})
