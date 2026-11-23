import { isSilent, LAYERS, type LayerId, type Mix } from '@/core/sound/catalog'
import type { CueName, SoundEngine } from '@/core/sound/engine'
import { createBinauralController, type BinauralController } from './binaural'
import { createNoiseBufferBank, type NoiseBufferBank } from './buffers'
import { playCue } from './cues'
import { createAmbientLayer, type AmbientLayer } from './layers'
import { clamp, rampParam, safeDisconnect } from './params'

type AudioContextCtor = new () => AudioContext

interface AudioGraph {
  ctx: AudioContext
  bank: NoiseBufferBank
  ambientMixBus: GainNode
  ambientGateGain: GainNode
  masterGain: GainNode
  cueBus: GainNode
  limiter: DynamicsCompressorNode | null
  binaural: BinauralController
}

const ALL_LAYER_IDS: readonly LayerId[] = LAYERS.map((layer) => layer.id)

function getAudioContextCtor(): AudioContextCtor | null {
  const g = globalThis as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return g.AudioContext ?? g.webkitAudioContext ?? null
}

/**
 * Procedural Web Audio sound & binaural beat engine for Lull.
 *
 * Zero external audio files. Safe in SSR, headless, and autoplay-restricted
 * environments — every Web Audio call is lazy and guarded.
 */
export function createWebSoundEngine(): SoundEngine {
  let graph: AudioGraph | null = null
  let running = false
  let unlocked = false
  let cuesEnabled = true
  let masterVolume = 1

  const activeLayers = new Map<LayerId, AmbientLayer>()
  const layerTeardownTimers = new Map<LayerId, ReturnType<typeof setTimeout>>()
  let stopTimer: ReturnType<typeof setTimeout> | null = null

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
    graph?.binaural.dispose()
  }

  const ensureGraph = (): AudioGraph | null => {
    if (graph) return graph
    const Ctor = getAudioContextCtor()
    if (!Ctor) return null

    try {
      const ctx = new Ctor()
      const bank = createNoiseBufferBank(ctx)
      const ambientMixBus = ctx.createGain()
      ambientMixBus.gain.value = 1

      const ambientGateGain = ctx.createGain()
      ambientGateGain.gain.value = 1

      const masterGain = ctx.createGain()
      masterGain.gain.value = masterVolume

      const cueBus = ctx.createGain()
      cueBus.gain.value = 1

      let limiter: DynamicsCompressorNode | null = null
      let busOutput: AudioNode = ctx.destination

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
      }

      ambientMixBus.connect(ambientGateGain)
      ambientGateGain.connect(masterGain)
      masterGain.connect(busOutput)
      cueBus.connect(busOutput)

      const binaural = createBinauralController(ctx, ambientMixBus)

      graph = {
        ctx,
        bank,
        ambientMixBus,
        ambientGateGain,
        masterGain,
        cueBus,
        limiter,
        binaural,
      }
      return graph
    } catch {
      return null
    }
  }

  const resumeContext = async (ctx: AudioContext): Promise<boolean> => {
    if (ctx.state === 'running') return true
    if (ctx.state === 'closed') return false
    try {
      await ctx.resume()
      return (ctx.state as AudioContextState) === 'running'
    } catch {
      return false
    }
  }

  const stopAmbient = (fadeSeconds = 1.5) => {
    running = false
    clearStopTimer()
    if (!graph) return

    const g = graph
    const safeFade = Math.max(0, Number.isFinite(fadeSeconds) ? fadeSeconds : 1.5)

    for (const id of activeLayers.keys()) clearLayerTimer(id)

    if (safeFade <= 0.002) {
      rampParam(g.ambientGateGain.gain, 0, 0, g.ctx.currentTime)
      disposeAllAmbientNow()
      if (g.ctx.state === 'running' && typeof g.ctx.suspend === 'function') {
        void g.ctx.suspend().catch(() => {})
      }
      return
    }

    rampParam(g.ambientGateGain.gain, 0, safeFade, g.ctx.currentTime)
    g.binaural.stop(safeFade)

    stopTimer = setTimeout(() => {
      stopTimer = null
      if (running) return
      disposeAllAmbientNow()
      if (g.ctx.state === 'running' && typeof g.ctx.suspend === 'function') {
        void g.ctx.suspend().catch(() => {})
      }
    }, Math.ceil(safeFade * 1000) + 120)
  }

  return {
    async unlock() {
      unlocked = true
      const g = ensureGraph()
      if (!g) return
      await resumeContext(g.ctx)
    },

    setMix(mix: Mix, fadeSeconds = 1.5) {
      const safeFade = Math.max(0, Number.isFinite(fadeSeconds) ? fadeSeconds : 1.5)

      if (isSilent(mix)) {
        stopAmbient(safeFade)
        return
      }

      const g = ensureGraph()
      if (!g) return

      clearStopTimer()
      running = true

      if (g.ctx.state !== 'running' && g.ctx.state !== 'closed') {
        void resumeContext(g.ctx)
      }

      // Restore ambient gate smoothly if recovering from an in-progress or completed stop()
      rampParam(g.ambientGateGain.gain, 1, Math.min(safeFade, 0.35), g.ctx.currentTime)

      for (const id of ALL_LAYER_IDS) {
        const gain = clamp(mix.layers[id] ?? 0, 0, 1)
        const existing = activeLayers.get(id)

        if (gain > 0.001) {
          clearLayerTimer(id)
          const layer = existing ?? createAmbientLayer(g.ctx, g.bank, id, g.ambientMixBus)
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

      g.binaural.update(mix.band, mix.bandGain, mix.carrier, safeFade)
    },

    setMaster(volume: number, rampSeconds = 0.2) {
      masterVolume = clamp(volume, 0, 1)
      if (!graph) return
      const safeRamp = Math.max(0, Number.isFinite(rampSeconds) ? rampSeconds : 0.2)
      rampParam(graph.masterGain.gain, masterVolume, safeRamp, graph.ctx.currentTime)
    },

    stop(fadeSeconds = 1.5) {
      stopAmbient(fadeSeconds)
    },

    cue(name: CueName, volume = 1) {
      if (!cuesEnabled) return
      const g = ensureGraph()
      if (!g) return

      const emit = () => {
        if (!cuesEnabled || g.ctx.state !== 'running') return
        try {
          playCue(g.ctx, g.cueBus, name, volume)
        } catch {
          // Never throw from feedback cues.
        }
      }

      if (g.ctx.state === 'running') {
        emit()
        return
      }

      if (g.ctx.state !== 'closed') {
        if (!unlocked) {
          // Attempt lazy unlock from the triggering user gesture; silently no-op if blocked.
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

    get isRunning() {
      return running
    },
  }
}
