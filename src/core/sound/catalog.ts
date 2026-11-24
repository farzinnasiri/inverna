import { DEFAULT_HARMONIC_KEY, type HarmonicKeyId } from './harmonics'

/**
 * Sound catalogue: pure data. Every sound in Lull is synthesised in real time
 * on-device (zero audio files, zero cloud), combining shaped 1/f noise beds,
 * multi-voice harmonic pads, generative nocturnal classical piano/strings,
 * phase-locked AM modulation, asymmetric 0.1 Hz breath swells, and scale-locked cues.
 */
export type LayerId = 'rain' | 'waves' | 'fire' | 'wind' | 'brown' | 'pink' | 'white'

export type BandId = 'delta' | 'theta' | 'alpha' | 'gamma'
export type SleepBandId = 'delta' | 'theta' | 'alpha'
export type SoundSceneId = 'rain' | 'classical' | 'fire' | 'waves' | 'delta' | 'wind' | 'reverie'
export type ClassicalMotifStyle = 'nocturne' | 'adagio' | 'reverie'
export type SoundIconId =
  | 'rain'
  | 'piano'
  | 'fire'
  | 'waves'
  | 'moon'
  | 'wind'
  | 'feather'
  | 'disc'
  | 'orbit'
  | 'book'
  | 'trees'
  | 'compass'

export interface LayerMeta {
  id: LayerId
  name: string
  short: string
  hint: string
}

export interface BandMeta {
  id: SleepBandId
  name: string
  /** Greek symbol for clean visual rhythm controls. */
  greek: string
  /** Target modulation frequency in Hz. */
  hz: number
  hint: string
  restful: boolean
}

export const LAYERS: readonly LayerMeta[] = [
  { id: 'rain', name: 'Rain', short: 'Rain', hint: 'Steady rain on a roof' },
  { id: 'waves', name: 'Waves', short: 'Waves', hint: 'Slow surf, long breaths' },
  { id: 'fire', name: 'Hearth', short: 'Fire', hint: 'Low fire, warm embers' },
  { id: 'wind', name: 'Wind', short: 'Wind', hint: 'Twilight air currents' },
  { id: 'brown', name: 'Brown noise', short: 'Brown', hint: 'Deep, velvet sub-rumble' },
  { id: 'pink', name: 'Pink noise', short: 'Pink', hint: 'Warm masking floor' },
  { id: 'white', name: 'White noise', short: 'White', hint: 'Softened broadband mask' },
]

export const BANDS: readonly BandMeta[] = [
  { id: 'delta', name: 'Delta', greek: 'δ', hz: 2, hint: 'Deep slow-wave pulse', restful: true },
  { id: 'theta', name: 'Theta', greek: 'θ', hz: 5, hint: 'Drowsy twilight drift', restful: true },
  { id: 'alpha', name: 'Alpha', greek: 'α', hz: 8.5, hint: 'Calm evening unwind', restful: true },
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
  /** Optional generative classical felt-piano / chamber motif layer. */
  classicalMotif?: ClassicalMotifStyle | null
  /** Base modulation band (drives speaker-safe AM + headphone binaural). */
  band: BandId | null
  /** Gain/presence of neural modulation & binaural pair, 0..1. */
  bandGain: number
  /** Carrier tone in Hz (left ear; right = carrier + modHz). */
  carrier: number
  /** Subtle asymmetric 0.1 Hz breath-paced filter/gain swell. */
  breathPacing?: boolean
  /** Slow stereo rocking width 0..1 for the harmonic field. */
  spatialMotion?: number
}

export const SILENT_MIX: Mix = {
  layers: {},
  padGain: 0,
  harmonicKey: DEFAULT_HARMONIC_KEY,
  classicalMotif: null,
  band: null,
  bandGain: 0.35,
  carrier: 146.83,
  breathPacing: false,
  spatialMotion: 0,
}

export interface Preset {
  id: string
  name: string
  /** Consistent, evocative sensory subtitle (never technical jargon, never truncates). */
  hint: string
  /** Page index in the horizontal Sounds browser: 0 = Core Night (6), 1 = Reverie (6). */
  page: 0 | 1
  /** Visual backdrop & Dynamic Island artwork family. */
  scene: SoundSceneId
  /** Bespoke icon for cards & onboarding. */
  icon: SoundIconId
  /** Musical scale for pad, classical motifs & game cues. */
  harmonicKey: HarmonicKeyId
  /** 60-minute Iso-descent modulation targets in Hz: [Unwind, Drift, Still]. */
  descentRange: readonly [number, number, number]
  badge?: string
  mix: Mix
}

export const DEFAULT_PRESET_ID = 'theta-rain'

export const PRESET_PAGES = [
  { id: 0 as const, label: 'Night' },
  { id: 1 as const, label: 'Reverie' },
] as const

export const PRESETS: readonly Preset[] = [
  /* --- Page 0: Core Night (6 signature compositions) ----------------------- */
  {
    id: 'theta-rain',
    name: 'Theta rain',
    hint: 'Soft rain & felt fifths',
    page: 0,
    scene: 'rain',
    icon: 'rain',
    harmonicKey: 'd-dorian',
    descentRange: [7.6, 5.0, 2.4],
    badge: 'Flagship',
    mix: {
      layers: { rain: 0.56, pink: 0.16 },
      padGain: 0.64,
      harmonicKey: 'd-dorian',
      classicalMotif: null,
      band: 'theta',
      bandGain: 0.46,
      carrier: 146.83,
      breathPacing: true,
      spatialMotion: 0.36,
    },
  },
  {
    id: 'nocturne',
    name: 'Nocturne',
    hint: 'Slow piano & warm strings',
    page: 0,
    scene: 'classical',
    icon: 'piano',
    harmonicKey: 'e-min-classical',
    descentRange: [7.4, 4.8, 2.4],
    mix: {
      layers: { pink: 0.14, rain: 0.14 },
      padGain: 0.58,
      harmonicKey: 'e-min-classical',
      classicalMotif: 'nocturne',
      band: 'theta',
      bandGain: 0.36,
      carrier: 164.81,
      breathPacing: true,
      spatialMotion: 0.32,
    },
  },
  {
    id: 'hearth',
    name: 'Hearth & drift',
    hint: 'Low fire & warm cello',
    page: 0,
    scene: 'fire',
    icon: 'fire',
    harmonicKey: 'f-lydian',
    descentRange: [6.8, 4.5, 2.2],
    mix: {
      layers: { fire: 0.66, rain: 0.16 },
      padGain: 0.54,
      harmonicKey: 'f-lydian',
      classicalMotif: null,
      band: 'theta',
      bandGain: 0.4,
      carrier: 174.61,
      breathPacing: true,
      spatialMotion: 0.26,
    },
  },
  {
    id: 'low-tide',
    name: 'Lunar tide',
    hint: 'Slow surf & moonlit glass',
    page: 0,
    scene: 'waves',
    icon: 'waves',
    harmonicKey: 'c-maj9',
    descentRange: [8.4, 5.2, 2.6],
    mix: {
      layers: { waves: 0.68, wind: 0.15 },
      padGain: 0.58,
      harmonicKey: 'c-maj9',
      classicalMotif: null,
      band: 'alpha',
      bandGain: 0.42,
      carrier: 130.81,
      breathPacing: true,
      spatialMotion: 0.46,
    },
  },
  {
    id: 'deep-drift',
    name: 'Deep delta',
    hint: 'Velvet dark & slow pulse',
    page: 0,
    scene: 'delta',
    icon: 'moon',
    harmonicKey: 'g-min9',
    descentRange: [4.6, 2.5, 1.5],
    mix: {
      layers: { brown: 0.54, pink: 0.22 },
      padGain: 0.6,
      harmonicKey: 'g-min9',
      classicalMotif: null,
      band: 'delta',
      bandGain: 0.52,
      carrier: 146.83,
      breathPacing: true,
      spatialMotion: 0.5,
    },
  },
  {
    id: 'still-horizon',
    name: 'Still horizon',
    hint: 'Night wind & soft harp',
    page: 0,
    scene: 'wind',
    icon: 'wind',
    harmonicKey: 'a-min9',
    descentRange: [8.0, 5.0, 2.4],
    mix: {
      layers: { wind: 0.58, pink: 0.2 },
      padGain: 0.62,
      harmonicKey: 'a-min9',
      classicalMotif: null,
      band: 'theta',
      bandGain: 0.38,
      carrier: 164.81,
      breathPacing: true,
      spatialMotion: 0.44,
    },
  },

  /* --- Page 1: Reverie & Dusk (6 creative / classical / deep signatures) --- */
  {
    id: 'ink-reverie',
    name: 'Ink reverie',
    hint: 'Warm hush & alpha drift',
    page: 1,
    scene: 'reverie',
    icon: 'feather',
    harmonicKey: 'd-dorian',
    descentRange: [9.0, 6.2, 3.0],
    mix: {
      layers: { rain: 0.26, pink: 0.22, fire: 0.14 },
      padGain: 0.62,
      harmonicKey: 'd-dorian',
      classicalMotif: 'reverie',
      band: 'alpha',
      bandGain: 0.44,
      carrier: 146.83,
      breathPacing: true,
      spatialMotion: 0.42,
    },
  },
  {
    id: 'adagio-dusk',
    name: 'Adagio dusk',
    hint: 'Chamber strings & hush',
    page: 1,
    scene: 'classical',
    icon: 'disc',
    harmonicKey: 'f-lydian',
    descentRange: [7.0, 4.6, 2.2],
    mix: {
      layers: { pink: 0.16, wind: 0.12 },
      padGain: 0.7,
      harmonicKey: 'f-lydian',
      classicalMotif: 'adagio',
      band: 'theta',
      bandGain: 0.36,
      carrier: 174.61,
      breathPacing: true,
      spatialMotion: 0.38,
    },
  },
  {
    id: 'starfield',
    name: 'Starfield',
    hint: 'Deep hum & slow orbit',
    page: 1,
    scene: 'delta',
    icon: 'orbit',
    harmonicKey: 'g-min9',
    descentRange: [5.0, 2.8, 1.6],
    mix: {
      layers: { brown: 0.44, wind: 0.18 },
      padGain: 0.68,
      harmonicKey: 'g-min9',
      classicalMotif: null,
      band: 'delta',
      bandGain: 0.48,
      carrier: 146.83,
      breathPacing: true,
      spatialMotion: 0.56,
    },
  },
  {
    id: 'amber-study',
    name: 'Amber study',
    hint: 'Quiet hearth & muted keys',
    page: 1,
    scene: 'fire',
    icon: 'book',
    harmonicKey: 'e-min-classical',
    descentRange: [8.4, 5.6, 2.8],
    mix: {
      layers: { fire: 0.48, brown: 0.2 },
      padGain: 0.48,
      harmonicKey: 'e-min-classical',
      classicalMotif: 'nocturne',
      band: 'alpha',
      bandGain: 0.34,
      carrier: 164.81,
      breathPacing: true,
      spatialMotion: 0.28,
    },
  },
  {
    id: 'mist-pine',
    name: 'Mist & pine',
    hint: 'Forest air & light rain',
    page: 1,
    scene: 'wind',
    icon: 'trees',
    harmonicKey: 'a-min9',
    descentRange: [7.6, 4.8, 2.4],
    mix: {
      layers: { wind: 0.48, rain: 0.38 },
      padGain: 0.46,
      harmonicKey: 'a-min9',
      classicalMotif: null,
      band: 'theta',
      bandGain: 0.36,
      carrier: 164.81,
      breathPacing: true,
      spatialMotion: 0.4,
    },
  },
  {
    id: 'midnight-cove',
    name: 'Midnight cove',
    hint: 'Deep tide & dark surf',
    page: 1,
    scene: 'waves',
    icon: 'compass',
    harmonicKey: 'c-maj9',
    descentRange: [5.4, 3.0, 1.7],
    mix: {
      layers: { waves: 0.58, brown: 0.34 },
      padGain: 0.52,
      harmonicKey: 'c-maj9',
      classicalMotif: null,
      band: 'delta',
      bandGain: 0.44,
      carrier: 130.81,
      breathPacing: true,
      spatialMotion: 0.48,
    },
  },
]

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
  const hasClassical = Boolean(mix.classicalMotif)
  return !hasPad && !hasBand && !hasLayer && !hasClassical
}
