/**
 * Lanterns — classic Memory Pairs engine.
 *
 * Pure TypeScript, zero DOM/React, deterministic via createRng.
 * Twelve astronomical / watchmaker sigils paired with the 7 Watchmaker tones.
 */
import { createRng } from '../../rng'

export type SigilId =
  | 'crescent'
  | 'compass'
  | 'astrolabe'
  | 'sundial'
  | 'prism'
  | 'wave'
  | 'star'
  | 'hourglass'
  | 'rings'
  | 'horizon'
  | 'diamond'
  | 'leaf'

export type WatchmakerTone =
  | 'ochre'
  | 'clay'
  | 'straw'
  | 'sage'
  | 'rosewood'
  | 'stone'
  | 'bone'

export interface SigilSpec {
  id: SigilId
  label: string
  tone: WatchmakerTone
}

export const SIGILS: readonly SigilSpec[] = [
  { id: 'crescent', label: 'Crescent', tone: 'ochre' },
  { id: 'compass', label: 'Compass', tone: 'bone' },
  { id: 'astrolabe', label: 'Astrolabe', tone: 'clay' },
  { id: 'sundial', label: 'Sundial', tone: 'ochre' },
  { id: 'prism', label: 'Prism', tone: 'rosewood' },
  { id: 'wave', label: 'Wave', tone: 'clay' },
  { id: 'star', label: 'Star', tone: 'bone' },
  { id: 'hourglass', label: 'Hourglass', tone: 'sage' },
  { id: 'rings', label: 'Rings', tone: 'stone' },
  { id: 'horizon', label: 'Horizon', tone: 'straw' },
  { id: 'diamond', label: 'Diamond', tone: 'sage' },
  { id: 'leaf', label: 'Leaf', tone: 'straw' },
] as const

export interface LanternCard {
  /** Stable slot index (0..cards.length-1). */
  id: number
  sigil: SigilId
  tone: WatchmakerTone
  /** True while turned face-up (active pick, mismatch waiting to settle, or matched). */
  flipped: boolean
  /** True once its pair has been found. */
  matched: boolean
}

export interface LanternsState {
  cols: 4
  rows: 3 | 4
  cards: LanternCard[]
  /** Index of the first face-up unmatched card awaiting a second pick, else null. */
  firstIndex: number | null
  /** Indices of a revealed non-matching pair waiting to close (or auto-close on 3rd tap). */
  mismatchPair: [number, number] | null
  /** Total pairs attempted (increments on every second card flip). */
  moves: number
  matchedPairs: number
  totalPairs: 6 | 8
  puzzleNumber: number
  solved: boolean
  rngState: number
}

export interface CreateLanternsOptions {
  seed?: number
  calm?: number
  puzzleNumber?: number
}

export const CALM_THRESHOLD = 0.5

/** Choose grid dimensions from calm: 4×4 (8 pairs) below 0.5, calming to 4×3 (6 pairs) at >= 0.5. */
export function layoutForCalm(calm: number): { cols: 4; rows: 3 | 4; totalPairs: 6 | 8 } {
  return calm >= CALM_THRESHOLD
    ? { cols: 4, rows: 3, totalPairs: 6 }
    : { cols: 4, rows: 4, totalPairs: 8 }
}

/** Look up the display label for a sigil ID. */
export function sigilLabel(id: SigilId): string {
  return SIGILS.find((s) => s.id === id)?.label ?? id
}

/** Create a fresh deterministic Lanterns board. */
export function createLanterns(opts: CreateLanternsOptions = {}): LanternsState {
  const calm = opts.calm ?? 0
  const { cols, rows, totalPairs } = layoutForCalm(calm)
  const rng = createRng(opts.seed ?? 1)

  const chosen = rng.shuffle(SIGILS).slice(0, totalPairs)
  const deck = rng.shuffle([...chosen, ...chosen])

  const cards: LanternCard[] = deck.map((spec, id) => ({
    id,
    sigil: spec.id,
    tone: spec.tone,
    flipped: false,
    matched: false,
  }))

  return {
    cols,
    rows,
    cards,
    firstIndex: null,
    mismatchPair: null,
    moves: 0,
    matchedPairs: 0,
    totalPairs,
    puzzleNumber: opts.puzzleNumber ?? 1,
    solved: false,
    rngState: rng.state(),
  }
}

/**
 * Close an active mismatch pair, turning both cards back face-down.
 * Returns the exact same state reference if no mismatch is open.
 */
export function resolveMismatch(state: LanternsState): LanternsState {
  if (state.mismatchPair === null) return state
  const [a, b] = state.mismatchPair
  const cards = state.cards.map((card, i) =>
    i === a || i === b ? { ...card, flipped: false } : card,
  )
  return {
    ...state,
    cards,
    firstIndex: null,
    mismatchPair: null,
  }
}

/**
 * Flip the card at `index`.
 * - Card 1: reveals it and awaits a second pick.
 * - Card 2 (match): locks both cards as matched immediately.
 * - Card 2 (mismatch): leaves both face-up in `mismatchPair`.
 * - Card 3 while a mismatch is open: immediately closes the mismatch pair and opens card 3
 *   as the new first pick (zero input lock!).
 */
export function flipCard(state: LanternsState, index: number): LanternsState {
  if (state.solved) return state
  if (index < 0 || index >= state.cards.length) return state

  const target = state.cards[index]!
  if (target.matched) return state

  // If a mismatch pair is currently revealed, tapping a 3rd card immediately closes it and opens the new card.
  if (state.mismatchPair !== null) {
    const [m0, m1] = state.mismatchPair
    if (index === m0 || index === m1) return state

    const cards = state.cards.map((card, i) => {
      if (i === m0 || i === m1) return { ...card, flipped: false }
      if (i === index) return { ...card, flipped: true }
      return card
    })
    return {
      ...state,
      cards,
      firstIndex: index,
      mismatchPair: null,
    }
  }

  // Already face-up (e.g., tapping the first selected card again).
  if (target.flipped) return state

  // Opening card 1.
  if (state.firstIndex === null) {
    const cards = state.cards.map((card, i) =>
      i === index ? { ...card, flipped: true } : card,
    )
    return {
      ...state,
      cards,
      firstIndex: index,
    }
  }

  // Opening card 2.
  const firstIdx = state.firstIndex
  const firstCard = state.cards[firstIdx]!
  const isMatch = firstCard.sigil === target.sigil
  const nextMoves = state.moves + 1

  if (isMatch) {
    const cards = state.cards.map((card, i) =>
      i === firstIdx || i === index ? { ...card, flipped: true, matched: true } : card,
    )
    const matchedPairs = state.matchedPairs + 1
    return {
      ...state,
      cards,
      firstIndex: null,
      mismatchPair: null,
      moves: nextMoves,
      matchedPairs,
      solved: matchedPairs === state.totalPairs,
    }
  }

  const cards = state.cards.map((card, i) =>
    i === index ? { ...card, flipped: true } : card,
  )
  return {
    ...state,
    cards,
    firstIndex: null,
    mismatchPair: [firstIdx, index],
    moves: nextMoves,
  }
}

/** Advance deterministically to the next puzzle, adapting grid size to current `calm`. */
export function nextPuzzle(state: LanternsState, calm = 0): LanternsState {
  return createLanterns({
    seed: state.rngState,
    calm,
    puzzleNumber: state.puzzleNumber + 1,
  })
}
