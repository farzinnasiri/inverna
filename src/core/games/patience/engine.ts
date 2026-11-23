/**
 * Patience — Classic Draw-1 Klondike Solitaire engine for Lull.
 *
 * Pure TypeScript: zero DOM, zero React, zero Math.random. Plain serialisable
 * JSON state in, plain state out. Ports to React Native / Expo unchanged.
 *
 * Calm deal friendliness:
 * - Always Draw-1 (forgiving & relaxing, unlimited waste recycles).
 * - When `calm >= 0.5`, a deterministic post-swap via `createRng` gently
 *   ensures at least 2 Aces/2s/3s (3 when `calm >= 0.75`) sit among the
 *   accessible opening cards (face-up tableau tops and top of stock) while
 *   preserving a valid 52-card deck.
 */
import { createRng } from '../../rng'

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'
export type CardColor = 'black' | 'red'
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13

export const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'] as const
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const

export const TABLEAU_COLUMNS = 7
export const FOUNDATION_COUNT = 4
export const MAX_HISTORY = 20

export interface Card {
  readonly id: string
  readonly suit: Suit
  readonly rank: Rank
  readonly faceUp: boolean
}

export type MoveSource =
  | { readonly pile: 'waste' }
  | { readonly pile: 'tableau'; readonly col: number; readonly cardIndex: number }
  | { readonly pile: 'foundation'; readonly index: number }

export type MoveTarget =
  | { readonly pile: 'tableau'; readonly col: number }
  | { readonly pile: 'foundation'; readonly index: number }

export interface PatienceSnapshot {
  readonly stock: readonly Card[]
  readonly waste: readonly Card[]
  readonly foundations: readonly (readonly Card[])[]
  readonly tableau: readonly (readonly Card[])[]
  readonly moves: number
}

export interface PatienceState {
  readonly seed: number
  readonly calm: number
  /** Face-down draw pile. Last element is the top card drawn next. */
  readonly stock: readonly Card[]
  /** Face-up discard pile. Last element is the currently playable top card. */
  readonly waste: readonly Card[]
  /** Four foundation piles (A → K by suit). Last element is the top card. */
  readonly foundations: readonly (readonly Card[])[]
  /** Seven tableau columns. Index 0 is bottom-most; last element is top-most. */
  readonly tableau: readonly (readonly Card[])[]
  readonly moves: number
  readonly solved: boolean
  readonly history: readonly PatienceSnapshot[]
}

/* --- Pure card helpers --------------------------------------------------- */

export function cardColor(suit: Suit): CardColor {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black'
}

export function rankLabel(rank: Rank): string {
  switch (rank) {
    case 1:
      return 'A'
    case 11:
      return 'J'
    case 12:
      return 'Q'
    case 13:
      return 'K'
    default:
      return String(rank)
  }
}

export function countFoundationCards(state: PatienceState): number {
  let total = 0
  for (const pile of state.foundations) {
    total += pile.length
  }
  return total
}

function isSolvedFoundations(foundations: readonly (readonly Card[])[]): boolean {
  return foundations.length === FOUNDATION_COUNT && foundations.every((f) => f.length === 13)
}

function createSnapshot(state: PatienceState): PatienceSnapshot {
  return {
    stock: state.stock,
    waste: state.waste,
    foundations: state.foundations,
    tableau: state.tableau,
    moves: state.moves,
  }
}

function pushHistory(
  history: readonly PatienceSnapshot[],
  snapshot: PatienceSnapshot,
): readonly PatienceSnapshot[] {
  const next = history.length >= MAX_HISTORY ? history.slice(history.length - MAX_HISTORY + 1) : history.slice()
  next.push(snapshot)
  return next
}

/* --- Deck creation & dealing -------------------------------------------- */

function createOrderedDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${suit}-${rank}`,
        suit,
        rank,
        faceUp: false,
      })
    }
  }
  return deck
}

/**
 * Indices in a 52-card deal array that land in accessible opening slots:
 * - Tableau column tops (indices 0, 2, 5, 9, 14, 20, 27)
 * - First three stock draws (indices 51, 50, 49, since stock pops from the end)
 */
const ACCESSIBLE_TABLEAU_TOP_INDICES: readonly number[] = [0, 2, 5, 9, 14, 20, 27]
const ACCESSIBLE_STOCK_TOP_INDICES: readonly number[] = [51, 50, 49]
const ACCESSIBLE_INDICES: readonly number[] = [
  ...ACCESSIBLE_TABLEAU_TOP_INDICES,
  ...ACCESSIBLE_STOCK_TOP_INDICES,
]

function applyCalmDealBias(deck: Card[], calm: number, seed: number): void {
  if (calm < 0.5) return
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0)
  const targetLowCards = calm >= 0.75 ? 3 : 2

  const accessibleSet = new Set<number>(ACCESSIBLE_INDICES)
  const isLow = (card: Card) => card.rank <= 3

  let accessibleLowCount = 0
  for (const idx of ACCESSIBLE_INDICES) {
    if (isLow(deck[idx]!)) accessibleLowCount++
  }

  while (accessibleLowCount < targetLowCards) {
    // Prefer an Ace if no Ace is currently accessible; otherwise any A/2/3.
    const hasAccessibleAce = ACCESSIBLE_INDICES.some((idx) => deck[idx]!.rank === 1)

    const buriedAces: number[] = []
    const buriedLows: number[] = []
    for (let i = 0; i < deck.length; i++) {
      if (accessibleSet.has(i)) continue
      const card = deck[i]!
      if (card.rank === 1) buriedAces.push(i)
      if (isLow(card)) buriedLows.push(i)
    }

    const sourcePool = !hasAccessibleAce && buriedAces.length > 0 ? buriedAces : buriedLows
    if (sourcePool.length === 0) break

    // Prefer placing into face-up tableau tops first, falling back to top of stock.
    const tableauCandidates = ACCESSIBLE_TABLEAU_TOP_INDICES.filter((idx) => !isLow(deck[idx]!))
    const stockCandidates = ACCESSIBLE_STOCK_TOP_INDICES.filter((idx) => !isLow(deck[idx]!))
    const destPool = tableauCandidates.length > 0 ? tableauCandidates : stockCandidates
    if (destPool.length === 0) break

    const srcIdx = rng.pick(sourcePool)
    const dstIdx = rng.pick(destPool)
    const tmp = deck[srcIdx]!
    deck[srcIdx] = deck[dstIdx]!
    deck[dstIdx] = tmp
    accessibleLowCount++
  }
}

export function newDeal(seed: number = 1, calm = 0): PatienceState {
  const normalizedSeed = seed >>> 0
  const clampedCalm = Math.min(1, Math.max(0, calm))
  const rng = createRng(normalizedSeed)
  const deck = rng.shuffle(createOrderedDeck())

  applyCalmDealBias(deck, clampedCalm, normalizedSeed)

  const tableau: Card[][] = []
  let cursor = 0
  for (let col = 0; col < TABLEAU_COLUMNS; col++) {
    const column: Card[] = []
    for (let row = 0; row <= col; row++) {
      const card = deck[cursor++]!
      column.push({
        ...card,
        faceUp: row === col,
      })
    }
    tableau.push(column)
  }

  const stock: Card[] = deck.slice(cursor).map((c) => ({ ...c, faceUp: false }))

  return {
    seed: normalizedSeed,
    calm: clampedCalm,
    stock,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    moves: 0,
    solved: false,
    history: [],
  }
}

export function restartDeal(state: PatienceState): PatienceState {
  return newDeal(state.seed, state.calm)
}

/* --- Rule validation ----------------------------------------------------- */

export function canPlaceOnTableau(movingTopCard: Card, column: readonly Card[]): boolean {
  if (column.length === 0) {
    return movingTopCard.rank === 13
  }
  const targetTop = column[column.length - 1]!
  if (!targetTop.faceUp) return false
  return cardColor(movingTopCard.suit) !== cardColor(targetTop.suit) && movingTopCard.rank === targetTop.rank - 1
}

export function canPlaceOnFoundation(card: Card, foundation: readonly Card[]): boolean {
  if (foundation.length === 0) {
    return card.rank === 1
  }
  const top = foundation[foundation.length - 1]!
  return card.suit === top.suit && card.rank === top.rank + 1
}

function getMovingCards(state: PatienceState, source: MoveSource): readonly Card[] | null {
  switch (source.pile) {
    case 'waste': {
      if (state.waste.length === 0) return null
      return [state.waste[state.waste.length - 1]!]
    }
    case 'foundation': {
      if (source.index < 0 || source.index >= FOUNDATION_COUNT) return null
      const pile = state.foundations[source.index]
      if (!pile || pile.length === 0) return null
      return [pile[pile.length - 1]!]
    }
    case 'tableau': {
      if (source.col < 0 || source.col >= TABLEAU_COLUMNS) return null
      const column = state.tableau[source.col]
      if (!column || source.cardIndex < 0 || source.cardIndex >= column.length) return null
      const slice = column.slice(source.cardIndex)
      if (slice.length === 0) return null
      for (let i = 0; i < slice.length; i++) {
        if (!slice[i]!.faceUp) return null
        if (i > 0) {
          const prev = slice[i - 1]!
          const curr = slice[i]!
          if (cardColor(prev.suit) === cardColor(curr.suit) || curr.rank !== prev.rank - 1) {
            return null
          }
        }
      }
      return slice
    }
  }
}

export function canMove(state: PatienceState, from: MoveSource, to: MoveTarget): boolean {
  if (state.solved) return false
  const moving = getMovingCards(state, from)
  if (!moving || moving.length === 0) return false

  if (to.pile === 'foundation') {
    if (to.index < 0 || to.index >= FOUNDATION_COUNT) return false
    if (moving.length !== 1) return false
    if (from.pile === 'foundation' && from.index === to.index) return false
    const foundation = state.foundations[to.index]!
    return canPlaceOnFoundation(moving[0]!, foundation)
  }

  if (to.col < 0 || to.col >= TABLEAU_COLUMNS) return false
  if (from.pile === 'tableau' && from.col === to.col) return false
  const column = state.tableau[to.col]!
  return canPlaceOnTableau(moving[0]!, column)
}

export function getLegalTargets(state: PatienceState, source: MoveSource): MoveTarget[] {
  const targets: MoveTarget[] = []
  for (let i = 0; i < FOUNDATION_COUNT; i++) {
    const target: MoveTarget = { pile: 'foundation', index: i }
    if (canMove(state, source, target)) targets.push(target)
  }
  for (let col = 0; col < TABLEAU_COLUMNS; col++) {
    const target: MoveTarget = { pile: 'tableau', col }
    if (canMove(state, source, target)) targets.push(target)
  }
  return targets
}

/* --- Actions ------------------------------------------------------------- */

export function drawStock(state: PatienceState): PatienceState {
  if (state.solved) return state

  if (state.stock.length > 0) {
    const drawn = state.stock[state.stock.length - 1]!
    const nextStock = state.stock.slice(0, -1)
    const nextWaste = [...state.waste, { ...drawn, faceUp: true }]
    return {
      ...state,
      stock: nextStock,
      waste: nextWaste,
      moves: state.moves + 1,
      history: pushHistory(state.history, createSnapshot(state)),
    }
  }

  if (state.waste.length > 0) {
    // Flip waste back over into stock so cards draw in the exact original order.
    const recycledStock = state.waste
      .slice()
      .reverse()
      .map((card) => ({ ...card, faceUp: false }))
    return {
      ...state,
      stock: recycledStock,
      waste: [],
      moves: state.moves + 1,
      history: pushHistory(state.history, createSnapshot(state)),
    }
  }

  return state
}

export function moveCards(state: PatienceState, from: MoveSource, to: MoveTarget): PatienceState {
  if (!canMove(state, from, to)) return state

  const moving = getMovingCards(state, from)!
  let nextWaste = state.waste
  const nextFoundations = state.foundations.map((f) => f.slice())
  const nextTableau = state.tableau.map((c) => c.slice())

  // Remove cards from source pile.
  if (from.pile === 'waste') {
    nextWaste = state.waste.slice(0, -1)
  } else if (from.pile === 'foundation') {
    nextFoundations[from.index] = nextFoundations[from.index]!.slice(0, -1)
  } else {
    const remaining = nextTableau[from.col]!.slice(0, from.cardIndex)
    // Auto-flip newly exposed top card face-up.
    if (remaining.length > 0) {
      const topIdx = remaining.length - 1
      const topCard = remaining[topIdx]!
      if (!topCard.faceUp) {
        remaining[topIdx] = { ...topCard, faceUp: true }
      }
    }
    nextTableau[from.col] = remaining
  }

  // Place cards onto target pile.
  const placed = moving.map((c) => ({ ...c, faceUp: true }))
  if (to.pile === 'foundation') {
    nextFoundations[to.index] = [...nextFoundations[to.index]!, placed[0]!]
  } else {
    nextTableau[to.col] = [...nextTableau[to.col]!, ...placed]
  }

  const solved = isSolvedFoundations(nextFoundations)

  return {
    ...state,
    waste: nextWaste,
    foundations: nextFoundations,
    tableau: nextTableau,
    moves: state.moves + 1,
    solved,
    history: pushHistory(state.history, createSnapshot(state)),
  }
}

/** Picks the cleanest foundation index for a card (prefers matching suit slot for Aces). */
function findBestFoundationIndex(state: PatienceState, card: Card): number {
  if (card.rank === 1) {
    const preferred = SUITS.indexOf(card.suit)
    if (preferred >= 0 && state.foundations[preferred]!.length === 0) {
      return preferred
    }
  }
  for (let i = 0; i < FOUNDATION_COUNT; i++) {
    if (canPlaceOnFoundation(card, state.foundations[i]!)) {
      return i
    }
  }
  return -1
}

/**
 * Finds the best legal destination for one-tap play:
 * 1. Foundation (if single top card, and not already in a foundation)
 * 2. Non-empty tableau column
 * 3. Empty tableau column (for a King, unless already at the base of a tableau column)
 */
export function findSmartTarget(state: PatienceState, source: MoveSource): MoveTarget | null {
  if (state.solved) return null
  const moving = getMovingCards(state, source)
  if (!moving || moving.length === 0) return null

  const leadCard = moving[0]!

  // 1. Foundation if single top card.
  if (moving.length === 1 && source.pile !== 'foundation') {
    const foundationIdx = findBestFoundationIndex(state, leadCard)
    if (foundationIdx !== -1) {
      return { pile: 'foundation', index: foundationIdx }
    }
  }

  // 2. Non-empty tableau column.
  for (let col = 0; col < TABLEAU_COLUMNS; col++) {
    if (source.pile === 'tableau' && source.col === col) continue
    const column = state.tableau[col]!
    if (column.length > 0 && canPlaceOnTableau(leadCard, column)) {
      return { pile: 'tableau', col }
    }
  }

  // 3. Empty tableau column (only if King not already sitting at base of a column).
  if (leadCard.rank === 13) {
    const alreadyAtBase = source.pile === 'tableau' && source.cardIndex === 0
    if (!alreadyAtBase) {
      for (let col = 0; col < TABLEAU_COLUMNS; col++) {
        if (source.pile === 'tableau' && source.col === col) continue
        if (state.tableau[col]!.length === 0) {
          return { pile: 'tableau', col }
        }
      }
    }
  }

  return null
}

export function smartMove(state: PatienceState, source: MoveSource): PatienceState {
  const target = findSmartTarget(state, source)
  if (!target) return state
  return moveCards(state, source, target)
}

/* --- Auto-complete ------------------------------------------------------- */

export function canAutoComplete(state: PatienceState): boolean {
  if (state.solved) return false
  if (state.stock.length > 0 || state.waste.length > 0) return false
  let remainingTableauCards = 0
  for (const column of state.tableau) {
    for (const card of column) {
      if (!card.faceUp) return false
      remainingTableauCards++
    }
  }
  return remainingTableauCards > 0
}

export function stepAutoComplete(state: PatienceState): PatienceState {
  if (state.solved) return state

  let bestSource: MoveSource | null = null
  let bestTargetIndex = -1
  let lowestRank = Infinity

  // Check top card of each tableau column.
  for (let col = 0; col < TABLEAU_COLUMNS; col++) {
    const column = state.tableau[col]!
    if (column.length === 0) continue
    const cardIndex = column.length - 1
    const top = column[cardIndex]!
    if (!top.faceUp) continue
    const targetIdx = findBestFoundationIndex(state, top)
    if (targetIdx !== -1 && top.rank < lowestRank) {
      lowestRank = top.rank
      bestSource = { pile: 'tableau', col, cardIndex }
      bestTargetIndex = targetIdx
    }
  }

  // Also check waste top card as a defensive fallback if called directly.
  if (state.waste.length > 0) {
    const top = state.waste[state.waste.length - 1]!
    const targetIdx = findBestFoundationIndex(state, top)
    if (targetIdx !== -1 && top.rank < lowestRank) {
      lowestRank = top.rank
      bestSource = { pile: 'waste' }
      bestTargetIndex = targetIdx
    }
  }

  if (!bestSource || bestTargetIndex === -1) return state
  return moveCards(state, bestSource, { pile: 'foundation', index: bestTargetIndex })
}

/* --- Undo & validation --------------------------------------------------- */

export function undoPatience(state: PatienceState): PatienceState {
  if (state.history.length === 0) return state
  const previous = state.history[state.history.length - 1]!
  const nextHistory = state.history.slice(0, -1)
  return {
    ...state,
    stock: previous.stock,
    waste: previous.waste,
    foundations: previous.foundations,
    tableau: previous.tableau,
    moves: previous.moves,
    solved: isSolvedFoundations(previous.foundations),
    history: nextHistory,
  }
}

function isValidCard(value: unknown): value is Card {
  if (!value || typeof value !== 'object') return false
  const c = value as Partial<Card>
  return (
    typeof c.id === 'string' &&
    (c.suit === 'spades' || c.suit === 'hearts' || c.suit === 'diamonds' || c.suit === 'clubs') &&
    typeof c.rank === 'number' &&
    Number.isInteger(c.rank) &&
    c.rank >= 1 &&
    c.rank <= 13 &&
    typeof c.faceUp === 'boolean'
  )
}

export function isValidPatienceState(value: unknown): value is PatienceState {
  if (!value || typeof value !== 'object') return false
  const s = value as Partial<PatienceState>
  if (
    typeof s.seed !== 'number' ||
    typeof s.calm !== 'number' ||
    typeof s.moves !== 'number' ||
    typeof s.solved !== 'boolean' ||
    !Array.isArray(s.stock) ||
    !Array.isArray(s.waste) ||
    !Array.isArray(s.foundations) ||
    s.foundations.length !== FOUNDATION_COUNT ||
    !Array.isArray(s.tableau) ||
    s.tableau.length !== TABLEAU_COLUMNS ||
    !Array.isArray(s.history)
  ) {
    return false
  }

  const seen = new Set<string>()
  const checkPile = (pile: unknown): boolean => {
    if (!Array.isArray(pile)) return false
    for (const item of pile) {
      if (!isValidCard(item)) return false
      if (seen.has(item.id)) return false
      seen.add(item.id)
    }
    return true
  }

  if (!checkPile(s.stock) || !checkPile(s.waste)) return false
  for (const f of s.foundations) if (!checkPile(f)) return false
  for (const col of s.tableau) if (!checkPile(col)) return false

  return seen.size === 52
}
