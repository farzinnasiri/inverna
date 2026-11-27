import type { CueName } from './engine'

/**
 * Curated nocturnal harmonic moods & scales.
 * Every soundscape locks its harmonic pad, binaural carrier, classical motifs,
 * and interactive game cues to the exact same musical scale so playing a puzzle
 * literally becomes playing the sleep soundtrack.
 */
export type HarmonicKeyId =
  | 'd-dorian'
  | 'e-min-classical'
  | 'f-lydian'
  | 'c-maj9'
  | 'g-min9'
  | 'a-min9'

export type CueTimbre = 'felt' | 'warm-bell' | 'glass' | 'velvet' | 'harp'

export interface HarmonicKeyMeta {
  id: HarmonicKeyId
  /** Friendly evocative mood name shown in UI instead of music-theory jargon. */
  moodName: string
  /** Technical musical scale name (kept for internal reference / subtle display). */
  label: string
  mood: string
  /** Primary harmonic anchor in Hz (also ideal binaural carrier). */
  rootHz: number
  /** 4-voice open voicing (root, fifth, seventh/third, ninth) for the ambient pad. */
  padHz: readonly [number, number, number, number]
  /** 6-note modal/pentatonic scale for generative game cues & classical motifs. */
  scaleHz: readonly [number, number, number, number, number, number]
  timbre: CueTimbre
}

export const DEFAULT_HARMONIC_KEY: HarmonicKeyId = 'd-dorian'

export const HARMONIC_KEYS: Record<HarmonicKeyId, HarmonicKeyMeta> = {
  'd-dorian': {
    id: 'd-dorian',
    moodName: 'Rain',
    label: 'D Dorian',
    mood: 'Contemplative rain warmth',
    rootHz: 146.83, // D3
    padHz: [146.83, 220.0, 261.63, 329.63], // D3, A3, C4, E4 (Dm9)
    scaleHz: [293.66, 349.23, 392.0, 440.0, 523.25, 587.33], // D4 F4 G4 A4 C5 D5
    timbre: 'felt',
  },
  'e-min-classical': {
    id: 'e-min-classical',
    moodName: 'Nocturne',
    label: 'E Minor',
    mood: 'Satie & Chopin twilight piano',
    rootHz: 164.81, // E3
    padHz: [164.81, 246.94, 293.66, 369.99], // E3, B3, D4, F#4 (Em9)
    scaleHz: [246.94, 293.66, 329.63, 369.99, 392.0, 493.88], // B3 D4 E4 F#4 G4 B4
    timbre: 'felt',
  },
  'f-lydian': {
    id: 'f-lydian',
    moodName: 'Hearth',
    label: 'F Lydian',
    mood: 'Glowing hearth resonance',
    rootHz: 174.61, // F3
    padHz: [174.61, 261.63, 329.63, 392.0], // F3, C4, E4, G4 (Fmaj9)
    scaleHz: [349.23, 392.0, 440.0, 523.25, 587.33, 659.25], // F4 G4 A4 C5 D5 E5
    timbre: 'warm-bell',
  },
  'c-maj9': {
    id: 'c-maj9',
    moodName: 'Tide',
    label: 'C Major 9',
    mood: 'Open lunar horizon',
    rootHz: 130.81, // C3
    padHz: [130.81, 196.0, 246.94, 293.66], // C3, G3, B3, D4 (Cmaj9)
    scaleHz: [261.63, 293.66, 329.63, 392.0, 440.0, 493.88], // C4 D4 E4 G4 A4 B4
    timbre: 'glass',
  },
  'g-min9': {
    id: 'g-min9',
    moodName: 'Velvet',
    label: 'G Minor 9',
    mood: 'Velvet deep-sleep floor',
    rootHz: 146.83, // D3
    padHz: [98.0, 146.83, 174.61, 220.0], // G2, D3, F3, A3 (Gm9)
    scaleHz: [196.0, 233.08, 261.63, 293.66, 349.23, 392.0], // G3 Bb3 C4 D4 F4 G4
    timbre: 'velvet',
  },
  'a-min9': {
    id: 'a-min9',
    moodName: 'Air',
    label: 'A Minor 9',
    mood: 'Weightless twilight air',
    rootHz: 164.81, // E3
    padHz: [110.0, 164.81, 196.0, 246.94], // A2, E3, G3, B3 (Am9)
    scaleHz: [220.0, 261.63, 293.66, 329.63, 392.0, 440.0], // A3 C4 D4 E4 G4 A4
    timbre: 'harp',
  },
}

export function harmonicKeyMeta(id: HarmonicKeyId | null | undefined): HarmonicKeyMeta {
  if (id && id in HARMONIC_KEYS) return HARMONIC_KEYS[id]
  return HARMONIC_KEYS[DEFAULT_HARMONIC_KEY]
}

export interface QuantizedNote {
  freq: number
  endFreq?: number
  delay: number
  attack: number
  decay: number
  gain: number
  cutoff: number
  overtoneGain: number
  /** Gentle stereo placement -0.5..0.5 */
  pan: number
}

const MOTIF = [0, 2, 1, 3, 2, 4, 3, 5, 4, 2, 3, 1] as const
const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))

export function resolveGameNotes(
  cue: CueName,
  keyId: HarmonicKeyId = DEFAULT_HARMONIC_KEY,
  stepIndex = 0,
  darkness = 0,
): QuantizedNote[] {
  const key = harmonicKeyMeta(keyId)
  const scale = key.scaleHz
  const d = clamp01(darkness)
  const idx = Math.abs(Math.floor(stepIndex)) % MOTIF.length
  const deg = MOTIF[idx]!

  const cutoffScale = 1 - d * 0.44
  const velScale = 1 - d * 0.24
  const overtoneScale = (key.timbre === 'glass' ? 0.22 : key.timbre === 'velvet' ? 0.08 : 0.14) * (1 - d * 0.4)
  const panShift = ((deg - 2.5) / 5) * 0.42

  switch (cue) {
    case 'tap': {
      const f = scale[deg]!
      return [
        {
          freq: f,
          endFreq: f * 0.992,
          delay: 0,
          attack: 0.005 + d * 0.004,
          decay: 0.11 + d * 0.03,
          gain: 0.082 * velScale,
          cutoff: 1250 * cutoffScale,
          overtoneGain: overtoneScale,
          pan: panShift,
        },
      ]
    }

    case 'place': {
      const rootIdx = deg % 4
      const fifthIdx = Math.min(5, rootIdx + 2)
      return [
        {
          freq: scale[rootIdx]!,
          delay: 0,
          attack: 0.007 + d * 0.004,
          decay: 0.18 + d * 0.04,
          gain: 0.098 * velScale,
          cutoff: 1280 * cutoffScale,
          overtoneGain: overtoneScale * 1.05,
          pan: panShift * 0.7,
        },
        {
          freq: scale[fifthIdx]!,
          delay: 0.014,
          attack: 0.008 + d * 0.004,
          decay: 0.15,
          gain: 0.042 * velScale,
          cutoff: 1180 * cutoffScale,
          overtoneGain: overtoneScale * 0.5,
          pan: -panShift * 0.5,
        },
      ]
    }

    case 'clear': {
      const base = deg % 3
      return [
        {
          freq: scale[base]!,
          delay: 0,
          attack: 0.007 + d * 0.003,
          decay: 0.24,
          gain: 0.092 * velScale,
          cutoff: 1450 * cutoffScale,
          overtoneGain: overtoneScale,
          pan: -0.18,
        },
        {
          freq: scale[base + 2]!,
          delay: 0.068,
          attack: 0.008 + d * 0.003,
          decay: 0.32,
          gain: 0.102 * velScale,
          cutoff: 1580 * cutoffScale,
          overtoneGain: overtoneScale * 1.1,
          pan: 0.18,
        },
      ]
    }

    case 'chime': {
      return [
        {
          freq: scale[0]!,
          delay: 0,
          attack: 0.012,
          decay: 0.62,
          gain: 0.095 * velScale,
          cutoff: 1550 * cutoffScale,
          overtoneGain: overtoneScale,
          pan: -0.22,
        },
        {
          freq: scale[3]!,
          delay: 0.115,
          attack: 0.014,
          decay: 0.78,
          gain: 0.1 * velScale,
          cutoff: 1650 * cutoffScale,
          overtoneGain: overtoneScale * 1.1,
          pan: 0.04,
        },
        {
          freq: scale[5]!,
          delay: 0.23,
          attack: 0.016,
          decay: 0.92,
          gain: 0.068 * velScale,
          cutoff: 1500 * cutoffScale,
          overtoneGain: overtoneScale * 0.6,
          pan: 0.24,
        },
      ]
    }

    case 'exhale': {
      // The out-breath: a low root swells in under a chord rolled upward, in
      // time with the wave strumming out across the scene.
      const roll = [0, 2, 3, 5] as const
      const notes: QuantizedNote[] = [
        {
          freq: scale[0]! / 2,
          delay: 0,
          attack: 0.22,
          decay: 2.8,
          gain: 0.07 * velScale,
          cutoff: 820 * cutoffScale,
          overtoneGain: overtoneScale * 0.4,
          pan: 0,
        },
      ]
      roll.forEach((deg, n) => {
        notes.push({
          freq: scale[deg]!,
          delay: 0.06 + n * 0.13,
          attack: 0.03 + n * 0.006,
          decay: 1.9 + n * 0.25,
          gain: (0.064 - n * 0.006) * velScale,
          cutoff: (1380 + n * 60) * cutoffScale,
          overtoneGain: overtoneScale * (0.9 - n * 0.1),
          pan: (n % 2 === 0 ? -1 : 1) * (0.12 + n * 0.06),
        })
      })
      notes.push({
        freq: scale[0]! * 2,
        delay: 0.66,
        attack: 0.05,
        decay: 2.6,
        gain: 0.032 * velScale,
        cutoff: 2200 * cutoffScale,
        overtoneGain: overtoneScale * 0.5,
        pan: 0.05,
      })
      return notes
    }

    case 'undo': {
      return [
        {
          freq: scale[2]!,
          delay: 0,
          attack: 0.006,
          decay: 0.11,
          gain: 0.072 * velScale,
          cutoff: 1020 * cutoffScale,
          overtoneGain: overtoneScale * 0.7,
          pan: 0.1,
        },
        {
          freq: scale[0]!,
          delay: 0.058,
          attack: 0.006,
          decay: 0.16,
          gain: 0.078 * velScale,
          cutoff: 920 * cutoffScale,
          overtoneGain: overtoneScale * 0.6,
          pan: -0.1,
        },
      ]
    }
  }
}
