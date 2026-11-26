import { nightKey } from './night'

/** Days between offers. */
export const OFFER_EVERY_DAYS = 3
/** "Not now" this many times and it never asks again. */
export const OFFER_MAX_DECLINES = 2

export interface ReminderOfferState {
  /** Reminders already on: nothing to offer. */
  reminders: boolean
  onboarded: boolean
  /** nightKey() of the night onboarding finished. */
  onboardedNight: string | null
  /** When it was last shown (ms), or null. */
  lastOfferAt: number | null
  declines: number
}

/**
 * Whether to offer the bedtime reminder now: never on the first night,
 * never twice in a night, at most every few days, and never again after
 * "Not now" twice.
 */
export function reminderOfferDue(s: ReminderOfferState, now: Date): boolean {
  if (s.reminders || !s.onboarded || s.declines >= OFFER_MAX_DECLINES) return false
  if (s.onboardedNight === null || s.onboardedNight === nightKey(now)) return false
  if (s.lastOfferAt === null) return true
  if (nightKey(new Date(s.lastOfferAt)) === nightKey(now)) return false
  return now.getTime() - s.lastOfferAt >= OFFER_EVERY_DAYS * 86_400_000 - 2 * 3_600_000
}
