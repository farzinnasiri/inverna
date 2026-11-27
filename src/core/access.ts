/**
 * Free taste vs. Full Unlock boundaries. Pure TypeScript: no React, no I/O.
 *
 * Inverna is free to download and genuinely usable every night:
 * - 4 distinct games across every mood (Kumiko, Pond, Nine, Settle)
 * - 4 core sound presets covering rain, piano, waves and deep brown noise
 * - 1 saved custom sound in the Composer (editable and replaceable anytime)
 * - Adaptive night light, Wind-down, Sleep timer and Evening check-in
 *
 * A single non-consumable purchase unlocks all 14 games, all 12 sound presets,
 * unlimited custom sounds in the Composer, and manual brightness & warmth.
 */
import type { GameId } from './games/catalog'
import { DEFAULT_PRESET_ID, presetById } from './sound/catalog'

/** Games open to everyone without paying (flagships Kumiko & Pond + Nine & Settle). */
export const FREE_GAMES: readonly GameId[] = ['kumiko', 'pond', 'nine', 'settle']

/** Sound presets open to everyone (matches all 3 onboarding families + brown noise). */
export const FREE_PRESETS: readonly string[] = ['theta-rain', 'nocturne', 'low-tide', 'deep-drift']

/** How many custom sounds a free user can keep saved in the Composer. */
export const FREE_CUSTOM_SOUND_LIMIT = 1

const FREE_GAME_SET = new Set<GameId>(FREE_GAMES)
const FREE_PRESET_SET = new Set<string>(FREE_PRESETS)

export function isGameFree(id: GameId): boolean {
  return FREE_GAME_SET.has(id)
}

export function canPlayGame(id: GameId, unlocked: boolean): boolean {
  return unlocked || FREE_GAME_SET.has(id)
}

export function isPresetFree(id: string): boolean {
  const resolved = presetById(id)?.id ?? id
  return FREE_PRESET_SET.has(resolved)
}

export function canPlayPreset(id: string, unlocked: boolean): boolean {
  return unlocked || isPresetFree(id)
}

/**
 * Guarantees a playable preset id: keeps `id` when unlocked or free,
 * otherwise falls back to the default free rain preset.
 */
export function fallbackFreePreset(id: string | null | undefined, unlocked: boolean): string {
  const resolved = presetById(id)?.id
  if (resolved && canPlayPreset(resolved, unlocked)) return resolved
  return DEFAULT_PRESET_ID
}

/** Free users can create and save 1 custom sound; Full Unlock allows unlimited. */
export function canCreateCustomSound(existingCount: number, unlocked: boolean): boolean {
  return unlocked || existingCount < FREE_CUSTOM_SOUND_LIMIT
}

/** Adaptive night light is free; manual brightness & warmth sliders require Full Unlock. */
export function canUseManualLight(unlocked: boolean): boolean {
  return unlocked
}

/** Preserve a former owner's library on disk while keeping the first saved sound available. */
export function canUseSavedSound(id: string, sounds: readonly { id: string }[], unlocked: boolean): boolean {
  const index = sounds.findIndex((sound) => sound.id === id)
  return index >= 0 && (unlocked || index < FREE_CUSTOM_SOUND_LIMIT)
}
