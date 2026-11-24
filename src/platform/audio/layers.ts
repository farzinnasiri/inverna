import type { LayerId } from '@/core/sound/catalog'
import type { NoiseBufferBank } from './buffers'
import { clamp, rampParam, safeDisconnect, safeStop } from './params'
import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  BiquadFilterNodeLike,
  BiquadFilterTypeLike,
  GainNodeLike,
  OscillatorNodeLike,
} from './types'

export interface AmbientLayer {
  readonly id: LayerId
  setGain(gain: number, fadeSeconds: number): void
  dispose(): void
}

/**
 * Perceptual loudness balancing per layer so 100% on any slider feels calm,
 * warm, and matched across iPhone speakers and headphones.
 * Every layer runs 100% natively on the C++ audio thread (zero JS timers)
 * so soundscapes remain alive and textured even when the screen locks.
 */
const LAYER_SCALE: Record<LayerId, number> = {
  white: 0.2,
  pink: 0.36,
  brown: 0.62,
  rain: 0.58,
  waves: 0.6,
  fire: 0.64,
  wind: 0.56,
}

function createLoopingSource(
  ctx: AudioContextLike,
  buffer: AudioBufferLike,
  offsetSeconds = 0,
): AudioBufferSourceNodeLike {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const safeOffset = buffer.duration > 0 ? offsetSeconds % buffer.duration : 0
  src.start(ctx.currentTime, safeOffset)
  return src
}

function createFilter(
  ctx: AudioContextLike,
  type: BiquadFilterTypeLike,
  frequency: number,
  q = 0.7,
  gain = 0,
): BiquadFilterNodeLike {
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency
  filter.Q.value = q
  if (gain !== 0) filter.gain.value = gain
  return filter
}

function createLfo(ctx: AudioContextLike, frequencyHz: number, phaseRadians = 0): OscillatorNodeLike {
  const osc = ctx.createOscillator()
  osc.frequency.value = frequencyHz
  if (phaseRadians !== 0 && typeof ctx.createPeriodicWave === 'function' && typeof osc.setPeriodicWave === 'function') {
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

function makeLayerHandle(
  ctx: AudioContextLike,
  id: LayerId,
  outputGain: GainNodeLike,
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

function createWhiteLayer(ctx: AudioContextLike, bank: NoiseBufferBank, destination: AudioNodeLike): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  const lowpass = createFilter(ctx, 'lowpass', 5200, 0.5)
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

function createPinkLayer(ctx: AudioContextLike, bank: NoiseBufferBank, destination: AudioNodeLike): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  const warmth = createFilter(ctx, 'lowshelf', 260, 0.7, 2.5)
  const lowpass = createFilter(ctx, 'lowpass', 4200, 0.5)
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

function createBrownLayer(ctx: AudioContextLike, bank: NoiseBufferBank, destination: AudioNodeLike): AmbientLayer {
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

function createRainLayer(ctx: AudioContextLike, bank: NoiseBufferBank, destination: AudioNodeLike): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)

  const pinkBuffer = bank.get('pink')
  const whiteBuffer = bank.get('white')
  const patterBuffer = bank.get('rain-patter')

  // Steady warm rain bed (1/f filtered)
  const bedSrc = createLoopingSource(ctx, pinkBuffer)
  const bedHp = createFilter(ctx, 'highpass', 240, 0.5)
  const bedLp = createFilter(ctx, 'lowpass', 3400, 0.6)
  const bedGain = ctx.createGain()
  bedGain.gain.value = 0.52

  bedSrc.connect(bedHp)
  bedHp.connect(bedLp)
  bedLp.connect(bedGain)
  bedGain.connect(output)

  // Gentle misty air sheen
  const sheenSrc = createLoopingSource(ctx, whiteBuffer, 4.3)
  const sheenBp = createFilter(ctx, 'bandpass', 2100, 0.7)
  const sheenGain = ctx.createGain()
  sheenGain.gain.value = 0.08

  sheenSrc.connect(sheenBp)
  sheenBp.connect(sheenGain)
  sheenGain.connect(output)

  // Background-safe stereo window raindrop micro-patter (two phase-offset loops for non-repeating texture)
  const patterA = createLoopingSource(ctx, patterBuffer, 0)
  const patterB = createLoopingSource(ctx, patterBuffer, 5.3)
  const patterBp = createFilter(ctx, 'bandpass', 1650, 0.65)
  const patterGain = ctx.createGain()
  patterGain.gain.value = 0.44

  patterA.connect(patterBp)
  patterB.connect(patterBp)
  patterBp.connect(patterGain)
  patterGain.connect(output)

  return makeLayerHandle(ctx, 'rain', output, () => {
    safeStop(bedSrc)
    safeStop(sheenSrc)
    safeStop(patterA)
    safeStop(patterB)
    safeDisconnect(bedSrc)
    safeDisconnect(bedHp)
    safeDisconnect(bedLp)
    safeDisconnect(bedGain)
    safeDisconnect(sheenSrc)
    safeDisconnect(sheenBp)
    safeDisconnect(sheenGain)
    safeDisconnect(patterA)
    safeDisconnect(patterB)
    safeDisconnect(patterBp)
    safeDisconnect(patterGain)
  })
}

function createWavesLayer(ctx: AudioContextLike, bank: NoiseBufferBank, destination: AudioNodeLike): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)

  const brownSrc = createLoopingSource(ctx, bank.get('brown'))
  const deepLp = createFilter(ctx, 'lowpass', 420, 0.6)
  const deepGain = ctx.createGain()
  deepGain.gain.value = 0.72

  const pinkSrc = createLoopingSource(ctx, bank.get('pink'), 3.1)
  const foamHp = createFilter(ctx, 'highpass', 120, 0.5)
  const foamLp = createFilter(ctx, 'lowpass', 1550, 0.5)
  const foamGain = ctx.createGain()
  foamGain.gain.value = 0.34

  // Shared surf lowpass and VCA paced near 0.10 Hz (10s cardiorespiratory breath resonance) + slow 13.7s swell
  const surfFilter = createFilter(ctx, 'lowpass', 600, 0.7)
  const surfVca = ctx.createGain()
  surfVca.gain.value = 0.55

  const lfo1 = createLfo(ctx, 0.1, 0)
  const lfo1FreqDepth = ctx.createGain()
  lfo1FreqDepth.gain.value = 250
  const lfo1GainDepth = ctx.createGain()
  lfo1GainDepth.gain.value = 0.24

  const lfo2 = createLfo(ctx, 1 / 13.7, (115 * Math.PI) / 180)
  const lfo2FreqDepth = ctx.createGain()
  lfo2FreqDepth.gain.value = 155
  const lfo2GainDepth = ctx.createGain()
  lfo2GainDepth.gain.value = 0.13

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

function createFireLayer(ctx: AudioContextLike, bank: NoiseBufferBank, destination: AudioNodeLike): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)

  const brownBuffer = bank.get('brown')
  const pinkBuffer = bank.get('pink')
  const crackleBuffer = bank.get('fire-crackle')

  // Deep hearth rumble (~140 Hz lowpass) with subtle organic audio-thread flicker
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
  emberGain.gain.value = 0.11

  emberSrc.connect(emberBp)
  emberBp.connect(emberGain)
  emberGain.connect(output)

  // Background-safe warm woody crackle texture
  const crackleSrc = createLoopingSource(ctx, crackleBuffer, 1.7)
  const crackleBp = createFilter(ctx, 'bandpass', 1750, 0.85)
  const crackleGain = ctx.createGain()
  crackleGain.gain.value = 0.36

  crackleSrc.connect(crackleBp)
  crackleBp.connect(crackleGain)
  crackleGain.connect(output)

  return makeLayerHandle(ctx, 'fire', output, () => {
    safeStop(rumbleSrc)
    safeStop(emberSrc)
    safeStop(crackleSrc)
    safeStop(flickerLfo)
    safeDisconnect(rumbleSrc)
    safeDisconnect(rumbleLp)
    safeDisconnect(rumbleVca)
    safeDisconnect(flickerLfo)
    safeDisconnect(flickerDepth)
    safeDisconnect(emberSrc)
    safeDisconnect(emberBp)
    safeDisconnect(emberGain)
    safeDisconnect(crackleSrc)
    safeDisconnect(crackleBp)
    safeDisconnect(crackleGain)
  })
}

function createWindLayer(ctx: AudioContextLike, bank: NoiseBufferBank, destination: AudioNodeLike): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)

  const pinkBuffer = bank.get('pink')

  // Primary narrow bandpass pink noise drifting slowly via ~0.08 Hz LFO
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
  ctx: AudioContextLike,
  bank: NoiseBufferBank,
  id: LayerId,
  destination: AudioNodeLike,
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
