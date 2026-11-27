import { describe, expect, it } from 'vitest'
import { FREE_GAMES } from '../access'
import { arrangeGames, favourites, PICKS, tonightPicks } from './arrange'
import { GAMES, GAMES_BY_INTENT } from './catalog'

describe('arranging the games on Play', () => {
  it('orders by the usual intent with no check-in, every game once', () => {
    const { order } = arrangeGames({ usual: 'focus', plays: {} })
    expect(order[0]).toBe('nine')
    expect(new Set(order).size).toBe(GAMES.length)
  })

  it('waits for enough plays before calling anything a favourite', () => {
    expect(favourites({ weave: 4 })).toEqual([])
    expect(favourites({ weave: 6, rally: 3, pond: 1 })).toEqual(['weave'])
  })

  it('gives the favourite the wide hero tile', () => {
    const { order, wide } = arrangeGames({ tonight: null, usual: 'melt', plays: { weave: 6, rally: 4 } })
    expect(wide).toEqual(['weave'])
    expect(order[0]).toBe('weave')
  })

  it('lets tonight lead the wide slot for one night', () => {
    const { order, wide } = arrangeGames({ tonight: 'focus', usual: 'melt', plays: { pond: 8, hue: 3 } })
    expect(order[0]).toBe('nine')
    expect(wide).toEqual(['nine'])
  })

  it('keeps all free unlocked games at the top on the free tier regardless of intent or locked plays', () => {
    for (const usual of ['melt', 'focus', 'light', null] as const) {
      const { order, wide } = arrangeGames({ usual, plays: { weave: 12, rally: 8 }, unlocked: false })
      expect(new Set(order.slice(0, FREE_GAMES.length))).toEqual(new Set(FREE_GAMES))
      expect(new Set(order).size).toBe(GAMES.length)
      expect(FREE_GAMES).toContain(wide[0])
      expect(wide).toHaveLength(1)
    }
  })

  it('puts a favourite free game first in the free tier', () => {
    const { order, wide } = arrangeGames({ usual: 'melt', plays: { nine: 7, settle: 4 }, unlocked: false })
    expect(order[0]).toBe('nine')
    expect(wide[0]).toBe('nine')
    expect(new Set(order.slice(0, FREE_GAMES.length))).toEqual(new Set(FREE_GAMES))
  })
})

describe("tonight's picks", () => {
  it('marks nothing when Inverna knows nothing', () => {
    expect(tonightPicks({ tonight: null, usual: null, plays: {} })).toEqual([])
  })

  it("follows tonight's check-in over the usual intent", () => {
    expect(tonightPicks({ tonight: 'light', usual: 'melt', plays: {} })).toEqual(GAMES_BY_INTENT.light.slice(0, PICKS))
  })

  it('puts a fitting favourite first on a usual night', () => {
    const picks = tonightPicks({ tonight: null, usual: 'melt', plays: { lanterns: 8, chime: 4 } })
    expect(picks[0]).toBe('lanterns')
    expect(new Set(picks).size).toBe(PICKS)
  })

  it("ignores a favourite that doesn't suit the intent", () => {
    const picks = tonightPicks({ tonight: null, usual: 'melt', plays: { rally: 12 } })
    expect(picks).toEqual(GAMES_BY_INTENT.melt.slice(0, PICKS))
  })

  it('only recommends playable free games on the free tier', () => {
    for (const intent of ['melt', 'focus', 'light'] as const) {
      const picks = tonightPicks({ tonight: intent, usual: null, plays: { lanterns: 10 }, unlocked: false })
      expect(picks).toHaveLength(PICKS)
      for (const id of picks) expect(FREE_GAMES).toContain(id)
    }
  })
})
