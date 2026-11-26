import { describe, expect, it, vi } from 'vitest'
import { kv, NAMESPACE } from '@/core/storage'

vi.mock('@/platform', () => ({ bootPlatform: () => {} }))

const { useSettings } = await import('./settings')

/** Write a stored settings blob the way zustand's persist does, then load it. */
async function hydrate(state: Record<string, unknown>, version: number) {
  kv().setItem(NAMESPACE + 'settings', JSON.stringify({ state, version }))
  await useSettings.persist.rehydrate()
  return useSettings.getState()
}

describe('settings: loading what was saved', () => {
  it('loads a current save as it was', async () => {
    const st = await hydrate({ onboarded: true, userName: 'Sam', volume: 0.4, sleepTimer: 45 }, 8)
    expect(st).toMatchObject({ onboarded: true, userName: 'Sam', volume: 0.4, sleepTimer: 45 })
  })

  it('fills in anything the save is missing with the defaults', async () => {
    const st = await hydrate({ onboarded: true }, 8)
    expect(st.customSounds).toEqual([])
    expect(st.autoDescent).toBe(true)
  })

  it('turns the old night-light slider into Warmth and Brightness (v6 → v7)', async () => {
    const st = await hydrate({ light: 0.5, followBedtime: false, onboarded: true }, 6)
    expect(st.warmth).toBe(0.5)
    expect(st.brightness).toBeCloseTo(1 - 0.5 * 0.85)
    expect(st.adaptiveLight).toBe(false)
    expect('light' in st).toBe(false)
  })

  it('gives an old bedtime a range (v5 → v6)', async () => {
    const st = await hydrate({ schedule: { enabled: true, bedtime: '22:30', leadMinutes: 60, days: [1, 2] } }, 5)
    expect(st.schedule.bedtime).toBe('22:30')
    expect(st.schedule.rangeMinutes).toBeGreaterThan(0)
    expect(st.sleepSignals).toEqual([])
  })

  it('swaps game styles for phone habits in the profile (v7 → v8)', async () => {
    const st = await hydrate({ profile: { factors: [], mind: 0.4, styles: ['calm'], liked: {}, volume: 0.8 } }, 7)
    expect(st.profile).not.toHaveProperty('styles')
    expect(st.profile?.habits).toEqual([])
  })

  it('forgets check-in answers from before the questions changed (v3 → v4)', async () => {
    const st = await hydrate({ tonightIntent: 'calm', lastCheckInDate: '2026-01-01' }, 3)
    expect(st.tonightIntent).toBeNull()
    expect(st.lastCheckInDate).toBeNull()
  })

  // ISS-19.3: a damaged save is trusted as it is. Phase 1 step 1 checks each
  // field and falls back to the default for one that doesn't fit.
  it.skip('a damaged field falls back to its default', async () => {
    const st = await hydrate({ onboarded: true, volume: 'loud', playLayout: { night: 'x', order: 7 } }, 8)
    expect(st.onboarded).toBe(true)
    expect(st.volume).toBe(0.85)
    expect(st.playLayout).toBeNull()
  })
})
