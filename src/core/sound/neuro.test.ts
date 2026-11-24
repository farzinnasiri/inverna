import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULE, type Schedule } from '../night'
import { computeDescent, sampleDescentCurve } from './arc'
import { DEFAULT_PRESET_ID, isSilent, PRESETS, presetById, SILENT_MIX } from './catalog'
import { HARMONIC_KEYS, resolveGameNotes, type HarmonicKeyId } from './harmonics'

describe('Neuroacoustic catalog', () => {
  it('promotes Theta Rain as the flagship default with 12 presets across 2 pages of 6', () => {
    expect(DEFAULT_PRESET_ID).toBe('theta-rain')
    expect(PRESETS[0]?.id).toBe('theta-rain')
    expect(presetById('rainfall')?.id).toBe('theta-rain')
    expect(PRESETS).toHaveLength(12)
    expect(PRESETS.filter((p) => p.page === 0)).toHaveLength(6)
    expect(PRESETS.filter((p) => p.page === 1)).toHaveLength(6)
    expect(presetById('nocturne')?.mix.classicalMotif).toBe('nocturne')
    expect(presetById('ink-reverie')?.mix.classicalMotif).toBe('reverie')
    for (const p of PRESETS) {
      expect(p.descentRange[0]).toBeGreaterThan(p.descentRange[1])
      expect(p.descentRange[1]).toBeGreaterThan(p.descentRange[2])
      expect(p.hint.length).toBeLessThanOrEqual(28)
      expect(HARMONIC_KEYS[p.harmonicKey]).toBeDefined()
      expect(isSilent(p.mix)).toBe(false)
    }
    expect(isSilent(SILENT_MIX)).toBe(true)
  })
})

describe('Harmonic game-cue quantizer', () => {
  it('quantizes every cue note strictly to the active scale and softens with Iso darkness', () => {
    const keys = Object.keys(HARMONIC_KEYS) as HarmonicKeyId[]
    for (const keyId of keys) {
      const scale = new Set(HARMONIC_KEYS[keyId].scaleHz)
      for (const cue of ['tap', 'place', 'clear', 'chime', 'undo'] as const) {
        const brightNotes = resolveGameNotes(cue, keyId, 3, 0)
        const darkNotes = resolveGameNotes(cue, keyId, 3, 1)
        expect(brightNotes.length).toBeGreaterThan(0)
        expect(darkNotes.length).toBe(brightNotes.length)
        for (let i = 0; i < brightNotes.length; i++) {
          expect(scale.has(brightNotes[i]!.freq)).toBe(true)
          expect(darkNotes[i]!.cutoff).toBeLessThan(brightNotes[i]!.cutoff)
          expect(darkNotes[i]!.gain).toBeLessThan(brightNotes[i]!.gain)
        }
      }
    }
  })

  it('cycles tap notes melodically across steps without static repetition', () => {
    const freqs = Array.from({ length: 6 }, (_, i) => resolveGameNotes('tap', 'd-dorian', i, 0)[0]!.freq)
    expect(new Set(freqs).size).toBeGreaterThanOrEqual(4)
  })
})

describe('60-minute Iso-descent engine', () => {
  const schedule: Schedule = { ...DEFAULT_SCHEDULE, bedtime: '23:00', enabled: true }
  const thetaPreset = presetById('theta-rain')!

  it('descends smoothly from Unwind -> Drift -> Still across the final 60 minutes before bedtime', () => {
    const t60 = new Date(2026, 10, 24, 22, 0, 0) // 60m before 23:00
    const t30 = new Date(2026, 10, 24, 22, 30, 0) // 30m before 23:00
    const t05 = new Date(2026, 10, 24, 22, 55, 0) // 5m before 23:00

    const d1 = computeDescent({ schedule, now: t60, preset: thetaPreset, depth: 'deep', followBedtime: true })
    const d2 = computeDescent({ schedule, now: t30, preset: thetaPreset, depth: 'deep', followBedtime: true })
    const d3 = computeDescent({ schedule, now: t05, preset: thetaPreset, depth: 'deep', followBedtime: true })

    expect(d1.phase).toBe('unwind')
    expect(d2.phase).toBe('drift')
    expect(d3.phase).toBe('still')

    // Modulation frequency drops, warmth darkens, and breath slows toward lights out
    expect(d1.modHz).toBeGreaterThan(d2.modHz)
    expect(d2.modHz).toBeGreaterThan(d3.modHz)
    expect(d1.masterCutoffHz).toBeGreaterThan(d2.masterCutoffHz)
    expect(d2.masterCutoffHz).toBeGreaterThan(d3.masterCutoffHz)
    expect(d1.cueDarkness).toBeLessThan(d3.cueDarkness)
    expect(d3.breathHz).toBeGreaterThanOrEqual(0.085)
    expect(d3.breathHz).toBeLessThanOrEqual(0.11)
  })

  it('respects modulation depth Off / Subtle / Deep', () => {
    const now = new Date(2026, 10, 24, 22, 30, 0)
    const off = computeDescent({ schedule, now, preset: thetaPreset, depth: 'off', followBedtime: true })
    const subtle = computeDescent({ schedule, now, preset: thetaPreset, depth: 'subtle', followBedtime: true })
    const deep = computeDescent({ schedule, now, preset: thetaPreset, depth: 'deep', followBedtime: true })

    expect(off.amDepth).toBe(0)
    expect(off.binauralScale).toBe(0)
    expect(subtle.amDepth).toBeGreaterThan(0)
    expect(deep.amDepth).toBeGreaterThan(subtle.amDepth)
  })

  it('samples a monotonically descending 60-minute curve for UI visualization', () => {
    const pts = sampleDescentCurve(thetaPreset, 20)
    expect(pts).toHaveLength(20)
    expect(pts[0]!.hz).toBeCloseTo(thetaPreset.descentRange[0], 2)
    expect(pts[pts.length - 1]!.hz).toBeCloseTo(thetaPreset.descentRange[2], 2)
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.hz).toBeLessThanOrEqual(pts[i - 1]!.hz)
    }
  })
})
