/**
 * Night-aware adaptive pacing & drowsiness sensing for Kumiko.
 *
 * Combines Inverna's existing night signals (bedtime schedule, evening check-in,
 * onboarding sleep profile, active wind-down/sleep timer) with a personalized
 * rolling window of the player's own tap cadence, overshoot rate and inter-knot
 * pauses.
 *
 * Pure TypeScript: no React, no stores, no wall clock.
 */
import type { KumikoNightContext, PacingState, TapSample } from './types'

const MAX_TAP_SAMPLES = 16
const MAX_KNOT_GAPS = 6
/** Minimum taps before trusting the player's personal opening cadence baseline. */
const BASELINE_MIN_TAPS = 6
/** Minimum knots resolved before a sleep handoff may be offered. */
const HANDOFF_MIN_KNOTS = 3
/** Minimum session time (ms) before offering a sleep handoff. */
const HANDOFF_MIN_ELAPSED_MS = 45_000

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const clamp01 = (v: number) => clamp(v, 0, 1)

export const DEFAULT_NIGHT_CONTEXT: KumikoNightContext = {
  calm: 0.25,
  difficulty: 'medium',
  eveningKind: 'none',
  windowProgress: 0,
  minutesToBedtime: null,
  minutesSinceBedtime: null,
  tonightDay: null,
  tonightNow: null,
  tonightIntent: null,
  profileMind: null,
  profileHabits: [],
  profileFactors: [],
  hasActiveTimer: false,
  timerMinutesLeft: null,
  bedtimeNudgeAlreadyShown: false,
}

/**
 * Prior drowsiness bias (0..0.55) from Inverna's night context alone, before
 * any taps have happened. A racing/restless evening starts brisk; a sleepy or
 * past-bedtime evening starts noticeably softer.
 */
export function contextSleepPrior(ctx: KumikoNightContext): number {
  let prior = ctx.calm * 0.34

  // Evening clock relative to bedtime.
  if (ctx.eveningKind === 'past') prior += 0.24
  else if (ctx.eveningKind === 'asleepRange') prior += 0.2
  else if (ctx.eveningKind === 'winding') prior += 0.08 + 0.14 * clamp01(ctx.windowProgress)
  else if (ctx.eveningKind === 'evening') prior += 0.04

  // Tonight's check-in ("How do you feel right now?").
  if (ctx.tonightNow === 'sleepy') prior += 0.2
  else if (ctx.tonightNow === 'worn_out') prior += 0.14
  else if (ctx.tonightNow === 'relaxed') prior += 0.06
  else if (ctx.tonightNow === 'wide_awake') prior -= 0.14
  else if (ctx.tonightNow === 'overthinking') prior -= 0.1
  else if (ctx.tonightNow === 'restless') prior -= 0.08

  // Heavy day softens slightly.
  if (ctx.tonightDay === 'exhausting') prior += 0.06
  else if (ctx.tonightDay === 'stressful' || ctx.tonightDay === 'sad') prior += 0.03

  // Onboarding profile: short-video doomscrollers start a touch brisker to catch momentum.
  if (ctx.profileHabits.includes('short_video')) prior -= 0.05
  if (ctx.profileMind !== null && ctx.profileMind >= 0.7) prior -= 0.05

  return clamp(prior, 0, 0.58)
}

/** Initial challenge level (0..1) matched to how wired or sleepy tonight starts. */
export function initialChallenge(ctx: KumikoNightContext): number {
  const diffBase = ctx.difficulty === 'hard' ? 0.78 : ctx.difficulty === 'easy' ? 0.28 : 0.52
  const prior = contextSleepPrior(ctx)
  let c = diffBase - prior * 0.55
  if (ctx.tonightNow === 'overthinking' || ctx.tonightNow === 'wide_awake') c += 0.14
  if (ctx.tonightIntent === 'focus') c += 0.08
  if (ctx.tonightIntent === 'melt') c -= 0.1
  return clamp01(c)
}

export function createPacing(ctx: KumikoNightContext = DEFAULT_NIGHT_CONTEXT): PacingState {
  const prior = contextSleepPrior(ctx)
  const challenge = initialChallenge(ctx)
  return {
    taps: [],
    knotGapsMs: [],
    baselineTapMs: null,
    lastTapMs: 0,
    lastKnotMs: 0,
    pace: clamp01(1 - prior),
    sleepySignal: clamp01(prior * 0.8),
    sleepyKnots: 0,
    challenge,
    handoffOffered: false,
    manualSlowOffset: 0,
  }
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Recompute `pace`, `sleepySignal`, and `challenge` from the rolling behavioral
 * window + Inverna's live night context.
 */
export function evaluatePacing(
  pacing: PacingState,
  ctx: KumikoNightContext,
  knotsClosed: number,
): PacingState {
  const prior = contextSleepPrior(ctx)

  // Compute inter-tap intervals within the rolling window (ignore long idle gaps > 12s).
  const intervals: number[] = []
  for (let i = 1; i < pacing.taps.length; i++) {
    const dt = pacing.taps[i]!.atMs - pacing.taps[i - 1]!.atMs
    if (dt >= 90 && dt <= 12_000) intervals.push(dt)
  }

  let baselineTapMs = pacing.baselineTapMs
  if (baselineTapMs === null && intervals.length >= BASELINE_MIN_TAPS) {
    baselineTapMs = clamp(median(intervals.slice(0, BASELINE_MIN_TAPS)), 240, 1_400)
  }

  // Recent cadence slowdown ratio vs player's own baseline (or sensible 550ms default).
  const recentIntervals = intervals.slice(-8)
  const refMs = baselineTapMs ?? 550
  const recentMedMs = recentIntervals.length >= 3 ? median(recentIntervals) : refMs
  const slowdownRatio = recentMedMs / Math.max(220, refMs)
  // 1.0x -> 0, 1.5x -> ~0.42, 2.2x+ -> 1.0
  const cadenceScore = clamp01((slowdownRatio - 1.05) / 1.15)

  // Recent overshoot rate (rotating past alignments or cycling a tile repeatedly).
  const recentTaps = pacing.taps.slice(-12)
  const overshoots = recentTaps.reduce((acc, s) => acc + (s.overshoot ? 1 : 0), 0)
  const overshootRate = recentTaps.length >= 4 ? overshoots / recentTaps.length : 0
  const overshootScore = clamp01((overshootRate - 0.14) / 0.36)

  // Growing pause between closed knots.
  const recentGaps = pacing.knotGapsMs.slice(-4)
  const medGapMs = recentGaps.length >= 2 ? median(recentGaps) : 0
  const pauseScore = medGapMs > 0 ? clamp01((medGapMs - 6_500) / 11_000) : 0

  // Blend behavioral drowsiness (0..1) with night-context prior + manual slow offset.
  const behavioral = cadenceScore * 0.48 + overshootScore * 0.32 + pauseScore * 0.2
  const hasBehavior = intervals.length >= 4
  const sleepySignal = clamp01(
    (hasBehavior ? behavioral * 0.68 + prior * 0.52 : prior * 0.85) + pacing.manualSlowOffset * 0.35,
  )

  // Alertness / pace (1 = brisk, 0 = drifting off).
  const pace = clamp01(1 - sleepySignal * 0.85 - (hasBehavior ? cadenceScore * 0.15 : 0))

  // Challenge adapts gently upward when alert & solving cleanly, and softens smoothly as drowsiness rises.
  const baseChallenge = initialChallenge(ctx)
  const warmUp = Math.min(0.24, knotsClosed * 0.028) * (1 - sleepySignal)
  const sleepyEase = sleepySignal * 0.62 + pacing.manualSlowOffset * 0.28
  const challenge = clamp01(baseChallenge + warmUp - sleepyEase)

  return {
    ...pacing,
    baselineTapMs,
    pace,
    sleepySignal,
    challenge,
  }
}

export function recordTap(
  pacing: PacingState,
  atMs: number,
  overshoot: boolean,
  ctx: KumikoNightContext,
  knotsClosed: number,
): PacingState {
  const sample: TapSample = { atMs, overshoot }
  const taps = [...pacing.taps, sample].slice(-MAX_TAP_SAMPLES)
  return evaluatePacing({ ...pacing, taps, lastTapMs: atMs }, ctx, knotsClosed)
}

export function recordKnotClosed(
  pacing: PacingState,
  atMs: number,
  ctx: KumikoNightContext,
  knotsClosed: number,
): { pacing: PacingState; shouldOfferHandoff: boolean } {
  const gap = pacing.lastKnotMs > 0 ? Math.max(0, atMs - pacing.lastKnotMs) : 0
  const knotGapsMs = gap > 0 ? [...pacing.knotGapsMs, gap].slice(-MAX_KNOT_GAPS) : pacing.knotGapsMs
  const evaluated = evaluatePacing({ ...pacing, knotGapsMs, lastKnotMs: atMs }, ctx, knotsClosed)

  const isDrowsyNow = evaluated.sleepySignal >= 0.66
  const sleepyKnots = isDrowsyNow ? evaluated.sleepyKnots + 1 : Math.max(0, evaluated.sleepyKnots - 1)
  const next: PacingState = { ...evaluated, sleepyKnots }

  const canOffer =
    !next.handoffOffered &&
    !ctx.bedtimeNudgeAlreadyShown &&
    knotsClosed >= HANDOFF_MIN_KNOTS &&
    atMs >= HANDOFF_MIN_ELAPSED_MS &&
    next.sleepySignal >= 0.68 &&
    next.sleepyKnots >= 2

  return {
    pacing: canOffer ? { ...next, handoffOffered: true } : next,
    shouldOfferHandoff: canOffer,
  }
}

/**
 * Effective animation & gameplay kinetics derived from live `pace`, `sleepySignal`
 * and `ctx.calm`. Higher drowsiness physically lengthens rotation & scroll glides.
 */
export function kumikoKinetics(pacing: PacingState, calm: number) {
  const softness = clamp01(Math.max(calm, pacing.sleepySignal))
  return {
    /** Tile 90° rotation duration (ms). */
    rotateMs: Math.round(170 + softness * 250),
    /** Scroll glide rate (exponential ease factor per second). */
    scrollRate: 4.4 - softness * 2.5,
    /** Effective calm fed into haptic gating (suppresses `tick` above 0.7). */
    effectiveCalm: softness,
    /** Whether hidden curated Japanese crests should be woven in right now. */
    allowCrests: pacing.sleepySignal < 0.52 && calm < 0.78,
    /** Idle milliseconds before the loom softly finishes the nearest open knot on its own. */
    idleHandoffMs: Math.round(48_000 - softness * 16_000),
  }
}
