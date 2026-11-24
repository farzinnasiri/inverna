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
 * Perceptual loudness balancing per layer — physically modeled natural textures
 * with zero harsh broadband TV static, running 100% natively on the C++ audio thread.
 */
const LAYER_SCALE: Record<LayerId, number> = {
  white: 0.16,
  pink: 0.34,
  brown: 0.6,
  rain: 0.72,
  waves: 0.78,
  fire: 0.82,
  wind: 0.68,
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
  const lowpass = createFilter(ctx, 'lowpass', 3800, 0.5)
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
  const warmth = createFilter(ctx, 'lowshelf', 240, 0.7, 2.8)
  const lowpass = createFilter(ctx, 'lowpass', 2600, 0.5)
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
  const lowpass = createFilter(ctx, 'lowpass', 280, 0.65)
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

/**
 * Physically modeled nocturnal rainfall:
 * - Soft dark distant roof hush (heavily rolled off above 980 Hz — zero TV static!)
 * - Dual phase-offset stereo Minnaert raindrop patter layers (crisp, natural, rich!)
 */
function createRainLayer(ctx: AudioContextLike, bank: NoiseBufferBank, destination: AudioNodeLike): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)

  const pinkBuffer = bank.get('pink')
  const patterBuffer = bank.get('rain-patter')

  // Soft distant rainfall veil (strictly warm, zero harsh hiss)
  const bedSrc = createLoopingSource(ctx, pinkBuffer)
  const bedHp = createFilter(ctx, 'highpass', 170, 0.55)
  const bedLp = createFilter(ctx, 'lowpass', 980, 0.65)
  const bedGain = ctx.createGain()
  bedGain.gain.value = 0.24

  bedSrc.connect(bedHp)
  bedHp.connect(bedLp)
  bedLp.connect(bedGain)
  bedGain.connect(output)

  // Primary stereo window & roof raindrops (2 uncorrelated offset loops)
  const patterA = createLoopingSource(ctx, patterBuffer, 0)
  const patterB = createLoopingSource(ctx, patterBuffer, 2.73)
  const patterHp = createFilter(ctx, 'highpass', 280, 0.5)
  const patterLp = createFilter(ctx, 'lowpass', 3200, 0.55)
  const patterGain = ctx.createGain()
  patterGain.gain.value = 0.88

  patterA.connect(patterHp)
  patterB.connect(patterHp)
  patterHp.connect(patterLp)
  patterLp.connect(patterGain)
  patterGain.connect(output)

  return makeLayerHandle(ctx, 'rain', output, () => {
    safeStop(bedSrc)
    safeStop(patterA)
    safeStop(patterB)
    safeDisconnect(bedSrc)
    safeDisconnect(bedHp)
    safeDisconnect(bedLp)
    safeDisconnect(bedGain)
    safeDisconnect(patterA)
    safeDisconnect(patterB)
    safeDisconnect(patterHp)
    safeDisconnect(patterLp)
    safeDisconnect(patterGain)
  })
}

/**
 * Physically modeled nocturnal ocean coastline:
 * - Primary 10s asymmetric stereo ocean surf cycle (approach -> crest -> receding wash -> quiet pause)
 * - Subtle secondary slower deep swell layer offset for endless non-repeating horizon texture
 */
function createWavesLayer(ctx: AudioContextLike, bank: NoiseBufferBank, destination: AudioNodeLike): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)

  const surfBuffer = bank.get('waves-surf')

  const mainSurf = createLoopingSource(ctx, surfBuffer, 0)
  const mainLp = createFilter(ctx, 'lowpass', 1800, 0.55)
  const mainGain = ctx.createGain()
  mainGain.gain.value = 0.85

  // Distant secondary undercurrent swell slightly out of phase
  const farSurf = createLoopingSource(ctx, surfBuffer, 4.6)
  const farLp = createFilter(ctx, 'lowpass', 420, 0.65)
  const farGain = ctx.createGain()
  farGain.gain.value = 0.34

  mainSurf.connect(mainLp)
  mainLp.connect(mainGain)
  mainGain.connect(output)

  farSurf.connect(farLp)
  farLp.connect(farGain)
  farGain.connect(output)

  return makeLayerHandle(ctx, 'waves', output, () => {
    safeStop(mainSurf)
    safeStop(farSurf)
    safeDisconnect(mainSurf)
    safeDisconnect(mainLp)
    safeDisconnect(mainGain)
    safeDisconnect(farSurf)
    safeDisconnect(farLp)
    safeDisconnect(farGain)
  })
}

/**
 * Physically modeled cozy hearth fireplace:
 * - Sub-100 Hz breathing chimney draft with dual irregular flame-flicker LFOs
 * - Distinct crisp dry cedar crackles, ember pop clusters & warm flame-lick gusts
 * - ZERO continuous high-frequency static hiss!
 */
function createFireLayer(ctx: AudioContextLike, bank: NoiseBufferBank, destination: AudioNodeLike): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)

  const brownBuffer = bank.get('brown')
  const crackleBuffer = bank.get('fire-crackle')

  // Deep undulating hearth draft (strictly <= 105 Hz, zero hiss)
  const rumbleSrc = createLoopingSource(ctx, brownBuffer)
  const rumbleLp = createFilter(ctx, 'lowpass', 105, 0.7)
  const rumbleVca = ctx.createGain()
  rumbleVca.gain.value = 0.56

  const flickerA = createLfo(ctx, 0.19)
  const flickerADepth = ctx.createGain()
  flickerADepth.gain.value = 0.16

  const flickerB = createLfo(ctx, 0.47, 1.2)
  const flickerBDepth = ctx.createGain()
  flickerBDepth.gain.value = 0.09

  rumbleSrc.connect(rumbleLp)
  rumbleLp.connect(rumbleVca)
  rumbleVca.connect(output)
  flickerA.connect(flickerADepth)
  flickerADepth.connect(rumbleVca.gain)
  flickerB.connect(flickerBDepth)
  flickerBDepth.connect(rumbleVca.gain)

  // Prominent dry wood crackles & warm flame-lick gusts (silent floor between snaps!)
  const crackleA = createLoopingSource(ctx, crackleBuffer, 0)
  const crackleB = createLoopingSource(ctx, crackleBuffer, 2.87)
  const crackleLp = createFilter(ctx, 'lowpass', 4200, 0.55)
  const crackleGain = ctx.createGain()
  crackleGain.gain.value = 0.88

  crackleA.connect(crackleLp)
  crackleB.connect(crackleLp)
  crackleLp.connect(crackleGain)
  crackleGain.connect(output)

  return makeLayerHandle(ctx, 'fire', output, () => {
    safeStop(rumbleSrc)
    safeStop(crackleA)
    safeStop(crackleB)
    safeStop(flickerA)
    safeStop(flickerB)
    safeDisconnect(rumbleSrc)
    safeDisconnect(rumbleLp)
    safeDisconnect(rumbleVca)
    safeDisconnect(flickerA)
    safeDisconnect(flickerADepth)
    safeDisconnect(flickerB)
    safeDisconnect(flickerBDepth)
    safeDisconnect(crackleA)
    safeDisconnect(crackleB)
    safeDisconnect(crackleLp)
    safeDisconnect(crackleGain)
  })
}

/**
 * Physically modeled twilight wind through pines & eaves:
 * - Dual narrow resonant formant filters sweeping smoothly with slow gust LFOs
 * - Strictly capped at 920 Hz so it sighs like real night air with zero TV static!
 */
function createWindLayer(ctx: AudioContextLike, bank: NoiseBufferBank, destination: AudioNodeLike): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)

  const pinkBuffer = bank.get('pink')
  const windCeiling = createFilter(ctx, 'lowpass', 920, 0.6)
  windCeiling.connect(output)

  // Voice 1: Low pine-canopy sigh (210..430 Hz resonant bandpass)
  const src1 = createLoopingSource(ctx, pinkBuffer, 0)
  const bp1 = createFilter(ctx, 'bandpass', 320, 4.2)
  const vca1 = ctx.createGain()
  vca1.gain.value = 0.68

  const lfo1 = createLfo(ctx, 0.067)
  const lfo1Freq = ctx.createGain()
  lfo1Freq.gain.value = 110
  const lfo1Gain = ctx.createGain()
  lfo1Gain.gain.value = 0.24

  src1.connect(bp1)
  bp1.connect(vca1)
  vca1.connect(windCeiling)
  lfo1.connect(lfo1Freq)
  lfo1Freq.connect(bp1.frequency)
  lfo1.connect(lfo1Gain)
  lfo1Gain.connect(vca1.gain)

  // Voice 2: High-eave harmonic breeze whisper (440..720 Hz narrow formant)
  const src2 = createLoopingSource(ctx, pinkBuffer, 2.3)
  const bp2 = createFilter(ctx, 'bandpass', 580, 5.2)
  const vca2 = ctx.createGain()
  vca2.gain.value = 0.34

  const lfo2 = createLfo(ctx, 0.043, 1.9)
  const lfo2Freq = ctx.createGain()
  lfo2Freq.gain.value = 140
  const lfo2Gain = ctx.createGain()
  lfo2Gain.gain.value = 0.16

  src2.connect(bp2)
  bp2.connect(vca2)
  vca2.connect(windCeiling)
  lfo2.connect(lfo2Freq)
  lfo2Freq.connect(bp2.frequency)
  lfo2.connect(lfo2Gain)
  lfo2Gain.connect(vca2.gain)

  return makeLayerHandle(ctx, 'wind', output, () => {
    safeStop(src1)
    safeStop(src2)
    safeStop(lfo1)
    safeStop(lfo2)
    safeDisconnect(src1)
    safeDisconnect(bp1)
    safeDisconnect(vca1)
    safeDisconnect(lfo1)
    safeDisconnect(lfo1Freq)
    safeDisconnect(lfo1Gain)
    safeDisconnect(src2)
    safeDisconnect(bp2)
    safeDisconnect(vca2)
    safeDisconnect(lfo2)
    safeDisconnect(lfo2Freq)
    safeDisconnect(lfo2Gain)
    safeDisconnect(windCeiling)
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
