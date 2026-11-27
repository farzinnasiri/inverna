import { describe, expect, it } from 'vitest'
import { PRESETS } from '../sound/catalog'
import { BACKDROP_IDS, SCENE, SCENE_RGB, isBackdropId, resolveBackdrop, resolveBlend } from './scenes'
import {
  LOOK_STRIDE,
  MAX_PARTICLES,
  MORPH_SECONDS,
  SCENE_PARTICLES,
  TRANSITION_SECONDS,
  WAVE_SECONDS,
  breatheIn,
  breatheOut,
  chladniAt,
  createSim,
  particleLook,
  prewarm,
  simSnap,
  simStep,
  stringEnergy,
  waveBand,
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
    for (const p of PRESETS) {
      expect(isBackdropId(p.id)).toBe(true)
      expect(resolveBackdrop(p.id, p.mix)).toBe(p.id)
    }
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(BACKDROP_IDS.length)
    // Colours (4 x RGB) and a particle count for every scene, in the same order.
    expect(SCENE_RGB).toHaveLength(BACKDROP_IDS.length * 12)
    expect(SCENE_PARTICLES).toHaveLength(BACKDROP_IDS.length)
  })

  it('maps hand-built mixes to the scene of their dominant layer', () => {
    const base = PRESETS[0]!.mix
    expect(resolveBackdrop(null, { ...base, layers: { waves: 0.7 } })).toBe('low-tide')
    expect(resolveBackdrop(null, { ...base, layers: { fire: 0.4, rain: 0.1 } })).toBe('hearth')
    expect(resolveBackdrop(null, { ...base, classicalMotif: 'adagio' })).toBe('adagio-dusk')
  })
})

describe('woven scenes', () => {
  const base = PRESETS[0]!.mix
  const count = (s: Sim, scene: number) => s.owner.filter((o, i) => s.alive[i] && o === scene).length

  it('weaves the other loud layers of a hand-made mix, never a preset', () => {
    expect(resolveBlend('theta-rain', base)).toEqual([])
    const both = { ...base, band: null, layers: { rain: 1, fire: 1 } }
    expect(resolveBackdrop(null, both)).toBe('theta-rain')
    expect(resolveBlend(null, both)).toEqual([SCENE.hearth, 1])
    // A trace of a layer isn't enough to show.
    expect(resolveBlend(null, { ...base, band: null, layers: { rain: 1, fire: 0.1 } })).toEqual([])
  })

  it('shares one particle budget: rain and fire together cost no more than one scene', () => {
    const s = createSim(W, H, SCENE.rain, 7)
    prewarm(s, 3)
    for (let k = 0; k < 30 * 20; k++) simStep(s, 1 / 30, ENV, SCENE.rain, null, [SCENE.hearth, 1])
    assertHealthy(s)
    const rain = count(s, SCENE.rain)
    const fire = count(s, SCENE.hearth)
    expect(rain).toBeGreaterThan(SCENE_PARTICLES[SCENE.rain]! * 0.3)
    expect(fire).toBeGreaterThan(SCENE_PARTICLES[SCENE.hearth]! * 0.3)
    expect(aliveCount(s)).toBeLessThanOrEqual(Math.max(SCENE_PARTICLES[SCENE.rain]!, SCENE_PARTICLES[SCENE.hearth]!))
  })

  it('everything up is a little of everything, within the busiest scene\'s budget', () => {
    const all = { ...base, band: null, layers: { rain: 1, waves: 1, fire: 1, wind: 1, brown: 1 } }
    const main = BACKDROP_IDS.indexOf(resolveBackdrop(null, all))
    const blend = resolveBlend(null, all)
    const s = createSim(W, H, main, 3)
    for (let k = 0; k < 30 * 25; k++) simStep(s, 1 / 30, ENV, main, null, blend)
    assertHealthy(s)
    const scenes = [main, ...blend.filter((_, i) => i % 2 === 0)]
    expect(scenes).toHaveLength(4)
    for (const sc of scenes) expect(count(s, sc)).toBeGreaterThan(0)
    expect(aliveCount(s)).toBeLessThanOrEqual(Math.max(...scenes.map((sc) => SCENE_PARTICLES[sc]!)))
  })

  it('goes back to one scene when the other layer is turned down', () => {
    const s = createSim(W, H, SCENE.rain, 11)
    for (let k = 0; k < 30 * 10; k++) simStep(s, 1 / 30, ENV, SCENE.rain, null, [SCENE.hearth, 1])
    for (let k = 0; k < 30 * 30; k++) simStep(s, 1 / 30, ENV, SCENE.rain, null, [])
    expect(count(s, SCENE.hearth)).toBe(0)
    expect(aliveCount(s)).toBeLessThanOrEqual(SCENE_PARTICLES[SCENE.rain]!)
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

describe('the breath from the island', () => {
  const OX = W / 2
  const OY = 48

  /** Mean distance of the scene's live particles from where the breath gathers. */
  function meanDistance(s: Sim) {
    let sum = 0
    let n = 0
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!s.alive[i]) continue
      sum += Math.hypot(s.x[i]! - OX, s.y[i]! - OY)
      n++
    }
    return sum / n
  }

  it('gathers matter toward the island on the in-breath', () => {
    const still = createSim(W, H, SCENE.starfield, 11)
    const held = createSim(W, H, SCENE.starfield, 11)
    prewarm(still, 3)
    prewarm(held, 3)
    breatheIn(held, OX, OY, 1)
    run(still, 4)
    run(held, 4)
    expect(held.charge).toBeGreaterThan(0.9)
    expect(meanDistance(held)).toBeLessThan(meanDistance(still) - 10)
    assertHealthy(held)
  })

  it('sends a wave across the whole screen that pushes matter out, then is gone', () => {
    const calm = createSim(W, H, SCENE.delta, 5)
    const s = createSim(W, H, SCENE.delta, 5)
    prewarm(calm, 3)
    prewarm(s, 3)
    breatheIn(s, OX, OY, 0)
    breatheOut(s, 1)
    let lastR = 0
    for (let k = 0; k < 30; k++) {
      simStep(s, 1 / 30, ENV, s.sceneB, null)
      simStep(calm, 1 / 30, ENV, calm.sceneB, null)
      expect(s.waveR).toBeGreaterThanOrEqual(lastR)
      lastR = s.waveR
    }
    // A second in, the front is well down the screen and lit where it is.
    expect(s.waveR).toBeGreaterThan(H * 0.6)
    expect(waveBand(s, OX, OY + s.waveR)).toBeGreaterThan(0.2)
    expect(meanDistance(s)).toBeGreaterThan(meanDistance(calm) + 3)
    assertHealthy(s)
    run(s, WAVE_SECONDS)
    expect(s.waveR).toBe(-1)
    expect(waveBand(s, OX, H / 2)).toBe(0)
  })

  it('strums every Nocturne string as the wave reaches it, nearest first', () => {
    const s = createSim(W, H, SCENE.nocturne, 3)
    // Quiet strings and no automatic plucks, so only the wave sounds them.
    s.strAmp.fill(0)
    s.pluckAuto = 1e9
    breatheIn(s, OX, OY, 0)
    breatheOut(s, 1)
    const firstSounded: number[] = new Array(s.strAmp.length).fill(-1)
    for (let k = 0; k < Math.ceil(WAVE_SECONDS * 30); k++) {
      simStep(s, 1 / 30, ENV, s.sceneB, null)
      s.pluckAuto = 1e9
      s.strAmp.forEach((_, j) => {
        if (firstSounded[j] === -1 && stringEnergy(s, j) > 0.4) firstSounded[j] = k
      })
    }
    expect(firstSounded.every((f) => f >= 0)).toBe(true)
    const mid = Math.floor(firstSounded.length / 2)
    expect(firstSounded[mid]!).toBeLessThan(firstSounded[0]!)
    expect(firstSounded[mid]!).toBeLessThan(firstSounded[firstSounded.length - 1]!)
  })
})
