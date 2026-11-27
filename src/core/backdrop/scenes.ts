/**
 * Backdrop scenes: one living scene per sound preset (12), plus the palette
 * families they are tinted with. Pure data, no React, no rendering.
 *
 * Each scene draws a physical phenomenon as light (drops on a window, embers,
 * moonlight on water...) rather than a pictogram of it. The simulation lives in
 * `./sim.ts`; the Skia renderer lives in `src/ui/rn/backdrop/`.
 */
import { presetById, type Mix, type SoundSceneId } from '../sound/catalog'

/** Scene order is the index used by the simulation and the field shader. */
export const BACKDROP_IDS = [
  'theta-rain',
  'nocturne',
  'hearth',
  'low-tide',
  'deep-drift',
  'still-horizon',
  'ink-reverie',
  'adagio-dusk',
  'starfield',
  'amber-study',
  'mist-pine',
  'midnight-cove',
] as const

export type BackdropId = (typeof BACKDROP_IDS)[number]

/** Named scene indices, shared by the simulation and the SkSL field shader. */
export const SCENE = {
  rain: 0,
  nocturne: 1,
  hearth: 2,
  tide: 3,
  delta: 4,
  horizon: 5,
  ink: 6,
  adagio: 7,
  starfield: 8,
  amber: 9,
  mist: 10,
  cove: 11,
} as const

export const SCENE_COUNT = BACKDROP_IDS.length

export interface AtmosphericPalette {
  canopy: string
  mid: string
  horizon: string
  caustic: string
  detail: string
}

/** Colour families. Presets pick one through `Preset.scene`. */
export const SCENE_PALETTES: Record<SoundSceneId, AtmosphericPalette> = {
  rain: { canopy: '#1E467A', mid: '#3464A2', horizon: '#1B3A63', caustic: '#A8D0FA', detail: '#D6EBFF' },
  classical: { canopy: '#35286C', mid: '#6B4AA4', horizon: '#5B3A72', caustic: '#E9D0AA', detail: '#F8ECD8' },
  fire: { canopy: '#5E2612', mid: '#B9581F', horizon: '#A24318', caustic: '#F4C07C', detail: '#FFE5B8' },
  waves: { canopy: '#10505C', mid: '#23828A', horizon: '#165260', caustic: '#94E4E2', detail: '#D0F7F5' },
  delta: { canopy: '#30236B', mid: '#5840A8', horizon: '#221A4C', caustic: '#C7B6FA', detail: '#EFE8FF' },
  wind: { canopy: '#283E5C', mid: '#526E92', horizon: '#24354F', caustic: '#C4D6EB', detail: '#E6F1FC' },
  reverie: { canopy: '#46321F', mid: '#8A6A42', horizon: '#3A2A26', caustic: '#EBD3A4', detail: '#FBF0CF' },
}

export function isBackdropId(id: string | null | undefined): id is BackdropId {
  return (BACKDROP_IDS as readonly string[]).includes(id ?? '')
}

export function sceneIndex(id: BackdropId): number {
  return BACKDROP_IDS.indexOf(id)
}

/** Palette family of a backdrop scene, taken from its preset so colours stay in one place. */
export function paletteFamily(id: BackdropId): SoundSceneId {
  return presetById(id)?.scene ?? 'rain'
}

/**
 * Which scene to show: the preset's own scene, or for a hand-built mix the
 * scene of its dominant layer (the others are woven in: `resolveBlend`).
 */
export function resolveBackdrop(presetId: string | null, mix: Mix | null): BackdropId {
  if (isBackdropId(presetId)) return presetId
  if (!mix) return 'theta-rain'
  if (mix.classicalMotif === 'reverie') return 'ink-reverie'
  if (mix.classicalMotif === 'adagio') return 'adagio-dusk'
  if (mix.classicalMotif === 'nocturne') return 'nocturne'
  const ranked = layerWeights(mix)
  ranked.sort((a, b) => b[1] - a[1])
  return ranked[0]![1] > 0.05 ? ranked[0]![0] : 'theta-rain'
}

/** The layer scenes a hand-made mix can weave together. */
function layerWeights(mix: Mix): [BackdropId, number][] {
  const l = mix.layers
  return [
    ['theta-rain', l.rain ?? 0],
    ['low-tide', l.waves ?? 0],
    ['hearth', l.fire ?? 0],
    ['still-horizon', l.wind ?? 0],
    ['deep-drift', (l.brown ?? 0) + (l.pink ?? 0) * 0.6 + (mix.band === 'delta' ? 0.5 : 0)],
  ]
}

/**
 * Other scenes to weave into a hand-made mix's main scene, as flat
 * [scene index, weight] pairs (weight relative to the main scene's 1).
 * Rain and fire both up gives drops and embers together; everything up gives
 * a little of everything (the simulation shares one particle budget, so it
 * costs no more than one scene). Presets and the classical scenes stay pure.
 * A layer needs to be a real part of the mix (over a quarter of the loudest)
 * to show.
 */
export function resolveBlend(presetId: string | null, mix: Mix | null): number[] {
  if (isBackdropId(presetId) || !mix || mix.classicalMotif) return []
  const main = resolveBackdrop(presetId, mix)
  const ranked = layerWeights(mix).sort((a, b) => b[1] - a[1])
  const top = ranked[0]![1]
  if (top <= 0.05) return []
  const out: number[] = []
  for (const [id, v] of ranked) {
    if (id === main || v < 0.12 || v < top * 0.25) continue
    out.push(sceneIndex(id), Math.min(1, v / top))
  }
  return out.slice(0, 6)
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/**
 * Flat RGB table for the simulation and shader: per scene, 4 colours
 * (caustic, detail, mid, horizon) x 3 channels = 12 floats.
 */
export const SCENE_RGB: readonly number[] = BACKDROP_IDS.flatMap((id) => {
  const p = SCENE_PALETTES[paletteFamily(id)]
  return [...hexToRgb(p.caustic), ...hexToRgb(p.detail), ...hexToRgb(p.mid), ...hexToRgb(p.horizon)]
})
