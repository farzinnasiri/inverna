import { DEFAULT_HARMONIC_KEY, harmonicKeyMeta, type CueTimbre, type HarmonicKeyId } from '@/core/sound/harmonics'
import { clamp, rampParam, safeDisconnect, safeStop, setParam } from './params'
import type {
  AudioContextLike,
  AudioNodeLike,
  BiquadFilterNodeLike,
  GainNodeLike,
  OscillatorNodeLike,
  StereoPannerNodeLike,
} from './types'

/**
 * Multi-voice Neuroacoustic Harmonic Pad Synthesizer.
 *
 * All modulation runs 100% natively on the audio thread (zero JS intervals):
 * 1. Four warm detuned open-voicing voices tuned to the active HarmonicKey
 *    using a soft felt/bowed PeriodicWave (zero harsh harmonics).
 * 2. Prime-ratio per-voice breathing LFOs (0.031–0.089 Hz) so notes gently
 *    bloom and recede without ever sounding like a static organ drone.
 * 3. Live Iso-descent warm low-pass filter (`padCutoffHz`: 1220 -> 400 Hz).
 * 4. 0.10 Hz cardiorespiratory resonance breath filter/gain swell.
 * 5. Cortical phase-locked AM modulator (1.5–9 Hz) embedded inside the harmonic
 *    pad so entrainment works on BOTH iPhone speakers and headphones.
 * 6. Gentle slow stereo spatial rocking (0.05–0.085 Hz).
 */

const PAD_MAX_GAIN = 0.24
const VOICE_WEIGHTS = [0.34, 0.28, 0.21, 0.17] as const
const VOICE_LFO_HZ = [0.037, 0.053, 0.071, 0.089] as const
const DETUNE_RATIO = 0.0022 // ~3.8 cents subtle lush choral width

export interface PadDescentParams {
  modHz: number
  amDepth: number
  breathHz: number
  breathDepth: number
  padCutoffHz: number
  spatialHz: number
}

export interface HarmonicPadController {
  update(opts: {
    keyId: HarmonicKeyId
    gain: number
    breathPacing: boolean
    spatialMotion: number
    fadeSeconds: number
  }): void
  setDescent(params: PadDescentParams, rampSeconds: number): void
  stop(fadeSeconds: number): void
  dispose(): void
}

interface PadVoice {
  oscA: OscillatorNodeLike
  oscB: OscillatorNodeLike
  vca: GainNodeLike
  lfo: OscillatorNodeLike
  lfoDepth: GainNodeLike
}

interface ActivePadGraph {
  voices: PadVoice[]
  warmFilter: BiquadFilterNodeLike
  breathLfo: OscillatorNodeLike
  breathFilterDepth: GainNodeLike
  breathGainNode: GainNodeLike
  breathGainDepth: GainNodeLike
  amVca: GainNodeLike
  amLfo: OscillatorNodeLike
  amDepthGain: GainNodeLike
  panner: StereoPannerNodeLike | null
  panLfo: OscillatorNodeLike | null
  panDepthGain: GainNodeLike | null
  outputGain: GainNodeLike
}

/**
 * Distinct acoustic timbre per composition so each soundscape has its own
 * organic harmonic character (felt fifths, bowed cello, lunar glass, velvet sub, twilight harp).
 */
const TIMBRE_HARMONICS: Record<CueTimbre, number[]> = {
  felt: [0, 1.0, 0.25, 0.08, 0.02],
  'warm-bell': [0, 1.0, 0.36, 0.16, 0.06, 0.025],
  glass: [0, 1.0, 0.14, 0.22, 0.04, 0.09],
  velvet: [0, 1.0, 0.09, 0.015],
  harp: [0, 1.0, 0.18, 0.14, 0.09, 0.04],
}

function createTimbreWave(ctx: AudioContextLike, timbre: CueTimbre): unknown | null {
  if (typeof ctx.createPeriodicWave !== 'function') return null
  try {
    const imagVals = TIMBRE_HARMONICS[timbre] ?? TIMBRE_HARMONICS.felt
    const real = new Float32Array(imagVals.length)
    const imag = new Float32Array(imagVals)
    return ctx.createPeriodicWave(real, imag)
  } catch {
    return null
  }
}

/**
 * Asymmetric 0.10 Hz cardiorespiratory breath wave (~3.9s inhale rise / ~6.1s exhale release)
 * using sin(w*t) + 0.24*sin(2*w*t) — runs 100% natively in CoreAudio/Oboe.
 */
export function createAsymmetricBreathWave(ctx: AudioContextLike): unknown | null {
  if (typeof ctx.createPeriodicWave !== 'function') return null
  try {
    const real = new Float32Array([0, 0, 0, 0])
    const imag = new Float32Array([0, 1.0, 0.24, 0.04])
    return ctx.createPeriodicWave(real, imag)
  } catch {
    return null
  }
}

export function createHarmonicPadController(
  ctx: AudioContextLike,
  destination: AudioNodeLike,
): HarmonicPadController {
  let graph: ActivePadGraph | null = null
  let stopTimer: ReturnType<typeof setTimeout> | null = null
  let currentKey: HarmonicKeyId = DEFAULT_HARMONIC_KEY
  let breathEnabled = true
  let spatialAmount = 0.35

  let descent: PadDescentParams = {
    modHz: 5.0,
    amDepth: 0.14,
    breathHz: 0.1,
    breathDepth: 0.2,
    padCutoffHz: 860,
    spatialHz: 0.07,
  }

  const clearStopTimer = () => {
    if (stopTimer !== null) {
      clearTimeout(stopTimer)
      stopTimer = null
    }
  }

  /** Chords fading out after a sound switch; torn down when their fade ends. */
  const retiring = new Map<ActivePadGraph, ReturnType<typeof setTimeout>>()

  const teardownNow = () => {
    clearStopTimer()
    for (const [old, timer] of retiring) {
      clearTimeout(timer)
      destroyGraph(old)
    }
    retiring.clear()
    if (!graph) return
    const g = graph
    graph = null
    destroyGraph(g)
  }

  const destroyGraph = (g: ActivePadGraph) => {
    for (const v of g.voices) {
      safeStop(v.oscA)
      safeStop(v.oscB)
      safeStop(v.lfo)
      safeDisconnect(v.oscA)
      safeDisconnect(v.oscB)
      safeDisconnect(v.vca)
      safeDisconnect(v.lfo)
      safeDisconnect(v.lfoDepth)
    }

    safeStop(g.breathLfo)
    safeStop(g.amLfo)
    safeStop(g.panLfo)
    safeDisconnect(g.warmFilter)
    safeDisconnect(g.breathLfo)
    safeDisconnect(g.breathFilterDepth)
    safeDisconnect(g.breathGainNode)
    safeDisconnect(g.breathGainDepth)
    safeDisconnect(g.amVca)
    safeDisconnect(g.amLfo)
    safeDisconnect(g.amDepthGain)
    safeDisconnect(g.panner)
    safeDisconnect(g.panLfo)
    safeDisconnect(g.panDepthGain)
    safeDisconnect(g.outputGain)
  }

  const buildGraph = (keyId: HarmonicKeyId): ActivePadGraph => {
    const now = ctx.currentTime
    const meta = harmonicKeyMeta(keyId)
    const warmWave = createTimbreWave(ctx, meta.timbre)

    const warmFilter = ctx.createBiquadFilter()
    warmFilter.type = 'lowpass'
    setParam(warmFilter.frequency, descent.padCutoffHz)
    setParam(warmFilter.Q, -3.01)
    try {
      warmFilter.frequency.setValueAtTime(descent.padCutoffHz, now)
    } catch {
      /* mock fallback */
    }

    // 4-voice gently breathing chord bed
    const voices: PadVoice[] = meta.padHz.map((freq, idx) => {
      const oscA = ctx.createOscillator()
      const oscB = ctx.createOscillator()
      if (warmWave && typeof oscA.setPeriodicWave === 'function' && typeof oscB.setPeriodicWave === 'function') {
        try {
          oscA.setPeriodicWave(warmWave)
          oscB.setPeriodicWave(warmWave)
        } catch {
          oscA.type = 'sine'
          oscB.type = 'triangle'
        }
      } else {
        oscA.type = 'sine'
        oscB.type = 'sine'
      }
      setParam(oscA.frequency, freq * (1 - DETUNE_RATIO))
      setParam(oscB.frequency, freq * (1 + DETUNE_RATIO))

      const weight = VOICE_WEIGHTS[idx] ?? 0.2
      const vca = ctx.createGain()
      setParam(vca.gain, weight * 0.72)

      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      setParam(lfo.frequency, VOICE_LFO_HZ[idx] ?? 0.05)

      const lfoDepth = ctx.createGain()
      setParam(lfoDepth.gain, weight * 0.28)

      oscA.connect(vca)
      oscB.connect(vca)
      lfo.connect(lfoDepth)
      lfoDepth.connect(vca.gain)
      vca.connect(warmFilter)

      oscA.start(now)
      oscB.start(now)
      lfo.start(now)

      return { oscA, oscB, vca, lfo, lfoDepth }
    })

    // Asymmetric 0.1 Hz Cardiorespiratory resonance breath swell (~4s rise / ~6s release)
    const breathLfo = ctx.createOscillator()
    const breathWave = createAsymmetricBreathWave(ctx)
    if (breathWave && typeof breathLfo.setPeriodicWave === 'function') {
      try {
        breathLfo.setPeriodicWave(breathWave)
      } catch {
        breathLfo.type = 'sine'
      }
    } else {
      breathLfo.type = 'sine'
    }
    setParam(breathLfo.frequency, descent.breathHz)

    const breathFilterDepth = ctx.createGain()
    const initBreathFilter = breathEnabled ? descent.padCutoffHz * 0.22 * (descent.breathDepth / 0.24) : 0
    setParam(breathFilterDepth.gain, initBreathFilter)

    const breathGainNode = ctx.createGain()
    const initBreathAmp = breathEnabled ? descent.breathDepth * 0.45 : 0
    setParam(breathGainNode.gain, 1 - initBreathAmp)

    const breathGainDepth = ctx.createGain()
    setParam(breathGainDepth.gain, initBreathAmp)

    try {
      breathFilterDepth.gain.setValueAtTime(initBreathFilter, now)
      breathGainNode.gain.setValueAtTime(1 - initBreathAmp, now)
      breathGainDepth.gain.setValueAtTime(initBreathAmp, now)
    } catch {
      /* mock fallback */
    }

    breathLfo.connect(breathFilterDepth)
    breathFilterDepth.connect(warmFilter.frequency)
    breathLfo.connect(breathGainDepth)
    breathGainDepth.connect(breathGainNode.gain)
    breathLfo.start(now)

    // Cortical Phase-Locked AM Modulator (1.5 - 9 Hz, speaker + headphone effective!)
    const amVca = ctx.createGain()
    const initAmAmp = descent.amDepth * 0.5
    setParam(amVca.gain, 1 - initAmAmp)

    const amLfo = ctx.createOscillator()
    amLfo.type = 'sine'
    setParam(amLfo.frequency, clamp(descent.modHz, 0.5, 16))

    const amDepthGain = ctx.createGain()
    setParam(amDepthGain.gain, initAmAmp)

    try {
      amVca.gain.setValueAtTime(1 - initAmAmp, now)
      amDepthGain.gain.setValueAtTime(initAmAmp, now)
    } catch {
      /* mock fallback */
    }

    amLfo.connect(amDepthGain)
    amDepthGain.connect(amVca.gain)
    amLfo.start(now)

    // Slow stereo rocking (keeps auditory cortex gently soothed)
    let panner: StereoPannerNodeLike | null = null
    let panLfo: OscillatorNodeLike | null = null
    let panDepthGain: GainNodeLike | null = null
    if (typeof ctx.createStereoPanner === 'function') {
      try {
        panner = ctx.createStereoPanner()
        setParam(panner.pan, 0)
        panLfo = ctx.createOscillator()
        panLfo.type = 'sine'
        setParam(panLfo.frequency, descent.spatialHz)
        panDepthGain = ctx.createGain()
        setParam(panDepthGain.gain, clamp(spatialAmount, 0, 1) * 0.34)
        panLfo.connect(panDepthGain)
        panDepthGain.connect(panner.pan)
        panLfo.start(now)
      } catch {
        safeStop(panLfo)
        safeDisconnect(panLfo)
        safeDisconnect(panDepthGain)
        safeDisconnect(panner)
        panner = null
        panLfo = null
        panDepthGain = null
      }
    }

    const outputGain = ctx.createGain()
    setParam(outputGain.gain, 0)
    try {
      outputGain.gain.setValueAtTime(0, now)
    } catch {
      /* mock fallback */
    }

    warmFilter.connect(breathGainNode)
    breathGainNode.connect(amVca)
    if (panner) {
      amVca.connect(panner)
      panner.connect(outputGain)
    } else {
      amVca.connect(outputGain)
    }
    outputGain.connect(destination)

    return {
      voices,
      warmFilter,
      breathLfo,
      breathFilterDepth,
      breathGainNode,
      breathGainDepth,
      amVca,
      amLfo,
      amDepthGain,
      panner,
      panLfo,
      panDepthGain,
      outputGain,
    }
  }

  const applyDescentToGraph = (g: ActivePadGraph, rampSeconds: number) => {
    const now = ctx.currentTime
    const ramp = Math.max(0.08, rampSeconds)

    rampParam(g.warmFilter.frequency, clamp(descent.padCutoffHz, 240, 2600), ramp, now)
    rampParam(g.breathLfo.frequency, clamp(descent.breathHz, 0.06, 0.2), ramp, now)

    const bScale = breathEnabled ? 1 : 0
    const bGainAmp = clamp(descent.breathDepth * 0.45 * bScale, 0, 0.28)
    rampParam(g.breathGainNode.gain, 1 - bGainAmp, ramp, now)
    rampParam(g.breathGainDepth.gain, bGainAmp, ramp, now)
    rampParam(
      g.breathFilterDepth.gain,
      bScale * clamp(descent.padCutoffHz * 0.22 * (descent.breathDepth / 0.24), 0, 420),
      ramp,
      now,
    )

    const amAmp = clamp(descent.amDepth * 0.65, 0, 0.28)
    rampParam(g.amLfo.frequency, clamp(descent.modHz, 0.5, 16), ramp, now)
    rampParam(g.amVca.gain, 1 - amAmp, ramp, now)
    rampParam(g.amDepthGain.gain, amAmp, ramp, now)

    if (g.panLfo && g.panDepthGain) {
      rampParam(g.panLfo.frequency, clamp(descent.spatialHz, 0.02, 0.2), ramp, now)
      rampParam(g.panDepthGain.gain, clamp(spatialAmount, 0, 1) * 0.34, ramp, now)
    }
  }

  const fadeOutAndTeardown = (fadeSeconds: number) => {
    clearStopTimer()
    if (!graph) return
    const safeFade = Math.max(0.06, Math.max(0, fadeSeconds))
    rampParam(graph.outputGain.gain, 0, safeFade, ctx.currentTime)
    stopTimer = setTimeout(() => {
      stopTimer = null
      teardownNow()
    }, Math.ceil(safeFade * 1000) + 120)
  }

  return {
    update({ keyId, gain, breathPacing, spatialMotion, fadeSeconds }) {
      const targetGain = clamp(gain, 0, 1) * PAD_MAX_GAIN
      breathEnabled = breathPacing
      spatialAmount = clamp(spatialMotion, 0, 1)

      if (targetGain <= 0.001) {
        fadeOutAndTeardown(fadeSeconds)
        return
      }

      clearStopTimer()
      const safeFade = Math.max(0.08, Math.max(0, fadeSeconds))

      // A chord that's just been built swells in a little slower than a level change.
      let swell = safeFade
      if (!graph) {
        currentKey = keyId
        graph = buildGraph(keyId)
        swell = Math.max(safeFade, 2.2)
      } else if (keyId !== currentKey) {
        // A new sound gets its own chord, crossfaded in. Bending the old
        // chord's pitches into the new one was audible as a siren-like slide,
        // and swapping its waveform mid-note clicked.
        currentKey = keyId
        const old = graph
        const xfade = Math.max(1.2, Math.min(safeFade * 1.4, 2.4))
        rampParam(old.outputGain.gain, 0, xfade, ctx.currentTime)
        // Stop on the audio clock when the fade ends, so the old chord can't keep
        // running (silently, costing CPU) if iOS delays the teardown timer while locked.
        const end = ctx.currentTime + xfade + 0.05
        for (const v of old.voices) {
          safeStop(v.oscA, end)
          safeStop(v.oscB, end)
          safeStop(v.lfo, end)
        }
        safeStop(old.breathLfo, end)
        safeStop(old.amLfo, end)
        safeStop(old.panLfo, end)
        retiring.set(
          old,
          setTimeout(() => {
            retiring.delete(old)
            destroyGraph(old)
          }, Math.ceil(xfade * 1000) + 150),
        )
        graph = buildGraph(keyId)
        swell = Math.max(safeFade, 2.2)
      }

      applyDescentToGraph(graph, Math.min(safeFade, 1.0))
      rampParam(graph.outputGain.gain, targetGain, swell, ctx.currentTime)
    },

    setDescent(next, rampSeconds) {
      descent = next
      if (graph) {
        applyDescentToGraph(graph, rampSeconds)
      }
    },

    stop(fadeSeconds) {
      fadeOutAndTeardown(fadeSeconds)
    },

    dispose() {
      teardownNow()
    },
  }
}
