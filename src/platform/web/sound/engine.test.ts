import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BANDS, LAYERS, PRESETS, SILENT_MIX, type Mix } from '@/core/sound/catalog'
import type { CueName } from '@/core/sound/engine'
import { NOISE_BUFFER_SECONDS } from './buffers'
import { createWebSoundEngine } from './index'

interface ParamCall {
  method: string
  args: number[]
}

class MockAudioParam {
  value: number
  calls: ParamCall[] = []

  constructor(initial = 0) {
    this.value = initial
  }

  setValueAtTime(value: number, startTime: number) {
    this.value = value
    this.calls.push({ method: 'setValueAtTime', args: [value, startTime] })
    return this
  }

  linearRampToValueAtTime(value: number, endTime: number) {
    this.value = value
    this.calls.push({ method: 'linearRampToValueAtTime', args: [value, endTime] })
    return this
  }

  exponentialRampToValueAtTime(value: number, endTime: number) {
    this.value = value
    this.calls.push({ method: 'exponentialRampToValueAtTime', args: [value, endTime] })
    return this
  }

  cancelScheduledValues(cancelTime: number) {
    this.calls.push({ method: 'cancelScheduledValues', args: [cancelTime] })
    return this
  }

  cancelAndHoldAtTime(cancelTime: number) {
    this.calls.push({ method: 'cancelAndHoldAtTime', args: [cancelTime] })
    return this
  }
}

interface ConnectionRecord {
  target: unknown
  output?: number
  input?: number
}

class MockAudioNode {
  connections: ConnectionRecord[] = []
  disconnected = false

  connect(target: unknown, output?: number, input?: number) {
    this.connections.push({ target, output, input })
    return target
  }

  disconnect() {
    this.disconnected = true
  }
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam(1)
  channelCount = 2
  channelCountMode = 'max'
}

class MockBiquadFilterNode extends MockAudioNode {
  type: BiquadFilterType = 'lowpass'
  frequency = new MockAudioParam(350)
  Q = new MockAudioParam(1)
  gain = new MockAudioParam(0)
}

class MockDynamicsCompressorNode extends MockAudioNode {
  threshold = new MockAudioParam(-24)
  knee = new MockAudioParam(30)
  ratio = new MockAudioParam(12)
  attack = new MockAudioParam(0.003)
  release = new MockAudioParam(0.25)
}

class MockStereoPannerNode extends MockAudioNode {
  pan = new MockAudioParam(0)
}

class MockChannelMergerNode extends MockAudioNode {
  readonly numberOfInputs: number
  constructor(numberOfInputs = 6) {
    super()
    this.numberOfInputs = numberOfInputs
  }
}

class MockAudioBuffer {
  readonly numberOfChannels: number
  readonly length: number
  readonly sampleRate: number
  readonly duration: number
  private channels: Float32Array[]

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels
    this.length = length
    this.sampleRate = sampleRate
    this.duration = length / sampleRate
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length))
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel]!
  }
}

class MockBufferSourceNode extends MockAudioNode {
  buffer: MockAudioBuffer | null = null
  loop = false
  started = false
  stopped = false
  onended: (() => void) | null = null

  start() {
    this.started = true
  }

  stop() {
    this.stopped = true
    this.onended?.()
  }
}

class MockOscillatorNode extends MockAudioNode {
  type: OscillatorType = 'sine'
  frequency = new MockAudioParam(440)
  started = false
  stopped = false
  periodicWave: unknown = null
  onended: (() => void) | null = null

  setPeriodicWave(wave: unknown) {
    this.periodicWave = wave
  }

  start() {
    this.started = true
  }

  stop() {
    this.stopped = true
    this.onended?.()
  }
}

interface MockContextOptions {
  initialState?: AudioContextState
  allowResume?: boolean
  includeChannelMerger?: boolean
  sampleRate?: number
}

class MockAudioContext {
  state: AudioContextState
  currentTime = 1
  sampleRate: number
  destination = new MockAudioNode()

  gains: MockGainNode[] = []
  filters: MockBiquadFilterNode[] = []
  compressors: MockDynamicsCompressorNode[] = []
  panners: MockStereoPannerNode[] = []
  mergers: MockChannelMergerNode[] = []
  sources: MockBufferSourceNode[] = []
  oscillators: MockOscillatorNode[] = []
  buffers: MockAudioBuffer[] = []

  resumeCalls = 0
  suspendCalls = 0

  private readonly allowResume: boolean
  createChannelMerger?: (numberOfInputs?: number) => MockChannelMergerNode

  constructor(opts: MockContextOptions = {}) {
    this.state = opts.initialState ?? 'suspended'
    this.allowResume = opts.allowResume ?? true
    this.sampleRate = opts.sampleRate ?? 8000

    if (opts.includeChannelMerger ?? true) {
      this.createChannelMerger = (numberOfInputs = 2) => {
        const node = new MockChannelMergerNode(numberOfInputs)
        this.mergers.push(node)
        return node
      }
    }
  }

  createGain() {
    const node = new MockGainNode()
    this.gains.push(node)
    return node
  }

  createBiquadFilter() {
    const node = new MockBiquadFilterNode()
    this.filters.push(node)
    return node
  }

  createDynamicsCompressor() {
    const node = new MockDynamicsCompressorNode()
    this.compressors.push(node)
    return node
  }

  createStereoPanner() {
    const node = new MockStereoPannerNode()
    this.panners.push(node)
    return node
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    const buf = new MockAudioBuffer(channels, length, sampleRate)
    this.buffers.push(buf)
    return buf
  }

  createBufferSource() {
    const node = new MockBufferSourceNode()
    this.sources.push(node)
    return node
  }

  createOscillator() {
    const node = new MockOscillatorNode()
    this.oscillators.push(node)
    return node
  }

  createPeriodicWave(real: Float32Array, imag: Float32Array) {
    return { real, imag }
  }

  async resume() {
    this.resumeCalls += 1
    if (this.allowResume) this.state = 'running'
  }

  async suspend() {
    this.suspendCalls += 1
    this.state = 'suspended'
  }
}

const originalAudioContext = (globalThis as Record<string, unknown>).AudioContext
const originalWebkitAudioContext = (globalThis as Record<string, unknown>).webkitAudioContext

function installMockAudioContext(opts: MockContextOptions = {}) {
  const created: MockAudioContext[] = []
  class TestAudioContext extends MockAudioContext {
    constructor() {
      super(opts)
      created.push(this)
    }
  }
  ;(globalThis as Record<string, unknown>).AudioContext = TestAudioContext
  delete (globalThis as Record<string, unknown>).webkitAudioContext
  return created
}

function uninstallAudioContext() {
  delete (globalThis as Record<string, unknown>).AudioContext
  delete (globalThis as Record<string, unknown>).webkitAudioContext
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  if (originalAudioContext === undefined) {
    delete (globalThis as Record<string, unknown>).AudioContext
  } else {
    ;(globalThis as Record<string, unknown>).AudioContext = originalAudioContext
  }
  if (originalWebkitAudioContext === undefined) {
    delete (globalThis as Record<string, unknown>).webkitAudioContext
  } else {
    ;(globalThis as Record<string, unknown>).webkitAudioContext = originalWebkitAudioContext
  }
})

describe('createWebSoundEngine — headless & restricted fallbacks', () => {
  it('never throws when AudioContext is unavailable', async () => {
    uninstallAudioContext()
    const engine = createWebSoundEngine()

    expect(engine.isRunning).toBe(false)
    await expect(engine.unlock()).resolves.toBeUndefined()
    expect(() => engine.setMaster(0.8, 0.5)).not.toThrow()
    expect(() => engine.setMix(PRESETS[0]!.mix, 1)).not.toThrow()
    expect(() => engine.cue('tap', 0.8)).not.toThrow()
    expect(() => engine.setCuesEnabled(false)).not.toThrow()
    expect(() => engine.stop(0.5)).not.toThrow()
    expect(engine.isRunning).toBe(false)
  })

  it('never throws when AudioContext constructor throws', async () => {
    ;(globalThis as Record<string, unknown>).AudioContext = class {
      constructor() {
        throw new Error('NotAllowedError')
      }
    }
    const engine = createWebSoundEngine()

    await expect(engine.unlock()).resolves.toBeUndefined()
    expect(() => engine.setMix(PRESETS[0]!.mix, 0.5)).not.toThrow()
    expect(() => engine.cue('chime')).not.toThrow()
    expect(() => engine.stop(0.2)).not.toThrow()
    expect(engine.isRunning).toBe(false)
  })
})

describe('createWebSoundEngine — lifecycle, master bus, and state transitions', () => {
  it('lazily constructs AudioContext with a soft limiter before destination and manages running state', async () => {
    const contexts = installMockAudioContext({ initialState: 'suspended' })
    const engine = createWebSoundEngine()

    expect(contexts).toHaveLength(0)
    expect(engine.isRunning).toBe(false)

    await engine.unlock()
    expect(contexts).toHaveLength(1)
    const ctx = contexts[0]!
    expect(ctx.resumeCalls).toBe(1)
    expect(ctx.state).toBe('running')

    // Soft limiter connects directly into ctx.destination
    expect(ctx.compressors).toHaveLength(1)
    expect(ctx.compressors[0]!.connections.some((c) => c.target === ctx.destination)).toBe(true)

    engine.setMaster(0.75, 0.5)
    engine.setMix(PRESETS[0]!.mix, 1.0)
    expect(engine.isRunning).toBe(true)

    // Stopping fades out, sets isRunning=false immediately, and cleans up after fade completes
    engine.stop(0.5)
    expect(engine.isRunning).toBe(false)
    expect(ctx.suspendCalls).toBe(0)

    vi.advanceTimersByTime(700)
    expect(ctx.suspendCalls).toBe(1)
    expect(ctx.sources.every((s) => s.stopped)).toBe(true)
  })

  it('cancels a pending stop teardown when a new mix starts mid-fade', async () => {
    const contexts = installMockAudioContext({ initialState: 'running' })
    const engine = createWebSoundEngine()

    engine.setMix({ layers: { brown: 0.6 }, band: null, bandGain: 0.35, carrier: 160 }, 0.5)
    expect(engine.isRunning).toBe(true)

    engine.stop(1.0)
    expect(engine.isRunning).toBe(false)

    // Restart halfway through stop fade
    vi.advanceTimersByTime(400)
    engine.setMix({ layers: { brown: 0.8 }, band: null, bandGain: 0.35, carrier: 160 }, 0.5)
    expect(engine.isRunning).toBe(true)

    // Advance past the original stop timer
    vi.advanceTimersByTime(1000)
    const ctx = contexts[0]!
    expect(engine.isRunning).toBe(true)
    expect(ctx.suspendCalls).toBe(0)
    expect(ctx.sources.some((s) => !s.stopped)).toBe(true)

    engine.stop(0)
  })

  it('treats SILENT_MIX as stopping ambient sound', async () => {
    const contexts = installMockAudioContext({ initialState: 'running' })
    const engine = createWebSoundEngine()

    engine.setMix({ layers: { pink: 0.5 }, band: null, bandGain: 0.35, carrier: 160 }, 0.2)
    expect(engine.isRunning).toBe(true)

    engine.setMix(SILENT_MIX, 0.2)
    expect(engine.isRunning).toBe(false)

    vi.advanceTimersByTime(400)
    expect(contexts[0]!.sources.every((s) => s.stopped)).toBe(true)
  })
})

describe('createWebSoundEngine — all 7 ambient layers', () => {
  it('synthesises all 7 layers using 12s stereo buffers and cleans up cleanly on stop', async () => {
    const contexts = installMockAudioContext({ initialState: 'running', sampleRate: 8000 })
    const engine = createWebSoundEngine()

    const allLayersMix: Mix = {
      layers: Object.fromEntries(LAYERS.map((l) => [l.id, 0.5])),
      band: null,
      bandGain: 0.35,
      carrier: 160,
    }

    engine.setMix(allLayersMix, 0.5)
    const ctx = contexts[0]!

    // White, pink, and brown 12s stereo buffers are created once and cached
    expect(ctx.buffers).toHaveLength(3)
    for (const buf of ctx.buffers) {
      expect(buf.numberOfChannels).toBe(2)
      expect(buf.length).toBe(NOISE_BUFFER_SECONDS * ctx.sampleRate)
      const ch0 = buf.getChannelData(0)
      const ch1 = buf.getChannelData(1)
      let mean = 0
      let maxAbs = 0
      let differs = false
      let allFinite = true
      for (let i = 0; i < ch0.length; i++) {
        const s = ch0[i]!
        if (!Number.isFinite(s)) allFinite = false
        mean += s
        maxAbs = Math.max(maxAbs, Math.abs(s))
        if (s !== ch1[i]) differs = true
      }
      mean /= ch0.length
      expect(allFinite).toBe(true)
      expect(Math.abs(mean)).toBeLessThan(0.05) // DC-centered
      expect(maxAbs).toBeGreaterThan(0.05)
      expect(maxAbs).toBeLessThanOrEqual(1)
      expect(differs).toBe(true) // Independent stereo L/R
    }

    // Verify characteristic filter cutoffs and LFO frequencies
    const lpCutoffs = ctx.filters.filter((f) => f.type === 'lowpass').map((f) => f.frequency.value)
    expect(lpCutoffs).toContain(6000) // white
    expect(lpCutoffs).toContain(320) // brown
    expect(lpCutoffs).toContain(140) // fire hearth rumble

    const lfoFreqs = ctx.oscillators.map((o) => o.frequency.value)
    expect(lfoFreqs.some((f) => Math.abs(f - 1 / 8.5) < 0.001)).toBe(true) // waves LFO 1
    expect(lfoFreqs.some((f) => Math.abs(f - 1 / 11.2) < 0.001)).toBe(true) // waves LFO 2
    expect(lfoFreqs.some((f) => Math.abs(f - 0.08) < 0.001)).toBe(true) // wind LFO

    // Let rain droplet & fire crackle timers fire
    vi.advanceTimersByTime(1600)
    const countBeforeStop = ctx.sources.length
    expect(countBeforeStop).toBeGreaterThan(10)

    // Stop and verify all sources, LFOs, and scheduled timers cease
    engine.stop(0.2)
    vi.advanceTimersByTime(400)
    expect(ctx.sources.every((s) => s.stopped)).toBe(true)
    expect(ctx.oscillators.every((o) => o.stopped)).toBe(true)

    const countAfterStop = ctx.sources.length
    vi.advanceTimersByTime(3000)
    expect(ctx.sources.length).toBe(countAfterStop) // No leaked droplet/crackle timers
  })
})

describe('createWebSoundEngine — stereo binaural beats', () => {
  it('routes left (carrier) and right (carrier + band.hz) strictly to L/R channels via ChannelMerger', () => {
    const contexts = installMockAudioContext({ initialState: 'running', includeChannelMerger: true })
    const engine = createWebSoundEngine()

    for (const band of BANDS) {
      engine.setMix({ layers: {}, band: band.id, bandGain: 0.4, carrier: 160 }, 0.3)
      const ctx = contexts[0]!
      // Reuse the same two binaural oscillators smoothly across band changes
      expect(ctx.oscillators).toHaveLength(2)
      const [left, right] = ctx.oscillators
      expect(left!.type).toBe('sine')
      expect(right!.type).toBe('sine')
      expect(left!.frequency.value).toBe(160)
      expect(right!.frequency.value).toBe(160 + band.hz)

      expect(ctx.mergers).toHaveLength(1)
      expect(left!.connections[0]).toEqual({ target: ctx.mergers[0], output: 0, input: 0 })
      expect(right!.connections[0]).toEqual({ target: ctx.mergers[0], output: 0, input: 1 })
    }

    // Turning band off fades out and stops both oscillators
    engine.setMix({ layers: { brown: 0.3 }, band: null, bandGain: 0.4, carrier: 160 }, 0.2)
    vi.advanceTimersByTime(400)
    expect(contexts[0]!.oscillators.every((o) => o.stopped)).toBe(true)

    engine.stop(0)
  })

  it('falls back cleanly to hard-panned StereoPannerNodes when ChannelMerger is absent', () => {
    const contexts = installMockAudioContext({ initialState: 'running', includeChannelMerger: false })
    const engine = createWebSoundEngine()

    engine.setMix({ layers: {}, band: 'theta', bandGain: 0.35, carrier: 180 }, 0.2)
    const ctx = contexts[0]!
    expect(ctx.oscillators).toHaveLength(2)
    expect(ctx.oscillators[0]!.frequency.value).toBe(180)
    expect(ctx.oscillators[1]!.frequency.value).toBe(185)
    expect(ctx.panners.map((p) => p.pan.value)).toEqual([-1, 1])

    engine.stop(0)
  })
})

describe('createWebSoundEngine — game feedback cues', () => {
  it('plays all cues even when ambient mix is silent and respects setCuesEnabled', async () => {
    const contexts = installMockAudioContext({ initialState: 'running' })
    const engine = createWebSoundEngine()

    const names: CueName[] = ['tap', 'place', 'clear', 'chime', 'undo']
    for (const name of names) {
      const before = contexts[0]?.oscillators.length ?? 0
      engine.cue(name, 0.9)
      const after = contexts[0]!.oscillators.length
      expect(after).toBeGreaterThan(before)
    }

    // Disabling cues prevents any new cue oscillators without stopping ambient
    engine.setMix({ layers: { brown: 0.4 }, band: null, bandGain: 0, carrier: 160 }, 0.1)
    expect(engine.isRunning).toBe(true)
    engine.setCuesEnabled(false)
    const oscBeforeDisabled = contexts[0]!.oscillators.length
    engine.cue('chime', 1)
    expect(contexts[0]!.oscillators.length).toBe(oscBeforeDisabled)
    expect(engine.isRunning).toBe(true)

    // After ambient stops, re-enabling cues still works
    engine.stop(0)
    engine.setCuesEnabled(true)
    const oscBeforeResumeCue = contexts[0]!.oscillators.length
    engine.cue('tap', 1)
    await vi.advanceTimersByTimeAsync(0)
    expect(contexts[0]!.oscillators.length).toBeGreaterThan(oscBeforeResumeCue)
  })

  it('silently no-ops when AudioContext remains suspended (autoplay blocked)', async () => {
    const contexts = installMockAudioContext({ initialState: 'suspended', allowResume: false })
    const engine = createWebSoundEngine()

    expect(() => engine.cue('place', 1)).not.toThrow()
    await vi.advanceTimersByTimeAsync(0)
    expect(contexts[0]!.oscillators).toHaveLength(0)
  })
})
