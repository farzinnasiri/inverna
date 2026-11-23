import type { LayerId } from '@/core/sound/catalog'
import type { NoiseBufferBank } from './buffers'
import { clamp, rampParam, safeDisconnect, safeStop } from './params'

export interface AmbientLayer {
  readonly id: LayerId
  setGain(gain: number, fadeSeconds: number): void
  dispose(): void
}

/**
 * Perceptual loudness balancing per layer so 100% on any slider feels calm,
 * warm, and roughly matched to the other layers.
 */
const LAYER_SCALE: Record<LayerId, number> = {
  white: 0.22,
  pink: 0.38,
  brown: 0.65,
  rain: 0.58,
  waves: 0.6,
  fire: 0.65,
  wind: 0.56,
}

function createLoopingSource(ctx: AudioContext, buffer: AudioBuffer, offsetSeconds = 0): AudioBufferSourceNode {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const safeOffset = buffer.duration > 0 ? offsetSeconds % buffer.duration : 0
  src.start(ctx.currentTime, safeOffset)
  return src
}

function createFilter(
  ctx: AudioContext,
  type: BiquadFilterType,
  frequency: number,
  q = 0.7,
  gain = 0,
): BiquadFilterNode {
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency
  filter.Q.value = q
  if (gain !== 0) filter.gain.value = gain
  return filter
}

function createLfo(ctx: AudioContext, frequencyHz: number, phaseRadians = 0): OscillatorNode {
  const osc = ctx.createOscillator()
  osc.frequency.value = frequencyHz
  if (phaseRadians !== 0 && typeof ctx.createPeriodicWave === 'function') {
    const real = new Float32Array([0, Math.cos(phaseRadians)])
    const imag = new Float32Array([0, Math.sin(phaseRadians)])
    try {
      osc.setPeriodicWave(ctx.createPeriodicWave(real, imag))
    } catch {
      osc.type = 'sine'
    }
  } else {
    osc.type = 'sine'
  }
  osc.start(ctx.currentTime)
  return osc
}

function createOptionalPanner(ctx: AudioContext, pan: number): StereoPannerNode | null {
  if (typeof ctx.createStereoPanner !== 'function') return null
  try {
    const panner = ctx.createStereoPanner()
    panner.pan.value = clamp(pan, -1, 1)
    return panner
  } catch {
    return null
  }
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function makeLayerHandle(
  ctx: AudioContext,
  id: LayerId,
  outputGain: GainNode,
  cleanup: () => void,
): AmbientLayer {
  let disposed = false
  return {
    id,
    setGain(gain, fadeSeconds) {
      if (disposed) return
      const target = clamp(gain, 0, 1) * LAYER_SCALE[id]
      rampParam(outputGain.gain, target, fadeSeconds, ctx.currentTime)
    },
    dispose() {
      if (disposed) return
      disposed = true
      cleanup()
      safeDisconnect(outputGain)
    },
  }
}

function createWhiteLayer(ctx: AudioContext, bank: NoiseBufferBank, destination: AudioNode): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  const lowpass = createFilter(ctx, 'lowpass', 6000, 0.5)
  const src = createLoopingSource(ctx, bank.get('white'))

  src.connect(lowpass)
  lowpass.connect(output)
  output.connect(destination)

  return makeLayerHandle(ctx, 'white', output, () => {
    safeStop(src)
    safeDisconnect(src)
    safeDisconnect(lowpass)
  })
}

function createPinkLayer(ctx: AudioContext, bank: NoiseBufferBank, destination: AudioNode): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  const warmth = createFilter(ctx, 'lowshelf', 260, 0.7, 2.5)
  const lowpass = createFilter(ctx, 'lowpass', 4800, 0.5)
  const src = createLoopingSource(ctx, bank.get('pink'))

  src.connect(warmth)
  warmth.connect(lowpass)
  lowpass.connect(output)
  output.connect(destination)

  return makeLayerHandle(ctx, 'pink', output, () => {
    safeStop(src)
    safeDisconnect(src)
    safeDisconnect(warmth)
    safeDisconnect(lowpass)
  })
}

function createBrownLayer(ctx: AudioContext, bank: NoiseBufferBank, destination: AudioNode): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  const subClean = createFilter(ctx, 'highpass', 30, 0.5)
  const lowpass = createFilter(ctx, 'lowpass', 320, 0.65)
  const src = createLoopingSource(ctx, bank.get('brown'))

  src.connect(subClean)
  subClean.connect(lowpass)
  lowpass.connect(output)
  output.connect(destination)

  return makeLayerHandle(ctx, 'brown', output, () => {
    safeStop(src)
    safeDisconnect(src)
    safeDisconnect(subClean)
    safeDisconnect(lowpass)
  })
}

function createRainLayer(ctx: AudioContext, bank: NoiseBufferBank, destination: AudioNode): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)

  const pinkBuffer = bank.get('pink')
  const whiteBuffer = bank.get('white')

  // Steady warm rain bed
  const bedSrc = createLoopingSource(ctx, pinkBuffer)
  const bedHp = createFilter(ctx, 'highpass', 260, 0.5)
  const bedLp = createFilter(ctx, 'lowpass', 3600, 0.6)
  const bedGain = ctx.createGain()
  bedGain.gain.value = 0.55

  bedSrc.connect(bedHp)
  bedHp.connect(bedLp)
  bedLp.connect(bedGain)
  bedGain.connect(output)

  // Gentle soft air sheen
  const sheenSrc = createLoopingSource(ctx, whiteBuffer, 4.3)
  const sheenBp = createFilter(ctx, 'bandpass', 2300, 0.7)
  const sheenGain = ctx.createGain()
  sheenGain.gain.value = 0.09

  sheenSrc.connect(sheenBp)
  sheenBp.connect(sheenGain)
  sheenGain.connect(output)

  // Subtle randomized soft droplet envelope bursts
  let active = true
  let timerId: ReturnType<typeof setTimeout> | null = null
  const activeDrops = new Set<AudioBufferSourceNode>()

  const spawnDroplet = () => {
    if (!active || ctx.state !== 'running') return
    try {
      const now = ctx.currentTime
      const buffer = Math.random() < 0.7 ? pinkBuffer : whiteBuffer
      const src = ctx.createBufferSource()
      src.buffer = buffer

      const duration = randomBetween(0.03, 0.065)
      const maxOffset = Math.max(0, buffer.duration - duration - 0.05)
      const offset = maxOffset > 0 ? Math.random() * maxOffset : 0

      const bp = createFilter(ctx, 'bandpass', randomBetween(950, 2600), randomBetween(2.8, 5.2))
      const env = ctx.createGain()
      const peak = randomBetween(0.024, 0.064)
      const attack = randomBetween(0.003, 0.006)

      env.gain.setValueAtTime(0.0001, now)
      env.gain.linearRampToValueAtTime(peak, now + attack)
      env.gain.exponentialRampToValueAtTime(0.0001, now + duration)

      const panner = createOptionalPanner(ctx, randomBetween(-0.75, 0.75))
      src.connect(bp)
      if (panner) {
        bp.connect(panner)
        panner.connect(env)
      } else {
        bp.connect(env)
      }
      env.connect(output)

      activeDrops.add(src)
      src.onended = () => {
        activeDrops.delete(src)
        safeDisconnect(src)
        safeDisconnect(bp)
        safeDisconnect(panner)
        safeDisconnect(env)
      }
      src.start(now, offset, duration + 0.01)
    } catch {
      // Ignore scheduling errors in mock/restricted environments.
    }
  }

  const scheduleNext = () => {
    if (!active) return
    timerId = setTimeout(() => {
      timerId = null
      if (!active) return
      spawnDroplet()
      if (Math.random() < 0.25) spawnDroplet()
      scheduleNext()
    }, Math.round(randomBetween(150, 460)))
  }
  scheduleNext()

  return makeLayerHandle(ctx, 'rain', output, () => {
    active = false
    if (timerId !== null) {
      clearTimeout(timerId)
      timerId = null
    }
    for (const drop of activeDrops) {
      safeStop(drop)
      safeDisconnect(drop)
    }
    activeDrops.clear()
    safeStop(bedSrc)
    safeStop(sheenSrc)
    safeDisconnect(bedSrc)
    safeDisconnect(bedHp)
    safeDisconnect(bedLp)
    safeDisconnect(bedGain)
    safeDisconnect(sheenSrc)
    safeDisconnect(sheenBp)
    safeDisconnect(sheenGain)
  })
}

function createWavesLayer(ctx: AudioContext, bank: NoiseBufferBank, destination: AudioNode): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)

  const brownSrc = createLoopingSource(ctx, bank.get('brown'))
  const deepLp = createFilter(ctx, 'lowpass', 420, 0.6)
  const deepGain = ctx.createGain()
  deepGain.gain.value = 0.72

  const pinkSrc = createLoopingSource(ctx, bank.get('pink'), 3.1)
  const foamHp = createFilter(ctx, 'highpass', 120, 0.5)
  const foamLp = createFilter(ctx, 'lowpass', 1650, 0.5)
  const foamGain = ctx.createGain()
  foamGain.gain.value = 0.34

  // Shared surf lowpass and VCA modulated by two slow phase-offset LFOs (~8.5s and ~11.2s)
  const surfFilter = createFilter(ctx, 'lowpass', 620, 0.7)
  const surfVca = ctx.createGain()
  surfVca.gain.value = 0.55

  const lfo1 = createLfo(ctx, 1 / 8.5, 0)
  const lfo1FreqDepth = ctx.createGain()
  lfo1FreqDepth.gain.value = 250
  const lfo1GainDepth = ctx.createGain()
  lfo1GainDepth.gain.value = 0.22

  const lfo2 = createLfo(ctx, 1 / 11.2, (115 * Math.PI) / 180)
  const lfo2FreqDepth = ctx.createGain()
  lfo2FreqDepth.gain.value = 170
  const lfo2GainDepth = ctx.createGain()
  lfo2GainDepth.gain.value = 0.15

  brownSrc.connect(deepLp)
  deepLp.connect(deepGain)
  deepGain.connect(surfFilter)

  pinkSrc.connect(foamHp)
  foamHp.connect(foamLp)
  foamLp.connect(foamGain)
  foamGain.connect(surfFilter)

  surfFilter.connect(surfVca)
  surfVca.connect(output)

  lfo1.connect(lfo1FreqDepth)
  lfo1FreqDepth.connect(surfFilter.frequency)
  lfo1.connect(lfo1GainDepth)
  lfo1GainDepth.connect(surfVca.gain)

  lfo2.connect(lfo2FreqDepth)
  lfo2FreqDepth.connect(surfFilter.frequency)
  lfo2.connect(lfo2GainDepth)
  lfo2GainDepth.connect(surfVca.gain)

  return makeLayerHandle(ctx, 'waves', output, () => {
    safeStop(brownSrc)
    safeStop(pinkSrc)
    safeStop(lfo1)
    safeStop(lfo2)
    safeDisconnect(brownSrc)
    safeDisconnect(deepLp)
    safeDisconnect(deepGain)
    safeDisconnect(pinkSrc)
    safeDisconnect(foamHp)
    safeDisconnect(foamLp)
    safeDisconnect(foamGain)
    safeDisconnect(surfFilter)
    safeDisconnect(surfVca)
    safeDisconnect(lfo1)
    safeDisconnect(lfo1FreqDepth)
    safeDisconnect(lfo1GainDepth)
    safeDisconnect(lfo2)
    safeDisconnect(lfo2FreqDepth)
    safeDisconnect(lfo2GainDepth)
  })
}

function createFireLayer(ctx: AudioContext, bank: NoiseBufferBank, destination: AudioNode): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)

  const brownBuffer = bank.get('brown')
  const pinkBuffer = bank.get('pink')
  const whiteBuffer = bank.get('white')

  // Deep hearth rumble (~140Hz lowpass) with subtle organic flicker
  const rumbleSrc = createLoopingSource(ctx, brownBuffer)
  const rumbleLp = createFilter(ctx, 'lowpass', 140, 0.75)
  const rumbleVca = ctx.createGain()
  rumbleVca.gain.value = 0.78

  const flickerLfo = createLfo(ctx, 0.23)
  const flickerDepth = ctx.createGain()
  flickerDepth.gain.value = 0.11

  rumbleSrc.connect(rumbleLp)
  rumbleLp.connect(rumbleVca)
  rumbleVca.connect(output)
  flickerLfo.connect(flickerDepth)
  flickerDepth.connect(rumbleVca.gain)

  // Warm mid-low ember bed
  const emberSrc = createLoopingSource(ctx, pinkBuffer, 5.7)
  const emberBp = createFilter(ctx, 'bandpass', 360, 0.9)
  const emberGain = ctx.createGain()
  emberGain.gain.value = 0.1

  emberSrc.connect(emberBp)
  emberBp.connect(emberGain)
  emberGain.connect(output)

  // Occasional soft filtered woody crackles (never loud or startling)
  let active = true
  let timerId: ReturnType<typeof setTimeout> | null = null
  const subTimers = new Set<ReturnType<typeof setTimeout>>()
  const activeCrackles = new Set<AudioBufferSourceNode>()

  const spawnCrackle = (intensity = 1) => {
    if (!active || ctx.state !== 'running') return
    try {
      const now = ctx.currentTime
      const buffer = Math.random() < 0.6 ? whiteBuffer : pinkBuffer
      const src = ctx.createBufferSource()
      src.buffer = buffer

      const duration = randomBetween(0.01, 0.026)
      const maxOffset = Math.max(0, buffer.duration - duration - 0.05)
      const offset = maxOffset > 0 ? Math.random() * maxOffset : 0

      const bp = createFilter(ctx, 'bandpass', randomBetween(1200, 3200), randomBetween(2.0, 4.2))
      const warmLp = createFilter(ctx, 'lowpass', 3800, 0.5)
      const env = ctx.createGain()
      const peak = randomBetween(0.032, 0.092) * intensity
      const attack = randomBetween(0.0015, 0.003)

      env.gain.setValueAtTime(0.0001, now)
      env.gain.linearRampToValueAtTime(peak, now + attack)
      env.gain.exponentialRampToValueAtTime(0.0001, now + duration)

      const panner = createOptionalPanner(ctx, randomBetween(-0.5, 0.5))
      src.connect(bp)
      bp.connect(warmLp)
      if (panner) {
        warmLp.connect(panner)
        panner.connect(env)
      } else {
        warmLp.connect(env)
      }
      env.connect(output)

      activeCrackles.add(src)
      src.onended = () => {
        activeCrackles.delete(src)
        safeDisconnect(src)
        safeDisconnect(bp)
        safeDisconnect(warmLp)
        safeDisconnect(panner)
        safeDisconnect(env)
      }
      src.start(now, offset, duration + 0.01)
    } catch {
      // Ignore scheduling errors in mock/restricted environments.
    }
  }

  const scheduleNext = () => {
    if (!active) return
    timerId = setTimeout(() => {
      timerId = null
      if (!active) return
      spawnCrackle(1)
      if (Math.random() < 0.25) {
        const subId = setTimeout(() => {
          subTimers.delete(subId)
          spawnCrackle(0.6)
        }, Math.round(randomBetween(45, 95)))
        subTimers.add(subId)
      }
      scheduleNext()
    }, Math.round(randomBetween(320, 1450)))
  }
  scheduleNext()

  return makeLayerHandle(ctx, 'fire', output, () => {
    active = false
    if (timerId !== null) {
      clearTimeout(timerId)
      timerId = null
    }
    for (const id of subTimers) clearTimeout(id)
    subTimers.clear()
    for (const crackle of activeCrackles) {
      safeStop(crackle)
      safeDisconnect(crackle)
    }
    activeCrackles.clear()
    safeStop(rumbleSrc)
    safeStop(emberSrc)
    safeStop(flickerLfo)
    safeDisconnect(rumbleSrc)
    safeDisconnect(rumbleLp)
    safeDisconnect(rumbleVca)
    safeDisconnect(flickerLfo)
    safeDisconnect(flickerDepth)
    safeDisconnect(emberSrc)
    safeDisconnect(emberBp)
    safeDisconnect(emberGain)
  })
}

function createWindLayer(ctx: AudioContext, bank: NoiseBufferBank, destination: AudioNode): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)

  const pinkBuffer = bank.get('pink')

  // Primary narrow bandpass pink noise drifting slowly via ~0.08Hz LFO between ~220Hz and ~620Hz
  const primarySrc = createLoopingSource(ctx, pinkBuffer)
  const primaryBp = createFilter(ctx, 'bandpass', 420, 3.2)
  const windCeiling = createFilter(ctx, 'lowpass', 1800, 0.5)
  const windVca = ctx.createGain()
  windVca.gain.value = 0.65

  const mainLfo = createLfo(ctx, 0.08)
  const mainFreqDepth = ctx.createGain()
  mainFreqDepth.gain.value = 200
  const mainGainDepth = ctx.createGain()
  mainGainDepth.gain.value = 0.14

  primarySrc.connect(primaryBp)
  primaryBp.connect(windCeiling)
  windCeiling.connect(windVca)
  windVca.connect(output)

  mainLfo.connect(mainFreqDepth)
  mainFreqDepth.connect(primaryBp.frequency)
  mainLfo.connect(mainGainDepth)
  mainGainDepth.connect(windVca.gain)

  // Secondary slower low-mid breeze for spaciousness
  const secondarySrc = createLoopingSource(ctx, pinkBuffer, 6.1)
  const secondaryBp = createFilter(ctx, 'bandpass', 290, 1.8)
  const secondaryGain = ctx.createGain()
  secondaryGain.gain.value = 0.28

  const secondaryLfo = createLfo(ctx, 0.053, (70 * Math.PI) / 180)
  const secondaryFreqDepth = ctx.createGain()
  secondaryFreqDepth.gain.value = 80

  secondarySrc.connect(secondaryBp)
  secondaryBp.connect(secondaryGain)
  secondaryGain.connect(windCeiling)

  secondaryLfo.connect(secondaryFreqDepth)
  secondaryFreqDepth.connect(secondaryBp.frequency)

  return makeLayerHandle(ctx, 'wind', output, () => {
    safeStop(primarySrc)
    safeStop(secondarySrc)
    safeStop(mainLfo)
    safeStop(secondaryLfo)
    safeDisconnect(primarySrc)
    safeDisconnect(primaryBp)
    safeDisconnect(windCeiling)
    safeDisconnect(windVca)
    safeDisconnect(mainLfo)
    safeDisconnect(mainFreqDepth)
    safeDisconnect(mainGainDepth)
    safeDisconnect(secondarySrc)
    safeDisconnect(secondaryBp)
    safeDisconnect(secondaryGain)
    safeDisconnect(secondaryLfo)
    safeDisconnect(secondaryFreqDepth)
  })
}

export function createAmbientLayer(
  ctx: AudioContext,
  bank: NoiseBufferBank,
  id: LayerId,
  destination: AudioNode,
): AmbientLayer {
  switch (id) {
    case 'white':
      return createWhiteLayer(ctx, bank, destination)
    case 'pink':
      return createPinkLayer(ctx, bank, destination)
    case 'brown':
      return createBrownLayer(ctx, bank, destination)
    case 'rain':
      return createRainLayer(ctx, bank, destination)
    case 'waves':
      return createWavesLayer(ctx, bank, destination)
    case 'fire':
      return createFireLayer(ctx, bank, destination)
    case 'wind':
      return createWindLayer(ctx, bank, destination)
  }
}
