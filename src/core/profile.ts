/**
 * What onboarding learns about someone, and the defaults it sets from that.
 *
 * Onboarding is the starting point ("prior"): which kind of games lead, how
 * hard they start, which sounds come first and how loud, how long a wind down
 * lasts. Play then learns from what they actually play (see arrange.ts), and
 * the evening check-in adjusts a single night.
 *
 * Everything stays on the device. Pure: no React, no time, no randomness.
 */
import type { NightIntent } from './games/catalog'
import { PRESETS } from './sound/catalog'

export type Difficulty = 'easy' | 'medium' | 'hard'

/**
 * Things that make it harder to fall asleep, in words people use for them
 * (several are how people with ADHD describe their nights: a mind that won't
 * switch off, tired but wired, losing track of time). Optional, any number.
 */
export type SleepFactor =
  | 'mind_on'
  | 'tired_wired'
  | 'lose_time'
  | 'restless'
  | 'me_time'
  | 'stress'
  | 'noise'
  | 'waking'
export const SLEEP_FACTORS: readonly SleepFactor[] = [
  'mind_on',
  'tired_wired',
  'lose_time',
  'restless',
  'me_time',
  'stress',
  'noise',
  'waking',
]

/** How someone likes to switch off with a game. Any number, first picked counts most. */
export type GameStyle = 'soothing' | 'puzzle' | 'quick'
export const GAME_STYLES: readonly GameStyle[] = ['soothing', 'puzzle', 'quick']
const STYLE_INTENT: Record<GameStyle, NightIntent> = { soothing: 'melt', puzzle: 'focus', quick: 'light' }
/** Mind-holding factors: a puzzle or steady sound gives the mind one quiet thing. */
const BUSY_FACTORS: readonly SleepFactor[] = ['mind_on', 'tired_wired', 'lose_time', 'stress']

/** The three kinds of sound played on the listening page. */
export type SoundFamily = 'steady' | 'music' | 'nature'
export const LISTEN_SAMPLES: Record<SoundFamily, string> = {
  steady: 'theta-rain',
  music: 'nocturne',
  nature: 'low-tide',
}

/** Which family each preset belongs to, for ordering the Sounds list. */
const FAMILY: Record<string, SoundFamily> = {
  'theta-rain': 'steady',
  'deep-drift': 'steady',
  starfield: 'steady',
  nocturne: 'music',
  'ink-reverie': 'music',
  'adagio-dusk': 'music',
  'amber-study': 'music',
  hearth: 'nature',
  'low-tide': 'nature',
  'still-horizon': 'nature',
  'mist-pine': 'nature',
  'midnight-cove': 'nature',
}

export interface SleepProfile {
  factors: SleepFactor[]
  /** 0 = quiet mind at bedtime, 1 = very busy. */
  mind: number
  /** How they like to switch off with a game, in the order they picked. */
  styles: GameStyle[]
  /** Thumbs on the listening page: 1 liked, -1 not for me. */
  liked: Partial<Record<SoundFamily, 1 | -1>>
  /** Volume they left it at while listening, 0..1. */
  volume: number
}

export const EMPTY_PROFILE: SleepProfile = { factors: [], mind: 0.4, styles: [], liked: {}, volume: 0.8 }

const busyMind = (p: SleepProfile) => p.mind >= 0.6 || p.factors.some((f) => BUSY_FACTORS.includes(f))

/** Their first-picked game style leads; without one, a busy mind gets puzzles and a quiet one slow games. */
export function profileIntent(p: SleepProfile): NightIntent {
  const first = p.styles[0]
  if (first) return STYLE_INTENT[first]
  return busyMind(p) ? 'focus' : 'melt'
}

/** Never asked outright (nobody picks "challenging" at night): slow and soothing starts easy. */
export function profileDifficulty(p: SleepProfile): Difficulty {
  return p.styles.length === 1 && p.styles[0] === 'soothing' ? 'easy' : 'medium'
}

/** Busier minds get a longer wind down. */
export function profileWindDownMinutes(p: SleepProfile): number {
  return busyMind(p) ? 45 : 30
}

/** Higher is better: what they liked, plus steady masking sound for noise and busy minds. */
function familyScore(p: SleepProfile, f: SoundFamily): number {
  let score = p.liked[f] ?? 0
  if (f === 'steady' && p.factors.includes('noise')) score += 0.6
  if (f === 'steady' && busyMind(p)) score += 0.3
  if (f === 'nature' && p.factors.includes('restless')) score += 0.2
  return score
}

/** Preset ids in the order the Sounds list should show them (within each page). */
export function soundOrder(p: SleepProfile): string[] {
  const indexed = PRESETS.map((preset, i) => ({ id: preset.id, page: preset.page, i }))
  return indexed
    .sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page
      const fa = FAMILY[a.id]
      const fb = FAMILY[b.id]
      const sa = fa ? familyScore(p, fa) : 0
      const sb = fb ? familyScore(p, fb) : 0
      return sb - sa || a.i - b.i
    })
    .map((x) => x.id)
}

/** The sound Play's sound button starts with. */
export function profileSound(p: SleepProfile): string {
  return soundOrder(p)[0]!
}
