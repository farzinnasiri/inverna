import { describe, expect, it } from 'vitest'
import { KUMIKO_COLS } from './generator'
import { VERIFIED_CRESTS } from './patterns'
import { PORT_E, PORT_N, PORT_S, PORT_W } from './types'

const DIRS = [
  { bit: PORT_N, opp: PORT_S, dr: -1, dc: 0 },
  { bit: PORT_E, opp: PORT_W, dr: 0, dc: 1 },
  { bit: PORT_S, opp: PORT_N, dr: 1, dc: 0 },
  { bit: PORT_W, opp: PORT_E, dr: 0, dc: -1 },
] as const

describe('Kumiko hand-authored crests', () => {
  it('never ships an unsolvable crest with dangling ports or out-of-bounds coordinates', () => {
    const ids = new Set<string>()
    for (const crest of VERIFIED_CRESTS) {
      expect(ids.has(crest.id), `duplicate id ${crest.id}`).toBe(false)
      ids.add(crest.id)

      const byPos = new Map<string, (typeof crest.tiles)[number]>()
      for (const t of crest.tiles) {
        expect(t.r, `${crest.id} row`).toBeGreaterThanOrEqual(0)
        expect(t.r, `${crest.id} row`).toBeLessThan(crest.tall)
        expect(t.c, `${crest.id} col`).toBeGreaterThanOrEqual(0)
        expect(t.c, `${crest.id} col`).toBeLessThan(KUMIKO_COLS)
        const key = `${t.r},${t.c}`
        expect(byPos.has(key), `${crest.id} duplicate tile at ${key}`).toBe(false)
        byPos.set(key, t)
      }

      for (const t of crest.tiles) {
        const mask = t.kind === 'twin' ? 15 : t.mask
        for (const d of DIRS) {
          if (!(mask & d.bit)) continue
          const nb = byPos.get(`${t.r + d.dr},${t.c + d.dc}`)
          expect(nb, `${crest.id} (${t.r},${t.c}) points to missing neighbor`).toBeDefined()
          const nbMask = nb!.kind === 'twin' ? 15 : nb!.mask
          expect(nbMask & d.opp, `${crest.id} (${t.r},${t.c}) port mismatch`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('gives every multi-way crest at least one twin-arc crossover so multiple closed topologies exist', () => {
    const multiway = VERIFIED_CRESTS.filter((c) => c.multiway)
    expect(multiway.length).toBeGreaterThan(0)
    for (const crest of multiway) {
      expect(
        crest.tiles.some((t) => t.kind === 'twin'),
        `${crest.id} marked multiway without a twin tile`,
      ).toBe(true)
    }
  })
})
