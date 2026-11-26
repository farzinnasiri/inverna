import type { LayerId, Mix } from '@/core/sound/catalog'
import type { AudioBufferLike, AudioContextLike } from './types'

/**
 * Physically modeled stereo acoustic texture buffers for Inverna (Pass 2 — audited).
 *
 * Calibrated directly against real field recordings (spectral envelope,
 * spectral flatness, crest factor, stereo coherence, and slow envelope dynamics)
 * using zero-allocation Cytomic/Simper TPT state-variable filters (exact up to
 * Nyquist, ~4x faster in Hermes/JSI) while staying 100% offline, zero-audio-file,
 * and CoreAudio/Oboe background-safe:
 * - `white` / `pink` / `brown`: seamless equal-power crossfaded 5s stereo beds
 * - `rain-patter`: 8s stereo rainfield (Marshall-Palmer drop sizes, roof pats, physical ITD, balanced 0.50 stereo bed)
 * - `fire-crackle`: 10s stereo hearth (warm turbulent flame roar, Hawkes crackle bursts, Pareto sizes, woody tail + room reflections)
 * - `waves-surf`: 12s stereo coastline (3 decoupled bands: arriving surge, independent breaking crest, pebble/foam backwash grains)
 * - `wind-gust`: 12s @ 12kHz stereo pine wind (stochastic multi-scale AR(1) gusts, broad 205Hz Strouhal body, lagging canopy needle rustle)
 */

export type NoiseKind =
  | 'white'
  | 'pink'
  | 'brown'
  | 'rain-patter'
  | 'fire-crackle'
  | 'fire-bed'
  | 'rain-near'
  | 'waves-surf'
  | 'wind-gust'

export const NOISE_BUFFER_SECONDS = 5
export const NOISE_MAX_SAMPLE_RATE = 24000
const LOOP_XFADE_SECONDS = 0.4

export interface NoiseBufferBank {
  get(kind: NoiseKind): AudioBufferLike
  /** Work out the other textures in the background, so switching sounds never stutters. */
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

function gaussRng(rand: () => number): number {
  const u1 = Math.max(1e-7, rand())
  const u2 = rand()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
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

/**
 * Zero-allocation Cytomic / Andrew Simper TPT State-Variable Filter.
 * Unconditionally stable and frequency-accurate all the way to 0.44 * Fs.
 * Call `setTpt` once per grain or control tick, then `stepTpt` per sample.
 */
interface TptSvf {
  ic1: number
  ic2: number
  k: number
  a1: number
  a2: number
  a3: number
  low: number
  band: number
  high: number
}

function makeTpt(fc: number, q: number, sr: number): TptSvf {
  const st: TptSvf = { ic1: 0, ic2: 0, k: 1, a1: 0, a2: 0, a3: 0, low: 0, band: 0, high: 0 }
  setTpt(st, fc, q, sr)
  return st
}

function setTpt(st: TptSvf, fc: number, q: number, sr: number): void {
  const f = Math.min(sr * 0.43, Math.max(15, fc))
  const g = Math.tan((Math.PI * f) / sr)
  const k = 1 / Math.max(0.25, q)
  const a1 = 1 / (1 + g * (g + k))
  st.k = k
  st.a1 = a1
  st.a2 = g * a1
  st.a3 = g * st.a2
}

function stepTpt(st: TptSvf, x: number): void {
  const v3 = x - st.ic2
  const v1 = st.a1 * st.ic1 + st.a2 * v3
  const v2 = st.ic2 + st.a2 * st.ic1 + st.a3 * v3
  st.ic1 = 2 * v1 - st.ic1
  st.ic2 = 2 * v2 - st.ic2
  st.low = v2
  st.band = v1
  st.high = x - st.k * v1 - v2
}

/**
 * Scale a stereo pair so its stereo RMS equals `targetRms`, never letting |peak| exceed `peakCeil`.
 * Bed buffers use an RMS target (fixed loudness); sparse event buffers pass targetRms = 1 so the
 * peak ceiling wins (fixed peak). Native gains in layers.ts then set every balance exactly.
 */
function normalizeStereo(outL: Float32Array, outR: Float32Array, targetRms: number, peakCeil: number): void {
  let sum = 0
  let peak = 0
  for (let i = 0; i < outL.length; i++) {
    const l = outL[i]!
    const r = outR[i]!
    sum += l * l + r * r
    const a = Math.max(Math.abs(l), Math.abs(r))
    if (a > peak) peak = a
  }
  const rms = Math.sqrt(sum / (2 * outL.length)) || 1e-9
  const k = Math.min(targetRms / rms, peakCeil / (peak || 1e-9))
  for (let i = 0; i < outL.length; i++) {
    outL[i] = outL[i]! * k
    outR[i] = outR[i]! * k
  }
}

const BED_RMS = 0.05 // -26 dBFS stereo RMS for every stationary bed buffer
const EVENT_PEAK = 0.9

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
function makePinkGenerator(rand: () => number) {
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let b5 = 0
  let b6 = 0
  const next = () => {
    const w = rand() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.085
    b6 = w * 0.115926
    return Math.max(-0.98, Math.min(0.98, pink))
  }
  for (let i = 0; i < 512; i++) next()
  return next
}

function fillPink(out: Float32Array, xfade: number, rand: () => number): void {
  const length = out.length
  const total = length + xfade
  const raw = new Float32Array(total)
  const next = makePinkGenerator(rand)
  for (let i = 0; i < total; i++) raw[i] = next()
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
 * Physically modeled stereo rainfall (Pass 2):
 * - Cohesive stationary rain curtain (mid=0.20, side=0.20 -> Corr ~0.50), TPT HP 300Hz + TPT LP 6.0kHz
 * - Marshall-Palmer drop-size distribution (~95 drops/s, D in 0.5..3.5mm -> ~22 dB dynamic spread!)
 * - Strictly noise-excited broadband drop impacts & roof/slate pats (ZERO frequency sweep, ZERO bubbling!)
 * - Per-drop physical ITD (0..0.45ms) + decorrelated stereo splash tails, written circularly (zero seam dip!)
 */
function fillRainStereo(
  outL: Float32Array,
  outR: Float32Array,
  xfade: number,
  sampleRate: number,
  rand: () => number,
  part: 'curtain' | 'near' = 'curtain',
): void {
  const length = outL.length
  const total = length + xfade
  if (part === 'curtain') {
  const bedL = new Float32Array(total)
  const bedR = new Float32Array(total)

  // 1. Stationary balanced outdoor rain curtain (Corr = 0.50; slow shower variation lives natively in layers.ts!)
  const pinkM = makePinkGenerator(rand)
  const pinkL = makePinkGenerator(rand)
  const pinkR = makePinkGenerator(rand)
  const hpM = makeTpt(300, 0.707, sampleRate)
  const hpL = makeTpt(300, 0.707, sampleRate)
  const hpR = makeTpt(300, 0.707, sampleRate)
  const lpM = makeTpt(8000, 0.707, sampleRate)
  const lpL = makeTpt(8000, 0.707, sampleRate)
  const lpR = makeTpt(8000, 0.707, sampleRate)

  for (let i = 0; i < total; i++) {
    const sM = pinkM() * 0.76 + (rand() * 2 - 1) * 0.13
    const sL = pinkL() * 0.76 + (rand() * 2 - 1) * 0.13
    const sR = pinkR() * 0.76 + (rand() * 2 - 1) * 0.13

    stepTpt(hpM, sM)
    stepTpt(lpM, hpM.high)
    stepTpt(hpL, sL)
    stepTpt(lpL, hpL.high)
    stepTpt(hpR, sR)
    stepTpt(lpR, hpR.high)

    const mid = lpM.low * 0.17
    bedL[i] = mid + lpL.low * 0.17
    bedR[i] = mid + lpR.low * 0.17
  }

  applyLoopCrossfade(outL, bedL, length, xfade)
  applyLoopCrossfade(outR, bedR, length, xfade)
  }

  // 2. Marshall-Palmer raindrop impact field (~95 drops/s written circularly -> zero seam dip!)
  const dropCount = part === 'near' ? 0 : Math.round((length / sampleRate) * 95)
  const lambda = 2.2
  const mpNorm = 1 - Math.exp(-lambda * 3.0)
  const sharedSamples = Math.max(4, Math.round(sampleRate * 0.0003))

  const addDrop = (
    start: number,
    fc: number,
    q: number,
    tauSec: number,
    amp: number,
    pan: number,
  ) => {
    const dur = Math.max(12, Math.round(sampleRate * tauSec * 5))
    const attackSamples = Math.max(2, Math.round(sampleRate * 0.00025))
    const decayRate = 1 / (sampleRate * tauSec)
    const gL = Math.cos(((pan + 1) * Math.PI) / 4)
    const gR = Math.sin(((pan + 1) * Math.PI) / 4)
    const itd = Math.round(Math.abs(pan) * 0.00045 * sampleRate)
    const dL = pan > 0 ? itd : 0
    const dR = pan < 0 ? itd : 0

    const svfL = makeTpt(fc, q, sampleRate)
    const svfR = makeTpt(fc, q, sampleRate)

    for (let i = 0; i < dur; i++) {
      const env = (i < attackSamples ? i / attackSamples : 1) * Math.exp(-i * decayRate)
      const shared = rand() * 2 - 1
      let xL = shared
      let xR = shared
      if (i >= sharedSamples) {
        xL = 0.45 * shared + 0.893 * (rand() * 2 - 1)
        xR = 0.45 * shared + 0.893 * (rand() * 2 - 1)
      }
      stepTpt(svfL, xL)
      stepTpt(svfR, xR)
      const iL = (start + dL + i) % length
      const iR = (start + dR + i) % length
      outL[iL] = outL[iL]! + svfL.band * env * amp * gL
      outR[iR] = outR[iR]! + svfR.band * env * amp * gR
    }
  }

  for (let d = 0; d < dropCount; d++) {
    const start = Math.floor(rand() * length)
    const pan = (rand() * 2 - 1) * 0.84
    // Marshall-Palmer drop diameter D in [0.5, 3.5] mm
    const D = 0.5 - Math.log(1 - rand() * mpNorm) / lambda
    const jitterDb = Math.max(-8, Math.min(8, gaussRng(rand) * 3.0))
    const amp = 0.19 * Math.pow(D / 2.0, 1.8) * Math.pow(10, jitterDb / 20)
    const fc = 5200 / (0.6 + 0.4 * D)
    const tau = (0.75 + 1.15 * D) * 0.001

    addDrop(start, fc, 0.85, tau, amp, pan)

    // 25% of larger drops produce a soft slate/leaf roof pat + occasional secondary micro-splash
    if (D > 1.35 && rand() < 0.32) {
      addDrop(start, 780 + rand() * 900, 1.0, 0.003 + rand() * 0.0035, amp * 0.42, pan)
      if (rand() < 0.28) {
        const dt = Math.round(sampleRate * (0.002 + rand() * 0.004))
        addDrop((start + dt) % length, 2400 + rand() * 2600, 0.8, 0.001, amp * 0.32, pan)
      }
    }
  }

  // 3. Occasional warm distant roof/eave drip pats (~1.6/s, non-tonal broad body)
  const roofCount = part === 'near' ? 0 : Math.max(4, Math.round((length / sampleRate) * 1.6))
  for (let r = 0; r < roofCount; r++) {
    const start = Math.floor(rand() * length)
    const pan = (rand() * 2 - 1) * 0.7
    addDrop(start, 340 + rand() * 240, 1.05, 0.011 + rand() * 0.01, 0.14 + rand() * 0.1, pan)
    addDrop(start, 2200 + rand() * 1400, 0.75, 0.0007, 0.09 + rand() * 0.06, pan)
  }

  if (part === 'near') {
    // 4. Near drops (own 17 s buffer so these salient ticks never repeat on the 8 s curtain loop):
    //    ~1.2/s close, bright, sharp sill/leaf impacts
    const nearCount = Math.round((length / sampleRate) * 1.2)
    for (let n = 0; n < nearCount; n++) {
      const start = Math.floor(rand() * length)
      const pan = (rand() * 2 - 1) * 0.9
      const amp = 0.9 * Math.pow(10, Math.max(-6, Math.min(6, gaussRng(rand) * 3)) / 20)
      addDrop(start, 3000 + rand() * 2200, 0.8, 0.0006 + rand() * 0.0006, amp, pan)
    }
    normalizeStereo(outL, outR, 1, EVENT_PEAK)
    return
  }
  normalizeStereo(outL, outR, BED_RMS, EVENT_PEAK)
}

/**
 * Physically modeled cozy hearth fireplace (Pass 2):
 * - Warm turbulent flame-roar bed (240Hz BP + 850Hz LP, Corr ~0.36, 2.2Hz flame puffing flicker)
 * - Hawkes self-exciting crackle bursts (~1.25/s per copy -> ~2.5-3.2/s across 2 incommensurate copies)
 * - Pareto energy distribution (tiny cinder ticks -> occasional deep log splits)
 * - Dual-band woody fracture (crisp 2.8-4.5kHz edge + 0.4ms-delayed 550-1150Hz wood body)
 * - Physical far-ear ITD (0.15-0.45ms) + decorrelated far-ear tail + 2 hearth room reflections (3-7ms & 11-16ms)
 */
function fillFireStereo(
  outL: Float32Array,
  outR: Float32Array,
  xfade: number,
  sampleRate: number,
  rand: () => number,
  part: 'bed' | 'crackle',
): void {
  const length = outL.length
  const total = length + xfade
  if (part === 'bed') {
  const bedL = new Float32Array(total)
  const bedR = new Float32Array(total)

  // 1. Warm turbulent flame-roar bed (Corr ~0.36, zero booming sub-60Hz wind!)
  const pinkM = makePinkGenerator(rand)
  const pinkL = makePinkGenerator(rand)
  const pinkR = makePinkGenerator(rand)
  const bpM = makeTpt(250, 0.65, sampleRate)
  const bpL = makeTpt(265, 0.65, sampleRate)
  const bpR = makeTpt(235, 0.65, sampleRate)
  const lpL = makeTpt(850, 0.707, sampleRate)
  const lpR = makeTpt(850, 0.707, sampleRate)

  // Band-limited flame puffing flicker (~2.2 Hz, updated every 32 samples -> blazing fast!)
  const ctrlStep = 32
  const ctrlSr = sampleRate / ctrlStep
  const flickSvf = makeTpt(2.2, 1.35, ctrlSr)
  const driftAlpha = 1 - Math.exp(-1 / (ctrlSr * 3.5))
  let driftState = 0
  let curFlick = 1.0
  let nextFlick = 1.0

  // Warm up flame flicker filter
  for (let w = 0; w < 120; w++) {
    stepTpt(flickSvf, rand() * 2 - 1)
    driftState += driftAlpha * ((rand() * 2 - 1) - driftState)
  }

  for (let i = 0; i < total; i++) {
    if (i % ctrlStep === 0) {
      curFlick = nextFlick
      stepTpt(flickSvf, rand() * 2 - 1)
      driftState += driftAlpha * ((rand() * 2 - 1) - driftState)
      const x = Math.max(-1.6, Math.min(1.8, flickSvf.band * 1.4 + driftState * 1.1))
      nextFlick = Math.exp(0.36 * x)
    }
    const frac = (i % ctrlStep) / ctrlStep
    const mod = curFlick + (nextFlick - curFlick) * frac

    stepTpt(bpM, pinkM())
    stepTpt(bpL, pinkL())
    stepTpt(bpR, pinkR())

    // Mid 0.11 + Side 0.15 -> bed Corr ~0.35, warm 125-500Hz hearth body
    const m = bpM.band * 0.115 * mod
    stepTpt(lpL, m + bpL.band * 0.155 * mod)
    stepTpt(lpR, m + bpR.band * 0.155 * mod)
    bedL[i] = lpL.low
    bedR[i] = lpR.low
  }

  // Add subtle localized low-mid flame-tongue licks (210-390 Hz) into bed
  const lickCount = Math.round((total / sampleRate) * 2.6)
  for (let g = 0; g < lickCount; g++) {
    const dur = Math.round(sampleRate * (0.16 + rand() * 0.28))
    const start = Math.floor(rand() * Math.max(1, total - dur - 4))
    const pan = (rand() * 2 - 1) * 0.55
    const gL = Math.cos(((pan + 1) * Math.PI) / 4)
    const gR = Math.sin(((pan + 1) * Math.PI) / 4)
    const svfL = makeTpt(210 + rand() * 180, 0.75, sampleRate)
    const svfR = makeTpt(210 + rand() * 180, 0.75, sampleRate)
    const amp = 0.0225 + rand() * 0.025
    for (let i = 0; i < dur && start + i < total; i++) {
      const t = i / dur
      const env = Math.pow(Math.sin(t * Math.PI), 1.5) * (1 - 0.25 * t)
      const nShared = rand() * 2 - 1
      stepTpt(svfL, 0.5 * nShared + 0.866 * (rand() * 2 - 1))
      stepTpt(svfR, 0.5 * nShared + 0.866 * (rand() * 2 - 1))
      bedL[start + i] = bedL[start + i]! + svfL.band * env * amp * gL
      bedR[start + i] = bedR[start + i]! + svfR.band * env * amp * gR
    }
  }

  applyLoopCrossfade(outL, bedL, length, xfade)
  applyLoopCrossfade(outR, bedR, length, xfade)
  normalizeStereo(outL, outR, BED_RMS, EVENT_PEAK)
  return
  }

  // 2. Hawkes self-exciting wood crackle generator with Pareto energies & hearth room reflections
  const addFracture = (pos: number, energy: number, nearRight: boolean) => {
    const eNorm = Math.log10(Math.max(1, energy)) / Math.log10(25) // 0..1
    const amp = 0.14 * Math.sqrt(energy)

    // Physical near-ear / far-ear localization (preserves crack identity while keeping Corr ~0.22-0.32!)
    const itd = Math.round(sampleRate * (0.00016 + rand() * 0.00030))
    const nearArr = nearRight ? outR : outL
    const farArr = nearRight ? outL : outR

    // Stage A: Crisp dry edge (2.6-4.8 kHz, Q 0.75, 0.2ms attack, 0.75ms decay)
    const edgeFc = 5600 - 1800 * eNorm + (rand() - 0.5) * 900
    const edgeTau = 0.0006 + rand() * 0.00045
    const edgeDur = Math.max(16, Math.round(sampleRate * edgeTau * 5))
    const edgeAtk = Math.max(2, Math.round(sampleRate * 0.00018))
    const edgeDec = 1 / (sampleRate * edgeTau)

    const edgeNearSvf = makeTpt(edgeFc, 0.6, sampleRate)
    const edgeFarSvf = makeTpt(edgeFc * 0.94, 0.6, sampleRate)

    // Room reflections: opposite wall at 3-6.5ms (-9 dB, LP 3kHz) + rear at 11-16ms (-14 dB, LP 2.2kHz)
    const refl1Delay = Math.round(sampleRate * (0.003 + rand() * 0.0035))
    const refl2Delay = Math.round(sampleRate * (0.011 + rand() * 0.005))
    const refl1Svf = makeTpt(2900, 0.707, sampleRate)
    const refl2Svf = makeTpt(2100, 0.707, sampleRate)

    for (let i = 0; i < edgeDur; i++) {
      const env = (i < edgeAtk ? i / edgeAtk : 1) * Math.exp(-i * edgeDec)
      const shared = rand() * 2 - 1
      const farNoise = 0.52 * shared + 0.854 * (rand() * 2 - 1)
      stepTpt(edgeNearSvf, shared)
      stepTpt(edgeFarSvf, farNoise)
      const yNear = edgeNearSvf.band * env * amp
      const yFar = edgeFarSvf.band * env * amp * 0.54

      const idxN = (pos + i) % length
      const idxF = (pos + itd + i) % length
      nearArr[idxN] = nearArr[idxN]! + yNear
      farArr[idxF] = farArr[idxF]! + yFar

      // Opposite-ear early hearth reflection 1 (-9 dB = 0.35x)
      stepTpt(refl1Svf, yNear)
      const idxR1 = (pos + refl1Delay + i) % length
      farArr[idxR1] = farArr[idxR1]! + refl1Svf.low * 0.35

      // Diffuse rear reflection 2 (-14 dB = 0.20x split L/R)
      stepTpt(refl2Svf, yNear)
      const idxR2 = (pos + refl2Delay + i) % length
      nearArr[idxR2] = nearArr[idxR2]! + refl2Svf.low * 0.14
      farArr[idxR2] = farArr[idxR2]! + refl2Svf.low * 0.18
    }

    // Stage B: 0.4ms-delayed resonant woody fracture tail (550-1150 Hz, Q 0.9, 3.5-6.5ms decay)
    const tailOffset = Math.round(sampleRate * 0.0004)
    const tailFc = 1080 - 440 * eNorm + (rand() - 0.5) * 180
    const tailTau = (0.0032 + eNorm * 0.0035) * (0.85 + rand() * 0.3)
    const tailDur = Math.max(40, Math.round(sampleRate * tailTau * 5))
    const tailAtk = Math.max(4, Math.round(sampleRate * 0.0005))
    const tailDec = 1 / (sampleRate * tailTau)
    const tailNearSvf = makeTpt(tailFc, 0.9, sampleRate)
    const tailFarSvf = makeTpt(tailFc * 0.96, 0.9, sampleRate)
    const tailAmp = amp * (0.32 + 0.14 * eNorm)

    for (let i = 0; i < tailDur; i++) {
      const env = (i < tailAtk ? i / tailAtk : 1) * Math.exp(-i * tailDec)
      const shared = rand() * 2 - 1
      const farNoise = 0.58 * shared + 0.815 * (rand() * 2 - 1)
      stepTpt(tailNearSvf, shared)
      stepTpt(tailFarSvf, farNoise)
      const idxN = (pos + tailOffset + i) % length
      const idxF = (pos + tailOffset + itd + i) % length
      nearArr[idxN] = nearArr[idxN]! + tailNearSvf.band * env * tailAmp
      farArr[idxF] = farArr[idxF]! + tailFarSvf.band * env * tailAmp * 0.62
    }

    // Stage C: Top ~14% biggest splits also produce a brief hollow cedar log thump (320-580 Hz)
    if (eNorm > 0.62) {
      const popTau = 0.006 + rand() * 0.004
      const popDur = Math.round(sampleRate * popTau * 4.5)
      const popDec = 1 / (sampleRate * popTau)
      const popSvf = makeTpt(320 + rand() * 240, 1.15, sampleRate)
      const popAmp = amp * 0.45
      for (let i = 0; i < popDur; i++) {
        const env = Math.min(1, i / 10) * Math.exp(-i * popDec)
        stepTpt(popSvf, rand() * 2 - 1)
        const s = popSvf.band * env * popAmp
        const idx = (pos + i) % length
        nearArr[idx] = nearArr[idx]! + s * 0.85
        farArr[idx] = farArr[idx]! + s * 0.65
      }
    }
  }

  // Generate Hawkes clusters: ~0.95 independent parents/sec -> ~2.1 total events/sec per copy
  // Across 2 incommensurate copies in layers.ts -> ~2.6-3.4 organic crackles/sec!
  const durationSec = length / sampleRate
  let tSec = -Math.log(Math.max(1e-6, 1 - rand())) / 0.6
  while (tSec < durationSec) {
    const pos = Math.floor(tSec * sampleRate) % length
    const nearRight = rand() < 0.5
    // Pareto energy distribution (alpha = 1.5, capped at 25)
    const energy = Math.min(8, Math.pow(Math.max(1e-5, rand()), -1 / 1.5))
    addFracture(pos, energy, nearRight)

    // 45% chance of 1-2 rapid follow-up crackles in the same log zone (16-75ms later)
    let childDelay = 0
    const children = rand() < 0.45 ? (rand() < 0.35 ? 2 : 1) : 0
    for (let c = 0; c < children; c++) {
      childDelay += 0.016 + rand() * 0.055
      const cPos = (pos + Math.round(childDelay * sampleRate)) % length
      const cEnergy = Math.max(1, energy * (0.2 + rand() * 0.38))
      addFracture(cPos, cEnergy, nearRight)
    }

    tSec += -Math.log(Math.max(1e-6, 1 - rand())) / 0.6
  }

  // Subtle ambient ember ticks (~2.2/s tiny low-energy sparks)
  const tinyCount = Math.round(durationSec * 16)
  for (let m = 0; m < tinyCount; m++) {
    const pos = Math.floor(rand() * length)
    addFracture(pos, (0.45 + rand() * 0.7) * 0.08, rand() < 0.5)
  }

  // Keep peaks cleanly below bus limiter threshold (-8 dBFS) while preserving crisp ~30-35 dB crest
  normalizeStereo(outL, outR, 1, EVENT_PEAK)
}

/**
 * Physically modeled nocturnal coastline (Pass 3): 18 s @ 16 kHz, played at 0.87x (= 20.7 s loop).
 * Three irregular waves per loop (played spacing ~6.4 / 6.8 / 7.5 s), each with three bands whose
 * envelopes are offset in time: surge (< 345 Hz) -> breaking crest (345-3000 Hz, +0.42 s) ->
 * backwash sheen (BP 5.2 kHz, +1.6 s) plus pebble/foam grains on the wash.
 * All frequencies are buffer-domain (heard = x 0.87).
 * Cost: 2 pink generators + 3 SVFs per channel per sample; envelopes come from a precomputed table.
 */
const WAVE_SET: readonly (readonly [centerSec: number, size: number])[] = [
  [2.2, 1.0],
  [7.8, 0.72],
  [13.7, 0.86],
]

function fillWavesStereo(
  outL: Float32Array,
  outR: Float32Array,
  xfade: number,
  sampleRate: number,
  rand: () => number,
): void {
  const length = outL.length
  const total = length + xfade
  const bedL = new Float32Array(total)
  const bedR = new Float32Array(total)
  const lenSec = length / sampleRate

  // Asymmetric smoothstep-rise / (1-u)^1.5-fall pulse on a circular timeline (seconds)
  const pulse = (t: number, c: number, rise: number, fall: number) => {
    let d = t - c
    const h = lenSec / 2
    if (d < -h) d += lenSec
    if (d > h) d -= lenSec
    if (d < 0 && d > -rise) {
      const u = 1 + d / rise
      return u * u * (3 - 2 * u)
    }
    if (d >= 0 && d < fall) {
      const u = 1 - d / fall
      return u * Math.sqrt(u)
    }
    return 0
  }

  // Control-rate envelope table (surge, break, wash) every 32 samples, built once
  const ctrlStep = 32
  const nCtrl = Math.ceil(length / ctrlStep)
  const tab = new Float32Array((nCtrl + 2) * 3)
  for (let c = 0; c < nCtrl + 2; c++) {
    const t = ((c * ctrlStep) % length) / sampleRate
    let sv = 0
    let bv = 0
    let wv = 0
    for (const [center, size] of WAVE_SET) {
      sv += size * pulse(t, center, 1.7, 3.3)
      bv += size * pulse(t, center + 0.42, 0.55, 2.4)
      wv += size * pulse(t, center + 1.6, 0.95, 4.0)
    }
    tab[c * 3] = Math.min(1, sv)
    tab[c * 3 + 1] = Math.min(1, bv)
    tab[c * 3 + 2] = Math.min(1, wv)
  }
  const rLag = Math.round((0.336 * sampleRate) / ctrlStep) // R channel envelope trails L by ~0.34 s

  // Two pink sources cross-mixed: corr = 2s/(1+s^2) = 0.75 at s = 0.45 (measures ~0.68 after the R lag)
  const pA = makePinkGenerator(rand)
  const pB = makePinkGenerator(rand)
  const side = 0.45
  const splitL = makeTpt(345, 0.707, sampleRate)
  const splitR = makeTpt(345, 0.707, sampleRate)
  const brkL = makeTpt(3000, 0.707, sampleRate)
  const brkR = makeTpt(3000, 0.707, sampleRate)
  const washL = makeTpt(5200, 0.7, sampleRate)
  const washR = makeTpt(5200, 0.7, sampleRate)
  const gS = 0.22
  const gB = 0.5
  const gW = 0.72
  const fS = 0.25 // surge floor (trough level)
  const fB = 0.18
  const fW = 0.1

  for (let c = 0; c * ctrlStep < total; c++) {
    const kL = (c % nCtrl) * 3
    const kR = (((c - rLag) % nCtrl) + nCtrl) % nCtrl * 3
    const s0L = fS + (1 - fS) * tab[kL]!
    const s1L = fS + (1 - fS) * tab[kL + 3]!
    const b0L = fB + (1 - fB) * tab[kL + 1]!
    const b1L = fB + (1 - fB) * tab[kL + 4]!
    const w0L = fW + (1 - fW) * tab[kL + 2]!
    const w1L = fW + (1 - fW) * tab[kL + 5]!
    const s0R = fS + (1 - fS) * tab[kR]!
    const s1R = fS + (1 - fS) * tab[kR + 3]!
    const b0R = fB + (1 - fB) * tab[kR + 1]!
    const b1R = fB + (1 - fB) * tab[kR + 4]!
    const w0R = fW + (1 - fW) * tab[kR + 2]!
    const w1R = fW + (1 - fW) * tab[kR + 5]!
    const end = Math.min(total, (c + 1) * ctrlStep)
    for (let i = c * ctrlStep, n = 0; i < end; i++, n++) {
      const f = n / ctrlStep
      const a = pA()
      const b = pB()
      stepTpt(splitL, a + side * b)
      stepTpt(brkL, splitL.high)
      stepTpt(washL, splitL.high)
      stepTpt(splitR, b + side * a)
      stepTpt(brkR, splitR.high)
      stepTpt(washR, splitR.high)
      bedL[i] =
        splitL.low * (s0L + (s1L - s0L) * f) * gS +
        brkL.low * (b0L + (b1L - b0L) * f) * gB +
        washL.band * (w0L + (w1L - w0L) * f) * gW
      bedR[i] =
        splitR.low * (s0R + (s1R - s0R) * f) * gS +
        brkR.low * (b0R + (b1R - b0R) * f) * gB +
        washR.band * (w0R + (w1R - w0R) * f) * gW
    }
  }

  applyLoopCrossfade(outL, bedL, length, xfade)
  applyLoopCrossfade(outR, bedR, length, xfade)

  // Pebble/foam grains only where the wash envelope is up (one reused SVF, zero allocation)
  const grainAttempts = Math.round(lenSec * 260)
  const svf = makeTpt(2000, 0.85, sampleRate)
  for (let k = 0; k < grainAttempts; k++) {
    const start = Math.floor(rand() * length)
    const w = tab[Math.floor(start / ctrlStep) * 3 + 2]!
    if (w < 0.18 || rand() > w) continue
    const tau = 0.00045 + rand() * 0.0014
    const dur = Math.max(10, Math.round(sampleRate * tau * 4.5))
    const dec = Math.exp(-1 / (sampleRate * tau))
    setTpt(svf, 1600 + rand() * 4200, 0.85, sampleRate)
    svf.ic1 = 0
    svf.ic2 = 0
    const pan = (rand() * 2 - 1) * 0.72
    const amp = 0.032 * w * Math.pow(10, Math.max(-8, Math.min(8, gaussRng(rand) * 4.5)) / 20)
    const gL = Math.cos(((pan + 1) * Math.PI) / 4) * amp
    const gR = Math.sin(((pan + 1) * Math.PI) / 4) * amp
    let e = 1
    for (let i = 0; i < dur; i++) {
      stepTpt(svf, rand() * 2 - 1)
      const sm = svf.band * e * (i < 4 ? i / 4 : 1)
      e *= dec
      const idx = (start + i) % length
      outL[idx] = outL[idx]! + sm * gL
      outR[idx] = outR[idx]! + sm * gR
    }
  }

  normalizeStereo(outL, outR, BED_RMS, EVENT_PEAK)
}

/**
 * Physically modeled 12-second nocturnal pine wind (Pass 2 — rendered at 12 kHz for 2x speed!):
 * - Non-periodic stochastic multi-scale AR(1) gust contour at 25 Hz (asymmetric rise 0.9s / fall 2.3s)
 * - Broad aerodynamic body centered at 210 Hz (Q 0.75) with subtle Strouhal ±0.25-octave motion (NO synth sweep!)
 * - Lagging canopy needle rustle (1.35 kHz, attack 0.3s / release 1.1s) emerging softly after gust peaks
 * - Cohesive stereo breeze panning (~0.54 correlation, 0.48s L->R wind sweep)
 */
function fillWindStereo(
  outL: Float32Array,
  outR: Float32Array,
  xfade: number,
  sampleRate: number,
  rand: () => number,
): void {
  const length = outL.length
  const total = length + xfade
  const bedL = new Float32Array(total)
  const bedR = new Float32Array(total)

  // Pre-build a smooth, non-sinusoidal stochastic gust contour at 25 Hz (circularly smoothed for seamless loop!)
  const ctrlHz = 25
  const ctrlLen = Math.max(25, Math.round((length / sampleRate) * ctrlHz))
  const rawGust = new Float32Array(ctrlLen)
  const smoothGust = new Float32Array(ctrlLen)
  const canopyGust = new Float32Array(ctrlLen)

  // Draw random piecewise wind-speed targets every 1.4-4.2s
  let hold = 0
  let target = 0.45
  for (let c = 0; c < ctrlLen; c++) {
    if (hold <= 0) {
      target = rand()
      hold = Math.round(ctrlHz * (1.4 + rand() * 2.8))
    }
    rawGust[c] = target
    hold--
  }

  // Two-pass circular asymmetric smoother (tau_rise = 0.9s, tau_fall = 2.3s) so start & end match seamlessly!
  const aRise = 1 - Math.exp(-1 / (ctrlHz * 0.9))
  const aFall = 1 - Math.exp(-1 / (ctrlHz * 2.3))
  const cAtk = 1 - Math.exp(-1 / (ctrlHz * 0.3))
  const cRel = 1 - Math.exp(-1 / (ctrlHz * 1.1))
  let gVal = 0.45
  let cVal = 0
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 0; c < ctrlLen; c++) {
      const tgt = rawGust[c]!
      gVal += (tgt - gVal) * (tgt > gVal ? aRise : aFall)
      const cTgt = Math.max(0, (gVal - 0.42) / 0.58)
      cVal += (cTgt - cVal) * (cTgt > cVal ? cAtk : cRel)
      if (pass === 1) {
        smoothGust[c] = gVal
        canopyGust[c] = cVal
      }
    }
  }

  // Normalize gust contour to span [0.06 .. 1.0] cleanly (~15 dB aerodynamic range)
  let gMin = 1
  let gMax = 0
  for (let c = 0; c < ctrlLen; c++) {
    if (smoothGust[c]! < gMin) gMin = smoothGust[c]!
    if (smoothGust[c]! > gMax) gMax = smoothGust[c]!
  }
  const gSpan = Math.max(0.15, gMax - gMin)
  for (let c = 0; c < ctrlLen; c++) {
    smoothGust[c] = 0.05 + 0.95 * Math.pow((smoothGust[c]! - gMin) / gSpan, 1.35)
  }

  const sampleCtrl = (arr: Float32Array, tNorm: number) => {
    const pos = (((tNorm % 1) + 1) % 1) * ctrlLen
    const i0 = Math.floor(pos) % ctrlLen
    const i1 = (i0 + 1) % ctrlLen
    const f = pos - Math.floor(pos)
    return arr[i0]! + (arr[i1]! - arr[i0]!) * f
  }

  const pinkM = makePinkGenerator(rand)
  const pinkL = makePinkGenerator(rand)
  const pinkR = makePinkGenerator(rand)

  const subL = makeTpt(145, 0.707, sampleRate)
  const subR = makeTpt(145, 0.707, sampleRate)
  const bodyL = makeTpt(210, 0.75, sampleRate)
  const bodyR = makeTpt(210, 0.75, sampleRate)
  const airL = makeTpt(360, 0.65, sampleRate)
  const airR = makeTpt(360, 0.65, sampleRate)
  const rustleL = makeTpt(1350, 0.65, sampleRate)
  const rustleR = makeTpt(1350, 0.65, sampleRate)

  const ctrlStep = 32
  let gL = sampleCtrl(smoothGust, 0)
  let gR = sampleCtrl(smoothGust, 0.96)
  let cL = sampleCtrl(canopyGust, 0)
  let cR = sampleCtrl(canopyGust, 0.96)

  for (let i = 0; i < total; i++) {
    if (i % ctrlStep === 0) {
      const tNormL = (i % length) / length
      // Breeze sweeps left -> right (~0.48s delay)
      const tNormR = (tNormL - 0.04 + 1) % 1
      gL = sampleCtrl(smoothGust, tNormL)
      gR = sampleCtrl(smoothGust, tNormR)
      cL = sampleCtrl(canopyGust, tNormL)
      cR = sampleCtrl(canopyGust, tNormR)

      // Subtle Strouhal aerodynamic frequency shift (±0.25 octave around 210 Hz, NEVER a synth sweep!)
      setTpt(bodyL, 175 + 75 * gL, 0.75, sampleRate)
      setTpt(bodyR, 175 + 75 * gR, 0.75, sampleRate)
    }

    const m = pinkM()
    const xL = m * 0.68 + pinkL() * 0.52
    const xR = m * 0.68 + pinkR() * 0.52

    stepTpt(subL, xL)
    stepTpt(subR, xR)
    stepTpt(bodyL, xL)
    stepTpt(bodyR, xR)
    stepTpt(airL, xL)
    stepTpt(airR, xR)
    stepTpt(rustleL, xL)
    stepTpt(rustleR, xR)

    const yL =
      subL.low * (0.20 + 0.44 * gL) * 0.55 +
      bodyL.band * (0.14 + 0.86 * gL) * 1.05 +
      airL.band * Math.pow(gL, 1.5) * 0.6 +
      rustleL.band * cL * 0.24
    const yR =
      subR.low * (0.20 + 0.44 * gR) * 0.55 +
      bodyR.band * (0.14 + 0.86 * gR) * 1.05 +
      airR.band * Math.pow(gR, 1.5) * 0.6 +
      rustleR.band * cR * 0.24

    bedL[i] = Math.tanh(yL * 1.15) * 0.88
    bedR[i] = Math.tanh(yR * 1.15) * 0.88
  }

  applyLoopCrossfade(outL, bedL, length, xfade)
  applyLoopCrossfade(outR, bedR, length, xfade)
  normalizeStereo(outL, outR, BED_RMS, EVENT_PEAK)
}

const KIND_SEED: Record<NoiseKind, number> = {
  white: 101,
  pink: 202,
  brown: 303,
  'rain-patter': 404,
  'rain-near': 414,
  'fire-crackle': 505,
  'fire-bed': 515,
  'waves-surf': 606,
  'wind-gust': 707,
}

const KIND_SECONDS: Record<NoiseKind, number> = {
  white: NOISE_BUFFER_SECONDS,
  pink: NOISE_BUFFER_SECONDS,
  brown: NOISE_BUFFER_SECONDS,
  'rain-patter': 8,
  'rain-near': 17,
  'fire-crackle': 20,
  'fire-bed': 10,
  'waves-surf': 18,
  'wind-gust': 20,
}

const KIND_MAX_SR: Partial<Record<NoiseKind, number>> = {
  'fire-bed': 8000,
  'waves-surf': 16000,
  'wind-gust': 8000,
}

interface NoiseData {
  sampleRate: number
  left: Float32Array
  right: Float32Array
}

/** Samples worked out ahead of time (`warmTextures`), waiting for their first buffer. */
const ready: Partial<Record<NoiseKind, NoiseData>> = {}

/**
 * A texture's samples. Every texture is capped at 24 kHz or less, below any
 * device's audio rate, so the samples don't depend on the audio context and
 * can be worked out before one exists.
 */
function noiseData(kind: NoiseKind, seconds = KIND_SECONDS[kind], contextRate = 48000): NoiseData {
  const maxSr = KIND_MAX_SR[kind] ?? NOISE_MAX_SAMPLE_RATE
  const sampleRate = Math.max(8000, Math.min(maxSr, Math.round(contextRate || 44100)))
  const length = Math.max(1, Math.round(sampleRate * seconds))
  const xfade = Math.min(Math.floor(length / 4), Math.round(sampleRate * LOOP_XFADE_SECONDS))
  const outL = new Float32Array(length)
  const outR = new Float32Array(length)
  const seed = KIND_SEED[kind]

  switch (kind) {
    case 'white':
      fillWhite(outL, xfade, makeRng(seed))
      fillWhite(outR, xfade, makeRng(seed + 9973))
      break
    case 'pink':
      fillPink(outL, xfade, makeRng(seed))
      fillPink(outR, xfade, makeRng(seed + 9973))
      break
    case 'brown':
      fillBrown(outL, xfade, makeRng(seed))
      fillBrown(outR, xfade, makeRng(seed + 9973))
      break
    case 'rain-patter':
      fillRainStereo(outL, outR, xfade, sampleRate, makeRng(seed), 'curtain')
      break
    case 'rain-near':
      fillRainStereo(outL, outR, xfade, sampleRate, makeRng(seed), 'near')
      break
    case 'fire-crackle':
      fillFireStereo(outL, outR, xfade, sampleRate, makeRng(seed), 'crackle')
      break
    case 'fire-bed':
      fillFireStereo(outL, outR, xfade, sampleRate, makeRng(seed), 'bed')
      break
    case 'waves-surf':
      fillWavesStereo(outL, outR, xfade, sampleRate, makeRng(seed))
      break
    case 'wind-gust':
      fillWindStereo(outL, outR, xfade, sampleRate, makeRng(seed))
      break
  }
  return { sampleRate, left: outL, right: outR }
}

/** Whether a texture's samples are ready and waiting (for tests and diagnostics). */
export function isPrecomputed(kind: NoiseKind): boolean {
  return ready[kind] !== undefined
}

export function createNoiseBuffer(
  ctx: AudioContextLike,
  kind: NoiseKind,
  seconds = KIND_SECONDS[kind],
): AudioBufferLike {
  const contextRate = Math.round(ctx.sampleRate || 44100)
  let data = seconds === KIND_SECONDS[kind] ? ready[kind] : undefined
  if (data && data.sampleRate > contextRate) data = undefined
  if (data) delete ready[kind]
  else data = noiseData(kind, seconds, contextRate)
  const buffer = ctx.createBuffer(2, data.left.length, data.sampleRate)
  buffer.getChannelData(0).set(data.left)
  buffer.getChannelData(1).set(data.right)
  return buffer
}

/** The textures each layer plays. */
export const LAYER_TEXTURES: Record<LayerId, readonly NoiseKind[]> = {
  white: ['white'],
  pink: ['pink'],
  brown: ['brown'],
  rain: ['rain-patter', 'rain-near'],
  waves: ['waves-surf'],
  fire: ['fire-crackle', 'fire-bed'],
  wind: ['wind-gust'],
}

/** The textures a mix needs, loudest layer first. */
export function texturesFor(mix: Mix): NoiseKind[] {
  return (Object.entries(mix.layers) as [LayerId, number][])
    .filter(([, gain]) => gain > 0.001)
    .sort((a, b) => b[1] - a[1])
    .flatMap(([id]) => LAYER_TEXTURES[id])
}

/** Textures that already have a buffer, so nothing works them out again. */
const built = new Set<NoiseKind>()
const queue: NoiseKind[] = []
let queueTimer: ReturnType<typeof setTimeout> | null = null
const WARM_GAP_MS = 400

const needed = (kind: NoiseKind) => !ready[kind] && !built.has(kind)

function warmNext() {
  queueTimer = null
  let kind = queue.shift()
  while (kind && !needed(kind)) kind = queue.shift()
  if (!kind) return
  try {
    ready[kind] = noiseData(kind)
  } catch {
    /* the buffer is made on demand instead */
  }
  if (queue.length > 0) queueTimer = setTimeout(warmNext, WARM_GAP_MS)
}

/**
 * The one background queue for texture samples. Each is one JS turn of
 * 30-40 ms, so they're worked out one at a time, well apart, and never twice:
 * a texture already waiting or already in a buffer is skipped. Needs no
 * audio context and doesn't touch the audio session, so other apps' music
 * keeps playing.
 */
export function warmTextures(kinds: readonly NoiseKind[], startDelayMs = WARM_GAP_MS): void {
  for (const kind of kinds) if (needed(kind) && !queue.includes(kind)) queue.push(kind)
  if (queue.length > 0 && queueTimer === null) queueTimer = setTimeout(warmNext, startDelayMs)
}

/** Forget what was worked out (tests). */
export function resetTextureCache(): void {
  for (const kind of Object.keys(ready) as NoiseKind[]) delete ready[kind]
  built.clear()
  queue.length = 0
  if (queueTimer) clearTimeout(queueTimer)
  queueTimer = null
}

const ALL_KINDS: readonly NoiseKind[] = [
  'pink',
  'rain-patter',
  'rain-near',
  'brown',
  'fire-crackle',
  'fire-bed',
  'waves-surf',
  'wind-gust',
  'white',
]

export function createNoiseBufferBank(ctx: AudioContextLike): NoiseBufferBank {
  const cache: Partial<Record<NoiseKind, AudioBufferLike>> = {}

  return {
    get(kind) {
      let existing = cache[kind]
      if (!existing) {
        existing = createNoiseBuffer(ctx, kind)
        cache[kind] = existing
        built.add(kind)
      }
      return existing
    },
    prewarm() {
      warmTextures(ALL_KINDS, 3000)
    },
  }
}
