import { describe, expect, it } from 'vitest'
import { noteNightUsed, reviewDue } from './reviewPrompt'

const nights = (n: number) => Array.from({ length: n }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`)
const now = new Date(2026, 11, 1, 21, 0)

describe('asking for a rating', () => {
  it('only once someone has used Inverna on five different nights', () => {
    expect(reviewDue({ nightsUsed: nights(4), lastAskAt: null }, now)).toBe(false)
    expect(reviewDue({ nightsUsed: nights(5), lastAskAt: null }, now)).toBe(true)
  })

  it('months apart', () => {
    const lastAskAt = now.getTime() - 30 * 86_400_000
    expect(reviewDue({ nightsUsed: nights(10), lastAskAt }, now)).toBe(false)
    expect(reviewDue({ nightsUsed: nights(10), lastAskAt: now.getTime() - 121 * 86_400_000 }, now)).toBe(true)
  })

  it('counts each night once', () => {
    expect(noteNightUsed(['2026-11-01'], '2026-11-01')).toEqual(['2026-11-01'])
    expect(noteNightUsed(nights(30), '2026-12-15')).toHaveLength(30)
  })
})
