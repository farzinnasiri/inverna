import { describe, expect, it } from 'vitest'
import {
  MAX_HISTORY,
  RANKS,
  SUITS,
  canAutoComplete,
  canPlaceOnFoundation,
  canPlaceOnTableau,
  cardColor,
  countFoundationCards,
  drawStock,
  isValidPatienceState,
  moveCards,
  newDeal,
  rankLabel,
  restartDeal,
  smartMove,
  stepAutoComplete,
  undoPatience,
  type Card,
  type PatienceState,
  type Rank,
  type Suit,
} from './engine'

function makeCard(suit: Suit, rank: Rank, faceUp = true): Card {
  return { id: `${suit}-${rank}`, suit, rank, faceUp }
}

function collectAllCards(state: PatienceState): Card[] {
  return [
    ...state.stock,
    ...state.waste,
    ...state.foundations.flat(),
    ...state.tableau.flat(),
  ]
}

function makeEmptyState(overrides: Partial<PatienceState> = {}): PatienceState {
  return {
    seed: 42,
    calm: 0,
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    moves: 0,
    solved: false,
    history: [],
    ...overrides,
  }
}

describe('Patience (Klondike Solitaire) engine', () => {
  it('deals 52 unique cards in classic Klondike layout (7 columns + 24 stock)', () => {
    const state = newDeal(12345, 0)
    expect(isValidPatienceState(state)).toBe(true)
    expect(state.stock).toHaveLength(24)
    expect(state.waste).toHaveLength(0)
    expect(state.foundations).toHaveLength(4)
    expect(state.foundations.every((f) => f.length === 0)).toBe(true)
    expect(state.tableau).toHaveLength(7)

    state.tableau.forEach((col, i) => {
      expect(col).toHaveLength(i + 1)
      col.forEach((card, j) => {
        expect(card.faceUp).toBe(j === i)
      })
    })

    expect(state.stock.every((c) => !c.faceUp)).toBe(true)

    const all = collectAllCards(state)
    expect(all).toHaveLength(52)
    expect(new Set(all.map((c) => c.id)).size).toBe(52)
  })

  it('is deterministic for a given seed and calm value, and restarts identically', () => {
    const a = newDeal(777, 0.2)
    const b = newDeal(777, 0.2)
    expect(a).toEqual(b)

    const progressed = drawStock(drawStock(a))
    expect(progressed.moves).toBe(2)
    expect(restartDeal(progressed)).toEqual(a)
  })

  it('calm >= 0.5 gently places at least 2 Aces/2s/3s near accessible tops while keeping 52 unique cards', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const state = newDeal(seed, 0.6)
      expect(isValidPatienceState(state)).toBe(true)

      const tableauTops = state.tableau.map((col) => col[col.length - 1]!)
      const topThreeStock = state.stock.slice(-3)
      const accessible = [...tableauTops, ...topThreeStock]
      const lowCards = accessible.filter((c) => c.rank <= 3)
      expect(lowCards.length).toBeGreaterThanOrEqual(2)

      const all = collectAllCards(state)
      expect(all).toHaveLength(52)
      expect(new Set(all.map((c) => c.id)).size).toBe(52)
    }
  })

  it('draws 1 card at a time from stock to waste and recycles waste in original order', () => {
    const initial = newDeal(99, 0)
    const expectedDrawOrder = initial.stock.slice().reverse().map((c) => c.id)

    let s = initial
    const firstPassOrder: string[] = []
    for (let i = 0; i < 24; i++) {
      s = drawStock(s)
      const topWaste = s.waste[s.waste.length - 1]!
      expect(topWaste.faceUp).toBe(true)
      firstPassOrder.push(topWaste.id)
    }

    expect(s.stock).toHaveLength(0)
    expect(s.waste).toHaveLength(24)
    expect(firstPassOrder).toEqual(expectedDrawOrder)

    // Recycle waste back to stock.
    s = drawStock(s)
    expect(s.stock).toHaveLength(24)
    expect(s.waste).toHaveLength(0)
    expect(s.stock.every((c) => !c.faceUp)).toBe(true)

    // Drawing again yields the exact same order.
    const secondPassOrder: string[] = []
    for (let i = 0; i < 24; i++) {
      s = drawStock(s)
      secondPassOrder.push(s.waste[s.waste.length - 1]!.id)
    }
    expect(secondPassOrder).toEqual(expectedDrawOrder)

    // Empty stock and empty waste is a no-op.
    const empty = makeEmptyState()
    expect(drawStock(empty)).toBe(empty)
  })

  it('enforces alternating-colour descending tableau moves and King-on-empty-column rule', () => {
    expect(cardColor('spades')).toBe('black')
    expect(cardColor('clubs')).toBe('black')
    expect(cardColor('hearts')).toBe('red')
    expect(cardColor('diamonds')).toBe('red')
    expect(rankLabel(1)).toBe('A')
    expect(rankLabel(10)).toBe('10')
    expect(rankLabel(11)).toBe('J')
    expect(rankLabel(12)).toBe('Q')
    expect(rankLabel(13)).toBe('K')

    const sevenSpades = makeCard('spades', 7)
    const sixHearts = makeCard('hearts', 6)
    const sixClubs = makeCard('clubs', 6)
    const fiveClubs = makeCard('clubs', 5)
    const kingDiamonds = makeCard('diamonds', 13)

    expect(canPlaceOnTableau(sixHearts, [sevenSpades])).toBe(true)
    expect(canPlaceOnTableau(sixClubs, [sevenSpades])).toBe(false) // same colour
    expect(canPlaceOnTableau(fiveClubs, [sevenSpades])).toBe(false) // wrong rank
    expect(canPlaceOnTableau(sixHearts, [])).toBe(false) // only King on empty
    expect(canPlaceOnTableau(kingDiamonds, [])).toBe(true)

    // Moving a multi-card run and auto-flipping the exposed card underneath.
    const state = makeEmptyState({
      tableau: [
        [makeCard('diamonds', 9, false), sixHearts, fiveClubs],
        [sevenSpades],
        [],
        [makeCard('spades', 4, false), kingDiamonds],
        [],
        [],
        [],
      ],
    })

    // Valid multi-card move from col 0 (index 1..2) onto col 1 (7♠).
    const afterRun = moveCards(
      state,
      { pile: 'tableau', col: 0, cardIndex: 1 },
      { pile: 'tableau', col: 1 },
    )
    expect(afterRun.tableau[0]).toEqual([makeCard('diamonds', 9, true)]) // auto-flipped!
    expect(afterRun.tableau[1]).toEqual([sevenSpades, sixHearts, fiveClubs])
    expect(afterRun.moves).toBe(1)

    // Invalid non-King move to empty column 2.
    const rejectedNonKing = moveCards(
      afterRun,
      { pile: 'tableau', col: 0, cardIndex: 0 },
      { pile: 'tableau', col: 2 },
    )
    expect(rejectedNonKing).toBe(afterRun)

    // Valid King move to empty column 2, auto-flipping 4♠ underneath.
    const afterKing = moveCards(
      afterRun,
      { pile: 'tableau', col: 3, cardIndex: 1 },
      { pile: 'tableau', col: 2 },
    )
    expect(afterKing.tableau[2]).toEqual([kingDiamonds])
    expect(afterKing.tableau[3]).toEqual([makeCard('spades', 4, true)])
  })

  it('builds foundations A → K by suit and rejects mismatched suit or multi-card moves', () => {
    const aceHearts = makeCard('hearts', 1)
    const twoHearts = makeCard('hearts', 2)
    const twoDiamonds = makeCard('diamonds', 2)

    expect(canPlaceOnFoundation(aceHearts, [])).toBe(true)
    expect(canPlaceOnFoundation(twoHearts, [])).toBe(false)
    expect(canPlaceOnFoundation(twoHearts, [aceHearts])).toBe(true)
    expect(canPlaceOnFoundation(twoDiamonds, [aceHearts])).toBe(false)

    const state = makeEmptyState({
      waste: [aceHearts],
      tableau: [
        [makeCard('spades', 3), twoHearts],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    })

    // Ace from waste to any empty foundation (e.g. index 2).
    const s1 = moveCards(state, { pile: 'waste' }, { pile: 'foundation', index: 2 })
    expect(s1.waste).toHaveLength(0)
    expect(s1.foundations[2]).toEqual([aceHearts])
    expect(countFoundationCards(s1)).toBe(1)

    // Reject multi-card move to foundation.
    const rejectedMulti = moveCards(
      s1,
      { pile: 'tableau', col: 0, cardIndex: 0 },
      { pile: 'foundation', index: 2 },
    )
    expect(rejectedMulti).toBe(s1)

    // Accept single top card (2♥) onto foundation 2.
    const s2 = moveCards(
      s1,
      { pile: 'tableau', col: 0, cardIndex: 1 },
      { pile: 'foundation', index: 2 },
    )
    expect(s2.foundations[2]).toEqual([aceHearts, twoHearts])
    expect(countFoundationCards(s2)).toBe(2)
  })

  it('smartMove prioritises foundation, then non-empty tableau, then empty tableau for non-base Kings', () => {
    const aceSpades = makeCard('spades', 1)
    const sevenClubs = makeCard('clubs', 7)
    const eightHearts = makeCard('hearts', 8)
    const kingSpades = makeCard('spades', 13)
    const kingHearts = makeCard('hearts', 13)

    const state = makeEmptyState({
      waste: [aceSpades],
      tableau: [
        [kingSpades], // King already at base -> should NOT bounce to another empty col
        [makeCard('diamonds', 4, false), kingHearts], // King above hidden card -> SHOULD move to empty col
        [sevenClubs],
        [eightHearts],
        [],
        [],
        [],
      ],
    })

    // 1. Ace in waste smart-moves to foundation.
    const s1 = smartMove(state, { pile: 'waste' })
    expect(countFoundationCards(s1)).toBe(1)
    expect(s1.waste).toHaveLength(0)

    // 2. 7♣ smart-moves onto 8♥ (non-empty tableau).
    const s2 = smartMove(s1, { pile: 'tableau', col: 2, cardIndex: 0 })
    expect(s2.tableau[2]).toHaveLength(0)
    expect(s2.tableau[3]).toEqual([eightHearts, sevenClubs])

    // 3. Base King in col 0 does NOT pointlessly move to an empty column.
    const s3 = smartMove(s2, { pile: 'tableau', col: 0, cardIndex: 0 })
    expect(s3).toBe(s2)

    // 4. King in col 1 (index 1, over a hidden card) DOES smart-move to an empty column and flips the hidden card.
    const s4 = smartMove(s3, { pile: 'tableau', col: 1, cardIndex: 1 })
    expect(s4.tableau[1]).toEqual([makeCard('diamonds', 4, true)])
    expect(s4.tableau[2]).toEqual([kingHearts])
  })

  it('detects canAutoComplete and cascades stepAutoComplete smoothly to full 52-card completion', () => {
    // Build a valid full 52-card endgame state: foundations have A..10 of each suit,
    // tableau has K-Q-J descending face-up runs, stock & waste empty.
    const foundations = SUITS.map((suit) =>
      RANKS.slice(0, 10).map((rank) => makeCard(suit, rank, true)),
    )

    const tableau: Card[][] = [
      [makeCard('spades', 13), makeCard('hearts', 12), makeCard('spades', 11)],
      [makeCard('hearts', 13), makeCard('clubs', 12), makeCard('diamonds', 11)],
      [makeCard('diamonds', 13), makeCard('spades', 12), makeCard('hearts', 11)],
      [makeCard('clubs', 13), makeCard('diamonds', 12), makeCard('clubs', 11)],
      [],
      [],
      [],
    ]

    // With a face-down card present, canAutoComplete must be false.
    const withFaceDown = makeEmptyState({
      foundations,
      tableau: [
        [makeCard('spades', 13, false), makeCard('hearts', 12), makeCard('spades', 11)],
        ...tableau.slice(1),
      ],
    })
    expect(canAutoComplete(withFaceDown)).toBe(false)

    // With all cards face-up and stock/waste empty, canAutoComplete is true.
    let s = makeEmptyState({ foundations, tableau })
    expect(isValidPatienceState(s)).toBe(true)
    expect(canAutoComplete(s)).toBe(true)

    // Step through all 12 remaining cards; lowest ranks (all 11s, then 12s, then 13s) go home in order.
    const movedRanks: Rank[] = []
    for (let step = 0; step < 12; step++) {
      const beforeCount = countFoundationCards(s)
      const next = stepAutoComplete(s)
      expect(countFoundationCards(next)).toBe(beforeCount + 1)

      // Determine which rank was moved.
      for (let i = 0; i < 4; i++) {
        if (next.foundations[i]!.length > s.foundations[i]!.length) {
          movedRanks.push(next.foundations[i]![next.foundations[i]!.length - 1]!.rank)
        }
      }
      s = next
    }

    expect(s.solved).toBe(true)
    expect(countFoundationCards(s)).toBe(52)
    expect(canAutoComplete(s)).toBe(false)
    expect(movedRanks).toEqual([11, 11, 11, 11, 12, 12, 12, 12, 13, 13, 13, 13])
  })

  it('supports up to 20 undo steps cleanly and survives JSON round-trip', () => {
    let s = newDeal(555, 0.5)
    const snapshots: PatienceState[] = [s]

    // Make 24 stock draws (exceeding MAX_HISTORY = 20).
    for (let i = 0; i < 24; i++) {
      s = drawStock(s)
      snapshots.push(s)
    }

    expect(s.moves).toBe(24)
    expect(s.history).toHaveLength(MAX_HISTORY)

    // JSON round-trip preserves full validity and state.
    const roundTripped = JSON.parse(JSON.stringify(s)) as PatienceState
    expect(isValidPatienceState(roundTripped)).toBe(true)
    expect(roundTripped).toEqual(s)

    // Undo all 20 stored steps.
    let u = roundTripped
    for (let i = 0; i < MAX_HISTORY; i++) {
      u = undoPatience(u)
    }
    expect(u.moves).toBe(4)
    expect(u.history).toHaveLength(0)
    expect(u.waste).toEqual(snapshots[4]!.waste)
    expect(u.stock).toEqual(snapshots[4]!.stock)

    // Further undo is a safe no-op.
    expect(undoPatience(u)).toBe(u)
  })
})
