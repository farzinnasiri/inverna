import { BANDS, type BandId } from '@/core/sound/catalog'
import { clamp, rampParam, safeDisconnect, safeStop, setParam } from './params'
import type { AudioContextLike, AudioNodeLike, GainNodeLike, OscillatorNodeLike } from './types'

/**
 * Gentle maximum scaling so binaural sine tones always sit softly beneath
 * the harmonic pad and ambient textures without listener fatigue.
 */
// Felt more than heard: at 0.13 the pure ~150 Hz tones read as an electrical
// hum (like an old TV warming up) on top of the sound.
const BINAURAL_MAX_GAIN = 0.065
/** The tones come in slowly, under the sound, when a sound starts. */
const FADE_IN_SECONDS = 6
/** Beat changes smaller than this (the wind-down's slow drift) glide; bigger ones crossfade. */
const GLIDE_MAX_BEAT_HZ = 1.2
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
  /** Where the oscillators are heading (param.value is unreliable on native). */
  left: number
  right: number
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

  const retire = (p: ActivePair) => {
    safeStop(p.leftOsc)
    safeStop(p.rightOsc)
    safeDisconnect(p.leftOsc)
    safeDisconnect(p.rightOsc)
    for (const node of p.nodes) safeDisconnect(node)
    safeDisconnect(p.outputGain)
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
    setParam(leftOsc.frequency, leftFreq)
    setParam(rightOsc.frequency, rightFreq)

    const outputGain = ctx.createGain()
    setParam(outputGain.gain, 0)
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
      setParam(leftPan.pan, -1)
      setParam(rightPan.pan, 1)
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

    return { leftOsc, rightOsc, outputGain, nodes, left: leftFreq, right: rightFreq }
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

      let fadeIn = gainFade
      if (!pair) {
        pair = createPair(leftFreq, rightFreq)
        fadeIn = Math.max(gainFade, FADE_IN_SECONDS)
      } else if (
        Math.abs(leftFreq - pair.left) > 0.5 ||
        Math.abs(rightFreq - leftFreq - (pair.right - pair.left)) > GLIDE_MAX_BEAT_HZ
      ) {
        // A different sound: fade the old tones out and new ones in, rather
        // than sliding the pitch (heard as a "bueee" sweep on every switch).
        const old = pair
        const out = Math.max(1, Math.min(gainFade * 1.4, 2.4))
        rampParam(old.outputGain.gain, 0, out, ctx.currentTime)
        // Stop on the audio clock too, in case iOS delays the timer while locked.
        safeStop(old.leftOsc, ctx.currentTime + out + 0.05)
        safeStop(old.rightOsc, ctx.currentTime + out + 0.05)
        setTimeout(() => retire(old), Math.ceil(out * 1000) + 150)
        pair = createPair(leftFreq, rightFreq)
        fadeIn = Math.max(gainFade, 3)
      } else {
        // The wind down's slow drift: a small glide is inaudible.
        const freqRamp = Math.max(0.08, Math.min(gainFade, 4))
        const now = ctx.currentTime
        rampParam(pair.leftOsc.frequency, leftFreq, freqRamp, now)
        rampParam(pair.rightOsc.frequency, rightFreq, freqRamp, now)
        pair.left = leftFreq
        pair.right = rightFreq
      }

      rampParam(pair.outputGain.gain, targetGain, fadeIn, ctx.currentTime)
    },

    stop(fadeSeconds) {
      fadeOutAndTeardown(fadeSeconds)
    },

    dispose() {
      teardownNow()
    },
  }
}
