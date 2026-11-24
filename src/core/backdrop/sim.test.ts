import { describe, expect, it } from 'vitest'
import { PRESETS } from '../sound/catalog'
import { BACKDROP_IDS, SCENE, SCENE_RGB, isBackdropId, resolveBackdrop } from './scenes'
import {
  LOOK_STRIDE,
  MAX_PARTICLES,
  MORPH_SECONDS,
  SCENE_PARTICLES,
  TRANSITION_SECONDS,
  chladniAt,
  createSim,
  particleLook,
  prewarm,
  simSnap,
  simStep,
  stringEnergy,
  type Sim,
  type SimEnv,
} from './sim'

const W = 390
const H = 844
const ENV: SimEnv = { timeScale: 1, intensity: 1, breathHz: 0.1 }

function run(s: Sim, seconds: number, target = s.sceneB) {
  for (let k = 0; k < Math.ceil(seconds * 30); k++) simStep(s, 1 / 30, ENV, target, null)
}

function aliveCount(s: Sim) {
  return s.alive.reduce((n, a) => n + a, 0)
}

function assertHealthy(s: Sim) {
  const out = new Array(LOOK_STRIDE).fill(0)
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (!s.alive[i]) continue
    expect(Number.isFinite(s.x[i])).toBe(true)
    expect(Number.isFinite(s.y[i])).toBe(true)
    if (particleLook(s, i, out, 0)) {
      for (const v of out) expect(Number.isFinite(v)).toBe(true)
      expect(out[3]).toBeGreaterThanOrEqual(0)
      expect(out[3]).toBeLessThanOrEqual(1.0001)
    }
  }
}

describe('backdrop scenes', () => {
  it('gives every preset its own scene', () => {
    expect(BACKDROP_IDS).toHaveLength(12)
    for (const p of PRESETS) {
      expect(isBackdropId(p.id)).toBe(true)
      expect(resolveBackdrop(p.id, p.mix)).toBe(p.id)
    }
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(BACKDROP_IDS.length)
    expect(SCENE_RGB).toHaveLength(12 * 12)
    expect(SCENE_PARTICLES).toHaveLength(12)
  })

  it('maps hand-built mixes to the scene of their dominant layer', () => {
    const base = PRESETS[0]!.mix
    expect(resolveBackdrop(null, { ...base, layers: { waves: 0.7 } })).toBe('low-tide')
    expect(resolveBackdrop(null, { ...base, layers: { fire: 0.4, rain: 0.1 } })).toBe('hearth')
    expect(resolveBackdrop(null, { ...base, classicalMotif: 'adagio' })).toBe('adagio-dusk')
  })
})

describe('backdrop simulation', () => {
  it.each(BACKDROP_IDS.map((id, i) => [id, i] as const))('%s runs and stays finite', (_id, scene) => {
    const s = createSim(W, H, scene, 1234)
    prewarm(s, 6)
    run(s, 20)
    assertHealthy(s)
    expect(aliveCount(s)).toBe(SCENE_PARTICLES[scene])
  })

  it.each(BACKDROP_IDS.map((id, i) => [id, i] as const))('morphs from %s into the next scene and settles', (_id, from) => {
    const to = (from + 1) % BACKDROP_IDS.length
    const s = createSim(W, H, from, 99)
    prewarm(s, 4)
    run(s, TRANSITION_SECONDS / 2, to)
    expect(s.prog).toBeGreaterThan(0)
    expect(s.prog).toBeLessThan(1)
    assertHealthy(s)
    run(s, TRANSITION_SECONDS + MORPH_SECONDS + 1.5, to)
    expect(s.prog).toBe(1)
    expect(s.sceneA).toBe(to)
    for (let i = 0; i < MAX_PARTICLES; i++) if (s.alive[i]) expect(s.owner[i]).toBe(to)
    expect(aliveCount(s)).toBe(SCENE_PARTICLES[to])
    assertHealthy(s)
  })

  it('survives a change of mind half way through a morph', () => {
    const s = createSim(W, H, SCENE.rain, 5)
    run(s, 1, SCENE.hearth)
    run(s, 0.8, SCENE.starfield)
    run(s, 0.5, SCENE.rain)
    run(s, TRANSITION_SECONDS + MORPH_SECONDS + 2, SCENE.rain)
    expect(s.prog).toBe(1)
    for (let i = 0; i < MAX_PARTICLES; i++) if (s.alive[i]) expect(s.owner[i]).toBe(SCENE.rain)
    expect(aliveCount(s)).toBe(SCENE_PARTICLES[SCENE.rain])
  })

  it('snaps without a morph for reduced motion', () => {
    const s = createSim(W, H, SCENE.tide, 8)
    simSnap(s, SCENE.cove)
    expect(s.prog).toBe(1)
    expect(aliveCount(s)).toBe(SCENE_PARTICLES[SCENE.cove])
  })

  it('plucks Nocturne strings in time with the motif notes', () => {
    const s = createSim(W, H, SCENE.nocturne, 3)
    const cue = { id: 1, kind: 'nocturne' as const, notes: [0, 0, 0.068, 2.8, 0.55, 1, 0.056, 1.9, 1.27, 3, 0.051, 2.1] }
    simStep(s, 1 / 30, ENV, SCENE.nocturne, cue)
    expect(stringEnergy(s, 0)).toBeGreaterThan(0.5)
    expect(stringEnergy(s, 2)).toBe(0)
    run(s, 0.6)
    expect(stringEnergy(s, 2)).toBeGreaterThan(0.4)
    run(s, 0.8)
    expect(stringEnergy(s, 6)).toBeGreaterThan(0.4)
  })

  it('moves Adagio sand onto the nodal lines', () => {
    const s = createSim(W, H, SCENE.adagio, 11)
    const meanF = () => {
      let sum = 0
      for (let i = 0; i < SCENE_PARTICLES[SCENE.adagio]!; i++) sum += Math.abs(chladniAt(s, s.x[i]!, s.y[i]!))
      return sum / SCENE_PARTICLES[SCENE.adagio]!
    }
    const before = meanF()
    run(s, 8)
    expect(meanF()).toBeLessThan(before * 0.5)
  })

  it('is deterministic for a seed', () => {
    const a = createSim(W, H, SCENE.hearth, 42)
    const b = createSim(W, H, SCENE.hearth, 42)
    run(a, 3, SCENE.cove)
    run(b, 3, SCENE.cove)
    expect(a.x).toEqual(b.x)
    expect(a.y).toEqual(b.y)
  })
})
