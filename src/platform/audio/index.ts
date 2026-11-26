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
import { clamp, noteRamp, paramNow, rampParam, safeDisconnect, safeStop, setParam } from './params'
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
  bindRemoteControls?: (handlers: {
    onPause: () => void
    onPlay: () => void
    /** True while ambient sound is playing (not paused or stopped). */
    isPlaying: () => boolean
  }) => () => void
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
  sleepFadeGain: GainNodeLike
  masterGain: GainNodeLike
  cueBloom: CueBloomBus
  motifBloom: CueBloomBus
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
 * Unified Real-Time Neuroacoustic Synthesis Engine for Inverna.
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
  // Ramps on these two params are tracked here: the native `param.value` does
  // not follow automation, so ramping "from param.value" would jump.
  let idleSuspendTimer: ReturnType<typeof setTimeout> | null = null
  let activeKey: HarmonicKeyId = DEFAULT_HARMONIC_KEY
  let lastMix: Mix | null = null
  /** The last mix that made sound, for remote Play after the mix was turned all the way down. */
  let lastAudibleMix: Mix | null = null
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
  const externalPlayListeners = new Set<(mix: Mix) => void>()
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
        if (running || !lastAudibleMix) return
        const mix = lastAudibleMix
        applyMix(mix, 1.0)
        for (const fn of externalPlayListeners) fn(mix)
      },
      isPlaying: () => running,
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
      setParam(textureBus.gain, 1)

      // Master Iso-descent warmth high-shelf across natural texture layers:
      // smoothly tilts highs down (-0.5 -> -5.5 dB) as bedtime deepens without
      // brick-wall lowpassing crisp rain drops or fire crackles into mud!
      const initWarmthGain = -(0.5 + descent.progress * 5.0)
      const masterWarmthFilter = ctx.createBiquadFilter()
      masterWarmthFilter.type = 'highshelf'
      setParam(masterWarmthFilter.frequency, descent.masterCutoffHz)
      setParam(masterWarmthFilter.gain, initWarmthGain)

      // Gentle asymmetric 0.1 Hz (~4s rise / ~6s release) breath swell across the texture bed
      const textureBreathVca = ctx.createGain()
      setParam(textureBreathVca.gain, 0.94)

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
      setParam(textureBreathLfo.frequency, descent.breathHz)

      const textureBreathDepth = ctx.createGain()
      setParam(textureBreathDepth.gain, 0.06)

      textureBreathLfo.connect(textureBreathDepth)
      textureBreathDepth.connect(textureBreathVca.gain)
      textureBreathLfo.start(ctx.currentTime)

      // Subtle coupled phase-locked AM shimmer on textures (capped at <=3.2% so
      // rain & fire stay smooth and free of choppy flutter; Harmonic Pad carries full AM)
      const initTexAm = clamp(descent.amDepth * 0.09, 0, 0.032)
      const textureAmVca = ctx.createGain()
      setParam(textureAmVca.gain, 1 - initTexAm)

      const textureAmLfo = ctx.createOscillator()
      textureAmLfo.type = 'sine'
      setParam(textureAmLfo.frequency, clamp(descent.modHz, 0.5, 16))

      const textureAmDepth = ctx.createGain()
      setParam(textureAmDepth.gain, initTexAm)

      textureAmLfo.connect(textureAmDepth)
      textureAmDepth.connect(textureAmVca.gain)
      textureAmLfo.start(ctx.currentTime)

      const ambientGateGain = ctx.createGain()
      setParam(ambientGateGain.gain, 1)

      // Dedicated CoreAudio-scheduled sleep-timer fade node (runs on native audio thread
      // even when iOS suspends JS while the phone is locked!).
      const sleepFadeGain = ctx.createGain()
      setParam(sleepFadeGain.gain, 1)

      const masterGain = ctx.createGain()
      setParam(masterGain.gain, masterVolume)

      // Anchor initial automation values on ParamRenderQueue so react-native-audio-api@1.0.1
      // never falls back to C++ defaultValue_ (1.0) on the first rampParam() call.
      const t0 = ctx.currentTime
      try {
        masterWarmthFilter.frequency.setValueAtTime(descent.masterCutoffHz, t0)
        masterWarmthFilter.gain.setValueAtTime(initWarmthGain, t0)
        textureBreathVca.gain.setValueAtTime(0.94, t0)
        textureBreathDepth.gain.setValueAtTime(0.06, t0)
        textureAmVca.gain.setValueAtTime(1 - initTexAm, t0)
        textureAmDepth.gain.setValueAtTime(initTexAm, t0)
        ambientGateGain.gain.setValueAtTime(1, t0)
        sleepFadeGain.gain.setValueAtTime(1, t0)
        masterGain.gain.setValueAtTime(masterVolume, t0)
      } catch {
        /* mock fallback */
      }

      // Output protection: DynamicsCompressor on Web, latency-free tanh WaveShaper on native C++
      let limiter: DynamicsCompressorNodeLike | null = null
      let softClipper: WaveShaperNodeLike | null = null
      let busOutput: AudioNodeLike = ctx.destination

      if (typeof ctx.createDynamicsCompressor === 'function') {
        try {
          limiter = ctx.createDynamicsCompressor()
          setParam(limiter.threshold, -8)
          setParam(limiter.knee, 14)
          setParam(limiter.ratio, 8)
          setParam(limiter.attack, 0.006)
          setParam(limiter.release, 0.18)
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
          // Keep oversample 'none' on native C++: avoids r8brain 2x upsample/downsample
          // resampler latency & audio-thread CPU spikes during 120Hz games & locked sleep.
          softClipper.oversample = 'none'
          softClipper.connect(ctx.destination)
          busOutput = softClipper
        } catch {
          safeDisconnect(softClipper)
          softClipper = null
        }
      }

      // Route cueBloom through masterGain so volume & output protection cover game cues cleanly
      const cueBloom = createCueBloomBus(ctx, masterGain)

      textureBus.connect(masterWarmthFilter)
      masterWarmthFilter.connect(textureBreathVca)
      textureBreathVca.connect(textureAmVca)
      textureAmVca.connect(ambientGateGain)

      ambientGateGain.connect(sleepFadeGain)
      sleepFadeGain.connect(masterGain)
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
      // The piano/strings motif is part of the ambient sound, not a game cue: its own
      // bloom feeds the ambient gate, so stopping and the sleep fade silence it too.
      const motifBloom = createCueBloomBus(ctx, ambientGateGain)
      const classical = createClassicalMotifController(ctx, motifBloom.input)

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
        sleepFadeGain,
        masterGain,
        cueBloom,
        motifBloom,
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
    g.motifBloom.setWarmth(descent.cueBloomCutoffHz, ramp)

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

  const clearSleepFadeOnGraph = (g: AudioGraph, restoreRamp = 0.15) => {
    rampParam(g.sleepFadeGain.gain, 1, restoreRamp, g.ctx.currentTime)
  }

  const scheduleSleepFadeOnGraph = (g: AudioGraph, delaySeconds: number, fadeSeconds = 12) => {
    const safeDelay = Math.max(0.1, Number.isFinite(delaySeconds) ? delaySeconds : 0)
    const safeFade = Math.min(safeDelay, Math.max(0.5, Number.isFinite(fadeSeconds) ? fadeSeconds : 12))
    const now = g.ctx.currentTime
    const fadeStart = now + Math.max(0, safeDelay - safeFade)
    const fadeEnd = now + safeDelay
    const param = g.sleepFadeGain.gain

    try {
      if (typeof param.cancelAndHoldAtTime === 'function') {
        param.cancelAndHoldAtTime(now)
      } else {
        param.cancelScheduledValues(now)
      }
      const cur = paramNow(param, now)
      param.setValueAtTime(cur, now)
      if (cur < 0.999) {
        const recoverEnd = Math.min(fadeStart, now + 0.25)
        param.linearRampToValueAtTime(1, recoverEnd)
      }
      param.setValueAtTime(1, fadeStart)
      param.linearRampToValueAtTime(0, fadeEnd)
      // Back up to full (if it was down) until fadeStart, then down to silence
      // at fadeEnd. Both segments are recorded, so a stop during the recovery
      // starts from where the gain really is.
      const fade = { from: 1, to: 0, t0: fadeStart, t1: fadeEnd }
      noteRamp(
        param,
        cur < 0.999 ? { from: cur, to: 1, t0: now, t1: Math.min(fadeStart, now + 0.25), then: fade } : { ...fade, from: 1 },
      )
    } catch {
      /* fallback handled by JS SessionCurtain */
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

    // Cancel any future sleepFadeGain ramp (keep its current value so fade-out stays click-free!)
    try {
      const now = g.ctx.currentTime
      const curSleep = paramNow(g.sleepFadeGain.gain, now)
      if (typeof g.sleepFadeGain.gain.cancelAndHoldAtTime === 'function') {
        g.sleepFadeGain.gain.cancelAndHoldAtTime(now)
      } else {
        g.sleepFadeGain.gain.cancelScheduledValues(now)
      }
      g.sleepFadeGain.gain.setValueAtTime(curSleep, now)
      noteRamp(g.sleepFadeGain.gain, { from: curSleep, to: curSleep, t0: now, t1: now })
    } catch {
      /* ignore */
    }

    if (safeFade <= 0.002) {
      rampParam(g.ambientGateGain.gain, 0, 0, g.ctx.currentTime)
      disposeAllAmbientNow()
      suspendWhenIdle(g, 0)
      return
    }

    rampParam(g.ambientGateGain.gain, 0, safeFade, g.ctx.currentTime)
    g.pad.stop(safeFade)
    g.binaural.stop(safeFade)

    stopTimer = setTimeout(() => {
      stopTimer = null
      if (running) return
      disposeAllAmbientNow()
      // Stopped means silent: suspend the whole graph so nothing (motif tails,
      // cue echoes, a stray voice) can keep sounding, and the CPU can rest.
      suspendWhenIdle(g, 0)
    }, Math.ceil(safeFade * 1000) + 120)
  }

  /** Suspend the audio context after `delayMs` unless ambient sound starts again. */
  const suspendWhenIdle = (g: AudioGraph, delayMs: number) => {
    if (idleSuspendTimer) clearTimeout(idleSuspendTimer)
    idleSuspendTimer = setTimeout(() => {
      idleSuspendTimer = null
      if (running || g.ctx.state !== 'running' || typeof g.ctx.suspend !== 'function') return
      void g.ctx.suspend().catch(() => {})
    }, delayMs)
  }

  const applyMix = (mix: Mix, fadeSeconds = 1.5) => {
    const safeFade = Math.max(0, Number.isFinite(fadeSeconds) ? fadeSeconds : 1.5)
    lastMix = mix
    if (!isSilent(mix)) lastAudibleMix = mix
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
    if (idleSuspendTimer) {
      clearTimeout(idleSuspendTimer)
      idleSuspendTimer = null
    }

    if (g.ctx.state !== 'running' && g.ctx.state !== 'closed') {
      void resumeContext(g.ctx)
    }
    void sessionReady.then(() => {
      if (running && g.ctx.state !== 'running' && g.ctx.state !== 'closed') {
        void resumeContext(g.ctx)
      }
    })

    rampParam(g.ambientGateGain.gain, 1, Math.min(safeFade, 0.35), g.ctx.currentTime)
    // If a previous sleep timer already faded sleepFadeGain down, bring it back cleanly on play
    if (paramNow(g.sleepFadeGain.gain, g.ctx.currentTime) < 0.99) {
      clearSleepFadeOnGraph(g, Math.min(safeFade, 0.35))
    }

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

    scheduleSleepFade(delaySeconds: number, fadeSeconds = 12) {
      const g = ensureGraph()
      if (!g) return
      if (!Number.isFinite(delaySeconds) || delaySeconds <= 0) {
        clearSleepFadeOnGraph(g, 0.2)
        return
      }
      scheduleSleepFadeOnGraph(g, delaySeconds, fadeSeconds)
    },

    cancelSleepFade() {
      if (!graph) return
      clearSleepFadeOnGraph(graph, 0.2)
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
        // Cues with no ambient sound wake the graph briefly, then let it sleep again.
        if (!running) suspendWhenIdle(g, 4000)
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
