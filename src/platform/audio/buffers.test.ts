import { describe, expect, it, vi } from 'vitest'
import { createNoiseBuffer, precomputeNoise } from './buffers'
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

describe('noise buffers', () => {
  it('gives the same samples whether worked out ahead of time or on demand', () => {
    vi.useFakeTimers()
    const direct = createNoiseBuffer(fakeContext(), 'rain-near')
    precomputeNoise(['rain-near'], 10)
    vi.advanceTimersByTime(50)
    const early = createNoiseBuffer(fakeContext(), 'rain-near')
    vi.useRealTimers()
    expect(early.sampleRate).toBe(direct.sampleRate)
    expect(early.length).toBe(direct.length)
    expect(early.getChannelData(0)).toEqual(direct.getChannelData(0))
    expect(early.getChannelData(1)).toEqual(direct.getChannelData(1))
  })

  it('never makes a texture at a higher rate than the context runs', () => {
    expect(createNoiseBuffer(fakeContext(16000), 'pink').sampleRate).toBeLessThanOrEqual(16000)
  })
})
