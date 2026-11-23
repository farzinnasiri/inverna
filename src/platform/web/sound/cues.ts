import type { CueName } from '@/core/sound/engine'
import { clamp, safeDisconnect } from './params'

interface WarmToneOpts {
  freq: number
  endFreq?: number
  delay?: number
  attack: number
  decay: number
  gain: number
  cutoff: number
  overtoneGain?: number
}

/**
 * Synthesises a single warm, muted felt-piano / marimba / candle-bell tone:
 * sine fundamental + optional soft triangle 2nd harmonic through a warm lowpass.
 */
function playWarmTone(ctx: AudioContext, destination: AudioNode, opts: WarmToneOpts): void {
  const start = ctx.currentTime + (opts.delay ?? 0)
  const stopAt = start + opts.attack + opts.decay + 0.03

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = opts.cutoff
  filter.Q.value = 0.6

  const env = ctx.createGain()
  const peak = Math.max(0.0002, opts.gain)
  env.gain.setValueAtTime(0.0001, start)
  env.gain.linearRampToValueAtTime(peak, start + opts.attack)
  env.gain.exponentialRampToValueAtTime(0.0001, start + opts.attack + opts.decay)

  const fundamental = ctx.createOscillator()
  fundamental.type = 'sine'
  fundamental.frequency.setValueAtTime(opts.freq, start)
  if (opts.endFreq && opts.endFreq !== opts.freq) {
    fundamental.frequency.exponentialRampToValueAtTime(opts.endFreq, start + opts.attack + opts.decay * 0.7)
  }
  fundamental.connect(filter)

  let overtone: OscillatorNode | null = null
  let overtoneGainNode: GainNode | null = null
  if (opts.overtoneGain && opts.overtoneGain > 0) {
    overtone = ctx.createOscillator()
    overtone.type = 'triangle'
    overtone.frequency.setValueAtTime(opts.freq * 2, start)
    overtoneGainNode = ctx.createGain()
    overtoneGainNode.gain.value = opts.overtoneGain
    overtone.connect(overtoneGainNode)
    overtoneGainNode.connect(filter)
  }

  filter.connect(env)
  env.connect(destination)

  fundamental.onended = () => {
    safeDisconnect(fundamental)
    safeDisconnect(overtone)
    safeDisconnect(overtoneGainNode)
    safeDisconnect(filter)
    safeDisconnect(env)
  }

  fundamental.start(start)
  fundamental.stop(stopAt)
  if (overtone) {
    overtone.start(start)
    overtone.stop(stopAt)
  }
}

export function playCue(ctx: AudioContext, destination: AudioNode, name: CueName, volume = 1): void {
  const vol = clamp(volume, 0, 1)
  if (vol <= 0.001) return

  switch (name) {
    case 'tap':
      // Quiet wooden marimba tap
      playWarmTone(ctx, destination, {
        freq: 342,
        endFreq: 326,
        attack: 0.004,
        decay: 0.065,
        gain: 0.085 * vol,
        cutoff: 1050,
        overtoneGain: 0.14,
      })
      break

    case 'place':
      // Soft felt-piano / stone settle
      playWarmTone(ctx, destination, {
        freq: 246.94,
        attack: 0.006,
        decay: 0.13,
        gain: 0.11 * vol,
        cutoff: 1150,
        overtoneGain: 0.18,
      })
      playWarmTone(ctx, destination, {
        freq: 369.99,
        delay: 0.008,
        attack: 0.006,
        decay: 0.095,
        gain: 0.035 * vol,
        cutoff: 1100,
      })
      break

    case 'clear':
      // Warm ascending two-note marimba interval (E4 -> A4)
      playWarmTone(ctx, destination, {
        freq: 329.63,
        attack: 0.006,
        decay: 0.18,
        gain: 0.1 * vol,
        cutoff: 1350,
        overtoneGain: 0.16,
      })
      playWarmTone(ctx, destination, {
        freq: 440,
        delay: 0.065,
        attack: 0.006,
        decay: 0.24,
        gain: 0.11 * vol,
        cutoff: 1450,
        overtoneGain: 0.16,
      })
      break

    case 'chime':
      // Warm two-note candle bell (G4 -> D5 + faint soft bloom)
      playWarmTone(ctx, destination, {
        freq: 392,
        attack: 0.009,
        decay: 0.52,
        gain: 0.11 * vol,
        cutoff: 1500,
        overtoneGain: 0.14,
      })
      playWarmTone(ctx, destination, {
        freq: 587.33,
        delay: 0.11,
        attack: 0.01,
        decay: 0.72,
        gain: 0.115 * vol,
        cutoff: 1600,
        overtoneGain: 0.12,
      })
      playWarmTone(ctx, destination, {
        freq: 783.99,
        delay: 0.13,
        attack: 0.01,
        decay: 0.48,
        gain: 0.025 * vol,
        cutoff: 1550,
      })
      break

    case 'undo':
      // Soft descending two-note step (E4 -> C4)
      playWarmTone(ctx, destination, {
        freq: 329.63,
        attack: 0.005,
        decay: 0.095,
        gain: 0.08 * vol,
        cutoff: 1000,
        overtoneGain: 0.12,
      })
      playWarmTone(ctx, destination, {
        freq: 261.63,
        delay: 0.055,
        attack: 0.005,
        decay: 0.135,
        gain: 0.085 * vol,
        cutoff: 950,
        overtoneGain: 0.12,
      })
      break
  }
}
