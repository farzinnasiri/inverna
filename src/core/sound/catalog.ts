/**
 * Sound catalogue: pure data. Every sound in Lull is synthesised on-device
 * (no audio files), so the app is tiny and fully offline.
 */
export type LayerId = 'rain' | 'waves' | 'fire' | 'wind' | 'brown' | 'pink' | 'white'

export type BandId = 'delta' | 'theta' | 'alpha' | 'gamma'
export type SleepBandId = 'delta' | 'theta' | 'alpha'

export interface LayerMeta {
  id: LayerId
  name: string
  short: string
  hint: string
}

export interface BandMeta {
  id: SleepBandId
  name: string
  /** Beat frequency in Hz (difference between left and right ears). */
  hz: number
  hint: string
  restful: boolean
}

export const LAYERS: readonly LayerMeta[] = [
  { id: 'rain', name: 'Rain', short: 'Rain', hint: 'Steady rain on a roof' },
  { id: 'waves', name: 'Waves', short: 'Waves', hint: 'Slow surf, long breaths' },
  { id: 'fire', name: 'Hearth', short: 'Fire', hint: 'Low fire, the odd crackle' },
  { id: 'wind', name: 'Wind', short: 'Wind', hint: 'Air moving through trees' },
  { id: 'brown', name: 'Brown noise', short: 'Brown', hint: 'Deep, soft rumble' },
  { id: 'pink', name: 'Pink noise', short: 'Pink', hint: 'Balanced, like distant water' },
  { id: 'white', name: 'White noise', short: 'White', hint: 'Bright, masks everything' },
]

/** Sleep bands only (Gamma removed from v2 UI; saved mixes tolerated via normalizeBand). */
export const BANDS: readonly BandMeta[] = [
  { id: 'delta', name: 'Delta', hz: 2, hint: 'Deep sleep rhythm', restful: true },
  { id: 'theta', name: 'Theta', hz: 5, hint: 'Drowsy, drifting', restful: true },
  { id: 'alpha', name: 'Alpha', hz: 10, hint: 'Relaxed, eyes closed', restful: true },
]

export function normalizeBand(band: BandId | null | undefined): SleepBandId | null {
  if (band === 'delta' || band === 'theta' || band === 'alpha') return band
  return null
}

export interface Mix {
  /** Gain per layer, 0..1. Missing = off. */
  layers: Partial<Record<LayerId, number>>
  /** Binaural band, or null for none. Needs headphones. */
  band: BandId | null
  /** Gain of the binaural tone, 0..1. */
  bandGain: number
  /** Carrier tone in Hz for the binaural pair (left ear). */
  carrier: number
}

export const SILENT_MIX: Mix = { layers: {}, band: null, bandGain: 0.35, carrier: 160 }

export interface Preset {
  id: string
  name: string
  hint: string
  mix: Mix
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'rainfall',
    name: 'Rainfall',
    hint: 'Rain with a low hum underneath',
    mix: { layers: { rain: 0.7, brown: 0.25 }, band: null, bandGain: 0.35, carrier: 160 },
  },
  {
    id: 'low-tide',
    name: 'Low tide',
    hint: 'Waves and a little wind',
    mix: { layers: { waves: 0.75, wind: 0.2 }, band: null, bandGain: 0.35, carrier: 160 },
  },
  {
    id: 'hearth',
    name: 'Hearth',
    hint: 'A fire, rain on the window',
    mix: { layers: { fire: 0.7, rain: 0.25 }, band: null, bandGain: 0.35, carrier: 160 },
  },
  {
    id: 'deep-drift',
    name: 'Deep drift',
    hint: 'Brown noise with delta waves',
    mix: { layers: { brown: 0.55 }, band: 'delta', bandGain: 0.4, carrier: 140 },
  },
  {
    id: 'theta-rain',
    name: 'Theta rain',
    hint: 'Soft rain with theta waves',
    mix: { layers: { rain: 0.5 }, band: 'theta', bandGain: 0.35, carrier: 180 },
  },
]

export function presetById(id: string | null | undefined): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}

export function isSilent(mix: Mix): boolean {
  return !normalizeBand(mix.band) && Object.values(mix.layers).every((g) => !g)
}
