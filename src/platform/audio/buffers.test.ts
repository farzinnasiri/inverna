import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SILENT_MIX } from '@/core/sound/catalog'
import {
  createNoiseBuffer,
  createNoiseBufferBank,
  isPrecomputed,
  resetTextureCache,
  texturesFor,
  warmTextures,
  type NoiseKind,
} from './buffers'
import type { AudioContextLike } from './types'

function fakeContext(sampleRate = 48000): AudioContextLike {
  return {
    sampleRate,
    createBuffer: (channels: number, length: number, rate: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length))
      return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: (c: number) => data[c]! }
    },
  } as unknown as AudioContextLike
}

function warm(...kinds: NoiseKind[]) {
  warmTextures(kinds, 0)
  vi.advanceTimersByTime(5000)
}

beforeEach(() => {
  vi.useFakeTimers()
  resetTextureCache()
})
afterEach(() => vi.useRealTimers())

describe('noise buffers', () => {
  it('uses the samples worked out ahead, once, and they match the on-demand ones', () => {
    const direct = createNoiseBuffer(fakeContext(), 'rain-near')
    expect(isPrecomputed('rain-near')).toBe(false)
    warm('rain-near')
    expect(isPrecomputed('rain-near')).toBe(true)
    const early = createNoiseBuffer(fakeContext(), 'rain-near')
    // Handed over, not kept: the memory is freed once the buffer has it.
    expect(isPrecomputed('rain-near')).toBe(false)
    expect(early.sampleRate).toBe(direct.sampleRate)
    expect(early.getChannelData(0)).toEqual(direct.getChannelData(0))
    expect(early.getChannelData(1)).toEqual(direct.getChannelData(1))
  })

  it("doesn't use precomputed samples made at a higher rate than the context runs", () => {
    warm('pink')
    const slow = createNoiseBuffer(fakeContext(16000), 'pink')
    expect(slow.sampleRate).toBeLessThanOrEqual(16000)
    // Still waiting for a context that can use it.
    expect(isPrecomputed('pink')).toBe(true)
  })

  // ISS-11: two warmers used to work the same texture out twice.
  it('never works out a texture that already has a buffer', () => {
    const bank = createNoiseBufferBank(fakeContext())
    bank.get('brown')
    warm('brown')
    expect(isPrecomputed('brown')).toBe(false)
  })

  it('warms only what a mix needs, loudest layer first', () => {
    expect(texturesFor({ ...SILENT_MIX, layers: { rain: 0.2, fire: 0.6, wind: 0 } })).toEqual([
      'fire-crackle',
      'fire-bed',
      'rain-patter',
      'rain-near',
    ])
  })
})
