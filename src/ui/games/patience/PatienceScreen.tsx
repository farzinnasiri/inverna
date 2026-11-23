import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { RotateCw, Undo2 } from 'lucide-react'
import {
  SUITS,
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
import { Completion, GameShell, type GameScreenProps } from '@/ui/components/GameShell'
import { Button, IconButton } from '@/ui/components/controls'
import { useCalm, useFeedback, useGameSave, useKeys } from '@/ui/hooks/game'
import './patience.css'

interface PatienceSave {
  version: 1
  state: PatienceState
  won: number
}

interface DragSession {
  pointerId: number
  source: MoveSource
  cards: readonly Card[]
  startX: number
  startY: number
  currentX: number
  currentY: number
  originLeft: number
  originTop: number
  cardWidth: number
  cardHeight: number
  dragging: boolean
  hoverTarget: MoveTarget | null
}

const DRAG_THRESHOLD_PX = 6
const FACE_DOWN_STEP_BASE = 7
const FACE_UP_STEP_BASE = 24
const FACE_DOWN_STEP_MIN = 5
const FACE_UP_STEP_MIN = 17
const AUTO_COMPLETE_MS = 110
const COMPLETION_DELAY_MS = 520

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

/** Compute vertical Y offsets for a tableau column so stacks stay legible and never overflow. */
function computeColumnOffsets(
  column: readonly Card[],
  availableHeight: number,
  cardHeight: number,
): { offsets: number[]; faceUpStep: number } {
  if (column.length <= 1) {
    return { offsets: column.length === 1 ? [0] : [], faceUpStep: FACE_UP_STEP_BASE }
  }

  let downCount = 0
  let upCount = 0
  for (let i = 0; i < column.length - 1; i++) {
    if (column[i]!.faceUp) upCount++
    else downCount++
  }

  const maxStackSpan = Math.max(120, availableHeight - cardHeight - 4)
  const idealSpan = downCount * FACE_DOWN_STEP_BASE + upCount * FACE_UP_STEP_BASE

  let downStep = FACE_DOWN_STEP_BASE
  let upStep = FACE_UP_STEP_BASE

  if (idealSpan > maxStackSpan && idealSpan > 0) {
    const ratio = maxStackSpan / idealSpan
    downStep = Math.max(FACE_DOWN_STEP_MIN, Math.floor(FACE_DOWN_STEP_BASE * ratio))
    upStep = Math.max(FACE_UP_STEP_MIN, Math.floor(FACE_UP_STEP_BASE * ratio))
  }

  const offsets: number[] = [0]
  let y = 0
  for (let i = 0; i < column.length - 1; i++) {
    y += column[i]!.faceUp ? upStep : downStep
    offsets.push(y)
  }
  return { offsets, faceUpStep: upStep }
}

/* --- Custom SVG Suit Pips (zero emoji, watchmaker crispness) ------------- */

function SuitPip({
  suit,
  className,
  outline = false,
}: {
  suit: Suit
  className?: string
  outline?: boolean
}) {
  const fill = outline ? 'none' : 'currentColor'
  const stroke = outline ? 'currentColor' : 'none'
  const strokeWidth = outline ? 1.5 : 0

  switch (suit) {
    case 'spades':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2.4C9.1 6.2 4 9.7 4 13.9c0 2.6 2 4.4 4.3 4.4 1.4 0 2.5-.6 3.2-1.6-.2 1.8-.9 3.3-2.5 4.9h6c-1.6-1.6-2.3-3.1-2.5-4.9.7 1 1.8 1.6 3.2 1.6 2.3 0 4.3-1.8 4.3-4.4 0-4.2-5.1-7.7-8-11.5Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'hearts':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 21.2C8.4 18 3.2 13.9 3.2 8.9 3.2 5.9 5.5 3.6 8.3 3.6c1.7 0 3 .9 3.7 2.2.7-1.3 2-2.2 3.7-2.2 2.8 0 5.1 2.3 5.1 5.3 0 5-5.2 9.1-8.8 12.3Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'diamonds':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2.2 19.6 12 12 21.8 4.4 12 12 2.2Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'clubs':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3a3.7 3.7 0 0 0-3.7 3.7c0 1.3.7 2.5 1.7 3.1a3.8 3.8 0 0 0-6.2 3c0 2.1 1.7 3.8 3.8 3.8 1.5 0 2.7-.8 3.4-2-.2 2.2-.9 4-2.4 5.9h6.8c-1.5-1.9-2.2-3.7-2.4-5.9.7 1.2 1.9 2 3.4 2 2.1 0 3.8-1.7 3.8-3.8a3.8 3.8 0 0 0-6.2-3c1-.6 1.7-1.8 1.7-3.1A3.7 3.7 0 0 0 12 3Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      )
  }
}

/** Watchmaker hairline geometric card back (flat vector, zero gradients). */
function CardBackArt() {
  return (
    <svg className="patience-back-svg" viewBox="0 0 50 70" preserveAspectRatio="none" aria-hidden="true">
      <rect
        x="4.5"
        y="4.5"
        width="41"
        height="61"
        rx="3"
        fill="none"
        stroke="var(--c-line-strong)"
        strokeWidth="0.9"
      />
      <path
        d="M25 13 38 35 25 57 12 35 Z"
        fill="none"
        stroke="var(--c-ink-4)"
        strokeWidth="0.9"
      />
      <circle cx="25" cy="35" r="4.5" fill="none" stroke="var(--c-accent-dim)" strokeWidth="0.9" />
      <circle cx="25" cy="35" r="1.3" fill="var(--c-accent-dim)" />
    </svg>
  )
}

function CardFaceContent({ card }: { card: Card }) {
  const label = rankLabel(card.rank)
  const isTen = card.rank === 10
  const isAce = card.rank === 1
  const isCourt = card.rank >= 11

  return (
    <>
      <div className="patience-card__head">
        <span className={`patience-card__rank num ${isTen ? 'patience-card__rank--ten' : ''}`}>{label}</span>
        <SuitPip suit={card.suit} className="patience-card__pip-sm" />
      </div>
      <div className="patience-card__body" aria-hidden="true">
        {isCourt ? (
          <span className="patience-card__court">
            <SuitPip suit={card.suit} className="patience-card__pip-lg" />
          </span>
        ) : (
          <SuitPip
            suit={card.suit}
            className={`patience-card__pip-lg ${isAce ? 'patience-card__pip-lg--ace' : ''}`}
          />
        )}
      </div>
    </>
  )
}

export default function PatienceScreen({ onExit }: GameScreenProps) {
  const calm = useCalm()
  const { cue, haptic } = useFeedback()

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
  const [shakingId, setShakingId] = useState<string | null>(null)
  const [autoCompleting, setAutoCompleting] = useState(false)
  const [showCompletion, setShowCompletion] = useState(() => initialSave.state.solved)

  // Measured tableau dimensions for dynamic overlap compression.
  const tableauRef = useRef<HTMLDivElement>(null)
  const [tableauDims, setTableauDims] = useState({ height: 480, colWidth: 48 })

  const stateRef = useRef(state)
  stateRef.current = state
  const dragRef = useRef(drag)
  dragRef.current = drag
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  const completionTimerRef = useRef<number | undefined>(undefined)
  const shakeTimerRef = useRef<number | undefined>(undefined)

  useLayoutEffect(() => {
    const el = tableauRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        const colWidth = (rect.width - 6 * 4) / 7
        setTableauDims({ height: rect.height, colWidth })
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      window.clearTimeout(completionTimerRef.current)
      window.clearTimeout(shakeTimerRef.current)
    }
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
    window.clearTimeout(completionTimerRef.current)
    completionTimerRef.current = window.setTimeout(() => {
      setShowCompletion(true)
    }, COMPLETION_DELAY_MS)
  }, [])

  const triggerShake = useCallback((cardId: string) => {
    window.clearTimeout(shakeTimerRef.current)
    setShakingId(cardId)
    shakeTimerRef.current = window.setTimeout(() => {
      setShakingId(null)
    }, 280)
  }, [])

  const applyMoveResult = useCallback(
    (prev: PatienceState, next: PatienceState, targetPile: 'foundation' | 'tableau') => {
      if (next === prev) return false
      stateRef.current = next
      setState(next)
      setSelected(null)

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
    [persistState, cue, haptic, scheduleCompletion],
  )

  /* --- Auto-complete cascade ---------------------------------------------- */

  const autoCompletable = useMemo(() => canAutoComplete(state), [state])

  useEffect(() => {
    if (!autoCompleting || paused) return
    const timer = window.setInterval(() => {
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

    return () => window.clearInterval(timer)
  }, [autoCompleting, paused, persistState, cue, haptic, scheduleCompletion])

  /* --- Core actions ------------------------------------------------------- */

  const handleDrawStock = useCallback(() => {
    if (paused || autoCompleting || stateRef.current.solved) return
    const prev = stateRef.current
    const wasRecycling = prev.stock.length === 0 && prev.waste.length > 0
    const next = drawStock(prev)
    if (next === prev) return
    setSelected(null)
    stateRef.current = next
    setState(next)
    persistState(next)
    cue(wasRecycling ? 'place' : 'tap', wasRecycling ? 0.65 : 0.55)
    haptic('light')
  }, [paused, autoCompleting, persistState, cue, haptic])

  const handleUndo = useCallback(() => {
    if (paused || autoCompleting || stateRef.current.solved) return
    const prev = stateRef.current
    if (prev.history.length === 0) return
    const next = undoPatience(prev)
    setSelected(null)
    stateRef.current = next
    setState(next)
    persistState(next)
    cue('undo', 0.7)
    haptic('light')
  }, [paused, autoCompleting, persistState, cue, haptic])

  const handleRestartDeal = useCallback(() => {
    window.clearTimeout(completionTimerRef.current)
    setAutoCompleting(false)
    setShowCompletion(false)
    setSelected(null)
    setDrag(null)
    const next = restartDeal(stateRef.current)
    stateRef.current = next
    setState(next)
    persistState(next)
    cue('undo', 0.7)
    haptic('light')
  }, [persistState, cue, haptic])

  const handleNewDeal = useCallback(() => {
    window.clearTimeout(completionTimerRef.current)
    setAutoCompleting(false)
    setShowCompletion(false)
    setSelected(null)
    setDrag(null)
    const nextSeed = ((Date.now() >>> 0) ^ (stateRef.current.seed * 1664525 + 1013904223)) >>> 0
    const next = newDeal(nextSeed, calm)
    stateRef.current = next
    setState(next)
    persistState(next)
    cue('tap', 0.65)
    haptic('light')
  }, [calm, persistState, cue, haptic])

  const handleStartAutoComplete = useCallback(() => {
    if (paused || autoCompleting || !canAutoComplete(stateRef.current)) return
    setSelected(null)
    setDrag(null)
    setAutoCompleting(true)
    cue('tap', 0.6)
    haptic('light')
  }, [paused, autoCompleting, cue, haptic])

  useKeys(
    {
      ' ': handleDrawStock,
      Space: handleDrawStock,
      z: handleUndo,
      Z: handleUndo,
      Escape: () => setSelected(null),
    },
    !paused && !state.solved && !autoCompleting,
    false,
  )

  /* --- Drop target hit-testing for pointer drag --------------------------- */

  const findDropTargetForDrag = useCallback(
    (session: DragSession, x: number, y: number): MoveTarget | null => {
      const current = stateRef.current
      const legal = getLegalTargets(current, session.source)
      if (legal.length === 0) return null

      const dx = x - session.startX
      const dy = y - session.startY
      const cardLeft = session.originLeft + dx
      const cardTop = session.originTop + dy
      const cardRight = cardLeft + session.cardWidth
      const cardBottom = cardTop + session.cardHeight

      let bestTarget: MoveTarget | null = null
      let bestArea = 0

      for (const target of legal) {
        const selector =
          target.pile === 'foundation'
            ? `[data-drop-zone="foundation-${target.index}"]`
            : `[data-drop-zone="tableau-${target.col}"]`
        const el = document.querySelector<HTMLElement>(selector)
        if (!el) continue
        const r = el.getBoundingClientRect()
        // Slightly generous hit zone padding for effortless finger placement.
        const padX = 8
        const padY = 14
        const overlapW = Math.min(cardRight, r.right + padX) - Math.max(cardLeft, r.left - padX)
        const overlapH = Math.min(cardBottom, r.bottom + padY) - Math.max(cardTop, r.top - padY)
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

  /* --- Tap & Drag unified pointer handlers -------------------------------- */

  const handleCardTap = useCallback(
    (source: MoveSource, tappedCard: Card) => {
      const current = stateRef.current
      const prevSelected = selectedRef.current

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

      // 3. Tapping a Foundation card selects it first (prevents accidental pull-downs; tap again or tap tableau to move).
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

      // 4. Instant effortless one-tap smartMove for waste & tableau cards!
      const smartTarget = findSmartTarget(current, source)
      if (smartTarget) {
        const next = smartMove(current, source)
        applyMoveResult(current, next, smartTarget.pile)
        return
      }

      // 5. Fallback: if another legal move exists (e.g. moving a base King manually or alternate move), select it.
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
    [applyMoveResult, cue, haptic, triggerShake],
  )

  const handleEmptySlotTap = useCallback(
    (target: MoveTarget) => {
      if (paused || autoCompleting || stateRef.current.solved) return
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

  const startCardPointer = (
    e: ReactPointerEvent<HTMLElement>,
    source: MoveSource,
    cards: readonly Card[],
  ) => {
    if (paused || autoCompleting || stateRef.current.solved) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (dragRef.current) return

    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    e.currentTarget.setPointerCapture(e.pointerId)

    const session: DragSession = {
      pointerId: e.pointerId,
      source,
      cards,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      cardWidth: rect.width,
      cardHeight: rect.height,
      dragging: false,
      hoverTarget: null,
    }
    dragRef.current = session
    setDrag(session)
  }

  const moveCardPointer = (e: ReactPointerEvent<HTMLElement>) => {
    const session = dragRef.current
    if (!session || session.pointerId !== e.pointerId) return

    const dx = e.clientX - session.startX
    const dy = e.clientY - session.startY
    const nowDragging = session.dragging || Math.hypot(dx, dy) > DRAG_THRESHOLD_PX

    if (!nowDragging) return

    if (!session.dragging) {
      setSelected(null)
      cue('tap', 0.42)
      haptic('light')
    }

    const hoverTarget = findDropTargetForDrag(session, e.clientX, e.clientY)
    const updated: DragSession = {
      ...session,
      currentX: e.clientX,
      currentY: e.clientY,
      dragging: true,
      hoverTarget,
    }
    dragRef.current = updated
    setDrag(updated)
  }

  const endCardPointer = (e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    const session = dragRef.current
    if (!session || session.pointerId !== e.pointerId) return

    dragRef.current = null
    setDrag(null)

    if (cancelled) return

    if (session.dragging) {
      const target = findDropTargetForDrag(session, e.clientX, e.clientY)
      if (target) {
        const current = stateRef.current
        const next = moveCards(current, session.source, target)
        applyMoveResult(current, next, target.pile)
      }
      return
    }

    // Was a clean tap!
    const leadCard = session.cards[0]
    if (leadCard) {
      handleCardTap(session.source, leadCard)
    }
  }

  /* --- Derived visual helpers --------------------------------------------- */

  const foundationCount = useMemo(() => countFoundationCards(state), [state])
  const activeSource = drag?.dragging ? drag.source : selected
  const legalTargets = useMemo(
    () => (activeSource ? getLegalTargets(state, activeSource) : []),
    [state, activeSource],
  )

  const isTargetLegal = (target: MoveTarget) => legalTargets.some((t) => sameTarget(t, target))
  const isTargetHovered = (target: MoveTarget) =>
    Boolean(drag?.dragging && sameTarget(drag.hoverTarget, target))

  const cardHeightEstimate = (tableauDims.colWidth * 7) / 5
  const wasteTop = state.waste.length > 0 ? state.waste[state.waste.length - 1]! : null

  return (
    <GameShell
      gameId="patience"
      stats={[
        { label: 'Moves', value: state.moves },
        { label: 'Foundations', value: `${foundationCount}/52` },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={handleRestartDeal}
      onExit={onExit}
      howTo={
        <>
          <p>Build the four foundations up by suit from Ace to King.</p>
          <p>
            Stack tableau cards in descending order with alternating colours. Tap any card to send
            it home, or drag to place it yourself.
          </p>
        </>
      }
      controls={
        <div className="patience-controls">
          <div className="patience-controls__left">
            <IconButton
              label="Undo"
              onClick={handleUndo}
              disabled={state.history.length === 0 || state.solved || autoCompleting}
            >
              <Undo2 size={20} strokeWidth={1.5} aria-hidden />
            </IconButton>
            {state.history.length > 0 && (
              <span className="patience-controls__undo-count t-label num" aria-hidden="true">
                {state.history.length}
              </span>
            )}
          </div>

          <div className="patience-controls__right">
            {autoCompletable && !autoCompleting && (
              <Button variant="primary" size="sm" onClick={handleStartAutoComplete}>
                Finish
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="patience-stage" onPointerDown={() => selected && setSelected(null)}>
        <div className="patience-board">
          {/* Top Row: Stock + Waste + Spacer + 4 Foundations */}
          <div className="patience-top">
            {/* Stock pile */}
            {state.stock.length > 0 ? (
              <button
                type="button"
                className="patience-card patience-card--back patience-card--stock"
                aria-label={`Draw from stock, ${state.stock.length} remaining`}
                onClick={handleDrawStock}
              >
                <CardBackArt />
                <span className="patience-stock-count num" aria-hidden="true">
                  {state.stock.length}
                </span>
              </button>
            ) : (
              <button
                type="button"
                className={`patience-slot ${
                  state.waste.length > 0 ? 'patience-slot--interactive patience-slot--recycle' : ''
                }`}
                aria-label={state.waste.length > 0 ? 'Recycle waste to stock' : 'Empty stock'}
                disabled={state.waste.length === 0}
                onClick={handleDrawStock}
              >
                <span className="patience-slot__glyph" aria-hidden="true">
                  <RotateCw size={18} strokeWidth={1.5} />
                </span>
              </button>
            )}

            {/* Waste pile */}
            <div className="patience-slot">
              {drag?.dragging &&
                sameSource(drag.source, { pile: 'waste' }) &&
                state.waste.length > 1 && (
                  <div
                    className="patience-card patience-card--stacked"
                    data-color={cardColor(state.waste[state.waste.length - 2]!.suit)}
                    aria-hidden="true"
                  >
                    <CardFaceContent card={state.waste[state.waste.length - 2]!} />
                  </div>
                )}
              {wasteTop && (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`${rankLabel(wasteTop.rank)} of ${wasteTop.suit} in waste`}
                  className="patience-card patience-card--stacked"
                  data-color={cardColor(wasteTop.suit)}
                  data-selected={sameSource(selected, { pile: 'waste' }) || undefined}
                  data-dragging-source={
                    (drag?.dragging && sameSource(drag.source, { pile: 'waste' })) || undefined
                  }
                  data-shaking={shakingId === wasteTop.id || undefined}
                  onPointerDown={(e) => startCardPointer(e, { pile: 'waste' }, [wasteTop])}
                  onPointerMove={moveCardPointer}
                  onPointerUp={(e) => endCardPointer(e, false)}
                  onPointerCancel={(e) => endCardPointer(e, true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleCardTap({ pile: 'waste' }, wasteTop)
                    }
                  }}
                >
                  <CardFaceContent card={wasteTop} />
                </div>
              )}
            </div>

            {/* Quiet spacer between Waste and Foundations */}
            <div className="patience-spacer" aria-hidden="true" />

            {/* 4 Foundations */}
            {state.foundations.map((pile, index) => {
              const suitHint = SUITS[index]!
              const topCard = pile.length > 0 ? pile[pile.length - 1]! : null
              const target: MoveTarget = { pile: 'foundation', index }
              const legal = isTargetLegal(target)
              const hovered = isTargetHovered(target)
              const isSelected = sameSource(selected, { pile: 'foundation', index })
              const isDraggingSource = Boolean(
                drag?.dragging && sameSource(drag.source, { pile: 'foundation', index }),
              )
              const underlyingCard =
                isDraggingSource && pile.length > 1 ? pile[pile.length - 2]! : null

              return (
                <div
                  key={suitHint}
                  data-drop-zone={`foundation-${index}`}
                  data-suit={suitHint}
                  className={`patience-slot patience-slot--foundation ${
                    legal ? 'patience-slot--target' : ''
                  } ${hovered ? 'patience-slot--target-active' : ''}`}
                  onPointerDown={(e) => {
                    if (selectedRef.current) e.stopPropagation()
                  }}
                  onClick={() => handleEmptySlotTap(target)}
                >
                  <span className="patience-slot__glyph" aria-hidden="true">
                    <SuitPip suit={suitHint} className="patience-card__pip-lg" outline />
                  </span>

                  {underlyingCard && (
                    <div
                      className="patience-card patience-card--stacked"
                      data-color={cardColor(underlyingCard.suit)}
                      aria-hidden="true"
                    >
                      <CardFaceContent card={underlyingCard} />
                    </div>
                  )}

                  {topCard && (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`${rankLabel(topCard.rank)} of ${topCard.suit} on foundation`}
                      className="patience-card patience-card--stacked"
                      data-color={cardColor(topCard.suit)}
                      data-selected={isSelected || undefined}
                      data-target={legal || undefined}
                      data-target-active={hovered || undefined}
                      data-foundation-ace={topCard.rank === 1 || undefined}
                      data-dragging-source={isDraggingSource || undefined}
                      data-shaking={shakingId === topCard.id || undefined}
                      onPointerDown={(e) =>
                        startCardPointer(e, { pile: 'foundation', index }, [topCard])
                      }
                      onPointerMove={moveCardPointer}
                      onPointerUp={(e) => endCardPointer(e, false)}
                      onPointerCancel={(e) => endCardPointer(e, true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleCardTap({ pile: 'foundation', index }, topCard)
                        }
                      }}
                    >
                      <CardFaceContent card={topCard} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Tableau: 7 Columns */}
          <div ref={tableauRef} className="patience-tableau">
            {state.tableau.map((column, colIndex) => {
              const target: MoveTarget = { pile: 'tableau', col: colIndex }
              const legal = isTargetLegal(target)
              const hovered = isTargetHovered(target)
              const { offsets } = computeColumnOffsets(column, tableauDims.height, cardHeightEstimate)

              return (
                <div
                  key={colIndex}
                  data-drop-zone={`tableau-${colIndex}`}
                  className="patience-col"
                >
                  {/* Empty column well */}
                  <div
                    className={`patience-slot patience-slot--empty-well ${
                      legal && column.length === 0 ? 'patience-slot--target' : ''
                    } ${hovered && column.length === 0 ? 'patience-slot--target-active' : ''}`}
                    onPointerDown={(e) => {
                      if (selectedRef.current) e.stopPropagation()
                    }}
                    onClick={() => handleEmptySlotTap(target)}
                  />

                  {column.map((card, cardIndex) => {
                    const y = offsets[cardIndex] ?? 0
                    const isTop = cardIndex === column.length - 1
                    const source: MoveSource = { pile: 'tableau', col: colIndex, cardIndex }
                    const isSelected = isCardInSource(selected, colIndex, cardIndex)
                    const isDraggingSource = Boolean(
                      drag?.dragging && isCardInSource(drag.source, colIndex, cardIndex),
                    )
                    const cardStyle = {
                      transform: `translate3d(0, ${y}px, 0)`,
                      ['--card-y' as string]: `${y}px`,
                      zIndex: cardIndex + 1,
                    } as CSSProperties

                    if (!card.faceUp) {
                      return (
                        <div
                          key={card.id}
                          className="patience-card patience-card--stacked patience-card--back"
                          style={cardStyle}
                          aria-hidden="true"
                        >
                          <CardBackArt />
                        </div>
                      )
                    }

                    const subStack = column.slice(cardIndex)

                    return (
                      <div
                        key={card.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${rankLabel(card.rank)} of ${card.suit}`}
                        className="patience-card patience-card--stacked"
                        style={cardStyle}
                        data-color={cardColor(card.suit)}
                        data-selected={isSelected || undefined}
                        data-target={(isTop && legal) || undefined}
                        data-target-active={(isTop && hovered) || undefined}
                        data-dragging-source={isDraggingSource || undefined}
                        data-shaking={shakingId === card.id || undefined}
                        onPointerDown={(e) => startCardPointer(e, source, subStack)}
                        onPointerMove={moveCardPointer}
                        onPointerUp={(e) => endCardPointer(e, false)}
                        onPointerCancel={(e) => endCardPointer(e, true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleCardTap(source, card)
                          }
                        }}
                      >
                        <CardFaceContent card={card} />
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* Floating drag stack overlay */}
        {drag?.dragging && (
          <div
            className="patience-drag-layer"
            style={{
              width: drag.cardWidth,
              transform: `translate3d(${drag.originLeft + (drag.currentX - drag.startX)}px, ${
                drag.originTop + (drag.currentY - drag.startY)
              }px, 0) scale(1.03)`,
            }}
            aria-hidden="true"
          >
            <div className="patience-drag-stack">
              {drag.cards.map((card, i) => (
                <div
                  key={card.id}
                  className="patience-card patience-card--stacked"
                  data-color={cardColor(card.suit)}
                  style={{
                    transform: `translate3d(0, ${i * FACE_UP_STEP_BASE}px, 0)`,
                    zIndex: i + 1,
                  }}
                >
                  <CardFaceContent card={card} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Completion
        open={showCompletion}
        title="Ordered"
        line={`${state.moves} moves`}
        actionLabel="New deal"
        onAction={handleNewDeal}
      />
    </GameShell>
  )
}
