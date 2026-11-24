import type { AudioBufferLike, AudioContextLike } from './types'

/**
 * Procedural stereo noise & acoustic texture buffers for Lull.
 *
 * Every buffer is 12 seconds of independent stereo (uncorrelated L/R) audio
 * with an equal-power loop crossfade so `AudioBufferSourceNode.loop = true`
 * runs continuously on the C++ audio thread (even when iOS locks the screen)
 * without ever clicking or requiring JS timers.
 */

export type NoiseKind = 'white' | 'pink' | 'brown' | 'rain-patter' | 'fire-crackle'

export const NOISE_BUFFER_SECONDS = 12
const LOOP_XFADE_SECONDS = 0.45

export interface NoiseBufferBank {
  get(kind: NoiseKind): AudioBufferLike
}

/** Deterministic fast PRNG per buffer so stereo channels stay richly uncorrelated and reproducible. */
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function applyLoopCrossfade(target: Float32Array, raw: Float32Array, length: number, xfade: number): void {
  target.set(raw.subarray(0, length))
  if (xfade <= 0) return
  const halfPi = Math.PI / 2
  for (let i = 0; i < xfade; i++) {
    const t = i / xfade
    const fadeIn = Math.sin(t * halfPi)
    const fadeOut = Math.cos(t * halfPi)
    target[i] = raw[i]! * fadeIn + raw[length + i]! * fadeOut
  }
}

function fillWhite(out: Float32Array, xfade: number, rand: () => number): void {
  const length = out.length
  const total = length + xfade
  const raw = new Float32Array(total)
  for (let i = 0; i < total; i++) {
    raw[i] = (rand() * 2 - 1) * 0.36
  }
  applyLoopCrossfade(out, raw, length, xfade)
}

/**
 * Paul Kellet's 7-pole 1/f pink noise approximation (-3 dB/octave),
 * warmed up before recording so initial filter transients are absent.
 */
function fillPink(out: Float32Array, xfade: number, rand: () => number): void {
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
    const white = rand() * 2 - 1
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
 * so the buffer stays centered around zero with cozy, deep sub-warmth.
 */
function fillBrown(out: Float32Array, xfade: number, rand: () => number): void {
  const length = out.length
  const total = length + xfade
  const raw = new Float32Array(total)

  let walk = 0
  let prevIn = 0
  let prevOut = 0
  const dcR = 0.997

  const step = () => {
    const white = rand() * 2 - 1
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

/**
 * Natural soft raindrop micro-patter baked into a seamless stereo buffer.
 * Runs 100% natively in CoreAudio/Oboe even when iOS suspends JS timers.
 */
function fillRainPatter(out: Float32Array, xfade: number, sampleRate: number, rand: () => number): void {
  const length = out.length
  const total = length + xfade
  const raw = new Float32Array(total)

  const dropCount = Math.max(45, Math.round((total / sampleRate) * 7.5))
  for (let d = 0; d < dropCount; d++) {
    const start = Math.floor(rand() * (total - Math.round(sampleRate * 0.06)))
    const durSamples = Math.max(24, Math.round(sampleRate * (0.016 + rand() * 0.032)))
    const freq = 950 + rand() * 1950
    const amp = 0.08 + rand() * 0.16
    const w = (2 * Math.PI * freq) / sampleRate
    // Tiny resonant droplet chirp + filtered micro-splash
    for (let i = 0; i < durSamples && start + i < total; i++) {
      const t = i / durSamples
      const env = Math.sin(Math.min(1, t * 8) * (Math.PI / 2)) * Math.exp(-t * 5.8)
      const tone = Math.sin(i * w * (1 + t * 0.18)) * 0.45 + (rand() * 2 - 1) * 0.55
      raw[start + i] = (raw[start + i] ?? 0) + tone * env * amp
    }
  }

  // Gentle 1-pole soft lowpass to keep drops silky, never harsh
  let lp = 0
  for (let i = 0; i < total; i++) {
    lp = lp + 0.34 * ((raw[i] ?? 0) - lp)
    raw[i] = Math.max(-0.92, Math.min(0.92, lp))
  }

  applyLoopCrossfade(out, raw, length, xfade)
}

/**
 * Warm, non-startling woody hearth crackles baked into a seamless stereo buffer.
 * Runs 100% natively in CoreAudio/Oboe when the screen is locked.
 */
function fillFireCrackle(out: Float32Array, xfade: number, sampleRate: number, rand: () => number): void {
  const length = out.length
  const total = length + xfade
  const raw = new Float32Array(total)

  const popCount = Math.max(18, Math.round((total / sampleRate) * 2.4))
  for (let p = 0; p < popCount; p++) {
    const start = Math.floor(rand() * (total - Math.round(sampleRate * 0.04)))
    const durSamples = Math.max(14, Math.round(sampleRate * (0.008 + rand() * 0.016)))
    const amp = 0.12 + rand() * 0.22
    const freq = 1100 + rand() * 2100
    const w = (2 * Math.PI * freq) / sampleRate
    for (let i = 0; i < durSamples && start + i < total; i++) {
      const t = i / durSamples
      const env = Math.exp(-t * 7.5)
      const grain = (rand() * 2 - 1) * 0.72 + Math.sin(i * w) * 0.28
      raw[start + i] = (raw[start + i] ?? 0) + grain * env * amp
    }
  }

  let lp = 0
  for (let i = 0; i < total; i++) {
    lp = lp + 0.42 * ((raw[i] ?? 0) - lp)
    raw[i] = Math.max(-0.92, Math.min(0.92, lp))
  }

  applyLoopCrossfade(out, raw, length, xfade)
}

const KIND_SEED: Record<NoiseKind, number> = {
  white: 101,
  pink: 202,
  brown: 303,
  'rain-patter': 404,
  'fire-crackle': 505,
}

export function createNoiseBuffer(
  ctx: AudioContextLike,
  kind: NoiseKind,
  seconds = NOISE_BUFFER_SECONDS,
): AudioBufferLike {
  const sampleRate = Math.max(8000, Math.round(ctx.sampleRate || 44100))
  const length = Math.max(1, Math.round(sampleRate * seconds))
  const xfade = Math.min(Math.floor(length / 4), Math.round(sampleRate * LOOP_XFADE_SECONDS))
  const buffer = ctx.createBuffer(2, length, sampleRate)

  const seed = KIND_SEED[kind]
  const fillChannel = (channel: number) => {
    const out = buffer.getChannelData(channel)
    const rand = makeRng(seed + channel * 9973)
    switch (kind) {
      case 'white':
        fillWhite(out, xfade, rand)
        break
      case 'pink':
        fillPink(out, xfade, rand)
        break
      case 'brown':
        fillBrown(out, xfade, rand)
        break
      case 'rain-patter':
        fillRainPatter(out, xfade, sampleRate, rand)
        break
      case 'fire-crackle':
        fillFireCrackle(out, xfade, sampleRate, rand)
        break
    }
  }

  fillChannel(0)
  fillChannel(1)
  return buffer
}

export function createNoiseBufferBank(ctx: AudioContextLike): NoiseBufferBank {
  const cache: Partial<Record<NoiseKind, AudioBufferLike>> = {}
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
