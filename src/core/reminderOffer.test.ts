import { describe, expect, it } from 'vitest'
import { reminderOfferDue, type ReminderOfferState } from './reminderOffer'

const base: ReminderOfferState = { reminders: false, onboarded: true, onboardedNight: '2026-11-01', lastOfferAt: null, declines: 0 }
const at = (d: number, h = 21) => new Date(2026, 10, d, h, 0)

describe('offering the bedtime reminder', () => {
  it('waits until after the first night', () => {
    expect(reminderOfferDue(base, at(1, 22))).toBe(false)
    expect(reminderOfferDue(base, at(2))).toBe(true)
  })

  it('never when reminders are on', () => {
    expect(reminderOfferDue({ ...base, reminders: true }, at(5))).toBe(false)
  })

  it('at most every three days, and never twice in a night', () => {
    const shown = { ...base, lastOfferAt: at(2).getTime() }
    expect(reminderOfferDue(shown, at(2, 23))).toBe(false)
    expect(reminderOfferDue(shown, at(4))).toBe(false)
    expect(reminderOfferDue(shown, at(5))).toBe(true)
  })

  it('stops after "Not now" twice', () => {
    expect(reminderOfferDue({ ...base, declines: 2 }, at(20))).toBe(false)
  })
})
