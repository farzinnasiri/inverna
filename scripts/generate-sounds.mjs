/**
 * Zero-dependency procedural WAV synthesizer for native iOS/Android `expo-audio`.
 * Generates seamless equal-power crossfaded 8s stereo loops for all 7 ambient
 * layers, 3 stereo binaural bands (Delta 2Hz, Theta 5Hz, Alpha 10Hz), and
 * 5 warm Watchmaker game feedback cues into assets/sounds/.
 *
 * Web continues to use the live Web Audio API synth in src/platform/web/sound/.
 */
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve('assets/sounds')
fs.mkdirSync(OUT, { recursive: true })

const SR = 22050 // warm, compact, zero harshness above 11kHz

function createRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function writeWav(filename, left, right) {
  const channels = right ? 2 : 1
  const n = left.length
  const bytesPerSample = 2
  const dataSize = n * channels * bytesPerSample
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(channels, 22)
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * channels * bytesPerSample, 28)
  buf.writeUInt16LE(channels * bytesPerSample, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)

  let offset = 44
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, left[i]))
    buf.writeInt16LE(Math.round(l * 32767), offset)
    offset += 2
    if (right) {
      const r = Math.max(-1, Math.min(1, right[i]))
      buf.writeInt16LE(Math.round(r * 32767), offset)
      offset += 2
    }
  }
  fs.writeFileSync(path.join(OUT, filename), buf)
}

/** Seamless equal-power loop crossfade over the tail into the head. */
function makeSeamless(samples, fadeSamples = Math.floor(SR * 0.4)) {
  const n = samples.length - fadeSamples
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = samples[i]
  for (let i = 0; i < fadeSamples; i++) {
    const t = i / fadeSamples
    const a = Math.sin(t * Math.PI * 0.5)
    const b = Math.cos(t * Math.PI * 0.5)
    out[i] = samples[i] * a + samples[n + i] * b
  }
  return out
}

function lowpass(input, cutoffHz) {
  const rc = 1 / (2 * Math.PI * cutoffHz)
  const dt = 1 / SR
  const alpha = dt / (rc + dt)
  const out = new Float32Array(input.length)
  let prev = 0
  for (let i = 0; i < input.length; i++) {
    prev += alpha * (input[i] - prev)
    out[i] = prev
  }
  return out
}

function genWhite(len, rng) {
  const out = new Float32Array(len)
  for (let i = 0; i < len; i++) out[i] = (rng() * 2 - 1) * 0.28
  return lowpass(out, 4800)
}

function genPink(len, rng) {
  const out = new Float32Array(len)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < len; i++) {
    const w = rng() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.065
    b6 = w * 0.115926
  }
  return lowpass(out, 3600)
}

function genBrown(len, rng) {
  const out = new Float32Array(len)
  let last = 0
  for (let i = 0; i < len; i++) {
    const w = rng() * 2 - 1
    last = (last + 0.025 * w) / 1.015
    out[i] = last * 2.2
  }
  return lowpass(out, 320)
}

const LOOP_SEC = 8
const FADE = Math.floor(SR * 0.45)
const RAW_LEN = SR * LOOP_SEC + FADE

// 1. White, Pink, Brown
for (const [name, fn, seed] of [
  ['white.wav', genWhite, 11],
  ['pink.wav', genPink, 22],
  ['brown.wav', genBrown, 33],
]) {
  const l = makeSeamless(fn(RAW_LEN, createRng(seed)), FADE)
  const r = makeSeamless(fn(RAW_LEN, createRng(seed + 100)), FADE)
  writeWav(name, l, r)
}

// 2. Rain (filtered pink + soft droplets)
{
  const makeRain = (seed) => {
    const rng = createRng(seed)
    const bed = lowpass(genPink(RAW_LEN, rng), 2400)
    for (let d = 0; d < 90; d++) {
      const start = Math.floor(rng() * (RAW_LEN - 800))
      const freq = 900 + rng() * 1400
      const amp = 0.03 + rng() * 0.04
      for (let i = 0; i < 600; i++) {
        const env = Math.exp(-i / 120) * Math.min(1, i / 14)
        bed[start + i] += Math.sin((2 * Math.PI * freq * i) / SR) * env * amp
      }
    }
    return makeSeamless(bed, FADE)
  }
  writeWav('rain.wav', makeRain(44), makeRain(144))
}

// 3. Waves (slow 8s breathing surf)
{
  const makeWaves = (seed, phase) => {
    const base = lowpass(genPink(RAW_LEN, createRng(seed)), 700)
    const n = SR * LOOP_SEC
    const out = makeSeamless(base, FADE)
    for (let i = 0; i < n; i++) {
      const env = 0.32 + 0.68 * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n + phase))
      out[i] *= env * 1.15
    }
    return out
  }
  writeWav('waves.wav', makeWaves(55, 0), makeWaves(155, 0.35))
}

// 4. Fire (hearth rumble + gentle soft crackles)
{
  const makeFire = (seed) => {
    const rng = createRng(seed)
    const bed = lowpass(genBrown(RAW_LEN, rng), 180)
    for (let c = 0; c < 26; c++) {
      const start = Math.floor(rng() * (RAW_LEN - 400))
      const amp = 0.06 + rng() * 0.08
      for (let i = 0; i < 240; i++) {
        const env = Math.exp(-i / 35)
        bed[start + i] += (rng() * 2 - 1) * env * amp
      }
    }
    return makeSeamless(bed, FADE)
  }
  writeWav('fire.wav', makeFire(66), makeFire(166))
}

// 5. Wind (gentle drifting swell)
{
  const makeWind = (seed, phase) => {
    const base = lowpass(genPink(RAW_LEN, createRng(seed)), 540)
    const out = makeSeamless(base, FADE)
    const n = out.length
    for (let i = 0; i < n; i++) {
      const env = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((2 * Math.PI * i) / n + phase))
      out[i] *= env
    }
    return out
  }
  writeWav('wind.wav', makeWind(77, 0), makeWind(177, 0.7))
}

// 6. True Stereo Binaural Beats (integer cycles over 4s for 100% seamless loop!)
const BIN_SEC = 4
const BIN_N = SR * BIN_SEC
for (const [name, carrier, beat] of [
  ['binaural-delta.wav', 140, 2],
  ['binaural-theta.wav', 160, 5],
  ['binaural-alpha.wav', 180, 10],
]) {
  const l = new Float32Array(BIN_N)
  const r = new Float32Array(BIN_N)
  for (let i = 0; i < BIN_N; i++) {
    const t = i / SR
    l[i] = Math.sin(2 * Math.PI * carrier * t) * 0.14
    r[i] = Math.sin(2 * Math.PI * (carrier + beat) * t) * 0.14
  }
  writeWav(name, l, r)
}

// 7. Warm Game Cues
function synthCue(notes, durSec) {
  const n = Math.floor(SR * durSec)
  const out = new Float32Array(n)
  for (const { freq, delay, amp, decay } of notes) {
    const start = Math.floor(delay * SR)
    for (let i = start; i < n; i++) {
      const t = (i - start) / SR
      const env = Math.min(1, t / 0.008) * Math.exp(-t / decay)
      out[i] += (Math.sin(2 * Math.PI * freq * t) * 0.8 + Math.sin(4 * Math.PI * freq * t) * 0.15) * env * amp
    }
  }
  return lowpass(out, 2400)
}

writeWav('cue-tap.wav', synthCue([{ freq: 294, delay: 0, amp: 0.22, decay: 0.055 }], 0.18))
writeWav('cue-place.wav', synthCue([{ freq: 220, delay: 0, amp: 0.28, decay: 0.09 }], 0.26))
writeWav('cue-clear.wav', synthCue([
  { freq: 330, delay: 0, amp: 0.24, decay: 0.14 },
  { freq: 440, delay: 0.06, amp: 0.22, decay: 0.18 },
], 0.48))
writeWav('cue-chime.wav', synthCue([
  { freq: 392, delay: 0, amp: 0.22, decay: 0.32 },
  { freq: 523.25, delay: 0.11, amp: 0.22, decay: 0.42 },
  { freq: 659.25, delay: 0.22, amp: 0.18, decay: 0.55 },
], 1.2))
writeWav('cue-undo.wav', synthCue([
  { freq: 311, delay: 0, amp: 0.18, decay: 0.07 },
  { freq: 247, delay: 0.045, amp: 0.16, decay: 0.08 },
], 0.25))

console.log(`Generated ${fs.readdirSync(OUT).length} sound files in assets/sounds/`)
