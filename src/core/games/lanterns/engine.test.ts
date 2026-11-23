import { describe, expect, it } from 'vitest'
import {
  SIGILS,
  createLanterns,
  flipCard,
  layoutForCalm,
  nextPuzzle,
  resolveMismatch,
  type LanternsState,
  type SigilId,
} from './engine'

function findMatchingPair(state: LanternsState): [number, number] {
  const seen = new Map<SigilId, number>()
  for (let i = 0; i < state.cards.length; i++) {
    const c = state.cards[i]!
    if (c.matched) continue
    const prev = seen.get(c.sigil)
    if (prev !== undefined) return [prev, i]
    seen.set(c.sigil, i)
  }
  throw new Error('No unmatched pair found')
}

function findMismatchPair(state: LanternsState): [number, number] {
  const first = state.cards.findIndex((c) => !c.matched && !c.flipped)
  const second = state.cards.findIndex(
    (c, i) => i !== first && !c.matched && !c.flipped && c.sigil !== state.cards[first]!.sigil,
  )
  if (first < 0 || second < 0) throw new Error('No mismatching pair found')
  return [first, second]
}

describe('Lanterns engine — initialisation & pair distribution', () => {
  it('defines 12 unique astronomical / watchmaker sigils', () => {
    expect(SIGILS).toHaveLength(12)
    expect(new Set(SIGILS.map((s) => s.id)).size).toBe(12)
  })

  it('creates deterministic boards with exact pair distribution across 20 seeds', () => {
    const a = createLanterns({ seed: 1234, calm: 0 })
    const b = createLanterns({ seed: 1234, calm: 0 })
    expect(a).toEqual(b)

    for (let seed = 1; seed <= 20; seed++) {
      const s = createLanterns({ seed: seed * 3571, calm: 0 })
      expect(s.cols).toBe(4)
      expect(s.rows).toBe(4)
      expect(s.totalPairs).toBe(8)
      expect(s.cards).toHaveLength(16)
      expect(s.moves).toBe(0)
      expect(s.matchedPairs).toBe(0)
      expect(s.solved).toBe(false)
      expect(s.firstIndex).toBeNull()
      expect(s.mismatchPair).toBeNull()

      const counts = new Map<SigilId, number>()
      for (const card of s.cards) {
        expect(card.flipped).toBe(false)
        expect(card.matched).toBe(false)
        counts.set(card.sigil, (counts.get(card.sigil) ?? 0) + 1)
      }
      expect(counts.size).toBe(8)
      for (const count of counts.values()) {
        expect(count).toBe(2)
      }
    }
  })
})

describe('Lanterns engine — calm sizing (4×4 → 4×3)', () => {
  it('selects 4×4 (8 pairs) when calm < 0.5 and 4×3 (6 pairs) when calm >= 0.5', () => {
    expect(layoutForCalm(0)).toEqual({ cols: 4, rows: 4, totalPairs: 8 })
    expect(layoutForCalm(0.49)).toEqual({ cols: 4, rows: 4, totalPairs: 8 })
    expect(layoutForCalm(0.5)).toEqual({ cols: 4, rows: 3, totalPairs: 6 })
    expect(layoutForCalm(1)).toEqual({ cols: 4, rows: 3, totalPairs: 6 })
  })

  it('produces 12 cards (6 exact pairs) on calm nextPuzzle', () => {
    const first = createLanterns({ seed: 88, calm: 0.1 })
    expect(first.cards).toHaveLength(16)

    const second = nextPuzzle(first, 0.75)
    expect(second.puzzleNumber).toBe(2)
    expect(second.cols).toBe(4)
    expect(second.rows).toBe(3)
    expect(second.totalPairs).toBe(6)
    expect(second.cards).toHaveLength(12)

    const counts = new Map<SigilId, number>()
    for (const c of second.cards) {
      counts.set(c.sigil, (counts.get(c.sigil) ?? 0) + 1)
    }
    expect(counts.size).toBe(6)
    for (const count of counts.values()) expect(count).toBe(2)
  })
})

describe('Lanterns engine — flip state machine, matching & mismatch auto-resolution', () => {
  it('locks matching pairs immediately and prevents re-flipping matched cards', () => {
    const s0 = createLanterns({ seed: 42, calm: 0 })
    const [i, j] = findMatchingPair(s0)

    const s1 = flipCard(s0, i)
    expect(s1.cards[i]!.flipped).toBe(true)
    expect(s1.cards[i]!.matched).toBe(false)
    expect(s1.firstIndex).toBe(i)
    expect(s1.moves).toBe(0)

    // Re-tapping the already-open first card is a no-op
    expect(flipCard(s1, i)).toBe(s1)

    const s2 = flipCard(s1, j)
    expect(s2.cards[i]!.matched).toBe(true)
    expect(s2.cards[j]!.matched).toBe(true)
    expect(s2.cards[i]!.flipped).toBe(true)
    expect(s2.cards[j]!.flipped).toBe(true)
    expect(s2.firstIndex).toBeNull()
    expect(s2.mismatchPair).toBeNull()
    expect(s2.moves).toBe(1)
    expect(s2.matchedPairs).toBe(1)

    // Tapping an already matched card is a no-op
    expect(flipCard(s2, i)).toBe(s2)
    expect(flipCard(s2, j)).toBe(s2)
  })

  it('records mismatchPair and closes cleanly via resolveMismatch', () => {
    const s0 = createLanterns({ seed: 99, calm: 0 })
    const [a, b] = findMismatchPair(s0)

    const s1 = flipCard(s0, a)
    const s2 = flipCard(s1, b)
    expect(s2.mismatchPair).toEqual([a, b])
    expect(s2.firstIndex).toBeNull()
    expect(s2.moves).toBe(1)
    expect(s2.matchedPairs).toBe(0)
    expect(s2.cards[a]!.flipped).toBe(true)
    expect(s2.cards[b]!.flipped).toBe(true)

    const s3 = resolveMismatch(s2)
    expect(s3.mismatchPair).toBeNull()
    expect(s3.cards[a]!.flipped).toBe(false)
    expect(s3.cards[b]!.flipped).toBe(false)

    // Calling resolveMismatch with no mismatch is a no-op
    expect(resolveMismatch(s3)).toBe(s3)
  })

  it('immediately resolves an open mismatch when a 3rd card is tapped (zero input lock)', () => {
    const s0 = createLanterns({ seed: 202, calm: 0 })
    const [a, b] = findMismatchPair(s0)
    const third = s0.cards.findIndex((_, idx) => idx !== a && idx !== b)

    const s2 = flipCard(flipCard(s0, a), b)
    expect(s2.mismatchPair).toEqual([a, b])

    // Tapping a card currently in the mismatch pair is ignored
    expect(flipCard(s2, a)).toBe(s2)
    expect(flipCard(s2, b)).toBe(s2)

    // Tapping a 3rd card closes [a, b] and immediately flips `third` as firstIndex
    const s3 = flipCard(s2, third)
    expect(s3.mismatchPair).toBeNull()
    expect(s3.firstIndex).toBe(third)
    expect(s3.cards[a]!.flipped).toBe(false)
    expect(s3.cards[b]!.flipped).toBe(false)
    expect(s3.cards[third]!.flipped).toBe(true)
    expect(s3.moves).toBe(1)
  })

  it('detects solved once all pairs are matched and ignores further flips', () => {
    let s = createLanterns({ seed: 303, calm: 0.6 }) // 6 pairs
    for (let step = 0; step < 6; step++) {
      expect(s.solved).toBe(false)
      const [i, j] = findMatchingPair(s)
      s = flipCard(flipCard(s, i), j)
    }
    expect(s.solved).toBe(true)
    expect(s.matchedPairs).toBe(6)
    expect(s.moves).toBe(6)
    expect(s.cards.every((c) => c.matched && c.flipped)).toBe(true)
    expect(flipCard(s, 0)).toBe(s)
  })

  it('survives JSON round-trip identically', () => {
    const s0 = createLanterns({ seed: 404, calm: 0 })
    const [a, b] = findMismatchPair(s0)
    const s2 = flipCard(flipCard(s0, a), b)

    const parsed = JSON.parse(JSON.stringify(s2)) as LanternsState
    expect(parsed).toEqual(s2)

    const resolved = resolveMismatch(parsed)
    expect(resolved.mismatchPair).toBeNull()
    expect(resolved.cards[a]!.flipped).toBe(false)
  })
})
