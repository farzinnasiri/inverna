import { DEFAULT_HARMONIC_KEY, type HarmonicKeyId } from './harmonics'

/**
 * Sound catalogue: pure data. Every sound in Lull is synthesised in real time
 * on-device (zero audio files, zero cloud), combining shaped 1/f noise beds,
 * multi-voice harmonic pads, phase-locked AM modulation, 0.1 Hz breath swells,
 * and scale-locked game cues.
 */
export type LayerId = 'rain' | 'waves' | 'fire' | 'wind' | 'brown' | 'pink' | 'white'

export type BandId = 'delta' | 'theta' | 'alpha' | 'gamma'
export type SleepBandId = 'delta' | 'theta' | 'alpha'
export type SoundSceneId = 'rain' | 'waves' | 'fire' | 'wind' | 'binaural'

export interface LayerMeta {
  id: LayerId
  name: string
  short: string
  hint: string
}

export interface BandMeta {
  id: SleepBandId
  name: string
  /** Target modulation frequency in Hz. */
  hz: number
  hint: string
  restful: boolean
}

export const LAYERS: readonly LayerMeta[] = [
  { id: 'rain', name: 'Rain', short: 'Rain', hint: 'Steady rain on a roof' },
  { id: 'waves', name: 'Waves', short: 'Waves', hint: 'Slow surf, 0.1 Hz breaths' },
  { id: 'fire', name: 'Hearth', short: 'Fire', hint: 'Low fire, warm embers' },
  { id: 'wind', name: 'Wind', short: 'Wind', hint: 'Twilight air currents' },
  { id: 'brown', name: 'Brown noise', short: 'Brown', hint: 'Deep, velvet sub-rumble' },
  { id: 'pink', name: 'Pink noise', short: 'Pink', hint: '1/f acoustic masking bed' },
  { id: 'white', name: 'White noise', short: 'White', hint: 'Softened broadband mask' },
]

/** Sleep bands only (Gamma removed from UI; saved mixes tolerated via normalizeBand). */
export const BANDS: readonly BandMeta[] = [
  { id: 'delta', name: 'Delta', hz: 2, hint: 'Deep slow-wave pulse', restful: true },
  { id: 'theta', name: 'Theta', hz: 5, hint: 'Drowsy twilight drift', restful: true },
  { id: 'alpha', name: 'Alpha', hz: 8.5, hint: 'Calm evening unwind', restful: true },
]

export function normalizeBand(band: BandId | null | undefined): SleepBandId | null {
  if (band === 'delta' || band === 'theta' || band === 'alpha') return band
  return null
}

export interface Mix {
  /** Gain per texture/noise layer, 0..1. Missing = off. */
  layers: Partial<Record<LayerId, number>>
  /** Multi-voice harmonic pad gain, 0..1 (synthesised in `harmonicKey`). */
  padGain?: number
  /** Musical scale locking harmonic pad, carrier tone, and game cues. */
  harmonicKey?: HarmonicKeyId
  /** Base modulation band (drives speaker-safe AM + headphone binaural). */
  band: BandId | null
  /** Gain/presence of neural modulation & binaural pair, 0..1. */
  bandGain: number
  /** Carrier tone in Hz (left ear; right = carrier + modHz). */
  carrier: number
  /** Subtle 0.1 Hz cardiorespiratory breath-paced filter/gain swell. */
  breathPacing?: boolean
  /** Slow stereo rocking width 0..1 for the harmonic field. */
  spatialMotion?: number
}

export const SILENT_MIX: Mix = {
  layers: {},
  padGain: 0,
  harmonicKey: DEFAULT_HARMONIC_KEY,
  band: null,
  bandGain: 0.35,
  carrier: 146.83,
  breathPacing: false,
  spatialMotion: 0,
}

export interface Preset {
  id: string
  name: string
  hint: string
  /** Visual backdrop scene family. */
  scene: SoundSceneId
  /** Musical scale for pad & game cues. */
  harmonicKey: HarmonicKeyId
  /** 60-minute Iso-descent modulation targets in Hz: [Unwind, Drift, Still]. */
  descentRange: readonly [number, number, number]
  /** Short badge tag shown in onboarding/sounds. */
  badge?: string
  mix: Mix
}

export const DEFAULT_PRESET_ID = 'theta-rain'

export const PRESETS: readonly Preset[] = [
  {
    id: 'theta-rain',
    name: 'Theta rain',
    hint: 'Felt fifths, window rain, 5 Hz theta',
    scene: 'rain',
    harmonicKey: 'd-dorian',
    descentRange: [7.6, 5.0, 2.4],
    badge: 'Flagship',
    mix: {
      layers: { rain: 0.56, pink: 0.16 },
      padGain: 0.64,
      harmonicKey: 'd-dorian',
      band: 'theta',
      bandGain: 0.46,
      carrier: 146.83, // D3
      breathPacing: true,
      spatialMotion: 0.36,
    },
  },
  {
    id: 'hearth',
    name: 'Hearth & drift',
    hint: 'Ember bed, warm fifths, 4.5 Hz theta',
    scene: 'fire',
    harmonicKey: 'f-lydian',
    descentRange: [6.8, 4.5, 2.2],
    mix: {
      layers: { fire: 0.66, rain: 0.16 },
      padGain: 0.54,
      harmonicKey: 'f-lydian',
      band: 'theta',
      bandGain: 0.4,
      carrier: 174.61, // F3
      breathPacing: true,
      spatialMotion: 0.26,
    },
  },
  {
    id: 'low-tide',
    name: 'Lunar tide',
    hint: '0.1 Hz breath surf & glass tones',
    scene: 'waves',
    harmonicKey: 'c-maj9',
    descentRange: [8.4, 5.2, 2.6],
    mix: {
      layers: { waves: 0.68, wind: 0.15 },
      padGain: 0.58,
      harmonicKey: 'c-maj9',
      band: 'alpha',
      bandGain: 0.42,
      carrier: 130.81, // C3
      breathPacing: true,
      spatialMotion: 0.46,
    },
  },
  {
    id: 'deep-drift',
    name: 'Deep delta',
    hint: 'Velvet 1/f floor & 2 Hz delta pulse',
    scene: 'binaural',
    harmonicKey: 'g-min9',
    descentRange: [4.6, 2.5, 1.5],
    mix: {
      layers: { brown: 0.54, pink: 0.22 },
      padGain: 0.6,
      harmonicKey: 'g-min9',
      band: 'delta',
      bandGain: 0.52,
      carrier: 146.83, // D3 (fifth of G minor)
      breathPacing: true,
      spatialMotion: 0.5,
    },
  },
  {
    id: 'still-horizon',
    name: 'Still horizon',
    hint: 'Twilight wind & overtone shimmer',
    scene: 'wind',
    harmonicKey: 'a-min9',
    descentRange: [8.0, 5.0, 2.4],
    mix: {
      layers: { wind: 0.58, pink: 0.2 },
      padGain: 0.62,
      harmonicKey: 'a-min9',
      band: 'theta',
      bandGain: 0.38,
      carrier: 164.81, // E3 (fifth of A minor)
      breathPacing: true,
      spatialMotion: 0.44,
    },
  },
]

/** Legacy preset aliases cleanly resolve to our flagship compositions. */
const LEGACY_PRESET_MAP: Record<string, string> = {
  rainfall: DEFAULT_PRESET_ID,
}

export function presetById(id: string | null | undefined): Preset | undefined {
  if (!id) return undefined
  const resolved = LEGACY_PRESET_MAP[id] ?? id
  return PRESETS.find((p) => p.id === resolved)
}

export function isSilent(mix: Mix): boolean {
  const hasPad = (mix.padGain ?? 0) > 0.005
  const hasBand = Boolean(normalizeBand(mix.band)) && mix.bandGain > 0.005
  const hasLayer = Object.values(mix.layers).some((g) => (g ?? 0) > 0.005)
  return !hasPad && !hasBand && !hasLayer
}
