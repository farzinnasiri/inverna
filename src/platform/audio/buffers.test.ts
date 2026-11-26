import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNoiseBuffer, isPrecomputed, precomputeNoise, type NoiseKind } from './buffers'
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

function precompute(kind: NoiseKind) {
  vi.useFakeTimers()
  precomputeNoise([kind], 10)
  vi.advanceTimersByTime(50)
  vi.useRealTimers()
}

afterEach(() => vi.useRealTimers())

describe('noise buffers', () => {
  it('uses the samples worked out after launch, once, and they match the on-demand ones', () => {
    const direct = createNoiseBuffer(fakeContext(), 'rain-near')
    expect(isPrecomputed('rain-near')).toBe(false)
    precompute('rain-near')
    expect(isPrecomputed('rain-near')).toBe(true)
    const early = createNoiseBuffer(fakeContext(), 'rain-near')
    // Handed over, not kept: the memory is freed once the buffer has it.
    expect(isPrecomputed('rain-near')).toBe(false)
    expect(early.sampleRate).toBe(direct.sampleRate)
    expect(early.getChannelData(0)).toEqual(direct.getChannelData(0))
    expect(early.getChannelData(1)).toEqual(direct.getChannelData(1))
  })

  it("doesn't use precomputed samples made at a higher rate than the context runs", () => {
    precompute('pink')
    const slow = createNoiseBuffer(fakeContext(16000), 'pink')
    expect(slow.sampleRate).toBeLessThanOrEqual(16000)
    // Still waiting for a context that can use it.
    expect(isPrecomputed('pink')).toBe(true)
  })
})
