/**
 * Tonight's plan from the evening check-in.
 *
 * The user answers two plain questions (how the day went, how they feel right
 * now) and Lull decides the rest: which kind of games go first and which two
 * sounds to suggest. The user never picks "how the night should end"; that's
 * the app's job. Mapping from design/copy/copy.json (checkIn.mapping).
 *
 * Pure: no React, no time, no randomness.
 */
import type { NightIntent } from './games/catalog'

/** How the day went. */
export type DayAnswer = 'good' | 'calm' | 'busy' | 'stressful' | 'exhausting'
/** How they feel right now. */
export type NowAnswer = 'sleepy' | 'relaxed' | 'worn_out' | 'overthinking' | 'wide_awake'

export const DAY_ANSWERS: readonly DayAnswer[] = ['good', 'calm', 'busy', 'stressful', 'exhausting']
export const NOW_ANSWERS: readonly NowAnswer[] = ['sleepy', 'relaxed', 'worn_out', 'overthinking', 'wide_awake']

export interface TonightPlan {
  /** Which games lead on Play: melt (unwind: slow, wordless), focus (absorbing), light (playful). */
  intent: NightIntent
  /** Two sound presets to suggest, best first. */
  sounds: readonly [string, string]
}

const RULES: readonly { now: NowAnswer; days: readonly DayAnswer[]; intent: NightIntent; sounds: readonly [string, string] }[] = [
  { now: 'sleepy', days: ['stressful', 'exhausting'], intent: 'melt', sounds: ['deep-drift', 'theta-rain'] },
  { now: 'sleepy', days: ['good', 'calm', 'busy'], intent: 'melt', sounds: ['theta-rain', 'midnight-cove'] },
  { now: 'worn_out', days: ['stressful', 'exhausting'], intent: 'melt', sounds: ['deep-drift', 'hearth'] },
  { now: 'worn_out', days: ['good', 'calm', 'busy'], intent: 'melt', sounds: ['hearth', 'low-tide'] },
  // A racing mind gets one absorbing thing to hold.
  { now: 'overthinking', days: ['busy', 'stressful'], intent: 'focus', sounds: ['still-horizon', 'theta-rain'] },
  { now: 'overthinking', days: ['exhausting'], intent: 'focus', sounds: ['theta-rain', 'starfield'] },
  { now: 'overthinking', days: ['good', 'calm'], intent: 'focus', sounds: ['amber-study', 'still-horizon'] },
  { now: 'wide_awake', days: ['busy', 'stressful'], intent: 'focus', sounds: ['mist-pine', 'ink-reverie'] },
  { now: 'wide_awake', days: ['exhausting'], intent: 'melt', sounds: ['theta-rain', 'adagio-dusk'] },
  { now: 'wide_awake', days: ['good', 'calm'], intent: 'light', sounds: ['nocturne', 'low-tide'] },
  { now: 'relaxed', days: ['good', 'calm'], intent: 'light', sounds: ['nocturne', 'hearth'] },
  { now: 'relaxed', days: ['busy', 'stressful', 'exhausting'], intent: 'melt', sounds: ['low-tide', 'adagio-dusk'] },
]

export function planTonight(day: DayAnswer, now: NowAnswer): TonightPlan {
  const rule = RULES.find((r) => r.now === now && r.days.includes(day))
  return rule ? { intent: rule.intent, sounds: rule.sounds } : { intent: 'melt', sounds: ['theta-rain', 'low-tide'] }
}
