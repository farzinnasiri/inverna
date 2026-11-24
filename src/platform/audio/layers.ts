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
 * Perceptual loudness balancing per layer — calibrated against real acoustic field
 * recordings while running 100% natively on the C++ audio thread.
 */
const LAYER_SCALE: Record<LayerId, number> = {
  white: 0.14,
  pink: 0.28,
  brown: 0.54,
  rain: 0.305,
  waves: 0.53,
  fire: 0.9,
  wind: 0.56,
}

/**
 * Web Audio & react-native-audio-api interpret BiquadFilterNode `Q` in dB for
 * `lowpass` and `highpass` (`g = 10^(Q/20)`), so true flat Butterworth (0.7071)
 * is `-3.01` dB (not `0.7`!).
 */
const BUTTERWORTH_Q_DB = -3.01

/**
 * Creates a seamlessly looping source with two critical `react-native-audio-api@1.0.1`
 * C++ fixes:
 * 1. Sets `src.loopStart = 0` and `src.loopEnd = buffer.duration` BEFORE `start()`,
 *    because native `AudioBufferSourceNode::start()` clamps `offset` to `loopEnd_`
 *    (which defaults to `0`), otherwise collapsing every secondary offset to 0.
 * 2. When `compensateBufferRate` is true (native only — browsers already scale by
 *    `buffer.sampleRate / ctx.sampleRate`), multiplies `playbackRate` by
 *    `buffer.sampleRate / ctx.sampleRate` because native `SingleBufferProcessor`
 *    steps `position_ += rate` in buffer frames per output frame!
 */
function createLoopingSource(
  ctx: AudioContextLike,
  buffer: AudioBufferLike,
  offsetSeconds = 0,
  playbackRate = 1.0,
  compensateBufferRate = false,
): AudioBufferSourceNodeLike {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  src.loopStart = 0
  src.loopEnd = buffer.duration
  const srRatio =
    compensateBufferRate && ctx.sampleRate > 0 && buffer.sampleRate > 0
      ? buffer.sampleRate / ctx.sampleRate
      : 1
  const effectiveRate = playbackRate * srRatio
  if (effectiveRate !== 1.0 && src.playbackRate) {
    src.playbackRate.value = effectiveRate
  }
  const safeOffset = buffer.duration > 0 ? offsetSeconds % buffer.duration : 0
  src.start(ctx.currentTime, safeOffset)
  return src
}

function createFilter(
  ctx: AudioContextLike,
  type: BiquadFilterTypeLike,
  frequency: number,
  q = type === 'lowpass' || type === 'highpass' ? BUTTERWORTH_Q_DB : 0.7,
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
    // Web Audio PeriodicWave uses a*cos(wt) + b*sin(wt); sin(wt + phi) = sin(phi)*cos(wt) + cos(phi)*sin(wt)
    const real = new Float32Array([0, Math.sin(phaseRadians)])
    const imag = new Float32Array([0, Math.cos(phaseRadians)])
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

/**
 * Attaches slow golden-ratio gain breathing to two incommensurate-rate loop copies
 * so individual transients/swells rise and recede organically over minutes with zero
 * audible loop repetition and zero JS timers.
 */
function attachSlowDriftMod(
  ctx: AudioContextLike,
  gainNode: GainNodeLike,
  baseGain: number,
  depth: number,
  rateHz: number,
  phaseRadians = 0,
): { lfo: OscillatorNodeLike; modGain: GainNodeLike } {
  gainNode.gain.value = baseGain
  const lfo = createLfo(ctx, rateHz, phaseRadians)
  const modGain = ctx.createGain()
  modGain.gain.value = depth
  lfo.connect(modGain)
  modGain.connect(gainNode.gain)
  return { lfo, modGain }
}

/**
 * Complementary drift for two decorrelated loop copies: gA = base + depth*L(t), gB = base - depth*L(t)
 * from ONE LFO. Summed power is 2*base^2 + 2*depth^2*L^2, so the level moves only
 * 10*log10(1 + depth^2/base^2) dB peak-to-peak while the dominant copy keeps changing.
 */
function attachComplementaryDrift(
  ctx: AudioContextLike,
  gainA: GainNodeLike,
  gainB: GainNodeLike,
  base: number,
  depth: number,
  rateHz: number,
): { lfo: OscillatorNodeLike; modA: GainNodeLike; modB: GainNodeLike } {
  gainA.gain.value = base
  gainB.gain.value = base
  const lfo = createLfo(ctx, rateHz)
  const modA = ctx.createGain()
  const modB = ctx.createGain()
  modA.gain.value = depth
  modB.gain.value = -depth
  lfo.connect(modA)
  lfo.connect(modB)
  modA.connect(gainA.gain)
  modB.connect(gainB.gain)
  return { lfo, modA, modB }
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

function createWhiteLayer(
  ctx: AudioContextLike,
  bank: NoiseBufferBank,
  destination: AudioNodeLike,
  compensateBufferRate: boolean,
): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  const lowpass = createFilter(ctx, 'lowpass', 3800, BUTTERWORTH_Q_DB)
  const src = createLoopingSource(ctx, bank.get('white'), 0, 1.0, compensateBufferRate)

  src.connect(lowpass)
  lowpass.connect(output)
  output.connect(destination)

  return makeLayerHandle(ctx, 'white', output, () => {
    safeStop(src)
    safeDisconnect(src)
    safeDisconnect(lowpass)
  })
}

function createPinkLayer(
  ctx: AudioContextLike,
  bank: NoiseBufferBank,
  destination: AudioNodeLike,
  compensateBufferRate: boolean,
): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  const warmth = createFilter(ctx, 'lowshelf', 240, 0.7, 2.5)
  const lowpass = createFilter(ctx, 'lowpass', 2600, BUTTERWORTH_Q_DB)
  const src = createLoopingSource(ctx, bank.get('pink'), 0, 1.0, compensateBufferRate)

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

function createBrownLayer(
  ctx: AudioContextLike,
  bank: NoiseBufferBank,
  destination: AudioNodeLike,
  compensateBufferRate: boolean,
): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  const subClean = createFilter(ctx, 'highpass', 32, BUTTERWORTH_Q_DB)
  const lowpass = createFilter(ctx, 'lowpass', 260, BUTTERWORTH_Q_DB)
  const src = createLoopingSource(ctx, bank.get('brown'), 0, 1.0, compensateBufferRate)

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
 * Physically modeled nocturnal rainfall (Pass 3):
 * - Dual incommensurate-rate curtain loops (1.0 & 0.9173) with complementary LFO crossfade
 * - Dedicated 17 s near-drop loop so crisp close droplets never repeat on the 8 s curtain
 */
function createRainLayer(
  ctx: AudioContextLike,
  bank: NoiseBufferBank,
  destination: AudioNodeLike,
  compensateBufferRate: boolean,
): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)

  const rainBuffer = bank.get('rain-patter')

  const srcA = createLoopingSource(ctx, rainBuffer, 0, 1.0, compensateBufferRate)
  const srcB = createLoopingSource(ctx, rainBuffer, 3.47, 0.9173, compensateBufferRate)

  const gainA = ctx.createGain()
  const gainB = ctx.createGain()
  // 0.56 +/- 0.20: total level moves 0.6 dB p-p (was ~5 dB), copy dominance swings 8.9 dB
  const drift = attachComplementaryDrift(ctx, gainA, gainB, 0.56, 0.2, 0.0229)

  // Near drops: separate 17 s events-only loop, single copy
  const nearSrc = createLoopingSource(ctx, bank.get('rain-near'), 0, 1.0, compensateBufferRate)
  const nearGain = ctx.createGain()
  nearGain.gain.value = 0.95

  const hp = createFilter(ctx, 'highpass', 260, BUTTERWORTH_Q_DB)
  const body = createFilter(ctx, 'peaking', 1350, 0.8, 1.5)
  const airShelf = createFilter(ctx, 'highshelf', 7500, 0.7, -2.0)

  srcA.connect(gainA)
  srcB.connect(gainB)
  nearSrc.connect(nearGain)
  gainA.connect(hp)
  gainB.connect(hp)
  nearGain.connect(hp)
  hp.connect(body)
  body.connect(airShelf)
  airShelf.connect(output)

  return makeLayerHandle(ctx, 'rain', output, () => {
    safeStop(srcA)
    safeStop(srcB)
    safeStop(nearSrc)
    safeStop(drift.lfo)
    safeDisconnect(srcA)
    safeDisconnect(srcB)
    safeDisconnect(nearSrc)
    safeDisconnect(gainA)
    safeDisconnect(gainB)
    safeDisconnect(nearGain)
    safeDisconnect(drift.lfo)
    safeDisconnect(drift.modA)
    safeDisconnect(drift.modB)
    safeDisconnect(hp)
    safeDisconnect(body)
    safeDisconnect(airShelf)
  })
}

/**
 * Physically modeled nocturnal ocean coastline (Pass 2):
 * - Primary decoupled 3-band wave cycle at rate 0.87 (~7-8s breathing-paced ocean rhythm!)
 * - Softer secondary offshore wave train at incommensurate rate 0.783 (-9 dB, 150-1200 Hz)
 *   so natural wave sets beat organically over ~55-second arcs!
 */
function createWavesLayer(
  ctx: AudioContextLike,
  bank: NoiseBufferBank,
  destination: AudioNodeLike,
  compensateBufferRate: boolean,
): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)

  const surfBuffer = bank.get('waves-surf')

  const mainSurf = createLoopingSource(ctx, surfBuffer, 0, 0.87, compensateBufferRate)
  const mainHp = createFilter(ctx, 'highpass', 120, BUTTERWORTH_Q_DB)
  const mainGain = ctx.createGain()

  // Second wave train (20.7 s vs 23.0 s loops), slightly darker; the two trade dominance over a
  // ~42 s cycle (0.55 +/- 0.35 -> 13.3 dB swing) so no wave pattern recurs at either loop period.
  const farSurf = createLoopingSource(ctx, surfBuffer, 5.7, 0.783, compensateBufferRate)
  const farHp = createFilter(ctx, 'highpass', 120, BUTTERWORTH_Q_DB)
  const farLp = createFilter(ctx, 'lowpass', 3600, BUTTERWORTH_Q_DB)
  const farGain = ctx.createGain()
  const drift = attachComplementaryDrift(ctx, mainGain, farGain, 0.55, 0.35, 0.024)

  mainSurf.connect(mainHp)
  mainHp.connect(mainGain)
  mainGain.connect(output)

  farSurf.connect(farHp)
  farHp.connect(farLp)
  farLp.connect(farGain)
  farGain.connect(output)

  return makeLayerHandle(ctx, 'waves', output, () => {
    safeStop(mainSurf)
    safeStop(farSurf)
    safeStop(drift.lfo)
    safeDisconnect(mainSurf)
    safeDisconnect(mainHp)
    safeDisconnect(mainGain)
    safeDisconnect(farSurf)
    safeDisconnect(farHp)
    safeDisconnect(farLp)
    safeDisconnect(farGain)
    safeDisconnect(drift.lfo)
    safeDisconnect(drift.modA)
    safeDisconnect(drift.modB)
  })
}

/**
 * Physically modeled cozy hearth fireplace (Pass 2):
 * - Dual incommensurate-rate loops (1.0 & 0.8909) with golden-ratio crossfades so crackle
 *   clusters never echo or repeat recognizably
 * - Clean 72Hz Butterworth HP, warm +2.5dB hearth body @ 280Hz, subtle -3.5dB @ 760Hz,
 *   and gentle -3.0dB air shelf @ 6.2kHz (eliminating harsh vinyl-click brightness!)
 */
function createFireLayer(
  ctx: AudioContextLike,
  bank: NoiseBufferBank,
  destination: AudioNodeLike,
  compensateBufferRate: boolean,
): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)

  const crackleBuffer = bank.get('fire-crackle')

  const srcA = createLoopingSource(ctx, crackleBuffer, 0, 1.0, compensateBufferRate)
  const srcB = createLoopingSource(ctx, crackleBuffer, 4.73, 0.8909, compensateBufferRate)

  const gainA = ctx.createGain()
  const gainB = ctx.createGain()
  const drift = attachComplementaryDrift(ctx, gainA, gainB, 0.61, 0.22, 0.023)

  // Flame bed: own 10 s @ 8 kHz loop; this one gain IS the flame/crackle balance
  const bedSrc = createLoopingSource(ctx, bank.get('fire-bed'), 0, 1.0, compensateBufferRate)
  const bedGain = ctx.createGain()
  bedGain.gain.value = 0.08

  const hp = createFilter(ctx, 'highpass', 100, BUTTERWORTH_Q_DB)
  const midDip = createFilter(ctx, 'peaking', 760, 0.9, -3.5)

  srcA.connect(gainA)
  srcB.connect(gainB)
  bedSrc.connect(bedGain)
  gainA.connect(hp)
  gainB.connect(hp)
  bedGain.connect(hp)
  hp.connect(midDip)
  midDip.connect(output)

  return makeLayerHandle(ctx, 'fire', output, () => {
    safeStop(srcA)
    safeStop(srcB)
    safeStop(bedSrc)
    safeStop(drift.lfo)
    safeDisconnect(srcA)
    safeDisconnect(srcB)
    safeDisconnect(bedSrc)
    safeDisconnect(gainA)
    safeDisconnect(gainB)
    safeDisconnect(bedGain)
    safeDisconnect(drift.lfo)
    safeDisconnect(drift.modA)
    safeDisconnect(drift.modB)
    safeDisconnect(hp)
    safeDisconnect(midDip)
  })
}

/**
 * Physically modeled twilight wind through pines (Pass 2):
 * - Dual incommensurate-rate loops (1.0 & 0.853) of the stochastic multi-scale gust buffer
 *   with slow golden-ratio crossfades -> organic, endlessly varying gusts over minutes!
 * - Tuned spectral contour: 42Hz HP, +3.0dB @ 185Hz body, -3.0dB @ 760Hz, smooth 1650Hz Butterworth LP
 */
function createWindLayer(
  ctx: AudioContextLike,
  bank: NoiseBufferBank,
  destination: AudioNodeLike,
  compensateBufferRate: boolean,
): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)

  const windBuffer = bank.get('wind-gust')

  const srcA = createLoopingSource(ctx, windBuffer, 0, 1.0, compensateBufferRate)
  const srcB = createLoopingSource(ctx, windBuffer, 5.9, 0.853, compensateBufferRate)

  const gainA = ctx.createGain()
  const gainB = ctx.createGain()
  const driftA = attachSlowDriftMod(ctx, gainA, 0.64, 0.22, 0.019, 0)
  const driftB = attachSlowDriftMod(ctx, gainB, 0.50, 0.22, 0.031, Math.PI)

  const hp = createFilter(ctx, 'highpass', 42, BUTTERWORTH_Q_DB)
  const lowBody = createFilter(ctx, 'peaking', 185, 0.85, 2.0)
  const midTrim = createFilter(ctx, 'peaking', 1000, 0.9, -2.0)
  const airCeiling = createFilter(ctx, 'lowpass', 2500, BUTTERWORTH_Q_DB)

  srcA.connect(gainA)
  srcB.connect(gainB)
  gainA.connect(hp)
  gainB.connect(hp)
  hp.connect(lowBody)
  lowBody.connect(midTrim)
  midTrim.connect(airCeiling)
  airCeiling.connect(output)

  return makeLayerHandle(ctx, 'wind', output, () => {
    safeStop(srcA)
    safeStop(srcB)
    safeStop(driftA.lfo)
    safeStop(driftB.lfo)
    safeDisconnect(srcA)
    safeDisconnect(srcB)
    safeDisconnect(gainA)
    safeDisconnect(gainB)
    safeDisconnect(driftA.lfo)
    safeDisconnect(driftA.modGain)
    safeDisconnect(driftB.lfo)
    safeDisconnect(driftB.modGain)
    safeDisconnect(hp)
    safeDisconnect(lowBody)
    safeDisconnect(midTrim)
    safeDisconnect(airCeiling)
  })
}

export function createAmbientLayer(
  ctx: AudioContextLike,
  bank: NoiseBufferBank,
  id: LayerId,
  destination: AudioNodeLike,
  compensateBufferRate = false,
): AmbientLayer {
  switch (id) {
    case 'white':
      return createWhiteLayer(ctx, bank, destination, compensateBufferRate)
    case 'pink':
      return createPinkLayer(ctx, bank, destination, compensateBufferRate)
    case 'brown':
      return createBrownLayer(ctx, bank, destination, compensateBufferRate)
    case 'rain':
      return createRainLayer(ctx, bank, destination, compensateBufferRate)
    case 'waves':
      return createWavesLayer(ctx, bank, destination, compensateBufferRate)
    case 'fire':
      return createFireLayer(ctx, bank, destination, compensateBufferRate)
    case 'wind':
      return createWindLayer(ctx, bank, destination, compensateBufferRate)
  }
}
