import { describe, expect, it } from 'vitest'
import { choosePicture, maxFamiliesForCalm, MIN_SPACING, PICTURE_BOX_HEIGHT, PICTURES } from './pictures'

describe('pictures', () => {
  it('has distinct pictures, each 2–5 strokes', () => {
    expect(new Set(PICTURES.map((p) => p.id)).size).toBe(PICTURES.length)
    for (const p of PICTURES) {
      expect(p.families.length).toBeGreaterThanOrEqual(2)
      expect(p.families.length).toBeLessThanOrEqual(5)
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.kanji.length).toBeGreaterThan(0)
      for (const f of p.families) expect(f.points.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('keeps every bud inside the box and far enough apart for a lasso', () => {
    for (const p of PICTURES) {
      const pts = p.families.flatMap((f) => f.points)
      for (const [x, y] of pts) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(1)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(PICTURE_BOX_HEIGHT)
      }
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![1] - pts[j]![1]), p.id).toBeGreaterThanOrEqual(MIN_SPACING)
    }
  })

  it('chooses simpler pictures later in the night and avoids recent ones', () => {
    for (let i = 0; i < 50; i++) {
      expect(choosePicture(i / 50, 1).families.length).toBeLessThanOrEqual(maxFamiliesForCalm(1))
      expect(choosePicture(i / 50, 0.5).families.length).toBeLessThanOrEqual(4)
    }
    const recent = ['crescent', 'fuji', 'wave']
    for (let i = 0; i < 50; i++) expect(recent).not.toContain(choosePicture(i / 50, 0, recent).id)
  })
})
