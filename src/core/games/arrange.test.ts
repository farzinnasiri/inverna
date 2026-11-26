import { describe, expect, it } from 'vitest'
import { arrangeGames, PICKS, tonightPicks } from './arrange'
import { GAMES_BY_INTENT } from './catalog'

describe('arrangeGames', () => {
  it('orders by the usual intent with no check-in', () => {
    const { order } = arrangeGames({ usual: 'focus', plays: {} })
    expect(order[0]).toBe('nine')
    expect(order).toHaveLength(GAMES_BY_INTENT.focus.length)
  })

  it('gives favourites the wide tiles once there are enough plays', () => {
    const { wide } = arrangeGames({ usual: 'melt', plays: { settle: 6, chime: 4, pond: 1 } })
    expect(wide).toEqual(['settle', 'chime'])
  })
})

describe('tonightPicks', () => {
  it('marks nothing when Lull knows nothing', () => {
    expect(tonightPicks({ tonight: null, usual: null, plays: {} })).toEqual([])
  })

  it("follows tonight's check-in over the usual intent", () => {
    expect(tonightPicks({ tonight: 'light', usual: 'melt', plays: {} })).toEqual(GAMES_BY_INTENT.light.slice(0, PICKS))
  })

  it('puts a fitting favourite first on a usual night', () => {
    const picks = tonightPicks({ tonight: null, usual: 'melt', plays: { lanterns: 8, chime: 4 } })
    expect(picks[0]).toBe('lanterns')
    expect(picks).toHaveLength(PICKS)
    expect(new Set(picks).size).toBe(PICKS)
  })

  it("ignores a favourite that doesn't suit the intent", () => {
    const picks = tonightPicks({ tonight: null, usual: 'melt', plays: { rally: 12 } })
    expect(picks).toEqual(GAMES_BY_INTENT.melt.slice(0, PICKS))
  })
})
