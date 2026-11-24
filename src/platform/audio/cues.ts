import type { CueName } from '@/core/sound/engine'
import { DEFAULT_HARMONIC_KEY, resolveGameNotes, type HarmonicKeyId, type QuantizedNote } from '@/core/sound/harmonics'
import { clamp, rampParam, safeDisconnect, safeStop } from './params'
import type { AudioContextLike, AudioNodeLike, BiquadFilterNodeLike, GainNodeLike, OscillatorNodeLike } from './types'

/**
 * Web Audio / react-native-audio-api interpret BiquadFilter `Q` in dB for lowpass
 * (`g = 10^(Q/20)`), so true flat Butterworth is `-3.01` dB (zero resonant peak).
 */
const BUTTERWORTH_Q_DB = -3.01
const MAX_ACTIVE_CUE_VOICES = 8

let activeCueVoices = 0

/**
 * Shared warm stereo echo-bloom bus for interactive game notes.
 *
 * Uses a strictly cycle-free **feedforward** two-tap stereo bloom (`wetFilter -> delayL`
 * + `delayL -> damp -> delayR`, ZERO recursive feedback edges) so it is mathematically
 * impossible to self-oscillate, accumulate noise, or latch glitches across preset switches.
 */
export interface CueBloomBus {
  readonly input: GainNodeLike
  setWarmth(cutoffHz: number, rampSeconds: number): void
  dispose(): void
}

export function createCueBloomBus(ctx: AudioContextLike, destination: AudioNodeLike): CueBloomBus {
  const input = ctx.createGain()
  input.gain.value = 1
  input.connect(destination)

  const extraNodes: AudioNodeLike[] = []
  let wetFilter: BiquadFilterNodeLike | null = null

  if (typeof ctx.createDelay === 'function') {
    try {
      const wetSend = ctx.createGain()
      wetSend.gain.value = 0.24

      wetFilter = ctx.createBiquadFilter()
      wetFilter.type = 'lowpass'
      wetFilter.frequency.value = 1280
      wetFilter.Q.value = BUTTERWORTH_Q_DB
      try {
        wetFilter.frequency.setValueAtTime(1280, ctx.currentTime)
      } catch {
        /* mock fallback */
      }

      // Strictly feedforward stereo bloom: tap 1 (L, 185ms) feeds damped tap 2 (R, +265ms)
      const delayL = ctx.createDelay(1)
      delayL.delayTime.value = 0.185

      const tap2Damp = ctx.createGain()
      tap2Damp.gain.value = 0.44

      const delayR = ctx.createDelay(1)
      delayR.delayTime.value = 0.265

      input.connect(wetSend)
      wetSend.connect(wetFilter)
      wetFilter.connect(delayL)
      delayL.connect(tap2Damp)
      tap2Damp.connect(delayR)

      if (typeof ctx.createStereoPanner === 'function') {
        const panL = ctx.createStereoPanner()
        panL.pan.value = -0.45
        const panR = ctx.createStereoPanner()
        panR.pan.value = 0.45
        delayL.connect(panL)
        delayR.connect(panR)
        panL.connect(destination)
        panR.connect(destination)
        extraNodes.push(panL, panR)
      } else {
        delayL.connect(destination)
        delayR.connect(destination)
      }

      extraNodes.push(wetSend, wetFilter, delayL, tap2Damp, delayR)
    } catch {
      // Dry path already connected cleanly.
    }
  }

  return {
    input,
    setWarmth(cutoffHz, rampSeconds) {
      if (!wetFilter) return
      rampParam(wetFilter.frequency, clamp(cutoffHz, 420, 2600), Math.max(0.08, rampSeconds), ctx.currentTime)
    },
    dispose() {
      safeDisconnect(input)
      for (const n of extraNodes) safeDisconnect(n)
    },
  }
}

function playQuantizedNote(
  ctx: AudioContextLike,
  destination: AudioNodeLike,
  note: QuantizedNote,
  vol: number,
): void {
  if (activeCueVoices >= MAX_ACTIVE_CUE_VOICES) return
  activeCueVoices += 1

  const start = ctx.currentTime + note.delay
  const dur = note.attack + note.decay
  const stopAt = start + dur + 0.04

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = clamp(note.cutoff, 320, 4200)
  filter.Q.value = BUTTERWORTH_Q_DB

  const env = ctx.createGain()
  const peak = Math.max(0.0002, note.gain * vol)
  env.gain.value = 0.0001
  env.gain.setValueAtTime(0.0001, start)
  env.gain.linearRampToValueAtTime(peak, start + note.attack)
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur)

  const fundamental = ctx.createOscillator()
  fundamental.type = 'sine'
  fundamental.frequency.setValueAtTime(note.freq, start)
  if (note.endFreq && note.endFreq !== note.freq) {
    fundamental.frequency.exponentialRampToValueAtTime(note.endFreq, start + note.attack + note.decay * 0.7)
  }
  fundamental.connect(filter)

  let overtone: OscillatorNodeLike | null = null
  let overtoneGainNode: GainNodeLike | null = null
  if (note.overtoneGain > 0.005) {
    overtone = ctx.createOscillator()
    overtone.type = 'triangle'
    overtone.frequency.setValueAtTime(note.freq * 2, start)
    overtoneGainNode = ctx.createGain()
    overtoneGainNode.gain.value = note.overtoneGain
    overtone.connect(overtoneGainNode)
    overtoneGainNode.connect(filter)
  }

  let panner: AudioNodeLike | null = null
  filter.connect(env)
  if (typeof ctx.createStereoPanner === 'function' && Math.abs(note.pan) > 0.02) {
    try {
      const p = ctx.createStereoPanner()
      p.pan.value = clamp(note.pan, -0.7, 0.7)
      env.connect(p)
      p.connect(destination)
      panner = p
    } catch {
      env.connect(destination)
    }
  } else {
    env.connect(destination)
  }

  let cleaned = false
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    activeCueVoices = Math.max(0, activeCueVoices - 1)
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
    // CRITICAL for react-native-audio-api: clear `onended = null` so the native
    // AudioEventEmitter unsubscribes and releases the C++ node from its registry!
    try {
      fundamental.onended = null
    } catch {
      /* ignore */
    }
    safeStop(fundamental)
    safeStop(overtone)
    safeDisconnect(fundamental)
    safeDisconnect(overtone)
    safeDisconnect(overtoneGainNode)
    safeDisconnect(filter)
    safeDisconnect(env)
    safeDisconnect(panner)
  }

  fundamental.onended = cleanup
  fallbackTimer = setTimeout(cleanup, Math.ceil((note.delay + dur + 0.35) * 1000))

  fundamental.start(start)
  fundamental.stop(stopAt)
  if (overtone) {
    overtone.start(start)
    overtone.stop(stopAt)
  }
}

export function playHarmonicCue(
  ctx: AudioContextLike,
  destination: AudioNodeLike,
  name: CueName,
  volume = 1,
  keyId: HarmonicKeyId = DEFAULT_HARMONIC_KEY,
  stepIndex = 0,
  darkness = 0,
): void {
  const vol = clamp(volume, 0, 1)
  if (vol <= 0.001) return
  const notes = resolveGameNotes(name, keyId, stepIndex, darkness)
  for (const note of notes) {
    playQuantizedNote(ctx, destination, note, vol)
  }
}
