import { describe, expect, it } from 'vitest'
import { PRESETS } from './sound/catalog'
import { DAY_ANSWERS, NOW_ANSWERS, planTonight } from './tonight'

describe('tonight plan from the check-in', () => {
  it('slows things down when sleepy or worn out, whatever the day was', () => {
    for (const day of DAY_ANSWERS) {
      expect(planTonight(day, 'sleepy').intent).toBe('melt')
      expect(planTonight(day, 'worn_out').intent).toBe('melt')
    }
  })

  it('gives a racing mind a puzzle and a good day something light', () => {
    expect(planTonight('stressful', 'overthinking').intent).toBe('focus')
    expect(planTonight('good', 'wide_awake').intent).toBe('light')
  })

  it('has a plan for every pair of answers, with two different real sounds', () => {
    const ids = new Set(PRESETS.map((p) => p.id))
    for (const day of DAY_ANSWERS) {
      for (const now of NOW_ANSWERS) {
        const [a, b] = planTonight(day, now).sounds
        expect(ids.has(a), `${day}/${now}: ${a}`).toBe(true)
        expect(ids.has(b), `${day}/${now}: ${b}`).toBe(true)
        expect(a).not.toBe(b)
      }
    }
  })
})
