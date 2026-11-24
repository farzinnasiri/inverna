import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  PanResponder,
  PixelRatio,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import {
  FOUNDATION_COUNT,
  SUITS,
  TABLEAU_COLUMNS,
  canAutoComplete,
  canMove,
  cardColor,
  countFoundationCards,
  drawStock,
  findSmartTarget,
  getLegalTargets,
  isValidPatienceState,
  moveCards,
  newDeal,
  rankLabel,
  restartDeal,
  smartMove,
  stepAutoComplete,
  undoPatience,
  type Card,
  type MoveSource,
  type MoveTarget,
  type PatienceState,
  type Suit,
} from '@/core/games/patience/engine'
import { lerpHexOklab } from '@/design/tokens'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Completion, GameActionButton, GameControlBar, GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { GlassSurface } from '@/ui/rn/Glass'
import { useCalm, useFeedback, useGameSave, useKeys, useReducedMotion, useResponsiveLayout } from '@/ui/rn/hooks'

interface PatienceSave {
  version: 1
  state: PatienceState
  won: number
}

interface DragSession {
  source: MoveSource
  cards: readonly Card[]
  originX: number
  originY: number
  offsets: readonly number[]
  legalTargets: readonly MoveTarget[]
  hoverTarget: MoveTarget | null
}

type HintSuggestion =
  | { readonly kind: 'move'; readonly source: MoveSource; readonly target: MoveTarget }
  | { readonly kind: 'stock' }

const BOARD_MAX_WIDTH = 408
const TOP_ROW_GAP = 12
const BOARD_PADDING_TOP = 2
const DRAG_THRESHOLD = 6
const AUTO_COMPLETE_MS = 110
const COMPLETION_DELAY_MS = 520
const HINT_DURATION_MS = 2400

const OXBLOOD_BASE = '#D78389'
const WARM_OXBLOOD_TARGET = '#D19168'

const HOW_TO = [
  'Build the four foundations up by suit from Ace to King.',
  'Stack tableau cards in descending order with alternating colours. Tap any card to send it home, or drag to place it yourself.',
] as const

function isValidSave(value: unknown): value is PatienceSave {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<PatienceSave>
  return v.version === 1 && typeof v.won === 'number' && isValidPatienceState(v.state)
}

function sameSource(a: MoveSource | null, b: MoveSource): boolean {
  if (!a || a.pile !== b.pile) return false
  if (a.pile === 'waste' && b.pile === 'waste') return true
  if (a.pile === 'foundation' && b.pile === 'foundation') return a.index === b.index
  if (a.pile === 'tableau' && b.pile === 'tableau') {
    return a.col === b.col && a.cardIndex === b.cardIndex
  }
  return false
}

function sameTarget(a: MoveTarget | null, b: MoveTarget): boolean {
  if (!a || a.pile !== b.pile) return false
  if (a.pile === 'foundation' && b.pile === 'foundation') return a.index === b.index
  if (a.pile === 'tableau' && b.pile === 'tableau') return a.col === b.col
  return false
}

function isCardInSource(source: MoveSource | null, col: number, cardIndex: number): boolean {
  if (!source || source.pile !== 'tableau') return false
  return source.col === col && cardIndex >= source.cardIndex
}

/**
 * Compute vertical Y offsets for a tableau column so even deep stacks
 * stay legible and never clip off the bottom of mobile screens.
 */
function computeColumnOffsets(
  column: readonly Card[],
  availableHeight: number,
  cardHeight: number,
): number[] {
  const idealDown = Math.max(5, Math.round(cardHeight * 0.11))
  const idealUp = Math.max(19, Math.round(cardHeight * 0.34))

  if (column.length <= 1) {
    return column.length === 1 ? [0] : []
  }

  let downCount = 0
  let upCount = 0
  for (let i = 0; i < column.length - 1; i++) {
    if (column[i]!.faceUp) upCount++
    else downCount++
  }

  const maxStackSpan = Math.max(0, availableHeight - cardHeight)
  const idealSpan = downCount * idealDown + upCount * idealUp

  let downStep = idealDown
  let upStep = idealUp

  if (idealSpan > maxStackSpan && idealSpan > 0) {
    const ratio = maxStackSpan / idealSpan
    downStep = Math.max(3, Math.floor(idealDown * ratio))
    upStep = Math.max(11, Math.floor(idealUp * ratio))

    // If still slightly exceeding (extreme deep column on compact phone), compress further cleanly.
    const compressedSpan = downCount * downStep + upCount * upStep
    if (compressedSpan > maxStackSpan && compressedSpan > 0) {
      const fineRatio = maxStackSpan / compressedSpan
      downStep *= fineRatio
      upStep *= fineRatio
    }
  }

  const offsets: number[] = [0]
  let y = 0
  for (let i = 0; i < column.length - 1; i++) {
    y += column[i]!.faceUp ? upStep : downStep
    offsets.push(Math.round(y))
  }
  return offsets
}

/** Pure hint finder: prioritizes foundations, revealing hidden cards, waste plays, then useful stack moves. */
function findHint(state: PatienceState): HintSuggestion | null {
  if (state.solved) return null

  // 1. Any tableau top or waste top directly to a foundation.
  for (let col = 0; col < TABLEAU_COLUMNS; col++) {
    const column = state.tableau[col]!
    if (column.length === 0) continue
    const source: MoveSource = { pile: 'tableau', col, cardIndex: column.length - 1 }
    for (let f = 0; f < FOUNDATION_COUNT; f++) {
      const target: MoveTarget = { pile: 'foundation', index: f }
      if (canMove(state, source, target)) return { kind: 'move', source, target }
    }
  }
  if (state.waste.length > 0) {
    const source: MoveSource = { pile: 'waste' }
    for (let f = 0; f < FOUNDATION_COUNT; f++) {
      const target: MoveTarget = { pile: 'foundation', index: f }
      if (canMove(state, source, target)) return { kind: 'move', source, target }
    }
  }

  // 2. Tableau stack move that uncovers a face-down card.
  for (let col = 0; col < TABLEAU_COLUMNS; col++) {
    const column = state.tableau[col]!
    const firstUp = column.findIndex((c) => c.faceUp)
    if (firstUp <= 0) continue
    const source: MoveSource = { pile: 'tableau', col, cardIndex: firstUp }
    const target = findSmartTarget(state, source)
    if (target) return { kind: 'move', source, target }
  }

  // 3. Waste top card onto a tableau column.
  if (state.waste.length > 0) {
    const source: MoveSource = { pile: 'waste' }
    const target = findSmartTarget(state, source)
    if (target) return { kind: 'move', source, target }
  }

  // 4. Move a base face-up non-King stack onto another tableau column if a King can use the freed slot,
  //    or move a non-base King onto an empty column.
  const hasMovableKing =
    (state.waste.length > 0 && state.waste[state.waste.length - 1]!.rank === 13) ||
    state.tableau.some((col) => {
      const firstUp = col.findIndex((c) => c.faceUp)
      return firstUp > 0 && col[firstUp]!.rank === 13
    })

  for (let col = 0; col < TABLEAU_COLUMNS; col++) {
    const column = state.tableau[col]!
    if (column.length === 0) continue
    const firstUp = column.findIndex((c) => c.faceUp)
    if (firstUp < 0) continue
    const lead = column[firstUp]!
    const source: MoveSource = { pile: 'tableau', col, cardIndex: firstUp }
    const target = findSmartTarget(state, source)
    if (!target) continue
    if (firstUp === 0 && lead.rank !== 13 && !hasMovableKing) continue
    return { kind: 'move', source, target }
  }

  // 5. Draw or recycle stock.
  if (state.stock.length > 0 || state.waste.length > 0) {
    return { kind: 'stock' }
  }

  return null
}

/* --- Custom SVG Suit Pips (zero emoji, watchmaker crispness) ------------- */

function SuitPip({
  suit,
  size,
  color,
  outline = false,
  opacity = 1,
}: {
  suit: Suit
  size: number
  color: string
  outline?: boolean
  opacity?: number
}) {
  const fill = outline ? 'none' : color
  const stroke = outline ? color : 'none'
  const strokeWidth = outline ? 1.5 : 0

  switch (suit) {
    case 'spades':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" opacity={opacity}>
          <Path
            d="M12 2.4C9.1 6.2 4 9.7 4 13.9c0 2.6 2 4.4 4.3 4.4 1.4 0 2.5-.6 3.2-1.6-.2 1.8-.9 3.3-2.5 4.9h6c-1.6-1.6-2.3-3.1-2.5-4.9.7 1 1.8 1.6 3.2 1.6 2.3 0 4.3-1.8 4.3-4.4 0-4.2-5.1-7.7-8-11.5Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </Svg>
      )
    case 'hearts':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" opacity={opacity}>
          <Path
            d="M12 21.2C8.4 18 3.2 13.9 3.2 8.9 3.2 5.9 5.5 3.6 8.3 3.6c1.7 0 3 .9 3.7 2.2.7-1.3 2-2.2 3.7-2.2 2.8 0 5.1 2.3 5.1 5.3 0 5-5.2 9.1-8.8 12.3Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </Svg>
      )
    case 'diamonds':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" opacity={opacity}>
          <Path
            d="M12 2.2 19.6 12 12 21.8 4.4 12 12 2.2Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </Svg>
      )
    case 'clubs':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" opacity={opacity}>
          <Path
            d="M12 3a3.7 3.7 0 0 0-3.7 3.7c0 1.3.7 2.5 1.7 3.1a3.8 3.8 0 0 0-6.2 3c0 2.1 1.7 3.8 3.8 3.8 1.5 0 2.7-.8 3.4-2-.2 2.2-.9 4-2.4 5.9h6.8c-1.5-1.9-2.2-3.7-2.4-5.9.7 1.2 1.9 2 3.4 2 2.1 0 3.8-1.7 3.8-3.8a3.8 3.8 0 0 0-6.2-3c1-.6 1.7-1.8 1.7-3.1A3.7 3.7 0 0 0 12 3Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </Svg>
      )
  }
}

function RecycleIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M21 3v5h-5"
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Watchmaker hairline geometric card back (flat vector, zero gradients). */
function CardBackArt({
  width,
  height,
  frameColor,
  diamondColor,
  brassColor,
}: {
  width: number
  height: number
  frameColor: string
  diamondColor: string
  brassColor: string
}) {
  return (
    <Svg width={width} height={height} viewBox="0 0 50 70" preserveAspectRatio="none">
      <Rect
        x={4.5}
        y={4.5}
        width={41}
        height={61}
        rx={3}
        fill="none"
        stroke={frameColor}
        strokeWidth={0.9}
      />
      <Path d="M25 13 38 35 25 57 12 35 Z" fill="none" stroke={diamondColor} strokeWidth={0.9} />
      <Circle cx={25} cy={35} r={4.5} fill="none" stroke={brassColor} strokeWidth={0.9} />
      <Circle cx={25} cy={35} r={1.3} fill={brassColor} />
    </Svg>
  )
}

function CardFaceContent({
  card,
  cardWidth,
  inkColor,
  redColor,
  courtRingColor,
}: {
  card: Card
  cardWidth: number
  inkColor: string
  redColor: string
  courtRingColor: string
}) {
  const label = rankLabel(card.rank)
  const isAce = card.rank === 1
  const isCourt = card.rank >= 11
  const pipColor = cardColor(card.suit) === 'red' ? redColor : inkColor
  const compact = cardWidth < 50

  const rankFontSize = compact ? 13 : 15
  const smallPipSize = compact ? 12 : 13
  const largePipSize = isAce ? (compact ? 21 : 25) : compact ? 17 : 20
  const courtSize = compact ? 22 : 26
  const courtPipSize = compact ? 12 : 14

  return (
    <View style={styles.cardInner} pointerEvents="none">
      <View style={[styles.cardHead, compact && styles.cardHeadCompact]}>
        <Text
          style={[
            styles.cardRank,
            {
              color: pipColor,
              fontSize: rankFontSize,
              lineHeight: rankFontSize + 1,
            },
          ]}
          allowFontScaling={false}
          numberOfLines={1}
        >
          {label}
        </Text>
        <SuitPip suit={card.suit} size={smallPipSize} color={pipColor} />
      </View>

      <View style={styles.cardBody}>
        {isCourt ? (
          <View
            style={[
              styles.courtRing,
              {
                width: courtSize,
                height: courtSize,
                borderRadius: courtSize / 2,
                borderColor: courtRingColor,
              },
            ]}
          >
            <SuitPip suit={card.suit} size={courtPipSize} color={pipColor} opacity={0.92} />
          </View>
        ) : (
          <SuitPip
            suit={card.suit}
            size={largePipSize}
            color={pipColor}
            opacity={isAce ? 1 : 0.9}
          />
        )}
      </View>
    </View>
  )
}

/**
 * Interactive face-up card surface supporting both instant one-tap play
 * and smooth pointer/touch drag via PanResponder.
 */
function InteractiveCard({
  card,
  source,
  cards,
  originX,
  originY,
  topOffset,
  zIndex,
  cardWidth,
  cardHeight,
  radius,
  bgColor,
  borderColor,
  inkColor,
  redColor,
  courtRingColor,
  hidden,
  shaking,
  reducedMotion,
  disabled,
  accessibilityLabel,
  onTap,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  card: Card
  source: MoveSource
  cards: readonly Card[]
  originX: number
  originY: number
  topOffset: number
  zIndex: number
  cardWidth: number
  cardHeight: number
  radius: number
  bgColor: string
  borderColor: string
  inkColor: string
  redColor: string
  courtRingColor: string
  hidden: boolean
  shaking: boolean
  reducedMotion: boolean
  disabled: boolean
  accessibilityLabel: string
  onTap: (source: MoveSource, card: Card) => void
  onDragStart: (
    source: MoveSource,
    cards: readonly Card[],
    originX: number,
    originY: number,
    dx: number,
    dy: number,
  ) => void
  onDragMove: (dx: number, dy: number) => void
  onDragEnd: (dx: number, dy: number, cancelled: boolean) => void
}) {
  const shakeX = useRef(new Animated.Value(0)).current
  const draggingRef = useRef(false)
  const startPoint = useRef<{ x: number; y: number } | null>(null)
  const propsRef = useRef({
    card,
    source,
    cards,
    originX,
    originY,
    disabled,
    onTap,
    onDragStart,
    onDragMove,
    onDragEnd,
  })
  propsRef.current = {
    card,
    source,
    cards,
    originX,
    originY,
    disabled,
    onTap,
    onDragStart,
    onDragMove,
    onDragEnd,
  }

  useEffect(() => {
    if (!shaking || reducedMotion) {
      shakeX.setValue(0)
      return
    }
    const shake = Animated.sequence([
      Animated.timing(shakeX, { toValue: -3.5, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 3.5, duration: 75, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -2, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 55, useNativeDriver: true }),
    ])
    shake.start()
    return () => shake.stop()
  }, [shaking, reducedMotion, shakeX])

  const [panResponder] = useState(() => {
    const point = ({ nativeEvent }: GestureResponderEvent) => {
      const { pageX, pageY } = nativeEvent.changedTouches[0] ?? nativeEvent
      return { x: pageX, y: pageY }
    }

    const cancel = () => {
      startPoint.current = null
      if (!draggingRef.current) return
      draggingRef.current = false
      propsRef.current.onDragEnd(0, 0, true)
    }

    // Own the touch from its start so a quick move outside a narrow card still drags it.
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: () => !propsRef.current.disabled,
      onPanResponderGrant: (event) => {
        startPoint.current = point(event)
        draggingRef.current = false
      },
      onPanResponderStart: (event) => {
        if (event.nativeEvent.touches.length > 1) cancel()
      },
      onPanResponderMove: (event) => {
        const start = startPoint.current
        if (!start || propsRef.current.disabled) return
        const { x, y } = point(event)
        const dx = x - start.x
        const dy = y - start.y
        if (draggingRef.current) {
          propsRef.current.onDragMove(dx, dy)
        } else if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
          draggingRef.current = true
          const { source, cards, originX, originY, onDragStart } = propsRef.current
          onDragStart(source, cards, originX, originY, dx, dy)
        }
      },
      onPanResponderRelease: (event) => {
        const start = startPoint.current
        startPoint.current = null
        if (!start) return
        const { x, y } = point(event)
        const dx = x - start.x
        const dy = y - start.y
        if (draggingRef.current) {
          draggingRef.current = false
          propsRef.current.onDragEnd(dx, dy, false)
        } else if (!propsRef.current.disabled && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
          propsRef.current.onTap(propsRef.current.source, propsRef.current.card)
        }
      },
      onPanResponderTerminate: cancel,
    })
  })

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.cardBase,
        styles.cardStacked,
        {
          width: cardWidth,
          height: cardHeight,
          borderRadius: radius,
          backgroundColor: bgColor,
          borderColor,
          borderCurve: 'continuous',
          top: topOffset,
          zIndex,
          opacity: hidden ? 0 : 1,
          transform: [{ translateX: shakeX }],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled || hidden}
        style={styles.cardPressable}
        onPress={(event) => {
          // React Native Web can still dispatch a click after the responder handled the pointer.
          const { detail } = event.nativeEvent as { detail?: number }
          if (Platform.OS === 'web' && detail) return
          onTap(source, card)
        }}
      >
        <CardFaceContent
          card={card}
          cardWidth={cardWidth}
          inkColor={inkColor}
          redColor={redColor}
          courtRingColor={courtRingColor}
        />
      </Pressable>
    </Animated.View>
  )
}

export function PatienceScreen({ onExit }: GameScreenProps) {
  const { color, warmth } = useTokenColors()
  const calm = useCalm()
  const { cue, haptic } = useFeedback()
  const reducedMotion = useReducedMotion()
  const { frameWidth, sideMargin, usableHeight, isCompact } = useResponsiveLayout()

  const redSuitColor = useMemo(
    () => lerpHexOklab(OXBLOOD_BASE, WARM_OXBLOOD_TARGET, warmth * 0.2),
    [warmth],
  )

  const [fallback] = useState<PatienceSave>(() => ({
    version: 1,
    state: newDeal(Date.now() >>> 0, calm),
    won: 0,
  }))
  const [rawSave, setSave] = useGameSave<PatienceSave>('patience', fallback)
  const initialSave = isValidSave(rawSave) ? rawSave : fallback

  const [state, setState] = useState<PatienceState>(() => initialSave.state)
  const [paused, setPaused] = useState(false)
  const [selected, setSelected] = useState<MoveSource | null>(null)
  const [drag, setDrag] = useState<DragSession | null>(null)
  const [hint, setHint] = useState<HintSuggestion | null>(null)
  const [shakingId, setShakingId] = useState<string | null>(null)
  const [autoCompleting, setAutoCompleting] = useState(false)
  const [showCompletion, setShowCompletion] = useState(() => initialSave.state.solved)

  const [stageDims, setStageDims] = useState<{ width: number; height: number } | null>(null)
  const [dragPosition] = useState(() => new Animated.ValueXY())

  const stateRef = useRef(state)
  stateRef.current = state
  const dragRef = useRef<DragSession | null>(null)
  const stageDimsRef = useRef(stageDims)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current)
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    }
  }, [])

  const clearDrag = useCallback(() => {
    dragRef.current = null
    dragPosition.stopAnimation()
    setDrag(null)
  }, [dragPosition])

  const handlePauseChange = useCallback((next: boolean) => {
    if (next) clearDrag()
    setPaused(next)
  }, [clearDrag])

  const onStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    const prev = stageDimsRef.current
    if (prev?.width === width && prev.height === height) return
    const next = { width, height }
    stageDimsRef.current = next
    if (dragRef.current) clearDrag()
    setStageDims(next)
  }, [clearDrag])

  const boardWidth = Math.min(BOARD_MAX_WIDTH, stageDims?.width ?? frameWidth - sideMargin * 2)
  const stageHeight = stageDims?.height ?? usableHeight - 166
  const colGap = isCompact ? 4 : 5
  const cardRadius = isCompact ? 6 : 7
  const cardWidth = Math.max(0, Math.floor((boardWidth - colGap * (TABLEAU_COLUMNS - 1)) / TABLEAU_COLUMNS))
  const cardHeight = Math.round((cardWidth * 7) / 5)
  const actualBoardWidth = cardWidth * TABLEAU_COLUMNS + colGap * (TABLEAU_COLUMNS - 1)
  const tableauTopY = BOARD_PADDING_TOP + cardHeight + TOP_ROW_GAP
  const tableauHeight = Math.max(0, stageHeight - tableauTopY)
  const tableauOffsets = useMemo(
    () => state.tableau.map((column) => computeColumnOffsets(column, tableauHeight, cardHeight)),
    [state.tableau, tableauHeight, cardHeight],
  )

  const layoutRef = useRef({ cardWidth, cardHeight, colGap, tableauTopY, tableauOffsets })
  layoutRef.current = { cardWidth, cardHeight, colGap, tableauTopY, tableauOffsets }

  const clearHint = useCallback(() => {
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current)
      hintTimerRef.current = undefined
    }
    setHint(null)
  }, [])

  const persistState = useCallback(
    (next: PatienceState, justWon = false) => {
      setSave((prev) => ({
        version: 1,
        state: next,
        won: (isValidSave(prev) ? prev.won : 0) + (justWon ? 1 : 0),
      }))
    },
    [setSave],
  )

  const scheduleCompletion = useCallback(() => {
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    completionTimerRef.current = setTimeout(() => {
      setShowCompletion(true)
    }, COMPLETION_DELAY_MS)
  }, [])

  const triggerShake = useCallback((cardId: string) => {
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current)
    setShakingId(cardId)
    shakeTimerRef.current = setTimeout(() => {
      setShakingId(null)
    }, 280)
  }, [])

  const applyMoveResult = useCallback(
    (prev: PatienceState, next: PatienceState, targetPile: 'foundation' | 'tableau') => {
      if (next === prev) return false
      stateRef.current = next
      setState(next)
      setSelected(null)
      clearHint()

      const justSolved = !prev.solved && next.solved
      persistState(next, justSolved)

      if (justSolved) {
        setAutoCompleting(false)
        cue('chime', 0.9)
        haptic('success')
        scheduleCompletion()
      } else if (targetPile === 'foundation') {
        cue('clear', 0.8)
        haptic('medium')
      } else {
        cue('place', 0.72)
        haptic('light')
      }
      return true
    },
    [persistState, cue, haptic, scheduleCompletion, clearHint],
  )

  /* --- Auto-complete cascade ---------------------------------------------- */

  const autoCompletable = useMemo(() => canAutoComplete(state), [state])

  useEffect(() => {
    if (!autoCompleting || paused) return
    const timer = setInterval(() => {
      const prev = stateRef.current
      if (prev.solved) {
        setAutoCompleting(false)
        return
      }
      const next = stepAutoComplete(prev)
      if (next === prev) {
        setAutoCompleting(false)
        persistState(prev, false)
        return
      }
      stateRef.current = next
      setState(next)
      if (next.solved) {
        setAutoCompleting(false)
        persistState(next, true)
        cue('chime', 0.9)
        haptic('success')
        scheduleCompletion()
      } else {
        cue('place', 0.65)
        haptic('light')
      }
    }, AUTO_COMPLETE_MS)

    return () => clearInterval(timer)
  }, [autoCompleting, paused, persistState, cue, haptic, scheduleCompletion])

  /* --- Core actions ------------------------------------------------------- */

  const handleDrawStock = useCallback(() => {
    if (paused || autoCompleting || dragRef.current || stateRef.current.solved) return
    const prev = stateRef.current
    const wasRecycling = prev.stock.length === 0 && prev.waste.length > 0
    const next = drawStock(prev)
    if (next === prev) return
    setSelected(null)
    clearHint()
    stateRef.current = next
    setState(next)
    persistState(next)
    cue(wasRecycling ? 'place' : 'tap', wasRecycling ? 0.65 : 0.55)
    haptic('light')
  }, [paused, autoCompleting, persistState, cue, haptic, clearHint])

  const handleUndo = useCallback(() => {
    if (paused || autoCompleting || dragRef.current || stateRef.current.solved) return
    const prev = stateRef.current
    if (prev.history.length === 0) return
    const next = undoPatience(prev)
    setSelected(null)
    clearHint()
    stateRef.current = next
    setState(next)
    persistState(next)
    cue('undo', 0.7)
    haptic('light')
  }, [paused, autoCompleting, persistState, cue, haptic, clearHint])

  const handleHint = useCallback(() => {
    if (paused || autoCompleting || dragRef.current || stateRef.current.solved) return
    const suggestion = findHint(stateRef.current)
    setSelected(null)
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    if (!suggestion) {
      setHint(null)
      cue('tap', 0.25)
      return
    }
    setHint(suggestion)
    cue('tap', 0.52)
    haptic('light')
    hintTimerRef.current = setTimeout(() => {
      setHint(null)
    }, HINT_DURATION_MS)
  }, [paused, autoCompleting, cue, haptic])

  const handleRestartDeal = useCallback(() => {
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    clearHint()
    setAutoCompleting(false)
    setShowCompletion(false)
    setSelected(null)
    clearDrag()
    const next = restartDeal(stateRef.current)
    stateRef.current = next
    setState(next)
    persistState(next)
    cue('undo', 0.7)
    haptic('light')
  }, [persistState, cue, haptic, clearHint, clearDrag])

  const handleNewDeal = useCallback(() => {
    if (dragRef.current) return
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    clearHint()
    setAutoCompleting(false)
    setShowCompletion(false)
    setSelected(null)
    const nextSeed = ((Date.now() >>> 0) ^ (stateRef.current.seed * 1664525 + 1013904223)) >>> 0
    const next = newDeal(nextSeed, calm)
    stateRef.current = next
    setState(next)
    persistState(next)
    cue('tap', 0.65)
    haptic('light')
  }, [calm, persistState, cue, haptic, clearHint])

  const handleStartAutoComplete = useCallback(() => {
    if (paused || autoCompleting || dragRef.current || !canAutoComplete(stateRef.current)) return
    clearHint()
    setSelected(null)
    setAutoCompleting(true)
    cue('tap', 0.6)
    haptic('light')
  }, [paused, autoCompleting, cue, haptic, clearHint])

  useKeys(
    {
      ' ': handleDrawStock,
      Space: handleDrawStock,
      z: handleUndo,
      Z: handleUndo,
      h: handleHint,
      H: handleHint,
      Escape: () => {
        clearDrag()
        setSelected(null)
        clearHint()
      },
    },
    !paused && !state.solved && !autoCompleting,
    false,
  )

  /* --- Board-local hit-testing for drag-and-drop -------------------------- */

  const findDropTargetForDrag = useCallback(
    (session: DragSession, dx: number, dy: number): MoveTarget | null => {
      const { cardWidth: cw, cardHeight: ch, colGap: gap, tableauTopY: ty, tableauOffsets: offsets } =
        layoutRef.current
      const cardLeft = session.originX + dx
      const cardTop = session.originY + dy
      const cardRight = cardLeft + cw
      const cardBottom = cardTop + ch

      const padX = gap / 2
      const padY = 12
      let bestTarget: MoveTarget | null = null
      let bestArea = 0

      for (const target of session.legalTargets) {
        let left: number
        let top: number
        let right: number
        let bottom: number

        if (target.pile === 'foundation') {
          left = (3 + target.index) * (cw + gap)
          top = BOARD_PADDING_TOP
          right = left + cw
          bottom = top + ch
        } else {
          left = target.col * (cw + gap)
          top = ty
          right = left + cw
          bottom = top + (offsets[target.col]?.at(-1) ?? 0) + ch
        }

        const overlapW = Math.min(cardRight, right + padX) - Math.max(cardLeft, left - padX)
        const overlapH = Math.min(cardBottom, bottom + padY) - Math.max(cardTop, top - padY)
        if (overlapW > 0 && overlapH > 0) {
          const area = overlapW * overlapH
          if (area > bestArea) {
            bestArea = area
            bestTarget = target
          }
        }
      }

      return bestTarget
    },
    [],
  )

  /* --- Tap & Drag handlers ------------------------------------------------ */

  const handleCardTap = useCallback(
    (source: MoveSource, tappedCard: Card) => {
      if (paused || autoCompleting || dragRef.current || stateRef.current.solved) return
      const current = stateRef.current
      const prevSelected = selectedRef.current
      clearHint()

      // 1. If a card is already selected, check if tapping this pile is a valid destination for it.
      if (prevSelected && !sameSource(prevSelected, source)) {
        const destTarget: MoveTarget | null =
          source.pile === 'tableau'
            ? { pile: 'tableau', col: source.col }
            : source.pile === 'foundation'
              ? { pile: 'foundation', index: source.index }
              : null

        if (destTarget && canMove(current, prevSelected, destTarget)) {
          const next = moveCards(current, prevSelected, destTarget)
          applyMoveResult(current, next, destTarget.pile)
          return
        }
      }

      // 2. If tapping the already-selected card, try smartMove or deselect.
      if (prevSelected && sameSource(prevSelected, source)) {
        const target = findSmartTarget(current, source)
        if (target) {
          const next = moveCards(current, source, target)
          applyMoveResult(current, next, target.pile)
        } else {
          setSelected(null)
          cue('tap', 0.35)
        }
        return
      }

      // 3. Tapping a Foundation card selects it first (prevents accidental pull-downs).
      if (source.pile === 'foundation') {
        const legal = getLegalTargets(current, source)
        if (legal.length > 0) {
          setSelected(source)
          cue('tap', 0.48)
          haptic('light')
        } else {
          triggerShake(tappedCard.id)
          cue('tap', 0.28)
        }
        return
      }

      // 4. Instant effortless one-tap smartMove for waste & tableau cards.
      const smartTarget = findSmartTarget(current, source)
      if (smartTarget) {
        const next = smartMove(current, source)
        applyMoveResult(current, next, smartTarget.pile)
        return
      }

      // 5. Fallback: if another legal move exists, select it to show legal targets.
      const legal = getLegalTargets(current, source)
      if (legal.length > 0) {
        setSelected(source)
        cue('tap', 0.48)
        haptic('light')
      } else {
        setSelected(null)
        triggerShake(tappedCard.id)
        cue('tap', 0.25)
      }
    },
    [paused, autoCompleting, applyMoveResult, cue, haptic, triggerShake, clearHint],
  )

  const handleEmptySlotTap = useCallback(
    (target: MoveTarget) => {
      if (paused || autoCompleting || dragRef.current || stateRef.current.solved) return
      const prevSelected = selectedRef.current
      if (!prevSelected) return
      const current = stateRef.current
      if (canMove(current, prevSelected, target)) {
        const next = moveCards(current, prevSelected, target)
        applyMoveResult(current, next, target.pile)
      } else {
        setSelected(null)
        cue('tap', 0.3)
      }
    },
    [paused, autoCompleting, applyMoveResult, cue],
  )

  const handleDragStart = useCallback(
    (source: MoveSource, cards: readonly Card[], originX: number, originY: number, dx: number, dy: number) => {
      if (paused || autoCompleting || dragRef.current || stateRef.current.solved) return
      const offsets = source.pile === 'tableau'
        ? layoutRef.current.tableauOffsets[source.col]!.slice(source.cardIndex)
        : [0]
      const firstOffset = offsets[0] ?? 0
      const session: DragSession = {
        source,
        cards,
        originX,
        originY,
        offsets: offsets.map((offset) => offset - firstOffset),
        legalTargets: getLegalTargets(stateRef.current, source),
        hoverTarget: null,
      }
      session.hoverTarget = findDropTargetForDrag(session, dx, dy)
      dragPosition.setValue({ x: dx, y: dy })
      dragRef.current = session
      setDrag(session)
      clearHint()
      setSelected(null)
      cue('tap', 0.42)
      haptic('light')
    },
    [paused, autoCompleting, findDropTargetForDrag, dragPosition, clearHint, cue, haptic],
  )

  const handleDragMove = useCallback(
    (dx: number, dy: number) => {
      const session = dragRef.current
      if (!session) return
      dragPosition.setValue({ x: dx, y: dy })
      const hoverTarget = findDropTargetForDrag(session, dx, dy)
      if (hoverTarget === session.hoverTarget) return
      const updated = { ...session, hoverTarget }
      dragRef.current = updated
      setDrag(updated)
    },
    [dragPosition, findDropTargetForDrag],
  )

  const handleDragEnd = useCallback(
    (dx: number, dy: number, cancelled: boolean) => {
      const session = dragRef.current
      if (!session) return
      const target = cancelled ? null : findDropTargetForDrag(session, dx, dy)
      if (target) {
        const current = stateRef.current
        const next = moveCards(current, session.source, target)
        clearDrag()
        applyMoveResult(current, next, target.pile)
      } else if (cancelled || reducedMotion) {
        clearDrag()
      } else {
        dragPosition.setValue({ x: dx, y: dy })
        Animated.spring(dragPosition, {
          toValue: { x: 0, y: 0 },
          speed: 28,
          bounciness: 0,
          useNativeDriver: false,
        }).start(({ finished }) => {
          if (finished && dragRef.current === session) clearDrag()
        })
      }
    },
    [findDropTargetForDrag, clearDrag, applyMoveResult, reducedMotion, dragPosition],
  )

  /* --- Derived visual state ----------------------------------------------- */

  const foundationCount = useMemo(() => countFoundationCards(state), [state])
  const selectedTargets = useMemo(
    () => (selected ? getLegalTargets(state, selected) : []),
    [state, selected],
  )
  const legalTargets = drag?.legalTargets ?? selectedTargets

  const isTargetLegal = (target: MoveTarget) => legalTargets.some((t) => sameTarget(t, target))
  const isTargetHovered = (target: MoveTarget) => sameTarget(drag?.hoverTarget ?? null, target)
  const isHintTarget = (target: MoveTarget) =>
    hint?.kind === 'move' && sameTarget(hint.target, target)
  const isHintSource = (source: MoveSource) =>
    hint?.kind === 'move' && sameSource(hint.source, source)

  const wasteTop = state.waste.length > 0 ? state.waste[state.waste.length - 1]! : null
  const inputLocked = paused || autoCompleting || state.solved
  const controlsLocked = paused || autoCompleting
  const cardSize = { width: cardWidth, height: cardHeight }
  // Four pill borders and paddings plus three gaps use 160 points before text.
  const stackActions = boardWidth < 160 + 226 * PixelRatio.getFontScale()
  const autoCompleteAction = autoCompletable && !autoCompleting && (
    <GameActionButton
      label="Auto-complete"
      onPress={handleStartAutoComplete}
      disabled={controlsLocked}
      active
    />
  )

  return (
    <GameShell
      gameId="patience"
      score={state.moves}
      commitScore={state.solved}
      stats={[
        { label: 'Moves', value: state.moves },
        { label: 'Foundations', value: `${foundationCount}/52` },
      ]}
      paused={paused}
      onPauseChange={handlePauseChange}
      onRestart={handleRestartDeal}
      onExit={onExit}
      howTo={HOW_TO}
      controls={
        <View style={styles.controls}>
          {stackActions && autoCompleteAction && (
            <GameControlBar>{autoCompleteAction}</GameControlBar>
          )}
          <GameControlBar>
            <GameActionButton
              label="Undo"
              onPress={handleUndo}
              disabled={inputLocked || state.history.length === 0}
            />
            <GameActionButton
              label="Hint"
              onPress={handleHint}
              disabled={inputLocked}
              active={hint !== null}
            />
            {!stackActions && autoCompleteAction}
            <GameActionButton label="New deal" onPress={handleNewDeal} disabled={controlsLocked} />
          </GameControlBar>
        </View>
      }
    >
      <View style={styles.stage} onLayout={onStageLayout}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (selected) setSelected(null)
            if (hint) clearHint()
          }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />

        <View style={[styles.board, { width: actualBoardWidth }]}>
          {/* Top Row: Stock · Waste · Spacer · 4 Foundations */}
          <View style={[styles.topRow, { gap: colGap }]}>
            {/* Stock pile */}
            {state.stock.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Draw from stock, ${state.stock.length} remaining`}
                onPress={handleDrawStock}
                disabled={inputLocked}
                style={({ pressed }) => [
                  styles.cardBase,
                  {
                    ...cardSize,
                    borderRadius: cardRadius,
                    backgroundColor: color.surface1,
                    borderColor: hint?.kind === 'stock' ? color.accent : color.lineStrong,
                    borderCurve: 'continuous',
                    transform: [{ scale: pressed && !reducedMotion ? 0.97 : 1 }],
                  },
                ]}
              >
                <CardBackArt
                  width={cardWidth - 2}
                  height={cardHeight - 2}
                  frameColor={color.lineStrong}
                  diamondColor={color.ink4}
                  brassColor={color.accentDim}
                />
                <View style={styles.stockCountBadge} pointerEvents="none">
                  <Text style={[styles.stockCountText, { color: color.ink3 }]}>
                    {state.stock.length}
                  </Text>
                </View>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={state.waste.length > 0 ? 'Recycle waste to stock' : 'Empty stock'}
                disabled={state.waste.length === 0 || inputLocked}
                onPress={handleDrawStock}
                style={({ pressed }) => [
                  cardSize,
                  { transform: [{ scale: pressed && !reducedMotion ? 0.97 : 1 }] },
                ]}
              >
                <GlassSurface radius={cardRadius} accent={hint?.kind === 'stock'} style={styles.well}>
                  <RecycleIcon
                    size={17}
                    color={state.waste.length > 0 ? color.ink2 : color.ink4}
                  />
                </GlassSurface>
              </Pressable>
            )}

            {/* Waste pile */}
            <View style={cardSize}>
              {(!wasteTop || (drag?.source.pile === 'waste' && state.waste.length === 1)) && (
                <GlassSurface radius={cardRadius} style={styles.well}>
                  <View style={[styles.emptyDot, { backgroundColor: color.ink4 }]} />
                </GlassSurface>
              )}
              {drag && sameSource(drag.source, { pile: 'waste' }) && state.waste.length > 1 && (
                <View
                  style={[
                    styles.cardBase,
                    styles.cardStacked,
                    {
                      width: cardWidth,
                      height: cardHeight,
                      borderRadius: cardRadius,
                      backgroundColor: color.surface2,
                      borderColor: color.lineStrong,
                      borderCurve: 'continuous',
                    },
                  ]}
                  pointerEvents="none"
                >
                  <CardFaceContent
                    card={state.waste[state.waste.length - 2]!}
                    cardWidth={cardWidth}
                    inkColor={color.ink}
                    redColor={redSuitColor}
                    courtRingColor={color.lineStrong}
                  />
                </View>
              )}

              {wasteTop && (
                <InteractiveCard
                  card={wasteTop}
                  source={{ pile: 'waste' }}
                  cards={[wasteTop]}
                  originX={cardWidth + colGap}
                  originY={BOARD_PADDING_TOP}
                  topOffset={0}
                  zIndex={2}
                  cardWidth={cardWidth}
                  cardHeight={cardHeight}
                  radius={cardRadius}
                  bgColor={
                    sameSource(selected, { pile: 'waste' }) || isHintSource({ pile: 'waste' })
                      ? color.surface3
                      : color.surface2
                  }
                  borderColor={
                    sameSource(selected, { pile: 'waste' }) || isHintSource({ pile: 'waste' })
                      ? color.accent
                      : color.lineStrong
                  }
                  inkColor={color.ink}
                  redColor={redSuitColor}
                  courtRingColor={color.lineStrong}
                  hidden={Boolean(drag && sameSource(drag.source, { pile: 'waste' }))}
                  shaking={shakingId === wasteTop.id}
                  reducedMotion={reducedMotion}
                  disabled={inputLocked}
                  accessibilityLabel={`${rankLabel(wasteTop.rank)} of ${wasteTop.suit} in waste`}
                  onTap={handleCardTap}
                  onDragStart={handleDragStart}
                  onDragMove={handleDragMove}
                  onDragEnd={handleDragEnd}
                />
              )}
            </View>

            {/* Quiet spacer between Waste and Foundations */}
            <View style={{ width: cardWidth, height: cardHeight }} pointerEvents="none" />

            {/* 4 Foundations */}
            {state.foundations.map((pile, index) => {
              const suitHint = SUITS[index]!
              const topCard = pile.length > 0 ? pile[pile.length - 1]! : null
              const target: MoveTarget = { pile: 'foundation', index }
              const legal = isTargetLegal(target)
              const hovered = isTargetHovered(target)
              const hintedTarget = isHintTarget(target)
              const isSelected = sameSource(selected, { pile: 'foundation', index })
              const isDraggingSource = Boolean(
                drag && sameSource(drag.source, { pile: 'foundation', index }),
              )
              const underlyingCard =
                isDraggingSource && pile.length > 1 ? pile[pile.length - 2]! : null
              const isRedWatermark = suitHint === 'hearts' || suitHint === 'diamonds'

              return (
                <View key={suitHint} style={cardSize}>
                  {(!topCard || (isDraggingSource && !underlyingCard)) && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Foundation ${index + 1}, ${suitHint}`}
                      onPress={() => handleEmptySlotTap(target)}
                      disabled={inputLocked}
                      style={styles.wellTarget}
                    >
                      <GlassSurface
                        radius={cardRadius}
                        accent={hovered || hintedTarget || legal}
                        style={[styles.well, hovered && { backgroundColor: color.accentWash }]}
                      >
                        <SuitPip
                          suit={suitHint}
                          size={Math.max(16, Math.round(cardWidth * 0.4))}
                          color={isRedWatermark ? redSuitColor : color.ink4}
                          outline
                          opacity={isRedWatermark ? 0.5 : 0.72}
                        />
                      </GlassSurface>
                    </Pressable>
                  )}

                  {underlyingCard && (
                    <View
                      style={[
                        styles.cardBase,
                        styles.cardStacked,
                        {
                          width: cardWidth,
                          height: cardHeight,
                          borderRadius: cardRadius,
                          backgroundColor: color.surface2,
                          borderColor: color.lineStrong,
                          borderCurve: 'continuous',
                        },
                      ]}
                      pointerEvents="none"
                    >
                      <CardFaceContent
                        card={underlyingCard}
                        cardWidth={cardWidth}
                        inkColor={color.ink}
                        redColor={redSuitColor}
                        courtRingColor={color.lineStrong}
                      />
                    </View>
                  )}

                  {topCard && (
                    <InteractiveCard
                      card={topCard}
                      source={{ pile: 'foundation', index }}
                      cards={[topCard]}
                      originX={(3 + index) * (cardWidth + colGap)}
                      originY={BOARD_PADDING_TOP}
                      topOffset={0}
                      zIndex={2}
                      cardWidth={cardWidth}
                      cardHeight={cardHeight}
                      radius={cardRadius}
                      bgColor={isSelected || hovered ? color.surface3 : color.surface2}
                      borderColor={
                        isSelected || hovered || hintedTarget
                          ? color.accent
                          : legal || topCard.rank === 1
                            ? color.accentDim
                            : color.lineStrong
                      }
                      inkColor={color.ink}
                      redColor={redSuitColor}
                      courtRingColor={color.lineStrong}
                      hidden={isDraggingSource}
                      shaking={shakingId === topCard.id}
                      reducedMotion={reducedMotion}
                      disabled={inputLocked}
                      accessibilityLabel={`${rankLabel(topCard.rank)} of ${topCard.suit} on foundation`}
                      onTap={handleCardTap}
                      onDragStart={handleDragStart}
                      onDragMove={handleDragMove}
                      onDragEnd={handleDragEnd}
                    />
                  )}
                </View>
              )
            })}
          </View>

          {/* Tableau: 7 Columns */}
          <View style={[styles.tableau, { gap: colGap, height: tableauHeight }]}>
            {state.tableau.map((column, colIndex) => {
              const target: MoveTarget = { pile: 'tableau', col: colIndex }
              const legal = isTargetLegal(target)
              const hovered = isTargetHovered(target)
              const hintedTarget = isHintTarget(target)
              const offsets = tableauOffsets[colIndex]!
              const colX = colIndex * (cardWidth + colGap)

              const showWell =
                column.length === 0 || isCardInSource(drag?.source ?? null, colIndex, 0)

              return (
                <View
                  key={colIndex}
                  style={[styles.tableauCol, { width: cardWidth, height: tableauHeight }]}
                >
                  {showWell && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Column ${colIndex + 1} empty slot`}
                      onPress={() => handleEmptySlotTap(target)}
                      disabled={inputLocked}
                      style={cardSize}
                    >
                      <GlassSurface
                        radius={cardRadius}
                        accent={hovered || hintedTarget || legal}
                        style={[styles.well, hovered && { backgroundColor: color.accentWash }]}
                      >
                        <View style={[styles.emptyDot, { backgroundColor: color.ink4 }]} />
                      </GlassSurface>
                    </Pressable>
                  )}

                  {column.map((card, cardIndex) => {
                    const y = offsets[cardIndex] ?? 0
                    const isTop = cardIndex === column.length - 1
                    const source: MoveSource = { pile: 'tableau', col: colIndex, cardIndex }
                    const isSelected = isCardInSource(selected, colIndex, cardIndex)
                    const isHintedSrc =
                      hint?.kind === 'move' && isCardInSource(hint.source, colIndex, cardIndex)
                    const isDraggingSource = Boolean(
                      drag && isCardInSource(drag.source, colIndex, cardIndex),
                    )

                    if (!card.faceUp) {
                      return (
                        <View
                          key={card.id}
                          pointerEvents="none"
                          style={[
                            styles.cardBase,
                            styles.cardStacked,
                            {
                              width: cardWidth,
                              height: cardHeight,
                              borderRadius: cardRadius,
                              backgroundColor: color.surface1,
                              borderColor: color.lineStrong,
                              borderCurve: 'continuous',
                              zIndex: cardIndex + 1,
                              top: y,
                            },
                          ]}
                        >
                          <CardBackArt
                            width={cardWidth - 2}
                            height={cardHeight - 2}
                            frameColor={color.lineStrong}
                            diamondColor={color.ink4}
                            brassColor={color.accentDim}
                          />
                        </View>
                      )
                    }

                    const subStack = column.slice(cardIndex)
                    const cardBg =
                      isSelected || isHintedSrc || (isTop && hovered)
                        ? color.surface3
                        : color.surface2
                    const cardBorder =
                      isSelected || isHintedSrc || (isTop && (hovered || hintedTarget))
                        ? color.accent
                        : isTop && legal
                          ? color.accentDim
                          : color.lineStrong

                    return (
                      <InteractiveCard
                        key={card.id}
                        card={card}
                        source={source}
                        cards={subStack}
                        originX={colX}
                        originY={tableauTopY + y}
                        topOffset={y}
                        zIndex={cardIndex + 1}
                        cardWidth={cardWidth}
                        cardHeight={cardHeight}
                        radius={cardRadius}
                        bgColor={cardBg}
                        borderColor={cardBorder}
                        inkColor={color.ink}
                        redColor={redSuitColor}
                        courtRingColor={color.lineStrong}
                        hidden={isDraggingSource}
                        shaking={shakingId === card.id}
                        reducedMotion={reducedMotion}
                        disabled={inputLocked}
                        accessibilityLabel={`${rankLabel(card.rank)} of ${card.suit}`}
                        onTap={handleCardTap}
                        onDragStart={handleDragStart}
                        onDragMove={handleDragMove}
                        onDragEnd={handleDragEnd}
                      />
                    )
                  })}
                </View>
              )
            })}
          </View>

          {/* Floating drag stack overlay */}
          {drag && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.dragLayer,
                {
                  width: cardWidth,
                  left: drag.originX,
                  top: drag.originY,
                  transform: dragPosition.getTranslateTransform(),
                },
              ]}
            >
              {drag.cards.map((card, i) => (
                <View
                  key={card.id}
                  style={[
                    styles.cardBase,
                    styles.cardStacked,
                    {
                      width: cardWidth,
                      height: cardHeight,
                      borderRadius: cardRadius,
                      backgroundColor: color.surface3,
                      borderColor: color.accent,
                      zIndex: i + 1,
                      top: drag.offsets[i],
                      borderCurve: 'continuous',
                    },
                  ]}
                >
                  <CardFaceContent
                    card={card}
                    cardWidth={cardWidth}
                    inkColor={color.ink}
                    redColor={redSuitColor}
                    courtRingColor={color.lineStrong}
                  />
                </View>
              ))}
            </Animated.View>
          )}
        </View>
      </View>

      <Completion
        open={showCompletion}
        gameId="patience"
        title="Ordered"
        line={`${state.moves} ${state.moves === 1 ? 'move' : 'moves'}`}
        actionLabel="New deal"
        onAction={handleNewDeal}
      />
    </GameShell>
  )
}

const styles = StyleSheet.create({
  controls: {
    gap: 8,
  },
  stage: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  board: {
    flex: 1,
    paddingTop: BOARD_PADDING_TOP,
    gap: TOP_ROW_GAP,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tableau: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tableauCol: {
    position: 'relative',
  },
  wellTarget: {
    flex: 1,
  },
  well: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.55,
  },
  cardBase: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardStacked: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  cardInner: {
    flex: 1,
    justifyContent: 'space-between',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
    paddingTop: 2,
    paddingHorizontal: 4,
  },
  cardHeadCompact: {
    paddingHorizontal: 3,
  },
  cardRank: {
    fontWeight: '700',
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
  },
  cardBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 4,
  },
  courtRing: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockCountBadge: {
    position: 'absolute',
    bottom: 3,
    right: 4,
  },
  stockCountText: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 11,
    fontVariant: ['tabular-nums'],
  },
  dragLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 120,
  },
  cardPressable: {
    flex: 1,
    ...Platform.select({ web: { touchAction: 'none', userSelect: 'none' } }),
  },
})
