import { describe, expect, it } from 'vitest'
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
    expect(favourites({ weave: 6, rally: 3, pond: 1 })).toEqual(['weave', 'rally'])
  })

  it('gives favourites the wide tiles', () => {
    const { order, wide } = arrangeGames({ tonight: null, usual: 'melt', plays: { weave: 6, rally: 4 } })
    expect(wide).toEqual(['weave', 'rally'])
    expect(order[0]).toBe('weave')
  })

  it('lets tonight lead for one night, with a favourite still wide', () => {
    const { order, wide } = arrangeGames({ tonight: 'focus', usual: 'melt', plays: { pond: 8, hue: 3 } })
    expect(order[0]).toBe('nine')
    expect(wide).toEqual(['nine', 'pond'])
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
})
