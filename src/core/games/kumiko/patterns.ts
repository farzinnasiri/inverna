/**
 * Hand-authored Japanese Kumiko crests woven into the endless tapestry.
 *
 * Each crest is a compact 2–4 row geometric composition on the 5-column grid,
 * guaranteed port-closed in its canonical orientation. Crests containing `twin`
 * crossover tiles (shippō joinery) support multi-way closure: any closed loop
 * resolves calmly, while closing the canonical crest geometry unlocks the
 * crest's kanji seal, antique brass sweep and harmonic discovery chime.
 *
 * Pure TypeScript: no React, no DOM, no randomness.
 */
import { PORT_E, PORT_N, PORT_S, PORT_W, type DuskTone, type TileKind } from './types'

export interface CrestTileSpec {
  r: number
  c: number
  kind: TileKind
  mask: number
  /** Canonical parity for `twin` tiles (0 = N↔E & S↔W, 1 = E↔S & W↔N). */
  parity?: 0 | 1
}

export interface CrestPattern {
  id: string
  name: string
  kanji: string
  tall: number
  tone: DuskTone
  /** True when twin-arc or symmetric tiles permit multiple valid closed topologies. */
  multiway: boolean
  tiles: readonly CrestTileSpec[]
}

const N = PORT_N
const E = PORT_E
const S = PORT_S
const W = PORT_W

const NE = N | E
const ES = E | S
const SW = S | W
const WN = W | N
const NS = N | S
const EW = E | W
const ALL = N | E | S | W

const a = (r: number, c: number, mask: number): CrestTileSpec => ({ r, c, kind: 'arc', mask })
const m = (r: number, c: number, mask: number): CrestTileSpec => ({ r, c, kind: 'miter', mask })
const tw = (r: number, c: number, parity: 0 | 1): CrestTileSpec => ({ r, c, kind: 'twin', mask: ALL, parity })

export const VERIFIED_CRESTS: readonly CrestPattern[] = [
  {
    id: 'hishi',
    name: 'Hishi diamond',
    kanji: '菱',
    tall: 3,
    tone: 'ochre',
    multiway: true,
    // Upper diamond (0..1, 1..2) + lower frame (1..2, 0..3) sharing twin pivot at (1,1) & (1,2).
    tiles: [
      m(0, 1, ES), m(0, 2, SW),
      m(1, 0, ES), tw(1, 1, 0), tw(1, 2, 1), m(1, 3, SW),
      m(2, 0, NE), m(2, 1, EW | N), m(2, 2, EW | N), m(2, 3, WN),
    ],
  },
  {
    id: 'shippo',
    name: 'Seven treasures',
    kanji: '七宝',
    tall: 3,
    tone: 'straw',
    multiway: true,
    // Figure-eight floral rings crossing cleanly through twin-arc hub at (1,2).
    tiles: [
      a(0, 1, ES), a(0, 2, SW),
      a(1, 1, NE), tw(1, 2, 1), a(1, 3, SW),
      a(2, 2, NE), a(2, 3, WN),
    ],
  },
  {
    id: 'torii',
    name: 'Torii gate',
    kanji: '鳥居',
    tall: 3,
    tone: 'clay',
    multiway: false,
    // Wide eaves framing a quiet central sanctuary arch.
    tiles: [
      m(0, 0, ES), a(0, 1, EW), a(0, 2, EW), a(0, 3, EW), m(0, 4, SW),
      a(1, 0, NE), m(1, 1, SW), a(1, 3, ES), a(1, 4, WN),
      a(2, 1, NE), a(2, 2, EW), a(2, 3, WN),
    ],
  },
  {
    id: 'chochin',
    name: 'Paper lantern',
    kanji: '提灯',
    tall: 4,
    tone: 'ochre',
    multiway: false,
    // Elongated lantern silhouette with chamfered shoulders and rounded base.
    tiles: [
      m(0, 1, ES), a(0, 2, EW), m(0, 3, SW),
      a(1, 1, NS), a(1, 3, NS),
      a(2, 1, NS), a(2, 3, NS),
      a(3, 1, NE), a(3, 2, EW), a(3, 3, WN),
    ],
  },
  {
    id: 'asanoha',
    name: 'Hemp star',
    kanji: '麻の葉',
    tall: 3,
    tone: 'sage',
    multiway: true,
    // Four-petal star crossing a twin-arc center (1,2).
    tiles: [
      m(0, 1, ES), m(0, 2, EW | S), m(0, 3, SW),
      m(1, 1, NE | S), tw(1, 2, 0), m(1, 3, WN | S),
      m(2, 1, NE), m(2, 2, EW | N), m(2, 3, WN),
    ],
  },
  {
    id: 'seigaiha',
    name: 'Quiet wave',
    kanji: '青海波',
    tall: 3,
    tone: 'bone',
    multiway: true,
    // Twin wave crests braided across two twin-arc nodes at (1,1) and (1,3).
    tiles: [
      a(0, 0, ES), a(0, 1, SW), a(0, 3, ES), a(0, 4, SW),
      a(1, 0, NE), tw(1, 1, 0), a(1, 2, EW), tw(1, 3, 1), a(1, 4, WN),
      a(2, 1, NE), a(2, 2, EW), a(2, 3, WN),
    ],
  },
  {
    id: 'kikko',
    name: 'Tortoise shell',
    kanji: '亀甲',
    tall: 3,
    tone: 'stone',
    multiway: true,
    // Two diagonally linked chamfered hexagons sharing a twin-arc pivot at (1,2).
    tiles: [
      m(0, 0, ES), m(0, 1, EW), m(0, 2, SW),
      m(1, 0, NE), m(1, 1, EW), tw(1, 2, 0), m(1, 3, EW), m(1, 4, SW),
      m(2, 2, NE), m(2, 3, EW), m(2, 4, WN),
    ],
  },
  {
    id: 'tsuki',
    name: 'Crescent moon',
    kanji: '三日月',
    tall: 3,
    tone: 'straw',
    multiway: false,
    // Sweeping crescent arc across 3 rows.
    tiles: [
      a(0, 1, ES), a(0, 2, EW), a(0, 3, SW),
      a(1, 1, NS), a(1, 2, ES), a(1, 3, WN),
      a(2, 1, NE), a(2, 2, WN),
    ],
  },
  {
    id: 'kagome',
    name: 'Woven basket',
    kanji: '籠目',
    tall: 3,
    tone: 'rosewood',
    multiway: true,
    // Symmetric bamboo-weave crest with two mirrored twin-arc joints.
    tiles: [
      m(0, 0, ES), m(0, 1, SW), m(0, 3, ES), m(0, 4, SW),
      m(1, 0, NE), tw(1, 1, 1), m(1, 2, EW), tw(1, 3, 0), m(1, 4, WN),
      m(2, 1, NE), m(2, 2, EW), m(2, 3, WN),
    ],
  },
  {
    id: 'tsuru',
    name: 'Folded crane',
    kanji: '鶴',
    tall: 3,
    tone: 'bone',
    multiway: false,
    // Outstretched mitered wings meeting at a quiet central spine.
    tiles: [
      m(0, 0, ES), m(0, 1, EW), m(0, 2, SW),
      m(1, 0, NE), m(1, 1, SW), a(1, 2, NS), m(1, 3, ES), m(1, 4, SW),
      m(2, 1, NE), m(2, 2, EW | N), m(2, 3, EW | N), m(2, 4, WN),
    ],
  },
  {
    id: 'yagura',
    name: 'Watchtower',
    kanji: '櫓',
    tall: 4,
    tone: 'clay',
    multiway: true,
    // Tiered Japanese wooden tower with twin-arc heart at (1,2) & (2,2).
    tiles: [
      m(0, 1, ES), m(0, 2, EW | S), m(0, 3, SW),
      a(1, 1, NE | S), tw(1, 2, 0), a(1, 3, WN | S),
      a(2, 1, NE | S), tw(2, 2, 1), a(2, 3, WN | S),
      m(3, 1, NE), m(3, 2, EW | N), m(3, 3, WN),
    ],
  },
  {
    id: 'uroko',
    name: 'Evening scales',
    kanji: '鱗',
    tall: 3,
    tone: 'sage',
    multiway: false,
    // Three rhythmic geometric diamond scales stepping across the tapestry.
    tiles: [
      m(0, 0, ES), m(0, 1, SW), m(0, 2, ES), m(0, 3, SW),
      m(1, 0, NE), m(1, 1, WN), m(1, 2, NE | S), m(1, 3, WN | S),
      m(2, 2, NE), m(2, 3, WN),
    ],
  },
]

export function crestById(id: string | null): CrestPattern | null {
  if (!id) return null
  return VERIFIED_CRESTS.find((c) => c.id === id) ?? null
}
