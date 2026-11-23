/**
 * Procedural stereo noise buffers for Lull's ambient layers.
 *
 * Every buffer is 12 seconds of independent stereo (uncorrelated L/R) noise
 * with an equal-power loop crossfade so `AudioBufferSourceNode.loop = true`
 * never produces an audible seam or click.
 */

export type NoiseKind = 'white' | 'pink' | 'brown'

export const NOISE_BUFFER_SECONDS = 12
const LOOP_XFADE_SECONDS = 0.4

export interface NoiseBufferBank {
  get(kind: NoiseKind): AudioBuffer
}

function applyLoopCrossfade(target: Float32Array, raw: Float32Array, length: number, xfade: number): void {
  target.set(raw.subarray(0, length))
  if (xfade <= 0) return
  const halfPi = Math.PI / 2
  for (let i = 0; i < xfade; i++) {
    const t = i / xfade
    const fadeIn = Math.sin(t * halfPi)
    const fadeOut = Math.cos(t * halfPi)
    target[i] = raw[i] * fadeIn + raw[length + i] * fadeOut
  }
}

function fillWhite(out: Float32Array, xfade: number): void {
  const length = out.length
  const total = length + xfade
  const raw = new Float32Array(total)
  for (let i = 0; i < total; i++) {
    raw[i] = (Math.random() * 2 - 1) * 0.38
  }
  applyLoopCrossfade(out, raw, length, xfade)
}

/**
 * Paul Kellet's 7-pole pink noise approximation (-3 dB/octave),
 * warmed up before recording so initial filter transients are absent.
 */
function fillPink(out: Float32Array, xfade: number): void {
  const length = out.length
  const total = length + xfade
  const raw = new Float32Array(total)

  let b0 = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let b5 = 0
  let b6 = 0

  const step = () => {
    const white = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.969 * b2 + white * 0.153852
    b3 = 0.8665 * b3 + white * 0.3104856
    b4 = 0.55 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.016898
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.085
    b6 = white * 0.115926
    return Math.max(-0.98, Math.min(0.98, pink))
  }

  for (let i = 0; i < 512; i++) step()
  for (let i = 0; i < total; i++) raw[i] = step()

  applyLoopCrossfade(out, raw, length, xfade)
}

/**
 * Integrated random walk (-6 dB/octave) followed by a 1-pole DC blocker
 * so the buffer stays centered around zero with cosy, deep sub-warmth.
 */
function fillBrown(out: Float32Array, xfade: number): void {
  const length = out.length
  const total = length + xfade
  const raw = new Float32Array(total)

  let walk = 0
  let prevIn = 0
  let prevOut = 0
  const dcR = 0.997

  const step = () => {
    const white = Math.random() * 2 - 1
    walk = (walk + 0.02 * white) / 1.015
    const blocked = walk - prevIn + dcR * prevOut
    prevIn = walk
    prevOut = blocked
    return Math.max(-0.98, Math.min(0.98, blocked * 2.4))
  }

  for (let i = 0; i < 1024; i++) step()
  for (let i = 0; i < total; i++) raw[i] = step()

  applyLoopCrossfade(out, raw, length, xfade)
}

export function createNoiseBuffer(ctx: AudioContext, kind: NoiseKind, seconds = NOISE_BUFFER_SECONDS): AudioBuffer {
  const sampleRate = Math.max(8000, Math.round(ctx.sampleRate || 44100))
  const length = Math.max(1, Math.round(sampleRate * seconds))
  const xfade = Math.min(Math.floor(length / 4), Math.round(sampleRate * LOOP_XFADE_SECONDS))
  const buffer = ctx.createBuffer(2, length, sampleRate)

  const fill = kind === 'white' ? fillWhite : kind === 'pink' ? fillPink : fillBrown
  fill(buffer.getChannelData(0), xfade)
  fill(buffer.getChannelData(1), xfade)

  return buffer
}

export function createNoiseBufferBank(ctx: AudioContext): NoiseBufferBank {
  const cache: Partial<Record<NoiseKind, AudioBuffer>> = {}
  return {
    get(kind) {
      let existing = cache[kind]
      if (!existing) {
        existing = createNoiseBuffer(ctx, kind)
        cache[kind] = existing
      }
      return existing
    },
  }
}
