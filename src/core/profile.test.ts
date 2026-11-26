import { describe, expect, it } from 'vitest'
import { arrangeGames, favourites } from './games/arrange'
import { GAMES } from './games/catalog'
import { EMPTY_PROFILE, profileDifficulty, profileIntent, profileSound, soundOrder } from './profile'
import { PRESETS } from './sound/catalog'

describe('profile defaults', () => {
  it('leads with what their phone habits point to', () => {
    expect(profileIntent({ ...EMPTY_PROFILE, habits: ['short_video'] })).toBe('light')
    expect(profileIntent({ ...EMPTY_PROFILE, habits: ['x_news', 'reading', 'short_video'] })).toBe('focus')
    expect(profileIntent({ ...EMPTY_PROFILE, habits: ['audio'] })).toBe('melt')
  })

  it('breaks a tie by how busy their mind is', () => {
    const tie = { ...EMPTY_PROFILE, habits: ['short_video', 'reading'] as const }
    expect(profileIntent({ ...tie, habits: [...tie.habits], mind: 0.9 })).toBe('focus')
    expect(profileIntent({ ...tie, habits: [...tie.habits], mind: 0.1 })).toBe('light')
  })

  it('without habits, gives a mind that won’t switch off a puzzle and a quiet one slow games', () => {
    expect(profileIntent({ ...EMPTY_PROFILE, factors: ['tired_wired'], mind: 0.2 })).toBe('focus')
    expect(profileIntent({ ...EMPTY_PROFILE, mind: 0.9 })).toBe('focus')
    expect(profileIntent({ ...EMPTY_PROFILE, mind: 0.2 })).toBe('melt')
  })

  it('starts music-and-podcast nights on easy, everyone else on medium', () => {
    expect(profileDifficulty({ ...EMPTY_PROFILE, habits: ['audio'] })).toBe('easy')
    expect(profileDifficulty({ ...EMPTY_PROFILE, habits: ['audio', 'games'] })).toBe('medium')
    expect(profileDifficulty(EMPTY_PROFILE)).toBe('medium')
  })

  it('moves music up the Sounds list for people who listen in bed', () => {
    expect(profileSound({ ...EMPTY_PROFILE, habits: ['audio'] })).toBe('nocturne')
  })

  it('puts the sounds they liked first and keeps every sound once', () => {
    const order = soundOrder({ ...EMPTY_PROFILE, liked: { music: 1, steady: -1 } })
    expect(new Set(order).size).toBe(PRESETS.length)
    expect(profileSound({ ...EMPTY_PROFILE, liked: { music: 1, steady: -1 } })).toBe('nocturne')
    expect(profileSound({ ...EMPTY_PROFILE, factors: ['noise'] })).toBe('theta-rain')
  })
})

describe('arranging the games on Play', () => {
  it('waits for enough plays before calling anything a favourite', () => {
    expect(favourites({ weave: 4 })).toEqual([])
    expect(favourites({ weave: 6, rally: 3, pond: 1 })).toEqual(['weave', 'rally'])
  })

  it('gives favourites the wide tiles and keeps all 13 games', () => {
    const { order, wide } = arrangeGames({ tonight: null, usual: 'melt', plays: { weave: 6, rally: 4 } })
    expect(order).toHaveLength(GAMES.length)
    expect(new Set(order).size).toBe(GAMES.length)
    expect(wide).toEqual(['weave', 'rally'])
    expect(order[0]).toBe('weave')
    expect(order[6]).toBe('rally')
  })

  it('lets tonight lead for one night, with a favourite still wide', () => {
    const { order, wide } = arrangeGames({ tonight: 'focus', usual: 'melt', plays: { pond: 8, hue: 3 } })
    expect(order[0]).toBe('nine')
    expect(wide).toEqual(['nine', 'pond'])
  })
})
