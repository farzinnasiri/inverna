import { describe, expect, it } from 'vitest'
import { color, hexToRgb, pieces, resolveTokens } from './tokens'

describe('Low Light tokens & OKLab warmth', () => {
  it('keeps bg and surfaces untouched at every warmth level', () => {
    for (const w of [0, 0.3, 0.5, 1]) {
      const r = resolveTokens(w)
      expect(r.color.bg).toBe('#000000')
      expect(r.color.surface1).toBe(color.surface1)
      expect(r.color.surface2).toBe(color.surface2)
      expect(r.color.surface3).toBe(color.surface3)
    }
  })

  it('returns exact base colours at warmth = 0', () => {
    const r = resolveTokens(0)
    expect(r.color.ink).toBe(color.ink)
    expect(r.pieces.clay).toBe(pieces.clay)
    expect(r.pieces.bone).toBe(pieces.bone)
  })

  it('lowers blue emission on ink and pieces at warmth = 1', () => {
    const base = resolveTokens(0)
    const warm = resolveTokens(1)
    const [, , bBase] = hexToRgb(base.color.ink)
    const [, , bWarm] = hexToRgb(warm.color.ink)
    expect(bWarm).toBeLessThan(bBase)

    const [, , pbBase] = hexToRgb(base.pieces.bone)
    const [, , pbWarm] = hexToRgb(warm.pieces.bone)
    expect(pbWarm).toBeLessThan(pbBase)
  })
})
