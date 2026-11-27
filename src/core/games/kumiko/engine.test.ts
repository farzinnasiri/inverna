import { describe, expect, it } from 'vitest'
import {
  createKumiko,
  DEFAULT_NIGHT_CONTEXT,
  isKumikoState,
  respondToHandoff,
  takeEvents,
  tapTile,
  tickKumiko,
  wakeKumiko,
  type KumikoState,
} from './engine'
import { generateNextBand, turnsToCanonical } from './generator'

/** Solve every open tile in a band to its canonical orientation via legal `tapTile` calls. */
function solveBandCanonically(state: KumikoState, bandId: number): KumikoState {
  let cur = state
  const band = cur.bands.find((b) => b.id === bandId)
  if (!band) return cur
  for (const tile of band.tiles) {
    const liveBand = cur.bands.find((b) => b.id === bandId)
    const liveTile = liveBand?.tiles.find((t) => t.r === tile.r && t.c === tile.c)
    if (!liveTile || liveTile.solved) continue
    const turns = turnsToCanonical(liveTile)
    for (let k = 0; k < turns; k++) {
      cur = tickKumiko(cur, 420)
      cur = tapTile(cur, bandId, tile.r, tile.c)
    }
  }
  return cur
}

describe('Kumiko engine', () => {
  it('deals varied, 100% solvable geometric bands across challenge levels without collapsing to circles', () => {
    const kinds = new Set<string>()
    let bandsChecked = 0
    for (const challenge of [0.1, 0.45, 0.85]) {
      for (let step = 0; step < 30; step++) {
        const { band } = generateNextBand({
          seed: 918273,
          rngStep: step,
          bandId: step + 1,
          worldRowBase: step * 3,
          challenge,
          allowCrests: challenge > 0.3,
          bandsSinceCrest: step % 6,
          recentCrests: [],
          discoveredCrests: [],
        })
        bandsChecked++
        expect(band.tiles.length).toBeGreaterThanOrEqual(4)
        for (const t of band.tiles) kinds.add(t.kind)

        // Verify the band starts unsolved and can be solved via legal taps.
        const state: KumikoState = {
          ...createKumiko({ seed: 1 }),
          bands: [band],
          nextWorldRow: band.worldRowBase + band.tall,
          nextBandId: band.id + 1,
        }
        const solved = solveBandCanonically(state, band.id)
        const finalBand = solved.bands.find((b) => b.id === band.id)
        expect(finalBand?.solved, `band ${band.id} at challenge ${challenge} must solve`).toBe(true)
      }
    }
    expect(bandsChecked).toBe(90)
    // Must produce arcs, 45° miter joinery, and twin-arc shippō crossovers.
    expect(kinds.has('arc')).toBe(true)
    expect(kinds.has('miter')).toBe(true)
    expect(kinds.has('twin')).toBe(true)
  })

  it('supports multi-way closure on twin-arc crests: alternate closure still resolves, canonical closure unlocks the crest', () => {
    // Force a curated multi-way crest (shippo has a twin tile at (1,2)).
    let crestBand = null
    for (let s = 1; s < 50; s++) {
      const dealt = generateNextBand({
        seed: s * 97,
        rngStep: 10,
        bandId: 7,
        worldRowBase: 0,
        challenge: 0.7,
        allowCrests: true,
        bandsSinceCrest: 6,
        recentCrests: [],
        discoveredCrests: [],
      })
      if (dealt.band.crestId && dealt.band.tiles.some((t) => t.kind === 'twin')) {
        crestBand = dealt.band
        break
      }
    }
    expect(crestBand).not.toBeNull()

    // 1. Canonical closure unlocks the crest and records its discovery.
    const baseState: KumikoState = {
      ...createKumiko({ seed: 42 }),
      bands: [crestBand!],
      nextWorldRow: crestBand!.tall,
      nextBandId: crestBand!.id + 1,
    }
    const canonicalSolved = solveBandCanonically(baseState, crestBand!.id)
    const { events: canonEvents } = takeEvents(canonicalSolved)
    expect(canonEvents.some((e) => e.type === 'crest' && e.crestId === crestBand!.crestId)).toBe(true)
    expect(canonicalSolved.discoveredCrests).toContain(crestBand!.crestId!)

    // 2. Alternate closure (twin tile left at non-canonical parity) still closes cleanly as a quiet knot.
    let altState = baseState
    const twinTile = crestBand!.tiles.find((t) => t.kind === 'twin')!
    // Ensure twin tile is at non-canonical parity (turns = 1), then solve all boundary tiles.
    if ((twinTile.turns & 1) === 0) {
      altState = tapTile(altState, crestBand!.id, twinTile.r, twinTile.c)
    }
    for (const tile of crestBand!.tiles) {
      if (tile.kind === 'twin') continue
      const liveBand = altState.bands.find((b) => b.id === crestBand!.id)!
      const liveTile = liveBand.tiles.find((t) => t.r === tile.r && t.c === tile.c)!
      const delta = turnsToCanonical(liveTile)
      for (let k = 0; k < delta; k++) {
        altState = tapTile(altState, crestBand!.id, tile.r, tile.c)
      }
    }
    const altBand = altState.bands.find((b) => b.id === crestBand!.id)!
    const { events: altEvents } = takeEvents(altState)
    expect(altBand.solved).toBe(true)
    expect(altBand.crestDiscovered).toBe(false)
    expect(altEvents.some((e) => e.type === 'knot')).toBe(true)
    expect(altEvents.some((e) => e.type === 'crest')).toBe(false)
  })

  it('advances the endless tapestry smoothly as bottom bands solve and validates saved JSON', () => {
    let state = createKumiko({ seed: 2026, calm: 0.2 })
    const startTarget = state.targetScrollRow
    const firstBandId = state.bands[0]!.id
    state = solveBandCanonically(state, firstBandId)
    expect(state.knotsClosed).toBeGreaterThan(0)
    expect(state.targetScrollRow).toBeGreaterThan(startTarget)

    // Scroll interpolates smoothly toward target on tick.
    const beforeScroll = state.scrollRow
    state = tickKumiko(state, 100)
    expect(state.scrollRow).toBeGreaterThan(beforeScroll)

    // Round-trip save validation accepts clean JSON and rejects corrupted blobs.
    const cloned = JSON.parse(JSON.stringify(state))
    expect(isKumikoState(cloned)).toBe(true)
    expect(isKumikoState({ version: 1, bands: [] })).toBe(false)
    expect(isKumikoState(null)).toBe(false)
  })

  it('enters rest mode on handoff acceptance and wakes cleanly on touch', () => {
    const ctx = { ...DEFAULT_NIGHT_CONTEXT, calm: 0.8 }
    let state = createKumiko({ seed: 77, calm: 0.8 })
    state = respondToHandoff(state, 'rest', ctx)
    expect(state.resting).toBe(true)
    state = wakeKumiko(state)
    expect(state.resting).toBe(false)

    const slower = respondToHandoff(state, 'slower', ctx)
    expect(slower.resting).toBe(false)
    expect(slower.pacing.manualSlowOffset).toBeGreaterThan(0)
  })
})
