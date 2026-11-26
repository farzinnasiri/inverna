import { bedtimeAround, type Schedule } from '../night'
import { sessionProgress, type Session } from '../session'
import type { Preset } from './catalog'

/**
 * The 60-minute Neuroacoustic Iso-Descent model.
 *
 * Grounded in the music-therapy Iso principle, amplitude-modulated (AM)
 * cortical phase-locking (Woods et al., Communications Biology 2024), and
 * 0.1 Hz (~6 breaths/min) cardiorespiratory resonance pacing.
 *
 * Pure zero-DOM math so both UI telemetry and the real-time audio engine share
 * identical deterministic state.
 */
export type DescentPhaseId = 'unwind' | 'drift' | 'still'
export type ModulationDepth = 'off' | 'subtle' | 'deep'

/** Window before bedtime across which Inverna performs its full acoustic descent. */
export const DESCENT_WINDOW_MINUTES = 60

export interface DescentSnapshot {
  /** 0 (T-60m / awake) -> 1 (bedtime / deep sleep). */
  progress: number
  phase: DescentPhaseId
  phaseLabel: string
  /** Plain-English brainwave band description for telemetry. */
  bandLabel: string
  /** Live phase-locked AM & binaural modulation rate in Hz (smoothly descends). */
  modHz: number
  /** Amplitude modulation depth (0..0.32), works on both speakers and headphones. */
  amDepth: number
  /** Subtle stereo binaural gain multiplier (0..1) scaled by modulationDepth. */
  binauralScale: number
  /** Cardiorespiratory resonance breath swell rate in Hz (~0.10 Hz = 10s cycle). */
  breathHz: number
  /** Breath swell modulation depth (0..0.35). */
  breathDepth: number
  /** Master warm low-pass filter cutoff in Hz (progressively melts highs). */
  masterCutoffHz: number
  /** Harmonic pad low-pass warmth cutoff in Hz. */
  padCutoffHz: number
  /** Shared game-cue stereo bloom filter cutoff in Hz (warms down with bedtime). */
  cueBloomCutoffHz: number
  /** Slow stereo rocking LFO frequency in Hz. */
  spatialHz: number
  /** 0..1 darkening applied to interactive game cues. */
  cueDarkness: number
  /** Minutes remaining until bedtime, if bedtime schedule is active. */
  minutesToBed: number | null
  /** User-selected modulation intensity. */
  depth: ModulationDepth
  /** Whether descent is actively tracking bedtime or a Wind Down session. */
  autoActive: boolean
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))
const smooth = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Piecewise smooth interpolation through [unwindHz, driftHz, stillHz]. */
function interpolateTriplet(range: readonly [number, number, number], p: number): number {
  const t = clamp01(p)
  if (t <= 0.5) {
    return lerp(range[0], range[1], smooth(t * 2))
  }
  return lerp(range[1], range[2], smooth((t - 0.5) * 2))
}

function depthMultiplier(depth: ModulationDepth): number {
  if (depth === 'off') return 0
  if (depth === 'subtle') return 0.6
  return 1
}

function phaseForProgress(p: number): { phase: DescentPhaseId; phaseLabel: string } {
  if (p < 0.42) return { phase: 'unwind', phaseLabel: 'Unwind' }
  if (p < 0.76) return { phase: 'drift', phaseLabel: 'Drift' }
  return { phase: 'still', phaseLabel: 'Still' }
}

function bandLabelForHz(hz: number): string {
  if (hz >= 7.2) return 'Alpha-Theta'
  if (hz >= 3.6) return 'Theta'
  return 'Delta'
}

/**
 * Compute bedtime-based descent progress (0..1 across the final 60m before bed,
 * holding at 1.0 during the overnight bedtime window until 06:00).
 */
export function bedtimeDescentProgress(
  schedule: Schedule,
  now: Date,
): { progress: number; minutesToBed: number | null; inWindow: boolean } {
  if (!schedule.enabled || schedule.days.length === 0) {
    return { progress: 0.35, minutesToBed: null, inWindow: false }
  }

  const { previous, next } = bedtimeAround(schedule, now)
  const morning = new Date(now)
  morning.setHours(6, 0, 0, 0)

  if (previous && now.getTime() - previous.getTime() < 8 * 3600_000 && now < morning) {
    return { progress: 1, minutesToBed: 0, inWindow: true }
  }
  if (previous && now.getTime() - previous.getTime() < 3 * 3600_000 && now.getHours() >= 12) {
    return { progress: 1, minutesToBed: 0, inWindow: true }
  }

  if (next) {
    const mins = Math.round((next.getTime() - now.getTime()) / 60_000)
    if (mins <= DESCENT_WINDOW_MINUTES) {
      const p = clamp01(1 - mins / DESCENT_WINDOW_MINUTES)
      return { progress: p, minutesToBed: Math.max(0, mins), inWindow: true }
    }
    return { progress: 0.28, minutesToBed: mins, inWindow: false }
  }

  return { progress: 0.35, minutesToBed: null, inWindow: false }
}

export interface ComputeDescentOptions {
  schedule: Schedule
  now: Date
  session?: Session | null
  preset?: Preset | null
  depth: ModulationDepth
  followBedtime: boolean
  /** Optional explicit override 0..1 (useful for testing or previewing). */
  overrideProgress?: number
}

const DEFAULT_DESCENT_RANGE: readonly [number, number, number] = [7.8, 5.0, 2.4]

/**
 * Computes the complete live psychoacoustic parameter state for the current instant.
 */
export function computeDescent(opts: ComputeDescentOptions): DescentSnapshot {
  const { schedule, now, session, preset, depth, followBedtime, overrideProgress } = opts
  const range = preset?.descentRange ?? DEFAULT_DESCENT_RANGE

  const bed = bedtimeDescentProgress(schedule, now)
  const sessP = session ? sessionProgress(session, now.getTime()) : null

  let progress: number
  let autoActive = false

  if (typeof overrideProgress === 'number') {
    progress = clamp01(overrideProgress)
    autoActive = true
  } else if (sessP !== null) {
    // Active wind-down session always progresses smoothly from mild unwind to deep still.
    const bedP = followBedtime && bed.inWindow ? bed.progress : 0
    progress = clamp01(Math.max(0.2 + sessP * 0.8, bedP))
    autoActive = true
  } else if (followBedtime && bed.inWindow) {
    progress = bed.progress
    autoActive = true
  } else {
    // Outside the 60m window (daytime preview or bedtime tracking off): sit comfortably in warm Theta midpoint.
    progress = 0.5
    autoActive = false
  }

  const t = smooth(progress)
  const modHz = Math.round(interpolateTriplet(range, progress) * 10) / 10
  const mult = depthMultiplier(depth)
  const { phase, phaseLabel } = phaseForProgress(progress)

  return {
    progress,
    phase,
    phaseLabel,
    bandLabel: bandLabelForHz(modHz),
    modHz,
    amDepth: Number((lerp(0.20, 0.34, t) * mult).toFixed(3)),
    binauralScale: mult,
    breathHz: Number(lerp(0.105, 0.088, t).toFixed(3)), // ~9.5s -> ~11.4s asymmetric 4s/6s resonance cycle
    breathDepth: Number(lerp(0.16, 0.32, t).toFixed(3)),
    masterCutoffHz: Math.round(lerp(3200, 680, t)),
    padCutoffHz: Math.round(lerp(1220, 390, t)),
    cueBloomCutoffHz: Math.round(lerp(1580, 620, t)),
    spatialHz: Number(lerp(0.085, 0.052, t).toFixed(3)),
    cueDarkness: Number(t.toFixed(3)),
    minutesToBed: bed.minutesToBed,
    depth,
    autoActive,
  }
}

export interface DescentCurvePoint {
  /** Normalized x 0..1 across the 60-minute arc. */
  t: number
  /** Modulation rate in Hz at this point. */
  hz: number
  /** Warmth cutoff normalized 0..1 (1 = bright, 0 = darkest). */
  brightness: number
}

/** Samples N points along the 60-minute descent curve for the Acoustic Engine chart. */
export function sampleDescentCurve(preset: Preset | null | undefined, points = 25): DescentCurvePoint[] {
  const range = preset?.descentRange ?? DEFAULT_DESCENT_RANGE
  const count = Math.max(2, points)
  const out: DescentCurvePoint[] = []
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    out.push({
      t,
      hz: interpolateTriplet(range, t),
      brightness: 1 - smooth(t),
    })
  }
  return out
}
