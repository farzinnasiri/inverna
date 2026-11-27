import { describe, expect, it } from 'vitest'
import {
  canCreateCustomSound,
  canPlayGame,
  canPlayPreset,
  canUseManualLight,
  fallbackFreePreset,
  FREE_CUSTOM_SOUND_LIMIT,
  FREE_GAMES,
  FREE_PRESETS,
  isGameFree,
  isPresetFree,
} from './access'
import { GAMES } from './games/catalog'
import { DEFAULT_PRESET_ID, PRESETS } from './sound/catalog'

describe('freemium access boundaries', () => {
  it('allows the 4 free games when locked and locks the rest until unlocked', () => {
    for (const id of FREE_GAMES) {
      expect(isGameFree(id)).toBe(true)
      expect(canPlayGame(id, false)).toBe(true)
    }
    const locked = GAMES.map((g) => g.id).filter((id) => !FREE_GAMES.includes(id))
    expect(locked.length).toBeGreaterThan(0)
    for (const id of locked) {
      expect(canPlayGame(id, false)).toBe(false)
      expect(canPlayGame(id, true)).toBe(true)
    }
  })

  it('allows the 4 free presets when locked and falls back safely for locked presets', () => {
    expect(isPresetFree(DEFAULT_PRESET_ID)).toBe(true)
    for (const id of FREE_PRESETS) {
      expect(canPlayPreset(id, false)).toBe(true)
      expect(fallbackFreePreset(id, false)).toBe(id)
    }
    const locked = PRESETS.map((p) => p.id).filter((id) => !FREE_PRESETS.includes(id))
    expect(locked.length).toBeGreaterThan(0)
    for (const id of locked) {
      expect(canPlayPreset(id, false)).toBe(false)
      expect(canPlayPreset(id, true)).toBe(true)
      expect(fallbackFreePreset(id, false)).toBe(DEFAULT_PRESET_ID)
      expect(fallbackFreePreset(id, true)).toBe(id)
    }
    // Legacy alias resolves to theta-rain and remains free.
    expect(canPlayPreset('rainfall', false)).toBe(true)
  })

  it('caps saved custom sounds at 1 when locked and removes the cap when unlocked', () => {
    expect(FREE_CUSTOM_SOUND_LIMIT).toBe(1)
    expect(canCreateCustomSound(0, false)).toBe(true)
    expect(canCreateCustomSound(1, false)).toBe(false)
    expect(canCreateCustomSound(5, false)).toBe(false)
    expect(canCreateCustomSound(1, true)).toBe(true)
    expect(canCreateCustomSound(20, true)).toBe(true)
  })

  it('locks manual night light sliders while free and unlocks them after purchase', () => {
    expect(canUseManualLight(false)).toBe(false)
    expect(canUseManualLight(true)).toBe(true)
  })
})
