/** Nights of use before Inverna ever asks for a rating. */
export const REVIEW_AFTER_NIGHTS = 5
/** At least this long between asks (Apple also caps it at three a year). */
export const REVIEW_GAP_DAYS = 120
const DAY_MS = 86_400_000

export interface ReviewState {
  /** nightKey()s of nights the app was opened (the last 30). */
  nightsUsed: readonly string[]
  /** When it last asked (ms), or null. */
  lastAskAt: number | null
}

/**
 * Whether to ask for a rating right after something good: only someone who
 * keeps coming back (five different nights), never on their first nights,
 * and months apart.
 */
export function reviewDue(s: ReviewState, now: Date): boolean {
  if (new Set(s.nightsUsed).size < REVIEW_AFTER_NIGHTS) return false
  if (s.lastAskAt !== null && now.getTime() - s.lastAskAt < REVIEW_GAP_DAYS * DAY_MS) return false
  return true
}

/** Add tonight to the nights used, keeping the last 30. */
export function noteNightUsed(nights: readonly string[], night: string): string[] {
  if (nights.includes(night)) return [...nights]
  return [...nights, night].slice(-30)
}
