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
export type DayAnswer = 'good' | 'calm' | 'busy' | 'stressful' | 'exhausting' | 'sad'
/** How they feel right now. */
export type NowAnswer = 'sleepy' | 'relaxed' | 'worn_out' | 'overthinking' | 'wide_awake' | 'restless'

/** Six each, so they sit in an even grid and none looks more important. */
export const DAY_ANSWERS: readonly DayAnswer[] = ['good', 'calm', 'busy', 'stressful', 'exhausting', 'sad']
export const NOW_ANSWERS: readonly NowAnswer[] = ['sleepy', 'relaxed', 'worn_out', 'overthinking', 'wide_awake', 'restless']

export interface TonightPlan {
  /** Which games lead on Play: melt (unwind: slow, wordless), focus (absorbing), light (playful). */
  intent: NightIntent
  /** Two sound presets to suggest, best first. */
  sounds: readonly [string, string]
}

const RULES: readonly { now: NowAnswer; days: readonly DayAnswer[]; intent: NightIntent; sounds: readonly [string, string] }[] = [
  { now: 'sleepy', days: ['stressful', 'exhausting', 'sad'], intent: 'melt', sounds: ['deep-drift', 'theta-rain'] },
  { now: 'sleepy', days: ['good', 'calm', 'busy'], intent: 'melt', sounds: ['theta-rain', 'midnight-cove'] },
  { now: 'worn_out', days: ['stressful', 'exhausting', 'sad'], intent: 'melt', sounds: ['deep-drift', 'hearth'] },
  { now: 'worn_out', days: ['good', 'calm', 'busy'], intent: 'melt', sounds: ['hearth', 'low-tide'] },
  // A racing mind gets one absorbing thing to hold.
  { now: 'overthinking', days: ['busy', 'stressful', 'sad'], intent: 'focus', sounds: ['still-horizon', 'theta-rain'] },
  { now: 'overthinking', days: ['exhausting'], intent: 'focus', sounds: ['theta-rain', 'starfield'] },
  { now: 'overthinking', days: ['good', 'calm'], intent: 'focus', sounds: ['amber-study', 'still-horizon'] },
  { now: 'wide_awake', days: ['busy', 'stressful'], intent: 'focus', sounds: ['mist-pine', 'ink-reverie'] },
  { now: 'wide_awake', days: ['exhausting', 'sad'], intent: 'melt', sounds: ['theta-rain', 'adagio-dusk'] },
  { now: 'wide_awake', days: ['good', 'calm'], intent: 'light', sounds: ['nocturne', 'low-tide'] },
  // A restless body gets something for the hands and slow nature sound.
  { now: 'restless', days: ['good', 'calm'], intent: 'light', sounds: ['low-tide', 'mist-pine'] },
  { now: 'restless', days: ['busy', 'stressful', 'sad'], intent: 'light', sounds: ['mist-pine', 'deep-drift'] },
  { now: 'restless', days: ['exhausting'], intent: 'melt', sounds: ['low-tide', 'theta-rain'] },
  { now: 'relaxed', days: ['good', 'calm'], intent: 'light', sounds: ['nocturne', 'hearth'] },
  { now: 'relaxed', days: ['busy', 'stressful', 'exhausting', 'sad'], intent: 'melt', sounds: ['low-tide', 'adagio-dusk'] },
]

/** True when a rule covers this pair (the fallback below is only a safety net). */
export function hasRule(day: DayAnswer, now: NowAnswer): boolean {
  return RULES.some((r) => r.now === now && r.days.includes(day))
}

export function planTonight(day: DayAnswer, now: NowAnswer): TonightPlan {
  const rule = RULES.find((r) => r.now === now && r.days.includes(day))
  return rule ? { intent: rule.intent, sounds: rule.sounds } : { intent: 'melt', sounds: ['theta-rain', 'low-tide'] }
}
