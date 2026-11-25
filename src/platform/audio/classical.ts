import type { ClassicalMotifStyle } from '@/core/sound/catalog'
import { harmonicKeyMeta, type HarmonicKeyId } from '@/core/sound/harmonics'
import { emitMotifPhrase } from './motifEvents'
import { clamp, safeDisconnect, setParam } from './params'
import type { AudioContextLike, AudioNodeLike, GainNodeLike, OscillatorNodeLike } from './types'

/**
 * Generative Nocturnal Classical Voice (Nocturne / Adagio Dusk / Ink Reverie).
 *
 * Synthesizes ultra-slow, Satie & Chopin inspired felt-piano phrases and
 * hushed chamber-string intervals locked strictly to the active HarmonicKey,
 * routed into the shared warm stereo bloom bus.
 */
export interface ClassicalMotifController {
  update(opts: { style: ClassicalMotifStyle | null; keyId: HarmonicKeyId; darkness: number }): void
  stop(): void
  dispose(): void
}

const NOCTURNE_PHRASES: readonly (readonly number[])[] = [
  [0, 2, 4, 5],
  [3, 1, 2, 0],
  [0, 3, 5, 4],
  [2, 4, 3, 1],
]

const ADAGIO_PHRASES: readonly (readonly number[])[] = [
  [0, 3],
  [2, 5],
  [1, 4],
  [0, 4],
]

const REVERIE_PHRASES: readonly (readonly number[])[] = [
  [0, 2, 5],
  [4, 2, 1],
  [3, 5, 2],
  [1, 3, 0],
]

function triggerFeltPianoNote(
  ctx: AudioContextLike,
  destination: AudioNodeLike,
  opts: {
    freq: number
    delay: number
    attack: number
    decay: number
    gain: number
    cutoff: number
    overtone: number
    pan: number
  },
): void {
  const start = ctx.currentTime + opts.delay
  const stopAt = start + opts.attack + opts.decay + 0.08

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  setParam(lp.frequency, clamp(opts.cutoff, 320, 2600))
  setParam(lp.Q, -3.01)

  const env = ctx.createGain()
  const peak = Math.max(0.0002, opts.gain)
  setParam(env.gain, 0.0001)
  env.gain.setValueAtTime(0.0001, start)
  env.gain.linearRampToValueAtTime(peak, start + opts.attack)
  env.gain.exponentialRampToValueAtTime(0.0001, start + opts.attack + opts.decay)

  const osc1 = ctx.createOscillator()
  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(opts.freq, start)
  osc1.connect(lp)

  let osc2: OscillatorNodeLike | null = null
  let ovGain: GainNodeLike | null = null
  if (opts.overtone > 0.005) {
    osc2 = ctx.createOscillator()
    osc2.type = 'triangle'
    osc2.frequency.setValueAtTime(opts.freq * 2, start)
    ovGain = ctx.createGain()
    setParam(ovGain.gain, opts.overtone)
    osc2.connect(ovGain)
    ovGain.connect(lp)
  }

  let panner: AudioNodeLike | null = null
  lp.connect(env)
  if (typeof ctx.createStereoPanner === 'function') {
    try {
      const p = ctx.createStereoPanner()
      setParam(p.pan, clamp(opts.pan, -0.65, 0.65))
      env.connect(p)
      p.connect(destination)
      panner = p
    } catch {
      env.connect(destination)
    }
  } else {
    env.connect(destination)
  }

  let cleaned = false
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
    try {
      osc1.onended = null
    } catch {
      /* ignore */
    }
    safeDisconnect(osc1)
    safeDisconnect(osc2)
    safeDisconnect(ovGain)
    safeDisconnect(lp)
    safeDisconnect(env)
    safeDisconnect(panner)
  }

  osc1.onended = cleanup
  fallbackTimer = setTimeout(cleanup, Math.ceil((opts.delay + opts.attack + opts.decay + 0.45) * 1000))

  osc1.start(start)
  osc1.stop(stopAt)
  if (osc2) {
    osc2.start(start)
    osc2.stop(stopAt)
  }
}

export function createClassicalMotifController(
  ctx: AudioContextLike,
  destination: AudioNodeLike,
): ClassicalMotifController {
  let activeStyle: ClassicalMotifStyle | null = null
  let activeKey: HarmonicKeyId = 'e-min-classical'
  let darkness = 0.4
  let phraseIdx = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const playPhrase = () => {
    if (!activeStyle || ctx.state !== 'running') return
    const key = harmonicKeyMeta(activeKey)
    const scale = key.scaleHz
    const d = clamp(darkness, 0, 1)
    const cutScale = 1 - d * 0.46
    const velScale = 1 - d * 0.25
    const notes: number[] = []
    // Plays a note and remembers it for the visuals (voice 0 = bass, else 1 + degree).
    const play = (voice: number, opts: Parameters<typeof triggerFeltPianoNote>[2]) => {
      triggerFeltPianoNote(ctx, destination, opts)
      notes.push(opts.delay, voice, opts.gain, opts.decay)
    }

    try {
      if (activeStyle === 'nocturne') {
        const phrase = NOCTURNE_PHRASES[phraseIdx % NOCTURNE_PHRASES.length]!
        // Gentle low bass root anchor + sparse Satie/Chopin broken felt-piano figure
        play(0, {
          freq: key.padHz[0]!,
          delay: 0,
          attack: 0.04,
          decay: 2.8,
          gain: 0.068 * velScale,
          cutoff: 680 * cutScale,
          overtone: 0.08,
          pan: -0.18,
        })
        phrase.forEach((deg, idx) => {
          const freq = scale[deg % scale.length]!
          play(1 + (deg % scale.length), {
            freq,
            delay: 0.55 + idx * 0.72,
            attack: 0.018 + d * 0.012,
            decay: 1.9 + idx * 0.2,
            gain: (0.056 - idx * 0.005) * velScale,
            cutoff: 1220 * cutScale,
            overtone: 0.14 * (1 - d * 0.35),
            pan: -0.25 + idx * 0.17,
          })
        })
      } else if (activeStyle === 'adagio') {
        // Slow bowed chamber-string dyad swell
        const pair = ADAGIO_PHRASES[phraseIdx % ADAGIO_PHRASES.length]!
        pair.forEach((deg, idx) => {
          const freq = scale[deg % scale.length]! * (idx === 0 ? 0.5 : 1)
          play(1 + (deg % scale.length), {
            freq,
            delay: idx * 0.45,
            attack: 0.85,
            decay: 3.4,
            gain: 0.052 * velScale,
            cutoff: 960 * cutScale,
            overtone: 0.18 * (1 - d * 0.4),
            pan: idx === 0 ? -0.24 : 0.24,
          })
        })
      } else {
        // Ink Reverie: delicate shimmering alpha-drift glass/felt drops
        const phrase = REVERIE_PHRASES[phraseIdx % REVERIE_PHRASES.length]!
        phrase.forEach((deg, idx) => {
          const freq = scale[deg % scale.length]!
          play(1 + (deg % scale.length), {
            freq,
            delay: idx * 0.85,
            attack: 0.025,
            decay: 2.1,
            gain: 0.046 * velScale,
            cutoff: 1380 * cutScale,
            overtone: 0.16 * (1 - d * 0.35),
            pan: (idx - 1) * 0.28,
          })
        })
      }
    } catch {
      /* never throw from ambient motifs */
    }
    if (notes.length > 0) emitMotifPhrase({ style: activeStyle, notes })
    phraseIdx += 1
  }

  const scheduleNext = (initial = false) => {
    clearTimer()
    if (!activeStyle) return
    const waitMs = initial
      ? 750
      : activeStyle === 'adagio'
        ? 5400
        : activeStyle === 'nocturne'
          ? 4800
          : 4400
    timer = setTimeout(() => {
      timer = null
      if (!activeStyle) return
      playPhrase()
      scheduleNext(false)
    }, waitMs)
  }

  return {
    update({ style, keyId, darkness: nextDark }) {
      const styleChanged = style !== activeStyle
      activeStyle = style
      activeKey = keyId
      darkness = nextDark
      if (!style) {
        clearTimer()
        return
      }
      if (styleChanged || timer === null) {
        scheduleNext(true)
      }
    },

    stop() {
      activeStyle = null
      clearTimer()
    },

    dispose() {
      activeStyle = null
      clearTimer()
    },
  }
}
