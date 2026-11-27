/**
 * Deterministic Kumiko band generator: builds varied, guaranteed-solvable
 * Japanese geometric joinery bands (mitered diamonds, shippō twin-arc braids,
 * stepped pagoda frames, twin lanterns, serpentine ribbons, and curated crests).
 *
 * Pure TypeScript: uses `createRng`, never `Math.random`.
 */
import { createRng, type Rng } from '../../rng'
import { VERIFIED_CRESTS, type CrestPattern } from './patterns'
import {
  PORT_E,
  PORT_N,
  PORT_S,
  PORT_W,
  type DuskTone,
  type KumikoBand,
  type KumikoTile,
  type TileKind,
} from './types'

export const KUMIKO_COLS = 5

const N = PORT_N
const E = PORT_E
const S = PORT_S
const W = PORT_W
const ALL = N | E | S | W

const TONES: readonly DuskTone[] = ['ochre', 'straw', 'sage', 'clay', 'rosewood', 'stone', 'bone']

const DIRS = [
  { bit: N, opp: S, dr: -1, dc: 0 },
  { bit: E, opp: W, dr: 0, dc: 1 },
  { bit: S, opp: N, dr: 1, dc: 0 },
  { bit: W, opp: E, dr: 0, dc: -1 },
] as const

export function rotateMaskCW(mask: number, turns: number): number {
  let r = mask & 15
  const t = ((turns % 4) + 4) % 4
  for (let i = 0; i < t; i++) {
    r = ((r << 1) & 15) | (r & 8 ? 1 : 0)
  }
  return r
}

export function activeMaskOf(tile: Pick<KumikoTile, 'kind' | 'baseMask' | 'turns'>): number {
  if (tile.kind === 'twin') return ALL
  return rotateMaskCW(tile.baseMask, tile.turns)
}

export function twinParityOf(tile: Pick<KumikoTile, 'canonicalParity' | 'turns'>): 0 | 1 {
  return ((tile.canonicalParity + tile.turns) & 1) as 0 | 1
}

/** True when turning this tile changes its visible / logical state. */
export function isRotatableTile(tile: Pick<KumikoTile, 'kind' | 'baseMask'>): boolean {
  if (tile.kind === 'twin') return true
  return tile.baseMask !== 0 && tile.baseMask !== ALL
}

/** Minimum clockwise turns from `turns` to reach `canonicalMask` (or canonical parity for `twin`). */
export function turnsToCanonical(tile: Pick<KumikoTile, 'kind' | 'baseMask' | 'canonicalMask' | 'canonicalParity' | 'turns'>): number {
  if (tile.kind === 'twin') {
    return (tile.turns & 1) === 0 ? 0 : 1
  }
  for (let d = 0; d < 4; d++) {
    if (rotateMaskCW(tile.baseMask, tile.turns + d) === tile.canonicalMask) return d
  }
  return 0
}

/**
 * Scramble every connected component inside a band so no sub-knot starts
 * already solved, while scaling scramble density smoothly with `challenge`.
 */
function scrambleBandTiles(tiles: KumikoTile[], challenge: number, rng: Rng): void {
  const byPos = new Map(tiles.map((t) => [`${t.r},${t.c}`, t]))
  const visited = new Set<string>()
  const ratio = 0.42 + challenge * 0.42 // 42% at calmest -> 84% at alert

  for (const start of tiles) {
    const sk = `${start.r},${start.c}`
    if (visited.has(sk)) continue
    const q = [start]
    const comp: KumikoTile[] = []
    visited.add(sk)
    while (q.length > 0) {
      const cur = q.shift()!
      comp.push(cur)
      const mask = cur.kind === 'twin' ? ALL : cur.baseMask
      for (const d of DIRS) {
        if (!(mask & d.bit)) continue
        const nb = byPos.get(`${cur.r + d.dr},${cur.c + d.dc}`)
        if (nb && !visited.has(`${nb.r},${nb.c}`)) {
          visited.add(`${nb.r},${nb.c}`)
          q.push(nb)
        }
      }
    }

    // Separate boundary rotatable tiles (non-twin) from twin-arc tiles so the
    // knot definitely starts unclosed (twin tiles alone keep all 4 ports active).
    const boundaryRot = comp.filter((t) => t.kind !== 'twin' && isRotatableTile(t))
    const twinTiles = comp.filter((t) => t.kind === 'twin')

    let scrambled = 0
    for (const t of boundaryRot) {
      if (rng.next() < ratio) {
        const isStraight = t.baseMask === (N | S) || t.baseMask === (E | W)
        const maxTurns = isStraight ? 1 : challenge < 0.35 ? 2 : 3
        const delta = rng.int(1, maxTurns)
        t.turns = delta % 4
        t.targetDeg = t.turns * 90
        t.minTurnsToSolve = turnsToCanonical(t)
        scrambled++
      }
    }

    // Guarantee at least two boundary tiles (or one if tiny) are unaligned.
    const minNeeded = Math.min(boundaryRot.length, challenge < 0.25 ? 1 : 2)
    while (scrambled < minNeeded && boundaryRot.length > 0) {
      const candidate = boundaryRot.find((t) => t.turns === 0)
      if (!candidate) break
      candidate.turns = 1
      candidate.targetDeg = 90
      candidate.minTurnsToSolve = turnsToCanonical(candidate)
      scrambled++
    }

    // Flip twin-arc tiles with moderate probability so crests reward observation.
    for (const t of twinTiles) {
      if (rng.next() < 0.65) {
        t.turns = 1
        t.targetDeg = 90
        t.minTurnsToSolve = 1
      }
    }
  }
}

/** Build a band from one of the hand-authored Japanese crests. */
function buildCrestBand(
  crest: CrestPattern,
  bandId: number,
  worldRowBase: number,
  challenge: number,
  rng: Rng,
): KumikoBand {
  const tiles: KumikoTile[] = crest.tiles.map((spec) => ({
    r: spec.r,
    c: spec.c,
    worldRow: worldRowBase + (crest.tall - 1 - spec.r),
    kind: spec.kind,
    baseMask: spec.kind === 'twin' ? ALL : spec.mask,
    canonicalMask: spec.kind === 'twin' ? ALL : spec.mask,
    canonicalParity: spec.parity ?? 0,
    turns: 0,
    targetDeg: 0,
    solved: false,
    knotId: 0,
    isCrest: false,
    taps: 0,
    minTurnsToSolve: 0,
  }))
  scrambleBandTiles(tiles, challenge, rng)
  return {
    id: bandId,
    worldRowBase,
    tall: crest.tall,
    tone: crest.tone,
    tiles,
    solved: false,
    crestId: crest.id,
    crestName: crest.name,
    crestKanji: crest.kanji,
    crestDiscovered: false,
  }
}

type DualSquare = readonly [number, number]

/**
 * Convert a set of dual 2×2 squares on a `(tall) × KUMIKO_COLS` grid into a
 * guaranteed-closed port mask table.
 * - `mode === 'xor'`: removes interior shared edges, producing sculpted polygons & ribbons.
 * - `mode === 'union'`: keeps interior shared edges, producing T-junctions & 4-way hubs.
 */
function masksFromDualSquares(
  tall: number,
  squares: readonly DualSquare[],
  mode: 'xor' | 'union',
): number[][] {
  const masks = Array.from({ length: tall }, () => Array<number>(KUMIKO_COLS).fill(0))
  const apply = (r: number, c: number, bit: number) => {
    if (mode === 'xor') masks[r]![c]! ^= bit
    else masks[r]![c]! |= bit
  }
  for (const [dr, dc] of squares) {
    if (dr < 0 || dr >= tall - 1 || dc < 0 || dc >= KUMIKO_COLS - 1) continue
    apply(dr, dc, E)
    apply(dr, dc + 1, W)
    apply(dr + 1, dc, E)
    apply(dr + 1, dc + 1, W)
    apply(dr, dc, S)
    apply(dr + 1, dc, N)
    apply(dr, dc + 1, S)
    apply(dr + 1, dc + 1, N)
  }
  return masks
}

type Archetype = 'diamond' | 'shippo' | 'pagoda' | 'twinPair' | 'ribbon' | 'quietRing'

function pickArchetype(challenge: number, rng: Rng): Archetype {
  const r = rng.next()
  if (challenge < 0.25) {
    // Sleepy / easy: gentle open rings, soft diamonds, occasional wide frame.
    if (r < 0.45) return 'quietRing'
    if (r < 0.78) return 'diamond'
    return 'pagoda'
  }
  if (challenge < 0.58) {
    // Mid-pace: lively mix of all geometric styles.
    if (r < 0.24) return 'diamond'
    if (r < 0.46) return 'shippo'
    if (r < 0.68) return 'pagoda'
    if (r < 0.86) return 'twinPair'
    return 'ribbon'
  }
  // Alert / brisk: richest multi-row geometry, twin-arc braids, asymmetric ribbons.
  if (r < 0.26) return 'shippo'
  if (r < 0.5) return 'ribbon'
  if (r < 0.72) return 'pagoda'
  if (r < 0.88) return 'twinPair'
  return 'diamond'
}

function buildProceduralBand(
  bandId: number,
  worldRowBase: number,
  challenge: number,
  rng: Rng,
): KumikoBand {
  const archetype = pickArchetype(challenge, rng)
  let tall = 2
  let squares: DualSquare[] = []
  let combineMode: 'xor' | 'union' = 'xor'
  let kindFor: (r: number, c: number, mask: number) => { kind: TileKind; parity?: 0 | 1 } = () => ({ kind: 'arc' })

  switch (archetype) {
    case 'quietRing': {
      tall = 2
      const startC = rng.int(0, 2)
      const width = rng.next() < 0.55 ? 2 : 1
      for (let dc = 0; dc < width; dc++) squares.push([0, Math.min(3, startC + dc)])
      const useMiter = rng.next() < 0.35
      kindFor = () => ({ kind: useMiter ? 'miter' : 'arc' })
      break
    }

    case 'diamond': {
      tall = challenge > 0.45 && rng.next() < 0.6 ? 3 : 2
      if (tall === 2) {
        const c0 = rng.int(0, 2)
        squares = [
          [0, c0],
          [0, Math.min(3, c0 + 1)],
        ]
      } else {
        // Stepped hexagonal/diamond jewel across 3 rows.
        const c0 = rng.int(1, 2)
        squares = [
          [0, c0],
          [1, c0 - 1],
          [1, Math.min(3, c0 + 1)],
        ]
        combineMode = rng.next() < 0.45 ? 'union' : 'xor'
      }
      kindFor = (_r, _c, mask) =>
        mask === ALL ? { kind: 'twin', parity: (rng.int(0, 1) as 0 | 1) } : { kind: 'miter' }
      break
    }

    case 'shippo': {
      tall = 3
      // Diagonal overlapping 2×2 petals creating degree-4 twin-arc crossover hubs!
      const flip = rng.next() < 0.5
      const c0 = rng.int(0, 1)
      squares = flip
        ? [
            [0, c0],
            [1, c0 + 1],
            ...(challenge > 0.55 && c0 === 0 ? ([[0, 2]] as DualSquare[]) : []),
          ]
        : [
            [0, c0 + 1],
            [1, c0],
            ...(challenge > 0.55 && c0 === 0 ? ([[1, 2]] as DualSquare[]) : []),
          ]
      combineMode = 'xor'
      kindFor = (_r, _c, mask) =>
        mask === ALL ? { kind: 'twin', parity: (rng.int(0, 1) as 0 | 1) } : { kind: 'arc' }
      break
    }

    case 'pagoda': {
      tall = 3
      // Wide upper eave (3–4 cols) over a narrower grounded lower arch.
      const left = rng.next() < 0.5 ? 0 : 1
      squares = [
        [0, left],
        [0, left + 1],
        [0, Math.min(3, left + 2)],
        [1, left + 1],
      ]
      combineMode = rng.next() < 0.4 ? 'union' : 'xor'
      kindFor = (r, _c, mask) => {
        if (mask === ALL) return { kind: 'twin', parity: 0 }
        return { kind: r === 0 ? 'miter' : 'arc' }
      }
      break
    }

    case 'twinPair': {
      tall = challenge > 0.55 && rng.next() < 0.5 ? 3 : 2
      // Contrasting pair: crisp miter jewel on one side, smooth curved loop on the other.
      if (tall === 2) {
        squares = [
          [0, 0],
          [0, 3],
        ]
      } else {
        const leftTall = rng.next() < 0.5
        squares = leftTall
          ? [
              [0, 0],
              [1, 0],
              [rng.int(0, 1), 3],
            ]
          : [
              [rng.int(0, 1), 0],
              [0, 3],
              [1, 3],
            ]
      }
      const leftMiter = rng.next() < 0.5
      kindFor = (_r, c) => ({ kind: (c < 2 ? leftMiter : !leftMiter) ? 'miter' : 'arc' })
      break
    }

    case 'ribbon': {
      tall = 3
      // Serpentine L/S-shaped continuous weave spanning 3 rows & 3–4 columns.
      const mirror = rng.next() < 0.5
      const c0 = rng.int(0, 1)
      squares = mirror
        ? [
            [0, c0 + 1],
            [0, c0 + 2],
            [1, c0],
            [1, c0 + 1],
          ]
        : [
            [0, c0],
            [0, c0 + 1],
            [1, c0 + 1],
            [1, c0 + 2],
          ]
      combineMode = rng.next() < 0.35 ? 'union' : 'xor'
      kindFor = (r, c, mask) => {
        if (mask === ALL) return { kind: 'twin', parity: ((r + c) & 1) as 0 | 1 }
        return { kind: (r + c) % 2 === 0 ? 'miter' : 'arc' }
      }
      break
    }
  }

  const masks = masksFromDualSquares(tall, squares, combineMode)
  const tiles: KumikoTile[] = []

  for (let r = 0; r < tall; r++) {
    for (let c = 0; c < KUMIKO_COLS; c++) {
      const mask = masks[r]![c]!
      if (mask === 0) continue
      const styled = kindFor(r, c, mask)
      const kind: TileKind = mask === ALL && styled.kind === 'twin' ? 'twin' : styled.kind === 'twin' ? 'arc' : styled.kind
      tiles.push({
        r,
        c,
        worldRow: worldRowBase + (tall - 1 - r),
        kind,
        baseMask: kind === 'twin' ? ALL : mask,
        canonicalMask: kind === 'twin' ? ALL : mask,
        canonicalParity: styled.parity ?? 0,
        turns: 0,
        targetDeg: 0,
        solved: false,
        knotId: 0,
        isCrest: false,
        taps: 0,
        minTurnsToSolve: 0,
      })
    }
  }

  scrambleBandTiles(tiles, challenge, rng)

  return {
    id: bandId,
    worldRowBase,
    tall,
    tone: TONES[(bandId - 1) % TONES.length]!,
    tiles,
    solved: false,
    crestId: null,
    crestName: null,
    crestKanji: null,
    crestDiscovered: false,
  }
}

export interface NextBandOptions {
  seed: number
  rngStep: number
  bandId: number
  worldRowBase: number
  challenge: number
  allowCrests: boolean
  bandsSinceCrest: number
  recentCrests: readonly string[]
  discoveredCrests: readonly string[]
}

/**
 * Deal the next band in the endless stream. Every ~5–7 bands (when alert),
 * weaves in an unvisited or least-recent curated Japanese crest.
 */
export function generateNextBand(opts: NextBandOptions): {
  band: KumikoBand
  rngStep: number
  bandsSinceCrest: number
  recentCrests: string[]
} {
  const rng = createRng((opts.seed ^ Math.imul(opts.rngStep + 1, 0x9e3779b1)) >>> 0)
  const crestInterval = opts.challenge > 0.55 ? 5 : 6
  const shouldDealCrest = opts.allowCrests && opts.bandId >= 3 && opts.bandsSinceCrest >= crestInterval

  if (shouldDealCrest) {
    // Prefer undiscovered crests not seen recently, then any non-recent crest.
    const recentSet = new Set(opts.recentCrests)
    const discoveredSet = new Set(opts.discoveredCrests)
    let pool = VERIFIED_CRESTS.filter((c) => !discoveredSet.has(c.id) && !recentSet.has(c.id))
    if (pool.length === 0) pool = VERIFIED_CRESTS.filter((c) => !recentSet.has(c.id))
    if (pool.length === 0) pool = [...VERIFIED_CRESTS]

    const crest = rng.pick(pool)
    const band = buildCrestBand(crest, opts.bandId, opts.worldRowBase, opts.challenge, rng)
    const recentCrests = [...opts.recentCrests, crest.id].slice(-6)
    return {
      band,
      rngStep: opts.rngStep + 1,
      bandsSinceCrest: 0,
      recentCrests,
    }
  }

  const band = buildProceduralBand(opts.bandId, opts.worldRowBase, opts.challenge, rng)
  return {
    band,
    rngStep: opts.rngStep + 1,
    bandsSinceCrest: opts.bandsSinceCrest + 1,
    recentCrests: [...opts.recentCrests],
  }
}
