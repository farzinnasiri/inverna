import type { DescentSnapshot } from '@/core/sound/arc'
import { isSilent, LAYERS, type LayerId, type Mix } from '@/core/sound/catalog'
import type { CueName, NowPlayingMeta, SoundEngine } from '@/core/sound/engine'
import { DEFAULT_HARMONIC_KEY, type HarmonicKeyId } from '@/core/sound/harmonics'
import { createBinauralController, type BinauralController } from './binaural'
import { createNoiseBufferBank, type NoiseBufferBank } from './buffers'
import { createClassicalMotifController, type ClassicalMotifController } from './classical'
import { createCueBloomBus, playHarmonicCue, type CueBloomBus } from './cues'
import { createAmbientLayer, type AmbientLayer } from './layers'
import { createAsymmetricBreathWave, createHarmonicPadController, type HarmonicPadController } from './pad'
import { clamp, rampParam, safeDisconnect, safeStop } from './params'
import type {
  AudioContextLike,
  AudioNodeLike,
  BiquadFilterNodeLike,
  DynamicsCompressorNodeLike,
  GainNodeLike,
  OscillatorNodeLike,
  WaveShaperNodeLike,
} from './types'

export type NowPlayingState = 'playing' | 'paused' | 'stopped'

export interface NeuroEngineHooks {
  /** Called right before audio starts (e.g., configure native AVAudioSession). */
  onPrepareSession?: () => Promise<void> | void
  /** Called when ambient sound plays, pauses, or fully stops (Lock Screen / Dynamic Island). */
  onNowPlayingUpdate?: (meta: NowPlayingMeta | null, state: NowPlayingState) => void
  /** Wire OS remote pause/play events back into the engine. */
  bindRemoteControls?: (handlers: { onPause: () => void; onPlay: () => void }) => () => void
}

export interface CreateNeuroSoundEngineOptions {
  createContext: () => AudioContextLike | null
  hooks?: NeuroEngineHooks
  /**
   * Compensate `AudioBufferSourceNode.playbackRate` by `buffer.sampleRate / ctx.sampleRate`.
   * Required on `react-native-audio-api@1.0.1` (whose C++ `SingleBufferProcessor` steps
   * in raw buffer frames per output frame), and false on Web Audio (browsers already resample).
   */
  compensateBufferSampleRate?: boolean
}

interface AudioGraph {
  ctx: AudioContextLike
  bank: NoiseBufferBank
  textureBus: GainNodeLike
  masterWarmthFilter: BiquadFilterNodeLike
  textureBreathVca: GainNodeLike
  textureBreathLfo: OscillatorNodeLike
  textureBreathDepth: GainNodeLike
  textureAmVca: GainNodeLike
  textureAmLfo: OscillatorNodeLike
  textureAmDepth: GainNodeLike
  ambientGateGain: GainNodeLike
  masterGain: GainNodeLike
  cueBloom: CueBloomBus
  limiter: DynamicsCompressorNodeLike | null
  softClipper: WaveShaperNodeLike | null
  pad: HarmonicPadController
  binaural: BinauralController
  classical: ClassicalMotifController
}

const ALL_LAYER_IDS: readonly LayerId[] = LAYERS.map((layer) => layer.id)

function createSoftTanhCurve(samples = 1024): Float32Array {
  const curve = new Float32Array(samples)
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1
    curve[i] = Math.tanh(x * 1.18) / Math.tanh(1.18)
  }
  return curve
}

/**
 * Unified Real-Time Neuroacoustic Synthesis Engine for Lull.
 *
 * Powers Web (browser AudioContext) and Native iOS/Android (`react-native-audio-api`
 * C++ CoreAudio/Oboe) from a single zero-audio-file synthesis graph:
 * - Shaped 1/f natural texture layers (background-safe stereo buffers + C++ LFOs)
 * - 4-voice harmonic pad with live phase-locked AM modulation & 0.1 Hz breath swells
 * - Iso-descent master warmth filter & stereo binaural reinforcement
 * - Scale-quantized harmonic game instrument with shared warm stereo bloom
 */
export function createNeuroSoundEngine({
  createContext,
  hooks,
  compensateBufferSampleRate = false,
}: CreateNeuroSoundEngineOptions): SoundEngine {
  let graph: AudioGraph | null = null
  let running = false
  let unlocked = false
  let cuesEnabled = true
  let masterVolume = 0.85
  let activeKey: HarmonicKeyId = DEFAULT_HARMONIC_KEY
  let lastMix: Mix | null = null
  let cueStep = 0
  let nowPlayingMeta: NowPlayingMeta | null = {
    title: 'Theta rain',
    subtitle: 'Soft rain & felt fifths',
    scene: 'rain',
  }

  let descent: DescentSnapshot = {
    progress: 0.5,
    phase: 'drift',
    phaseLabel: 'Drift',
    bandLabel: 'Theta',
    modHz: 5.0,
    amDepth: 0.13,
    binauralScale: 0.6,
    breathHz: 0.1,
    breathDepth: 0.22,
    masterCutoffHz: 2100,
    padCutoffHz: 820,
    cueBloomCutoffHz: 1120,
    spatialHz: 0.068,
    cueDarkness: 0.5,
    minutesToBed: null,
    depth: 'subtle',
    autoActive: false,
  }

  const activeLayers = new Map<LayerId, AmbientLayer>()
  const layerTeardownTimers = new Map<LayerId, ReturnType<typeof setTimeout>>()
  const externalPauseListeners = new Set<() => void>()
  const externalPlayListeners = new Set<() => void>()
  let stopTimer: ReturnType<typeof setTimeout> | null = null
  let remoteBound = false

  const clearStopTimer = () => {
    if (stopTimer !== null) {
      clearTimeout(stopTimer)
      stopTimer = null
    }
  }

  const clearLayerTimer = (id: LayerId) => {
    const timer = layerTeardownTimers.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      layerTeardownTimers.delete(id)
    }
  }

  const disposeLayerNow = (id: LayerId) => {
    clearLayerTimer(id)
    const layer = activeLayers.get(id)
    if (!layer) return
    activeLayers.delete(id)
    layer.dispose()
  }

  const disposeAllAmbientNow = () => {
    clearStopTimer()
    for (const id of [...activeLayers.keys()]) {
      disposeLayerNow(id)
    }
    graph?.pad.dispose()
    graph?.binaural.dispose()
    graph?.classical.dispose()
  }

  const ensureRemoteControls = () => {
    if (remoteBound || !hooks?.bindRemoteControls) return
    remoteBound = true
    hooks.bindRemoteControls({
      onPause: () => {
        if (!running) return
        stopAmbient(0.6, false)
        for (const fn of externalPauseListeners) fn()
      },
      onPlay: () => {
        if (running || !lastMix || isSilent(lastMix)) return
        applyMix(lastMix, 1.0)
        for (const fn of externalPlayListeners) fn()
      },
    })
  }

  const ensureGraph = (): AudioGraph | null => {
    if (graph) return graph
    let ctx: AudioContextLike | null = null
    try {
      ctx = createContext()
    } catch {
      return null
    }
    if (!ctx) return null

    try {
      const bank = createNoiseBufferBank(ctx)

      const textureBus = ctx.createGain()
      textureBus.gain.value = 1

      // Master Iso-descent warmth high-shelf across natural texture layers:
      // smoothly tilts highs down (-0.5 -> -5.5 dB) as bedtime deepens without
      // brick-wall lowpassing crisp rain drops or fire crackles into mud!
      const masterWarmthFilter = ctx.createBiquadFilter()
      masterWarmthFilter.type = 'highshelf'
      masterWarmthFilter.frequency.value = descent.masterCutoffHz
      masterWarmthFilter.gain.value = -(0.5 + descent.progress * 5.0)

      // Gentle asymmetric 0.1 Hz (~4s rise / ~6s release) breath swell across the texture bed
      const textureBreathVca = ctx.createGain()
      textureBreathVca.gain.value = 0.94

      const textureBreathLfo = ctx.createOscillator()
      const breathWave = createAsymmetricBreathWave(ctx)
      if (breathWave && typeof textureBreathLfo.setPeriodicWave === 'function') {
        try {
          textureBreathLfo.setPeriodicWave(breathWave)
        } catch {
          textureBreathLfo.type = 'sine'
        }
      } else {
        textureBreathLfo.type = 'sine'
      }
      textureBreathLfo.frequency.value = descent.breathHz

      const textureBreathDepth = ctx.createGain()
      textureBreathDepth.gain.value = 0.06

      textureBreathLfo.connect(textureBreathDepth)
      textureBreathDepth.connect(textureBreathVca.gain)
      textureBreathLfo.start(ctx.currentTime)

      // Subtle coupled phase-locked AM shimmer on textures (capped at <=3.2% so
      // rain & fire stay smooth and free of choppy flutter; Harmonic Pad carries full AM)
      const initTexAm = clamp(descent.amDepth * 0.09, 0, 0.032)
      const textureAmVca = ctx.createGain()
      textureAmVca.gain.value = 1 - initTexAm

      const textureAmLfo = ctx.createOscillator()
      textureAmLfo.type = 'sine'
      textureAmLfo.frequency.value = clamp(descent.modHz, 0.5, 16)

      const textureAmDepth = ctx.createGain()
      textureAmDepth.gain.value = initTexAm

      textureAmLfo.connect(textureAmDepth)
      textureAmDepth.connect(textureAmVca.gain)
      textureAmLfo.start(ctx.currentTime)

      const ambientGateGain = ctx.createGain()
      ambientGateGain.gain.value = 1

      const masterGain = ctx.createGain()
      masterGain.gain.value = masterVolume

      // Output protection: DynamicsCompressor on Web, warm analog WaveShaper soft-limiter on native C++
      let limiter: DynamicsCompressorNodeLike | null = null
      let softClipper: WaveShaperNodeLike | null = null
      let busOutput: AudioNodeLike = ctx.destination

      if (typeof ctx.createDynamicsCompressor === 'function') {
        try {
          limiter = ctx.createDynamicsCompressor()
          limiter.threshold.value = -8
          limiter.knee.value = 14
          limiter.ratio.value = 8
          limiter.attack.value = 0.006
          limiter.release.value = 0.18
          limiter.connect(ctx.destination)
          busOutput = limiter
        } catch {
          safeDisconnect(limiter)
          limiter = null
        }
      } else if (typeof ctx.createWaveShaper === 'function') {
        try {
          softClipper = ctx.createWaveShaper()
          softClipper.curve = createSoftTanhCurve()
          softClipper.oversample = '2x'
          softClipper.connect(ctx.destination)
          busOutput = softClipper
        } catch {
          safeDisconnect(softClipper)
          softClipper = null
        }
      }

      const cueBloom = createCueBloomBus(ctx, busOutput)

      textureBus.connect(masterWarmthFilter)
      masterWarmthFilter.connect(textureBreathVca)
      textureBreathVca.connect(textureAmVca)
      textureAmVca.connect(ambientGateGain)

      ambientGateGain.connect(masterGain)
      masterGain.connect(busOutput)

      const pad = createHarmonicPadController(ctx, ambientGateGain)
      pad.setDescent(
        {
          modHz: descent.modHz,
          amDepth: descent.amDepth,
          breathHz: descent.breathHz,
          breathDepth: descent.breathDepth,
          padCutoffHz: descent.padCutoffHz,
          spatialHz: descent.spatialHz,
        },
        0.05,
      )

      const binaural = createBinauralController(ctx, ambientGateGain)
      const classical = createClassicalMotifController(ctx, cueBloom.input)

      graph = {
        ctx,
        bank,
        textureBus,
        masterWarmthFilter,
        textureBreathVca,
        textureBreathLfo,
        textureBreathDepth,
        textureAmVca,
        textureAmLfo,
        textureAmDepth,
        ambientGateGain,
        masterGain,
        cueBloom,
        limiter,
        softClipper,
        pad,
        binaural,
        classical,
      }
      return graph
    } catch {
      return null
    }
  }

  const resumeContext = async (ctx: AudioContextLike): Promise<boolean> => {
    if (ctx.state === 'running') return true
    if (ctx.state === 'closed') return false
    try {
      await ctx.resume()
      return ctx.state === 'running'
    } catch {
      return false
    }
  }

  const applyDescentNodes = (g: AudioGraph, rampSeconds: number) => {
    const now = g.ctx.currentTime
    const ramp = Math.max(0.08, rampSeconds)
    const breathOn = lastMix?.breathPacing !== false

    rampParam(g.masterWarmthFilter.frequency, clamp(descent.masterCutoffHz, 520, 6500), ramp, now)
    rampParam(g.masterWarmthFilter.gain, -(0.5 + clamp(descent.progress, 0, 1) * 5.0), ramp, now)
    rampParam(g.textureBreathLfo.frequency, clamp(descent.breathHz, 0.06, 0.2), ramp, now)

    const texBreathAmp = breathOn ? clamp(descent.breathDepth * 0.24, 0, 0.09) : 0
    rampParam(g.textureBreathVca.gain, 1 - texBreathAmp, ramp, now)
    rampParam(g.textureBreathDepth.gain, texBreathAmp, ramp, now)

    const texAmAmp = clamp(descent.amDepth * 0.09, 0, 0.032)
    rampParam(g.textureAmLfo.frequency, clamp(descent.modHz, 0.5, 16), ramp, now)
    rampParam(g.textureAmVca.gain, 1 - texAmAmp, ramp, now)
    rampParam(g.textureAmDepth.gain, texAmAmp, ramp, now)

    g.cueBloom.setWarmth(descent.cueBloomCutoffHz, ramp)

    if (running && lastMix?.classicalMotif) {
      g.classical.update({
        style: lastMix.classicalMotif,
        keyId: lastMix.harmonicKey ?? activeKey,
        darkness: descent.cueDarkness,
      })
    }

    g.pad.setDescent(
      {
        modHz: descent.modHz,
        amDepth: descent.amDepth,
        breathHz: descent.breathHz,
        breathDepth: descent.breathDepth,
        padCutoffHz: descent.padCutoffHz,
        spatialHz: descent.spatialHz,
      },
      ramp,
    )

    if (running && lastMix && lastMix.band) {
      g.binaural.update({
        band: lastMix.band,
        bandGain: lastMix.bandGain,
        carrier: lastMix.carrier,
        fadeSeconds: ramp,
        overrideBeatHz: descent.autoActive ? descent.modHz : undefined,
        scale: descent.binauralScale,
      })
    }
  }

  const stopAmbient = (fadeSeconds = 1.5, hideNotification = false) => {
    running = false
    clearStopTimer()
    hooks?.onNowPlayingUpdate?.(nowPlayingMeta, hideNotification ? 'stopped' : 'paused')
    if (!graph) return

    const g = graph
    const safeFade = Math.max(0, Number.isFinite(fadeSeconds) ? fadeSeconds : 1.5)

    for (const id of activeLayers.keys()) clearLayerTimer(id)
    g.classical.stop()

    if (safeFade <= 0.002) {
      rampParam(g.ambientGateGain.gain, 0, 0, g.ctx.currentTime)
      disposeAllAmbientNow()
      if (hideNotification && g.ctx.state === 'running' && typeof g.ctx.suspend === 'function') {
        void g.ctx.suspend().catch(() => {})
      }
      return
    }

    rampParam(g.ambientGateGain.gain, 0, safeFade, g.ctx.currentTime)
    g.pad.stop(safeFade)
    g.binaural.stop(safeFade)

    stopTimer = setTimeout(() => {
      stopTimer = null
      if (running) return
      disposeAllAmbientNow()
      if (hideNotification && g.ctx.state === 'running' && typeof g.ctx.suspend === 'function') {
        void g.ctx.suspend().catch(() => {})
      }
    }, Math.ceil(safeFade * 1000) + 120)
  }

  const applyMix = (mix: Mix, fadeSeconds = 1.5) => {
    const safeFade = Math.max(0, Number.isFinite(fadeSeconds) ? fadeSeconds : 1.5)
    lastMix = mix
    if (mix.harmonicKey) {
      activeKey = mix.harmonicKey
    }

    if (isSilent(mix)) {
      stopAmbient(safeFade)
      return
    }

    ensureRemoteControls()
    const sessionReady = Promise.resolve(hooks?.onPrepareSession?.()).catch(() => {})

    const g = ensureGraph()
    if (!g) return

    clearStopTimer()
    running = true

    if (g.ctx.state !== 'running' && g.ctx.state !== 'closed') {
      void resumeContext(g.ctx)
    }
    void sessionReady.then(() => {
      if (running && g.ctx.state !== 'running' && g.ctx.state !== 'closed') {
        void resumeContext(g.ctx)
      }
    })

    rampParam(g.ambientGateGain.gain, 1, Math.min(safeFade, 0.35), g.ctx.currentTime)

    for (const id of ALL_LAYER_IDS) {
      const gain = clamp(mix.layers[id] ?? 0, 0, 1)
      const existing = activeLayers.get(id)

      if (gain > 0.001) {
        clearLayerTimer(id)
        const layer =
          existing ?? createAmbientLayer(g.ctx, g.bank, id, g.textureBus, compensateBufferSampleRate)
        if (!existing) activeLayers.set(id, layer)
        layer.setGain(gain, safeFade)
      } else if (existing) {
        clearLayerTimer(id)
        existing.setGain(0, safeFade)
        if (safeFade <= 0.002) {
          disposeLayerNow(id)
        } else {
          const timer = setTimeout(() => {
            layerTeardownTimers.delete(id)
            disposeLayerNow(id)
          }, Math.ceil(safeFade * 1000) + 120)
          layerTeardownTimers.set(id, timer)
        }
      }
    }

    g.pad.update({
      keyId: mix.harmonicKey ?? activeKey,
      gain: mix.padGain ?? 0,
      breathPacing: mix.breathPacing !== false,
      spatialMotion: mix.spatialMotion ?? 0.35,
      fadeSeconds: safeFade,
    })

    g.binaural.update({
      band: mix.band,
      bandGain: mix.bandGain,
      carrier: mix.carrier,
      fadeSeconds: safeFade,
      overrideBeatHz: descent.autoActive ? descent.modHz : undefined,
      scale: descent.binauralScale,
    })

    g.classical.update({
      style: mix.classicalMotif ?? null,
      keyId: mix.harmonicKey ?? activeKey,
      darkness: descent.cueDarkness,
    })

    g.bank.prewarm()
    applyDescentNodes(g, Math.min(safeFade, 0.8))
    hooks?.onNowPlayingUpdate?.(nowPlayingMeta, 'playing')
  }

  return {
    async unlock() {
      unlocked = true
      ensureRemoteControls()
      try {
        await hooks?.onPrepareSession?.()
      } catch {
        /* ignore */
      }
      const g = ensureGraph()
      if (!g) return
      await resumeContext(g.ctx)
    },

    setMix(mix: Mix, fadeSeconds = 1.5) {
      applyMix(mix, fadeSeconds)
    },

    setDescent(snapshot: DescentSnapshot, rampSeconds = 3.0) {
      descent = snapshot
      if (graph) {
        applyDescentNodes(graph, rampSeconds)
      }
    },

    setHarmonicKey(keyId: HarmonicKeyId) {
      activeKey = keyId
    },

    setMaster(volume: number, rampSeconds = 0.2) {
      masterVolume = clamp(volume, 0, 1)
      if (!graph) return
      const safeRamp = Math.max(0, Number.isFinite(rampSeconds) ? rampSeconds : 0.2)
      rampParam(graph.masterGain.gain, masterVolume, safeRamp, graph.ctx.currentTime)
    },

    stop(fadeSeconds = 1.5, opts?: { hideNotification?: boolean }) {
      stopAmbient(fadeSeconds, opts?.hideNotification ?? false)
    },

    cue(name: CueName, volume = 1) {
      if (!cuesEnabled) return
      const g = ensureGraph()
      if (!g) return

      const step = cueStep
      if (name === 'tap' || name === 'place' || name === 'clear') {
        cueStep = (cueStep + 1) % 24
      }

      const emit = () => {
        if (!cuesEnabled || g.ctx.state !== 'running') return
        try {
          playHarmonicCue(g.ctx, g.cueBloom.input, name, volume, activeKey, step, descent.cueDarkness)
        } catch {
          // Never throw from feedback cues.
        }
      }

      if (g.ctx.state === 'running') {
        emit()
        return
      }

      if (g.ctx.state !== 'closed') {
        void Promise.resolve(hooks?.onPrepareSession?.()).catch(() => {})
        if (!unlocked) {
          void resumeContext(g.ctx).then((ok) => {
            if (ok) {
              unlocked = true
              emit()
            }
          })
        } else {
          void resumeContext(g.ctx).then((ok) => {
            if (ok) emit()
          })
        }
      }
    },

    setCuesEnabled(enabled: boolean) {
      cuesEnabled = Boolean(enabled)
    },

    setNowPlayingMeta(meta) {
      nowPlayingMeta = meta
      if (running) {
        hooks?.onNowPlayingUpdate?.(meta, 'playing')
      }
    },

    onExternalPause(listener) {
      externalPauseListeners.add(listener)
      return () => {
        externalPauseListeners.delete(listener)
      }
    },

    onExternalPlay(listener) {
      externalPlayListeners.add(listener)
      return () => {
        externalPlayListeners.delete(listener)
      }
    },

    get isRunning() {
      return running
    },
  }
}

export function disposeAudioGraphSafety(node: { stop?: () => void; disconnect?: () => void } | null): void {
  if (!node) return
  if (node.stop) safeStop(node as { stop: () => void })
  if (node.disconnect) safeDisconnect(node as { disconnect: () => void })
}
