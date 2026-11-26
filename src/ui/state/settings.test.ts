import { describe, expect, it, vi } from 'vitest'
import { kv, NAMESPACE } from '@/core/storage'

vi.mock('@/platform', () => ({ bootPlatform: () => {} }))

const { useSettings } = await import('./settings')

/** Write a stored settings blob the way zustand's persist does, then load it. */
async function hydrate(state: Record<string, unknown>, version: number) {
  useSettings.setState(useSettings.getInitialState(), true)
  kv().setItem(NAMESPACE + 'settings', JSON.stringify({ state, version }))
  await useSettings.persist.rehydrate()
  return useSettings.getState()
}

describe('settings: loading what was saved', () => {
  it('loads a current save as it was', async () => {
    const st = await hydrate({ onboarded: true, userName: 'Sam', volume: 0.4, sleepTimer: 45 }, 10)
    expect(st).toMatchObject({ onboarded: true, userName: 'Sam', volume: 0.4, sleepTimer: 45 })
  })

  it('fills in anything the save is missing with the defaults', async () => {
    const st = await hydrate({ onboarded: true }, 10)
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
    expect(st.checkInAnsweredNight).toBeNull()
  })

  it('keeps reminders as they were for someone already set up (v9 → v10)', async () => {
    const st = await hydrate({ onboarded: true, reminders: true }, 9)
    expect(st).toMatchObject({ reminders: true, onboardedNight: '1970-01-01', reminderOfferDeclines: 0 })
  })

  it('splits the check-in stamp into asked and answered (v8 → v9)', async () => {
    const answered = await hydrate({ lastCheckInDate: '2026-11-02', tonightIntent: 'melt' }, 8)
    expect(answered).toMatchObject({ checkInAskedNight: '2026-11-02', checkInAnsweredNight: '2026-11-02' })
    const dismissed = await hydrate({ lastCheckInDate: '2026-11-02', tonightIntent: null }, 8)
    expect(dismissed).toMatchObject({ checkInAskedNight: '2026-11-02', checkInAnsweredNight: null })
  })

  // ISS-19.3: each field is checked; one that doesn't fit keeps its default.
  it('a damaged field falls back to its default', async () => {
    const st = await hydrate({ onboarded: true, volume: 'loud', playLayout: { night: 'x', order: 7 } }, 10)
    expect(st.onboarded).toBe(true)
    expect(st.volume).toBe(0.85)
    expect(st.playLayout).toBeNull()
  })

  it('drops a saved sound that is damaged but keeps the others', async () => {
    const good = { id: 'mine-1', name: 'Rain', hint: '', icon: 'rain', createdAt: 1, mix: { layers: { rain: 0.5 }, band: null, bandGain: 0.3, carrier: 140 } }
    const st = await hydrate({ customSounds: [good] }, 10)
    expect(st.customSounds).toHaveLength(1)
    const st2 = await hydrate({ customSounds: [good, { ...good, id: 'mine-2', mix: { layers: { lava: 1 } } }] }, 10)
    expect(st2.customSounds.map((c) => c.id)).toEqual(['mine-1'])
  })
})
