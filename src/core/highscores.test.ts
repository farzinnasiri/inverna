import { describe, expect, it } from 'vitest'
import {
  bestFor,
  EMPTY_HIGH_SCORES,
  formatBestCompact,
  formatScoreValue,
  isBetterScore,
  recordScore,
} from './highscores'

describe('highscores', () => {
  it('tracks higher-is-better games accurately', () => {
    let table = EMPTY_HIGH_SCORES
    const r1 = recordScore(table, 'kindle', 256, 1000)
    expect(r1.isNewBest).toBe(true)
    expect(r1.best).toBe(256)
    table = r1.table

    const r2 = recordScore(table, 'kindle', 128, 2000)
    expect(r2.isNewBest).toBe(false)
    expect(r2.best).toBe(256)
    expect(r2.table).toBe(table)

    const r3 = recordScore(table, 'kindle', 1024, 3000)
    expect(r3.isNewBest).toBe(true)
    expect(r3.best).toBe(1024)
    expect(bestFor(r3.table, 'kindle')).toBe(1024)
  })

  it('tracks lower-is-better games accurately', () => {
    let table = EMPTY_HIGH_SCORES
    const r1 = recordScore(table, 'drift', 64, 1000)
    expect(r1.isNewBest).toBe(true)
    expect(r1.best).toBe(64)
    table = r1.table

    const r2 = recordScore(table, 'drift', 80, 2000)
    expect(r2.isNewBest).toBe(false)
    expect(r2.best).toBe(64)

    const r3 = recordScore(table, 'drift', 42, 3000)
    expect(r3.isNewBest).toBe(true)
    expect(r3.best).toBe(42)
  })

  it('ignores zero, negative, and non-finite candidates', () => {
    expect(isBetterScore('cascade', 0, null)).toBe(false)
    expect(isBetterScore('cascade', -10, null)).toBe(false)
    expect(isBetterScore('cascade', Number.NaN, null)).toBe(false)
    expect(isBetterScore('drift', 0, 50)).toBe(false)
  })

  it('formats full and compact score strings cleanly', () => {
    expect(formatScoreValue('kindle', 2048)).toBe('2,048')
    expect(formatScoreValue('settle', 1)).toBe('1 line')
    expect(formatScoreValue('settle', 12)).toBe('12 lines')
    expect(formatScoreValue('drift', 42)).toBe('42 moves')
    expect(formatBestCompact('kindle', 2048)).toBe('2,048')
    expect(formatBestCompact('drift', 42)).toBe('42m')
    expect(formatBestCompact('drift', null)).toBeNull()
  })
})

describe('records by board size', () => {
  it('keeps a separate fewest-moves record for each size', async () => {
    const { recordScore, bestFor, latestBest } = await import('./highscores')
    let t = recordScore({}, 'drift', 40, 1, '3x3').table
    t = recordScore(t, 'drift', 120, 2, '4x4').table
    // A 4×4 board's 120 moves don't lose to a 3×3's 40.
    expect(bestFor(t, 'drift', '3x3')).toBe(40)
    expect(bestFor(t, 'drift', '4x4')).toBe(120)
    expect(latestBest(t, 'drift')).toBe(120)
  })
})
