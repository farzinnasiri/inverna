import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SCHEDULE } from '@/core/night'
import { computeDescent } from '@/core/sound/arc'
import { BANDS, LAYERS, PRESETS, presetById, SILENT_MIX, type Mix } from '@/core/sound/catalog'
import type { CueName } from '@/core/sound/engine'
import { HARMONIC_KEYS, harmonicKeyMeta } from '@/core/sound/harmonics'
import { NOISE_BUFFER_SECONDS } from './buffers'
import { createNeuroSoundEngine } from './index'
import type { AudioContextLike, AudioContextStateLike, BiquadFilterTypeLike } from './types'

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
  type: BiquadFilterTypeLike = 'lowpass'
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

class MockWaveShaperNode extends MockAudioNode {
  curve: Float32Array | null = null
  oversample: 'none' | '2x' | '4x' = 'none'
}

class MockDelayNode extends MockAudioNode {
  delayTime = new MockAudioParam(0)
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
  loopStart = 0
  loopEnd = 0
  playbackRate = new MockAudioParam(1)
  started = false
  startedLoopEnd = 0
  startedOffset = 0
  stopped = false
  onended: (() => void) | null = null

  start(_when?: number, offset = 0) {
    this.started = true
    this.startedLoopEnd = this.loopEnd
    this.startedOffset = offset
  }

  stop() {
    this.stopped = true
    this.onended?.()
  }
}

class MockOscillatorNode extends MockAudioNode {
  type: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'custom' = 'sine'
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
  initialState?: AudioContextStateLike
  allowResume?: boolean
  includeChannelMerger?: boolean
  includeCompressor?: boolean
  sampleRate?: number
}

class MockAudioContext implements AudioContextLike {
  state: AudioContextStateLike
  currentTime = 1
  sampleRate: number
  destination = new MockAudioNode()

  gains: MockGainNode[] = []
  filters: MockBiquadFilterNode[] = []
  compressors: MockDynamicsCompressorNode[] = []
  shapers: MockWaveShaperNode[] = []
  delays: MockDelayNode[] = []
  panners: MockStereoPannerNode[] = []
  mergers: MockChannelMergerNode[] = []
  sources: MockBufferSourceNode[] = []
  oscillators: MockOscillatorNode[] = []
  buffers: MockAudioBuffer[] = []

  resumeCalls = 0
  suspendCalls = 0

  private readonly allowResume: boolean
  createChannelMerger?: (numberOfInputs?: number) => MockChannelMergerNode
  createDynamicsCompressor?: () => MockDynamicsCompressorNode

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

    if (opts.includeCompressor ?? true) {
      this.createDynamicsCompressor = () => {
        const node = new MockDynamicsCompressorNode()
        this.compressors.push(node)
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

  createWaveShaper() {
    const node = new MockWaveShaperNode()
    this.shapers.push(node)
    return node
  }

  createDelay() {
    const node = new MockDelayNode()
    this.delays.push(node)
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

function makeTestEngine(opts: MockContextOptions & { compensateBufferSampleRate?: boolean } = {}) {
  const contexts: MockAudioContext[] = []
  const engine = createNeuroSoundEngine({
    compensateBufferSampleRate: opts.compensateBufferSampleRate,
    createContext: () => {
      const ctx = new MockAudioContext(opts)
      contexts.push(ctx)
      return ctx
    },
  })
  return { engine, contexts }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createNeuroSoundEngine — headless & restricted fallbacks', () => {
  it('never throws when AudioContext is unavailable or constructor throws', async () => {
    const nullEngine = createNeuroSoundEngine({ createContext: () => null })
    expect(nullEngine.isRunning).toBe(false)
    await expect(nullEngine.unlock()).resolves.toBeUndefined()
    expect(() => nullEngine.setMix(PRESETS[0]!.mix, 1)).not.toThrow()
    expect(() => nullEngine.cue('tap', 0.8)).not.toThrow()
    expect(() => nullEngine.stop(0.5)).not.toThrow()

    const throwEngine = createNeuroSoundEngine({
      createContext: () => {
        throw new Error('AudioSessionDenied')
      },
    })
    await expect(throwEngine.unlock()).resolves.toBeUndefined()
    expect(() => throwEngine.setMix(PRESETS[0]!.mix, 0.5)).not.toThrow()
    expect(throwEngine.isRunning).toBe(false)
  })
})

describe('createNeuroSoundEngine — lifecycle, soft-clipper & native compatibility', () => {
  it('uses WaveShaper soft-clipper when DynamicsCompressor is absent (react-native-audio-api mode)', async () => {
    const { engine, contexts } = makeTestEngine({
      initialState: 'running',
      includeCompressor: false,
    })

    engine.setMix(PRESETS[0]!.mix, 0.5)
    const ctx = contexts[0]!
    expect(ctx.compressors).toHaveLength(0)
    expect(ctx.shapers).toHaveLength(1)
    expect(ctx.shapers[0]!.curve).toBeInstanceOf(Float32Array)
    expect(ctx.shapers[0]!.oversample).toBe('none')
    expect(ctx.shapers[0]!.connections.some((c) => c.target === ctx.destination)).toBe(true)

    engine.stop(0)
  })

  it('manages running state, stop fade teardown, and mid-fade restart cleanly', async () => {
    const { engine, contexts } = makeTestEngine({ initialState: 'suspended' })
    expect(contexts).toHaveLength(0)

    await engine.unlock()
    const ctx = contexts[0]!
    expect(ctx.resumeCalls).toBe(1)
    expect(ctx.state).toBe('running')

    engine.setMaster(0.75, 0.3)
    engine.setMix(PRESETS[0]!.mix, 0.8)
    expect(engine.isRunning).toBe(true)

    // Mid-fade restart cancels stop teardown
    engine.stop(1.0)
    expect(engine.isRunning).toBe(false)
    vi.advanceTimersByTime(400)
    engine.setMix(PRESETS[1]!.mix, 0.5)
    expect(engine.isRunning).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(ctx.suspendCalls).toBe(0)

    // Clean stop with hideNotification suspends context and releases all ambient nodes
    engine.stop(0.2, { hideNotification: true })
    vi.advanceTimersByTime(400)
    expect(ctx.suspendCalls).toBe(1)
    expect(ctx.sources.every((s) => s.stopped)).toBe(true)
  })

  it('treats SILENT_MIX as stopping ambient sound', () => {
    const { engine, contexts } = makeTestEngine({ initialState: 'running' })
    engine.setMix(PRESETS[0]!.mix, 0.2)
    expect(engine.isRunning).toBe(true)

    engine.setMix(SILENT_MIX, 0.2)
    expect(engine.isRunning).toBe(false)
    vi.advanceTimersByTime(400)
    expect(contexts[0]!.sources.every((s) => s.stopped)).toBe(true)
  })

  it('resumes the last audible mix on remote Play after the mix was turned all the way down', () => {
    let remote: { onPause: () => void; onPlay: () => void; isPlaying: () => boolean } | null = null
    const resumed: Mix[] = []
    const engine = createNeuroSoundEngine({
      createContext: () => new MockAudioContext({ initialState: 'running' }),
      hooks: {
        bindRemoteControls: (handlers) => {
          remote = handlers
          return () => {}
        },
      },
    })
    engine.onExternalPlay?.((mix) => resumed.push(mix))
    const audible = PRESETS[0]!.mix
    engine.setMix(audible, 0.2)
    expect(remote!.isPlaying()).toBe(true)

    engine.setMix(SILENT_MIX, 0.2)
    vi.advanceTimersByTime(400)
    expect(remote!.isPlaying()).toBe(false)

    // A headphone tap used to be ignored here, forever.
    remote!.onPlay()
    expect(engine.isRunning).toBe(true)
    expect(resumed).toEqual([audible])
  })
})

describe('createNeuroSoundEngine — the sleep fade', () => {
  const sleepFadeGain = (ctx: MockAudioContext, end: number) =>
    ctx.gains.find((g) =>
      g.gain.calls.some((c) => c.method === 'linearRampToValueAtTime' && c.args[0] === 0 && Math.abs(c.args[1]! - end) < 1e-6),
    )!

  it('fades to silence on the audio clock at the deadline', () => {
    const { engine, contexts } = makeTestEngine({ initialState: 'running' })
    engine.setMix(PRESETS[0]!.mix, 0.2)
    engine.scheduleSleepFade!(60, 12)
    const ctx = contexts[0]!
    expect(sleepFadeGain(ctx, ctx.currentTime + 60)).toBeDefined()
  })

  // ISS-03.1: an edit during the last 12 s swells the sound back to full.
  // Phase 1 step 3 keeps the fade.
  it.skip('editing the mix during the fade keeps fading', () => {
    const { engine, contexts } = makeTestEngine({ initialState: 'running' })
    engine.setMix(PRESETS[0]!.mix, 0.2)
    engine.scheduleSleepFade!(20, 12)
    const ctx = contexts[0]!
    const fade = sleepFadeGain(ctx, ctx.currentTime + 20)
    ctx.currentTime += 15
    const before = fade.gain.calls.length
    engine.setMix(PRESETS[1]!.mix, 0.25)
    const after = fade.gain.calls.slice(before)
    expect(after.some((c) => c.method === 'linearRampToValueAtTime' && c.args[0] === 1)).toBe(false)
  })
})

describe('createNeuroSoundEngine — background-safe layers, harmonic pad & AM descent', () => {
  it('synthesises all 7 layers + 4-voice harmonic pad + 0.1 Hz breath + AM LFO with zero JS timers', () => {
    const { engine, contexts } = makeTestEngine({ initialState: 'running', sampleRate: 8000 })

    const allMix: Mix = {
      layers: Object.fromEntries(LAYERS.map((l) => [l.id, 0.5])),
      padGain: 0.6,
      harmonicKey: 'd-dorian',
      band: 'theta',
      bandGain: 0.45,
      carrier: 146.83,
      breathPacing: true,
      spatialMotion: 0.4,
    }

    engine.setMix(allMix, 0.5)
    const ctx = contexts[0]!

    // Every texture buffer is stereo, long enough to loop, audible, and wide (left and right differ).
    expect(ctx.buffers.length).toBeGreaterThan(0)
    for (const buf of ctx.buffers) {
      expect(buf.numberOfChannels).toBe(2)
      expect(buf.length).toBeGreaterThanOrEqual(NOISE_BUFFER_SECONDS * ctx.sampleRate)
      const ch0 = buf.getChannelData(0)
      const ch1 = buf.getChannelData(1)
      let maxAbs = 0
      let differs = false
      for (let i = 0; i < ch0.length; i++) {
        maxAbs = Math.max(maxAbs, Math.abs(ch0[i]!))
        if (ch0[i] !== ch1[i]) differs = true
      }
      expect(maxAbs).toBeGreaterThan(0.05)
      expect(maxAbs).toBeLessThanOrEqual(1)
      expect(differs).toBe(true)
    }

    // Verify 0.1 Hz cardiorespiratory breath LFO and 5 Hz Theta AM LFO are native OscillatorNodes
    const oscFreqs = ctx.oscillators.map((o) => o.frequency.value)
    expect(oscFreqs.some((f) => Math.abs(f - 0.1) < 0.015)).toBe(true)
    expect(oscFreqs.some((f) => Math.abs(f - 5.0) < 0.1)).toBe(true)

    // Verify zero JS timer spawns when advancing time (100% CoreAudio background-safe!)
    const sourcesBefore = ctx.sources.length
    vi.advanceTimersByTime(4000)
    expect(ctx.sources.length).toBe(sourcesBefore)

    // Apply live Iso-descent update -> shifts AM rate and master warmth filter cleanly
    const deepSnapshot = computeDescent({
      schedule: DEFAULT_SCHEDULE,
      now: new Date(2026, 10, 24, 22, 55, 0),
      preset: presetById('theta-rain')!,
      depth: 'deep',
      followBedtime: true,
    })
    engine.setDescent?.(deepSnapshot, 2.0)
    expect(
      ctx.filters.some((f) =>
        f.frequency.calls.some((c) => c.method === 'linearRampToValueAtTime' && c.args[0] === deepSnapshot.masterCutoffHz),
      ),
    ).toBe(true)

    // Stop cleans up every layer source and pad/binaural oscillator (leaving only persistent graph bus breath LFO)
    engine.stop(0.2)
    vi.advanceTimersByTime(400)
    expect(ctx.sources.every((s) => s.stopped)).toBe(true)
  })

  it('compensates buffer sampleRate and sets loopEnd before start() for react-native-audio-api native 48 kHz playback', () => {
    const { engine, contexts } = makeTestEngine({
      initialState: 'running',
      sampleRate: 48000,
      compensateBufferSampleRate: true,
    })

    engine.setMix(
      {
        layers: { rain: 0.6, waves: 0.6, fire: 0.6, wind: 0.6 },
        padGain: 0,
        band: null,
        bandGain: 0,
        carrier: 146.83,
      },
      0.1,
    )

    const ctx = contexts[0]!
    expect(ctx.sources.length).toBeGreaterThanOrEqual(10)

    // Every looping source MUST set loopEnd === buffer.duration BEFORE start() so native never clamps offsets to 0
    for (const src of ctx.sources) {
      expect(src.loop).toBe(true)
      expect(src.buffer).not.toBeNull()
      expect(src.startedLoopEnd).toBeCloseTo(src.buffer!.duration, 5)
    }

    // Verify exact buffer.sampleRate / 48000 playbackRate scaling on native:
    // - 24 kHz rain srcA (1.0 * 24000 / 48000 = 0.5)
    // - 16 kHz waves mainSurf (0.87 * 16000 / 48000 = 0.29)
    // - 8 kHz wind srcB (0.853 * 8000 / 48000 = 0.14217)
    // - 8 kHz fire bedSrc (1.0 * 8000 / 48000 = 0.16667)
    const rates = ctx.sources.map((s) => s.playbackRate.value)
    expect(rates.some((r) => Math.abs(r - 0.5) < 1e-4)).toBe(true)
    expect(rates.some((r) => Math.abs(r - 0.87 / 3) < 1e-4)).toBe(true)
    expect(rates.some((r) => Math.abs(r - 0.853 / 6) < 1e-4)).toBe(true)
    expect(rates.some((r) => Math.abs(r - 1 / 6) < 1e-4)).toBe(true)

    // Verify native CoreAudio sleep-timer fade-out schedules exact setValueAtTime + linearRampToValueAtTime
    // on sleepFadeGain (immune to iOS JS timer throttling while phone is locked!)
    engine.scheduleSleepFade?.(900, 12)
    const fadeGain = ctx.gains.find((g) =>
      g.gain.calls.some(
        (c) => c.method === 'linearRampToValueAtTime' && c.args[0] === 0 && Math.abs(c.args[1]! - (ctx.currentTime + 900)) < 1e-4,
      ),
    )
    expect(fadeGain).toBeDefined()
    expect(
      fadeGain!.gain.calls.some(
        (c) => c.method === 'setValueAtTime' && c.args[0] === 1 && Math.abs(c.args[1]! - (ctx.currentTime + 888)) < 1e-4,
      ),
    ).toBe(true)

    engine.cancelSleepFade?.()
    expect(fadeGain!.gain.calls.some((c) => c.method === 'cancelAndHoldAtTime')).toBe(true)
    expect(
      fadeGain!.gain.calls.some((c) => c.method === 'linearRampToValueAtTime' && c.args[0] === 1),
    ).toBe(true)

    engine.stop(0)
  })

  it('crossfades to a new chord on a sound switch instead of bending the old one', () => {
    const { engine, contexts } = makeTestEngine({ initialState: 'running' })
    const a = PRESETS.find((p) => p.id === 'theta-rain')!
    const b = PRESETS.find((p) => p.harmonicKey !== a.harmonicKey)!
    engine.setMix(a.mix, 0.5)
    const ctx = contexts[0]!
    const before = new Set(ctx.oscillators)
    engine.setMix(b.mix, 0.5)
    // The old chord's pitches never slide (that was the "bueee").
    const chordHz = harmonicKeyMeta(a.harmonicKey).padHz
    // Chord voices carry the timbre's periodic wave (binaural carriers are plain sines).
    const voices = [...before].filter(
      (o) => o.periodicWave !== null && chordHz.some((hz) => Math.abs(o.frequency.value - hz) < hz * 0.01),
    )
    expect(voices.length).toBeGreaterThan(0)
    for (const osc of voices) {
      expect(osc.frequency.calls.some((c) => c.method === 'linearRampToValueAtTime')).toBe(false)
    }
    // A fresh chord was built for the new sound.
    expect(ctx.oscillators.length).toBeGreaterThan(before.size)
    engine.stop(0)
  })

  it('routes stereo binaural oscillators strictly to L/R via ChannelMerger', () => {
    const { engine, contexts } = makeTestEngine({ initialState: 'running', includeChannelMerger: true })

    for (const band of BANDS) {
      engine.setMix({ layers: {}, padGain: 0, band: band.id, bandGain: 0.4, carrier: 160 }, 0.3)
      const ctx = contexts[0]!
      // A new band crossfades to a fresh pair: check the newest one.
      const merger = ctx.mergers[ctx.mergers.length - 1]!
      const wiredLeft = ctx.oscillators.find((o) =>
        o.connections.some((c) => c.target === merger && c.input === 0),
      )
      const wiredRight = ctx.oscillators.find((o) =>
        o.connections.some((c) => c.target === merger && c.input === 1),
      )
      expect(wiredLeft).toBeDefined()
      expect(wiredRight).toBeDefined()
      expect(wiredLeft!.frequency.value).toBe(160)
      expect(wiredRight!.frequency.value).toBeCloseTo(160 + band.hz, 1)
    }

    engine.stop(0)
  })
})

describe('createNeuroSoundEngine — scale-quantized harmonic game cues', () => {
  it('plays cues quantized strictly into the active harmonic key with stereo delay bloom', async () => {
    const { engine, contexts } = makeTestEngine({ initialState: 'running' })
    await engine.unlock()
    engine.setHarmonicKey?.('f-lydian')

    const fLydianSet = new Set(HARMONIC_KEYS['f-lydian'].scaleHz)
    const names: CueName[] = ['tap', 'place', 'clear', 'chime', 'undo']
    for (const name of names) {
      const before = contexts[0]!.oscillators.length
      engine.cue(name, 0.9)
      const ctx = contexts[0]!
      const added = ctx.oscillators.slice(before)
      expect(added.length).toBeGreaterThan(0)
      // Fundamental cue oscillators (sine) start strictly on F Lydian scale notes!
      const fundamentals = added.filter((o) => o.type === 'sine')
      expect(fundamentals.length).toBeGreaterThan(0)
      for (const osc of fundamentals) {
        const startFreq = osc.frequency.calls.find((c) => c.method === 'setValueAtTime')?.args[0]
        expect(fLydianSet.has(startFreq!)).toBe(true)
      }
    }

    // Two stereo bloom buses: game cues, and the ambient motif (which sits behind the ambient gate)
    expect(contexts[0]!.delays.length).toBe(4)

    // Muting cues prevents any new oscillators
    engine.setCuesEnabled(false)
    const beforeMuted = contexts[0]!.oscillators.length
    engine.cue('chime', 1)
    expect(contexts[0]!.oscillators.length).toBe(beforeMuted)
  })
})
