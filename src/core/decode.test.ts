import { describe, expect, it } from 'vitest'
import { isArrayOf, isNumber, isOneOf, isRecord, pickValid } from './decode'
import { installKeyValueStore, loadSaved, NAMESPACE } from './storage'

describe('decode', () => {
  it('keeps the fields that pass and the current value for the rest', () => {
    const current = { volume: 0.85, mode: 'a' as 'a' | 'b', tags: [] as number[] }
    const out = pickValid({ volume: 'loud', mode: 'b', tags: [1, 'x'], extra: 1 }, current, {
      volume: isNumber,
      mode: isOneOf(['a', 'b']),
      tags: isArrayOf(isNumber),
    })
    expect(out).toEqual({ volume: 0.85, mode: 'b', tags: [] })
  })

  it('gives the current value when the save is not an object', () => {
    const current = { volume: 0.85 }
    expect(pickValid([1], current, { volume: isNumber })).toBe(current)
    expect(pickValid(null, current, { volume: isNumber })).toBe(current)
  })
})

describe('loading a game save', () => {
  const map = new Map<string, string>()
  installKeyValueStore({
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  })
  const isSave = (v: unknown): v is { score: number } => isRecord(v) && isNumber(v.score)
  const fallback = { score: 0 }

  it('loads a save of the right shape', () => {
    map.set(NAMESPACE + 'game:x', JSON.stringify({ score: 12 }))
    expect(loadSaved('game:x', fallback, isSave)).toEqual({ score: 12 })
  })

  it('falls back for a missing, unreadable or wrong-shaped save', () => {
    map.delete(NAMESPACE + 'game:x')
    expect(loadSaved('game:x', fallback, isSave)).toBe(fallback)
    map.set(NAMESPACE + 'game:x', '{not json')
    expect(loadSaved('game:x', fallback, isSave)).toBe(fallback)
    map.set(NAMESPACE + 'game:x', JSON.stringify({ score: 'high' }))
    expect(loadSaved('game:x', fallback, isSave)).toBe(fallback)
    map.set(NAMESPACE + 'game:x', 'null')
    expect(loadSaved('game:x', fallback, isSave)).toBe(fallback)
  })
})
