import type { CueName } from '@/core/sound/engine'
import { DEFAULT_HARMONIC_KEY, resolveGameNotes, type HarmonicKeyId, type QuantizedNote } from '@/core/sound/harmonics'
import { clamp, safeDisconnect } from './params'
import type { AudioContextLike, AudioNodeLike, GainNodeLike, OscillatorNodeLike } from './types'

/**
 * Shared warm stereo echo-bloom bus for interactive game notes.
 * Routes cues through dual damped delays so every tap/place/clear dissolves
 * seamlessly into the nocturnal soundscape instead of sounding like dry UI clicks.
 */
export interface CueBloomBus {
  readonly input: GainNodeLike
  dispose(): void
}

export function createCueBloomBus(ctx: AudioContextLike, destination: AudioNodeLike): CueBloomBus {
  const input = ctx.createGain()
  input.gain.value = 1
  input.connect(destination)

  const extraNodes: AudioNodeLike[] = []

  if (typeof ctx.createDelay === 'function') {
    try {
      const wetSend = ctx.createGain()
      wetSend.gain.value = 0.24

      const wetFilter = ctx.createBiquadFilter()
      wetFilter.type = 'lowpass'
      wetFilter.frequency.value = 1280
      wetFilter.Q.value = 0.55

      const delayL = ctx.createDelay(1)
      delayL.delayTime.value = 0.185
      const fbL = ctx.createGain()
      fbL.gain.value = 0.22

      const delayR = ctx.createDelay(1)
      delayR.delayTime.value = 0.265
      const fbR = ctx.createGain()
      fbR.gain.value = 0.2

      input.connect(wetSend)
      wetSend.connect(wetFilter)
      wetFilter.connect(delayL)
      wetFilter.connect(delayR)
      delayL.connect(fbL)
      fbL.connect(delayR)
      delayR.connect(fbR)
      fbR.connect(delayL)

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

      extraNodes.push(wetSend, wetFilter, delayL, fbL, delayR, fbR)
    } catch {
      // Dry path already connected cleanly.
    }
  }

  return {
    input,
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
  const start = ctx.currentTime + note.delay
  const stopAt = start + note.attack + note.decay + 0.04

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = clamp(note.cutoff, 320, 4200)
  filter.Q.value = 0.6

  const env = ctx.createGain()
  const peak = Math.max(0.0002, note.gain * vol)
  env.gain.setValueAtTime(0.0001, start)
  env.gain.linearRampToValueAtTime(peak, start + note.attack)
  env.gain.exponentialRampToValueAtTime(0.0001, start + note.attack + note.decay)

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

  fundamental.onended = () => {
    safeDisconnect(fundamental)
    safeDisconnect(overtone)
    safeDisconnect(overtoneGainNode)
    safeDisconnect(filter)
    safeDisconnect(env)
    safeDisconnect(panner)
  }

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
