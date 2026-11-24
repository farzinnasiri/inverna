import type { AudioBufferLike, AudioContextLike } from './types'

/**
 * Physically modeled stereo acoustic texture buffers for Lull.
 *
 * Designed specifically to eliminate harsh broadband "TV static" while staying
 * 100% offline, zero-audio-file, and CoreAudio/Oboe background-safe:
 * - `white` / `pink` / `brown`: seamless equal-power crossfaded 5s stereo beds
 * - `rain-patter`: 6s stereo Minnaert water-droplet impacts (close window + roof + distant)
 * - `fire-crackle`: 6s stereo wood snaps, ember pop clusters & flame-lick gusts (silent floor between snaps!)
 * - `waves-surf`: 10s physically modeled asymmetric ocean wave cycle (approach -> crest -> receding wash -> quiet trough)
 */

export type NoiseKind = 'white' | 'pink' | 'brown' | 'rain-patter' | 'fire-crackle' | 'waves-surf'

export const NOISE_BUFFER_SECONDS = 5
export const NOISE_MAX_SAMPLE_RATE = 24000
const LOOP_XFADE_SECONDS = 0.35

export interface NoiseBufferBank {
  get(kind: NoiseKind): AudioBufferLike
  /** Stagger-prewarm remaining acoustic textures lazily so preset switches never stutter. */
  prewarm(): void
}

function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function applyLoopCrossfade(target: Float32Array, raw: Float32Array, length: number, xfade: number): void {
  target.set(raw.subarray(0, length))
  if (xfade <= 0) return
  const halfPi = Math.PI / 2
  for (let i = 0; i < xfade; i++) {
    const t = i / xfade
    const fadeIn = Math.sin(t * halfPi)
    const fadeOut = Math.cos(t * halfPi)
    target[i] = raw[i]! * fadeIn + raw[length + i]! * fadeOut
  }
}

function fillWhite(out: Float32Array, xfade: number, rand: () => number): void {
  const length = out.length
  const total = length + xfade
  const raw = new Float32Array(total)
  for (let i = 0; i < total; i++) {
    raw[i] = (rand() * 2 - 1) * 0.34
  }
  applyLoopCrossfade(out, raw, length, xfade)
}

/** Paul Kellet's 7-pole 1/f pink noise (-3 dB/octave), warmed up before capture. */
function fillPink(out: Float32Array, xfade: number, rand: () => number): void {
  const length = out.length
  const total = length + xfade
  const raw = new Float32Array(total)

  let b0 = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let b5 = 0
  let b6 = 0

  const step = () => {
    const white = rand() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.969 * b2 + white * 0.153852
    b3 = 0.8665 * b3 + white * 0.3104856
    b4 = 0.55 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.016898
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.085
    b6 = white * 0.115926
    return Math.max(-0.98, Math.min(0.98, pink))
  }

  for (let i = 0; i < 512; i++) step()
  for (let i = 0; i < total; i++) raw[i] = step()

  applyLoopCrossfade(out, raw, length, xfade)
}

/** Integrated random walk (-6 dB/octave) with 1-pole DC blocker for velvety sub-warmth. */
function fillBrown(out: Float32Array, xfade: number, rand: () => number): void {
  const length = out.length
  const total = length + xfade
  const raw = new Float32Array(total)

  let walk = 0
  let prevIn = 0
  let prevOut = 0
  const dcR = 0.997

  const step = () => {
    const white = rand() * 2 - 1
    walk = (walk + 0.02 * white) / 1.015
    const blocked = walk - prevIn + dcR * prevOut
    prevIn = walk
    prevOut = blocked
    return Math.max(-0.98, Math.min(0.98, blocked * 2.4))
  }

  for (let i = 0; i < 1024; i++) step()
  for (let i = 0; i < total; i++) raw[i] = step()

  applyLoopCrossfade(out, raw, length, xfade)
}

/**
 * Physically modeled nocturnal raindrop impacts (Minnaert bubble chirps + warm
 * slate/leaf roof patter + soft splash micro-transients) with ZERO broadband TV hiss.
 */
function fillRainPatter(out: Float32Array, xfade: number, sampleRate: number, rand: () => number): void {
  const length = out.length
  const total = length + xfade
  const raw = new Float32Array(total)

  // ~44 distinct drops per second per stereo channel at 3 natural acoustic distances
  const dropCount = Math.max(160, Math.round((total / sampleRate) * 44))
  const margin = Math.round(sampleRate * 0.045)

  for (let d = 0; d < dropCount; d++) {
    const start = Math.floor(rand() * Math.max(1, total - margin))
    const tier = rand()

    if (tier < 0.28) {
      // Close crisp window/water droplet with authentic Minnaert rising bubble pitch
      const dur = Math.max(28, Math.round(sampleRate * (0.012 + rand() * 0.016)))
      const f0 = 980 + rand() * 1450
      const amp = 0.14 + rand() * 0.18
      let phase = 0
      for (let i = 0; i < dur && start + i < total; i++) {
        const t = i / dur
        const env = Math.sin(Math.min(1, t * 9) * (Math.PI / 2)) * Math.exp(-t * 6.5)
        const f = f0 * (1 + t * 0.22)
        phase += (2 * Math.PI * f) / sampleRate
        const ping = Math.sin(phase) * 0.72 + (rand() * 2 - 1) * 0.28 * Math.exp(-t * 14)
        raw[start + i] = (raw[start + i] ?? 0) + ping * env * amp
      }
    } else if (tier < 0.78) {
      // Warm mid-distance raindrop hitting timber/roof eaves (soft damped woody body)
      const dur = Math.max(24, Math.round(sampleRate * (0.014 + rand() * 0.022)))
      const f0 = 420 + rand() * 680
      const amp = 0.1 + rand() * 0.14
      const w = (2 * Math.PI * f0) / sampleRate
      for (let i = 0; i < dur && start + i < total; i++) {
        const t = i / dur
        const env = Math.sin(Math.min(1, t * 7) * (Math.PI / 2)) * Math.exp(-t * 5.2)
        const body = Math.sin(i * w * (1 + t * 0.08)) * 0.65 + (rand() * 2 - 1) * 0.35 * Math.exp(-t * 9)
        raw[start + i] = (raw[start + i] ?? 0) + body * env * amp
      }
    } else {
      // Soft distant fine rain micro-splash
      const dur = Math.max(16, Math.round(sampleRate * (0.008 + rand() * 0.012)))
      const f0 = 1550 + rand() * 1300
      const amp = 0.06 + rand() * 0.08
      const w = (2 * Math.PI * f0) / sampleRate
      for (let i = 0; i < dur && start + i < total; i++) {
        const t = i / dur
        const env = Math.exp(-t * 7.2)
        const s = Math.sin(i * w) * 0.55 + (rand() * 2 - 1) * 0.45
        raw[start + i] = (raw[start + i] ?? 0) + s * env * amp
      }
    }
  }

  // Gentle 1-pole soft silk lowpass + soft tanh saturation so overlapping drops never clip
  let lp = 0
  for (let i = 0; i < total; i++) {
    lp = lp + 0.42 * ((raw[i] ?? 0) - lp)
    raw[i] = Math.tanh(lp * 1.15) * 0.85
  }

  applyLoopCrossfade(out, raw, length, xfade)
}

/**
 * Physically modeled hearth fireplace:
 * - Pure silence in the high band between crackles (zero TV hiss!)
 * - Crisp dry cedar wood snaps & multi-pop ember clusters (1.4–4.2 kHz resonant bursts)
 * - Soft low-mid flame-lick wooshes (150–300 Hz irregular bursts)
 */
function fillFireCrackle(out: Float32Array, xfade: number, sampleRate: number, rand: () => number): void {
  const length = out.length
  const total = length + xfade
  const raw = new Float32Array(total)

  // 1. Irregular soft flame-tongue gusts (warm 150-290 Hz flutter)
  const gustCount = Math.max(10, Math.round((total / sampleRate) * 2.4))
  for (let g = 0; g < gustCount; g++) {
    const dur = Math.round(sampleRate * (0.18 + rand() * 0.34))
    const start = Math.floor(rand() * Math.max(1, total - dur - 8))
    const amp = 0.12 + rand() * 0.14
    let lp1 = 0
    let lp2 = 0
    const alpha = (2 * Math.PI * (165 + rand() * 110)) / sampleRate
    const a = Math.min(0.25, alpha)
    for (let i = 0; i < dur && start + i < total; i++) {
      const t = i / dur
      const env = Math.sin(t * Math.PI) * Math.sin(t * Math.PI)
      const n = rand() * 2 - 1
      lp1 += a * (n - lp1)
      lp2 += a * (lp1 - lp2)
      raw[start + i] = (raw[start + i] ?? 0) + lp2 * env * amp * 3.8
    }
  }

  // 2. Crisp cedar crackles & realistic 2-3 pop ember clusters
  const clusterCount = Math.max(18, Math.round((total / sampleRate) * 5.2))
  const addSnap = (pos: number, energy: number, bright: boolean) => {
    const dur = Math.max(12, Math.round(sampleRate * (bright ? 0.0028 + rand() * 0.004 : 0.005 + rand() * 0.008)))
    const freq = bright ? 2100 + rand() * 2400 : 950 + rand() * 1200
    const w = (2 * Math.PI * freq) / sampleRate
    for (let i = 0; i < dur && pos + i < total; i++) {
      const t = i / dur
      // Sharp wood-split transient decay
      const env = Math.pow(1 - t, 2.2) * Math.exp(-t * 5.5)
      const woody = Math.sin(i * w) * 0.55 + Math.sin(i * w * 1.63) * 0.25 + (rand() * 2 - 1) * 0.4
      raw[pos + i] = (raw[pos + i] ?? 0) + woody * env * energy
    }
  }

  for (let c = 0; c < clusterCount; c++) {
    const base = Math.floor(rand() * Math.max(1, total - Math.round(sampleRate * 0.18)))
    const mainEnergy = 0.28 + rand() * 0.42
    addSnap(base, mainEnergy, rand() < 0.65)
    // Natural crackling often spits 1-2 micro-sparks 18-85 ms later
    if (rand() < 0.55) {
      addSnap(base + Math.round(sampleRate * (0.018 + rand() * 0.065)), mainEnergy * (0.35 + rand() * 0.35), true)
    }
    if (rand() < 0.25) {
      addSnap(base + Math.round(sampleRate * (0.06 + rand() * 0.09)), mainEnergy * 0.28, false)
    }
  }

  for (let i = 0; i < total; i++) {
    raw[i] = Math.tanh((raw[i] ?? 0) * 1.05) * 0.9
  }

  applyLoopCrossfade(out, raw, length, xfade)
}

/**
 * Physically modeled 10-second asymmetric nocturnal ocean wave:
 * - Approach (0..3.4s): deep sub-water swell builds from quiet stillness
 * - Crest & Break (3.4..4.6s): warm foamy surf bloom (never harsh white-noise static)
 * - Receding Wash (4.6..9.3s): dynamic filter cutoff sweeps smoothly downward as water recedes
 * - Quiet Trough (9.3..10.0s): peaceful breathing pause before the next wave
 */
function fillWavesSurf(
  out: Float32Array,
  xfade: number,
  sampleRate: number,
  rand: () => number,
  phaseOffsetNorm: number,
): void {
  const length = out.length
  const total = length + xfade
  const raw = new Float32Array(total)

  // Warm up brown + pink generators
  let walk = 0
  let prevIn = 0
  let prevOut = 0
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let b5 = 0
  let b6 = 0
  let foamLp1 = 0
  let foamLp2 = 0
  let deepLp = 0

  for (let i = 0; i < 512; i++) {
    const w = rand() * 2 - 1
    walk = (walk + 0.02 * w) / 1.015
  }

  for (let i = 0; i < total; i++) {
    const cyc = ((i % length) / length + phaseOffsetNorm) % 1

    // 1. Deep rolling sub-swell envelope (peaks around cyc = 0.34)
    let swellEnv = 0
    if (cyc < 0.36) {
      const u = cyc / 0.36
      swellEnv = 0.14 + 0.86 * (u * u * (3 - 2 * u))
    } else if (cyc < 0.88) {
      const u = (cyc - 0.36) / 0.52
      swellEnv = 0.14 + 0.86 * Math.pow(1 - u, 1.8)
    } else {
      swellEnv = 0.14
    }

    // 2. Warm surf foam crest & receding wash envelope (peaks around cyc = 0.42, then long silky tail)
    let foamEnv = 0
    let foamCutoffHz = 220
    if (cyc > 0.22 && cyc < 0.42) {
      const u = (cyc - 0.22) / 0.2
      foamEnv = u * u
      foamCutoffHz = 240 + 1080 * u
    } else if (cyc >= 0.42 && cyc < 0.94) {
      const u = (cyc - 0.42) / 0.52
      foamEnv = Math.pow(1 - u, 1.55)
      foamCutoffHz = 210 + 1110 * Math.pow(1 - u, 1.9)
    }

    // Generate clean brown sub + smooth 1/f pink foam
    const w1 = rand() * 2 - 1
    walk = (walk + 0.02 * w1) / 1.015
    const brown = walk - prevIn + 0.997 * prevOut
    prevIn = walk
    prevOut = brown

    const w2 = rand() * 2 - 1
    b0 = 0.99886 * b0 + w2 * 0.0555179
    b1 = 0.99332 * b1 + w2 * 0.0750759
    b2 = 0.969 * b2 + w2 * 0.153852
    b3 = 0.8665 * b3 + w2 * 0.3104856
    b4 = 0.55 * b4 + w2 * 0.5329522
    b5 = -0.7616 * b5 - w2 * 0.016898
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w2 * 0.5362) * 0.085
    b6 = w2 * 0.115926

    // Dynamic 2-pole warm foam lowpass (sweeps smoothly down as wave recedes!)
    const fa = Math.min(0.45, (2 * Math.PI * foamCutoffHz) / sampleRate)
    foamLp1 += fa * (pink - foamLp1)
    foamLp2 += fa * (foamLp1 - foamLp2)

    const da = Math.min(0.2, (2 * Math.PI * 165) / sampleRate)
    deepLp += da * (brown * 2.6 - deepLp)

    raw[i] = Math.tanh((deepLp * swellEnv * 0.72 + foamLp2 * foamEnv * 0.92) * 1.15) * 0.88
  }

  applyLoopCrossfade(out, raw, length, xfade)
}

const KIND_SEED: Record<NoiseKind, number> = {
  white: 101,
  pink: 202,
  brown: 303,
  'rain-patter': 404,
  'fire-crackle': 505,
  'waves-surf': 606,
}

const KIND_SECONDS: Record<NoiseKind, number> = {
  white: NOISE_BUFFER_SECONDS,
  pink: NOISE_BUFFER_SECONDS,
  brown: NOISE_BUFFER_SECONDS,
  'rain-patter': 6,
  'fire-crackle': 6,
  'waves-surf': 10,
}

export function createNoiseBuffer(
  ctx: AudioContextLike,
  kind: NoiseKind,
  seconds = KIND_SECONDS[kind],
): AudioBufferLike {
  const sampleRate = Math.max(8000, Math.min(NOISE_MAX_SAMPLE_RATE, Math.round(ctx.sampleRate || 44100)))
  const length = Math.max(1, Math.round(sampleRate * seconds))
  const xfade = Math.min(Math.floor(length / 4), Math.round(sampleRate * LOOP_XFADE_SECONDS))
  const buffer = ctx.createBuffer(2, length, sampleRate)

  const seed = KIND_SEED[kind]
  const fillChannel = (channel: number) => {
    const out = buffer.getChannelData(channel)
    const rand = makeRng(seed + channel * 9973)
    switch (kind) {
      case 'white':
        fillWhite(out, xfade, rand)
        break
      case 'pink':
        fillPink(out, xfade, rand)
        break
      case 'brown':
        fillBrown(out, xfade, rand)
        break
      case 'rain-patter':
        fillRainPatter(out, xfade, sampleRate, rand)
        break
      case 'fire-crackle':
        fillFireCrackle(out, xfade, sampleRate, rand)
        break
      case 'waves-surf':
        // Subtle 0.045 (~0.45s) coastal arrival offset between left and right ears for wide ocean space!
        fillWavesSurf(out, xfade, sampleRate, rand, channel === 0 ? 0 : 0.045)
        break
    }
  }

  fillChannel(0)
  fillChannel(1)
  return buffer
}

const ALL_KINDS: readonly NoiseKind[] = ['pink', 'rain-patter', 'brown', 'fire-crackle', 'waves-surf', 'white']

export function createNoiseBufferBank(ctx: AudioContextLike): NoiseBufferBank {
  const cache: Partial<Record<NoiseKind, AudioBufferLike>> = {}
  let prewarmStarted = false

  const get = (kind: NoiseKind) => {
    let existing = cache[kind]
    if (!existing) {
      existing = createNoiseBuffer(ctx, kind)
      cache[kind] = existing
    }
    return existing
  }

  return {
    get,
    prewarm() {
      if (prewarmStarted) return
      prewarmStarted = true
      let i = 0
      const next = () => {
        if (i >= ALL_KINDS.length) return
        const kind = ALL_KINDS[i++]!
        if (!cache[kind]) {
          try {
            get(kind)
          } catch {
            /* ignore */
          }
        }
        if (i < ALL_KINDS.length) {
          setTimeout(next, 160)
        }
      }
      setTimeout(next, 240)
    },
  }
}
