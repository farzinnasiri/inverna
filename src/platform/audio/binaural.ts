import { BANDS, type BandId } from '@/core/sound/catalog'
import { clamp, rampParam, safeDisconnect, safeStop } from './params'
import type { AudioContextLike, AudioNodeLike, GainNodeLike, OscillatorNodeLike } from './types'

/**
 * Gentle maximum scaling so binaural sine tones always sit softly beneath
 * the harmonic pad and ambient textures without listener fatigue.
 */
const BINAURAL_MAX_GAIN = 0.13
const MIN_FADE_SECONDS = 0.06
const MIN_CARRIER_HZ = 60
const MAX_CARRIER_HZ = 480

export interface BinauralController {
  update(opts: {
    band: BandId | null
    bandGain: number
    carrier: number
    fadeSeconds: number
    /** Optional live Iso-descent modulation rate in Hz (overrides static band.hz). */
    overrideBeatHz?: number
    /** Depth multiplier 0..1 from ModulationDepth (Off = 0, Subtle = 0.6, Deep = 1). */
    scale?: number
  }): void
  stop(fadeSeconds: number): void
  dispose(): void
}

interface ActivePair {
  leftOsc: OscillatorNodeLike
  rightOsc: OscillatorNodeLike
  outputGain: GainNodeLike
  nodes: AudioNodeLike[]
}

function bandHz(band: BandId): number {
  return BANDS.find((b) => b.id === band)?.hz ?? 0
}

export function createBinauralController(
  ctx: AudioContextLike,
  destination: AudioNodeLike,
): BinauralController {
  let pair: ActivePair | null = null
  let stopTimer: ReturnType<typeof setTimeout> | null = null

  const clearStopTimer = () => {
    if (stopTimer !== null) {
      clearTimeout(stopTimer)
      stopTimer = null
    }
  }

  const teardownNow = () => {
    clearStopTimer()
    if (!pair) return
    const current = pair
    pair = null
    safeStop(current.leftOsc)
    safeStop(current.rightOsc)
    safeDisconnect(current.leftOsc)
    safeDisconnect(current.rightOsc)
    for (const node of current.nodes) safeDisconnect(node)
    safeDisconnect(current.outputGain)
  }

  const createPair = (leftFreq: number, rightFreq: number): ActivePair => {
    const leftOsc = ctx.createOscillator()
    const rightOsc = ctx.createOscillator()
    leftOsc.type = 'sine'
    rightOsc.type = 'sine'
    leftOsc.frequency.value = leftFreq
    rightOsc.frequency.value = rightFreq

    const outputGain = ctx.createGain()
    outputGain.gain.value = 0
    try {
      outputGain.channelCount = 2
      outputGain.channelCountMode = 'explicit'
    } catch {
      // Optional in minimal mock contexts.
    }

    const nodes: AudioNodeLike[] = []

    if (typeof ctx.createChannelMerger === 'function') {
      // Discrete L/R routing (input 0 -> Left, input 1 -> Right) guarantees zero crosstalk.
      const merger = ctx.createChannelMerger(2)
      leftOsc.connect(merger, 0, 0)
      rightOsc.connect(merger, 0, 1)
      merger.connect(outputGain)
      nodes.push(merger)
    } else if (typeof ctx.createStereoPanner === 'function') {
      const leftPan = ctx.createStereoPanner()
      const rightPan = ctx.createStereoPanner()
      leftPan.pan.value = -1
      rightPan.pan.value = 1
      leftOsc.connect(leftPan)
      rightOsc.connect(rightPan)
      leftPan.connect(outputGain)
      rightPan.connect(outputGain)
      nodes.push(leftPan, rightPan)
    } else {
      leftOsc.connect(outputGain)
      rightOsc.connect(outputGain)
    }

    outputGain.connect(destination)
    const now = ctx.currentTime
    leftOsc.start(now)
    rightOsc.start(now)

    return { leftOsc, rightOsc, outputGain, nodes }
  }

  const fadeOutAndTeardown = (fadeSeconds: number) => {
    clearStopTimer()
    if (!pair) return
    const safeFade = Math.max(MIN_FADE_SECONDS, Math.max(0, fadeSeconds))
    rampParam(pair.outputGain.gain, 0, safeFade, ctx.currentTime)
    stopTimer = setTimeout(() => {
      stopTimer = null
      teardownNow()
    }, Math.ceil(safeFade * 1000) + 120)
  }

  return {
    update({ band, bandGain, carrier, fadeSeconds, overrideBeatHz, scale = 1 }) {
      const normalizedGain = clamp(bandGain, 0, 1) * clamp(scale, 0, 1)
      const beat = band ? (overrideBeatHz && overrideBeatHz > 0 ? overrideBeatHz : bandHz(band)) : 0

      if (!band || beat <= 0 || normalizedGain <= 0.001) {
        fadeOutAndTeardown(fadeSeconds)
        return
      }

      clearStopTimer()

      const leftFreq = clamp(carrier || 146.83, MIN_CARRIER_HZ, MAX_CARRIER_HZ)
      const rightFreq = leftFreq + beat
      const targetGain = normalizedGain * BINAURAL_MAX_GAIN
      const gainFade = Math.max(MIN_FADE_SECONDS, Math.max(0, fadeSeconds))

      if (!pair) {
        pair = createPair(leftFreq, rightFreq)
      } else {
        const freqRamp = Math.max(0.08, Math.min(gainFade, 0.8))
        const now = ctx.currentTime
        rampParam(pair.leftOsc.frequency, leftFreq, freqRamp, now)
        rampParam(pair.rightOsc.frequency, rightFreq, freqRamp, now)
      }

      rampParam(pair.outputGain.gain, targetGain, gainFade, ctx.currentTime)
    },

    stop(fadeSeconds) {
      fadeOutAndTeardown(fadeSeconds)
    },

    dispose() {
      teardownNow()
    },
  }
}
